import { describe, expect, it } from 'vitest';
import { StubDiceRoller, type DieValue } from '../dice';
import { RolledOpposition, StaticOpposition } from '../checks';
import { AdvancementOutcome, Character, CharacterAdvancementBuilder, CharacterBuilder, CharacterCheckBuilder, CharacterCheckOutcome, DEFAULT_STARTING_SKILL_NAME, OpposedCharacterCheckOutcome, OpposedParticipantBuilder, PendingAdvancement, ReadyCharacterCheck, ReadyOpposedCharacterCheck, Skill, SkillSlotConfig, SkillSlotSummary, Status } from './index';

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

describe('character module — Ties (withTiesMode)', () => {
  it('CHR-TIE-01: character tie with withTiesMode("twist") earns 0 XP while preserving immutability and win/loss behavior', () => {
    const bob = Character.create('Bob').addSkill('Climbing', 2);
    const baseBuilder = bob.makeCheck('Climbing');
    const twistBuilder = baseBuilder.withTiesMode('twist');
    expect(twistBuilder).not.toBe(baseBuilder);
    const beforeTie = twistBuilder.against(new StaticOpposition(7)).roll(new StubDiceRoller([3, 4]));
    const baseFail = baseBuilder.against(new StaticOpposition(7)).roll(new StubDiceRoller([3, 4]));
    expect(beforeTie.character).not.toBe(bob);
    expect([bob.xp, beforeTie.checkResult.tiesMode, beforeTie.checkResult.outcome, beforeTie.checkResult.margin, beforeTie.xpEarned, beforeTie.character.xp, beforeTie.canAdvance, beforeTie.character.pendingAdvancement])
      .toEqual([0, 'twist', 'tie', 0, 0, 0, false, null]);
    expect([baseFail.checkResult.tiesMode, baseFail.checkResult.outcome, baseFail.xpEarned, baseFail.character.xp]).toEqual(['fail', 'failure', 1, 1]);

    const baseReady = baseBuilder.against(new StaticOpposition(7));
    const twistReady = baseReady.withTiesMode('twist');
    const failReady = twistReady.withTiesMode('fail');
    expect(twistReady).not.toBe(baseReady);
    expect(failReady).not.toBe(twistReady);
    const [afterTie, origFail, switchedFail, win, loss] = [
      twistReady.roll(new StubDiceRoller([3, 4])), baseReady.roll(new StubDiceRoller([3, 4])),
      failReady.roll(new StubDiceRoller([3, 4])), twistReady.roll(new StubDiceRoller([4, 5])), twistReady.roll(new StubDiceRoller([2, 3])),
    ];
    expect([afterTie.checkResult.outcome, afterTie.xpEarned, afterTie.character.xp, origFail.checkResult.outcome, origFail.xpEarned, switchedFail.checkResult.outcome, switchedFail.xpEarned, win.checkResult.outcome, win.xpEarned, loss.checkResult.outcome, loss.xpEarned])
      .toEqual(['tie', 0, 0, 'failure', 1, 'failure', 1, 'success', 0, 'failure', 1]);
  });

  it('CHR-TIE-02: allows advancement on a "tie" via natural all-6s (0 XP) or banked XP', () => {
    const bob = Character.create('Bob');
    const natTie = bob.makeCheck('Do Anything').withTiesMode('twist').withAction('Grab ledge').against(new StaticOpposition(6)).roll(new StubDiceRoller([6]));
    expect(natTie.character).not.toBe(bob);
    const np = natTie.character.pendingAdvancement!;
    const restoredNat = Character.deserialize(natTie.character.serialize());
    const natClaim = restoredNat.advance('Grip').claim();
    expect([natTie.checkResult.outcome, natTie.xpEarned, natTie.character.xp, natTie.canAdvanceNaturally, np.checkOutcome, np.actionDescription, np.xpCostToAdvance, restoredNat.pendingAdvancement?.checkOutcome, natClaim.createdSkill.name, natClaim.createdSkill.level, natClaim.totalXpSpent])
      .toEqual(['tie', 0, 0, true, 'tie', 'Grab ledge', 0, 'tie', 'Grip', 2, 0]);

    const bobWith1Xp = Character.create('Bob').addSkill('Climbing', 2).makeCheck('Do Anything').against(new StaticOpposition(6)).roll(new StubDiceRoller([1])).character;
    const bankedTie = bobWith1Xp.makeCheck('Climbing').withAction('Scale wall').withTiesMode('twist').against(new StaticOpposition(9)).roll(new StubDiceRoller([6, 3]));
    expect(bankedTie.character).not.toBe(bobWith1Xp);
    const bp = bankedTie.character.pendingAdvancement!;
    const claimed = bankedTie.character.advance('Ledge Grab').claim();
    expect(claimed.character).not.toBe(bankedTie.character);
    expect([bankedTie.checkResult.outcome, bankedTie.xpEarned, bankedTie.character.xp, bp.checkOutcome, bp.actionDescription, bp.xpCostToAdvance, claimed.createdSkill.name, claimed.createdSkill.level, claimed.totalXpSpent, claimed.character.xp, claimed.character.pendingAdvancement])
      .toEqual(['tie', 0, 1, 'tie', 'Scale wall', 1, 'Ledge Grab', 3, 1, 0, null]);
  });

  it('CHR-TIE-03: character-vs-character opposed tie with "twist" awards 0 XP to both and preserves natural-6 advancement', () => {
    const [alice, bob] = [Character.create('Alice'), Character.create('Bob')];
    const beforeBuilder = alice.makeCheck('Do Anything').withTiesMode('twist').withAction('Parry');
    const beforeRes = beforeBuilder.againstCharacter(bob, 'Do Anything').roll(new StubDiceRoller([4, 4]));
    expect([beforeRes.actor !== alice, beforeRes.defender !== bob, beforeRes.checkResult.outcome, beforeRes.checkResult.tiesMode, beforeRes.checkResult.margin, beforeRes.actorXpEarned, beforeRes.defenderXpEarned, beforeRes.actor.xp, beforeRes.defender.xp, beforeRes.actor.pendingAdvancement, beforeRes.defender.pendingAdvancement])
      .toEqual([true, true, 'tie', 'twist', 0, 0, 0, 0, 0, null, null]);

    const baseOpposed = alice.makeCheck('Do Anything').againstCharacter(bob, 'Do Anything');
    const twistOpposed = baseOpposed.withTiesMode('twist');
    const failOpposed = twistOpposed.withTiesMode('fail');
    expect(twistOpposed).not.toBe(baseOpposed);
    expect(failOpposed).not.toBe(twistOpposed);
    const [afterRes, origRes, switchedRes, sixTie] = [
      twistOpposed.roll(new StubDiceRoller([4, 4])), baseOpposed.roll(new StubDiceRoller([4, 4])),
      failOpposed.roll(new StubDiceRoller([4, 4])), twistOpposed.roll(new StubDiceRoller([6, 6])),
    ];
    expect([afterRes.checkResult.outcome, afterRes.actorXpEarned, afterRes.defenderXpEarned, origRes.checkResult.outcome, origRes.actorXpEarned, origRes.defenderXpEarned, switchedRes.checkResult.outcome, switchedRes.actorXpEarned])
      .toEqual(['tie', 0, 0, 'failure', 1, 0, 'failure', 1]);
    const [ap, dp] = [sixTie.actor.pendingAdvancement!, sixTie.defender.pendingAdvancement!];
    expect([sixTie.checkResult.outcome, sixTie.actorXpEarned, sixTie.defenderXpEarned, sixTie.actor.xp, sixTie.defender.xp, ap.checkOutcome, ap.xpCostToAdvance, dp.checkOutcome, dp.xpCostToAdvance])
      .toEqual(['tie', 0, 0, 0, 0, 'tie', 0, 'tie', 0]);
  });
});

describe('character module — Status & Character Status Methods', () => {
  it('CHR-STS-01: creates and rolls positive/negative Statuses and rejects invalid names, IDs, ratings, and dice counts', () => {
    const [rNeg, rPos] = [new StubDiceRoller([2, 4]), new StubDiceRoller([3])];
    const [clean, nose] = [Status.create('  Clean Shoe  ', 2), Status.create('Broken Nose', -3, { id: 'st-nose', note: 'Bar fight' })];
    const [poisoned, inspired] = [Status.roll('Poisoned', 2, 'negative', rNeg, { id: 'st-p', note: 'Venom' }), Status.roll('  Inspired ', 1, 'positive', rPos)];
    expect([clean instanceof Status, Object.isFrozen(clean), clean.id.length > 0, clean.name, clean.rating, clean.note, nose.id, nose.rating, nose.note, poisoned.id, poisoned.name, poisoned.rating, poisoned.note, rNeg.remaining, inspired.name, inspired.rating, inspired.note, rPos.remaining])
      .toEqual([true, true, true, 'Clean Shoe', 2, undefined, 'st-nose', -3, 'Bar fight', 'st-p', 'Poisoned', -6, 'Venom', 0, 'Inspired', 3, undefined, 0]);
    for (const bad of ['', '   ']) { expect(() => Status.create(bad, 1)).toThrow(); expect(() => Status.roll(bad, 1, 'positive', new StubDiceRoller([2]))).toThrow(); }
    expect(() => Status.create('Cut', -1, { id: '   ' })).toThrow();
    for (const badRating of [0, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) expect(() => Status.create('Bad', badRating)).toThrow();
    for (const badDice of [0, -1, 1.5, Number.NaN]) expect(() => Status.roll('Bad', badDice, 'negative', new StubDiceRoller([2]))).toThrow();
  });
  it('CHR-STS-02: attaches, selectively applies, preserves, and removes statuses immutably by ID or case-insensitive name', () => {
    const [clean, nose] = [Status.create('Clean Shoe', 2, { id: 'st-clean' }), Status.create('Broken Nose', -3, { id: 'st-nose' })];
    const bob0 = Character.create('Bob').addSkill('Karate', 2);
    const bob1 = bob0.addStatus(clean);
    const bob2 = bob1.addStatus(nose);
    const [b1, b2] = [bob2.makeCheck('Karate'), bob2.makeCheck('Karate').withStatus('  clean shoe  ')];
    const b3 = b2.withModifier('Focus', 1).withTiesMode('twist').withAction('Kick');
    for (const [prev, next] of [[bob0, bob1], [bob1, bob2], [b1, b2], [b2, b3]] as const) expect(next).not.toBe(prev);
    const [rClean, rChained, rUnmod, rById] = [
      b2.against(new StaticOpposition(6)).roll(new StubDiceRoller([2, 3])), b3.against(new StaticOpposition(8)).roll(new StubDiceRoller([2, 3])),
      b1.against(new StaticOpposition(6)).roll(new StubDiceRoller([2, 3])), bob2.makeCheck('Karate').withStatus('st-nose').against(new StaticOpposition(4)).roll(new StubDiceRoller([3, 3])),
    ];
    expect([bob0.statuses, bob1.statuses, bob2.statuses, Object.isFrozen(bob2.statuses), rClean.checkResult.actor.finalTotal, rClean.checkResult.outcome, rChained.checkResult.outcome, rUnmod.checkResult.outcome, rById.checkResult.actor.finalTotal, rById.checkResult.outcome])
      .toEqual([[], [clean], [clean, nose], true, 7, 'success', 'tie', 'failure', 3, 'failure']);
    const failed = bob2.makeCheck('Do Anything').against(new StaticOpposition(5)).roll(new StubDiceRoller([1])).character;
    expect([failed.statuses, failed.addSkill('Cook', 2).statuses, failed.dismissAdvancement().statuses, failed.advance('Sneak').claim().character.statuses])
      .toEqual([[clean, nose], [clean, nose], [clean, nose], [clean, nose]]);
    const withoutClean = bob2.removeStatus('  CLEAN SHOE  ');
    const withoutBoth = withoutClean.removeStatus('st-nose');
    expect([withoutClean !== bob2, withoutBoth !== withoutClean, bob2.statuses, withoutClean.statuses, withoutBoth.statuses, withoutClean.makeCheck('Karate').against(new StaticOpposition(6)).roll(new StubDiceRoller([2, 3])).checkResult.outcome])
      .toEqual([true, true, [clean, nose], [nose], [], 'failure']);
    for (const bad of ['Clean Shoe', 'Unknown', '   ']) { expect(() => withoutClean.makeCheck('Karate').withStatus(bad)).toThrow(); expect(() => withoutClean.removeStatus(bad)).toThrow(); }
  });
  it('CHR-STS-03: applies defender statuses and modifiers in againstCharacter immutably and rejects unknown defender status', () => {
    const [alice, bob] = [Character.create('Alice'), Character.create('Bob').addStatus(Status.create('Shield', 2, { id: 'st-sh' })).addStatus(Status.create('Slow', -5, { id: 'st-sl' }))];
    let builders!: readonly [OpposedParticipantBuilder, OpposedParticipantBuilder, OpposedParticipantBuilder];
    const res = alice.makeCheck('Do Anything').withModifier('Lunge', 1).againstCharacter(bob, 'Do Anything', (b) => {
      const s = b.withStatus('  shield '); const m = s.withModifier('Cover', 1); builders = [b, s, m]; return m;
    }).roll(new StubDiceRoller([4, 3]));
    const byId = alice.makeCheck('Do Anything').againstCharacter(bob, 'Do Anything', (b) => b.withStatus('st-sl')).roll(new StubDiceRoller([2, 5]));
    expect([builders[0] instanceof OpposedParticipantBuilder, builders[1] !== builders[0], builders[2] !== builders[1], res.checkResult.actor.finalTotal, res.checkResult.opposition.total, res.checkResult.outcome, res.actorXpEarned, res.defenderXpEarned, res.actor.xp, res.defender.statuses, byId.checkResult.opposition.total, byId.checkResult.outcome, byId.defenderXpEarned])
      .toEqual([true, true, true, 5, 6, 'failure', 1, 0, 1, bob.statuses, 0, 'success', 1]);
    expect(() => alice.makeCheck('Do Anything').againstCharacter(bob, 'Do Anything', (b) => b.withStatus('Missing'))).toThrow();
  });
  it('CHR-STS-04: status or modifier penalty causing failure awards +1 XP while preserving natural all-6s 0 XP advancement', () => {
    const bob = Character.create('Bob').addStatus(Status.create('Raining', -4));
    const viaMod = Character.create('Bob').makeCheck('Do Anything').withModifier('Raining', -4).against(new StaticOpposition(3)).roll(new StubDiceRoller([6]));
    const viaStatus = bob.makeCheck('Do Anything').withStatus('Raining').against(new StaticOpposition(3)).roll(new StubDiceRoller([6]));
    const claimed = viaStatus.character.advance('Rain Grip').claim();
    expect([viaMod.checkResult.actor.finalTotal, viaMod.checkResult.outcome, viaMod.xpEarned, viaMod.character.pendingAdvancement?.xpCostToAdvance, viaStatus.checkResult.actor.finalTotal, viaStatus.xpEarned, claimed.totalXpSpent, claimed.character.xp])
      .toEqual([2, 'failure', 1, 0, 2, 1, 0, 1]);
  });
  it('CHR-STS-05: round-trips Character statuses through serialize/deserialize and rejects malformed status payloads', () => {
    const bob = Character.create('Bob').addStatus(Status.create('Clean Shoe', 2, { id: 's-1' })).addStatus(Status.create('Broken Nose', -3, { id: 's-2', note: 'Bruised' }));
    const restored = Character.deserialize(bob.serialize());
    expect([restored !== bob, restored.statuses.every((s) => s instanceof Status), restored.statuses, restored.makeCheck('Do Anything').withStatus('Clean Shoe').against(new StaticOpposition(5)).roll(new StubDiceRoller([4])).checkResult.outcome])
      .toEqual([true, true, bob.statuses, 'success']);
    const base = JSON.parse(bob.serialize()) as Record<string, unknown>;
    for (const badStatuses of ['bad', [null], [{ id: ' ', name: 'A', rating: 1 }], [{ id: 's', name: ' ', rating: 1 }], [{ id: 's', name: 'A', rating: 0 }], [{ id: 's', name: 'A', rating: 1.5 }], [{ id: 's', name: 'A', rating: 1, note: 9 }]]) {
      expect(() => Character.deserialize(JSON.stringify({ ...base, statuses: badStatuses }))).toThrow();
    }
  });
});

describe('character module — Custom Starting Skills', () => {
  it('CHR-START-01: Character.builder().withStartingSkill() adds trimmed starting skills alongside Do Anything 1 immutably', () => {
    const b0 = Character.builder('Ada');
    const [b1, bId] = [b0.withStartingSkill('  Hacking  ', 2), b0.withId('c-alt')];
    const [b2, bAlt] = [b1.withStartingSkill('Pilot', 3), bId.withStartingSkill('Stealth', 1)];
    const b3 = b2.withId('c-ada');
    for (const [prev, next] of [[b0, b1], [b1, b2], [b2, b3], [b0, bId], [bId, bAlt]] as const) expect(next).not.toBe(prev);
    const [plain, oneSkill, twoSkills, ada, alt, roller] = [b0.build(), b1.build(), b2.build(), b3.build(), bAlt.build(), new StubDiceRoller([4, 5])];
    const check = ada.makeCheck('hacking').against(new StaticOpposition(6)).roll(roller);
    expect([plain.skills.length, oneSkill.skills.length, twoSkills.skills.length, twoSkills.id !== 'c-ada', ada.id, ada.xp, ada.pendingAdvancement, Object.isFrozen(ada.skills), ada.skills.every((s) => s instanceof Skill && s.parentSkillId === undefined), ada.skills.map((s) => [s.name, s.level]), alt.id, alt.skills.map((s) => [s.name, s.level]), check.character !== ada, check.checkResult.actor.rawDice, check.checkResult.actor.rawTotal, check.checkResult.outcome, roller.remaining, Character.deserialize(ada.serialize()).skills])
      .toEqual([1, 2, 3, true, 'c-ada', 0, null, true, true, [[DEFAULT_STARTING_SKILL_NAME, 1], ['Hacking', 2], ['Pilot', 3]], 'c-alt', [[DEFAULT_STARTING_SKILL_NAME, 1], ['Stealth', 1]], true, [4, 5], 9, 'success', 0, ada.skills]);
  });
  it('CHR-START-02: rejects duplicate Do Anything, duplicate custom names, blank names, and invalid levels without mutating builders', () => {
    const b0 = Character.builder('Ada');
    const b1 = b0.withStartingSkill('Hacking', 2);
    expect(() => b0.withStartingSkill('do anything', 2).build()).toThrow();
    for (const badName of ['', '   ', 'Do Anything', 'do anything', '  DO ANYTHING  ', 'Hacking', '  hacking ']) expect(() => b1.withStartingSkill(badName, 2).build()).toThrow();
    for (const badLevel of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) expect(() => b1.withStartingSkill('Pilot', badLevel).build()).toThrow(RangeError);
    expect([b0.build().skills.map((s) => s.name), b1.build().skills.map((s) => [s.name, s.level])])
      .toEqual([[DEFAULT_STARTING_SKILL_NAME], [[DEFAULT_STARTING_SKILL_NAME, 1], ['Hacking', 2]]]);
  });
});

describe('character module — SkillSlotConfig, Slot Caps & Skill Replacement', () => {
  it('CHR-SLOT-01: configures SkillSlotConfig defaults (allowSlotPurchase=false, L1 null, L5 1 vs 0) and validates inputs', () => {
    const [tri, triFalse, triBuy] = [SkillSlotConfig.triangle(), SkillSlotConfig.triangle({ allowSlotPurchase: false }), SkillSlotConfig.triangle({ allowSlotPurchase: true })];
    const rawLimits: Record<number, number> = { 2: 2, 3: 0 };
    const [custom, emptyCfg] = [new SkillSlotConfig({ limitsByLevel: rawLimits, defaultSlotsAboveMax: 3 }), new SkillSlotConfig({ limitsByLevel: {} })];
    rawLimits[2] = 99;
    expect([tri instanceof SkillSlotConfig, Object.isFrozen(tri), Object.isFrozen(tri.limitsByLevel), tri.limitsByLevel, tri.allowSlotPurchase, tri.defaultSlotsAboveMax, triFalse.allowSlotPurchase, triFalse.defaultSlotsAboveMax, [1, 2, 3, 4, 5].map((l) => tri.baseLimitForLevel(l)), triBuy.allowSlotPurchase, triBuy.defaultSlotsAboveMax, [1, 2, 5].map((l) => triBuy.baseLimitForLevel(l)), custom.limitsByLevel, custom.allowSlotPurchase, custom.defaultSlotsAboveMax, [1, 2, 3, 4].map((l) => custom.baseLimitForLevel(l)), emptyCfg.baseLimitForLevel(2)])
      .toEqual([true, true, true, { 2: 4, 3: 3, 4: 2 }, false, 1, false, 1, [null, 4, 3, 2, 1], true, 0, [null, 4, 0], { 2: 2, 3: 0 }, false, 3, [null, 2, 0, 3], 1]);
    for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) expect(() => tri.baseLimitForLevel(bad)).toThrow(RangeError);
    for (const badLimits of [{ 1: 3 }, { 0: 2 }, { [-1]: 2 }, { 2.5: 2 }, { 2: -1 }, { 2: 1.5 }, { 2: Number.NaN }] as readonly Record<number, number>[]) expect(() => new SkillSlotConfig({ limitsByLevel: badLimits })).toThrow(RangeError);
    for (const badAbove of [-1, 1.5, Number.NaN]) expect(() => new SkillSlotConfig({ limitsByLevel: { 2: 2 }, defaultSlotsAboveMax: badAbove })).toThrow(RangeError);
  });
  it('CHR-SLOT-02: fills Level 2 up to cap (4/4) via withSlotConfig and computes SkillSlotSummary getters', () => {
    const [tri, roller] = [SkillSlotConfig.triangle(), new StubDiceRoller([6, 6, 6, 6])];
    let char = Character.create('Bob');
    const [sUnres, sNull, sL1, s0] = [char.getSkillSlotSummary(2), char.getSkillSlotSummary(2, null), char.getSkillSlotSummary(1, tri), char.getSkillSlotSummary(2, tri)];
    const rolled1 = char.makeCheck('Do Anything').against(new StaticOpposition(3)).roll(roller).character;
    const [b0, b1] = [rolled1.advance('S1'), rolled1.advance('S1').withSlotConfig(tri)];
    expect([b1 !== b0, b1.withSlotConfig(null) !== b1, sUnres instanceof SkillSlotSummary, Object.isFrozen(sUnres)]).toEqual([true, true, true, true]);
    char = b1.claim().character;
    const s1 = char.getSkillSlotSummary(2, tri);
    for (const name of ['S2', 'S3', 'S4']) char = char.makeCheck('Do Anything').against(new StaticOpposition(3)).roll(roller).character.advance(name).withSlotConfig(tri).claim().character;
    const [s4, s4Null, sL3] = [char.getSkillSlotSummary(2, tri), char.getSkillSlotSummary(2, null), char.getSkillSlotSummary(3, tri)];
    expect([[sUnres.maxSlots, sUnres.usedSlots, sUnres.availableSlots, sUnres.nextSlotXpCost], [sNull.maxSlots, sNull.availableSlots], [sL1.level, sL1.maxSlots, sL1.usedSlots, sL1.availableSlots, sL1.nextSlotXpCost], [s0.maxSlots, s0.usedSlots, s0.availableSlots], [s1.usedSlots, s1.availableSlots], [s4.level, s4.maxSlots, s4.usedSlots, s4.effectivePurchasedSlots, s4.availableSlots, s4.nextSlotXpCost], [s4Null.maxSlots, s4Null.usedSlots, s4Null.availableSlots], [sL3.maxSlots, sL3.availableSlots, sL3.nextSlotXpCost], roller.remaining])
      .toEqual([[null, 0, null, 4], [null, null], [1, null, 1, null, 2], [4, 0, 4], [1, 3], [2, 4, 4, 0, 0, 4], [null, 4, null], [3, 3, 6], 0]);
    for (const bad of [0, -1, 1.5, Number.NaN]) expect(() => char.getSkillSlotSummary(bad, tri)).toThrow(RangeError);
  });
  it('CHR-SLOT-03: rejects advancement and addSkill into a full level without replacement while keeping pendingAdvancement intact', () => {
    const [tri, triBuy] = [SkillSlotConfig.triangle(), SkillSlotConfig.triangle({ allowSlotPurchase: true })];
    const full = Character.builder('Bob').withStartingSkill('S1', 2).withStartingSkill('S2', 2).withStartingSkill('S3', 2).build().addSkill('S4', 2, { slotConfig: tri });
    const ready = full.makeCheck('Do Anything').against(new StaticOpposition(3)).roll(new StubDiceRoller([6])).character;
    const [pending, l5Ready] = [ready.pendingAdvancement, full.addSkill('Master', 4).makeCheck('Master').against(new StaticOpposition(3)).roll(new StubDiceRoller([6, 6, 6, 6])).character];
    for (const fn of [() => ready.advance('S5').withSlotConfig(tri).claim(), () => full.addSkill('S5', 2, { slotConfig: tri }), () => full.addSkill('Apex', 5, { slotConfig: triBuy }), () => l5Ready.advance('Apex').withSlotConfig(triBuy).claim()]) expect(fn).toThrow(/slot/i);
    const [unresAdv, unresAdd, l1Add, l5Once] = [ready.advance('S5').withSlotConfig(null).claim(), full.addSkill('S5', 2, { slotConfig: null }), full.addSkill('Jog', 1, { slotConfig: tri }), full.addSkill('Apex', 5, { slotConfig: tri })];
    expect(() => l5Once.addSkill('Apex2', 5, { slotConfig: tri })).toThrow(/slot/i);
    expect([pending !== null, ready.pendingAdvancement, l5Ready.pendingAdvancement !== null, unresAdv.createdSkill.name, unresAdd.skills.length, l1Add.skills.length, l5Once.skill('Apex').level]).toEqual([true, pending, true, 'S5', 6, 6, 5]);
  });
  it('CHR-SLOT-04: replaces same-level skills via replacingSkill / addSkill and rejects Do Anything, wrong-level, unknown, or duplicate names', () => {
    const tri = SkillSlotConfig.triangle();
    const full = Character.builder('Bob').withStartingSkill('Jog', 1).withStartingSkill('S1', 2).withStartingSkill('S2', 2).withStartingSkill('S3', 2).withStartingSkill('S4', 2).withStartingSkill('Climb', 3).build();
    const [s1, s2, ready] = [full.skill('S1'), full.skill('S2'), full.makeCheck('Do Anything').against(new StaticOpposition(3)).roll(new StubDiceRoller([6])).character];
    const [pending, b0] = [ready.pendingAdvancement, ready.advance('Parkour').withSlotConfig(tri)];
    const b1 = b0.replacingSkill('  s2  ');
    expect(b1).not.toBe(b0);
    expect(() => b0.claim()).toThrow(/slot/i);
    for (const [n, t] of [['Vault', 'Do Anything'], ['Vault', '  DO ANYTHING '], ['Vault', 'Jog'], ['Vault', 'Climb'], ['Vault', 'Ghost'], ['Vault', '   '], ['S1', 'S2'], ['  ', 'S2']] as const) expect(() => ready.advance(n).withSlotConfig(tri).replacingSkill(t).claim()).toThrow();
    for (const [n, lvl, t] of [['Dash', 1, '  do anything '], ['Swim', 2, 'Climb'], ['Swim', 2, 'Jog'], ['Swim', 2, 'Ghost'], ['S1', 2, 'S2']] as const) expect(() => full.addSkill(n, lvl, { slotConfig: tri, replaceSkillIdOrName: t })).toThrow();
    const [outByName, outById, viaAdd, noCfgAdd] = [b1.claim(), ready.advance('Vault').withSlotConfig(tri).replacingSkill(s1.id).claim(), full.addSkill('Swim', 2, { slotConfig: tri, replaceSkillIdOrName: s1.id }), full.addSkill('Cook', 2, { replaceSkillIdOrName: '  s2 ' })];
    expect([ready.pendingAdvancement, outByName.character !== ready, outByName.replacedSkill, outByName.createdSkill.name, outByName.totalXpSpent, outByName.character.getSkillSlotSummary(2, tri).usedSlots, outByName.character.skills.some((s) => s.id === s2.id), outById.replacedSkill, viaAdd !== full, viaAdd.skills.some((s) => s.id === s1.id), viaAdd.skill('Swim').level, noCfgAdd.skills.some((s) => s.id === s2.id)])
      .toEqual([pending, true, s2, 'Parkour', 0, 4, false, s1, true, false, 2, false]);
  });
  it('CHR-SLOT-05: ignores purchasedSlots when allowSlotPurchase is false and applies them when allowSlotPurchase is true', () => {
    const [triFalse, triBuy, rawSlots] = [SkillSlotConfig.triangle({ allowSlotPurchase: false }), SkillSlotConfig.triangle({ allowSlotPurchase: true }), { 2: 1 } as Record<number, number>];
    const base4 = Character.builder('Ada').withStartingSkill('S1', 2).withStartingSkill('S2', 2).withStartingSkill('S3', 2).withStartingSkill('S4', 2).build();
    const ada = Character.rehydrate(base4.id, base4.name, 0, base4.skills, null, [], rawSlots);
    rawSlots[2] = 99;
    const [sumTrue, sumTrueL3, sumFalse, sumDefault, sumNull, ready] = [ada.getSkillSlotSummary(2, triBuy), ada.getSkillSlotSummary(3, triBuy), ada.getSkillSlotSummary(2, triFalse), ada.getSkillSlotSummary(2, SkillSlotConfig.triangle()), ada.getSkillSlotSummary(2, null), ada.makeCheck('Do Anything').against(new StaticOpposition(3)).roll(new StubDiceRoller([6])).character];
    for (const fn of [() => ready.advance('S5').withSlotConfig(triFalse).claim(), () => ada.addSkill('S5', 2, { slotConfig: triFalse })]) expect(fn).toThrow(/slot/i);
    const [replacedFalse, fifthTrue, addedTrue] = [ready.advance('S5').withSlotConfig(triFalse).replacingSkill('S1').claim(), ready.advance('S5').withSlotConfig(triBuy).claim(), ada.addSkill('S5', 2, { slotConfig: triBuy })];
    const clamped = fifthTrue.character.getSkillSlotSummary(2, triFalse);
    expect([Object.isFrozen(ada.purchasedSlots), ada.purchasedSlots, ada.addStatus(Status.create('A', 1)).removeStatus('A').dismissAdvancement().purchasedSlots, ready.purchasedSlots, [sumTrue.maxSlots, sumTrue.effectivePurchasedSlots, sumTrue.availableSlots], [sumTrueL3.maxSlots, sumTrueL3.effectivePurchasedSlots], [sumFalse.maxSlots, sumFalse.effectivePurchasedSlots, sumFalse.availableSlots], [sumDefault.maxSlots, sumDefault.effectivePurchasedSlots], [sumNull.maxSlots, sumNull.effectivePurchasedSlots], replacedFalse.character.purchasedSlots, fifthTrue.character.purchasedSlots, fifthTrue.character.getSkillSlotSummary(2, triBuy).availableSlots, addedTrue.skills.length, [clamped.maxSlots, clamped.usedSlots, clamped.availableSlots]])
      .toEqual([true, { 2: 1 }, { 2: 1 }, { 2: 1 }, [5, 1, 1], [3, 0], [4, 0, 0], [4, 0], [null, 0], { 2: 1 }, { 2: 1 }, 0, 6, [4, 5, 0]]);
  });
});
