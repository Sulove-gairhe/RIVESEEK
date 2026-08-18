import { DEMO_TARGET } from "../catalog/demo-target";
import { extractListingFields } from "./extract";
import type { MatchResult } from "./types";

export function matchListing(rawTitle: string): MatchResult {
  const parsed = extractListingFields(rawTitle);
  const reasons: string[] = [];

  const targetName = DEMO_TARGET.canonical.name;
  const targetSet = DEMO_TARGET.canonical.set;
  const targetCardNumber = DEMO_TARGET.canonical.cardNumber;
  const targetGrader = DEMO_TARGET.variant.grader;
  const targetGrade = DEMO_TARGET.variant.grade;

  // A. HARD CONTRADICTIONS => REJECTED
  if (parsed.name && parsed.name.toLowerCase() !== targetName.toLowerCase()) {
    reasons.push(`Contradiction: Listing product '${parsed.name}' does not match target '${targetName}'`);
  }

  if (parsed.set && parsed.set.toLowerCase() !== targetSet.toLowerCase()) {
    reasons.push(`Contradiction: Listing set '${parsed.set}' does not match target '${targetSet}'`);
  }

  if (parsed.cardNumber && parsed.cardNumber !== targetCardNumber) {
    reasons.push(`Contradiction: Listing card number '${parsed.cardNumber}' does not match target '${targetCardNumber}'`);
  }

  if (parsed.grader && parsed.grader.toUpperCase() !== targetGrader.toUpperCase()) {
    reasons.push(`Contradiction: Listing grader '${parsed.grader}' does not match target '${targetGrader}'`);
  }

  if (parsed.grade !== undefined && parsed.grade !== targetGrade) {
    reasons.push(`Contradiction: Listing grade ${parsed.grade} does not match target ${targetGrade}`);
  }

  if (reasons.length > 0) {
    return {
      status: "REJECTED",
      parsedListing: parsed,
      reasons,
    };
  }

  // B. MISSING CRITICAL FIELDS => NEEDS_REVIEW
  const missing: string[] = [];
  if (!parsed.name) missing.push("name");
  if (!parsed.set) missing.push("set");
  if (!parsed.cardNumber) missing.push("cardNumber");
  if (!parsed.grader) missing.push("grader");
  if (parsed.grade === undefined) missing.push("grade");

  if (missing.length > 0) {
    return {
      status: "NEEDS_REVIEW",
      parsedListing: parsed,
      reasons: [`Missing critical field(s): ${missing.join(", ")}`],
    };
  }

  // C. ALL CRITICAL FIELDS CONFIRMED => EXACT
  return {
    status: "EXACT",
    parsedListing: parsed,
    reasons: ["All 5 critical fields match demo target"],
  };
}
