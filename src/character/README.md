# Module 3: Character (`src/character`)

Immutable domain model for **Roll for Shoes** characters—managing skills, XP, check resolution, post-roll skill advancement, persistent statuses, configurable skill-slot triangles, portraits, and versioned snapshot/JSON serialization.

---

## 1. What It Is

[`src/character`](./index.ts) implements Layer 3 of the domain model ([`docs/architecture.md`](../../docs/architecture.md), [`docs/interfaces.md`](../../docs/interfaces.md)) on top of `src/dice` and `src/checks`:

- **Single Canonical `Character.create` Factory** ([`character.ts`](./character.ts)): Creates a frozen `Character` with `0 XP`, `[Do Anything 1]`, optional `id`, optional `portrait`, and optional `startingSkills`. Every state transition returns a distinct `Character` instance (`next !== prev`).
- **Skills & Statuses** ([`skill.ts`](./skill.ts), [`status.ts`](./status.ts)): Validated `Skill` hierarchy (`parentSkillId` lineage) and persistent positive/negative `Status` modifiers (`Status.create` or `Status.roll`). `character.removeStatus(statusId)` removes strictly by status ID so identically named statuses never collide.
- **Cohesive Check & Advancement Modules** ([`check-builders.ts`](./check-builders.ts), [`advancement.ts`](./advancement.ts)):
  - `CharacterCheckBuilder` configures single-character and opposed character-vs-character checks in one canonical stage before `.against(opposition)` / `.againstCharacter(...)` transitions to single-purpose terminal `ReadyCharacterCheck` / `ReadyOpposedCharacterCheck` (`roll(diceRoller)` only).
  - `PendingAdvancement` delegates `xpCostToAdvance` (`nonSixCount`) and `naturalAllSixes` to `RolledPool` from `../checks`.
  - `CharacterAdvancementBuilder` transitions via `.replacingSkill(skillIdOrName)` or `.purchasingSlot()` to terminal `ClaimableAdvancement` (`claim()` only, backed by discriminated `AdvancementSlotStrategy`) so conflicting slot strategies cannot be chained at compile time.
- **Discriminated `SkillSlotSummary` & Centralized Slot Cost Policy** ([`skill-slots.ts`](./skill-slots.ts)):
  - `SkillSlotConfig.slotCostForLevel(level)` (`2 * level`) is the single source of truth for slot purchase costs.
  - `character.getSkillSlotSummary(level, slotConfig)` returns `UnrestrictedSkillSlotSummary` (`kind: 'unrestricted'`, no `maxSlots`) or `CappedSkillSlotSummary` (`kind: 'capped'`, numeric `maxSlots`, computed `availableSlots`, and `nextSlotXpCost: number | null`).
- **Snapshot Mappers & Versioned JSON Serialization** ([`serialize.ts`](./serialize.ts)): Exports typed `CharacterSnapshot`, `toCharacterSnapshot`, and `fromCharacterSnapshot` alongside `character.serialize()` / `Character.deserialize(json)` so `src/campaign` serializes embedded characters directly without double `JSON.parse`/`JSON.stringify` thrashing or `@internal` static rehydration leaks.

### Module Files

| File | Responsibility |
| :--- | :--- |
| [`./index.ts`](./index.ts) | Public module barrel re-exporting all public classes, types, and snapshot mappers. |
| [`./skill.ts`](./skill.ts) | `DEFAULT_STARTING_SKILL_NAME` (`'Do Anything'`) and validated `Skill` value class. |
| [`./status.ts`](./status.ts) | `Status` value class (`Status.create` and `Status.roll`). |
| [`./skill-slots.ts`](./skill-slots.ts) | `SkillSlotConfig`, `UnrestrictedSkillSlotSummary`, `CappedSkillSlotSummary`, and `SkillSlotSummary`. |
| [`./check-builders.ts`](./check-builders.ts) | `CharacterCheckBuilder`, `OpposedParticipantBuilder`, `ReadyCharacterCheck`, `ReadyOpposedCharacterCheck`, `CharacterCheckOutcome`, and `OpposedCharacterCheckOutcome`. |
| [`./advancement.ts`](./advancement.ts) | `PendingAdvancement`, `AdvancementSlotStrategy`, `ClaimableAdvancement`, `CharacterAdvancementBuilder`, and `AdvancementOutcome`. |
| [`./character.ts`](./character.ts) | Immutable `Character` aggregate and `CharacterCreateOptions`. |
| [`./serialize.ts`](./serialize.ts) | `CharacterSnapshot` DTOs, `toCharacterSnapshot`, `fromCharacterSnapshot`, and `schemaVersion: 1` JSON persistence. |
| [`./character-creation.test.ts`](./character-creation.test.ts) | Focused tests for `Skill`, `Character.create` (`id`, `portrait`, `startingSkills`), `addSkill`, and `withPortrait`. |
| [`./character-statuses.test.ts`](./character-statuses.test.ts) | Focused tests for `Status.create` / `Status.roll`, `addStatus`, strict `removeStatus(statusId)`, and check status modifiers. |
| [`./character-checks.test.ts`](./character-checks.test.ts) | Focused tests for `makeCheck`, `against`, `againstCharacter`, `TiesMode`, physical dice, and `pendingAdvancement` eligibility. |
| [`./character-advancement.test.ts`](./character-advancement.test.ts) | Focused tests for `advance`, `ClaimableAdvancement`, `dismissAdvancement`, and XP upgrade rules. |
| [`./character-slots.test.ts`](./character-slots.test.ts) | Focused tests for `SkillSlotConfig`, discriminated `SkillSlotSummary`, slot replacement, and slot purchasing. |
| [`./character-serialization.test.ts`](./character-serialization.test.ts) | Focused tests for `serialize`, `deserialize`, `toCharacterSnapshot`, `fromCharacterSnapshot`, and payload validation. |

---

## 2. How to Use It

### Creating Characters (`Character.create`)

```ts
import { Character } from '../character';

const bob = Character.create('Bob', { id: 'char-bob' });

const ada = Character.create('Ada', {
  id: 'char-ada',
  portrait: 'data:image/webp;base64,UklGR...',
  startingSkills: [
    { name: 'Hacking', level: 2 },
    { name: 'Parkour', level: 3 },
  ],
});
// ada.skills -> ['Do Anything 1', 'Hacking 2', 'Parkour 3']
```

### Making Checks, Claiming Advancements, Managing Statuses & Skill Slots

```ts
import { StubDiceRoller } from '../dice';
import { DifficultyOpposition, DifficultyTier } from '../checks';
import { Character, SkillSlotConfig, Status } from '../character';

const cleanShoe = Status.create('Clean Shoe', 2);
let alice = Character.create('Alice').addStatus(cleanShoe);
const guard = Character.create('Guard', { startingSkills: [{ name: 'Block', level: 2 }] });

// 1. Check vs. environmental opposition (configure TiesMode/modifiers/dice BEFORE .against)
const check = alice
  .makeCheck('Do Anything')
  .withAction('Vault the stone wall')
  .withStatus(cleanShoe.id)
  .withTiesMode('twist')
  .against(DifficultyOpposition.static(DifficultyTier.Moderate))
  .roll(new StubDiceRoller([6]));

// 2. Opposed character-vs-character check (checkResult is CheckResult<RolledOppositionResult>)
const duel = alice
  .makeCheck('Do Anything')
  .againstCharacter(guard, 'Block', (def) => def.withModifier('Shield', 1))
  .roll(new StubDiceRoller([4, 2, 3]));

// 3. Remove status strictly by ID
alice = alice.removeStatus(cleanShoe.id);

// 4. Discriminated SkillSlotSummary & terminal ClaimableAdvancement
const slots = SkillSlotConfig.triangle({ allowSlotPurchase: true });
const summary = check.character.getSkillSlotSummary(2, slots);
if (summary.kind === 'capped') {
  console.log(summary.usedSlots, summary.maxSlots, summary.availableSlots, summary.nextSlotXpCost);
}

const claimed = check.character.advance('Parkour').withSlotConfig(slots).claim();
```

---

## 3. Public Interface Reference

All public symbols exported by [`src/character/index.ts`](./index.ts):

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
  constructor(props: { readonly id?: string; readonly name: string; readonly level: number; readonly parentSkillId?: string });
}

export class Status {
  readonly id: string;
  readonly name: string;
  readonly rating: number;
  readonly note?: string;
  static create(name: string, rating: number, options?: { readonly id?: string; readonly note?: string }): Status;
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
}

export class CappedSkillSlotSummary {
  readonly kind: 'capped';
  readonly level: number;
  readonly maxSlots: number;
  readonly usedSlots: number;
  readonly effectivePurchasedSlots: number;
  readonly nextSlotXpCost: number | null;
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
  readonly xp: number;
  readonly skills: readonly Skill[];
  readonly pendingAdvancement: PendingAdvancement | null;
  readonly statuses: readonly Status[];
  readonly purchasedSlots: Readonly<Record<number, number>>;
  readonly portrait?: string;

  static create(name: string, options?: CharacterCreateOptions): Character;
  static deserialize(serialized: string): Character;

  skill(idOrName: string): Skill;
  addSkill(
    name: string,
    level: number,
    options?: { readonly parentSkillId?: string; readonly slotConfig?: SkillSlotConfig | null; readonly replaceSkillIdOrName?: string },
  ): Character;
  withPortrait(portrait: string | null): Character;
  addStatus(status: Status): Character;
  removeStatus(statusId: string): Character;
  getSkillSlotSummary(level: number, slotConfig?: SkillSlotConfig | null): SkillSlotSummary;
  purchaseSkillSlot(level: number, slotConfig: SkillSlotConfig): Character;
  makeCheck(skillIdOrName: string): CharacterCheckBuilder;
  advance(newSkillName: string): CharacterAdvancementBuilder;
  dismissAdvancement(): Character;
  serialize(): string;
}

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
