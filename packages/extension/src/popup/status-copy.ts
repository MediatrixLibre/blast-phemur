/**
 * What the popup's status card says, and the one thing the viewer can do
 * about it. Every state names its cause; none of them is a dead end.
 *
 * "Protected" is said only when a filter is running on this tab and the
 * settings mute something, and the title says how precise it is, so the
 * first glance is never a false comfort.
 */

import type { FilterStatus, Reach } from './hooks/useStatus.js';

export type StatusAction = 'enable' | 'reload' | 'import' | 'choose';

/** Toolbar-icon artwork that matches the state (public/icons/action/tile-*) */
export type StatusIcon = 'off' | 'on' | 'filtering' | 'attention';

export interface StatusCopy {
  /**
   * protected: muting ahead of each word; partial: muting from live captions;
   * idle: on, nothing to filter yet; attention: something stops protection; off
   */
  tone: 'protected' | 'partial' | 'idle' | 'attention' | 'off';
  icon: StatusIcon;
  title: string;
  /** Service and episode, when known */
  context?: string;
  detail?: string;
  action?: { kind: StatusAction; label: string };
  /** A quieter second step, shown as a link */
  secondary?: { kind: StatusAction; label: string };
}

export const SITES = 'YouTube TV, YouTube or DIRECTV Stream';
/** The short form, where two lines is the budget */
export const SITES_SHORT = 'YouTube TV, YouTube or DIRECTV Stream';

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

function contextLine(s: FilterStatus): string | undefined {
  const named = s.title && s.title !== 'this title' ? `“${s.title}”` : null;
  return [s.provider, named].filter(Boolean).join(' · ') || undefined;
}

export function describeStatus(
  reach: Reach,
  s: FilterStatus,
  enabled: boolean,
  opts: { subtitleFiles?: boolean; mutesNothing?: boolean } = {},
): StatusCopy {
  const importLink = (label: string) => (opts.subtitleFiles === false ? undefined : { kind: 'import' as const, label });

  if (!enabled) {
    return {
      tone: 'off',
      icon: 'off',
      title: 'Protection is off',
      detail: 'Nothing is muted or masked on any site.',
      action: { kind: 'enable', label: 'Turn protection on' },
    };
  }
  if (reach === 'checking') return { tone: 'idle', icon: 'on', title: 'Checking this tab…' };
  // On, but every word group is Off and Always mute is empty: a running
  // filter would protect from nothing, so this outranks every page state
  if (opts.mutesNothing) {
    return {
      tone: 'attention',
      icon: 'attention',
      title: 'Nothing is set to mute',
      context: reach === 'connected' ? contextLine(s) : undefined,
      detail: 'Blasphemy and Swearing are both Off, and your Always mute list is empty.',
      action: { kind: 'choose', label: 'Choose what to mute' },
    };
  }
  if (reach === 'unsupported') {
    return {
      tone: 'idle',
      icon: 'on',
      title: 'Nothing to filter here',
      detail: `Open a show on ${SITES_SHORT}. Protection starts by itself.`,
    };
  }
  if (reach === 'disconnected') {
    return {
      tone: 'attention',
      icon: 'attention',
      title: 'Reload this tab to start',
      detail: 'This tab was open before Blast Phemur was installed or updated.',
      action: { kind: 'reload', label: 'Reload tab' },
    };
  }

  if (s.mode === 'precomputed') {
    return {
      tone: 'protected',
      icon: 'filtering',
      title: 'Protected',
      context: contextLine(s),
      detail: `Using a filter made for this title: ${plural(s.segmentCount, 'moment')} to mute.`,
    };
  }

  if (s.mode === 'anchored') {
    const from = s.source === 'player' ? "the show's own caption track" : 'your subtitle file';
    return {
      tone: 'protected',
      icon: 'filtering',
      title: 'Protected',
      context: contextLine(s),
      detail: `Each word is muted as it is spoken, timed from ${from}. Word timing can be slightly early or late.`,
    };
  }

  if (s.mode === 'captions') {
    const lines = s.captionLines ?? 0;
    const hits = s.captionHits ?? 0;
    const library = s.libraryCount ?? 0;
    if (lines === 0) {
      return {
        tone: 'attention',
        icon: 'attention',
        title: 'Turn on captions (CC)',
        context: s.provider ?? undefined,
        detail: 'Words are found in the captions, so nothing is filtered until they are on.',
        secondary: importLink('Or add a subtitle file'),
      };
    }
    return {
      tone: 'partial',
      icon: 'filtering',
      title: 'Partly protected',
      context: s.provider ?? undefined,
      detail:
        `Reading captions as they appear, so a word can slip out before the mute. ${plural(hits, 'word')} muted so far.` +
        (library > 0 ? ` Matching against ${plural(library, 'subtitle file')}.` : ''),
      secondary: importLink('Add a subtitle file for word-by-word timing'),
    };
  }

  // Connected, no player being filtered yet
  if (s.smallVideoPlaying) {
    return {
      tone: 'idle',
      icon: 'on',
      title: 'Only a preview is playing',
      context: s.provider ?? undefined,
      detail: 'Open the show full size, and protection starts.',
    };
  }
  return {
    tone: 'idle',
    icon: 'on',
    title: s.provider ? `Ready on ${s.provider}` : 'Ready',
    detail: 'Play a show, and protection starts by itself.',
  };
}
