import { describe, it, expect } from 'vitest';
import { describeStatus } from '../src/popup/status-copy.js';
import { matchesPattern, type FilterStatus } from '../src/popup/hooks/useStatus.js';

const base: FilterStatus = { provider: 'YouTube TV', segmentCount: 0, isFiltering: false, title: null };

describe('describeStatus', () => {
  it('off offers to turn on, whatever the tab', () => {
    const c = describeStatus('connected', base, false);
    expect(c.action?.kind).toBe('enable');
    expect(c.tone).toBe('off');
  });

  it('a stale tab says why and offers a reload, never "no video"', () => {
    const c = describeStatus('disconnected', base, true);
    expect(c.title).toMatch(/reload/i);
    expect(c.detail).toMatch(/installed or updated/);
    expect(c.action?.kind).toBe('reload');
    expect(c.tone).toBe('attention');
  });

  it('an unsupported page names the sites instead of blaming the video', () => {
    const c = describeStatus('unsupported', base, true);
    expect(c.detail).toMatch(/YouTube TV/);
    expect(c.action).toBeUndefined();
  });

  it('captions mode with no captions read asks for CC, and is not called protected', () => {
    const c = describeStatus('connected', { ...base, mode: 'captions', captionLines: 0 }, true);
    expect(c.title).toMatch(/CC/);
    expect(c.title).not.toMatch(/protected/i);
    expect(c.tone).toBe('attention');
  });

  it('live captions say partly protected, count the mutes, and offer a subtitle file', () => {
    const c = describeStatus('connected', { ...base, mode: 'captions', captionLines: 12, captionHits: 3, libraryCount: 0 }, true);
    expect(c.title).toBe('Partly protected');
    expect(c.detail).toContain('3 words muted so far');
    expect(c.detail).toMatch(/slip out/);
    expect(c.secondary?.kind).toBe('import');
    expect(c.tone).toBe('partial');
  });

  it('the subtitle-file link goes when the feature is off', () => {
    const c = describeStatus('connected', { ...base, mode: 'captions', captionLines: 12 }, true, { subtitleFiles: false });
    expect(c.secondary).toBeUndefined();
  });

  it('anchored says protected, names the episode and the timing source, without promising exactness', () => {
    const lib = describeStatus('connected', { ...base, mode: 'anchored', title: 'Deadwood S01E02', segmentCount: 40, source: 'library' }, true);
    expect(lib.title).toBe('Protected');
    expect(lib.context).toBe('YouTube TV · “Deadwood S01E02”');
    expect(lib.detail).toMatch(/subtitle file/);
    expect(lib.detail).toMatch(/slightly early or late/);
    expect(lib.tone).toBe('protected');
    const player = describeStatus('connected', { ...base, mode: 'anchored', title: 'Deadwood', segmentCount: 1, source: 'player' }, true);
    expect(player.detail).toMatch(/own caption track/);
  });

  it('"Protected" appears only when a filter runs on the tab', () => {
    const idle = [
      describeStatus('connected', base, true),
      describeStatus('unsupported', base, true),
      describeStatus('checking', base, true),
      describeStatus('connected', { ...base, smallVideoPlaying: true }, true),
    ];
    for (const c of idle) expect(c.title).not.toMatch(/protected/i);
  });

  it('a preview-only page says to open the show full size', () => {
    const c = describeStatus('connected', { ...base, smallVideoPlaying: true }, true);
    expect(c.title).toMatch(/preview/);
  });
});

describe('matchesPattern', () => {
  it('matches manifest patterns', () => {
    expect(matchesPattern('https://tv.youtube.com/watch/abc', 'https://tv.youtube.com/*')).toBe(true);
    expect(matchesPattern('https://www.youtube.com/watch?v=1', '*://*.youtube.com/*')).toBe(true);
    expect(matchesPattern('https://youtube.com/', '*://*.youtube.com/*')).toBe(true);
    expect(matchesPattern('https://evilyoutube.com/', '*://*.youtube.com/*')).toBe(false);
    expect(matchesPattern('brave://extensions', 'https://tv.youtube.com/*')).toBe(false);
    expect(matchesPattern('https://www.netflix.com/watch/1', 'https://tv.youtube.com/*')).toBe(false);
  });
});

describe('nothing set to mute', () => {
  it('a running filter with every group Off is never called protected, and offers one way out', async () => {
    const c = describeStatus('connected', { ...base, isFiltering: true, mode: 'anchored', source: 'player' }, true, { mutesNothing: true });
    expect(c.title).toBe('Nothing is set to mute');
    expect(c.title).not.toMatch(/protected/i);
    expect(c.tone).toBe('attention');
    expect(c.action?.kind).toBe('choose');
  });

  it('mutesAnything: groups Off and an empty list mute nothing; one word of your own is something', async () => {
    const { mutesAnything } = await import('../src/shared/selection.js');
    const { DEFAULT_CONFIG } = await import('@guardianstream/types');
    const off = { ...DEFAULT_CONFIG, categories: { blasphemy: { threshold: 0, action: 'mute' }, language: { threshold: 0, action: 'mute' } }, customWords: { block: [], allow: [] } } as typeof DEFAULT_CONFIG;
    expect(mutesAnything(off)).toBe(false);
    expect(mutesAnything({ ...off, customWords: { block: ['heck'], allow: [] } })).toBe(true);
    expect(mutesAnything(DEFAULT_CONFIG)).toBe(true);
    // A group on with every sub-category switched off mutes nothing either
    const kidsOff = { ...off, categories: { ...off.categories, language: { threshold: 3, action: 'mute' }, 'language.profanity': { threshold: 0, action: 'mute' }, 'language.slur': { threshold: 0, action: 'mute' }, 'language.crude': { threshold: 0, action: 'mute' }, 'language.sexual_reference': { threshold: 0, action: 'mute' } } } as typeof DEFAULT_CONFIG;
    expect(mutesAnything(kidsOff)).toBe(false);
  });
});

describe('Just muted rows', () => {
  it('drops a caption hit the track logged again, but keeps the same word at another moment', async () => {
    const { dedupeHits } = await import('../src/popup/components/Recent.js');
    const w = [{ text: 'hell', category: 'language.crude' }];
    const hits = [
      { words: w, track: 'player:a', start: 10, end: 10.4 },
      { words: w, track: 'captions:x|', start: 10.2, end: 11.7 },
      { words: w, track: 'captions:x|', start: 80, end: 81.5 },
    ];
    expect(dedupeHits(hits).map((h) => h.start)).toEqual([10, 80]);
  });
});
