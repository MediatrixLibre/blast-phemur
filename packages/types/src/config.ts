/**
 * User configuration types.
 *
 * Supports family profiles, category packs, and per-category settings
 * against the open taxonomy.
 */

import type { CategorySetting } from './taxonomy.js';

/**
 * A family member's filter profile.
 */
export interface UserProfile {
  id: string;
  name: string;
  icon: string;
  categories: Record<string, CategorySetting>;
  activePack: string | null;
}

/**
 * "That one was fine": one moment in one title that is not filtered. Used for
 * sacred names, which must never be switched off for a word everywhere.
 */
export interface PassWindow {
  /** The caption track the times belong to (e.g. "player:<videoId>") */
  track: string;
  start: number;
  end: number;
}

/** User-maintained word lists */
export interface CustomWords {
  /** Always filter these (matched as whole words, with common endings) */
  block: string[];
  /** Never filter these, even if the built-in lexicon would */
  allow: string[];
  /** Single moments the viewer passed with "that was fine" */
  passes?: PassWindow[];
}

/**
 * Complete user configuration.
 */
export interface UserConfig {
  /** Per-category settings keyed by category ID */
  categories: Record<string, CategorySetting>;

  /** Active category pack ID (loads defaults) */
  activePack: string | null;

  /** Minimum AI confidence to apply a filter (0.0-1.0) */
  minimumConfidence: number;
  /** Replace filtered words in on-screen captions with asterisks (f***). Default true. */
  censorCaptions?: boolean;
  /** The user's own word lists, applied on top of the built-in lexicon */
  customWords?: CustomWords;

  /** Show "Skipped: category" overlay notifications */
  showNotices: boolean;

  /** Where to show the notice overlay */
  noticePosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

  /** Audio mute fade duration in ms (0 = instant) */
  muteTransitionMs: number;

  /** Video skip transition duration in ms (0 = instant) */
  skipTransitionMs: number;

  /** Family profiles */
  profiles: UserProfile[];

  /** Currently active profile ID */
  activeProfileId: string | null;
}

/** Sensible defaults for a new user */
export const DEFAULT_CONFIG: UserConfig = {
  categories: {
    violence: { threshold: 1, action: 'skip' },
    sexual_content: { threshold: 2, action: 'skip' },
    language: { threshold: 2, action: 'mute' },
    // New installs: every misuse of a sacred name, and all but the mild words.
    // Stored settings always win over these (mergeConfig), so changing a
    // default never changes an existing viewer's filter.
    blasphemy: { threshold: 3, action: 'mute' },
    custom: { threshold: 3, action: 'mute' },
    nudity: { threshold: 2, action: 'blur' },
    substances: { threshold: 0, action: 'skip' },
    fear: { threshold: 0, action: 'skip' },
  },
  activePack: null,
  minimumConfidence: 0.7,
  censorCaptions: true,
  customWords: { block: [], allow: [] },
  showNotices: true,
  noticePosition: 'top-right',
  muteTransitionMs: 50,
  skipTransitionMs: 150,
  profiles: [],
  activeProfileId: null,
};
