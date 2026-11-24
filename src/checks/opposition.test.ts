import { describe, expect, it } from 'vitest';
import { StubDiceRoller, type DieValue } from '../dice';
import {
  DifficultyOpposition,
  DifficultyTier,
  RolledOpposition,
  StaticOpposition,
  type CheckModifier,
  type CheckOpposition,
} from './index';

describe('StaticOpposition', () => {
  it('resolves fixed target and optional label without consuming dice', () => {
    const roller = new StubDiceRoller([4]);
    const opp = new StaticOpposition(6, 'Guard') satisfies CheckOpposition;
    const result = opp.resolve(roller);

    expect(opp.target).toBe(6);
    expect(opp.label).toBe('Guard');
    expect(result).toEqual({ kind: 'static', total: 6, label: 'Guard' });
    expect(Object.isFrozen(result)).toBe(true);
    expect(roller.remaining).toBe(1);
  });

  it('leaves label undefined when omitted', () => {
    const result = new StaticOpposition(9).resolve(new StubDiceRoller([]));

    expect(result.total).toBe(9);
    expect(result.label).toBeUndefined();
  });
});

describe('RolledOpposition', () => {
  it('rolls diceCount from the roller and exposes pool getters and label', () => {
    const roller = new StubDiceRoller([6, 2, 6, 5]);
    const opp = RolledOpposition.withDice(4, { label: 'Rival' });
    const result = opp.resolve(roller);

    expect(opp.diceCount).toBe(4);
    expect(result.total).toBe(19);
    expect(result.label).toBe('Rival');
    expect(result.pool.rawDice).toEqual([6, 2, 6, 5]);
    expect(result.pool.nonSixCount).toBe(2);
    expect(result.pool.naturalAllSixes).toBe(false);
    expect(roller.remaining).toBe(0);
  });

  it('defensively freezes constructor modifiers and chains withModifier immutably', () => {
    const mods: CheckModifier[] = [{ label: 'Alert', value: 1 }];
    const base = RolledOpposition.withDice(1, { label: 'Sentry', modifiers: mods });
    mods.push({ label: 'Mutated', value: 99 });

    const chained = base.withModifier('Dazed', -3);

    expect(chained).not.toBe(base);
    expect(Object.isFrozen(base)).toBe(true);
    expect(Object.isFrozen(base.modifiers)).toBe(true);
    expect(base.modifiers).toEqual([{ label: 'Alert', value: 1 }]);
    expect(chained.label).toBe('Sentry');
    expect(chained.modifiers).toEqual([
      { label: 'Alert', value: 1 },
      { label: 'Dazed', value: -3 },
    ]);
    expect(chained.resolve(new StubDiceRoller([5])).total).toBe(3);
  });

  it('resolves predetermined dice via RolledOpposition.fromDice without rolling', () => {
    const roller = new StubDiceRoller([1]);
    const fromFactory = RolledOpposition.fromDice([4, 5], { label: 'Boss' }).withModifier('Shield', 1);
    const result = fromFactory.resolve(roller);

    expect(fromFactory.diceCount).toBe(2);
    expect(fromFactory.diceValues).toEqual([4, 5]);
    expect(result.pool?.rawDice).toEqual([4, 5]);
    expect(result.total).toBe(10);
    expect(roller.remaining).toBe(1);
  });

  it('returns a distinct instance from withDiceValues while leaving the original rolled', () => {
    const base = RolledOpposition.withDice(2);
    const manual = base.withDiceValues([6, 6]);

    expect(manual).not.toBe(base);
    expect(base.diceValues).toBeUndefined();
    expect(manual.diceValues).toEqual([6, 6]);
    expect(manual.resolve(new StubDiceRoller([])).pool.naturalAllSixes).toBe(true);
  });

  it.each([0, -1, 2.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid diceCount %s with RangeError',
    (badCount) => {
      expect(() => RolledOpposition.withDice(badCount)).toThrow(RangeError);
    },
  );

  it('rejects empty, mismatched-length, or invalid-face predetermined dice', () => {
    expect(() => RolledOpposition.fromDice([])).toThrow(RangeError);
    expect(() => RolledOpposition.withDice(2).withDiceValues([4])).toThrow(RangeError);
    expect(() => RolledOpposition.withDice(1).withDiceValues([0 as DieValue])).toThrow(RangeError);
    expect(() => RolledOpposition.withDice(1).withDiceValues([7 as DieValue])).toThrow(RangeError);
  });
});

describe('DifficultyTier & DifficultyOpposition', () => {
  it('defines DifficultyTier enum values 1 through 4', () => {
    expect(DifficultyTier.Easy).toBe(1);
    expect(DifficultyTier.Moderate).toBe(2);
    expect(DifficultyTier.Hard).toBe(3);
    expect(DifficultyTier.VeryHard).toBe(4);
  });

  it.each([
    [DifficultyTier.Easy, 3],
    [DifficultyTier.Moderate, 6],
    [DifficultyTier.Hard, 9],
    [DifficultyTier.VeryHard, 12],
  ])('resolves static tier %i to target %i without rolling dice', (tier, expectedTotal) => {
    const opp = DifficultyOpposition.static(tier);
    const result = opp.resolve(new StubDiceRoller([]));

    expect(opp.mode).toBe('static');
    expect(result.kind).toBe('static');
    expect(result.total).toBe(expectedTotal);
    expect(result.label).toBeUndefined();
  });

  it('applies modifiers and label immutably in static mode', () => {
    const base = DifficultyOpposition.static(DifficultyTier.Hard, {
      label: 'Wet Wall',
      modifiers: [{ label: 'Slick', value: 2 }],
    });
    const next = base.withModifier('Chalk', -1);

    expect(next).not.toBe(base);
    expect(base.modifiers).toEqual([{ label: 'Slick', value: 2 }]);
    expect(next.resolve(new StubDiceRoller([]))).toEqual({ kind: 'static', total: 10, label: 'Wet Wall' });
  });

  it.each([
    [DifficultyTier.Easy, [3], 3],
    [DifficultyTier.Moderate, [2, 5], 7],
    [DifficultyTier.Hard, [2, 2, 3], 7],
    [DifficultyTier.VeryHard, [1, 2, 3, 6], 12],
  ] as const)('rolls %id6 in dynamic mode', (tier, dice, expectedRaw) => {
    const roller = new StubDiceRoller(dice);
    const opp = DifficultyOpposition.dynamic(tier, { label: 'Climb' }).withModifier('Wind', 1);
    const result = opp.resolve(roller);

    expect(result.pool.rawDice).toEqual(dice);
    expect(result.total).toBe(expectedRaw + 1);
    expect(result.label).toBe('Climb');
    expect(roller.remaining).toBe(0);
  });

  it('supports withDiceValues in dynamic mode, omits it on static mode at compile time, and rejects wrong count', () => {
    const baseDyn = DifficultyOpposition.dynamic(DifficultyTier.Moderate, { label: 'Chasm' });
    const manualDyn = baseDyn.withDiceValues([6, 2]).withModifier('Windy', 1);
    const staticOpp = DifficultyOpposition.static(DifficultyTier.Easy);
    // @ts-expect-error StaticDifficultyOpposition does not expose withDiceValues
    expect(staticOpp.withDiceValues).toBeUndefined();

    expect(baseDyn.diceValues).toBeUndefined();
    expect(manualDyn.resolve(new StubDiceRoller([])).total).toBe(9);
    expect(() => DifficultyOpposition.dynamic(DifficultyTier.Hard).withDiceValues([5, 5])).toThrow(RangeError);
  });
});
