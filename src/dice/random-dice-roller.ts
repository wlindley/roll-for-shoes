import { DiceRoll } from './dice-roll';
import { assertValidRollCount, type DiceRoller, type DieValue } from './types';

export type RandomBytesSource = (buffer: Uint8Array) => void;

export class RandomDiceRoller implements DiceRoller {
  constructor(
    private readonly randomBytes: RandomBytesSource = (buffer) => {
      globalThis.crypto.getRandomValues(buffer);
    },
  ) {}

  roll(count: number): DiceRoll {
    assertValidRollCount(count);
    const dice: DieValue[] = [];
    while (dice.length < count) {
      const buffer = new Uint8Array(count - dice.length);
      this.randomBytes(buffer);
      for (const byte of buffer) {
        // 252 is the largest multiple of 6 <= 256 (42 * 6); discarding 252..255 avoids modulo bias.
        if (byte < 252) {
          dice.push(((byte % 6) + 1) as DieValue);
        }
      }
    }
    return new DiceRoll(dice);
  }
}
