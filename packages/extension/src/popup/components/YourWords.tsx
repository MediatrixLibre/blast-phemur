import { useState } from 'react';
import type { UserConfig } from '@guardianstream/types';
import { isSacredName, maskForDisplay, maskWord } from '../../caption/caption-censor.js';
import { parseWordList } from '../menu/settings.js';

interface Props {
  config: UserConfig;
  onChange: (config: UserConfig) => void;
}

/** Same length as the list, with every word masked: "damn, hell" -> "d***, h***" */
function maskList(text: string): string {
  return text.split(/([,\n])/).map((part) => (part === ',' || part === '\n' ? part : maskWord(part))).join('');
}

/** "3 always · 1 never", for the fold's summary line */
export function yourWordsSummary(config: UserConfig): string {
  const w = config.customWords ?? { block: [], allow: [] };
  const parts = [
    w.block.length ? `${w.block.length} always muted` : '',
    w.allow.length ? `${w.allow.length} allowed` : '',
    w.passes?.length ? `${w.passes.length} passed ${w.passes.length === 1 ? 'moment' : 'moments'}` : '',
  ].filter(Boolean);
  return parts.join(' · ') || 'None yet';
}

type ListKey = 'block' | 'allow';

/**
 * The viewer's own lists, masked until clicked into; the real words are what
 * get saved. Only the list being typed in is held here: the other list, and
 * both lists while neither is focused, always come from the stored config, so
 * a word allowed from Just muted while the popup is open is never overwritten.
 */
export function YourWords({ config, onChange }: Props) {
  const words = config.customWords ?? { block: [], allow: [] };
  const [draft, setDraft] = useState<{ key: ListKey; text: string } | null>(null);
  const [refused, setRefused] = useState<string[]>([]);
  const passes = words.passes?.length ?? 0;

  const shown = (key: ListKey): string => (draft?.key === key ? draft.text : maskList(words[key].join(', ')));

  // Never rebuild customWords from the two lists alone: that would drop the passes
  const save = () => {
    if (!draft) return;
    const list = parseWordList(draft.text);
    const sacred = draft.key === 'allow' ? list.filter(isSacredName) : [];
    setRefused(sacred);
    setDraft(null);
    const next = list.filter((w) => !sacred.includes(w));
    if (next.join('\n') !== words[draft.key].join('\n')) {
      onChange({ ...config, customWords: { ...words, [draft.key]: next } });
    }
  };

  const field = (key: ListKey, label: string) => (
    <label className="gs-field">
      <span className="gs-field-label">{label}</span>
      <textarea
        className="gs-input"
        rows={2}
        value={shown(key)}
        onChange={(e) => setDraft({ key, text: e.target.value })}
        onFocus={() => setDraft({ key, text: words[key].join(', ') })}
        onBlur={save}
        placeholder="Words, separated by commas"
      />
    </label>
  );

  return (
    <div className="gs-stack">
      {field('block', 'Always mute')}
      {field('allow', 'Never mute')}
      {refused.length > 0 && (
        <p className="gs-hint gs-hint-attention" role="status">
          Not added: {refused.map(maskForDisplay).join(', ')}. A sacred name is never allowed everywhere; pass the one moment instead.
        </p>
      )}
      <p className="gs-hint">Muted in the sound and masked in the captions. A sacred name is never allowed everywhere: pass the one moment instead, from Just muted or with [ on the player.</p>
      {passes > 0 && (
        <p className="gs-hint">
          Passed moments: {passes}{' '}
          <button className="gs-link" onClick={() => onChange({ ...config, customWords: { ...words, passes: [] } })}>Clear all</button>
        </p>
      )}
    </div>
  );
}
