"use client";

import { useState } from "react";
import { useWallet } from "./lib/wallet/context";
import { WalletButton } from "./components/wallet-button";
import { GridBackground } from "./components/grid-background";
import { ClusterSelect } from "./components/cluster-select";
import { GoalCard } from "./components/goal-card";
import { TargetSection } from "./components/target-section";
import { useCluster } from "./components/cluster-context";
import { useBalance } from "./lib/hooks/use-balance";
import { useTokenBalance } from "./lib/hooks/use-token-balance";
import { useAuth } from "./lib/auth/auth-context";
import { lamportsToSolString } from "./lib/lamports";
import { microUsdcToString, DEVNET_TUSDC_MINT, LOCALNET_TUSDC_MINT } from "./lib/usdc";
import { ellipsify } from "./lib/explorer";
import { address as solanaAddress } from "@solana/kit";
import { toast } from "sonner";
import { MarketplaceSearch } from "./components/marketplace-search";
import { MarketplaceListing } from "./lib/marketplace/types";

export default function Home() {
  const { status, wallet } = useWallet();
  const address = wallet?.account?.address;
  const { cluster } = useCluster();
  const balance = useBalance(address);

  const usdcMint = cluster === "mainnet"
    ? DEVNET_TUSDC_MINT
    : cluster === "devnet"
    ? DEVNET_TUSDC_MINT
    : LOCALNET_TUSDC_MINT;

  const usdcBalance = useTokenBalance(
    address ? solanaAddress(address) : undefined,
    solanaAddress(usdcMint)
  );

  const { isAuthenticated, isLoading: isAuthLoading, error: authError, signIn, signOut } = useAuth();
  const [selectedListing, setSelectedListing] = useState<MarketplaceListing | null>(null);
  const [createdGoalPda, setCreatedGoalPda] = useState<string>("");

  const handleAirdrop = async () => {
    if (!address) return;
    try {
      const res = await fetch(
        cluster === "localnet"
          ? "http://localhost:8899"
          : `https://api.${cluster}.solana.com`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "requestAirdrop",
            params: [address, 1_000_000_000],
          }),
        }
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      toast.success("Airdropped 1 SOL!");
      balance.mutate();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Airdrop failed";
      toast.error(msg);
    }
  };

  const solDisplay = balance.lamports != null ? lamportsToSolString(balance.lamports) : "—";
  const usdcDisplay = usdcBalance.amount != null ? microUsdcToString(usdcBalance.amount) : "0.00";

  return (
    <div className="relative min-h-screen w-full bg-background font-sans antialiased text-foreground">
      <GridBackground />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-2xl flex-col px-4 py-6 sm:px-6">
        {/* Header / Wallet Summary */}
        <header className="panel mb-10 p-5">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <h1 className="text-lg font-bold tracking-[0.15em] text-foreground">RIVESEEK</h1>
              <p className="text-sm text-muted">Find it. Match it. Save for it.</p>
            </div>

            <div className="flex flex-col items-start gap-3 sm:items-end">
              <div className="flex items-center gap-2">
                <ClusterSelect />
                <WalletButton />
              </div>

              {status === "connected" && address && (
                <div className="text-right">
                  <p className="font-mono text-xs text-muted">{ellipsify(address, 4)}</p>
                  <div className="mt-2 flex gap-6">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted">SOL</p>
                      <p className="font-mono text-sm font-semibold tabular-nums">{solDisplay}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted">USDC</p>
                      <p className="font-mono text-sm font-semibold tabular-nums">{usdcDisplay}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* SIWS — compact inline auth */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <div className="flex items-center gap-2 text-xs">
              {status !== "connected" ? (
                <span className="text-muted">Connect wallet to begin</span>
              ) : isAuthenticated ? (
                <>
                  <span className="inline-flex h-1.5 w-1.5 rounded-full bg-success" />
                  <span className="text-success">Authenticated</span>
                </>
              ) : (
                <>
                  <span className="inline-flex h-1.5 w-1.5 rounded-full bg-warning" />
                  <span className="text-muted">Wallet connected · not signed in</span>
                </>
              )}
              {authError && <span className="text-destructive">{authError}</span>}
            </div>

            <div className="flex items-center gap-2">
              {cluster !== "mainnet" && status === "connected" && (
                <button
                  onClick={handleAirdrop}
                  className="cursor-pointer rounded-md border border-border px-2.5 py-1 text-[10px] font-medium text-muted transition hover:text-foreground"
                >
                  Airdrop SOL
                </button>
              )}
              {status === "connected" && (
                isAuthenticated ? (
                  <button
                    onClick={() => void signOut()}
                    disabled={isAuthLoading}
                    className="cursor-pointer rounded-md border border-border px-2.5 py-1 text-[10px] font-medium text-muted transition hover:text-foreground disabled:opacity-50"
                  >
                    Sign Out
                  </button>
                ) : (
                  <button
                    onClick={async () => {
                      try {
                        await signIn();
                        toast.success("Successfully authenticated!");
                      } catch (err: unknown) {
                        const msg = err instanceof Error ? err.message : "Sign-in failed";
                        toast.error(msg);
                      }
                    }}
                    disabled={isAuthLoading}
                    className="cursor-pointer rounded-md bg-primary px-3 py-1 text-[10px] font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
                  >
                    {isAuthLoading ? "Signing in..." : "Sign In with Solana"}
                  </button>
                )
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 space-y-14 pb-16">
          {/* 1. Your Target */}
          <TargetSection
            selectedListing={selectedListing}
            onClearTarget={() => setSelectedListing(null)}
          />

          {/* 2. Live on eBay */}
          <MarketplaceSearch
            selectedListing={selectedListing}
            onSelectListing={setSelectedListing}
          />

          {/* 3. Savings Goal + 4. Advanced Details */}
          <GoalCard
            isAuthenticated={isAuthenticated}
            selectedListing={selectedListing}
            initialGoalPda={createdGoalPda}
            walletUsdcBalance={usdcDisplay}
            onGoalCreated={(pda) => {
              setCreatedGoalPda(pda);
              toast.success(`Goal created! PDA: ${pda.slice(0, 8)}...`);
            }}
            onBalanceChange={() => {
              balance.mutate();
              usdcBalance.mutate();
            }}
          />
        </main>
      </div>
    </div>
  );
}
