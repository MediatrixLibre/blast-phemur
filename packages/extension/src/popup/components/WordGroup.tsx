import { useMemo, useState } from 'react';
import type { CatalogCategory, Threshold, UserConfig } from '@guardianstream/types';
import { CATALOG, LEVELS } from '@guardianstream/types';
import { maskForDisplay } from '../../caption/caption-censor.js';
import { severityOf } from '../../lexicon/profanity.js';
import { GROUP_COPY } from '../menu/levels.js';
import { coverage, exampleSplit, firstReachingLevel, floorOf, groupLevel, hiddenFlags, levelReaches, setGroupLevel, setOne } from '../menu/settings.js';
import { filterWords, listedWords, unlistedCount } from '../menu/words.js';
import { Switch } from './Switch.js';

const labelOf = (t: Threshold): string => LEVELS.find((l) => l.value === t)?.label ?? 'Off';

interface Props {
  groupId: 'blasphemy' | 'language';
  config: UserConfig;
  onChange: (config: UserConfig) => void;
}

const cat = (id: string): CatalogCategory => CATALOG.find((c) => c.id === id)!;

/** One word group: name, a four-step level, and what that level lets through */
export function WordGroup({ groupId, config, onChange }: Props) {
  const group = cat(groupId);
  const copy = GROUP_COPY[groupId];
  const level = groupLevel(config, group);
  const name = `gs-level-${groupId}`;

  return (
    <div className="gs-group" role="group" aria-labelledby={`${name}-h`}>
      <div className="gs-group-row">
        <h3 id={`${name}-h`} className="gs-group-name">{copy.name}</h3>
        <div className="gs-seg" role="radiogroup" aria-label={`${copy.name}: how much to mute`}>
          {LEVELS.map((l) => (
            <label key={l.value} className="gs-seg-opt">
              <input
                type="radio"
                name={name}
                value={l.value}
                checked={level === l.value}
                onChange={() => onChange(setGroupLevel(config, group, l.value))}
              />
              <span>{l.label}</span>
            </label>
          ))}
        </div>
      </div>
      <p className="gs-group-meaning">{copy.levels[level]}</p>
    </div>
  );
}

/** Sub-categories, each honest about what the level does to it, and for swearing the words themselves */
export function FineTune({ groupId, config, onChange }: { groupId: 'blasphemy' | 'language'; config: UserConfig; onChange: (c: UserConfig) => void }) {
  const group = cat(groupId);
  const flags = hiddenFlags(config, group);
  const level = groupLevel(config, group);
  if (level === 0) return <p className="gs-hint">{GROUP_COPY[groupId].levels[0]} Choose a level above to fine-tune it.</p>;
  return (
    <div className="gs-tune-body">
      {(group.children ?? []).map((k) => {
        const reaches = levelReaches(config, group, k);
        const { muted, plays } = exampleSplit(config, group, k);
        const list = (ws: string[]) => ws.map(maskForDisplay).join(', ');
        const here = labelOf(level);
        const note = !reaches
          ? `These play at ${here}. Choose ${labelOf(firstReachingLevel(k))} to mute them.`
          : !k.examples
            ? coverage(config, k) === 'some'
              ? `At ${here}, only the strongest of these.`
              : k.id.startsWith('language.')
                ? `${unlistedCount(k.id)} words, not listed here`
                : k.blurb
            : plays.length === 0
              ? list(muted)
              : `Muted: ${list(muted)}. Plays at ${here}: ${list(plays)}.`;
        return (
          <div key={k.id} className="gs-item">
            <span className="gs-item-text">
              <label htmlFor={`sw-${k.id}`} className="gs-item-name">{k.label}</label>
              <span className={k.examples && reaches && plays.length === 0 ? 'gs-item-ex' : 'gs-item-desc'}>{note}</span>
            </span>
            <Switch
              id={`sw-${k.id}`}
              checked={reaches && !!flags[k.id]}
              disabled={!reaches}
              label={`Mute ${k.label}`}
              onChange={(on) => onChange(setOne(config, group, k.id, on))}
            />
          </div>
        );
      })}
      {group.id === 'language' && <WordList config={config} onChange={onChange} level={level} />}
    </div>
  );
}

/** Individual swear words, masked, each one switch from "let this one through" */
function WordList({ config, onChange, level }: { config: UserConfig; onChange: (c: UserConfig) => void; level: Threshold }) {
  const lang = cat('language');
  const flags = hiddenFlags(config, lang);
  const words = config.customWords ?? { block: [], allow: [] };
  const [q, setQ] = useState('');
  const rows = useMemo(() => listedWords(), []);
  const shown = filterWords(rows, q);
  const allowed = new Set(words.allow);

  const toggleWord = (w: string, hide: boolean) => {
    const allow = hide ? words.allow.filter((x) => x !== w) : [...new Set([...words.allow, w])];
    onChange({ ...config, customWords: { ...words, allow } });
  };

  return (
    <div className="gs-words">
      <input className="gs-input" type="search" aria-label="Find a word" placeholder="Find a word" value={q} onChange={(e) => setQ(e.target.value)} />
      <p className="gs-hint">Switch a word off to let it through, with its endings. Longer words built on it stay muted.</p>
      <ul className="gs-wordlist">
        {shown.map((r) => {
          const muted = !!flags[r.type] && severityOf(r.type, r.word) >= floorOf(level);
          return (
            <li key={r.word} className="gs-word">
              <span className="gs-word-text">{maskForDisplay(r.word)}</span>
              <Switch checked={muted && !allowed.has(r.word)} disabled={!muted} label={`Mute ${maskForDisplay(r.word)}`} onChange={(on) => toggleWord(r.word, on)} />
            </li>
          );
        })}
        {shown.length === 0 && <li className="gs-hint">No word matches.</li>}
      </ul>
    </div>
  );
}
