/**
 * Caption censor: rewrites filtered words in the on-screen captions
 * with asterisks ("damn" -> "d***") so the text is hidden as well as the audio.
 *
 * The audio logic needs the REAL words, so every rewritten text node keeps
 * its original in a WeakMap. Anything that reads captions must go through
 * readCaptionText(), never textContent directly.
 */

import type { UserConfig } from '@guardianstream/types';
import { scanText, isMatchActive, type TextMatch } from '../lexicon/profanity.js';
import { SACRED_NAME, isSacredName } from '../lexicon/sacred.js';

/** Text node -> the caption text before masking */
const originals = new WeakMap<Text, string>();

/**
 * "damnin'" -> "d*****'" : keep the first letter and any apostrophe.
 * A multi-word match is masked word by word ("J*sus H. Ch**st" -> "J**** H. C****"),
 * leaving a one- or two-letter connective such as "H." or "it" readable.
 */
export function maskWord(word: string): string {
  const run = /[A-Za-z*]+(?:'[A-Za-z*]+)*/g;
  const multi = (word.match(run) ?? []).length > 1;
  const stars = (s: string): string => s.replace(/[A-Za-z]/g, '*');
  return word.replace(run, (w) => {
    const letters = w.replace(/[^A-Za-z*]/g, '').length;
    if (multi && letters <= 2) return w;
    return letters > 2 ? w[0] + stars(w.slice(1)) : stars(w);
  });
}

export { isSacredName };

/** The sacred names as the app writes them: enough letters to know which, never spelled out */
const SACRED_DISPLAY: Record<string, string> = {
  jesus: 'J*sus',
  christ: 'Ch**st',
  mary: 'M*ry',
  joseph: 'J*seph',
  lord: 'L*rd',
  god: 'G*d',
  dios: 'D*os',
};

/** Joining words inside a phrase stay readable, so "and" never reads as "a**" */
const CONNECTIVE = /^(?:and|the|for|of|my|oh)$/i;

/**
 * One sacred name in the app's own fixed form, keeping the capitals the text
 * had; null for a sacred word with no fixed form ("holy", "saints"), which
 * then takes the ordinary display rule ("ho**").
 */
function maskSacredWord(w: string): string | null {
  // Spellings already masked or misspelled ("J*sus", "Ch**st") take the same fixed form
  const key = w.toLowerCase();
  const canon = /^j[eé3*]+s[uú*]+s$/.test(key) ? 'jesus' : /^ch(?:r[iy*]+|\*+)st$/.test(key) ? 'christ' : key;
  const shown = SACRED_DISPLAY[canon];
  if (!shown) return null;
  if (w.length > 1 && w === w.toUpperCase()) return shown.toUpperCase();
  return w[0] === w[0].toLowerCase() ? shown[0].toLowerCase() + shown.slice(1) : shown;
}

/**
 * How a filtered word is shown in the app: enough letters to know which word
 * it is, then stars ("shit" -> "sh**", "ass" -> "a**"). Sacred names follow
 * the app's own spelling ("J*sus", "Ch**st"). A phrase is masked word by
 * word, leaving short words and joining words ("and", "of") readable.
 */
export function maskForDisplay(word: string): string {
  const run = /[A-Za-z*]+(?:'[A-Za-z*]+)*/g;
  const multi = (word.match(run) ?? []).length > 1;
  const stars = (s: string): string => s.replace(/[A-Za-z]/g, '*');
  return word.replace(run, (w) => {
    const sacred = SACRED_NAME.test(w) ? maskSacredWord(w) : null;
    if (sacred) return sacred;
    const letters = w.replace(/[^A-Za-z*]/g, '').length;
    if (letters <= 2 || (multi && CONNECTIVE.test(w))) return multi ? w : stars(w);
    const keep = letters >= 4 ? 2 : 1;
    let seen = 0;
    return w.replace(/[A-Za-z*]/g, (c) => (seen++ < keep ? c : '*'));
  });
}

/** Replace the given matches in text (offsets refer to normalized text) */
export function maskText(text: string, matches: TextMatch[]): string {
  let out = '';
  let cursor = 0;
  for (const m of matches) {
    out += text.slice(cursor, m.start) + maskWord(text.slice(m.start, m.end));
    cursor = m.end;
  }
  return out + text.slice(cursor);
}

function textNodes(root: Element): Text[] {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
  return nodes;
}

/** The caption text as spoken, with any censor masking undone */
export function readCaptionText(elements: Iterable<Element>): string {
  const parts: string[] = [];
  for (const el of elements) {
    const text = textNodes(el)
      .map((n) => originals.get(n) ?? n.data)
      .join('')
      .trim();
    if (text) parts.push(text);
  }
  return parts.join(' ');
}

export class CaptionCensor {
  private observer: MutationObserver | null = null;
  private applying = false;

  constructor(
    private selector: string,
    private getConfig: () => UserConfig,
  ) {}

  start(): void {
    if (this.observer) return;
    // Runs as a microtask right after the page's own DOM write, so a filtered
    // word is masked before the browser can paint it. A busy page (YouTube TV)
    // mutates constantly, so skip changes that cannot involve a caption.
    this.observer = new MutationObserver((records) => {
      if (records.some((r) => this.touchesCaption(r))) this.sweep();
    });
    this.observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    this.sweep();
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
    // Put the real words back
    for (const el of document.querySelectorAll(this.selector)) {
      for (const n of textNodes(el)) {
        const orig = originals.get(n);
        if (orig !== undefined) {
          n.data = orig;
          originals.delete(n);
        }
      }
    }
  }

  private touchesCaption(r: MutationRecord): boolean {
    const el = r.target.nodeType === Node.TEXT_NODE ? r.target.parentElement : (r.target as Element);
    if (!el) return false;
    if (el.closest(this.selector)) return true;
    for (const n of r.addedNodes) {
      if (n instanceof Element && (n.matches(this.selector) || n.querySelector(this.selector))) return true;
    }
    return false;
  }

  /** Mask every active match in the visible captions. Safe to call often. */
  sweep(): void {
    if (this.applying) return;
    const config = this.getConfig();
    if (config.censorCaptions === false) return;

    this.applying = true;
    try {
      for (const el of document.querySelectorAll(this.selector)) {
        for (const node of textNodes(el)) {
          // A node we already masked is unchanged unless the page rewrote it
          const known = originals.get(node);
          const source = known !== undefined && node.data === maskCache.get(node) ? known : node.data;
          const matches = scanText(source, true, config.customWords).filter((m) => isMatchActive(m, config));
          if (matches.length === 0) continue;
          const masked = maskText(source, matches);
          if (masked === node.data) continue;
          originals.set(node, source);
          maskCache.set(node, masked);
          node.data = masked;
        }
      }
    } finally {
      this.applying = false;
    }
  }
}

/** What we last wrote into a node, to tell our edits from the page's */
const maskCache = new WeakMap<Text, string>();
