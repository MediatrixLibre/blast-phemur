// Local regression on real subtitle files. Skipped when ~/subtitles/deadwood is absent
// (fetch with: python3 -m src.batch.episode_fetcher, see packages/ai-pipeline).
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseCues } from '../src/subtitles/srt.js';
import { compileSegments } from '../src/subtitles/compile.js';
import { Anchor, CueIndex, type Track } from '../src/subtitles/anchor.js';
import { episodeFromFilename } from '../src/subtitles/library.js';

const dir = join(homedir(), 'subtitles', 'deadwood');
const have = existsSync(dir) && readdirSync(dir).some((f) => f.endsWith('.srt'));

describe.skipIf(!have)('real Deadwood subtitles', () => {
  const files = have ? readdirSync(dir).filter((f) => f.endsWith('.srt')).sort() : [];
  const tracks: Track[] = files.map((f) => {
    const id = episodeFromFilename(f)!;
    return { key: id.key, title: id.title, cues: parseCues(readFileSync(join(dir, f), 'utf8')) };
  });

  it('parses every file into plenty of cues and finds language to filter', () => {
    for (const t of tracks) {
      expect(t.cues.length).toBeGreaterThan(300);
      expect(compileSegments(t.cues).length).toBeGreaterThan(5);
    }
    const total = tracks.reduce((n, t) => n + compileSegments(t.cues).length, 0);
    console.log(`${tracks.length} episodes, ${total} filter segments`);
  });

  it('identifies the right episode from a handful of captions, every time', () => {
    const index = new CueIndex(tracks);
    let correct = 0;
    for (const t of tracks) {
      const anchor = new Anchor(index, () => 0);
      // Spaced-out sightings from mid-episode, as a viewer joining late would give
      const long = t.cues.filter((c) => c.text.split(' ').length >= 6);
      const picks = [0.3, 0.35, 0.4, 0.45].map((p) => long[Math.floor(long.length * p)]);
      for (const c of picks) anchor.observe(c.text, c.start + 77);
      if (anchor.trackKey === t.key && anchor.locked && Math.abs(anchor.offset - 77) < 0.5) correct++;
    }
    console.log(`identified ${correct}/${tracks.length} episodes`);
    expect(correct).toBe(tracks.length);
  });
});
