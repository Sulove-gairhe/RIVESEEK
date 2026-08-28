import { ebayFetch } from "./client";
import type { MarketplaceListing } from "../types";

function normalizeEbayItem(item: any): MarketplaceListing {
  const shippingCost = item.shippingOptions?.[0]?.shippingCost;

  return {
    externalId: item.itemId ?? "",
    marketplace: "ebay",
    title: item.title ?? "",
    price: {
      value: item.price?.value ?? "0",
      currency: item.price?.currency ?? "USD",
    },
    shipping:
      shippingCost?.value != null
        ? {
            value: String(shippingCost.value),
            currency: shippingCost.currency ?? "USD",
          }
        : undefined,
    imageUrl: item.image?.imageUrl ?? item.additionalImages?.[0]?.imageUrl ?? undefined,
    url: item.itemWebUrl ?? item.itemHref ?? "",
    seller: item.seller
      ? {
          username: item.seller.username ?? undefined,
          feedbackPercentage: item.seller.feedbackPercentage ?? undefined,
        }
      : undefined,
  };
}

export async function searchListings(
  query: string,
  limit: number = 10
): Promise<MarketplaceListing[]> {
  const data = await ebayFetch<{ itemSummaries?: any[] }>(
    "/buy/browse/v1/item_summary/search",
    {
      q: query,
      limit: String(limit),
    }
  );

  const rawItems = data.itemSummaries || [];
  return rawItems.map(normalizeEbayItem);
}

export async function getListing(id: string): Promise<MarketplaceListing | null> {
  try {
    const item = await ebayFetch<any>(
      `/buy/browse/v1/item/${encodeURIComponent(id)}`
    );
    if (!item || !item.itemId) return null;
    return normalizeEbayItem(item);
  } catch (err: any) {
    if (typeof err?.message === "string" && err.message.includes("HTTP 404")) {
      return null;
    }
    throw err;
  }
}
