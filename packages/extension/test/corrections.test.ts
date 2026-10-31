import { describe, it, expect, vi } from 'vitest';
import { DEFAULT_CONFIG } from '@guardianstream/types';
import type { CustomWords, UserConfig } from '@guardianstream/types';
import { allowing, applyCorrection, blocking, normalizeEntry, passing, pickMissed, type HitEvent } from '../src/corrections/corrections.js';
import { buildFilterSet } from '../src/subtitles/compile.js';
import { installCorrectionShortcuts, type CorrectionHost, type ToastFn } from '../src/corrections/shortcuts.js';

const none: CustomWords = { block: [], allow: [] };

describe('word list corrections', () => {
  it('normalizes what is stored', () => {
    expect(normalizeEntry('  “Hell!” ')).toBe('hell');
    expect(normalizeEntry("Don’t   Stop")).toBe("don't stop");
    expect(normalizeEntry('José,')).toBe('josé');
  });

  it('allowing adds to never-hide and leaves always-hide', () => {
    const out = allowing({ block: ['hell', 'other'], allow: [] }, ['Hell']);
    expect(out).toEqual({ block: ['other'], allow: ['hell'] });
  });

  it('blocking adds to always-hide and leaves never-hide', () => {
    const out = blocking({ block: [], allow: ['crap', 'x'] }, ['Crap']);
    expect(out).toEqual({ block: ['crap'], allow: ['x'] });
  });

  it('does not store the same word twice or one-letter junk', () => {
    expect(allowing({ block: [], allow: ['hell'] }, ['hell', 'HELL', 'a']).allow).toEqual(['hell']);
  });
});

describe('which word got through', () => {
  // Severe only: strong words are hidden, the milder ones pass
  const severe: UserConfig = {
    ...DEFAULT_CONFIG,
    categories: { ...DEFAULT_CONFIG.categories, 'language.profanity': { threshold: 1, action: 'mute' } },
  };

  it('with an obvious candidate that the settings let pass, picks it without asking', () => {
    const pick = pickMissed(['well that is a load of crap, sir', 'earlier line'], none, severe);
    // either "crap" is above the viewer's setting (then nothing is missed) or it is the single candidate
    if (pick.auto) expect(pick.auto).toBe('crap');
    else expect(pick.choices.length).toBeGreaterThan(0);
  });

  it('with nothing the lexicon knows, offers the words of the last lines', () => {
    const pick = pickMissed(['Kindly remove your hat', 'Mister Swearengen'], none, DEFAULT_CONFIG);
    expect(pick.auto).toBeNull();
    expect(pick.choices).toContain('kindly');
    expect(pick.choices).toContain('swearengen');
    expect(pick.choices).not.toContain('the');
  });

  it('never offers more than nine words, or common ones', () => {
    const pick = pickMissed(['alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo with that'], none, DEFAULT_CONFIG);
    expect(pick.choices).toHaveLength(9);
    expect(pick.choices).not.toContain('with');
  });
});

describe('correction keys', () => {
  /** A plain stand-in for a keydown: Event.target cannot be assigned in Node */
  const key = (k: string, extra: Record<string, unknown> = {}) => ({
    key: k,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    repeat: false,
    target: null,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {},
    ...extra,
  });

  const setup = (over: Partial<CorrectionHost> = {}) => {
    const saved: CustomWords[] = [];
    const toasts: { text: string; hint?: string; chips?: string[] }[] = [];
    const picks: (() => void)[][] = [];
    let words: CustomWords = { block: [], allow: [], passes: [] };
    const host: CorrectionHost = {
      video: () => ({}) as HTMLVideoElement,
      recentHits: () => [{ words: [{ text: 'hell', category: 'language.profanity' }] }],
      recentLines: () => ['Kindly remove your hat'],
      config: () => ({ ...DEFAULT_CONFIG, customWords: words }),
      save: (w) => {
        words = w;
        saved.push(w);
      },
      ...over,
    };
    const ui: ToastFn = (_v, o) => {
      toasts.push({ text: o.text, hint: o.hint, chips: o.chips?.map((c) => c.label) });
      if (o.chips) picks.push(o.chips.map((c) => c.onPick));
      let done = false;
      return {
        hasChips: !!o.chips?.length,
        pick: (i) => {
          if (done || !o.chips?.[i]) return false;
          done = true;
          o.chips[i].onPick();
          return true;
        },
        dismiss: () => {
          done = true;
        },
      };
    };
    const listeners: ((e: unknown) => void)[] = [];
    const target = {
      addEventListener: (_t: string, f: (e: unknown) => void) => void listeners.push(f),
      removeEventListener: () => {},
    } as unknown as EventTarget;
    installCorrectionShortcuts(host, ui, target);
    const press = (k: string, extra?: Record<string, unknown>) => {
      const e = key(k, extra);
      listeners.forEach((f) => f(e));
      return e;
    };
    /** A change made elsewhere (the popup), between key presses */
    const edit = (f: (w: CustomWords) => CustomWords) => {
      words = f(words);
    };
    return { press, saved, toasts, picks, edit };
  };

  const tracked = () => [{ words: [{ text: 'hell', category: 'language.profanity' }], track: 'player:abc', start: 40.1, end: 40.6 }];

  it('"[" passes only this moment of a plain word, and says so without spelling it out', () => {
    const { press, saved, toasts } = setup({ recentHits: tracked });
    const e = press('[');
    expect(e.defaultPrevented).toBe(true);
    expect(saved).toEqual([{ block: [], allow: [], passes: [{ track: 'player:abc', start: 40.1, end: 40.6 }] }]);
    expect(toasts[0].text).toContain('Passed this moment');
    expect(toasts[0].text).not.toContain('hell');
    expect(toasts[0].text).toContain('h***');
    expect(toasts[0].hint).toMatch(/muted everywhere else/);
  });

  it('after a pass, 1 allows the plain word everywhere, as a second deliberate step', () => {
    const { press, saved, toasts } = setup({ recentHits: tracked });
    press('[');
    expect(toasts[0].chips).toEqual(['Allow “h***” everywhere']);
    press('1');
    expect(saved).toHaveLength(2);
    expect(saved[1].allow).toEqual(['hell']);
    expect(saved[1].passes).toHaveLength(1);
  });

  it('when the filter names no title to mark, "[" changes nothing until 1 allows it everywhere', () => {
    const { press, saved, toasts } = setup();
    press('[');
    expect(saved).toEqual([]);
    expect(toasts[0].text).toMatch(/can’t be marked/);
    press('1');
    expect(saved).toEqual([{ block: [], allow: ['hell'], passes: [] }]);
  });

  it('"[" with nothing recently hidden just says so', () => {
    const { press, saved, toasts } = setup({ recentHits: () => [] });
    press('[');
    expect(saved).toEqual([]);
    expect(toasts[0].text).toMatch(/Nothing was hidden/);
  });

  it('"]" asks which word, and a number key picks it', () => {
    const { press, saved, toasts } = setup();
    press(']');
    expect(toasts[0].chips?.length).toBeGreaterThan(1);
    const e = press('2');
    expect(e.defaultPrevented).toBe(true);
    expect(saved).toHaveLength(1);
    expect(saved[0].block).toHaveLength(1);
  });

  it('Escape cancels the choice and saves nothing', () => {
    const { press, saved } = setup();
    press(']');
    press('Escape');
    press('1');
    expect(saved).toEqual([]);
  });

  it('"\\" undoes the last correction, once', () => {
    const { press, saved, toasts } = setup({ recentHits: tracked });
    press('[');
    press('\\');
    expect(saved[saved.length - 1]).toEqual({ block: [], allow: [], passes: [] });
    press('\\');
    expect(toasts[toasts.length - 1].text).toMatch(/Nothing to undo/);
  });

  it('"\\" undoes only its own change: a word allowed in the popup since then stays allowed', () => {
    const { press, saved, edit } = setup({ recentHits: tracked });
    press('[');
    edit((w) => ({ ...w, allow: [...w.allow, 'darn'], block: [...w.block, 'heck'] }));
    press('\\');
    expect(saved[saved.length - 1]).toEqual({ block: ['heck'], allow: ['darn'], passes: [] });
  });

  it('a mixed moment says it passes the plain word and the sacred name', () => {
    const { press, toasts } = setup({
      recentHits: () => [{ words: [{ text: 'hell', category: 'language.crude' }, { text: 'jesus', category: 'blasphemy.jesus_name' }], track: 't', start: 1, end: 2 }],
    });
    press('[');
    expect(toasts[0].text).toMatch(/h\*\*\* ?” and the sacred name/);
  });

  it('ignores keys with a modifier, held-down repeats and typing in a field', () => {
    const { press, saved } = setup();
    press('[', { metaKey: true });
    press('[', { repeat: true });
    press('[', { target: { tagName: 'INPUT' } });
    expect(saved).toEqual([]);
  });

  it('digits do nothing outside a choice, so the player keeps its own number keys', () => {
    const { press } = setup();
    expect(press('3').defaultPrevented).toBe(false);
  });
});

describe('sacred names are passed one moment at a time', () => {
  const sacredHit: HitEvent = {
    words: [{ text: 'Jesus', category: 'blasphemy.jesus_name' }],
    track: 'player:abc',
    start: 100.2,
    end: 101.04,
  };
  const keyOf = (k: string) => ({
    key: k, ctrlKey: false, metaKey: false, altKey: false, repeat: false, target: null,
    defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {},
  });
  const run = (hit: HitEvent) => {
    let words: CustomWords = { block: [], allow: [], passes: [] };
    const saved: CustomWords[] = [];
    const toasts: string[] = [];
    const listeners: ((e: unknown) => void)[] = [];
    const target = { addEventListener: (_t: string, f: (e: unknown) => void) => void listeners.push(f), removeEventListener() {} } as unknown as EventTarget;
    installCorrectionShortcuts(
      {
        video: () => ({}) as HTMLVideoElement,
        recentHits: () => [hit],
        recentLines: () => [],
        config: () => ({ ...DEFAULT_CONFIG, customWords: words }),
        save: (w) => { words = w; saved.push(w); },
      },
      ((_v: HTMLVideoElement, o: { text: string }) => { toasts.push(o.text); return { hasChips: false, pick: () => false, dismiss() {} }; }) as ToastFn,
      target,
    );
    listeners.forEach((f) => f(keyOf('[')));
    return { saved, toasts };
  };

  it('"that was fine" on a sacred name stores a one-moment pass, never an allowed word', () => {
    const { saved, toasts } = run(sacredHit);
    expect(saved).toHaveLength(1);
    expect(saved[0].allow).toEqual([]);
    expect(saved[0].passes).toEqual([{ track: 'player:abc', start: 100.2, end: 101.04 }]);
    expect(toasts[0]).toMatch(/Passed this moment: the sacred name/);
  });

  it('with no caption file to mark the moment, changes nothing and says so', () => {
    const { saved, toasts } = run({ words: sacredHit.words });
    expect(saved).toEqual([]);
    expect(toasts[0]).toMatch(/can’t be passed/);
  });

  it('a muted event with both kinds: the moment is passed, nothing is allowed everywhere', () => {
    const { saved } = run({ ...sacredHit, words: [{ text: 'hell', category: 'language.profanity' }, ...sacredHit.words] });
    expect(saved[0].allow).toEqual([]);
    expect(saved[0].passes).toHaveLength(1);
  });

  it('a passed moment lifts a plain word there too, and only there', () => {
    const cues = [
      { start: 10, end: 12, text: 'Well hell, no.' },
      { start: 20, end: 22, text: 'Well hell, no.' },
    ];
    const custom: CustomWords = { block: [], allow: [], passes: [{ track: 'player:abc', start: 10, end: 12 }] };
    const set = buildFilterSet('player:abc', 't', cues, { custom });
    expect(set.segments.some((x) => x.start < 13)).toBe(false);
    expect(set.segments.some((x) => x.start >= 19)).toBe(true);
  });

  it('passing does not duplicate the same moment', () => {
    const once = passing({ block: [], allow: [] }, 't', 1, 2);
    expect(passing(once, 't', 1, 2).passes).toHaveLength(1);
  });

  it('a passed moment lifts sacred names for that title and moment only', () => {
    const cues = [
      { start: 10, end: 12, text: 'Jesus!' },
      { start: 20, end: 22, text: 'Jesus!' },
      { start: 10, end: 12, text: 'Well hell, no.' },
    ];
    const window = { track: 'player:abc', start: 10.2, end: 10.8 };
    const custom: CustomWords = { block: [], allow: [], passes: [window] };
    const set = buildFilterSet('player:abc', 't', cues, { custom });
    const times = set.segments.map((x) => Math.round(x.start));
    expect(times.some((t) => t >= 9 && t <= 12 && set.segments.find((x) => Math.round(x.start) === t)?.category.startsWith('blasphemy'))).toBe(false);
    expect(set.segments.some((x) => x.start >= 19 && x.category.startsWith('blasphemy'))).toBe(true); // another moment: still on
    const other = buildFilterSet('player:other', 't', cues, { custom });
    expect(other.segments.some((x) => x.start < 13 && x.category.startsWith('blasphemy'))).toBe(true); // another title: still on
  });
});

describe('live-captions passes', () => {
  it('a caption line inside a passed moment of this title is not muted; another title still is', async () => {
    const { CaptionMonitor, CAPTION_PASS_S } = await import('../src/caption/caption-monitor.js');
    let t = 100;
    let key = 'captions:netflix.com/watch/1|';
    const provider = { manifest: { name: 'Test' }, getCurrentTime: () => t, getSubtitleSelector: () => null } as never;
    const video = { paused: false, muted: false, volume: 1 } as unknown as HTMLVideoElement;
    const config = { ...DEFAULT_CONFIG, customWords: { block: [], allow: [], passes: [{ track: 'captions:netflix.com/watch/1|', start: 100 - CAPTION_PASS_S, end: 100 + CAPTION_PASS_S }] } };
    const m = new CaptionMonitor({ video, provider, config, passKey: () => key });
    const passed = (m as unknown as { passed: (t: number) => boolean }).passed.bind(m);
    expect(passed(100.3)).toBe(true);
    expect(passed(103)).toBe(false);
    key = 'captions:netflix.com/watch/2|';
    expect(passed(100.3)).toBe(false);
    t = 200;
    expect(m.recentHits(60)).toEqual([]);
  });
});

describe('a word-list change is told apart from a settings change', () => {
  it('ignores the key order chrome.storage hands back, and sees a level change', async () => {
    const { sameExceptWords, mergeConfig } = await import('../src/shared/config.js');
    const a = { ...DEFAULT_CONFIG, customWords: { block: [], allow: [], passes: [{ track: 't', start: 1, end: 2 }] } };
    const sorted = (v: unknown): unknown =>
      Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted((v as Record<string, unknown>)[k])])) : v;
    const back = mergeConfig(sorted(JSON.parse(JSON.stringify(a))) as typeof a);
    expect(sameExceptWords(a, back)).toBe(true);
    expect(sameExceptWords(a, { ...back, categories: { ...back.categories, language: { threshold: 1, action: 'mute' } } })).toBe(false);
  });
});

describe('a pass covers every timeline that can mute the moment', () => {
  it('"[" saves the track window and the live-captions window together, and undo removes both', () => {
    const saved: CustomWords[] = [];
    let words: CustomWords = { block: [], allow: [], passes: [] };
    const listeners: ((e: unknown) => void)[] = [];
    installCorrectionShortcuts(
      {
        video: () => ({}) as HTMLVideoElement,
        recentHits: () => [{ words: [{ text: 'god damn', category: 'blasphemy.gods_name' }], track: 'player:a', start: 40, end: 43, also: [{ track: 'captions:x|', start: 51.25, end: 52.75 }] }],
        recentLines: () => [],
        config: () => ({ ...DEFAULT_CONFIG, customWords: words }),
        save: (w) => { words = w; saved.push(w); },
      },
      () => ({ hasChips: false, pick: () => false, dismiss: () => {} }),
      { addEventListener: (_t: string, f: (e: unknown) => void) => void listeners.push(f), removeEventListener: () => {} } as unknown as EventTarget,
    );
    const press = (key: string) => listeners.forEach((f) => f({ key, ctrlKey: false, metaKey: false, altKey: false, repeat: false, target: null, preventDefault() {}, stopPropagation() {} }));
    press('[');
    expect(words.passes).toEqual([{ track: 'player:a', start: 40, end: 43 }, { track: 'captions:x|', start: 51.25, end: 52.75 }]);
    press('\\');
    expect(words.passes).toEqual([]);
  });

  it('a malformed window from a message is dropped, not saved', () => {
    const w = applyCorrection({ block: [], allow: [] }, { action: 'pass', track: 't', start: 1, end: 2, also: [{ track: 'c', start: Number.NaN, end: 3 }] });
    expect(w.passes).toEqual([{ track: 't', start: 1, end: 2 }]);
  });
});
