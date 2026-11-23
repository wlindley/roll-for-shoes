import { describe, expect, it } from 'vitest';
import { StubDiceRoller, type DieValue } from '../dice';
import {
  Check, CheckResult, DifficultyOpposition, DifficultyTier, ReadyCheck, RolledOpposition, RolledPool, StaticOpposition,
  type CheckModifier, type CheckOpposition, type CheckOutcome, type OppositionResult, type TiesMode,
} from './index';

describe('checks module — StaticOpposition, RolledPool & Check', () => {
  it('CHK-BASIC-01: resolves static target success (actor > target) with single opposition.total', () => {
    const roller = new StubDiceRoller([4, 5]);
    const opp = new StaticOpposition(6, 'Guard');
    expect([opp.target, opp.label]).toEqual([6, 'Guard']);
    const ready: ReadyCheck = Check.withDice(2).against(opp satisfies CheckOpposition);
    const result: CheckResult = ready.resolve(roller);

    expect(result.outcome satisfies CheckOutcome).toBe('success');
    expect([result.actor.rawDice, result.actor.rawTotal, result.actor.modifierTotal, result.actor.finalTotal])
      .toEqual([[4, 5], 9, 0, 9]);
    const oppResult: OppositionResult = result.opposition;
    expect([oppResult.total, oppResult.label, oppResult.pool, result.margin, roller.remaining])
      .toEqual([6, 'Guard', undefined, 3, 0]);
  });

  it('CHK-BASIC-02: resolves static target failure (actor < target)', () => {
    const result = Check.withDice(2).against(new StaticOpposition(6)).resolve(new StubDiceRoller([2, 3]));
    expect([result.outcome, result.margin, result.opposition.label]).toEqual(['failure', -1, undefined]);
  });

  it('CHK-BASIC-03: static target tie fails under Basic Rules default tiesMode', () => {
    const result = Check.withDice(2).against(new StaticOpposition(6)).resolve(new StubDiceRoller([2, 4]));
    expect([result.tiesMode satisfies TiesMode, result.margin, result.outcome]).toEqual(['fail', 0, 'failure']);
    expect(new CheckResult(new RolledPool([3]), { total: 3 }, 'twist').outcome).toBe('tie');
  });

  it('CHK-BASIC-04: detects single-die natural 6 on actor pool', () => {
    const result = Check.withDice(1).against(new StaticOpposition(3)).resolve(new StubDiceRoller([6]));
    expect([result.actor.naturalAllSixes, result.actor.nonSixCount]).toEqual([true, 0]);
  });

  it('CHK-BASIC-05: detects multi-die natural all-6s even when check fails', () => {
    const result = Check.withDice(2).against(new StaticOpposition(15)).resolve(new StubDiceRoller([6, 6]));
    expect([result.outcome, result.actor.naturalAllSixes, result.actor.nonSixCount]).toEqual(['failure', true, 0]);
  });

  it('CHK-BASIC-06: computes mixed-pool nonSixCount and enforces RolledPool invariants', () => {
    const result = Check.withDice(4).against(new StaticOpposition(10)).resolve(new StubDiceRoller([6, 2, 6, 5]));
    expect([result.actor.naturalAllSixes, result.actor.nonSixCount]).toEqual([false, 2]);

    const dice: DieValue[] = [2, 3];
    const mods: CheckModifier[] = [{ label: 'Bonus', value: 1 }];
    const pool = new RolledPool(dice, mods);
    dice.push(6);
    mods.push({ label: 'Extra', value: 5 });
    expect([Object.isFrozen(pool.rawDice), Object.isFrozen(pool.modifiers)]).toEqual([true, true]);
    expect([pool.rawDice, pool.modifierTotal, pool.finalTotal]).toEqual([[2, 3], 1, 6]);
    expect(new RolledPool([]).naturalAllSixes).toBe(false);
  });

  it('CHK-BASIC-07: Check.withDice() rejects 0', () => {
    expect(() => Check.withDice(0)).toThrow(RangeError);
  });

  it('CHK-BASIC-08: Check.withDice() rejects negative integers', () => {
    expect(() => Check.withDice(-2)).toThrow(RangeError);
  });

  it('CHK-BASIC-09: Check.withDice() rejects non-integers (decimal, NaN, Infinity)', () => {
    expect(() => Check.withDice(1.5)).toThrow(RangeError);
    expect(() => Check.withDice(Number.NaN)).toThrow(RangeError);
    expect(() => Check.withDice(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe('checks module — RolledOpposition', () => {
  it('CHK-BASIC-10: resolves opposed roll success in deterministic order (actor first, opponent second)', () => {
    const roller = new StubDiceRoller([5, 6, 2, 3]);
    const opp = new RolledOpposition(2, { label: 'Rival' });
    expect([opp.diceCount, opp.label, opp.modifiers]).toEqual([2, 'Rival', []]);

    const result = Check.withDice(2).against(opp).resolve(roller);
    expect([result.actor.rawDice, result.actor.finalTotal]).toEqual([[5, 6], 11]);
    expect([result.opposition.pool?.rawDice, result.opposition.total, result.opposition.label])
      .toEqual([[2, 3], 5, 'Rival']);
    expect([result.outcome, result.margin, roller.remaining]).toEqual(['success', 6, 0]);
  });

  it('CHK-BASIC-11: resolves opposed roll failure (actor < opponent)', () => {
    const result = Check.withDice(2).against(new RolledOpposition(2)).resolve(new StubDiceRoller([1, 2, 4, 5]));
    expect([result.actor.finalTotal, result.opposition.total, result.outcome, result.margin, result.opposition.label])
      .toEqual([3, 9, 'failure', -6, undefined]);
  });

  it('CHK-BASIC-12: opposed roll tie fails under Basic Rules default tiesMode', () => {
    const result = Check.withDice(2).against(new RolledOpposition(2)).resolve(new StubDiceRoller([3, 4, 2, 5]));
    expect([result.actor.finalTotal, result.opposition.total, result.outcome, result.margin])
      .toEqual([7, 7, 'failure', 0]);
  });

  it('CHK-BASIC-13: detects opponent single-die natural 6', () => {
    const result = Check.withDice(1).against(new RolledOpposition(1)).resolve(new StubDiceRoller([3, 6]));
    expect([result.opposition.pool?.naturalAllSixes, result.opposition.pool?.nonSixCount]).toEqual([true, 0]);
  });

  it('CHK-BASIC-14: detects opponent multi-die natural all-6s even when opponent loses', () => {
    const result = Check.withDice(3).against(new RolledOpposition(2)).resolve(new StubDiceRoller([5, 5, 5, 6, 6]));
    expect([result.actor.finalTotal, result.opposition.total, result.outcome]).toEqual([15, 12, 'success']);
    expect([result.opposition.pool?.naturalAllSixes, result.opposition.pool?.nonSixCount]).toEqual([true, 0]);
  });

  it('CHK-BASIC-15: computes opponent mixed-pool nonSixCount and freezes/forwards options.modifiers', () => {
    const result = Check.withDice(1).against(new RolledOpposition(4)).resolve(new StubDiceRoller([4, 6, 2, 6, 5]));
    expect([result.opposition.pool?.naturalAllSixes, result.opposition.pool?.nonSixCount]).toEqual([false, 2]);

    const mods: CheckModifier[] = [{ label: 'Guard', value: 1 }];
    const modOpp = new RolledOpposition(1, { modifiers: mods });
    mods.push({ label: 'Extra', value: 5 });
    expect([Object.isFrozen(modOpp.modifiers), modOpp.modifiers]).toEqual([true, [{ label: 'Guard', value: 1 }]]);
    const modResult = Check.withDice(1).against(modOpp).resolve(new StubDiceRoller([4, 4]));
    expect([modResult.opposition.pool?.modifierTotal, modResult.opposition.total, modResult.outcome])
      .toEqual([1, 5, 'failure']);
  });

  it('CHK-BASIC-16: RolledOpposition rejects diceCount === 0', () => {
    expect(() => new RolledOpposition(0)).toThrow(RangeError);
  });

  it('CHK-BASIC-17: RolledOpposition rejects negative diceCount', () => {
    expect(() => new RolledOpposition(-1)).toThrow(RangeError);
  });

  it('CHK-BASIC-18: RolledOpposition rejects non-integer diceCount (decimal, NaN, Infinity)', () => {
    expect(() => new RolledOpposition(2.5)).toThrow(RangeError);
    expect(() => new RolledOpposition(Number.NaN)).toThrow(RangeError);
    expect(() => new RolledOpposition(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe('checks module — DifficultyTier, DifficultyOpposition & Ties', () => {
  it('CHK-DIFF-01: DifficultyTier integer values equal 1, 2, 3, 4', () => {
    expect([DifficultyTier.Easy, DifficultyTier.Moderate, DifficultyTier.Hard, DifficultyTier.VeryHard]).toEqual([1, 2, 3, 4]);
  });

  it('CHK-DIFF-02: resolves DifficultyOpposition static mode (tier * 3 default, modifiers, 0 dice)', () => {
    const defaultEasy = new DifficultyOpposition(DifficultyTier.Easy);
    expect([defaultEasy.tier, defaultEasy.mode, defaultEasy.modifiers, defaultEasy.label])
      .toEqual([DifficultyTier.Easy, 'static', [], undefined]);
    const tiers = [DifficultyTier.Easy, DifficultyTier.Moderate, DifficultyTier.Hard, DifficultyTier.VeryHard];
    const roller = new StubDiceRoller([4, 4, 4, 4]);
    const results = tiers.map((t) => Check.withDice(1).against(new DifficultyOpposition(t) satisfies CheckOpposition).resolve(roller));
    expect([results.map((r) => r.opposition.total), results.map((r) => r.outcome), roller.remaining])
      .toEqual([[3, 6, 9, 12], ['success', 'failure', 'failure', 'failure'], 0]);
    expect(results.every((r) => r.opposition.pool === undefined && r.opposition.label === undefined)).toBe(true);

    const mods: CheckModifier[] = [{ label: 'Slick', value: 2 }, { label: 'Chalk', value: -1 }];
    const modOpp = new DifficultyOpposition(DifficultyTier.Hard, 'static', { modifiers: mods, label: 'Wet Wall' });
    mods.push({ label: 'Extra', value: 5 });
    expect([modOpp.tier, modOpp.mode, modOpp.label, Object.isFrozen(modOpp.modifiers), modOpp.modifiers])
      .toEqual([DifficultyTier.Hard, 'static', 'Wet Wall', true, [{ label: 'Slick', value: 2 }, { label: 'Chalk', value: -1 }]]);
    const modRoller = new StubDiceRoller([5]);
    const modRes = Check.withDice(1).against(modOpp).resolve(modRoller);
    expect([modRes.opposition.total, modRes.opposition.pool, modRes.opposition.label, modRoller.remaining])
      .toEqual([10, undefined, 'Wet Wall', 0]);
  });

  it('CHK-DIFF-03: resolves DifficultyOpposition dynamic mode rolling 1d6..4d6', () => {
    const hard = new DifficultyOpposition(DifficultyTier.Hard, 'dynamic', { label: 'Climb' });
    expect([hard.tier, hard.mode, hard.label, hard.modifiers]).toEqual([DifficultyTier.Hard, 'dynamic', 'Climb', []]);
    const hardRoller = new StubDiceRoller([5, 2, 2, 3]);
    const hardRes = Check.withDice(1).against(hard).resolve(hardRoller);
    expect([hardRes.opposition.pool?.rawDice, hardRes.opposition.total, hardRes.opposition.label, hardRes.outcome, hardRes.margin, hardRoller.remaining])
      .toEqual([[2, 2, 3], 7, 'Climb', 'failure', -2, 0]);

    const easyRes = Check.withDice(1).against(new DifficultyOpposition(DifficultyTier.Easy, 'dynamic')).resolve(new StubDiceRoller([4, 3]));
    const modRes = Check.withDice(1).against(new DifficultyOpposition(DifficultyTier.Moderate, 'dynamic', { modifiers: [{ label: 'Wind', value: 1 }] })).resolve(new StubDiceRoller([4, 2, 5]));
    const veryHardRes = Check.withDice(1).against(new DifficultyOpposition(DifficultyTier.VeryHard, 'dynamic')).resolve(new StubDiceRoller([4, 1, 2, 3, 6]));
    expect([easyRes.opposition.pool?.rawDice, easyRes.opposition.total, easyRes.outcome]).toEqual([[3], 3, 'success']);
    expect([modRes.opposition.pool?.rawDice, modRes.opposition.total, modRes.outcome]).toEqual([[2, 5], 8, 'failure']);
    expect([veryHardRes.opposition.pool?.rawDice, veryHardRes.opposition.total]).toEqual([[1, 2, 3, 6], 12]);
  });

  it('CHK-TIE-01: resolves static tie with withTiesMode("twist") before and after against() immutably', () => {
    const baseCheck = Check.withDice(2);
    const twistCheck = baseCheck.withTiesMode('twist');
    expect(twistCheck).not.toBe(baseCheck);
    const beforeRes = twistCheck.against(new StaticOpposition(7)).resolve(new StubDiceRoller([3, 4]));
    const baseCheckRes = baseCheck.against(new StaticOpposition(7)).resolve(new StubDiceRoller([3, 4]));
    expect([beforeRes.outcome, beforeRes.margin, beforeRes.tiesMode, baseCheckRes.outcome, baseCheckRes.tiesMode])
      .toEqual(['tie', 0, 'twist', 'failure', 'fail']);

    const baseReady = baseCheck.against(new StaticOpposition(7));
    const twistReady = baseReady.withTiesMode('twist');
    expect(twistReady).not.toBe(baseReady);
    const afterRes = twistReady.resolve(new StubDiceRoller([3, 4]));
    const baseReadyRes = baseReady.resolve(new StubDiceRoller([3, 4]));
    expect([afterRes.outcome, afterRes.margin, afterRes.tiesMode, baseReadyRes.outcome, baseReadyRes.tiesMode])
      .toEqual(['tie', 0, 'twist', 'failure', 'fail']);
  });

  it('CHK-TIE-02: resolves dynamic difficulty tie with "twist" (Bob climbs wall: 7 vs 7)', () => {
    const roller = new StubDiceRoller([3, 4, 2, 2, 3]);
    const result = Check.withDice(2).against(new DifficultyOpposition(DifficultyTier.Hard, 'dynamic')).withTiesMode('twist').resolve(roller);
    expect([result.actor.finalTotal, result.opposition.total, result.outcome, result.margin, result.tiesMode, roller.remaining])
      .toEqual([7, 7, 'tie', 0, 'twist', 0]);
  });

  it('CHK-TIE-03: leaves strict win/loss unaffected under "twist" and supports switching back to "fail"', () => {
    const twistCheck = Check.withDice(1).withTiesMode('twist');
    const twistReady = twistCheck.against(new StaticOpposition(3));
    const win = twistReady.resolve(new StubDiceRoller([5]));
    const loss = twistReady.resolve(new StubDiceRoller([2]));
    expect([win.outcome, win.margin, win.tiesMode, loss.outcome, loss.margin, loss.tiesMode])
      .toEqual(['success', 2, 'twist', 'failure', -1, 'twist']);

    const failCheck = twistCheck.withTiesMode('fail');
    const failReady = twistReady.withTiesMode('fail');
    expect(failCheck).not.toBe(twistCheck);
    expect(failReady).not.toBe(twistReady);
    expect([
      failCheck.against(new StaticOpposition(3)).resolve(new StubDiceRoller([3])).outcome,
      failReady.resolve(new StubDiceRoller([3])).outcome,
      twistReady.resolve(new StubDiceRoller([3])).outcome,
    ]).toEqual(['failure', 'failure', 'tie']);
  });
});

describe('checks module — Symmetric Actor & Opponent Status Modifiers', () => {
  it('CHK-STS-01: applies actor negative penalty (-4 Raining) immutably on Check and ReadyCheck', () => {
    const baseCheck = Check.withDice(3);
    const modCheck = baseCheck.withModifier('Raining', -4);
    expect(modCheck).not.toBe(baseCheck);
    const res = modCheck.against(new StaticOpposition(9)).resolve(new StubDiceRoller([3, 5, 6]));
    const origRes = baseCheck.against(new StaticOpposition(9)).resolve(new StubDiceRoller([3, 5, 6]));
    expect([res.actor.rawTotal, res.actor.modifierTotal, res.actor.finalTotal, res.actor.modifiers, res.outcome, res.margin, res.actor.nonSixCount, origRes.actor.modifierTotal, origRes.actor.finalTotal])
      .toEqual([14, -4, 10, [{ label: 'Raining', value: -4 }], 'success', 1, 2, 0, 14]);

    const baseReady = baseCheck.against(new StaticOpposition(9));
    const modReady = baseReady.withModifier('Raining', -4);
    expect(modReady).not.toBe(baseReady);
    expect([modReady.resolve(new StubDiceRoller([3, 5, 6])).actor.finalTotal, baseReady.resolve(new StubDiceRoller([3, 5, 6])).actor.finalTotal])
      .toEqual([10, 14]);
  });

  it('CHK-STS-02: actor positive bonus (+2 Clean Shoe) turns failing raw roll into success', () => {
    const res = Check.withDice(2).withModifier('Clean Shoe', 2).against(new StaticOpposition(6)).resolve(new StubDiceRoller([2, 3]));
    expect([res.actor.rawTotal, res.actor.modifierTotal, res.actor.finalTotal, res.margin, res.outcome])
      .toEqual([5, 2, 7, 1, 'success']);
  });

  it('CHK-STS-03: actor natural all-6s remains true despite negative penalty causing failure', () => {
    const res = Check.withDice(2).withModifier('Broken Nose', -3).against(new StaticOpposition(10)).resolve(new StubDiceRoller([6, 6]));
    expect([res.actor.rawTotal, res.actor.finalTotal, res.outcome, res.actor.naturalAllSixes, res.actor.nonSixCount])
      .toEqual([12, 9, 'failure', true, 0]);
  });

  it('CHK-STS-04: actor positive bonus does NOT manufacture fake 6s on rawDice', () => {
    const res = Check.withDice(2).withModifier('Inspired', 4).against(new StaticOpposition(10)).resolve(new StubDiceRoller([4, 4]));
    expect([res.actor.rawTotal, res.actor.finalTotal, res.outcome, res.actor.naturalAllSixes, res.actor.nonSixCount])
      .toEqual([8, 12, 'success', false, 2]);
  });

  it('CHK-STS-05: combines multiple actor modifiers additively (including negative finalTotal) and preserves tiesMode', () => {
    const mods: CheckModifier[] = [{ label: 'Rain', value: -4 }, { label: 'Grip', value: 1 }];
    const baseCheck = Check.withDice(1);
    const modCheck = baseCheck.withModifiers(mods);
    mods.push({ label: 'Mutated', value: 99 });
    expect(modCheck).not.toBe(baseCheck);
    const res = modCheck.against(new StaticOpposition(1)).resolve(new StubDiceRoller([1]));
    const origRes = baseCheck.against(new StaticOpposition(1)).resolve(new StubDiceRoller([1]));
    expect([res.actor.modifierTotal, res.actor.finalTotal, res.margin, res.outcome, origRes.actor.modifierTotal])
      .toEqual([-3, -2, -3, 'failure', 0]);

    const baseReady = Check.withDice(1).withTiesMode('twist').withModifier('Base', 1).against(new StaticOpposition(5));
    const readyMods: CheckModifier[] = [{ label: 'Boost', value: 2 }];
    const chainedReady = baseReady.withModifiers(readyMods).withModifier('Cap', -1);
    readyMods.push({ label: 'Mutated', value: 50 });
    expect(chainedReady).not.toBe(baseReady);
    const [chainedRes, baseReadyRes, toggledFailRes, revOrderRes] = [
      chainedReady.resolve(new StubDiceRoller([3])), baseReady.resolve(new StubDiceRoller([3])),
      chainedReady.withTiesMode('fail').resolve(new StubDiceRoller([3])),
      Check.withDice(1).withModifier('Base', 2).withTiesMode('twist').against(new StaticOpposition(5)).resolve(new StubDiceRoller([3])),
    ];
    expect([chainedRes.actor.modifierTotal, chainedRes.actor.finalTotal, chainedRes.outcome, baseReadyRes.actor.finalTotal, baseReadyRes.outcome, toggledFailRes.actor.finalTotal, toggledFailRes.outcome, revOrderRes.outcome])
      .toEqual([2, 5, 'tie', 4, 'failure', 5, 'failure', 'tie']);
  });

  it('CHK-STS-06: opponent negative penalty reduces opposition.total immutably on RolledOpposition', () => {
    const baseOpp = new RolledOpposition(1, { label: 'Sentry', modifiers: [{ label: 'Alert', value: 1 }] });
    const chainedOpp = baseOpp.withModifier('Dazed', -2);
    expect(chainedOpp).not.toBe(baseOpp);
    expect([baseOpp.modifiers, chainedOpp.diceCount, chainedOpp.label, chainedOpp.modifiers])
      .toEqual([[{ label: 'Alert', value: 1 }], 1, 'Sentry', [{ label: 'Alert', value: 1 }, { label: 'Dazed', value: -2 }]]);

    const res = Check.withDice(1).against(new RolledOpposition(1).withModifier('Blinded', -3)).resolve(new StubDiceRoller([3, 5]));
    expect([res.opposition.pool?.rawTotal, res.opposition.pool?.modifierTotal, res.opposition.total, res.outcome, res.margin])
      .toEqual([5, -3, 2, 'success', 1]);
  });

  it('CHK-STS-07: opponent positive bonus increases opposition.total (turning actor win into failure)', () => {
    const res = Check.withDice(1).against(new RolledOpposition(1).withModifier('Armored', 2)).resolve(new StubDiceRoller([5, 4]));
    expect([res.opposition.pool?.rawTotal, res.opposition.total, res.outcome, res.margin]).toEqual([4, 6, 'failure', -1]);
  });

  it('CHK-STS-08: opponent natural all-6s remains true despite negative opponent penalty causing loss', () => {
    const res = Check.withDice(1).against(new RolledOpposition(2).withModifier('Dazed', -8)).resolve(new StubDiceRoller([5, 6, 6]));
    expect([res.opposition.total, res.outcome, res.opposition.pool?.naturalAllSixes, res.opposition.pool?.nonSixCount])
      .toEqual([4, 'success', true, 0]);
  });

  it('CHK-STS-09: opponent positive bonus does NOT manufacture fake 6s on opponent rawDice', () => {
    const res = Check.withDice(1).against(new RolledOpposition(2).withModifier('Boost', 4)).resolve(new StubDiceRoller([3, 4, 4]));
    expect([res.opposition.total, res.outcome, res.opposition.pool?.naturalAllSixes, res.opposition.pool?.nonSixCount])
      .toEqual([12, 'failure', false, 2]);
  });

  it('CHK-STS-10: combines multiple opponent modifiers additively (negative total & DifficultyOpposition.withModifier)', () => {
    const baseDyn = new DifficultyOpposition(DifficultyTier.Easy, 'dynamic', { label: 'Lock', modifiers: [{ label: 'Rusty', value: -5 }] });
    const dynOpp = baseDyn.withModifier('Oil', 1);
    expect(dynOpp).not.toBe(baseDyn);
    expect([baseDyn.modifiers, dynOpp.tier, dynOpp.mode, dynOpp.label, dynOpp.modifiers])
      .toEqual([[{ label: 'Rusty', value: -5 }], DifficultyTier.Easy, 'dynamic', 'Lock', [{ label: 'Rusty', value: -5 }, { label: 'Oil', value: 1 }]]);
    const dynRes = Check.withDice(1).against(dynOpp).resolve(new StubDiceRoller([1, 2]));
    expect([dynRes.opposition.pool?.rawTotal, dynRes.opposition.pool?.modifierTotal, dynRes.opposition.total, dynRes.outcome, dynRes.margin])
      .toEqual([2, -4, -2, 'success', 3]);

    const baseStat = new DifficultyOpposition(DifficultyTier.Moderate, 'static', { label: 'Door' });
    const statOpp = baseStat.withModifier('Barred', 2).withModifier('Cracked', -1);
    expect(statOpp).not.toBe(baseStat);
    const statRes = Check.withDice(1).against(statOpp).resolve(new StubDiceRoller([6]));
    expect([baseStat.modifiers, statRes.opposition.total, statRes.opposition.pool, statRes.opposition.label, statRes.outcome])
      .toEqual([[], 7, undefined, 'Door', 'failure']);
  });

  it('CHK-STS-11: applies simultaneous actor and opponent modifiers on the same opposed check', () => {
    const roller = new StubDiceRoller([4, 5]);
    const res = Check.withDice(1).withModifier('Inspired', 3).against(new RolledOpposition(1).withModifier('Guard', 1)).resolve(roller);
    expect([res.actor.finalTotal, res.opposition.total, res.outcome, res.margin, roller.remaining]).toEqual([7, 6, 'success', 1, 0]);
  });
});

describe('Module 2: Checks — Physical / Predetermined Dice Values', () => {
  it('CHK-MAN-01: actor physical dice (Check.fromDice, Check.withDiceValues, ReadyCheck.withDiceValues) skip roller for actor', () => {
    const roller = new StubDiceRoller([3, 4]);
    const fromStatic = Check.fromDice([6, 2]).withModifier('Focus', 1).withTiesMode('twist').against(new RolledOpposition(2)).resolve(roller);
    expect([fromStatic.actor.rawDice, fromStatic.actor.finalTotal, fromStatic.opposition.total, fromStatic.outcome, roller.remaining])
      .toEqual([[6, 2], 9, 7, 'success', 0]);

    const base = Check.withDice(2);
    const withVals = base.withDiceValues([5, 5]).withModifier('Aim', 1);
    expect(withVals).not.toBe(base);
    const r1 = withVals.against(new StaticOpposition(11)).withTiesMode('twist').resolve(new StubDiceRoller([]));
    expect([r1.actor.rawDice, r1.actor.finalTotal, r1.outcome]).toEqual([[5, 5], 11, 'tie']);

    const readyBase = Check.withDice(2).against(new StaticOpposition(10));
    const readyManual = readyBase.withDiceValues([6, 6]).withModifier('Penalty', -1);
    expect(readyManual).not.toBe(readyBase);
    const r2 = readyManual.resolve(new StubDiceRoller([]));
    expect([r2.actor.rawDice, r2.actor.naturalAllSixes, r2.actor.finalTotal, r2.outcome]).toEqual([[6, 6], true, 11, 'success']);
  });

  it('CHK-MAN-02: opposition physical dice (RolledOpposition.fromDice & withDiceValues) skip roller for opposition', () => {
    const roller = new StubDiceRoller([6, 3]);
    const opp = RolledOpposition.fromDice([4, 5], { label: 'Rival' }).withModifier('Shield', 1);
    expect([opp.diceCount, opp.diceValues, opp.label]).toEqual([2, [4, 5], 'Rival']);

    const res = Check.withDice(2).against(opp).resolve(roller);
    expect([res.actor.rawDice, res.opposition.pool?.rawDice, res.opposition.total, res.outcome, roller.remaining])
      .toEqual([[6, 3], [4, 5], 10, 'failure', 0]);

    const baseOpp = new RolledOpposition(2);
    const manualOpp = baseOpp.withDiceValues([2, 3]);
    expect([baseOpp.diceValues, manualOpp.diceValues]).toEqual([undefined, [2, 3]]);
  });

  it('CHK-MAN-03: resolves with zero random rolls when both actor and opposition supply physical dice', () => {
    const emptyRoller = new StubDiceRoller([]);
    const res = Check.fromDice([6, 4])
      .against(new RolledOpposition(2).withDiceValues([5, 5]))
      .withTiesMode('twist')
      .resolve(emptyRoller);
    expect([res.actor.rawDice, res.opposition.pool?.rawDice, res.outcome, emptyRoller.remaining])
      .toEqual([[6, 4], [5, 5], 'tie', 0]);
  });

  it('CHK-MAN-04: DifficultyOpposition supports physical dice in dynamic mode and rejects them in static mode', () => {
    const baseDyn = new DifficultyOpposition(DifficultyTier.Moderate, 'dynamic', { label: 'Chasm' });
    const dynManual = baseDyn.withDiceValues([6, 2]).withModifier('Windy', 1);
    expect([baseDyn.diceValues, dynManual.diceValues, dynManual.label]).toEqual([undefined, [6, 2], 'Chasm']);

    const res = Check.fromDice([5, 4]).against(dynManual).resolve(new StubDiceRoller([]));
    expect([res.opposition.pool?.rawDice, res.opposition.total, res.outcome]).toEqual([[6, 2], 9, 'failure']);

    const statDiff = new DifficultyOpposition(DifficultyTier.Easy, 'static');
    expect(() => statDiff.withDiceValues([4])).toThrow(/static/i);
  });

  it('CHK-MAN-05: validates physical dice count and face values (1..6 integers)', () => {
    expect(() => Check.fromDice([])).toThrow(RangeError);
    expect(() => RolledOpposition.fromDice([])).toThrow(RangeError);
    expect(() => Check.withDice(2).withDiceValues([6])).toThrow(RangeError);
    expect(() => Check.withDice(2).against(new StaticOpposition(6)).withDiceValues([6, 6, 6])).toThrow(RangeError);
    expect(() => new RolledOpposition(2).withDiceValues([4])).toThrow(RangeError);
    expect(() => new DifficultyOpposition(DifficultyTier.Hard, 'dynamic').withDiceValues([5, 5])).toThrow(RangeError);

    for (const bad of [0, 7, -1, 2.5, Number.NaN] as unknown as DieValue[]) {
      expect(() => Check.fromDice([bad])).toThrow(RangeError);
      expect(() => new RolledOpposition(1).withDiceValues([bad])).toThrow(RangeError);
    }
  });
});
