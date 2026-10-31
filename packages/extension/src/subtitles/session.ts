/**
 * Subtitle session: the "no pre-computed data" brain for one video.
 *
 * Starts in caption mode (react to words as they appear). As soon as the
 * anchor is sure which episode this is and where we are, it hands muting to
 * a FilterEngine running on the pre-downloaded subtitles, which acts BEFORE
 * the word is spoken. If the anchor loses its place (ad break, jump), it
 * falls back to caption mode until it finds it again.
 */

import type { GSFSegment, ProviderModule, UserConfig } from '@guardianstream/types';
import { FilterEngine } from '../engine/filter-engine.js';
import { CaptionMonitor, CAPTION_PASS_S } from '../caption/caption-monitor.js';
import { CaptionCensor } from '../caption/caption-censor.js';
import { Anchor, CueIndex, type Track } from './anchor.js';
import { buildFilterSet, withoutPasses } from './compile.js';
import { TextTrackFeed } from './text-track.js';
import { hasPlayerCaptions } from './player-captions.js';
import { debugLog } from '../debug/recorder.js';
import { maskText } from '../caption/caption-censor.js';
import { scanText } from '../lexicon/profanity.js';
import { wordCategories, type HitEvent } from '../corrections/corrections.js';

export type SessionMode = 'captions' | 'anchored';

/**
 * The title a live-captions pass belongs to: the page (Netflix and most
 * services give each episode its own address) plus the program name the
 * service shows, for services that keep one address per series.
 */
export function captionPassKey(provider: ProviderModule): string {
  const v = new URLSearchParams(location.search).get('v') ?? '';
  const program = provider.getTitle?.()?.trim().toLowerCase() ?? '';
  return `captions:${location.host}${location.pathname}${v ? `?v=${v}` : ''}|${program}`;
}

export interface SessionStatus {
  mode: SessionMode;
  episode: string | null;
  offset: number;
  segmentCount: number;
  captionHits: number;
  /** Caption lines read from the screen so far */
  captionLines: number;
  /** Subtitle files in the viewer's library */
  libraryCount: number;
  /** Where the locked timing comes from: an imported file or the player's own captions */
  source: 'library' | 'player' | null;
}

export class SubtitleSession {
  private anchor: Anchor;
  private monitor: CaptionMonitor;
  private censor: CaptionCensor;
  private engine: FilterEngine | null = null;
  private engineKey: string | null = null;
  private tracks: Track[];
  private libraryCount: number;
  private playerCues = 0;
  private config: UserConfig;

  constructor(
    private video: HTMLVideoElement,
    private provider: ProviderModule,
    config: UserConfig,
    tracks: Track[],
  ) {
    this.config = config;
    this.tracks = tracks;
    this.libraryCount = tracks.length;
    this.anchor = new Anchor(new CueIndex(tracks));

    const selector = provider.getSubtitleSelector?.() ?? null;
    this.censor = new CaptionCensor(selector ?? '', () => this.config);
    this.monitor = new CaptionMonitor({
      video,
      provider,
      config,
      onCaption: (text) => this.onCaption(text),
      passKey: () => captionPassKey(provider),
    });
    this.hasSelector = selector !== null;
  }

  private hasSelector: boolean;

  start(): void {
    if (this.hasSelector) this.censor.start();
    this.monitor.start();
    // Captions the browser draws (DirecTV Stream). YouTube has its own bridge.
    if (!hasPlayerCaptions()) {
      const title = (): string => this.provider.getTitle?.() || 'this program';
      // A pass belongs to one moment of one title, so the key names the
      // program. With no program name on the page, the key lasts this viewing
      // only: a pass then never carries over to another program.
      const viewing = Math.random().toString(36).slice(2, 8);
      const key = (): string => {
        const program = this.provider.getTitle?.();
        return `texttrack:${location.host}:${program ? program.toLowerCase() : `untitled-${viewing}`}`;
      };
      this.feed = new TextTrackFeed(
        this.video,
        key,
        title,
        () => this.config,
        (track, segments) => this.updateLiveTrack(track, segments),
      );
      this.feed.start();
    }
  }

  private feed: TextTrackFeed | null = null;

  stop(): void {
    this.feed?.stop();
    this.feed = null;
    this.engine?.stop();
    this.engine = null;
    this.monitor.stop();
    if (this.hasSelector) this.censor.stop();
  }

  /**
   * The viewer's word lists changed (a correction, or an edit in the popup),
   * and nothing else did: swap the mute windows in place. A full restart
   * would clear Just muted and drop back to live captions until the player
   * track arrived again.
   */
  updateWords(config: UserConfig): void {
    this.config = config;
    this.monitor.updateConfig(config);
    const track = this.engineKey ? this.tracks.find((t) => t.key === this.engineKey) : undefined;
    if (!this.engine || !track) return;
    const passes = config.customWords?.passes;
    this.engine.replaceSegments(
      this.liveSegments
        ? withoutPasses(this.liveSegments, track.key, passes)
        : buildFilterSet(track.key, track.title, track.cues, { custom: config.customWords }).segments,
    );
  }

  /** Subtitle files the viewer imported (not counting the player's own captions) */
  get trackCount(): number {
    return this.libraryCount;
  }

  /** Cues taken from the player's own caption track, 0 if there is none */
  get playerCueCount(): number {
    return this.playerCues;
  }

  /**
   * The player's own caption track arrived: its times are the video's times,
   * so pin to it at once. From here muting needs no caption on screen, which
   * is what keeps it working in a background tab.
   */
  attachPlayerTrack(track: Track): void {
    this.tracks = [track];
    this.playerCues = track.cues.length;
    this.anchor = new Anchor(new CueIndex(this.tracks));
    this.anchor.pin(track.key, 0);
    this.reconcile();
  }

  /**
   * A caption track the browser draws (DirecTV Stream), which keeps growing
   * as it plays. The feed has already worked out the mute windows; each
   * update swaps them in without restarting the engine.
   */
  updateLiveTrack(track: Track, segments: GSFSegment[]): void {
    this.liveSegments = segments;
    this.playerCues = track.cues.length;
    if (this.engine && this.engineKey === track.key) {
      this.tracks = [track];
      this.engine.replaceSegments(withoutPasses(segments, track.key, this.config.customWords?.passes));
      return;
    }
    if (segments.length === 0 && track.cues.length === 0) return;
    this.attachPlayerTrack(track);
    if (this.engine) debugLog('live-captions', { cues: track.cues.length, filters: this.engine.segmentCount });
  }

  private liveSegments: GSFSegment[] | null = null;

  /** What was hidden lately, one entry per muted event, newest first */
  recentHits(lookbackS: number): HitEvent[] {
    const track = this.anchor.locked ? this.tracks.find((t) => t.key === this.anchor.trackKey) : undefined;
    const fromEngine = (this.engine?.recentSegments(lookbackS) ?? [])
      .filter((s) => (s.words ?? []).length > 0)
      .map((s): HitEvent => {
        const cats = track ? wordCategories(track.cues, s.start, s.end, this.config.customWords) : new Map<string, string>();
        return {
          words: (s.words ?? []).map((text) => ({ text, category: cats.get(text) ?? s.category })),
          track: track?.key,
          start: s.start,
          end: s.end,
          also: this.captionWindow(track, s),
        };
      });
    // Before the episode was matched, live captions caught some of the same
    // moments. Those are timed in video seconds and the track's in its own,
    // so compare through the anchor offset, and keep the track's (a pass on
    // it is exact).
    const words = (h: HitEvent): string => h.words.map((w) => w.text.toLowerCase()).join(' ');
    const fromCaptions = this.monitor.recentHits(lookbackS).filter(
      (c) =>
        !fromEngine.some(
          (e) => words(e) === words(c) && c.start != null && e.start != null && Math.abs(e.start + this.anchor.offset - (c.start + CAPTION_PASS_S)) < 5,
        ),
    );
    return [...fromEngine, ...fromCaptions];
  }

  /**
   * Where live captions would catch this muted word: the moment its line
   * showed on screen, in video seconds. Read from what the monitor actually
   * saw when it can (exact); otherwise from the cue and the anchor offset,
   * with a wider margin for the offset's own error.
   */
  private captionWindow(track: Track | undefined, s: GSFSegment): HitEvent['also'] {
    const key = this.monitor.passTrack;
    if (!key || !track) return undefined;
    // By the middle of the mute: a sacred name's whole-line mute starts a little before its cue
    const mid = (s.start + s.end) / 2;
    const cue = track.cues.find((c) => c.start <= mid && c.end >= mid);
    if (!cue) return undefined;
    const seen = this.monitor.lineSeenAt(cue.text);
    const at = seen ?? cue.start + this.anchor.offset;
    const margin = seen != null ? CAPTION_PASS_S : 1.5;
    return [{ track: key, start: at - margin, end: at + margin }];
  }

  /**
   * What was just said, newest first. Locked to a track this is the track's
   * own lines (exact, whatever is drawn on screen); otherwise the captions seen.
   */
  recentLines(lookbackS: number): string[] {
    const track = this.anchor.locked ? this.tracks.find((t) => t.key === this.anchor.trackKey) : undefined;
    if (track) {
      const t = this.provider.getCurrentTime() - this.anchor.offset;
      return track.cues
        .filter((c) => c.end >= t - lookbackS && c.start <= t + 0.3)
        .map((c) => c.text)
        .reverse();
    }
    return this.monitor.recentLines(lookbackS);
  }

  status(): SessionStatus {
    const track = this.tracks.find((t) => t.key === this.anchor.trackKey);
    return {
      mode: this.engine ? 'anchored' : 'captions',
      episode: track?.title ?? null,
      offset: this.anchor.offset,
      segmentCount: this.engine?.segmentCount ?? 0,
      captionHits: this.monitor.totalMatches,
      captionLines: this.monitor.linesSeen,
      libraryCount: this.libraryCount,
      source: !this.engine ? null : this.playerCues > 0 ? 'player' : 'library',
    };
  }

  private onCaption(text: string): void {
    const t = this.provider.getCurrentTime();
    const changed = this.tracks.length > 0 && this.anchor.observe(text, t);
    debugLog('caption', {
      videoTime: +t.toFixed(2),
      text: maskText(text, scanText(text, true, this.config.customWords)).slice(0, 60),
      track: this.anchor.trackKey,
      locked: this.anchor.locked,
      offset: +this.anchor.offset.toFixed(2),
    });
    if (changed) this.reconcile();
  }

  private reconcile(): void {
    const key = this.anchor.trackKey;
    if (this.anchor.locked && key) {
      if (!this.engine || this.engineKey !== key) {
        this.engine?.stop();
        const track = this.tracks.find((t) => t.key === key);
        if (!track) return;
        const set = this.liveSegments
          ? { ...buildFilterSet(track.key, track.title, [], {}), segments: withoutPasses(this.liveSegments, track.key, this.config.customWords?.passes) }
          : buildFilterSet(track.key, track.title, track.cues, { custom: this.config.customWords });
        this.engine = new FilterEngine(this.video, set, this.config, {
          // Subtitle timeline -> video timeline is a shift by the anchor offset
          getCurrentTime: () => this.provider.getCurrentTime() - this.anchor.offset,
          seekTo: (s) => this.provider.seekTo(s + this.anchor.offset),
        });
        this.engineKey = key;
        this.engine.start();
        debugLog('anchored', { episode: track.title, offset: +this.anchor.offset.toFixed(2), filters: this.engine.segmentCount });
        console.log(
          `[Blast Phemur] Anchored to ${track.title}: ${this.engine.segmentCount} filters, offset ${this.anchor.offset.toFixed(1)}s`,
        );
      } else {
        this.engine.resync();
      }
      this.monitor.setActive(false);
    } else if (this.engine) {
      debugLog('lost-sync');
      console.log('[Blast Phemur] Lost sync, back to caption mode');
      this.engine.stop();
      this.engine = null;
      this.engineKey = null;
      this.monitor.setActive(true);
    }
  }
}
