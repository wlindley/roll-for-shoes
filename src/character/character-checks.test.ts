import { describe, expect, it } from 'vitest';
import { DifficultyOpposition, DifficultyTier, RolledOpposition, StaticOpposition } from '../checks';
import { StubDiceRoller, type DieValue } from '../dice';
import { Character, DEFAULT_STARTING_SKILL_NAME, PendingAdvancement } from './index';

describe('Character.makeCheck & PendingAdvancement lifecycle', () => {
  it('resolves a successful non-6 check at 0 XP with 0 XP earned and null pendingAdvancement', () => {
    const bob = Character.create('Bob');
    const roller = new StubDiceRoller([5]);
    const outcome = bob.makeCheck('Do Anything').against(new StaticOpposition(3)).roll(roller);

    expect(outcome.character).not.toBe(bob);
    expect(outcome.skillUsed).toBe(bob.skill(DEFAULT_STARTING_SKILL_NAME));
    expect(outcome.checkResult.outcome).toBe('success');
    expect(outcome.xpEarned).toBe(0);
    expect(outcome.canAdvanceNaturally).toBe(false);
    expect(outcome.canAdvance).toBe(false);
    expect(outcome.character.xp).toBe(0);
    expect(outcome.character.pendingAdvancement).toBeNull();
    expect(roller.remaining).toBe(0);
  });

  it('throws when makeCheck references a nonexistent skill', () => {
    expect(() => Character.create('Bob').makeCheck('Teleporting')).toThrow(/not found/i);
  });

  it('awards +1 XP on failure and attaches PendingAdvancement with actionDescription when XP covers non-6s', () => {
    const bob = Character.create('Bob');
    const outcome = bob.makeCheck('do anything').withAction('Jump gap').against(new StaticOpposition(4)).roll(new StubDiceRoller([2]));
    const pending = outcome.character.pendingAdvancement!;

    expect(bob.xp).toBe(0);
    expect(outcome.xpEarned).toBe(1);
    expect(outcome.character.xp).toBe(1);
    expect(outcome.canAdvance).toBe(true);
    expect(outcome.canAdvanceNaturally).toBe(false);
    expect(pending.rollId.length).toBeGreaterThan(0);
    expect(pending).toMatchObject({
      usedSkillName: DEFAULT_STARTING_SKILL_NAME,
      rawDice: [2],
      actionDescription: 'Jump gap',
      targetLevel: 2,
      xpCostToAdvance: 1,
      naturalAllSixes: false,
    });
  });

  it('leaves pendingAdvancement null when nonSixCount exceeds XP, then unlocks once banked XP suffices', () => {
    const bob = Character.create('Bob').addSkill('Climbing', 2);
    const failed = bob.makeCheck('Climbing').against(new DifficultyOpposition(DifficultyTier.Moderate)).roll(new StubDiceRoller([2, 3]));
    const unlocked = failed.character.makeCheck('Do Anything').against(new StaticOpposition(3)).roll(new StubDiceRoller([4]));

    expect(failed.character.xp).toBe(1);
    expect(failed.character.pendingAdvancement).toBeNull();
    expect(unlocked.canAdvance).toBe(true);
    expect(unlocked.character.pendingAdvancement?.xpCostToAdvance).toBe(1);
  });

  it('attaches 0-cost PendingAdvancement on natural all-6s and defensively freezes rawDice', () => {
    const outcome = Character.create('Bob').makeCheck('Do Anything').against(new StaticOpposition(3)).roll(new StubDiceRoller([6]));
    const raw: DieValue[] = [6, 4];
    const direct = new PendingAdvancement({
      rollId: 'r-1', usedSkillId: 's-1', usedSkillName: 'Climb', usedSkillLevel: 2, rawDice: raw, checkOutcome: 'success',
    });
    raw.push(1);

    expect(outcome.canAdvanceNaturally).toBe(true);
    expect(outcome.character.pendingAdvancement?.xpCostToAdvance).toBe(0);
    expect(Object.isFrozen(direct.rawDice)).toBe(true);
    expect(direct).toMatchObject({ rollId: 'r-1', rawDice: [6, 4] });
  });

  it('clears unclaimed pendingAdvancement when a subsequent roll is ineligible', () => {
    const afterSix = Character.create('Bob').makeCheck('Do Anything').against(new StaticOpposition(3)).roll(new StubDiceRoller([6])).character;
    const afterIneligible = afterSix.makeCheck('Do Anything').against(new StaticOpposition(3)).roll(new StubDiceRoller([4])).character;

    expect(afterSix.pendingAdvancement).not.toBeNull();
    expect(afterIneligible.pendingAdvancement).toBeNull();
  });

  it('clears pendingAdvancement immutably via dismissAdvancement while preserving XP', () => {
    const failed = Character.create('Bob').makeCheck('Do Anything').against(new StaticOpposition(5)).roll(new StubDiceRoller([2])).character;
    const dismissed = failed.dismissAdvancement();

    expect(dismissed).not.toBe(failed);
    expect(dismissed.pendingAdvancement).toBeNull();
    expect(dismissed.xp).toBe(1);
  });
});

describe('TiesMode & character-vs-character opposed checks', () => {
  it('awards 0 XP on a tie when twist mode is set on CharacterCheckBuilder or ReadyCharacterCheck', () => {
    const bob = Character.create('Bob').addSkill('Climbing', 2);
    const viaBuilder = bob.makeCheck('Climbing').withTiesMode('twist').against(new StaticOpposition(7)).roll(new StubDiceRoller([3, 4]));
    const viaReady = bob.makeCheck('Climbing').against(new StaticOpposition(7)).withTiesMode('twist').roll(new StubDiceRoller([6, 1]));

    expect(viaBuilder.checkResult.outcome).toBe('tie');
    expect(viaBuilder.xpEarned).toBe(0);
    expect(viaReady.checkResult.outcome).toBe('tie');
    expect(viaReady.xpEarned).toBe(0);
  });

  it('awards +1 XP and pendingAdvancement to the defender when the actor wins an opposed check', () => {
    const alice = Character.create('Alice');
    const bob = Character.create('Bob');
    const res = alice.makeCheck('Do Anything').againstCharacter(bob, 'do anything').roll(new StubDiceRoller([5, 2]));

    expect(res.actor).not.toBe(alice);
    expect(res.defender).not.toBe(bob);
    expect(res.actorSkill).toBe(alice.skill(DEFAULT_STARTING_SKILL_NAME));
    expect(res.defenderSkill).toBe(bob.skill(DEFAULT_STARTING_SKILL_NAME));
    expect(res.actorXpEarned).toBe(0);
    expect(res.defenderXpEarned).toBe(1);
    expect(res.defender.xp).toBe(1);
    expect(res.defender.pendingAdvancement?.checkOutcome).toBe('failure');
  });

  it('grants independent claimable advancements to both failing actor (via XP) and natural-6 defender', () => {
    const res = Character.create('Alice').makeCheck('Do Anything').againstCharacter(Character.create('Bob'), 'Do Anything').roll(new StubDiceRoller([2, 6]));
    const aliceAdvanced = res.actor.advance('Dodging').claim();
    const bobAdvanced = res.defender.advance('Parrying').claim();

    expect(aliceAdvanced.totalXpSpent).toBe(1);
    expect(bobAdvanced.totalXpSpent).toBe(0);
    expect(aliceAdvanced.createdSkill.level).toBe(2);
    expect(bobAdvanced.createdSkill.level).toBe(2);
  });

  it('awards +1 XP and pendingAdvancement to the actor when the defender wins an opposed check', () => {
    const alice = Character.create('Alice');
    const bob = Character.create('Bob');
    const res = alice.makeCheck('Do Anything').withAction('Tackle').againstCharacter(bob, 'Do Anything').roll(new StubDiceRoller([2, 5]));

    expect(res.actorXpEarned).toBe(1);
    expect(res.defenderXpEarned).toBe(0);
    expect(res.actor.pendingAdvancement?.actionDescription).toBe('Tackle');
  });

  it('treats an opposed tie as actor failure (+1 XP actor, 0 XP defender) under default fail mode', () => {
    const res = Character.create('Alice').makeCheck('Do Anything').againstCharacter(Character.create('Bob'), 'Do Anything').roll(new StubDiceRoller([4, 4]));

    expect(res.checkResult.outcome).toBe('failure');
    expect(res.actorXpEarned).toBe(1);
    expect(res.defenderXpEarned).toBe(0);
  });

  it('awards 0 XP to both participants on a twist tie while preserving natural-6 advancement', () => {
    const ready = Character.create('Alice').makeCheck('Do Anything').againstCharacter(Character.create('Bob'), 'Do Anything').withTiesMode('twist');
    const res = ready.roll(new StubDiceRoller([6, 6]));

    expect(res.checkResult.outcome).toBe('tie');
    expect(res.actorXpEarned).toBe(0);
    expect(res.defenderXpEarned).toBe(0);
    expect(res.actor.pendingAdvancement?.naturalAllSixes).toBe(true);
    expect(res.defender.pendingAdvancement?.naturalAllSixes).toBe(true);
  });
});

describe('Physical / predetermined dice on character checks', () => {
  it('resolves physical dice on single and opposed checks without consuming roller dice for manual pools', () => {
    const alice = Character.create('Alice').addSkill('Climb', 2);
    const bob = Character.create('Bob').addSkill('Block', 2);
    const oppRoller = new StubDiceRoller([4, 4]);
    const defRoller = new StubDiceRoller([3, 3]);
    const actRoller = new StubDiceRoller([2, 3]);

    const vsOpp = alice.makeCheck('Climb').withDiceValues([6, 6]).against(new RolledOpposition(2)).roll(oppRoller);
    const actorManual = alice.makeCheck('Climb').withDiceValues([5, 4]).againstCharacter(bob, 'Block').roll(defRoller);
    const defManual = alice.makeCheck('Climb').againstCharacter(bob, 'Block', (b) => b.withDiceValues([4, 4])).roll(actRoller);
    const bothManual = alice.makeCheck('Climb').withDiceValues([6, 5]).againstCharacter(bob, 'Block', (b) => b.withDiceValues([6, 6])).roll(new StubDiceRoller([]));

    expect(vsOpp.character.advance('Summit').claim().createdSkill.level).toBe(3);
    expect(oppRoller.remaining).toBe(0);
    expect(actorManual.checkResult.outcome).toBe('success');
    expect(defRoller.remaining).toBe(0);
    expect(defManual.checkResult.outcome).toBe('failure');
    expect(actRoller.remaining).toBe(0);
    expect(bothManual.actorXpEarned).toBe(1);
    expect(bothManual.defender.pendingAdvancement?.naturalAllSixes).toBe(true);
  });

  it.each([
    ['wrong actor dice count', () => Character.create('Alice').addSkill('Climb', 2).makeCheck('Climb').withDiceValues([6])],
    ['invalid actor die face', () => Character.create('Alice').addSkill('Climb', 2).makeCheck('Climb').withDiceValues([7 as unknown as DieValue, 2])],
    ['wrong defender dice count', () => Character.create('Alice').makeCheck('Do Anything').againstCharacter(Character.create('Bob').addSkill('Block', 3), 'Block', (b) => b.withDiceValues([4, 4]))],
  ])('rejects %s with RangeError', (_label, fn) => {
    expect(fn).toThrow(RangeError);
  });
});
