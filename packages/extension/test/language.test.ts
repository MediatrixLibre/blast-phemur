import { describe, it, expect } from 'vitest';
import { scanText, isMatchActive } from '../src/lexicon/profanity.js';
import { maskText, maskWord } from '../src/caption/caption-censor.js';
import { DEFAULT_CONFIG } from '@guardianstream/types';

describe('scanText', () => {
  it('finds profanity with inflections', () => {
    const t = "He's fuckin' useless, you cocksuckers.";
    const hits = scanText(t).map((m) => m.text.toLowerCase());
    expect(hits).toEqual(["fuckin'", 'cocksuckers']);
  });
  it('catches dropped-g forms with and without the apostrophe', () => {
    expect(scanText('fuckin cunt').map((m) => m.text.toLowerCase())).toEqual(['fuckin', 'cunt']);
    expect(scanText('what a shithole, you pissin prick')).toHaveLength(3);
  });
  it('handles curly apostrophes', () => {
    expect(scanText('fuckin’ hell')).toHaveLength(2);
  });
  it('does not match inside other words', () => {
    expect(scanText('The class assessed the Scunthorpe hello shell')).toHaveLength(0);
  });
  it('keeps short words strict', () => {
    expect(scanText('a hoy and an assy thing')).toHaveLength(0);
    expect(scanText('kick his ass')).toHaveLength(1);
  });
  it('still finds blasphemy', () => {
    expect(scanText('Jesus H. Christ')[0].category).toBe('blasphemy.jesus_name');
  });
  it('collapses overlapping hits to the most severe', () => {
    const hits = scanText('goddamn it');
    expect(hits).toHaveLength(1);
  });
});

describe('isMatchActive', () => {
  it('respects thresholds', () => {
    const m = scanText('shit')[0]; // profanity, severity 2
    expect(isMatchActive(m, DEFAULT_CONFIG)).toBe(true);
    const off = { ...DEFAULT_CONFIG, categories: { ...DEFAULT_CONFIG.categories, language: { threshold: 0 as const, action: 'mute' as const } } };
    expect(isMatchActive(m, off)).toBe(false);
  });
});

describe('masking', () => {
  it('keeps the first letter and apostrophes', () => {
    expect(maskWord('fuck')).toBe('f***');
    expect(maskWord("fuckin'")).toBe("f*****'");
    expect(maskWord('ass')).toBe('a**');
    expect(maskWord('ho')).toBe('**');
  });
  it('masks only the matches', () => {
    const t = 'Well, shit happens';
    expect(maskText(t, scanText(t))).toBe('Well, s*** happens');
  });
});
