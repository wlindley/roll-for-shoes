import type { DiceRoller } from '../dice';
import { requireNonBlank, resolveId } from './skill';

export class Status {
  private constructor(readonly id: string, readonly name: string, readonly rating: number, readonly note?: string) {
    Object.freeze(this);
  }

  static create(name: string, rating: number, options?: { readonly id?: string; readonly note?: string }): Status {
    if (!Number.isInteger(rating) || rating === 0) throw new RangeError(`Status rating must be a non-zero integer, received ${rating}`);
    return new Status(resolveId(options?.id), requireNonBlank(name, 'Status name'), rating, options?.note);
  }

  static roll(name: string, diceCount: number, polarity: 'positive' | 'negative', diceRoller: DiceRoller, options?: { readonly id?: string; readonly note?: string }): Status {
    const validName = requireNonBlank(name, 'Status name');
    const total = diceRoller.roll(diceCount).total;
    return Status.create(validName, polarity === 'positive' ? total : -total, options);
  }
}
