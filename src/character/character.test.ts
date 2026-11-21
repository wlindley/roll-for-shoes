import { describe, expect, it } from 'vitest';
import { StubDiceRoller, type DieValue } from '../dice';
import { RolledOpposition, StaticOpposition } from '../checks';
import { AdvancementOutcome, Character, CharacterAdvancementBuilder, CharacterBuilder, CharacterCheckBuilder, CharacterCheckOutcome, DEFAULT_STARTING_SKILL_NAME, OpposedCharacterCheckOutcome, PendingAdvancement, ReadyCharacterCheck, ReadyOpposedCharacterCheck, Skill } from './index';

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

describe('character module — advance & AdvancementOutcome', () => {
  it('CHR-BASIC-14: natural all-6s unlocks level + 1 skill for 0 XP and clears pendingAdvancement immutably', () => {
    const bob = Character.create('Bob');
    const doAnything = bob.skill(DEFAULT_STARTING_SKILL_NAME);
    const beforeClaim = bob.makeCheck('Do Anything').against(new StaticOpposition(3)).roll(new StubDiceRoller([6])).character;
    const pending = beforeClaim.pendingAdvancement;
    const builder: CharacterAdvancementBuilder = beforeClaim.advance('Climbing');
    expect(builder).toBeInstanceOf(CharacterAdvancementBuilder);
    const outcome: AdvancementOutcome = builder.claim();
    expect([outcome instanceof AdvancementOutcome, outcome.createdSkill instanceof Skill, outcome.character !== beforeClaim]).toEqual([true, true, true]);
    expect([beforeClaim.xp, beforeClaim.skills, beforeClaim.pendingAdvancement]).toEqual([0, [doAnything], pending]);
    expect([outcome.createdSkill.name, outcome.createdSkill.level, outcome.createdSkill.parentSkillId, outcome.replacedSkill]).toEqual(['Climbing', 2, doAnything.id, undefined]);
    expect([outcome.diceUpgradeXpSpent, outcome.slotPurchaseXpSpent, outcome.totalXpSpent]).toEqual([0, 0, 0]);
    expect([outcome.character.xp, outcome.character.pendingAdvancement, outcome.character.skills]).toEqual([0, null, [doAnything, outcome.createdSkill]]);
  });
  it('CHR-BASIC-15: natural all-6s on a failed opposed roll grants both +1 XP and 0 XP advancement', () => {
    const bob = Character.create('Bob');
    const doAnything = bob.skill(DEFAULT_STARTING_SKILL_NAME);
    const check = bob.makeCheck('Do Anything').against(new RolledOpposition(2)).roll(new StubDiceRoller([6, 5, 5]));
    expect([check.checkResult.outcome, check.xpEarned, check.character.xp, check.canAdvanceNaturally]).toEqual(['failure', 1, 1, true]);
    const outcome = check.character.advance('Parkour').claim();
    expect(outcome.character).not.toBe(check.character);
    expect([check.character.xp, check.character.skills, check.character.pendingAdvancement !== null]).toEqual([1, [doAnything], true]);
    expect([outcome.createdSkill.name, outcome.createdSkill.level, outcome.createdSkill.parentSkillId, outcome.replacedSkill]).toEqual(['Parkour', 2, doAnything.id, undefined]);
    expect([outcome.diceUpgradeXpSpent, outcome.slotPurchaseXpSpent, outcome.totalXpSpent, outcome.character.xp, outcome.character.pendingAdvancement]).toEqual([0, 0, 0, 1, null]);
  });
  it('CHR-BASIC-16: immediate post-failure XP advancement spends gained 1 XP while checkResult remains failure', () => {
    const bob = Character.create('Bob');
    const doAnything = bob.skill(DEFAULT_STARTING_SKILL_NAME);
    const check = bob.makeCheck('Do Anything').against(new StaticOpposition(5)).roll(new StubDiceRoller([2]));
    expect([check.checkResult.outcome, check.xpEarned, check.character.xp, check.canAdvance]).toEqual(['failure', 1, 1, true]);
    const outcome = check.character.advance('Sneaking').claim();
    expect(outcome.character).not.toBe(check.character);
    expect([check.character.xp, check.character.skills, check.character.pendingAdvancement !== null, check.checkResult.outcome]).toEqual([1, [doAnything], true, 'failure']);
    expect([outcome.createdSkill.name, outcome.createdSkill.level, outcome.createdSkill.parentSkillId, outcome.replacedSkill]).toEqual(['Sneaking', 2, doAnything.id, undefined]);
    expect([outcome.diceUpgradeXpSpent, outcome.slotPurchaseXpSpent, outcome.totalXpSpent, outcome.character.xp, outcome.character.pendingAdvancement, outcome.character.skill('Sneaking')]).toEqual([1, 0, 1, 0, null, outcome.createdSkill]);
  });
  it('CHR-BASIC-17: multi-die XP upgrade spends 1 XP per non-6 die (not pip difference) and retains leftover XP', () => {
    const roller = new StubDiceRoller([1, 1, 2, 6, 1, 1, 1, 4, 6, 6]);
    const base = Character.create('Bob').addSkill('Climbing', 3);
    const climbing = base.skill('Climbing');
    const with2Xp = base.makeCheck('Do Anything').against(new StaticOpposition(6)).roll(roller).character
      .makeCheck('Do Anything').against(new StaticOpposition(6)).roll(roller).character;
    const check = with2Xp.makeCheck('Climbing').against(new StaticOpposition(6)).roll(roller);
    expect([check.checkResult.outcome, check.checkResult.actor.rawTotal, check.character.xp]).toEqual(['success', 9, 2]);
    const outcome = check.character.advance('Free Soloing').claim();
    expect(outcome.character).not.toBe(check.character);
    expect([check.character.xp, check.character.pendingAdvancement !== null]).toEqual([2, true]);
    expect([outcome.createdSkill.name, outcome.createdSkill.level, outcome.createdSkill.parentSkillId, outcome.replacedSkill]).toEqual(['Free Soloing', 4, climbing.id, undefined]);
    expect([outcome.diceUpgradeXpSpent, outcome.slotPurchaseXpSpent, outcome.totalXpSpent, outcome.character.xp, outcome.character.pendingAdvancement]).toEqual([2, 0, 2, 0, null]);
    const c2 = outcome.character.makeCheck('Do Anything').against(new StaticOpposition(6)).roll(roller).character
      .makeCheck('Do Anything').against(new StaticOpposition(6)).roll(roller).character;
    const partial = c2.makeCheck('Climbing').against(new StaticOpposition(6)).roll(roller).character.advance('Speed Climbing').claim();
    expect([partial.diceUpgradeXpSpent, partial.totalXpSpent, partial.character.xp]).toEqual([1, 1, 1]);
  });
  it('CHR-BASIC-18: advance().claim() throws /no pending advancement/i when none exists or when claiming twice', () => {
    const bob = Character.create('Bob');
    expect(() => bob.advance('Jumping').claim()).toThrow(/no pending advancement/i);
    const afterRoll = bob.makeCheck('Do Anything').against(new StaticOpposition(3)).roll(new StubDiceRoller([6])).character;
    expect(() => afterRoll.dismissAdvancement().advance('Jumping').claim()).toThrow(/no pending advancement/i);
    const first = afterRoll.advance('Jumping').claim();
    const snapshotSkills = first.character.skills;
    expect(() => first.character.advance('Vaulting').claim()).toThrow(/no pending advancement/i);
    expect([first.character.skills, first.character.xp, first.character.pendingAdvancement]).toEqual([snapshotSkills, 0, null]);
  });
  it('CHR-BASIC-19: blank or duplicate newSkillName throws and preserves pendingAdvancement for valid retry', () => {
    const bob = Character.create('Bob').addSkill('Cooking', 2);
    const afterRoll = bob.makeCheck('Do Anything').against(new StaticOpposition(3)).roll(new StubDiceRoller([6])).character;
    const pending = afterRoll.pendingAdvancement;
    expect(pending).not.toBeNull();
    for (const blank of ['', '   ']) expect(() => afterRoll.advance(blank).claim()).toThrow(/blank/i);
    for (const dup of ['Do Anything', '  do anything  ', 'COOKING']) expect(() => afterRoll.advance(dup).claim()).toThrow(/duplicate/i);
    expect([afterRoll.pendingAdvancement, afterRoll.skills.length]).toEqual([pending, 2]);
    const retried = afterRoll.advance('Baking').claim();
    expect(retried.character).not.toBe(afterRoll);
    expect([afterRoll.pendingAdvancement, retried.createdSkill.name, retried.createdSkill.level, retried.character.pendingAdvancement]).toEqual([pending, 'Baking', 2, null]);
  });
});

describe('character module — character-vs-character opposed checks', () => {
  it('CHR-BASIC-20: actor beating defender awards 0 XP to actor and +1 XP + pendingAdvancement to defender', () => {
    const [alice, bob] = [Character.create('Alice'), Character.create('Bob')];
    const [aliceStarter, bobStarter, roller] = [alice.skill(DEFAULT_STARTING_SKILL_NAME), bob.skill(DEFAULT_STARTING_SKILL_NAME), new StubDiceRoller([5, 2])];
    const ready: ReadyOpposedCharacterCheck = alice.makeCheck('Do Anything').withAction('Disarm').againstCharacter(bob, 'do anything');
    expect(ready).toBeInstanceOf(ReadyOpposedCharacterCheck);
    const outcome: OpposedCharacterCheckOutcome = ready.roll(roller);
    expect([outcome instanceof OpposedCharacterCheckOutcome, outcome.actor !== alice, outcome.defender !== bob]).toEqual([true, true, true]);
    expect([alice.xp, alice.pendingAdvancement, bob.xp, bob.pendingAdvancement]).toEqual([0, null, 0, null]);
    expect([outcome.checkResult.actor.rawDice, outcome.checkResult.opposition.pool?.rawDice, outcome.checkResult.opposition.total, outcome.checkResult.outcome, outcome.checkResult.margin, roller.remaining]).toEqual([[5], [2], 2, 'success', 3, 0]);
    expect([outcome.actorSkill, outcome.defenderSkill, outcome.actorXpEarned, outcome.defenderXpEarned]).toEqual([aliceStarter, bobStarter, 0, 1]);
    expect([outcome.actor.xp, outcome.actor.pendingAdvancement]).toEqual([0, null]);
    const dp = outcome.defender.pendingAdvancement!;
    expect([dp instanceof PendingAdvancement, outcome.defender.xp, dp.usedSkillId, dp.usedSkillName, dp.usedSkillLevel, dp.rawDice, dp.checkOutcome, dp.xpCostToAdvance, dp.targetLevel]).toEqual([true, 1, bobStarter.id, 'Do Anything', 1, [2], 'failure', 1, 2]);
    expect(() => alice.makeCheck('Do Anything').againstCharacter(bob, 'Nonexistent').roll(new StubDiceRoller([3, 3]))).toThrow(/skill not found/i);
  });
  it('CHR-BASIC-21: actor losing to defender awards +1 XP to actor, 0 XP to defender, and rolls multi-die skill levels', () => {
    const [alice, bob] = [Character.create('Alice'), Character.create('Bob')];
    const outcome = alice.makeCheck('Do Anything').withAction('Tackle').againstCharacter(bob, 'Do Anything').roll(new StubDiceRoller([2, 5]));
    expect([outcome.actor !== alice, outcome.defender !== bob, alice.xp, bob.xp]).toEqual([true, true, 0, 0]);
    expect([outcome.checkResult.outcome, outcome.checkResult.margin, outcome.actorXpEarned, outcome.defenderXpEarned]).toEqual(['failure', -3, 1, 0]);
    const ap = outcome.actor.pendingAdvancement!;
    expect([outcome.actor.xp, ap.usedSkillId, ap.rawDice, ap.checkOutcome, ap.actionDescription, ap.xpCostToAdvance]).toEqual([1, alice.skill(DEFAULT_STARTING_SKILL_NAME).id, [2], 'failure', 'Tackle', 1]);
    expect([outcome.defender.xp, outcome.defender.pendingAdvancement]).toEqual([0, null]);

    const aliceBrawl = alice.addSkill('Brawl', 2);
    const bobPending = bob.makeCheck('Do Anything').against(new StaticOpposition(3)).roll(new StubDiceRoller([6])).character.addSkill('Dodge', 3);
    const multi = aliceBrawl.makeCheck('Brawl').againstCharacter(bobPending, bobPending.skill('Dodge').id).roll(new StubDiceRoller([1, 2, 3, 4, 5]));
    expect([multi.checkResult.actor.rawDice, multi.checkResult.opposition.pool?.rawDice, multi.actor.xp, multi.actor.pendingAdvancement, multi.defender.xp, multi.defender.pendingAdvancement, bobPending.pendingAdvancement !== null]).toEqual([[1, 2], [3, 4, 5], 1, null, 0, null, true]);
  });
  it('CHR-BASIC-22: Basic Rules tie (actor === defender, tiesMode fail) fails for actor (+1 XP) and awards 0 XP to defender', () => {
    const [alice, bob] = [Character.create('Alice'), Character.create('Bob')];
    const outcome = alice.makeCheck('Do Anything').againstCharacter(bob, 'Do Anything').roll(new StubDiceRoller([4, 4]));
    expect([outcome.actor !== alice, outcome.defender !== bob]).toEqual([true, true]);
    expect([outcome.checkResult.tiesMode, outcome.checkResult.outcome, outcome.checkResult.margin, outcome.actorXpEarned, outcome.defenderXpEarned]).toEqual(['fail', 'failure', 0, 1, 0]);
    expect([outcome.actor.xp, outcome.actor.pendingAdvancement?.actionDescription, outcome.actor.pendingAdvancement?.xpCostToAdvance, outcome.defender.xp, outcome.defender.pendingAdvancement]).toEqual([1, undefined, 1, 0, null]);
  });
  it('CHR-BASIC-23: both actor and defender receive independent claimable pendingAdvancement when both qualify', () => {
    const [alice, bob] = [Character.create('Alice'), Character.create('Bob')];
    const outcome = alice.makeCheck('Do Anything').againstCharacter(bob, 'Do Anything').roll(new StubDiceRoller([2, 6]));
    expect([outcome.actor !== alice, outcome.defender !== bob, outcome.checkResult.outcome, outcome.actorXpEarned, outcome.defenderXpEarned]).toEqual([true, true, 'failure', 1, 0]);
    const [ap, dp] = [outcome.actor.pendingAdvancement!, outcome.defender.pendingAdvancement!];
    expect([outcome.actor.xp, ap.xpCostToAdvance, ap.naturalAllSixes, ap.checkOutcome, outcome.defender.xp, dp.xpCostToAdvance, dp.naturalAllSixes, dp.checkOutcome]).toEqual([1, 1, false, 'failure', 0, 0, true, 'success']);
    const [aliceAdv, bobAdv] = [outcome.actor.advance('Feint').claim(), outcome.defender.advance('Parry').claim()];
    expect([aliceAdv.createdSkill.name, aliceAdv.createdSkill.level, aliceAdv.totalXpSpent, aliceAdv.character.xp, bobAdv.createdSkill.name, bobAdv.createdSkill.level, bobAdv.totalXpSpent, bobAdv.character.xp]).toEqual(['Feint', 2, 1, 0, 'Parry', 2, 0, 0]);

    const mirror = alice.makeCheck('Do Anything').againstCharacter(bob, 'Do Anything').roll(new StubDiceRoller([6, 2]));
    expect([mirror.actor.xp, mirror.actor.pendingAdvancement?.xpCostToAdvance, mirror.actor.pendingAdvancement?.checkOutcome, mirror.defender.xp, mirror.defender.pendingAdvancement?.xpCostToAdvance, mirror.defender.pendingAdvancement?.checkOutcome]).toEqual([0, 0, 'success', 1, 1, 'failure']);
  });
});

describe('character module — serialization & deserialization', () => {
  it('CHR-BASIC-24: round-trips Character with multiple skills, XP, and active pendingAdvancement without storing derived getters', () => {
    const bob = Character.create('Bob', { id: 'char-bob' });
    const doAnything = bob.skill(DEFAULT_STARTING_SKILL_NAME);
    const skilled = bob.addSkill('Athletics', 2, { parentSkillId: doAnything.id }).addSkill('Cooking', 1);
    const char = skilled.makeCheck('Athletics').withAction('Vault wall').against(new StaticOpposition(10)).roll(new StubDiceRoller([2, 6])).character;
    const json = char.serialize();
    const parsed = JSON.parse(json) as { schemaVersion: unknown; pendingAdvancement: Record<string, unknown> };
    expect([parsed.schemaVersion, 'targetLevel' in parsed.pendingAdvancement, 'xpCostToAdvance' in parsed.pendingAdvancement, 'naturalAllSixes' in parsed.pendingAdvancement]).toEqual([1, false, false, false]);
    const restored = Character.deserialize(json);
    expect([restored !== char, restored instanceof Character, restored.skills.every((s) => s instanceof Skill)]).toEqual([true, true, true]);
    expect([restored.id, restored.name, restored.xp, restored.skills, restored.statuses, restored.purchasedSlots]).toEqual(['char-bob', 'Bob', 1, char.skills, [], {}]);
    const rp = restored.pendingAdvancement!;
    expect([rp instanceof PendingAdvancement, rp.rollId, rp.usedSkillId, rp.usedSkillName, rp.usedSkillLevel, rp.rawDice, rp.checkOutcome, rp.actionDescription, rp.targetLevel, rp.xpCostToAdvance, rp.naturalAllSixes])
      .toEqual([true, char.pendingAdvancement!.rollId, skilled.skill('Athletics').id, 'Athletics', 2, [2, 6], 'failure', 'Vault wall', 3, 1, false]);
    const claimed = restored.advance('Dodge').claim();
    expect([claimed.createdSkill.name, claimed.createdSkill.level, claimed.createdSkill.parentSkillId, claimed.totalXpSpent, claimed.character.xp, claimed.character.pendingAdvancement])
      .toEqual(['Dodge', 3, skilled.skill('Athletics').id, 1, 0, null]);

    const noAction = Character.deserialize(bob.makeCheck('Do Anything').against(new StaticOpposition(3)).roll(new StubDiceRoller([6])).character.serialize());
    expect([noAction.pendingAdvancement?.actionDescription, noAction.pendingAdvancement?.naturalAllSixes, noAction.pendingAdvancement?.xpCostToAdvance]).toEqual([undefined, true, 0]);
  });
  it('CHR-BASIC-25: round-trips Character when pendingAdvancement is null and preserves working check methods', () => {
    const original = Character.create('Bob').addSkill('Run', 2);
    const restored = Character.deserialize(original.serialize());
    expect([restored !== original, restored instanceof Character, restored.skills.every((s) => s instanceof Skill)]).toEqual([true, true, true]);
    expect([restored.id, restored.name, restored.xp, restored.skills, restored.pendingAdvancement, restored.statuses, restored.purchasedSlots])
      .toEqual([original.id, 'Bob', 0, original.skills, null, [], {}]);
    const check = restored.makeCheck('Run').against(new StaticOpposition(3)).roll(new StubDiceRoller([2, 4]));
    expect([check.checkResult.outcome, check.checkResult.actor.rawTotal, check.character.xp]).toEqual(['success', 6, 0]);
  });
  it('CHR-BASIC-26: Character.deserialize rejects malformed JSON, bad schemaVersion, and invalid or missing fields', () => {
    const seeded = Character.create('Bob').makeCheck('Do Anything').withAction('Leap').against(new StaticOpposition(5)).roll(new StubDiceRoller([2])).character;
    const base = JSON.parse(seeded.serialize()) as Record<string, unknown>;
    const firstSkill = (base.skills as Record<string, unknown>[])[0]!;
    const pa = base.pendingAdvancement as Record<string, unknown>;
    const badPayloads: unknown[] = [
      { ...base, schemaVersion: 99 }, { ...base, schemaVersion: undefined },
      { ...base, id: 123 }, { ...base, id: '   ' }, { ...base, name: 123 }, { ...base, name: '   ' },
      { ...base, xp: -1 }, { ...base, xp: 1.5 }, { ...base, xp: '0' },
      { ...base, skills: 'bad' }, { ...base, skills: [] }, { ...base, skills: [null] },
      { ...base, skills: [{ ...firstSkill, id: 123 }] }, { ...base, skills: [{ ...firstSkill, id: '  ' }] },
      { ...base, skills: [{ ...firstSkill, name: 123 }] }, { ...base, skills: [{ ...firstSkill, name: '  ' }] },
      { ...base, skills: [{ ...firstSkill, level: 0 }] }, { ...base, skills: [{ ...firstSkill, level: 1.5 }] },
      { ...base, skills: [{ ...firstSkill, parentSkillId: 123 }] },
      { ...base, skills: [firstSkill, { ...firstSkill, id: 'sk-dup', name: '  do anything ' }] },
      { ...base, pendingAdvancement: 'bad' }, { ...base, pendingAdvancement: [] },
      { ...base, pendingAdvancement: { ...pa, rollId: '  ' } }, { ...base, pendingAdvancement: { ...pa, rollId: 123 } },
      { ...base, pendingAdvancement: { ...pa, usedSkillId: '  ' } }, { ...base, pendingAdvancement: { ...pa, usedSkillName: '  ' } },
      { ...base, pendingAdvancement: { ...pa, usedSkillLevel: 0 } }, { ...base, pendingAdvancement: { ...pa, usedSkillLevel: 1.5 } },
      { ...base, pendingAdvancement: { ...pa, rawDice: 'bad' } }, { ...base, pendingAdvancement: { ...pa, rawDice: [] } }, { ...base, pendingAdvancement: { ...pa, rawDice: [7] } },
      { ...base, pendingAdvancement: { ...pa, checkOutcome: 'bogus' } }, { ...base, pendingAdvancement: { ...pa, actionDescription: 123 } },
    ];
    for (const raw of ['{bad', 'null', '[]', '42', '{"schemaVersion":99}', '{"schemaVersion":1,"name":""}', ...badPayloads.map((p) => JSON.stringify(p))]) {
      expect(() => Character.deserialize(raw)).toThrow();
    }
  });
});
