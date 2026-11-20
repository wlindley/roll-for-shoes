import { describe, expect, expectTypeOf, it } from 'vitest';
import { DiceRoll, isDieValue, type DiceRoller, type DieValue } from './index';

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
