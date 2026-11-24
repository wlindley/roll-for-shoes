import { assertPositiveInt, validateDiceValues, type DiceRoller, type DieValue } from '../dice';
import { RolledPool } from './rolled-pool';
import { freezeModifiers, type CheckModifier, type DifficultyTier } from './types';

export interface StaticOppositionResult {
  readonly kind: 'static';
  readonly total: number;
  readonly label?: string;
}

export interface RolledOppositionResult {
  readonly kind: 'rolled';
  readonly total: number;
  readonly pool: RolledPool;
  readonly label?: string;
}

export type OppositionResult = StaticOppositionResult | RolledOppositionResult;

export interface CheckOpposition<TResult extends OppositionResult = OppositionResult> {
  readonly label?: string;
  resolve(diceRoller: DiceRoller): TResult;
}

type OppositionOptions = { readonly modifiers?: readonly CheckModifier[]; readonly label?: string };
type RolledOptions = OppositionOptions & { readonly diceValues?: readonly DieValue[] };

export class StaticOpposition implements CheckOpposition<StaticOppositionResult> {
  constructor(readonly target: number, readonly label?: string) {}

  resolve(_diceRoller: DiceRoller): StaticOppositionResult {
    return Object.freeze({ kind: 'static', total: this.target, label: this.label });
  }
}

export class RolledOpposition implements CheckOpposition<RolledOppositionResult> {
  readonly diceCount: number;
  readonly modifiers: readonly CheckModifier[];
  readonly diceValues?: readonly DieValue[];
  readonly label?: string;

  private constructor(diceCount: number, options?: RolledOptions) {
    assertPositiveInt(diceCount, 'Dice count');
    this.diceCount = diceCount;
    this.modifiers = freezeModifiers(options?.modifiers);
    this.diceValues = options?.diceValues ? validateDiceValues(options.diceValues, diceCount) : undefined;
    this.label = options?.label;
    Object.freeze(this);
  }

  static withDice(diceCount: number, options?: RolledOptions): RolledOpposition {
    return new RolledOpposition(diceCount, options);
  }

  static fromDice(dice: readonly DieValue[], options?: OppositionOptions): RolledOpposition {
    return new RolledOpposition(dice.length, { ...options, diceValues: dice });
  }

  withDiceValues(dice: readonly DieValue[]): RolledOpposition {
    return new RolledOpposition(this.diceCount, { modifiers: this.modifiers, label: this.label, diceValues: dice });
  }

  withModifier(label: string, value: number): RolledOpposition {
    return new RolledOpposition(this.diceCount, { modifiers: [...this.modifiers, { label, value }], label: this.label, diceValues: this.diceValues });
  }

  resolve(diceRoller: DiceRoller): RolledOppositionResult {
    const pool = new RolledPool(this.diceValues ?? diceRoller.roll(this.diceCount).dice, this.modifiers);
    return Object.freeze({ kind: 'rolled', total: pool.finalTotal, pool, label: this.label });
  }
}

export class StaticDifficultyOpposition implements CheckOpposition<StaticOppositionResult> {
  readonly mode = 'static' as const;
  readonly modifiers: readonly CheckModifier[];
  readonly label?: string;

  constructor(readonly tier: DifficultyTier, options?: OppositionOptions) {
    this.modifiers = freezeModifiers(options?.modifiers);
    this.label = options?.label;
    Object.freeze(this);
  }

  withModifier(label: string, value: number): StaticDifficultyOpposition {
    return new StaticDifficultyOpposition(this.tier, { modifiers: [...this.modifiers, { label, value }], label: this.label });
  }

  resolve(_diceRoller: DiceRoller): StaticOppositionResult {
    const modifierTotal = this.modifiers.reduce((sum, mod) => sum + mod.value, 0);
    return Object.freeze({ kind: 'static', total: this.tier * 3 + modifierTotal, label: this.label });
  }
}

export class DynamicDifficultyOpposition implements CheckOpposition<RolledOppositionResult> {
  readonly mode = 'dynamic' as const;
  readonly modifiers: readonly CheckModifier[];
  readonly diceValues?: readonly DieValue[];
  readonly label?: string;

  constructor(readonly tier: DifficultyTier, options?: RolledOptions) {
    this.modifiers = freezeModifiers(options?.modifiers);
    this.diceValues = options?.diceValues ? validateDiceValues(options.diceValues, tier) : undefined;
    this.label = options?.label;
    Object.freeze(this);
  }

  withDiceValues(dice: readonly DieValue[]): DynamicDifficultyOpposition {
    return new DynamicDifficultyOpposition(this.tier, { modifiers: this.modifiers, label: this.label, diceValues: dice });
  }

  withModifier(label: string, value: number): DynamicDifficultyOpposition {
    return new DynamicDifficultyOpposition(this.tier, { modifiers: [...this.modifiers, { label, value }], label: this.label, diceValues: this.diceValues });
  }

  resolve(diceRoller: DiceRoller): RolledOppositionResult {
    const pool = new RolledPool(this.diceValues ?? diceRoller.roll(this.tier).dice, this.modifiers);
    return Object.freeze({ kind: 'rolled', total: pool.finalTotal, pool, label: this.label });
  }
}

export type DifficultyOpposition = StaticDifficultyOpposition | DynamicDifficultyOpposition;

export const DifficultyOpposition = Object.freeze({
  static: (tier: DifficultyTier, options?: OppositionOptions): StaticDifficultyOpposition => new StaticDifficultyOpposition(tier, options),
  dynamic: (tier: DifficultyTier, options?: RolledOptions): DynamicDifficultyOpposition => new DynamicDifficultyOpposition(tier, options),
});
