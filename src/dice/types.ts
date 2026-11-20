import type { DiceRoll } from './dice-roll';

export type DieValue = 1 | 2 | 3 | 4 | 5 | 6;

export function isDieValue(value: unknown): value is DieValue {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 6;
}

export interface DiceRoller {
  roll(count: number): DiceRoll;
}
