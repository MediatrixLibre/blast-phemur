import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AudioDucker } from '../src/engine/audio-ducker.js';
import { FilterEngine } from '../src/engine/filter-engine.js';
import { DEFAULT_CONFIG } from '@guardianstream/types';
import type { GSFFilterSet } from '@guardianstream/types';

/**
 * A hidden tab slows timers to about one a second and stops animation frames.
 * None of the muting may depend on either.
 */
let hidden = false;
beforeEach(() => {
  hidden = false;
  vi.useFakeTimers();
  vi.stubGlobal('document', {
    get hidden() { return hidden; },
    createElement: () => ({ style: {}, remove() {}, appendChild() {} }),
  });
  // No animation frames at all: if the engine needed one, nothing would ever fire
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const fakeVideo = () =>
  Object.assign(new EventTarget(), {
    volume: 0.8, muted: false, paused: false, playbackRate: 1, currentTime: 0,
    parentElement: { style: {}, appendChild() {} },
  });

describe('audio ducker in a hidden tab', () => {
  it('ducks and restores at once, with no timer needed', () => {
    hidden = true;
    const v = fakeVideo();
    const d = new AudioDucker(v as unknown as HTMLVideoElement, () => 50);
    d.duck();
    expect(v.muted).toBe(true);          // no timers advanced yet
    d.restore();
    expect(v.muted).toBe(false);
    expect(v.volume).toBeCloseTo(0.8, 5);
  });

  it('still fades normally in a visible tab', () => {
    const v = fakeVideo();
    const d = new AudioDucker(v as unknown as HTMLVideoElement, () => 50);
    d.duck();
    expect(v.muted).toBe(false);         // mid-fade
    vi.advanceTimersByTime(100);
    expect(v.muted).toBe(true);
  });

  it('a new ducker made mid fade-up still restores the viewer\'s volume (popup saves settings mid-mute)', () => {
    const v = fakeVideo();
    const a = new AudioDucker(v as unknown as HTMLVideoElement, () => 50);
    a.duck();
    vi.advanceTimersByTime(100);
    a.restore();                              // volume set to 0 and ramping back up to 0.8
    const b = new AudioDucker(v as unknown as HTMLVideoElement, () => 50);
    b.duck();                                 // the restart's fresh engine ducks at once
    vi.advanceTimersByTime(100);
    b.restore();
    vi.advanceTimersByTime(200);
    expect(v.muted).toBe(false);
    expect(v.volume).toBeCloseTo(0.8, 5);
  });

  it('a fade whose timer got throttled mid-way still lands on its target', () => {
    const v = fakeVideo();
    const d = new AudioDucker(v as unknown as HTMLVideoElement, () => 50);
    d.duck();
    vi.advanceTimersByTime(10);          // one normal tick...
    hidden = true;
    vi.advanceTimersByTime(1000);        // ...then the browser throttles to one a second
    expect(v.muted).toBe(true);
    expect(v.volume).toBe(0);
  });
});

describe('filter engine in a hidden tab', () => {
  const filters = {
    segments: [{
      id: 'w1', start: 10, end: 10.8, category: 'language.profanity', severity: 3,
      action: 'mute', confidence: 0.9, source: 'ai', votes: 0,
    }],
  } as unknown as GSFFilterSet;

  const make = (clock: { t: number }) => {
    const v = fakeVideo();
    const e = new FilterEngine(v as unknown as HTMLVideoElement, filters, DEFAULT_CONFIG, { getCurrentTime: () => clock.t });
    e.start();
    return { v, e };
  };

  it('starts the mute early enough for a coarse time update', () => {
    hidden = true;
    const clock = { t: 9.0 };
    const { v } = make(clock);
    clock.t = 9.8;                       // 0.2 s before the word; the next tick would be 0.25 s away
    v.dispatchEvent(new Event('timeupdate'));
    expect(v.muted).toBe(true);
  });

  it('does not start early in a visible tab', () => {
    const clock = { t: 9.0 };
    const { v } = make(clock);
    clock.t = 9.8;
    v.dispatchEvent(new Event('timeupdate'));
    vi.advanceTimersByTime(200);
    expect(v.muted).toBe(false);
  });

  it('wakes itself at the next boundary when there are no animation frames', () => {
    hidden = true;
    const clock = { t: 9.0 };
    const { v } = make(clock);
    v.dispatchEvent(new Event('timeupdate'));      // arms the timer; nothing to mute yet
    expect(v.muted).toBe(false);
    clock.t = 9.75;                                 // the clock moves on with no timeupdate event
    vi.advanceTimersByTime(1000);
    expect(v.muted).toBe(true);
  });

  it('lets go again once the word has passed', () => {
    hidden = true;
    const clock = { t: 9.8 };
    const { v } = make(clock);
    v.dispatchEvent(new Event('timeupdate'));
    expect(v.muted).toBe(true);
    clock.t = 10.9;
    v.dispatchEvent(new Event('timeupdate'));
    expect(v.muted).toBe(false);
    expect(v.volume).toBeCloseTo(0.8, 5);
  });
});
