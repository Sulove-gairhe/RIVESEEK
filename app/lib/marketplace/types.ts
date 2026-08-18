export type MarketplaceListing = {
  externalId: string;
  marketplace: "ebay";
  title: string;
  price: {
    value: string;
    currency: string;
  };
  shipping?: {
    value: string;
    currency: string;
  };
  imageUrl?: string;
  url: string;
  seller?: {
    username?: string;
    feedbackPercentage?: string;
  };
};
