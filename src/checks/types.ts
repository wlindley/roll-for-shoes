export type CheckOutcome = 'success' | 'tie' | 'failure';
export type TiesMode = 'fail' | 'twist';
export interface CheckModifier {
  readonly label: string;
  readonly value: number;
}

export function assertValidDiceCount(diceCount: number): void {
  if (!Number.isInteger(diceCount) || diceCount < 1) {
    throw new RangeError(`Dice count must be a positive integer, received ${diceCount}`);
  }
}

export function freezeModifiers(modifiers: readonly CheckModifier[] = []): readonly CheckModifier[] {
  return Object.freeze(modifiers.map((m) => Object.freeze({ ...m })));
}
