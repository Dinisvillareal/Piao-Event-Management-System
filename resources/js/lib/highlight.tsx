import React from "react";
import { searchTokens } from "./search";

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Highlights every word of the search query inside `text` (case-insensitive),
 * matching the word-by-word behaviour of matchesSearch(). Safe for any input
 * (regex characters are escaped).
 */
export function highlightMatches(text: string | null | undefined, query: string): React.ReactNode {
  const safe = text ?? "";
  const tokens = searchTokens(query);
  if (tokens.length === 0 || !safe) return safe;
  try {
    const re = new RegExp(`(${tokens.sort((a, b) => b.length - a.length).map(escapeRe).join("|")})`, "gi");
    return safe.split(re).map((part, i) =>
      i % 2 === 1 ? (
        <mark key={i} className="bg-yellow-300 rounded-sm px-0.5">{part}</mark>
      ) : (
        part
      )
    );
  } catch {
    return safe;
  }
}
