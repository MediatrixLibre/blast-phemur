import { describe, it, expect } from 'vitest';
import { resolveCategorySetting, isSegmentActive } from '../src/engine/category-resolver.js';
import type { UserConfig, GSFSegment } from '@guardianstream/types';

const baseConfig: UserConfig = {
  categories: {
    violence: { threshold: 2, action: 'skip' },
    language: { threshold: 3, action: 'mute' },
    'language.profanity': { threshold: 2, action: 'bleep' },
    blasphemy: { threshold: 3, action: 'mute' },
  },
  activePack: null,
  minimumConfidence: 0.7,
  showNotices: true,
  noticePosition: 'top-right',
  muteTransitionMs: 50,
  skipTransitionMs: 150,
  profiles: [],
  activeProfileId: null,
};

function seg(
  category: string,
  severity: 1 | 2 | 3,
  confidence = 0.9,
): GSFSegment {
  return {
    id: 'test',
    start: 0,
    end: 1,
    category,
    severity,
    action: 'mute',
    confidence,
    source: 'official',
    votes: 0,
  };
}

describe('resolveCategorySetting', () => {
  it('returns exact match', () => {
    const result = resolveCategorySetting('language.profanity', baseConfig);
    expect(result).toEqual({ threshold: 2, action: 'bleep' });
  });

  it('walks up to parent', () => {
    const result = resolveCategorySetting('language.crude', baseConfig);
    expect(result).toEqual({ threshold: 3, action: 'mute' });
  });

  it('resolves deep category via grandparent', () => {
    const result = resolveCategorySetting('blasphemy.gods_name', baseConfig);
    expect(result).toEqual({ threshold: 3, action: 'mute' });
  });

  it('returns null for unconfigured category', () => {
    const result = resolveCategorySetting('nudity', baseConfig);
    expect(result).toBeNull();
  });
});

describe('isSegmentActive', () => {
  it('activates when severity meets threshold', () => {
    // threshold 2 = filter moderate+ (severity 2+)
    expect(isSegmentActive(seg('violence', 2), baseConfig)).toBe(true);
    expect(isSegmentActive(seg('violence', 3), baseConfig)).toBe(true);
  });

  it('skips when severity below threshold', () => {
    // threshold 2 = filter moderate+ -> severity 1 (mild) is skipped
    expect(isSegmentActive(seg('violence', 1), baseConfig)).toBe(false);
  });

  it('activates at threshold 3 for all severities', () => {
    // threshold 3 = filter all
    expect(isSegmentActive(seg('language.crude', 1), baseConfig)).toBe(true);
    expect(isSegmentActive(seg('language.crude', 2), baseConfig)).toBe(true);
    expect(isSegmentActive(seg('language.crude', 3), baseConfig)).toBe(true);
  });

  it('rejects below minimum confidence', () => {
    expect(isSegmentActive(seg('violence', 3, 0.5), baseConfig)).toBe(false);
  });

  it('rejects unconfigured categories', () => {
    expect(isSegmentActive(seg('nudity', 3), baseConfig)).toBe(false);
  });
});
