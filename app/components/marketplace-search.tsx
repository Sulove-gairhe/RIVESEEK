"use client";

import { useState, useEffect } from "react";
import { DEMO_TARGET } from "../lib/catalog/demo-target";
import { MarketplaceListing } from "../lib/marketplace/types";
import { MatchResult } from "../lib/matching/types";

interface SearchResultItem {
  listing: MarketplaceListing;
  match: MatchResult;
}

interface MarketplaceSearchProps {
  selectedListing: MarketplaceListing | null;
  onSelectListing: (listing: MarketplaceListing | null) => void;
}

export function MarketplaceSearch({ selectedListing, onSelectListing }: MarketplaceSearchProps) {
  const [query, setQuery] = useState("Charizard Celebrations 4/102");
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchResults = async (searchQuery: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/marketplace/search?q=${encodeURIComponent(searchQuery)}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to search listings");
      }
      const data = await res.json();
      setResults(data.results || []);
    } catch (err: any) {
      console.error(err);
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchResults(query);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchResults(query);
  };

  return (
    <section className="relative w-full overflow-hidden rounded-2xl border border-border-low bg-card p-5 shadow-xs space-y-6">
      {/* Demo Target Specs */}
      <div className="rounded-xl border border-border-low bg-background/40 p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">Demo Collection Target</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div>
            <span className="text-muted">Card Name:</span>{" "}
            <span className="font-semibold text-foreground">{DEMO_TARGET.canonical.name}</span>
          </div>
          <div>
            <span className="text-muted">Set:</span>{" "}
            <span className="font-semibold text-foreground">{DEMO_TARGET.canonical.set}</span>
          </div>
          <div>
            <span className="text-muted">Card #:</span>{" "}
            <span className="font-semibold text-foreground">{DEMO_TARGET.canonical.cardNumber}</span>
          </div>
          <div>
            <span className="text-muted">Year:</span>{" "}
            <span className="font-semibold text-foreground">{DEMO_TARGET.canonical.year}</span>
          </div>
          <div>
            <span className="text-muted">Language:</span>{" "}
            <span className="font-semibold text-foreground">{DEMO_TARGET.variant.language}</span>
          </div>
          <div>
            <span className="text-muted">Finish:</span>{" "}
            <span className="font-semibold text-foreground">{DEMO_TARGET.variant.finish}</span>
          </div>
          <div>
            <span className="text-muted">Grader:</span>{" "}
            <span className="font-semibold text-foreground">{DEMO_TARGET.variant.grader}</span>
          </div>
          <div>
            <span className="text-muted">Grade:</span>{" "}
            <span className="font-semibold text-foreground">{DEMO_TARGET.variant.grade}</span>
          </div>
        </div>
      </div>

      {/* Search Input Form */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search eBay listings..."
          className="w-full rounded-lg border border-border-low bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
        />
        <button
          type="submit"
          disabled={isLoading}
          className="cursor-pointer rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground shadow-xs transition hover:bg-primary/90 disabled:opacity-50"
        >
          {isLoading ? "Searching..." : "Search"}
        </button>
      </form>

      {/* Results Container */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium">eBay Marketplace Results</h4>

        {isLoading && (
          <div className="py-8 text-center text-xs text-muted">Loading eBay listings...</div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </div>
        )}

        {!isLoading && !error && results.length === 0 && (
          <div className="py-8 text-center text-xs text-muted">No listings found.</div>
        )}

        {!isLoading && !error && results.length > 0 && (
          <div className="grid grid-cols-1 gap-4">
            {results.map((item) => {
              const { listing, match } = item;
              const isSelected = selectedListing?.externalId === listing.externalId;

              let statusBadgeClass = "";
              let statusLabel = "";
              if (match.status === "EXACT") {
                statusBadgeClass = "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20";
                statusLabel = "EXACT ✅";
              } else if (match.status === "NEEDS_REVIEW") {
                statusBadgeClass = "bg-amber-500/10 text-amber-500 border border-amber-500/20";
                statusLabel = "NEEDS REVIEW ⚠️";
              } else {
                statusBadgeClass = "bg-rose-500/10 text-rose-500 border border-rose-500/20";
                statusLabel = "REJECTED ❌";
              }

              return (
                <div
                  key={listing.externalId}
                  className={`flex flex-col sm:flex-row gap-4 p-4 rounded-xl border transition ${
                    isSelected ? "border-primary bg-primary/5" : "border-border-low bg-background/20"
                  }`}
                >
                  {/* Thumbnail */}
                  {listing.imageUrl && (
                    <div className="w-full sm:w-24 h-24 flex-shrink-0 rounded-lg overflow-hidden border border-border-low bg-background flex items-center justify-center">
                      <img
                        src={listing.imageUrl}
                        alt={listing.title}
                        className="w-full h-full object-contain"
                      />
                    </div>
                  )}

                  {/* Listing Details */}
                  <div className="flex-1 space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                      <h5 className="text-xs font-semibold text-foreground leading-snug line-clamp-2">
                        {listing.title}
                      </h5>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap self-start ${statusBadgeClass}`}>
                        {statusLabel}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
                      <div>
                        Price:{" "}
                        <span className="font-semibold text-foreground">
                          ${parseFloat(listing.price.value).toFixed(2)} {listing.price.currency}
                        </span>
                      </div>
                      {listing.shipping && (
                        <div>
                          Shipping:{" "}
                          <span className="font-semibold text-foreground">
                            ${parseFloat(listing.shipping.value).toFixed(2)} {listing.shipping.currency}
                          </span>
                        </div>
                      )}
                      {listing.seller?.username && (
                        <div>
                          Seller:{" "}
                          <span className="text-foreground">
                            {listing.seller.username} ({listing.seller.feedbackPercentage ?? "100"}%)
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Match Explanation */}
                    {match.reasons.length > 0 && (
                      <div className="rounded-md bg-background/40 p-2 text-[10px] font-mono border border-border-low/50">
                        <span className="text-muted block font-semibold mb-0.5">Matcher Reason(s):</span>
                        <ul className="list-disc list-inside space-y-0.5 text-foreground/80">
                          {match.reasons.map((reason, idx) => (
                            <li key={idx}>{reason}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-1">
                      <a
                        href={listing.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="cursor-pointer inline-flex items-center justify-center rounded-lg border border-border-low px-3 py-1.5 text-[10px] font-medium transition hover:bg-cream text-foreground"
                      >
                        View on eBay
                      </a>

                      {match.status === "EXACT" && (
                        <button
                          type="button"
                          onClick={() => onSelectListing(isSelected ? null : listing)}
                          className={`cursor-pointer rounded-lg px-3 py-1.5 text-[10px] font-semibold transition ${
                            isSelected
                              ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 hover:bg-emerald-500/20"
                              : "bg-primary text-primary-foreground hover:bg-primary/90"
                          }`}
                        >
                          {isSelected ? "Target Locked ✓" : "Save for this card"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
