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

export type AdvancementSlotStrategy =
  | { readonly kind: 'direct' }
  | { readonly kind: 'replace'; readonly replacedSkillIdOrName: string }
  | { readonly kind: 'purchase-slot' };

export class ClaimableAdvancement {
  constructor(
    private readonly character: Character,
    private readonly newSkillName: string,
    private readonly slotConfig: SkillSlotConfig | null,
    private readonly strategy: AdvancementSlotStrategy,
  ) {
    Object.freeze(this);
  }

  claim(): AdvancementOutcome {
    return this.character.claimAdvancement(this.newSkillName, this.slotConfig, this.strategy);
  }
}

export class CharacterAdvancementBuilder {
  constructor(
    private readonly character: Character,
    private readonly newSkillName: string,
    private readonly slotConfig: SkillSlotConfig | null = null,
  ) {
    Object.freeze(this);
  }

  withSlotConfig(slotConfig: SkillSlotConfig | null): CharacterAdvancementBuilder {
    return new CharacterAdvancementBuilder(this.character, this.newSkillName, slotConfig);
  }

  replacingSkill(skillIdOrName: string): ClaimableAdvancement {
    return new ClaimableAdvancement(this.character, this.newSkillName, this.slotConfig, {
      kind: 'replace',
      replacedSkillIdOrName: skillIdOrName,
    });
  }

  purchasingSlot(): ClaimableAdvancement {
    return new ClaimableAdvancement(this.character, this.newSkillName, this.slotConfig, { kind: 'purchase-slot' });
  }

  claim(): AdvancementOutcome {
    return this.character.claimAdvancement(this.newSkillName, this.slotConfig, { kind: 'direct' });
  }
}
