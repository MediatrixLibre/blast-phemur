/**
 * Compile subtitle cues into GSF filter segments with estimated word timing.
 *
 * A subtitle gives us WHEN a line is on screen, not when each word is spoken.
 * We spread the line's time across its characters. That is accurate to a
 * fraction of a second for a short line, far tighter than muting the whole
 * line. Padding covers the remaining error.
 */

import type { GSFSegment, GSFFilterSet, CustomWords } from '@guardianstream/types';
import type { Cue } from './srt.js';
import { scanText } from '../lexicon/profanity.js';
import { findBlasphemyMatches } from '../caption/blasphemy-patterns.js';
import { CUSTOM_WORD_CATEGORY } from '../engine/category-resolver.js';

export interface CompileOptions {
  /** Seconds of mute before the estimated word start */
  padBefore?: number;
  /** Seconds of mute after the estimated word end */
  padAfter?: number;
  /** Fraction of the cue duration that actually contains speech */
  speechFraction?: number;
  /** Shortest mute we will ever emit */
  minLength?: number;
  /** The user's own word lists */
  custom?: CustomWords;
  /**
   * Mute the whole line around a sacred name instead of the estimated word.
   * A word estimate can land a fraction of a second off the spoken word (S01E04
   * at 39:24, "Jesus, Al, Jesus": both muted on the estimate, still heard), and
   * for the Name a missed word costs far more than a few seconds of dialogue.
   * False brings back word-level timing for sacred names too.
   */
  sacredWholeLine?: boolean;
  /** Seconds added on each side of a whole-line mute */
  sacredPad?: number;
}

const DEFAULTS = {
  padBefore: 0.2,
  padAfter: 0.25,
  speechFraction: 0.9,
  minLength: 0.45,
  sacredWholeLine: true,
  sacredPad: 0.3,
};

/** A blasphemy hit, or an "always hide" word that is itself a sacred name */
function isSacred(category: string, text: string): boolean {
  if (category.startsWith('blasphemy')) return true;
  return category === CUSTOM_WORD_CATEGORY && findBlasphemyMatches(text, true).length > 0;
}

export function compileSegments(cues: Cue[], opts: CompileOptions = {}): GSFSegment[] {
  const o = { ...DEFAULTS, ...opts };
  const segments: GSFSegment[] = [];

  cues.forEach((cue, i) => {
    const matches = scanText(cue.text, true, o.custom);
    if (matches.length === 0) return;

    const dur = Math.max(0.1, cue.end - cue.start);
    const speech = dur * o.speechFraction;
    // Speech is centred in the cue window
    const t0 = cue.start + (dur - speech) / 2;
    const cum = pacing(cue.text);
    const total = Math.max(1, cum[cue.text.length]);
    // The longer the line, the less sure we are where a word falls
    const widen = 0.05 * Math.max(0, dur - 2);

    for (const m of matches) {
      if (o.sacredWholeLine && isSacred(m.category, m.text)) {
        segments.push({
          id: `sub-${i}-${m.start}`,
          start: round3(Math.max(0, cue.start - o.sacredPad)),
          end: round3(cue.end + o.sacredPad),
          category: m.category,
          severity: m.severity as GSFSegment['severity'],
          action: 'mute',
          confidence: 0.8,
          source: 'ai',
          votes: 0,
          words: [m.text],
          wordTimestamps: [[round3(cue.start), round3(cue.end)]],
        });
        continue;
      }
      let ws = t0 + (cum[m.start] / total) * speech;
      let we = t0 + (cum[m.end] / total) * speech;
      if (we - ws < o.minLength - o.padBefore - o.padAfter) {
        const mid = (ws + we) / 2;
        const half = (o.minLength - o.padBefore - o.padAfter) / 2;
        ws = mid - half;
        we = mid + half;
      }
      segments.push({
        id: `sub-${i}-${m.start}`,
        start: round3(Math.max(0, ws - o.padBefore - widen)),
        end: round3(we + o.padAfter + widen),
        category: m.category,
        severity: m.severity as GSFSegment['severity'],
        action: 'mute',
        confidence: 0.8,
        source: 'ai',
        votes: 0,
        words: [m.text],
        wordTimestamps: [[round3(ws), round3(we)]],
      });
    }
  });

  return mergeOverlaps(segments);
}

/** Merge segments of the same category that touch or overlap */
function mergeOverlaps(segs: GSFSegment[]): GSFSegment[] {
  segs.sort((a, b) => a.start - b.start);
  const out: GSFSegment[] = [];
  for (const s of segs) {
    const prev = out[out.length - 1];
    if (prev && s.start <= prev.end + 0.05) {
      prev.end = Math.max(prev.end, s.end);
      prev.severity = Math.max(prev.severity, s.severity) as GSFSegment['severity'];
      prev.words = [...(prev.words ?? []), ...(s.words ?? [])];
      prev.wordTimestamps = [...(prev.wordTimestamps ?? []), ...(s.wordTimestamps ?? [])];
      // Keep the more severe category as the label
      if (s.severity >= prev.severity) prev.category = s.category;
    } else {
      out.push({ ...s });
    }
  }
  return out;
}

/**
 * Lift every moment the viewer passed ("that was fine here") on this track,
 * whatever the word. A pass is one moment of one title: the same word stays
 * muted everywhere else, and a sacred name is only ever passed this way.
 */
export function withoutPasses(
  segments: GSFSegment[],
  key: string,
  passes: CustomWords['passes'],
): GSFSegment[] {
  const mine = (passes ?? []).filter((p) => p.track === key);
  if (mine.length === 0) return segments;
  return segments.filter((s) => !mine.some((p) => s.start <= p.end + 0.05 && s.end >= p.start - 0.05));
}

export function buildFilterSet(
  key: string,
  title: string,
  cues: Cue[],
  opts?: CompileOptions,
): GSFFilterSet {
  const segments = withoutPasses(compileSegments(cues, opts), key, opts?.custom?.passes);
  return {
    version: '2.0',
    contentId: `subtitle:${key}`,
    title,
    provider: 'subtitle',
    providerContentId: key,
    duration: cues.length ? cues[cues.length - 1].end : 0,
    segments,
    coverage: {
      audioAnalyzed: true,
      visualAnalyzed: false,
      sceneAnalyzed: false,
      humanReviewed: false,
      completenessEstimate: 0.7,
      lastUpdated: new Date().toISOString(),
    },
  };
}

/**
 * Cumulative "speaking time" weight at each character offset. People pause at
 * punctuation, so a word after a full stop lands later than a plain
 * proportional split would put it.
 */
export function pacing(text: string): number[] {
  const cum = new Array<number>(text.length + 1).fill(0);
  let acc = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    cum[i] = acc;
    acc += 1;
    if (ch === '.' || ch === '!' || ch === '?') acc += 5;
    else if (ch === ',' || ch === ';' || ch === ':') acc += 2.5;
    else if (ch === '-' || ch === '—') acc += 2;
  }
  cum[text.length] = acc;
  return cum;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
