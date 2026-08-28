import { normalizeTitle } from "./normalize";
import type { ParsedListing } from "./types";

export function extractListingFields(rawTitle: string): ParsedListing {
  const norm = normalizeTitle(rawTitle);
  const result: ParsedListing = {};

  // 1. Pokémon Name Extraction
  if (/\bcharizard\b/i.test(norm)) {
    result.name = "Charizard";
  } else if (/\bblastoise\b/i.test(norm)) {
    result.name = "Blastoise";
  } else if (/\bvenusaur\b/i.test(norm)) {
    result.name = "Venusaur";
  } else if (/\bpikachu\b/i.test(norm)) {
    result.name = "Pikachu";
  }

  // 2. Set Extraction
  if (norm.includes("celebrations") || norm.includes("25th")) {
    result.set = "Celebrations";
  } else if (norm.includes("base set")) {
    result.set = "Base Set";
  }

  // 3. Card Number Extraction
  // First priority: Explicit fraction card numbers like 4/102, 15/102
  const numMatch = norm.match(/\b\d+\/\d+\b/);
  if (numMatch) {
    result.cardNumber = numMatch[0];
  } else if (/(?:^|\s)#4\b/i.test(norm) && result.set === "Celebrations" && result.name === "Charizard") {
    // Second priority: Alias #4 in Celebrations Charizard context => 4/102
    result.cardNumber = "4/102";
  }

  // 4. Grader and Grade Extraction
  const graderRegex = /\b(psa|cgc|bgs|sgc|ace|beckett)\b/i;
  const graderMatch = norm.match(graderRegex);

  if (graderMatch) {
    let rawGrader = graderMatch[1].toUpperCase();
    if (rawGrader === "BECKETT") rawGrader = "BGS";
    result.grader = rawGrader;

    const afterGrader = norm.slice(norm.indexOf(graderMatch[0]) + graderMatch[0].length);
    const gradeMatch = afterGrader.match(/^(?:\s+(?:mint|gem|mt|pristine|nm|coll))*\s*(\d+(?:\.\d+)?)/i);
    if (gradeMatch) {
      result.grade = parseFloat(gradeMatch[1]);
    }
  } else {
    const concatMatch = norm.match(/\b(psa|cgc|bgs|sgc)(\d+(?:\.\d+)?)\b/i);
    if (concatMatch) {
      let rawGrader = concatMatch[1].toUpperCase();
      result.grader = rawGrader;
      result.grade = parseFloat(concatMatch[2]);
    }
  }

  return result;
}
