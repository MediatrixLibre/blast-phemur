/**
 * Language matcher: profanity, slurs, crude and sexual-reference words,
 * plus the blasphemy patterns, behind one scan call.
 *
 * Used by both the live caption monitor and the subtitle compiler so the
 * two paths can never disagree about what counts as a hit.
 */

import type { UserConfig, CustomWords } from '@guardianstream/types';
import { resolveCategorySetting, CUSTOM_WORD_CATEGORY } from '../engine/category-resolver.js';
import { findBlasphemyMatches } from '../caption/blasphemy-patterns.js';
import { isSacredName } from './sacred.js';
import { STRONG_STEMS, WORDLISTS } from './wordlists.generated.js';

export interface TextMatch {
  text: string;
  /** Character offsets into the scanned text */
  start: number;
  end: number;
  /** Taxonomy category, e.g. "language.profanity" */
  category: string;
  /** 1=mild, 2=moderate, 3=graphic */
  severity: number;
  needsMlReview: boolean;
}

const CATEGORY_SEVERITY: Record<string, number> = {
  'language.crude': 1,
  'language.profanity': 2,
  'language.sexual_reference': 2,
  'language.slur': 3,
};

/**
 * Words of 3 letters or fewer take only a plural suffix, so "ass" never
 * matches inside "assy" and "ho" never matches "hoy". Longer words also
 * take -ed, -ing, -in/-in' (captions drop the g and sometimes the
 * apostrophe: "damnin", "damnin'"), -er, -ers.
 */
const SHORT_SUFFIX = "(?:s|es)?";
const LONG_SUFFIX = "(?:s|es|ed|ing|in'?|ers?)?";
/** The endings an allowed word carries with it (the same set the matcher adds) */
export const ALLOW_ENDING = /^(?:s|es|ed|ing|in'?|ers?)$/;

const MATCHERS: { category: string; regex: RegExp }[] = Object.entries(WORDLISTS).map(
  ([category, words]) => {
    const short = words.filter((w) => w.length <= 3);
    const long = words.filter((w) => w.length > 3);
    const parts: string[] = [];
    if (long.length) parts.push(`(?:${long.map(escape).join('|')})${LONG_SUFFIX}`);
    if (short.length) parts.push(`(?:${short.map(escape).join('|')})${SHORT_SUFFIX}`);
    return { category, regex: new RegExp(`(?<![\\w'])(?:${parts.join('|')})(?![\\w])`, 'gi') };
  },
);

/** The strongest profanity is severity 3, so "Severe" still filters it */
export function severityOf(category: string, word: string): number {
  const w = word.toLowerCase();
  if (category === 'language.profanity' && STRONG_STEMS.some((stem) => w.includes(stem))) return 3;
  return CATEGORY_SEVERITY[category] ?? 2;
}

function cleanWords(list: string[] | undefined): string[] {
  return (list ?? []).map((w) => w.trim().toLowerCase()).filter((w) => w.length > 1);
}

function escape(w: string): string {
  return w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Curly quotes to straight, so a curly apostrophe still matches a straight one */
export function normalizeCaption(text: string): string {
  return text.replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"');
}

/**
 * Scan text for everything the filter knows about.
 * Overlapping hits are collapsed to the most severe one.
 */
export function scanText(
  text: string,
  includeContextDependent = true,
  custom?: CustomWords,
): TextMatch[] {
  const clean = normalizeCaption(text);
  const hits: TextMatch[] = [];

  const block = cleanWords(custom?.block);
  if (block.length) {
    const re = new RegExp(
      `(?<![\\w'])(?:${block.map(escape).join('|')})${LONG_SUFFIX}(?![\\w])`,
      'gi',
    );
    for (const m of clean.matchAll(re)) {
      hits.push({
        text: m[0],
        start: m.index ?? 0,
        end: (m.index ?? 0) + m[0].length,
        category: CUSTOM_WORD_CATEGORY,
        severity: 3,
        needsMlReview: false,
      });
    }
  }

  for (const { category, regex } of MATCHERS) {
    regex.lastIndex = 0;
    for (const m of clean.matchAll(regex)) {
      hits.push({
        text: m[0],
        start: m.index ?? 0,
        end: (m.index ?? 0) + m[0].length,
        category,
        severity: severityOf(category, m[0]),
        needsMlReview: false,
      });
    }
  }

  for (const b of findBlasphemyMatches(clean, includeContextDependent)) {
    hits.push({ ...b });
  }

  // The user's "never hide" list wins over the built-in lexicon (but not
  // over their own "always hide" list). It lifts the word and its endings
  // only ("damn", "damned"), never a longer word built on it ("f***face"),
  // and never a sacred name, whatever a stored list says.
  const allow = cleanWords(custom?.allow).filter((w) => !isSacredName(w));
  const allowed = (h: TextMatch): boolean =>
    h.category !== CUSTOM_WORD_CATEGORY &&
    allow.some((w) => {
      const t = h.text.toLowerCase();
      return t === w || (t.startsWith(w) && ALLOW_ENDING.test(t.slice(w.length)));
    });

  hits.sort((a, b) => a.start - b.start || b.severity - a.severity);
  const out: TextMatch[] = [];
  for (const h of hits) {
    if (allowed(h)) continue;
    const prev = out[out.length - 1];
    if (prev && h.start < prev.end) {
      // Overlapping hits become one span, labelled by the more severe of them
      const winner = h.severity > prev.severity ? h : prev;
      const end = Math.max(prev.end, h.end);
      out[out.length - 1] = { ...winner, start: prev.start, end, text: clean.slice(prev.start, end) };
      continue;
    }
    out.push(h);
  }
  return out;
}

/** Does the user's config want this match filtered? */
export function isMatchActive(m: TextMatch, config: UserConfig): boolean {
  // "Always hide" means always: no preset, strictness or category switch turns it off
  if (m.category === CUSTOM_WORD_CATEGORY) return true;
  const setting = resolveCategorySetting(m.category, config);
  if (!setting || setting.threshold === 0) return false;
  if (m.severity < 4 - setting.threshold) return false;
  // Context-dependent blasphemy only at "moderate or stricter"
  if (m.needsMlReview && setting.threshold < 2) return false;
  return true;
}
