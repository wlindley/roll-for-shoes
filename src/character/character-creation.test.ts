import { describe, expect, it } from 'vitest';
import { StaticOpposition } from '../checks';
import { StubDiceRoller } from '../dice';
import { Character, CharacterBuilder, DEFAULT_STARTING_SKILL_NAME, Skill, Status } from './index';

describe('Skill', () => {
  it('creates a frozen Skill with trimmed name, explicit ID, level, and parentSkillId', () => {
    const skill = new Skill({ id: 'sk-1', name: '  Parkour  ', level: 2, parentSkillId: 'sk-root' });

    expect(Object.isFrozen(skill)).toBe(true);
    expect(skill).toMatchObject({ id: 'sk-1', name: 'Parkour', level: 2, parentSkillId: 'sk-root' });
  });

  it('generates a non-empty ID when id is omitted', () => {
    const skill = new Skill({ name: 'Jump', level: 1 });
    expect(skill.id.length).toBeGreaterThan(0);
    expect(skill.parentSkillId).toBeUndefined();
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid skill level %s', (badLevel) => {
    expect(() => new Skill({ name: 'Jump', level: badLevel })).toThrow(RangeError);
  });

  it.each([
    ['blank skill name', { name: '   ', level: 1 }],
    ['blank skill ID', { id: '   ', name: 'Jump', level: 1 }],
  ])('rejects %s', (_label, props) => {
    expect(() => new Skill(props)).toThrow(/blank/i);
  });
});

describe('Character.create & Character.builder', () => {
  it('creates a frozen Character with 0 XP and Do Anything 1 by default', () => {
    const bob = Character.create('Bob');

    expect(Object.isFrozen(bob)).toBe(true);
    expect(Object.isFrozen(bob.skills)).toBe(true);
    expect(Object.isFrozen(bob.statuses)).toBe(true);
    expect(Object.isFrozen(bob.purchasedSlots)).toBe(true);
    expect(bob.id.length).toBeGreaterThan(0);
    expect(bob).toMatchObject({
      name: 'Bob', portrait: undefined, xp: 0, statuses: [], purchasedSlots: {}, pendingAdvancement: null,
    });
    expect(bob.skills).toHaveLength(1);
    expect(bob.skills[0]).toMatchObject({ name: DEFAULT_STARTING_SKILL_NAME, level: 1, parentSkillId: undefined });
  });

  it('accepts custom id and trimmed portrait in Character.create', () => {
    const eve = Character.create('  Eve  ', { id: 'c-eve', portrait: '  https://example.com/eve.png  ' });
    expect(eve).toMatchObject({ id: 'c-eve', name: 'Eve', portrait: 'https://example.com/eve.png' });
  });

  it('builds a Character with custom id, portrait, and starting skills without mutating prior builder stages', () => {
    const b0: CharacterBuilder = Character.builder('Ada');
    const b1 = b0.withId('c-ada');
    const b2 = b1.withPortrait('  data:image/png;base64,abc  ');
    const b3 = b2.withStartingSkill('  Hacking  ', 2).withStartingSkill('Pilot', 3);

    expect(b1).not.toBe(b0);
    expect(b2).not.toBe(b1);
    expect(b3).not.toBe(b2);
    expect(b0.build().skills).toHaveLength(1);

    const ada = b3.build();
    expect(ada).toMatchObject({ id: 'c-ada', portrait: 'data:image/png;base64,abc' });
    expect(ada.skills.map((s) => ({ name: s.name, level: s.level }))).toEqual([
      { name: DEFAULT_STARTING_SKILL_NAME, level: 1 },
      { name: 'Hacking', level: 2 },
      { name: 'Pilot', level: 3 },
    ]);
  });

  it('clears a staged portrait in CharacterBuilder when withPortrait(null) is called', () => {
    const withImg = Character.builder('Ada').withPortrait('/ada.webp');
    expect(withImg.build().portrait).toBe('/ada.webp');
    expect(withImg.withPortrait(null).build().portrait).toBeUndefined();
  });

  it.each([
    ['blank name in create', () => Character.create('   ')],
    ['blank id in create', () => Character.create('Ada', { id: '   ' })],
    ['blank portrait in create', () => Character.create('Ada', { portrait: '   ' })],
    ['blank name in builder', () => Character.builder('   ').build()],
    ['blank id in builder', () => Character.builder('Ada').withId('   ').build()],
    ['blank portrait in builder', () => Character.builder('Ada').withPortrait('\t\n')],
    ['duplicate Do Anything starting skill', () => Character.builder('Ada').withStartingSkill('  do anything ', 2).build()],
    ['duplicate custom starting skill', () => Character.builder('Ada').withStartingSkill('Hacking', 2).withStartingSkill(' HACKING ', 3).build()],
  ])('rejects %s', (_label, fn) => {
    expect(fn).toThrow();
  });
});

describe('Character.skill, addSkill & withPortrait', () => {
  it('finds skills by exact ID or case-insensitive trimmed name', () => {
    const bob = Character.create('Bob');
    const starter = bob.skills[0]!;

    expect(bob.skill(starter.id)).toBe(starter);
    expect(bob.skill('  do anything  ')).toBe(starter);
  });

  it('throws when looking up an unknown skill', () => {
    expect(() => Character.create('Bob').skill('Unknown')).toThrow(/not found/i);
  });

  it('adds a new skill immutably with optional parentSkillId', () => {
    const bob = Character.create('Bob');
    const starter = bob.skill(DEFAULT_STARTING_SKILL_NAME);
    const next = bob.addSkill('Cooking', 2, { parentSkillId: starter.id });

    expect(next).not.toBe(bob);
    expect(bob.skills).toHaveLength(1);
    expect(next.skill('Cooking')).toMatchObject({ name: 'Cooking', level: 2, parentSkillId: starter.id });
  });

  it.each([
    ['blank skill name', () => Character.create('Bob').addSkill('  ', 2)],
    ['duplicate skill name', () => Character.create('Bob').addSkill('Cooking', 2).addSkill(' COOKING ', 3)],
    ['non-positive skill level', () => Character.create('Bob').addSkill('Swim', 0)],
  ])('addSkill rejects %s', (_label, fn) => {
    expect(fn).toThrow();
  });

  it('updates, clears, and preserves portrait immutably across character transitions', () => {
    const base = Character.create('Bob');
    const withImg = base.withPortrait('  /bob.png  ');
    const progressed = withImg
      .addSkill('Climb', 2)
      .addStatus(Status.create('Focused', 1))
      .removeStatus('Focused')
      .makeCheck('Do Anything').against(new StaticOpposition(5)).roll(new StubDiceRoller([2]))
      .character.dismissAdvancement();

    expect(withImg).not.toBe(base);
    expect(withImg.portrait).toBe('/bob.png');
    expect(withImg.withPortrait(null).portrait).toBeUndefined();
    expect(progressed.portrait).toBe('/bob.png');
  });

  it('rejects a blank portrait string in character.withPortrait', () => {
    expect(() => Character.create('Bob').withPortrait('   ')).toThrow(/blank/i);
  });
});
