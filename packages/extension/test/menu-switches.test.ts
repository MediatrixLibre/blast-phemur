import { describe, it, expect } from 'vitest';
import { CATALOG, DEFAULT_CONFIG } from '@guardianstream/types';
import { coverage, exampleSplit, firstReachingLevel, groupLevel, hiddenFlags, isHidden, levelReaches, setAll, setGroupLevel, setOne, severityRange } from '../src/popup/menu/settings.js';
import { GROUP_COPY, LEVEL_CLAIMS } from '../src/popup/menu/levels.js';
import { isMatchActive, scanText } from '../src/lexicon/profanity.js';
import { maskForDisplay } from '../src/caption/caption-censor.js';
import { resolveCategorySetting } from '../src/engine/category-resolver.js';

const lang = CATALOG.find((c) => c.id === 'language')!;
const blank = { ...DEFAULT_CONFIG, categories: {} };

describe('accordion switches', () => {
  it('All turns every sub-category on, and off again', () => {
    const on = setAll(blank, lang, true);
    expect(Object.values(hiddenFlags(on, lang)).every(Boolean)).toBe(true);
    const off = setAll(on, lang, false);
    expect(Object.values(hiddenFlags(off, lang)).some(Boolean)).toBe(false);
  });

  it('one sub-category on carries the group; the others stay off in the engine', () => {
    const c = setOne(blank, lang, 'language.crude', true);
    expect(isHidden(c, 'language.crude')).toBe(true);
    expect(isHidden(c, 'language.profanity')).toBe(false);
    expect(resolveCategorySetting('language.profanity', c)?.threshold).toBe(0);
    expect(resolveCategorySetting('language.crude', c)?.threshold).toBeGreaterThan(0);
  });

  it('switching one off inside an All group keeps the rest on', () => {
    const c = setOne(setAll(blank, lang, true), lang, 'language.slur', false);
    expect(isHidden(c, 'language.slur')).toBe(false);
    expect(isHidden(c, 'language.profanity')).toBe(true);
  });

  it('turning the last one off clears the group, and all on leaves no overrides', () => {
    const one = setOne(blank, lang, 'language.crude', true);
    const none = setOne(one, lang, 'language.crude', false);
    expect(resolveCategorySetting('language.crude', none)?.threshold ?? 0).toBe(0);
    const all = Object.keys(hiddenFlags(blank, lang)).reduce((c, id) => setOne(c, lang, id, true), blank);
    expect(Object.keys(all.categories).filter((k) => k.startsWith('language.'))).toEqual([]);
  });

  it('keeps the chosen action when sub-categories are toggled', () => {
    const base = { ...blank, categories: { language: { threshold: 3 as const, action: 'skip' as const } } };
    const c = setOne(base, lang, 'language.slur', false);
    expect(c.categories.language.action).toBe('skip');
  });
});

describe('word-group levels', () => {
  const lang = CATALOG.find((c) => c.id === 'language')!;
  const crude = lang.children!.find((c) => c.id === 'language.crude')!;
  const profanity = lang.children!.find((c) => c.id === 'language.profanity')!;
  const slur = lang.children!.find((c) => c.id === 'language.slur')!;

  it('never says mild words are muted when the level lets them play', () => {
    const most = setGroupLevel(DEFAULT_CONFIG, lang, 2);
    expect(coverage(most, crude)).toBe('none');
    expect(levelReaches(most, lang, crude)).toBe(false);
    expect(coverage(most, profanity)).toBe('all');
    const all = setGroupLevel(DEFAULT_CONFIG, lang, 3);
    expect(coverage(all, crude)).toBe('all');
  });

  it('at Worst, swearing is only partly muted and slurs fully', () => {
    const worst = setGroupLevel(DEFAULT_CONFIG, lang, 1);
    expect(coverage(worst, profanity)).toBe('some');
    expect(coverage(worst, slur)).toBe('all');
  });

  it('keeps a switched-off sub-category off when the level changes', () => {
    const off = setOne(setGroupLevel(DEFAULT_CONFIG, lang, 3), lang, 'language.slur', false);
    const moved = setGroupLevel(off, lang, 2);
    expect(coverage(moved, slur)).toBe('none');
    expect(groupLevel(moved, lang)).toBe(2);
  });

  it('turning a group back on restarts sub-categories that were all off', () => {
    let cfg = setGroupLevel(DEFAULT_CONFIG, lang, 3);
    for (const k of lang.children!) cfg = { ...cfg, categories: { ...cfg.categories, [k.id]: { threshold: 0, action: 'mute' } } };
    const on = setGroupLevel(cfg, lang, 3);
    expect(lang.children!.every((k) => coverage(on, k) !== 'none')).toBe(true);
  });

  it('a level change never touches the other group', () => {
    const before = DEFAULT_CONFIG.categories.blasphemy;
    expect(setGroupLevel(DEFAULT_CONFIG, lang, 1).categories.blasphemy).toEqual(before);
  });
});

describe('the menu says what the engine does, for both groups', () => {
  const groups = CATALOG.filter((c) => c.id === 'blasphemy' || c.id === 'language');
  const levels = [1, 2, 3] as const;
  const at = (group: (typeof groups)[number], level: 0 | 1 | 2 | 3) =>
    setGroupLevel({ ...DEFAULT_CONFIG, customWords: { block: [], allow: [] } }, group, level);
  const mutedAt = (text: string, cfg: ReturnType<typeof at>, prefix: string) =>
    scanText(text, true, cfg.customWords).some((h) => h.category.startsWith(prefix) && isMatchActive(h, cfg));

  it('every word-group sub-category has a severity range (declared or read from the patterns)', () => {
    for (const g of groups) for (const k of g.children!) expect(severityRange(k), k.id).toBeDefined();
  });

  it('every listed example is caught by its own sub-category', () => {
    for (const g of groups) {
      for (const k of g.children!) {
        for (const ex of k.examples ?? []) {
          expect(scanText(ex, true).some((h) => h.category === k.id), `${k.id}: ${ex}`).toBe(true);
        }
      }
    }
  });

  it('a switch is live exactly when the level mutes at least one of its examples, and lists what plays', () => {
    for (const g of groups) {
      for (const level of levels) {
        const cfg = at(g, level);
        for (const k of g.children!) {
          if (!k.examples) continue;
          const { muted, plays } = exampleSplit(cfg, g, k);
          const reaches = levelReaches(cfg, g, k);
          expect(muted.length > 0, `${k.id} at ${level}: reaches=${reaches}, muted=${muted}`).toBe(reaches);
          if (coverage(cfg, k) === 'all') expect(plays, `${k.id} at ${level}`).toEqual([]);
          for (const ex of muted) expect(mutedAt(ex, cfg, g.id), `${ex} muted at ${level}`).toBe(true);
          for (const ex of plays) expect(mutedAt(ex, cfg, g.id), `${ex} plays at ${level}`).toBe(false);
        }
      }
    }
  });

  it('blasphemy at Worst does not claim the mild sub-categories', () => {
    const blas = groups.find((g) => g.id === 'blasphemy')!;
    const worst = at(blas, 1);
    const kid = (id: string) => blas.children!.find((k) => k.id === id)!;
    expect(levelReaches(worst, blas, kid('blasphemy.holy_family'))).toBe(false);
    expect(levelReaches(worst, blas, kid('blasphemy.saints'))).toBe(false);
    expect(levelReaches(worst, blas, kid('blasphemy.gods_name'))).toBe(true);
    expect(firstReachingLevel(kid('blasphemy.holy_family'))).toBe(2);
  });

  it('every example a level sentence names does what the sentence says', () => {
    for (const g of groups) {
      for (const level of levels) {
        const cfg = at(g, level);
        const claim = LEVEL_CLAIMS[g.id as 'blasphemy' | 'language'][level];
        for (const ex of claim.muted) expect(mutedAt(ex, cfg, g.id), `${g.id} ${level}: ${ex} muted`).toBe(true);
        for (const ex of claim.plays) expect(mutedAt(ex, cfg, g.id), `${g.id} ${level}: ${ex} plays`).toBe(false);
        const sentence = GROUP_COPY[g.id as 'blasphemy' | 'language'].levels[level];
        for (const ex of [...claim.muted, ...claim.plays]) expect(sentence).toContain(maskForDisplay(ex));
      }
    }
  });
});
