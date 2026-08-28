import dotenv from "dotenv";
import { DEMO_TARGET } from "../app/lib/catalog/demo-target";
import { searchListings, getListing } from "../app/lib/marketplace/ebay/adapter";

dotenv.config({ path: ".env.local" });

async function runVerification() {
  console.log("==========================================");
  console.log("Testing Thin eBay Adapter (Phase 3.0.5 + 3.1)");
  console.log("==========================================");
  console.log(`Demo Target Query: "${DEMO_TARGET.searchQuery}"\n`);

  try {
    const results = await searchListings(DEMO_TARGET.searchQuery, 10);
    console.log(`searchListings() returned ${results.length} normalized listing(s)\n`);

    if (results.length === 0) {
      console.log("Result: NO_RESULTS (Target environment returned 0 listings)");
      return;
    }

    console.log("--- First 5 Returned Listings ---");
    results.slice(0, 5).forEach((item, i) => {
      console.log(`[${i + 1}] externalId: ${item.externalId}`);
      console.log(`    title:      ${item.title}`);
      console.log(`    price:      ${item.price.value} ${item.price.currency}`);
      if (item.shipping) {
        console.log(`    shipping:   ${item.shipping.value} ${item.shipping.currency}`);
      }
      console.log(`    url:        ${item.url}`);
      if (item.seller?.username) {
        console.log(`    seller:     ${item.seller.username} (${item.seller.feedbackPercentage ?? "N/A"}%)`);
      }
      console.log("");
    });

    const firstId = results[0].externalId;
    console.log(`\nTesting getListing("${firstId}")...`);
    const singleListing = await getListing(firstId);

    if (singleListing) {
      console.log("getListing(): SUCCESS");
      console.log(`  externalId: ${singleListing.externalId}`);
      console.log(`  title:      ${singleListing.title}`);
      console.log(`  price:      ${singleListing.price.value} ${singleListing.price.currency}`);
      console.log(`  url:        ${singleListing.url}`);
    } else {
      console.log("getListing(): Returned null (Item not found or unavailable)");
    }

    console.log("\n✅ Adapter Verification: SUCCESS");
  } catch (err: any) {
    console.error("\n❌ Adapter Verification: FAILED");
    console.error("Error details:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

runVerification();
