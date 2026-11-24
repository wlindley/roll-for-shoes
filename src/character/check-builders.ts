import { validateDiceValues, type DiceRoller, type DieValue } from '../dice';
import { Check, type CheckModifier, type CheckOpposition, type CheckOutcome, type CheckResult, RolledOpposition, type RolledOppositionResult, type TiesMode } from '../checks';
import type { Character } from './character';
import type { Skill } from './skill';

const xpForOutcome = (outcome: CheckOutcome): number => (outcome === 'failure' ? 1 : 0);

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

  roll(diceRoller: DiceRoller): CharacterCheckOutcome {
    const base = Check.withDice(this.skillUsed.level).withModifiers(this.modifiers).withTiesMode(this.tiesMode);
    const check = this.diceValues ? base.withDiceValues(this.diceValues) : base;
    const checkResult = check.against(this.opposition).resolve(diceRoller);
    const next = this.character.applyRoll(this.skillUsed, checkResult.actor.rawDice, checkResult.outcome, xpForOutcome(checkResult.outcome), this.actionDescription);
    return new CharacterCheckOutcome(next, this.skillUsed, checkResult);
  }
}

export class OpposedParticipantBuilder {
  private readonly modifiers: readonly CheckModifier[];
  private readonly diceValues?: readonly DieValue[];
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
  toOpposition(label?: string): RolledOpposition {
    const base = RolledOpposition.withDice(this.skillLevel, { modifiers: this.modifiers, label });
    return this.diceValues ? base.withDiceValues(this.diceValues) : base;
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
    const initial = new OpposedParticipantBuilder(defender, defenderSkill.level);
    const defenderParticipant = configureDefender ? configureDefender(initial) : initial;
    return new ReadyOpposedCharacterCheck(
      this.character, this.skillUsed, defender, defenderSkill, defenderParticipant, this.actionDescription, this.tiesMode, this.modifiers, this.diceValues,
    );
  }
}

export class OpposedCharacterCheckOutcome {
  constructor(
    readonly actor: Character,
    readonly defender: Character,
    readonly actorSkill: Skill,
    readonly defenderSkill: Skill,
    readonly checkResult: CheckResult<RolledOppositionResult>,
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
    private readonly defenderParticipant: OpposedParticipantBuilder,
    private readonly actionDescription: string | undefined,
    private readonly tiesMode: TiesMode,
    private readonly actorModifiers: readonly CheckModifier[],
    private readonly actorDiceValues?: readonly DieValue[],
  ) {
    Object.freeze(this);
  }

  roll(diceRoller: DiceRoller): OpposedCharacterCheckOutcome {
    const base = Check.withDice(this.actorSkill.level).withModifiers(this.actorModifiers).withTiesMode(this.tiesMode);
    const check = this.actorDiceValues ? base.withDiceValues(this.actorDiceValues) : base;
    const checkResult = check.against(this.defenderParticipant.toOpposition()).resolve(diceRoller);
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
      checkResult.opposition.pool.rawDice,
      defenderOutcome,
      xpForOutcome(defenderOutcome),
    );
    return new OpposedCharacterCheckOutcome(nextActor, nextDefender, this.actorSkill, this.defenderSkill, checkResult);
  }
}
