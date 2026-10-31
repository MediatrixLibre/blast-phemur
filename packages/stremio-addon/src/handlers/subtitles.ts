/**
 * Subtitles handler -- serves filter data as a WebVTT subtitle track.
 *
 * When a user plays a title in Stremio, this handler returns a
 * "GuardianStream Filters" subtitle track. Selecting it shows
 * visual markers at filtered moments (e.g., "[MUTED: language filtered]").
 *
 * This works on EVERY Stremio client (Android TV, Fire TV, desktop,
 * iOS, etc.) because subtitles are universally supported.
 */

import { fetchFiltersForImdb, hasTitleMapping } from '../lib/filter-client.js';
import { generateVTT, type FilterSegment } from '../lib/vtt-generator.js';

/** Cache generated VTT content to avoid re-fetching */
const vttCache = new Map<string, { vtt: string; timestamp: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface SubtitleResult {
  subtitles: Array<{
    url: string;
    lang: string;
    id: string;
  }>;
}

/**
 * Get subtitles for a given IMDB ID.
 *
 * Returns a subtitle track URL that serves the VTT content
 * via the addon's own HTTP endpoint.
 */
export function getSubtitles(
  imdbId: string,
  baseUrl: string,
): SubtitleResult {
  if (!hasTitleMapping(imdbId)) {
    return { subtitles: [] };
  }

  return {
    subtitles: [
      {
        url: `${baseUrl}/vtt/${imdbId}.vtt`,
        lang: 'eng',
        id: 'guardianstream-filters',
      },
    ],
  };
}

/**
 * Generate VTT content for a specific IMDB ID.
 * Called by the Express route that serves the .vtt file.
 */
export async function getVTTContent(
  imdbId: string,
  filterLevel: string = 'moderate',
): Promise<string | null> {
  // Check cache
  const cached = vttCache.get(`${imdbId}:${filterLevel}`);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.vtt;
  }

  const filterSet = await fetchFiltersForImdb(imdbId);
  if (!filterSet || filterSet.segments.length === 0) {
    // Return a minimal VTT noting no data
    return [
      'WEBVTT - GuardianStream Filter Track',
      '',
      'NOTE No filter data available for this title yet.',
      'NOTE Visit guardianstream.org to contribute!',
      '',
    ].join('\n');
  }

  // Filter segments by level
  const minSeverity = filterLevel === 'strict' ? 1 : filterLevel === 'moderate' ? 2 : 3;
  const segments: FilterSegment[] = filterSet.segments
    .filter((s) => s.severity >= minSeverity)
    .map((s) => ({
      start: s.start,
      end: s.end,
      category: s.category,
      severity: s.severity,
      action: s.action,
      description: s.description,
    }));

  const vtt = generateVTT(segments, { title: filterSet.title });

  // Cache it
  vttCache.set(`${imdbId}:${filterLevel}`, { vtt, timestamp: Date.now() });

  return vtt;
}
