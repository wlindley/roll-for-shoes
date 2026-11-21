import type React from 'react';
import { useState } from 'react';
import type { Workspace } from '../../campaign';
import { type Character, Status } from '../../character';
import type { DiceRoller } from '../../dice';

export interface StatusManagerProps {
  readonly workspace: Workspace;
  readonly character: Character;
  readonly diceRoller: DiceRoller;
  readonly onChange: (next: Workspace) => void;
  readonly onError: (message: string) => void;
}

export function StatusManager({ workspace, character, diceRoller, onChange, onError }: StatusManagerProps): React.JSX.Element | null {
  const statusesEnabled = workspace.activeCampaign.campaign.rules.statusesEnabled;
  const [name, setName] = useState('');
  const [entryMode, setEntryMode] = useState<'fixed' | 'roll'>('fixed');
  const [rating, setRating] = useState('-2');
  const [diceCount, setDiceCount] = useState('1');
  const [polarity, setPolarity] = useState<'negative' | 'positive'>('negative');

  if (!statusesEnabled && character.statuses.length === 0) return null;

  const runUpdate = (fn: (c: Character) => Character, fallback: string): boolean => {
    try {
      onChange(workspace.activeCampaign.character(character.id).update(fn).workspace);
      return true;
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : fallback);
      return false;
    }
  };

  const handleAdd = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const createStatus = () => (entryMode === 'fixed' ? Status.create(name, Number(rating)) : Status.roll(name, Number(diceCount), polarity, diceRoller));
    if (runUpdate((c) => c.addStatus(createStatus()), 'Unable to add status.')) setName('');
  };

  return (
    <div className="stack">
      {character.statuses.length > 0 && (
        <div className="row" aria-label={`Statuses for ${character.name}`}>
          {character.statuses.map((s) => (
            <span key={s.id} className={s.rating > 0 ? 'badge badge-success' : 'badge badge-failure'}>
              {s.rating > 0 ? `+${s.rating}` : s.rating} {s.name}
              <button type="button" className="btn-inline" aria-label={`Remove status ${s.name}`} onClick={() => runUpdate((c) => c.removeStatus(s.id), 'Unable to remove status.')}>×</button>
            </span>
          ))}
        </div>
      )}
      {statusesEnabled && (
        <form className="row" onSubmit={handleAdd} aria-label={`Add status to ${character.name}`}>
          <input type="text" aria-label="Status name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Status (e.g. Raining)" required />
          <select aria-label="Status mode" value={entryMode} onChange={(e) => setEntryMode(e.target.value as 'fixed' | 'roll')}>
            <option value="fixed">Fixed</option><option value="roll">Roll d6</option>
          </select>
          {entryMode === 'fixed' ? (
            <input type="number" aria-label="Status rating" step={1} value={rating} onChange={(e) => setRating(e.target.value)} required />
          ) : (
            <>
              <input type="number" aria-label="Status dice" min={1} step={1} value={diceCount} onChange={(e) => setDiceCount(e.target.value)} required />
              <select aria-label="Status polarity" value={polarity} onChange={(e) => setPolarity(e.target.value as 'negative' | 'positive')}>
                <option value="negative">- Penalty</option><option value="positive">+ Bonus</option>
              </select>
            </>
          )}
          <button type="submit" className="btn">+ Status</button>
        </form>
      )}
    </div>
  );
}
