/**
 * Caption anchoring: figure out WHICH episode is playing and WHERE we are in
 * it by matching the caption text on screen against pre-downloaded subtitles.
 *
 * The result is an offset: videoTime = subtitleTime + offset. It absorbs ad
 * breaks, DVR delay, cut differences and a late-starting stream, which a
 * fixed timeline cannot.
 */

import type { Cue } from './srt.js';

export interface Track {
  key: string; // e.g. "deadwood-s01e02"
  title: string;
  cues: Cue[];
}

export function tokenize(text: string): string[] {
  return text
    // Non-speech notes and live-caption speaker labels ("[MAN]", "(laughs)", ">> JOHN:")
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .replace(/\b[A-Z][A-Z0-9 .']{1,24}:\s/g, ' ')
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/\S*\*\S*/g, ' ') // drop masked words entirely: d*** never equals damn
    .match(/[a-z0-9']+/g) ?? [];
}

/** Dice coefficient over token multisets, 0..1 */
function dice(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const t of a) counts.set(t, (counts.get(t) ?? 0) + 1);
  let overlap = 0;
  for (const t of b) {
    const c = counts.get(t);
    if (c) {
      overlap++;
      counts.set(t, c - 1);
    }
  }
  return (2 * overlap) / (a.length + b.length);
}

interface IndexedCue {
  track: number;
  cue: number;
  tokens: string[];
}

export interface Observation {
  trackKey: string;
  cueStart: number;
  score: number;
}

/**
 * Inverted index over every cue of every loaded track. Matching a caption
 * costs a handful of map lookups, so it is cheap enough to run per caption.
 */
export class CueIndex {
  private entries: IndexedCue[] = [];
  private byToken = new Map<string, number[]>();

  constructor(public readonly tracks: Track[]) {
    tracks.forEach((track, ti) => {
      track.cues.forEach((cue, ci) => {
        const tokens = tokenize(cue.text);
        if (tokens.length === 0) return;
        const id = this.entries.push({ track: ti, cue: ci, tokens }) - 1;
        for (const t of new Set(tokens)) {
          const list = this.byToken.get(t);
          if (list) list.push(id);
          else this.byToken.set(t, [id]);
        }
      });
    });
  }

  /**
   * Best cue matches for a caption. A caption can span several cues or part
   * of one, so we score containment as well as similarity.
   */
  match(caption: string, minTokens = 3, minScore = 0.6): Observation[] {
    const tokens = tokenize(caption);
    if (tokens.length < minTokens) return [];

    // Candidate cues ranked by shared RARE tokens
    const votes = new Map<number, number>();
    for (const t of new Set(tokens)) {
      const list = this.byToken.get(t);
      if (!list || list.length > 400) continue; // skip stopword-like tokens
      const weight = 1 / Math.log2(2 + list.length);
      for (const id of list) votes.set(id, (votes.get(id) ?? 0) + weight);
    }
    const candidates = [...votes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40);

    const results: Observation[] = [];
    for (const [id] of candidates) {
      const e = this.entries[id];
      const score = dice(tokens, e.tokens);
      if (score >= minScore) {
        const track = this.tracks[e.track];
        results.push({ trackKey: track.key, cueStart: track.cues[e.cue].start, score });
      }
    }
    return results.sort((a, b) => b.score - a.score);
  }
}

/**
 * Stateful tracker that turns caption sightings into (track, offset).
 */
export class Anchor {
  /** Recent offset estimates for the current track, newest last */
  private estimates: { offset: number; at: number }[] = [];
  /** Votes for each track while we do not yet know the episode */
  private trackVotes = new Map<string, { offsets: number[]; cues: Set<number> }>();
  /** Sightings that match a DIFFERENT episode than the one we are locked to */
  private foreignVotes = new Map<string, { offsets: number[]; cues: Set<number> }>();
  /** Consecutive caption lines that matched nothing */
  private misses = 0;
  /** The cue the last estimate came from, so growing/repeated captions count once */
  private lastCue: { key: string; start: number } | null = null;
  private _trackKey: string | null = null;
  private _offset = 0;
  private _locked = false;
  /** True when the timeline is known exactly (the player's own captions): the offset never moves */
  private fixed = false;

  /**
   * Agreement window (s) for offset estimates. Wide enough that a
   * word-by-word caption (first match up to ~1s late) still agrees with a
   * cleanly timed one; the low-percentile pick below removes the bias.
   */
  static readonly TOLERANCE = 1.5;
  /** Forget estimates older than this (ms) */
  static readonly MAX_AGE_MS = 90_000;
  /** Votes a track needs to be declared the episode */
  static readonly TRACK_VOTES = 3;
  /** Unmatched caption lines in a row before we stop trusting the lock */
  static readonly MAX_MISSES = 8;

  constructor(
    private index: CueIndex,
    private now: () => number = () => performance.now(),
  ) {}

  get trackKey(): string | null {
    return this._trackKey;
  }
  get offset(): number {
    return this._offset;
  }
  get locked(): boolean {
    return this._locked;
  }

  /** Pin the episode (from the page title or the user) */
  setTrack(key: string | null): void {
    this.fixed = false;
    this._trackKey = key;
    this.reset();
  }

  /**
   * Lock to a track whose times are already on the video clock (the player's
   * own captions). No episode search and no offset estimate: the lock is
   * dropped only if the captions on screen stop matching, and returns when
   * they match again. With nothing on screen (a background tab) it just holds.
   */
  pin(key: string, offset = 0): void {
    this.reset();
    this.fixed = true;
    this._trackKey = key;
    this._offset = offset;
    this._locked = true;
  }

  /**
   * Feed one newly appeared caption with the video time it appeared at.
   * Returns true if the lock state or offset changed.
   */
  observe(caption: string, videoTime: number): boolean {
    if (this.fixed) return this.observeFixed(caption);
    const matches = this.index.match(caption);
    if (matches.length === 0) {
      // Real captions that match nothing we know: the page may have moved on
      // to something else (new title, ad, a show we have no subtitles for)
      if (tokenize(caption).length >= 4 && this._locked && ++this.misses >= Anchor.MAX_MISSES) {
        this._locked = false;
        this.estimates = [];
        this.misses = 0;
        return true;
      }
      return false;
    }
    this.misses = 0;

    const before = `${this._trackKey}|${this._locked}|${this._offset.toFixed(2)}`;
    const best = matches[0];

    // Identify the episode if we do not know it
    if (!this._trackKey) {
      // Ambiguous repeated line: wait for something more distinctive
      if (matches.length > 1 && matches[1].score > best.score - 0.1 && matches[1].trackKey !== best.trackKey) {
        return false;
      }
      const votes = this.trackVotes.get(best.trackKey) ?? { offsets: [], cues: new Set<number>() };
      // One caption lingering on screen is one sighting, not three
      if (votes.cues.has(best.cueStart)) return false;
      votes.cues.add(best.cueStart);
      votes.offsets.push(videoTime - best.cueStart);
      this.trackVotes.set(best.trackKey, votes);
      if (votes.offsets.length < Anchor.TRACK_VOTES) return false;
      // The sightings that identified the episode also place us in it
      this._trackKey = best.trackKey;
      const at = this.now();
      this.estimates = votes.offsets.slice(0, -1).map((offset) => ({ offset, at }));
      this.trackVotes.clear();
    }

    const mine = matches.filter((m) => m.trackKey === this._trackKey);

    // Locked to one episode but the captions clearly belong to another (a
    // "Previously on" recap, or the page moved to the next episode): switch
    // after three agreeing sightings.
    if (mine.length === 0 || (best.trackKey !== this._trackKey && best.score >= mine[0].score + 0.15)) {
      if (best.score < 0.75) return false;
      const fv = this.foreignVotes.get(best.trackKey) ?? { offsets: [], cues: new Set<number>() };
      if (fv.cues.has(best.cueStart)) return false;
      fv.cues.add(best.cueStart);
      fv.offsets.push(videoTime - best.cueStart);
      this.foreignVotes.set(best.trackKey, fv);
      if (fv.offsets.length < Anchor.TRACK_VOTES) return false;
      const at = this.now();
      this._trackKey = best.trackKey;
      this.estimates = fv.offsets.slice(0, -1).map((offset) => ({ offset, at }));
      this.foreignVotes.clear();
      this._locked = false;
      this.lastCue = null;
      // fall through: the current sighting is evaluated against the new track
      return this.observe(caption, videoTime) || true;
    }
    this.foreignVotes.clear();

    // Among cues in this track, prefer the one closest to the current offset
    let pick = mine[0];
    if (this._locked) {
      let bestDelta = Infinity;
      for (const m of mine) {
        if (m.score < mine[0].score - 0.15) continue;
        const delta = Math.abs(videoTime - m.cueStart - this._offset);
        if (delta < bestDelta) {
          bestDelta = delta;
          pick = m;
        }
      }
    } else if (mine.length > 1 && mine[1].score > mine[0].score - 0.1) {
      return false; // repeated line, cannot place it yet
    }

    // The same cue seen again (caption still up, or growing word by word)
    // can only be later than the first sighting, so keep the first
    if (this.lastCue && this.lastCue.key === pick.trackKey && this.lastCue.start === pick.cueStart) {
      return false;
    }
    this.lastCue = { key: pick.trackKey, start: pick.cueStart };

    const at = this.now();
    this.estimates.push({ offset: videoTime - pick.cueStart, at });
    this.estimates = this.estimates.filter((e) => at - e.at <= Anchor.MAX_AGE_MS).slice(-10);

    this.recompute();
    return before !== `${this._trackKey}|${this._locked}|${this._offset.toFixed(2)}`;
  }

  private observeFixed(caption: string): boolean {
    const mine = this.index.match(caption).some((m) => m.trackKey === this._trackKey);
    if (mine) {
      this.misses = 0;
      if (this._locked) return false;
      this._locked = true;
      return true;
    }
    if (this._locked && tokenize(caption).length >= 4 && ++this.misses >= Anchor.MAX_MISSES) {
      this._locked = false;
      this.misses = 0;
      return true;
    }
    return false;
  }

  /** Drop the lock (e.g. after a long gap with no caption matches) */
  reset(): void {
    this.estimates = [];
    this.trackVotes.clear();
    this.foreignVotes.clear();
    this.misses = 0;
    this.lastCue = null;
    this._locked = false;
    this._offset = 0;
  }

  private recompute(): void {
    const latest = this.estimates[this.estimates.length - 1];
    if (!latest) return;
    const cluster = this.estimates.filter(
      (e) => Math.abs(e.offset - latest.offset) <= Anchor.TOLERANCE,
    );
    if (cluster.length >= 2) {
      const sorted = cluster.map((e) => e.offset).sort((a, b) => a - b);
      // Caption detection can only be late, never early, so the low end of
      // the cluster is closest to the truth (20th percentile resists a stray
      // bad match better than the bare minimum).
      this._offset = sorted[Math.floor(sorted.length * 0.2)];
      this._locked = true;
    } else if (this._locked && Math.abs(latest.offset - this._offset) > Anchor.TOLERANCE + 1) {
      // A lone, disagreeing sighting: the stream probably jumped. Unlock
      // until a second sighting confirms where we are.
      this._locked = false;
    }
  }
}
