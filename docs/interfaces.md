# Module Interfaces & Contracts

This document defines the authoritative public TypeScript classes, interfaces, fluent builders, and getters (`src/<module>/index.ts`) for all five modules.

> [!IMPORTANT]
> **Design Principles**
> 1. **Computed Getters Over Stored Totals**: Derived values (`total`, `rawTotal`, `modifierTotal`, `finalTotal`, `nonSixCount`, `naturalAllSixes`, `margin`, `outcome`, `xpCostToAdvance`, `totalXpSpent`, `availableSlots`) are always computed dynamically via getters from underlying arrays/fields so they can never fall out of sync.
> 2. **Immutable Classes + Fluent Builders**: Every domain entity (`Character`, `Campaign`, `Workspace`) is immutable. State-changing methods and terminal builder calls always return a **new** instance (`next !== prev`).
> 3. **Pragmatic Integer Checks**: Signatures use TypeScript `number`, with runtime `Number.isInteger()` checks enforced at critical entry boundaries (`DiceRoller.roll(count)`, `StubDiceRoller` die faces, `Skill` level).

---

## Module 1: Dice (`src/dice/index.ts`) — `[Commits 1–3]`

Responsible exclusively for rolling six-sided dice (`d6`) behind a single-method interface (`roll(count)`—use `roll(1)` for a single die).

```ts
export type DieValue = 1 | 2 | 3 | 4 | 5 | 6;

export function isDieValue(value: unknown): value is DieValue;

export class DiceRoll {
  /** Immutable array of rolled d6 face values in exact roll order. */
  readonly dice: readonly DieValue[];

  constructor(dice: readonly DieValue[]);

  /** Computed arithmetic sum of `this.dice`. */
  get total(): number;
}

export interface DiceRoller {
  /**
   * Rolls `count` 6-sided dice (use `roll(1)` for a single die).
   * @throws {RangeError} if `count < 1` or `!Number.isInteger(count)`.
   */
  roll(count: number): DiceRoll;
}

/** Injectable random byte filler used by `RandomDiceRoller` (defaults to `crypto.getRandomValues`). */
export type RandomBytesSource = (buffer: Uint8Array) => void;

/**
 * Production implementation using unbiased rejection sampling:
 * bytes `< 252` map to `((byte % 6) + 1) as DieValue`; bytes `>= 252` are discarded and re-sampled.
 */
export class RandomDiceRoller implements DiceRoller {
  constructor(randomBytes?: RandomBytesSource);
  roll(count: number): DiceRoll;
}

/**
 * Deterministic FIFO queue implementation used in boundary tests across all modules.
 */
export class StubDiceRoller implements DiceRoller {
  /**
   * @throws {RangeError} if any value fails `isDieValue`.
   */
  constructor(initialValues?: readonly DieValue[]);

  /** Appends predetermined d6 results to the queue (fluent `this`). */
  enqueue(...values: DieValue[]): this;

  /** Computed count of unconsumed d6 values remaining in the queue. */
  get remaining(): number;

  /**
   * Consumes `count` values in FIFO order.
   * @throws {RangeError} if `count < 1` or `!Number.isInteger(count)`.
   * @throws {Error} matching `/exhausted/i` if `this.remaining < count`.
   */
  roll(count: number): DiceRoll;
}
```

---

## Module 2: Check Resolution (`src/checks/index.ts`) — `[Commits 4–5, 20, 23]`

Stateless rules engine using a fluent `Check` builder and polymorphic `CheckOpposition` classes. Imports **only** from `src/dice`.

```ts
import type { DiceRoller, DieValue } from '../dice';

export type CheckOutcome = 'success' | 'tie' | 'failure';

/**
 * Controls how equal totals (`margin === 0`) are adjudicated:
 * - `'fail'`: Basic Rules default — actor must strictly beat opposition (`>`), so ties fail.
 * - `'twist'`: Advanced Ties rule — equal totals yield `'tie'` (partial success with twist, 0 XP).
 */
export type TiesMode = 'fail' | 'twist';

/**
 * Integer values match difficulty dice count (`tier` d6) and `tier * 3` static target
 * (`reference/rules.md`, lines 24–29) [Commit 20].
 */
export enum DifficultyTier {
  Easy = 1,     // 1d6 dynamic | 3 static
  Moderate = 2, // 2d6 dynamic | 6 static
  Hard = 3,     // 3d6 dynamic | 9 static
  VeryHard = 4, // 4d6 dynamic | 12 static
}

/** Positive bonus or negative penalty applied to a check pool [Commit 23]. */
export interface CheckModifier {
  readonly label: string;
  readonly value: number;
}

export class RolledPool {
  readonly rawDice: readonly DieValue[];
  readonly modifiers: readonly CheckModifier[];

  constructor(rawDice: readonly DieValue[], modifiers?: readonly CheckModifier[]);

  /** Computed sum of `rawDice`. */
  get rawTotal(): number;
  /** Computed sum of `modifiers[i].value` (`0` when empty). */
  get modifierTotal(): number;
  /** Computed `rawTotal + modifierTotal` (may be <= 0 when penalties exceed roll). */
  get finalTotal(): number;
  /** Computed count of dice in `rawDice` !== 6 (= XP needed to upgrade remaining dice to 6s). */
  get nonSixCount(): number;
  /** Computed `rawDice.length > 0 && nonSixCount === 0` (unaffected by `modifiers`!). */
  get naturalAllSixes(): boolean;
}

// --- Polymorphic Opposition Hierarchy ---

export interface OppositionResult {
  /** Single threshold total that `actor.finalTotal` must beat. */
  readonly total: number;
  /** Present when opposition rolled dice (`RolledOpposition` or dynamic `DifficultyOpposition`). */
  readonly pool?: RolledPool;
  readonly label?: string;
}

export interface CheckOpposition {
  readonly label?: string;
  resolve(diceRoller: DiceRoller): OppositionResult;
}

/** Fixed numeric threshold; `resolve()` never consumes dice from `diceRoller` [Commit 4]. */
export class StaticOpposition implements CheckOpposition {
  readonly target: number;
  readonly label?: string;

  constructor(target: number, label?: string);
  resolve(diceRoller: DiceRoller): OppositionResult;
}

/** Opposing dice pool rolling `diceCount` d6s [Commit 5] with optional modifiers [Commit 23]. */
export class RolledOpposition implements CheckOpposition {
  readonly diceCount: number;
  readonly modifiers: readonly CheckModifier[];
  readonly label?: string;

  constructor(
    diceCount: number,
    options?: { readonly modifiers?: readonly CheckModifier[]; readonly label?: string },
  );

  /** Returns a new `RolledOpposition` with the appended modifier [Commit 23]. */
  withModifier(label: string, value: number): RolledOpposition;
  resolve(diceRoller: DiceRoller): OppositionResult;
}

/**
 * Named Difficulty preset (`Easy=1 .. VeryHard=4`) [Commit 20]:
 * - `'static'` mode: threshold is `tier * 3` (plus any modifiers), consuming 0 dice.
 * - `'dynamic'` mode: rolls `tier` d6s into a `RolledPool` (plus any modifiers).
 */
export class DifficultyOpposition implements CheckOpposition {
  readonly tier: DifficultyTier;
  readonly mode: 'static' | 'dynamic';
  readonly modifiers: readonly CheckModifier[];
  readonly label?: string;

  constructor(
    tier: DifficultyTier,
    mode?: 'static' | 'dynamic', // defaults to 'static'
    options?: { readonly modifiers?: readonly CheckModifier[]; readonly label?: string },
  );

  withModifier(label: string, value: number): DifficultyOpposition;
  resolve(diceRoller: DiceRoller): OppositionResult;
}

// --- Check Result & Fluent Check Builder ---

export class CheckResult {
  readonly actor: RolledPool;
  readonly opposition: OppositionResult;
  readonly tiesMode: TiesMode;

  constructor(actor: RolledPool, opposition: OppositionResult, tiesMode?: TiesMode);

  /** Computed `actor.finalTotal - opposition.total`. */
  get margin(): number;
  /** Computed from `margin` and `tiesMode`. */
  get outcome(): CheckOutcome;
}

export class Check {
  /** Starts building a check rolling `diceCount` d6s for the actor. */
  static withDice(diceCount: number): Check;

  withModifier(label: string, value: number): Check;
  withModifiers(modifiers: readonly CheckModifier[]): Check;
  withTiesMode(tiesMode: TiesMode): Check;
  against(opposition: CheckOpposition): ReadyCheck;
}

export class ReadyCheck {
  withModifier(label: string, value: number): ReadyCheck;
  withModifiers(modifiers: readonly CheckModifier[]): ReadyCheck;
  withTiesMode(tiesMode: TiesMode): ReadyCheck;

  /**
   * Executes the check:
   * 1. Calls `diceRoller.roll(actorDiceCount)` FIRST.
   * 2. Calls `opposition.resolve(diceRoller)` SECOND.
   */
  resolve(diceRoller: DiceRoller): CheckResult;
}
```

---

## Module 3: Character Management (`src/character/index.ts`) — `[Commits 6–10, 21, 24, 26–28, 33]`

Immutable `Character` entity with member methods and fluent builders for checks, advancement, statuses, starting skills, skill slots, portraits, and serialization. Imports **only** from `src/dice` and `src/checks`.

```ts
import type { DiceRoller, DieValue } from '../dice';
import type {
  CheckModifier,
  CheckOpposition,
  CheckOutcome,
  CheckResult,
  TiesMode,
} from '../checks';

export const DEFAULT_STARTING_SKILL_NAME = 'Do Anything';

export class Skill {
  readonly id: string;
  readonly name: string;
  /** Validated integer >= 1 (`RangeError` otherwise). */
  readonly level: number;
  readonly parentSkillId?: string;

  constructor(props: {
    readonly id?: string;
    readonly name: string;
    readonly level: number;
    readonly parentSkillId?: string;
  });
}

/** Persistent bonus or penalty on a character (`reference/rules.md`, lines 39–56) [Commit 24]. */
export class Status {
  readonly id: string;
  readonly name: string;
  readonly rating: number;
  readonly note?: string;

  /** Creates a Status with an explicit positive or negative rating (e.g. `+2`, `-3`). */
  static create(
    name: string,
    rating: number,
    options?: { readonly id?: string; readonly note?: string },
  ): Status;

  /** Rolls `diceCount` d6s via `diceRoller` and creates a `+total` or `-total` Status. */
  static roll(
    name: string,
    diceCount: number,
    polarity: 'positive' | 'negative',
    diceRoller: DiceRoller,
    options?: { readonly id?: string; readonly note?: string },
  ): Status;
}

/** Per-level skill slot limits & slot purchasing rules (`reference/rules.md`, lines 58–71) [Commits 27–28]. */
export class SkillSlotConfig {
  /** Base caps keyed by skill level >= 2 (Level 1 is always unrestricted). */
  readonly limitsByLevel: Readonly<Record<number, number>>;
  /** Always a concrete boolean (defaults to `false`). */
  readonly allowSlotPurchase: boolean;
  /**
   * Base slots for levels above the highest key in `limitsByLevel`:
   * defaults to `1` when `allowSlotPurchase` is `false` (so higher levels remain reachable),
   * and `0` when `allowSlotPurchase` is `true` (requiring slot purchase).
   */
  readonly defaultSlotsAboveMax: number;

  constructor(options: {
    readonly limitsByLevel: Readonly<Record<number, number>>;
    readonly allowSlotPurchase?: boolean;
    readonly defaultSlotsAboveMax?: number;
  });

  /** Standard 4/3/2 skill triangle (`{ 2: 4, 3: 3, 4: 2 }`). */
  static triangle(options?: { readonly allowSlotPurchase?: boolean }): SkillSlotConfig;

  /** Returns base slot limit for `level`, or `null` for Level 1. */
  baseLimitForLevel(level: number): number | null;
}

export class SkillSlotSummary {
  readonly level: number;
  /** `null` when unrestricted (Level 1 or when no `SkillSlotConfig` is active). */
  readonly maxSlots: number | null;
  readonly usedSlots: number;
  /** Always `0` when `allowSlotPurchase === false` (purchased slots do not apply when disabled). */
  readonly effectivePurchasedSlots: number;

  /** Computed `maxSlots === null ? null : Math.max(0, maxSlots - usedSlots)`. */
  get availableSlots(): number | null;
  /** Computed `2 * level`. */
  get nextSlotXpCost(): number;
}

/**
 * Attached to `Character.pendingAdvancement` ONLY when the roll is eligible to advance
 * (`xpCostToAdvance === 0` or `characterAfterCheck.xp >= xpCostToAdvance`).
 */
export class PendingAdvancement {
  readonly rollId: string;
  readonly usedSkillId: string;
  readonly usedSkillName: string;
  readonly usedSkillLevel: number;
  readonly rawDice: readonly DieValue[];
  readonly checkOutcome: CheckOutcome;
  readonly actionDescription?: string;

  /** Computed `usedSkillLevel + 1`. */
  get targetLevel(): number;
  /** Computed count of dice in `rawDice` !== 6 (`0` for natural all-6s). */
  get xpCostToAdvance(): number;
  /** Computed `xpCostToAdvance === 0`. */
  get naturalAllSixes(): boolean;
}

// --- Outcomes ---

export class CharacterCheckOutcome {
  readonly character: Character;
  readonly skillUsed: Skill;
  readonly checkResult: CheckResult;

  /** Computed `checkResult.outcome === 'failure' ? 1 : 0`. */
  get xpEarned(): number;
  /** Computed `checkResult.actor.naturalAllSixes`. */
  get canAdvanceNaturally(): boolean;
  /** Computed `character.pendingAdvancement !== null`. */
  get canAdvance(): boolean;
}

export class OpposedCharacterCheckOutcome {
  readonly actor: Character;
  readonly defender: Character;
  readonly actorSkill: Skill;
  readonly defenderSkill: Skill;
  readonly checkResult: CheckResult;

  /** Computed `checkResult.outcome === 'failure' ? 1 : 0`. */
  get actorXpEarned(): number;
  /** Computed `checkResult.outcome === 'success' ? 1 : 0` (`0` on `'tie'` or actor `'failure'`). */
  get defenderXpEarned(): number;
}

export class AdvancementOutcome {
  readonly character: Character;
  readonly createdSkill: Skill;
  readonly replacedSkill?: Skill;
  readonly diceUpgradeXpSpent: number;
  readonly slotPurchaseXpSpent: number;

  /** Computed `diceUpgradeXpSpent + slotPurchaseXpSpent`. */
  get totalXpSpent(): number;
}

// --- Immutable Character Entity & Fluent Builders ---

export class Character {
  readonly id: string;
  readonly name: string;
  readonly portrait?: string;
  readonly xp: number;
  readonly skills: readonly Skill[];
  readonly statuses: readonly Status[];
  readonly purchasedSlots: Readonly<Record<number, number>>;
  readonly pendingAdvancement: PendingAdvancement | null;

  /** Quick factory creating a character with `0 XP` and `Do Anything 1`. */
  static create(
    name: string,
    options?: { readonly id?: string; readonly portrait?: string },
  ): Character;

  /** Fluent builder for customizing ID, portrait, and optional starting skills [Commits 6, 26, 33]. */
  static builder(name: string): CharacterBuilder;

  /** Validates JSON schema (`schemaVersion: 1`) and reconstructs an immutable `Character` [Commit 10]. */
  static deserialize(serialized: string): Character;

  /** Finds a skill by exact ID or case-insensitive name (`Error` if missing). */
  skill(idOrName: string): Skill;

  /**
   * Starts a fluent check for this character:
   * `bob.makeCheck('Climbing').withModifier('Raining', -4).against(new StaticOpposition(9)).roll(roller)`
   * Automatically clears any prior unclaimed `pendingAdvancement`, adds `+1 XP` on `'failure'`,
   * and attaches a new `pendingAdvancement` iff the character can advance on this roll.
   */
  makeCheck(skillIdOrName: string): CharacterCheckBuilder;

  /**
   * Starts a fluent advancement claim for `this.pendingAdvancement`:
   * `bob.advance('Rock Climbing').replacingSkill('Old').claim()`
   */
  advance(newSkillName: string): CharacterAdvancementBuilder;

  /** Returns a new `Character` with `pendingAdvancement` cleared to `null` (XP unchanged). */
  dismissAdvancement(): Character;

  /** Directly adds a skill (enforcing non-blank unique name, integer level >= 1, and optional `slotConfig`). */
  addSkill(
    name: string,
    level: number,
    options?: {
      readonly parentSkillId?: string;
      readonly slotConfig?: SkillSlotConfig | null;
      readonly replaceSkillIdOrName?: string;
    },
  ): Character;

  /** Returns a new `Character` with trimmed non-blank `portrait`, or `undefined` when `null` (`Error` if blank) [Commit 33]. */
  withPortrait(portrait: string | null): Character;

  /** Attaches a `Status` (`Status.create` or `Status.roll`) to this character [Commit 24]. */
  addStatus(status: Status): Character;

  /** Removes a status by exact ID or case-insensitive name [Commit 24]. */
  removeStatus(statusIdOrName: string): Character;

  /** Computes slot usage and availability at `level` [Commit 27]. */
  getSkillSlotSummary(level: number, slotConfig?: SkillSlotConfig | null): SkillSlotSummary;

  /**
   * Standalone purchase of +1 skill slot at `level >= 2` for `2 * level` XP [Commit 28].
   * @throws {Error} if `!slotConfig.allowSlotPurchase`, `level < 2`, or `this.xp < 2 * level`.
   */
  purchaseSkillSlot(level: number, slotConfig: SkillSlotConfig): Character;

  /** Deterministic versioned JSON serialization (`schemaVersion: 1`) [Commit 10]. */
  serialize(): string;
}

export class CharacterBuilder {
  withId(id: string): CharacterBuilder;
  /** Sets trimmed non-blank `portrait` or clears to `undefined` when `null` (`Error` if blank) [Commit 33]. */
  withPortrait(portrait: string | null): CharacterBuilder;
  /** Adds a custom starting skill alongside `Do Anything 1` [Commit 26]. */
  withStartingSkill(name: string, level: number): CharacterBuilder;
  build(): Character;
}

export class OpposedParticipantBuilder {
  withStatus(statusIdOrName: string): OpposedParticipantBuilder;
  withModifier(label: string, value: number): OpposedParticipantBuilder;
}

export class CharacterCheckBuilder {
  withAction(description: string): CharacterCheckBuilder;
  withStatus(statusIdOrName: string): CharacterCheckBuilder;
  withModifier(label: string, value: number): CharacterCheckBuilder;
  withTiesMode(tiesMode: TiesMode): CharacterCheckBuilder;

  against(opposition: CheckOpposition): ReadyCharacterCheck;
  againstCharacter(
    defender: Character,
    defenderSkillIdOrName: string,
    configureDefender?: (defenderBuilder: OpposedParticipantBuilder) => OpposedParticipantBuilder,
  ): ReadyOpposedCharacterCheck;
}

export class ReadyCharacterCheck {
  withTiesMode(tiesMode: TiesMode): ReadyCharacterCheck;
  roll(diceRoller: DiceRoller): CharacterCheckOutcome;
}

export class ReadyOpposedCharacterCheck {
  withTiesMode(tiesMode: TiesMode): ReadyOpposedCharacterCheck;
  roll(diceRoller: DiceRoller): OpposedCharacterCheckOutcome;
}

export class CharacterAdvancementBuilder {
  withSlotConfig(slotConfig: SkillSlotConfig | null): CharacterAdvancementBuilder;
  replacingSkill(skillIdOrName: string): CharacterAdvancementBuilder;
  purchasingSlot(): CharacterAdvancementBuilder;
  claim(): AdvancementOutcome;
}
```

---

## Module 4: Campaign, Workspace & Storage (`src/campaign/index.ts`) — `[Commits 11–14, 21, 25–26, 28]`

Immutable `Campaign` and `Workspace` classes with fluent scoped traversal (e.g. `workspace.activeCampaign.character('Alice').makeCheck('Climbing').against(new StaticOpposition(6)).roll(diceRoller)`) and pluggable `StorageAdapter` implementations. Imports **only** from `src/dice`, `src/checks`, and `src/character`.

```ts
import type { DiceRoller } from '../dice';
import type { CheckOpposition, CheckResult, TiesMode } from '../checks';
import type {
  AdvancementOutcome,
  Character,
  CharacterCheckOutcome,
  OpposedCharacterCheckOutcome,
  OpposedParticipantBuilder,
  SkillSlotConfig,
} from '../character';

export interface CampaignRulesConfig {
  readonly tiesMode: TiesMode;
  readonly statusesEnabled: boolean;
  readonly allowCustomStartingSkills: boolean;
  readonly skillSlots: SkillSlotConfig | null;
}

export const BASIC_CAMPAIGN_RULES: CampaignRulesConfig;
// { tiesMode: 'fail', statusesEnabled: false, allowCustomStartingSkills: false, skillSlots: null }

export interface CampaignRollLogEntry {
  readonly id: string;
  readonly timestamp: string;
  readonly kind: 'vs_opposition' | 'character_opposed';
  readonly actorId: string;
  readonly actorName: string;
  readonly actorSkillName: string;
  readonly defenderId?: string;
  readonly defenderName?: string;
  readonly defenderSkillName?: string;
  readonly actionDescription?: string;
  readonly checkResult: CheckResult;
  readonly actorXpEarned: number;
  readonly defenderXpEarned?: number;
}

// --- Pluggable Save / Restore Interface ---

export interface StorageAdapter {
  load(): Promise<string | null>;
  save(serializedWorkspace: string): Promise<void>;
  clear(): Promise<void>;
}

export class LocalStorageAdapter implements StorageAdapter {
  constructor(options?: {
    readonly key?: string; // defaults to 'roll_for_shoes.workspace.v1'
    readonly storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  });
  load(): Promise<string | null>;
  save(serializedWorkspace: string): Promise<void>;
  clear(): Promise<void>;
}

export class MemoryStorageAdapter implements StorageAdapter {
  constructor(initialSerialized?: string | null);
  load(): Promise<string | null>;
  save(serializedWorkspace: string): Promise<void>;
  clear(): Promise<void>;
}

// --- Immutable Campaign Entity ---

export class Campaign {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly rules: CampaignRulesConfig;
  readonly characters: readonly Character[];
  readonly rollLog: readonly CampaignRollLogEntry[];

  static create(
    name: string,
    options?: {
      readonly id?: string;
      readonly description?: string;
      readonly rules?: Partial<CampaignRulesConfig>;
    },
  ): Campaign;

  static fromJson(campaignJson: string): Campaign;

  rename(name: string): Campaign;
  withDescription(description: string): Campaign;
  withRules(rulesPatch: Partial<CampaignRulesConfig>): Campaign;

  /** Adds a `Character` (enforcing `rules.allowCustomStartingSkills` if extra skills are present). */
  addCharacter(characterOrName: Character | string): Campaign;
  removeCharacter(idOrName: string): Campaign;
  replaceCharacter(character: Character): Campaign;
  findCharacter(idOrName: string): Character | undefined;

  /** Enters fluent character scope bound to this `Campaign`. */
  character(idOrName: string): CampaignCharacterScope<{ readonly campaign: Campaign }>;

  exportJson(): string;
}

// --- Immutable Workspace Entity ---

export class Workspace {
  readonly schemaVersion: 1;
  readonly activeCampaignId: string | null;
  readonly campaigns: readonly Campaign[];

  static empty(): Workspace;
  static deserialize(serialized: string): Workspace;
  /** Loads from `adapter`, returning `Workspace.empty()` when storage is empty. */
  static load(adapter: StorageAdapter): Promise<Workspace>;

  /** Creates a campaign, appends it, and makes it the active campaign. */
  createCampaign(
    name: string,
    options?: {
      readonly description?: string;
      readonly rules?: Partial<CampaignRulesConfig>;
    },
  ): Workspace;

  /** Imports a serialized `Campaign` JSON (assigning a fresh ID if an ID collision exists). */
  importCampaign(campaignJson: string): Workspace;

  selectCampaign(idOrName: string): Workspace;
  deleteCampaign(idOrName: string): Workspace;
  replaceCampaign(campaign: Campaign): Workspace;

  /** Returns `null` when no campaign is active (useful for empty-state UI rendering). */
  tryGetActiveCampaign(): Campaign | null;

  /**
   * Fluent scope for the active campaign (`Error` if `activeCampaignId === null`).
   * Enables `workspace.activeCampaign.character('foo').makeCheck(...).against(...).roll(diceRoller)`.
   */
  get activeCampaign(): WorkspaceCampaignScope;

  /** Fluent scope for any campaign by ID or name. */
  campaign(idOrName: string): WorkspaceCampaignScope;

  serialize(): string;
  save(adapter: StorageAdapter): Promise<void>;
}

// --- Fluent Campaign & Character Scopes ---

export class WorkspaceCampaignScope {
  readonly campaign: Campaign;

  rename(name: string): Workspace;
  withDescription(description: string): Workspace;
  withRules(rulesPatch: Partial<CampaignRulesConfig>): Workspace;
  addCharacter(characterOrName: Character | string): Workspace;
  removeCharacter(idOrName: string): Workspace;

  character(
    idOrName: string,
  ): CampaignCharacterScope<{ readonly workspace: Workspace; readonly campaign: Campaign }>;
}

export class CampaignCharacterScope<TRoot> {
  readonly character: Character;

  /** Applies an arbitrary `Character -> Character` transformation (e.g. `addStatus`, `purchaseSkillSlot`). */
  update(transform: (character: Character) => Character): TRoot;

  makeCheck(skillIdOrName: string): ScopedCheckBuilder<TRoot>;
  advance(newSkillName: string): ScopedAdvancementBuilder<TRoot>;
  dismissAdvancement(): TRoot;
}

export class ScopedCheckBuilder<TRoot> {
  withAction(description: string): ScopedCheckBuilder<TRoot>;
  withStatus(statusIdOrName: string): ScopedCheckBuilder<TRoot>;
  withModifier(label: string, value: number): ScopedCheckBuilder<TRoot>;

  against(opposition: CheckOpposition): {
    roll(diceRoller: DiceRoller): TRoot & { readonly outcome: CharacterCheckOutcome };
  };

  againstCharacter(
    defenderIdOrName: string,
    defenderSkillIdOrName: string,
    configureDefender?: (b: OpposedParticipantBuilder) => OpposedParticipantBuilder,
  ): {
    roll(diceRoller: DiceRoller): TRoot & { readonly outcome: OpposedCharacterCheckOutcome };
  };
}

export class ScopedAdvancementBuilder<TRoot> {
  replacingSkill(skillIdOrName: string): ScopedAdvancementBuilder<TRoot>;
  purchasingSlot(): ScopedAdvancementBuilder<TRoot>;
  claim(): TRoot & { readonly advancement: AdvancementOutcome };
}
```

---

## Module 5: Browser UI (`src/ui/`) — `[Commits 15–19, 22, 25–26, 29]`

Untested React + TypeScript view layer. Receives `DiceRoller` and `StorageAdapter` via root props so `localStorage` and `RandomDiceRoller` are wired only at the browser entrypoint (`src/main.tsx`).

```tsx
// src/ui/App.tsx
import type { DiceRoller } from '../dice';
import type { StorageAdapter } from '../campaign';

export interface AppProps {
  readonly diceRoller: DiceRoller;
  readonly storageAdapter: StorageAdapter;
}

export function App(props: AppProps): React.JSX.Element;
```

### UI Component Boundaries & Responsibilities

| Component / Utility | Responsibility | Commits |
| :--- | :--- | :--- |
| **`App`** | Loads `Workspace` via `Workspace.load(storageAdapter)`, auto-saves via `workspace.save(storageAdapter)`, toggles the hideable `CampaignSidebar` (hidden by default once a campaign is displayed), and hosts `Campaign Options` (`RenameCampaignDialog` + `CampaignSettingsDialog`). | Commits 15, 34, 39, 40 |
| **`AppIcon`** | Renders the inline decorative shoe-with-6-sided-die `<svg>` mark in `.app-header`. | Commit 40 |
| **`ActionMenu`** | Accessible keyboard-navigable WAI-ARIA menu button (`aria-haspopup="menu"`, `ArrowUp`/`ArrowDown`/`Home`/`End`/`Escape`, focus-out & outside-click dismissal) powering `Campaign Options` and `Advanced Options`. | Commit 38 |
| **`CampaignSidebar`** | Hideable campaign switcher/creator (`workspace.selectCampaign`, `workspace.createCampaign`, `workspace.deleteCampaign`) with an `Advanced Options` menu for `campaign.exportJson()` and `workspace.importCampaign()`. | Commits 16, 36, 39 |
| **`RenameCampaignDialog`** | Native modal `<dialog>` renaming the active campaign via `workspace.activeCampaign.rename(name)`. | Commit 38 |
| **`CampaignSettingsDialog`** | Native modal `<dialog>` editing `activeCampaign.withRules(...)` (`tiesMode`, `statusesEnabled`, `allowCustomStartingSkills`, `skillSlots`). | Commits 22, 25, 26, 29 |
| **`CharacterGrid` & `CharacterCard`** | Displays **multiple characters simultaneously** in wider side-by-side cards with `64×64` portraits (`character.withPortrait(...)`) / initials avatars, XP, skills, `pendingAdvancement` callout, `StatusManager`, and `SkillSlotBar`. | Commits 17, 25, 29, 35, 36 |
| **`CreateCharacterDialog`** | Creates characters via `Character.create` or `Character.builder(...)` with optional portrait upload/preview and custom starting skills. | Commits 17, 26, 35 |
| **`portrait-image.ts`** | Center-crops and scales uploaded portrait files to `<= 256×256` WebP/JPEG data URLs (`encodePortraitFile`) and derives fallback initials (`characterInitials`). | Commit 35 |
| **`CheckRollerPanel`** | Builds checks via `workspace.activeCampaign.character(...).makeCheck(...)` against `StaticOpposition`, `RolledOpposition`, another `Character`, or `DifficultyOpposition`, with status/modifier toggles. | Commits 18, 22, 25, 36 |
| **`AdvancementPrompt`** | Invokes `.advance(name).claim()` or `.dismissAdvancement()`, supporting `.replacingSkill(...)` and `.purchasingSlot()` when skill slots are full. | Commits 19, 29, 36 |
| **`RollHistoryLog`** | Displays `activeCampaign.rollLog` entries using `CheckResult` and `RolledPool` computed getters. | Commits 19, 36 |
| **`StatusManager`** | Creates statuses via `Status.create` or `Status.roll` and updates characters via `.addStatus()` / `.removeStatus()`. | Commits 25, 36 |
| **`SkillSlotBar`** | Displays `character.getSkillSlotSummary(level, slotConfig)` and triggers `character.purchaseSkillSlot(level, slotConfig)`. | Commit 29 |
| **`InstallAppButton`** | Triggers PWA installation via `navigator.install()` or `beforeinstallprompt` when not already running in standalone mode. | Commit 31 |
