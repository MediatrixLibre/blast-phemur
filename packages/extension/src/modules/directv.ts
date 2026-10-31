/**
 * DIRECTV Stream provider module (stream.directv.com/player).
 *
 * Captions are a TextTrack the browser draws, not page elements, so there is
 * no subtitle selector; subtitles/text-track.ts reads the cues instead.
 * Live channels use roll-up captions that arrive about 16 s ahead of the
 * playhead (seen 2026-10-11 on a live game).
 */

import type { ProviderModule, ProviderModuleManifest } from '@guardianstream/types';

const manifest: ProviderModuleManifest = {
  id: 'directv',
  name: 'DIRECTV Stream',
  version: '1.0.0',
  urlPatterns: ['*://stream.directv.com/*'],
  capabilities: ['seek', 'subtitles'],
};

export const DirecTVModule: ProviderModule = {
  manifest,

  findVideo(): HTMLVideoElement | null {
    let best: HTMLVideoElement | null = null;
    let bestArea = 0;
    for (const v of document.querySelectorAll('video')) {
      const area = v.clientWidth * v.clientHeight;
      if (area > bestArea) {
        best = v;
        bestArea = area;
      }
    }
    return best;
  },

  getContentId(): string | null {
    // Every channel plays at /player; the program title tells them apart
    return this.getTitle?.() ?? null;
  },

  getTitle(): string | null {
    const el = document.querySelector('.content-info__title');
    return el?.textContent?.trim() || null;
  },

  seekTo(seconds: number): void {
    const video = this.findVideo();
    if (video) video.currentTime = seconds;
  },

  getCurrentTime(): number {
    return this.findVideo()?.currentTime ?? 0;
  },

  getSubtitleSelector(): string | null {
    return null;
  },
};
