import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  DiceRoll,
  isDieValue,
  StubDiceRoller,
  type DiceRoller,
  type DieValue,
} from './index';

describe('isDieValue', () => {
  it.each<DieValue>([1, 2, 3, 4, 5, 6])('accepts valid d6 face %i', (face) => {
    expect(isDieValue(face)).toBe(true);
  });

  it.each<unknown>([
    0,
    7,
    -1,
    3.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    '6',
    null,
    undefined,
  ])('rejects invalid value %o', (value) => {
    expect(isDieValue(value)).toBe(false);
  });
});

describe('DiceRoll', () => {
  it('defensively copies input dice so caller mutations do not affect roll.dice', () => {
    const input: DieValue[] = [2, 6, 4];
    const roll = new DiceRoll(input);

    input.push(6);
    input[0] = 1;

    expect(roll.dice).not.toBe(input);
    expect(roll.dice).toEqual([2, 6, 4]);
  });

  it('freezes roll.dice against runtime mutation', () => {
    const roll = new DiceRoll([3, 5]);

    expect(Object.isFrozen(roll.dice)).toBe(true);
    expect(() => {
      (roll.dice as DieValue[]).push(1);
    }).toThrow(TypeError);
  });

  it('computes total dynamically as the sum of dice', () => {
    const roll = new DiceRoll([2, 6, 4]);

    expect(roll.total).toBe(12);
  });

  it('returns total 0 for an empty DiceRoll', () => {
    const empty = new DiceRoll([]);

    expect(empty.total).toBe(0);
  });
});

describe('StubDiceRoller', () => {
  it('starts with 0 remaining dice when constructed with no arguments', () => {
    const roller = new StubDiceRoller();

    expect(roller.remaining).toBe(0);
    expectTypeOf(roller).toMatchTypeOf<DiceRoller>();
    expectTypeOf<DiceRoller['roll']>().toEqualTypeOf<(count: number) => DiceRoll>();
  });

  it('copies initial dice defensively on construction', () => {
    const initial: DieValue[] = [2, 5];
    const roller = new StubDiceRoller(initial);

    initial.push(6);
    initial[0] = 1;

    expect(roller.remaining).toBe(2);
    expect(roller.roll(2).dice).toEqual([2, 5]);
  });

  it('consumes queued dice in FIFO order across single and multi-die rolls', () => {
    const roller = new StubDiceRoller([2, 6, 4, 1]);

    const first = roller.roll(1);
    expect(first).toBeInstanceOf(DiceRoll);
    expect(first.dice).toEqual([2]);
    expect(first.total).toBe(2);
    expect(roller.remaining).toBe(3);

    const second = roller.roll(3);
    expect(second.dice).toEqual([6, 4, 1]);
    expect(second.total).toBe(11);
    expect(roller.remaining).toBe(0);
  });

  it('appends dice to the tail of the queue fluently via enqueue()', () => {
    const roller = new StubDiceRoller([1]);

    const returned = roller.enqueue(6, 2);

    expect(returned).toBe(roller);
    expect(roller.remaining).toBe(3);
    expect(roller.roll(3).dice).toEqual([1, 6, 2]);
  });

  it.each([0, 7, -1, 2.5, Number.NaN])(
    'rejects invalid face %s in constructor with RangeError',
    (badFace) => {
      expect(() => new StubDiceRoller([badFace as DieValue])).toThrow(RangeError);
    },
  );

  it.each([0, 7, -1, 2.5, Number.NaN])(
    'rejects invalid face %s in enqueue() atomically without mutating queue',
    (badFace) => {
      const roller = new StubDiceRoller([3]);

      expect(() => roller.enqueue(4, badFace as DieValue)).toThrow(RangeError);
      expect(roller.remaining).toBe(1);
      expect(roller.roll(1).dice).toEqual([3]);
    },
  );

  it.each([0, -2, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid roll count %s with RangeError without consuming dice',
    (badCount) => {
      const roller = new StubDiceRoller([3, 5]);

      expect(() => roller.roll(badCount)).toThrow(RangeError);
      expect(roller.remaining).toBe(2);
    },
  );

  it('throws an exhausted Error atomically without consuming remaining dice', () => {
    const roller = new StubDiceRoller([4]);

    expect(() => roller.roll(2)).toThrow(/exhausted/i);
    expect(roller.remaining).toBe(1);
    expect(roller.roll(1).dice).toEqual([4]);
  });
});
