import type React from 'react';
import type { DieValue } from '../../dice';

export interface DiceRowProps {
  readonly dice: readonly DieValue[];
}

export function DiceRow({ dice }: DiceRowProps): React.JSX.Element {
  return <span className="row">{dice.map((d, i) => <span key={i} className={d === 6 ? 'die die-six' : 'die'}>{d}</span>)}</span>;
}
