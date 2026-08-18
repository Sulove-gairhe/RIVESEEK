import type { ClusterMoniker } from "@/app/lib/solana-client";

/**
 * SavingsGoal represents the application-layer metadata describing
 * what collectible the user is saving for. This is stored in the
 * savings_goals database table.
 */
export interface SavingsGoal {
    id: string; // UUID
    goalId: string; // u64 as string
    goalAccountPda: string; // Base58 Solana address
    cluster: ClusterMoniker;
    marketplace: "ebay";
    externalListingId: string; // eBay externalId
    title: string;
    imageUrl: string | null;
    targetPrice: string; // Decimal as string (e.g., "149.99")
    currency: string; // "USD"
    canonicalName: string | null;
    setName: string | null;
    cardNumber: string | null;
    year: number | null;
    language: string | null;
    finish: string | null;
    grader: string | null;
    grade: number | null;
    createdAt: string; // ISO timestamp
    updatedAt: string; // ISO timestamp
}

/**
 * SavingsGoalWithMirror extends SavingsGoal with fields from the
 * goal_mirrors table, which caches on-chain GoalAccount state.
 * Used when displaying goals with their current vault balance and status.
 */
export interface SavingsGoalWithMirror extends SavingsGoal {
    vaultBalance?: string; // u64 as string
    status?: string; // "ACTIVE" | "PAUSED" | "CANCELLED"
    lastSyncedAt?: string; // ISO timestamp
}

/**
 * CreateSavingsGoalRequest is the request body for POST /api/savings-goals.
 * This is called AFTER the Solana GoalAccount has been created on-chain
 * to persist the application metadata.
 */
export interface CreateSavingsGoalRequest {
    walletAddress: string;
    cluster: ClusterMoniker;
    goalId: string;
    goalAccountPda: string;
    marketplace: "ebay";
    externalListingId: string;
    title: string;
    imageUrl?: string;
    targetPrice: string;
    currency: string;
    canonicalName?: string;
    setName?: string;
    cardNumber?: string;
    year?: number;
    language?: string;
    finish?: string;
    grader?: string;
    grade?: number;
}

/**
 * GetSavingsGoalsResponse is the response from GET /api/savings-goals.
 * Returns all savings goals for the authenticated wallet with optional
 * joined goal_mirror data.
 */
export interface GetSavingsGoalsResponse {
    goals: SavingsGoalWithMirror[];
}

/**
 * GetNextGoalIdResponse is the response from GET /api/savings-goals/next-id.
 * Returns the next available goal_id for the wallet+cluster combination.
 */
export interface GetNextGoalIdResponse {
    nextGoalId: string; // u64 as string to avoid JavaScript number precision issues
    walletAddress: string;
    cluster: string;
}
