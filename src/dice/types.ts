import type { DiceRoll } from './dice-roll';

export type DieValue = 1 | 2 | 3 | 4 | 5 | 6;

export function isDieValue(value: unknown): value is DieValue {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 6;
}

export function assertPositiveInt(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${label} must be a positive integer, received ${value}`);
  }
}

export function assertValidRollCount(count: number): void {
  assertPositiveInt(count, 'Dice roll count');
}

export function validateDiceValues(dice: readonly DieValue[], expectedCount: number): readonly DieValue[] {
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

export interface DiceRoller {
  roll(count: number): DiceRoll;
}
