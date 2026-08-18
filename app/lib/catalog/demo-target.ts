export type CanonicalProduct = {
  name: string;
  set: string;
  cardNumber: string;
  year: number;
};

export type ProductVariant = {
  language: string;
  finish: string;
  grader: string;
  grade: number;
};

export type DemoTarget = {
  canonical: CanonicalProduct;
  variant: ProductVariant;
  searchQuery: string;
};

export const DEMO_TARGET: DemoTarget = {
  canonical: {
    name: "Charizard",
    set: "Celebrations",
    cardNumber: "4/102",
    year: 2021,
  },
  variant: {
    language: "English",
    finish: "Holo",
    grader: "PSA",
    grade: 9,
  },
  searchQuery: "2021 Pokemon Celebrations Charizard 4/102 PSA 9",
};
