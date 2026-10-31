import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Anchor, CueIndex, type Track } from '../src/subtitles/anchor.js';
import { AudioDucker } from '../src/engine/audio-ducker.js';

function track(key: string, lines: string[], step = 10): Track {
  return { key, title: key, cues: lines.map((text, i) => ({ start: step * (i + 1), end: step * (i + 1) + 3, text })) };
}
const A = track('show-s01e01', [
  'The gold in this camp belongs to the men who dig it',
  'I never asked for a partner in this business of yours',
  'You will answer for what happened at the creek yesterday',
  'Bring the wagon around before it starts to rain tonight',
  'Nobody leaves this town until the sheriff gets back here',
]);
const B = track('show-s01e02', [
  'The doctor says the fever will break by morning light',
  'A completely different conversation about horses and saddles',
  'We need to talk about the money you owe the hotel keeper',
  'Pass the whiskey and tell me about the mountain road',
  'That boy has been asking questions all over the camp today',
]);
const mk = () => new Anchor(new CueIndex([A, B]), () => 0);

describe('anchor: recap and navigation', () => {
  it('a recap of the previous episode does not trap the lock', () => {
    const an = mk();
    // "Previously on": three lines from episode 1 are shown first
    an.observe(A.cues[0].text, 5);
    an.observe(A.cues[1].text, 10);
    an.observe(A.cues[2].text, 15);
    expect(an.trackKey).toBe('show-s01e01');
    // The real episode (S01E02) begins; its captions should win
    an.observe(B.cues[0].text, 110);
    an.observe(B.cues[1].text, 120);
    expect(an.trackKey).toBe('show-s01e01'); // two sightings are not enough
    an.observe(B.cues[2].text, 130);
    expect(an.trackKey).toBe('show-s01e02');
    expect(an.locked).toBe(true);
    expect(an.offset).toBeCloseTo(100, 0);
  });

  it('stops trusting the lock when captions stop matching anything', () => {
    const an = mk();
    an.setTrack('show-s01e01');
    an.observe(A.cues[0].text, 110);
    an.observe(A.cues[1].text, 120);
    expect(an.locked).toBe(true);
    // The page moved on to a show we have no subtitles for
    for (let i = 0; i < 8; i++) an.observe(`Something entirely unrelated being said here number ${i}x`, 200 + i * 5);
    expect(an.locked).toBe(false);
  });

  it('ignores short unmatched lines when counting misses', () => {
    const an = mk();
    an.setTrack('show-s01e01');
    an.observe(A.cues[0].text, 110);
    an.observe(A.cues[1].text, 120);
    for (let i = 0; i < 20; i++) an.observe('Yes sir', 130 + i);
    expect(an.locked).toBe(true);
  });
});

describe('anchor: caption quirks', () => {
  it('one caption lingering on screen is a single sighting', () => {
    const an = mk();
    for (let i = 0; i < 6; i++) an.observe(A.cues[0].text, 110 + i * 0.5);
    expect(an.trackKey).toBeNull(); // needs three DIFFERENT lines
  });

  it('speaker labels and sound notes do not break matching', () => {
    const an = mk();
    an.setTrack('show-s01e01');
    an.observe('>> SWEARENGEN: The gold in this camp belongs to the men who dig it', 110);
    an.observe('[MUSIC] I never asked for a partner in this business of yours (laughs)', 120);
    expect(an.locked).toBe(true);
    expect(an.offset).toBeCloseTo(100, 0);
  });

  it('a growing caption keeps the earliest sighting (never biased late)', () => {
    const an = mk();
    an.setTrack('show-s01e01');
    const words = A.cues[0].text.split(' ');
    // Word-by-word roll-up: the full text only exists 3s into the cue
    for (let n = 4; n <= words.length; n++) an.observe(words.slice(0, n).join(' '), 110 + (n - 4) * 0.5);
    an.observe(A.cues[1].text, 120);
    expect(an.locked).toBe(true);
    expect(an.offset).toBeCloseTo(100, 0); // not 101.5
  });

  it('tracks gradual drift between a subtitle release and the video', () => {
    const long = track('drift', Array.from({ length: 60 }, (_, i) => `Unique line number ${i} about subject ${i * 7} and thing ${i * 13} here`), 4);
    let t = 0;
    const an = new Anchor(new CueIndex([long]), () => t);
    an.setTrack('drift');
    // 4% slower video (23.976 vs 25 fps): offset creeps up 0.16s per 4s line
    long.cues.forEach((c, i) => {
      t += 4_000;
      an.observe(c.text, c.start * 1.04 + 10);
    });
    expect(an.locked).toBe(true);
    const expected = long.cues[59].start * 0.04 + 10;
    expect(Math.abs(an.offset - expected)).toBeLessThan(1.5);
  });
});

describe('audio ducker', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const fakeVideo = (v: Partial<{ volume: number; muted: boolean }> = {}) =>
    ({ volume: 0.8, muted: false, ...v }) as unknown as HTMLVideoElement;

  it('restores the exact volume after a duck', () => {
    const v = fakeVideo();
    const d = new AudioDucker(v, () => 50);
    d.duck();
    vi.advanceTimersByTime(100);
    expect(v.muted).toBe(true);
    d.restore();
    vi.advanceTimersByTime(100);
    expect(v.muted).toBe(false);
    expect(v.volume).toBeCloseTo(0.8, 5);
  });

  it('leaves a video the viewer muted still muted', () => {
    const v = fakeVideo({ muted: true });
    const d = new AudioDucker(v, () => 50);
    d.duck();
    vi.advanceTimersByTime(100);
    d.restore();
    vi.advanceTimersByTime(100);
    expect(v.muted).toBe(true);
    expect(v.volume).toBeCloseTo(0.8, 5);
  });

  it('rapid duck/restore cycles never ratchet the volume down', () => {
    const v = fakeVideo({ volume: 1 });
    const d = new AudioDucker(v, () => 50);
    for (let i = 0; i < 30; i++) {
      d.duck();
      vi.advanceTimersByTime(7); // mid-fade
      d.restore();
      vi.advanceTimersByTime(13); // mid-fade-in
    }
    vi.advanceTimersByTime(200);
    expect(v.muted).toBe(false);
    expect(v.volume).toBeCloseTo(1, 5);
  });

  it('zero fade time still works', () => {
    const v = fakeVideo();
    const d = new AudioDucker(v, () => 0);
    d.duck();
    expect(v.muted).toBe(true);
    d.restore();
    expect(v.muted).toBe(false);
    expect(v.volume).toBe(0.8);
  });
});

import { pacing, compileSegments } from '../src/subtitles/compile.js';
import { episodeFromFilename } from '../src/subtitles/library.js';
import { parseCues } from '../src/subtitles/srt.js';

describe('compile pacing', () => {
  it('a word after a full stop lands later than a plain proportional split', () => {
    const t = 'Well. Shit that was fast';
    const cum = pacing(t);
    const at = t.indexOf('Shit');
    expect(cum[at] / cum[t.length]).toBeGreaterThan(at / t.length);
  });
  it('long lines get wider padding than short ones', () => {
    const mk = (end: number) => compileSegments([{ start: 0, end, text: 'Well shit that was fast' }])[0];
    const short = mk(2), long = mk(7);
    expect(long.end - long.start).toBeGreaterThan(short.end - short.start);
  });
  it('copes with overlapping and duplicate cues', () => {
    const srt = `1\n00:00:01,000 --> 00:00:04,000\nWell shit\n\n2\n00:00:02,000 --> 00:00:05,000\nWell shit\n\n3\n00:00:02,000 --> 00:00:05,000\nWell shit\n`;
    const segs = compileSegments(parseCues(srt));
    expect(segs.length).toBeGreaterThan(0);
    for (let i = 1; i < segs.length; i++) expect(segs[i].start).toBeGreaterThanOrEqual(segs[i - 1].start);
  });
});

describe('parsing odd input', () => {
  it('WebVTT with ids, settings and a header', () => {
    const vtt = `WEBVTT\n\nintro\n00:01.000 --> 00:03.500 align:start position:0%\n<v Bob>What the fuck</v>\n`;
    const cues = parseCues(vtt);
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe('What the fuck');
    expect(cues[0].end).toBeCloseTo(3.5);
  });
  it('byte-order mark, CRLF and a missing final newline', () => {
    const srt = '﻿1\r\n00:00:01,000 --> 00:00:02,000\r\nHello there friend\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nGoodbye';
    expect(parseCues(srt)).toHaveLength(2);
  });
  it('season/episode filename forms', () => {
    expect(episodeFromFilename('Deadwood Season 1 Episode 2.srt')?.key).toBe('deadwood-s01e02');
    expect(episodeFromFilename('Deadwood - S02E11 - Title.en.srt')?.key).toBe('deadwood-s02e11');
    expect(episodeFromFilename('Deadwood.The.Movie.srt')).toBeNull();
  });
});
