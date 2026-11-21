import type { DiceRoller } from '../dice';
import { RolledPool } from './rolled-pool';
import { assertValidDiceCount, freezeModifiers, type CheckModifier, type DifficultyTier } from './types';

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

export class DifficultyOpposition implements CheckOpposition {
  readonly modifiers: readonly CheckModifier[];
  readonly label?: string;

  constructor(
    readonly tier: DifficultyTier,
    readonly mode: 'static' | 'dynamic' = 'static',
    options?: { readonly modifiers?: readonly CheckModifier[]; readonly label?: string },
  ) {
    this.modifiers = freezeModifiers(options?.modifiers);
    this.label = options?.label;
    Object.freeze(this);
  }

  resolve(diceRoller: DiceRoller): OppositionResult {
    if (this.mode === 'static') {
      const modifierTotal = this.modifiers.reduce((sum, mod) => sum + mod.value, 0);
      return Object.freeze({ total: this.tier * 3 + modifierTotal, label: this.label });
    }
    const pool = new RolledPool(diceRoller.roll(this.tier).dice, this.modifiers);
    return Object.freeze({ total: pool.finalTotal, pool, label: this.label });
  }
}
