/**
 * YouTube's own caption format ("json3") into plain cues, and the choice of
 * which of the player's caption tracks to use.
 *
 * The player already holds the whole caption track for the title, timed on
 * the video's own clock. Reading it directly means filtering never depends on
 * the caption text being drawn on screen (YouTube TV stops drawing it in a
 * background tab).
 */

import { cleanCueText, type Cue } from './srt.js';

interface Json3Event {
  tStartMs?: number;
  dDurationMs?: number;
  segs?: { utf8?: string }[];
}

const FALLBACK_CUE_S = 3;

export function cuesFromJson3(data: { events?: Json3Event[] } | null | undefined): Cue[] {
  const events = (data?.events ?? []).filter(
    (e): e is Json3Event & { tStartMs: number; segs: { utf8?: string }[] } =>
      typeof e.tStartMs === 'number' && Array.isArray(e.segs),
  );
  const cues: Cue[] = [];
  events.forEach((e, i) => {
    const text = cleanCueText(e.segs.map((s) => s.utf8 ?? '').join(''));
    if (!text) return;
    const start = e.tStartMs / 1000;
    const next = events[i + 1]?.tStartMs;
    const end = e.dDurationMs
      ? start + e.dDurationMs / 1000
      : next !== undefined && next > e.tStartMs
        ? next / 1000
        : start + FALLBACK_CUE_S;
    cues.push({ start, end, text });
  });
  cues.sort((a, b) => a.start - b.start);
  return cues;
}

export interface PlayerTrackInfo {
  languageCode?: string;
  vssId?: string;
  kind?: string;
}

/** What the player says is showing right now (empty when captions are off) */
export interface SelectedTrack {
  languageCode?: string;
  vss_id?: string;
}

/**
 * Prefer exactly what the viewer is watching (same track id, then same
 * language), then their browser language, then English, then anything.
 * Hand-made tracks beat auto-generated ones throughout.
 */
export function pickTrack<T extends PlayerTrackInfo>(
  tracks: readonly T[],
  selected: SelectedTrack | null | undefined,
  browserLanguage = 'en',
): T | null {
  if (tracks.length === 0) return null;
  const manualFirst = [...tracks].sort((a, b) => Number(a.kind === 'asr') - Number(b.kind === 'asr'));
  const base = (code?: string): string => (code ?? '').toLowerCase().split('-')[0];
  const attempts: ((t: T) => boolean)[] = [];
  if (selected?.vss_id) attempts.push((t) => t.vssId === selected.vss_id);
  if (selected?.languageCode) attempts.push((t) => t.languageCode === selected.languageCode);
  if (selected?.languageCode) attempts.push((t) => base(t.languageCode) === base(selected.languageCode));
  attempts.push((t) => t.languageCode?.toLowerCase() === browserLanguage.toLowerCase());
  attempts.push((t) => base(t.languageCode) === base(browserLanguage));
  attempts.push((t) => base(t.languageCode) === 'en');
  for (const match of attempts) {
    const hit = manualFirst.find(match);
    if (hit) return hit;
  }
  return manualFirst[0];
}
