"use client";

import { DEMO_TARGET } from "../lib/catalog/demo-target";
import { MarketplaceListing } from "../lib/marketplace/types";

interface TargetSectionProps {
  selectedListing: MarketplaceListing | null;
  onClearTarget?: () => void;
}

export function TargetSection({ selectedListing, onClearTarget }: TargetSectionProps) {
  const { canonical, variant } = DEMO_TARGET;

  const displayName = selectedListing
    ? selectedListing.title.split(/[,\-–]/)[0]?.trim() || selectedListing.title
    : `${canonical.year} Pokémon ${canonical.set} ${canonical.name}`;

  const metadataLine = selectedListing
    ? `$${parseFloat(selectedListing.price.value).toFixed(2)} · ${variant.grader} ${variant.grade}`
    : `${canonical.cardNumber} · ${variant.finish} · ${variant.language} · ${variant.grader} ${variant.grade}`;

  const imageUrl = selectedListing?.imageUrl;

  return (
    <section className="space-y-6">
      <h2 className="section-label text-center">Your Target</h2>

      {selectedListing ? (
        <div className="mx-auto max-w-md space-y-5 text-center">
          {imageUrl && (
            <div className="mx-auto flex h-48 w-48 items-center justify-center overflow-hidden rounded-lg border border-border bg-accent/50 p-3">
              <img
                src={imageUrl}
                alt={selectedListing.title}
                className="max-h-full max-w-full object-contain"
              />
            </div>
          )}

          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-medium text-success">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Target locked
            </div>
            <h3 className="text-lg font-semibold leading-snug text-foreground">{displayName}</h3>
            <p className="text-sm text-muted">{metadataLine}</p>
          </div>

          {onClearTarget && (
            <button
              type="button"
              onClick={onClearTarget}
              className="text-xs text-muted transition hover:text-foreground"
            >
              Clear target
            </button>
          )}
        </div>
      ) : (
        <div className="mx-auto max-w-md space-y-5 text-center">
          <div className="mx-auto flex h-48 w-48 items-center justify-center rounded-lg border border-dashed border-border bg-accent/30">
            <div className="space-y-2 px-4">
              <svg className="mx-auto h-10 w-10 text-muted/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="m21 15-5-5L5 21" />
              </svg>
              <p className="text-xs text-muted">No target selected</p>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-foreground">{displayName}</h3>
            <p className="text-sm text-muted">{metadataLine}</p>
            <p className="text-xs text-muted/80">
              Find an EXACT match below and tap &ldquo;Save for this card&rdquo; to lock your target.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
