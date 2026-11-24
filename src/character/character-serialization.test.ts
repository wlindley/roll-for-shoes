import { describe, expect, it } from 'vitest';
import { StaticOpposition } from '../checks';
import { StubDiceRoller } from '../dice';
import {
  Character, type CharacterSnapshot, DEFAULT_STARTING_SKILL_NAME, fromCharacterSnapshot,
  PendingAdvancement, Skill, SkillSlotConfig, Status, toCharacterSnapshot,
} from './index';

function buildFullCharacter(): Character {
  const triBuy = SkillSlotConfig.triangle({ allowSlotPurchase: true });
  let char = Character.create('Ada', { id: 'char-ada', portrait: 'data:image/png;base64,xyz' })
    .addStatus(Status.create('Clean Shoe', 2, { id: 'st-1' }))
    .addStatus(Status.create('Broken Nose', -3, { id: 'st-2', note: 'Bruised' }));
  const starter = char.skill(DEFAULT_STARTING_SKILL_NAME);
  char = char.addSkill('Athletics', 2, { parentSkillId: starter.id });
  for (let i = 0; i < 5; i += 1) {
    char = char.makeCheck('Do Anything').against(new StaticOpposition(7)).roll(new StubDiceRoller([1])).character;
  }
  char = char.dismissAdvancement().purchaseSkillSlot(2, triBuy);
  return char.makeCheck('Athletics').withAction('Vault wall').against(new StaticOpposition(10)).roll(new StubDiceRoller([2, 6])).character;
}

describe('Character serialize & deserialize round-trips', () => {
  it('round-trips full Character state without storing derived getters in JSON', () => {
    const original = buildFullCharacter();
    const json = original.serialize();
    const raw = JSON.parse(json) as { schemaVersion: unknown; pendingAdvancement: Record<string, unknown> };
    const restored = Character.deserialize(json);

    expect(raw.schemaVersion).toBe(1);
    expect('targetLevel' in raw.pendingAdvancement).toBe(false);
    expect('xpCostToAdvance' in raw.pendingAdvancement).toBe(false);
    expect('naturalAllSixes' in raw.pendingAdvancement).toBe(false);

    expect(restored).not.toBe(original);
    expect(restored).toBeInstanceOf(Character);
    expect(restored.skills.every((s) => s instanceof Skill)).toBe(true);
    expect(restored.statuses.every((s) => s instanceof Status)).toBe(true);
    expect(restored.pendingAdvancement).toBeInstanceOf(PendingAdvancement);
    expect(restored.id).toBe('char-ada');
    expect(restored.name).toBe('Ada');
    expect(restored.portrait).toBe('data:image/png;base64,xyz');
    expect(restored.xp).toBe(2);
    expect(restored.skills).toEqual(original.skills);
    expect(restored.statuses).toEqual(original.statuses);
    expect(restored.purchasedSlots).toEqual({ 2: 1 });
    expect(restored.pendingAdvancement?.actionDescription).toBe('Vault wall');

    const claimed = restored.advance('Parkour').claim();
    expect(claimed.createdSkill.level).toBe(3);
    expect(claimed.character.xp).toBe(1);
  });

  it('round-trips Character with null pendingAdvancement, omitted legacy portrait, and trimmed portrait', () => {
    const plain = Character.create('Bob').addSkill('Run', 2);
    const restoredPlain = Character.deserialize(plain.serialize());

    const rawWithPortrait = JSON.parse(buildFullCharacter().serialize()) as Record<string, unknown>;
    const { portrait: _omitted, ...legacyPayload } = rawWithPortrait;
    const legacyRestored = Character.deserialize(JSON.stringify(legacyPayload));
    const trimmedRestored = Character.deserialize(JSON.stringify({ ...legacyPayload, portrait: '  /ada.png  ' }));

    expect(restoredPlain.pendingAdvancement).toBeNull();
    expect(restoredPlain.portrait).toBeUndefined();
    expect(legacyRestored.portrait).toBeUndefined();
    expect(trimmedRestored.portrait).toBe('/ada.png');
  });

  it('maps Character to and from a typed CharacterSnapshot directly without JSON stringifying', () => {
    const original = buildFullCharacter();
    const snapshot: CharacterSnapshot = toCharacterSnapshot(original);
    const restored = fromCharacterSnapshot(snapshot);

    expect(snapshot.schemaVersion).toBe(1);
    expect(restored).not.toBe(original);
    expect(restored).toMatchObject({
      id: original.id,
      skills: original.skills,
      statuses: original.statuses,
      purchasedSlots: original.purchasedSlots,
    });
    expect(restored.pendingAdvancement?.actionDescription).toBe('Vault wall');
  });
});

describe('Character.deserialize schema validation', () => {
  const basePayload = (): Record<string, unknown> => JSON.parse(buildFullCharacter().serialize()) as Record<string, unknown>;

  it.each(['{bad-json', 'null', '[]', '42'])('rejects malformed or non-object JSON payload %s', (rawJson) => {
    expect(() => Character.deserialize(rawJson)).toThrow();
  });

  it.each([
    ['unsupported schemaVersion', (b: Record<string, unknown>) => ({ ...b, schemaVersion: 99 })],
    ['missing schemaVersion', (b: Record<string, unknown>) => ({ ...b, schemaVersion: undefined })],
    ['non-string id', (b: Record<string, unknown>) => ({ ...b, id: 123 })],
    ['blank id', (b: Record<string, unknown>) => ({ ...b, id: '   ' })],
    ['non-string name', (b: Record<string, unknown>) => ({ ...b, name: 123 })],
    ['blank name', (b: Record<string, unknown>) => ({ ...b, name: '   ' })],
    ['null portrait', (b: Record<string, unknown>) => ({ ...b, portrait: null })],
    ['blank portrait', (b: Record<string, unknown>) => ({ ...b, portrait: '   ' })],
    ['negative xp', (b: Record<string, unknown>) => ({ ...b, xp: -1 })],
    ['non-integer xp', (b: Record<string, unknown>) => ({ ...b, xp: 1.5 })],
    ['string xp', (b: Record<string, unknown>) => ({ ...b, xp: '0' })],
    ['non-array skills', (b: Record<string, unknown>) => ({ ...b, skills: 'bad' })],
    ['empty skills array', (b: Record<string, unknown>) => ({ ...b, skills: [] })],
    ['non-object skill entry', (b: Record<string, unknown>) => ({ ...b, skills: [null] })],
    ['invalid skill level', (b: Record<string, unknown>) => ({ ...b, skills: [{ id: 's1', name: 'Run', level: 0 }] })],
    ['non-string parentSkillId', (b: Record<string, unknown>) => ({ ...b, skills: [{ id: 's1', name: 'Run', level: 1, parentSkillId: 9 }] })],
    ['duplicate skill names', (b: Record<string, unknown>) => ({ ...b, skills: [{ id: 's1', name: 'Run', level: 1 }, { id: 's2', name: ' run ', level: 2 }] })],
    ['non-array statuses', (b: Record<string, unknown>) => ({ ...b, statuses: 'bad' })],
    ['non-object status entry', (b: Record<string, unknown>) => ({ ...b, statuses: [null] })],
    ['zero status rating', (b: Record<string, unknown>) => ({ ...b, statuses: [{ id: 'st', name: 'Cut', rating: 0 }] })],
    ['non-string status note', (b: Record<string, unknown>) => ({ ...b, statuses: [{ id: 'st', name: 'Cut', rating: 1, note: 9 }] })],
    ['non-object purchasedSlots', (b: Record<string, unknown>) => ({ ...b, purchasedSlots: [] })],
    ['level 1 key in purchasedSlots', (b: Record<string, unknown>) => ({ ...b, purchasedSlots: { 1: 1 } })],
    ['negative count in purchasedSlots', (b: Record<string, unknown>) => ({ ...b, purchasedSlots: { 2: -1 } })],
    ['non-object pendingAdvancement', (b: Record<string, unknown>) => ({ ...b, pendingAdvancement: 'bad' })],
    ['empty rawDice in pendingAdvancement', (b: Record<string, unknown>) => ({ ...b, pendingAdvancement: { ...(b.pendingAdvancement as object), rawDice: [] } })],
    ['invalid die face in pendingAdvancement', (b: Record<string, unknown>) => ({ ...b, pendingAdvancement: { ...(b.pendingAdvancement as object), rawDice: [7] } })],
    ['invalid checkOutcome in pendingAdvancement', (b: Record<string, unknown>) => ({ ...b, pendingAdvancement: { ...(b.pendingAdvancement as object), checkOutcome: 'bogus' } })],
    ['non-string actionDescription in pendingAdvancement', (b: Record<string, unknown>) => ({ ...b, pendingAdvancement: { ...(b.pendingAdvancement as object), actionDescription: 123 } })],
  ])('rejects payload with %s', (_reason, mutate) => {
    const invalidJson = JSON.stringify(mutate(basePayload()));
    expect(() => Character.deserialize(invalidJson)).toThrow();
  });
});
