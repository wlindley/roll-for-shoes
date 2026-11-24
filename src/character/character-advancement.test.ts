import { describe, expect, it } from 'vitest';
import { RolledOpposition, StaticOpposition } from '../checks';
import { StubDiceRoller } from '../dice';
import { AdvancementOutcome, Character, CharacterAdvancementBuilder, DEFAULT_STARTING_SKILL_NAME, Skill } from './index';

describe('Character.advance & AdvancementOutcome', () => {
  it('claims a level + 1 child skill for 0 XP after rolling natural all-6s', () => {
    const bob = Character.create('Bob');
    const doAnything = bob.skill(DEFAULT_STARTING_SKILL_NAME);
    const beforeClaim = bob.makeCheck('Do Anything').against(new StaticOpposition(3)).roll(new StubDiceRoller([6])).character;

    const builder: CharacterAdvancementBuilder = beforeClaim.advance('Climbing');
    const outcome: AdvancementOutcome = builder.claim();

    expect(outcome.character).not.toBe(beforeClaim);
    expect(beforeClaim.pendingAdvancement).not.toBeNull();
    expect(outcome.createdSkill).toBeInstanceOf(Skill);
    expect(outcome.createdSkill.name).toBe('Climbing');
    expect(outcome.createdSkill.level).toBe(2);
    expect(outcome.createdSkill.parentSkillId).toBe(doAnything.id);
    expect(outcome.replacedSkill).toBeUndefined();
    expect(outcome.diceUpgradeXpSpent).toBe(0);
    expect(outcome.slotPurchaseXpSpent).toBe(0);
    expect(outcome.totalXpSpent).toBe(0);
    expect(outcome.character.xp).toBe(0);
    expect(outcome.character.pendingAdvancement).toBeNull();
    expect(outcome.character.skills).toEqual([doAnything, outcome.createdSkill]);
  });

  it('retains +1 failure XP when claiming a 0-XP natural all-6s advancement on a failed opposed roll', () => {
    const bob = Character.create('Bob');
    const check = bob.makeCheck('Do Anything').against(RolledOpposition.withDice(2)).roll(new StubDiceRoller([6, 5, 5]));
    const outcome = check.character.advance('Parkour').claim();

    expect(check.checkResult.outcome).toBe('failure');
    expect(check.xpEarned).toBe(1);
    expect(outcome.diceUpgradeXpSpent).toBe(0);
    expect(outcome.totalXpSpent).toBe(0);
    expect(outcome.character.xp).toBe(1);
    expect(outcome.character.pendingAdvancement).toBeNull();
  });

  it('spends newly earned failure XP immediately to upgrade a single non-6 die while checkResult remains failure', () => {
    const bob = Character.create('Bob');
    const check = bob.makeCheck('Do Anything').against(new StaticOpposition(5)).roll(new StubDiceRoller([2]));
    const outcome = check.character.advance('Sneaking').claim();

    expect(check.checkResult.outcome).toBe('failure');
    expect(outcome.createdSkill.name).toBe('Sneaking');
    expect(outcome.createdSkill.level).toBe(2);
    expect(outcome.diceUpgradeXpSpent).toBe(1);
    expect(outcome.slotPurchaseXpSpent).toBe(0);
    expect(outcome.totalXpSpent).toBe(1);
    expect(outcome.character.xp).toBe(0);
    expect(outcome.character.pendingAdvancement).toBeNull();
  });

  it('spends 1 XP per non-6 die (not pip difference) on multi-die upgrades and retains leftover XP', () => {
    const roller = new StubDiceRoller([1, 1, 1, 2, 4, 6]);
    const seeded = Character.create('Bob')
      .addSkill('Climbing', 3)
      .makeCheck('Do Anything').against(new StaticOpposition(6)).roll(roller).character
      .makeCheck('Do Anything').against(new StaticOpposition(6)).roll(roller).character
      .makeCheck('Do Anything').against(new StaticOpposition(6)).roll(roller).character;

    const afterClimb = seeded.makeCheck('Climbing').against(new StaticOpposition(10)).roll(roller).character;
    const outcome = afterClimb.advance('Free Soloing').claim();

    expect(afterClimb.xp).toBe(3);
    expect(outcome.createdSkill.name).toBe('Free Soloing');
    expect(outcome.createdSkill.level).toBe(4);
    expect(outcome.diceUpgradeXpSpent).toBe(2);
    expect(outcome.totalXpSpent).toBe(2);
    expect(outcome.character.xp).toBe(1);
  });

  it('claims advancement using banked XP after a twist tie', () => {
    const withXp = Character.create('Bob')
      .addSkill('Climbing', 2)
      .makeCheck('Do Anything').against(new StaticOpposition(6)).roll(new StubDiceRoller([1])).character;
    const tied = withXp.makeCheck('Climbing').withTiesMode('twist').against(new StaticOpposition(9)).roll(new StubDiceRoller([6, 3])).character;
    const claimed = tied.advance('Ledge Grab').claim();

    expect(claimed.createdSkill.level).toBe(3);
    expect(claimed.totalXpSpent).toBe(1);
    expect(claimed.character.xp).toBe(0);
  });

  it('throws /no pending advancement/i when none exists, after dismissal, or when claiming twice', () => {
    const bob = Character.create('Bob');
    const ready = bob.makeCheck('Do Anything').against(new StaticOpposition(3)).roll(new StubDiceRoller([6])).character;
    const claimed = ready.advance('Jumping').claim().character;

    expect(() => bob.advance('Jumping').claim()).toThrow(/no pending advancement/i);
    expect(() => ready.dismissAdvancement().advance('Jumping').claim()).toThrow(/no pending advancement/i);
    expect(() => claimed.advance('Vaulting').claim()).toThrow(/no pending advancement/i);
  });

  it.each(['', '   ', 'Do Anything', '  do anything  ', 'Cooking', '  COOKING  '])(
    'rejects invalid or duplicate newSkillName %j and preserves pendingAdvancement for retry',
    (badName) => {
      const ready = Character.create('Bob')
        .addSkill('Cooking', 2)
        .makeCheck('Do Anything')
        .against(new StaticOpposition(3))
        .roll(new StubDiceRoller([6])).character;
      const originalPending = ready.pendingAdvancement;

      expect(() => ready.advance(badName).claim()).toThrow();
      expect(ready.pendingAdvancement).toBe(originalPending);

      const retried = ready.advance('Baking').claim();
      expect(retried.createdSkill.name).toBe('Baking');
      expect(retried.character.pendingAdvancement).toBeNull();
    },
  );
});
