/**
 * Forgiving text search used by every search box.
 *
 * The query is split into words and a record matches when EVERY word is found
 * somewhere in the combined text of the fields -- so "juan santos", "santos juan",
 * "juan " (trailing space) and "  juan   san" all find "Juan Santos", instead of
 * the search going blank as soon as a space is typed.
 */
export function normalizeSearch(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function searchTokens(query: string): string[] {
  const q = normalizeSearch(query);
  return q ? q.split(" ") : [];
}

export function matchesSearch(query: string, ...fields: unknown[]): boolean {
  const tokens = searchTokens(query);
  if (tokens.length === 0) return true;
  const haystack = normalizeSearch(
    fields
      .map((f) => (Array.isArray(f) ? f.join(" ") : f ?? ""))
      .join(" ")
  );
  return tokens.every((tok) => haystack.includes(tok));
}
