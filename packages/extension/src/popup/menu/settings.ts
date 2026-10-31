/**
 * Pure helpers behind the filter menu (no React), so they can be tested.
 */

import type { UserConfig, Threshold, FilterAction, Preset, CatalogCategory } from '@guardianstream/types';
import { CATALOG, PRESETS, presetToCategories, STRICTNESS } from '@guardianstream/types';
import { blasphemySeverityRange } from '../../caption/blasphemy-patterns.js';
import { isMatchActive, scanText } from '../../lexicon/profanity.js';

export function flatCatalog(): CatalogCategory[] {
  return CATALOG.flatMap((c) => [c, ...(c.children ?? [])]);
}

export function labelFor(categoryId: string): string {
  if (categoryId === 'custom.word') return 'Your word list';
  const hit = flatCatalog().find((c) => c.id === categoryId);
  if (hit) return hit.label;
  return categoryId;
}

export function strictnessLabel(t: Threshold): string {
  return STRICTNESS.find((s) => s.value === t)?.label ?? 'Off';
}

export function actionLabel(a: FilterAction): string {
  const names: Record<FilterAction, string> = {
    mute: 'Mute',
    skip: 'Skip',
    blur: 'Blur',
    bleep: 'Bleep',
    black: 'Black out',
  };
  return names[a];
}

/** "Moderate+ · Mute" or "Off" */
export function summaryFor(config: UserConfig, cat: CatalogCategory): string {
  const s = config.categories[cat.id];
  if (!s || s.threshold === 0) return 'Off';
  return `${strictnessLabel(s.threshold)} · ${actionLabel(s.action)}`;
}

/** Copy a config with one category's setting changed; changing the action keeps the strictness */
export function withSetting(
  config: UserConfig,
  id: string,
  change: { threshold?: Threshold; action?: FilterAction },
  fallbackAction: FilterAction,
): UserConfig {
  const existing = config.categories[id];
  return {
    ...config,
    activePack: null, // hand-edited: no longer exactly a preset
    categories: {
      ...config.categories,
      [id]: {
        threshold: change.threshold ?? existing?.threshold ?? 0,
        action: change.action ?? existing?.action ?? fallbackAction,
      },
    },
  };
}

/** Remove a child's own setting so it follows its parent again */
export function withoutOverride(config: UserConfig, id: string): UserConfig {
  const categories = { ...config.categories };
  delete categories[id];
  return { ...config, activePack: null, categories };
}

export function applyPreset(config: UserConfig, preset: Preset): UserConfig {
  return {
    ...config,
    activePack: preset.id,
    categories: { ...presetToCategories(preset), custom: config.categories.custom },
  };
}

/** Which preset (if any) the current settings exactly match */
export function matchingPreset(config: UserConfig): Preset | null {
  for (const preset of PRESETS) {
    const want = presetToCategories(preset);
    const keys = new Set([
      ...Object.keys(want),
      ...Object.keys(config.categories).filter((k) => k !== 'custom'),
    ]);
    let same = true;
    for (const k of keys) {
      const a = want[k];
      const b = config.categories[k];
      // Missing and Off are the same thing; Off ignores action
      const aOff = !a || a.threshold === 0;
      const bOff = !b || b.threshold === 0;
      if (aOff && bOff) continue;
      if (aOff !== bOff || a.threshold !== b.threshold || a.action !== b.action) {
        same = false;
        break;
      }
    }
    if (same) return preset;
  }
  return null;
}

export function matchesSearch(cat: CatalogCategory, q: string): boolean {
  if (!q) return true;
  const hay = [cat.label, cat.blurb, ...(cat.keywords ?? [])].join(' ').toLowerCase();
  return hay.includes(q.toLowerCase());
}

export function parseWordList(text: string): string[] {
  return [...new Set(text.split(/[,\n]/).map((w) => w.trim().toLowerCase()).filter((w) => w.length > 1))];
}

// ---- Accordion switches (one switch per sub-category, one "All" per group) ----

function resolved(config: UserConfig, id: string): { threshold: Threshold; action: FilterAction } | null {
  const parts = id.split('.');
  while (parts.length) {
    const s = config.categories[parts.join('.')];
    if (s) return s;
    parts.pop();
  }
  return null;
}

/** Whether this category is hidden under the current settings (own setting, else its group's) */
export function isHidden(config: UserConfig, id: string): boolean {
  return (resolved(config, id)?.threshold ?? 0) > 0;
}

/** Hidden flag per sub-category, or a single flag for a group with none */
export function hiddenFlags(config: UserConfig, cat: CatalogCategory): Record<string, boolean> {
  const kids = cat.children ?? [];
  if (kids.length === 0) return { [cat.id]: isHidden(config, cat.id) };
  return Object.fromEntries(kids.map((k) => [k.id, isHidden(config, k.id)]));
}

/**
 * Write a set of hidden flags back as settings. The group carries the strictness
 * and action; a sub-category only gets its own entry (threshold 0) to switch it
 * off while the group is on. None hidden -> group off; all hidden -> no overrides.
 */
export function applyFlags(config: UserConfig, cat: CatalogCategory, flags: Record<string, boolean>): UserConfig {
  const kids = cat.children ?? [];
  const categories = { ...config.categories };
  for (const k of kids) delete categories[k.id];
  const keys = kids.length ? kids.map((k) => k.id) : [cat.id];
  const onCount = keys.filter((k) => flags[k]).length;
  const before = categories[cat.id] ?? resolved(config, cat.id) ?? config.categories[kids[0]?.id ?? cat.id];
  const kept = before && before.threshold > 0 ? before : { threshold: 3 as Threshold, action: cat.actions[0] };
  const action = before?.action ?? cat.actions[0];
  if (onCount === 0) {
    categories[cat.id] = { threshold: 0, action };
  } else {
    categories[cat.id] = { threshold: kept.threshold, action: kept.action ?? action };
    if (kids.length && onCount < keys.length) {
      for (const k of kids) if (!flags[k.id]) categories[k.id] = { threshold: 0, action: categories[cat.id].action };
    }
  }
  return { ...config, activePack: null, categories };
}

export function setAll(config: UserConfig, cat: CatalogCategory, on: boolean): UserConfig {
  const flags = Object.fromEntries(Object.keys(hiddenFlags(config, cat)).map((k) => [k, on]));
  return applyFlags(config, cat, flags);
}

export function setOne(config: UserConfig, cat: CatalogCategory, id: string, on: boolean): UserConfig {
  return applyFlags(config, cat, { ...hiddenFlags(config, cat), [id]: on });
}

// ---- Word-group levels (Off / Worst / Most / All) ----

/** The level a word group is at; 0 when it is off */
export function groupLevel(config: UserConfig, cat: CatalogCategory): Threshold {
  return (config.categories[cat.id]?.threshold ?? 0) as Threshold;
}

/**
 * Set a word group's level. Sub-categories the viewer switched off stay off,
 * unless every one of them is off, in which case turning the group on starts
 * them all again (otherwise "All" would mute nothing).
 */
export function setGroupLevel(config: UserConfig, cat: CatalogCategory, level: Threshold): UserConfig {
  const categories = { ...config.categories };
  const action = categories[cat.id]?.action ?? cat.actions[0];
  categories[cat.id] = { threshold: level, action };
  const kids = cat.children ?? [];
  if (level > 0 && kids.length && kids.every((k) => categories[k.id]?.threshold === 0)) {
    for (const k of kids) delete categories[k.id];
  }
  return { ...config, activePack: null, categories };
}

/** Lowest severity a level mutes: All 1, Most 2, Worst 3 */
export const floorOf = (level: Threshold): number => 4 - level;

export type Coverage = 'all' | 'some' | 'none';

/**
 * The severities a sub-category spans: declared in the catalog for the word
 * lists, read from the pattern tables for blasphemy.
 */
export function severityRange(child: CatalogCategory): { min: number; max: number } | undefined {
  return child.severity ?? blasphemySeverityRange(child.id);
}

/**
 * How much of a sub-category the current setting mutes. A switch must never
 * say "hidden" for words the level lets through.
 */
export function coverage(config: UserConfig, child: CatalogCategory): Coverage {
  const s = resolved(config, child.id);
  if (!s || s.threshold === 0) return 'none';
  const sev = severityRange(child);
  if (!sev) return 'all';
  const floor = floorOf(s.threshold);
  if (sev.min >= floor) return 'all';
  if (sev.max >= floor) return 'some';
  return 'none';
}

/** Whether the level alone (ignoring the viewer's switches) reaches this sub-category */
export function levelReaches(config: UserConfig, group: CatalogCategory, child: CatalogCategory): boolean {
  const level = groupLevel(config, group);
  if (level === 0) return false;
  const sev = severityRange(child);
  return !sev || sev.max >= floorOf(level);
}

/** The first level that mutes any of this sub-category ("Choose Most to mute them") */
export function firstReachingLevel(child: CatalogCategory): Threshold {
  const max = severityRange(child)?.max ?? 3;
  return Math.min(3, Math.max(1, 4 - max)) as Threshold;
}

/**
 * The sub-category's example words, split by what the engine does with them
 * at the group's level. The sub-category is taken as switched on (its switch
 * says that part); the viewer's own word lists are kept, so a word they
 * allowed shows as playing.
 */
export function exampleSplit(
  config: UserConfig,
  group: CatalogCategory,
  child: CatalogCategory,
): { muted: string[]; plays: string[] } {
  const categories = { ...config.categories };
  delete categories[child.id];
  const probe: UserConfig = { ...config, categories };
  const muted: string[] = [];
  const plays: string[] = [];
  for (const ex of child.examples ?? []) {
    const hit = groupLevel(config, group) > 0 &&
      scanText(ex, true, config.customWords).some((h) => h.category === child.id && isMatchActive(h, probe));
    (hit ? muted : plays).push(ex);
  }
  return { muted, plays };
}
