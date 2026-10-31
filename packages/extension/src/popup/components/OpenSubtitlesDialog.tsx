import { useEffect, useRef, useState } from 'react';
import { episodeFromFilename, listLibrary, saveSubtitle, type LibraryEntry } from '../../subtitles/library.js';
import { OpenSubtitlesClient, OsError, fillSeason, type FillResult, type OsSettings } from '../../opensubtitles/client.js';
import { forgetSettings, loadSettings, saveSettings, tokenStore } from '../../opensubtitles/store.js';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called after files were added so the library list can refresh */
  onChanged: () => void;
}

const EMPTY: OsSettings = { apiKey: '', username: '', password: '' };

/** "Deadwood S01E02" -> "Deadwood": the show the library already holds most of */
function usualShow(entries: LibraryEntry[]): string {
  const count = new Map<string, number>();
  for (const e of entries) {
    const show = e.title.replace(/\s+S\d+E\d+$/i, '').trim();
    if (show) count.set(show, (count.get(show) ?? 0) + 1);
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}

function summary(r: FillResult): string {
  const parts: string[] = [];
  if (r.added.length) parts.push(`Added ${r.added.length} episode${r.added.length === 1 ? '' : 's'}.`);
  if (r.alreadyHad.length) parts.push(`${r.alreadyHad.length} already in your library.`);
  if (r.notFound.length) parts.push(`${r.notFound.length} not on OpenSubtitles.`);
  if (r.failed.length) parts.push(`${r.failed.length} could not be used.`);
  if (r.stoppedEarly) parts.push(r.stoppedEarly);
  else if (r.remaining !== null) parts.push(`${r.remaining} downloads left today.`);
  return parts.join(' ') || 'Nothing to add.';
}

export function OpenSubtitlesDialog({ open, onClose, onChanged }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<OsSettings>(EMPTY);
  const [connected, setConnected] = useState(false);
  const [note, setNote] = useState<{ tone: 'ok' | 'bad' | ''; text: string }>({ tone: '', text: '' });
  const [show, setShow] = useState('');
  const [season, setSeason] = useState('1');
  const [episode, setEpisode] = useState('');
  const [lines, setLines] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const saved = await loadSettings();
      if (saved) {
        setForm(saved);
        setConnected(true);
      }
      setShow((s) => s || '');
      const entries = await listLibrary();
      setShow((s) => s || usualShow(entries));
    })();
  }, [open]);

  const client = (s: OsSettings) => new OpenSubtitlesClient(s, { store: tokenStore });
  const say = (tone: 'ok' | 'bad' | '', text: string) => setNote({ tone, text });
  const why = (e: unknown) => (e instanceof OsError ? e.message : 'Something went wrong. Try again.');

  const saveAndTest = async () => {
    if (!form.apiKey.trim() || !form.username.trim() || !form.password) {
      say('bad', 'Fill in the key, username and password.');
      return;
    }
    setBusy(true);
    say('', 'Checking…');
    try {
      const s = { apiKey: form.apiKey.trim(), username: form.username.trim(), password: form.password };
      await saveSettings(s);
      const acct = await client(s).account();
      setConnected(true);
      say('ok', acct.remaining !== null ? `Connected. ${acct.remaining} downloads left today.` : 'Connected.');
    } catch (e) {
      setConnected(false);
      say('bad', why(e));
    } finally {
      setBusy(false);
    }
  };

  const get = async () => {
    const n = Number(season);
    if (!show.trim() || !Number.isInteger(n) || n < 1) {
      say('bad', 'Enter the show name and a season number.');
      return;
    }
    const ep = episode.trim() === '' ? undefined : Number(episode);
    if (ep !== undefined && (!Number.isInteger(ep) || ep < 1)) {
      say('bad', 'Episode should be a number, or leave it empty for all.');
      return;
    }
    setBusy(true);
    setLines([]);
    say('', '');
    try {
      const have = new Set((await listLibrary()).map((e) => e.key));
      const result = await fillSeason(client(form), {
        show: show.trim(),
        season: n,
        episode: ep,
        have,
        keyFor: (sh, s, e) => episodeFromFilename(`${sh}.S${s}E${e}.srt`)?.key ?? null,
        save: (name, text) => saveSubtitle(name, text),
        onProgress: (l) => setLines((prev) => [...prev, l]),
      });
      say(result.added.length > 0 || result.alreadyHad.length > 0 ? 'ok' : 'bad', summary(result));
      if (result.added.length > 0) onChanged();
    } catch (e) {
      say('bad', why(e));
    } finally {
      setBusy(false);
    }
  };

  const forget = async () => {
    await forgetSettings();
    setForm(EMPTY);
    setConnected(false);
    say('', 'Your key and login were removed from this browser.');
  };

  const set = (k: keyof OsSettings) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <dialog ref={ref} className="gs-dialog" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <div className="gs-dialog-body">
        <div className="gs-section-title">OpenSubtitles</div>

        <div className="gs-pack-desc">
          Subtitle files for your library, from your free OpenSubtitles account. Kept only in this browser and sent
          only to OpenSubtitles.
        </div>

        <details open={!connected} className="gs-dialog-setup">
          <summary>{connected ? 'Key and login (saved)' : 'Set up'}</summary>
          <ol className="gs-pack-desc">
            <li>
              Sign in at <a href="https://www.opensubtitles.com" target="_blank" rel="noreferrer">opensubtitles.com</a>{' '}
              (a free account is fine).
            </li>
            <li>
              Open your profile, then <b>API consumers</b>, then add one and choose <b>Under development</b>.
            </li>
            <li>Paste its key here, with your username and password.</li>
          </ol>
          <label className="gs-field stacked">
            <span>API key</span>
            <input className="gs-search" type="password" autoComplete="off" value={form.apiKey} onChange={set('apiKey')} />
          </label>
          <label className="gs-field stacked">
            <span>Username</span>
            <input className="gs-search" type="text" autoComplete="off" value={form.username} onChange={set('username')} />
          </label>
          <label className="gs-field stacked">
            <span>Password</span>
            <input className="gs-search" type="password" autoComplete="off" value={form.password} onChange={set('password')} />
          </label>
          <div className="gs-dialog-actions">
            <button className="gs-btn" onClick={() => void saveAndTest()} disabled={busy}>
              Save and test
            </button>
            {connected && (
              <button className="gs-link-btn" onClick={() => void forget()} disabled={busy}>
                Forget my details
              </button>
            )}
          </div>
        </details>

        {connected && (
          <div className="gs-dialog-get">
            <div className="gs-section-title">Get subtitles</div>
            <label className="gs-field stacked">
              <span>Show</span>
              <input className="gs-search" type="text" value={show} onChange={(e) => setShow(e.target.value)} />
            </label>
            <div className="gs-dialog-pair">
              <label className="gs-field stacked">
                <span>Season</span>
                <input className="gs-search" type="number" min={1} value={season} onChange={(e) => setSeason(e.target.value)} />
              </label>
              <label className="gs-field stacked">
                <span>Episode (optional)</span>
                <input className="gs-search" type="number" min={1} value={episode} onChange={(e) => setEpisode(e.target.value)} />
              </label>
            </div>
            <div className="gs-dialog-actions">
              <button className="gs-btn" onClick={() => void get()} disabled={busy}>
                {episode.trim() ? 'Get this episode' : 'Get missing episodes'}
              </button>
            </div>
            {lines.length > 0 && (
              <ul className="gs-dialog-log" aria-live="polite">
                {lines.slice(-8).map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {note.text && (
          <div className={`gs-dialog-note ${note.tone}`} role="status">
            {note.text}
          </div>
        )}

        <div className="gs-dialog-actions end">
          <button className="gs-link-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </dialog>
  );
}
