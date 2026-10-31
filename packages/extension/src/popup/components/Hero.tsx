import { useState } from 'react';
import type { TabStatus } from '../hooks/useStatus.js';
import { describeStatus, type StatusAction } from '../status-copy.js';
import { openSubtitleImport } from '../brand.js';
import { SUBTITLE_FILES } from '../../shared/features.js';

interface HeroProps {
  tab: TabStatus;
  enabled: boolean;
  /** Both word groups Off and Always mute empty */
  mutesNothing: boolean;
  onEnable: () => void;
  /** Open the level controls and put focus on the first one */
  onChoose: () => void;
}

/** The one-glance answer: am I protected on this tab, and how precisely */
export function Hero({ tab, enabled, mutesNothing, onEnable, onChoose }: HeroProps) {
  const [reloading, setReloading] = useState(false);
  const copy = describeStatus(tab.reach, tab.status, enabled, { subtitleFiles: SUBTITLE_FILES, mutesNothing });

  const act = (kind: StatusAction) => {
    if (kind === 'enable') onEnable();
    else if (kind === 'choose') onChoose();
    else if (kind === 'import') openSubtitleImport();
    else if (kind === 'reload' && tab.tabId != null) {
      setReloading(true);
      chrome.tabs.reload(tab.tabId);
      setTimeout(() => setReloading(false), 4000);
    }
  };

  return (
    <section className={`gs-hero is-${copy.tone}`} role="status" aria-live="polite" aria-atomic="true">
      <img className="gs-hero-mark" src={`icons/action/tile-${copy.icon}-32.png`} width={32} height={32} alt="" />
      <div className="gs-hero-body">
        <h1 className="gs-hero-title">{copy.title}</h1>
        {copy.context && <p className="gs-hero-context">{copy.context}</p>}
        {copy.detail && <p className="gs-hero-detail">{copy.detail}</p>}
        {copy.action && (
          <button className="gs-btn gs-btn-primary" disabled={reloading} onClick={() => act(copy.action!.kind)}>
            {reloading ? 'Reloading…' : copy.action.label}
          </button>
        )}
        {copy.secondary && (
          <button className="gs-link" onClick={() => act(copy.secondary!.kind)}>
            {copy.secondary.label}
          </button>
        )}
      </div>
    </section>
  );
}
