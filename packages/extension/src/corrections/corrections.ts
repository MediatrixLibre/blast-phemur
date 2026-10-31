/**
 * Correcting the filter while watching: "that was fine" (a false positive)
 * and "that got through" (a false negative). The rules live here as plain
 * functions; keys and the on-screen indicator are in shortcuts.ts / ui/toast.ts.
 */

import type { CustomWords, UserConfig } from '@guardianstream/types';
import { scanText, isMatchActive } from '../lexicon/profanity.js';
import { CUSTOM_WORD_CATEGORY } from '../engine/category-resolver.js';
import { isSacredName } from '../caption/caption-censor.js';

/** One word or phrase as it is stored in the viewer's lists */
export function normalizeEntry(text: string): string {
  return text
    .toLocaleLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const unique = (list: string[]): string[] => [...new Set(list)];
const clean = (words: string[]): string[] => unique(words.map(normalizeEntry).filter((w) => w.length > 1));

/** One word the filter hid, with the category that hid it */
export interface HitWord {
  text: string;
  category: string;
}

/** A stretch of one title's timeline: what a pass lifts */
export interface PassWindow {
  track: string;
  start: number;
  end: number;
}

/** One muted event: its words, and (when a caption track is behind it) where */
export interface HitEvent {
  words: HitWord[];
  track?: string;
  start?: number;
  end?: number;
  /**
   * The same moment on the other timelines that can mute it: a word muted
   * from the track is also caught by live captions whenever the session
   * falls back to them (after a seek or a restart), so a pass covers both
   */
  also?: PassWindow[];
}

/** Sacred names are only ever passed one moment at a time, never allowed everywhere */
export const isSacred = (w: HitWord): boolean => w.category.startsWith('blasphemy');

const MAX_PASSES = 300;

/** "That was fine here": lift the filter for this moment of this title only, for every word in it */
export function passing(words: CustomWords, track: string, start: number, end: number): CustomWords {
  const r = (n: number): number => Math.round(n * 100) / 100;
  const passes = [...(words.passes ?? []), { track, start: r(start), end: r(end) }];
  const seen = new Set<string>();
  const deduped = passes.filter((p) => {
    const k = `${p.track}|${p.start}|${p.end}`;
    return seen.has(k) ? false : (seen.add(k), true);
  });
  return { ...words, passes: deduped.slice(-MAX_PASSES) };
}

/** Pass one moment on its own timeline and on every other timeline that can mute it */
export function passingAll(words: CustomWords, main: PassWindow, also: PassWindow[] = []): CustomWords {
  const ok = (p: PassWindow): boolean => !!p && typeof p.track === 'string' && Number.isFinite(p.start) && Number.isFinite(p.end);
  return [main, ...(Array.isArray(also) ? also : [])].filter(ok).reduce((w, p) => passing(w, p.track, p.start, p.end), words);
}

/**
 * Undo one correction by reversing its own change (what it added goes, what
 * it removed comes back), so every edit made since, in the popup or by key,
 * stays as it is.
 */
export function revertChange(current: CustomWords, before: CustomWords, after: CustomWords): CustomWords {
  const list = (cur: string[], b: string[], a: string[]): string[] => {
    const added = a.filter((w) => !b.includes(w));
    const removed = b.filter((w) => !a.includes(w));
    return [...cur.filter((w) => !added.includes(w)), ...removed.filter((w) => !cur.includes(w))];
  };
  type Pass = NonNullable<CustomWords['passes']>[number];
  const same = (p: Pass, q: Pass): boolean => p.track === q.track && p.start === q.start && p.end === q.end;
  const bp = before.passes ?? [];
  const ap = after.passes ?? [];
  const cp = current.passes ?? [];
  const addedP = ap.filter((p) => !bp.some((q) => same(p, q)));
  const removedP = bp.filter((p) => !ap.some((q) => same(p, q)));
  return {
    ...current,
    block: list(current.block, before.block, after.block),
    allow: list(current.allow, before.allow, after.allow),
    passes: [...cp.filter((p) => !addedP.some((q) => same(p, q))), ...removedP.filter((p) => !cp.some((q) => same(p, q)))],
  };
}

/** "That was fine": stop hiding these. They also leave the always-hide list. */
export function allowing(words: CustomWords, hits: string[]): CustomWords {
  // A sacred name can only ever be passed one moment at a time (see passing)
  const add = clean(hits).filter((w) => !isSacredName(w));
  return {
    ...words,
    block: words.block.filter((w) => !add.includes(normalizeEntry(w))),
    allow: unique([...words.allow, ...add]),
  };
}

/** "That got through": always hide these. They also leave the never-hide list. */
export function blocking(words: CustomWords, hits: string[]): CustomWords {
  const add = clean(hits);
  return {
    ...words,
    allow: words.allow.filter((w) => !add.includes(normalizeEntry(w))),
    block: unique([...words.block, ...add]),
  };
}

const COMMON = new Set(
  (
    'the and for are but not you all any can had her was one our out has him his how its may new now old see two way who ' +
    'did get let put say she too use that this with have from they will your what when were been said each which their ' +
    'there about would these other into than then them some could just like over also back only come know want here ' +
    'going gonna wanna right well yeah okay still because really thing think where after before'
  ).split(' '),
);

const MAX_CHOICES = 9;

export interface MissedPick {
  /** One clear candidate: add it without asking */
  auto: string | null;
  /** Several candidates: let the viewer choose */
  choices: string[];
}

/**
 * "Something got through": work out which word. Words the lexicon knows but
 * the viewer's settings let pass come first (usually exactly one). With none,
 * offer the words of the last two lines.
 */
export function pickMissed(linesNewestFirst: string[], custom: CustomWords, config: UserConfig): MissedPick {
  for (const line of linesNewestFirst.slice(0, 3)) {
    const passed = scanText(line, true, custom).filter(
      (m) => m.category !== CUSTOM_WORD_CATEGORY && !isMatchActive(m, config),
    );
    const found = unique(passed.map((m) => normalizeEntry(m.text)).filter(Boolean));
    if (found.length === 1) return { auto: found[0], choices: [] };
    if (found.length > 1) return { auto: null, choices: found.slice(0, MAX_CHOICES) };
  }
  const blocked = new Set(custom.block.map(normalizeEntry));
  const words: string[] = [];
  for (const line of linesNewestFirst.slice(0, 2)) {
    for (const w of line.match(/[\p{L}][\p{L}'’]*/gu) ?? []) {
      const n = normalizeEntry(w);
      if (n.length >= 3 && !COMMON.has(n) && !blocked.has(n)) words.push(n);
    }
  }
  return { auto: null, choices: unique(words).slice(0, MAX_CHOICES) };
}

/**
 * Which category hid each word of a muted segment. A merged segment carries
 * one label, so look the words up again in the cue lines it came from.
 */
export function wordCategories(
  cues: readonly { start: number; end: number; text: string }[],
  start: number,
  end: number,
  custom: CustomWords | undefined,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const cue of cues) {
    if (cue.end < start - 0.5 || cue.start > end + 0.5) continue;
    for (const m of scanText(cue.text, true, custom)) if (!out.has(m.text)) out.set(m.text, m.category);
  }
  return out;
}

/** What the popup (or a key) asks to change */
export type Correction =
  | { action: 'allow' | 'block'; words: string[] }
  | { action: 'pass'; track: string; start: number; end: number; also?: PassWindow[] }
  | { action: 'clear-passes' };

export function applyCorrection(words: CustomWords, c: Correction): CustomWords {
  switch (c.action) {
    case 'allow':
      return allowing(words, c.words);
    case 'block':
      return blocking(words, c.words);
    case 'pass':
      return passingAll(words, { track: c.track, start: c.start, end: c.end }, c.also);
    case 'clear-passes':
      return { ...words, passes: [] };
  }
}
