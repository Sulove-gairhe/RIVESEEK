export type ParsedListing = {
  name?: string;
  set?: string;
  cardNumber?: string;
  grader?: string;
  grade?: number;
};

export type MatchStatus = "EXACT" | "REJECTED" | "NEEDS_REVIEW";

export type MatchResult = {
  status: MatchStatus;
  parsedListing: ParsedListing;
  reasons: string[];
};
