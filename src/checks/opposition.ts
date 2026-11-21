import type { DiceRoller } from '../dice';
import { RolledPool } from './rolled-pool';
import { assertValidDiceCount, freezeModifiers, type CheckModifier } from './types';

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

export class RolledOpposition implements CheckOpposition {
  readonly diceCount: number;
  readonly modifiers: readonly CheckModifier[];
  readonly label?: string;

  constructor(
    diceCount: number,
    options?: { readonly modifiers?: readonly CheckModifier[]; readonly label?: string },
  ) {
    assertValidDiceCount(diceCount);
    this.diceCount = diceCount;
    this.modifiers = freezeModifiers(options?.modifiers);
    this.label = options?.label;
  }

  resolve(diceRoller: DiceRoller): OppositionResult {
    const pool = new RolledPool(diceRoller.roll(this.diceCount).dice, this.modifiers);
    return Object.freeze({ total: pool.finalTotal, pool, label: this.label });
  }
}
