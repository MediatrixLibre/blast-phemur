/**
 * Captions the browser itself draws (a <video>'s TextTrack), as on DirecTV
 * Stream. There is no caption DOM to read, but the cue list is readable and
 * arrives ahead of the playhead (about 16 s on DirecTV live TV), so muting can
 * be placed before the word instead of reacting to it.
 *
 * Live TV uses roll-up captions: one cue per typed letter ("TRY", "TRY T",
 * "TRY TH"...), each about 33 ms long. Those are joined back into lines, and
 * each letter keeps the moment it was typed, which gives a word's time far
 * more exactly than spreading a line's time across its letters.
 *
 * A live captioner types a few seconds after the words are spoken, so a
 * roll-up word is muted from `leadS` before it was typed. Pop-on captions
 * (one whole line per cue, as on recorded shows) go through the ordinary
 * subtitle compiler.
 */

import type { GSFSegment, CustomWords, UserConfig } from '@guardianstream/types';
import type { Cue } from './srt.js';
import type { Track } from './anchor.js';
import { compileSegments } from './compile.js';
import { scanText, isMatchActive } from '../lexicon/profanity.js';
import { maskText } from '../caption/caption-censor.js';
import { findBlasphemyMatches } from '../caption/blasphemy-patterns.js';
import { CUSTOM_WORD_CATEGORY } from '../engine/category-resolver.js';
import { debugLog } from '../debug/recorder.js';

export interface RawCue {
  start: number;
  end: number;
  text: string;
}

/** A joined caption line. marks[i] is when character i first appeared */
export interface Line {
  start: number;
  end: number;
  text: string;
  marks: number[];
  /** Characters before this offset were carried over from the previous line (roll-up scroll) */
  fresh: number;
  rollUp: boolean;
}

export interface LiveOptions {
  /** Seconds of mute before a roll-up word was typed (the captioner's delay) */
  leadS?: number;
  /** Seconds of mute after it was typed */
  padAfter?: number;
  /** Extra seconds on each side for a sacred name */
  sacredExtra?: number;
  custom?: CustomWords;
}

const LIVE_DEFAULTS = { leadS: 3, padAfter: 0.5, sacredExtra: 1 };
/** A gap longer than this ends a roll-up chain */
const CHAIN_GAP_S = 0.5;

/**
 * Join cues into lines. Consecutive cues where each one extends the last
 * ("TRY" -> "TRY T") are one line typed letter by letter.
 */
export function collapseCues(cues: RawCue[], previous?: Line): Line[] {
  const lines: Line[] = [];
  let cur: Line | null = null;
  let last: Line | undefined = previous;

  const close = (): void => {
    if (!cur) return;
    cur.fresh = carriedOver(last?.text, cur.text);
    lines.push(cur);
    last = cur;
    cur = null;
  };

  for (const c of cues) {
    if (cur && c.text.length > cur.text.length && c.text.startsWith(cur.text) && c.start - cur.end < CHAIN_GAP_S) {
      for (let i = cur.text.length; i < c.text.length; i++) cur.marks.push(c.start);
      cur.text = c.text;
      cur.end = c.end;
      cur.rollUp = true;
      continue;
    }
    if (cur && c.text === cur.text && c.start - cur.end < CHAIN_GAP_S) {
      cur.end = c.end;
      continue;
    }
    close();
    cur = { start: c.start, end: c.end, text: c.text, marks: new Array<number>(c.text.length).fill(c.start), fresh: 0, rollUp: false };
  }
  close();
  return lines;
}

/**
 * When roll-up captions scroll, the new line repeats the old bottom row(s):
 * "A\nB" is followed by "B\nC". Return how many leading characters were
 * already shown, so a word in them is not counted twice.
 */
export function carriedOver(prev: string | undefined, next: string): number {
  if (!prev) return 0;
  const prevRows = prev.split('\n');
  const nextRows = next.split('\n');
  for (let k = Math.min(prevRows.length, nextRows.length - 1); k > 0; k--) {
    const tail = prevRows.slice(prevRows.length - k);
    if (tail.every((row, i) => row === nextRows[i] && row.trim().length > 0)) {
      return nextRows.slice(0, k).join('\n').length + 1;
    }
  }
  return 0;
}

function isSacred(category: string, text: string): boolean {
  if (category.startsWith('blasphemy')) return true;
  return category === CUSTOM_WORD_CATEGORY && findBlasphemyMatches(text, true).length > 0;
}

/** Mute windows for joined lines */
export function compileLines(lines: Line[], opts: LiveOptions = {}): GSFSegment[] {
  const o = { ...LIVE_DEFAULTS, ...opts };
  const popOn: Cue[] = [];
  const segments: GSFSegment[] = [];

  for (const line of lines) {
    if (!line.rollUp) {
      popOn.push({ start: line.start, end: line.end, text: line.text.slice(line.fresh) });
      continue;
    }
    for (const m of scanText(line.text, true, o.custom)) {
      if (m.start < line.fresh) continue;
      const typedStart = line.marks[m.start];
      const typedEnd = line.marks[Math.min(m.end, line.marks.length) - 1];
      const extra = isSacred(m.category, m.text) ? o.sacredExtra : 0;
      segments.push({
        id: `live-${typedStart.toFixed(3)}-${m.start}`,
        start: round3(Math.max(0, typedStart - o.leadS - extra)),
        end: round3(typedEnd + o.padAfter + extra),
        category: m.category,
        severity: m.severity as GSFSegment['severity'],
        action: 'mute',
        confidence: 0.6,
        source: 'ai',
        votes: 0,
        words: [m.text],
        wordTimestamps: [[round3(typedStart), round3(typedEnd)]],
      });
    }
  }
  return [...segments, ...compileSegments(popOn, { custom: o.custom })].sort((a, b) => a.start - b.start);
}

const ENTITIES: Record<string, string> = { '&gt;': '>', '&lt;': '<', '&amp;': '&', '&nbsp;': ' ', '&quot;': '"', '&#39;': "'" };

/** VTT cue text without tags, and with the escapes DirecTV sends (">>" arrives as "&gt;&gt;") */
export function plainText(text: string): string {
  return text.replace(/<[^>]+>/g, '').replace(/&(?:gt|lt|amp|nbsp|quot|#39);/g, (e) => ENTITIES[e]);
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** The track the browser is drawing, or the best one it could draw */
export function pickTextTrack(video: HTMLVideoElement): TextTrack | null {
  const tracks = [...video.textTracks].filter((t) => t.kind === 'subtitles' || t.kind === 'captions');
  return tracks.find((t) => t.mode === 'showing' && (t.cues?.length ?? 0) > 0)
    ?? tracks.find((t) => (t.cues?.length ?? 0) > 0)
    ?? null;
}

/** The real text of a cue, even after we masked it on screen */
const originals = new WeakMap<TextTrackCue, string>();

/**
 * Follows a video's caption TextTrack as it grows and reports the joined
 * lines and mute windows. Reads on the video's own timeupdate (about four a
 * second, also in a background tab, where page timers slow to one a minute).
 */
export class TextTrackFeed {
  private settled: Line[] = [];
  private settledSegments: GSFSegment[] = [];
  private pending: RawCue[] = [];
  private watermark = -Infinity;
  /** Start times (ms) of cues already read */
  private seen = new Set<number>();
  private lastRead = 0;
  private track: TextTrack | null = null;
  private running = false;
  /** Cues already scanned for masking (a settings change starts a new feed) */
  private checked = new WeakSet<TextTrackCue>();

  constructor(
    private video: HTMLVideoElement,
    /** Read on every update: a live channel changes program without navigating */
    private key: () => string,
    private title: () => string,
    private getConfig: () => UserConfig,
    private onUpdate: (track: Track, segments: GSFSegment[]) => void,
    private opts: LiveOptions = {},
  ) {}

  /** True if this video has a caption track with cues to follow */
  static available(video: HTMLVideoElement): boolean {
    return pickTextTrack(video) !== null;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.video.addEventListener('timeupdate', this.onTick);
    this.video.addEventListener('loadstart', this.onNewSource);
    this.read();
  }

  stop(): void {
    this.running = false;
    this.video.removeEventListener('timeupdate', this.onTick);
    this.video.removeEventListener('loadstart', this.onNewSource);
    // Put the real words back on screen
    for (const cue of [...(this.track?.cues ?? [])]) {
      const orig = originals.get(cue);
      if (orig !== undefined) (cue as VTTCue).text = orig;
    }
  }

  private onTick = (): void => {
    const now = performance.now();
    if (now - this.lastRead < 900) return;
    this.lastRead = now;
    this.read();
  };

  /** A new stream in the same player (channel change): its clock starts over */
  private onNewSource = (): void => {
    this.reset('new stream');
    this.track = null;
  };

  private reset(why: string): void {
    debugLog('text-track-reset', { why });
    this.settled = [];
    this.settledSegments = [];
    this.pending = [];
    this.watermark = -Infinity;
    this.seen.clear();
  }

  /**
   * Live TV adds about 30 cues a second, so forget the oldest start times
   * once there are many. A rewind that far back reads those cues again,
   * which only repeats mute windows that already exist.
   */
  private pruneSeen(track: TextTrack): void {
    if (this.seen.size < 50_000 || !track.cues?.length) return;
    const floor = Math.round((track.cues[0].startTime - 120) * 1000);
    for (const k of this.seen) if (k < floor) this.seen.delete(k);
  }

  read(): void {
    const track = pickTextTrack(this.video);
    if (!track?.cues) return;
    if (track !== this.track) {
      if (this.track) this.reset('caption track changed');
      this.track = track;
    }
    const config = this.getConfig();
    const custom = { ...this.opts, custom: config.customWords };
    // A cue is read once (by its start time). One earlier than the newest read
    // so far comes from a jump back into a part not yet seen (a movie started
    // midway, then rewound); it is complete already, so it settles at once.
    const back: RawCue[] = [];
    let added = 0;
    for (const cue of [...track.cues]) {
      const text = originals.get(cue) ?? (cue as VTTCue).text ?? '';
      this.mask(cue, text, config);
      const key = Math.round(cue.startTime * 1000);
      if (this.seen.has(key)) continue;
      this.seen.add(key);
      const raw = { start: cue.startTime, end: cue.endTime, text: plainText(text) };
      if (cue.startTime > this.watermark) {
        this.pending.push(raw);
        this.watermark = cue.startTime;
      } else {
        back.push(raw);
      }
      added++;
    }
    if (added === 0) return;
    if (back.length) {
      const backLines = collapseCues(back.sort((a, b) => a.start - b.start));
      this.settled = [...this.settled, ...backLines].sort((a, b) => a.start - b.start);
      this.settledSegments = [...this.settledSegments, ...compileLines(backLines, custom)].sort((a, b) => a.start - b.start);
    }
    this.pruneSeen(track);

    // Every line but the last is finished; the last may still be typing
    const lines = collapseCues(this.pending, this.settled[this.settled.length - 1]);
    const done = lines.slice(0, -1);
    const open = lines.slice(-1);
    if (done.length) {
      this.settled.push(...done);
      this.settledSegments.push(...compileLines(done, custom));
      this.pending = this.pending.filter((c) => c.start >= open[0].start - 1e-6);
    }
    const openSegments = compileLines(open, custom);
    const lineCues: Cue[] = [...this.settled, ...open].map((l) => ({ start: l.start, end: l.end, text: l.text.replace(/\n/g, ' ') }));
    this.onUpdate(
      { key: this.key(), title: this.title(), cues: lineCues },
      [...this.settledSegments, ...openSegments],
    );
  }

  /** Hide filtered words in the captions the browser draws */
  private mask(cue: TextTrackCue, text: string, config: UserConfig): void {
    if (config.censorCaptions === false || this.checked.has(cue)) return;
    this.checked.add(cue);
    const hits = scanText(text, true, config.customWords).filter((m) => isMatchActive(m, config));
    if (hits.length === 0) return;
    if (!originals.has(cue)) originals.set(cue, text);
    const masked = maskText(text, hits);
    if ((cue as VTTCue).text !== masked) (cue as VTTCue).text = masked;
  }
}
