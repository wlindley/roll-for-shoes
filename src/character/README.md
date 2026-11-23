# Module 3: Character (`src/character`)

Immutable domain model for **Roll for Shoes** characters—managing skills, XP, check resolution, post-roll skill advancement, persistent statuses, configurable skill-slot triangles, portraits, and versioned JSON serialization.

---

## 1. What It Is

[`src/character`](./index.ts) implements the character layer of the domain model ([`docs/architecture.md`](../../docs/architecture.md), [`docs/interfaces.md`](../../docs/interfaces.md)) on top of the stateless dice and check engines:

- **Purpose**:
  - **Immutable `Character` entity** ([`character.ts`](./character.ts)) and [`CharacterBuilder`](./character.ts) with deep-frozen arrays/records (`skills`, `statuses`, `purchasedSlots`) where every state transition returns a distinct `Character` instance (`next !== prev`).
  - **Skills & Statuses** ([`skill.ts`](./skill.ts), [`status.ts`](./status.ts)): validated [`Skill`](./skill.ts) hierarchy (`parentSkillId` lineage) and persistent positive/negative [`Status`](./status.ts) modifiers created explicitly (`Status.create`) or rolled with `d6` pools (`Status.roll`).
  - **Fluent Check & Advancement Builders** ([`builders.ts`](./builders.ts)): [`CharacterCheckBuilder`](./builders.ts) (supporting environmental `CheckOpposition`, character-vs-character opposed rolls, and optional predetermined physical `diceValues` for actor and/or defender) and [`CharacterAdvancementBuilder`](./builders.ts) (claiming new skills via natural all-`6`s, XP dice upgrades, same-level replacement, or simultaneous slot purchases).
  - **Skill Slot Caps & Purchasing** ([`skill-slots.ts`](./skill-slots.ts)): [`SkillSlotConfig`](./skill-slots.ts) and [`SkillSlotSummary`](./skill-slots.ts) enforcing optional per-level skill caps (such as the `4 / 3 / 2` skill triangle) and `2 * level` XP slot unlocks.
  - **Portraits & Versioned Serialization** ([`character.ts`](./character.ts), [`serialize.ts`](./serialize.ts)): optional trimmed non-blank `portrait` strings (data URLs or image URLs) and deterministic `schemaVersion: 1` JSON round-tripping without storing derived getters.

- **Strict One-Way DAG Position**:
  - Imports **only** from [`../dice`](../dice/index.ts) and [`../checks`](../checks/index.ts).
  - Consumed downstream by [`../campaign`](../campaign/index.ts) and [`../ui`](../ui/App.tsx). Never imports from `../campaign`, `../ui`, or `react`.
  - Verified end-to-end by boundary tests in [`character.test.ts`](./character.test.ts) using real `../checks` classes and [`StubDiceRoller`](../dice/index.ts) (`docs/test-cases.md`: [`CHR-BASIC-*`, `CHR-TIE-*`, `CHR-STS-*`, `CHR-START-*`, `CHR-SLOT-*`, `CHR-PORTRAIT-*`, `CHR-MAN-*`](../../docs/test-cases.md)).

- **Key Game & Domain Rules Enforced** ([`reference/rules.md`](../../reference/rules.md)):
  - **Automatic `Do Anything 1`**: Every character created via `Character.create` or `Character.builder` starts at `0` XP with `Do Anything` (`DEFAULT_STARTING_SKILL_NAME`) at level `1`. Skill names are unique per character (case-insensitively, trimmed), and `Do Anything` can never be replaced.
  - **XP Awards (`+1 XP` on `'failure'`, `0 XP` on `'success'` or `'twist'` `'tie'`)**: A character earns `+1 XP` if and only if their check outcome is `'failure'`. Under the Basic Rules (`tiesMode: 'fail'`), equal totals (`margin === 0`) count as `'failure'` for the actor (`+1 XP` to actor, `0 XP` to defender). Under the Advanced Ties rule (`tiesMode: 'twist'`), equal totals yield `'tie'` and award **`0 XP`** to all participants. In opposed character-vs-character checks, actor dice always roll **first** and defender dice **second**; when the actor succeeds, the defender fails and earns `+1 XP`.
  - **`pendingAdvancement` Eligibility & Lifecycle**: After applying any earned XP (`nextXp = xp + xpEarned`), `pendingAdvancement` is attached to the returned `Character` **if and only if** `nextXp >= xpCostToAdvance` (which is always true for natural all-`6`s where `xpCostToAdvance === 0`, and true on a failed `1d6` check that just awarded its `1st` XP). Resolving another check replaces any prior unclaimed `pendingAdvancement` (clearing it to `null` if the new roll is ineligible). Calling `advance(...).claim()` spends the upgrade XP and clears `pendingAdvancement`; calling `dismissAdvancement()` clears it without altering XP or skills; unrelated updates (`addSkill`, `addStatus`, `removeStatus`, `withPortrait`) preserve it.
  - **Raw-Dice-Only Advancement Costs**: `PendingAdvancement.xpCostToAdvance` equals the count of rolled dice in `rawDice` not equal to `6` (`1 XP` per non-`6` die regardless of face value). Statuses and ad-hoc check modifiers affect `finalTotal` and `outcome`, **never** `rawDice` or `xpCostToAdvance`—so a penalty can cause a natural-`6` roll to fail, granting **both** `+1 XP` and a `0 XP` advancement opportunity while the narrative `CheckResult` stands as rolled.
  - **`SkillSlotConfig` Triangle Caps & `allowSlotPurchase` (`2 * level` XP)**: Level `1` slots are always unrestricted (`null`). `SkillSlotConfig.triangle()` configures base limits `{ 2: 4, 3: 3, 4: 2 }`. When `allowSlotPurchase` is `false` (default), slot purchases are rejected, any `purchasedSlots` on the character are ignored (`effectivePurchasedSlots === 0`), and `defaultSlotsAboveMax` defaults to `1` so levels `5+` remain reachable; full levels require `.replacingSkill(...)` (same level, never `Do Anything`). When `allowSlotPurchase` is `true`, `defaultSlotsAboveMax` defaults to `0`, and characters may spend `2 * level` XP (`level >= 2`) via `character.purchaseSkillSlot(level, config)` or simultaneously during advancement via `.purchasingSlot()`.

---

## 2. How to Use It

### Creating Characters (`Character.create` & `Character.builder`)

New characters always initialize with `xp: 0`, `[Do Anything 1]`, empty `statuses`, empty `purchasedSlots`, and `pendingAdvancement: null` (persisted characters with accumulated XP are restored via `Character.deserialize`):

```ts
import { Character, DEFAULT_STARTING_SKILL_NAME } from '../character';

// Quick factory with optional custom ID and portrait
const bob = Character.create('Bob', {
  id: 'char-bob',
  portrait: 'https://example.com/avatars/bob.webp',
});
// bob.xp === 0
// bob.skills[0].name === DEFAULT_STARTING_SKILL_NAME ('Do Anything'), level === 1

// Fluent builder with scenario starting skills and data-URL portrait
const ada = Character.builder('Ada')
  .withId('char-ada')
  .withPortrait('data:image/webp;base64,UklGR...')
  .withStartingSkill('Hacking', 2)
  .withStartingSkill('Parkour', 3)
  .build();
// ada.xp === 0
// ada.skills.map((s) => `${s.name} ${s.level}`) -> ['Do Anything 1', 'Hacking 2', 'Parkour 3']
```

### Making Checks & Opposed Character-vs-Character Checks

```ts
import { RandomDiceRoller, StubDiceRoller } from '../dice';
import { DifficultyOpposition, DifficultyTier } from '../checks';
import { Character, Status } from '../character';

const roller = new RandomDiceRoller();
const alice = Character.create('Alice').addStatus(Status.create('Clean Shoe', 2));
const guard = Character.create('Guard')
  .addSkill('Block', 2)
  .addStatus(Status.create('Shield', 1));

// 1. Check against environmental opposition (StaticOpposition, RolledOpposition, DifficultyOpposition)
const vault = alice
  .makeCheck('Do Anything')
  .withAction('Vault the stone wall')
  .withStatus('Clean Shoe')      // +2 from attached status (looked up by ID or case-insensitive name)
  .withModifier('Tailwind', 1)   // +1 ad-hoc modifier
  .withTiesMode('twist')         // equal totals yield 'tie' (0 XP) instead of 'failure'
  .against(new DifficultyOpposition(DifficultyTier.Moderate, 'static'))
  .roll(roller);

// `alice` is unchanged; `vault.character` holds updated XP and pendingAdvancement:
// vault.xpEarned       -> 1 on 'failure', 0 on 'success' or 'tie'
// vault.canAdvance     -> vault.character.pendingAdvancement !== null

// 2. Opposed character-vs-character check (actor rolls first, defender rolls second)
const fixedRoller = new StubDiceRoller([4, 2, 3]); // Alice: [4], Guard: [2, 3]
const duel = alice
  .makeCheck('Do Anything')
  .withAction('Slip past the gate')
  .againstCharacter(guard, 'Block', (def) =>
    def.withStatus('Shield').withModifier('High Ground', 1),
  )
  .roll(fixedRoller);

// Alice finalTotal: 4 vs. Guard total: (2 + 3) + 1 + 1 = 7 -> outcome === 'failure'
// duel.actorXpEarned === 1, duel.actor.xp === 1, duel.actor.pendingAdvancement !== null
// duel.defenderXpEarned === 0, duel.defender.xp === 0

// 3. Predetermined / physical dice on actor, defender, or both (skips diceRoller for supplied sides)
const tabletopDuel = alice
  .makeCheck('Do Anything')
  .withDiceValues([6])
  .againstCharacter(guard, 'Block', (def) => def.withDiceValues([5, 4]))
  .roll(new StubDiceRoller([]));
// Alice [6] vs. Guard [5, 4] = 9 -> Alice fails (+1 XP) AND earns 0-XP natural-6 pendingAdvancement
```

### Claiming or Dismissing `pendingAdvancement`

```ts
import { StubDiceRoller } from '../dice';
import { StaticOpposition } from '../checks';
import { Character, SkillSlotConfig } from '../character';

// 1. Natural all-6s free advancement (0 XP)
const afterSix = Character.create('Bob')
  .makeCheck('Do Anything')
  .withAction('Roundhouse kick')
  .against(new StaticOpposition(3))
  .roll(new StubDiceRoller([6])).character;

const freeAdv = afterSix.advance('Kickboxing').claim();
// freeAdv.createdSkill -> Skill { name: 'Kickboxing', level: 2, parentSkillId: doAnything.id }
// freeAdv.totalXpSpent === 0, freeAdv.character.pendingAdvancement === null

// 2. Spending banked/earned XP to upgrade non-6 dice (1 XP per non-6 die)
const afterFail = Character.create('Bob')
  .makeCheck('Do Anything')
  .against(new StaticOpposition(5))
  .roll(new StubDiceRoller([2])).character; // earned +1 XP; xpCostToAdvance === 1

const paidAdv = afterFail.advance('Sneaking').claim();
// paidAdv.diceUpgradeXpSpent === 1, paidAdv.character.xp === 0

// 3. Replacing a same-level skill when a SkillSlotConfig level is full
const triangle = SkillSlotConfig.triangle(); // L2 cap = 4
// fullChar.advance('Acrobatics').withSlotConfig(triangle).replacingSkill('Old L2 Skill').claim();

// 4. Simultaneously purchasing a slot (2 * targetLevel XP) + claiming advancement
const purchasable = SkillSlotConfig.triangle({ allowSlotPurchase: true });
// richChar.advance('Mastery').withSlotConfig(purchasable).purchasingSlot().claim();

// 5. Dismissing an unclaimed advancement while keeping XP and existing skills
const dismissed = afterFail.dismissAdvancement();
// dismissed.pendingAdvancement === null, dismissed.xp === 1
```

### Managing Statuses

```ts
import { StubDiceRoller } from '../dice';
import { StaticOpposition } from '../checks';
import { Character, Status } from '../character';

const cleanShoe = Status.create('Clean Shoe', 2);
const brokenNose = Status.create('Broken Nose', -3, { note: 'Tavern brawl' });
const poisoned = Status.roll('Poisoned', 2, 'negative', new StubDiceRoller([2, 4]), {
  note: 'Venomous dart',
}); // rating === -6

let bob = Character.create('Bob').addStatus(cleanShoe).addStatus(brokenNose).addStatus(poisoned);

// Selectively include relevant statuses on a check
const check = bob
  .makeCheck('Do Anything')
  .withStatus('clean shoe') // case-insensitive name or exact status ID
  .against(new StaticOpposition(5))
  .roll(new StubDiceRoller([4]));
// check.checkResult.actor.finalTotal === 6 ('success')

// Remove statuses by case-insensitive name or exact ID once narratively resolved
bob = check.character.removeStatus('Poisoned').removeStatus(brokenNose.id);
```

### Querying & Purchasing Skill Slots

```ts
import { Character, SkillSlotConfig } from '../character';

const slots = SkillSlotConfig.triangle({ allowSlotPurchase: true });
const character = Character.builder('Ada')
  .withStartingSkill('Hacking', 2)
  .withStartingSkill('Stealth', 2)
  .build();

const summary = character.getSkillSlotSummary(2, slots);
// summary.maxSlots === 4
// summary.usedSlots === 2
// summary.availableSlots === 2
// summary.effectivePurchasedSlots === 0
// summary.nextSlotXpCost === 4 (2 * level)

// Standalone slot unlock once the character has >= 4 XP:
// const unlocked = characterWith4Xp.purchaseSkillSlot(2, slots);
// unlocked.getSkillSlotSummary(2, slots).maxSlots === 5
```

### Portraits & JSON Serialization

```ts
import { Character } from '../character';

const withPortrait = Character.create('Ada').withPortrait('  /avatars/ada.webp  ');
// withPortrait.portrait === '/avatars/ada.webp'

const clearedPortrait = withPortrait.withPortrait(null);
// clearedPortrait.portrait === undefined

// Deterministic schemaVersion: 1 JSON persistence
const serialized: string = withPortrait.serialize();
const restored: Character = Character.deserialize(serialized);
// restored !== withPortrait && restored.portrait === '/avatars/ada.webp'
```

---

## 3. Public Interface Reference

All public symbols are exported from [`src/character/index.ts`](./index.ts).

---

### `DEFAULT_STARTING_SKILL_NAME`

```ts
export const DEFAULT_STARTING_SKILL_NAME = 'Do Anything';
```

Canonical name of every character's level-`1` starting skill ([`skill.ts`](./skill.ts)).

---

### `Skill`

Immutable, frozen skill value object ([`skill.ts`](./skill.ts)).

```ts
export class Skill {
  readonly id: string;
  readonly name: string;
  readonly level: number;
  readonly parentSkillId?: string;

  constructor(props: {
    readonly id?: string;
    readonly name: string;
    readonly level: number;
    readonly parentSkillId?: string;
  });
}
```

- **Behavior**: Trims `name` and optional `id` (generating a UUID via `crypto.randomUUID()` when `id` is omitted), stores optional `parentSkillId`, and freezes the instance.
- **`@throws {RangeError}`**: If `props.level < 1` or `!Number.isInteger(props.level)`.
- **`@throws {Error}`**: If `props.id` (when provided) or `props.name` is empty/whitespace-only (`ID cannot be blank`, `Skill name cannot be blank`).

---

### `Status`

Immutable, frozen persistent modifier (`+rating` bonus or `-rating` penalty) attached to a character ([`status.ts`](./status.ts)). Uses a private constructor; instantiate via `Status.create` or `Status.roll`.

```ts
export class Status {
  readonly id: string;
  readonly name: string;
  readonly rating: number;
  readonly note?: string;

  static create(
    name: string,
    rating: number,
    options?: { readonly id?: string; readonly note?: string },
  ): Status;

  static roll(
    name: string,
    diceCount: number,
    polarity: 'positive' | 'negative',
    diceRoller: DiceRoller,
    options?: { readonly id?: string; readonly note?: string },
  ): Status;
}
```

- **`Status.create(name, rating, options?)`**:
  - Trims `name` and optional `options.id` (defaults to `crypto.randomUUID()`), stores `rating` and optional `options.note`.
  - **`@throws {RangeError}`**: If `!Number.isInteger(rating)` or `rating === 0`.
  - **`@throws {Error}`**: If `name` or `options.id` (when provided) is blank.
- **`Status.roll(name, diceCount, polarity, diceRoller, options?)`**:
  - Validates `name` before rolling, rolls `diceCount` `d6`s via `diceRoller.roll(diceCount)`, and delegates to `Status.create` with `+total` (`'positive'`) or `-total` (`'negative'`).
  - **`@throws {Error}`**: If `name` or `options.id` (when provided) is blank, or if a `StubDiceRoller` has fewer than `diceCount` queued dice.
  - **`@throws {RangeError}`**: If `diceCount < 1` or `!Number.isInteger(diceCount)`.

---

### `SkillSlotConfig`

Immutable configuration for per-level skill slot caps and XP slot purchasing ([`skill-slots.ts`](./skill-slots.ts)).

```ts
export class SkillSlotConfig {
  readonly limitsByLevel: Readonly<Record<number, number>>;
  readonly allowSlotPurchase: boolean;
  readonly defaultSlotsAboveMax: number;

  constructor(options: {
    readonly limitsByLevel: Readonly<Record<number, number>>;
    readonly allowSlotPurchase?: boolean;
    readonly defaultSlotsAboveMax?: number;
  });

  static triangle(options?: { readonly allowSlotPurchase?: boolean }): SkillSlotConfig;

  baseLimitForLevel(level: number): number | null;
}
```

- **`constructor(options)`**:
  - Copies and freezes `limitsByLevel` (`level >= 2` -> `limit >= 0`).
  - Defaults `allowSlotPurchase` to `false`.
  - Defaults `defaultSlotsAboveMax` to `0` when `allowSlotPurchase` is `true`, or `1` when `allowSlotPurchase` is `false`.
  - **`@throws {RangeError}`**: If any key in `limitsByLevel` is not an integer `>= 2`, if any limit value is not an integer `>= 0`, or if `defaultSlotsAboveMax` is not an integer `>= 0`.
- **`SkillSlotConfig.triangle(options?)`**: Factory returning the standard `4 / 3 / 2` triangle (`limitsByLevel: { 2: 4, 3: 3, 4: 2 }`).
- **`baseLimitForLevel(level)`**:
  - Returns `null` for `level === 1` (unrestricted), or `this.limitsByLevel[level] ?? this.defaultSlotsAboveMax` for `level >= 2`.
  - **`@throws {RangeError}`**: If `level < 1` or `!Number.isInteger(level)`.

---

### `SkillSlotSummary`

Immutable snapshot of a character's slot capacity and usage at a given skill level ([`skill-slots.ts`](./skill-slots.ts)).

```ts
export class SkillSlotSummary {
  readonly level: number;
  readonly maxSlots: number | null;
  readonly usedSlots: number;
  readonly effectivePurchasedSlots: number;

  constructor(
    level: number,
    maxSlots: number | null,
    usedSlots: number,
    effectivePurchasedSlots: number,
  );

  get availableSlots(): number | null;
  get nextSlotXpCost(): number;
}
```

- **`availableSlots`** *(getter)*: Returns `null` when `maxSlots === null` (unrestricted), or `Math.max(0, this.maxSlots - this.usedSlots)`.
- **`nextSlotXpCost`** *(getter)*: Returns `2 * this.level`.

---

### `Character`

Immutable root character entity ([`character.ts`](./character.ts)). Uses a private constructor; create via `Character.create`, `Character.builder`, or `Character.deserialize`.

```ts
export class Character {
  readonly id: string;
  readonly name: string;
  readonly xp: number;
  readonly skills: readonly Skill[];
  readonly pendingAdvancement: PendingAdvancement | null;
  readonly statuses: readonly Status[];
  readonly purchasedSlots: Readonly<Record<number, number>>;
  readonly portrait?: string;

  static create(
    name: string,
    options?: { readonly id?: string; readonly portrait?: string },
  ): Character;

  static builder(name: string): CharacterBuilder;
  static deserialize(serialized: string): Character;

  skill(idOrName: string): Skill;

  addSkill(
    name: string,
    level: number,
    options?: {
      readonly parentSkillId?: string;
      readonly slotConfig?: SkillSlotConfig | null;
      readonly replaceSkillIdOrName?: string;
    },
  ): Character;

  withPortrait(portrait: string | null): Character;
  addStatus(status: Status): Character;
  removeStatus(statusIdOrName: string): Character;

  getSkillSlotSummary(level: number, slotConfig?: SkillSlotConfig | null): SkillSlotSummary;
  purchaseSkillSlot(level: number, slotConfig: SkillSlotConfig): Character;

  makeCheck(skillIdOrName: string): CharacterCheckBuilder;
  advance(newSkillName: string): CharacterAdvancementBuilder;
  dismissAdvancement(): Character;

  serialize(): string;
}
```

- **Static Factories**:
  - **`Character.create(name, options?)`**: Creates a `Character` with `0` XP and `[Do Anything 1]`.
    - **`@throws {Error}`**: If `name`, `options.id`, or `options.portrait` is empty/whitespace-only.
  - **`Character.builder(name)`**: Returns a fluent [`CharacterBuilder`](#characterbuilder) for `name`.
  - **`Character.deserialize(serialized)`**: Validates a `schemaVersion: 1` JSON string ([`serialize.ts`](./serialize.ts)) and reconstructs an immutable `Character` (omitted `portrait` deserializes as `undefined`; non-blank `portrait` strings are trimmed).
    - **`@throws {Error}`**: On malformed JSON, non-object payload, `schemaVersion !== 1`, missing/non-string/blank `id` or `name`, invalid `portrait` (including `null`, non-string, or blank string), negative or non-integer `xp`, empty or malformed `skills`, case-insensitive duplicate skill names, malformed `statuses`, malformed `purchasedSlots` (keys `< 2` or counts `< 0`), or malformed `pendingAdvancement` (invalid fields, empty/non-`DieValue` `rawDice`, or unknown `checkOutcome`).
    - **`@throws {RangeError}`**: If any serialized status entry has a `0` or non-integer `rating`.
- **Skill & Status Lookup / Mutation**:
  - **`skill(idOrName)`**: Finds a skill by exact `id` or trimmed case-insensitive `name`.
    - **`@throws {Error}`**: If no matching skill exists (`Skill not found: ...`).
  - **`addSkill(name, level, options?)`**: Returns a new `Character` with the added skill (and optional `replaceSkillIdOrName` removed).
    - **`@throws {RangeError}`**: If `level < 1` or `!Number.isInteger(level)`.
    - **`@throws {Error}`**: If `name` is blank, `replaceSkillIdOrName` is not found, `replaceSkillIdOrName` targets `Do Anything`, `replaced.level !== level`, `name` duplicates any remaining skill (case-insensitively), or `options.slotConfig` has `0` available slots at `level` (without replacement).
  - **`withPortrait(portrait)`**: Returns a new `Character` with trimmed `portrait`, or `undefined` when `portrait === null`.
    - **`@throws {Error}`**: If `portrait` is an empty/whitespace-only string.
  - **`addStatus(status)`**: Returns a new `Character` with `status` appended to `statuses`.
  - **`removeStatus(statusIdOrName)`**: Removes a status matched by exact `id` or trimmed case-insensitive `name`.
    - **`@throws {Error}`**: If no matching status exists (`Status not found: ...`).
- **Skill Slots**:
  - **`getSkillSlotSummary(level, slotConfig?)`**: Returns a [`SkillSlotSummary`](#skillslotsummary) for `level` (`maxSlots: null` when `slotConfig` is omitted/`null` or `level === 1`; ignores `purchasedSlots` when `slotConfig.allowSlotPurchase` is `false`).
    - **`@throws {RangeError}`**: If `level < 1` or `!Number.isInteger(level)`.
  - **`purchaseSkillSlot(level, slotConfig)`**: Spends `2 * level` XP and increments `purchasedSlots[level]` by `1`.
    - **`@throws {RangeError}`**: If `level < 1` or `!Number.isInteger(level)`.
    - **`@throws {Error}`**: If `level === 1` (`Level 1 skill slots are unrestricted`), `!slotConfig.allowSlotPurchase` (`Skill slot purchase is disabled`), or `this.xp < 2 * level` (`Insufficient XP to purchase level ${level} slot`).
- **Checks, Advancement & Persistence**:
  - **`makeCheck(skillIdOrName)`**: Looks up `this.skill(skillIdOrName)` and starts a [`CharacterCheckBuilder`](#charactercheckbuilder).
    - **`@throws {Error}`**: If the skill is not found.
  - **`advance(newSkillName)`**: Starts a [`CharacterAdvancementBuilder`](#characteradvancementbuilder) for `this.pendingAdvancement`.
  - **`dismissAdvancement()`**: Returns a new `Character` with `pendingAdvancement: null` (leaving `xp` and `skills` intact).
  - **`serialize()`**: Returns a `schemaVersion: 1` JSON string (computed getters are never serialized).

---

### `CharacterBuilder`

Immutable fluent builder returned by `Character.builder(name)` ([`character.ts`](./character.ts)).

```ts
export class CharacterBuilder {
  constructor(
    factory: (id: string | undefined, name: string, portrait: string | undefined) => Character,
    name: string,
    id?: string,
    portrait?: string,
    startingSkills?: readonly (readonly [string, number])[],
  );

  withId(id: string): CharacterBuilder;
  withPortrait(portrait: string | null): CharacterBuilder;
  withStartingSkill(name: string, level: number): CharacterBuilder;
  build(): Character;
}
```

- **`withId(id)`**: Stages a custom character ID (validated on `build()`).
- **`withPortrait(portrait)`**: Trims and stages `portrait`, or clears it to `undefined` when `null`.
  - **`@throws {Error}`**: Immediately if `portrait` is an empty/whitespace-only string.
- **`withStartingSkill(name, level)`**: Queues an extra starting skill added alongside `Do Anything 1` on `build()`.
- **`build()`**: Constructs the `Character` and adds all queued starting skills.
  - **`@throws {Error}`**: If `name`, `id`, or any starting skill `name` is blank, or if any starting skill duplicates `Do Anything` or another starting skill (case-insensitively).
  - **`@throws {RangeError}`**: If any starting skill `level` is `< 1` or `!Number.isInteger(level)`.

---

### `CharacterCheckBuilder`

Immutable fluent builder returned by `character.makeCheck(skillIdOrName)` ([`builders.ts`](./builders.ts)).

```ts
export class CharacterCheckBuilder {
  constructor(
    character: Character,
    skillUsed: Skill,
    actionDescription?: string,
    tiesMode?: TiesMode,
    modifiers?: readonly CheckModifier[],
    diceValues?: readonly DieValue[],
  );

  withAction(description: string): CharacterCheckBuilder;
  withStatus(statusIdOrName: string): CharacterCheckBuilder;
  withModifier(label: string, value: number): CharacterCheckBuilder;
  withDiceValues(dice: readonly DieValue[]): CharacterCheckBuilder;
  withTiesMode(tiesMode: TiesMode): CharacterCheckBuilder;

  against(opposition: CheckOpposition): ReadyCharacterCheck;
  againstCharacter(
    defender: Character,
    defenderSkillIdOrName: string,
    configureDefender?: (defenderBuilder: OpposedParticipantBuilder) => OpposedParticipantBuilder,
  ): ReadyOpposedCharacterCheck;
}
```

- **`withAction(description)`**: Attaches narrative action text (copied onto `PendingAdvancement.actionDescription` if the roll qualifies).
- **`withStatus(statusIdOrName)`**: Resolves an attached `Status` on the actor by exact `id` or case-insensitive `name` and appends `{ label: status.name, value: status.rating }`.
  - **`@throws {Error}`**: If the actor does not have a matching status.
- **`withModifier(label, value)`**: Appends an ad-hoc `CheckModifier` (`{ label, value }`).
- **`withDiceValues(dice)`**: Supplies predetermined physical `d6` values for the actor's pool (validated against `skillUsed.level` and frozen).
  - **`@throws {RangeError}`**: If `dice.length !== skillUsed.level` or any element fails `isDieValue`.
- **`withTiesMode(tiesMode)`**: Sets `'fail'` (default) or `'twist'`.
- **`against(opposition)`**: Binds a `CheckOpposition` (`StaticOpposition`, `RolledOpposition`, or `DifficultyOpposition`) and returns [`ReadyCharacterCheck`](#readycharactercheck).
- **`againstCharacter(defender, defenderSkillIdOrName, configureDefender?)`**: Resolves `defender.skill(defenderSkillIdOrName)` and optional defender statuses, modifiers, and physical `diceValues` via [`OpposedParticipantBuilder`](#opposedparticipantbuilder), returning [`ReadyOpposedCharacterCheck`](#readyopposedcharactercheck).
  - **`@throws {Error}`**: If `defenderSkillIdOrName` is not found on `defender`, or if `configureDefender` references an unknown status on `defender`.
  - **`@throws {RangeError}`**: If `configureDefender` passes invalid or wrong-length `diceValues` for `defenderSkill.level`.

---

### `OpposedParticipantBuilder`

Immutable fluent builder passed to `againstCharacter`'s `configureDefender` callback ([`builders.ts`](./builders.ts)).

```ts
export class OpposedParticipantBuilder {
  constructor(
    defender: Character,
    skillLevel: number,
    modifiers?: readonly CheckModifier[],
    diceValues?: readonly DieValue[],
  );

  withStatus(statusIdOrName: string): OpposedParticipantBuilder;
  withModifier(label: string, value: number): OpposedParticipantBuilder;
  withDiceValues(dice: readonly DieValue[]): OpposedParticipantBuilder;
}
```

- **`withStatus(statusIdOrName)`**: Looks up `statusIdOrName` on `defender` (by exact `id` or case-insensitive `name`) and appends `{ label: status.name, value: status.rating }`.
  - **`@throws {Error}`**: If `defender` does not have a matching status.
- **`withModifier(label, value)`**: Appends an ad-hoc `{ label, value }` modifier to the defender's pool.
- **`withDiceValues(dice)`**: Supplies predetermined physical `d6` values for the defender's pool (validated against `skillLevel` and frozen).
  - **`@throws {RangeError}`**: If `dice.length !== skillLevel` or any element fails `isDieValue`.

---

### `ReadyCharacterCheck`

Executable single-character check against a `CheckOpposition` ([`builders.ts`](./builders.ts)).

```ts
export class ReadyCharacterCheck {
  constructor(
    character: Character,
    skillUsed: Skill,
    opposition: CheckOpposition,
    actionDescription: string | undefined,
    tiesMode: TiesMode,
    modifiers: readonly CheckModifier[],
    diceValues?: readonly DieValue[],
  );

  withTiesMode(tiesMode: TiesMode): ReadyCharacterCheck;
  roll(diceRoller: DiceRoller): CharacterCheckOutcome;
}
```

- **`withTiesMode(tiesMode)`**: Returns a new `ReadyCharacterCheck` with `tiesMode` overridden.
- **`roll(diceRoller)`**: Resolves the actor's `skillUsed.level` `d6`s **first** (using `diceValues` if provided, otherwise rolling `diceRoller`) and `opposition.resolve(diceRoller)` **second**, updates `xp` (`+1` on `'failure'`, `0` otherwise) and `pendingAdvancement`, and returns [`CharacterCheckOutcome`](#charactercheckoutcome).
  - **`@throws {Error}`**: If `diceRoller` (such as `StubDiceRoller`) is exhausted during any non-predetermined actor or opposition roll.

---

### `ReadyOpposedCharacterCheck`

Executable opposed check between two `Character`s ([`builders.ts`](./builders.ts)).

```ts
export class ReadyOpposedCharacterCheck {
  constructor(
    actor: Character,
    actorSkill: Skill,
    defender: Character,
    defenderSkill: Skill,
    defenderOpposition: RolledOpposition,
    actionDescription: string | undefined,
    tiesMode: TiesMode,
    actorModifiers: readonly CheckModifier[],
    actorDiceValues?: readonly DieValue[],
  );

  withTiesMode(tiesMode: TiesMode): ReadyOpposedCharacterCheck;
  roll(diceRoller: DiceRoller): OpposedCharacterCheckOutcome;
}
```

- **`withTiesMode(tiesMode)`**: Returns a new `ReadyOpposedCharacterCheck` with `tiesMode` overridden.
- **`roll(diceRoller)`**: Resolves `actorSkill.level` `d6`s **first** (using `actorDiceValues` if provided, otherwise rolling `diceRoller`) and `defenderOpposition.resolve(diceRoller)` **second** (using defender `diceValues` if provided, otherwise rolling `defenderSkill.level` `d6`s), independently updates both characters' `xp` and `pendingAdvancement` (`'tie'` -> `0 XP` each; actor `'success'` -> `+1 XP` to defender; actor `'failure'` -> `+1 XP` to actor), and returns [`OpposedCharacterCheckOutcome`](#opposedcharactercheckoutcome).
  - **`@throws {Error}`**: If `diceRoller` (such as `StubDiceRoller`) has insufficient queued dice for any non-predetermined roll.

---

### `CharacterCheckOutcome`

Immutable result returned by `ReadyCharacterCheck.roll(diceRoller)` ([`builders.ts`](./builders.ts)).

```ts
export class CharacterCheckOutcome {
  readonly character: Character;
  readonly skillUsed: Skill;
  readonly checkResult: CheckResult;

  constructor(character: Character, skillUsed: Skill, checkResult: CheckResult);

  get xpEarned(): number;
  get canAdvanceNaturally(): boolean;
  get canAdvance(): boolean;
}
```

- **`xpEarned`** *(getter)*: `this.checkResult.outcome === 'failure' ? 1 : 0`.
- **`canAdvanceNaturally`** *(getter)*: `this.checkResult.actor.naturalAllSixes`.
- **`canAdvance`** *(getter)*: `this.character.pendingAdvancement !== null`.

---

### `OpposedCharacterCheckOutcome`

Immutable result returned by `ReadyOpposedCharacterCheck.roll(diceRoller)` ([`builders.ts`](./builders.ts)).

```ts
export class OpposedCharacterCheckOutcome {
  readonly actor: Character;
  readonly defender: Character;
  readonly actorSkill: Skill;
  readonly defenderSkill: Skill;
  readonly checkResult: CheckResult;

  constructor(
    actor: Character,
    defender: Character,
    actorSkill: Skill,
    defenderSkill: Skill,
    checkResult: CheckResult,
  );

  get actorXpEarned(): number;
  get defenderXpEarned(): number;
}
```

- **`actorXpEarned`** *(getter)*: `this.checkResult.outcome === 'failure' ? 1 : 0`.
- **`defenderXpEarned`** *(getter)*: `this.checkResult.outcome === 'success' ? 1 : 0` (`0` on `'tie'` or actor `'failure'`).

---

### `PendingAdvancement`

Immutable record of an eligible advancement opportunity stored on `Character.pendingAdvancement` ([`builders.ts`](./builders.ts)).

```ts
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
  });

  get targetLevel(): number;
  get xpCostToAdvance(): number;
  get naturalAllSixes(): boolean;
}
```

- **Behavior**: Resolves `rollId` (trimmed non-blank or `crypto.randomUUID()`), defensively copies and freezes `rawDice`, and freezes the instance.
- **Computed Getters**:
  - **`targetLevel`**: `this.usedSkillLevel + 1`.
  - **`xpCostToAdvance`**: Count of dice in `this.rawDice` where `die !== 6` (`0` when all rolled dice are `6`).
  - **`naturalAllSixes`**: `this.xpCostToAdvance === 0`.
- **`@throws {Error}`**: If `props.rollId` is provided and blank (`ID cannot be blank`).

---

### `CharacterAdvancementBuilder`

Immutable fluent builder returned by `character.advance(newSkillName)` ([`builders.ts`](./builders.ts)).

```ts
export class CharacterAdvancementBuilder {
  constructor(
    character: Character,
    newSkillName: string,
    slotConfig?: SkillSlotConfig | null,
    replaceSkillIdOrName?: string,
    purchaseSlot?: boolean,
  );

  withSlotConfig(slotConfig: SkillSlotConfig | null): CharacterAdvancementBuilder;
  replacingSkill(skillIdOrName: string): CharacterAdvancementBuilder;
  purchasingSlot(): CharacterAdvancementBuilder;
  claim(): AdvancementOutcome;
}
```

- **`withSlotConfig(slotConfig)`**: Applies `slotConfig` slot-cap rules (or `null` for unrestricted slots) when claiming.
- **`replacingSkill(skillIdOrName)`**: Replaces an existing skill at `pendingAdvancement.targetLevel` (matched by exact `id` or case-insensitive `name`).
- **`purchasingSlot()`**: Simultaneously purchases `+1` slot at `pendingAdvancement.targetLevel` (`2 * targetLevel` XP) prior to spending `xpCostToAdvance` and inserting the skill.
- **`claim()`**: Validates rules, deducts total XP, inserts the new skill (`parentSkillId: pendingAdvancement.usedSkillId`), clears `pendingAdvancement` to `null`, and returns [`AdvancementOutcome`](#advancementoutcome). Because `Character` is immutable, any thrown error leaves the original character and its `pendingAdvancement` intact.
  - **`@throws {Error}`**:
    - `'No pending advancement to claim'` if `character.pendingAdvancement === null`.
    - `'SkillSlotConfig is required to purchase a slot'` if `purchasingSlot()` was called while `slotConfig` is `null`.
    - `'Skill slot purchase is disabled'` or `'Insufficient XP to purchase level ... slot'` if `purchasingSlot()` fails slot-purchase validation.
    - `'Insufficient XP to claim advancement'` if remaining XP after any slot purchase is `< pendingAdvancement.xpCostToAdvance`.
    - If `newSkillName` is blank, duplicates an existing skill name (case-insensitively), `replacingSkill` targets `Do Anything` / a missing skill / a different-level skill, or no slots are available at `targetLevel`.

---

### `AdvancementOutcome`

Immutable result returned by `CharacterAdvancementBuilder.claim()` ([`builders.ts`](./builders.ts)).

```ts
export class AdvancementOutcome {
  readonly character: Character;
  readonly createdSkill: Skill;
  readonly diceUpgradeXpSpent: number;
  readonly slotPurchaseXpSpent: number;
  readonly replacedSkill?: Skill;

  constructor(
    character: Character,
    createdSkill: Skill,
    diceUpgradeXpSpent: number,
    slotPurchaseXpSpent: number,
    replacedSkill?: Skill,
  );

  get totalXpSpent(): number;
}
```

- **`totalXpSpent`** *(getter)*: Computed sum `this.diceUpgradeXpSpent + this.slotPurchaseXpSpent`.
