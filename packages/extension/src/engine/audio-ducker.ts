/**
 * Mutes a video element for a filtered word and puts the audio back exactly
 * as the viewer had it.
 *
 * Why this exists as its own class:
 *  - It remembers whether the viewer had ALREADY muted the video, and leaves
 *    it muted afterwards (a naive "unmute" would blast a muted TV back on).
 *  - Only one fade runs at a time. Overlapping fades fight each other and can
 *    strand the volume at the wrong level.
 *  - It captures the viewer's volume once, at the first duck, never mid-fade.
 */
const isHidden = (): boolean => typeof document !== 'undefined' && document.hidden === true;

/**
 * The level a video is being faded back UP to, while that fade runs. A restart
 * (the popup saving settings mid-mute) makes a new ducker while the old one is
 * mid fade-up with video.volume near 0; the new one must not mistake that for
 * the viewer's volume.
 */
const restoringTo = new WeakMap<HTMLVideoElement, number>();

export class AudioDucker {
  private ducked = false;
  private savedVolume = 1;
  private savedMuted = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private video: HTMLVideoElement,
    private fadeMs: () => number,
    /** Told about every duck/restore, with the video time (debug timeline) */
    private onChange?: (ducked: boolean, videoTime: number, alreadyMuted: boolean) => void,
  ) {}

  get isDucked(): boolean {
    return this.ducked;
  }

  duck(): void {
    if (this.ducked) return;
    this.ducked = true;
    // A fade still running here is a fade BACK UP from the previous duck.
    // video.volume is mid-ramp, so keep the volume we were ramping toward;
    // re-reading it would shave a little off the viewer's level every cycle.
    const midFadeUp = this.timer !== null;
    this.cancelFade();
    if (!midFadeUp) {
      this.savedMuted = this.video.muted;
      this.savedVolume = restoringTo.get(this.video) ?? this.video.volume;
    }
    this.onChange?.(true, this.video.currentTime, this.savedMuted);
    // Already silent: nothing to do, and restore() will leave it that way
    if (this.savedMuted) return;
    const ms = this.fadeMs();
    if (ms <= 0) {
      this.video.muted = true;
      return;
    }
    this.fade(0, ms, () => {
      this.video.muted = true;
    });
  }

  restore(): void {
    if (!this.ducked) return;
    this.ducked = false;
    this.cancelFade();
    this.onChange?.(false, this.video.currentTime, this.savedMuted);
    if (this.savedMuted) {
      // The viewer had it muted: put everything back exactly as it was
      this.video.volume = this.savedVolume;
      this.video.muted = true;
      return;
    }
    this.video.muted = false;
    const ms = this.fadeMs();
    if (ms <= 0) {
      this.video.volume = this.savedVolume;
      restoringTo.delete(this.video);
      return;
    }
    this.video.volume = 0;
    restoringTo.set(this.video, this.savedVolume);
    this.fade(this.savedVolume, ms, () => restoringTo.delete(this.video));
  }

  private cancelFade(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private fade(target: number, durationMs: number, onDone?: () => void): void {
    this.cancelFade();
    // A hidden tab gets its timers slowed to about one a second (far slower
    // after a few minutes), so a 50 ms fade would crawl for seconds: the word
    // would play out and the sound would stay down afterwards. Nobody can see
    // a fade in a hidden tab, so apply the level at once.
    if (isHidden()) {
      this.video.volume = target;
      onDone?.();
      return;
    }
    const start = this.video.volume;
    const t0 = performance.now();
    // Progress follows the clock, not the tick count, so a timer that gets
    // throttled mid-fade still lands on the target at its next tick.
    this.timer = setInterval(() => {
      const p = Math.min(1, (performance.now() - t0) / durationMs);
      this.video.volume = start + (target - start) * p;
      if (p >= 1) {
        this.cancelFade();
        this.video.volume = target;
        onDone?.();
      }
    }, 10);
  }
}
