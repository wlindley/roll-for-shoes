# Module 1: Dice (`src/dice`)

Foundational six-sided dice (`d6`) primitives, immutable roll results, unbiased cryptographic random rolling, and deterministic FIFO test stubbing for **Roll for Shoes** (see [Architecture](../../docs/architecture.md), [Module Interfaces](../../docs/interfaces.md), [Boundary Test Cases](../../docs/test-cases.md), and [Game Rules](../../reference/rules.md)).

---

## 1. What It Is

`src/dice` is the **zero-dependency leaf** at the bottom of the application's strict one-way module Directed Acyclic Graph (DAG):

- **Zero Upward or Sibling Dependencies**: `src/dice` imports **nothing** from `src/*` and has zero UI or framework dependencies. Higher-level modules—[Checks (`src/checks`)](../checks/README.md), [Character (`src/character`)](../character/README.md), [Campaign (`src/campaign`)](../campaign/README.md), and [Browser UI (`src/ui`)](../ui/README.md)—consume `src/dice` exclusively through its public barrel entrypoint ([`./index.ts`](./index.ts)).
- **Narrow `DiceRoller` Interface (ISP & DIP)**: Exposes a single method—`roll(count: number): DiceRoll`—keeping the abstraction minimal (call `roll(1)` for a single die). Domain builders and helpers (`Check`, `RolledOpposition`, `DifficultyOpposition`, `Character`, `Status.roll`) accept a `DiceRoller` rather than coupling to concrete RNG APIs.
- **Immutable `DiceRoll` with Computed `total` Getter (DRY)**: `DiceRoll` defensively shallow-copies and freezes its `dice` array (`Object.freeze([...dice])`) on construction and computes `get total()` dynamically on access (`reduce`), ensuring rolled faces and their sum can never drift out of sync.
- **Unbiased Cryptographic `RandomDiceRoller`**: Production `DiceRoller` wired at application startup ([`../main.tsx`](../main.tsx)). Fills byte buffers via an injectable `RandomBytesSource` (defaulting to `globalThis.crypto.getRandomValues`) and applies **rejection sampling (`byte < 252`)** so every `d6` face (`1..6`) has an exact `42 / 252 = 1 / 6` probability with zero modulo bias.
- **Deterministic FIFO `StubDiceRoller` (Sole Cross-Module Test Double)**: Queues predetermined `DieValue` results, validates every face at construction and `enqueue(...)`, and consumes dice in strict First-In, First-Out (FIFO) order. Under the workspace testing rules ([`../../AGENTS.md`](../../AGENTS.md)), `StubDiceRoller` (alongside `RandomDiceRoller`'s optional `RandomBytesSource` inside [`./random-dice-roller.test.ts`](./random-dice-roller.test.ts)) is the **only** stub or fake permitted across the entire codebase; all higher-level module tests run real production implementations driven by `StubDiceRoller`.
- **Shared Validation Helpers (`assertPositiveInt`, `validateDiceValues`)**: Centralizes positive-integer pool size checks and `DieValue` array length/face validation + freezing across `src/dice`, `src/checks`, `src/character`, and `src/campaign`.

### Internal File Layout

| File | Responsibility |
| :--- | :--- |
| [`./index.ts`](./index.ts) | Public module barrel re-exporting all public types, functions, interfaces, and classes. |
| [`./types.ts`](./types.ts) | `DieValue` union (`1..6`), `isDieValue` type guard, `assertPositiveInt`, `validateDiceValues`, and `DiceRoller` interface. |
| [`./dice-roll.ts`](./dice-roll.ts) | Immutable `DiceRoll` value class (`readonly dice` + computed `get total()`). |
| [`./random-dice-roller.ts`](./random-dice-roller.ts) | `RandomBytesSource` callback type and unbiased cryptographic `RandomDiceRoller`. |
| [`./stub-dice-roller.ts`](./stub-dice-roller.ts) | Deterministic FIFO `StubDiceRoller` with upfront validation and non-destructive error handling. |
| [`./dice-roll.test.ts`](./dice-roll.test.ts) | Focused Vitest boundary tests for `isDieValue`, `assertPositiveInt`, `validateDiceValues`, `DiceRoll`, and `StubDiceRoller`. |
| [`./random-dice-roller.test.ts`](./random-dice-roller.test.ts) | Focused Vitest boundary tests for `RandomDiceRoller` and `RandomBytesSource` rejection sampling. |

---

## 2. How to Use It

All consumers outside `src/dice/` import exclusively from the module barrel (`../dice`):

### Rolling Dice in Production with `RandomDiceRoller`

Use `roll(1)` to roll a single six-sided die (e.g., `Do Anything 1`) and `roll(n)` to roll multi-die skill, opposition, or status pools:

```ts
import { RandomDiceRoller, type DiceRoller } from '../dice';

const diceRoller: DiceRoller = new RandomDiceRoller();

// Roll a single d6 (e.g., Level 1 "Do Anything")
const single = diceRoller.roll(1);
console.log(single.dice);  // e.g. [4] (frozen readonly DieValue[])
console.log(single.total); // e.g. 4

// Roll a 3d6 skill pool
const pool = diceRoller.roll(3);
console.log(pool.dice);    // e.g. [6, 2, 5]
console.log(pool.total);   // e.g. 13
```

### Writing Deterministic Tests with `StubDiceRoller`

Seed `StubDiceRoller` with an initial `DieValue[]` sequence (or append fluently via `.enqueue(...)`) and assert exact consumption via `.remaining`. Higher-level modules always roll the **actor's pool first** and **opposition second**, making multi-roll sequences completely predictable:

```ts
import { StubDiceRoller } from '../dice';

// Queue 3 dice: [6, 6] for a 2d6 actor roll, followed by [3] for a 1d6 opposition roll
const roller = new StubDiceRoller([6, 6, 3]);
console.log(roller.remaining); // 3

const actorRoll = roller.roll(2);
console.log(actorRoll.dice);   // [6, 6]
console.log(actorRoll.total);  // 12
console.log(roller.remaining); // 1

const oppositionRoll = roller.roll(1);
console.log(oppositionRoll.dice);  // [3]
console.log(oppositionRoll.total); // 3
console.log(roller.remaining);     // 0

// Fluently enqueue additional dice for subsequent rolls in the same test
roller.enqueue(4, 5).enqueue(2);
console.log(roller.remaining); // 3
```

### Testing `RandomDiceRoller` Deterministically via `RandomBytesSource`

Inside `random-dice-roller.test.ts`, pass a custom `RandomBytesSource` to verify byte-to-face mapping (`((byte % 6) + 1)`) and rejection sampling of bytes `>= 252` without relying on nondeterministic OS entropy:

```ts
import { RandomDiceRoller, type RandomBytesSource } from '../dice';

// 255 and 252 are >= 252 (discarded and re-sampled);
// 0 -> (0 % 6) + 1 = 1, 5 -> (5 % 6) + 1 = 6, 251 -> (251 % 6) + 1 = 6
const stream = [255, 252, 0, 5, 251];
let cursor = 0;

const byteSource: RandomBytesSource = (buffer) => {
  for (let i = 0; i < buffer.length; i += 1) {
    buffer[i] = stream[cursor] ?? 255;
    cursor += 1;
  }
};

const roller = new RandomDiceRoller(byteSource);
const result = roller.roll(3);

console.log(result.dice);  // [1, 6, 6]
console.log(result.total); // 13
```

### Validating External Values with `isDieValue` and Constructing `DiceRoll` Directly

Use `isDieValue` when validating untrusted inputs (such as deserialized JSON payloads in `src/character` or `src/campaign`), and construct `DiceRoll` directly when wrapping verified `DieValue` sequences:

```ts
import { DiceRoll, isDieValue, type DieValue } from '../dice';

function parseSavedDice(raw: readonly unknown[]): DiceRoll {
  const validated: DieValue[] = [];
  for (const item of raw) {
    if (!isDieValue(item)) {
      throw new RangeError(`Expected integer d6 face 1..6, received ${String(item)}`);
    }
    validated.push(item);
  }
  return new DiceRoll(validated);
}

const source: DieValue[] = [2, 6, 4];
const roll = new DiceRoll(source);

// Mutating the caller's array does NOT affect `roll.dice`
source.push(6);
console.log(roll.dice);  // [2, 6, 4] (Object.isFrozen(roll.dice) === true)
console.log(roll.total); // 12
```

---

## 3. Public Interface Reference

Every symbol exported by [`src/dice/index.ts`](./index.ts):

```ts
export { assertPositiveInt, type DiceRoller, type DieValue, isDieValue, validateDiceValues } from './types';
export { DiceRoll } from './dice-roll';
export { StubDiceRoller } from './stub-dice-roller';
export { RandomDiceRoller, type RandomBytesSource } from './random-dice-roller';
```

---

### `DieValue`, `isDieValue`, `assertPositiveInt` & `validateDiceValues`

```ts
export type DieValue = 1 | 2 | 3 | 4 | 5 | 6;

export function isDieValue(value: unknown): value is DieValue;
export function assertPositiveInt(value: number, label: string): void;
export function validateDiceValues(dice: readonly DieValue[], expectedCount: number): readonly DieValue[];
```

- **`DieValue`**: Literal union type representing all valid face values of a standard six-sided die (`d6`).
- **`isDieValue(value)`**: Runtime type guard returning `true` iff `typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 6` (never throws).
- **`assertPositiveInt(value, label)`**: Throws `RangeError` (`"${label} must be a positive integer, received ${value}"`) if `!Number.isInteger(value) || value < 1`.
- **`validateDiceValues(dice, expectedCount)`**: Validates `dice.length === expectedCount` and `dice.every(isDieValue)` (throwing `RangeError` on mismatch or invalid face) and returns a defensively copied, frozen `readonly DieValue[]`.

---

### `DiceRoller`

```ts
export interface DiceRoller {
  roll(count: number): DiceRoll;
}
```

Single-method abstraction over six-sided dice generation, implemented by [`RandomDiceRoller`](#randomdiceroller) and [`StubDiceRoller`](#stubdiceroller).

#### Methods

- **`roll(count: number): DiceRoll`**
  - Rolls `count` six-sided dice (`d6`) and returns an immutable [`DiceRoll`](#diceroll) containing `count` elements in exact roll order (pass `1` to roll a single die).
  - **`@throws {RangeError}`**: If `!Number.isInteger(count) || count < 1` (rejecting `0`, negative numbers, non-integers such as `1.5`, `NaN`, and `±Infinity`).

---

### `DiceRoll`

```ts
export class DiceRoll {
  readonly dice: readonly DieValue[];

  constructor(dice: readonly DieValue[]);

  get total(): number;
}
```

Immutable value object representing the outcome of rolling a pool of six-sided dice.

#### Constructor

- **`new DiceRoll(dice: readonly DieValue[])`**
  - Defensively shallow-copies and freezes the input sequence via `Object.freeze([...dice])`. Subsequent mutations to the caller's input array do not affect `this.dice`, and runtime attempts to mutate `this.dice` in strict mode throw `TypeError`.

#### Properties & Computed Getters

- **`readonly dice: readonly DieValue[]`** — Frozen array of `d6` face values in exact roll order.
- **`get total(): number`** *(computed getter)* — Arithmetic sum of `this.dice` (`this.dice.reduce((sum, die) => sum + die, 0)`), returning `0` when `this.dice` is empty. Computed dynamically on every access rather than stored as a separate field.

---

### `RandomBytesSource`

```ts
export type RandomBytesSource = (buffer: Uint8Array) => void;
```

Callback signature used by [`RandomDiceRoller`](#randomdiceroller) to populate a `Uint8Array` in place with random bytes (`0..255`). Matches the in-place buffer semantics of `globalThis.crypto.getRandomValues(buffer)`.

---

### `RandomDiceRoller`

```ts
export class RandomDiceRoller implements DiceRoller {
  constructor(randomBytes?: RandomBytesSource);

  roll(count: number): DiceRoll;
}
```

Production [`DiceRoller`](#diceroller) backed by cryptographic randomness and unbiased rejection sampling.

#### Constructor

- **`new RandomDiceRoller(randomBytes?: RandomBytesSource)`**
  - `randomBytes` *(optional)*: Custom byte filler function. Defaults to `(buffer) => { globalThis.crypto.getRandomValues(buffer); }`.

#### Methods

- **`roll(count: number): DiceRoll`**
  - Validates `count` **before** requesting any random bytes.
  - Loops until `dice.length === count`:
    1. Allocates `new Uint8Array(count - dice.length)` and passes it to `randomBytes(buffer)`.
    2. For each `byte` in `buffer`:
       - **Unbiased `< 252` rejection sampling**: `252` is the largest multiple of `6` less than or equal to `256` (`42 * 6 = 252`). Bytes `0..251` (`byte < 252`) map uniformly to `((byte % 6) + 1) as DieValue`, giving every face `1..6` exactly `42` byte values.
       - Bytes `252..255` (`byte >= 252`) are discarded to prevent modulo bias, and the loop requests another `Uint8Array(count - dice.length)` for any remaining dice.
  - Returns `new DiceRoll(dice)`.
  - **`@throws {RangeError}`**: `Dice roll count must be a positive integer, received ${count}` if `!Number.isInteger(count) || count < 1` (without invoking `randomBytes`).

---

### `StubDiceRoller`

```ts
export class StubDiceRoller implements DiceRoller {
  constructor(initialValues?: readonly DieValue[]);

  enqueue(...values: DieValue[]): this;

  get remaining(): number;

  roll(count: number): DiceRoll;
}
```

Deterministic FIFO queue implementation of [`DiceRoller`](#diceroller) used across unit and module-boundary tests (`src/dice`, `src/checks`, `src/character`, `src/campaign`).

#### Constructor

- **`new StubDiceRoller(initialValues: readonly DieValue[] = [])`**
  - Copies `initialValues` into an internal private queue via `this.enqueue(...initialValues)` so later mutations to the caller's `initialValues` array do not affect queued rolls.
  - **`@throws {RangeError}`**: `Invalid die value: ${String(value)}` if any element in `initialValues` fails [`isDieValue`](#isdievalue).

#### Properties & Computed Getters

- **`get remaining(): number`** *(computed getter)* — Returns the current number of unconsumed `DieValue` entries left in the internal FIFO queue (`this.queue.length`).

#### Methods

- **`enqueue(...values: DieValue[]): this`**
  - Validates **all** `values` upfront using [`isDieValue`](#isdievalue) before mutating the queue, appends them to the tail of the FIFO queue in argument order, and returns `this` for fluent chaining.
  - **`@throws {RangeError}`**: `Invalid die value: ${String(value)}` if any argument fails `isDieValue`. Validation is atomic: if any value in `values` is invalid, no values from that `enqueue(...)` call are added to the queue.
- **`roll(count: number): DiceRoll`**
  - Validates `count`, verifies sufficient queued dice remain, removes the first `count` values from the head of the FIFO queue (`splice(0, count)`), and returns `new DiceRoll(...)`.
  - **`@throws {RangeError}`**: `Dice roll count must be a positive integer, received ${count}` if `!Number.isInteger(count) || count < 1`. No queued dice are consumed when thrown.
  - **`@throws {Error}`**: `StubDiceRoller exhausted: requested ${count} dice, but only ${this.remaining} remaining` (matching `/exhausted/i`) if `this.remaining < count`. No queued dice are consumed when thrown (`this.remaining` stays unchanged).
