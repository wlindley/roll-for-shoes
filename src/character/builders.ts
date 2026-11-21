import type { DiceRoller, DieValue } from '../dice';
import { Check, type CheckModifier, type CheckOpposition, type CheckOutcome, type CheckResult, RolledOpposition, type TiesMode } from '../checks';
import type { Character } from './character';
import { resolveId, type Skill } from './skill';

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
  ) { Object.freeze(this); }

  withTiesMode(tiesMode: TiesMode): ReadyCharacterCheck {
    return new ReadyCharacterCheck(this.character, this.skillUsed, this.opposition, this.actionDescription, tiesMode, this.modifiers);
  }

  roll(diceRoller: DiceRoller): CharacterCheckOutcome {
    const checkResult = Check.withDice(this.skillUsed.level).withModifiers(this.modifiers).withTiesMode(this.tiesMode).against(this.opposition).resolve(diceRoller);
    const next = this.character.applyRoll(this.skillUsed, checkResult.actor.rawDice, checkResult.outcome, xpForOutcome(checkResult.outcome), this.actionDescription);
    return new CharacterCheckOutcome(next, this.skillUsed, checkResult);
  }
}

export class OpposedParticipantBuilder {
  /** @internal */ readonly modifiers: readonly CheckModifier[];
  constructor(private readonly defender: Character, modifiers: readonly CheckModifier[] = []) {
    this.modifiers = Object.freeze([...modifiers]);
    Object.freeze(this);
  }
  withStatus(statusIdOrName: string): OpposedParticipantBuilder {
    const s = this.defender.status(statusIdOrName);
    return this.withModifier(s.name, s.rating);
  }
  withModifier(label: string, value: number): OpposedParticipantBuilder {
    return new OpposedParticipantBuilder(this.defender, [...this.modifiers, { label, value }]);
  }
}

export class CharacterCheckBuilder {
  constructor(
    private readonly character: Character,
    private readonly skillUsed: Skill,
    private readonly actionDescription?: string,
    private readonly tiesMode: TiesMode = 'fail',
    private readonly modifiers: readonly CheckModifier[] = [],
  ) {
    Object.freeze(this);
  }

  withAction(description: string): CharacterCheckBuilder {
    return new CharacterCheckBuilder(this.character, this.skillUsed, description, this.tiesMode, this.modifiers);
  }

  withStatus(statusIdOrName: string): CharacterCheckBuilder {
    const s = this.character.status(statusIdOrName);
    return this.withModifier(s.name, s.rating);
  }

  withModifier(label: string, value: number): CharacterCheckBuilder {
    return new CharacterCheckBuilder(this.character, this.skillUsed, this.actionDescription, this.tiesMode, [...this.modifiers, { label, value }]);
  }

  withTiesMode(tiesMode: TiesMode): CharacterCheckBuilder {
    return new CharacterCheckBuilder(this.character, this.skillUsed, this.actionDescription, tiesMode, this.modifiers);
  }

  against(opposition: CheckOpposition): ReadyCharacterCheck {
    return new ReadyCharacterCheck(this.character, this.skillUsed, opposition, this.actionDescription, this.tiesMode, this.modifiers);
  }

  againstCharacter(
    defender: Character,
    defenderSkillIdOrName: string,
    configureDefender?: (defenderBuilder: OpposedParticipantBuilder) => OpposedParticipantBuilder,
  ): ReadyOpposedCharacterCheck {
    const defenderSkill = defender.skill(defenderSkillIdOrName);
    const defenderMods = configureDefender ? configureDefender(new OpposedParticipantBuilder(defender)).modifiers : [];
    return new ReadyOpposedCharacterCheck(
      this.character, this.skillUsed, defender, defenderSkill, this.actionDescription, this.tiesMode, this.modifiers, defenderMods,
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
    private readonly actionDescription: string | undefined,
    private readonly tiesMode: TiesMode,
    private readonly actorModifiers: readonly CheckModifier[],
    private readonly defenderModifiers: readonly CheckModifier[],
  ) {
    Object.freeze(this);
  }

  withTiesMode(tiesMode: TiesMode): ReadyOpposedCharacterCheck {
    return new ReadyOpposedCharacterCheck(this.actor, this.actorSkill, this.defender, this.defenderSkill, this.actionDescription, tiesMode, this.actorModifiers, this.defenderModifiers);
  }

  roll(diceRoller: DiceRoller): OpposedCharacterCheckOutcome {
    const checkResult = Check.withDice(this.actorSkill.level)
      .withModifiers(this.actorModifiers)
      .withTiesMode(this.tiesMode)
      .against(new RolledOpposition(this.defenderSkill.level, { modifiers: this.defenderModifiers }))
      .resolve(diceRoller);
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
  constructor(private readonly character: Character, private readonly newSkillName: string) {
    Object.freeze(this);
  }

  claim(): AdvancementOutcome {
    return this.character.claimAdvancement(this.newSkillName);
  }
}
