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
import { useAuth } from "./lib/auth/auth-context";
import { lamportsToSolString } from "./lib/lamports";
import { ellipsify } from "./lib/explorer";
import { toast } from "sonner";

export default function Home() {
  const { status, wallet } = useWallet();
  const address = wallet?.account?.address;
  const { cluster } = useCluster();
  const balance = useBalance(address);
  const { user, isAuthenticated, isLoading: isAuthLoading, error: authError, signIn, signOut } = useAuth();
  const [copied, setCopied] = useState(false);

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
                <p className="relative mt-4 font-mono text-4xl font-bold tabular-nums tracking-tight">
                  {balance.lamports != null
                    ? lamportsToSolString(balance.lamports)
                    : "\u2014"}
                  <span className="ml-1.5 text-lg font-normal text-muted">
                    SOL
                  </span>
                </p>
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

            {/* Goal Vault Mirror Section */}
            <GoalCard isAuthenticated={isAuthenticated} />
          </div>
        </main>
      </div>
    </div>
  );
}
