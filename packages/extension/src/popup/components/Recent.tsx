import { useState } from 'react';
import type { Correction, HitEvent } from '../../corrections/corrections.js';
import { isSacred } from '../../corrections/corrections.js';
import { maskForDisplay } from '../../caption/caption-censor.js';

interface Props {
  hits: HitEvent[];
  correct: (c: Correction) => Promise<boolean>;
}

/** Two rows keep the flagship state inside the popup's 600 px */
const MAX_ROWS = 2;

const keyOf = (h: HitEvent, i: number): string => `${h.track ?? ''}|${h.start ?? ''}|${h.words.map((w) => w.text).join(' ')}|${i}`;
const wordsOf = (h: HitEvent): string => h.words.map((w) => w.text.toLowerCase()).join(' ');
const fromCaptions = (h: HitEvent): boolean => h.track === undefined || h.track.startsWith('captions:');

/**
 * Until the episode is matched, live captions log a hit; once matched, the
 * track logs the same moment again. Keep the track's one (its timing is the
 * word's own), and drop a caption hit only when the track has the same words
 * within a few seconds of it: the same word at another moment is its own row.
 */
export function dedupeHits(hits: HitEvent[]): HitEvent[] {
  const tracked = hits.filter((h) => !fromCaptions(h));
  return hits.filter(
    (h) =>
      !fromCaptions(h) ||
      !tracked.some((t) => wordsOf(t) === wordsOf(h) && (h.start == null || t.start == null || Math.abs(t.start - h.start) < 5)),
  );
}

/**
 * "Just muted": the last few filtered moments, masked. A false alarm is one
 * moment, so the first answer passes that moment only (the same word stays
 * muted everywhere else). Allowing a plain word everywhere is a separate,
 * quieter choice; a sacred name is never allowed everywhere.
 */
export function Recent({ hits, correct }: Props) {
  const [done, setDone] = useState<Record<string, string>>({});
  const all = dedupeHits(hits);
  const shown = all.slice(0, MAX_ROWS);
  if (shown.length === 0) return null;

  const run = async (k: string, c: Correction, ok: string) => {
    const saved = await correct(c);
    setDone((d) => ({ ...d, [k]: saved ? ok : 'Could not save: reload the tab' }));
  };

  return (
    <section className="gs-recent" aria-labelledby="gs-recent-title">
      <h2 id="gs-recent-title" className="gs-label">
        Just muted{all.length > shown.length && <span className="gs-label-note"> · {all.length - shown.length} earlier</span>}
      </h2>
      <ul>
        {shown.map((h, i) => {
          const k = keyOf(h, i);
          const plain = [...new Set(h.words.filter((w) => !isSacred(w)).map((w) => w.text.toLowerCase()))];
          const canPass = h.track !== undefined && h.start != null && h.end != null;
          const words = [...new Set(h.words.map((w) => maskForDisplay(w.text)))].join(', ');
          return (
            <li key={k} className="gs-recent-row">
              <span className="gs-recent-words">{words}</span>
              {done[k] ? (
                <span className="gs-recent-done" role="status">{done[k]}</span>
              ) : (
                <span className="gs-recent-actions">
                  {canPass ? (
                    <button
                      className="gs-btn gs-btn-quiet"
                      onClick={() => run(k, { action: 'pass', track: h.track!, start: h.start!, end: h.end!, also: h.also }, 'Passed: plays here from now on')}
                    >
                      {plain.length === 0 ? 'That was a prayer' : 'That was fine here'}
                    </button>
                  ) : (
                    <span className="gs-hint">Can’t be passed on this page</span>
                  )}
                  {plain.length > 0 && (
                    <button className="gs-link" onClick={() => run(k, { action: 'allow', words: plain }, 'Allowed everywhere')}>
                      Allow everywhere
                    </button>
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="gs-hint gs-recent-foot">A pass lifts that moment only.</p>
    </section>
  );
}
