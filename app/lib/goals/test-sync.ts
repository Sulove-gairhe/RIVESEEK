import { db } from "@/db";
import { users, wallets, goalMirrors } from "@/db/schema";
import { syncGoalFromChain } from "./sync-goal";
import { eq, and } from "drizzle-orm";

async function runTests() {
  console.log("Running Goal Mirror Sync Tests (Milestone 2C.3)...");

  // Known valid 32-byte Solana program addresses used as wallet address strings in Neon
  const testAddress1 = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"; // SPL Token Program
  const testAddress2 = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"; // Memo Program
  // System Program: valid 32-byte pubkey, exists on-chain but NOT a GoalAccount
  const dummyPda    = "11111111111111111111111111111111";
  const CLUSTER = "devnet";

  // Pre-cleanup goal_mirrors for our test PDA on devnet (FK child first)
  await db.delete(goalMirrors).where(
    and(eq(goalMirrors.cluster, CLUSTER), eq(goalMirrors.accountAddress, dummyPda))
  );

  // Clean prior wallets for these test addresses (if they exist from a prior test run)
  const priorW1 = await db.select({ id: wallets.id, userId: wallets.userId })
    .from(wallets).where(and(eq(wallets.chain, "solana"), eq(wallets.address, testAddress1)));
  for (const w of priorW1) {
    await db.delete(goalMirrors).where(eq(goalMirrors.walletId, w.id));
    await db.delete(wallets).where(eq(wallets.id, w.id));
    await db.delete(users).where(eq(users.id, w.userId));
  }
  const priorW2 = await db.select({ id: wallets.id, userId: wallets.userId })
    .from(wallets).where(and(eq(wallets.chain, "solana"), eq(wallets.address, testAddress2)));
  for (const w of priorW2) {
    await db.delete(goalMirrors).where(eq(goalMirrors.walletId, w.id));
    await db.delete(wallets).where(eq(wallets.id, w.id));
    await db.delete(users).where(eq(users.id, w.userId));
  }

  // Create User 1 + Verified Wallet 1
  const [user1] = await db.insert(users).values({}).returning();
  const [wallet1] = await db.insert(wallets).values({
    userId: user1.id, chain: "solana", address: testAddress1, isPrimary: true, verifiedAt: new Date(),
  }).returning();

  // Create User 2 + Verified Wallet 2
  const [user2] = await db.insert(users).values({}).returning();
  const [wallet2] = await db.insert(wallets).values({
    userId: user2.id, chain: "solana", address: testAddress2, isPrimary: true, verifiedAt: new Date(),
  }).returning();

  // Test 1: dummyPda is System Program (not a GoalAccount) with no prior mirror => NOT_FOUND
  const res1 = await syncGoalFromChain({ goalPda: dummyPda, cluster: CLUSTER });
  if (res1.status !== "NOT_FOUND") throw new Error("Test 1 FAIL: Expected NOT_FOUND, got " + res1.status);
  console.log("  1. Non-GoalAccount PDA with no prior mirror => NOT_FOUND  [PASS]");

  // Test 2: Insert active mirror directly (simulates post-deposit state in Neon)
  const [initialMirror] = await db.insert(goalMirrors).values({
    walletId: wallet1.id, cluster: CLUSTER, accountAddress: dummyPda, ownerAddress: testAddress1,
    goalId: "101", fundingMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    vaultToken: "So11111111111111111111111111111111111111112",
    maximumBudget: "50000000", vaultBalance: "10000000", status: "ACTIVE",
    lastObservedSlot: "100", lastSyncedAt: new Date(),
  }).returning();
  if (initialMirror.status !== "ACTIVE") throw new Error("Test 2 FAIL: insert failed");
  console.log("  2. Active goal mirror inserted (vaultBalance=10000000)  [PASS]");

  // Test 3: Idempotent upsert — vault balance update
  const [updatedMirror] = await db.insert(goalMirrors).values({
    walletId: wallet1.id, cluster: CLUSTER, accountAddress: dummyPda, ownerAddress: testAddress1,
    goalId: "101", fundingMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    vaultToken: "So11111111111111111111111111111111111111112",
    maximumBudget: "50000000", vaultBalance: "25000000", status: "ACTIVE",
    lastObservedSlot: "105", lastSyncedAt: new Date(),
  }).onConflictDoUpdate({
    target: [goalMirrors.cluster, goalMirrors.accountAddress],
    set: { vaultBalance: "25000000", lastObservedSlot: "105", updatedAt: new Date() },
  }).returning();
  if (updatedMirror.vaultBalance !== "25000000") throw new Error("Test 3 FAIL: vaultBalance=" + updatedMirror.vaultBalance);
  console.log("  3. Idempotent upsert updated mirror (10000000 -> 25000000)  [PASS]");

  // Test 4: Prior mirror exists + dummyPda is NOT a GoalAccount on devnet => CLOSED
  const resClosed = await syncGoalFromChain({ goalPda: dummyPda, cluster: CLUSTER });
  if (resClosed.status !== "CLOSED") throw new Error("Test 4 FAIL: Expected CLOSED got " + resClosed.status);
  if (!resClosed.record || resClosed.record.status !== "CLOSED") throw new Error("Test 4 FAIL: record.status not CLOSED");
  console.log("  4. GoalAccount missing on-chain with prior mirror => CLOSED  [PASS]");

  // Test 5: Wallet ownership strictly tied to user1, not user2
  const [mirrorRow] = await db.select().from(goalMirrors)
    .where(and(eq(goalMirrors.cluster, CLUSTER), eq(goalMirrors.accountAddress, dummyPda))).limit(1);
  if (!mirrorRow) throw new Error("Test 5 FAIL: no mirror row found");
  if (mirrorRow.walletId !== wallet1.id) throw new Error("Test 5 FAIL: walletId mismatch");
  if (mirrorRow.walletId === wallet2.id) throw new Error("Test 5 FAIL: wrongly attributed to user2");
  console.log("  5. Mirror ownership tied to user1 verified wallet (user2 excluded)  [PASS]");

  // Cleanup test data
  await db.delete(goalMirrors).where(
    and(eq(goalMirrors.cluster, CLUSTER), eq(goalMirrors.accountAddress, dummyPda))
  );
  await db.delete(wallets).where(eq(wallets.id, wallet1.id));
  await db.delete(wallets).where(eq(wallets.id, wallet2.id));
  await db.delete(users).where(eq(users.id, user1.id));
  await db.delete(users).where(eq(users.id, user2.id));

  console.log("All 5 Milestone 2C.3 tests passed.");
  process.exit(0);
}

runTests().catch((err) => {
  console.error("Test execution failed:", err.message ?? err);
  process.exit(1);
});
