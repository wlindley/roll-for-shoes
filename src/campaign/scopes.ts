import type { DiceRoller, DieValue } from '../dice';
import type { CheckOpposition } from '../checks';
import type { AdvancementOutcome, Character, CharacterAdvancementBuilder, CharacterCheckBuilder, CharacterCheckOutcome, OpposedCharacterCheckOutcome, OpposedParticipantBuilder } from '../character';
import type { Campaign } from './campaign';
import { assertStatusesEnabled, type CampaignRulesConfig } from './rules';

let unwrapDefender!: (scoped: ScopedDefenderBuilder) => OpposedParticipantBuilder;

export class ScopedDefenderBuilder {
  static {
    unwrapDefender = (scoped) => scoped.inner;
  }

  constructor(private readonly inner: OpposedParticipantBuilder, private readonly rules: CampaignRulesConfig) {
    Object.freeze(this);
  }

  withStatus(statusIdOrName: string): ScopedDefenderBuilder {
    assertStatusesEnabled(this.rules);
    return new ScopedDefenderBuilder(this.inner.withStatus(statusIdOrName), this.rules);
  }

  withModifier(label: string, value: number): ScopedDefenderBuilder {
    return new ScopedDefenderBuilder(this.inner.withModifier(label, value), this.rules);
  }

  withDiceValues(dice: readonly DieValue[]): ScopedDefenderBuilder {
    return new ScopedDefenderBuilder(this.inner.withDiceValues(dice), this.rules);
  }
}

export class CampaignCharacterScope<TRoot> {
  constructor(private readonly campaign: Campaign, readonly character: Character, private readonly wrap: (nextCampaign: Campaign) => TRoot) {
    Object.freeze(this);
  }

  update(transform: (character: Character) => Character): TRoot {
    return this.wrap(this.campaign.replaceCharacter(transform(this.character)));
  }
  makeCheck(skillIdOrName: string): ScopedCheckBuilder<TRoot> {
    return new ScopedCheckBuilder(
      this.campaign,
      this.character.id,
      this.wrap,
      this.character.makeCheck(skillIdOrName).withTiesMode(this.campaign.rules.tiesMode),
    );
  }
  advance(newSkillName: string): ScopedAdvancementBuilder<TRoot> {
    return new ScopedAdvancementBuilder(this.campaign, this.wrap, this.character.advance(newSkillName).withSlotConfig(this.campaign.rules.skillSlots));
  }
  dismissAdvancement(): TRoot { return this.update((c) => c.dismissAdvancement()); }
}

export class ScopedCheckBuilder<TRoot> {
  constructor(
    private readonly campaign: Campaign, private readonly actorId: string,
    private readonly wrap: (nextCampaign: Campaign) => TRoot,
    private readonly checkBuilder: CharacterCheckBuilder, private readonly actionDescription?: string,
  ) { Object.freeze(this); }

  withAction(description: string): ScopedCheckBuilder<TRoot> {
    return new ScopedCheckBuilder(this.campaign, this.actorId, this.wrap, this.checkBuilder.withAction(description), description);
  }

  withStatus(statusIdOrName: string): ScopedCheckBuilder<TRoot> {
    assertStatusesEnabled(this.campaign.rules);
    return new ScopedCheckBuilder(this.campaign, this.actorId, this.wrap, this.checkBuilder.withStatus(statusIdOrName), this.actionDescription);
  }

  withModifier(label: string, value: number): ScopedCheckBuilder<TRoot> {
    return new ScopedCheckBuilder(this.campaign, this.actorId, this.wrap, this.checkBuilder.withModifier(label, value), this.actionDescription);
  }

  withDiceValues(dice: readonly DieValue[]): ScopedCheckBuilder<TRoot> {
    return new ScopedCheckBuilder(this.campaign, this.actorId, this.wrap, this.checkBuilder.withDiceValues(dice), this.actionDescription);
  }

  against(opposition: CheckOpposition): { roll(diceRoller: DiceRoller): TRoot & { readonly outcome: CharacterCheckOutcome } } {
    const ready = this.checkBuilder.against(opposition);
    return this.makeRoller((diceRoller) => {
      const outcome = ready.roll(diceRoller);
      return [outcome, this.campaign.recordRoll([outcome.character], {
        kind: 'vs_opposition', actorId: outcome.character.id, actorName: outcome.character.name,
        actorSkillName: outcome.skillUsed.name, actionDescription: this.actionDescription,
        checkResult: outcome.checkResult, actorXpEarned: outcome.xpEarned,
      })];
    });
  }

  againstCharacter(
    defenderIdOrName: string,
    defenderSkillIdOrName: string,
    configureDefender?: (b: ScopedDefenderBuilder) => ScopedDefenderBuilder,
  ): { roll(diceRoller: DiceRoller): TRoot & { readonly outcome: OpposedCharacterCheckOutcome } } {
    const defender = this.campaign.requireCharacter(defenderIdOrName);
    if (defender.id === this.actorId) throw new Error(`Character cannot oppose themselves: ${defender.name}`);
    const ready = this.checkBuilder.againstCharacter(
      defender,
      defenderSkillIdOrName,
      configureDefender && ((b) => unwrapDefender(configureDefender(new ScopedDefenderBuilder(b, this.campaign.rules)))),
    );
    return this.makeRoller((diceRoller) => {
      const outcome = ready.roll(diceRoller);
      return [outcome, this.campaign.recordRoll([outcome.actor, outcome.defender], {
        kind: 'character_opposed', actorId: outcome.actor.id, actorName: outcome.actor.name, actorSkillName: outcome.actorSkill.name,
        defenderId: outcome.defender.id, defenderName: outcome.defender.name, defenderSkillName: outcome.defenderSkill.name,
        actionDescription: this.actionDescription, checkResult: outcome.checkResult,
        actorXpEarned: outcome.actorXpEarned, defenderXpEarned: outcome.defenderXpEarned,
      })];
    });
  }

  private makeRoller<TOutcome>(exec: (diceRoller: DiceRoller) => readonly [TOutcome, Campaign]): { roll(diceRoller: DiceRoller): TRoot & { readonly outcome: TOutcome } } {
    return Object.freeze({
      roll: (diceRoller: DiceRoller) => {
        const [outcome, nextCampaign] = exec(diceRoller);
        return Object.freeze({ ...this.wrap(nextCampaign), outcome });
      },
    });
  }
}

export class ScopedClaimableAdvancement<TRoot> {
  constructor(
    private readonly campaign: Campaign,
    private readonly wrap: (nextCampaign: Campaign) => TRoot,
    private readonly claimable: { claim(): AdvancementOutcome },
  ) {
    Object.freeze(this);
  }

  claim(): TRoot & { readonly advancement: AdvancementOutcome } {
    const advancement = this.claimable.claim();
    return Object.freeze({ ...this.wrap(this.campaign.replaceCharacter(advancement.character)), advancement });
  }
}

export class ScopedAdvancementBuilder<TRoot> {
  constructor(private readonly campaign: Campaign, private readonly wrap: (nextCampaign: Campaign) => TRoot, private readonly advancementBuilder: CharacterAdvancementBuilder) {
    Object.freeze(this);
  }

  replacingSkill(skillIdOrName: string): ScopedClaimableAdvancement<TRoot> {
    return new ScopedClaimableAdvancement(this.campaign, this.wrap, this.advancementBuilder.replacingSkill(skillIdOrName));
  }

  purchasingSlot(): ScopedClaimableAdvancement<TRoot> {
    return new ScopedClaimableAdvancement(this.campaign, this.wrap, this.advancementBuilder.purchasingSlot());
  }

  claim(): TRoot & { readonly advancement: AdvancementOutcome } {
    return new ScopedClaimableAdvancement(this.campaign, this.wrap, this.advancementBuilder).claim();
  }
}
