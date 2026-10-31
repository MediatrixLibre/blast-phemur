import { describe, it, expect } from 'vitest';
import { collapseCues, carriedOver, compileLines, plainText, type RawCue } from '../src/subtitles/text-track.js';

/** Roll-up as DirecTV sends it: one cue per typed letter, 33 ms apart */
function typed(text: string, at: number, base = ''): RawCue[] {
  const out: RawCue[] = [];
  for (let i = base.length + 1; i <= text.length; i++) {
    const start = at + (i - base.length - 1) * 0.033;
    out.push({ start, end: start + 0.033, text: text.slice(0, i) });
  }
  return out;
}

describe('roll-up captions', () => {
  it('joins letter-by-letter cues into one line and keeps when each letter came', () => {
    const lines = collapseCues(typed('PRO FOR THE JOB', 100));
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe('PRO FOR THE JOB');
    expect(lines[0].rollUp).toBe(true);
    expect(lines[0].marks[12]).toBeCloseTo(100 + 12 * 0.033, 3);
  });

  it('times a word by when it was typed, starting the mute ahead for the captioner delay', () => {
    // Typed from 200 s; "JESUS" is letters 6..10, so it starts at 200 + 6 * 0.033
    const lines = collapseCues(typed('WELL, JESUS, LOOK AT THAT', 200));
    const segs = compileLines(lines, { leadS: 3, padAfter: 0.5, sacredExtra: 1 });
    expect(segs).toHaveLength(1);
    const typedAt = 200 + 6 * 0.033;
    expect(segs[0].start).toBeCloseTo(typedAt - 3 - 1, 2);
    expect(segs[0].end).toBeGreaterThan(200 + 10 * 0.033 + 0.5);
  });

  it('does not count a word twice when the rows scroll up', () => {
    const first = 'WHAT THE HELL\nWAS THAT';
    const second = 'WAS THAT\nA FUMBLE';
    const cues = [...typed(first, 10), ...typed(second, 12, 'WAS THAT\n')];
    // The second line arrives with its carried-over row already on screen
    cues.splice(first.length, 0, { start: 11.9, end: 12, text: 'WAS THAT\n' });
    const lines = collapseCues(cues);
    expect(lines.map((l) => l.text)).toEqual([first, second]);
    expect(lines[1].fresh).toBe('WAS THAT\n'.length);
    expect(compileLines(lines).filter((s) => s.words?.[0]?.toLowerCase() === 'hell')).toHaveLength(1);
  });

  it('reads the escapes DirecTV sends', () => {
    expect(plainText('&gt;&gt; WELL RIGHT THERE <c.yellow>VIRGINIA</c>')).toBe('>> WELL RIGHT THERE VIRGINIA');
  });

  it('finds the carried-over rows', () => {
    expect(carriedOver('A B\nC D', 'C D\nE F')).toBe(4);
    expect(carriedOver('A B\nC D', 'E F\nG H')).toBe(0);
    expect(carriedOver(undefined, 'E F')).toBe(0);
  });
});

describe('pop-on captions in a text track', () => {
  it('go through the ordinary subtitle compiler', () => {
    const lines = collapseCues([
      { start: 50, end: 53, text: "Jesus, Al, Jesus,\nwith all that's goin' on?" },
      { start: 53.1, end: 55, text: 'How would that sit?' },
    ]);
    expect(lines.every((l) => !l.rollUp)).toBe(true);
    const segs = compileLines(lines);
    expect(segs).toHaveLength(1);
    // Sacred name: the whole line, as for any subtitle file
    expect(segs[0].start).toBeLessThanOrEqual(49.7);
    expect(segs[0].end).toBeGreaterThanOrEqual(53.3);
  });
});

describe('TextTrackFeed', () => {
  // A stand-in for the video: only what the feed touches
  function fakeVideo() {
    const track = { kind: 'subtitles', mode: 'showing', cues: [] as { startTime: number; endTime: number; text: string }[] };
    const video = {
      textTracks: [track],
      addEventListener: () => {},
      removeEventListener: () => {},
    } as unknown as HTMLVideoElement;
    const load = (cues: [number, number, string][]) => {
      track.cues = cues.map(([startTime, endTime, text]) => ({ startTime, endTime, text }));
    };
    return { video, load };
  }

  it('reads a part it has not seen when the viewer jumps back to it', async () => {
    const { DEFAULT_CONFIG } = await import('@guardianstream/types');
    const { TextTrackFeed } = await import('../src/subtitles/text-track.js');
    const { video, load } = fakeVideo();
    let last: { start: number; words?: string[] }[] = [];
    const feed = new TextTrackFeed(video, () => 'k', () => 't', () => ({ ...DEFAULT_CONFIG, censorCaptions: false }), (_t, segs) => { last = segs; });

    // Started midway through the movie
    load([[600, 602, 'Why, you son of a bitch!'], [603, 605, 'Easy now.']]);
    feed.read();
    expect(last.map((s) => s.words?.[0]?.toLowerCase())).toEqual(['bitch']);

    // Rewound to the start: earlier cues, never read before
    load([[100, 102, 'Well, damn.'], [103, 105, 'Get the horses.']]);
    feed.read();
    const words = last.map((s) => s.words?.[0]?.toLowerCase());
    expect(words).toContain('damn');
    expect(words).toContain('bitch');

    // Played back over the same part again: nothing doubled
    feed.read();
    expect(last.filter((s) => s.words?.[0]?.toLowerCase() === 'damn')).toHaveLength(1);
  });
});
