import { describe, expect, it } from 'vitest';
import { StubDiceRoller } from '../dice';
import { RolledOpposition, StaticOpposition } from '../checks';
import { AdvancementOutcome, Character, CharacterCheckOutcome, DEFAULT_STARTING_SKILL_NAME, OpposedCharacterCheckOutcome } from '../character';
import { BASIC_CAMPAIGN_RULES, Campaign, CampaignCharacterScope, type CampaignRollLogEntry, type CampaignRulesConfig, ScopedAdvancementBuilder, ScopedCheckBuilder } from './index';

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe('campaign module — Campaign entity & roster management', () => {
  it('CMP-BASIC-01: creates immutable Campaign with defaults/options and updates metadata & rules immutably', () => {
    const base = Campaign.create('Tavern Brawl');
    expect(BASIC_CAMPAIGN_RULES satisfies CampaignRulesConfig).toEqual({ tiesMode: 'fail', statusesEnabled: false, allowCustomStartingSkills: false, skillSlots: null });
    expect([base instanceof Campaign, base.id.length > 0, base.name, base.description, base.rules, base.characters, base.rollLog satisfies readonly CampaignRollLogEntry[]])
      .toEqual([true, true, 'Tavern Brawl', undefined, BASIC_CAMPAIGN_RULES, [], []]);
    expect([ISO_RE.test(base.createdAt), ISO_RE.test(base.updatedAt), Object.isFrozen(BASIC_CAMPAIGN_RULES), Object.isFrozen(base), Object.isFrozen(base.characters), Object.isFrozen(base.rollLog), Object.isFrozen(base.rules)])
      .toEqual([true, true, true, true, true, true, true]);
    const custom = Campaign.create('  Cyberpunk  ', { id: 'cmp-1', description: '  Neon heist  ', rules: { tiesMode: 'twist', statusesEnabled: true } });
    expect([custom.id, custom.name, custom.description, custom.rules, Campaign.create('Minimal', { description: '   ' }).description])
      .toEqual(['cmp-1', 'Cyberpunk', 'Neon heist', { tiesMode: 'twist', statusesEnabled: true, allowCustomStartingSkills: false, skillSlots: null }, undefined]);
    const renamed = base.rename('  Starship Crew  ');
    expect(renamed).not.toBe(base);
    expect([base.name, renamed.id, renamed.name, renamed.createdAt, ISO_RE.test(renamed.updatedAt)]).toEqual(['Tavern Brawl', base.id, 'Starship Crew', base.createdAt, true]);
    const described = base.withDescription('  Weekly one-shot  ');
    const cleared = described.withDescription('   ');
    expect(described).not.toBe(base);
    expect(cleared).not.toBe(described);
    expect([base.description, described.description, cleared.description, described.createdAt, cleared.createdAt]).toEqual([undefined, 'Weekly one-shot', undefined, base.createdAt, base.createdAt]);
    const r1 = base.withRules({ tiesMode: 'twist', allowCustomStartingSkills: true });
    const r2 = r1.withRules({ statusesEnabled: true });
    expect(r1).not.toBe(base);
    expect(r2).not.toBe(r1);
    expect([Object.isFrozen(r1.rules), Object.isFrozen(r2.rules), base.rules, r1.rules, r2.rules, r1.createdAt, r2.createdAt]).toEqual([
      true, true, BASIC_CAMPAIGN_RULES, { tiesMode: 'twist', statusesEnabled: false, allowCustomStartingSkills: true, skillSlots: null },
      { tiesMode: 'twist', statusesEnabled: true, allowCustomStartingSkills: true, skillSlots: null }, base.createdAt, base.createdAt,
    ]);
    for (const bad of ['', '   ']) {
      expect(() => Campaign.create(bad)).toThrow();
      expect(() => Campaign.create('Valid', { id: bad })).toThrow();
      expect(() => base.rename(bad)).toThrow();
    }
    expect(base.name).toBe('Tavern Brawl');
  });

  it('CMP-BASIC-02: manages character roster immutably and rejects duplicate or missing characters', () => {
    const empty = Campaign.create('Heist');
    const c1 = empty.addCharacter('Alice');
    expect(c1).not.toBe(empty);
    const alice = c1.characters[0]!;
    expect([empty.characters, c1.characters.length, Object.isFrozen(c1.characters), c1.createdAt, alice instanceof Character, alice.name, alice.xp, alice.skills[0]?.name])
      .toEqual([[], 1, true, empty.createdAt, true, 'Alice', 0, DEFAULT_STARTING_SKILL_NAME]);
    const bob = Character.create('Bob', { id: 'char-bob' });
    const c2 = c1.addCharacter(bob);
    expect(c2).not.toBe(c1);
    expect([c1.characters, c2.characters]).toEqual([[alice], [alice, bob]]);
    expect([c2.findCharacter(alice.id), c2.findCharacter('  alice  '), c2.findCharacter('char-bob'), c2.findCharacter('  BOB '), c2.findCharacter('Charlie'), c2.findCharacter('   ')])
      .toEqual([alice, alice, bob, bob, undefined, undefined]);
    for (const dupOrBad of ['   ', 'alice', '  BOB  ', Character.create('  ALICE '), Character.create('Bobby', { id: 'char-bob' })]) {
      expect(() => c2.addCharacter(dupOrBad)).toThrow();
    }
    const aliceLeveled = alice.addSkill('Lockpicking', 2);
    const c3 = c2.replaceCharacter(aliceLeveled);
    expect(c3).not.toBe(c2);
    expect([c2.characters, c3.characters, c3.findCharacter(alice.id), c3.createdAt]).toEqual([[alice, bob], [aliceLeveled, bob], aliceLeveled, empty.createdAt]);
    expect(() => c3.replaceCharacter(Character.create('Ghost', { id: 'missing-id' }))).toThrow();
    const withoutBob = c3.removeCharacter('char-bob');
    const withoutAlice = c3.removeCharacter('  ALICE  ');
    expect(withoutBob).not.toBe(c3);
    expect(withoutAlice).not.toBe(c3);
    expect([c3.characters, withoutBob.characters, withoutAlice.characters, withoutBob.createdAt]).toEqual([[aliceLeveled, bob], [aliceLeveled], [bob], empty.createdAt]);
    for (const missing of ['Charlie', '   ', 'char-missing']) expect(() => c3.removeCharacter(missing)).toThrow();
    expect(() => withoutBob.removeCharacter('Bob')).toThrow();
    expect(c3.characters).toEqual([aliceLeveled, bob]);
  });
});

describe('campaign module — Campaign.character() fluent scopes & rollLog', () => {
  it('CMP-BASIC-03: resolves vs-opposition checks via character scope, prepends rollLog newest-first, and preserves immutability', () => {
    const base = Campaign.create('Heist').addCharacter('Alice').addCharacter('Bob');
    const [alice, bob] = [base.findCharacter('Alice')!, base.findCharacter('Bob')!];
    const scope: CampaignCharacterScope<{ readonly campaign: Campaign }> = base.character('  alice  ');
    const b1: ScopedCheckBuilder<{ readonly campaign: Campaign }> = scope.makeCheck('Do Anything');
    const b2 = b1.withAction('Pick vault');
    expect(b2).not.toBe(b1);
    const res1 = b2.against(new StaticOpposition(5)).roll(new StubDiceRoller([2]));
    expect(res1.campaign).not.toBe(base);
    const [alice1, e1] = [res1.campaign.findCharacter('Alice')!, res1.campaign.rollLog[0]!];
    expect([scope instanceof CampaignCharacterScope, scope.character, b1 instanceof ScopedCheckBuilder, base.rollLog, base.characters, res1.outcome instanceof CharacterCheckOutcome, res1.outcome.xpEarned, res1.campaign.findCharacter('Bob')])
      .toEqual([true, alice, true, [], [alice, bob], true, 1, bob]);
    expect([alice1, alice1.xp, alice1.pendingAdvancement?.actionDescription, res1.campaign.rollLog.length, Object.isFrozen(res1.campaign.rollLog), Object.isFrozen(e1), e1.id.length > 0, ISO_RE.test(e1.timestamp), e1.kind, e1.actorId, e1.actorName, e1.actorSkillName, e1.actionDescription, e1.checkResult, e1.actorXpEarned, e1.defenderId, e1.defenderName, e1.defenderSkillName, e1.defenderXpEarned])
      .toEqual([res1.outcome.character, 1, 'Pick vault', 1, true, true, true, true, 'vs_opposition', alice.id, 'Alice', 'Do Anything', 'Pick vault', res1.outcome.checkResult, 1, undefined, undefined, undefined, undefined]);
    const res2 = res1.campaign.character(alice.id).makeCheck('Do Anything').against(new RolledOpposition(1)).roll(new StubDiceRoller([6, 3]));
    expect(res2.campaign).not.toBe(res1.campaign);
    const e2 = res2.campaign.rollLog[0]!;
    expect([res1.campaign.rollLog, res2.campaign.rollLog.length, res2.campaign.rollLog[1], e2.id !== e1.id, e2.kind, e2.actionDescription, e2.actorXpEarned])
      .toEqual([[e1], 2, e1, true, 'vs_opposition', undefined, 0]);
    expect(b1.against(new StaticOpposition(5)).roll(new StubDiceRoller([2])).campaign.rollLog[0]?.actionDescription).toBeUndefined();
    for (const bad of ['Charlie', '   ']) expect(() => base.character(bad)).toThrow();
    expect(() => base.character('Alice').makeCheck('Nonexistent').against(new StaticOpposition(4)).roll(new StubDiceRoller([3]))).toThrow();
  });

  it('CMP-BASIC-04: resolves character-vs-character opposed checks, logs defender metadata, and rejects self/unknown opposition', () => {
    const base = Campaign.create('Tavern').addCharacter('Alice').addCharacter('Bob').addCharacter('Cara');
    const [alice, bob, cara] = [base.findCharacter('Alice')!, base.findCharacter('Bob')!, base.findCharacter('Cara')!];
    const res = base.character('Alice').makeCheck('Do Anything').withAction('Arm wrestle').againstCharacter('  bob  ', 'do anything').roll(new StubDiceRoller([6, 3]));
    expect(res.campaign).not.toBe(base);
    const [nextAlice, nextBob, entry] = [res.campaign.findCharacter('Alice')!, res.campaign.findCharacter('Bob')!, res.campaign.rollLog[0]!];
    expect([base.rollLog, base.characters, res.outcome instanceof OpposedCharacterCheckOutcome, res.outcome.actorXpEarned, res.outcome.defenderXpEarned, res.campaign.characters, nextAlice.xp, nextAlice.pendingAdvancement?.naturalAllSixes, nextBob.xp, nextBob.pendingAdvancement?.xpCostToAdvance])
      .toEqual([[], [alice, bob, cara], true, 0, 1, [res.outcome.actor, res.outcome.defender, cara], 0, true, 1, 1]);
    expect([res.campaign.rollLog.length, Object.isFrozen(entry), entry.id.length > 0, ISO_RE.test(entry.timestamp), entry.kind, entry.actorId, entry.actorName, entry.actorSkillName, entry.defenderId, entry.defenderName, entry.defenderSkillName, entry.actionDescription, entry.checkResult, entry.actorXpEarned, entry.defenderXpEarned])
      .toEqual([1, true, true, true, 'character_opposed', alice.id, 'Alice', 'Do Anything', bob.id, 'Bob', 'Do Anything', 'Arm wrestle', res.outcome.checkResult, 0, 1]);
    const res2 = res.campaign.character('Alice').makeCheck('Do Anything').againstCharacter(bob.id, 'Do Anything').roll(new StubDiceRoller([2, 5]));
    expect(res2.campaign).not.toBe(res.campaign);
    expect([res2.campaign.rollLog.length, res2.campaign.rollLog[1], res2.campaign.rollLog[0]?.actorXpEarned, res2.campaign.rollLog[0]?.defenderXpEarned, res2.campaign.rollLog[0]?.actionDescription, res2.campaign.findCharacter('Alice')?.xp, res2.campaign.findCharacter('Bob')?.xp])
      .toEqual([2, entry, 1, 0, undefined, 1, 1]);
    for (const [def, sk] of [['Alice', 'Do Anything'], ['  ALICE ', 'Do Anything'], [alice.id, 'Do Anything'], ['Unknown', 'Do Anything'], ['Bob', 'Flying']] as const) {
      expect(() => base.character('Alice').makeCheck('Do Anything').againstCharacter(def, sk).roll(new StubDiceRoller([3, 3]))).toThrow();
    }
    expect([base.rollLog, base.characters]).toEqual([[], [alice, bob, cara]]);
  });

  it('CMP-BASIC-05: advances, dismisses advancement, and applies arbitrary character transforms immutably', () => {
    const base = Campaign.create('Heist').addCharacter('Alice').addCharacter('Bob');
    const bob = base.findCharacter('Bob')!;
    const rolled = base.character('Alice').makeCheck('Do Anything').against(new StaticOpposition(3)).roll(new StubDiceRoller([6])).campaign;
    const rolledAlice = rolled.findCharacter('Alice')!;
    const advBuilder: ScopedAdvancementBuilder<{ readonly campaign: Campaign }> = rolled.character('Alice').advance('Lockpicking');
    expect(advBuilder).toBeInstanceOf(ScopedAdvancementBuilder);
    const claimed = advBuilder.claim();
    expect(claimed.campaign).not.toBe(rolled);
    expect([rolled.findCharacter('Alice'), claimed.advancement instanceof AdvancementOutcome, claimed.advancement.createdSkill.name, claimed.advancement.createdSkill.level, claimed.campaign.findCharacter('Alice'), claimed.campaign.findCharacter('Alice')?.pendingAdvancement, claimed.campaign.findCharacter('Bob'), claimed.campaign.rollLog])
      .toEqual([rolledAlice, true, 'Lockpicking', 2, claimed.advancement.character, null, bob, rolled.rollLog]);
    for (const [c, who] of [[claimed.campaign, 'Alice'], [base, 'Bob']] as const) expect(() => c.character(who).advance('Sneaking').claim()).toThrow(/no pending advancement/i);
    const dismissed = rolled.character('Alice').dismissAdvancement();
    expect(dismissed.campaign).not.toBe(rolled);
    const updated = claimed.campaign.character('Alice').update((c) => c.addSkill('Parkour', 3));
    expect(updated.campaign).not.toBe(claimed.campaign);
    expect([rolled.findCharacter('Alice')?.pendingAdvancement !== null, dismissed.campaign.findCharacter('Alice')?.pendingAdvancement, dismissed.campaign.findCharacter('Alice')?.skills.length, dismissed.campaign.findCharacter('Bob'), claimed.campaign.findCharacter('Alice')?.skills.length, updated.campaign.findCharacter('Alice')?.skill('Parkour').level, updated.campaign.findCharacter('Bob')])
      .toEqual([true, null, 1, bob, 2, 3, bob]);
  });
});
