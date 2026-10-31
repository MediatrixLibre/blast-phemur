/**
 * Filter catalog: the single description of everything a user can choose to
 * filter. The popup menu renders FROM this data and the engines read the same
 * category ids, so adding a content type or a whole new media kind means
 * adding entries here (plus a detector/handler for it), not new UI code.
 *
 * Category ids are dot paths ("language.profanity"). A setting on a parent
 * applies to every child unless the child has its own (most specific wins,
 * see resolveCategorySetting).
 */

import type { CategorySetting, FilterAction, Threshold } from './taxonomy.js';

/**
 * What kind of media a category is detected in. New kinds slot in here.
 *  - speech: words in captions and dialogue (live today)
 *  - scene:  video moments from analysed titles (needs filter data)
 *  - image:  planned (thumbnails, posters)
 *  - music:  planned (lyrics, song-level)
 */
export type MediaKind = 'speech' | 'scene' | 'image' | 'music';

export interface MediaKindInfo {
  id: MediaKind;
  label: string;
  status: 'live' | 'needs-data' | 'planned';
  /** Shown under the chip so the limit is on the label */
  note: string;
}

export const MEDIA_KINDS: MediaKindInfo[] = [
  { id: 'speech', label: 'Words', status: 'live', note: 'Works on any show with captions' },
  { id: 'scene', label: 'Scenes', status: 'needs-data', note: 'Only on titles that have been analysed' },
  { id: 'image', label: 'Images', status: 'planned', note: 'Coming later' },
  { id: 'music', label: 'Music', status: 'planned', note: 'Coming later' },
];

export interface CatalogCategory {
  id: string;
  label: string;
  /** One plain sentence on what this filters */
  blurb: string;
  icon: string;
  media: MediaKind;
  /** Actions that make sense here; the first is the default */
  actions: FilterAction[];
  /** Example words, shown masked in the menu (data: real spellings are fine, display goes through maskForDisplay) */
  examples?: string[];
  /** Extra words the search box should match */
  keywords?: string[];
  /**
   * Severity range of this sub-category's words (1 mild .. 3 strongest), when
   * it is fixed by the word list. Lets the menu say honestly whether a level
   * mutes these words, all of them, or only the strongest. Blasphemy leaves
   * it unset: the extension reads each range from its pattern tables.
   * Examples should span the range, so every level that reaches a
   * sub-category can name one example it mutes (a test holds this).
   */
  severity?: { min: number; max: number };
  children?: CatalogCategory[];
}

export const CATALOG: CatalogCategory[] = [
  {
    id: 'blasphemy',
    label: 'Blasphemy',
    blurb: "Misuse of G*d's name, J*sus' name, Our Lady, the saints, and sacred things. Prayer and reverent use are told apart from misuse.",
    icon: '',
    media: 'speech',
    actions: ['mute', 'skip'],
    // Search terms only: never displayed, so they keep the real spellings
    keywords: ['god', 'jesus', 'christ', 'mary', 'joseph', 'our lady', 'saints', 'mother of god', 'oh my god', 'omg', 'taking the lord\'s name'],
    children: [
      { id: 'blasphemy.gods_name', label: "G*d's name", blurb: "Misusing G*d's name", icon: '', media: 'speech', actions: ['mute', 'skip'], examples: ['goddamn', 'oh my God', 'oh God'] },
      { id: 'blasphemy.jesus_name', label: "J*sus' name", blurb: "Misusing J*sus' name", icon: '', media: 'speech', actions: ['mute', 'skip'], examples: ['Jesus H. Christ', 'Jesus Christ', 'jeez'], keywords: ['jesus', 'christ', 'jeez', 'jaysus'] },
      { id: 'blasphemy.holy_family', label: 'M*ry and J*seph', blurb: 'Misusing Our Lady or St. J*seph', icon: '', media: 'speech', actions: ['mute', 'skip'], examples: ['holy Mary', 'mother of God', 'Mary and Joseph'], keywords: ['mary', 'joseph', 'our lady', 'mother of god', 'virgin mary', 'blessed mother'] },
      { id: 'blasphemy.saints', label: 'The saints', blurb: 'Misusing the saints', icon: '', media: 'speech', actions: ['mute', 'skip'], examples: ['holy saints', 'saints alive'], keywords: ['saint', 'saints', 'st'] },
      { id: 'blasphemy.sacred_mockery', label: 'Sacred mockery', blurb: 'Mocking sacred things', icon: '', media: 'speech', actions: ['mute', 'skip'], examples: ['holy fuck', 'holy shit', 'holy hell'] },
      { id: 'blasphemy.demonic', label: 'Demonic', blurb: 'Praising Satan and similar', icon: '', media: 'speech', actions: ['mute', 'skip'], examples: ['hail satan'] },
    ],
  },
  {
    id: 'language',
    label: 'Language',
    blurb: 'Swearing, slurs, and crude words',
    icon: '',
    media: 'speech',
    actions: ['mute', 'skip'],
    keywords: ['swear', 'cuss', 'profanity', 'curse', 'f-word'],
    children: [
      { id: 'language.profanity', label: 'Strong swear words', blurb: 'The F-word, the S-word, and the like', icon: '', media: 'speech', actions: ['mute', 'skip'], examples: ['fuck', 'shit', 'bitch', 'bastard', 'asshole'], severity: { min: 2, max: 3 } },
      { id: 'language.slur', label: 'Slurs', blurb: 'Hateful terms aimed at people (not listed here)', icon: '', media: 'speech', actions: ['mute', 'skip'], severity: { min: 3, max: 3 } },
      { id: 'language.crude', label: 'Crude and mild words', blurb: 'Mild and childish words', icon: '', media: 'speech', actions: ['mute', 'skip'], examples: ['crap', 'damn', 'hell', 'butt', 'fart'], severity: { min: 1, max: 1 } },
      { id: 'language.sexual_reference', label: 'Sexual words', blurb: 'Explicit sexual vocabulary (not listed here)', icon: '', media: 'speech', actions: ['mute', 'skip'], severity: { min: 2, max: 2 } },
    ],
  },
  {
    id: 'sexual_content',
    label: 'Intimacy',
    blurb: 'Kissing and sex scenes',
    icon: '',
    media: 'scene',
    actions: ['skip', 'blur', 'black'],
    keywords: ['sex', 'romance', 'adult', 'kissing', 'kiss'],
  },
  {
    id: 'nudity',
    label: 'Nudity',
    blurb: 'Bare skin on screen',
    icon: '',
    media: 'scene',
    actions: ['blur', 'skip', 'black'],
    keywords: ['naked', 'topless'],
  },
];

/**
 * The level control shown for each word group: the stored Threshold, named in
 * plain words. Each group says in its own words what a level lets through.
 */
export const LEVELS: { value: Threshold; label: string }[] = [
  { value: 0, label: 'Off' },
  { value: 1, label: 'Worst' },
  { value: 2, label: 'Most' },
  { value: 3, label: 'All' },
];

/** Strictness steps in plain language (the stored value is still Threshold) */
export const STRICTNESS: { value: Threshold; label: string; hint: string }[] = [
  { value: 0, label: 'Off', hint: 'Do not filter this' },
  { value: 1, label: 'Severe', hint: 'Only the strongest examples' },
  { value: 2, label: 'Moderate+', hint: 'Moderate and strong examples' },
  { value: 3, label: 'Strict', hint: 'Everything, including mild' },
];

export interface Preset {
  id: string;
  name: string;
  blurb: string;
  categories: Record<string, CategorySetting>;
}

const m = (threshold: Threshold, action: FilterAction = 'mute'): CategorySetting => ({ threshold, action });

/** One tap to a sensible starting point; anything not listed is Off */
export const PRESETS: Preset[] = [
  {
    id: 'catholic-family',
    name: 'Catholic Family',
    blurb: 'Blasphemy, language, intimacy and nudity',
    categories: {
      blasphemy: m(3), language: m(3),
      sexual_content: m(3, 'skip'), nudity: m(3, 'blur'),
    },
  },
  {
    id: 'clean-language',
    name: 'Clean Language',
    blurb: 'Words only: blasphemy and language, nothing else',
    categories: { blasphemy: m(3), language: m(3) },
  },
  {
    id: 'blasphemy-only',
    name: 'Blasphemy Only',
    blurb: 'Just the Lord\'s name and sacred things',
    categories: { blasphemy: m(3) },
  },
  {
    id: 'young-kids-5-8',
    name: 'Young Kids (5-8)',
    blurb: 'Strict on everything: words, intimacy and nudity',
    categories: {
      blasphemy: m(3), language: m(3),
      sexual_content: m(3, 'skip'), nudity: m(3, 'blur'),
    },
  },
];

/** Turn a preset into a full category map (everything unlisted is Off) */
export function presetToCategories(preset: Preset): Record<string, CategorySetting> {
  const out: Record<string, CategorySetting> = {};
  for (const cat of CATALOG) out[cat.id] = { threshold: 0, action: cat.actions[0] };
  return { ...out, ...preset.categories };
}
