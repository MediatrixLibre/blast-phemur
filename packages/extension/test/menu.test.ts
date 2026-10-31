import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG, PRESETS } from '@guardianstream/types';
import { applyPreset, matchingPreset, withSetting, withoutOverride, summaryFor, parseWordList } from '../src/popup/menu/settings.js';
import { scanText, isMatchActive } from '../src/lexicon/profanity.js';
import { resolveCategorySetting } from '../src/engine/category-resolver.js';
import { CATALOG } from '@guardianstream/types';

const preset = (id: string) => PRESETS.find((p) => p.id === id)!;

describe('presets', () => {
  it('apply and are recognised', () => {
    const cfg = applyPreset(DEFAULT_CONFIG, preset('clean-language'));
    expect(cfg.categories.language.threshold).toBe(3);
    expect(cfg.categories.nudity.threshold).toBe(0);
    expect(matchingPreset(cfg)?.id).toBe('clean-language');
  });
  it('editing a setting makes it Custom', () => {
    const cfg = withSetting(applyPreset(DEFAULT_CONFIG, preset('clean-language')), 'nudity', { threshold: 2 }, 'skip');
    expect(matchingPreset(cfg)).toBeNull();
    expect(cfg.activePack).toBeNull();
  });
  it('keeps the custom-words category when a preset is applied', () => {
    expect(applyPreset(DEFAULT_CONFIG, preset('blasphemy-only')).categories.custom).toBeDefined();
  });
});

describe('sub-type overrides', () => {
  it('a child override beats its parent, removing it restores the parent', () => {
    let cfg = applyPreset(DEFAULT_CONFIG, preset('clean-language')); // language Strict
    cfg = withSetting(cfg, 'language.crude', { threshold: 0 }, 'mute'); // allow crude words
    expect(resolveCategorySetting('language.crude', cfg)?.threshold).toBe(0);
    expect(resolveCategorySetting('language.profanity', cfg)?.threshold).toBe(3);
    cfg = withoutOverride(cfg, 'language.crude');
    expect(resolveCategorySetting('language.crude', cfg)?.threshold).toBe(3);
  });
  it('turning off crude words stops them being filtered but not swearing', () => {
    let cfg = applyPreset(DEFAULT_CONFIG, preset('clean-language'));
    cfg = withSetting(cfg, 'language.crude', { threshold: 0 }, 'mute');
    const crap = scanText('what crap')[0];
    const shit = scanText('what shit')[0];
    expect(isMatchActive(crap, cfg)).toBe(false);
    expect(isMatchActive(shit, cfg)).toBe(true);
  });
});

describe('custom word lists', () => {
  const cfg = { ...DEFAULT_CONFIG, customWords: { block: ['darn'], allow: ['hell'] } };
  it('always-hide adds matches that follow the custom setting', () => {
    const m = scanText('well darn it', true, cfg.customWords);
    expect(m[0].category).toBe('custom.word');
    expect(isMatchActive(m[0], cfg)).toBe(true);
  });
  it('never-hide removes built-in matches', () => {
    expect(scanText('go to hell', true, cfg.customWords)).toHaveLength(0);
    expect(scanText('go to hell', true)).toHaveLength(1);
  });
  it('parses lists', () => {
    expect(parseWordList('Darn, heck,\nDarn ,x')).toEqual(['darn', 'heck']);
  });
});

describe('catalog integrity', () => {
  it('every id is unique and every child belongs to its parent', () => {
    const ids: string[] = [];
    for (const c of CATALOG) {
      ids.push(c.id);
      for (const ch of c.children ?? []) {
        expect(ch.id.startsWith(c.id + '.')).toBe(true);
        ids.push(ch.id);
      }
    }
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('summary reads in plain language', () => {
    const cfg = applyPreset(DEFAULT_CONFIG, preset('catholic-family'));
    expect(summaryFor(cfg, CATALOG[0])).toBe('Strict · Mute');
    expect(summaryFor(applyPreset(DEFAULT_CONFIG, preset('blasphemy-only')), CATALOG[1])).toBe('Off');
  });
});
