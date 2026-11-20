import { describe, expect, expectTypeOf, it } from 'vitest';
import { DiceRoll, isDieValue, StubDiceRoller, type DiceRoller, type DieValue } from './index';

describe('dice module — DieValue & DiceRoll', () => {
  it('DICE-01: isDieValue accepts integers 1..6', () => {
    const validFaces: readonly DieValue[] = [1, 2, 3, 4, 5, 6];
    for (const face of validFaces) {
      expect(isDieValue(face)).toBe(true);
    }
  });

  it('DICE-02: isDieValue rejects out-of-range, non-integer, and non-number values', () => {
    const invalidValues: readonly unknown[] = [
      0, 7, -1, 3.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, '6', null, undefined,
    ];
    for (const value of invalidValues) {
      expect(isDieValue(value)).toBe(false);
    }
  });

  it('DICE-03: DiceRoll defensively copies/freezes dice and computes total dynamically', () => {
    const input: DieValue[] = [2, 6, 4];
    const roll = new DiceRoll(input);

    input.push(6);
    input[0] = 1;

    expect(roll.dice).toEqual([2, 6, 4]);
    expect(roll.dice).not.toBe(input);
    expect(Object.isFrozen(roll.dice)).toBe(true);
    expect(roll.total).toBe(12);
    expect(new DiceRoll([]).total).toBe(0);
    expectTypeOf<DiceRoller['roll']>().toEqualTypeOf<(count: number) => DiceRoll>();
  });
});

describe('dice module — StubDiceRoller', () => {
  it('DICE-04: StubDiceRoller.roll(1) and roll(n) consume values in FIFO order', () => {
    expect(new StubDiceRoller().remaining).toBe(0);

    const initial: DieValue[] = [2, 6, 4, 1];
    const roller = new StubDiceRoller(initial);
    initial.push(5);
    expect(roller.remaining).toBe(4);

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

  it('DICE-05: StubDiceRoller.enqueue() appends fluently and returns this', () => {
    const roller = new StubDiceRoller([1]);
    const returned = roller.enqueue(6, 2);

    expect(returned).toBe(roller);
    expect(roller.remaining).toBe(3);

    const result = returned.roll(3);
    expect(result.dice).toEqual([1, 6, 2]);
    expect(result.total).toBe(9);
  });

  it('DICE-06: StubDiceRoller throws exhausted error without consuming remaining dice', () => {
    const roller = new StubDiceRoller([4]);
    expect(() => roller.roll(2)).toThrow(/exhausted/i);
    expect(roller.remaining).toBe(1);
  });

  it('DICE-07: StubDiceRoller rejects invalid DieValue in constructor and enqueue', () => {
    const invalidFaces = [0, 7, 2.5, Number.NaN] as unknown as DieValue[];
    for (const bad of invalidFaces) {
      expect(() => new StubDiceRoller([bad])).toThrow(RangeError);

      const roller = new StubDiceRoller([3]);
      expect(() => roller.enqueue(4, bad)).toThrow(RangeError);
      expect(roller.remaining).toBe(1);
    }
  });

  it('DICE-08: StubDiceRoller.roll() rejects zero, negative, decimal, and NaN counts without consuming dice', () => {
    const roller = new StubDiceRoller([3, 5]);
    expect(() => roller.roll(0)).toThrow(RangeError);
    expect(() => roller.roll(-2)).toThrow(RangeError);
    expect(() => roller.roll(1.5)).toThrow(RangeError);
    expect(() => roller.roll(Number.NaN)).toThrow(RangeError);
    expect(() => roller.roll(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(roller.remaining).toBe(2);
  });
});
