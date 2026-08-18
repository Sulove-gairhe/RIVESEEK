import { matchListing } from "../app/lib/matching/match";
import type { MatchStatus } from "../app/lib/matching/types";

type TestFixture = {
  title: string;
  expectedStatus: MatchStatus;
  description: string;
};

const FIXTURES: TestFixture[] = [
  {
    title: "2021 POKEMON CELEBRATIONS CLASSIC COLLECTION #4 CHARIZARD-HOLO PSA 9",
    expectedStatus: "EXACT",
    description: "Standard PSA 9 Celebrations Charizard with #4 alias",
  },
  {
    title: "PSA 9 Pokemon Celebrations Classic Collection Holo Charizard 4/102 MINT!",
    expectedStatus: "EXACT",
    description: "PSA 9 Celebrations Charizard with explicit 4/102",
  },
  {
    title: "Charizard 4/102 Celebrations: Classic Collection Holo PSA 9",
    expectedStatus: "EXACT",
    description: "Clean PSA 9 Celebrations Charizard 4/102",
  },
  {
    title: "2021 POKEMON CELEBRATIONS CLASSIC COLL #4 CHARIZARD-HOLO PSA MINT 9",
    expectedStatus: "EXACT",
    description: "PSA MINT 9 Celebrations Charizard with #4 alias",
  },
  {
    title: "Charizard 4/102 Celebrations: Classic Collection Holo EN 2021 PSA 9",
    expectedStatus: "EXACT",
    description: "PSA 9 Celebrations Charizard 4/102 English",
  },
  {
    title: "Charizard 4/102 Holo Rare Celebrations Collection",
    expectedStatus: "NEEDS_REVIEW",
    description: "Raw/ungraded listing (missing grader and grade)",
  },
  {
    title: "Charizard 4/102 Celebrations: Classic Collection Holo",
    expectedStatus: "NEEDS_REVIEW",
    description: "Raw/ungraded listing (missing grader and grade)",
  },
  {
    title: "CHARIZARD CELEBRATIONS HOLO PSA 9",
    expectedStatus: "NEEDS_REVIEW",
    description: "Missing card number field",
  },
  {
    title: "2021 POKEMON CELEBRATIONS CLASSIC COLLECTION #4 CHARIZARD-HOLO PSA 8",
    expectedStatus: "REJECTED",
    description: "Wrong grade (PSA 8 vs target PSA 9)",
  },
  {
    title: "2021 POKEMON CELEBRATIONS CLASSIC COLLECTION #4 CHARIZARD-HOLO PSA 10",
    expectedStatus: "REJECTED",
    description: "Wrong grade (PSA 10 vs target PSA 9)",
  },
  {
    title: "2021 POKEMON CELEBRATIONS CLASSIC COLLECTION #4 CHARIZARD-HOLO CGC 9",
    expectedStatus: "REJECTED",
    description: "Wrong grader (CGC 9 vs target PSA 9)",
  },
  {
    title: "1999 Pokemon Base Set #4 Charizard Holo PSA 9",
    expectedStatus: "REJECTED",
    description: "Wrong set (Base Set vs target Celebrations)",
  },
  {
    title: "2021 Pokemon Celebrations Classic Collection #15 Blastoise Holo PSA 9",
    expectedStatus: "REJECTED",
    description: "Wrong product name (Blastoise vs target Charizard)",
  },
  {
    title: "2021 Pokemon Celebrations Classic Collection #4 Charizard Holo 15/102 PSA 9",
    expectedStatus: "REJECTED",
    description: "Wrong card number (15/102 vs target 4/102)",
  },
];

async function runMatcherTests() {
  console.log("==========================================");
  console.log("Running Minimal Matcher Regression Tests (Phase 3.2 + 3.3)");
  console.log("==========================================\n");

  let passed = 0;
  let failed = 0;

  FIXTURES.forEach((fixture, index) => {
    const result = matchListing(fixture.title);
    const success = result.status === fixture.expectedStatus;

    if (success) {
      passed++;
      console.log(`[PASS] Test #${index + 1}: ${fixture.description}`);
      console.log(`       Title:    "${fixture.title}"`);
      console.log(`       Status:   ${result.status}`);
      console.log(`       Parsed:   ${JSON.stringify(result.parsedListing)}`);
      console.log(`       Reasons:  ${result.reasons.join("; ")}\n`);
    } else {
      failed++;
      console.error(`[FAIL] Test #${index + 1}: ${fixture.description}`);
      console.error(`       Title:    "${fixture.title}"`);
      console.error(`       Expected: ${fixture.expectedStatus}`);
      console.error(`       Actual:   ${result.status}`);
      console.error(`       Parsed:   ${JSON.stringify(result.parsedListing)}`);
      console.error(`       Reasons:  ${result.reasons.join("; ")}\n`);
    }
  });

  console.log(`Summary: ${passed}/${FIXTURES.length} tests passed.`);

  if (failed > 0) {
    process.exit(1);
  }
}

runMatcherTests();
