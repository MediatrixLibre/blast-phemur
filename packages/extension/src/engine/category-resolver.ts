/**
 * Resolve a segment's category against user config.
 *
 * Walks the dot-notation hierarchy:
 *   "blasphemy.gods_name" -> "blasphemy" -> (universal dimension)
 * Returns the most specific match.
 */

import type { CategorySetting, UserConfig, GSFSegment } from '@guardianstream/types';

/** Category given to a match from the viewer's own "always hide" list */
export const CUSTOM_WORD_CATEGORY = 'custom.word';

/**
 * Look up category settings for a segment.
 * Returns null if the category (or any ancestor) is not configured.
 */
export function resolveCategorySetting(
  categoryId: string,
  config: UserConfig,
): CategorySetting | null {
  // Exact match first
  if (config.categories[categoryId]) {
    return config.categories[categoryId];
  }

  // Walk up the hierarchy
  const parts = categoryId.split('.');
  while (parts.length > 1) {
    parts.pop();
    const parent = parts.join('.');
    if (config.categories[parent]) {
      return config.categories[parent];
    }
  }

  return null;
}

/**
 * Test whether a segment should be active given user config.
 */
export function isSegmentActive(seg: GSFSegment, config: UserConfig): boolean {
  // The viewer's own "always hide" words ignore presets, thresholds and confidence
  if (seg.category === CUSTOM_WORD_CATEGORY) return true;

  const setting = resolveCategorySetting(seg.category, config);
  if (!setting || setting.threshold === 0) return false;

  // Threshold 3 = filter all (severity 1+)
  // Threshold 2 = filter moderate+ (severity 2+)
  // Threshold 1 = filter graphic only (severity 3)
  const minSeverity = 4 - setting.threshold; // 3->1, 2->2, 1->3
  if (seg.severity < minSeverity) return false;

  // Confidence check
  if (seg.confidence < config.minimumConfidence) return false;

  return true;
}
