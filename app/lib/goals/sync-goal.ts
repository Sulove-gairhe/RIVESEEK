import { address, type Address } from "@solana/kit";
import { eq, and, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { goalMirrors, wallets } from "@/db/schema";
import { createSolanaClient, type ClusterMoniker } from "@/app/lib/solana-client";
import {
  fetchMaybeGoalAccount,
  findGoalAccountPda,
  type GoalAccount,
} from "@/app/generated/riveseek_goal_vault";
import { GoalStatus } from "@/app/generated/riveseek_goal_vault/types";

export type SyncGoalParams = {
  goalPda: string;
  cluster: string;
};

export type SyncGoalResult =
  | { status: "SUCCESS"; record: typeof goalMirrors.$inferSelect }
  | { status: "CLOSED"; record?: typeof goalMirrors.$inferSelect }
  | { status: "NOT_FOUND" }
  | { status: "UNLINKED_WALLET"; ownerAddress: string };

export function mapAnchorStatus(status: GoalStatus): string {
  switch (status) {
    case GoalStatus.Active:
      return "ACTIVE";
    case GoalStatus.Paused:
      return "PAUSED";
    case GoalStatus.Cancelled:
      return "CANCELLED";
    default:
      return "ACTIVE";
  }
}

export async function syncGoalFromChain({
  goalPda,
  cluster,
}: SyncGoalParams): Promise<SyncGoalResult> {
  const solanaAddress = address(goalPda);
  const client = createSolanaClient(cluster as ClusterMoniker);

  // 1. Fetch MaybeGoalAccount from Solana RPC.
  // Codama's decodeGoalAccount throws if the on-chain account exists but its data
  // doesn't match the GoalAccount discriminator (e.g. System Program, Token Program).
  // We catch that and treat it the same as "account not found" so the CLOSED / NOT_FOUND
  // path runs correctly.
  let accountExists = false;
  let accountData: GoalAccount | undefined;
  try {
    const maybeAccount = await fetchMaybeGoalAccount(client.rpc, solanaAddress);
    if (maybeAccount.exists) {
      accountExists = true;
      accountData = maybeAccount.data;
    }
  } catch {
    // Account found on-chain but is not a GoalAccount — treat as non-existent
    accountExists = false;
  }

  // 2. Handle closed/non-existent account
  if (!accountExists) {
    const existing = await db
      .select()
      .from(goalMirrors)
      .where(
        and(
          eq(goalMirrors.cluster, cluster),
          eq(goalMirrors.accountAddress, goalPda)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      const now = new Date();
      const [updated] = await db
        .update(goalMirrors)
        .set({
          status: "CLOSED",
          lastSyncedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(goalMirrors.cluster, cluster),
            eq(goalMirrors.accountAddress, goalPda)
          )
        )
        .returning();
      return { status: "CLOSED", record: updated };
    }

    return { status: "NOT_FOUND" };
  }

  // 3. Extract GoalAccount data
  const account = accountData!;
  const ownerAddress = account.owner.toString();
  const goalIdStr = account.goalId.toString();
  const maximumBudgetStr = account.maximumBudget.toString();
  const fundingMintStr = account.fundingMint.toString();
  const vaultTokenStr = account.vaultToken.toString();
  const mappedStatus = mapAnchorStatus(account.status);

  // 4. Derive canonical GoalAccount PDA to verify matching address
  const [canonicalPda] = await findGoalAccountPda({
    owner: account.owner,
    goalId: account.goalId,
  });
  if (canonicalPda.toString() !== goalPda) {
    throw new Error("CANONICAL_PDA_MISMATCH");
  }

  // 5. Read canonical vault token balance & observation slot from RPC
  let vaultBalance = "0";
  let lastObservedSlot: string | null = null;
  try {
    const tokenBalRes = await client.rpc
      .getTokenAccountBalance(address(vaultTokenStr))
      .send();
    vaultBalance = tokenBalRes.value.amount;
    if (tokenBalRes.context?.slot != null) {
      lastObservedSlot = tokenBalRes.context.slot.toString();
    }
  } catch {
    // Default to "0" if token account is empty or uninitialized
    vaultBalance = "0";
  }

  // 6. Resolve owner wallet from Neon
  const [wallet] = await db
    .select()
    .from(wallets)
    .where(
      and(
        eq(wallets.chain, "solana"),
        eq(wallets.address, ownerAddress),
        isNotNull(wallets.verifiedAt)
      )
    )
    .limit(1);

  if (!wallet) {
    return { status: "UNLINKED_WALLET", ownerAddress };
  }

  // 7. Check lastObservedSlot to prevent older observation overwriting newer state
  const [existingRecord] = await db
    .select()
    .from(goalMirrors)
    .where(
      and(
        eq(goalMirrors.cluster, cluster),
        eq(goalMirrors.accountAddress, goalPda)
      )
    )
    .limit(1);

  if (
    existingRecord &&
    existingRecord.lastObservedSlot != null &&
    lastObservedSlot != null
  ) {
    const existingSlot = BigInt(existingRecord.lastObservedSlot);
    const newSlot = BigInt(lastObservedSlot);
    if (newSlot < existingSlot) {
      // Return existing record if new observation is stale
      return { status: "SUCCESS", record: existingRecord };
    }
  }

  const now = new Date();

  // 8. Upsert goal_mirrors
  const [record] = await db
    .insert(goalMirrors)
    .values({
      walletId: wallet.id,
      cluster,
      accountAddress: goalPda,
      ownerAddress,
      goalId: goalIdStr,
      fundingMint: fundingMintStr,
      vaultToken: vaultTokenStr,
      maximumBudget: maximumBudgetStr,
      vaultBalance,
      status: mappedStatus,
      lastObservedSlot,
      onChainCreatedAt: new Date(Number(account.createdAt) * 1000),
      lastSyncedAt: now,
    })
    .onConflictDoUpdate({
      target: [goalMirrors.cluster, goalMirrors.accountAddress],
      set: {
        walletId: wallet.id,
        ownerAddress,
        goalId: goalIdStr,
        fundingMint: fundingMintStr,
        vaultToken: vaultTokenStr,
        maximumBudget: maximumBudgetStr,
        vaultBalance,
        status: mappedStatus,
        lastObservedSlot: lastObservedSlot ?? existingRecord?.lastObservedSlot,
        lastSyncedAt: now,
        updatedAt: now,
      },
    })
    .returning();

  return { status: "SUCCESS", record };
}
