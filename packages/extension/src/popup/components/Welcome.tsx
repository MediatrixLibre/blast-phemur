import type { UserConfig } from '@guardianstream/types';
import { appName } from '../brand.js';
import { SITES } from '../status-copy.js';
import { WordGroup } from './WordGroup.js';

/** First-install tab: choose how much to mute, then watch */
export function Welcome({ config, onChange }: { config: UserConfig; onChange: (c: UserConfig) => void }) {
  return (
    <main className="gs-page">
      <header className="gs-page-head">
        <img src="icons/icon-48.png" width={48} height={48} alt="" />
        <div>
          <h1 className="gs-page-title">{appName()} is on</h1>
          <p className="gs-page-lede">Blasphemy and swearing are muted as they are spoken and masked in the captions. No account, no tracking.</p>
        </div>
      </header>

      <ol className="gs-steps">
        <li>
          <h2>Choose how much to mute</h2>
          <div className="gs-card">
            <WordGroup groupId="blasphemy" config={config} onChange={onChange} />
            <WordGroup groupId="language" config={config} onChange={onChange} />
          </div>
        </li>
        <li>
          <h2>Watch</h2>
          <p className="gs-page-text">
            Open a show on {SITES}. Protection starts by itself. On YouTube TV it reads the show's own caption track, the
            most precise way it has. Elsewhere it reads the captions, so turn captions (CC) on. The toolbar button always
            says which.
          </p>
          <p className="gs-page-text">
            Muted something that was fine, like a prayer? Press <kbd>[</kbd> on the player: that moment plays from now on,
            and the word stays muted everywhere else. Something got through? Press <kbd>]</kbd>. <kbd>\</kbd> undoes.
            Everything else is in the toolbar button.
          </p>
        </li>
      </ol>
      <button className="gs-btn gs-btn-primary" onClick={() => window.close()}>Done</button>
    </main>
  );
}
