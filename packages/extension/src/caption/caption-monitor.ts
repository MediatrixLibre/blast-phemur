/**
 * Real-time caption monitor.
 *
 * Observes subtitle/caption DOM elements on streaming providers and runs
 * the blasphemy pattern matcher against caption text as it appears.
 *
 * This is the FALLBACK path when no pre-computed filter data exists.
 * It provides caption-line-level muting (2-3 second granularity) vs.
 * the word-level precision (400-600ms) of pre-computed data.
 *
 * Architecture:
 *   MutationObserver watches the subtitle container
 *   -> New caption text detected
 *   -> Pattern matcher checks for blasphemy
 *   -> If match found, mute video for the caption duration
 *   -> Unmute when caption changes or after timeout
 */

import type { ProviderModule, UserConfig } from '@guardianstream/types';
import { scanText, isMatchActive } from '../lexicon/profanity.js';
import type { TextMatch } from '../lexicon/profanity.js';
import { AudioDucker } from '../engine/audio-ducker.js';
import { debugLog } from '../debug/recorder.js';
import { readCaptionText, maskWord } from './caption-censor.js';

export interface CaptionMonitorOptions {
  /** The video element to mute/unmute */
  video: HTMLVideoElement;
  /** Provider module (for subtitle selector) */
  provider: ProviderModule;
  /** User config (for threshold/sensitivity) */
  config: UserConfig;
  /** Callback when a match is detected */
  onMatch?: (match: TextMatch, captionText: string) => void;
  /** Called whenever a new caption line appears (even with no match) */
  onCaption?: (captionText: string) => void;
  /** Callback when mute state changes */
  onMuteChange?: (muted: boolean, reason?: string) => void;
  /**
   * Names this title, so a false alarm can be passed for one moment here too
   * ("captions:" + page + program). A pass is a short window of video time
   * around the line, under this key; a line shown inside it is not muted.
   */
  passKey?: () => string;
}

/** A caption-line pass covers the moment the line appeared, give or take this */
export const CAPTION_PASS_S = 0.75;

export class CaptionMonitor {
  private video: HTMLVideoElement;
  private provider: ProviderModule;
  private config: UserConfig;
  private onMatch?: CaptionMonitorOptions['onMatch'];
  private onCaption?: CaptionMonitorOptions['onCaption'];
  private active = true;
  private onMuteChange?: CaptionMonitorOptions['onMuteChange'];
  private passKey?: () => string;

  private observer: MutationObserver | null = null;
  private running = false;
  private isMuted = false;
  private ducker: AudioDucker;
  private unmuteTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastCaptionText = '';
  private matchCount = 0;
  private lineCount = 0;
  /** The last few caption lines and what was hidden for them, for quick corrections */
  private seenLines: { at: number; text: string }[] = [];
  private seenHits: { at: number; words: { text: string; category: string }[] }[] = [];

  // Mute transition duration (ms) -- prevents audio clicks
  private readonly FADE_MS = 50;
  // How long to keep muted after a match (ms) -- covers caption display time
  private readonly MUTE_DURATION_MS = 3000;
  // Minimum time between re-checks of the same caption text
  private readonly DEBOUNCE_MS = 80;
  private lastCheckTime = 0;

  constructor(options: CaptionMonitorOptions) {
    this.video = options.video;
    this.ducker = new AudioDucker(options.video, () => this.FADE_MS, (d, t, m) =>
      debugLog(d ? 'mute' : 'unmute', { via: 'captions', videoTime: +t.toFixed(2), viewerMuted: m }),
    );
    this.provider = options.provider;
    this.config = options.config;
    this.onMatch = options.onMatch;
    this.onCaption = options.onCaption;
    this.onMuteChange = options.onMuteChange;
    this.passKey = options.passKey;
  }

  get isRunning(): boolean {
    return this.running;
  }

  get totalMatches(): number {
    return this.matchCount;
  }

  /** Caption lines read so far; 0 means captions are off or none have shown yet */
  get linesSeen(): number {
    return this.lineCount;
  }

  /** Caption lines from the last `lookbackS` seconds of video, newest first */
  recentLines(lookbackS: number): string[] {
    const t = this.provider.getCurrentTime();
    return this.seenLines.filter((l) => l.at >= t - lookbackS).map((l) => l.text).reverse();
  }

  /** What was muted from captions in the last `lookbackS` seconds, one entry per mute, newest first */
  recentHits(lookbackS: number): { words: { text: string; category: string }[]; track?: string; start?: number; end?: number }[] {
    const t = this.provider.getCurrentTime();
    const key = this.passKey?.();
    return this.seenHits
      .filter((h) => h.at >= t - lookbackS)
      .map((h) => (key ? { words: h.words, track: key, start: h.at - CAPTION_PASS_S, end: h.at + CAPTION_PASS_S } : { words: h.words }))
      .reverse();
  }

  /** When this caption line was last seen on screen (video seconds), if it is one of the last few */
  lineSeenAt(text: string): number | null {
    const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const want = norm(text);
    for (let i = this.seenLines.length - 1; i >= 0; i--) if (norm(this.seenLines[i].text) === want) return this.seenLines[i].at;
    return null;
  }

  /** The key a live-captions pass is saved under on this page, if passes are possible here */
  get passTrack(): string | null {
    return this.passKey?.() ?? null;
  }

  /** Was the moment at video time t passed by the viewer ("that was fine here")? */
  private passed(t: number): boolean {
    const key = this.passKey?.();
    if (!key) return false;
    return (this.config.customWords?.passes ?? []).some((p) => p.track === key && t >= p.start && t <= p.end);
  }

  /** Start monitoring captions */
  start(): void {
    if (this.running) return;
    this.running = true;

    const selector = this.provider.getSubtitleSelector?.();
    if (!selector) {
      console.log('[Blast Phemur] No subtitle selector for this provider');
      return;
    }

    // Set up MutationObserver on the document body to catch caption elements
    // as they appear (captions are often dynamically inserted)
    this.observer = new MutationObserver(this.handleMutations);
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    // Also poll for caption text (some providers update text content
    // without adding/removing DOM nodes)
    this.startPolling(selector);

    console.log(`[Blast Phemur] Caption monitor active (${this.provider.manifest.name})`);
  }

  /** Stop monitoring and restore audio */
  stop(): void {
    if (!this.running) return;
    this.running = false;

    this.observer?.disconnect();
    this.observer = null;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.restoreAudio();

    if (this.unmuteTimer) {
      clearTimeout(this.unmuteTimer);
      this.unmuteTimer = null;
    }

    console.log(`[Blast Phemur] Caption monitor stopped (${this.matchCount} matches found)`);
  }

  /**
   * Turn muting on or off while still reporting captions. The subtitle
   * session switches this off while its anchored engine does the muting.
   */
  setActive(active: boolean): void {
    this.active = active;
    if (!active) {
      if (this.unmuteTimer) {
        clearTimeout(this.unmuteTimer);
        this.unmuteTimer = null;
      }
      this.restoreAudio();
    }
  }

  /** Update config without restarting */
  updateConfig(config: UserConfig): void {
    this.config = config;
  }

  // --- Internal ---

  private handleMutations = (_mutations: MutationRecord[]): void => {
    this.checkCaptions();
  };

  private startPolling(selector: string): void {
    // A timer, not requestAnimationFrame: frames stop completely in a hidden
    // tab, while a timer keeps running (throttled, but running).
    this.pollTimer = setInterval(() => {
      if (!this.running) return;
      this.checkCaptionsFromSelector(selector);
    }, 40);
  }

  private checkCaptions(): void {
    const selector = this.provider.getSubtitleSelector?.();
    if (!selector) return;
    this.checkCaptionsFromSelector(selector);
  }

  private checkCaptionsFromSelector(selector: string): void {
    // Debounce
    const now = performance.now();
    if (now - this.lastCheckTime < this.DEBOUNCE_MS) return;
    this.lastCheckTime = now;

    // Gather all visible caption text
    const elements = document.querySelectorAll(selector);
    if (elements.length === 0) {
      // Captions cleared -- unmute if we were muting due to caption match
      if (this.isMuted && !this.unmuteTimer) {
        this.restoreAudio();
      }
      this.lastCaptionText = '';
      return;
    }

    // A paused player has nothing to mute. Leaving lastCaptionText alone means
    // the caption on screen is judged afresh the moment playback resumes.
    if (this.video.paused) return;

    // Original words, even if the censor has masked them on screen
    const captionText = readCaptionText(elements);

    // Skip if same as last check
    if (captionText === this.lastCaptionText) return;
    this.lastCaptionText = captionText;

    if (!captionText) return;

    this.onCaption?.(captionText);
    this.lineCount++;
    this.seenLines.push({ at: this.provider.getCurrentTime(), text: captionText });
    if (this.seenLines.length > 8) this.seenLines.shift();
    if (!this.active) return;

    // Context-dependent blasphemy patterns are included; isMatchActive
    // drops them again when the user's threshold is strict-only.
    const activeMatches = scanText(captionText, true, this.config.customWords).filter((m) =>
      isMatchActive(m, this.config),
    );

    if (activeMatches.length > 0 && this.passed(this.provider.getCurrentTime())) {
      debugLog('passed', { via: 'captions', videoTime: +this.provider.getCurrentTime().toFixed(2) });
    } else if (activeMatches.length > 0) {
      this.matchCount += activeMatches.length;
      this.seenHits.push({ at: this.provider.getCurrentTime(), words: activeMatches.map((m) => ({ text: m.text, category: m.category })) });
      if (this.seenHits.length > 8) this.seenHits.shift();
      const bestMatch = activeMatches[0];

      this.onMatch?.(bestMatch, captionText);
      this.muteForDuration(this.MUTE_DURATION_MS, maskWord(bestMatch.text));

      console.log(
        `[Blast Phemur] Caption match: "${maskWord(bestMatch.text)}" (${bestMatch.category}, sev:${bestMatch.severity})`,
      );
    }
  }

  private muteForDuration(durationMs: number, reason: string): void {
    // A repeat hit extends the current mute
    if (this.unmuteTimer) clearTimeout(this.unmuteTimer);

    if (!this.isMuted) {
      this.ducker.duck();
      this.isMuted = true;
      this.onMuteChange?.(true, reason);
    }

    this.unmuteTimer = setTimeout(() => {
      this.restoreAudio();
      this.unmuteTimer = null;
    }, durationMs);
  }

  private restoreAudio(): void {
    if (!this.isMuted) return;
    this.ducker.restore();
    this.isMuted = false;
    this.onMuteChange?.(false);
  }
}
