import type { DiceRoller, DieValue } from '../dice';
import { Check, type CheckOpposition, type CheckOutcome, type CheckResult } from '../checks';
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
    private readonly actionDescription?: string,
  ) { Object.freeze(this); }

  roll(diceRoller: DiceRoller): CharacterCheckOutcome {
    const checkResult = Check.withDice(this.skillUsed.level).against(this.opposition).resolve(diceRoller);
    const next = this.character.applyRoll(this.skillUsed, checkResult.actor.rawDice, checkResult.outcome, xpForOutcome(checkResult.outcome), this.actionDescription);
    return new CharacterCheckOutcome(next, this.skillUsed, checkResult);
  }
}

export class CharacterCheckBuilder {
  constructor(private readonly character: Character, private readonly skillUsed: Skill, private readonly actionDescription?: string) {
    Object.freeze(this);
  }

  withAction(description: string): CharacterCheckBuilder {
    return new CharacterCheckBuilder(this.character, this.skillUsed, description);
  }

  against(opposition: CheckOpposition): ReadyCharacterCheck {
    return new ReadyCharacterCheck(this.character, this.skillUsed, opposition, this.actionDescription);
  }
}
