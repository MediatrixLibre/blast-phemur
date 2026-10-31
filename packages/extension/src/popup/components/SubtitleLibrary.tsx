import { useEffect, useState } from 'react';
import { OpenSubtitlesDialog } from './OpenSubtitlesDialog.js';
import { OPEN_SUBTITLES } from '../../shared/features.js';
import { listLibrary, removeSubtitle, saveSubtitle, type LibraryEntry } from '../../subtitles/library.js';

interface Props {
  /** Rendered in a full tab, where a file dialog does not close the page */
  inTab?: boolean;
  /** Called with the popup's own way to open the import tab */
  onOpenImport?: () => void;
}

/** "3 episodes", for the fold's summary line */
export function useLibraryCount(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    void listLibrary().then((e) => setN(e.length));
  }, []);
  return n;
}

export function SubtitleLibrary({ inTab, onOpenImport }: Props) {
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [message, setMessage] = useState<string>('');
  const [dragging, setDragging] = useState(false);
  const [osOpen, setOsOpen] = useState(false);

  const refresh = () => listLibrary().then(setEntries);
  useEffect(() => {
    void refresh();
  }, []);

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    let ok = 0;
    const errors: string[] = [];
    for (const file of Array.from(files)) {
      const result = await saveSubtitle(file.name, await file.text());
      if ('error' in result) errors.push(result.error);
      else ok++;
    }
    setMessage(`Added ${ok} of ${files.length}.` + (errors.length ? ` ${errors[0]}` : ''));
    void refresh();
  };

  return (
    <div className="gs-stack">
      <p className="gs-hint">
        For services without a caption track of their own, a subtitle file lets words be muted just before they are
        spoken. Name files like <code>Show.Name.S01E02.srt</code>; the episode playing is found on its own. Not needed on
        YouTube or YouTube TV.
      </p>

      {inTab ? (
        <label
          className={`gs-drop${dragging ? ' is-over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void onFiles(e.dataTransfer.files);
          }}
        >
          <input
            type="file"
            accept=".srt,.vtt"
            multiple
            className="gs-visually-hidden"
            onChange={(e) => {
              void onFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <span className="gs-drop-title">Drop .srt or .vtt files here</span>
          <span className="gs-btn gs-btn-quiet" aria-hidden="true">Choose files</span>
        </label>
      ) : (
        // The toolbar popup closes when a file dialog opens (macOS), so pick files in a tab
        <button className="gs-btn gs-btn-quiet" onClick={onOpenImport}>Add subtitle files…</button>
      )}
      {message && <p className="gs-hint" role="status">{message}</p>}

      {OPEN_SUBTITLES && (
        <>
          <button className="gs-btn gs-btn-quiet" onClick={() => setOsOpen(true)}>Get subtitles from OpenSubtitles…</button>
          <OpenSubtitlesDialog open={osOpen} onClose={() => setOsOpen(false)} onChanged={() => void refresh()} />
        </>
      )}

      {entries.length > 0 && (
        <ul className="gs-files" aria-label="Saved subtitle files">
          {entries.map((e) => (
            <li key={e.key} className="gs-row-between">
              <span className="gs-item-text">
                <span className="gs-item-name">{e.title}</span>
                <span className="gs-item-desc">{e.cueCount} lines</span>
              </span>
              <button className="gs-link" onClick={() => removeSubtitle(e.key).then(refresh)} aria-label={`Remove ${e.title}`}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
