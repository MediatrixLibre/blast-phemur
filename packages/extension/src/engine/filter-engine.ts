/**
 * Core filtering engine.
 *
 * Attaches to a <video> element and enforces skip/mute/blur/bleep/black
 * actions at tagged timestamps. Uses binary search + rAF for sub-250ms
 * precision (video.timeupdate only fires ~4Hz).
 *
 * Improvements over existing tools:
 * - Binary search on sorted segments (not linear scan)
 * - requestAnimationFrame near segment boundaries for word-level precision
 * - Smooth audio fade transitions (50ms default, prevents clicks)
 * - Action priority resolution when segments overlap
 * - Region-targeted blur (not just full-frame)
 * - FMA compliance notice on first filter activation
 */

import type {
  GSFFilterSet,
  GSFSegment,
  FilterAction,
  UserConfig,
} from '@guardianstream/types';
import { AudioDucker } from './audio-ducker.js';
import { debugLog } from '../debug/recorder.js';
import { SegmentIndex } from './segment-index.js';
import { isSegmentActive, resolveCategorySetting } from './category-resolver.js';
import { actionPriority } from './action-resolver.js';

export interface SeekFunction {
  (seconds: number): void;
}

export interface EngineOptions {
  /** Provider-specific seek function (Netflix needs API injection) */
  seekTo?: SeekFunction;
  /** Provider-specific current time getter */
  getCurrentTime?: () => number;
}

export class FilterEngine {
  private video: HTMLVideoElement;
  private config: UserConfig;
  private index: SegmentIndex;
  private options: EngineOptions;

  // State
  private running = false;
  private isMuted = false;
  private isBlurred = false;
  private isBlacked = false;
  private ducker: AudioDucker;
  private rafId: number | null = null;
  private nextEvent: number | undefined;

  // DOM overlays (lazily created)
  private blurOverlay: HTMLDivElement | null = null;
  private blackOverlay: HTMLDivElement | null = null;
  private noticeEl: HTMLDivElement | null = null;
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;
  /** Exact-time wake-up used while the tab is hidden (no animation frames there) */
  private hiddenTimer: ReturnType<typeof setTimeout> | null = null;
  /** In a hidden tab only ~4 time updates a second arrive, so start the mute this much early */
  private static readonly HIDDEN_LEAD_S = 0.3;

  constructor(
    video: HTMLVideoElement,
    filterSet: GSFFilterSet,
    config: UserConfig,
    options: EngineOptions = {},
  ) {
    this.video = video;
    this.config = config;
    this.ducker = new AudioDucker(video, () => this.config.muteTransitionMs, (d, t, m) =>
      debugLog(d ? 'mute' : 'unmute', { via: 'anchored', videoTime: +t.toFixed(2), viewerMuted: m }),
    );
    this.options = options;
    this.index = this.buildIndex(filterSet.segments);
  }

  /** Filter segments by user config, override actions per preferences */
  private buildIndex(segments: GSFSegment[]): SegmentIndex {
    const active = segments
      .filter((seg) => isSegmentActive(seg, this.config))
      .map((seg) => {
        const setting = resolveCategorySetting(seg.category, this.config);
        return setting ? { ...seg, action: setting.action } : seg;
      });
    return new SegmentIndex(active);
  }

  /**
   * Swap in a new segment list without stopping (a live caption track grows
   * while it plays). Sound is left alone unless a boundary was crossed, so a
   * mute in progress is not broken by the update.
   */
  replaceSegments(segments: GSFSegment[]): void {
    this.index = this.buildIndex(segments);
    if (this.running) this.resync();
  }

  /** What was hidden lately (for "that was fine" corrections), newest first */
  recentSegments(lookbackS: number): GSFSegment[] {
    return this.index.recent(this.getCurrentTime(), lookbackS);
  }

  get segmentCount(): number {
    return this.index.size;
  }

  /** Start monitoring playback and applying filters */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.video.addEventListener('timeupdate', this.onTimeUpdate);
    this.video.addEventListener('seeked', this.onSeeked);
    this.video.addEventListener('play', this.onPlay);
    this.video.addEventListener('pause', this.onPause);
    // Initial check
    this.checkAndApply();
  }

  /** Stop monitoring and restore video to unfiltered state */
  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.video.removeEventListener('timeupdate', this.onTimeUpdate);
    this.video.removeEventListener('seeked', this.onSeeked);
    this.video.removeEventListener('play', this.onPlay);
    this.video.removeEventListener('pause', this.onPause);
    this.cancelRaf();
    this.cancelHiddenTimer();
    this.restoreAll();
    this.removeOverlays();
  }

  /** Update configuration without rebuilding (for live settings changes) */
  updateConfig(config: UserConfig): void {
    this.config = config;
    // Would need to re-filter segments -- for now, requires restart
  }

  // --- Event handlers ---

  private onTimeUpdate = (): void => {
    this.checkAndApply();
    this.scheduleRafIfNeeded();
    this.scheduleHiddenTimer();
  };

  /**
   * Re-evaluate after the time source shifted (e.g. the subtitle anchor
   * changed its offset). Lighter than a seek: audio state is left alone
   * unless a segment boundary was actually crossed.
   */
  resync(): void {
    this.recalcNextEvent();
    this.checkAndApply();
    this.scheduleRafIfNeeded();
    this.scheduleHiddenTimer();
  }

  private onSeeked = (): void => {
    this.restoreAll();
    this.recalcNextEvent();
    this.checkAndApply();
  };

  private onPlay = (): void => {
    this.scheduleRafIfNeeded();
    this.scheduleHiddenTimer();
  };

  private onPause = (): void => {
    this.cancelRaf();
    this.cancelHiddenTimer();
  };

  // --- Core filtering logic ---

  private checkAndApply(): void {
    const t = this.getCurrentTime();
    let active = this.index.findActive(t);
    if (typeof document !== 'undefined' && document.hidden) {
      // Segments about to begin count as active, so the next coarse tick
      // cannot land after the word has started. Ends are left alone.
      const ahead = this.index.findActive(t + FilterEngine.HIDDEN_LEAD_S);
      if (ahead.length) {
        const ids = new Set(active.map((s) => s.id));
        active = [...active, ...ahead.filter((s) => !ids.has(s.id))];
      }
    }

    if (active.length === 0) {
      this.restoreAll();
      return;
    }

    // The "altered from the original" notice is shown by the content script,
    // once per title and in every mode (content.ts, noticeOnFirstFilter)

    // Find highest-priority action among active segments
    let bestAction: FilterAction = 'mute';
    let bestPriority = 0;
    let bestSegment: GSFSegment = active[0];

    for (const seg of active) {
      const p = actionPriority(seg.action);
      if (p > bestPriority) {
        bestPriority = p;
        bestAction = seg.action;
        bestSegment = seg;
      }
    }

    this.applyAction(bestAction, bestSegment, active);
  }

  private applyAction(
    action: FilterAction,
    segment: GSFSegment,
    allActive: GSFSegment[],
  ): void {
    switch (action) {
      case 'skip': {
        // Skip to the latest end time among all active skip segments
        const skipEnd = Math.max(
          ...allActive
            .filter((s) => s.action === 'skip')
            .map((s) => s.end),
        );
        this.doSkip(skipEnd, segment);
        break;
      }
      case 'black':
        this.setBlack(true);
        this.setMute(true);
        break;
      case 'blur':
        this.setBlur(true, segment.region);
        break;
      case 'bleep':
        // Bleep = mute + overlay tone (tone TBD, mute for now)
        this.setMute(true);
        break;
      case 'mute':
        this.setMute(true);
        break;
    }
  }

  // --- rAF scheduling for precision near segment boundaries ---

  private scheduleRafIfNeeded(): void {
    if (this.rafId !== null || this.video.paused) return;
    const t = this.getCurrentTime();
    this.nextEvent = this.index.findNextEvent(t - 0.5);
    if (this.nextEvent !== undefined && this.nextEvent - t < 2.0) {
      this.rafId = requestAnimationFrame(this.rafLoop);
    }
  }

  private rafLoop = (): void => {
    if (this.video.paused || !this.running) {
      this.cancelRaf();
      return;
    }

    this.checkAndApply();

    // Advance to next event if we passed the current one
    const t = this.getCurrentTime();
    if (this.nextEvent !== undefined && t > this.nextEvent + 0.1) {
      this.nextEvent = this.index.findNextEvent(t - 0.5);
    }

    // Continue rAF if near an event
    if (this.nextEvent !== undefined && this.nextEvent - t < 2.0) {
      this.rafId = requestAnimationFrame(this.rafLoop);
    } else {
      this.rafId = null;
    }
  };

  /**
   * Hidden tabs get no animation frames. Wake at the next segment boundary
   * with an ordinary timer instead (exact while the tab is audible, at worst
   * about a second late when the browser throttles it, which the lookahead and
   * the segment padding absorb).
   */
  private scheduleHiddenTimer(): void {
    this.cancelHiddenTimer();
    if (!this.running || this.video.paused || typeof document === 'undefined' || !document.hidden) return;
    const t = this.getCurrentTime();
    const next = this.index.findNextEvent(t);
    if (next === undefined) return;
    const rate = this.video.playbackRate || 1;
    const waitMs = Math.min(2000, Math.max(50, ((next - t) / rate) * 1000 - 30));
    this.hiddenTimer = setTimeout(() => {
      this.hiddenTimer = null;
      this.checkAndApply();
      this.scheduleHiddenTimer();
    }, waitMs);
  }

  private cancelHiddenTimer(): void {
    if (this.hiddenTimer !== null) {
      clearTimeout(this.hiddenTimer);
      this.hiddenTimer = null;
    }
  }

  private cancelRaf(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private recalcNextEvent(): void {
    this.nextEvent = this.index.findNextEvent(this.getCurrentTime() - 0.5);
  }

  // --- Action implementations ---

  private doSkip(endTime: number, trigger: GSFSegment): void {
    const seekTo = this.options.seekTo;
    if (seekTo) {
      seekTo(endTime);
    } else {
      this.video.currentTime = endTime;
    }

    if (this.config.showNotices) {
      const label = trigger.category.split('.').pop()?.replace(/_/g, ' ') ?? trigger.category;
      this.showNotice(`Skipped: ${label}`);
    }
  }

  private setMute(on: boolean): void {
    if (on && !this.isMuted) {
      this.ducker.duck();
      this.isMuted = true;
    } else if (!on && this.isMuted) {
      this.ducker.restore();
      this.isMuted = false;
    }
  }

  private setBlur(on: boolean, region?: GSFSegment['region']): void {
    if (on) {
      const overlay = this.getOrCreateBlurOverlay();
      if (region) {
        overlay.style.left = `${region.x * 100}%`;
        overlay.style.top = `${region.y * 100}%`;
        overlay.style.width = `${region.width * 100}%`;
        overlay.style.height = `${region.height * 100}%`;
      } else {
        overlay.style.inset = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
      }
      overlay.style.display = 'block';
      this.isBlurred = true;
    } else if (this.isBlurred) {
      if (this.blurOverlay) this.blurOverlay.style.display = 'none';
      this.isBlurred = false;
    }
  }

  private setBlack(on: boolean): void {
    if (on) {
      const overlay = this.getOrCreateBlackOverlay();
      overlay.style.display = 'block';
      this.isBlacked = true;
    } else if (this.isBlacked) {
      if (this.blackOverlay) this.blackOverlay.style.display = 'none';
      this.isBlacked = false;
    }
  }

  private restoreAll(): void {
    this.setMute(false);
    this.setBlur(false);
    this.setBlack(false);
  }

  // --- Overlay management ---

  private getVideoContainer(): HTMLElement {
    return this.video.parentElement ?? document.body;
  }

  private getOrCreateBlurOverlay(): HTMLDivElement {
    if (!this.blurOverlay) {
      this.blurOverlay = document.createElement('div');
      this.blurOverlay.className = 'gs-blur-overlay';
      Object.assign(this.blurOverlay.style, {
        position: 'absolute',
        display: 'none',
        backdropFilter: 'blur(30px)',
        WebkitBackdropFilter: 'blur(30px)',
        zIndex: '2147483646',
        pointerEvents: 'none',
      });
      const container = this.getVideoContainer();
      container.style.position = container.style.position || 'relative';
      container.appendChild(this.blurOverlay);
    }
    return this.blurOverlay;
  }

  private getOrCreateBlackOverlay(): HTMLDivElement {
    if (!this.blackOverlay) {
      this.blackOverlay = document.createElement('div');
      this.blackOverlay.className = 'gs-black-overlay';
      Object.assign(this.blackOverlay.style, {
        position: 'absolute',
        inset: '0',
        width: '100%',
        height: '100%',
        display: 'none',
        background: '#000',
        zIndex: '2147483646',
        pointerEvents: 'none',
      });
      const container = this.getVideoContainer();
      container.style.position = container.style.position || 'relative';
      container.appendChild(this.blackOverlay);
    }
    return this.blackOverlay;
  }

  private showNotice(message: string, durationMs = 2000): void {
    if (!this.noticeEl) {
      this.noticeEl = document.createElement('div');
      this.noticeEl.className = 'gs-notice';
      const pos = this.config.noticePosition;
      Object.assign(this.noticeEl.style, {
        position: 'absolute',
        [pos.includes('top') ? 'top' : 'bottom']: '16px',
        [pos.includes('left') ? 'left' : 'right']: '16px',
        padding: '8px 16px',
        borderRadius: '6px',
        background: 'rgba(0,0,0,0.8)',
        color: '#fff',
        fontSize: '14px',
        fontFamily: 'system-ui, sans-serif',
        zIndex: '2147483647',
        pointerEvents: 'none',
        transition: 'opacity 200ms',
        opacity: '0',
      });
      const container = this.getVideoContainer();
      container.style.position = container.style.position || 'relative';
      container.appendChild(this.noticeEl);
    }

    this.noticeEl.textContent = message;
    this.noticeEl.style.opacity = '1';

    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => {
      if (this.noticeEl) this.noticeEl.style.opacity = '0';
    }, durationMs);
  }

  private removeOverlays(): void {
    this.blurOverlay?.remove();
    this.blurOverlay = null;
    this.blackOverlay?.remove();
    this.blackOverlay = null;
    this.noticeEl?.remove();
    this.noticeEl = null;
  }

  // --- Helpers ---

  private getCurrentTime(): number {
    if (this.options.getCurrentTime) {
      return this.options.getCurrentTime();
    }
    return this.video.currentTime;
  }
}
