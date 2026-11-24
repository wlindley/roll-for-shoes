import { describe, expect, it } from 'vitest';
import { StubDiceRoller } from '../dice';
import {
  Check,
  DifficultyOpposition,
  DifficultyTier,
  RolledOpposition,
  StaticOpposition,
  type CheckModifier,
} from './index';

describe('Check & ReadyCheck — Actor Modifiers', () => {
  it('applies a negative penalty immutably via Check.withModifier', () => {
    const base = Check.withDice(3);
    const penalized = base.withModifier('Raining', -4);

    expect(penalized).not.toBe(base);
    const result = penalized.against(new StaticOpposition(9)).resolve(new StubDiceRoller([3, 5, 6]));
    const baseResult = base.against(new StaticOpposition(9)).resolve(new StubDiceRoller([3, 5, 6]));

    expect(result.actor.rawTotal).toBe(14);
    expect(result.actor.modifierTotal).toBe(-4);
    expect(result.actor.finalTotal).toBe(10);
    expect(result.actor.modifiers).toEqual([{ label: 'Raining', value: -4 }]);
    expect(result.outcome).toBe('success');
    expect(baseResult.actor.finalTotal).toBe(14);
  });

  it('applies a positive bonus turning a failing raw roll into a success', () => {
    const result = Check.withDice(2)
      .withModifier('Clean Shoe', 2)
      .against(new StaticOpposition(6))
      .resolve(new StubDiceRoller([2, 3]));

    expect(result.actor.rawTotal).toBe(5);
    expect(result.actor.modifierTotal).toBe(2);
    expect(result.actor.finalTotal).toBe(7);
    expect(result.margin).toBe(1);
    expect(result.outcome).toBe('success');
  });

  it('combines Check.withModifiers additively into a negative finalTotal and clones input array', () => {
    const mods: CheckModifier[] = [
      { label: 'Rain', value: -4 },
      { label: 'Grip', value: 1 },
    ];
    const check = Check.withDice(1).withModifiers(mods);
    mods.push({ label: 'Mutated', value: 99 });

    const result = check.against(new StaticOpposition(1)).resolve(new StubDiceRoller([1]));

    expect(result.actor.modifierTotal).toBe(-3);
    expect(result.actor.finalTotal).toBe(-2);
    expect(result.margin).toBe(-3);
    expect(result.outcome).toBe('failure');
  });

  it('chains withModifier and withModifiers immutably on ReadyCheck while preserving tiesMode', () => {
    const baseReady = Check.withDice(1).withTiesMode('twist').withModifier('Base', 1).against(new StaticOpposition(5));
    const readyMods: CheckModifier[] = [{ label: 'Boost', value: 2 }];
    const chainedReady = baseReady.withModifiers(readyMods).withModifier('Cap', -1);
    readyMods.push({ label: 'Mutated', value: 50 });

    expect(chainedReady).not.toBe(baseReady);
    const chainedRes = chainedReady.resolve(new StubDiceRoller([3]));
    const baseRes = baseReady.resolve(new StubDiceRoller([3]));

    expect(chainedRes.actor.modifierTotal).toBe(2);
    expect(chainedRes.actor.finalTotal).toBe(5);
    expect(chainedRes.outcome).toBe('tie');
    expect(baseRes.actor.finalTotal).toBe(4);
    expect(baseRes.outcome).toBe('failure');
  });
});

describe('Check — Modifier Invariance & Opposed Modifiers', () => {
  it('preserves actor naturalAllSixes and nonSixCount despite a penalty causing failure', () => {
    const result = Check.withDice(2)
      .withModifier('Broken Nose', -3)
      .against(new StaticOpposition(10))
      .resolve(new StubDiceRoller([6, 6]));

    expect(result.actor.finalTotal).toBe(9);
    expect(result.outcome).toBe('failure');
    expect(result.actor.naturalAllSixes).toBe(true);
    expect(result.actor.nonSixCount).toBe(0);
  });

  it('does not manufacture fake sixes on actor rawDice from a positive bonus', () => {
    const result = Check.withDice(2)
      .withModifier('Inspired', 4)
      .against(new StaticOpposition(10))
      .resolve(new StubDiceRoller([4, 4]));

    expect(result.actor.finalTotal).toBe(12);
    expect(result.outcome).toBe('success');
    expect(result.actor.naturalAllSixes).toBe(false);
    expect(result.actor.nonSixCount).toBe(2);
  });

  it('reduces opposition.total under an opponent penalty (turning actor loss into success)', () => {
    const result = Check.withDice(1)
      .against(RolledOpposition.withDice(1).withModifier('Blinded', -3))
      .resolve(new StubDiceRoller([3, 5]));

    expect(result.opposition.pool.rawTotal).toBe(5);
    expect(result.opposition.pool.modifierTotal).toBe(-3);
    expect(result.opposition.total).toBe(2);
    expect(result.outcome).toBe('success');
  });

  it('increases opposition.total under an opponent bonus (turning actor win into failure)', () => {
    const result = Check.withDice(1)
      .against(RolledOpposition.withDice(1).withModifier('Armored', 2))
      .resolve(new StubDiceRoller([5, 4]));

    expect(result.opposition.pool.rawTotal).toBe(4);
    expect(result.opposition.total).toBe(6);
    expect(result.outcome).toBe('failure');
  });

  it('preserves opponent naturalAllSixes despite an opponent penalty causing loss', () => {
    const result = Check.withDice(1)
      .against(RolledOpposition.withDice(2).withModifier('Dazed', -8))
      .resolve(new StubDiceRoller([5, 6, 6]));

    expect(result.opposition.total).toBe(4);
    expect(result.outcome).toBe('success');
    expect(result.opposition.pool.naturalAllSixes).toBe(true);
    expect(result.opposition.pool.nonSixCount).toBe(0);
  });

  it('does not manufacture fake sixes on opponent rawDice from an opponent bonus', () => {
    const result = Check.withDice(1)
      .against(RolledOpposition.withDice(2).withModifier('Boost', 4))
      .resolve(new StubDiceRoller([3, 4, 4]));

    expect(result.opposition.total).toBe(12);
    expect(result.outcome).toBe('failure');
    expect(result.opposition.pool.naturalAllSixes).toBe(false);
    expect(result.opposition.pool.nonSixCount).toBe(2);
  });

  it('combines multiple opponent modifiers into a negative opposition.total', () => {
    const opp = DifficultyOpposition.dynamic(DifficultyTier.Easy, {
      modifiers: [{ label: 'Rusty', value: -5 }],
    }).withModifier('Oil', 1);
    const result = Check.withDice(1).against(opp).resolve(new StubDiceRoller([1, 2]));

    expect(result.opposition.pool.modifierTotal).toBe(-4);
    expect(result.opposition.total).toBe(-2);
    expect(result.margin).toBe(3);
    expect(result.outcome).toBe('success');
  });

  it('applies simultaneous actor and opponent modifiers on an opposed check', () => {
    const roller = new StubDiceRoller([4, 5]);
    const result = Check.withDice(1)
      .withModifier('Inspired', 3)
      .against(RolledOpposition.withDice(1).withModifier('Guard', 1))
      .resolve(roller);

    expect(result.actor.finalTotal).toBe(7);
    expect(result.opposition.total).toBe(6);
    expect(result.margin).toBe(1);
    expect(result.outcome).toBe('success');
    expect(roller.remaining).toBe(0);
  });
});
