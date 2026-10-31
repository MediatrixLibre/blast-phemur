/**
 * Open taxonomy system for content categories.
 *
 * Layer 1: Universal dimensions (built-in, 6 categories)
 * Layer 2: Canonical categories (community-governed)
 * Layer 3: User tags (personal, freeform)
 */

/** The three governance layers of the taxonomy */
export type TaxonomyLayer = 1 | 2 | 3;

/** Lifecycle of a taxonomy category */
export type CategoryStatus = 'active' | 'proposed' | 'merged' | 'deprecated';

/** Content severity: 1=mild, 2=moderate, 3=graphic */
export type Severity = 1 | 2 | 3;

/** Filter threshold: 0=off, 1=graphic only, 2=moderate+, 3=all */
export type Threshold = 0 | 1 | 2 | 3;

/**
 * A category in the open taxonomy.
 *
 * IDs use dot notation for hierarchy: "blasphemy.gods_name"
 * Parent is derived by dropping the last segment: "blasphemy"
 */
export interface TaxonomyCategory {
  id: string;
  layer: TaxonomyLayer;
  name: string;
  description: string;
  examples: string[];
  synonyms: string[];
  defaultAction: FilterAction;
  defaultThreshold: Threshold;
  createdBy: string;
  createdAt: string;
  usageCount: number;
  subscriberCount: number;
  status: CategoryStatus;
}

/**
 * The 6 universal dimensions (Layer 1).
 * Every rating system worldwide includes these.
 */
export const UNIVERSAL_DIMENSIONS = [
  'violence',
  'sexual_content',
  'language',
  'nudity',
  'substances',
  'fear',
] as const;

export type UniversalDimension = (typeof UNIVERSAL_DIMENSIONS)[number];

/**
 * A pre-built collection of category settings.
 * Users subscribe to packs as starting points, then customize.
 */
export interface CategoryPack {
  id: string;
  name: string;
  description: string;
  author: string;
  categories: CategoryPackEntry[];
  subscribers: number;
  rating: number;
  tags: string[];
}

export interface CategoryPackEntry {
  categoryId: string;
  threshold: Threshold;
  action: FilterAction;
}

/** Actions the filter engine can take on a segment */
export type FilterAction = 'skip' | 'mute' | 'blur' | 'bleep' | 'black';

/**
 * Per-category user setting: how aggressively to filter + what action.
 */
export interface CategorySetting {
  threshold: Threshold;
  action: FilterAction;
}
