import type { DieValue } from './types';

export class DiceRoll {
  readonly dice: readonly DieValue[];

  constructor(dice: readonly DieValue[]) {
    this.dice = Object.freeze([...dice]);
  }

  get total(): number {
    return this.dice.reduce((sum, die) => sum + die, 0);
  }
}
