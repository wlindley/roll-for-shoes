import type { DieValue } from '../dice';
import { freezeModifiers, type CheckModifier } from './types';

export class RolledPool {
  readonly rawDice: readonly DieValue[];
  readonly modifiers: readonly CheckModifier[];

  constructor(rawDice: readonly DieValue[], modifiers?: readonly CheckModifier[]) {
    this.rawDice = Object.freeze([...rawDice]);
    this.modifiers = freezeModifiers(modifiers);
  }

  get rawTotal(): number {
    return this.rawDice.reduce((sum, die) => sum + die, 0);
  }

  get modifierTotal(): number {
    return this.modifiers.reduce((sum, mod) => sum + mod.value, 0);
  }

  get finalTotal(): number {
    return this.rawTotal + this.modifierTotal;
  }

  get nonSixCount(): number {
    return this.rawDice.filter((die) => die !== 6).length;
  }

  get naturalAllSixes(): boolean {
    return this.rawDice.length > 0 && this.nonSixCount === 0;
  }
}
