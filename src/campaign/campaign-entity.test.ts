import { describe, expect, it } from 'vitest';
import { Character, DEFAULT_STARTING_SKILL_NAME } from '../character';
import { BASIC_CAMPAIGN_RULES, Campaign, type CampaignRulesConfig } from './index';

const ISO_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe('Campaign entity & roster management', () => {
  it('exposes frozen BASIC_CAMPAIGN_RULES defaults', () => {
    const rules: CampaignRulesConfig = BASIC_CAMPAIGN_RULES;
    expect(Object.isFrozen(rules)).toBe(true);
    expect(rules).toEqual({
      tiesMode: 'fail',
      statusesEnabled: false,
      allowCustomStartingSkills: false,
      skillSlots: null,
    });
  });

  it('creates a frozen Campaign with generated ID, ISO timestamps, and default rules', () => {
    const campaign = Campaign.create('Tavern Brawl');

    expect(campaign).toBeInstanceOf(Campaign);
    expect(campaign.id.length).toBeGreaterThan(0);
    expect(campaign.name).toBe('Tavern Brawl');
    expect(campaign.description).toBeUndefined();
    expect(campaign.rules).toEqual(BASIC_CAMPAIGN_RULES);
    expect(campaign.characters).toEqual([]);
    expect(campaign.rollLog).toEqual([]);
    expect(campaign.createdAt).toMatch(ISO_TIMESTAMP_RE);
    expect(campaign.updatedAt).toMatch(ISO_TIMESTAMP_RE);
    expect(Object.isFrozen(campaign)).toBe(true);
    expect(Object.isFrozen(campaign.rules)).toBe(true);
    expect(Object.isFrozen(campaign.characters)).toBe(true);
    expect(Object.isFrozen(campaign.rollLog)).toBe(true);
  });

  it('creates a Campaign with trimmed custom ID, normalized description, and rule overrides', () => {
    const custom = Campaign.create('  Cyberpunk  ', {
      id: '  cmp-1  ',
      description: '  Neon heist  ',
      rules: { tiesMode: 'twist', statusesEnabled: true },
    });
    const blankDesc = Campaign.create('Minimal', { description: '   ' });

    expect(custom).toMatchObject({
      id: 'cmp-1',
      name: 'Cyberpunk',
      description: 'Neon heist',
      rules: { tiesMode: 'twist', statusesEnabled: true, allowCustomStartingSkills: false, skillSlots: null },
    });
    expect(blankDesc.description).toBeUndefined();
  });

  it('renames a Campaign immutably while preserving ID, description, and createdAt', () => {
    const base = Campaign.create('Tavern Brawl', { description: 'One-shot' });
    const renamed = base.rename('  Starship Crew  ');

    expect(renamed).not.toBe(base);
    expect(base.name).toBe('Tavern Brawl');
    expect(renamed).toMatchObject({
      id: base.id,
      name: 'Starship Crew',
      description: 'One-shot',
      createdAt: base.createdAt,
    });
    expect(renamed.updatedAt).toMatch(ISO_TIMESTAMP_RE);
  });

  it('sets and clears Campaign description immutably', () => {
    const base = Campaign.create('Tavern Brawl');
    const described = base.withDescription('  Weekly one-shot  ');
    const cleared = described.withDescription('   ');

    expect(described).not.toBe(base);
    expect(cleared).not.toBe(described);
    expect(base.description).toBeUndefined();
    expect(described.description).toBe('Weekly one-shot');
    expect(cleared.description).toBeUndefined();
  });

  it('merges partial rule patches immutably via withRules', () => {
    const base = Campaign.create('Tavern Brawl');
    const step1 = base.withRules({ tiesMode: 'twist', allowCustomStartingSkills: true });
    const step2 = step1.withRules({ statusesEnabled: true });

    expect(step1).not.toBe(base);
    expect(step2).not.toBe(step1);
    expect(Object.isFrozen(step2.rules)).toBe(true);
    expect(base.rules).toEqual(BASIC_CAMPAIGN_RULES);
    expect(step2.rules).toEqual({
      tiesMode: 'twist',
      statusesEnabled: true,
      allowCustomStartingSkills: true,
      skillSlots: null,
    });
  });

  it.each(['', '   '])('rejects blank campaign name or ID (%j)', (blank) => {
    const base = Campaign.create('Valid');
    expect(() => Campaign.create(blank)).toThrow(/campaign name cannot be blank/i);
    expect(() => Campaign.create('Valid', { id: blank })).toThrow(/campaign id cannot be blank/i);
    expect(() => base.rename(blank)).toThrow(/campaign name cannot be blank/i);
  });

  it('adds Character instances and finds them by exact ID or case-insensitive name', () => {
    const alice = Character.create('Alice');
    const bob = Character.create('Bob', { id: 'char-bob' });
    const campaign = Campaign.create('Heist').addCharacter(alice).addCharacter(bob);

    expect(campaign.characters).toHaveLength(2);
    expect(alice.name).toBe('Alice');
    expect(alice.skills[0]?.name).toBe(DEFAULT_STARTING_SKILL_NAME);
    expect(campaign.findCharacter(alice.id)).toBe(alice);
    expect(campaign.findCharacter('  ALICE  ')).toBeUndefined();
    expect(campaign.findCharacterByName('  ALICE  ')).toBe(alice);
    expect(campaign.findCharacter('char-bob')).toBe(bob);
    expect(campaign.findCharacterByName('Charlie')).toBeUndefined();
  });

  it('rejects characters with custom starting skills unless allowCustomStartingSkills is true', () => {
    const hacker = Character.create('Ada', { startingSkills: [{ name: 'Hacking', level: 2 }] });
    const basic = Campaign.create('Cyber');

    expect(() => basic.addCharacter(hacker)).toThrow(/custom starting skills are disabled/i);

    const enabled = basic.withRules({ allowCustomStartingSkills: true }).addCharacter(hacker);
    expect(enabled.findCharacterByName('Ada')?.skill('Hacking').level).toBe(2);
  });

  it('rejects duplicate characters by ID or case-insensitive name', () => {
    const campaign = Campaign.create('Heist').addCharacter(Character.create('Alice', { id: 'char-1' }));

    expect(() => campaign.addCharacter(Character.create('  ALICE  '))).toThrow(/duplicate character/i);
    expect(() => campaign.addCharacter(Character.create('Alicia', { id: 'char-1' }))).toThrow(/duplicate character/i);
  });

  it('replaces an existing character in roster order and throws on unknown character ID', () => {
    const campaign = Campaign.create('Heist').addCharacter(Character.create('Alice')).addCharacter(Character.create('Bob'));
    const upgradedAlice = campaign.findCharacterByName('Alice')!.addSkill('Lockpicking', 2);
    const updated = campaign.replaceCharacter(upgradedAlice);

    expect(updated).not.toBe(campaign);
    expect(updated.characters[0]).toBe(upgradedAlice);
    expect(updated.characters[1]?.name).toBe('Bob');
    expect(() => campaign.replaceCharacter(Character.create('Ghost', { id: 'missing-id' }))).toThrow(/character not found/i);
  });

  it('removes characters by ID and throws when missing', () => {
    const campaign = Campaign.create('Heist')
      .addCharacter(Character.create('Alice', { id: 'char-alice' }))
      .addCharacter(Character.create('Bob'));

    expect(campaign.removeCharacter('char-alice').characters.map((c) => c.name)).toEqual(['Bob']);
    expect(() => campaign.removeCharacter('Charlie')).toThrow(/character not found/i);
  });
});
