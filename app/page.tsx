"use client";

import { useState } from "react";
import { useWallet } from "./lib/wallet/context";
import { WalletButton } from "./components/wallet-button";
import { GridBackground } from "./components/grid-background";
import { ThemeToggle } from "./components/theme-toggle";
import { ClusterSelect } from "./components/cluster-select";
import { GoalCard } from "./components/goal-card";
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
import { CreateGoal } from "./components/create-goal";

export default function Home() {
  const { status, wallet } = useWallet();
  const address = wallet?.account?.address;
  const { cluster } = useCluster();
  const balance = useBalance(address);
  
  // Determine USDC mint based on cluster
  const usdcMint = cluster === "mainnet" 
    ? DEVNET_TUSDC_MINT // Replace with actual mainnet USDC if needed
    : cluster === "devnet"
    ? DEVNET_TUSDC_MINT
    : LOCALNET_TUSDC_MINT;
  
  const usdcBalance = useTokenBalance(
    address ? solanaAddress(address) : undefined,
    solanaAddress(usdcMint)
  );
  
  const { user, isAuthenticated, isLoading: isAuthLoading, error: authError, signIn, signOut } = useAuth();
  const [copied, setCopied] = useState(false);
  const [selectedListing, setSelectedListing] = useState<MarketplaceListing | null>(null);
  const [createdGoalPda, setCreatedGoalPda] = useState<string>("");

  const handleCopy = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Airdrop failed";
      toast.error(msg);
    }
  };

  return (
    <div className="relative min-h-screen w-full bg-background font-sans antialiased text-foreground">
      <GridBackground />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-4xl flex-col px-4 py-6 sm:px-6">
        {/* Header */}
        <header className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight">RiveSeek</h1>
            <span className="rounded-md bg-cream px-2 py-0.5 font-mono text-[10px] font-medium text-foreground/70">
              v0.1.0
            </span>
          </div>
          <div className="flex items-center gap-3">
            <ClusterSelect />
            <ThemeToggle />
            <WalletButton />
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 py-12">
          <div className="mx-auto max-w-xl space-y-6">
            {/* Hero Card */}
            <section className="relative overflow-hidden rounded-2xl border border-border-low bg-card p-6 shadow-xs">
              <h2 className="text-2xl font-bold tracking-tight">
                Decentralized Goal Vaults
              </h2>
              <p className="mt-2 text-sm text-muted">
                Save toward targets on Solana with automated vault locking,
                on-chain program logic, and derived database goal mirrors.
              </p>
            </section>

            {/* Wallet Balance Card */}
            {status === "connected" && address && (
              <section className="relative overflow-hidden rounded-2xl border border-border-low bg-card p-6 shadow-xs">
                <div className="relative flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">Wallet Balance</span>
                    <button
                      onClick={handleCopy}
                      className="flex cursor-pointer items-center gap-1.5 font-mono text-xs text-muted transition hover:text-foreground"
                    >
                      {ellipsify(address, 4)}
                    </button>
                  </div>
                  {cluster !== "mainnet" && (
                    <button
                      onClick={handleAirdrop}
                      className="cursor-pointer rounded-lg border border-border-low px-3 py-1.5 text-xs font-medium transition hover:bg-cream"
                    >
                      Airdrop
                    </button>
                  )}
                </div>
                
                {/* Balance Grid: SOL and USDC side by side */}
                <div className="relative mt-4 grid grid-cols-2 gap-4">
                  {/* SOL Balance */}
                  <div>
                    <p className="font-mono text-3xl font-bold tabular-nums tracking-tight">
                      {balance.lamports != null
                        ? lamportsToSolString(balance.lamports)
                        : "\u2014"}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      SOL · {cluster === "mainnet" ? "Mainnet" : cluster === "devnet" ? "Devnet" : "Localnet"}
                    </p>
                  </div>

                  {/* USDC Balance */}
                  <div>
                    <p className="font-mono text-3xl font-bold tabular-nums tracking-tight">
                      {usdcBalance.amount != null
                        ? microUsdcToString(usdcBalance.amount)
                        : "0.00"}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      USDC · {cluster === "mainnet" ? "Mainnet" : cluster === "devnet" ? "Devnet" : "Localnet"}
                    </p>
                  </div>
                </div>
              </section>
            )}

            {/* Solana Authentication Status */}
            <section className="relative w-full overflow-hidden rounded-2xl border border-border-low bg-card px-5 py-5 shadow-xs">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium">
                    Solana Authentication (SIWS)
                  </h3>
                  <p className="mt-1 text-xs text-muted">
                    Cryptographic sign-in verifying wallet key ownership without
                    transferring funds.
                  </p>
                </div>
                {isAuthenticated ? (
                  <button
                    onClick={() => void signOut()}
                    disabled={isAuthLoading}
                    className="cursor-pointer rounded-lg border border-border-low px-3 py-1.5 text-xs font-medium text-destructive transition hover:bg-destructive/10 disabled:opacity-50"
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
                        const msg =
                          err instanceof Error ? err.message : "Sign-in failed";
                        toast.error(msg);
                      }
                    }}
                    disabled={status !== "connected" || isAuthLoading}
                    className="cursor-pointer rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground shadow-xs transition hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
                  >
                    {isAuthLoading ? "Signing in..." : "Sign In with Solana"}
                  </button>
                )}
              </div>

              <div className="mt-4 border-t border-border-low pt-3 text-xs">
                {status !== "connected" ? (
                  <p className="text-muted">
                    Connect your wallet first to request an authentication
                    challenge.
                  </p>
                ) : isAuthenticated && user ? (
                  <div className="space-y-1">
                    <p className="text-emerald-500 font-medium">
                      Authenticated Session Active
                    </p>
                    <p className="font-mono text-muted">
                      Application User ID:{" "}
                      <span className="text-foreground">{user.id}</span>
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="text-amber-500 font-medium">
                      Wallet Connected (Not Authenticated)
                    </p>
                    <p className="text-muted">
                      Click &quot;Sign In with Solana&quot; to sign a
                      cryptographic challenge and authorize your session.
                    </p>
                  </div>
                )}
                {authError && (
                  <p className="mt-2 text-destructive">{authError}</p>
                )}
              </div>
            </section>

            {/* Marketplace Search Section */}
            <MarketplaceSearch
              selectedListing={selectedListing}
              onSelectListing={setSelectedListing}
            />

            {/* Selected Target Card */}
            {selectedListing && (
              <section className="relative overflow-hidden rounded-2xl border border-primary bg-primary/5 p-5 shadow-xs space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-sm font-semibold text-primary">Selected Collectible Target</h3>
                    <p className="text-xs text-muted">You are saving for this specific card listing.</p>
                  </div>
                  <button
                    onClick={() => setSelectedListing(null)}
                    className="text-xs text-muted hover:text-foreground cursor-pointer font-medium"
                  >
                    Clear Target
                  </button>
                </div>
                <div className="flex gap-4 bg-background/40 p-3 rounded-xl border border-border-low">
                  {selectedListing.imageUrl && (
                    <div className="w-16 h-16 flex-shrink-0 rounded-md overflow-hidden border border-border-low bg-background flex items-center justify-center">
                      <img
                        src={selectedListing.imageUrl}
                        alt={selectedListing.title}
                        className="w-full h-full object-contain"
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-xs font-semibold text-foreground truncate">{selectedListing.title}</h4>
                    <div className="mt-1 text-[11px] text-muted space-y-0.5">
                      <div>
                        Target Price:{" "}
                        <span className="font-semibold text-foreground">
                          ${parseFloat(selectedListing.price.value).toFixed(2)} {selectedListing.price.currency}
                        </span>
                      </div>
                      {selectedListing.shipping && (
                        <div>
                          Shipping:{" "}
                          <span className="text-foreground">
                            ${parseFloat(selectedListing.shipping.value).toFixed(2)} {selectedListing.shipping.currency}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Create Goal Section */}
            <CreateGoal
              isAuthenticated={isAuthenticated}
              onGoalCreated={(pda) => {
                setCreatedGoalPda(pda);
                toast.success(`Goal created! PDA: ${pda.slice(0, 8)}...`);
              }}
            />

            {/* Goal Vault Mirror Section */}
            <GoalCard
              isAuthenticated={isAuthenticated}
              selectedListing={selectedListing}
              initialGoalPda={createdGoalPda}
              onBalanceChange={() => {
                // Refresh both SOL and USDC balances
                balance.mutate();
                usdcBalance.mutate();
              }}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
