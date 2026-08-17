import { NextResponse } from "next/server";
import { searchListings } from "../../../lib/marketplace/ebay/adapter";
import { matchListing } from "../../../lib/matching/match";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q") || "Charizard Celebrations 4/102";

    // 1. Search real production eBay
    const listings = await searchListings(query, 20);

    // 2. Run each listing title through the existing parser/matcher
    const results = listings.map((listing) => {
      const match = matchListing(listing.title);
      return {
        listing,
        match,
      };
    });

    return NextResponse.json({ results });
  } catch (error: any) {
    console.error("Marketplace search route error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Search failed" },
      { status: 500 }
    );
  }
}
