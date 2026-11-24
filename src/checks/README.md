# Module 2: Checks (`src/checks`)

Stateless, immutable check resolution engine for [Roll for Shoes](../../reference/rules.md), providing a fluent `Check` -> `ReadyCheck<TOpp>` -> `CheckResult<TOpp>` pipeline, computed `RolledPool` getters, discriminated `OppositionResult` (`StaticOppositionResult | RolledOppositionResult`), and polymorphic `CheckOpposition<TResult>` strategies.

---

## 1. What It Is

`src/checks` adjudicates dice checks under both the **Basic Rules** and **Advanced Rules** ([Difficulty, Ties, and Statuses](../../reference/rules.md)) without owning character state, XP pools, or persistence:

- **Strict Downward DAG Position**: Occupies Layer 2 of the [module dependency graph](../../docs/architecture.md#2-module-dependency-graph). It imports **only** from [`../dice`](../dice/index.ts) (`assertPositiveInt`, `validateDiceValues`, `DiceRoller`, and `DieValue`) and exposes its public contract exclusively through [`./index.ts`](./index.ts) for downstream modules ([`../character`](../character/index.ts), [`../campaign`](../campaign/index.ts), and `../ui`).
- **Single-Way Fluent Immutable Pipeline (`Check` -> `ReadyCheck<TOpp>` -> `CheckResult<TOpp>`)**:
  1. `Check.withDice(diceCount)` (or `Check.fromDice(dice)` for physical dice) validates the actor's pool size and starts a frozen builder where all check configuration happens in one canonical place: `.withDiceValues(dice)`, `.withModifier(label, value)`, `.withModifiers(modifiers)`, and `.withTiesMode(tiesMode)`.
  2. `.against(opposition)` binds a `CheckOpposition<TOpp>` and transitions to a single-responsibility terminal `ReadyCheck<TOpp>` exposing **only** `resolve(diceRoller)`.
  3. `.resolve(diceRoller)` rolls actor dice **first** (or uses predetermined `diceValues` without touching `diceRoller`) and resolves opposition **second**, returning a `CheckResult<TOpp>` with `actor`, `opposition`, `tiesMode`, and computed `margin` and `outcome` getters.
- **Polymorphic `CheckOpposition<TResult>` & Discriminated `OppositionResult` (OCP + Compile-Time Safety)**:
  - `OppositionResult` is a discriminated union of `StaticOppositionResult` (`{ kind: 'static', total, label? }`) and `RolledOppositionResult` (`{ kind: 'rolled', total, pool: RolledPool, label? }`), preserving compile-time pool narrowing through `CheckResult<TOpp>`.
  - `StaticOpposition` — fixed numeric threshold; returns `StaticOppositionResult` and consumes `0` dice.
  - `RolledOpposition` — instantiated via `RolledOpposition.withDice(diceCount, options?)` or `RolledOpposition.fromDice(dice, options?)` (symmetry with `Check.withDice` / `Check.fromDice`); returns `RolledOppositionResult`.
  - `DifficultyOpposition` — static factory namespace (`DifficultyOpposition.static(tier, options?)` -> `StaticDifficultyOpposition`, `DifficultyOpposition.dynamic(tier, options?)` -> `DynamicDifficultyOpposition`) and union type (`StaticDifficultyOpposition | DynamicDifficultyOpposition`). `StaticDifficultyOpposition` omits `withDiceValues` at compile time so passing physical dice to static difficulty is unrepresentable in TypeScript.
- **Computed `RolledPool` Getters (DRY / Single Source of Truth)**: `RolledPool` stores only frozen `rawDice` and `modifiers` arrays and computes `rawTotal`, `modifierTotal`, `finalTotal`, `nonSixCount`, and `naturalAllSixes` dynamically via getters. Modifiers never affect `nonSixCount` or `naturalAllSixes`.
- **Configurable `TiesMode` (`'fail'` vs. `'twist'`)**: `'fail'` (Basic Rules default) treats `margin === 0` as `'failure'`; `'twist'` (Advanced Rules) resolves `margin === 0` to `'tie'`.

### Module Files

| File | Responsibility |
| :--- | :--- |
| [`./index.ts`](./index.ts) | Public module entrypoint re-exporting all types, enums, interfaces, and classes. |
| [`./types.ts`](./types.ts) | `CheckOutcome`, `TiesMode`, `DifficultyTier`, `CheckModifier`, and modifier deep-freezing. |
| [`./rolled-pool.ts`](./rolled-pool.ts) | Immutable `RolledPool` class and computed dice/modifier getters. |
| [`./opposition.ts`](./opposition.ts) | `StaticOppositionResult`, `RolledOppositionResult`, `OppositionResult`, `CheckOpposition`, `StaticOpposition`, `RolledOpposition`, `StaticDifficultyOpposition`, `DynamicDifficultyOpposition`, and `DifficultyOpposition`. |
| [`./check.ts`](./check.ts) | Fluent `Check` builder, terminal `ReadyCheck<TOpp>`, and `CheckResult<TOpp>` adjudication. |
| [`./rolled-pool.test.ts`](./rolled-pool.test.ts) | Focused boundary tests for `RolledPool` immutability and computed getters. |
| [`./opposition.test.ts`](./opposition.test.ts) | Focused boundary tests for `StaticOpposition`, `RolledOpposition`, and `DifficultyOpposition.static` / `DifficultyOpposition.dynamic`. |
| [`./check.test.ts`](./check.test.ts) | Focused boundary tests for `Check`, `ReadyCheck`, `CheckResult`, `TiesMode`, and physical dice resolution. |
| [`./check-modifiers.test.ts`](./check-modifiers.test.ts) | Focused boundary tests for actor and opposition modifiers and `naturalAllSixes` invariance. |

---

## 2. How to Use It

### Basic Check Against `StaticOpposition`

```ts
import { StubDiceRoller } from '../dice';
import { Check, StaticOpposition } from '../checks';

const result = Check.withDice(2)
  .against(new StaticOpposition(6, 'Guard'))
  .resolve(new StubDiceRoller([4, 5]));

result.actor.rawDice;    // [4, 5]
result.actor.finalTotal; // 9
result.opposition;       // { kind: 'static', total: 6, label: 'Guard' }
result.margin;           // 3
result.outcome;          // 'success'
```

### Opposed Check Against `RolledOpposition` & Difficulty Presets

```ts
import { StubDiceRoller } from '../dice';
import { Check, DifficultyOpposition, DifficultyTier, RolledOpposition } from '../checks';

// 1. RolledOpposition (actor rolls first [5, 6], rival rolls second [4, 4])
const opposed = Check.withDice(2)
  .against(RolledOpposition.withDice(2, { label: 'Sentry' }).withModifier('Shield', 2))
  .resolve(new StubDiceRoller([5, 6, 4, 4]));

opposed.opposition.kind;          // 'rolled' (narrows opposition.pool without `?.`)
opposed.opposition.pool.rawDice;  // [4, 4]
opposed.opposition.total;         // 10
opposed.outcome;                  // 'success' (11 vs 10)

// 2. Static vs. Dynamic DifficultyOpposition + TiesMode ('twist')
const staticWall = DifficultyOpposition.static(DifficultyTier.Hard, { label: 'Wet Wall' }).withModifier('Slick', 2); // 11
const dynamicClimb = DifficultyOpposition.dynamic(DifficultyTier.Hard, { label: 'Climb Wall' }); // 3d6

const tiedClimb = Check.withDice(2)
  .withTiesMode('twist')
  .against(dynamicClimb)
  .resolve(new StubDiceRoller([3, 4, 2, 2, 3])); // 7 vs 7 -> 'tie'

// 3. Predetermined physical dice (consumes 0 rolls from diceRoller)
const tabletop = Check.fromDice([6, 4])
  .withTiesMode('twist')
  .against(RolledOpposition.fromDice([5, 5], { label: 'Rival' }))
  .resolve(new StubDiceRoller([]));
```

---

## 3. Public Interface Reference

All symbols below are exported from [`./index.ts`](./index.ts) (see also [`docs/interfaces.md`](../../docs/interfaces.md)):

```ts
import type { DiceRoller, DieValue } from '../dice';

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

export class RolledPool {
  readonly rawDice: readonly DieValue[];
  readonly modifiers: readonly CheckModifier[];
  constructor(rawDice: readonly DieValue[], modifiers?: readonly CheckModifier[]);
  get rawTotal(): number;
  get modifierTotal(): number;
  get finalTotal(): number;
  get nonSixCount(): number;
  get naturalAllSixes(): boolean;
}

export interface StaticOppositionResult {
  readonly kind: 'static';
  readonly total: number;
  readonly label?: string;
}

export interface RolledOppositionResult {
  readonly kind: 'rolled';
  readonly total: number;
  readonly pool: RolledPool;
  readonly label?: string;
}

export type OppositionResult = StaticOppositionResult | RolledOppositionResult;

export interface CheckOpposition<TResult extends OppositionResult = OppositionResult> {
  readonly label?: string;
  resolve(diceRoller: DiceRoller): TResult;
}

export class StaticOpposition implements CheckOpposition<StaticOppositionResult> {
  readonly target: number;
  readonly label?: string;
  constructor(target: number, label?: string);
  resolve(diceRoller: DiceRoller): StaticOppositionResult;
}

export class RolledOpposition implements CheckOpposition<RolledOppositionResult> {
  readonly diceCount: number;
  readonly modifiers: readonly CheckModifier[];
  readonly diceValues?: readonly DieValue[];
  readonly label?: string;

  static withDice(
    diceCount: number,
    options?: { readonly modifiers?: readonly CheckModifier[]; readonly label?: string; readonly diceValues?: readonly DieValue[] },
  ): RolledOpposition;

  static fromDice(
    dice: readonly DieValue[],
    options?: { readonly modifiers?: readonly CheckModifier[]; readonly label?: string },
  ): RolledOpposition;

  withDiceValues(dice: readonly DieValue[]): RolledOpposition;
  withModifier(label: string, value: number): RolledOpposition;
  resolve(diceRoller: DiceRoller): RolledOppositionResult;
}

export class StaticDifficultyOpposition implements CheckOpposition<StaticOppositionResult> {
  readonly mode: 'static';
  readonly tier: DifficultyTier;
  readonly modifiers: readonly CheckModifier[];
  readonly label?: string;
  constructor(tier: DifficultyTier, options?: { readonly modifiers?: readonly CheckModifier[]; readonly label?: string });
  withModifier(label: string, value: number): StaticDifficultyOpposition;
  resolve(diceRoller: DiceRoller): StaticOppositionResult;
}

export class DynamicDifficultyOpposition implements CheckOpposition<RolledOppositionResult> {
  readonly mode: 'dynamic';
  readonly tier: DifficultyTier;
  readonly modifiers: readonly CheckModifier[];
  readonly diceValues?: readonly DieValue[];
  readonly label?: string;
  constructor(
    tier: DifficultyTier,
    options?: { readonly modifiers?: readonly CheckModifier[]; readonly label?: string; readonly diceValues?: readonly DieValue[] },
  );
  withDiceValues(dice: readonly DieValue[]): DynamicDifficultyOpposition;
  withModifier(label: string, value: number): DynamicDifficultyOpposition;
  resolve(diceRoller: DiceRoller): RolledOppositionResult;
}

export type DifficultyOpposition = StaticDifficultyOpposition | DynamicDifficultyOpposition;

export const DifficultyOpposition: {
  readonly static: (
    tier: DifficultyTier,
    options?: { readonly modifiers?: readonly CheckModifier[]; readonly label?: string },
  ) => StaticDifficultyOpposition;
  readonly dynamic: (
    tier: DifficultyTier,
    options?: { readonly modifiers?: readonly CheckModifier[]; readonly label?: string; readonly diceValues?: readonly DieValue[] },
  ) => DynamicDifficultyOpposition;
};

export class CheckResult<TOpp extends OppositionResult = OppositionResult> {
  readonly actor: RolledPool;
  readonly opposition: TOpp;
  readonly tiesMode: TiesMode;
  constructor(actor: RolledPool, opposition: TOpp, tiesMode?: TiesMode);
  get margin(): number;
  get outcome(): CheckOutcome;
}

export class ReadyCheck<TOpp extends OppositionResult = OppositionResult> {
  resolve(diceRoller: DiceRoller): CheckResult<TOpp>;
}

export class Check {
  static withDice(diceCount: number): Check;
  static fromDice(dice: readonly DieValue[]): Check;
  withDiceValues(dice: readonly DieValue[]): Check;
  withModifier(label: string, value: number): Check;
  withModifiers(modifiers: readonly CheckModifier[]): Check;
  withTiesMode(tiesMode: TiesMode): Check;
  against<TOpp extends OppositionResult>(opposition: CheckOpposition<TOpp>): ReadyCheck<TOpp>;
}
