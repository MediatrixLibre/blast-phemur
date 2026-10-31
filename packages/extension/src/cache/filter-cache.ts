/**
 * Local filter cache using IndexedDB (via simple wrapper).
 *
 * Caches GSF filter sets locally to avoid repeated API lookups.
 * Cache entries expire after 24 hours.
 */

import type { GSFFilterSet } from '@guardianstream/types';

const DB_NAME = 'guardianstream';
const STORE_NAME = 'filters';
const DB_VERSION = 1;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry {
  contentId: string;
  filterSet: GSFFilterSet;
  cachedAt: number;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'contentId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export class FilterCache {
  /**
   * Get a cached filter set by content ID.
   * Returns null if not cached or expired.
   */
  async get(contentId: string): Promise<GSFFilterSet | null> {
    try {
      const db = await openDatabase();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(contentId);
        request.onsuccess = () => {
          const entry = request.result as CacheEntry | undefined;
          if (!entry) {
            resolve(null);
            return;
          }
          // Check TTL
          if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
            this.delete(contentId); // async cleanup
            resolve(null);
            return;
          }
          resolve(entry.filterSet);
        };
        request.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  /**
   * Store a filter set in the cache.
   */
  async set(contentId: string, filterSet: GSFFilterSet): Promise<void> {
    try {
      const db = await openDatabase();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const entry: CacheEntry = { contentId, filterSet, cachedAt: Date.now() };
      store.put(entry);
    } catch {
      // Cache write failure is non-critical
    }
  }

  /**
   * Delete a cache entry.
   */
  async delete(contentId: string): Promise<void> {
    try {
      const db = await openDatabase();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(contentId);
    } catch {
      // Ignore
    }
  }
}
