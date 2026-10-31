/**
 * Hook for getting current tab's filtering status. Polls while the popup
 * is open so the anchor state ("captions" -> "anchored") updates live.
 *
 * Also works out WHY there is no status, because "no answer" has three
 * different causes that need three different fixes: the site is not one we
 * run on, the tab predates the extension (reload it), or we are still asking.
 */

import { useState, useEffect } from 'react';

export interface FilterStatus {
  provider: string | null;
  segmentCount: number;
  isFiltering: boolean;
  title: string | null;
  /** precomputed | anchored | captions | null */
  mode?: string | null;
  captionHits?: number;
  /** Caption lines read from the screen so far */
  captionLines?: number;
  /** Subtitle files in the library */
  libraryCount?: number;
  /** Where locked timing comes from */
  source?: 'library' | 'player' | null;
  /** A preview or thumbnail is playing, but no full-size player */
  smallVideoPlaying?: boolean;
}

/**
 * - checking: first answer not back yet
 * - unsupported: not a site the content script runs on (or a browser page)
 * - disconnected: a supported site, but nothing answered, so the tab was open
 *   before the extension started or was updated
 * - connected: the content script answered
 */
export type Reach = 'checking' | 'unsupported' | 'disconnected' | 'connected';

export interface TabStatus {
  reach: Reach;
  status: FilterStatus;
  tabId: number | null;
}

const DEFAULT_STATUS: FilterStatus = {
  provider: null,
  segmentCount: 0,
  isFiltering: false,
  title: null,
};

/** Match a URL against a manifest match pattern like "*://*.youtube.com/*" */
export function matchesPattern(url: string, pattern: string): boolean {
  const m = pattern.match(/^(\*|https?):\/\/([^/]+)(\/.*)$/);
  if (!m) return false;
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  const [, scheme, host, path] = m;
  if (scheme !== '*' && u.protocol !== `${scheme}:`) return false;
  if (scheme === '*' && u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const hostOk = host === '*'
    || (host.startsWith('*.') ? (u.hostname === host.slice(2) || u.hostname.endsWith(host.slice(1))) : u.hostname === host);
  if (!hostOk) return false;
  const re = new RegExp('^' + path.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
  return re.test(u.pathname + u.search);
}

function isSupported(url: string | undefined): boolean {
  if (!url) return false; // no host permission for this tab, so not ours
  const scripts = chrome.runtime.getManifest().content_scripts ?? [];
  return scripts.some((cs) => (cs.matches ?? []).some((p) => matchesPattern(url, p)));
}

export function useStatus(): TabStatus {
  const [state, setState] = useState<TabStatus>({ reach: 'checking', status: DEFAULT_STATUS, tabId: null });

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome?.tabs) return;

    // popup.html?tab=N reads a given tab (the welcome page, tests, screenshots)
    const pinned = Number(new URLSearchParams(location.search).get('tab')) || null;
    const findTab = (cb: (tab: chrome.tabs.Tab | undefined) => void) => {
      if (pinned) chrome.tabs.get(pinned, (t) => cb(chrome.runtime.lastError ? undefined : t));
      else chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => cb(tabs[0]));
    };

    const poll = () => {
      findTab((tab) => {
        if (!tab?.id) return;
        const tabId = tab.id;
        if (!isSupported(tab.url)) {
          setState({ reach: 'unsupported', status: DEFAULT_STATUS, tabId });
          return;
        }
        chrome.tabs.sendMessage(tabId, { type: 'GET_STATUS' }, (response) => {
          if (chrome.runtime.lastError || !response) {
            // A tab still loading has no script yet; give it a moment before calling it stale
            const reach: Reach = tab.status === 'loading' ? 'checking' : 'disconnected';
            setState({ reach, status: DEFAULT_STATUS, tabId });
            return;
          }
          setState({ reach: 'connected', status: response as FilterStatus, tabId });
        });
      });
    };

    poll();
    const timer = setInterval(poll, 1500);
    return () => clearInterval(timer);
  }, []);

  return state;
}
