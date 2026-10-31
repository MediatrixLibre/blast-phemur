/**
 * SRT / WebVTT parsing into plain cues.
 */

export interface Cue {
  start: number; // seconds
  end: number;
  text: string; // cleaned, single line, spoken words only
}

const TIME = /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})|(\d{1,2}):(\d{2})[,.](\d{1,3})/;

function toSeconds(m: RegExpMatchArray): number {
  if (m[1] !== undefined) {
    return +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4].padEnd(3, '0') / 1000;
  }
  return +m[5] * 60 + +m[6] + +m[7].padEnd(3, '0') / 1000;
}

/** Strip markup and non-speech annotations from a cue's text */
export function cleanCueText(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, '') // <i>, <font ...>
    .replace(/\{\\[^}]*\}/g, '') // {\an8}
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ') // [MUSIC] (laughs)
    .replace(/[♪♫#]+/g, ' ')
    .replace(/^\s*-\s*/gm, '') // dialogue dashes
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function parseCues(content: string): Cue[] {
  const blocks = content.replace(/\r/g, '').replace(/^﻿/, '').split(/\n{2,}/);
  const cues: Cue[] = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    const idx = lines.findIndex((l) => l.includes('-->'));
    if (idx === -1) continue;
    const [a, b] = lines[idx].split('-->');
    const ma = a.match(TIME);
    const mb = b.match(TIME);
    if (!ma || !mb) continue;
    const text = cleanCueText(lines.slice(idx + 1).join('\n'));
    if (!text) continue;
    cues.push({ start: toSeconds(ma), end: toSeconds(mb), text });
  }
  cues.sort((x, y) => x.start - y.start);
  return cues;
}
