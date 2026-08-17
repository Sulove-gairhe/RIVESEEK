"use client";

import { useState, useCallback, useEffect } from "react";
import { useWallet } from "../lib/wallet/context";
import { useCluster } from "./cluster-context";
import { useSendTransaction } from "../lib/hooks/use-send-transaction";
import {
  getDepositInstructionAsync,
  getWithdrawInstructionAsync,
  findVaultAuthorityPda,
} from "../generated/riveseek_goal_vault";
import {
  address as solanaAddress,
  getProgramDerivedAddress,
  getAddressEncoder,
  type Address,
} from "@solana/kit";
import { ellipsify } from "../lib/explorer";
import { MarketplaceListing } from "../lib/marketplace/types";

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

function usdToMicroUsdc(usdString: string): bigint {
  const clean = usdString.replace(/[^0-9.]/g, "");
  const parts = clean.split(".");
  const integerPart = parts[0] || "0";
  let decimalPart = parts[1] || "";
  if (decimalPart.length < 6) {
    decimalPart = decimalPart.padEnd(6, "0");
  } else {
    decimalPart = decimalPart.slice(0, 6);
  }
  return BigInt(integerPart + decimalPart);
}

function formatMicroUsdc(baseUnitsStr: string): string {
  try {
    const val = BigInt(baseUnitsStr);
    const integer = val / 1000000n;
    const decimal = val % 1000000n;
    let decStr = decimal.toString().padStart(6, "0");
    decStr = decStr.replace(/0+$/, "");
    if (decStr.length < 2) {
      decStr = decStr.padEnd(2, "0");
    }
    return `${integer}.${decStr}`;
  } catch {
    return "0.00";
  }
}

/**
 * Derive the Associated Token Address (ATA) for a given owner and mint.
 * Standard ATA derivation using seeds: [owner, tokenProgramId, mint]
 */
async function findAssociatedTokenAddress(
  owner: Address,
  mint: Address
): Promise<readonly [Address, number]> {
  const TOKEN_PROGRAM_ID = solanaAddress("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
  const ASSOCIATED_TOKEN_PROGRAM_ID = solanaAddress("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

  const addressEncoder = getAddressEncoder();

  const [ata, bump] = await getProgramDerivedAddress({
    programAddress: ASSOCIATED_TOKEN_PROGRAM_ID,
    seeds: [
      addressEncoder.encode(owner),
      addressEncoder.encode(TOKEN_PROGRAM_ID),
      addressEncoder.encode(mint),
    ],
  });

  return [ata, bump];
}

export function GoalCard({
  isAuthenticated,
  selectedListing,
  initialGoalPda,
  onBalanceChange,
}: {
  isAuthenticated: boolean;
  selectedListing?: MarketplaceListing | null;
  initialGoalPda?: string;
  onBalanceChange?: () => void;
}) {
  const { wallet, signer } = useWallet();
  const address = wallet?.account?.address;
  const { cluster } = useCluster();
  const { send, isSending } = useSendTransaction();

  const [goalPdaInput, setGoalPdaInput] = useState("");
  const [depositAmountInput, setDepositAmountInput] = useState("1.00"); // Display as tUSDC decimal
  const [withdrawAmountInput, setWithdrawAmountInput] = useState(""); // Display as tUSDC decimal

  const [goalMirror, setGoalMirror] = useState<GoalMirrorDTO | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  // Auto-populate PDA when initialGoalPda changes
  useEffect(() => {
    if (initialGoalPda && initialGoalPda !== goalPdaInput) {
      setGoalPdaInput(initialGoalPda);
    }
  }, [initialGoalPda]);

  let percent = 0;
  if (goalMirror && selectedListing) {
    try {
      const currentUnits = BigInt(goalMirror.vaultBalance);
      const targetUnits = usdToMicroUsdc(selectedListing.price.value);
      if (targetUnits > 0n) {
        const scaled = (currentUnits * 10000n) / targetUnits;
        percent = Math.min(100, Number(scaled) / 100);
      }
    } catch (e) {
      console.error("Failed to compute progress percentage:", e);
    }
  }

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

    if (!goalMirror) {
      setMessage({ type: "error", text: "No goal mirror loaded. Please sync a goal first." });
      return;
    }

    // Verify owner matches connected wallet
    if (goalMirror.ownerAddress !== address) {
      setMessage({
        type: "error",
        text: `Goal owner (${ellipsify(goalMirror.ownerAddress, 4)}) does not match connected wallet (${ellipsify(address, 4)})`
      });
      return;
    }

    // Verify goal is active
    if (goalMirror.status !== "ACTIVE") {
      setMessage({
        type: "error",
        text: `Goal is ${goalMirror.status}. Only ACTIVE goals can receive deposits.`
      });
      return;
    }

    // Convert tUSDC to base units
    const amount = usdToMicroUsdc(depositAmountInput);
    if (amount <= 0n) {
      setMessage({ type: "error", text: "Deposit amount must be greater than zero." });
      return;
    }

    setMessage(null);

    try {
      // Get account addresses from goal mirror
      const goalAccountAddr = solanaAddress(goalMirror.accountAddress);
      const fundingMintAddr = solanaAddress(goalMirror.fundingMint);
      const vaultTokenAddr = solanaAddress(goalMirror.vaultToken);

      // Derive user's associated token account
      const [ownerTokenAddr] = await findAssociatedTokenAddress(
        solanaAddress(address),
        fundingMintAddr
      );

      // Derive vault authority PDA for verification
      const [vaultAuthorityAddr] = await findVaultAuthorityPda({
        goalAccount: goalAccountAddr,
      });

      // Build Codama deposit instruction (async version auto-derives vaultAuthority)
      const depositIx = await getDepositInstructionAsync({
        owner: signer,
        goalAccount: goalAccountAddr,
        fundingMint: fundingMintAddr,
        ownerToken: ownerTokenAddr,
        vaultToken: vaultTokenAddr,
        amount,
      });

      // Log account details for debugging
      console.log("═══════════════════════════════════════════════════════");
      console.log("Deposit Instruction Accounts:");
      console.log("═══════════════════════════════════════════════════════");
      console.log("  Program ID:", "FDtNFJfNyKCeyvAkt6GUPiu6WREjRb6GM6e29NugHqxp");
      console.log("  Goal Account PDA:", goalAccountAddr);
      console.log("  Vault Authority PDA:", vaultAuthorityAddr);
      console.log("  Funding Mint:", fundingMintAddr);
      console.log("  Vault Token:", vaultTokenAddr);
      console.log("  Owner Wallet:", address);
      console.log("  Owner Token ATA:", ownerTokenAddr);
      console.log("  Amount:", amount.toString(), "base units");
      console.log("═══════════════════════════════════════════════════════");

      // Send transaction to Solana
      const txSig = await send({ instructions: [depositIx] });
      setMessage({
        type: "success",
        text: `Deposited ${depositAmountInput} tUSDC! Tx: ${ellipsify(txSig, 6)}`
      });

      // Trigger balance refresh callback
      if (onBalanceChange) {
        onBalanceChange();
      }

      // Trigger post-deposit mirror refresh
      try {
        await handleRefresh(goalMirror.accountAddress);
      } catch {
        // Preserving transaction success if mirror refresh fails
        setMessage({
          type: "info",
          text: `Deposit confirmed (${ellipsify(txSig, 6)}), but mirror refresh failed. Click Refresh to sync.`,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Deposit transaction failed";

      // Check for common errors
      if (msg.includes("insufficient funds") || msg.includes("InsufficientFunds")) {
        setMessage({
          type: "error",
          text: `Insufficient tUSDC balance. You need ${depositAmountInput} tUSDC in your wallet.`
        });
      } else if (msg.includes("AccountNotFound") || msg.includes("could not find account")) {
        setMessage({
          type: "error",
          text: `Token account not found. You may need to create a tUSDC token account first.`
        });
      } else {
        setMessage({ type: "error", text: msg });
      }
      console.error("Deposit error:", err);
    }
  }, [
    signer,
    address,
    goalMirror,
    depositAmountInput,
    send,
    handleRefresh,
    onBalanceChange,
  ]);

  // Withdrawal Handler
  const handleWithdraw = useCallback(async () => {
    if (!signer || !address) {
      setMessage({ type: "error", text: "Wallet not connected" });
      return;
    }

    if (!goalMirror) {
      setMessage({ type: "error", text: "No goal mirror loaded. Please sync a goal first." });
      return;
    }

    // Verify owner matches connected wallet
    if (goalMirror.ownerAddress !== address) {
      setMessage({
        type: "error",
        text: `Goal owner (${ellipsify(goalMirror.ownerAddress, 4)}) does not match connected wallet (${ellipsify(address, 4)})`
      });
      return;
    }

    // Verify goal is active
    if (goalMirror.status !== "ACTIVE") {
      setMessage({
        type: "error",
        text: `Goal is ${goalMirror.status}. Only ACTIVE goals allow withdrawals.`
      });
      return;
    }

    // Convert tUSDC to base units
    const amount = usdToMicroUsdc(withdrawAmountInput);
    if (amount <= 0n) {
      setMessage({ type: "error", text: "Withdrawal amount must be greater than zero." });
      return;
    }

    // Check against cached vault balance (user aware this is cached)
    const cachedVaultBalance = BigInt(goalMirror.vaultBalance);
    if (amount > cachedVaultBalance) {
      setMessage({
        type: "error",
        text: `Withdrawal amount exceeds cached vault balance (${formatMicroUsdc(goalMirror.vaultBalance)} tUSDC). Refresh mirror to sync.`
      });
      return;
    }

    setMessage(null);

    try {
      // Get account addresses from goal mirror
      const goalAccountAddr = solanaAddress(goalMirror.accountAddress);
      const fundingMintAddr = solanaAddress(goalMirror.fundingMint);
      const vaultTokenAddr = solanaAddress(goalMirror.vaultToken);

      // Derive user's associated token account
      const [ownerTokenAddr] = await findAssociatedTokenAddress(
        solanaAddress(address),
        fundingMintAddr
      );

      // Derive vault authority PDA for verification
      const [vaultAuthorityAddr] = await findVaultAuthorityPda({
        goalAccount: goalAccountAddr,
      });

      // Build Codama withdraw instruction (async version auto-derives vaultAuthority)
      const withdrawIx = await getWithdrawInstructionAsync({
        owner: signer,
        goalAccount: goalAccountAddr,
        fundingMint: fundingMintAddr,
        ownerToken: ownerTokenAddr,
        vaultToken: vaultTokenAddr,
        amount,
      });

      // Log account details for debugging
      console.log("═══════════════════════════════════════════════════════");
      console.log("Withdrawal Instruction Accounts:");
      console.log("═══════════════════════════════════════════════════════");
      console.log("  Program ID:", "FDtNFJfNyKCeyvAkt6GUPiu6WREjRb6GM6e29NugHqxp");
      console.log("  Goal Account PDA:", goalAccountAddr);
      console.log("  Vault Authority PDA:", vaultAuthorityAddr);
      console.log("  Funding Mint:", fundingMintAddr);
      console.log("  Vault Token:", vaultTokenAddr);
      console.log("  Owner Wallet:", address);
      console.log("  Owner Token ATA:", ownerTokenAddr);
      console.log("  Amount:", amount.toString(), "base units");
      console.log("═══════════════════════════════════════════════════════");

      // Send transaction to Solana
      const txSig = await send({ instructions: [withdrawIx] });
      setMessage({
        type: "success",
        text: `Withdrew ${withdrawAmountInput} tUSDC! Tx: ${ellipsify(txSig, 6)}`
      });

      // Clear withdrawal input after success
      setWithdrawAmountInput("");

      // Trigger balance refresh callback
      if (onBalanceChange) {
        onBalanceChange();
      }

      // Trigger post-withdrawal mirror refresh
      try {
        await handleRefresh(goalMirror.accountAddress);
      } catch {
        // Preserving transaction success if mirror refresh fails
        setMessage({
          type: "info",
          text: `Withdrawal confirmed (${ellipsify(txSig, 6)}), but mirror refresh failed. Click Refresh to sync.`,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Withdrawal transaction failed";

      // Check for common errors
      if (msg.includes("insufficient funds") || msg.includes("InsufficientFunds")) {
        setMessage({
          type: "error",
          text: `Insufficient vault balance. The vault may have less than ${withdrawAmountInput} tUSDC.`
        });
      } else if (msg.includes("AccountNotFound") || msg.includes("could not find account")) {
        setMessage({
          type: "error",
          text: `Token account not found. You may need to create a tUSDC token account first.`
        });
      } else {
        setMessage({ type: "error", text: msg });
      }
      console.error("Withdrawal error:", err);
    }
  }, [
    signer,
    address,
    goalMirror,
    withdrawAmountInput,
    send,
    handleRefresh,
    onBalanceChange,
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
          {/* Target Progress Section */}
          {selectedListing && goalMirror && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-primary font-sans font-medium">Savings Progress toward Target</span>
                <span className="text-foreground font-mono">
                  {formatMicroUsdc(goalMirror.vaultBalance)} / {selectedListing.price.value} tUSDC
                </span>
              </div>

              {/* Visual Progress Bar */}
              <div className="w-full bg-border-low rounded-full h-2 overflow-hidden">
                <div
                  className="bg-primary h-full transition-all duration-500"
                  style={{ width: `${percent}%` }}
                />
              </div>

              <p className="text-[10px] text-muted text-right font-mono">
                {percent.toFixed(1)}% Saved
              </p>
            </div>
          )}

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

            {!goalMirror ? (
              <p className="text-xs text-muted">
                Sync a goal mirror first to enable deposits.
              </p>
            ) : goalMirror.status !== "ACTIVE" ? (
              <p className="text-xs text-amber-500">
                Goal status is {goalMirror.status}. Only ACTIVE goals can receive deposits.
              </p>
            ) : goalMirror.ownerAddress !== address ? (
              <p className="text-xs text-destructive">
                This goal belongs to a different wallet ({ellipsify(goalMirror.ownerAddress, 4)}).
              </p>
            ) : (
              <>
                <div className="space-y-1.5">
                  <label className="block font-medium text-foreground/80 text-xs">
                    Deposit Amount (tUSDC)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., 1.00"
                    value={depositAmountInput}
                    onChange={(e) => setDepositAmountInput(e.target.value.trim())}
                    className="w-full rounded-md border border-border-low bg-background px-2.5 py-1.5 font-mono text-xs"
                  />
                  {depositAmountInput && (
                    <p className="text-[10px] text-muted">
                      Base units: {usdToMicroUsdc(depositAmountInput).toString()}
                    </p>
                  )}
                </div>

                <div className="rounded-md bg-background/50 p-2 space-y-1 text-[10px] text-muted">
                  <div className="flex justify-between">
                    <span>Funding Mint:</span>
                    <span className="font-mono">{ellipsify(goalMirror.fundingMint, 6)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Vault Token:</span>
                    <span className="font-mono">{ellipsify(goalMirror.vaultToken, 6)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Your ATA:</span>
                    <span className="font-mono text-muted">Auto-derived</span>
                  </div>
                </div>

                <button
                  onClick={() => void handleDeposit()}
                  disabled={isSending || !depositAmountInput}
                  className="mt-1 w-full cursor-pointer rounded-lg bg-primary py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
                >
                  {isSending ? "Depositing on Solana..." : "Execute Deposit & Refresh Mirror"}
                </button>
              </>
            )}
          </div>

          {/* Withdrawal Form */}
          {goalMirror && goalMirror.status === "ACTIVE" && goalMirror.ownerAddress === address && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
              <h4 className="font-sans font-medium text-foreground">Withdraw from Vault</h4>

              <div className="rounded-md bg-background/30 p-2 text-[10px] text-muted">
                <div className="flex justify-between">
                  <span>Current Vault Balance (Cached):</span>
                  <span className="font-mono font-bold text-foreground">
                    {formatMicroUsdc(goalMirror.vaultBalance)} tUSDC
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block font-medium text-foreground/80 text-xs">
                  Withdrawal Amount (tUSDC)
                </label>
                <input
                  type="text"
                  placeholder="e.g., 0.50"
                  value={withdrawAmountInput}
                  onChange={(e) => setWithdrawAmountInput(e.target.value.trim())}
                  className="w-full rounded-md border border-border-low bg-background px-2.5 py-1.5 font-mono text-xs"
                />
                {withdrawAmountInput && (
                  <p className="text-[10px] text-muted">
                    Base units: {usdToMicroUsdc(withdrawAmountInput).toString()}
                  </p>
                )}
              </div>

              <button
                onClick={() => void handleWithdraw()}
                disabled={isSending || !withdrawAmountInput}
                className="mt-1 w-full cursor-pointer rounded-lg bg-amber-600 py-1.5 text-xs font-medium text-white transition hover:bg-amber-700 disabled:opacity-50"
              >
                {isSending ? "Withdrawing from Solana..." : "Execute Withdrawal & Refresh Mirror"}
              </button>
            </div>
          )}

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
