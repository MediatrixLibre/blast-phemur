/**
 * What each level of each word group lets through, in plain words. Example
 * words are real spellings here and always shown through maskForDisplay.
 *
 * Every example a sentence names is listed in LEVEL_CLAIMS too, as muted or
 * as playing at that level, and test/menu-switches.test.ts runs each one
 * through the engine, so the copy cannot drift from what is actually muted.
 */
import type { Threshold } from '@guardianstream/types';
import { maskForDisplay as m } from '../../caption/caption-censor.js';

export type WordGroupId = 'blasphemy' | 'language';

export interface GroupCopy {
  name: string;
  levels: Record<Threshold, string>;
}

/** Examples each level's sentence names, with what the level does to them */
export const LEVEL_CLAIMS: Record<WordGroupId, Record<Threshold, { muted: string[]; plays: string[] }>> = {
  blasphemy: {
    0: { muted: [], plays: [] },
    1: { muted: ['goddamn'], plays: ['oh my God'] },
    2: { muted: ['oh my God'], plays: ['oh God', 'jeez'] },
    3: { muted: ['oh God', 'jeez'], plays: [] },
  },
  language: {
    0: { muted: [], plays: [] },
    1: { muted: ['fuck'], plays: ['shit'] },
    2: { muted: ['shit'], plays: ['damn', 'hell'] },
    3: { muted: ['damn', 'hell', 'crap'], plays: [] },
  },
};

const q = (w: string): string => `“${m(w)}”`;
const and = (ws: string[]): string => (ws.length < 2 ? ws.map(q).join('') : `${ws.slice(0, -1).map(q).join(', ')} and ${q(ws[ws.length - 1])}`);
const c = LEVEL_CLAIMS;

export const GROUP_COPY: Record<WordGroupId, GroupCopy> = {
  blasphemy: {
    name: 'Blasphemy',
    levels: {
      0: 'Sacred names are not muted.',
      1: `Only the worst, said as a curse, such as ${and(c.blasphemy[1].muted)}. ${and(c.blasphemy[1].plays)} plays.`,
      2: `Most misuse, such as ${and(c.blasphemy[2].muted)}. Mild ones such as ${and(c.blasphemy[2].plays)} play.`,
      3: `Every misuse, even ${and(c.blasphemy[3].muted)}. If it catches a prayer, pass that moment.`,
    },
  },
  language: {
    name: 'Swearing',
    levels: {
      0: 'Swearing is not muted.',
      1: `Only the strongest words, such as ${and(c.language[1].muted)}, and slurs. ${and(c.language[1].plays)} plays.`,
      2: `Swearing, slurs and sexual words, such as ${and(c.language[2].muted)}. Mild words such as ${and(c.language[2].plays)} play.`,
      3: `Everything, mild words too, such as ${and(c.language[3].muted)}.`,
    },
  },
};
