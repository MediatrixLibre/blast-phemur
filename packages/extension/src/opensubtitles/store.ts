/**
 * Where the OpenSubtitles key and login are kept: this browser's extension
 * storage only (never synced, never sent anywhere but OpenSubtitles itself).
 */

import type { OsSettings, StoredToken, TokenStore } from './client.js';

const SETTINGS_KEY = 'gs:os:settings';
const TOKEN_KEY = 'gs:os:token';

const area = (): chrome.storage.LocalStorageArea | null =>
  typeof chrome !== 'undefined' && chrome.storage ? chrome.storage.local : null;

function read<T>(key: string): Promise<T | null> {
  const a = area();
  return new Promise((resolve) => (a ? a.get(key, (r) => resolve((r[key] as T) ?? null)) : resolve(null)));
}

function write(items: Record<string, unknown>): Promise<void> {
  const a = area();
  return new Promise((resolve) => (a ? a.set(items, () => resolve()) : resolve()));
}

function drop(keys: string[]): Promise<void> {
  const a = area();
  return new Promise((resolve) => (a ? a.remove(keys, () => resolve()) : resolve()));
}

export const loadSettings = (): Promise<OsSettings | null> => read<OsSettings>(SETTINGS_KEY);
export const saveSettings = (s: OsSettings): Promise<void> => write({ [SETTINGS_KEY]: s, [TOKEN_KEY]: null });
export const forgetSettings = (): Promise<void> => drop([SETTINGS_KEY, TOKEN_KEY]);

export const tokenStore: TokenStore = {
  get: () => read<StoredToken>(TOKEN_KEY),
  set: (t) => write({ [TOKEN_KEY]: t }),
  clear: () => drop([TOKEN_KEY]),
};
