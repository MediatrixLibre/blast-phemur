import { describe, it, expect } from 'vitest';
import { parseCues } from '../src/subtitles/srt.js';
import { compileSegments } from '../src/subtitles/compile.js';
import { Anchor, CueIndex, type Track } from '../src/subtitles/anchor.js';
import { episodeFromFilename } from '../src/subtitles/library.js';

const SRT = `1
00:00:01,000 --> 00:00:03,000
<i>You're a damn fool, Swearengen.</i>

2
00:00:04,500 --> 00:00:06,500
- [MUSIC]
- Well, shit. That was fast.

3
00:01:10,250 --> 00:01:12,000
Nothing to see here
`;

describe('parseCues', () => {
  it('parses and cleans', () => {
    const cues = parseCues(SRT);
    expect(cues).toHaveLength(3);
    expect(cues[0].text).toBe("You're a damn fool, Swearengen.");
    expect(cues[1].text).toBe('Well, shit. That was fast.');
    expect(cues[2].start).toBeCloseTo(70.25);
  });
});

describe('compileSegments', () => {
  it('places word windows inside the cue with padding', () => {
    const segs = compileSegments(parseCues(SRT));
    expect(segs).toHaveLength(2);
    const s = segs[1];
    expect(s.words).toEqual(['shit']);
    expect(s.start).toBeGreaterThan(4.0);
    expect(s.end).toBeLessThan(7.0);
    expect(s.end - s.start).toBeGreaterThanOrEqual(0.45);
  });

  // Deadwood S01E04 at 39:24, YouTube TV player track. The word estimate muted
  // 2364.70-2366.30 and the Name was still heard.
  const OATH = [{ start: 2364.78, end: 2367.87, text: "Jesus, Al, Jesus,\nwith all that's goin' on?" }];
  const lineCovered = (segs: ReturnType<typeof compileSegments>) =>
    segs.some((s) => s.start <= 2364.78 - 0.3 && s.end >= 2367.87 + 0.3);

  it('mutes the whole line around a sacred name', () => {
    expect(lineCovered(compileSegments(OATH))).toBe(true);
  });
  it('does the same when the Name comes from the always-hide list', () => {
    const custom = { allow: [], block: ['jesus', 'christ'] };
    const segs = compileSegments(OATH, { custom });
    expect(lineCovered(segs)).toBe(true);
    expect(segs[0].category).toBe('custom.word');
  });
  it('keeps word-level timing for profanity', () => {
    const segs = compileSegments([{ start: 2373.5, end: 2376.33, text: "Well, let me pose you a question\nE.B., you fuckin' cunt." }]);
    expect(segs.length).toBeGreaterThan(0);
    for (const s of segs) expect(s.end - s.start).toBeLessThan(2.83);
  });
  it('can go back to word-level timing for sacred names', () => {
    expect(lineCovered(compileSegments(OATH, { sacredWholeLine: false }))).toBe(false);
  });
});

describe('episodeFromFilename', () => {
  it('reads common patterns', () => {
    expect(episodeFromFilename('Deadwood.S01E02.1080p.WEB.srt')?.key).toBe('deadwood-s01e02');
    expect(episodeFromFilename('deadwood 1x03.srt')?.key).toBe('deadwood-s01e03');
    expect(episodeFromFilename('random.srt')).toBeNull();
  });
});

function track(key: string, lines: string[]): Track {
  return { key, title: key, cues: lines.map((text, i) => ({ start: 10 * (i + 1), end: 10 * (i + 1) + 3, text })) };
}

describe('Anchor', () => {
  const a = track('show-s01e01', [
    'The gold in this camp belongs to the men who dig it',
    'I never asked for a partner in this business',
    'You will answer for what happened at the creek',
    'Bring the wagon around before it starts to rain',
  ]);
  const b = track('show-s01e02', [
    'A completely different conversation about horses and saddles',
    'The doctor says the fever will break by morning',
    'Nobody leaves town until the sheriff gets back',
  ]);
  let clock = 0;
  const mk = () => new Anchor(new CueIndex([a, b]), () => clock);

  it('identifies the episode and locks an offset', () => {
    const an = mk();
    // video time = subtitle time + 100
    an.observe('The gold in this camp belongs to the men who dig it', 110);
    an.observe('I never asked for a partner in this business', 120);
    expect(an.locked).toBe(false);
    an.observe('You will answer for what happened at the creek', 130);
    expect(an.trackKey).toBe('show-s01e01');
    expect(an.locked).toBe(true);
    expect(an.offset).toBeCloseTo(100, 0);
  });

  it('works with masked words and partial captions', () => {
    const an = mk();
    an.setTrack('show-s01e01');
    an.observe('I never asked for a partner in this b******', 125);
    an.observe('You will answer for what happened at the creek', 135);
    expect(an.locked).toBe(true);
    expect(an.offset).toBeCloseTo(105, 0);
  });

  it('unlocks on a jump and relocks after confirmation', () => {
    const an = mk();
    an.setTrack('show-s01e01');
    an.observe('The gold in this camp belongs to the men who dig it', 110);
    an.observe('I never asked for a partner in this business', 120);
    expect(an.locked).toBe(true);
    // Stream jumps 60s ahead (ad break): one lone disagreeing sighting
    an.observe('Bring the wagon around before it starts to rain', 200);
    expect(an.locked).toBe(false);
    an.observe('You will answer for what happened at the creek', 190);
    expect(an.locked).toBe(true);
    expect(an.offset).toBeCloseTo(160, 0);
  });

  it('ignores short or unknown captions', () => {
    const an = mk();
    expect(an.observe('Yes.', 5)).toBe(false);
    expect(an.observe('Totally unrelated words that appear nowhere', 5)).toBe(false);
  });
});
