/** The product name, from _locales (one value to rename), with a fallback for previews */
export function appName(): string {
  try {
    return chrome.i18n.getMessage('appName') || 'Blast Phemur*';
  } catch {
    return 'Blast Phemur*';
  }
}

export const VERSION = (() => {
  try {
    return chrome.runtime.getManifest().version;
  } catch {
    return '';
  }
})();

/**
 * Subtitle import runs in a full tab: on macOS the toolbar popup closes as
 * soon as the file dialog takes focus, and the chosen files never arrive.
 */
export function openSubtitleImport(): void {
  chrome.tabs.create({ url: chrome.runtime.getURL('popup.html?view=subtitles') });
}
