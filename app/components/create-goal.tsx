"use client";

import { useState, useCallback } from "react";
import { useWallet } from "../lib/wallet/context";
import { useCluster } from "./cluster-context";
import { useSendTransaction } from "../lib/hooks/use-send-transaction";
import { 
  getCreateGoalInstructionAsync,
  findGoalAccountPda,
} from "../generated/riveseek_goal_vault";
import { 
  address as solanaAddress,
  generateKeyPairSigner,
} from "@solana/kit";
import { ellipsify } from "../lib/explorer";
import { DEVNET_TUSDC_MINT, LOCALNET_TUSDC_MINT } from "../lib/usdc";

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

export function CreateGoal({
  isAuthenticated,
  onGoalCreated,
}: {
  isAuthenticated: boolean;
  onGoalCreated?: (goalPda: string) => void;
}) {
  const { wallet, signer } = useWallet();
  const address = wallet?.account?.address;
  const { cluster } = useCluster();
  const { send, isSending } = useSendTransaction();

  const [goalIdInput, setGoalIdInput] = useState("");
  const [maxBudgetInput, setMaxBudgetInput] = useState("");
  const [createdPda, setCreatedPda] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  const handleCreateGoal = useCallback(async () => {
    if (!signer || !address) {
      setMessage({ type: "error", text: "Wallet not connected" });
      return;
    }

    if (!goalIdInput || !maxBudgetInput) {
      setMessage({ type: "error", text: "Please provide both Goal ID and Maximum Budget." });
      return;
    }

    // Parse inputs
    const goalId = BigInt(goalIdInput);
    const maximumBudget = usdToMicroUsdc(maxBudgetInput);

    if (maximumBudget <= 0n) {
      setMessage({ type: "error", text: "Maximum budget must be greater than zero." });
      return;
    }

    setMessage(null);
    setCreatedPda(null);

    try {
      // 1. Derive the Goal Account PDA
      const goalAccountPda = await findGoalAccountPda({
        owner: address,
        goalId,
      });

      // 2. Determine funding mint based on cluster
      const fundingMintAddress = cluster === "mainnet" 
        ? DEVNET_TUSDC_MINT // Replace with actual mainnet USDC if needed
        : cluster === "devnet"
        ? DEVNET_TUSDC_MINT
        : LOCALNET_TUSDC_MINT;

      // 3. Generate a new keypair for the vault token account
      const vaultTokenKeypair = await generateKeyPairSigner();

      // 4. Build create_goal instruction
      const createGoalIx = await getCreateGoalInstructionAsync({
        owner: signer,
        fundingMint: solanaAddress(fundingMintAddress),
        vaultToken: vaultTokenKeypair,
        goalId,
        maximumBudget,
      });

      // 5. Send transaction
      const txSig = await send({ instructions: [createGoalIx] });

      setCreatedPda(goalAccountPda[0]);
      setMessage({
        type: "success",
        text: `Goal created successfully! PDA: ${ellipsify(goalAccountPda[0], 8)} | Tx: ${ellipsify(txSig, 6)}`,
      });

      // 6. Call callback with created PDA
      onGoalCreated?.(goalAccountPda[0]);

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Goal creation failed";
      // Check if error is due to account already existing
      const isAlreadyExists = msg.includes("already in use") || msg.includes("custom program error: 0x0");
      
      if (isAlreadyExists) {
        // Derive PDA again to show it
        const goalAccountPda = await findGoalAccountPda({
          owner: address!,
          goalId: BigInt(goalIdInput),
        });
        setCreatedPda(goalAccountPda[0]);
        setMessage({
          type: "info",
          text: `Goal already exists at PDA: ${ellipsify(goalAccountPda[0], 8)}`,
        });
        onGoalCreated?.(goalAccountPda[0]);
      } else {
        setMessage({ type: "error", text: msg });
        console.error("Create goal error:", err);
      }
    }
  }, [signer, address, goalIdInput, maxBudgetInput, cluster, send, onGoalCreated]);

  return (
    <section className="relative w-full overflow-hidden rounded-2xl border border-border-low bg-card px-5 py-5 shadow-xs">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Create Goal</h3>
          <p className="mt-1 text-xs text-muted">
            Create a new on-chain goal vault before depositing funds.
          </p>
        </div>
      </div>

      {!isAuthenticated ? (
        <p className="mt-4 text-xs text-muted">
          Sign in with your Solana wallet to create a goal vault.
        </p>
      ) : (
        <div className="mt-4 space-y-4 text-xs">
          {/* Goal ID Input */}
          <div className="space-y-1.5">
            <label className="block font-medium text-foreground/80">
              Goal ID
            </label>
            <input
              type="text"
              placeholder="e.g., 1, 2, 3... (unique numeric identifier)"
              value={goalIdInput}
              onChange={(e) => setGoalIdInput(e.target.value.trim())}
              className="w-full rounded-lg border border-border-low bg-background px-3 py-1.5 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Maximum Budget Input */}
          <div className="space-y-1.5">
            <label className="block font-medium text-foreground/80">
              Maximum Budget (tUSDC)
            </label>
            <input
              type="text"
              placeholder="e.g., 199.99"
              value={maxBudgetInput}
              onChange={(e) => setMaxBudgetInput(e.target.value.trim())}
              className="w-full rounded-lg border border-border-low bg-background px-3 py-1.5 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {maxBudgetInput && (
              <p className="text-[10px] text-muted">
                Base units: {usdToMicroUsdc(maxBudgetInput).toString()}
              </p>
            )}
          </div>

          {/* Create Button */}
          <button
            onClick={() => void handleCreateGoal()}
            disabled={isSending || !goalIdInput || !maxBudgetInput}
            className="w-full cursor-pointer rounded-lg bg-primary py-2 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
          >
            {isSending ? "Creating Goal on Solana..." : "Create Goal"}
          </button>

          {/* Status Message */}
          {message && (
            <div
              className={`rounded-lg border p-3 text-xs ${
                message.type === "success"
                  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-500"
                  : message.type === "error"
                  ? "border-rose-500/20 bg-rose-500/10 text-rose-500"
                  : "border-amber-500/20 bg-amber-500/10 text-amber-500"
              }`}
            >
              {message.text}
            </div>
          )}

          {/* Created PDA Display */}
          {createdPda && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-primary">Goal Account Created</span>
              </div>
              <div className="font-mono text-[11px] break-all text-foreground">
                {createdPda}
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(createdPda);
                  setMessage({ type: "success", text: "PDA copied to clipboard!" });
                  setTimeout(() => setMessage(null), 2000);
                }}
                className="w-full cursor-pointer rounded-md border border-border-low px-3 py-1.5 text-[10px] font-medium transition hover:bg-cream"
              >
                Copy PDA
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
