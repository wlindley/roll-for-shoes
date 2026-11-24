import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  DiceRoll,
  isDieValue,
  RandomDiceRoller,
  type DiceRoller,
  type RandomBytesSource,
} from './index';

function byteSequenceSource(bytes: readonly number[]): RandomBytesSource {
  let cursor = 0;
  return (buffer) => {
    for (let i = 0; i < buffer.length; i += 1) {
      const byte = bytes[cursor];
      if (byte === undefined) {
        throw new Error(`Byte sequence exhausted at index ${cursor}`);
      }
      buffer[i] = byte;
      cursor += 1;
    }
  };
}

describe('RandomDiceRoller', () => {
  it.each([0, -1, 2.2, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects invalid roll count %s with RangeError before requesting random bytes',
    (badCount) => {
      let sourceCalls = 0;
      const roller = new RandomDiceRoller(() => {
        sourceCalls += 1;
      });

      expect(() => roller.roll(badCount)).toThrow(RangeError);
      expect(sourceCalls).toBe(0);
    },
  );

  it('maps lower-boundary bytes 0..5 to faces 1..6 via (byte % 6) + 1', () => {
    const roller = new RandomDiceRoller(byteSequenceSource([0, 1, 2, 3, 4, 5]));

    const result = roller.roll(6);

    expect(result).toBeInstanceOf(DiceRoll);
    expect(result.dice).toEqual([1, 2, 3, 4, 5, 6]);
    expect(result.total).toBe(21);
  });

  it('maps upper-boundary unbiased bytes 246..251 to faces 1..6', () => {
    const roller = new RandomDiceRoller(byteSequenceSource([246, 247, 248, 249, 250, 251]));

    const result = roller.roll(6);

    expect(result.dice).toEqual([1, 2, 3, 4, 5, 6]);
    expect(result.total).toBe(21);
  });

  it('discards modulo-biased bytes 252..255 via < 252 rejection sampling', () => {
    const roller = new RandomDiceRoller(byteSequenceSource([252, 253, 254, 255, 0, 5, 251]));

    const result = roller.roll(3);

    expect(result.dice).toEqual([1, 6, 6]);
    expect(result.total).toBe(13);
  });

  it('refills only the remaining needed byte count across chunks when bytes are rejected', () => {
    const chunks: readonly (readonly number[])[] = [
      [252, 4, 255],
      [253, 0],
      [251],
    ];
    const requestedChunkSizes: number[] = [];
    let chunkIndex = 0;
    const source: RandomBytesSource = (buffer) => {
      requestedChunkSizes.push(buffer.length);
      const chunk = chunks[chunkIndex];
      if (chunk === undefined) {
        throw new Error(`Chunk sequence exhausted at index ${chunkIndex}`);
      }
      buffer.set(chunk);
      chunkIndex += 1;
    };

    const result = new RandomDiceRoller(source).roll(3);

    expect(requestedChunkSizes).toEqual([3, 2, 1]);
    expect(result.dice).toEqual([5, 1, 6]);
    expect(result.total).toBe(12);
  });

  it('rolls a valid single die using default crypto.getRandomValues', () => {
    const roller = new RandomDiceRoller();
    expectTypeOf(roller).toMatchTypeOf<DiceRoller>();

    const single = roller.roll(1);

    expect(single).toBeInstanceOf(DiceRoll);
    expect(single.dice).toHaveLength(1);
    expect(single.dice.every(isDieValue)).toBe(true);
    expect(single.total).toBe(single.dice[0]);
  });

  it('rolls valid multi-die pools using default crypto.getRandomValues', () => {
    const roller = new RandomDiceRoller();

    const pool = roller.roll(50);

    expect(pool).toBeInstanceOf(DiceRoll);
    expect(pool.dice).toHaveLength(50);
    expect(Object.isFrozen(pool.dice)).toBe(true);
    expect(pool.dice.every(isDieValue)).toBe(true);
    expect(pool.total).toBe(pool.dice.reduce((sum, die) => sum + die, 0));
  });
});
