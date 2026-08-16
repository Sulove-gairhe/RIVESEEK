import dotenv from "dotenv";
import { searchListings } from "../app/lib/marketplace/ebay/adapter";

dotenv.config({ path: ".env.local" });

async function inspectTitles() {
  console.log("==========================================");
  console.log("Fetching Broader eBay Title Sample (20 listings)");
  console.log("Query: 'Charizard Celebrations 4/102'");
  console.log("==========================================\n");

  try {
    const listings = await searchListings("Charizard Celebrations 4/102", 20);
    console.log(`Returned ${listings.length} real listing(s):\n`);

    listings.forEach((item, i) => {
      console.log(`[${i + 1}] ID: ${item.externalId}`);
      console.log(`    Title: ${item.title}`);
      console.log(`    Price: ${item.price.value} ${item.price.currency}\n`);
    });
  } catch (err: any) {
    console.error("Inspection failed:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

inspectTitles();
