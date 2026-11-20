import type { DiceRoller } from '../dice';
import type { RolledPool } from './rolled-pool';

export interface OppositionResult {
  readonly total: number;
  readonly pool?: RolledPool;
  readonly label?: string;
}

export interface CheckOpposition {
  readonly label?: string;
  resolve(diceRoller: DiceRoller): OppositionResult;
}

export class StaticOpposition implements CheckOpposition {
  constructor(readonly target: number, readonly label?: string) {}

  resolve(_diceRoller: DiceRoller): OppositionResult {
    return Object.freeze({ total: this.target, label: this.label });
  }
}
