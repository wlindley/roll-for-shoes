import type { DiceRoll } from './dice-roll';

export type DieValue = 1 | 2 | 3 | 4 | 5 | 6;

export function isDieValue(value: unknown): value is DieValue {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 6;
}

export function assertValidRollCount(count: number): void {
  if (!Number.isInteger(count) || count < 1) {
    throw new RangeError(`Dice roll count must be a positive integer, received ${count}`);
  }
}

export interface DiceRoller {
  roll(count: number): DiceRoll;
}
