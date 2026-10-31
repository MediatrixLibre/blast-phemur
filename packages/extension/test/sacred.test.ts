import { describe, it, expect } from 'vitest';
import { scanText, isMatchActive } from '../src/lexicon/profanity.js';
import { maskForDisplay, maskText, maskWord } from '../src/caption/caption-censor.js';
import { isSegmentActive } from '../src/engine/category-resolver.js';
import { compileSegments } from '../src/subtitles/compile.js';
import { CATALOG, PRESETS, DEFAULT_CONFIG } from '@guardianstream/types';
import type { UserConfig } from '@guardianstream/types';

const at = (threshold: 0 | 1 | 2 | 3): UserConfig => ({
  ...DEFAULT_CONFIG,
  categories: { ...DEFAULT_CONFIG.categories, blasphemy: { threshold, action: 'mute' } },
});
const hits = (t: string, cfg: UserConfig = at(2)) => scanText(t, true).filter((m) => isMatchActive(m, cfg));
const covers = (t: string) => {
  const h = scanText(t, true);
  return h.length > 0 && h[0].start === 0 && h[0].end >= t.length - 3;
};

describe('the Holy Name', () => {
  it('is never spelled out in the app', () => {
    const shown: string[] = [];
    const walk = (cs: typeof CATALOG): void => cs.forEach((c) => { shown.push(c.label, c.blurb); walk(c.children ?? []); });
    walk(CATALOG);
    PRESETS.forEach((p) => shown.push(p.name, p.blurb));
    expect(shown.filter((t) => /jesus|christ/i.test(t))).toEqual([]);
  });
  it('is read in its masked spelling', () => {
    const line = 'Well, damn it all to hell. J*sus H. Ch**st, that was fast.';
    const h = scanText(line, true).filter((m) => m.category.startsWith('blasphemy'));
    expect(h).toHaveLength(1);
    expect(h[0].severity).toBe(3);
    expect(maskText(line, h)).toContain('J**** H. C*****');
  });
  it('masks a multi-word match word by word', () => {
    expect(maskWord('J*sus H. Ch**st')).toBe('J**** H. C*****');
    expect(maskWord('god damn')).toBe('g** d***');
    expect(maskWord('ho')).toBe('**');
    expect(maskWord("fuckin'")).toBe("f*****'");
  });
  it('counts an outcry at Moderate, a bare mention only at Strict', () => {
    expect(hits('Oh, Jesus.')).toHaveLength(1);
    expect(hits('Christ!')).toHaveLength(1);
    expect(hits('Oh, Jesus.', at(1))).toHaveLength(0);
    expect(hits('He spoke of Jesus, and of Peter.', at(2))).toHaveLength(0);
    expect(hits('He spoke of Jesus, and of Peter.', at(3))).toHaveLength(1);
  });
  it('counts the Name opening a sentence before a comma as an oath', () => {
    expect(hits('Jesus, what happened?', at(2))).toHaveLength(1);
    expect(hits("Jesus, Al, Jesus,\nwith all that's goin' on?", at(2)).length).toBeGreaterThan(0);
    expect(hits("I'll pay. Christ, what now?", at(2))).toHaveLength(1);
    expect(hits('- Jesus, Al.', at(2))).toHaveLength(1);
    expect(hits('Jesus, what happened?', at(1))).toHaveLength(0);
  });
  it('joins overlapping hits into one span', () => {
    const h = scanText('Oh jesus christ, you know', true);
    expect(h).toHaveLength(1);
    expect(h[0].text.toLowerCase()).toBe('oh jesus christ');
  });
  it('leaves reverent and ordinary uses alone at Moderate', () => {
    for (const t of ['Christ the King', 'Jesus is Lord', 'Jesus said to them', 'Merry Christmas', 'Christopher and Jessica', 'the Jesuit school', 'Christianity']) {
      expect(hits(t), t).toHaveLength(0);
    }
  });
});

describe('Mary, Our Lady, Joseph and the saints', () => {
  it('catches the oaths', () => {
    for (const t of ['Jesus, Mary and Joseph!', 'Mother of God!', 'Holy Mary', 'Holy Mother of God', 'For the love of Mary', 'Holy Saint Peter', 'By all the saints', 'Holy saints above']) {
      expect(hits(t).length, t).toBeGreaterThan(0);
    }
  });
  it('files them under their own categories', () => {
    expect(scanText('Mother of God!', true)[0].category).toBe('blasphemy.holy_family');
    expect(scanText('Holy Saint Anthony', true)[0].category).toBe('blasphemy.saints');
  });
  it('never flags Mary or Joseph as plain names', () => {
    for (const t of ['Mary had a little lamb', 'Joseph is coming to dinner', 'Mary and I went home', 'The Saints won on Sunday', 'Saint Francis Hospital', 'Hail Mary pass']) {
      expect(scanText(t, true).filter((m) => m.category.startsWith('blasphemy')), t).toHaveLength(0);
    }
  });
  it('treats a title mention as Strict only', () => {
    expect(hits('Our Lady of Guadalupe', at(2))).toHaveLength(0);
    expect(hits('Our Lady of Guadalupe', at(3))).toHaveLength(1);
  });
});

describe('misspellings and derivatives', () => {
  it('reads minced, elongated and masked forms of the Name', () => {
    for (const t of ['Jeeesus!', 'Jesús!', 'Oh, Jaysus', 'Jebus!', 'Gee-zus!', 'For chrissakes', 'Jesus bloody Christ', 'Oh, Chirst.', 'J**us!', 'Ch**st!']) {
      expect(hits(t).length, t).toBeGreaterThan(0);
    }
  });
  it('covers the God-damn family in every spelling', () => {
    const forms = [
      'goddamn', 'goddamned', 'goddamnit', 'goddammit', 'goddam', 'godamn', 'godamnit', 'god damn', 'god damned', 'god dammit',
      'god-damn', 'god-damned', 'god-damnit', 'God - damn', 'god, damn it', "g'damn", 'gaddamn', 'gawddamn', 'goddamning',
      'g*damn', 'g**damn', 'g*ddamn', 'g_damn', 'g-damn', 'god*mn', 'godd*mn', 'go*damn', 'god d*mn', 'g0ddamn', "god's damn", 'godsdamn', 'gdamn', 'gddamn',
    ];
    for (const f of forms) expect(covers(f), f).toBe(true);
    expect(scanText('goddamn', true)[0].severity).toBe(3);
  });
  it('catches dammit and damnedest as crude language', () => {
    expect(scanText('dammit', true)).toHaveLength(1);
    expect(scanText('the damnedest thing', true)).toHaveLength(1);
  });
  it('does not mistake a dam, or a good damn job, for God-damn', () => {
    for (const t of ['The dam broke', 'a good damn job', 'Damn Yankees', 'God bless you']) {
      expect(scanText(t, true).filter((m) => m.category === 'blasphemy.gods_name'), t).toHaveLength(0);
    }
  });
});

describe('"always hide" words', () => {
  const custom = { block: ['kumquat'], allow: [] as string[] };
  const off: UserConfig = {
    ...DEFAULT_CONFIG,
    minimumConfidence: 1,
    categories: Object.fromEntries(Object.keys(DEFAULT_CONFIG.categories).map((k) => [k, { threshold: 0 as const, action: 'mute' as const }])),
    customWords: custom,
  };
  it('are hidden in text whatever the presets say', () => {
    const h = scanText('A kumquat, please', true, custom);
    expect(h).toHaveLength(1);
    expect(isMatchActive(h[0], off)).toBe(true);
    expect(maskText('A kumquat, please', h)).toBe('A k******, please');
  });
  it('are muted in the sound whatever the presets say', () => {
    const segs = compileSegments([{ start: 10, end: 13, text: 'A kumquat, please' }], { custom });
    expect(segs).toHaveLength(1);
    expect(isSegmentActive(segs[0], off)).toBe(true);
  });
  it('are not undone by the never-hide list', () => {
    const h = scanText('A kumquat', true, { block: ['kumquat'], allow: ['kumquat'] });
    expect(h).toHaveLength(1);
  });
});

describe('how words are shown in the app', () => {
  it('shows enough letters to know the word, then stars', async () => {
    const { maskForDisplay } = await import('../src/caption/caption-censor.js');
    expect(maskForDisplay('shit')).toBe('sh**');
    expect(maskForDisplay('fucking')).toBe('fu*****');
    expect(maskForDisplay('ass')).toBe('a**');
    expect(maskForDisplay('damn')).toBe('da**');
    expect(maskForDisplay('hell')).toBe('he**');
    expect(maskForDisplay('it')).toBe('**');
  });

  it('writes a sacred name the way the app does, and masks a phrase word by word', async () => {
    const { maskForDisplay } = await import('../src/caption/caption-censor.js');
    expect(maskForDisplay('Jesus')).toBe('J*sus');
    expect(maskForDisplay('Christ')).toBe('Ch**st');
    expect(maskForDisplay('JESUS')).toBe('J*SUS');
    expect(maskForDisplay('jesus christ')).toBe('j*sus ch**st');
    expect(maskForDisplay('oh my god')).toBe('oh my g*d');
    expect(maskForDisplay('what the hell')).toBe('wh** the he**');
  });

  it('a sacred name can never be put on the never-hide list by a correction', async () => {
    const { allowing, applyCorrection } = await import('../src/corrections/corrections.js');
    expect(allowing({ block: [], allow: [] }, ['Jesus', 'Christ', 'hell']).allow).toEqual(['hell']);
    expect(applyCorrection({ block: [], allow: [] }, { action: 'allow', words: ['Jesus'] }).allow).toEqual([]);
  });
});

describe('level descriptions in the menu', () => {
  it('never spell out a sacred name or a swear word', async () => {
    const { GROUP_COPY } = await import('../src/popup/menu/levels.js');
    const shown = Object.values(GROUP_COPY).flatMap((g) => [g.name, ...Object.values(g.levels)]);
    expect(shown.filter((t) => /jesus|christ|\bgod|\bdamn|\bhell\b|\bcrap\b|\bjeez\b/i.test(t))).toEqual([]);
    // ...but they still name the examples, masked
    expect(GROUP_COPY.language.levels[3]).toMatch(/da\*\*/);
  });
});

describe('joining words inside a masked phrase', () => {
  it('stay readable, so "and" never reads as a swear word', () => {
    expect(maskForDisplay('mary and joseph')).toBe('m*ry and j*seph');
    expect(maskForDisplay('mother of god')).toBe('mo**** of g*d');
    expect(maskForDisplay('and')).toBe('a**');
  });
});

describe('sacred words with no fixed form', () => {
  it('take the ordinary display rule, not the caption mask', () => {
    expect(maskForDisplay('holy shit')).toBe('ho** sh**');
    expect(maskForDisplay('saints alive')).toBe('sa**** al***');
    expect(maskForDisplay('oh my God')).toBe('oh my G*d');
  });
});

describe('a name already masked in the text', () => {
  it('keeps the fixed form instead of being masked again', () => {
    expect(maskForDisplay('J*sus H. Ch**st')).toBe('J*sus H. Ch**st');
    expect(maskForDisplay('jesus h christ')).toBe('j*sus h ch**st');
  });
});
