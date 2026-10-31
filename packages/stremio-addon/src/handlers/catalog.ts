/**
 * Catalog handler -- "GuardianStream Ready" browsable collection.
 *
 * Shows all titles that have filter data available in Stremio's
 * Discover section, so users can see what's covered.
 */

import { getAllTitles, type TitleEntry } from '../lib/imdb-map.js';

export interface MetaPreview {
  id: string;
  type: 'movie' | 'series';
  name: string;
  poster?: string;
  description?: string;
  releaseInfo?: string;
}

/**
 * Determine content type from IMDB ID and title.
 * Titles containing "S1", "Season", etc. are series.
 */
function getType(title: TitleEntry): 'movie' | 'series' {
  if (/\bS\d+\b/i.test(title.title)) return 'series';
  if (/\bseason\b/i.test(title.title)) return 'series';
  return 'movie';
}

/**
 * Get catalog entries for all titles with filter data.
 */
export function getCatalog(
  type: string,
  extra: { search?: string; skip?: number } = {},
): { metas: MetaPreview[] } {
  let titles = getAllTitles();

  // Filter by type
  if (type === 'movie') {
    titles = titles.filter((t) => getType(t) === 'movie');
  } else if (type === 'series') {
    titles = titles.filter((t) => getType(t) === 'series');
  }

  // Search filter
  if (extra.search) {
    const query = extra.search.toLowerCase();
    titles = titles.filter((t) =>
      t.title.toLowerCase().includes(query)
      || t.provider.toLowerCase().includes(query),
    );
  }

  // Pagination
  const skip = extra.skip ?? 0;
  const page = titles.slice(skip, skip + 50);

  const metas: MetaPreview[] = page.map((t) => ({
    id: t.imdbId,
    type: getType(t),
    name: t.title,
    releaseInfo: String(t.year),
    description: `GuardianStream filters available (${t.provider})`,
  }));

  return { metas };
}
