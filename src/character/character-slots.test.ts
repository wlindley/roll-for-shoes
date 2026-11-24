import { describe, expect, it } from 'vitest';
import { StaticOpposition } from '../checks';
import { StubDiceRoller } from '../dice';
import { Character, ClaimableAdvancement, SkillSlotConfig } from './index';

function characterWithBankedXp(base: Character, xp: number): Character {
  let current = base;
  for (let i = 0; i < xp; i += 1) {
    current = current.makeCheck('Do Anything').against(new StaticOpposition(7)).roll(new StubDiceRoller([1])).character;
  }
  return current.dismissAdvancement();
}

describe('SkillSlotConfig & getSkillSlotSummary', () => {
  it('configures triangle and custom limits with allowSlotPurchase-dependent defaultSlotsAboveMax', () => {
    const triDefault = SkillSlotConfig.triangle();
    const triBuy = SkillSlotConfig.triangle({ allowSlotPurchase: true });
    const rawLimits: Record<number, number> = { 2: 2, 3: 0 };
    const custom = new SkillSlotConfig({ limitsByLevel: rawLimits, defaultSlotsAboveMax: 3 });
    rawLimits[2] = 99;

    expect(Object.isFrozen(triDefault)).toBe(true);
    expect(Object.isFrozen(triDefault.limitsByLevel)).toBe(true);
    expect(triDefault).toMatchObject({ allowSlotPurchase: false, defaultSlotsAboveMax: 1 });
    expect(triDefault.baseLimitForLevel(1)).toBeNull();
    expect(triDefault.baseLimitForLevel(2)).toBe(4);
    expect(triDefault.baseLimitForLevel(5)).toBe(1);

    expect(triBuy).toMatchObject({ allowSlotPurchase: true, defaultSlotsAboveMax: 0 });
    expect(triBuy.baseLimitForLevel(5)).toBe(0);
    expect(custom.limitsByLevel).toEqual({ 2: 2, 3: 0 });
    expect(custom.baseLimitForLevel(4)).toBe(3);
  });

  it.each([
    ['level 1 key in limitsByLevel', () => new SkillSlotConfig({ limitsByLevel: { 1: 2 } })],
    ['decimal key in limitsByLevel', () => new SkillSlotConfig({ limitsByLevel: { 2.5: 2 } })],
    ['negative slot limit', () => new SkillSlotConfig({ limitsByLevel: { 2: -1 } })],
    ['negative defaultSlotsAboveMax', () => new SkillSlotConfig({ limitsByLevel: { 2: 2 }, defaultSlotsAboveMax: -1 })],
    ['invalid level in baseLimitForLevel', () => SkillSlotConfig.triangle().baseLimitForLevel(0)],
    ['invalid level in getSkillSlotSummary', () => Character.create('Bob').getSkillSlotSummary(0)],
  ])('rejects %s with RangeError', (_label, fn) => {
    expect(fn).toThrow(RangeError);
  });

  it('computes unrestricted, capped, purchased, and clamped SkillSlotSummary values', () => {
    const triFalse = SkillSlotConfig.triangle({ allowSlotPurchase: false });
    const triBuy = SkillSlotConfig.triangle({ allowSlotPurchase: true });
    const base = Character.create('Ada', {
      startingSkills: [{ name: 'S1', level: 2 }, { name: 'S2', level: 2 }, { name: 'S3', level: 2 }, { name: 'S4', level: 2 }],
    });
    const withSlot = characterWithBankedXp(base, 4).purchaseSkillSlot(2, triBuy);
    const withSlotAnd5th = withSlot.addSkill('S5', 2, { slotConfig: triBuy });
    const readyWithIgnoredSlot = withSlot.makeCheck('Do Anything').against(new StaticOpposition(3)).roll(new StubDiceRoller([6])).character;

    expect(base.getSkillSlotSummary(2)).toMatchObject({ maxSlots: null, availableSlots: null });
    expect(base.getSkillSlotSummary(1, triFalse).maxSlots).toBeNull();
    expect(base.getSkillSlotSummary(3, triBuy)).toMatchObject({ maxSlots: 3, effectivePurchasedSlots: 0, nextSlotXpCost: 6 });
    expect(withSlotAnd5th.getSkillSlotSummary(2, triBuy)).toMatchObject({ maxSlots: 5, usedSlots: 5, effectivePurchasedSlots: 1, availableSlots: 0 });
    expect(withSlotAnd5th.getSkillSlotSummary(2, triFalse)).toMatchObject({ maxSlots: 4, usedSlots: 5, effectivePurchasedSlots: 0, availableSlots: 0 });
    expect(() => readyWithIgnoredSlot.advance('S5').withSlotConfig(triFalse).claim()).toThrow(/slot/i);
  });
});

describe('Slot caps, skill replacement & slot purchasing', () => {
  const makeFullL2Character = () =>
    Character.create('Bob', {
      startingSkills: [
        { name: 'S1', level: 2 }, { name: 'S2', level: 2 }, { name: 'S3', level: 2 }, { name: 'S4', level: 2 },
        { name: 'Climb', level: 3 },
      ],
    });

  it('blocks adding or advancing into a full level without replacement while preserving pendingAdvancement', () => {
    const tri = SkillSlotConfig.triangle();
    const full = makeFullL2Character();
    const ready = full.makeCheck('Do Anything').against(new StaticOpposition(3)).roll(new StubDiceRoller([6])).character;
    const pending = ready.pendingAdvancement;

    expect(() => full.addSkill('S5', 2, { slotConfig: tri })).toThrow(/slot/i);
    expect(() => ready.advance('S5').withSlotConfig(tri).claim()).toThrow(/slot/i);
    expect(ready.pendingAdvancement).toBe(pending);
    expect(ready.advance('S5').withSlotConfig(null).claim().createdSkill.name).toBe('S5');
  });

  it('replaces a same-level skill via replacingSkill or addSkill', () => {
    const tri = SkillSlotConfig.triangle();
    const full = makeFullL2Character();
    const s2 = full.skill('S2');
    const ready = full.makeCheck('Do Anything').against(new StaticOpposition(3)).roll(new StubDiceRoller([6])).character;

    const claimed = ready.advance('Parkour').withSlotConfig(tri).replacingSkill('  s2  ').claim();
    const directReplaced = full.addSkill('Swim', 2, { slotConfig: tri, replaceSkillIdOrName: full.skill('S1').id });

    expect(claimed.replacedSkill).toBe(s2);
    expect(claimed.character.skills.some((s) => s.id === s2.id)).toBe(false);
    expect(claimed.character.getSkillSlotSummary(2, tri).usedSlots).toBe(4);
    expect(directReplaced.skill('Swim').level).toBe(2);
  });

  it.each([
    ['replacing Do Anything', () => makeFullL2Character().addSkill('Dash', 1, { replaceSkillIdOrName: 'Do Anything' })],
    ['replacing a different-level skill', () => makeFullL2Character().addSkill('Vault', 2, { replaceSkillIdOrName: 'Climb' })],
    ['replacing an unknown skill', () => makeFullL2Character().addSkill('Vault', 2, { replaceSkillIdOrName: 'Missing' })],
    ['colliding with another kept skill name', () => makeFullL2Character().addSkill('S1', 2, { replaceSkillIdOrName: 'S2' })],
  ])('rejects %s', (_label, fn) => {
    expect(fn).toThrow();
  });

  it('purchases standalone skill slots for 2 * level XP immutably and accumulates counts', () => {
    const triBuy = SkillSlotConfig.triangle({ allowSlotPurchase: true });
    const c8 = characterWithBankedXp(Character.create('Bob'), 8);
    const boughtOnce = c8.purchaseSkillSlot(2, triBuy);
    const boughtTwice = boughtOnce.purchaseSkillSlot(2, triBuy);

    expect(boughtOnce).not.toBe(c8);
    expect(boughtOnce).toMatchObject({ xp: 4, purchasedSlots: { 2: 1 } });
    expect(boughtTwice).toMatchObject({ xp: 0, purchasedSlots: { 2: 2 } });
  });

  it.each([
    ['level < 1', () => Character.create('Bob').purchaseSkillSlot(0, SkillSlotConfig.triangle({ allowSlotPurchase: true }))],
    ['unrestricted level 1', () => Character.create('Bob').purchaseSkillSlot(1, SkillSlotConfig.triangle({ allowSlotPurchase: true }))],
    ['disabled slot purchasing', () => characterWithBankedXp(Character.create('Bob'), 6).purchaseSkillSlot(2, SkillSlotConfig.triangle())],
    ['insufficient XP', () => characterWithBankedXp(Character.create('Bob'), 3).purchaseSkillSlot(2, SkillSlotConfig.triangle({ allowSlotPurchase: true }))],
  ])('purchaseSkillSlot rejects %s', (_label, fn) => {
    expect(fn).toThrow();
  });

  it('spends combined slot + dice-upgrade XP when claiming with purchasingSlot()', () => {
    const triBuy = SkillSlotConfig.triangle({ allowSlotPurchase: true });
    const seed = Character.create('Bob', {
      startingSkills: [{ name: 'Climb', level: 3 }, { name: 'L4A', level: 4 }, { name: 'L4B', level: 4 }],
    });
    const ready = characterWithBankedXp(seed, 9).makeCheck('Climb').against(new StaticOpposition(10)).roll(new StubDiceRoller([6, 6, 3])).character;

    const claimed = ready.advance('Mastery').withSlotConfig(triBuy).purchasingSlot().claim();

    expect(claimed).toMatchObject({ diceUpgradeXpSpent: 1, slotPurchaseXpSpent: 8, totalXpSpent: 9 });
    expect(claimed.character).toMatchObject({ xp: 0, purchasedSlots: { 4: 1 } });
  });

  it('rejects purchasingSlot() when slotConfig is null or combined XP is insufficient', () => {
    const triBuy = SkillSlotConfig.triangle({ allowSlotPurchase: true });
    const seed = Character.create('Bob', {
      startingSkills: [{ name: 'Climb', level: 3 }, { name: 'L4A', level: 4 }, { name: 'L4B', level: 4 }],
    });
    const r8 = characterWithBankedXp(seed, 8).makeCheck('Climb').against(new StaticOpposition(10)).roll(new StubDiceRoller([6, 6, 3])).character;

    expect(() => r8.advance('Mastery').purchasingSlot().claim()).toThrow(/SkillSlotConfig/i);
    expect(() => r8.advance('Mastery').withSlotConfig(triBuy).purchasingSlot().claim()).toThrow(/insufficient xp/i);
  });

  it('returns a terminal ClaimableAdvancement that blocks chaining replacingSkill and purchasingSlot together', () => {
    const ready = Character.create('Bob').makeCheck('Do Anything').against(new StaticOpposition(3)).roll(new StubDiceRoller([6])).character;
    const byReplace: ClaimableAdvancement = ready.advance('Vault').replacingSkill('S1');
    const byPurchase: ClaimableAdvancement = ready.advance('Vault').purchasingSlot();

    expect(Object.isFrozen(byReplace)).toBe(true);
    expect(Object.isFrozen(byPurchase)).toBe(true);
    // @ts-expect-error ClaimableAdvancement does not expose purchasingSlot
    expect(byReplace.purchasingSlot).toBeUndefined();
    // @ts-expect-error ClaimableAdvancement does not expose replacingSkill
    expect(byPurchase.replacingSkill).toBeUndefined();
  });
});
