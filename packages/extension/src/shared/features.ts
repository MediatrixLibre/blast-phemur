/**
 * What is switched on in this build. Each flag is a constant, so the bundler
 * drops the code behind a `false` entirely: turning a feature back on is a
 * one-line change here (plus, for openSubtitles, its host permission in the
 * manifest). Stored settings for a switched-off feature are kept, never dropped.
 *
 * Removed from the menu outright in 0.2.0 (they did nothing yet), restorable
 * from git 1f91056: scene filters (FilterMenu.tsx MatureGroup) and profiles
 * (ProfileSwitcher.tsx). Their stored settings are untouched.
 */
/** Look titles up on the community filter server. Off: the server is not deployed (the URL is localhost). */
export const COMMUNITY_FILTERS = false;
/** Download subtitles from OpenSubtitles. Off: it needs the viewer's own account and a host permission. */
export const OPEN_SUBTITLES = false;
/** Importing .srt/.vtt files, for word-ahead timing on services without a player caption track. */
export const SUBTITLE_FILES = true;

export const FEATURES = {
  communityFilters: COMMUNITY_FILTERS,
  openSubtitles: OPEN_SUBTITLES,
  subtitleFiles: SUBTITLE_FILES,
} as const;
