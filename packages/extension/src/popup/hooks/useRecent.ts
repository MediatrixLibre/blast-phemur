/**
 * What the filter muted in the last minute on a tab, for the "Just muted"
 * list. Raw words come back from the content script; the list masks them.
 */
import { useEffect, useState } from 'react';
import type { Correction, HitEvent } from '../../corrections/corrections.js';

export function useRecent(tabId: number | null, active: boolean): { hits: HitEvent[]; correct: (c: Correction) => Promise<boolean> } {
  const [hits, setHits] = useState<HitEvent[]>([]);

  useEffect(() => {
    if (!active || tabId == null || typeof chrome === 'undefined' || !chrome?.tabs) {
      setHits([]);
      return;
    }
    const poll = () =>
      chrome.tabs.sendMessage(tabId, { type: 'GET_RECENT' }, (r: { hits?: HitEvent[] } | undefined) => {
        if (chrome.runtime.lastError || !r) return;
        setHits(r.hits ?? []);
      });
    poll();
    const timer = setInterval(poll, 1500);
    return () => clearInterval(timer);
  }, [tabId, active]);

  const correct = (correction: Correction): Promise<boolean> =>
    new Promise((resolve) => {
      if (tabId == null) return resolve(false);
      chrome.tabs.sendMessage(tabId, { type: 'CORRECT', correction }, (r: { ok?: boolean } | undefined) => {
        resolve(!chrome.runtime.lastError && !!r?.ok);
      });
    });

  return { hits, correct };
}
