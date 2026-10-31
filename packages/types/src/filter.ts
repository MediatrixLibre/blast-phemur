/**
 * GuardianStream Filter Format (GSF) v2.
 *
 * JSON-based format for content filter data.
 * Categories are open (any string ID from the taxonomy),
 * not a fixed enum.
 */

import type { FilterAction, Severity } from './taxonomy.js';

/**
 * A single filterable segment within a title.
 */
export interface GSFSegment {
  /** Unique segment identifier */
  id: string;
  /** Start time in seconds (3 decimal places) */
  start: number;
  /** End time in seconds (3 decimal places) */
  end: number;

  /** Category ID from the open taxonomy (e.g. "blasphemy.gods_name") */
  category: string;
  /** Content severity: 1=mild, 2=moderate, 3=graphic */
  severity: Severity;
  /** Recommended action */
  action: FilterAction;

  /** Detection confidence 0.0-1.0 */
  confidence: number;
  /** Where this segment came from */
  source: SegmentSource;
  /** Community vote count (positive = trusted) */
  votes: number;

  /** For language segments: the detected words */
  words?: string[];
  /** Per-word [start, end] timestamps for precise muting */
  wordTimestamps?: [number, number][];

  /** For visual segments: blur/black only this region (normalized 0-1) */
  region?: SegmentRegion;

  /** Human-readable note ("Extended torture scene") */
  description?: string;
  /** Hashed user ID of creator */
  createdBy?: string;
  /** ISO 8601 creation timestamp */
  createdAt?: string;
}

export type SegmentSource = 'ai' | 'community' | 'official';

export interface SegmentRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Coverage metadata for a filter set.
 * Indicates how thoroughly the title has been analyzed.
 */
export interface FilterCoverage {
  audioAnalyzed: boolean;
  visualAnalyzed: boolean;
  sceneAnalyzed: boolean;
  humanReviewed: boolean;
  /** 0-1 estimate of how completely the title is tagged */
  completenessEstimate: number;
  lastUpdated: string;
}

/**
 * A complete filter set for one title on one provider.
 */
export interface GSFFilterSet {
  version: '2.0';
  /** SHA-256 of "provider:native_content_id" */
  contentId: string;
  /** Human-readable title */
  title: string;
  /** Provider ID (e.g. "netflix", "amazon") */
  provider: string;
  /** Provider's native content identifier */
  providerContentId: string;
  /** Total duration in seconds */
  duration: number;
  /** All filter segments, sorted by start time */
  segments: GSFSegment[];
  /** How thoroughly this title has been analyzed */
  coverage: FilterCoverage;
}
