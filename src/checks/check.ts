import type { DiceRoller } from '../dice';
import type { CheckOpposition, OppositionResult } from './opposition';
import { RolledPool } from './rolled-pool';
import { assertValidDiceCount, freezeModifiers, type CheckModifier, type CheckOutcome, type TiesMode } from './types';

export class CheckResult {
  constructor(
    readonly actor: RolledPool,
    readonly opposition: OppositionResult,
    readonly tiesMode: TiesMode = 'fail',
  ) {}

  get margin(): number { return this.actor.finalTotal - this.opposition.total; }

  get outcome(): CheckOutcome {
    if (this.margin > 0) return 'success';
    if (this.margin === 0 && this.tiesMode === 'twist') return 'tie';
    return 'failure';
  }
}

export class ReadyCheck {
  private readonly modifiers: readonly CheckModifier[];

  constructor(
    private readonly diceCount: number,
    private readonly opposition: CheckOpposition,
    modifiers: readonly CheckModifier[],
    private readonly tiesMode?: TiesMode,
  ) {
    this.modifiers = freezeModifiers(modifiers);
    Object.freeze(this);
  }

  withModifier(label: string, value: number): ReadyCheck {
    return this.withModifiers([{ label, value }]);
  }

  withModifiers(modifiers: readonly CheckModifier[]): ReadyCheck {
    return new ReadyCheck(this.diceCount, this.opposition, [...this.modifiers, ...modifiers], this.tiesMode);
  }

  withTiesMode(tiesMode: TiesMode): ReadyCheck {
    return new ReadyCheck(this.diceCount, this.opposition, this.modifiers, tiesMode);
  }

  resolve(diceRoller: DiceRoller): CheckResult {
    const actor = new RolledPool(diceRoller.roll(this.diceCount).dice, this.modifiers);
    const opposition = this.opposition.resolve(diceRoller);
    return new CheckResult(actor, opposition, this.tiesMode);
  }
}

export class Check {
  private readonly modifiers: readonly CheckModifier[];

  private constructor(
    private readonly diceCount: number,
    modifiers?: readonly CheckModifier[],
    private readonly tiesMode?: TiesMode,
  ) {
    this.modifiers = freezeModifiers(modifiers);
    Object.freeze(this);
  }

  static withDice(diceCount: number): Check {
    assertValidDiceCount(diceCount);
    return new Check(diceCount);
  }

  withModifier(label: string, value: number): Check {
    return this.withModifiers([{ label, value }]);
  }

  withModifiers(modifiers: readonly CheckModifier[]): Check {
    return new Check(this.diceCount, [...this.modifiers, ...modifiers], this.tiesMode);
  }

  withTiesMode(tiesMode: TiesMode): Check {
    return new Check(this.diceCount, this.modifiers, tiesMode);
  }

  against(opposition: CheckOpposition): ReadyCheck {
    return new ReadyCheck(this.diceCount, opposition, this.modifiers, this.tiesMode);
  }
}
