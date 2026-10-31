/**
 * Provider module registry.
 *
 * Matches the current page URL against registered provider modules
 * and returns the best match (or the generic fallback).
 */

import type { ProviderModule } from '@guardianstream/types';
import { GenericModule } from './generic.js';
import { NetflixModule } from './netflix.js';
import { AmazonModule } from './amazon.js';
import { DisneyModule } from './disney.js';
import { YouTubeModule } from './youtube.js';
import { HBOMaxModule } from './hbomax.js';
import { DirecTVModule } from './directv.js';

/** All registered provider modules, most specific first */
const MODULES: ProviderModule[] = [
  NetflixModule,
  AmazonModule,
  DisneyModule,
  YouTubeModule,
  HBOMaxModule,
  DirecTVModule,
];

/**
 * Match a URL pattern (simplified glob) against a URL.
 */
function matchPattern(pattern: string, url: string): boolean {
  try {
    const escaped = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`).test(url);
  } catch {
    return false;
  }
}

/**
 * Identify which provider module should handle the current page.
 */
export function identifyProvider(url: string): ProviderModule {
  for (const mod of MODULES) {
    for (const pattern of mod.manifest.urlPatterns) {
      if (matchPattern(pattern, url)) {
        return mod;
      }
    }
  }
  return GenericModule;
}

/** Get a module by its ID */
export function getModuleById(id: string): ProviderModule | undefined {
  if (id === 'generic') return GenericModule;
  return MODULES.find((m) => m.manifest.id === id);
}

/** List all registered modules */
export function listModules(): ProviderModule[] {
  return [...MODULES, GenericModule];
}
