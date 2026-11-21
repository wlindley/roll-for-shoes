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
