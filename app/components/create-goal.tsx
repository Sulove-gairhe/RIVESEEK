"use client";

import { useState, useCallback, useEffect } from "react";
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
import { MarketplaceListing } from "../lib/marketplace/types";

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
  selectedListing,
  embedded = false,
}: {
  isAuthenticated: boolean;
  onGoalCreated?: (goalPda: string) => void;
  selectedListing?: MarketplaceListing | null;
  embedded?: boolean;
}) {
  const { wallet, signer } = useWallet();
  const address = wallet?.account?.address;
  const { cluster } = useCluster();
  const { send, isSending } = useSendTransaction();

  const [goalIdInput, setGoalIdInput] = useState("");
  const [maxBudgetInput, setMaxBudgetInput] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  useEffect(() => {
    if (selectedListing && !maxBudgetInput) {
      setMaxBudgetInput(parseFloat(selectedListing.price.value).toFixed(2));
    }
  }, [selectedListing, maxBudgetInput]);

  const handleCreateGoal = useCallback(async () => {
    if (!signer || !address) {
      setMessage({ type: "error", text: "Wallet not connected" });
      return;
    }

    if (!goalIdInput || !maxBudgetInput) {
      setMessage({ type: "error", text: "Please provide both Goal ID and Maximum Budget." });
      return;
    }

    const goalId = BigInt(goalIdInput);
    const maximumBudget = usdToMicroUsdc(maxBudgetInput);

    if (maximumBudget <= 0n) {
      setMessage({ type: "error", text: "Maximum budget must be greater than zero." });
      return;
    }

    setMessage(null);

    try {
      const goalAccountPda = await findGoalAccountPda({
        owner: address,
        goalId,
      });

      const fundingMintAddress = cluster === "mainnet"
        ? DEVNET_TUSDC_MINT
        : cluster === "devnet"
        ? DEVNET_TUSDC_MINT
        : LOCALNET_TUSDC_MINT;

      const vaultTokenKeypair = await generateKeyPairSigner();

      const createGoalIx = await getCreateGoalInstructionAsync({
        owner: signer,
        fundingMint: solanaAddress(fundingMintAddress),
        vaultToken: vaultTokenKeypair,
        goalId,
        maximumBudget,
      });

      const txSig = await send({ instructions: [createGoalIx] });

      setMessage({
        type: "success",
        text: `Goal created! PDA: ${ellipsify(goalAccountPda[0], 8)} · Tx: ${ellipsify(txSig, 6)}`,
      });

      onGoalCreated?.(goalAccountPda[0]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Goal creation failed";
      const isAlreadyExists = msg.includes("already in use") || msg.includes("custom program error: 0x0");

      if (isAlreadyExists) {
        const goalAccountPda = await findGoalAccountPda({
          owner: address!,
          goalId: BigInt(goalIdInput),
        });
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

  if (!isAuthenticated) {
    return (
      <p className="text-sm text-muted">
        Sign in with your Solana wallet to create a savings goal.
      </p>
    );
  }

  return (
    <div className={`space-y-4 ${embedded ? "" : "panel p-5"}`}>
      {!embedded && (
        <div>
          <h3 className="text-sm font-medium">Create Goal</h3>
          <p className="mt-1 text-xs text-muted">
            Create a new on-chain goal vault before depositing funds.
          </p>
        </div>
      )}

      {embedded && (
        <div className="rounded-md border border-border bg-background/50 p-4">
          <h4 className="text-sm font-medium text-foreground">Create Savings Goal</h4>
          <p className="mt-1 text-xs text-muted">
            Set up an on-chain vault to start saving toward your target.
          </p>
        </div>
      )}

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-muted">Goal ID</label>
          <input
            type="text"
            placeholder="e.g., 1"
            value={goalIdInput}
            onChange={(e) => setGoalIdInput(e.target.value.trim())}
            className="input-field font-mono text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-muted">
            Maximum Budget (USDC)
            {selectedListing && (
              <span className="ml-2 font-normal text-muted/70">
                · Target price ${parseFloat(selectedListing.price.value).toFixed(2)}
              </span>
            )}
          </label>
          <input
            type="text"
            placeholder="e.g., 201.00"
            value={maxBudgetInput}
            onChange={(e) => setMaxBudgetInput(e.target.value.trim())}
            className="input-field font-mono text-sm"
          />
        </div>

        <button
          onClick={() => void handleCreateGoal()}
          disabled={isSending || !goalIdInput || !maxBudgetInput}
          className="btn-primary w-full"
        >
          {isSending ? "Creating on Solana..." : "Create Goal"}
        </button>

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
      </div>
    </div>
  );
}
