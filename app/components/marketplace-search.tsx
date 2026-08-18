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

function MatchBadge({ status }: { status: MatchResult["status"] }) {
  if (status === "EXACT") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded border border-success/30 bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        EXACT
      </span>
    );
  }
  if (status === "NEEDS_REVIEW") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded border border-warning/30 bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning">
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        NEEDS REVIEW
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive">
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      REJECTED
    </span>
  );
}

function primaryReason(match: MatchResult): string {
  if (match.reasons.length === 0) {
    if (match.status === "EXACT") return "All critical fields match";
    return "";
  }
  return match.reasons[0];
}

export function MarketplaceSearch({ selectedListing, onSelectListing }: MarketplaceSearchProps) {
  const [query, setQuery] = useState(DEMO_TARGET.searchQuery);
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
    } catch (err: unknown) {
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

  const sortedResults = [...results].sort((a, b) => {
    const order = { EXACT: 0, NEEDS_REVIEW: 1, REJECTED: 2 };
    return order[a.match.status] - order[b.match.status];
  });

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="section-label">Live on eBay</h2>
        <form onSubmit={handleSearch} className="flex w-full max-w-md gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search eBay listings..."
            className="input-field text-xs"
          />
          <button type="submit" disabled={isLoading} className="btn-primary shrink-0 px-4 py-2 text-xs">
            {isLoading ? "..." : "Search"}
          </button>
        </form>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="panel overflow-hidden">
              <div className="h-48 animate-pulse bg-muted/30" />
              <div className="space-y-3 p-4">
                <div className="h-5 w-20 animate-pulse rounded bg-muted/30" />
                <div className="space-y-2">
                  <div className="h-4 w-full animate-pulse rounded bg-muted/30" />
                  <div className="h-4 w-3/4 animate-pulse rounded bg-muted/30" />
                </div>
                <div className="h-6 w-24 animate-pulse rounded bg-muted/30" />
                <div className="h-3 w-32 animate-pulse rounded bg-muted/30" />
                <div className="space-y-2 pt-3">
                  <div className="h-9 w-full animate-pulse rounded bg-muted/30" />
                  <div className="h-9 w-full animate-pulse rounded bg-muted/30" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {!isLoading && !error && results.length === 0 && (
        <div className="panel py-12 text-center text-sm text-muted">No listings found.</div>
      )}

      {!isLoading && !error && sortedResults.length > 0 && (
        <>
          <div className="text-xs text-muted">
            {sortedResults.length} {sortedResults.length === 1 ? "result" : "results"}
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sortedResults.map((item) => {
              const { listing, match } = item;
              const isSelected = selectedListing?.externalId === listing.externalId;
              const isExact = match.status === "EXACT";
              const isRejected = match.status === "REJECTED";

              return (
                <article
                  key={listing.externalId}
                  className={`panel flex flex-col overflow-hidden transition hover:border-border/80 ${
                    isExact
                      ? isSelected
                        ? "border-primary/50 ring-1 ring-primary/20"
                        : "border-border"
                      : isRejected
                        ? "border-border opacity-75"
                        : "border-border"
                  }`}
                >
                  {/* Image Section */}
                  <div className="flex h-48 items-center justify-center overflow-hidden border-b border-border bg-muted/20">
                    {listing.imageUrl ? (
                      <img
                        src={listing.imageUrl}
                        alt={listing.title}
                        className="h-full w-full object-contain p-3"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-muted">
                        No image
                      </div>
                    )}
                  </div>

                  {/* Content Section */}
                  <div className="flex flex-1 flex-col gap-3 p-4">
                    {/* Match Badge */}
                    <div>
                      <MatchBadge status={match.status} />
                    </div>

                    {/* Title - Limited to 3 lines */}
                    <h3
                      className="text-sm font-medium leading-snug text-foreground line-clamp-3"
                      title={listing.title}
                    >
                      {listing.title}
                    </h3>

                    {/* Price */}
                    <div className="space-y-0.5">
                      <div className="text-xl font-bold tabular-nums text-foreground">
                        ${parseFloat(listing.price.value).toFixed(2)}
                      </div>
                      {listing.shipping && listing.shipping.value !== "0" && listing.shipping.value !== "0.00" && (
                        <div className="text-xs text-muted">
                          + ${listing.shipping.value} shipping
                        </div>
                      )}
                    </div>

                    {/* Seller Info */}
                    {listing.seller?.username && (
                      <div className="text-xs text-muted">
                        Seller: {listing.seller.username}
                        {listing.seller.feedbackPercentage != null &&
                          ` • ${listing.seller.feedbackPercentage}% positive`}
                      </div>
                    )}

                    {/* Match Reason */}
                    {primaryReason(match) && (
                      <p className="text-xs text-muted line-clamp-2">{primaryReason(match)}</p>
                    )}

                    {/* Actions - Pushed to bottom */}
                    <div className="mt-auto flex flex-col gap-2 pt-3">
                      <a
                        href={listing.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-secondary w-full px-3 py-2 text-center text-xs"
                      >
                        View on eBay
                      </a>

                      {isExact && (
                        <button
                          type="button"
                          onClick={() => onSelectListing(isSelected ? null : listing)}
                          className={`w-full cursor-pointer rounded-md px-3 py-2 text-xs font-semibold transition ${
                            isSelected
                              ? "border border-success/30 bg-success/10 text-success"
                              : "btn-primary"
                          }`}
                        >
                          {isSelected ? "✓ Tracking" : "Add to Savings"}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
