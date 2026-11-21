import { describe, expect, it } from 'vitest';
import { Character, CharacterBuilder, DEFAULT_STARTING_SKILL_NAME, Skill } from './index';

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
