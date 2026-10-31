/**
 * HBO Max (Max) provider module.
 */

import type { ProviderModule, ProviderModuleManifest } from '@guardianstream/types';

const manifest: ProviderModuleManifest = {
  id: 'max',
  name: 'Max (HBO)',
  version: '1.0.0',
  urlPatterns: ['*://*.max.com/*', '*://*.hbomax.com/*'],
  capabilities: ['seek', 'subtitles', 'content-id'],
};

export const HBOMaxModule: ProviderModule = {
  manifest,

  findVideo(): HTMLVideoElement | null {
    const videos = document.querySelectorAll('video');
    for (const v of videos) {
      if (v.readyState > 0) return v;
    }
    return videos[0] ?? null;
  },

  getContentId(): string | null {
    // Max URL: /video/watch/{contentId}/{episodeId}
    const match = window.location.pathname.match(
      /\/video\/watch\/([a-f0-9-]+)/i
    );
    return match?.[1] ?? null;
  },

  seekTo(seconds: number): void {
    const video = this.findVideo();
    if (video) video.currentTime = seconds;
  },

  getCurrentTime(): number {
    const video = this.findVideo();
    return video?.currentTime ?? 0;
  },

  getSubtitleSelector(): string {
    return '[class*="subtitle"], [class*="caption"], [class*="closed-caption"]';
  },
};
