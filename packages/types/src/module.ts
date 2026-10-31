/**
 * Provider module interface.
 *
 * Each streaming service (Netflix, Amazon, Disney+, etc.) has a module
 * that handles provider-specific quirks: video element location,
 * seek mechanism, content ID extraction, subtitle selectors.
 */

export interface ProviderModuleManifest {
  /** Unique provider ID (e.g. "netflix") */
  id: string;
  /** Human-readable name */
  name: string;
  /** Semver version */
  version: string;
  /** URL patterns this module handles */
  urlPatterns: string[];
  /** What this module can do */
  capabilities: ProviderCapability[];
}

export type ProviderCapability =
  | 'seek'
  | 'subtitles'
  | 'content-id'
  | 'ad-detection';

/**
 * The interface every provider module must implement.
 */
export interface ProviderModule {
  manifest: ProviderModuleManifest;

  /** Find the main video element (may be in shadow DOM or iframes) */
  findVideo(): HTMLVideoElement | null;

  /** Extract the provider's content ID from the current page */
  getContentId(): string | null;

  /**
   * Seek to a specific time in seconds.
   * Netflix needs internal API injection. Most others use video.currentTime.
   */
  seekTo(seconds: number): void;

  /**
   * Get current playback time in seconds.
   * Amazon ad-tier needs DOM-based time reading.
   */
  getCurrentTime(): number;

  /** CSS selector for subtitle/caption elements */
  getSubtitleSelector?(): string | null;

  /** The title being watched, for the status line (when the page title is generic) */
  getTitle?(): string | null;

  /** Whether the player is currently in an ad break */
  isAdPlaying?(): boolean;

  /** Cleanup when module is deactivated */
  destroy?(): void;
}
