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
          <p className="gs-page-lede">Blasphemy and swearing are muted in the sound and masked in the captions.</p>
        </div>
      </header>

      <div className="gs-steps">
        <section>
          <h2>Choose how much to mute</h2>
          <WordGroup groupId="blasphemy" config={config} onChange={onChange} />
          <WordGroup groupId="language" config={config} onChange={onChange} />
        </section>
        <section>
          <h2>While you watch</h2>
          <p className="gs-page-text">
            Open a show on {SITES} and protection starts by itself. On YouTube and YouTube TV it times each word from the
            show's own caption track. On DIRECTV Stream it reads the captions as they appear, so turn captions (CC) on.
            Click the toolbar button to see which one is in use.
          </p>
          <p className="gs-page-text">
            If something that was fine gets muted, such as a prayer, press <kbd>[</kbd> on the player: that moment plays
            from now on, and the word stays muted everywhere else. If a word gets through, press <kbd>]</kbd>. Press{' '}
            <kbd>\</kbd> to undo. All other settings are under the toolbar button.
          </p>
        </section>
      </div>
      <button className="gs-btn gs-btn-primary" onClick={() => window.close()}>Done</button>
    </main>
  );
}
