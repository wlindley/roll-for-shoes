import { assertPositiveInt, validateDiceValues, type DiceRoller, type DieValue } from '../dice';
import { RolledPool } from './rolled-pool';
import { freezeModifiers, type CheckModifier, type DifficultyTier } from './types';

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
  readonly diceValues?: readonly DieValue[];
  readonly label?: string;

  constructor(
    diceCount: number,
    options?: { readonly modifiers?: readonly CheckModifier[]; readonly label?: string; readonly diceValues?: readonly DieValue[] },
  ) {
    assertPositiveInt(diceCount, 'Dice count');
    this.diceCount = diceCount;
    this.modifiers = freezeModifiers(options?.modifiers);
    this.diceValues = options?.diceValues ? validateDiceValues(options.diceValues, diceCount) : undefined;
    this.label = options?.label;
    Object.freeze(this);
  }

  static fromDice(
    dice: readonly DieValue[],
    options?: { readonly modifiers?: readonly CheckModifier[]; readonly label?: string },
  ): RolledOpposition {
    return new RolledOpposition(dice.length, { ...options, diceValues: dice });
  }

  withDiceValues(dice: readonly DieValue[]): RolledOpposition {
    return new RolledOpposition(this.diceCount, { modifiers: this.modifiers, label: this.label, diceValues: dice });
  }

  withModifier(label: string, value: number): RolledOpposition {
    return new RolledOpposition(this.diceCount, { modifiers: [...this.modifiers, { label, value }], label: this.label, diceValues: this.diceValues });
  }

  resolve(diceRoller: DiceRoller): OppositionResult {
    const rawDice = this.diceValues ?? diceRoller.roll(this.diceCount).dice;
    const pool = new RolledPool(rawDice, this.modifiers);
    return Object.freeze({ total: pool.finalTotal, pool, label: this.label });
  }
}

export class DifficultyOpposition implements CheckOpposition {
  readonly modifiers: readonly CheckModifier[];
  readonly diceValues?: readonly DieValue[];
  readonly label?: string;

  constructor(
    readonly tier: DifficultyTier,
    readonly mode: 'static' | 'dynamic' = 'static',
    options?: { readonly modifiers?: readonly CheckModifier[]; readonly label?: string; readonly diceValues?: readonly DieValue[] },
  ) {
    if (options?.diceValues && mode === 'static') {
      throw new Error('Cannot supply dice values for static difficulty opposition');
    }
    this.modifiers = freezeModifiers(options?.modifiers);
    this.diceValues = options?.diceValues ? validateDiceValues(options.diceValues, tier) : undefined;
    this.label = options?.label;
    Object.freeze(this);
  }

  withDiceValues(dice: readonly DieValue[]): DifficultyOpposition {
    return new DifficultyOpposition(this.tier, this.mode, { modifiers: this.modifiers, label: this.label, diceValues: dice });
  }

  withModifier(label: string, value: number): DifficultyOpposition {
    return new DifficultyOpposition(this.tier, this.mode, { modifiers: [...this.modifiers, { label, value }], label: this.label, diceValues: this.diceValues });
  }

  resolve(diceRoller: DiceRoller): OppositionResult {
    if (this.mode === 'static') {
      const modifierTotal = this.modifiers.reduce((sum, mod) => sum + mod.value, 0);
      return Object.freeze({ total: this.tier * 3 + modifierTotal, label: this.label });
    }
    const rawDice = this.diceValues ?? diceRoller.roll(this.tier).dice;
    const pool = new RolledPool(rawDice, this.modifiers);
    return Object.freeze({ total: pool.finalTotal, pool, label: this.label });
  }
}
