# Module 2: Checks (`src/checks`)

Stateless, immutable check resolution engine for [Roll for Shoes](../../reference/rules.md), providing a fluent `Check` -> `ReadyCheck` -> `CheckResult` pipeline, computed `RolledPool` getters, and polymorphic `CheckOpposition` strategies.

---

## 1. What It Is

`src/checks` adjudicates dice checks under both the **Basic Rules** and **Advanced Rules** ([Difficulty, Ties, and Statuses](../../reference/rules.md)) without owning character state, XP pools, or persistence:

- **Strict Downward DAG Position**: Occupies Layer 2 of the [module dependency graph](../../docs/architecture.md#2-module-dependency-graph). It imports **only** from [`../dice`](../dice/index.ts) (`DiceRoller` and `DieValue`) and exposes its public contract exclusively through [`./index.ts`](./index.ts) for downstream modules ([`../character`](../character/index.ts), [`../campaign`](../campaign/index.ts), and `../ui`).
- **Fluent Immutable Pipeline (`Check` -> `ReadyCheck` -> `CheckResult`)**:
  1. `Check.withDice(diceCount)` (or `Check.fromDice(dice)` for physical dice) validates the actor's pool size and starts a frozen builder where predetermined dice (`.withDiceValues()`), actor modifiers (`.withModifier()`, `.withModifiers()`), and tie behavior (`.withTiesMode()`) can be configured.
  2. `.against(opposition)` binds a `CheckOpposition` and returns a frozen `ReadyCheck` (which still accepts `.withDiceValues()`, `.withModifier()`, `.withModifiers()`, and `.withTiesMode()` overrides).
  3. `.resolve(diceRoller)` rolls dice (or uses predetermined `diceValues` without touching `diceRoller`) and returns a `CheckResult` exposing `actor`, `opposition`, `tiesMode`, and computed `margin` and `outcome` getters. Every builder step returns a **new** instance (`next !== prev`) and clones/freezes dice and modifier arrays so shared builders never mutate.
- **Polymorphic `CheckOpposition` (Open/Closed Principle)**: `Check` and `ReadyCheck` depend solely on the narrow `CheckOpposition` interface (`resolve(diceRoller): OppositionResult`) rather than branching on type tags. Three built-in implementations cover every opposition mode in the game:
  - `StaticOpposition` — fixed numeric threshold; consumes `0` dice from `diceRoller`.
  - `RolledOpposition` — opposing `d6` pool (rolled or predetermined via `RolledOpposition.fromDice` / `.withDiceValues()`) with optional additive modifiers (e.g., an NPC or rival roll).
  - `DifficultyOpposition` — named GM difficulty tier (`DifficultyTier.Easy = 1` .. `DifficultyTier.VeryHard = 4`) resolved as either `'static'` (`tier * 3`, `0` dice rolled; rejects `diceValues`) or `'dynamic'` (`tier`d6 rolled or predetermined via `.withDiceValues()`), plus optional modifiers. Custom `CheckOpposition` implementations can be supplied without modifying `Check` or `ReadyCheck`.
- **Computed `RolledPool` Getters (DRY / Single Source of Truth)**: `RolledPool` stores only frozen `rawDice` and `modifiers` arrays and computes every derived metric via getters:
  - `rawTotal` (sum of `rawDice`), `modifierTotal` (sum of `modifiers`), and `finalTotal` (`rawTotal + modifierTotal`, which may be `0` or negative under heavy penalties).
  - `nonSixCount` (dice in `rawDice` not showing `6`, equal to the XP upgrade cost for advancement) and `naturalAllSixes` (`rawDice.length > 0 && nonSixCount === 0`). Because advancement in Roll for Shoes is governed strictly by rolled dice, `nonSixCount` and `naturalAllSixes` are **completely unaffected by modifiers**.
- **Configurable `TiesMode` (`'fail'` vs. `'twist'`)**:
  - `'fail'` *(Basic Rules default)*: Actor must strictly beat the opposition (`margin > 0`), so equal totals (`margin === 0`) resolve to `'failure'`.
  - `'twist'` *(Advanced Ties rule)*: Equal totals (`margin === 0`) resolve to `'tie'` (partial success with an unexpected twist or minor consequence; awards `0 XP` in [`../character`](../character/index.ts)). Strict wins (`margin > 0`) and strict losses (`margin < 0`) remain `'success'` and `'failure'`.
- **Deterministic Roll Ordering**: `ReadyCheck.resolve(diceRoller)` **always** resolves the actor's dice pool **first** (`this.diceValues ?? diceRoller.roll(actorDiceCount).dice`) and `opposition.resolve(diceRoller)` **second**. Any side supplying predetermined `diceValues` skips `diceRoller.roll(...)`, preserving deterministic FIFO consumption when testing with `StubDiceRoller` across [`./checks.test.ts`](./checks.test.ts) and all higher modules.

### Module Files

| File | Responsibility |
| :--- | :--- |
| [`./index.ts`](./index.ts) | Public module entrypoint re-exporting all types, enums, interfaces, and classes. |
| [`./types.ts`](./types.ts) | `CheckOutcome`, `TiesMode`, `DifficultyTier`, `CheckModifier`, dice-count/face validation (`freezeDiceValues`), and modifier deep-freezing. |
| [`./rolled-pool.ts`](./rolled-pool.ts) | Immutable `RolledPool` class and computed dice/modifier getters. |
| [`./opposition.ts`](./opposition.ts) | `CheckOpposition`, `OppositionResult`, `StaticOpposition`, `RolledOpposition`, and `DifficultyOpposition`. |
| [`./check.ts`](./check.ts) | Fluent `Check` and `ReadyCheck` builders and `CheckResult` outcome adjudication. |
| [`./checks.test.ts`](./checks.test.ts) | Vitest boundary test suite exercising every public export, invariant, and error path with `StubDiceRoller`. |

---

## 2. How to Use It

### Basic Check Against a `StaticOpposition`

```ts
import { RandomDiceRoller, StubDiceRoller } from '../dice';
import { Check, StaticOpposition } from '../checks';

// Use RandomDiceRoller in production, or StubDiceRoller for deterministic rolls:
const roller = new StubDiceRoller([4, 5]);

const result = Check.withDice(2)
  .against(new StaticOpposition(6, 'Guard'))
  .resolve(roller);

result.actor.rawDice;     // [4, 5]
result.actor.finalTotal;  // 9
result.opposition.total;  // 6
result.opposition.label;  // 'Guard'
result.opposition.pool;   // undefined (StaticOpposition consumes 0 dice)
result.margin;            // 3  (9 - 6)
result.outcome;           // 'success'
```

### Opposed Check Against `RolledOpposition` (Deterministic Roll Order)

When both sides roll dice, `ReadyCheck.resolve()` consumes the actor's dice first and the opponent's dice second:

```ts
import { StubDiceRoller } from '../dice';
import { Check, RolledOpposition } from '../checks';

// First 2 dice ([5, 6]) go to the actor; next 2 dice ([4, 4]) go to the rival.
const roller = new StubDiceRoller([5, 6, 4, 4]);

const rival = new RolledOpposition(2, { label: 'Armored Sentry' })
  .withModifier('Shield', 2);

const result = Check.withDice(2).against(rival).resolve(roller);

result.actor.rawDice;                  // [5, 6]
result.actor.finalTotal;               // 11

result.opposition.pool?.rawDice;       // [4, 4]
result.opposition.pool?.rawTotal;      // 8
result.opposition.pool?.modifierTotal; // 2
result.opposition.total;               // 10 (8 + 2)
result.opposition.label;               // 'Armored Sentry'

result.margin;                         // 1  (11 - 10)
result.outcome;                        // 'success'
roller.remaining;                      // 0
```

### Difficulty Presets (`DifficultyTier` Static vs. Dynamic)

`DifficultyTier` maps directly to both static target ratings (`tier * 3`) and dynamic GM dice pools (`tier`d6):

| Tier | Enum Value | `'static'` Base (`tier * 3`) | `'dynamic'` Pool (`tier`d6) |
| :--- | :---: | :---: | :---: |
| `DifficultyTier.Easy` | `1` | `3` | `1d6` |
| `DifficultyTier.Moderate` | `2` | `6` | `2d6` |
| `DifficultyTier.Hard` | `3` | `9` | `3d6` |
| `DifficultyTier.VeryHard` | `4` | `12` | `4d6` |

```ts
import { StubDiceRoller } from '../dice';
import { Check, DifficultyOpposition, DifficultyTier } from '../checks';

// 1. Static mode (default): target = tier * 3 + modifiers, consumes 0 opposition dice
const staticWall = new DifficultyOpposition(DifficultyTier.Hard, 'static', {
  label: 'Wet Wall',
}).withModifier('Slick', 2); // 3 * 3 + 2 = 11

const staticRes = Check.withDice(2)
  .against(staticWall)
  .resolve(new StubDiceRoller([5, 6]));

staticRes.opposition.total; // 11
staticRes.opposition.pool;  // undefined
staticRes.outcome;          // 'failure' (11 vs 11 ties fail under default 'fail' mode)

// 2. Dynamic mode: actor rolls 2d6 ([5, 4] = 9) first, GM rolls 3d6 ([2, 2, 3] = 7) second
const dynamicClimb = new DifficultyOpposition(DifficultyTier.Hard, 'dynamic', {
  label: 'Climb Wall',
});

const dynamicRes = Check.withDice(2)
  .against(dynamicClimb)
  .resolve(new StubDiceRoller([5, 4, 2, 2, 3]));

dynamicRes.actor.finalTotal;         // 9
dynamicRes.opposition.pool?.rawDice; // [2, 2, 3]
dynamicRes.opposition.total;         // 7
dynamicRes.margin;                   // 2
dynamicRes.outcome;                  // 'success'
```

### Actor Status / Situational Modifiers & `naturalAllSixes` Invariance

Modifiers adjust `modifierTotal` and `finalTotal` additively, while `rawTotal`, `nonSixCount`, and `naturalAllSixes` always reflect the unmodified `rawDice`:

```ts
import { StubDiceRoller } from '../dice';
import { Check, StaticOpposition } from '../checks';

// Chaining single and batch modifiers (works on both Check and ReadyCheck):
const descent = Check.withDice(3)
  .withModifier('Raining', -4)
  .withModifiers([
    { label: 'Chalk Grip', value: 1 },
    { label: 'Clean Shoe', value: 2 },
  ])
  .against(new StaticOpposition(10))
  .resolve(new StubDiceRoller([3, 5, 6]));

descent.actor.rawTotal;        // 14 (3 + 5 + 6)
descent.actor.modifierTotal;   // -1 (-4 + 1 + 2)
descent.actor.finalTotal;      // 13 (14 + -1)
descent.actor.nonSixCount;     // 2  (the 3 and the 5)
descent.actor.naturalAllSixes; // false
descent.outcome;               // 'success' (13 > 10)

// Negative penalties can cause a check to fail, yet natural all-6s remain intact:
const penalizedSixes = Check.withDice(2)
  .withModifier('Broken Nose', -3)
  .against(new StaticOpposition(10))
  .resolve(new StubDiceRoller([6, 6]));

penalizedSixes.actor.rawTotal;        // 12
penalizedSixes.actor.finalTotal;      // 9  (12 - 3)
penalizedSixes.outcome;               // 'failure' (9 < 10)
penalizedSixes.actor.naturalAllSixes; // true (rawDice are [6, 6])
penalizedSixes.actor.nonSixCount;     // 0

// Conversely, positive bonuses never manufacture fake 6s on non-6 dice:
const boostedFours = Check.withDice(2)
  .withModifier('Inspired', 4)
  .against(new StaticOpposition(10))
  .resolve(new StubDiceRoller([4, 4]));

boostedFours.actor.finalTotal;      // 12 (8 + 4 -> 'success')
boostedFours.actor.naturalAllSixes; // false (rawDice are [4, 4])
boostedFours.actor.nonSixCount;     // 2
```

### Partial Success With a Twist (`withTiesMode('twist')`)

`.withTiesMode('twist')` can be called either on `Check` (before `.against(...)`) or on `ReadyCheck` (after `.against(...)`):

```ts
import { StubDiceRoller } from '../dice';
import { Check, DifficultyOpposition, DifficultyTier } from '../checks';

// Actor rolls [3, 4] = 7; Hard dynamic difficulty rolls [2, 2, 3] = 7.
const result = Check.withDice(2)
  .against(new DifficultyOpposition(DifficultyTier.Hard, 'dynamic'))
  .withTiesMode('twist')
  .resolve(new StubDiceRoller([3, 4, 2, 2, 3]));

result.actor.finalTotal; // 7
result.opposition.total; // 7
result.margin;           // 0
result.tiesMode;         // 'twist'
result.outcome;          // 'tie' (barely succeeds with a twist; 0 XP)
```

### Physical / Predetermined Dice Values (`fromDice` & `withDiceValues`)

When players or the GM roll physical tabletop dice, supply exact `DieValue` (`1..6`) arrays on the actor, opposition, or both—skipping `diceRoller` for any predetermined pool:

```ts
import { StubDiceRoller } from '../dice';
import { Check, DifficultyOpposition, DifficultyTier, RolledOpposition } from '../checks';

// Both sides enter physical dice: consumes 0 random rolls
const bothPhysical = Check.fromDice([6, 4])
  .against(RolledOpposition.fromDice([5, 5], { label: 'Rival' }))
  .withTiesMode('twist')
  .resolve(new StubDiceRoller([]));

bothPhysical.actor.rawDice;            // [6, 4]
bothPhysical.opposition.pool?.rawDice; // [5, 5]
bothPhysical.outcome;                  // 'tie'

// Dynamic DifficultyOpposition also accepts physical dice matching `tier`:
const chasm = new DifficultyOpposition(DifficultyTier.Moderate, 'dynamic', { label: 'Chasm' })
  .withDiceValues([6, 2])
  .withModifier('Windy', 1); // 8 + 1 = 9
```

---

## 3. Public Interface Reference

All symbols below are exported from [`./index.ts`](./index.ts) (see also [`docs/interfaces.md`](../../docs/interfaces.md)).

### Types & Enums ([`./types.ts`](./types.ts))

#### `CheckOutcome`

```ts
export type CheckOutcome = 'success' | 'tie' | 'failure';
```

- `'success'` — `margin > 0` (`actor.finalTotal > opposition.total`).
- `'tie'` — `margin === 0` when `tiesMode === 'twist'`.
- `'failure'` — `margin < 0`, or `margin === 0` when `tiesMode === 'fail'`.

#### `TiesMode`

```ts
export type TiesMode = 'fail' | 'twist';
```

- `'fail'` — Basic Rules default: equal totals (`margin === 0`) count as `'failure'`.
- `'twist'` — Advanced Rules: equal totals (`margin === 0`) count as `'tie'`.

#### `DifficultyTier`

```ts
export enum DifficultyTier {
  Easy = 1,
  Moderate = 2,
  Hard = 3,
  VeryHard = 4,
}
```

Numeric enum encoding GM task difficulty tiers (`1`..`4`), used by `DifficultyOpposition` as `tier * 3` in `'static'` mode and `tier`d6 in `'dynamic'` mode.

#### `CheckModifier`

```ts
export interface CheckModifier {
  readonly label: string;
  readonly value: number;
}
```

Named additive bonus (`value > 0`) or penalty (`value < 0`) applied to a `RolledPool` or `DifficultyOpposition`. All classes in `src/checks` clone and `Object.freeze` incoming modifier objects and arrays on construction.

---

### `RolledPool` ([`./rolled-pool.ts`](./rolled-pool.ts))

```ts
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
```

- **`constructor(rawDice, modifiers?)`**: Shallow-copies and freezes `rawDice` (`Object.freeze([...rawDice])`) and clones + deep-freezes `modifiers` (defaults to frozen `[]` when omitted). Does not throw (an empty `rawDice` array yields `rawTotal === 0` and `naturalAllSixes === false`).
- **`get rawTotal(): number`**: Computed arithmetic sum of `this.rawDice`.
- **`get modifierTotal(): number`**: Computed arithmetic sum of `this.modifiers[i].value` (`0` when empty).
- **`get finalTotal(): number`**: Computed `this.rawTotal + this.modifierTotal` (may be `<= 0` when negative penalties exceed `rawTotal`).
- **`get nonSixCount(): number`**: Computed count of elements in `this.rawDice` where `die !== 6`.
- **`get naturalAllSixes(): boolean`**: Computed `this.rawDice.length > 0 && this.nonSixCount === 0` (evaluated strictly from `rawDice`, unaffected by `modifiers`).

---

### Polymorphic Opposition ([`./opposition.ts`](./opposition.ts))

#### `OppositionResult`

```ts
export interface OppositionResult {
  readonly total: number;
  readonly pool?: RolledPool;
  readonly label?: string;
}
```

- **`total`**: Final numeric target that `actor.finalTotal` is compared against.
- **`pool`**: Populated with a `RolledPool` when dice were rolled (`RolledOpposition` or `'dynamic'` `DifficultyOpposition`); `undefined` for static thresholds.
- **`label`**: Optional descriptive label forwarded from the `CheckOpposition`.

#### `CheckOpposition`

```ts
export interface CheckOpposition {
  readonly label?: string;
  resolve(diceRoller: DiceRoller): OppositionResult;
}
```

Behavioral interface implemented by all opposition strategies and accepted by `Check.against(opposition)`.

#### `StaticOpposition`

```ts
export class StaticOpposition implements CheckOpposition {
  readonly target: number;
  readonly label?: string;

  constructor(target: number, label?: string);
  resolve(diceRoller: DiceRoller): OppositionResult;
}
```

- **`constructor(target, label?)`**: Stores fixed numeric `target` and optional `label`. Does not throw.
- **`resolve(_diceRoller)`**: Consumes **0 dice** from `_diceRoller` and returns a frozen `{ total: this.target, label: this.label }` (`pool` is `undefined`).

#### `RolledOpposition`

```ts
export class RolledOpposition implements CheckOpposition {
  readonly diceCount: number;
  readonly modifiers: readonly CheckModifier[];
  readonly diceValues?: readonly DieValue[];
  readonly label?: string;

  constructor(
    diceCount: number,
    options?: {
      readonly modifiers?: readonly CheckModifier[];
      readonly label?: string;
      readonly diceValues?: readonly DieValue[];
    },
  );

  static fromDice(
    dice: readonly DieValue[],
    options?: { readonly modifiers?: readonly CheckModifier[]; readonly label?: string },
  ): RolledOpposition;

  withDiceValues(dice: readonly DieValue[]): RolledOpposition;
  withModifier(label: string, value: number): RolledOpposition;
  resolve(diceRoller: DiceRoller): OppositionResult;
}
```

- **`constructor(diceCount, options?)`**: Clones and freezes `options?.modifiers` (defaults to `[]`), validates and freezes optional `options?.diceValues`, and stores `options?.label`.
  - `@throws {RangeError}` (`Dice count must be a positive integer, received ...`) if `!Number.isInteger(diceCount)` or `diceCount < 1` (rejects `0`, negative numbers, decimals, `NaN`, and `±Infinity`).
  - `@throws {RangeError}` if `options?.diceValues` has length `!== diceCount` or contains a non-`DieValue` face.
- **`static fromDice(dice, options?)`**: Convenience factory equivalent to `new RolledOpposition(dice.length, { ...options, diceValues: dice })`.
  - `@throws {RangeError}` if `dice.length < 1` or any element fails `isDieValue`.
- **`withDiceValues(dice)`**: Returns a **new** frozen `RolledOpposition` with `diceValues` validated (`dice.length === this.diceCount`) and frozen, preserving `modifiers` and `label`.
  - `@throws {RangeError}` if `dice.length !== this.diceCount` or any element fails `isDieValue`.
- **`withModifier(label, value)`**: Returns a **new** `RolledOpposition` with `{ label, value }` appended to `this.modifiers` and `this.label` and `this.diceValues` preserved.
- **`resolve(diceRoller)`**: Uses `this.diceValues` when present (consuming **0 dice** from `diceRoller`) or calls `diceRoller.roll(this.diceCount).dice`, wraps the dice and `this.modifiers` in a `RolledPool`, and returns a frozen `{ total: pool.finalTotal, pool, label: this.label }`.
  - `@throws {Error}` if `this.diceValues` is `undefined` and `diceRoller` fails (e.g., `StubDiceRoller` queue exhausted).

#### `DifficultyOpposition`

```ts
export class DifficultyOpposition implements CheckOpposition {
  readonly tier: DifficultyTier;
  readonly mode: 'static' | 'dynamic';
  readonly modifiers: readonly CheckModifier[];
  readonly diceValues?: readonly DieValue[];
  readonly label?: string;

  constructor(
    tier: DifficultyTier,
    mode?: 'static' | 'dynamic',
    options?: {
      readonly modifiers?: readonly CheckModifier[];
      readonly label?: string;
      readonly diceValues?: readonly DieValue[];
    },
  );

  withDiceValues(dice: readonly DieValue[]): DifficultyOpposition;
  withModifier(label: string, value: number): DifficultyOpposition;
  resolve(diceRoller: DiceRoller): OppositionResult;
}
```

- **`constructor(tier, mode = 'static', options?)`**: Defaults `mode` to `'static'`, clones and deep-freezes `options?.modifiers` (defaults to `[]`), validates/freezes optional `options?.diceValues` (when `mode === 'dynamic'`), sets `label`, and freezes the instance (`Object.freeze(this)`).
  - `@throws {Error}` (`Cannot supply dice values for static difficulty opposition`) if `options?.diceValues` is provided while `mode === 'static'`.
  - `@throws {RangeError}` if `options?.diceValues` is provided in `'dynamic'` mode with `dice.length !== tier` or any invalid `DieValue`.
- **`withDiceValues(dice)`**: Returns a **new** frozen `DifficultyOpposition` with predetermined `diceValues` (`dice.length === this.tier`).
  - `@throws {Error}` if `this.mode === 'static'`.
  - `@throws {RangeError}` if `dice.length !== this.tier` or any element fails `isDieValue`.
- **`withModifier(label, value)`**: Returns a **new** frozen `DifficultyOpposition` preserving `tier`, `mode`, `label`, and `diceValues` with `{ label, value }` appended to `this.modifiers`.
- **`resolve(diceRoller)`**:
  - When `mode === 'static'`: Consumes **0 dice** from `diceRoller` and returns a frozen `{ total: this.tier * 3 + modifierTotal, label: this.label }` (`pool` is `undefined`).
  - When `mode === 'dynamic'`: Uses `this.diceValues` when present (consuming **0 dice** from `diceRoller`) or calls `diceRoller.roll(this.tier).dice`, builds `pool = new RolledPool(rawDice, this.modifiers)`, and returns a frozen `{ total: pool.finalTotal, pool, label: this.label }`.
  - `@throws {RangeError}` in `'dynamic'` mode (without `diceValues`) if `diceRoller.roll(this.tier)` rejects a coerced invalid `tier` (`< 1` or non-integer).
  - `@throws {Error}` in `'dynamic'` mode (without `diceValues`) if a `StubDiceRoller` has fewer than `this.tier` dice remaining.

---

### Check Builders & Result ([`./check.ts`](./check.ts))

#### `Check`

```ts
export class Check {
  static withDice(diceCount: number): Check;
  static fromDice(dice: readonly DieValue[]): Check;

  withDiceValues(dice: readonly DieValue[]): Check;
  withModifier(label: string, value: number): Check;
  withModifiers(modifiers: readonly CheckModifier[]): Check;
  withTiesMode(tiesMode: TiesMode): Check;
  against(opposition: CheckOpposition): ReadyCheck;
}
```

Immutable builder with a `private` constructor (instantiate via `Check.withDice(diceCount)` or `Check.fromDice(dice)`). Every instance is frozen with `Object.freeze(this)`.

- **`static withDice(diceCount)`**: Starts a check rolling `diceCount` d6s for the actor with no modifiers and default tie handling (`'fail'` unless overridden).
  - `@throws {RangeError}` (`Dice count must be a positive integer, received ...`) if `!Number.isInteger(diceCount)` or `diceCount < 1`.
- **`static fromDice(dice)`**: Starts a check with predetermined physical actor `dice` (`Check.withDice(dice.length).withDiceValues(dice)`).
  - `@throws {RangeError}` if `dice.length < 1` or any element fails `isDieValue`.
- **`withDiceValues(dice)`**: Returns a **new** frozen `Check` with `dice` validated (`dice.length === this.diceCount`) and frozen as the actor's predetermined dice.
  - `@throws {RangeError}` if `dice.length !== this.diceCount` or any element fails `isDieValue`.
- **`withModifier(label, value)`**: Returns a **new** frozen `Check` with `{ label, value }` appended to actor modifiers.
- **`withModifiers(modifiers)`**: Returns a **new** frozen `Check` with `modifiers` cloned, frozen, and appended in order.
- **`withTiesMode(tiesMode)`**: Returns a **new** frozen `Check` with `tiesMode` set to `'fail'` or `'twist'`.
- **`against(opposition)`**: Binds `opposition` and returns a **new** frozen `ReadyCheck` carrying over `diceCount`, `modifiers`, `tiesMode`, and `diceValues`.

#### `ReadyCheck`

```ts
export class ReadyCheck {
  constructor(
    diceCount: number,
    opposition: CheckOpposition,
    modifiers: readonly CheckModifier[],
    tiesMode?: TiesMode,
    diceValues?: readonly DieValue[],
  );

  withDiceValues(dice: readonly DieValue[]): ReadyCheck;
  withModifier(label: string, value: number): ReadyCheck;
  withModifiers(modifiers: readonly CheckModifier[]): ReadyCheck;
  withTiesMode(tiesMode: TiesMode): ReadyCheck;
  resolve(diceRoller: DiceRoller): CheckResult;
}
```

Immutable, frozen check bound to a `CheckOpposition` (typically produced via `Check.withDice(n).against(opposition)` or `Check.fromDice(dice).against(opposition)`).

- **`constructor(diceCount, opposition, modifiers, tiesMode?, diceValues?)`**: Clones and deep-freezes `modifiers` and freezes the instance (`Object.freeze(this)`).
- **`withDiceValues(dice)`**: Returns a **new** frozen `ReadyCheck` with `dice` validated (`dice.length === this.diceCount`) and frozen as the actor's predetermined dice.
  - `@throws {RangeError}` if `dice.length !== this.diceCount` or any element fails `isDieValue`.
- **`withModifier(label, value)`**: Returns a **new** frozen `ReadyCheck` with `{ label, value }` appended to actor modifiers.
- **`withModifiers(modifiers)`**: Returns a **new** frozen `ReadyCheck` with `modifiers` cloned, frozen, and appended in order.
- **`withTiesMode(tiesMode)`**: Returns a **new** frozen `ReadyCheck` with `tiesMode` set to `'fail'` or `'twist'`.
- **`resolve(diceRoller)`**: Executes the check in strict two-step order:
  1. Resolves actor dice **first**: `new RolledPool(this.diceValues ?? diceRoller.roll(this.diceCount).dice, this.modifiers)`.
  2. Resolves opposition **second**: `this.opposition.resolve(diceRoller)`.
  3. Returns `new CheckResult(actor, opposition, this.tiesMode)`.
  - `@throws {RangeError}` from `diceRoller.roll(...)` if `ReadyCheck` was constructed directly with an invalid `diceCount` (`< 1` or non-integer) or dynamic `tier`.
  - `@throws {Error}` if `diceRoller` runs out of queued dice (e.g., `StubDiceRoller` exhausted).

#### `CheckResult`

```ts
export class CheckResult {
  readonly actor: RolledPool;
  readonly opposition: OppositionResult;
  readonly tiesMode: TiesMode;

  constructor(
    actor: RolledPool,
    opposition: OppositionResult,
    tiesMode?: TiesMode,
  );

  get margin(): number;
  get outcome(): CheckOutcome;
}
```

- **`constructor(actor, opposition, tiesMode = 'fail')`**: Stores `actor`, `opposition`, and `tiesMode` (defaulting `tiesMode` to `'fail'` when omitted or `undefined`).
- **`get margin(): number`**: Computed `this.actor.finalTotal - this.opposition.total`.
- **`get outcome(): CheckOutcome`**: Computed dynamically from `this.margin` and `this.tiesMode`:
  - `'success'` if `this.margin > 0`.
  - `'tie'` if `this.margin === 0 && this.tiesMode === 'twist'`.
  - `'failure'` otherwise (`this.margin < 0`, or `this.margin === 0 && this.tiesMode === 'fail'`).
