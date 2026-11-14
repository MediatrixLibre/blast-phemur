/**
 * Plex provider module (watch.plex.tv: Plex's free, ad-supported movies and
 * shows, signed in or not).
 *
 * The player is Shaka Player. Once a subtitle is chosen under "Subtitles &
 * Captions", the browser draws it from a native TextTrack (kind "subtitles",
 * label "English", mode "showing") that holds the whole title's cues from the
 * first moment (1,647 cues for a two-hour film, read 2026-11-14), so muting is
 * placed ahead of each word, as on YouTube, and keeps working in a background
 * tab. With subtitles off there is only Shaka's own empty hidden track, so
 * the popup asks for captions (CC) to be turned on. There is no caption DOM
 * to read or mask: subtitles/text-track.ts masks the cue text itself.
 *
 * Address seen: /watch/movie/<slug>?uri=provider://tv.plex.provider.vod/
 * library/metadata/<id>. The metadata id names the title; the path is the
 * fallback where there is none.
 */

import type { ProviderModule, ProviderModuleManifest } from '@guardianstream/types';

const manifest: ProviderModuleManifest = {
  id: 'plex',
  name: 'Plex',
  version: '1.0.0',
  urlPatterns: ['*://watch.plex.tv/*'],
  capabilities: ['seek', 'subtitles', 'content-id'],
};

/**
 * Plex's own id for the title, from the `uri` query parameter
 * (provider://tv.plex.provider.vod/library/metadata/<id>); otherwise the
 * page path, which Plex also gives one per title. Null off a player page.
 */
export function plexContentId(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const uri = url.searchParams.get('uri') ?? '';
  const id = uri.match(/\/library\/metadata\/([A-Za-z0-9]+)/)?.[1];
  if (id) return id;
  return url.pathname.startsWith('/watch/') ? url.pathname : null;
}

export const PlexModule: ProviderModule = {
  manifest,

  findVideo(): HTMLVideoElement | null {
    // The player is the one full-size <video>; Plex keeps two empty ones beside it
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
    return plexContentId(window.location.href);
  },

  getTitle(): string | null {
    // The page title is Plex's generic one; the player's title link names the show
    const el = document.querySelector('[data-testid="playerTitleLink"]');
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
