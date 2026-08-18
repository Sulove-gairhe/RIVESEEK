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
import { CreateGoal } from "./create-goal";
import { DEMO_TARGET } from "../lib/catalog/demo-target";

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

function AdvancedDetails({
  goalPdaInput,
  setGoalPdaInput,
  goalMirror,
  isRefreshing,
  onRefresh,
  cluster,
}: {
  goalPdaInput: string;
  setGoalPdaInput: (v: string) => void;
  goalMirror: GoalMirrorDTO | null;
  isRefreshing: boolean;
  onRefresh: () => void;
  cluster: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <section className="space-y-3">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full cursor-pointer items-center justify-between rounded-md border border-border bg-card px-4 py-3 text-left transition hover:bg-accent/50"
      >
        <span className="text-sm font-medium text-foreground">Advanced Details</span>
        <svg
          className={`h-4 w-4 text-muted transition-transform ${isOpen ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {isOpen && (
        <div className="panel space-y-4 p-4 text-xs">
          <div className="space-y-1.5">
            <label className="block font-medium text-muted">Goal PDA</label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Goal Account PDA"
                value={goalPdaInput}
                onChange={(e) => setGoalPdaInput(e.target.value.trim())}
                className="input-field font-mono text-xs"
              />
              <button
                onClick={() => void onRefresh()}
                disabled={isRefreshing || !goalPdaInput}
                className="btn-secondary shrink-0 px-3 py-2 text-xs"
              >
                {isRefreshing ? "Syncing..." : "Sync Mirror"}
              </button>
            </div>
          </div>

          {goalMirror && (
            <dl className="space-y-3 font-mono">
              <div className="flex justify-between gap-4 border-b border-border pb-2">
                <dt className="text-muted">Goal PDA</dt>
                <dd className="break-all text-right text-foreground">{goalMirror.accountAddress}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-border pb-2">
                <dt className="text-muted">Vault Address</dt>
                <dd className="break-all text-right text-foreground">{goalMirror.vaultToken}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-border pb-2">
                <dt className="text-muted">Funding Mint</dt>
                <dd className="break-all text-right text-foreground">{goalMirror.fundingMint}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-border pb-2">
                <dt className="text-muted">Last Sync</dt>
                <dd className="text-right text-foreground">
                  {new Date(goalMirror.lastSyncedAt).toLocaleString()}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-border pb-2">
                <dt className="text-muted">Goal ID</dt>
                <dd className="text-foreground">{goalMirror.goalId}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-border pb-2">
                <dt className="text-muted">Status</dt>
                <dd className="text-foreground">{goalMirror.status}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Cluster</dt>
                <dd className="text-foreground">{goalMirror.cluster || cluster}</dd>
              </div>
            </dl>
          )}

          {!goalMirror && (
            <p className="text-muted">Enter a Goal PDA and sync to view technical details.</p>
          )}
        </div>
      )}
    </section>
  );
}

export function GoalCard({
  isAuthenticated,
  selectedListing,
  initialGoalPda,
  onBalanceChange,
  onGoalCreated,
  walletUsdcBalance,
}: {
  isAuthenticated: boolean;
  selectedListing?: MarketplaceListing | null;
  initialGoalPda?: string;
  onBalanceChange?: () => void;
  onGoalCreated?: (goalPda: string) => void;
  walletUsdcBalance?: string;
}) {
  const { wallet, signer } = useWallet();
  const address = wallet?.account?.address;
  const { cluster } = useCluster();
  const { send, isSending } = useSendTransaction();

  const [goalPdaInput, setGoalPdaInput] = useState("");
  const [depositAmountInput, setDepositAmountInput] = useState("1.00");
  const [withdrawAmountInput, setWithdrawAmountInput] = useState("");

  const [goalMirror, setGoalMirror] = useState<GoalMirrorDTO | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  useEffect(() => {
    if (initialGoalPda && initialGoalPda !== goalPdaInput) {
      setGoalPdaInput(initialGoalPda);
    }
  }, [initialGoalPda]);

  let percent = 0;
  const targetPrice = selectedListing?.price.value;
  if (goalMirror && targetPrice) {
    try {
      const currentUnits = BigInt(goalMirror.vaultBalance);
      const targetUnits = usdToMicroUsdc(targetPrice);
      if (targetUnits > 0n) {
        const scaled = (currentUnits * 10000n) / targetUnits;
        percent = Math.min(100, Number(scaled) / 100);
      }
    } catch (e) {
      console.error("Failed to compute progress percentage:", e);
    }
  }

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
        setMessage({ type: "success", text: `Synced with Solana · ${data.goal.status}` });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Refresh failed";
        setMessage({ type: "error", text: msg });
      } finally {
        setIsRefreshing(false);
      }
    },
    [goalPdaInput, cluster]
  );

  const handleDeposit = useCallback(async () => {
    if (!signer || !address) {
      setMessage({ type: "error", text: "Wallet not connected" });
      return;
    }

    if (!goalMirror) {
      setMessage({ type: "error", text: "No goal mirror loaded. Please sync a goal first." });
      return;
    }

    if (goalMirror.ownerAddress !== address) {
      setMessage({
        type: "error",
        text: `Goal owner (${ellipsify(goalMirror.ownerAddress, 4)}) does not match connected wallet (${ellipsify(address, 4)})`,
      });
      return;
    }

    if (goalMirror.status !== "ACTIVE") {
      setMessage({
        type: "error",
        text: `Goal is ${goalMirror.status}. Only ACTIVE goals can receive deposits.`,
      });
      return;
    }

    const amount = usdToMicroUsdc(depositAmountInput);
    if (amount <= 0n) {
      setMessage({ type: "error", text: "Deposit amount must be greater than zero." });
      return;
    }

    setMessage(null);

    try {
      const goalAccountAddr = solanaAddress(goalMirror.accountAddress);
      const fundingMintAddr = solanaAddress(goalMirror.fundingMint);
      const vaultTokenAddr = solanaAddress(goalMirror.vaultToken);

      const [ownerTokenAddr] = await findAssociatedTokenAddress(
        solanaAddress(address),
        fundingMintAddr
      );

      const [vaultAuthorityAddr] = await findVaultAuthorityPda({
        goalAccount: goalAccountAddr,
      });

      const depositIx = await getDepositInstructionAsync({
        owner: signer,
        goalAccount: goalAccountAddr,
        fundingMint: fundingMintAddr,
        ownerToken: ownerTokenAddr,
        vaultToken: vaultTokenAddr,
        amount,
      });

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

      const txSig = await send({ instructions: [depositIx] });
      setMessage({
        type: "success",
        text: `Deposited ${depositAmountInput} USDC · Tx: ${ellipsify(txSig, 6)}`,
      });

      if (onBalanceChange) {
        onBalanceChange();
      }

      try {
        await handleRefresh(goalMirror.accountAddress);
      } catch {
        setMessage({
          type: "info",
          text: `Deposit confirmed (${ellipsify(txSig, 6)}), but mirror refresh failed. Click Refresh to sync.`,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Deposit transaction failed";

      if (msg.includes("insufficient funds") || msg.includes("InsufficientFunds")) {
        setMessage({
          type: "error",
          text: `Insufficient USDC balance. You need ${depositAmountInput} USDC in your wallet.`,
        });
      } else if (msg.includes("AccountNotFound") || msg.includes("could not find account")) {
        setMessage({
          type: "error",
          text: "Token account not found. You may need to create a USDC token account first.",
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

  const handleWithdraw = useCallback(async () => {
    if (!signer || !address) {
      setMessage({ type: "error", text: "Wallet not connected" });
      return;
    }

    if (!goalMirror) {
      setMessage({ type: "error", text: "No goal mirror loaded. Please sync a goal first." });
      return;
    }

    if (goalMirror.ownerAddress !== address) {
      setMessage({
        type: "error",
        text: `Goal owner (${ellipsify(goalMirror.ownerAddress, 4)}) does not match connected wallet (${ellipsify(address, 4)})`,
      });
      return;
    }

    if (goalMirror.status !== "ACTIVE") {
      setMessage({
        type: "error",
        text: `Goal is ${goalMirror.status}. Only ACTIVE goals allow withdrawals.`,
      });
      return;
    }

    const amount = usdToMicroUsdc(withdrawAmountInput);
    if (amount <= 0n) {
      setMessage({ type: "error", text: "Withdrawal amount must be greater than zero." });
      return;
    }

    const cachedVaultBalance = BigInt(goalMirror.vaultBalance);
    if (amount > cachedVaultBalance) {
      setMessage({
        type: "error",
        text: `Withdrawal amount exceeds cached vault balance (${formatMicroUsdc(goalMirror.vaultBalance)} USDC). Refresh mirror to sync.`,
      });
      return;
    }

    setMessage(null);

    try {
      const goalAccountAddr = solanaAddress(goalMirror.accountAddress);
      const fundingMintAddr = solanaAddress(goalMirror.fundingMint);
      const vaultTokenAddr = solanaAddress(goalMirror.vaultToken);

      const [ownerTokenAddr] = await findAssociatedTokenAddress(
        solanaAddress(address),
        fundingMintAddr
      );

      const [vaultAuthorityAddr] = await findVaultAuthorityPda({
        goalAccount: goalAccountAddr,
      });

      const withdrawIx = await getWithdrawInstructionAsync({
        owner: signer,
        goalAccount: goalAccountAddr,
        fundingMint: fundingMintAddr,
        ownerToken: ownerTokenAddr,
        vaultToken: vaultTokenAddr,
        amount,
      });

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

      const txSig = await send({ instructions: [withdrawIx] });
      setMessage({
        type: "success",
        text: `Withdrew ${withdrawAmountInput} USDC · Tx: ${ellipsify(txSig, 6)}`,
      });

      setWithdrawAmountInput("");

      if (onBalanceChange) {
        onBalanceChange();
      }

      try {
        await handleRefresh(goalMirror.accountAddress);
      } catch {
        setMessage({
          type: "info",
          text: `Withdrawal confirmed (${ellipsify(txSig, 6)}), but mirror refresh failed. Click Refresh to sync.`,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Withdrawal transaction failed";

      if (msg.includes("insufficient funds") || msg.includes("InsufficientFunds")) {
        setMessage({
          type: "error",
          text: `Insufficient vault balance. The vault may have less than ${withdrawAmountInput} USDC.`,
        });
      } else if (msg.includes("AccountNotFound") || msg.includes("could not find account")) {
        setMessage({
          type: "error",
          text: "Token account not found. You may need to create a USDC token account first.",
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

  const goalTitle = selectedListing
    ? selectedListing.title.split(/[,\-–]/)[0]?.trim() || selectedListing.title
    : `${DEMO_TARGET.canonical.name} ${DEMO_TARGET.variant.grader} ${DEMO_TARGET.variant.grade}`;

  const savedAmount = goalMirror ? formatMicroUsdc(goalMirror.vaultBalance) : "0.00";
  const targetAmount = targetPrice ? parseFloat(targetPrice).toFixed(2) : "—";

  return (
    <>
      <section className="space-y-5">
        <h2 className="section-label">Savings Goal</h2>

        <div className="panel p-5 space-y-5">
          {!isAuthenticated ? (
            <p className="text-sm text-muted">
              Sign in with your Solana wallet to manage your savings goal.
            </p>
          ) : !goalMirror ? (
            <CreateGoal
              isAuthenticated={isAuthenticated}
              selectedListing={selectedListing}
              embedded
              onGoalCreated={(pda) => {
                setGoalPdaInput(pda);
                onGoalCreated?.(pda);
                void handleRefresh(pda);
              }}
            />
          ) : (
            <>
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-foreground">{goalTitle}</h3>
                {goalMirror.status !== "ACTIVE" && (
                  <span className="inline-block rounded border border-warning/30 bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
                    {goalMirror.status}
                  </span>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-semibold tabular-nums text-foreground">
                    ${savedAmount}
                    <span className="ml-1 text-sm font-normal text-muted">saved</span>
                  </span>
                  <span className="text-sm tabular-nums text-muted">
                    ${targetAmount} target
                  </span>
                </div>

                <div className="space-y-1.5">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-500"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <p className="text-right text-xs tabular-nums text-muted">{percent.toFixed(1)}%</p>
                </div>
              </div>

              {walletUsdcBalance != null && (
                <p className="text-sm text-muted">
                  Wallet USDC:{" "}
                  <span className="font-medium tabular-nums text-foreground">{walletUsdcBalance}</span>
                </p>
              )}

              {goalMirror.status === "ACTIVE" && goalMirror.ownerAddress === address ? (
                <div className="space-y-4 border-t border-border pt-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-muted">Amount</label>
                    <input
                      type="text"
                      placeholder="1.00"
                      value={depositAmountInput}
                      onChange={(e) => setDepositAmountInput(e.target.value.trim())}
                      className="input-field font-mono"
                    />
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={() => void handleDeposit()}
                      disabled={isSending || !depositAmountInput}
                      className="btn-primary flex-1 min-w-[120px]"
                    >
                      {isSending ? "Processing..." : "Add Funds"}
                    </button>
                    <button
                      onClick={() => void handleWithdraw()}
                      disabled={isSending || !withdrawAmountInput}
                      className="btn-secondary flex-1 min-w-[120px]"
                    >
                      {isSending ? "Processing..." : "Withdraw"}
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-muted">Withdraw amount</label>
                    <input
                      type="text"
                      placeholder="e.g., 0.50"
                      value={withdrawAmountInput}
                      onChange={(e) => setWithdrawAmountInput(e.target.value.trim())}
                      className="input-field font-mono text-sm"
                    />
                  </div>
                </div>
              ) : goalMirror.ownerAddress !== address ? (
                <p className="text-sm text-destructive">
                  This goal belongs to a different wallet ({ellipsify(goalMirror.ownerAddress, 4)}).
                </p>
              ) : null}

              <div className="flex items-center justify-between border-t border-border pt-4">
                <p className="flex items-center gap-1.5 text-xs text-success">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Synced with Solana · {cluster === "devnet" ? "Devnet" : cluster === "mainnet" ? "Mainnet" : "Localnet"}
                </p>
                <button
                  id="refresh-goal-btn"
                  onClick={() => void handleRefresh()}
                  disabled={isRefreshing}
                  className="flex cursor-pointer items-center gap-1.5 text-xs text-muted transition hover:text-foreground disabled:opacity-50"
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
                  Refresh
                </button>
              </div>

              {message && (
                <p
                  className={`text-xs ${
                    message.type === "success"
                      ? "text-success"
                      : message.type === "error"
                        ? "text-destructive"
                        : "text-warning"
                  }`}
                >
                  {message.text}
                </p>
              )}
            </>
          )}
        </div>
      </section>

      <AdvancedDetails
        goalPdaInput={goalPdaInput}
        setGoalPdaInput={setGoalPdaInput}
        goalMirror={goalMirror}
        isRefreshing={isRefreshing}
        onRefresh={() => void handleRefresh()}
        cluster={cluster}
      />
    </>
  );
}
