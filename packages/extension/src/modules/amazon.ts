/**
 * Amazon Prime Video provider module.
 *
 * Amazon's ad-supported tier offsets video.currentTime by the ad duration.
 * Must read actual elapsed time from the DOM time indicator element.
 * Reference: movie-content-filter-extension.
 */

import type { ProviderModule, ProviderModuleManifest } from '@guardianstream/types';

const manifest: ProviderModuleManifest = {
  id: 'amazon',
  name: 'Amazon Prime Video',
  version: '1.0.0',
  urlPatterns: [
    '*://*.amazon.com/*',
    '*://*.amazon.co.uk/*',
    '*://*.amazon.de/*',
    '*://*.amazon.co.jp/*',
    '*://*.primevideo.com/*',
  ],
  capabilities: ['seek', 'subtitles', 'content-id', 'ad-detection'],
};

export const AmazonModule: ProviderModule = {
  manifest,

  findVideo(): HTMLVideoElement | null {
    const videos = document.querySelectorAll('video');
    for (const v of videos) {
      if (v.readyState > 0) return v;
    }
    return videos[0] ?? null;
  },

  getContentId(): string | null {
    // Amazon URL patterns:
    // /gp/video/detail/B08XYZ1234
    // /dp/B08XYZ1234
    // /detail/B08XYZ1234
    const match = window.location.pathname.match(
      /\/(?:gp\/video\/detail|dp|detail)\/([A-Z0-9]+)/
    );
    return match?.[1] ?? null;
  },

  seekTo(seconds: number): void {
    const video = this.findVideo();
    if (video) {
      // On ad-free tier, direct currentTime works.
      // On ad-supported tier, we may need to account for ad offset.
      video.currentTime = seconds;
    }
  },

  getCurrentTime(): number {
    // Amazon ad-supported tier: video.currentTime includes ad time.
    // Check for the real time indicator in the DOM.
    const timeEl = document.querySelector(
      '.atvwebplayersdk-timeindicator-text'
    );
    if (timeEl?.textContent) {
      const parsed = parseTimeString(timeEl.textContent);
      if (parsed !== null) return parsed;
    }

    // Fallback to video.currentTime
    const video = this.findVideo();
    return video?.currentTime ?? 0;
  },

  getSubtitleSelector(): string {
    return '.atvwebplayersdk-captions-text';
  },

  isAdPlaying(): boolean {
    // Amazon shows ad indicator elements during ad breaks
    return !!document.querySelector('.atvwebplayersdk-adtimeindicator-text')
      || !!document.querySelector('.adUnitView');
  },
};

/** Parse "1:23:45" or "23:45" time string to seconds. */
function parseTimeString(str: string): number | null {
  const parts = str.trim().split(':').map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}
