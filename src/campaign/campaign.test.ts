import { describe, expect, it } from 'vitest';
import { Character, DEFAULT_STARTING_SKILL_NAME } from '../character';
import { BASIC_CAMPAIGN_RULES, Campaign, type CampaignRollLogEntry, type CampaignRulesConfig } from './index';

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
