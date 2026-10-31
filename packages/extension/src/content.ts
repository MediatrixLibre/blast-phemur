/**
 * Content script -- injected into every page.
 *
 * Sprint 0: Local-only mode.
 * - Detects video elements
 * - Identifies provider module
 * - Loads filter data from extension storage (local JSON)
 * - Creates FilterEngine and starts filtering
 *
 * Future sprints add API lookups, community data, real-time caption monitoring.
 */

import type { GSFFilterSet, UserConfig, ProviderModule, CustomWords } from '@guardianstream/types';
import { DEFAULT_CONFIG } from '@guardianstream/types';
import { VideoDetector } from './detector/video-detector.js';
import { FilterEngine } from './engine/filter-engine.js';
import { identifyProvider } from './modules/registry.js';
import { ApiClient } from './cache/api-client.js';
import { computeContentId } from './shared/crypto.js';
import { mergeConfig, sameExceptWords, ENABLED_KEY } from './shared/config.js';
import { CaptionCensor } from './caption/caption-censor.js';
import { SubtitleSession } from './subtitles/session.js';
import { debugLog, debugEvents, isMuting } from './debug/recorder.js';
import { requestPlayerTrack } from './subtitles/player-captions.js';
import { installCorrectionShortcuts } from './corrections/shortcuts.js';
import { applyCorrection, type Correction, type HitEvent } from './corrections/corrections.js';
import { loadTracks } from './subtitles/library.js';
import { COMMUNITY_FILTERS } from './shared/features.js';
import { showToast } from './ui/toast.js';
import { mutesAnything } from './shared/selection.js';

/** Active engines keyed by video element */
const activeEngines = new Map<HTMLVideoElement, FilterEngine>();

/** Subtitle-anchored sessions keyed by video element */
const activeSessions = new Map<HTMLVideoElement, SubtitleSession>();

/** Caption censors for videos running on pre-computed data */
const activeCensors = new Map<HTMLVideoElement, CaptionCensor>();

/** Known videos, so a config or library change can restart them */
const knownVideos = new Set<HTMLVideoElement>();

/** Master on/off switch (popup toggle) */
let enabled = true;

async function loadEnabled(): Promise<boolean> {
  if (typeof chrome === 'undefined' || !chrome.storage) return true;
  return new Promise((resolve) => {
    chrome.storage.local.get(ENABLED_KEY, (r) => resolve(r[ENABLED_KEY] !== false));
  });
}

/** The provider module for the current page */
let currentProvider: ProviderModule | null = null;

/** User config (loaded from storage or defaults) */
let userConfig: UserConfig = DEFAULT_CONFIG;


/**
 * Load user config from extension storage.
 */
async function loadConfig(): Promise<UserConfig> {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get('config', (result) => {
        resolve(mergeConfig(result.config as Partial<UserConfig> | undefined));
      });
    } else {
      // Not in extension context (dev/test) -- check window for injected config
      const win = window as unknown as Record<string, unknown>;
      if (win.__GS_CONFIG__) {
        resolve(win.__GS_CONFIG__ as UserConfig);
      } else {
        resolve(DEFAULT_CONFIG);
      }
    }
  });
}

/**
 * Load filter data for the current page.
 *
 * Tries API server first (hash-prefix k-anonymity lookup),
 * then falls back to extension storage or window global.
 */
async function loadFilters(
  provider: ProviderModule,
): Promise<GSFFilterSet | null> {
  const nativeId = provider.getContentId();
  if (!nativeId) return null;

  // Compute the content hash (same as API/pipeline: sha256("provider:nativeId"))
  const contentId = await computeContentId(provider.manifest.id, nativeId);

  // Try the community server first, when there is one (the flag is a
  // constant, so with it off this whole block, and the client, leave the build)
  if (COMMUNITY_FILTERS) {
    try {
      const apiResult = await new ApiClient().fetchFilters(contentId);
      if (apiResult && apiResult.segments.length > 0) {
        console.log(`[Blast Phemur] Loaded ${apiResult.segments.length} segments from API`);
        return apiResult;
      }
    } catch {
      // API unavailable -- fall through to local storage
    }
  }

  // Fall back to extension storage
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const key = `filters:${provider.manifest.id}:${nativeId}`;
      chrome.storage.local.get(key, (result) => {
        resolve((result[key] as GSFFilterSet | undefined) ?? null);
      });
    } else {
      const win = window as unknown as Record<string, unknown>;
      resolve((win.__GS_FILTERS__ as GSFFilterSet) ?? null);
    }
  });
}

/**
 * Called when a video element is found on the page.
 */
/**
 * Streaming sites keep many <video> elements around (YouTube TV had 28:
 * thumbnail previews, hidden players). Only a player-sized one deserves a
 * session, since each session loads every imported subtitle track.
 */
const MIN_PLAYER_WIDTH = 400;
const pendingVideos = new Set<HTMLVideoElement>();
let pendingTimer: ReturnType<typeof setInterval> | null = null;

function isMainPlayer(video: HTMLVideoElement): boolean {
  if (video.clientWidth >= MIN_PLAYER_WIDTH) return true;
  // DIRECTV keeps the program playing, with sound, in a corner player while
  // the viewer browses. Previews elsewhere are muted and have no captions.
  const provider = currentProvider ?? identifyProvider(window.location.href);
  return provider.manifest.id === 'directv' && video.clientWidth > 0 && !video.muted && video.textTracks.length > 0;
}

/** Re-check small videos now and then: one may be enlarged into the real player */
function deferVideo(video: HTMLVideoElement): void {
  pendingVideos.add(video);
  if (pendingTimer) return;
  pendingTimer = setInterval(() => {
    for (const v of [...pendingVideos]) {
      if (!v.isConnected) pendingVideos.delete(v);
      else if (isMainPlayer(v)) {
        pendingVideos.delete(v);
        void onVideoFound(v);
      }
    }
  }, 1500);
}

async function onVideoFound(video: HTMLVideoElement): Promise<void> {
  if (activeEngines.has(video) || activeSessions.has(video)) return;
  if (!isMainPlayer(video)) {
    deferVideo(video);
    return;
  }
  debugLog('video', { width: video.clientWidth, paused: video.paused, dur: Number.isFinite(video.duration) ? Math.round(video.duration) : 'live', pending: pendingVideos.size });
  pendingVideos.delete(video);
  knownVideos.add(video);
  if (!enabled) return;

  if (!currentProvider) {
    currentProvider = identifyProvider(window.location.href);
  }

  const filters = await loadFilters(currentProvider);

  if (filters && filters.segments.length > 0) {
    // Pre-computed data available -- use word-level precision engine
    const engine = new FilterEngine(video, filters, userConfig, {
      seekTo: (s) => currentProvider?.seekTo(s),
      getCurrentTime: () => currentProvider?.getCurrentTime() ?? video.currentTime,
    });

    activeEngines.set(video, engine);
    engine.start();

    console.log(
      `[Blast Phemur] Filtering active: ${engine.segmentCount} segments on ${currentProvider.manifest.name}`,
    );

    // Hide the words on screen too
    const selector = currentProvider.getSubtitleSelector?.();
    if (selector) {
      const censor = new CaptionCensor(selector, () => userConfig);
      activeCensors.set(video, censor);
      censor.start();
    }
  } else {
    // No pre-computed data. Use the user's downloaded subtitles to anchor
    // to the episode (word-level, ahead of time), falling back to reading
    // captions live.
    if (activeSessions.has(video)) return;

    const tracks = await loadTracks();
    const session = new SubtitleSession(video, currentProvider, userConfig, tracks);
    activeSessions.set(video, session);
    session.start();
    debugLog('session', { tracksLoaded: tracks.length, tracks: tracks.slice(0, 40).map((t) => t.key) });

    // The player's own caption track beats anything imported: exact times, no
    // search, and it needs no caption on screen. Arrives later; until then the
    // session works as before.
    void requestPlayerTrack().then((track) => {
      if (!track || activeSessions.get(video) !== session) return;
      session.attachPlayerTrack(track);
    });

    console.log(
      `[Blast Phemur] Caption monitoring active on ${currentProvider.manifest.name} (${tracks.length} subtitle tracks loaded)`,
    );
  }
}

/**
 * Called when a video element is removed from the page.
 */
function onVideoRemoved(video: HTMLVideoElement): void {
  const engine = activeEngines.get(video);
  if (engine) {
    engine.stop();
    activeEngines.delete(video);
    console.log('[Blast Phemur] Engine stopped for removed video');
  }

  const session = activeSessions.get(video);
  if (session) {
    session.stop();
    activeSessions.delete(video);
    console.log('[Blast Phemur] Subtitle session stopped for removed video');
  }

  activeCensors.get(video)?.stop();
  activeCensors.delete(video);
  knownVideos.delete(video);
  pendingVideos.delete(video);
}

/**
 * Restart every active video from fresh settings. Debounced: importing 30
 * subtitle files writes 60 storage keys, which must cost one restart, not 60.
 */
let restartTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleRestart(delayMs = 400): void {
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = setTimeout(async () => {
    restartTimer = null;
    userConfig = await loadConfig();
    enabled = await loadEnabled();
    const videos = [...knownVideos];
    videos.forEach(onVideoRemoved);
    videos.forEach((v) => void onVideoFound(v));
  }, delayMs);
}

/**
 * Single-page apps (YouTube TV) change title without reloading and often
 * reuse the same <video> element. Watch the address and restart on change so
 * filters for the old title never keep running on the new one.
 */
function watchNavigation(): ReturnType<typeof setInterval> {
  // Tracking parameters (utm_*, rd_rsn...) change without any navigation
  let last = titleIdentity();
  return setInterval(() => {
    const now = titleIdentity();
    if (now === last) return;
    last = now;
    currentProvider = null; // content id comes from the URL
    debugLog('navigation', { path: now.slice(0, 40) });
    scheduleRestart(300);
  }, 1000);
}

/** The video the viewer is watching, whichever path is filtering it */
function primaryVideo(): HTMLVideoElement | null {
  return [...activeSessions.keys(), ...activeEngines.keys()][0] ?? null;
}

/** A correction from the keyboard: keep it in the viewer's own word lists */
function saveCustomWords(words: CustomWords): void {
  userConfig = { ...userConfig, customWords: words };
  try {
    chrome.storage.local.set({ config: userConfig });
  } catch {
    // This tab still runs a copy from before the extension was reloaded
    console.warn('[Blast Phemur] Could not save: reload this tab.');
  }
}

/**
 * For the popup's "what just happened" list: raw words and lines (the popup
 * must mask them for display) with where each hit sits in its caption track.
 */
function recentActivity(): { hits: HitEvent[]; lines: string[] } {
  const v = primaryVideo();
  const session = v ? activeSessions.get(v) : undefined;
  return { hits: session?.recentHits(60) ?? [], lines: session?.recentLines(60) ?? [] };
}

/** A correction asked for by the popup; same rules and same lists as the keys */
function correct(correction: Correction): { ok: boolean } {
  if (!correction || typeof correction.action !== 'string') return { ok: false };
  saveCustomWords(applyCorrection(userConfig.customWords ?? { block: [], allow: [], passes: [] }, correction));
  return { ok: true };
}

function watchCorrectionKeys(): () => void {
  return installCorrectionShortcuts({
    video: primaryVideo,
    recentHits: (lookbackS) => {
      const v = primaryVideo();
      if (!v) return [];
      const session = activeSessions.get(v);
      if (session) return session.recentHits(lookbackS);
      return (activeEngines.get(v)?.recentSegments(lookbackS) ?? [])
        .filter((seg) => (seg.words ?? []).length > 0)
        .map((seg) => ({ words: (seg.words ?? []).map((text) => ({ text, category: seg.category })) }));
    },
    recentLines: (lookbackS) => {
      const v = primaryVideo();
      return (v && activeSessions.get(v)?.recentLines(lookbackS)) || [];
    },
    config: () => userConfig,
    save: saveCustomWords,
  });
}

/** Everything useful for diagnosing a problem, safe to paste */
function debugReport(): Record<string, unknown> {
  const selector = currentProvider?.getSubtitleSelector?.() ?? null;
  const videos = [...document.querySelectorAll('video')];
  const settings = Object.fromEntries(
    Object.entries(userConfig.categories).map(([k, v]) => [k, `${v.threshold}/${v.action}`]),
  );
  return {
    report: 'Blast Phemur debug',
    page: { host: location.host, path: location.pathname.slice(0, 30), title: document.title.slice(0, 50) },
    provider: currentProvider?.manifest.id ?? null,
    status: currentStatus(),
    enabled,
    settings,
    censorCaptions: userConfig.censorCaptions !== false,
    alwaysHideWords: userConfig.customWords?.block.length ?? 0,
    tabHidden: document.hidden,
    tracksLoaded: [...activeSessions.values()][0]?.trackCount ?? null,
    playerCaptionCues: [...activeSessions.values()][0]?.playerCueCount ?? null,
    captionSelector: selector,
    captionNodesNow: selector ? document.querySelectorAll(selector).length : null,
    videos: {
      total: videos.length,
      sizes: [...new Set(videos.map((v) => v.clientWidth))],
      playing: videos.filter((v) => !v.paused).length,
      qualifying: videos.filter(isMainPlayer).length,
    },
    main: (() => {
      const v = videos.find(isMainPlayer);
      return v ? { t: +v.currentTime.toFixed(1), paused: v.paused, muted: v.muted, volume: +v.volume.toFixed(2) } : null;
    })(),
    events: debugEvents().slice(-150),
  };
}

/** Toolbar icon state for this tab: off, on (idle), filtering, muting, attention (nothing set to mute) */
function iconState(): 'off' | 'on' | 'filtering' | 'muting' | 'attention' {
  if (!enabled) return 'off';
  if (!(activeEngines.size > 0 || activeSessions.size > 0)) return 'on';
  if (!mutesAnything(userConfig)) return 'attention';
  return isMuting() ? 'muting' : 'filtering';
}
let lastIcon = '';

/**
 * The Family Movie Act's notice: a clear statement, at the beginning of the
 * showing, that it is altered from the original. Once per title, as soon as
 * a filter runs on a video that is playing in a tab the viewer can see (a
 * hidden tab waits until it is shown), in the player so fullscreen shows it
 * too, in every filtering mode. No setting turns it off.
 */
let noticedTitle = '';
function titleIdentity(): string {
  return location.pathname + (new URLSearchParams(location.search).get('v') ?? '');
}
function noticeAtStart(): void {
  if (!enabled || !mutesAnything(userConfig)) return;
  const title = titleIdentity();
  if (noticedTitle === title) return;
  const video = primaryVideo();
  if (!video || video.paused || document.visibilityState !== 'visible') return;
  noticedTitle = title;
  showToast(video, {
    text: 'Blast Phemur is filtering this showing',
    hint: 'It is altered from the original: the words you chose are muted. Keys: [ that was fine, ] mute it, \\ undo.',
    holdMs: 6000,
  });
}

function reportIcon(): void {
  noticeAtStart();
  const state = iconState();
  if (state === lastIcon) return;
  lastIcon = state;
  try { chrome.runtime.sendMessage({ type: 'ICON_STATE', state }); } catch { /* extension reloaded; this script is stale */ }
}

/** Snapshot for the popup */
function currentStatus(): Record<string, unknown> {
  const engine = [...activeEngines.values()][0];
  const session = [...activeSessions.values()][0]?.status();
  const videos = [...document.querySelectorAll('video')];
  return {
    connected: true,
    // One module serves both YouTube sites; name the one the viewer is on
    provider: location.host === 'tv.youtube.com' ? 'YouTube TV' : (currentProvider?.manifest.name ?? null),
    segmentCount: engine?.segmentCount ?? session?.segmentCount ?? 0,
    isFiltering: enabled && (activeEngines.size > 0 || activeSessions.size > 0),
    enabled,
    title: session?.episode ?? null,
    mode: engine ? 'precomputed' : (session?.mode ?? null),
    offset: session?.offset ?? 0,
    captionHits: session?.captionHits ?? 0,
    captionLines: session?.captionLines ?? 0,
    libraryCount: session?.libraryCount ?? 0,
    source: session?.source ?? null,
    // A preview or thumbnail is playing but no full-size player: the popup says so
    smallVideoPlaying: videos.some((v) => !v.paused && v.clientWidth > 0 && !isMainPlayer(v)),
  };
}

/**
 * An extension update or reload orphans the copy already running in each tab:
 * its DOM watchers and volume control keep going, but it can no longer talk
 * to the extension. Each new copy announces itself with a DOM event (DOM
 * events cross the extension's isolated worlds), and the old copy stands
 * down, restoring the sound. An orphan with no successor (the extension was
 * turned off or removed) notices on its own and stands down too.
 */
const TAKEOVER = 'guardianstream:takeover';
const cleanups: (() => void)[] = [];
let retired = false;

function standDown(why: string): void {
  if (retired) return;
  retired = true;
  cleanups.splice(0).forEach((fn) => { try { fn(); } catch { /* best effort */ } });
  [...knownVideos].forEach(onVideoRemoved);
  console.log(`[Blast Phemur] This copy stood down (${why})`);
}

function orphaned(): boolean {
  try { return !chrome.runtime?.id; } catch { return true; }
}

/**
 * Main initialization.
 */
async function init(): Promise<void> {
  document.dispatchEvent(new CustomEvent(TAKEOVER));
  const onTakeover = () => standDown('a newer copy started');
  document.addEventListener(TAKEOVER, onTakeover);
  cleanups.push(() => document.removeEventListener(TAKEOVER, onTakeover));

  userConfig = await loadConfig();
  enabled = await loadEnabled();
  if (retired) return;

  const detector = new VideoDetector({
    onVideoFound: (video) => {
      onVideoFound(video);
    },
    onVideoRemoved,
  });

  detector.start();
  cleanups.push(() => detector.stop());
  const nav = watchNavigation();
  cleanups.push(() => clearInterval(nav));
  cleanups.push(watchCorrectionKeys());
  // Background-tab reports: when the tab was hidden or shown, in the debug timeline
  document.addEventListener('visibilitychange', () => debugLog('visibility', { hidden: document.hidden }));

  const icon = setInterval(() => {
    if (orphaned()) standDown('the extension was reloaded or turned off');
    else reportIcon();
  }, 400);
  cleanups.push(() => clearInterval(icon));
  reportIcon();

  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === 'GET_STATUS') sendResponse(currentStatus());
      else if (message?.type === 'GET_DEBUG') sendResponse(debugReport());
      else if (message?.type === 'GET_RECENT') sendResponse(recentActivity());
      else if (message?.type === 'CORRECT') sendResponse(correct(message.correction));
    });
  }

  // Settings or imported subtitles changed in the popup: restart cleanly.
  // A change to the word lists alone (a correction, a pass) is swapped in
  // place, so Just muted and the player track survive it.
  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes) => {
      const keys = Object.keys(changes);
      if (changes.config) {
        const next = mergeConfig(changes.config.newValue as Partial<UserConfig> | undefined);
        const wordsOnly = keys.length === 1 && sameExceptWords(userConfig, next);
        // Taken at once, so a correction made before the restart below never
        // writes back the settings it replaced
        userConfig = next;
        if (wordsOnly && restartTimer === null && activeEngines.size === 0) {
          activeSessions.forEach((s) => s.updateWords(next));
          return;
        }
      }
      const touched = keys.some((k) => k === 'config' || k === ENABLED_KEY || k.startsWith('gs:subs:'));
      if (touched) scheduleRestart();
    });
  }

  console.log('[Blast Phemur] Content script initialized');
}

// Go
init();
