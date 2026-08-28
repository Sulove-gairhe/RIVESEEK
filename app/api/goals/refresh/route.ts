import { NextResponse, type NextRequest } from "next/server";
import { verifySession, SESSION_COOKIE_OPTIONS } from "@/app/lib/auth/session";
import { syncGoalFromChain } from "@/app/lib/goals/sync-goal";
import { db } from "@/db";
import { wallets } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get(SESSION_COOKIE_OPTIONS.name)?.value;
    if (!sessionToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const session = verifySession(sessionToken);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { goalPda, cluster = "devnet" } = body || {};

    if (!goalPda) {
      return NextResponse.json(
        { error: "goalPda is required" },
        { status: 400 }
      );
    }

    const result = await syncGoalFromChain({ goalPda, cluster });

    if (result.status === "NOT_FOUND") {
      return NextResponse.json(
        { error: "Goal account not found on chain" },
        { status: 404 }
      );
    }

    if (result.status === "UNLINKED_WALLET") {
      return NextResponse.json(
        { error: "Goal owner wallet is not verified in RiveSeek" },
        { status: 403 }
      );
    }

    // Verify goal owner wallet belongs to current session user
    const goalRecord = result.record;
    if (goalRecord) {
      const [wallet] = await db
        .select()
        .from(wallets)
        .where(
          and(
            eq(wallets.id, goalRecord.walletId),
            eq(wallets.userId, session.userId)
          )
        )
        .limit(1);

      if (!wallet) {
        return NextResponse.json(
          { error: "Goal belongs to another user" },
          { status: 403 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      goal: result.record,
      status: result.status,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to refresh goal mirror";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
