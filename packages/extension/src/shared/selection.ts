/**
 * Whether the viewer's settings mute anything at all. With both word groups
 * Off and an empty Always mute list, a running filter protects from nothing,
 * so neither the popup nor the toolbar may say "Protected".
 */
import type { UserConfig } from '@guardianstream/types';
import { CATALOG } from '@guardianstream/types';
import { resolveCategorySetting } from '../engine/category-resolver.js';

const WORD_GROUPS = CATALOG.filter((c) => c.media === 'speech');

export function mutesAnything(config: UserConfig): boolean {
  if ((config.customWords?.block ?? []).some((w) => w.trim().length > 1)) return true;
  return WORD_GROUPS.some((g) =>
    (g.children?.length ? g.children : [g]).some((k) => (resolveCategorySetting(k.id, config)?.threshold ?? 0) > 0),
  );
}
