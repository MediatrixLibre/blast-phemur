/**
 * Debug recorder: a small in-memory timeline of what the extension decided,
 * so a problem can be diagnosed from a pasted report instead of devtools.
 *
 * Memory only (never stored, never sent anywhere). Matched words are masked
 * before they get here; captions are truncated.
 */

export interface DebugEvent {
  /** Seconds since the content script started */
  at: number;
  kind: string;
  data?: Record<string, unknown>;
}

const MAX_EVENTS = 500;
const startedAt = performance.now();
const events: DebugEvent[] = [];

/** True between a mute and the next unmute (read by the toolbar icon) */
let muting = false;
export const isMuting = (): boolean => muting;

export function debugLog(kind: string, data?: Record<string, unknown>): void {
  if (kind === 'mute') muting = true;
  else if (kind === 'unmute') muting = false;
  events.push({ at: +((performance.now() - startedAt) / 1000).toFixed(2), kind, data });
  if (events.length > MAX_EVENTS) events.shift();
}

export function debugEvents(): DebugEvent[] {
  return events.slice();
}
