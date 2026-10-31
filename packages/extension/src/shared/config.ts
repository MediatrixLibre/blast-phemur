/**
 * Config helpers shared by the content script and popup.
 */

import type { UserConfig } from '@guardianstream/types';
import { DEFAULT_CONFIG } from '@guardianstream/types';

/** Storage key for the master on/off switch */
export const ENABLED_KEY = 'gs:enabled';

/**
 * Fill gaps in a stored config from the defaults, so settings saved by an
 * older version still get categories and options added since.
 */
export function mergeConfig(stored: Partial<UserConfig> | null | undefined): UserConfig {
  if (!stored) return DEFAULT_CONFIG;
  return {
    ...DEFAULT_CONFIG,
    ...stored,
    categories: { ...DEFAULT_CONFIG.categories, ...stored.categories },
  };
}

/** JSON with keys in a fixed order: chrome.storage hands objects back with their keys sorted */
function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

/** Two configs that differ at most in the viewer's word lists */
export function sameExceptWords(a: UserConfig, b: UserConfig): boolean {
  return stableJson({ ...a, customWords: null }) === stableJson({ ...b, customWords: null });
}
