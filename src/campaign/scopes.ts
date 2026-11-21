import type { DiceRoller } from '../dice';
import type { CheckOpposition } from '../checks';
import type { AdvancementOutcome, Character, CharacterAdvancementBuilder, CharacterCheckBuilder, CharacterCheckOutcome, OpposedCharacterCheckOutcome } from '../character';
import type { Campaign } from './campaign';

export class CampaignCharacterScope<TRoot> {
  constructor(private readonly campaign: Campaign, readonly character: Character, private readonly wrap: (nextCampaign: Campaign) => TRoot) {
    Object.freeze(this);
  }

  update(transform: (character: Character) => Character): TRoot {
    return this.wrap(this.campaign.replaceCharacter(transform(this.character)));
  }
  makeCheck(skillIdOrName: string): ScopedCheckBuilder<TRoot> {
    return new ScopedCheckBuilder(this.campaign, this.character.id, this.wrap, this.character.makeCheck(skillIdOrName));
  }
  advance(newSkillName: string): ScopedAdvancementBuilder<TRoot> {
    return new ScopedAdvancementBuilder(this.campaign, this.wrap, this.character.advance(newSkillName));
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

  againstCharacter(defenderIdOrName: string, defenderSkillIdOrName: string): { roll(diceRoller: DiceRoller): TRoot & { readonly outcome: OpposedCharacterCheckOutcome } } {
    const defender = this.campaign.requireCharacter(defenderIdOrName);
    if (defender.id === this.actorId) throw new Error(`Character cannot oppose themselves: ${defender.name}`);
    const ready = this.checkBuilder.againstCharacter(defender, defenderSkillIdOrName);
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

export class ScopedAdvancementBuilder<TRoot> {
  constructor(private readonly campaign: Campaign, private readonly wrap: (nextCampaign: Campaign) => TRoot, private readonly advancementBuilder: CharacterAdvancementBuilder) {
    Object.freeze(this);
  }

  claim(): TRoot & { readonly advancement: AdvancementOutcome } {
    const advancement = this.advancementBuilder.claim();
    return Object.freeze({ ...this.wrap(this.campaign.replaceCharacter(advancement.character)), advancement });
  }
}
