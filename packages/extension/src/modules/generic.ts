/**
 * Generic provider module.
 *
 * Fallback for any site not matched by a specific provider module.
 * Uses standard HTMLVideoElement APIs (works on most sites).
 */

import type { ProviderModule, ProviderModuleManifest } from '@guardianstream/types';

const manifest: ProviderModuleManifest = {
  id: 'generic',
  name: 'Generic',
  version: '1.0.0',
  urlPatterns: ['*://*/*'],
  capabilities: ['seek', 'content-id'],
};

export const GenericModule: ProviderModule = {
  manifest,

  findVideo(): HTMLVideoElement | null {
    const videos = document.querySelectorAll('video');
    // Prefer the largest visible video (likely the main player)
    let best: HTMLVideoElement | null = null;
    let bestArea = 0;
    for (const video of videos) {
      const rect = video.getBoundingClientRect();
      const area = rect.width * rect.height;
      if (area > bestArea && rect.width > 0 && rect.height > 0) {
        best = video;
        bestArea = area;
      }
    }
    return best;
  },

  getContentId(): string | null {
    // Use the page URL as a content identifier
    return window.location.pathname;
  },

  seekTo(seconds: number): void {
    const video = this.findVideo();
    if (video) video.currentTime = seconds;
  },

  getCurrentTime(): number {
    const video = this.findVideo();
    return video?.currentTime ?? 0;
  },

  getSubtitleSelector(): string | null {
    // Try common subtitle selectors
    const selectors = [
      '.player-timedtext-text-container', // Netflix
      '.ytp-caption-segment',             // YouTube
      '.atvwebplayersdk-captions-text',   // Amazon
      '.subtitle-container',              // Plex
      '[data-testid="subtitle"]',
    ];
    for (const sel of selectors) {
      if (document.querySelector(sel)) return sel;
    }
    return null;
  },
};
