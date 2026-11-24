import { describe, expect, it } from 'vitest';
import { StaticOpposition } from '../checks';
import { StubDiceRoller } from '../dice';
import { Character, OpposedParticipantBuilder, Status } from './index';

describe('Status.create & Status.roll', () => {
  it('creates a frozen Status with trimmed name, positive or negative rating, and optional id/note', () => {
    const clean = Status.create('  Clean Shoe  ', 2);
    const nose = Status.create('Broken Nose', -3, { id: 'st-nose', note: 'Bar fight' });

    expect(Object.isFrozen(clean)).toBe(true);
    expect(clean.id.length).toBeGreaterThan(0);
    expect(clean).toMatchObject({ name: 'Clean Shoe', rating: 2, note: undefined });
    expect(nose).toMatchObject({ id: 'st-nose', name: 'Broken Nose', rating: -3, note: 'Bar fight' });
  });

  it('rolls a positive Status from the sum of DiceRoller dice', () => {
    const roller = new StubDiceRoller([3, 4]);
    const inspired = Status.roll('  Inspired  ', 2, 'positive', roller);

    expect(inspired).toMatchObject({ name: 'Inspired', rating: 7, note: undefined });
    expect(roller.remaining).toBe(0);
  });

  it('rolls a negative Status with negated DiceRoller total and forwards id and note options', () => {
    const roller = new StubDiceRoller([2, 4]);
    const poisoned = Status.roll('Poisoned', 2, 'negative', roller, { id: 'st-poison', note: 'Venom' });

    expect(poisoned).toMatchObject({ id: 'st-poison', name: 'Poisoned', rating: -6, note: 'Venom' });
    expect(roller.remaining).toBe(0);
  });

  it.each(['', '   '])('rejects blank status name %j before rolling dice', (blank) => {
    const roller = new StubDiceRoller([4]);
    expect(() => Status.create(blank, 1)).toThrow(/blank/i);
    expect(() => Status.roll(blank, 1, 'positive', roller)).toThrow(/blank/i);
    expect(roller.remaining).toBe(1);
  });

  it('rejects a blank custom status ID', () => {
    expect(() => Status.create('Cut', -1, { id: '   ' })).toThrow(/blank/i);
  });

  it.each([0, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'Status.create rejects zero or non-integer rating %s with RangeError',
    (badRating) => {
      expect(() => Status.create('Bad', badRating)).toThrow(RangeError);
    },
  );

  it.each([0, -1, 1.5, Number.NaN])('Status.roll rejects invalid dice count %s with RangeError', (badDiceCount) => {
    expect(() => Status.roll('Bad', badDiceCount, 'negative', new StubDiceRoller([2]))).toThrow(RangeError);
  });
});

describe('Character statuses & check modifiers', () => {
  it('attaches statuses immutably via addStatus', () => {
    const clean = Status.create('Clean Shoe', 2, { id: 'st-clean' });
    const bob = Character.create('Bob');
    const updated = bob.addStatus(clean);

    expect(updated).not.toBe(bob);
    expect(bob.statuses).toEqual([]);
    expect(updated.statuses).toEqual([clean]);
  });

  it('removes statuses immutably by case-insensitive name or exact ID', () => {
    const clean = Status.create('Clean Shoe', 2, { id: 'st-clean' });
    const nose = Status.create('Broken Nose', -3, { id: 'st-nose' });
    const seeded = Character.create('Bob').addStatus(clean).addStatus(nose);

    const withoutClean = seeded.removeStatus('  CLEAN SHOE  ');
    const withoutBoth = withoutClean.removeStatus('st-nose');

    expect(withoutClean).not.toBe(seeded);
    expect(withoutClean.statuses).toEqual([nose]);
    expect(withoutBoth.statuses).toEqual([]);
  });

  it('selectively applies attached statuses and situational modifiers, and stops applying removed statuses', () => {
    const clean = Status.create('Clean Shoe', 2, { id: 'st-clean' });
    const nose = Status.create('Broken Nose', -3, { id: 'st-nose' });
    const bob = Character.create('Bob').addSkill('Karate', 2).addStatus(clean).addStatus(nose);

    const boosted = bob
      .makeCheck('Karate')
      .withStatus('  clean shoe  ')
      .withModifier('Focus', 1)
      .against(new StaticOpposition(7))
      .roll(new StubDiceRoller([2, 3]));
    const afterRemoval = bob.removeStatus('Clean Shoe').makeCheck('Karate').against(new StaticOpposition(7)).roll(new StubDiceRoller([2, 3]));
    const penalized = bob.makeCheck('Karate').withStatus('st-nose').against(new StaticOpposition(4)).roll(new StubDiceRoller([3, 3]));

    expect(boosted.checkResult.actor.finalTotal).toBe(8);
    expect(boosted.checkResult.outcome).toBe('success');
    expect(afterRemoval.checkResult.actor.finalTotal).toBe(5);
    expect(afterRemoval.checkResult.outcome).toBe('failure');
    expect(penalized.checkResult.actor.finalTotal).toBe(3);
    expect(penalized.character.statuses).toEqual([clean, nose]);
  });

  it.each(['Unknown', '   '])('throws when applying or removing missing status %j', (missing) => {
    const bob = Character.create('Bob');
    expect(() => bob.makeCheck('Do Anything').withStatus(missing)).toThrow(/not found/i);
    expect(() => bob.removeStatus(missing)).toThrow(/not found/i);
  });

  it('applies defender statuses and modifiers immutably on againstCharacter checks', () => {
    const alice = Character.create('Alice');
    const bob = Character.create('Bob').addStatus(Status.create('Shield', 2, { id: 'st-sh' }));
    let initialBuilder!: OpposedParticipantBuilder;
    let updatedBuilder!: OpposedParticipantBuilder;

    const outcome = alice
      .makeCheck('Do Anything')
      .withModifier('Lunge', 1)
      .againstCharacter(bob, 'Do Anything', (b) => {
        initialBuilder = b;
        updatedBuilder = b.withStatus('  shield  ').withModifier('Cover', 1);
        return updatedBuilder;
      })
      .roll(new StubDiceRoller([4, 3]));

    expect(updatedBuilder).not.toBe(initialBuilder);
    expect(outcome.checkResult.actor.finalTotal).toBe(5);
    expect(outcome.checkResult.opposition.total).toBe(6);
    expect(outcome.checkResult.outcome).toBe('failure');
  });

  it('throws when applying an unknown status to an opposed defender', () => {
    const alice = Character.create('Alice');
    const bob = Character.create('Bob');
    expect(() => alice.makeCheck('Do Anything').againstCharacter(bob, 'Do Anything', (b) => b.withStatus('Ghost'))).toThrow(/not found/i);
  });

  it('awards +1 XP and preserves 0-XP natural all-6s advancement when a status penalty causes check failure', () => {
    const bob = Character.create('Bob').addStatus(Status.create('Raining', -4));
    const outcome = bob.makeCheck('Do Anything').withStatus('Raining').against(new StaticOpposition(3)).roll(new StubDiceRoller([6]));
    const claimed = outcome.character.advance('Rain Grip').claim();

    expect(outcome.checkResult.actor.finalTotal).toBe(2);
    expect(outcome.checkResult.outcome).toBe('failure');
    expect(outcome.xpEarned).toBe(1);
    expect(outcome.character.pendingAdvancement?.xpCostToAdvance).toBe(0);
    expect(claimed.totalXpSpent).toBe(0);
    expect(claimed.character.xp).toBe(1);
  });
});
