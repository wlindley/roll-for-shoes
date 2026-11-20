import type { DiceRoller } from '../dice';
import type { CheckOpposition, OppositionResult } from './opposition';
import { RolledPool } from './rolled-pool';
import { assertValidDiceCount, type CheckOutcome, type TiesMode } from './types';

export class CheckResult {
  constructor(
    readonly actor: RolledPool,
    readonly opposition: OppositionResult,
    readonly tiesMode: TiesMode = 'fail',
  ) {}

  get margin(): number { return this.actor.finalTotal - this.opposition.total; }

  get outcome(): CheckOutcome {
    if (this.margin > 0) return 'success';
    if (this.margin === 0 && this.tiesMode === 'twist') return 'tie';
    return 'failure';
  }
}

export class ReadyCheck {
  constructor(private readonly diceCount: number, private readonly opposition: CheckOpposition) {}

  resolve(diceRoller: DiceRoller): CheckResult {
    const actor = new RolledPool(diceRoller.roll(this.diceCount).dice);
    const opposition = this.opposition.resolve(diceRoller);
    return new CheckResult(actor, opposition);
  }
}

export class Check {
  private constructor(private readonly diceCount: number) {}

  static withDice(diceCount: number): Check {
    assertValidDiceCount(diceCount);
    return new Check(diceCount);
  }

  against(opposition: CheckOpposition): ReadyCheck {
    return new ReadyCheck(this.diceCount, opposition);
  }
}
