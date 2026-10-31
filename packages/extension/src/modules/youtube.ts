/**
 * YouTube provider module.
 */

import type { ProviderModule, ProviderModuleManifest } from '@guardianstream/types';

const manifest: ProviderModuleManifest = {
  id: 'youtube',
  name: 'YouTube',
  version: '1.0.0',
  urlPatterns: ['*://*.youtube.com/*'],
  capabilities: ['seek', 'subtitles', 'content-id'],
};

export const YouTubeModule: ProviderModule = {
  manifest,

  findVideo(): HTMLVideoElement | null {
    // YouTube's main player video
    return document.querySelector('video.html5-main-video')
      ?? document.querySelector('video');
  },

  getContentId(): string | null {
    // YouTube URL: /watch?v=VIDEO_ID or /shorts/VIDEO_ID
    const url = new URL(window.location.href);
    const v = url.searchParams.get('v');
    if (v) return v;

    // YouTube TV: /watch/AIRING_ID
    const tvMatch = url.pathname.match(/^\/watch\/([a-zA-Z0-9_-]+)/);
    if (tvMatch) return tvMatch[1];

    const shortsMatch = url.pathname.match(/\/shorts\/([a-zA-Z0-9_-]+)/);
    return shortsMatch?.[1] ?? null;
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
    return '.ytp-caption-segment';
  },
};
