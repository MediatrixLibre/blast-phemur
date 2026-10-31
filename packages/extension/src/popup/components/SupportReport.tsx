import { useState } from 'react';

/** Copies a compact report from the active tab: settings and timings, words masked, nothing sent anywhere */
export function SupportReport({ tabId }: { tabId: number | null }) {
  const [note, setNote] = useState('');

  const copy = () => {
    if (tabId == null || typeof chrome === 'undefined' || !chrome?.tabs) return setNote('Open the tab with the show first.');
    chrome.tabs.sendMessage(tabId, { type: 'GET_DEBUG' }, async (report) => {
      if (chrome.runtime.lastError || !report) return setNote('Open the tab with the show, then try again.');
      await navigator.clipboard.writeText(JSON.stringify(report, null, 1));
      setNote(`Copied (${report.events?.length ?? 0} events, words masked). Paste it into your report.`);
    });
  };

  return (
    <div className="gs-row-between">
      <span className="gs-item-text">
        <span className="gs-item-name">Report a problem</span>
        <span className="gs-item-desc" aria-live="polite">{note || 'Copy a report of this tab to the clipboard. Nothing is sent.'}</span>
      </span>
      <button className="gs-btn gs-btn-quiet" onClick={copy}>Copy report</button>
    </div>
  );
}
