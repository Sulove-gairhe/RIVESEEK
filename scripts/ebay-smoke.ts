import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const clientId = process.env.EBAY_CLIENT_ID;
const clientSecret = process.env.EBAY_CLIENT_SECRET;
const marketplaceId = process.env.EBAY_MARKETPLACE_ID || "EBAY_US";
const env = process.env.EBAY_ENV || "production";
const apiBase = env === "sandbox" ? "https://api.sandbox.ebay.com" : "https://api.ebay.com";

if (!clientId || !clientSecret) {
  console.error("Result: AUTH_FAILED");
  console.error("Missing required environment variables: EBAY_CLIENT_ID and/or EBAY_CLIENT_SECRET in .env.local");
  console.error("Please add production EBAY_CLIENT_ID and EBAY_CLIENT_SECRET to .env.local");
  process.exit(1);
}

async function runSmokeTest() {
  console.log("==========================================");
  console.log(`eBay API Smoke Test (${env.toUpperCase()})`);
  console.log("==========================================");

  if (env === "production" && (clientId?.includes("-SBX-") || clientSecret?.startsWith("SBX-"))) {
    console.warn("⚠️ WARNING: Sandbox credentials (-SBX-) detected in .env.local while targeting Production api.ebay.com.");
    console.warn("Production eBay endpoints will reject Sandbox keys with 401 invalid_client.");
    console.warn("To test production, provide Production (PRD) keys in .env.local.");
    console.warn("To test sandbox, set EBAY_ENV=sandbox in .env.local.\n");
  }

  // Step A: OAuth Token Request
  let tokenData: { access_token: string; token_type: string; expires_in: number };
  const authHeader = "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  try {
    const oauthRes = await fetch(`${apiBase}/identity/v1/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: authHeader,
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        scope: "https://api.ebay.com/oauth/api_scope",
      }).toString(),
    });

    if (!oauthRes.ok) {
      const errText = await oauthRes.text();
      let parsedErr: unknown;
      try {
        parsedErr = JSON.parse(errText);
      } catch {
        parsedErr = errText;
      }
      console.error("\nResult: AUTH_FAILED");
      console.error(`HTTP Status: ${oauthRes.status}`);
      console.error("Error details:", JSON.stringify(parsedErr, null, 2));
      process.exit(1);
    }

    tokenData = await oauthRes.json();

    if (!tokenData.access_token) {
      console.error("\nResult: AUTH_FAILED");
      console.error("No access_token field returned in response.");
      process.exit(1);
    }

    console.log("\nOAuth: OK");
    console.log(`Token type: ${tokenData.token_type || "Application Access Token"}`);
    console.log(`Expires in: ${tokenData.expires_in} seconds`);
  } catch (err) {
    console.error("\nResult: AUTH_FAILED");
    console.error("Network or execution error during OAuth:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // Step B: Browse API Search
  const query = "2021 Pokemon Celebrations Charizard 4/102 PSA 9";
  console.log(`\nQuery:\n${query}`);

  const searchUrl = new URL(`${apiBase}/buy/browse/v1/item_summary/search`);
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("limit", "10");

  try {
    const searchRes = await fetch(searchUrl.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        "X-EBAY-C-MARKETPLACE-ID": marketplaceId,
      },
    });

    if (!searchRes.ok) {
      const errText = await searchRes.text();
      let parsedErr: unknown;
      try {
        parsedErr = JSON.parse(errText);
      } catch {
        parsedErr = errText;
      }
      console.error("\nResult: BROWSE_FAILED");
      console.error("OAuth status prior to Browse call: SUCCESS");
      console.error(`HTTP Status: ${searchRes.status}`);
      console.error("Error details:", JSON.stringify(parsedErr, null, 2));
      process.exit(1);
    }

    const searchData = await searchRes.json();
    const itemSummaries = (searchData.itemSummaries || []) as Record<string, any>[];

    if (itemSummaries.length === 0) {
      console.log("\nResult: NO_RESULTS");
      console.log("Browse API returned 0 item summaries for the query.");
      return;
    }

    console.log(`\nResults:\nReturned ${itemSummaries.length} real listing(s)\n`);

    itemSummaries.forEach((item, idx) => {
      console.log(`--- Listing #${idx + 1} ---`);
      console.log(`itemId: ${item.itemId ?? "N/A"}`);
      console.log(`title: ${item.title ?? "N/A"}`);
      console.log(`price: ${item.price?.value ?? "N/A"} ${item.price?.currency ?? ""}`);
      console.log(`itemWebUrl: ${item.itemWebUrl ?? "N/A"}`);
      if (item.image?.imageUrl) {
        console.log(`imageUrl: ${item.image.imageUrl}`);
      }
      if (item.seller?.username) {
        console.log(`seller: ${item.seller.username}`);
      }
      if (item.seller?.feedbackPercentage) {
        console.log(`sellerFeedbackPercentage: ${item.seller.feedbackPercentage}`);
      }
      if (item.shippingOptions?.[0]?.shippingCost?.value != null) {
        console.log(
          `shippingCost: ${item.shippingOptions[0].shippingCost.value} ${item.shippingOptions[0].shippingCost.currency || ""}`
        );
      }
      console.log("");
    });

    console.log("Result: SUCCESS");
  } catch (err) {
    console.error("\nResult: BROWSE_FAILED");
    console.error("OAuth status prior to Browse call: SUCCESS");
    console.error("Network or execution error during Browse search:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

runSmokeTest();
