export type CheckOutcome = 'success' | 'tie' | 'failure';
export type TiesMode = 'fail' | 'twist';

export enum DifficultyTier {
  Easy = 1,
  Moderate = 2,
  Hard = 3,
  VeryHard = 4,
}

export interface CheckModifier {
  readonly label: string;
  readonly value: number;
}

export function freezeModifiers(modifiers: readonly CheckModifier[] = []): readonly CheckModifier[] {
  return Object.freeze(modifiers.map((m) => Object.freeze({ ...m })));
}
