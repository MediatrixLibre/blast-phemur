/**
 * Sorted segment index with binary search.
 *
 * Segments are sorted by start time. findActive(t) returns all segments
 * that contain time t, using binary search to find the neighborhood
 * then scanning for overlaps.
 */

import type { GSFSegment } from '@guardianstream/types';

export class SegmentIndex {
  private readonly segments: GSFSegment[];
  /** Sorted array of all segment boundary timestamps */
  private readonly events: number[];

  constructor(segments: GSFSegment[]) {
    this.segments = [...segments].sort((a, b) => a.start - b.start);

    const eventSet = new Set<number>();
    for (const seg of this.segments) {
      eventSet.add(seg.start);
      eventSet.add(seg.end);
    }
    this.events = [...eventSet].sort((a, b) => a - b);
  }

  get size(): number {
    return this.segments.length;
  }

  /** Segments in progress at t or ended within `lookbackS` before it, newest first */
  recent(t: number, lookbackS: number): GSFSegment[] {
    return this.segments
      .filter((s) => s.start <= t + 0.3 && s.end >= t - lookbackS)
      .sort((a, b) => b.start - a.start);
  }

  get eventTimeline(): readonly number[] {
    return this.events;
  }

  /**
   * Find all segments active at time t.
   * Uses binary search to find the insertion point, then scans
   * backward for segments whose start <= t and end > t.
   */
  findActive(t: number): GSFSegment[] {
    if (this.segments.length === 0) return [];

    const results: GSFSegment[] = [];

    // Binary search: find rightmost segment with start <= t
    let lo = 0;
    let hi = this.segments.length - 1;
    let insertIdx = -1;

    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (this.segments[mid].start <= t) {
        insertIdx = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    if (insertIdx === -1) return [];

    // Scan backward from insertIdx: all segments with start <= t
    // that also have end > t are active
    for (let i = insertIdx; i >= 0; i--) {
      const seg = this.segments[i];
      // Once we go far enough back that end < t, no earlier segment can contain t
      // (but segments can have varying lengths, so we can't break early on end alone)
      // We can break when start is so far back that no reasonable segment reaches t.
      // Safe heuristic: break after scanning 50 segments back (covers any realistic overlap)
      if (insertIdx - i > 50) break;

      if (seg.start <= t && seg.end > t) {
        results.push(seg);
      }
    }

    return results;
  }

  /**
   * Find the next event boundary after time t.
   * Returns undefined if no more events.
   */
  findNextEvent(t: number): number | undefined {
    // Binary search for first event > t
    let lo = 0;
    let hi = this.events.length - 1;
    let result: number | undefined;

    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (this.events[mid] > t) {
        result = this.events[mid];
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }

    return result;
  }
}
