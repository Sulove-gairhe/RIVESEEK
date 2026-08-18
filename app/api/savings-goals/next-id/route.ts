import { NextResponse, type NextRequest } from "next/server";
import {
    verifySession,
    SESSION_COOKIE_OPTIONS,
} from "@/app/lib/auth/session";
import { db } from "@/db";
import { savingsGoals, goalMirrors, wallets } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import {
    CLUSTERS,
    createSolanaClient,
    type ClusterMoniker,
} from "@/app/lib/solana-client";
import { findGoalAccountPda } from "@/app/generated/riveseek_goal_vault";
import { fetchMaybeGoalAccount } from "@/app/generated/riveseek_goal_vault";
import { address } from "@solana/kit";

export async function GET(request: NextRequest) {
    try {
        // 1. Verify authentication
        const sessionToken = request.cookies.get(SESSION_COOKIE_OPTIONS.name)?.value;
        if (!sessionToken) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const session = verifySession(sessionToken);
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // 2. Parse and validate query parameters
        const { searchParams } = new URL(request.url);
        const walletAddress = searchParams.get("walletAddress");
        const clusterParam = searchParams.get("cluster");

        if (!walletAddress || !clusterParam) {
            return NextResponse.json(
                { error: "walletAddress and cluster required" },
                { status: 400 }
            );
        }

        // 3. Validate cluster using the existing RiveSeek ClusterMoniker
        if (!CLUSTERS.includes(clusterParam as ClusterMoniker)) {
            return NextResponse.json({ error: "Invalid cluster" }, { status: 400 });
        }
        const cluster = clusterParam as ClusterMoniker;

        // 4. Verify wallet exists and belongs to session user
        const [wallet] = await db
            .select()
            .from(wallets)
            .where(
                and(
                    eq(wallets.address, walletAddress),
                    eq(wallets.chain, "solana")
                )
            )
            .limit(1);

        if (!wallet) {
            return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
        }

        if (!wallet.verifiedAt) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        if (wallet.userId !== session.userId) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // 5. Query MAX(goal_id) from savings_goals for wallet+cluster
        const maxFromSavingsGoals = await db
            .select({ maxGoalId: sql<string>`MAX(${savingsGoals.goalId})` })
            .from(savingsGoals)
            .where(
                and(
                    eq(savingsGoals.walletId, wallet.id),
                    eq(savingsGoals.cluster, cluster)
                )
            );

        // 6. Query MAX(goal_id) from goal_mirrors for wallet+cluster
        const maxFromGoalMirrors = await db
            .select({ maxGoalId: sql<string>`MAX(${goalMirrors.goalId})` })
            .from(goalMirrors)
            .where(
                and(
                    eq(goalMirrors.walletId, wallet.id),
                    eq(goalMirrors.cluster, cluster)
                )
            );

        // 7. Calculate candidate next_goal_id as max(both queries) + 1, default to "1"
        const maxGoalId1 = maxFromSavingsGoals[0]?.maxGoalId
            ? BigInt(maxFromSavingsGoals[0].maxGoalId)
            : 0n;
        const maxGoalId2 = maxFromGoalMirrors[0]?.maxGoalId
            ? BigInt(maxFromGoalMirrors[0].maxGoalId)
            : 0n;
        const maxGoalId = maxGoalId1 > maxGoalId2 ? maxGoalId1 : maxGoalId2;
        let candidateGoalId = maxGoalId + 1n;

        // 8. Derive canonical PDA and check if it exists on-chain
        const client = createSolanaClient(cluster);
        let foundAvailable = false;

        // Try up to 10 candidates to find an available goal_id
        for (let attempt = 0; attempt < 10; attempt++) {
            const [candidatePda] = await findGoalAccountPda({
                owner: address(walletAddress),
                goalId: candidateGoalId,
            });

            try {
                const maybeAccount = await fetchMaybeGoalAccount(
                    client.rpc,
                    candidatePda
                );

                if (!maybeAccount.exists) {
                    // PDA does not exist on-chain, this is available
                    foundAvailable = true;
                    break;
                }

                // PDA exists on-chain, increment and try next
                candidateGoalId++;
            } catch {
                // Error fetching account (likely doesn't exist), treat as available
                foundAvailable = true;
                break;
            }
        }

        if (!foundAvailable) {
            return NextResponse.json(
                { error: "Unable to find available goal ID" },
                { status: 500 }
            );
        }

        const nextGoalId = candidateGoalId.toString();

        // 9. Return nextGoalId as STRING to avoid JavaScript number precision issues
        return NextResponse.json({
            nextGoalId,
            walletAddress,
            cluster,
        });
    } catch (err: unknown) {
        const message =
            err instanceof Error ? err.message : "Failed to calculate next goal ID";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
