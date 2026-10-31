/**
 * API client for the GuardianStream server.
 *
 * Hash-prefix lookups for k-anonymity: sends only the first 4 characters
 * of the content ID hash. Server returns all matches for that prefix.
 * Client filters to exact match locally.
 */

import type { GSFFilterSet } from '@guardianstream/types';

const DEFAULT_API_URL = 'http://localhost:3100';

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? DEFAULT_API_URL;
  }

  /**
   * Fetch filters for a content ID using hash-prefix privacy.
   *
   * Only the first 4 chars of the contentId are sent to the server.
   * Returns the exact match from the response, or null.
   */
  async fetchFilters(contentId: string): Promise<GSFFilterSet | null> {
    const prefix = contentId.substring(0, 4);

    try {
      const response = await fetch(`${this.baseUrl}/api/v1/filters/${prefix}`);
      if (!response.ok) return null;

      const results: GSFFilterSet[] = await response.json();

      // Client-side exact match (server never knew which title we wanted)
      return results.find((r) => r.contentId === contentId) ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Submit a filter set to the community database.
   */
  async submitFilters(filterSet: GSFFilterSet): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/filters/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(filterSet),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Vote on a segment.
   */
  async vote(
    segmentId: string,
    userId: string,
    direction: 1 | -1,
  ): Promise<{ totalVotes: number } | null> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/votes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segmentId, userId, direction }),
      });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }
}
