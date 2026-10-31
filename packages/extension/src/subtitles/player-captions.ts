/**
 * Ask the page for the player's own caption track (see page/player-bridge.ts)
 * and turn it into a Track the anchor can pin to.
 */

import type { Track } from './anchor.js';
import { debugLog } from '../debug/recorder.js';

const ASK = 'gs:player-captions?';
const ANSWER = 'gs:player-captions';
/** A little longer than the page side waits, so its answer wins the race */
const TIMEOUT_MS = 20_000;

export const PLAYER_TRACK_PREFIX = 'player:';

export function hasPlayerCaptions(host: string = window.location.hostname): boolean {
  return host === 'youtube.com' || host.endsWith('.youtube.com');
}

export function requestPlayerTrack(): Promise<Track | null> {
  if (!hasPlayerCaptions()) return Promise.resolve(null);
  return new Promise((resolve) => {
    const id = Math.random().toString(36).slice(2);
    const finish = (track: Track | null, note: Record<string, unknown>): void => {
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
      debugLog('player-captions', note);
      resolve(track);
    };
    const onMessage = (event: MessageEvent): void => {
      if (event.source !== window || event.data?.gs !== ANSWER || event.data.id !== id) return;
      const d = event.data as { ok: boolean; reason?: string; videoId?: string; title?: string; languageCode?: string; cues?: [number, number, string][] };
      if (!d.ok || !d.cues || !d.videoId) return finish(null, { ok: false, reason: d.reason ?? 'unknown' });
      finish(
        {
          key: PLAYER_TRACK_PREFIX + d.videoId,
          title: d.title || 'this title',
          cues: d.cues.map(([start, end, text]) => ({ start, end, text })),
        },
        { ok: true, lang: d.languageCode, cues: d.cues.length, lastCueAt: Math.round(d.cues[d.cues.length - 1][0]) },
      );
    };
    const timer = setTimeout(() => finish(null, { ok: false, reason: 'no answer from the page' }), TIMEOUT_MS);
    window.addEventListener('message', onMessage);
    window.postMessage({ gs: ASK, id }, window.location.origin);
  });
}
