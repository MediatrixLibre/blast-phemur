/**
 * Action priority resolution.
 *
 * When multiple filter segments overlap (e.g., profane word during violent scene),
 * the strongest action wins. Priority from movie-content-filter-extension:
 * skip > black > blur > bleep > mute
 */

import type { FilterAction } from '@guardianstream/types';

const ACTION_PRIORITY: Record<FilterAction, number> = {
  skip: 5,
  black: 4,
  blur: 3,
  bleep: 2,
  mute: 1,
};

/** Returns whichever action has higher priority */
export function resolveAction(a: FilterAction, b: FilterAction): FilterAction {
  return (ACTION_PRIORITY[a] ?? 0) >= (ACTION_PRIORITY[b] ?? 0) ? a : b;
}

/** Get numeric priority for an action */
export function actionPriority(action: FilterAction): number {
  return ACTION_PRIORITY[action] ?? 0;
}
