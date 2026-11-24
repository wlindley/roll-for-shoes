import { assertPositiveInt, validateDiceValues, type DiceRoller, type DieValue } from '../dice';
import type { CheckOpposition, OppositionResult } from './opposition';
import { RolledPool } from './rolled-pool';
import { freezeModifiers, type CheckModifier, type CheckOutcome, type TiesMode } from './types';

export class CheckResult<TOpp extends OppositionResult = OppositionResult> {
  constructor(
    readonly actor: RolledPool,
    readonly opposition: TOpp,
    readonly tiesMode: TiesMode = 'fail',
  ) {}

  get margin(): number { return this.actor.finalTotal - this.opposition.total; }

  get outcome(): CheckOutcome {
    if (this.margin > 0) return 'success';
    if (this.margin === 0 && this.tiesMode === 'twist') return 'tie';
    return 'failure';
  }
}

export class ReadyCheck<TOpp extends OppositionResult = OppositionResult> {
  private readonly modifiers: readonly CheckModifier[];

  constructor(
    private readonly diceCount: number,
    private readonly opposition: CheckOpposition<TOpp>,
    modifiers: readonly CheckModifier[],
    private readonly tiesMode?: TiesMode,
    private readonly diceValues?: readonly DieValue[],
  ) {
    this.modifiers = freezeModifiers(modifiers);
    Object.freeze(this);
  }

  withDiceValues(dice: readonly DieValue[]): ReadyCheck<TOpp> {
    return new ReadyCheck(this.diceCount, this.opposition, this.modifiers, this.tiesMode, validateDiceValues(dice, this.diceCount));
  }

  withModifier(label: string, value: number): ReadyCheck<TOpp> {
    return this.withModifiers([{ label, value }]);
  }

  withModifiers(modifiers: readonly CheckModifier[]): ReadyCheck<TOpp> {
    return new ReadyCheck(this.diceCount, this.opposition, [...this.modifiers, ...modifiers], this.tiesMode, this.diceValues);
  }

  withTiesMode(tiesMode: TiesMode): ReadyCheck<TOpp> {
    return new ReadyCheck(this.diceCount, this.opposition, this.modifiers, tiesMode, this.diceValues);
  }

  resolve(diceRoller: DiceRoller): CheckResult<TOpp> {
    const actorDice = this.diceValues ?? diceRoller.roll(this.diceCount).dice;
    const actor = new RolledPool(actorDice, this.modifiers);
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
    private readonly diceValues?: readonly DieValue[],
  ) {
    this.modifiers = freezeModifiers(modifiers);
    Object.freeze(this);
  }

  static withDice(diceCount: number): Check {
    assertPositiveInt(diceCount, 'Dice count');
    return new Check(diceCount);
  }

  static fromDice(dice: readonly DieValue[]): Check {
    return Check.withDice(dice.length).withDiceValues(dice);
  }

  withDiceValues(dice: readonly DieValue[]): Check {
    return new Check(this.diceCount, this.modifiers, this.tiesMode, validateDiceValues(dice, this.diceCount));
  }

  withModifier(label: string, value: number): Check {
    return this.withModifiers([{ label, value }]);
  }

  withModifiers(modifiers: readonly CheckModifier[]): Check {
    return new Check(this.diceCount, [...this.modifiers, ...modifiers], this.tiesMode, this.diceValues);
  }

  withTiesMode(tiesMode: TiesMode): Check {
    return new Check(this.diceCount, this.modifiers, tiesMode, this.diceValues);
  }

  against<TOpp extends OppositionResult>(opposition: CheckOpposition<TOpp>): ReadyCheck<TOpp> {
    return new ReadyCheck(this.diceCount, opposition, this.modifiers, this.tiesMode, this.diceValues);
  }
}
