import { describe, it, expect } from 'vitest';
import { scanText, isMatchActive } from '../src/lexicon/profanity.js';
import { DEFAULT_CONFIG, type UserConfig } from '@guardianstream/types';

const at = (threshold: 0 | 1 | 2 | 3): UserConfig => ({
  ...DEFAULT_CONFIG,
  categories: { ...DEFAULT_CONFIG.categories, language: { threshold, action: 'mute' } },
});
const active = (text: string, threshold: 0 | 1 | 2 | 3) =>
  scanText(text).filter((m) => m.category.startsWith('language') && isMatchActive(m, at(threshold))).map((m) => m.text.toLowerCase());

describe('language severity', () => {
  it('"Severe" filters the strongest profanity, not the moderate', () => {
    expect(active("You fuckin' cocksucker, you cunt.", 1)).toEqual(["fuckin'", 'cocksucker', 'cunt']);
    expect(active('Shit, the bitch is a bastard.', 1)).toEqual([]);
  });
  it('"Moderate+" adds the moderate words', () => {
    expect(active('Shit, the bitch is a bastard.', 2)).toEqual(['shit', 'bitch', 'bastard']);
  });
  it('"Strict" adds the mild ones', () => {
    expect(active('Damn it, that was crap.', 2)).toEqual([]);
    expect(active('Damn it, that was crap.', 3)).toEqual(['damn', 'crap']);
  });
  it('motherfucker counts as strong', () => {
    expect(active('motherfucker', 1)).toEqual(['motherfucker']);
  });
});
