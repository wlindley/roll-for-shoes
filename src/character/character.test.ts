import { describe, expect, it } from 'vitest';
import { StubDiceRoller, type DieValue } from '../dice';
import { RolledOpposition, StaticOpposition } from '../checks';
import { Character, CharacterBuilder, CharacterCheckBuilder, CharacterCheckOutcome, DEFAULT_STARTING_SKILL_NAME, PendingAdvancement, ReadyCharacterCheck, Skill } from './index';

describe('character module — Skill, Character creation & addSkill', () => {
  it('CHR-BASIC-01: creates Character with Rule 3 defaults, custom IDs, immutable builder, and Skill props', () => {
    const bob = Character.create('Bob');
    expect(bob.id.length).toBeGreaterThan(0);
    expect([bob.name, bob.xp, bob.statuses, bob.purchasedSlots, bob.pendingAdvancement]).toEqual(['Bob', 0, [], {}, null]);
    expect([Object.isFrozen(bob.skills), Object.isFrozen(bob.statuses), Object.isFrozen(bob.purchasedSlots)])
      .toEqual([true, true, true]);
    expect(bob.skills).toHaveLength(1);
    const starter = bob.skills[0]!;
    expect(starter).toBeInstanceOf(Skill);
    expect([starter.name, starter.level, starter.parentSkillId, starter.id.length > 0])
      .toEqual([DEFAULT_STARTING_SKILL_NAME, 1, undefined, true]);
    expect(Character.create('Eve', { id: 'c-eve' }).id).toBe('c-eve');

    const b1: CharacterBuilder = Character.builder('Ada');
    const b2 = b1.withId('c-1');
    expect(b2).not.toBe(b1);
    const ada = b2.build();
    expect([ada.id, ada.name, ada.xp, ada.skills.length, b1.build().id !== 'c-1']).toEqual(['c-1', 'Ada', 0, 1, true]);

    const custom = new Skill({ id: 'sk-1', name: 'Jump', level: 2, parentSkillId: 'p-1' });
    expect([custom.id, custom.name, custom.level, custom.parentSkillId]).toEqual(['sk-1', 'Jump', 2, 'p-1']);
  });

  it('CHR-BASIC-02: character.skill(idOrName) finds by exact ID or case-insensitive name and throws on unknown', () => {
    const bob = Character.create('Bob');
    const starter = bob.skills[0]!;
    expect([bob.skill(starter.id), bob.skill('do anything'), bob.skill('  DO ANYTHING  ')])
      .toEqual([starter, starter, starter]);
    expect(() => bob.skill('Nonexistent')).toThrow();
  });

  it('CHR-BASIC-03: character.addSkill returns a distinct Character and preserves original state', () => {
    const bob = Character.create('Bob');
    const doAnything = bob.skill(DEFAULT_STARTING_SKILL_NAME);
    const next = bob.addSkill('Cooking', 2, { parentSkillId: doAnything.id });
    expect(next).not.toBe(bob);
    expect([bob.skills, next.skills.length]).toEqual([[doAnything], 2]);
    expect([next.skill('Cooking').name, next.skill('Cooking').level, next.skill('Cooking').parentSkillId])
      .toEqual(['Cooking', 2, doAnything.id]);

    const third = next.addSkill('Swimming', 1);
    expect(third).not.toBe(next);
    expect([next.skills.length, third.skills.length, third.skill('Swimming').parentSkillId]).toEqual([2, 3, undefined]);
  });

  it('CHR-BASIC-04: rejects blank character names, blank custom IDs, and blank skill names', () => {
    const bob = Character.create('Bob');
    expect(() => Character.create('   ')).toThrow();
    expect(() => Character.create('Ada', { id: '   ' })).toThrow();
    expect(() => Character.builder('   ').build()).toThrow();
    expect(() => Character.builder('Ada').withId('   ').build()).toThrow();
    expect(() => new Skill({ name: '  ', level: 1 })).toThrow();
    expect(() => new Skill({ id: '  ', name: 'Jump', level: 1 })).toThrow();
    expect(() => bob.addSkill('  ', 2)).toThrow();
    expect(bob.skills).toHaveLength(1);
  });

  it('CHR-BASIC-05: rejects duplicate skill names case-insensitively and leaves character unchanged', () => {
    const bob = Character.create('Bob');
    expect(() => bob.addSkill('do anything', 2)).toThrow();
    expect(() => bob.addSkill('  DO ANYTHING ', 3)).toThrow();
    expect(bob.skills).toHaveLength(1);
  });

  it('CHR-BASIC-06: Skill and addSkill reject zero, negative, decimal, NaN, and infinite levels with RangeError', () => {
    const badLevels = [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY];
    for (const bad of badLevels) {
      expect(() => new Skill({ name: 'Jump', level: bad })).toThrow(RangeError);
    }
    const bob = Character.create('Bob');
    for (const bad of badLevels) {
      expect(() => bob.addSkill('Jump', bad)).toThrow(RangeError);
    }
    expect(bob.skills).toHaveLength(1);
  });
});

describe('character module — makeCheck & PendingAdvancement lifecycle', () => {
  it('CHR-BASIC-07: successful non-6 check at 0 XP leaves pendingAdvancement null and throws on unknown skill', () => {
    const bob = Character.create('Bob');
    const [doAnything, roller] = [bob.skill(DEFAULT_STARTING_SKILL_NAME), new StubDiceRoller([5])];
    const builder: CharacterCheckBuilder = bob.makeCheck('Do Anything');
    const ready: ReadyCharacterCheck = builder.against(new StaticOpposition(3));
    const outcome: CharacterCheckOutcome = ready.roll(roller);
    expect(outcome.character).not.toBe(bob);
    expect([builder instanceof CharacterCheckBuilder, ready instanceof ReadyCharacterCheck, outcome instanceof CharacterCheckOutcome]).toEqual([true, true, true]);
    expect([bob.xp, bob.pendingAdvancement, bob.skills, outcome.skillUsed, outcome.checkResult.outcome, outcome.xpEarned, outcome.character.xp, outcome.canAdvanceNaturally, outcome.canAdvance, outcome.character.pendingAdvancement, roller.remaining]).toEqual([0, null, [doAnything], doAnything, 'success', 0, 0, false, false, null, 0]);
    expect(() => bob.makeCheck('Unknown')).toThrow();
  });
  it('CHR-BASIC-08: failed check awards +1 XP and creates PendingAdvancement with actionDescription when xp >= nonSixCount', () => {
    const bob = Character.create('Bob');
    const b1 = bob.makeCheck('do anything');
    const b2 = b1.withAction('Jump gap');
    expect(b2).not.toBe(b1);
    const outcome = b2.against(new StaticOpposition(4)).roll(new StubDiceRoller([2]));
    expect(outcome.character).not.toBe(bob);
    const p = outcome.character.pendingAdvancement!;
    expect([p instanceof PendingAdvancement, bob.xp, bob.pendingAdvancement, outcome.checkResult.outcome, outcome.xpEarned, outcome.character.xp, outcome.canAdvance, outcome.canAdvanceNaturally]).toEqual([true, 0, null, 'failure', 1, 1, true, false]);
    expect([p.rollId.length > 0, p.usedSkillId, p.usedSkillName, p.usedSkillLevel, p.rawDice, p.checkOutcome, p.actionDescription, p.targetLevel, p.xpCostToAdvance, p.naturalAllSixes]).toEqual([true, bob.skill(DEFAULT_STARTING_SKILL_NAME).id, 'Do Anything', 1, [2], 'failure', 'Jump gap', 2, 1, false]);
    expect(b1.against(new StaticOpposition(4)).roll(new StubDiceRoller([2])).character.pendingAdvancement?.actionDescription).toBeUndefined();
  });
  it('CHR-BASIC-09: failed multi-die check where xp < nonSixCount awards +1 XP while leaving pendingAdvancement null', () => {
    const bob = Character.create('Bob').addSkill('Climbing', 2);
    const outcome = bob.makeCheck('Climbing').against(new StaticOpposition(6)).roll(new StubDiceRoller([2, 3]));
    expect(outcome.character).not.toBe(bob);
    expect([bob.xp, outcome.checkResult.outcome, outcome.checkResult.actor.nonSixCount, outcome.xpEarned, outcome.character.xp, outcome.character.pendingAdvancement, outcome.canAdvance, outcome.canAdvanceNaturally]).toEqual([0, 'failure', 2, 1, 1, null, false, false]);
    const banked = outcome.character.makeCheck('Do Anything').against(new StaticOpposition(3)).roll(new StubDiceRoller([4]));
    expect([banked.checkResult.outcome, banked.xpEarned, banked.character.xp, banked.canAdvance, banked.character.pendingAdvancement?.xpCostToAdvance]).toEqual(['success', 0, 1, true, 1]);
  });
  it('CHR-BASIC-10: natural all-6s creates 0-cost PendingAdvancement at 0 XP and freezes/copies rawDice', () => {
    const bob = Character.create('Bob');
    const outcome = bob.makeCheck('Do Anything').against(new StaticOpposition(3)).roll(new StubDiceRoller([6]));
    expect(outcome.character).not.toBe(bob);
    const p = outcome.character.pendingAdvancement!;
    expect([bob.pendingAdvancement, outcome.checkResult.outcome, outcome.xpEarned, outcome.character.xp, outcome.canAdvanceNaturally, outcome.canAdvance, p.xpCostToAdvance, p.naturalAllSixes, p.targetLevel, p.checkOutcome, p.actionDescription]).toEqual([null, 'success', 0, 0, true, true, 0, true, 2, 'success', undefined]);
    const dice: DieValue[] = [6, 4];
    const direct = new PendingAdvancement({ rollId: 'r-1', usedSkillId: 's-1', usedSkillName: 'Climb', usedSkillLevel: 2, rawDice: dice, checkOutcome: 'success' });
    dice.push(1);
    expect([Object.isFrozen(direct), Object.isFrozen(direct.rawDice), direct.rollId, direct.rawDice, direct.xpCostToAdvance, direct.naturalAllSixes, direct.targetLevel]).toEqual([true, true, 'r-1', [6, 4], 1, false, 3]);
  });
  it('CHR-BASIC-11: rolling a higher-level skill consumes skill.level dice and supports RolledOpposition', () => {
    const bob = Character.create('Bob').addSkill('Climbing', 3);
    const [climbing, roller] = [bob.skill('Climbing'), new StubDiceRoller([4, 5, 6])];
    const outcome = bob.makeCheck(climbing.id).against(new StaticOpposition(10)).roll(roller);
    expect(outcome.character).not.toBe(bob);
    expect([outcome.skillUsed, outcome.checkResult.actor.rawDice, outcome.checkResult.actor.rawTotal, outcome.checkResult.outcome, roller.remaining]).toEqual([climbing, [4, 5, 6], 15, 'success', 0]);
    const opposed = bob.makeCheck('Climbing').against(new RolledOpposition(1)).roll(new StubDiceRoller([2, 3, 4, 6]));
    expect([opposed.checkResult.actor.rawTotal, opposed.checkResult.opposition.total, opposed.checkResult.outcome]).toEqual([9, 6, 'success']);
  });
  it('CHR-BASIC-12: consecutive ineligible check clears an earlier unclaimed pendingAdvancement to null', () => {
    const first = Character.create('Bob').makeCheck('Do Anything').against(new StaticOpposition(3)).roll(new StubDiceRoller([6]));
    const firstPending = first.character.pendingAdvancement;
    expect(firstPending).not.toBeNull();
    const second = first.character.makeCheck('Do Anything').against(new StaticOpposition(3)).roll(new StubDiceRoller([4]));
    expect(second.character).not.toBe(first.character);
    expect([first.character.pendingAdvancement, second.character.pendingAdvancement, second.canAdvance, second.character.xp]).toEqual([firstPending, null, false, 0]);
  });
  it('CHR-BASIC-13: dismissAdvancement clears pendingAdvancement immutably while preserving XP and skills', () => {
    const bob = Character.create('Bob');
    const afterRoll = bob.makeCheck('Do Anything').against(new StaticOpposition(5)).roll(new StubDiceRoller([2])).character;
    expect([afterRoll.pendingAdvancement !== null, afterRoll.addSkill('Cooking', 2).pendingAdvancement]).toEqual([true, afterRoll.pendingAdvancement]);
    const dismissed = afterRoll.dismissAdvancement();
    expect(dismissed).not.toBe(afterRoll);
    expect([afterRoll.pendingAdvancement !== null, dismissed.pendingAdvancement, dismissed.xp, dismissed.skills]).toEqual([true, null, 1, bob.skills]);
    const dismissedAgain = dismissed.dismissAdvancement();
    expect(dismissedAgain).not.toBe(dismissed);
    expect([dismissedAgain.pendingAdvancement, dismissedAgain.xp]).toEqual([null, 1]);
  });
});
