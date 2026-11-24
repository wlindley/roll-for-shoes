import { describe, expect, it } from 'vitest';
import { StubDiceRoller } from '../dice';
import { RolledOpposition, StaticOpposition } from '../checks';
import { AdvancementOutcome, Character, CharacterCheckOutcome, OpposedCharacterCheckOutcome, SkillSlotConfig, Status } from '../character';
import { Campaign, CampaignCharacterScope, type CampaignRollLogEntry, ScopedAdvancementBuilder, ScopedCheckBuilder, Workspace } from './index';

describe('Campaign & Workspace character fluent scopes', () => {
  it('resolves vs-opposition checks via Campaign.character and prepends newest-first rollLog entries', () => {
    const base = Campaign.create('Heist').addCharacter(Character.create('Alice')).addCharacter(Character.create('Bob'));
    const bob = base.findCharacter('Bob')!;
    const scope = base.character('  alice  ');
    const builder = scope.makeCheck('Do Anything').withAction('Pick vault');

    expect(scope).toBeInstanceOf(CampaignCharacterScope);
    expect(scope.character).toBe(base.findCharacter('Alice'));
    expect(builder).toBeInstanceOf(ScopedCheckBuilder);

    const first = builder.against(new StaticOpposition(5)).roll(new StubDiceRoller([2]));
    const second = first.campaign.character('Alice').makeCheck('Do Anything').against(RolledOpposition.withDice(1)).roll(new StubDiceRoller([6, 3]));
    const [latestEntry, olderEntry] = second.campaign.rollLog as readonly [CampaignRollLogEntry, CampaignRollLogEntry];

    expect(first.campaign).not.toBe(base);
    expect(base.rollLog).toEqual([]);
    expect(first.outcome).toBeInstanceOf(CharacterCheckOutcome);
    expect(first.campaign.findCharacter('Alice')?.xp).toBe(1);
    expect(first.campaign.findCharacter('Bob')).toBe(bob);
    expect(second.campaign.rollLog).toHaveLength(2);
    expect(olderEntry).toBe(first.campaign.rollLog[0]);
    expect(olderEntry).toMatchObject({
      kind: 'vs_opposition',
      actorName: 'Alice',
      actorSkillName: 'Do Anything',
      actionDescription: 'Pick vault',
      actorXpEarned: 1,
    });
    expect(olderEntry.defenderId).toBeUndefined();
    expect(latestEntry).toMatchObject({ kind: 'vs_opposition', actionDescription: undefined, actorXpEarned: 0 });
  });

  it('resolves character-opposed checks via Workspace.activeCampaign.character and records defender fields', () => {
    const ws = Workspace.empty()
      .createCampaign('Tavern')
      .activeCampaign.addCharacter(Character.create('Alice'))
      .activeCampaign.addCharacter(Character.create('Bob'));
    const result = ws.activeCampaign
      .character('Alice').makeCheck('Do Anything').withAction('Arm wrestle')
      .againstCharacter('  bob  ', 'do anything').roll(new StubDiceRoller([6, 3]));

    expect(result.workspace).not.toBe(ws);
    expect(result.outcome).toBeInstanceOf(OpposedCharacterCheckOutcome);
    expect(result.campaign.findCharacter('Alice')?.pendingAdvancement?.naturalAllSixes).toBe(true);
    expect(result.campaign.findCharacter('Bob')?.xp).toBe(1);
    expect(result.campaign.rollLog[0]).toMatchObject({
      kind: 'character_opposed',
      actorName: 'Alice',
      actorSkillName: 'Do Anything',
      defenderName: 'Bob',
      defenderSkillName: 'Do Anything',
      actionDescription: 'Arm wrestle',
      actorXpEarned: 0,
      defenderXpEarned: 1,
    });
  });

  it('rejects unknown characters and self-opposition in character scopes', () => {
    const campaign = Campaign.create('Tavern').addCharacter(Character.create('Alice'));

    expect(() => campaign.character('Ghost')).toThrow(/character not found/i);
    expect(() => campaign.character('Alice').makeCheck('Do Anything').againstCharacter('  alice  ', 'Do Anything')).toThrow(/cannot oppose themselves/i);
    expect(() => campaign.character('Alice').makeCheck('Do Anything').againstCharacter('Ghost', 'Do Anything')).toThrow(/character not found/i);
  });

  it('forwards campaign tiesMode ("twist" vs "fail") to single and opposed checks', () => {
    const wsTwist = Workspace.empty()
      .createCampaign('Heist', { rules: { tiesMode: 'twist' } })
      .activeCampaign.addCharacter(Character.create('Alice'))
      .activeCampaign.addCharacter(Character.create('Bob'));

    const singleTie = wsTwist.activeCampaign.character('Alice').makeCheck('Do Anything').against(new StaticOpposition(4)).roll(new StubDiceRoller([4]));
    const opposedTie = singleTie.workspace.activeCampaign.character('Alice').makeCheck('Do Anything').againstCharacter('Bob', 'Do Anything').roll(new StubDiceRoller([4, 4]));
    const failTie = wsTwist.activeCampaign.withRules({ tiesMode: 'fail' }).activeCampaign.character('Alice').makeCheck('Do Anything').against(new StaticOpposition(4)).roll(new StubDiceRoller([4]));

    expect(singleTie.outcome.checkResult.outcome).toBe('tie');
    expect(singleTie.outcome.xpEarned).toBe(0);
    expect(opposedTie.outcome.checkResult.outcome).toBe('tie');
    expect(opposedTie.outcome.actorXpEarned).toBe(0);
    expect(opposedTie.outcome.defenderXpEarned).toBe(0);
    expect(failTie.outcome.checkResult.outcome).toBe('failure');
    expect(failTie.outcome.xpEarned).toBe(1);
  });

  it('rejects actor and defender statuses when statusesEnabled is false while allowing situational modifiers', () => {
    const alice = Character.create('Alice').addStatus(Status.create('Clean Shoe', 2));
    const bob = Character.create('Bob').addStatus(Status.create('Broken Nose', -3));
    const campaign = Campaign.create('Brawl').addCharacter(alice).addCharacter(bob);

    expect(() => campaign.character('Alice').makeCheck('Do Anything').withStatus('Clean Shoe')).toThrow(/statuses are disabled/i);
    expect(() =>
      campaign.character('Alice').makeCheck('Do Anything').againstCharacter('Bob', 'Do Anything', (b) => b.withDiceValues([3]).withStatus('Broken Nose')),
    ).toThrow(/statuses are disabled/i);

    const modified = campaign.character('Alice').makeCheck('Do Anything').withModifier('Rain', -2)
      .againstCharacter('Bob', 'Do Anything', (b) => b.withModifier('Cover', 1)).roll(new StubDiceRoller([5, 3]));
    expect(modified.outcome.checkResult.actor.finalTotal).toBe(3);
    expect(modified.outcome.checkResult.opposition.total).toBe(4);
  });

  it('resolves actor and defender physical dice values with statuses and modifiers when statusesEnabled is true', () => {
    const alice = Character.create('Alice').addSkill('Parkour', 2).addStatus(Status.create('Clean Shoe', 2));
    const bob = Character.create('Bob').addSkill('Guard', 2).addStatus(Status.create('Alert', 1));
    const campaign = Campaign.create('Tabletop', { rules: { statusesEnabled: true, allowCustomStartingSkills: true } }).addCharacter(alice).addCharacter(bob);

    const vsPool = campaign.character('Alice').makeCheck('Parkour').withStatus('Clean Shoe').withModifier('Grip', 1).withDiceValues([2, 3])
      .against(RolledOpposition.fromDice([4, 3])).roll(new StubDiceRoller([]));
    expect(vsPool.outcome.checkResult.actor.finalTotal).toBe(8);
    expect(vsPool.outcome.checkResult.outcome).toBe('success');

    const vsChar = vsPool.campaign.character('Alice').makeCheck('Parkour').withDiceValues([3, 2])
      .againstCharacter('Bob', 'Guard', (b) => b.withStatus('Alert').withModifier('High Ground', 1).withDiceValues([6, 6])).roll(new StubDiceRoller([]));
    expect(vsChar.outcome.actorXpEarned).toBe(1);
    expect(vsChar.campaign.findCharacter('Bob')?.pendingAdvancement?.naturalAllSixes).toBe(true);
  });

  it('claims advancements, dismisses pending advancements, and updates character portraits immutably', () => {
    const rolled = Workspace.empty().createCampaign('Heist').activeCampaign.addCharacter(Character.create('Alice'))
      .activeCampaign.character('Alice').makeCheck('Do Anything').against(new StaticOpposition(5)).roll(new StubDiceRoller([2])).workspace;

    const advBuilder = rolled.activeCampaign.character('Alice').advance('Lockpicking');
    expect(advBuilder).toBeInstanceOf(ScopedAdvancementBuilder);

    const claimed = advBuilder.claim();
    expect(claimed.advancement).toBeInstanceOf(AdvancementOutcome);
    expect(claimed.advancement.createdSkill).toMatchObject({ name: 'Lockpicking', level: 2 });
    expect(claimed.campaign.findCharacter('Alice')?.pendingAdvancement).toBeNull();

    const dismissed = rolled.activeCampaign.character('Alice').dismissAdvancement();
    expect(dismissed.campaign.findCharacter('Alice')?.pendingAdvancement).toBeNull();
    expect(dismissed.campaign.findCharacter('Alice')?.xp).toBe(1);

    const updated = claimed.workspace.activeCampaign.character('Alice').update((c) => c.withPortrait('  /alice.png  '));
    expect(updated.campaign.findCharacter('Alice')?.portrait).toBe('/alice.png');
  });

  it('enforces campaign skillSlots on advance and replaces a same-level skill via replacingSkill', () => {
    const ada = Character.create('Ada', {
      startingSkills: [{ name: 'S1', level: 2 }, { name: 'S2', level: 2 }, { name: 'S3', level: 2 }, { name: 'S4', level: 2 }],
    });
    const rolled = Workspace.empty()
      .createCampaign('Triangle', { rules: { allowCustomStartingSkills: true, skillSlots: SkillSlotConfig.triangle() } })
      .activeCampaign.addCharacter(ada)
      .activeCampaign.character('Ada').makeCheck('Do Anything').against(new StaticOpposition(3)).roll(new StubDiceRoller([6])).workspace;

    expect(() => rolled.activeCampaign.character('Ada').advance('S5').claim()).toThrow(/no available skill slots/i);
    expect(() => rolled.activeCampaign.character('Ada').advance('S5').purchasingSlot().claim()).toThrow(/slot purchase is disabled/i);

    const replaced = rolled.activeCampaign.character('Ada').advance('S5').replacingSkill('S1').claim();
    expect(replaced.advancement.replacedSkill?.name).toBe('S1');

    const unrestricted = rolled.activeCampaign.withRules({ skillSlots: null }).activeCampaign.character('Ada').advance('S5').claim();
    expect(unrestricted.campaign.findCharacter('Ada')?.getSkillSlotSummary(2, SkillSlotConfig.triangle()).usedSlots).toBe(5);
  });

  it('purchases an extra skill slot during scoped advancement when allowSlotPurchase is enabled, and blocks dual slot strategies', () => {
    const slotConfig = new SkillSlotConfig({ limitsByLevel: { 2: 1 }, allowSlotPurchase: true });
    const base = Workspace.empty()
      .createCampaign('Buyable', { rules: { allowCustomStartingSkills: true, skillSlots: slotConfig } })
      .activeCampaign.addCharacter(Character.create('Ada', { startingSkills: [{ name: 'S1', level: 2 }] }));
    const rolled = ([1, 1, 1, 6] as const).reduce(
      (ws, die) => ws.activeCampaign.character('Ada').makeCheck('Do Anything').against(new StaticOpposition(10)).roll(new StubDiceRoller([die])).workspace,
      base,
    );

    const claimByReplace = rolled.activeCampaign.character('Ada').advance('S2').replacingSkill('S1');
    const claimByPurchase = rolled.activeCampaign.character('Ada').advance('S2').purchasingSlot();
    // @ts-expect-error ScopedClaimableAdvancement does not expose purchasingSlot
    expect(claimByReplace.purchasingSlot).toBeUndefined();
    // @ts-expect-error ScopedClaimableAdvancement does not expose replacingSkill
    expect(claimByPurchase.replacingSkill).toBeUndefined();

    const bought = claimByPurchase.claim();
    expect(bought.advancement).toMatchObject({ diceUpgradeXpSpent: 0, slotPurchaseXpSpent: 4, totalXpSpent: 4 });
    expect(bought.campaign.findCharacter('Ada')?.xp).toBe(0);
  });
});
