import { DiceRoll } from './dice-roll';
import { assertValidRollCount, isDieValue, type DiceRoller, type DieValue } from './types';

export class StubDiceRoller implements DiceRoller {
  private readonly queue: DieValue[] = [];

  constructor(initialValues: readonly DieValue[] = []) {
    this.enqueue(...initialValues);
  }

  enqueue(...values: DieValue[]): this {
    for (const value of values) {
      if (!isDieValue(value)) {
        throw new RangeError(`Invalid die value: ${String(value)}`);
      }
    }
    this.queue.push(...values);
    return this;
  }

  get remaining(): number {
    return this.queue.length;
  }

  roll(count: number): DiceRoll {
    assertValidRollCount(count);
    if (this.remaining < count) {
      throw new Error(
        `StubDiceRoller exhausted: requested ${count} dice, but only ${this.remaining} remaining`,
      );
    }
    return new DiceRoll(this.queue.splice(0, count));
  }
}
