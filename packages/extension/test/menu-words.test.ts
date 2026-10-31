import { describe, it, expect } from 'vitest';
import { filterWords, listedWords, UNLISTED } from '../src/popup/menu/words.js';
import { scanText } from '../src/lexicon/profanity.js';

describe('menu word rows', () => {
  const rows = listedWords();
  it('never lists slurs or sexual vocabulary', () => {
    expect(rows.some((r) => UNLISTED.includes(r.type))).toBe(false);
  });
  it('lists root words once, not every inflection', () => {
    expect(rows.filter((r) => r.word === 'fuck').length).toBe(1);
    expect(rows.some((r) => r.word === 'fucking')).toBe(false);
  });
  it('allowing a word lifts it and its endings, never a longer word built on it', () => {
    const custom = (allow: string[]) => ({ block: [], allow });
    const words = (text: string, allow: string[]) => scanText(text, true, custom(allow)).map((h) => h.text.toLowerCase());
    expect(words('ass and asses', ['ass'])).toEqual([]);
    expect(words('you asshole', ['ass'])).toEqual(['asshole']);
    expect(words('fucking fuckface', ['fuck'])).toEqual(['fuckface']);
    expect(words('shithead', ['shit'])).toEqual(['shithead']);
    expect(words('damned damnin', ['damn'])).toEqual([]);
  });
  it('never lets a stored allow list switch off a sacred name', () => {
    const custom = { block: [], allow: ['jesus', 'god', 'christ', 'lord'] };
    expect(scanText('Jesus!', true, custom).length).toBe(1);
    expect(scanText('goddamn it', true, custom).length).toBe(1);
    expect(scanText('oh my god', true, custom).length).toBe(1);
  });
  it('filters by what is typed', () => {
    expect(filterWords(rows, 'dam').every((r) => r.word.includes('dam'))).toBe(true);
    expect(filterWords(rows, '').length).toBe(rows.length);
  });
});
