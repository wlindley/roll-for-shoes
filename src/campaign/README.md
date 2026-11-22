# Module 4: Campaign & Storage (`src/campaign`)

Framework-agnostic TypeScript module providing the immutable `Campaign` and `Workspace` aggregates, generic fluent traversal scopes (`workspace.activeCampaign.character('Alice').makeCheck(...)`), campaign-level rule enforcement and roll history logging, versioned JSON backup import/export, and pluggable `StorageAdapter` persistence.

---

## 1. What It Is

`src/campaign` is the top-level domain layer of Roll for Shoes ([`reference/rules.md`](../../reference/rules.md)), coordinating multi-character tabletop play and workspace persistence without any UI or framework coupling:

- **Multi-Character `Campaign` Aggregate ([`campaign.ts`](./campaign.ts))**: Manages campaign metadata (`id`, `name`, optional `description`, `createdAt`, `updatedAt`), per-campaign rule toggles (`CampaignRulesConfig`, defaulting to `BASIC_CAMPAIGN_RULES`), an immutable roster of unique `Character` instances, and a newest-first `rollLog` (`readonly CampaignRollLogEntry[]`) capturing single-character and character-vs-character opposed checks.
- **Multi-Campaign `Workspace` Aggregate ([`workspace.ts`](./workspace.ts))**: Holds all user campaigns (`readonly Campaign[]`), tracks `activeCampaignId: string | null`, handles campaign creation, selection, replacement, deletion (with automatic active-campaign fallback), and versioned (`schemaVersion: 1`) serialization.
- **Generic Fluent Traversal Scopes ([`scopes.ts`](./scopes.ts), [`workspace.ts`](./workspace.ts))**:
  - `WorkspaceCampaignScope` binds a `Campaign` inside a `Workspace` so campaign edits (`rename`, `withDescription`, `withRules`, `addCharacter`, `removeCharacter`) return an updated `Workspace`.
  - `CampaignCharacterScope<TRoot>`, `ScopedCheckBuilder<TRoot>`, and `ScopedAdvancementBuilder<TRoot>` parameterize the return root (`{ readonly campaign: Campaign }` from `campaign.character(...)`, or `{ readonly workspace: Workspace; readonly campaign: Campaign }` from `workspace.activeCampaign.character(...)` / `workspace.campaign(...).character(...)`) while automatically forwarding `campaign.rules.tiesMode`, enforcing `campaign.rules.statusesEnabled`, forwarding `campaign.rules.skillSlots`, updating participant `Character` instances, and prepending `CampaignRollLogEntry` records.
- **Versioned JSON Serialization & Backup Import/Export ([`serialize.ts`](./serialize.ts))**: Exports standalone campaign backups (`campaign.exportJson()`) and rehydrates full domain object graphs (`Campaign.fromJson()`, `Workspace.deserialize()`, `Workspace.load()`), reconstructing live `Campaign`, `Character`, `SkillSlotConfig`, `CheckResult`, and `RolledPool` instances so computed getters continue to work after reload. Importing a duplicate campaign ID into a `Workspace` (`workspace.importCampaign(json)`) automatically assigns a fresh UUID via internal `Campaign.withFreshId()`.
- **Pluggable Persistence ([`storage.ts`](./storage.ts))**: Defines the narrow `StorageAdapter` interface (`load`, `save`, `clear`) with `LocalStorageAdapter` (for browser `localStorage` / `sessionStorage`) and `MemoryStorageAdapter` (for deterministic tests and ephemeral sessions).

### Position in the Module Dependency DAG

Per [`docs/architecture.md`](../../docs/architecture.md) and [`docs/interfaces.md`](../../docs/interfaces.md), cross-module imports follow a strict one-way downward DAG through public `index.ts` entrypoints:

```text
src/ui  ──▶  src/campaign  ──▶  src/character  ──▶  src/checks  ──▶  src/dice
```

- **Allowed imports**: [`../dice`](../dice/index.ts), [`../checks`](../checks/index.ts), and [`../character`](../character/index.ts) only.
- **Forbidden imports**: `src/campaign` never imports from `../ui` or `react`.
- **Boundary verification**: [`campaign.test.ts`](./campaign.test.ts) exercises [`index.ts`](./index.ts) end-to-end against real `src/character`, `src/checks`, `src/dice`, `MemoryStorageAdapter`, and `LocalStorageAdapter` implementations, stubbing **only** `StubDiceRoller`.

---

## 2. How to Use It

### Loading & Saving a `Workspace` (`LocalStorageAdapter` & `MemoryStorageAdapter`)

```ts
import { LocalStorageAdapter, MemoryStorageAdapter, Workspace } from '../campaign';

// Browser persistence (defaults to globalThis.localStorage under 'roll_for_shoes.workspace.v1')
const browserAdapter = new LocalStorageAdapter();
let workspace = await Workspace.load(browserAdapter); // Returns Workspace.empty() when storage is empty

workspace = workspace.createCampaign('Tavern Brawl');
await workspace.save(browserAdapter);

// In-memory persistence for tests or ephemeral sessions
const memoryAdapter = new MemoryStorageAdapter();
await workspace.save(memoryAdapter);
const restored = await Workspace.load(memoryAdapter);
await memoryAdapter.clear();
```

### Creating, Selecting, Renaming, Configuring Rules & Deleting Campaigns

```ts
import { SkillSlotConfig } from '../character';
import { Workspace } from '../campaign';

// Creating a campaign appends it and selects it as activeCampaignId
let ws = Workspace.empty()
  .createCampaign('Tavern Brawl')
  .createCampaign('Neon Heist', {
    description: 'Cyberpunk crew',
    rules: { tiesMode: 'twist', statusesEnabled: true },
  });

// Select by exact ID or trimmed case-insensitive name
ws = ws.selectCampaign('tavern brawl');

// Mutate the active campaign immutably through WorkspaceCampaignScope
ws = ws.activeCampaign
  .rename('Grand Tavern Brawl')
  .activeCampaign.withDescription('Weekly one-shot')
  .activeCampaign.withRules({
    allowCustomStartingSkills: true,
    skillSlots: SkillSlotConfig.triangle({ allowSlotPurchase: true }),
  });

// Edit a specific campaign without changing activeCampaignId
ws = ws.campaign('Neon Heist').withDescription('Friday night heist');

// Safe nullable lookup for empty-state rendering (never throws)
const active = ws.tryGetActiveCampaign(); // Campaign | null

// Deleting the active campaign automatically selects remaining[0]?.id ?? null
ws = ws.deleteCampaign('Grand Tavern Brawl'); // 'Neon Heist' becomes active
```

### Fluent Checks, Rule Enforcement, Advancements & `rollLog`

```ts
import { StubDiceRoller } from '../dice';
import { DifficultyOpposition, DifficultyTier } from '../checks';
import { Character, SkillSlotConfig, Status } from '../character';
import { Workspace } from '../campaign';

const roller = new StubDiceRoller([4, 2, 5, 6]); // Use new RandomDiceRoller() in production

// 1. Configure campaign rules
let ws = Workspace.empty().createCampaign('Heist', {
  rules: {
    tiesMode: 'twist',
    statusesEnabled: true,
    allowCustomStartingSkills: true,
    skillSlots: SkillSlotConfig.triangle({ allowSlotPurchase: true }),
  },
});

// allowCustomStartingSkills: true permits characters built with extra starting skills
const ada = Character.builder('Ada').withStartingSkill('Hacking', 2).build();
ws = ws.activeCampaign.addCharacter(ada).activeCampaign.addCharacter('Bob');

// Apply arbitrary Character transforms (statuses, portraits, standalone slot purchases) via .update()
ws = ws.activeCampaign
  .character('Ada')
  .update((c) => c.addStatus(Status.create('Caffeinated', 2))).workspace;

// 2. Check vs. opposition:
// - Automatically forwards campaign.rules.tiesMode ('twist')
// - Enforces campaign.rules.statusesEnabled on .withStatus(...)
const check1 = ws.activeCampaign
  .character('Ada')
  .makeCheck('Hacking')
  .withAction('Bypass vault firewall')
  .withStatus('Caffeinated')
  .withModifier('Time pressure', -1)
  .against(new DifficultyOpposition(DifficultyTier.Moderate, 'static'))
  .roll(roller); // Ada rolls [4, 2] + 2 - 1 = 7 vs. 6 -> 'success'

ws = check1.workspace;

// 3. Opposed character-vs-character check (actor rolls first [5], defender rolls second [6]):
// Updates both characters in roster order and logs defender metadata
const check2 = ws.activeCampaign
  .character('Bob')
  .makeCheck('Do Anything')
  .withAction('Grapple guard')
  .againstCharacter('Ada', 'Do Anything', (defender) =>
    defender.withStatus('Caffeinated'),
  )
  .roll(roller); // Bob [5] = 5 vs. Ada [6] + 2 = 8 -> Bob fails (+1 XP), Ada rolls natural 6

ws = check2.workspace;

// 4. Claim advancement (automatically forwards campaign.rules.skillSlots;
//    chain .replacingSkill(...) or .purchasingSlot() when target-level slots are full)
const bobAdv = ws.activeCampaign
  .character('Bob')
  .advance('Brawling')
  .claim();

ws = bobAdv.workspace;

// 5. Read newest-first roll history (CheckResult & RolledPool getters remain live)
const latest = ws.activeCampaign.campaign.rollLog[0];
// latest?.kind === 'character_opposed'
// latest?.actionDescription === 'Grapple guard'
// latest?.checkResult.outcome === 'failure'
// latest?.actorXpEarned === 1 && latest?.defenderXpEarned === 0
```

### Exporting & Importing Campaign Backups (Duplicate-ID Collision Handling)

```ts
import { Campaign, Workspace } from '../campaign';

// Export a single campaign (metadata, rules, characters, and rollLog) as a JSON string
const backupJson = ws.activeCampaign.campaign.exportJson();

// Parse standalone Campaign directly
const standalone = Campaign.fromJson(backupJson);

// Import into a Workspace:
// 1st import preserves the original campaign.id and makes it active
let targetWs = Workspace.empty().importCampaign(backupJson);

// 2nd import detects the existing campaign.id collision, regenerates a fresh UUID
// via internal Campaign.withFreshId(), appends the copy, and makes the new copy active
targetWs = targetWs.importCampaign(backupJson);
// targetWs.campaigns.length === 2
// targetWs.campaigns[0].id !== targetWs.campaigns[1].id
```

---

## 3. Public Interface Reference

All public symbols below are exported from [`src/campaign/index.ts`](./index.ts). Every domain entity, scope, builder, array property, rules object, and log entry is deeply or shallowly frozen (`Object.freeze`) and preserves strict immutability (`next !== prev`).

### `CampaignRulesConfig` & `BASIC_CAMPAIGN_RULES`

```ts
export interface CampaignRulesConfig {
  readonly tiesMode: TiesMode;
  readonly statusesEnabled: boolean;
  readonly allowCustomStartingSkills: boolean;
  readonly skillSlots: SkillSlotConfig | null;
}

export const BASIC_CAMPAIGN_RULES: CampaignRulesConfig;
// Frozen default:
// {
//   tiesMode: 'fail',
//   statusesEnabled: false,
//   allowCustomStartingSkills: false,
//   skillSlots: null,
// }
```

| Field | Type | Rule Enforcement in `src/campaign` |
| :--- | :--- | :--- |
| `tiesMode` | [`TiesMode`](../checks/index.ts) (`'fail' \| 'twist'`) | Automatically forwarded to `CharacterCheckBuilder.withTiesMode(...)` inside `CampaignCharacterScope.makeCheck(...)`. |
| `statusesEnabled` | `boolean` | Checked by `ScopedCheckBuilder.withStatus(...)` (and defender `OpposedParticipantBuilder.withStatus(...)` in `againstCharacter`); throws if `false`. Situational `.withModifier(label, value)` remains allowed regardless. |
| `allowCustomStartingSkills` | `boolean` | Checked by `Campaign.addCharacter(...)` (and `WorkspaceCampaignScope.addCharacter(...)`); when `false`, rejects any `Character` possessing a skill other than `'Do Anything'` (`DEFAULT_STARTING_SKILL_NAME`). |
| `skillSlots` | [`SkillSlotConfig`](../character/index.ts) `\| null` | Automatically forwarded to `CharacterAdvancementBuilder.withSlotConfig(...)` inside `CampaignCharacterScope.advance(...)`; `null` means unrestricted slots per level. |

---

### `CampaignRollLogEntry`

```ts
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
```

- Created automatically when a scoped check resolves via `.against(...).roll(diceRoller)` (`kind: 'vs_opposition'`) or `.againstCharacter(...).roll(diceRoller)` (`kind: 'character_opposed'`).
- Prepended **newest-first** (`rollLog[0]` is the most recent roll).
- `defenderId`, `defenderName`, `defenderSkillName`, and `defenderXpEarned` are populated on `'character_opposed'` entries and `undefined` on `'vs_opposition'` entries.
- `checkResult` is always rehydrated as a real [`CheckResult`](../checks/index.ts) instance (with live `actor: RolledPool`, `opposition.pool?: RolledPool`, `margin`, and `outcome` getters) across serialization boundaries.

---

### `Campaign`

Immutable multi-character campaign aggregate ([`campaign.ts`](./campaign.ts)). Constructor is `private`; instantiate via `Campaign.create(...)` or `Campaign.fromJson(...)`.

```ts
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

  addCharacter(characterOrName: Character | string): Campaign;
  removeCharacter(idOrName: string): Campaign;
  replaceCharacter(character: Character): Campaign;
  findCharacter(idOrName: string): Character | undefined;

  character(idOrName: string): CampaignCharacterScope<{ readonly campaign: Campaign }>;

  exportJson(): string;
}
```

#### Static Methods & Instance Methods
- **`Campaign.create(name, options?)`**: Trims `name` and optional `options.id` (defaults to `crypto.randomUUID()`), normalizes `options.description` (whitespace-only becomes `undefined`), merges `options.rules` onto `BASIC_CAMPAIGN_RULES`, sets ISO-8601 `createdAt` / `updatedAt`, and starts with empty `characters` and `rollLog`.
  - `@throws {Error}` (`"Campaign name cannot be blank"`) if `name.trim()` is empty.
  - `@throws {Error}` (`"Campaign ID cannot be blank"`) if `options?.id` is provided and blank.
- **`Campaign.fromJson(campaignJson)`**: Parses and validates a `schemaVersion: 1` JSON backup string and reconstructs an immutable `Campaign` (including live `Character`, `SkillSlotConfig`, `CheckResult`, and `RolledPool` instances).
  - `@throws {Error | RangeError}` on malformed JSON, non-object payload, `schemaVersion !== 1`, blank `id` or `name`, invalid `rules.tiesMode`, invalid `rules.skillSlots` configuration, non-array or invalid `characters`, or invalid `rollLog` entries (e.g., unknown `kind`).
- **`rename(name)`**: Returns a new `Campaign` with trimmed `name` and refreshed `updatedAt` (`createdAt` is preserved).
  - `@throws {Error}` (`"Campaign name cannot be blank"`) if `name.trim()` is empty.
- **`withDescription(description)`**: Returns a new `Campaign` with trimmed `description`, or `undefined` if `description` is empty/whitespace.
- **`withRules(rulesPatch)`**: Shallow-merges `rulesPatch` over `this.rules` and returns a new `Campaign`.
- **`addCharacter(characterOrName)`**: Accepts a `Character` instance or creates a default character via `Character.create(characterOrName)` (`0 XP`, `Do Anything 1`), appending it to `this.characters`.
  - `@throws {Error}` (`"Character name cannot be blank"`) if `characterOrName` is a blank string.
  - `@throws {Error}` (`"Custom starting skills are disabled in this campaign"`) if `!this.rules.allowCustomStartingSkills` and the character has any skill whose `name !== 'Do Anything'`.
  - `@throws {Error}` (`"Duplicate character in campaign: <name>"`) if a character in `this.characters` already has the same `id` or case-insensitive `name`.
- **`removeCharacter(idOrName)`**: Removes the character matching exact `id` or trimmed case-insensitive `name`.
  - `@throws {Error}` (`"Character not found: <idOrName>"`) if no matching character exists.
- **`replaceCharacter(character)`**: Replaces the character matching exact `character.id` in place, preserving roster order.
  - `@throws {Error}` (`"Character not found: <character.id>"`) if `character.id` is not in `this.characters`.
- **`findCharacter(idOrName)`**: Returns the `Character` matching exact `id` or trimmed case-insensitive `name`, or `undefined` if absent.
- **`character(idOrName)`**: Returns a `CampaignCharacterScope<{ readonly campaign: Campaign }>` bound to this campaign and matching character.
  - `@throws {Error}` (`"Character not found: <idOrName>"`) if no matching character exists.
- **`exportJson()`**: Serializes the campaign (`schemaVersion: 1`) to a JSON string.

> **Internal Package Helpers (`@internal`)**: `Campaign.rehydrate(...)`, `campaign.withFreshId()`, `campaign.requireCharacter(idOrName)`, and `campaign.recordRoll(updated, entry)` are marked `@internal` for intra-module coordination across `workspace.ts`, `scopes.ts`, and `serialize.ts` (for example, `Workspace.importCampaign` uses `withFreshId()` to resolve campaign ID collisions). External callers should use the public API above.

---

### `Workspace`

Immutable multi-campaign root container ([`workspace.ts`](./workspace.ts)). Constructor is `private`; instantiate via `Workspace.empty()`, `Workspace.deserialize(...)`, or `Workspace.load(...)`.

```ts
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
  selectCampaign(idOrName: string): Workspace;
  deleteCampaign(idOrName: string): Workspace;
  replaceCampaign(campaign: Campaign): Workspace;

  tryGetActiveCampaign(): Campaign | null;
  get activeCampaign(): WorkspaceCampaignScope;
  campaign(idOrName: string): WorkspaceCampaignScope;

  serialize(): string;
  save(adapter: StorageAdapter): Promise<void>;
}
```

#### Static Methods, Getters & Instance Methods
- **`Workspace.empty()`**: Returns an empty workspace (`schemaVersion: 1`, `activeCampaignId: null`, `campaigns: []`).
- **`Workspace.deserialize(serialized)`**: Validates and reconstructs a `Workspace` from a `schemaVersion: 1` JSON string.
  - `@throws {Error | RangeError}` on invalid JSON, non-object payload, `schemaVersion !== 1`, non-array `campaigns`, any invalid campaign entry, or an `activeCampaignId` that is neither `null` nor a string matching one of `campaigns[i].id` (`"Invalid activeCampaignId"`).
- **`Workspace.load(adapter)`**: Awaits `adapter.load()`, returning `Workspace.empty()` when `null` or `Workspace.deserialize(raw)` otherwise.
  - `@throws {Error | RangeError}` if stored JSON fails `Workspace.deserialize` or if `adapter.load()` rejects.
- **`createCampaign(name, options?)`**: Creates a `Campaign` via `Campaign.create(name, options)`, appends it to `this.campaigns`, and sets `activeCampaignId` to the new campaign's `id`.
  - `@throws {Error}` (`"Campaign name cannot be blank"`) if `name.trim()` is empty.
- **`importCampaign(campaignJson)`**: Deserializes `campaignJson` via `Campaign.fromJson(campaignJson)`. If `this.campaigns` already contains `parsed.id`, regenerates a fresh UUID via internal `parsed.withFreshId()` (preserving name, description, timestamps, rules, characters, and `rollLog`). Appends the imported campaign and sets it as `activeCampaignId`.
  - `@throws {Error | RangeError}` on any invalid campaign JSON payload (same validation as `Campaign.fromJson`).
- **`selectCampaign(idOrName)`**: Sets `activeCampaignId` to the campaign matching exact `id` or trimmed case-insensitive `name`.
  - `@throws {Error}` (`"Campaign not found: <idOrName>"`) if no campaign matches.
- **`deleteCampaign(idOrName)`**: Removes the campaign matching exact `id` or trimmed case-insensitive `name`. When the deleted campaign was active, `activeCampaignId` falls back to `remaining[0]?.id ?? null`; otherwise `activeCampaignId` is unchanged.
  - `@throws {Error}` (`"Campaign not found: <idOrName>"`) if no campaign matches.
- **`replaceCampaign(campaign)`**: Replaces the campaign matching exact `campaign.id` in place, preserving list order and `activeCampaignId`.
  - `@throws {Error}` (`"Campaign not found: <campaign.id>"`) if `campaign.id` is not in `this.campaigns`.
- **`tryGetActiveCampaign()`**: Returns the active `Campaign`, or `null` when `activeCampaignId` is `null` (never throws).
- **`get activeCampaign()`**: Computed getter returning a `WorkspaceCampaignScope` for the active campaign.
  - `@throws {Error}` (`"No active campaign in workspace"`) when `tryGetActiveCampaign()` is `null`.
- **`campaign(idOrName)`**: Returns a `WorkspaceCampaignScope` for any campaign matched by exact `id` or trimmed case-insensitive `name` without changing `activeCampaignId`.
  - `@throws {Error}` (`"Campaign not found: <idOrName>"`) if no campaign matches.
- **`serialize()`**: Serializes `{ schemaVersion: 1, activeCampaignId, campaigns }` to a JSON string.
- **`save(adapter)`**: Persists `this.serialize()` via `await adapter.save(...)`.

*(Note: `Workspace.rehydrate(...)` is `@internal` for [`serialize.ts`](./serialize.ts).)*

---

### `WorkspaceCampaignScope`

Fluent campaign scope bound to a parent `Workspace` ([`workspace.ts`](./workspace.ts)). Every mutation delegates to `this.campaign` and returns a new `Workspace` via `workspace.replaceCampaign(...)`.

```ts
export class WorkspaceCampaignScope {
  readonly campaign: Campaign;

  constructor(workspace: Workspace, campaign: Campaign);

  rename(name: string): Workspace;
  withDescription(description: string): Workspace;
  withRules(rulesPatch: Partial<CampaignRulesConfig>): Workspace;
  addCharacter(characterOrName: Character | string): Workspace;
  removeCharacter(idOrName: string): Workspace;

  character(
    idOrName: string,
  ): CampaignCharacterScope<{ readonly workspace: Workspace; readonly campaign: Campaign }>;
}
```

- **`rename` / `withDescription` / `withRules` / `addCharacter` / `removeCharacter`**: Mirror the corresponding `Campaign` methods (and their `@throws` conditions), returning the updated `Workspace`.
- **`character(idOrName)`**: Resolves the character by exact `id` or trimmed case-insensitive `name` and enters a `CampaignCharacterScope` whose terminal calls return `{ readonly workspace: Workspace; readonly campaign: Campaign }` (merged with `{ readonly outcome }` or `{ readonly advancement }` where applicable).
  - `@throws {Error}` (`"Character not found: <idOrName>"`) if no matching character exists in `this.campaign`.

---

### `CampaignCharacterScope<TRoot>`

Generic character scope ([`scopes.ts`](./scopes.ts)) bridging either `Campaign.character(...)` (`TRoot = { readonly campaign: Campaign }`) or `WorkspaceCampaignScope.character(...)` (`TRoot = { readonly workspace: Workspace; readonly campaign: Campaign }`).

```ts
export class CampaignCharacterScope<TRoot> {
  readonly character: Character;

  constructor(
    campaign: Campaign,
    character: Character,
    wrap: (nextCampaign: Campaign) => TRoot,
  );

  update(transform: (character: Character) => Character): TRoot;
  makeCheck(skillIdOrName: string): ScopedCheckBuilder<TRoot>;
  advance(newSkillName: string): ScopedAdvancementBuilder<TRoot>;
  dismissAdvancement(): TRoot;
}
```

- **`update(transform)`**: Applies `transform(this.character)`, replaces the character in `campaign`, and returns `TRoot`. Use for `addStatus`, `removeStatus`, `withPortrait`, `addSkill`, or standalone `purchaseSkillSlot`.
  - `@throws` any error thrown by `transform`, or `Error` (`"Character not found: ..."`) if `transform` returns a character with an unknown `id`.
- **`makeCheck(skillIdOrName)`**: Looks up `skillIdOrName` on `this.character` and returns a `ScopedCheckBuilder<TRoot>` pre-configured with `.withTiesMode(campaign.rules.tiesMode)`.
  - `@throws {Error}` (`"Skill not found: <skillIdOrName>"`) if the skill does not exist on `this.character`.
- **`advance(newSkillName)`**: Returns a `ScopedAdvancementBuilder<TRoot>` pre-configured with `.withSlotConfig(campaign.rules.skillSlots)`.
- **`dismissAdvancement()`**: Clears `this.character.pendingAdvancement` to `null` (leaving XP and skills intact), replaces the character in `campaign`, and returns `TRoot`.

---

### `ScopedCheckBuilder<TRoot>`

Immutable fluent check builder within a campaign scope ([`scopes.ts`](./scopes.ts)).

```ts
export class ScopedCheckBuilder<TRoot> {
  constructor(
    campaign: Campaign,
    actorId: string,
    wrap: (nextCampaign: Campaign) => TRoot,
    checkBuilder: CharacterCheckBuilder,
    actionDescription?: string,
  );

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
```

- **`withAction(description)`**: Attaches `description` to both any resulting `PendingAdvancement` and the recorded `CampaignRollLogEntry`.
- **`withStatus(statusIdOrName)`**: Adds the actor's matching `Status` (`{ label: status.name, value: status.rating }`) as a modifier on the check.
  - `@throws {Error}` (`"Statuses are disabled in this campaign"`) if `!campaign.rules.statusesEnabled`.
  - `@throws {Error}` (`"Status not found: <statusIdOrName>"`) if the actor does not have the status.
- **`withModifier(label, value)`**: Appends an ad-hoc situational modifier (`{ label, value }`) regardless of `statusesEnabled`.
- **`against(opposition)`**: Binds any polymorphic [`CheckOpposition`](../checks/index.ts) (`StaticOpposition`, `RolledOpposition`, `DifficultyOpposition`). Calling `.roll(diceRoller)`:
  1. Rolls the actor's skill pool first and `opposition.resolve(diceRoller)` second.
  2. Updates the actor in `campaign` (`+1 XP` on `'failure'`, updating `pendingAdvancement`) and prepends a `'vs_opposition'` `CampaignRollLogEntry` to `campaign.rollLog`.
  3. Returns frozen `TRoot & { readonly outcome: CharacterCheckOutcome }`.
  - `.roll(diceRoller)` `@throws {RangeError | Error}` if `diceRoller` or `opposition.resolve(diceRoller)` fails (e.g., exhausted `StubDiceRoller`).
- **`againstCharacter(defenderIdOrName, defenderSkillIdOrName, configureDefender?)`**: Resolves an opposed check against another character in the same campaign. Calling `.roll(diceRoller)`:
  1. Rolls the actor's skill dice first and the defender's skill dice second.
  2. Updates **both** actor and defender in `campaign.characters` (preserving roster order) and prepends a `'character_opposed'` `CampaignRollLogEntry` to `campaign.rollLog`.
  3. Returns frozen `TRoot & { readonly outcome: OpposedCharacterCheckOutcome }`.
  - `@throws {Error}` (`"Character not found: <defenderIdOrName>"`) if the defender is not in `campaign`.
  - `@throws {Error}` (`"Character cannot oppose themselves: <defender.name>"`) if `defender.id === actorId`.
  - `@throws {Error}` (`"Skill not found: <defenderSkillIdOrName>"`) if the defender lacks the skill.
  - `@throws {Error}` (`"Statuses are disabled in this campaign"` / `"Status not found: ..."`) if `configureDefender` calls `b.withStatus(...)` when statuses are disabled or missing on the defender.
  - `.roll(diceRoller)` `@throws {RangeError | Error}` if `diceRoller` fails (e.g., exhausted `StubDiceRoller`).

---

### `ScopedAdvancementBuilder<TRoot>`

Immutable fluent skill-advancement builder within a campaign scope ([`scopes.ts`](./scopes.ts)), pre-bound to `campaign.rules.skillSlots`.

```ts
export class ScopedAdvancementBuilder<TRoot> {
  constructor(
    campaign: Campaign,
    wrap: (nextCampaign: Campaign) => TRoot,
    advancementBuilder: CharacterAdvancementBuilder,
  );

  replacingSkill(skillIdOrName: string): ScopedAdvancementBuilder<TRoot>;
  purchasingSlot(): ScopedAdvancementBuilder<TRoot>;
  claim(): TRoot & { readonly advancement: AdvancementOutcome };
}
```

- **`replacingSkill(skillIdOrName)`**: Configures the advancement to replace an existing skill of the same `targetLevel` when slots are full.
- **`purchasingSlot()`**: Configures the advancement to simultaneously purchase `+1` slot at `targetLevel` (for `2 * targetLevel` XP in addition to `xpCostToAdvance`).
- **`claim()`**: Claims the pending advancement, replaces the updated `Character` in `campaign`, and returns frozen `TRoot & { readonly advancement: AdvancementOutcome }`.
  - `@throws {Error}` (`"No pending advancement to claim"`) if `character.pendingAdvancement === null`.
  - `@throws {Error}` (`"SkillSlotConfig is required to purchase a slot"` / `"Skill slot purchase is disabled"`) if `.purchasingSlot()` was chained when `skillSlots` is `null` or `allowSlotPurchase === false`.
  - `@throws {Error}` (`"Insufficient XP to purchase level <targetLevel> slot"` / `"Insufficient XP to claim advancement"`) if XP cannot cover slot purchase and/or dice upgrades.
  - `@throws {Error}` (`"Skill name cannot be blank"` / `"Duplicate skill name: ..."`) if `newSkillName` is blank or duplicates a remaining skill.
  - `@throws {Error}` (`"Skill not found: ..."` / `"Cannot replace Do Anything"` / `"Replaced skill must be level <targetLevel>"`) if `.replacingSkill(...)` is invalid.
  - `@throws {Error}` (`"No available skill slots at level <targetLevel>"`) if `campaign.rules.skillSlots` caps `targetLevel` and no slot is open (without `.replacingSkill(...)` or `.purchasingSlot()`).

---

### `StorageAdapter`, `LocalStorageAdapter` & `MemoryStorageAdapter`

Pluggable asynchronous storage abstraction ([`storage.ts`](./storage.ts)) following the Interface Segregation and Dependency Inversion principles.

```ts
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
  constructor(value?: string | null);

  load(): Promise<string | null>;
  save(serializedWorkspace: string): Promise<void>;
  clear(): Promise<void>;
}
```

- **`StorageAdapter`**: Narrow 3-method async persistence contract consumed by `Workspace.load(adapter)` and `workspace.save(adapter)`.
- **`LocalStorageAdapter`**:
  - Defaults `options.key` to `'roll_for_shoes.workspace.v1'` and `options.storage` to `globalThis.localStorage` (accepts `sessionStorage` or any custom `getItem`/`setItem`/`removeItem` store).
  - `load()` returns `storage.getItem(key)` (`string | null`), `save(raw)` calls `storage.setItem(key, raw)`, and `clear()` calls `storage.removeItem(key)`.
  - `@throws` if `globalThis.localStorage` is unavailable when `options.storage` is omitted, or propagates underlying Web Storage errors (such as `QuotaExceededError` on `setItem` or `SecurityError` in restricted contexts).
- **`MemoryStorageAdapter`**:
  - Stores a single `string | null` value in memory (initialized to `value ?? null`).
  - Never touches browser globals; used in [`campaign.test.ts`](./campaign.test.ts) and non-persistent/ephemeral runtime modes.
