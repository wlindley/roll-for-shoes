import { describe, expect, it } from 'vitest';
import { StubDiceRoller, type DieValue } from '../dice';
import {
  Check,
  CheckResult,
  DifficultyOpposition,
  DifficultyTier,
  ReadyCheck,
  RolledOpposition,
  RolledPool,
  StaticOpposition,
  type CheckOutcome,
  type TiesMode,
} from './index';

describe('Check — Static & Opposed Resolution', () => {
  it('resolves static check success with positive margin and zero opposition dice rolled', () => {
    const roller = new StubDiceRoller([4, 5]);
    const ready: ReadyCheck = Check.withDice(2).against(new StaticOpposition(6, 'Guard'));
    const result: CheckResult = ready.resolve(roller);

    expect(result.outcome satisfies CheckOutcome).toBe('success');
    expect(result.actor.rawDice).toEqual([4, 5]);
    expect(result.actor.finalTotal).toBe(9);
    expect(result.opposition.total).toBe(6);
    expect(result.opposition.label).toBe('Guard');
    expect(result.opposition.kind).toBe('static');
    expect(result.margin).toBe(3);
    expect(roller.remaining).toBe(0);
  });

  it('resolves static check failure with negative margin', () => {
    const result = Check.withDice(2).against(new StaticOpposition(6)).resolve(new StubDiceRoller([2, 3]));

    expect(result.outcome).toBe('failure');
    expect(result.margin).toBe(-1);
  });

  it('resolves opposed check in deterministic FIFO order (actor first, opposition second)', () => {
    const roller = new StubDiceRoller([5, 6, 2, 3]);
    const result = Check.withDice(2).against(RolledOpposition.withDice(2, { label: 'Rival' })).resolve(roller);

    expect(result.actor.rawDice).toEqual([5, 6]);
    expect(result.opposition.pool.rawDice).toEqual([2, 3]);
    expect(result.outcome).toBe('success');
    expect(result.margin).toBe(6);
    expect(roller.remaining).toBe(0);
  });

  it('resolves opposed check failure with negative margin', () => {
    const result = Check.withDice(2).against(RolledOpposition.withDice(2)).resolve(new StubDiceRoller([1, 2, 4, 5]));

    expect(result.outcome).toBe('failure');
    expect(result.margin).toBe(-6);
  });

  it('detects opponent single-die and multi-die natural all-6s even when opponent loses', () => {
    const singleSix = Check.withDice(1).against(RolledOpposition.withDice(1)).resolve(new StubDiceRoller([3, 6]));
    expect(singleSix.opposition.pool.naturalAllSixes).toBe(true);
    expect(singleSix.opposition.pool.nonSixCount).toBe(0);

    const multiSixLoss = Check.withDice(3).against(RolledOpposition.withDice(2)).resolve(new StubDiceRoller([5, 5, 5, 6, 6]));
    expect(multiSixLoss.outcome).toBe('success');
    expect(multiSixLoss.opposition.pool?.naturalAllSixes).toBe(true);
    expect(multiSixLoss.opposition.pool?.nonSixCount).toBe(0);
  });

  it('preserves actor naturalAllSixes even when the check fails', () => {
    const result = Check.withDice(2).against(new StaticOpposition(15)).resolve(new StubDiceRoller([6, 6]));

    expect(result.outcome).toBe('failure');
    expect(result.actor.naturalAllSixes).toBe(true);
    expect(result.actor.nonSixCount).toBe(0);
  });
});

describe('Check & CheckResult — TiesMode ("fail" vs "twist")', () => {
  it('defaults tiesMode to "fail" on Check and CheckResult so equal totals fail', () => {
    const staticTie = Check.withDice(2).against(new StaticOpposition(6)).resolve(new StubDiceRoller([2, 4]));
    expect(staticTie.tiesMode satisfies TiesMode).toBe('fail');
    expect(staticTie.margin).toBe(0);
    expect(staticTie.outcome).toBe('failure');

    const opposedTie = Check.withDice(2).against(RolledOpposition.withDice(2)).resolve(new StubDiceRoller([3, 4, 2, 5]));
    expect(opposedTie.margin).toBe(0);
    expect(opposedTie.outcome).toBe('failure');

    const directResult = new CheckResult(new RolledPool([3]), { kind: 'static', total: 3 });
    expect(directResult.tiesMode).toBe('fail');
    expect(directResult.outcome).toBe('failure');
  });

  it('resolves ties as "tie" when withTiesMode("twist") is set before against() immutably', () => {
    const base = Check.withDice(2);
    const twist = base.withTiesMode('twist');

    expect(twist).not.toBe(base);
    const twistRes = twist.against(new StaticOpposition(7)).resolve(new StubDiceRoller([3, 4]));
    const baseRes = base.against(new StaticOpposition(7)).resolve(new StubDiceRoller([3, 4]));

    expect(twistRes.tiesMode).toBe('twist');
    expect(twistRes.margin).toBe(0);
    expect(twistRes.outcome).toBe('tie');
    expect(baseRes.outcome).toBe('failure');
  });

  it('resolves dynamic difficulty ties as "tie" under "twist" and supports reverting via withTiesMode("fail")', () => {
    const twist = Check.withDice(2).withTiesMode('twist');
    const reverted = twist.withTiesMode('fail');
    const opp = DifficultyOpposition.dynamic(DifficultyTier.Hard);

    expect(twist.against(opp).resolve(new StubDiceRoller([3, 4, 2, 2, 3])).outcome).toBe('tie');
    expect(reverted.against(opp).resolve(new StubDiceRoller([3, 4, 2, 2, 3])).outcome).toBe('failure');
  });

  it('leaves strict wins and strict losses unaffected under tiesMode "twist"', () => {
    const ready = Check.withDice(1).withTiesMode('twist').against(new StaticOpposition(3));

    expect(ready.resolve(new StubDiceRoller([5])).outcome).toBe('success');
    expect(ready.resolve(new StubDiceRoller([2])).outcome).toBe('failure');
  });
});

describe('Check & ReadyCheck — Predetermined Dice & Validation', () => {
  it('skips actor dice rolling with Check.fromDice while still rolling opposition', () => {
    const roller = new StubDiceRoller([3, 4]);
    const result = Check.fromDice([6, 2]).against(RolledOpposition.withDice(2)).resolve(roller);

    expect(result.actor.rawDice).toEqual([6, 2]);
    expect(result.opposition.pool?.rawDice).toEqual([3, 4]);
    expect(roller.remaining).toBe(0);
  });

  it('rolls actor dice while skipping roller for predetermined opposition dice', () => {
    const roller = new StubDiceRoller([6, 3]);
    const opp = RolledOpposition.fromDice([4, 5], { label: 'Rival' }).withModifier('Shield', 1);
    const result = Check.withDice(2).against(opp).resolve(roller);

    expect(result.actor.rawDice).toEqual([6, 3]);
    expect(result.opposition.total).toBe(10);
    expect(result.outcome).toBe('failure');
    expect(roller.remaining).toBe(0);
  });

  it('sets predetermined actor dice immutably via Check.withDiceValues', () => {
    const base = Check.withDice(2);
    const manual = base.withDiceValues([5, 5]);

    expect(manual).not.toBe(base);
    expect(manual.against(new StaticOpposition(9)).resolve(new StubDiceRoller([])).outcome).toBe('success');
  });

  it('resolves with zero random rolls when both actor and opposition supply predetermined dice', () => {
    const result = Check.withDice(2)
      .withDiceValues([6, 4])
      .withTiesMode('twist')
      .against(RolledOpposition.fromDice([5, 5]))
      .resolve(new StubDiceRoller([]));

    expect(result.actor.rawDice).toEqual([6, 4]);
    expect(result.opposition.pool.rawDice).toEqual([5, 5]);
    expect(result.outcome).toBe('tie');
  });

  it.each([0, -2, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'Check.withDice rejects invalid count %s with RangeError',
    (badCount) => {
      expect(() => Check.withDice(badCount)).toThrow(RangeError);
    },
  );

  it('rejects empty or mismatched predetermined dice array lengths with RangeError', () => {
    expect(() => Check.fromDice([])).toThrow(RangeError);
    expect(() => Check.withDice(2).withDiceValues([6])).toThrow(RangeError);
  });

  it.each([0, 7, -1, 2.5, Number.NaN])('Check.fromDice rejects invalid die face %s with RangeError', (badFace) => {
    expect(() => Check.fromDice([badFace as DieValue])).toThrow(RangeError);
  });
});
