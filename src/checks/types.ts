import { isDieValue, type DieValue } from '../dice';

export type CheckOutcome = 'success' | 'tie' | 'failure';
export type TiesMode = 'fail' | 'twist';

export enum DifficultyTier {
  Easy = 1,
  Moderate = 2,
  Hard = 3,
  VeryHard = 4,
}

export interface CheckModifier {
  readonly label: string;
  readonly value: number;
}

export function assertValidDiceCount(diceCount: number): void {
  if (!Number.isInteger(diceCount) || diceCount < 1) {
    throw new RangeError(`Dice count must be a positive integer, received ${diceCount}`);
  }
}

export function freezeModifiers(modifiers: readonly CheckModifier[] = []): readonly CheckModifier[] {
  return Object.freeze(modifiers.map((m) => Object.freeze({ ...m })));
}

export function freezeDiceValues(dice: readonly DieValue[], expectedCount: number): readonly DieValue[] {
  if (dice.length !== expectedCount) {
    throw new RangeError(`Expected ${expectedCount} dice, received ${dice.length}`);
  }
  for (const value of dice) {
    if (!isDieValue(value)) {
      throw new RangeError(`Invalid die value: ${String(value)}`);
    }
  }
  return Object.freeze([...dice]);
}
