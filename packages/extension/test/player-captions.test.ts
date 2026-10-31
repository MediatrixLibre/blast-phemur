import { describe, it, expect } from 'vitest';
import { cuesFromJson3, pickTrack } from '../src/subtitles/json3.js';
import { Anchor, CueIndex, type Track } from '../src/subtitles/anchor.js';

const event = (tStartMs: number, dDurationMs: number | undefined, text: string) => ({
  tStartMs,
  ...(dDurationMs === undefined ? {} : { dDurationMs }),
  segs: [{ utf8: text }],
});

describe('player caption track (json3)', () => {
  it('turns events into cues on the video clock', () => {
    const cues = cuesFromJson3({
      events: [event(5922, 6215, 'You hear what I said?'), event(12200, 2000, '[MUSIC]'), event(15000, 1500, 'Get on with it.\n')],
    });
    expect(cues).toEqual([
      { start: 5.922, end: 12.137, text: 'You hear what I said?' },
      { start: 15, end: 16.5, text: 'Get on with it.' },
    ]);
  });

  it('skips window-setup events with no text and sorts by start', () => {
    const cues = cuesFromJson3({ events: [{ tStartMs: 0, dDurationMs: 100 }, event(9000, 1000, 'later'), event(1000, 1000, 'earlier')] });
    expect(cues.map((c) => c.text)).toEqual(['earlier', 'later']);
  });

  it('gives a cue without a duration the gap to the next one, or a short default', () => {
    const cues = cuesFromJson3({ events: [event(1000, undefined, 'one'), event(2500, undefined, 'two')] });
    expect(cues[0].end).toBeCloseTo(2.5);
    expect(cues[1].end).toBeCloseTo(5.5);
  });

  it('copes with nothing at all', () => {
    expect(cuesFromJson3(null)).toEqual([]);
    expect(cuesFromJson3({})).toEqual([]);
  });
});

describe('choosing the player caption track', () => {
  const tracks = [
    { languageCode: 'es-419', vssId: '.es-419.a' },
    { languageCode: 'en-US', vssId: '.en-US.a' },
    { languageCode: 'en-US', vssId: 'c.en-US.a' },
    { languageCode: 'en', vssId: 'a.en', kind: 'asr' },
  ];

  it('takes exactly what the viewer is watching', () => {
    expect(pickTrack(tracks, { vss_id: 'c.en-US.a' }, 'es')?.vssId).toBe('c.en-US.a');
  });
  it('falls back to the language on screen', () => {
    expect(pickTrack(tracks, { languageCode: 'es-419' }, 'en')?.vssId).toBe('.es-419.a');
  });
  it('with captions off, uses the browser language, then English', () => {
    expect(pickTrack(tracks, {}, 'es-419')?.languageCode).toBe('es-419');
    expect(pickTrack(tracks, {}, 'fr-FR')?.languageCode).toBe('en-US');
  });
  it('prefers hand-made over auto-generated', () => {
    expect(pickTrack([{ languageCode: 'en', kind: 'asr' }, { languageCode: 'en' }], {}, 'en')?.kind).toBeUndefined();
  });
  it('returns null when there are no tracks', () => {
    expect(pickTrack([], {}, 'en')).toBeNull();
  });
});

describe('anchor pinned to the player track', () => {
  const track: Track = {
    key: 'player:abc',
    title: 'p',
    cues: [
      { start: 10, end: 13, text: 'you hear what i said to you' },
      { start: 20, end: 23, text: 'the sheriff is coming this way' },
    ],
  };
  const make = () => {
    const a = new Anchor(new CueIndex([track]));
    a.pin(track.key, 0);
    return a;
  };

  it('is locked at once, with no caption on screen', () => {
    const a = make();
    expect(a.locked).toBe(true);
    expect(a.trackKey).toBe('player:abc');
    expect(a.offset).toBe(0);
  });

  it('matching captions never move the offset', () => {
    const a = make();
    // Seen 1.4 s late, like a real caption drawn after the word started
    a.observe('You hear what I said to you', 11.4);
    a.observe('The sheriff is coming this way', 21.6);
    expect(a.offset).toBe(0);
    expect(a.locked).toBe(true);
  });

  it('lets go after a run of lines that match nothing, and comes back on a match', () => {
    const a = make();
    let changed = false;
    for (let i = 0; i < Anchor.MAX_MISSES; i++) changed = a.observe('completely different words appear on screen now', 30 + i);
    expect(changed).toBe(true);
    expect(a.locked).toBe(false);
    expect(a.observe('the sheriff is coming this way', 21)).toBe(true);
    expect(a.locked).toBe(true);
    expect(a.offset).toBe(0);
  });

  it('a stray unmatched line does not unlock', () => {
    const a = make();
    for (let i = 0; i < Anchor.MAX_MISSES - 1; i++) a.observe('completely different words appear on screen now', 30 + i);
    expect(a.locked).toBe(true);
    a.observe('you hear what i said to you', 10.5);
    for (let i = 0; i < Anchor.MAX_MISSES - 1; i++) a.observe('completely different words appear on screen now', 40 + i);
    expect(a.locked).toBe(true);
  });
});
