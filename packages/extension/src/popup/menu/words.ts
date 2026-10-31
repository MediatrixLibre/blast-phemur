/**
 * Level-three data for the menu: the individual words behind each language type.
 * Pure (no React) so it can be tested. Words are real spellings; the menu always
 * shows them through maskForDisplay.
 */
import { WORDLISTS } from '../../lexicon/wordlists.generated.js';

import { ALLOW_ENDING } from '../../lexicon/profanity.js';

/** Types whose words are never listed in the menu (counts only) */
export const UNLISTED = ['language.slur', 'language.sexual_reference'];

/**
 * A word the viewer can let through. Allowing it lifts the word and its
 * endings only (ALLOW_ENDING), so every listed word can take a switch: no
 * longer word built on it ("ass" in "asshole") is lifted with it.
 */
export interface WordRow {
  word: string;
  type: string;
}

/** Root words only: "fucked" and "fucking" are covered by "fuck" */
function roots(list: string[]): string[] {
  return list.filter((w) => !list.some((r) => r !== w && w.startsWith(r) && ALLOW_ENDING.test(w.slice(r.length))));
}

export function listedWords(): WordRow[] {
  return Object.entries(WORDLISTS)
    .flatMap(([type, ws]) => roots(ws).map((word) => ({ word, type })))
    .filter((w) => !UNLISTED.includes(w.type))
    .sort((a, b) => a.word.localeCompare(b.word));
}

export function unlistedCount(type: string): number {
  return roots(WORDLISTS[type] ?? []).length;
}

/** Filter by what the user types (matched on the real word; the row still shows it masked) */
export function filterWords(rows: WordRow[], q: string): WordRow[] {
  const t = q.trim().toLowerCase();
  return t ? rows.filter((r) => r.word.includes(t)) : rows;
}
