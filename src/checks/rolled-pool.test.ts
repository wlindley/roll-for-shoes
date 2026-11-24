import { describe, expect, it } from 'vitest';
import type { DieValue } from '../dice';
import { RolledPool, type CheckModifier } from './index';

describe('RolledPool — Immutability & Defensive Copying', () => {
  it('defensively copies and freezes rawDice and defaults modifiers to a frozen empty array', () => {
    const dice: DieValue[] = [2, 6, 4];
    const pool = new RolledPool(dice);

    dice.push(6);
    dice[0] = 1;

    expect(pool.rawDice).toEqual([2, 6, 4]);
    expect(pool.rawDice).not.toBe(dice);
    expect(Object.isFrozen(pool.rawDice)).toBe(true);
    expect(pool.modifiers).toEqual([]);
    expect(Object.isFrozen(pool.modifiers)).toBe(true);
  });

  it('clones and deep-freezes modifiers so caller mutations have no effect', () => {
    const shoeBonus = { label: 'Clean Shoe', value: 2 };
    const modifiers: CheckModifier[] = [shoeBonus];
    const pool = new RolledPool([3, 4], modifiers);

    modifiers.push({ label: 'Extra', value: 5 });
    shoeBonus.value = 99;

    expect(pool.modifiers).toEqual([{ label: 'Clean Shoe', value: 2 }]);
    expect(Object.isFrozen(pool.modifiers)).toBe(true);
    expect(Object.isFrozen(pool.modifiers[0])).toBe(true);
  });
});

describe('RolledPool — Computed Totals & Six-Counting Getters', () => {
  it('computes rawTotal, zero modifierTotal, and matching finalTotal without modifiers', () => {
    const pool = new RolledPool([2, 5, 6]);

    expect(pool.rawTotal).toBe(13);
    expect(pool.modifierTotal).toBe(0);
    expect(pool.finalTotal).toBe(13);
  });

  it('computes additive modifierTotal and finalTotal across bonuses and penalties', () => {
    const pool = new RolledPool(
      [3, 4],
      [
        { label: 'Chalk Grip', value: 2 },
        { label: 'Raining', value: -5 },
      ],
    );

    expect(pool.rawTotal).toBe(7);
    expect(pool.modifierTotal).toBe(-3);
    expect(pool.finalTotal).toBe(4);
  });

  it('allows finalTotal to drop below zero when penalties exceed rawTotal', () => {
    const pool = new RolledPool([1], [{ label: 'Exhausted', value: -4 }]);

    expect(pool.rawTotal).toBe(1);
    expect(pool.modifierTotal).toBe(-4);
    expect(pool.finalTotal).toBe(-3);
  });

  it('detects a single-die natural 6 with naturalAllSixes true and nonSixCount 0', () => {
    const pool = new RolledPool([6]);

    expect(pool.naturalAllSixes).toBe(true);
    expect(pool.nonSixCount).toBe(0);
  });

  it('detects multi-die natural all-sixes', () => {
    const pool = new RolledPool([6, 6, 6]);

    expect(pool.naturalAllSixes).toBe(true);
    expect(pool.nonSixCount).toBe(0);
  });

  it('counts non-six dice and reports naturalAllSixes false on mixed pools', () => {
    const pool = new RolledPool([6, 2, 6, 5]);

    expect(pool.nonSixCount).toBe(2);
    expect(pool.naturalAllSixes).toBe(false);
  });

  it('treats an empty dice pool as zero total and not naturalAllSixes', () => {
    const pool = new RolledPool([]);

    expect(pool.rawTotal).toBe(0);
    expect(pool.modifierTotal).toBe(0);
    expect(pool.finalTotal).toBe(0);
    expect(pool.nonSixCount).toBe(0);
    expect(pool.naturalAllSixes).toBe(false);
  });
});
