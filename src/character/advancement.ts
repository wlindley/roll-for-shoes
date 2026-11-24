import type { DieValue } from '../dice';
import { type CheckOutcome, RolledPool } from '../checks';
import type { Character } from './character';
import { resolveId, type Skill } from './skill';
import type { SkillSlotConfig } from './skill-slots';

export class PendingAdvancement {
  readonly rollId: string;
  readonly usedSkillId: string;
  readonly usedSkillName: string;
  readonly usedSkillLevel: number;
  readonly rawDice: readonly DieValue[];
  readonly checkOutcome: CheckOutcome;
  readonly actionDescription?: string;

  constructor(props: {
    readonly rollId?: string;
    readonly usedSkillId: string;
    readonly usedSkillName: string;
    readonly usedSkillLevel: number;
    readonly rawDice: readonly DieValue[];
    readonly checkOutcome: CheckOutcome;
    readonly actionDescription?: string;
  }) {
    this.rollId = resolveId(props.rollId);
    this.usedSkillId = props.usedSkillId;
    this.usedSkillName = props.usedSkillName;
    this.usedSkillLevel = props.usedSkillLevel;
    this.rawDice = Object.freeze([...props.rawDice]);
    this.checkOutcome = props.checkOutcome;
    this.actionDescription = props.actionDescription;
    Object.freeze(this);
  }

  private get pool(): RolledPool { return new RolledPool(this.rawDice); }
  get targetLevel(): number { return this.usedSkillLevel + 1; }
  get xpCostToAdvance(): number { return this.pool.nonSixCount; }
  get naturalAllSixes(): boolean { return this.pool.naturalAllSixes; }
}

export class AdvancementOutcome {
  constructor(
    readonly character: Character,
    readonly createdSkill: Skill,
    readonly diceUpgradeXpSpent: number,
    readonly slotPurchaseXpSpent: number,
    readonly replacedSkill?: Skill,
  ) {
    Object.freeze(this);
  }

  get totalXpSpent(): number {
    return this.diceUpgradeXpSpent + this.slotPurchaseXpSpent;
  }
}

export class CharacterAdvancementBuilder {
  constructor(
    private readonly character: Character, private readonly newSkillName: string,
    private readonly slotConfig: SkillSlotConfig | null = null, private readonly replaceSkillIdOrName?: string,
    private readonly purchaseSlot = false,
  ) { Object.freeze(this); }

  withSlotConfig(slotConfig: SkillSlotConfig | null): CharacterAdvancementBuilder {
    return new CharacterAdvancementBuilder(this.character, this.newSkillName, slotConfig, this.replaceSkillIdOrName, this.purchaseSlot);
  }

  replacingSkill(skillIdOrName: string): CharacterAdvancementBuilder {
    return new CharacterAdvancementBuilder(this.character, this.newSkillName, this.slotConfig, skillIdOrName, this.purchaseSlot);
  }

  purchasingSlot(): CharacterAdvancementBuilder {
    return new CharacterAdvancementBuilder(this.character, this.newSkillName, this.slotConfig, this.replaceSkillIdOrName, true);
  }

  claim(): AdvancementOutcome {
    return this.character.claimAdvancement(this.newSkillName, this.slotConfig, this.replaceSkillIdOrName, this.purchaseSlot);
  }
}
