import { validateDiceValues, type DiceRoller, type DieValue } from '../dice';
import { Check, type CheckModifier, type CheckOpposition, type CheckOutcome, type CheckResult, RolledOpposition, type TiesMode } from '../checks';
import type { Character } from './character';
import { resolveId, type Skill } from './skill';
import type { SkillSlotConfig } from './skill-slots';

const xpForOutcome = (outcome: CheckOutcome): number => (outcome === 'failure' ? 1 : 0);

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

  get targetLevel(): number { return this.usedSkillLevel + 1; }
  get xpCostToAdvance(): number { return this.rawDice.filter((d) => d !== 6).length; }
  get naturalAllSixes(): boolean { return this.xpCostToAdvance === 0; }
}

export class CharacterCheckOutcome {
  constructor(readonly character: Character, readonly skillUsed: Skill, readonly checkResult: CheckResult) {
    Object.freeze(this);
  }

  get xpEarned(): number { return xpForOutcome(this.checkResult.outcome); }
  get canAdvanceNaturally(): boolean { return this.checkResult.actor.naturalAllSixes; }
  get canAdvance(): boolean { return this.character.pendingAdvancement !== null; }
}

export class ReadyCharacterCheck {
  constructor(
    private readonly character: Character,
    private readonly skillUsed: Skill,
    private readonly opposition: CheckOpposition,
    private readonly actionDescription: string | undefined,
    private readonly tiesMode: TiesMode,
    private readonly modifiers: readonly CheckModifier[],
    private readonly diceValues?: readonly DieValue[],
  ) { Object.freeze(this); }

  withTiesMode(tiesMode: TiesMode): ReadyCharacterCheck {
    return new ReadyCharacterCheck(this.character, this.skillUsed, this.opposition, this.actionDescription, tiesMode, this.modifiers, this.diceValues);
  }

  roll(diceRoller: DiceRoller): CharacterCheckOutcome {
    const base = Check.withDice(this.skillUsed.level).withModifiers(this.modifiers).withTiesMode(this.tiesMode);
    const check = this.diceValues ? base.withDiceValues(this.diceValues) : base;
    const checkResult = check.against(this.opposition).resolve(diceRoller);
    const next = this.character.applyRoll(this.skillUsed, checkResult.actor.rawDice, checkResult.outcome, xpForOutcome(checkResult.outcome), this.actionDescription);
    return new CharacterCheckOutcome(next, this.skillUsed, checkResult);
  }
}

export class OpposedParticipantBuilder {
  /** @internal */ readonly modifiers: readonly CheckModifier[];
  /** @internal */ readonly diceValues?: readonly DieValue[];
  constructor(
    private readonly defender: Character,
    private readonly skillLevel: number,
    modifiers: readonly CheckModifier[] = [],
    diceValues?: readonly DieValue[],
  ) {
    this.modifiers = Object.freeze([...modifiers]);
    this.diceValues = diceValues;
    Object.freeze(this);
  }
  withStatus(statusIdOrName: string): OpposedParticipantBuilder {
    const s = this.defender.status(statusIdOrName);
    return this.withModifier(s.name, s.rating);
  }
  withModifier(label: string, value: number): OpposedParticipantBuilder {
    return new OpposedParticipantBuilder(this.defender, this.skillLevel, [...this.modifiers, { label, value }], this.diceValues);
  }
  withDiceValues(dice: readonly DieValue[]): OpposedParticipantBuilder {
    return new OpposedParticipantBuilder(this.defender, this.skillLevel, this.modifiers, validateDiceValues(dice, this.skillLevel));
  }
}

export class CharacterCheckBuilder {
  constructor(
    private readonly character: Character,
    private readonly skillUsed: Skill,
    private readonly actionDescription?: string,
    private readonly tiesMode: TiesMode = 'fail',
    private readonly modifiers: readonly CheckModifier[] = [],
    private readonly diceValues?: readonly DieValue[],
  ) {
    Object.freeze(this);
  }

  withAction(description: string): CharacterCheckBuilder {
    return new CharacterCheckBuilder(this.character, this.skillUsed, description, this.tiesMode, this.modifiers, this.diceValues);
  }

  withStatus(statusIdOrName: string): CharacterCheckBuilder {
    const s = this.character.status(statusIdOrName);
    return this.withModifier(s.name, s.rating);
  }

  withModifier(label: string, value: number): CharacterCheckBuilder {
    return new CharacterCheckBuilder(this.character, this.skillUsed, this.actionDescription, this.tiesMode, [...this.modifiers, { label, value }], this.diceValues);
  }

  withDiceValues(dice: readonly DieValue[]): CharacterCheckBuilder {
    return new CharacterCheckBuilder(
      this.character, this.skillUsed, this.actionDescription, this.tiesMode, this.modifiers, validateDiceValues(dice, this.skillUsed.level),
    );
  }

  withTiesMode(tiesMode: TiesMode): CharacterCheckBuilder {
    return new CharacterCheckBuilder(this.character, this.skillUsed, this.actionDescription, tiesMode, this.modifiers, this.diceValues);
  }

  against(opposition: CheckOpposition): ReadyCharacterCheck {
    return new ReadyCharacterCheck(this.character, this.skillUsed, opposition, this.actionDescription, this.tiesMode, this.modifiers, this.diceValues);
  }

  againstCharacter(
    defender: Character,
    defenderSkillIdOrName: string,
    configureDefender?: (defenderBuilder: OpposedParticipantBuilder) => OpposedParticipantBuilder,
  ): ReadyOpposedCharacterCheck {
    const defenderSkill = defender.skill(defenderSkillIdOrName);
    const configured = configureDefender ? configureDefender(new OpposedParticipantBuilder(defender, defenderSkill.level)) : undefined;
    const defenderOpposition = new RolledOpposition(defenderSkill.level, { modifiers: configured?.modifiers, diceValues: configured?.diceValues });
    return new ReadyOpposedCharacterCheck(
      this.character, this.skillUsed, defender, defenderSkill, defenderOpposition, this.actionDescription, this.tiesMode, this.modifiers, this.diceValues,
    );
  }
}

export class OpposedCharacterCheckOutcome {
  constructor(
    readonly actor: Character,
    readonly defender: Character,
    readonly actorSkill: Skill,
    readonly defenderSkill: Skill,
    readonly checkResult: CheckResult,
  ) {
    Object.freeze(this);
  }

  get actorXpEarned(): number { return xpForOutcome(this.checkResult.outcome); }
  get defenderXpEarned(): number { return this.checkResult.outcome === 'success' ? 1 : 0; }
}

export class ReadyOpposedCharacterCheck {
  constructor(
    private readonly actor: Character,
    private readonly actorSkill: Skill,
    private readonly defender: Character,
    private readonly defenderSkill: Skill,
    private readonly defenderOpposition: RolledOpposition,
    private readonly actionDescription: string | undefined,
    private readonly tiesMode: TiesMode,
    private readonly actorModifiers: readonly CheckModifier[],
    private readonly actorDiceValues?: readonly DieValue[],
  ) {
    Object.freeze(this);
  }

  withTiesMode(tiesMode: TiesMode): ReadyOpposedCharacterCheck {
    return new ReadyOpposedCharacterCheck(
      this.actor, this.actorSkill, this.defender, this.defenderSkill, this.defenderOpposition, this.actionDescription, tiesMode, this.actorModifiers, this.actorDiceValues,
    );
  }

  roll(diceRoller: DiceRoller): OpposedCharacterCheckOutcome {
    const base = Check.withDice(this.actorSkill.level).withModifiers(this.actorModifiers).withTiesMode(this.tiesMode);
    const check = this.actorDiceValues ? base.withDiceValues(this.actorDiceValues) : base;
    const checkResult = check.against(this.defenderOpposition).resolve(diceRoller);
    const defenderOutcome: CheckOutcome =
      checkResult.outcome === 'tie' ? 'tie' : checkResult.outcome === 'success' ? 'failure' : 'success';
    const nextActor = this.actor.applyRoll(
      this.actorSkill,
      checkResult.actor.rawDice,
      checkResult.outcome,
      xpForOutcome(checkResult.outcome),
      this.actionDescription,
    );
    const nextDefender = this.defender.applyRoll(
      this.defenderSkill,
      checkResult.opposition.pool!.rawDice,
      defenderOutcome,
      xpForOutcome(defenderOutcome),
    );
    return new OpposedCharacterCheckOutcome(nextActor, nextDefender, this.actorSkill, this.defenderSkill, checkResult);
  }
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
