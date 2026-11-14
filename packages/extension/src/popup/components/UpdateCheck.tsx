import { useState } from 'react';

/**
 * The footer's version label doubles as a "Check for updates" button. Chrome
 * checks the store on its own every few hours; this asks it to check now.
 * When an update has been downloaded, reloading the extension applies it.
 */
export function UpdateCheck({ version }: { version: string }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const check = async () => {
    if (busy) return;
    const runtime = typeof chrome === 'undefined' ? undefined : chrome.runtime;
    if (!runtime?.requestUpdateCheck) return setNote('This copy cannot ask the store.');
    setBusy(true);
    setNote('Asking the store...');
    try {
      const { status, version: next } = await runtime.requestUpdateCheck();
      if (status === 'update_available') {
        setNote(next ? `Version ${next} is here. Reloading...` : 'A newer version is here. Reloading...');
        setTimeout(() => runtime.reload(), 900);
      } else if (status === 'throttled') {
        setNote('Checked a moment ago. Try again in a few minutes.');
      } else {
        setNote('You have the newest version.');
      }
    } catch {
      setNote('This copy cannot ask the store.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="gs-update">
      <button type="button" className="gs-link" onClick={check} disabled={busy} aria-live="polite" title="Ask the store for a newer version now">
        v{version} · Check for updates
      </button>
      {note && <span className="gs-update-note">{note}</span>}
    </span>
  );
}
