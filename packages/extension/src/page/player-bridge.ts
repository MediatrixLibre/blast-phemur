/**
 * Runs in the PAGE's own JavaScript world (manifest "world": "MAIN"). The
 * extension's content script lives in an isolated world and cannot see the
 * YouTube player's methods, so this small script reads the player's caption
 * track and hands the cues over by message.
 *
 * Why it matters: YouTube TV stops drawing captions while its tab is in the
 * background, so anything that reads the caption text on screen goes blind
 * exactly when the viewer is not looking. The caption FILE is still there, on
 * the same clock as the video.
 */

import { cuesFromJson3, pickTrack, type PlayerTrackInfo, type SelectedTrack } from '../subtitles/json3.js';

const ASK = 'gs:player-captions?';
const ANSWER = 'gs:player-captions';
const WAIT_MS = 15_000;
const POLL_MS = 500;

interface CaptionTrack extends PlayerTrackInfo {
  baseUrl: string;
}

interface PlayerElement extends HTMLElement {
  getPlayerResponse?: () => PlayerResponse | undefined;
  getVideoData?: () => { video_id?: string } | undefined;
  getOption?: (module: string, option: string) => SelectedTrack | undefined;
}

interface PlayerResponse {
  videoDetails?: { videoId?: string; title?: string };
  captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] } };
}

type Answer =
  | { ok: true; videoId: string; title: string; languageCode: string; cues: [number, number, string][] }
  | { ok: false; reason: string };

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const cache = new Map<string, Answer>();

function player(): PlayerElement | null {
  return document.querySelector<PlayerElement>('#movie_player, .html5-video-player');
}

/** The response can still be the PREVIOUS title's for a moment after navigation */
async function waitForTracks(): Promise<{ el: PlayerElement; videoId: string; title: string; tracks: CaptionTrack[] } | null> {
  const t0 = Date.now();
  while (Date.now() - t0 < WAIT_MS) {
    const el = player();
    try {
      const response = el?.getPlayerResponse?.();
      const tracks = response?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      const videoId = response?.videoDetails?.videoId;
      const current = el?.getVideoData?.()?.video_id;
      if (el && tracks?.length && videoId && (!current || current === videoId)) {
        return { el, videoId, title: response?.videoDetails?.title ?? '', tracks };
      }
    } catch {
      // The player is mid-reload; try again
    }
    await sleep(POLL_MS);
  }
  return null;
}

async function load(): Promise<Answer> {
  const found = await waitForTracks();
  if (!found) return { ok: false, reason: 'no caption tracks offered by the player' };
  const hit = cache.get(found.videoId);
  if (hit) return hit;

  let selected: SelectedTrack | undefined;
  try {
    selected = found.el.getOption?.('captions', 'track');
  } catch {
    selected = undefined;
  }
  const track = pickTrack(found.tracks, selected, navigator.language);
  if (!track) return { ok: false, reason: 'no usable caption track' };

  try {
    const url = new URL(track.baseUrl, location.href);
    url.searchParams.set('fmt', 'json3');
    const res = await fetch(url.toString(), { credentials: 'include' });
    if (!res.ok) return { ok: false, reason: `caption download failed (${res.status})` };
    const cues = cuesFromJson3(await res.json());
    if (cues.length === 0) return { ok: false, reason: 'caption track was empty' };
    const answer: Answer = {
      ok: true,
      videoId: found.videoId,
      // The episode name on YouTube TV ("Here Was a Man"); the page title is generic
      title: found.title,
      languageCode: track.languageCode ?? '',
      cues: cues.map((c) => [c.start, c.end, c.text]),
    };
    cache.set(found.videoId, answer);
    return answer;
  } catch (e) {
    return { ok: false, reason: `caption download error: ${String(e).slice(0, 60)}` };
  }
}

// The page world outlives extension reloads, so a re-injected bridge must not
// add a second listener (two answers per question)
const page = window as unknown as { __guardianstreamBridge?: boolean };
if (!page.__guardianstreamBridge) {
  page.__guardianstreamBridge = true;
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window || event.data?.gs !== ASK) return;
    const id: unknown = event.data.id;
    void load().then((answer) => window.postMessage({ gs: ANSWER, id, ...answer }, location.origin));
  });
}
