"use client";

import { useState, useCallback } from "react";
import { useWallet } from "../lib/wallet/context";
import { useCluster } from "./cluster-context";
import { useSendTransaction } from "../lib/hooks/use-send-transaction";
import { getDepositInstruction } from "../generated/riveseek_goal_vault";
import { address as solanaAddress } from "@solana/kit";
import { ellipsify } from "../lib/explorer";

export type GoalMirrorDTO = {
  id: string;
  walletId: string;
  cluster: string;
  accountAddress: string;
  ownerAddress: string;
  goalId: string;
  fundingMint: string;
  vaultToken: string;
  maximumBudget: string;
  vaultBalance: string;
  status: string;
  lastObservedSlot: string | null;
  onChainCreatedAt: string | null;
  lastSyncedAt: string;
  createdAt: string;
  updatedAt: string;
};

export function GoalCard({ isAuthenticated }: { isAuthenticated: boolean }) {
  const { wallet, signer } = useWallet();
  const address = wallet?.account?.address;
  const { cluster } = useCluster();
  const { send, isSending } = useSendTransaction();

  const [goalPdaInput, setGoalPdaInput] = useState("");
  const [fundingMintInput, setFundingMintInput] = useState("");
  const [vaultTokenInput, setVaultTokenInput] = useState("");
  const [ownerTokenInput, setOwnerTokenInput] = useState("");
  const [depositAmountInput, setDepositAmountInput] = useState("1000000");

  const [goalMirror, setGoalMirror] = useState<GoalMirrorDTO | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  // Manual Refresh Handler
  const handleRefresh = useCallback(
    async (pdaToRefresh?: string) => {
      const pda = pdaToRefresh || goalPdaInput;
      if (!pda) {
        setMessage({ type: "error", text: "Please enter a valid Goal Account PDA." });
        return;
      }

      setIsRefreshing(true);
      setMessage(null);
      try {
        const res = await fetch("/api/goals/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ goalPda: pda, cluster }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to refresh goal mirror");
        }

        setGoalMirror(data.goal);
        setMessage({ type: "success", text: `Goal mirror refreshed successfully (${data.goal.status})` });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Refresh failed";
        setMessage({ type: "error", text: msg });
      } finally {
        setIsRefreshing(false);
      }
    },
    [goalPdaInput, cluster]
  );

  // Deposit Handler
  const handleDeposit = useCallback(async () => {
    if (!signer || !address) {
      setMessage({ type: "error", text: "Wallet not connected" });
      return;
    }
    if (!goalPdaInput || !fundingMintInput || !vaultTokenInput || !ownerTokenInput) {
      setMessage({ type: "error", text: "Please provide Goal PDA, Funding Mint, Vault Token, and Owner Token addresses." });
      return;
    }

    const amount = BigInt(depositAmountInput || "0");
    if (amount <= 0n) {
      setMessage({ type: "error", text: "Deposit amount must be greater than zero." });
      return;
    }

    setMessage(null);
    try {
      // Build Codama deposit instruction
      const depositIx = getDepositInstruction({
        owner: signer,
        goalAccount: solanaAddress(goalPdaInput),
        fundingMint: solanaAddress(fundingMintInput),
        vaultAuthority: solanaAddress("11111111111111111111111111111111"), // auto-derived or dummy
        ownerToken: solanaAddress(ownerTokenInput),
        vaultToken: solanaAddress(vaultTokenInput),
        amount,
      });

      // 1. Send transaction to Solana
      const txSig = await send({ instructions: [depositIx] });
      setMessage({ type: "success", text: `Solana deposit transaction confirmed! Signature: ${ellipsify(txSig, 6)}` });

      // 2. Trigger post-deposit mirror refresh
      try {
        await handleRefresh(goalPdaInput);
      } catch {
        // Preserving transaction success if mirror refresh fails
        setMessage({
          type: "info",
          text: `Solana deposit confirmed (${ellipsify(txSig, 6)}), but mirror refresh failed. Click Refresh to sync.`,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Deposit transaction failed";
      setMessage({ type: "error", text: msg });
    }
  }, [
    signer,
    address,
    goalPdaInput,
    fundingMintInput,
    vaultTokenInput,
    ownerTokenInput,
    depositAmountInput,
    send,
    handleRefresh,
  ]);

  return (
    <section className="relative w-full overflow-hidden rounded-2xl border border-border-low bg-card px-5 py-5 shadow-xs">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Goal Vault Mirror (Milestone 2C)</h3>
          <p className="mt-1 text-xs text-muted">
            Solana on-chain goal financial state mirrored to Neon database.
          </p>
        </div>
        {goalPdaInput && (
          <button
            id="refresh-goal-btn"
            onClick={() => void handleRefresh()}
            disabled={isRefreshing}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border-low px-3 py-1.5 text-xs font-medium transition hover:bg-cream disabled:opacity-50"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`}
            >
              <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
            </svg>
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </button>
        )}
      </div>

      {!isAuthenticated ? (
        <p className="mt-4 text-xs text-muted">
          Sign in with your Solana wallet to access and refresh your goal mirror state.
        </p>
      ) : (
        <div className="mt-4 space-y-4 text-xs">
          {/* Goal PDA Input */}
          <div className="space-y-1.5">
            <label className="block font-medium text-foreground/80">
              Goal Account PDA
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Enter GoalAccount PDA base58 address"
                value={goalPdaInput}
                onChange={(e) => setGoalPdaInput(e.target.value.trim())}
                className="w-full rounded-lg border border-border-low bg-background px-3 py-1.5 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                onClick={() => void handleRefresh()}
                disabled={isRefreshing || !goalPdaInput}
                className="cursor-pointer rounded-lg bg-primary px-3 py-1.5 font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
              >
                Sync Mirror
              </button>
            </div>
          </div>

          {/* Goal Mirror Details */}
          {goalMirror && (
            <div className="rounded-xl border border-border-low bg-background/50 p-4 space-y-2 font-mono">
              <div className="flex items-center justify-between border-b border-border-low pb-2 font-sans">
                <span className="text-xs font-semibold">Mirrored Goal Record</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    goalMirror.status === "ACTIVE"
                      ? "bg-emerald-500/10 text-emerald-500"
                      : goalMirror.status === "CLOSED"
                      ? "bg-rose-500/10 text-rose-500"
                      : "bg-amber-500/10 text-amber-500"
                  }`}
                >
                  {goalMirror.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
                <div>
                  <span className="text-muted">Goal ID:</span>{" "}
                  <span className="text-foreground">{goalMirror.goalId}</span>
                </div>
                <div>
                  <span className="text-muted">Cluster:</span>{" "}
                  <span className="text-foreground">{goalMirror.cluster}</span>
                </div>
                <div>
                  <span className="text-muted">Max Budget:</span>{" "}
                  <span className="text-foreground">{goalMirror.maximumBudget} units</span>
                </div>
                <div>
                  <span className="text-muted">Vault Balance (Cached):</span>{" "}
                  <span className="font-bold text-foreground">{goalMirror.vaultBalance} units</span>
                </div>
                <div className="col-span-2">
                  <span className="text-muted">Account PDA:</span>{" "}
                  <span className="text-foreground">{ellipsify(goalMirror.accountAddress, 8)}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-muted">Last Synced:</span>{" "}
                  <span className="text-foreground">{new Date(goalMirror.lastSyncedAt).toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}

          {/* Deposit Form */}
          <div className="rounded-xl border border-border-low bg-background/30 p-3 space-y-2">
            <h4 className="font-sans font-medium text-foreground">Deposit to Vault</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Funding Mint Address"
                value={fundingMintInput}
                onChange={(e) => setFundingMintInput(e.target.value.trim())}
                className="rounded-md border border-border-low bg-background px-2.5 py-1 font-mono text-[11px]"
              />
              <input
                type="text"
                placeholder="Vault Token Address"
                value={vaultTokenInput}
                onChange={(e) => setVaultTokenInput(e.target.value.trim())}
                className="rounded-md border border-border-low bg-background px-2.5 py-1 font-mono text-[11px]"
              />
              <input
                type="text"
                placeholder="Owner Token Account"
                value={ownerTokenInput}
                onChange={(e) => setOwnerTokenInput(e.target.value.trim())}
                className="rounded-md border border-border-low bg-background px-2.5 py-1 font-mono text-[11px]"
              />
              <input
                type="text"
                placeholder="Deposit Amount (Base Units)"
                value={depositAmountInput}
                onChange={(e) => setDepositAmountInput(e.target.value.trim())}
                className="rounded-md border border-border-low bg-background px-2.5 py-1 font-mono text-[11px]"
              />
            </div>
            <button
              onClick={() => void handleDeposit()}
              disabled={isSending || !goalPdaInput || !fundingMintInput || !vaultTokenInput || !ownerTokenInput}
              className="mt-1 w-full cursor-pointer rounded-lg bg-primary py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
            >
              {isSending ? "Depositing on Solana..." : "Execute Deposit & Refresh Mirror"}
            </button>
          </div>

          {/* Status Message */}
          {message && (
            <p
              className={`text-xs ${
                message.type === "success"
                  ? "text-emerald-500"
                  : message.type === "error"
                  ? "text-destructive"
                  : "text-amber-500"
              }`}
            >
              {message.text}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
