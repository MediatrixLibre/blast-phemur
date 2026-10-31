/**
 * Subtitle library: episodes the user has imported, kept in extension storage.
 *
 * Cues are stored compactly as [start, end, text] tuples. A 36-episode series
 * is a few MB, which is why the manifest asks for unlimitedStorage.
 */

import type { Track } from './anchor.js';
import { parseCues } from './srt.js';

const INDEX_KEY = 'gs:subs:index';
const trackKey = (key: string) => `gs:subs:${key}`;

export interface LibraryEntry {
  key: string;
  title: string;
  cueCount: number;
  addedAt: number;
}

type StoredCues = [number, number, string][];

function storage(): chrome.storage.LocalStorageArea | null {
  return typeof chrome !== 'undefined' && chrome.storage ? chrome.storage.local : null;
}

function get<T>(key: string | string[] | null): Promise<Record<string, T>> {
  const area = storage();
  return new Promise((resolve) => (area ? area.get(key as never, (r) => resolve(r as never)) : resolve({})));
}

function set(items: Record<string, unknown>): Promise<void> {
  const area = storage();
  return new Promise((resolve) => (area ? area.set(items, () => resolve()) : resolve()));
}

/**
 * "Deadwood.S01E02.1080p.srt", "deadwood-s01e02.srt", "Deadwood 1x02.srt"
 * -> { key: "deadwood-s01e02", title: "Deadwood S01E02" }
 */
export function episodeFromFilename(name: string): { key: string; title: string } | null {
  const base = name.replace(/\.[a-z0-9]{2,4}$/i, '');
  const m = base.match(
    /^(.*?)[\s._-]*(?:s(\d{1,2})[\s._-]*e(\d{1,3})|(\d{1,2})x(\d{1,3})|season[\s._-]*(\d{1,2})[\s._,-]*episode[\s._-]*(\d{1,3}))/i,
  );
  if (!m) return null;
  const season = +(m[2] ?? m[4] ?? m[6]);
  const episode = +(m[3] ?? m[5] ?? m[7]);
  const show = m[1].replace(/[._]+/g, ' ').trim().replace(/\s+/g, ' ');
  if (!show) return null;
  const slug = show.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const code = `s${String(season).padStart(2, '0')}e${String(episode).padStart(2, '0')}`;
  const pretty = show.replace(/\b\w/g, (c) => c.toUpperCase());
  return { key: `${slug}-${code}`, title: `${pretty} ${code.toUpperCase()}` };
}

export async function listLibrary(): Promise<LibraryEntry[]> {
  const r = await get<LibraryEntry[]>(INDEX_KEY);
  return r[INDEX_KEY] ?? [];
}

export async function saveSubtitle(
  filename: string,
  content: string,
): Promise<LibraryEntry | { error: string }> {
  const id = episodeFromFilename(filename);
  if (!id) return { error: `Could not read season/episode from "${filename}" (expected e.g. Deadwood.S01E02.srt)` };
  const cues = parseCues(content);
  if (cues.length < 20) return { error: `"${filename}" has only ${cues.length} readable subtitle lines` };

  const stored: StoredCues = cues.map((c) => [c.start, c.end, c.text]);
  const entry: LibraryEntry = { key: id.key, title: id.title, cueCount: cues.length, addedAt: Date.now() };
  const index = (await listLibrary()).filter((e) => e.key !== entry.key);
  index.push(entry);
  index.sort((a, b) => a.key.localeCompare(b.key));
  await set({ [trackKey(entry.key)]: stored, [INDEX_KEY]: index });
  return entry;
}

export async function removeSubtitle(key: string): Promise<void> {
  const area = storage();
  if (!area) return;
  const index = (await listLibrary()).filter((e) => e.key !== key);
  await new Promise<void>((resolve) => area.remove(trackKey(key), () => resolve()));
  await set({ [INDEX_KEY]: index });
}

export async function loadTracks(): Promise<Track[]> {
  const index = await listLibrary();
  if (index.length === 0) return [];
  const data = await get<StoredCues>(index.map((e) => trackKey(e.key)));
  const tracks: Track[] = [];
  for (const e of index) {
    const stored = data[trackKey(e.key)];
    if (!stored) continue;
    tracks.push({
      key: e.key,
      title: e.title,
      cues: stored.map(([start, end, text]) => ({ start, end, text })),
    });
  }
  return tracks;
}
