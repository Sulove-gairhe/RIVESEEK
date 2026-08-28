import { NextResponse, type NextRequest } from "next/server";
import { verifySession, SESSION_COOKIE_OPTIONS } from "@/app/lib/auth/session";
import { db } from "@/db";
import { savingsGoals, goalMirrors, wallets } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";

export async function GET(request: NextRequest) {
    try {
        // 1. Parse query params
        const { searchParams } = new URL(request.url);
        const walletAddress = searchParams.get("walletAddress");
        const cluster = searchParams.get("cluster");

        if (!walletAddress || !cluster) {
            return NextResponse.json(
                { error: "walletAddress and cluster required" },
                { status: 400 }
            );
        }

        // 2. Verify session
        const sessionToken = request.cookies.get(SESSION_COOKIE_OPTIONS.name)?.value;
        if (!sessionToken) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const session = verifySession(sessionToken);
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // 3. Query wallet and verify ownership
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

        // 4. Query savings goals with LEFT JOIN to goal_mirrors
        const goals = await db
            .select({
                id: savingsGoals.id,
                goalId: savingsGoals.goalId,
                goalAccountPda: savingsGoals.goalAccountPda,
                cluster: savingsGoals.cluster,
                marketplace: savingsGoals.marketplace,
                externalListingId: savingsGoals.externalListingId,
                title: savingsGoals.title,
                imageUrl: savingsGoals.imageUrl,
                targetPrice: savingsGoals.targetPrice,
                currency: savingsGoals.currency,
                canonicalName: savingsGoals.canonicalName,
                setName: savingsGoals.setName,
                cardNumber: savingsGoals.cardNumber,
                year: savingsGoals.year,
                language: savingsGoals.language,
                finish: savingsGoals.finish,
                grader: savingsGoals.grader,
                grade: savingsGoals.grade,
                createdAt: savingsGoals.createdAt,
                // From goal_mirrors join:
                vaultToken: goalMirrors.vaultToken,
                fundingMint: goalMirrors.fundingMint,
                maximumBudget: goalMirrors.maximumBudget,
                ownerAddress: goalMirrors.ownerAddress,
                accountAddress: goalMirrors.accountAddress,
                vaultBalance: goalMirrors.vaultBalance,
                status: goalMirrors.status,
                lastSyncedAt: goalMirrors.lastSyncedAt,
            })
            .from(savingsGoals)
            .leftJoin(
                goalMirrors,
                and(
                    eq(savingsGoals.goalAccountPda, goalMirrors.accountAddress),
                    eq(savingsGoals.cluster, goalMirrors.cluster)
                )
            )
            .where(
                and(
                    eq(savingsGoals.walletId, wallet.id),
                    eq(savingsGoals.cluster, cluster)
                )
            )
            .orderBy(desc(savingsGoals.createdAt));

        return NextResponse.json({ goals });
    } catch (err: unknown) {
        const message =
            err instanceof Error ? err.message : "Failed to fetch savings goals";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
