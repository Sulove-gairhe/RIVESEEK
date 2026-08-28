"use client";

import { useState } from "react";
import { address as solanaAddress } from "@solana/kit";
import { toast } from "sonner";
import { ClusterSelect } from "./components/cluster-select";
import { GoalCard } from "./components/goal-card";
import { MarketplaceSearch } from "./components/marketplace-search";
import { ParticleField } from "./components/particle-field";
import { TargetSection } from "./components/target-section";
import { ThemeToggle } from "./components/theme-toggle";
import { WalletButton } from "./components/wallet-button";
import { useCluster } from "./components/cluster-context";
import { useAuth } from "./lib/auth/auth-context";
import { ellipsify } from "./lib/explorer";
import { useBalance } from "./lib/hooks/use-balance";
import { useTokenBalance } from "./lib/hooks/use-token-balance";
import { lamportsToSolString } from "./lib/lamports";
import { MarketplaceListing } from "./lib/marketplace/types";
import {
  DEVNET_TUSDC_MINT,
  LOCALNET_TUSDC_MINT,
  microUsdcToString,
} from "./lib/usdc";
import { useWallet } from "./lib/wallet/context";

const BENEFITS = [
  ["01", "Seek", "Search live listings and lock the exact thing you want."],
  ["02", "Save", "Build toward it with an on-chain goal you control."],
  ["03", "Own", "Track the finish line and withdraw when you are ready."],
] as const;

export default function Home() {
  const { status, wallet } = useWallet();
  const address = wallet?.account?.address;
  const { cluster } = useCluster();
  const balance = useBalance(address);
  const usdcMint =
    cluster === "localnet" ? LOCALNET_TUSDC_MINT : DEVNET_TUSDC_MINT;
  const usdcBalance = useTokenBalance(
    address ? solanaAddress(address) : undefined,
    solanaAddress(usdcMint)
  );
  const {
    isAuthenticated,
    isLoading: isAuthLoading,
    error: authError,
    signIn,
    signOut,
  } = useAuth();
  const [selectedListing, setSelectedListing] =
    useState<MarketplaceListing | null>(null);
  const [createdGoalPda, setCreatedGoalPda] = useState("");

  const handleAirdrop = async () => {
    if (!address) return;
    try {
      const response = await fetch(
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
      const data = await response.json();
      if (data.error) throw new Error(data.error.message);
      toast.success("Airdropped 1 SOL!");
      balance.mutate();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Airdrop failed");
    }
  };

  const handleSignIn = async () => {
    try {
      await signIn();
      toast.success("Successfully authenticated!");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Sign-in failed");
    }
  };

  const solDisplay =
    balance.lamports != null ? lamportsToSolString(balance.lamports) : "—";
  const usdcDisplay =
    usdcBalance.amount != null ? microUsdcToString(usdcBalance.amount) : "0.00";

  return (
    <div className="site-shell relative min-h-screen w-full overflow-hidden bg-background font-sans antialiased text-foreground">
      <div className="ambient-light ambient-light-one" aria-hidden="true" />
      <div className="ambient-light ambient-light-two" aria-hidden="true" />
      <div className="noise-layer" aria-hidden="true" />
      <ParticleField />

      <nav className="fixed inset-x-0 top-0 z-50 px-4 pt-4 sm:px-7 sm:pt-6">
        <div className="nav-glass mx-auto flex h-14 max-w-7xl items-center justify-between rounded-2xl px-4 sm:h-16 sm:px-6">
          <a
            href="#top"
            className="flex items-center gap-2.5"
            aria-label="RiveSeek home"
          >
            <span className="brand-mark" aria-hidden="true">
              <span />
            </span>
            <span className="hidden text-sm font-semibold tracking-[0.22em] text-foreground min-[360px]:inline">
              RIVESEEK
            </span>
          </a>

          <div className="hidden items-center gap-8 text-xs font-medium text-muted md:flex">
            <a className="nav-link" href="#how-it-works">
              How it works
            </a>
            <a className="nav-link" href="#start">
              Start saving
            </a>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <WalletButton />
          </div>
        </div>
      </nav>

      <main id="top" className="relative z-10">
        <section className="hero-section mx-auto flex min-h-[100svh] max-w-7xl flex-col justify-center px-5 pb-14 pt-28 sm:px-8 sm:pt-32 lg:px-12">
          <div className="mb-7 flex items-center gap-3 sm:mb-8">
            <span className="live-dot" />
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted sm:text-xs">
              Goal-based saving, secured on Solana
            </p>
          </div>

          <h1
            className="hero-copy"
            aria-label="Seek it. Save smarter. Own what once felt beyond reach."
          >
            <span className="hero-kicker">Seek it. Save smarter.</span>
            <span className="hero-own" aria-hidden="true">
              OWN
            </span>
            <span className="hero-tail">what once felt beyond reach.</span>
          </h1>

          <div className="mt-8 flex flex-col gap-8 sm:mt-10 lg:flex-row lg:items-end lg:justify-between">
            <p className="max-w-md text-base leading-7 text-muted sm:text-lg">
              Turn the thing you want into a transparent savings goal. Find the
              exact listing, fund at your pace, and watch it get closer.
            </p>

            <div className="flex flex-col gap-3 min-[390px]:flex-row">
              <a href="#start" className="hero-cta group">
                Start a goal
                <svg
                  className="h-4 w-4 transition-transform group-hover:translate-x-1"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path
                    d="M5 12h14M13 6l6 6-6 6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </a>
              <a href="#how-it-works" className="hero-cta-secondary">
                See how it works
              </a>
            </div>
          </div>

          <div
            id="how-it-works"
            className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:mt-16 sm:grid-cols-3"
          >
            {BENEFITS.map(([number, title, description]) => (
              <div
                key={number}
                className="benefit-card bg-card/80 p-5 backdrop-blur-md sm:p-6"
              >
                <div className="mb-6 flex items-center justify-between">
                  <span className="font-mono text-[10px] tracking-[0.2em] text-accent-blue">
                    {number}
                  </span>
                  <span className="h-px w-8 bg-border" />
                </div>
                <h2 className="text-base font-semibold text-foreground">
                  {title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section
          id="start"
          className="relative mx-auto max-w-5xl scroll-mt-24 px-4 pb-24 pt-12 sm:px-8 sm:pb-32 sm:pt-20"
        >
          <div className="mb-10 text-center sm:mb-14">
            <p className="section-label text-accent-blue">Your next goal</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] sm:text-5xl">
              Make wanting it actionable.
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-sm leading-6 text-muted sm:text-base">
              Connect your wallet, choose the exact item, and create a savings
              path that stays yours.
            </p>
          </div>

          <div className="app-frame overflow-visible rounded-[1.5rem] p-4 sm:rounded-[2rem] sm:p-6 lg:p-8">
            <header className="mb-12 border-b border-border pb-6">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold tracking-[0.16em]">
                    RIVESEEK / GOALS
                  </p>
                  <p className="mt-1.5 text-xs text-muted">
                    Find it. Match it. Save for it.
                  </p>
                </div>

                <div className="flex flex-col items-start gap-3 sm:items-end">
                  <div className="flex flex-wrap items-center gap-2">
                    <ClusterSelect />
                    <WalletButton />
                  </div>

                  {status === "connected" && address && (
                    <div className="flex items-end gap-5 text-left sm:text-right">
                      <p className="hidden font-mono text-[10px] text-muted md:block">
                        {ellipsify(address, 4)}
                      </p>
                      <p className="font-mono text-xs font-semibold tabular-nums">
                        {solDisplay}{" "}
                        <span className="font-sans text-[9px] font-normal text-muted">
                          SOL
                        </span>
                      </p>
                      <p className="font-mono text-xs font-semibold tabular-nums">
                        {usdcDisplay}{" "}
                        <span className="font-sans text-[9px] font-normal text-muted">
                          USDC
                        </span>
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
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
                      <span className="text-muted">
                        Wallet connected · not signed in
                      </span>
                    </>
                  )}
                  {authError && (
                    <span className="text-destructive">{authError}</span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {cluster !== "mainnet" && status === "connected" && (
                    <button onClick={handleAirdrop} className="mini-action">
                      Airdrop SOL
                    </button>
                  )}
                  {status === "connected" &&
                    (isAuthenticated ? (
                      <button
                        onClick={() => void signOut()}
                        disabled={isAuthLoading}
                        className="mini-action disabled:opacity-50"
                      >
                        Sign Out
                      </button>
                    ) : (
                      <button
                        onClick={handleSignIn}
                        disabled={isAuthLoading}
                        className="mini-action mini-action-primary disabled:opacity-50"
                      >
                        {isAuthLoading
                          ? "Signing in..."
                          : "Sign In with Solana"}
                      </button>
                    ))}
                </div>
              </div>
            </header>

            <div className="mx-auto max-w-2xl space-y-16 pb-5">
              <TargetSection
                selectedListing={selectedListing}
                onClearTarget={() => setSelectedListing(null)}
              />
              <MarketplaceSearch
                selectedListing={selectedListing}
                onSelectListing={setSelectedListing}
              />
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
            </div>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-border px-5 py-8 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 RiveSeek. Built for deliberate ownership.</p>
          <p className="font-mono uppercase tracking-[0.16em]">
            Dev: SulavGairhe
          </p>
        </div>
      </footer>
    </div>
  );
}
