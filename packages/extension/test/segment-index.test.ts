import { describe, it, expect } from 'vitest';
import { SegmentIndex } from '../src/engine/segment-index.js';
import type { GSFSegment } from '@guardianstream/types';

function seg(id: string, start: number, end: number): GSFSegment {
  return {
    id,
    start,
    end,
    category: 'test',
    severity: 2,
    action: 'mute',
    confidence: 0.9,
    source: 'official',
    votes: 0,
  };
}

describe('SegmentIndex', () => {
  it('returns empty for no segments', () => {
    const idx = new SegmentIndex([]);
    expect(idx.findActive(5)).toEqual([]);
    expect(idx.size).toBe(0);
  });

  it('finds a single active segment', () => {
    const idx = new SegmentIndex([seg('a', 10, 20)]);
    expect(idx.findActive(15).map((s) => s.id)).toEqual(['a']);
  });

  it('returns empty before segment starts', () => {
    const idx = new SegmentIndex([seg('a', 10, 20)]);
    expect(idx.findActive(5)).toEqual([]);
  });

  it('returns empty after segment ends', () => {
    const idx = new SegmentIndex([seg('a', 10, 20)]);
    expect(idx.findActive(20)).toEqual([]);
    expect(idx.findActive(25)).toEqual([]);
  });

  it('finds at exact start time', () => {
    const idx = new SegmentIndex([seg('a', 10, 20)]);
    expect(idx.findActive(10).map((s) => s.id)).toEqual(['a']);
  });

  it('finds overlapping segments', () => {
    const idx = new SegmentIndex([
      seg('a', 5, 15),
      seg('b', 10, 20),
    ]);
    const active = idx.findActive(12).map((s) => s.id);
    expect(active).toContain('a');
    expect(active).toContain('b');
    expect(active).toHaveLength(2);
  });

  it('handles many segments efficiently', () => {
    const segments = Array.from({ length: 1000 }, (_, i) =>
      seg(`s${i}`, i * 10, i * 10 + 5),
    );
    const idx = new SegmentIndex(segments);
    expect(idx.size).toBe(1000);

    // Should find segment at position 500 (5000-5005)
    const active = idx.findActive(5002);
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe('s500');

    // Between segments -- should find nothing
    expect(idx.findActive(5007)).toEqual([]);
  });

  it('findNextEvent returns correct boundary', () => {
    const idx = new SegmentIndex([
      seg('a', 5, 10),
      seg('b', 20, 25),
    ]);
    expect(idx.findNextEvent(0)).toBe(5);
    expect(idx.findNextEvent(5)).toBe(10);
    expect(idx.findNextEvent(10)).toBe(20);
    expect(idx.findNextEvent(25)).toBeUndefined();
  });

  it('sorts segments by start time regardless of input order', () => {
    const idx = new SegmentIndex([
      seg('c', 30, 40),
      seg('a', 5, 10),
      seg('b', 15, 25),
    ]);
    expect(idx.findActive(7).map((s) => s.id)).toEqual(['a']);
    expect(idx.findActive(35).map((s) => s.id)).toEqual(['c']);
  });
});
