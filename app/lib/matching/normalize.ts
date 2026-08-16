export function normalizeTitle(title: string): string {
  if (!title) return "";

  let normalized = title.toLowerCase();

  // Replace punctuation (except # and /) with whitespace
  normalized = normalized.replace(/[^\w\s#/]/g, " ");

  // Collapse multiple spaces into one
  normalized = normalized.replace(/\s+/g, " ").trim();

  return normalized;
}
