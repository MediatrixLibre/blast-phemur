/**
 * Netflix provider module.
 *
 * Netflix blocks direct video.currentTime manipulation for seeking.
 * Must inject a page-context script that calls the internal Netflix
 * player API. This approach is from movie-content-filter-extension.
 */

import type { ProviderModule, ProviderModuleManifest } from '@guardianstream/types';

const manifest: ProviderModuleManifest = {
  id: 'netflix',
  name: 'Netflix',
  version: '1.0.0',
  urlPatterns: ['*://*.netflix.com/*'],
  capabilities: ['seek', 'subtitles', 'content-id'],
};

export const NetflixModule: ProviderModule = {
  manifest,

  findVideo(): HTMLVideoElement | null {
    const videos = document.getElementsByTagName('video');
    for (const v of videos) {
      if (v.currentTime > 0) return v;
    }
    return videos[0] ?? null;
  },

  getContentId(): string | null {
    // Netflix URL patterns: /watch/81131850 or /title/81131850
    const match = window.location.pathname.match(/\/(?:watch|title)\/(\d+)/);
    return match?.[1] ?? null;
  },

  seekTo(seconds: number): void {
    // Netflix requires page-context script injection to seek.
    // Content scripts run in an isolated world and cannot access
    // netflix.appContext directly.
    const ms = Math.round(seconds * 1000);
    const script = document.createElement('script');
    script.textContent = `
      (function() {
        try {
          var videoPlayer = netflix.appContext.state.playerApp
            .getAPI().videoPlayer;
          var sessions = videoPlayer.getAllPlayerSessionIds();
          for (var i = 0; i < sessions.length; i++) {
            var player = videoPlayer.getVideoPlayerBySessionId(sessions[i]);
            if (player) { player.seek(${ms}); break; }
          }
        } catch(e) { /* Netflix API unavailable */ }
      })();
    `;
    document.documentElement.appendChild(script);
    script.remove();
  },

  getCurrentTime(): number {
    const video = this.findVideo();
    return video?.currentTime ?? 0;
  },

  getSubtitleSelector(): string {
    return '.player-timedtext-text-container';
  },
};
