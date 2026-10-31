/**
 * Keys for correcting the filter without leaving the video.
 *
 *   [   that was fine here (it hid something it should not have): this
 *       moment plays from now on; the word stays muted everywhere else, and
 *       pressing 1 then allows a plain word everywhere
 *   ]   that got through (it missed something)
 *   \   undo the last correction
 *
 * Each one answers with a small indicator that fades by itself. Corrections
 * go into the viewer's own always-hide / never-hide lists, which the settings
 * already show and can edit.
 */

import type { CustomWords, UserConfig } from '@guardianstream/types';
import { allowing, blocking, passingAll, pickMissed, isSacred, revertChange, type HitEvent } from './corrections.js';
import { maskWord } from '../caption/caption-censor.js';
import { showToast, type ToastHandle, type ToastOptions } from '../ui/toast.js';
import { debugLog } from '../debug/recorder.js';

export const KEY_FINE = '[';
export const KEY_MISSED = ']';
export const KEY_UNDO = '\\';

const LOOKBACK_HIT_S = 12;
const LOOKBACK_LINE_S = 10;
const HISTORY = 20;

export interface CorrectionHost {
  video(): HTMLVideoElement | null;
  /** What the filter hid in the last `lookbackS` seconds, one entry per muted event, newest first */
  recentHits(lookbackS: number): HitEvent[];
  /** Lines just spoken or shown, newest first */
  recentLines(lookbackS: number): string[];
  config(): UserConfig;
  save(words: CustomWords): void;
}

export type ToastFn = (video: HTMLVideoElement, opts: ToastOptions) => ToastHandle;

const isTyping = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable === true || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName ?? ''));
};

const list = (words: string[]): string => words.map((w) => `“${maskWord(w)}”`).join(', ');

export function installCorrectionShortcuts(
  host: CorrectionHost,
  ui: ToastFn = showToast,
  target: EventTarget = window,
): () => void {
  /** Each key correction as the change it made, so undo reverses that change only */
  const history: { before: CustomWords; after: CustomWords }[] = [];
  let chooser: ToastHandle | null = null;

  const say = (text: string, hint?: string, holdMs?: number): ToastHandle | null => {
    const video = host.video();
    return video ? ui(video, { text, hint, holdMs }) : null;
  };

  const commit = (before: CustomWords, after: CustomWords): void => {
    history.push({ before, after });
    if (history.length > HISTORY) history.shift();
    host.save(after);
  };

  const words = (): CustomWords => {
    const w = host.config().customWords;
    return { block: [...(w?.block ?? [])], allow: [...(w?.allow ?? [])], passes: [...(w?.passes ?? [])] };
  };

  const fine = (): void => {
    const hit = host.recentHits(LOOKBACK_HIT_S)[0];
    if (!hit || hit.words.length === 0) return void say(`Nothing was muted in the last ${LOOKBACK_HIT_S} seconds`);

    // A false alarm is one moment: pass that moment, for every word in it.
    // Allowing a word everywhere is a second, deliberate step (and never for a sacred name).
    const plain = [...new Set(hit.words.filter((w) => !isSacred(w)).map((w) => w.text))];
    const offerEverywhere = (text: string, hint: string): void => {
      const video = host.video();
      if (!video || plain.length === 0) return void say(text, hint);
      chooser = ui(video, {
        text,
        hint: `${hint} Press 1 to allow it everywhere.`,
        holdMs: 6000,
        chips: [{ label: `Allow ${list(plain)} everywhere`, onPick: () => allowEverywhere(plain) }],
      });
    };

    if (hit.track !== undefined && hit.start !== undefined && hit.end !== undefined) {
      const before = words();
      commit(before, passingAll(before, { track: hit.track, start: hit.start, end: hit.end }, hit.also));
      debugLog('correction', { kind: 'pass', n: hit.words.length });
      const what =
        plain.length === hit.words.length ? list(plain) : plain.length ? `${list(plain)} and the sacred name` : 'the sacred name';
      return offerEverywhere(`Passed this moment: ${what} plays here from now on`, `Still muted everywhere else. Press ${KEY_UNDO} to undo.`);
    }

    // A filter that names no title (none ships switched on today): no way to mark the moment
    if (plain.length === 0) return void say('Sacred names can’t be passed on this page, so nothing changed');
    offerEverywhere('This moment can’t be marked on this page', 'Nothing changed yet.');
  };

  const allowEverywhere = (plain: string[]): void => {
    commit(words(), allowing(words(), plain));
    debugLog('correction', { kind: 'allow', n: plain.length });
    say(`Won’t mute ${list(plain)} anywhere`, `Press ${KEY_UNDO} to undo.`);
  };

  const addBlock = (word: string): void => {
    commit(words(), blocking(words(), [word]));
    debugLog('correction', { kind: 'block', n: 1 });
    say(`Will always mute ${list([word])}`, `Press ${KEY_UNDO} to undo.`);
  };

  const missed = (): void => {
    const lines = host.recentLines(LOOKBACK_LINE_S);
    if (lines.length === 0) return void say(`No captions in the last ${LOOKBACK_LINE_S} seconds`);
    const pick = pickMissed(lines, words(), host.config());
    if (pick.auto) return addBlock(pick.auto);
    if (pick.choices.length === 0) return void say('No words to choose from');
    const video = host.video();
    if (!video) return;
    chooser = ui(video, {
      text: 'Which word got through?',
      hint: 'Press its number, or Esc to cancel.',
      holdMs: 8000,
      chips: pick.choices.map((w) => ({ label: maskWord(w), onPick: () => addBlock(w) })),
    });
  };

  const undo = (): void => {
    const step = history.pop();
    if (!step) return void say('Nothing to undo');
    host.save(revertChange(words(), step.before, step.after));
    debugLog('correction', { kind: 'undo' });
    say('Undone');
  };

  const onKey = (raw: Event): void => {
    const e = raw as KeyboardEvent;
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || isTyping(e.target)) return;

    // While choosing, digits pick and Escape cancels; nothing reaches the player
    if (chooser?.hasChips) {
      const n = /^[1-9]$/.test(e.key) ? Number(e.key) - 1 : -1;
      if (n >= 0 && chooser.pick(n)) {
        chooser = null;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (e.key === 'Escape') {
        chooser.dismiss();
        chooser = null;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }

    const run = e.key === KEY_FINE ? fine : e.key === KEY_MISSED ? missed : e.key === KEY_UNDO ? undo : null;
    if (!run) return;
    e.preventDefault();
    e.stopPropagation();
    run();
  };

  target.addEventListener('keydown', onKey, true);
  return () => target.removeEventListener('keydown', onKey, true);
}
