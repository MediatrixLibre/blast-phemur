export type {
  TaxonomyLayer,
  CategoryStatus,
  Severity,
  Threshold,
  TaxonomyCategory,
  UniversalDimension,
  CategoryPack,
  CategoryPackEntry,
  FilterAction,
  CategorySetting,
} from './taxonomy.js';

export { UNIVERSAL_DIMENSIONS } from './taxonomy.js';

export type {
  GSFSegment,
  SegmentSource,
  SegmentRegion,
  FilterCoverage,
  GSFFilterSet,
} from './filter.js';

export type {
  ProviderModuleManifest,
  ProviderCapability,
  ProviderModule,
} from './module.js';

export type {
  UserProfile,
  UserConfig,
  CustomWords,
  PassWindow,
} from './config.js';

export { DEFAULT_CONFIG } from './config.js';

export type { MediaKind, MediaKindInfo, CatalogCategory, Preset } from './catalog.js';
export { MEDIA_KINDS, CATALOG, LEVELS, STRICTNESS, PRESETS, presetToCategories } from './catalog.js';
