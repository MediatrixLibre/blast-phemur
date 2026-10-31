/**
 * Background service worker: keeps already-open tabs connected after an
 * install or update, opens the welcome tab on first install, and draws the
 * per-tab toolbar icon the content script reports.
 */

/**
 * Tabs already open when the extension is installed or updated have no
 * content script (or an orphaned one). Inject a fresh copy so filtering
 * works without asking the viewer to reload; the old copy stands down.
 */
async function connectOpenTabs(): Promise<number> {
  let injected = 0;
  for (const cs of chrome.runtime.getManifest().content_scripts ?? []) {
    if (!cs.matches?.length || !cs.js?.length) continue;
    const tabs = await chrome.tabs.query({ url: cs.matches });
    for (const tab of tabs) {
      if (tab.id === undefined || tab.discarded) continue;
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: cs.js,
          world: (cs as { world?: string }).world === 'MAIN' ? 'MAIN' : 'ISOLATED',
        });
        injected++;
      } catch {
        // Tab still loading, an error page, or closed meanwhile: its own load injects it
      }
    }
  }
  return injected;
}

chrome.runtime.onInstalled.addListener((details) => {
  console.log(`[GuardianStream] Extension ${details.reason}`);
  void connectOpenTabs().then((n) => console.log(`[GuardianStream] Connected ${n} open tab script(s)`));
  // First install only: a short welcome that sets the level in one tap
  if (details.reason === 'install') {
    void chrome.tabs.create({ url: chrome.runtime.getURL('popup.html?view=welcome') }).catch(() => {});
  }
});

const appName = (): string => chrome.i18n?.getMessage('appName') || 'GuardianStream';

/** Plain-words tooltip for each toolbar state */
const TITLES: Record<string, string> = {
  off: 'off',
  on: 'on, nothing is playing here',
  filtering: 'protecting this video',
  muting: 'muting a word',
  attention: 'nothing is set to mute',
};

/** Message types the content script can send */
interface ContentMessage {
  type: 'GET_CONFIG' | 'GET_FILTERS' | 'LOG' | 'ICON_STATE';
  state?: string;
  payload?: unknown;
}

chrome.runtime.onMessage.addListener(
  (message: ContentMessage, sender, sendResponse) => {
    switch (message.type) {
      case 'ICON_STATE': {
        const tabId = sender.tab?.id;
        const state = message.state;
        if (tabId === undefined || !state || !(state in TITLES)) break;
        const path = { 16: `icons/action/tile-${state}-16.png`, 32: `icons/action/tile-${state}-32.png` };
        chrome.action.setIcon({ tabId, path }).catch(() => {});
        chrome.action.setTitle({ tabId, title: `${appName()}: ${TITLES[state]}` }).catch(() => {});
        break;
      }

      case 'GET_CONFIG':
        // Sprint 0: return default config from storage
        chrome.storage.local.get('config', (result) => {
          sendResponse(result.config ?? null);
        });
        return true; // async response

      case 'LOG':
        console.log('[GuardianStream]', message.payload);
        break;
    }
  },
);
