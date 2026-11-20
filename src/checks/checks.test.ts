import { describe, expect, it } from 'vitest';
import { StubDiceRoller, type DieValue } from '../dice';
import {
  Check, CheckResult, ReadyCheck, RolledPool, StaticOpposition,
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
