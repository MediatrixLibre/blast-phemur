import { useEffect, useRef, useState } from 'react';
import { CATALOG, LEVELS } from '@guardianstream/types';
import { ENABLED_KEY } from '../shared/config.js';
import { SUBTITLE_FILES } from '../shared/features.js';
import { mutesAnything } from '../shared/selection.js';
import { groupLevel } from './menu/settings.js';
import { useConfig } from './hooks/useConfig.js';
import { useStatus } from './hooks/useStatus.js';
import { useRecent } from './hooks/useRecent.js';
import { openSubtitleImport, VERSION } from './brand.js';
import { Header } from './components/Header.js';
import { Hero } from './components/Hero.js';
import { Recent } from './components/Recent.js';
import { FineTune, WordGroup } from './components/WordGroup.js';
import { Switch } from './components/Switch.js';
import { Fold } from './components/Fold.js';
import { YourWords, yourWordsSummary } from './components/YourWords.js';
import { SubtitleLibrary, useLibraryCount } from './components/SubtitleLibrary.js';
import { SupportReport } from './components/SupportReport.js';
import { Welcome } from './components/Welcome.js';

/** popup.html?view=subtitles (file import, in a tab) or ?view=welcome (first install) */
const VIEW = new URLSearchParams(location.search).get('view');

const levelName = (config: Parameters<typeof groupLevel>[0], id: string): string =>
  LEVELS.find((l) => l.value === groupLevel(config, CATALOG.find((c) => c.id === id)!))?.label ?? 'Off';

export function App() {
  const { config, loading, saveConfig } = useConfig();
  const tab = useStatus();
  const [enabled, setEnabled] = useState(true);
  const filtering = tab.reach === 'connected' && enabled && tab.status.isFiltering;
  const recent = useRecent(tab.tabId, filtering && VIEW == null);
  const libraryCount = useLibraryCount();
  // While a show is filtered, the level controls fold into one line so the
  // status and Just muted stay on the first screen
  const [levelsOpen, setLevelsOpen] = useState(false);
  const [focusLevels, setFocusLevels] = useState(false);
  const levelsRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!focusLevels) return;
    setFocusLevels(false);
    const radios = levelsRef.current?.querySelectorAll<HTMLInputElement>('input[type=radio]');
    ([...(radios ?? [])].find((r) => r.checked) ?? radios?.[0])?.focus();
  }, [focusLevels]);
  const openLevels = () => {
    setLevelsOpen(true);
    setFocusLevels(true);
  };

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome?.storage) {
      chrome.storage.local.get(ENABLED_KEY, (r) => setEnabled(r[ENABLED_KEY] !== false));
    }
  }, []);

  if (loading) return <p className="gs-hint gs-pad">Loading…</p>;

  const handleToggle = (on: boolean) => {
    setEnabled(on);
    // The content script watches this key and restarts itself
    if (typeof chrome !== 'undefined' && chrome?.storage) chrome.storage.local.set({ [ENABLED_KEY]: on });
  };

  if (VIEW === 'welcome') return <Welcome config={config} onChange={saveConfig} />;

  if (VIEW === 'subtitles') {
    return (
      <main className="gs-page">
        <h1 className="gs-page-title">Subtitle files</h1>
        <p className="gs-page-lede">Add files for the shows you watch, then go back to your show. You can close this tab.</p>
        <div className="gs-card">
          <SubtitleLibrary inTab />
        </div>
      </main>
    );
  }

  const censor = config.censorCaptions !== false;
  const mutesNothing = !mutesAnything(config);
  const ownWords = config.customWords?.block.length ?? 0;
  const compactLevels = filtering && !levelsOpen && !mutesNothing;

  return (
    <>
      <Header enabled={enabled} onToggle={handleToggle} />
      <Hero tab={tab} enabled={enabled} mutesNothing={mutesNothing} onEnable={() => handleToggle(true)} onChoose={openLevels} />
      {filtering && !mutesNothing && <Recent hits={recent.hits} correct={recent.correct} />}

      {compactLevels ? (
        <section className="gs-section gs-row-between" aria-labelledby="gs-what">
          <span className="gs-item-text">
            <h2 id="gs-what" className="gs-label">What to mute</h2>
            <span className="gs-item-desc">
              Blasphemy: {levelName(config, 'blasphemy')} · Swearing: {levelName(config, 'language')}
              {ownWords > 0 && ` · ${ownWords} of your own`}
            </span>
          </span>
          <button className="gs-btn gs-btn-quiet" aria-expanded={false} aria-controls="gs-levels" onClick={openLevels}>
            Change
          </button>
        </section>
      ) : (
        <section className="gs-section" id="gs-levels" ref={levelsRef} aria-labelledby="gs-what">
          <h2 id="gs-what" className="gs-label">What to mute</h2>
          <WordGroup groupId="blasphemy" config={config} onChange={saveConfig} />
          <WordGroup groupId="language" config={config} onChange={saveConfig} />
        </section>
      )}

      <Fold title="Fine-tune" hint={yourWordsSummary(config) === 'None yet' ? 'Captions, kinds of words, single words, your lists' : `Your lists: ${yourWordsSummary(config)}`}>
        <div className="gs-stack">
          <div className="gs-row-between">
            <span className="gs-item-text">
              <label htmlFor="sw-captions" className="gs-item-name">Mask words in captions</label>
              <span className="gs-item-desc">{censor ? 'On: shown on screen as f***' : 'Off: captions show every word'}</span>
            </span>
            <Switch id="sw-captions" checked={censor} label="Mask words in captions" onChange={(on) => saveConfig({ ...config, censorCaptions: on })} />
          </div>
          <h3 className="gs-sub">Blasphemy</h3>
          <FineTune groupId="blasphemy" config={config} onChange={saveConfig} />
          <h3 className="gs-sub">Swearing</h3>
          <FineTune groupId="language" config={config} onChange={saveConfig} />
          <h3 className="gs-sub">Your words</h3>
          <YourWords config={config} onChange={saveConfig} />
        </div>
      </Fold>

      <Fold title="More" hint={SUBTITLE_FILES ? 'Subtitle files, player keys, support' : 'Player keys, support'}>
        <div className="gs-stack">
          {SUBTITLE_FILES && (
            <div className="gs-row-between">
              <span className="gs-item-text">
                <span className="gs-item-name">Subtitle files</span>
                <span className="gs-item-desc">
                  {libraryCount === 0 ? 'For word-by-word timing where a service has no caption track' : `${libraryCount} saved`}
                </span>
              </span>
              <button className="gs-btn gs-btn-quiet" onClick={openSubtitleImport}>{libraryCount === 0 ? 'Add' : 'Manage'}</button>
            </div>
          )}
          <div className="gs-keys">
            <span className="gs-item-name">Keys on the player</span>
            <dl>
              <dt><kbd>[</kbd></dt><dd>That was fine here: this moment plays from now on. Then 1 allows the word everywhere, except a sacred name.</dd>
              <dt><kbd>]</kbd></dt><dd>That got through: mute it from now on</dd>
              <dt><kbd>\</kbd></dt><dd>Undo the last one</dd>
            </dl>
          </div>
          <SupportReport tabId={tab.tabId} />
        </div>
      </Fold>

      <footer className="gs-footer">
        <a href="privacy.html" target="_blank" rel="noopener noreferrer">Privacy</a>
        {VERSION && <span className="gs-version">v{VERSION}</span>}
      </footer>
    </>
  );
}
