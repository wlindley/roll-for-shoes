# Module Interfaces & Contracts

This document defines the authoritative public TypeScript classes, interfaces, discriminated unions, fluent builders, and getters (`src/<module>/index.ts`) for all five modules.

> [!IMPORTANT]
> **Design Principles**
> 1. **Computed Getters Over Stored Totals**: Derived values (`total`, `rawTotal`, `modifierTotal`, `finalTotal`, `nonSixCount`, `naturalAllSixes`, `margin`, `outcome`, `xpCostToAdvance`, `totalXpSpent`, `availableSlots`) are always computed dynamically via getters from underlying arrays/fields so they can never fall out of sync.
> 2. **One Canonical Interface & Unrepresentable Invalid States**: Every operation has one clear way to express it (`Character.create`, `RolledOpposition.withDice`/`fromDice`, `DifficultyOpposition.static`/`dynamic`, symmetric `serialize`/`deserialize`, strict entity IDs), and mutually exclusive domain states (`OppositionResult`, `SkillSlotSummary`, `AdvancementSlotStrategy`, `CampaignRollLogEntry`) are modeled as discriminated unions.
> 3. **Immutable Classes + Single-Purpose Terminal Builders**: Every domain entity (`Character`, `Campaign`, `Workspace`) is frozen and immutable (`next !== prev`). Terminal builders (`ReadyCheck`, `ReadyCharacterCheck`, `ReadyOpposedCharacterCheck`, `ClaimableAdvancement`, `ScopedClaimableAdvancement`) expose only their terminal execution method.

---

## Module 1: Dice (`src/dice/index.ts`)

Responsible exclusively for six-sided dice (`d6`), positive-integer/face validation helpers, unbiased cryptographic rolling, and deterministic FIFO test stubbing.

```ts
export type DieValue = 1 | 2 | 3 | 4 | 5 | 6;

export function isDieValue(value: unknown): value is DieValue;
export function assertPositiveInt(value: number, label: string): void;
export function validateDiceValues(dice: readonly DieValue[], expectedCount: number): readonly DieValue[];

export class DiceRoll {
  readonly dice: readonly DieValue[];
  constructor(dice: readonly DieValue[]);
  get total(): number;
}

export interface DiceRoller {
  roll(count: number): DiceRoll;
}

export type RandomBytesSource = (buffer: Uint8Array) => void;

export class RandomDiceRoller implements DiceRoller {
  constructor(randomBytes?: RandomBytesSource);
  roll(count: number): DiceRoll;
}

export class StubDiceRoller implements DiceRoller {
  constructor(initialValues?: readonly DieValue[]);
  enqueue(...values: DieValue[]): this;
  get remaining(): number;
  roll(count: number): DiceRoll;
}
```

---

## Module 2: Check Resolution (`src/checks/index.ts`)

Stateless check engine using a fluent `Check` builder, terminal `ReadyCheck<TOpp>`, discriminated `OppositionResult`, and polymorphic `CheckOpposition<TResult>` classes. Imports **only** from `src/dice`.

```ts
import type { DiceRoller, DieValue } from '../dice';

export type CheckOutcome = 'success' | 'tie' | 'failure';
export type TiesMode = 'fail' | 'twist';

export enum DifficultyTier {
  Easy = 1,     // 1d6 dynamic | 3 static
  Moderate = 2, // 2d6 dynamic | 6 static
  Hard = 3,     // 3d6 dynamic | 9 static
  VeryHard = 4, // 4d6 dynamic | 12 static
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

// --- Discriminated Opposition Results & Polymorphic Strategies ---

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
    options?: {
      readonly modifiers?: readonly CheckModifier[];
      readonly label?: string;
      readonly diceValues?: readonly DieValue[];
    },
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
    options?: {
      readonly modifiers?: readonly CheckModifier[];
      readonly label?: string;
      readonly diceValues?: readonly DieValue[];
    },
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

// --- Check Result & Fluent Check Builder ---

export class CheckResult<TOpp extends OppositionResult = OppositionResult> {
  readonly actor: RolledPool;
  readonly opposition: TOpp;
  readonly tiesMode: TiesMode;

  constructor(actor: RolledPool, opposition: TOpp, tiesMode?: TiesMode);
  get margin(): number;
  get outcome(): CheckOutcome;
}

export class ReadyCheck<TOpp extends OppositionResult = OppositionResult> {
  constructor(
    diceCount: number,
    opposition: CheckOpposition<TOpp>,
    modifiers: readonly CheckModifier[],
    tiesMode?: TiesMode,
    diceValues?: readonly DieValue[],
  );
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
```

---

## Module 3: Character Management (`src/character/index.ts`)

Immutable `Character` entity with cohesive check/advancement builders, discriminated `SkillSlotSummary`, portraits, and typed snapshot/JSON serialization. Imports **only** from `src/dice` and `src/checks`.

```ts
import type { DiceRoller, DieValue } from '../dice';
import type {
  CheckModifier,
  CheckOpposition,
  CheckOutcome,
  CheckResult,
  RolledOpposition,
  RolledOppositionResult,
  TiesMode,
} from '../checks';

export const DEFAULT_STARTING_SKILL_NAME = 'Do Anything';

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
  static slotCostForLevel(level: number): number;
  baseLimitForLevel(level: number): number | null;
}

export class UnrestrictedSkillSlotSummary {
  readonly kind: 'unrestricted';
  readonly level: number;
  readonly usedSlots: number;
  constructor(level: number, usedSlots: number);
}

export class CappedSkillSlotSummary {
  readonly kind: 'capped';
  readonly level: number;
  readonly maxSlots: number;
  readonly usedSlots: number;
  readonly effectivePurchasedSlots: number;
  readonly nextSlotXpCost: number | null;

  constructor(
    level: number,
    maxSlots: number,
    usedSlots: number,
    effectivePurchasedSlots: number,
    nextSlotXpCost: number | null,
  );

  get availableSlots(): number;
}

export type SkillSlotSummary = UnrestrictedSkillSlotSummary | CappedSkillSlotSummary;

export interface CharacterCreateOptions {
  readonly id?: string;
  readonly portrait?: string | null;
  readonly startingSkills?: readonly { readonly name: string; readonly level: number }[];
}

export class Character {
  readonly id: string;
  readonly name: string;
  readonly portrait?: string;
  readonly xp: number;
  readonly skills: readonly Skill[];
  readonly statuses: readonly Status[];
  readonly purchasedSlots: Readonly<Record<number, number>>;
  readonly pendingAdvancement: PendingAdvancement | null;

  static create(name: string, options?: CharacterCreateOptions): Character;
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
  /** Removes a status strictly by exact `statusId`. */
  removeStatus(statusId: string): Character;

  getSkillSlotSummary(level: number, slotConfig?: SkillSlotConfig | null): SkillSlotSummary;
  purchaseSkillSlot(level: number, slotConfig: SkillSlotConfig): Character;

  makeCheck(skillIdOrName: string): CharacterCheckBuilder;
  advance(newSkillName: string): CharacterAdvancementBuilder;
  dismissAdvancement(): Character;

  serialize(): string;
}

// --- Check Builders & Outcomes (check-builders.ts) ---

export class OpposedParticipantBuilder {
  withStatus(statusIdOrName: string): OpposedParticipantBuilder;
  withModifier(label: string, value: number): OpposedParticipantBuilder;
  withDiceValues(dice: readonly DieValue[]): OpposedParticipantBuilder;
  toOpposition(label?: string): RolledOpposition;
}

export class CharacterCheckBuilder {
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

export class ReadyCharacterCheck {
  roll(diceRoller: DiceRoller): CharacterCheckOutcome;
}

export class ReadyOpposedCharacterCheck {
  roll(diceRoller: DiceRoller): OpposedCharacterCheckOutcome;
}

export class CharacterCheckOutcome {
  readonly character: Character;
  readonly skillUsed: Skill;
  readonly checkResult: CheckResult;

  get xpEarned(): number;
  get canAdvanceNaturally(): boolean;
  get canAdvance(): boolean;
}

export class OpposedCharacterCheckOutcome {
  readonly actor: Character;
  readonly defender: Character;
  readonly actorSkill: Skill;
  readonly defenderSkill: Skill;
  readonly checkResult: CheckResult<RolledOppositionResult>;

  get actorXpEarned(): number;
  get defenderXpEarned(): number;
}

// --- Advancement Builders & Outcomes (advancement.ts) ---

export class PendingAdvancement {
  readonly rollId: string;
  readonly usedSkillId: string;
  readonly usedSkillName: string;
  readonly usedSkillLevel: number;
  readonly rawDice: readonly DieValue[];
  readonly checkOutcome: CheckOutcome;
  readonly actionDescription?: string;

  get targetLevel(): number;
  get xpCostToAdvance(): number;
  get naturalAllSixes(): boolean;
}

export type AdvancementSlotStrategy =
  | { readonly kind: 'direct' }
  | { readonly kind: 'replace'; readonly replacedSkillIdOrName: string }
  | { readonly kind: 'purchase-slot' };

export class ClaimableAdvancement {
  claim(): AdvancementOutcome;
}

export class CharacterAdvancementBuilder {
  withSlotConfig(slotConfig: SkillSlotConfig | null): CharacterAdvancementBuilder;
  replacingSkill(skillIdOrName: string): ClaimableAdvancement;
  purchasingSlot(): ClaimableAdvancement;
  claim(): AdvancementOutcome;
}

export class AdvancementOutcome {
  readonly character: Character;
  readonly createdSkill: Skill;
  readonly diceUpgradeXpSpent: number;
  readonly slotPurchaseXpSpent: number;
  readonly replacedSkill?: Skill;

  get totalXpSpent(): number;
}

// --- Snapshot Mappers (serialize.ts) ---

export interface SkillSnapshot {
  readonly id: string;
  readonly name: string;
  readonly level: number;
  readonly parentSkillId?: string;
}

export interface StatusSnapshot {
  readonly id: string;
  readonly name: string;
  readonly rating: number;
  readonly note?: string;
}

export interface PendingAdvancementSnapshot {
  readonly rollId: string;
  readonly usedSkillId: string;
  readonly usedSkillName: string;
  readonly usedSkillLevel: number;
  readonly rawDice: readonly DieValue[];
  readonly checkOutcome: CheckOutcome;
  readonly actionDescription?: string;
}

export interface CharacterSnapshot {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly name: string;
  readonly portrait?: string;
  readonly xp: number;
  readonly skills: readonly SkillSnapshot[];
  readonly statuses: readonly StatusSnapshot[];
  readonly purchasedSlots: Readonly<Record<number, number>>;
  readonly pendingAdvancement: PendingAdvancementSnapshot | null;
}

export function toCharacterSnapshot(c: Character): CharacterSnapshot;
export function fromCharacterSnapshot(raw: unknown): Character;
```

---

## Module 4: Campaign, Workspace & Storage (`src/campaign/index.ts`)

Immutable `Campaign` and `Workspace` classes with discriminated `CampaignRollLogEntry`, compositional fluent scopes, symmetric JSON serialization, and pluggable `StorageAdapter` implementations. Imports **only** from `src/dice`, `src/checks`, and `src/character`.

```ts
import type { DiceRoller, DieValue } from '../dice';
import type { CheckOpposition, CheckResult, RolledOppositionResult, TiesMode } from '../checks';
import type {
  AdvancementOutcome,
  Character,
  CharacterCheckOutcome,
  OpposedCharacterCheckOutcome,
  SkillSlotConfig,
} from '../character';

export interface CampaignRulesConfig {
  readonly tiesMode: TiesMode;
  readonly statusesEnabled: boolean;
  readonly allowCustomStartingSkills: boolean;
  readonly skillSlots: SkillSlotConfig | null;
}

export const BASIC_CAMPAIGN_RULES: CampaignRulesConfig;

export interface VsOppositionRollLogEntry {
  readonly id: string;
  readonly timestamp: string;
  readonly kind: 'vs_opposition';
  readonly actorId: string;
  readonly actorName: string;
  readonly actorSkillName: string;
  readonly actionDescription?: string;
  readonly checkResult: CheckResult;
  readonly actorXpEarned: number;
}

export interface CharacterOpposedRollLogEntry {
  readonly id: string;
  readonly timestamp: string;
  readonly kind: 'character_opposed';
  readonly actorId: string;
  readonly actorName: string;
  readonly actorSkillName: string;
  readonly defenderId: string;
  readonly defenderName: string;
  readonly defenderSkillName: string;
  readonly actionDescription?: string;
  readonly checkResult: CheckResult<RolledOppositionResult>;
  readonly actorXpEarned: number;
  readonly defenderXpEarned: number;
}

export type CampaignRollLogEntry = VsOppositionRollLogEntry | CharacterOpposedRollLogEntry;

export interface StorageAdapter {
  load(): Promise<string | null>;
  save(serializedWorkspace: string): Promise<void>;
  clear(): Promise<void>;
}

export class LocalStorageAdapter implements StorageAdapter {
  constructor(options?: {
    readonly key?: string;
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

  static deserialize(campaignJson: string): Campaign;

  rename(name: string): Campaign;
  withDescription(description: string): Campaign;
  withRules(rulesPatch: Partial<CampaignRulesConfig>): Campaign;

  addCharacter(character: Character): Campaign;
  removeCharacter(characterId: string): Campaign;
  replaceCharacter(character: Character): Campaign;
  findCharacter(characterId: string): Character | undefined;
  findCharacterByName(name: string): Character | undefined;

  character(idOrName: string): CampaignCharacterScope<{ readonly campaign: Campaign }>;
  serialize(): string;
}

export class Workspace {
  readonly schemaVersion: 1;
  readonly activeCampaignId: string | null;
  readonly campaigns: readonly Campaign[];

  static empty(): Workspace;
  static deserialize(serialized: string): Workspace;
  static load(adapter: StorageAdapter): Promise<Workspace>;

  createCampaign(
    name: string,
    options?: {
      readonly description?: string;
      readonly rules?: Partial<CampaignRulesConfig>;
    },
  ): Workspace;

  importCampaign(campaignJson: string): Workspace;
  selectCampaign(campaignId: string): Workspace;
  deleteCampaign(campaignId: string): Workspace;
  replaceCampaign(campaign: Campaign): Workspace;

  tryGetActiveCampaign(): Campaign | null;
  get activeCampaign(): WorkspaceCampaignScope;
  campaign(campaignId: string): WorkspaceCampaignScope;

  serialize(): string;
  save(adapter: StorageAdapter): Promise<void>;
}

export class WorkspaceCampaignScope {
  readonly campaign: Campaign;

  rename(name: string): Workspace;
  withDescription(description: string): Workspace;
  withRules(rulesPatch: Partial<CampaignRulesConfig>): Workspace;
  addCharacter(character: Character): Workspace;
  removeCharacter(characterId: string): Workspace;

  character(
    idOrName: string,
  ): CampaignCharacterScope<{ readonly workspace: Workspace; readonly campaign: Campaign }>;
}

export class ScopedDefenderBuilder {
  withStatus(statusIdOrName: string): ScopedDefenderBuilder;
  withModifier(label: string, value: number): ScopedDefenderBuilder;
  withDiceValues(dice: readonly DieValue[]): ScopedDefenderBuilder;
}

export class CampaignCharacterScope<TRoot> {
  readonly character: Character;
  update(transform: (character: Character) => Character): TRoot;
  makeCheck(skillIdOrName: string): ScopedCheckBuilder<TRoot>;
  advance(newSkillName: string): ScopedAdvancementBuilder<TRoot>;
  dismissAdvancement(): TRoot;
}

export class ScopedCheckBuilder<TRoot> {
  withAction(description: string): ScopedCheckBuilder<TRoot>;
  withStatus(statusIdOrName: string): ScopedCheckBuilder<TRoot>;
  withModifier(label: string, value: number): ScopedCheckBuilder<TRoot>;
  withDiceValues(dice: readonly DieValue[]): ScopedCheckBuilder<TRoot>;

  against(opposition: CheckOpposition): {
    roll(diceRoller: DiceRoller): TRoot & { readonly outcome: CharacterCheckOutcome };
  };

  againstCharacter(
    defenderIdOrName: string,
    defenderSkillIdOrName: string,
    configureDefender?: (b: ScopedDefenderBuilder) => ScopedDefenderBuilder,
  ): {
    roll(diceRoller: DiceRoller): TRoot & { readonly outcome: OpposedCharacterCheckOutcome };
  };
}

export class ScopedClaimableAdvancement<TRoot> {
  claim(): TRoot & { readonly advancement: AdvancementOutcome };
}

export class ScopedAdvancementBuilder<TRoot> {
  replacingSkill(skillIdOrName: string): ScopedClaimableAdvancement<TRoot>;
  purchasingSlot(): ScopedClaimableAdvancement<TRoot>;
  claim(): TRoot & { readonly advancement: AdvancementOutcome };
}
```

---

## Module 5: Browser UI (`src/ui/`)

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

| Component / Utility | Responsibility |
| :--- | :--- |
| **`App`** | Loads `Workspace` via `Workspace.load(storageAdapter)`, auto-saves via `workspace.save(storageAdapter)`, manages `sidebarOpen` and `activeDialog: 'none' \| 'rename' \| 'rules'`, and passes narrow `Campaign` / callback props to child components. |
| **`error.ts` (`formatError`)** | Shared error message extractor (`err instanceof Error ? err.message : fallback`). |
| **`ModalDialog`** | Native `<dialog>` primitive encapsulating `showModal`/`close`, `aria-labelledby`, `Escape` handling, `.dialog-body` backdrop light-dismiss, and header Close button. |
| **`CharacterAvatar`** | Shared `64×64` portrait `<img>` / `characterInitials(name) \|\| '?'` fallback badge. |
| **`DiceRow` & `RollSummary`** | Shared `d6` badge row and discriminated `OppositionResult` roll-breakdown display used by `CheckRollerPanel`, `RollHistoryLog`, and `AdvancementPrompt`. |
| **`AppIcon` & `InstallAppButton`** | Inline decorative sneaker+6d6 `<svg>` mark and standalone-aware PWA install button. |
| **`ActionMenu`** | Accessible keyboard-navigable WAI-ARIA menu button powering `Campaign Options` and `Advanced Options`. |
| **`CampaignSidebar`** | Hideable campaign switcher/creator (`workspace.selectCampaign`, `workspace.createCampaign`, `workspace.deleteCampaign`) and JSON backup export/import (`campaign.serialize()`, `workspace.importCampaign()`). |
| **`RenameCampaignDialog` & `CampaignSettingsDialog`** | Narrow-prop `<ModalDialog>` forms for renaming campaigns and updating `CampaignRulesConfig`. |
| **`CharacterGrid`, `CharacterCard` & `CreateCharacterDialog`** | Displays side-by-side character sheets (`Character.create(name, { portrait, startingSkills })`, `c.withPortrait`, `campaign.removeCharacter`) decoupled from `Workspace`. |
| **`portrait-image.ts`** | Center-crops and downscales uploaded portraits to `<= 256×256` WebP/JPEG data URLs (`encodePortraitFile`) and derives fallback initials (`characterInitials`). |
| **`CheckRollerPanel` & `PhysicalDiceInput`** | Builds checks via `campaign.character(...).makeCheck(...)` using `ActorCheckState` + discriminated `OppositionFormState` (`StaticOpposition`, `RolledOpposition.withDice`, `DifficultyOpposition.static`/`.dynamic`, `againstCharacter`), independent actor/defender status selections, and nullable-array `PhysicalDiceInput`. |
| **`AdvancementPrompt`, `StatusManager` & `SkillSlotBar`** | Narrow-prop `Character` subcomponents invoking `c.advance(...)`, `c.dismissAdvancement()`, `Status.create`/`Status.roll`, `c.removeStatus(s.id)`, and `c.purchaseSkillSlot(...)`. |
| **`RollHistoryLog`** | Displays `CampaignRollLogEntry` (`VsOppositionRollLogEntry` & `CharacterOpposedRollLogEntry`) cards via `<RollSummary>`. |
