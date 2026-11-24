import type React from 'react';
import { useId } from 'react';
import type { DieValue } from '../../dice';

const DIE_FACES: readonly DieValue[] = [1, 2, 3, 4, 5, 6];

export function normalizePhysicalDice(dice: readonly DieValue[], count: number): readonly DieValue[] {
  const safeCount = Number.isInteger(count) && count >= 1 ? Math.min(count, 20) : 1;
  return Array.from({ length: safeCount }, (_, i) => dice[i] ?? 1);
}

export interface PhysicalDiceInputProps {
  readonly label: string;
  readonly diceCount: number;
  readonly value: readonly DieValue[] | null;
  readonly onChange: (next: readonly DieValue[] | null) => void;
}

export function PhysicalDiceInput({ label, diceCount, value, onChange }: PhysicalDiceInputProps): React.JSX.Element {
  const baseId = useId();
  const current = value === null ? null : normalizePhysicalDice(value, diceCount);

  return (
    <div className="row">
      <label className="field-inline">
        <input
          type="checkbox"
          checked={current !== null}
          onChange={(e) => onChange(e.target.checked ? normalizePhysicalDice([], diceCount) : null)}
        />
        {label}
      </label>
      {current !== null && (
        <div className="row" role="group" aria-label={`${label} (${current.length}d6)`}>
          {current.map((val, idx) => (
            <select
              key={`${baseId}-${idx}`}
              aria-label={`${label} die ${idx + 1} of ${current.length}`}
              className={val === 6 ? 'die-select die-six' : 'die-select'}
              value={val}
              onChange={(e) => {
                const next = [...current];
                next[idx] = Number(e.target.value) as DieValue;
                onChange(next);
              }}
            >
              {DIE_FACES.map((face) => (
                <option key={face} value={face}>{face}</option>
              ))}
            </select>
          ))}
        </div>
      )}
    </div>
  );
}
