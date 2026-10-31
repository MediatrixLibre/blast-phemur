/**
 * GuardianStream API client for the Stremio addon.
 *
 * Fetches filter data from the GuardianStream API server.
 * Falls back to local seed data when the API is unavailable.
 */

import { createHash } from 'node:crypto';
import { findByImdbId, type TitleEntry } from './imdb-map.js';

export interface GSFSegment {
  id: string;
  start: number;
  end: number;
  category: string;
  severity: number;
  action: string;
  confidence: number;
  source: string;
  votes: number;
  words?: string[];
  description?: string;
}

export interface GSFFilterSet {
  contentId: string;
  title: string;
  provider: string;
  providerContentId: string;
  duration: number;
  segments: GSFSegment[];
}

const API_BASE = process.env.GS_API_URL ?? 'http://localhost:3100';

/**
 * Compute the content hash used for API lookups.
 * Must match the extension's computeContentId().
 */
function computeContentId(provider: string, nativeId: string): string {
  return createHash('sha256').update(`${provider}:${nativeId}`).digest('hex');
}

/**
 * Fetch filter data for an IMDB ID.
 *
 * 1. Look up IMDB ID in our title map to get provider + native ID
 * 2. Compute the content hash
 * 3. Query the API using hash-prefix k-anonymity
 * 4. Return the matching filter set (or null)
 */
export async function fetchFiltersForImdb(imdbId: string): Promise<GSFFilterSet | null> {
  const titleEntry = findByImdbId(imdbId);
  if (!titleEntry) return null;

  const contentId = computeContentId(titleEntry.provider, titleEntry.providerContentId);
  const prefix = contentId.slice(0, 4);

  try {
    const response = await fetch(`${API_BASE}/api/v1/filters/${prefix}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) return null;

    const results: GSFFilterSet[] = await response.json() as GSFFilterSet[];
    return results.find((r) => r.contentId === contentId) ?? null;
  } catch {
    // API unavailable -- no filter data
    return null;
  }
}

/**
 * Check if we have title mapping for a given IMDB ID
 * (even if no filter data exists yet).
 */
export function hasTitleMapping(imdbId: string): boolean {
  return findByImdbId(imdbId) !== undefined;
}

/**
 * Get title metadata for catalog display.
 */
export function getTitleMeta(imdbId: string): TitleEntry | undefined {
  return findByImdbId(imdbId);
}
