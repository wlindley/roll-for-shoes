# Module 4: Campaign & Storage (`src/campaign`)

Framework-agnostic TypeScript module providing the immutable `Campaign` and `Workspace` aggregates, centralized `CampaignRulesConfig` policy enforcement, generic fluent traversal scopes (`workspace.activeCampaign.character('Alice').makeCheck(...)`), discriminated `CampaignRollLogEntry` history, symmetric JSON serialization (`serialize` / `deserialize`), and pluggable `StorageAdapter` persistence.

---

## 1. What It Is

`src/campaign` is Layer 4 of Roll for Shoes ([`reference/rules.md`](../../reference/rules.md)), coordinating multi-character tabletop play and workspace persistence without any UI or framework coupling:

- **Multi-Character `Campaign` Aggregate ([`campaign.ts`](./campaign.ts))**: Manages campaign metadata (`id`, `name`, optional `description`, `createdAt`, `updatedAt`), per-campaign rule toggles (`CampaignRulesConfig` in [`rules.ts`](./rules.ts)), an immutable roster of `Character` instances (`addCharacter(character)`, strict `removeCharacter(characterId)`, `findCharacter(characterId)`, and `findCharacterByName(name)`), symmetric `campaign.serialize()` / `Campaign.deserialize(json)`, and a newest-first `rollLog` (`readonly CampaignRollLogEntry[]`).
- **Discriminated `CampaignRollLogEntry` ([`campaign.ts`](./campaign.ts))**: Distinguishes `VsOppositionRollLogEntry` (`kind: 'vs_opposition'`, `checkResult: CheckResult`, no `defender*` fields) from `CharacterOpposedRollLogEntry` (`kind: 'character_opposed'`, required `defenderId`, `defenderName`, `defenderSkillName`, `defenderXpEarned`, and `checkResult: CheckResult<RolledOppositionResult>`).
- **Multi-Campaign `Workspace` Aggregate ([`workspace.ts`](./workspace.ts))**: Holds `readonly Campaign[]`, enforces `activeCampaignId` membership in its private constructor, and targets campaigns strictly by exact `campaignId` across `selectCampaign(campaignId)`, `deleteCampaign(campaignId)`, and `campaign(campaignId)` so duplicate campaign names never collide.
- **Clean Compositional Scopes ([`scopes.ts`](./scopes.ts), [`rules.ts`](./rules.ts))**:
  - `CampaignCharacterScope<TRoot>` and `ScopedCheckBuilder<TRoot>` resolve character references ergonomically by ID or case-insensitive name (`findCharacter ?? findCharacterByName`) during play.
  - `ScopedDefenderBuilder` wraps `OpposedParticipantBuilder` via clean object composition (enforcing `assertStatusesEnabled(rules)` without prototype mutation hacks).
  - `ScopedAdvancementBuilder<TRoot>` transitions via `replacingSkill` or `purchasingSlot` to terminal `ScopedClaimableAdvancement<TRoot>` (`claim()` only).
- **Direct Snapshot Serialization & Pluggable Persistence ([`serialize.ts`](./serialize.ts), [`storage.ts`](./storage.ts))**: Uses `toCharacterSnapshot` / `fromCharacterSnapshot` from `../character` directly (zero double `JSON.parse`/`JSON.stringify` thrashing and zero leaked `@internal` `rehydrate` methods), backed by `StorageAdapter` (`LocalStorageAdapter` and `MemoryStorageAdapter`).

### Module Files

| File | Responsibility |
| :--- | :--- |
| [`./index.ts`](./index.ts) | Public module barrel re-exporting all public entities, scopes, types, and storage adapters. |
| [`./rules.ts`](./rules.ts) | `CampaignRulesConfig`, `BASIC_CAMPAIGN_RULES`, `assertAllowedStartingSkills`, and `assertStatusesEnabled`. |
| [`./campaign.ts`](./campaign.ts) | `Campaign`, `VsOppositionRollLogEntry`, `CharacterOpposedRollLogEntry`, and `CampaignRollLogEntry`. |
| [`./workspace.ts`](./workspace.ts) | `Workspace` and `WorkspaceCampaignScope`. |
| [`./scopes.ts`](./scopes.ts) | `ScopedDefenderBuilder`, `CampaignCharacterScope`, `ScopedCheckBuilder`, `ScopedAdvancementBuilder`, and `ScopedClaimableAdvancement`. |
| [`./serialize.ts`](./serialize.ts) | Validated `schemaVersion: 1` serialization/deserialization for `Campaign` and `Workspace`. |
| [`./storage.ts`](./storage.ts) | `StorageAdapter`, `LocalStorageAdapter`, and `MemoryStorageAdapter`. |
| [`./campaign-entity.test.ts`](./campaign-entity.test.ts) | Focused boundary tests for `Campaign` metadata, rules, and strict-ID / by-name roster methods. |
| [`./workspace.test.ts`](./workspace.test.ts) | Focused boundary tests for `Workspace`, `WorkspaceCampaignScope`, and duplicate-name ID disambiguation. |
| [`./campaign-scopes.test.ts`](./campaign-scopes.test.ts) | Focused boundary tests for `CampaignCharacterScope`, `ScopedCheckBuilder`, `ScopedAdvancementBuilder`, and `CampaignRollLogEntry` narrowing. |
| [`./campaign-persistence.test.ts`](./campaign-persistence.test.ts) | Focused boundary tests for `LocalStorageAdapter`, `MemoryStorageAdapter`, `Campaign`/`Workspace` JSON round-trips, and DTO validation. |

---

## 2. How to Use It

### Managing `Workspace`, `Campaign`, Fluent Checks & Backups

```ts
import { StubDiceRoller } from '../dice';
import { DifficultyOpposition, DifficultyTier } from '../checks';
import { Character, SkillSlotConfig, Status } from '../character';
import { Campaign, LocalStorageAdapter, Workspace } from '../campaign';

const adapter = new LocalStorageAdapter();
let ws = await Workspace.load(adapter);

ws = ws.createCampaign('Heist', {
  rules: {
    tiesMode: 'twist',
    statusesEnabled: true,
    allowCustomStartingSkills: true,
    skillSlots: SkillSlotConfig.triangle({ allowSlotPurchase: true }),
  },
});

const ada = Character.create('Ada', { startingSkills: [{ name: 'Hacking', level: 2 }] });
const bob = Character.create('Bob');

ws = ws.activeCampaign
  .addCharacter(ada)
  .activeCampaign.addCharacter(bob)
  .activeCampaign.character(ada.id)
  .update((c) => c.addStatus(Status.create('Caffeinated', 2))).workspace;

// Scoped check vs. opposition & character-opposed check
const check1 = ws.activeCampaign
  .character('Ada')
  .makeCheck('Hacking')
  .withStatus('Caffeinated')
  .against(DifficultyOpposition.static(DifficultyTier.Moderate))
  .roll(new StubDiceRoller([4, 2]));

const check2 = check1.workspace.activeCampaign
  .character('Bob')
  .makeCheck('Do Anything')
  .againstCharacter('Ada', 'Do Anything', (def) => def.withStatus('Caffeinated'))
  .roll(new StubDiceRoller([5, 6]));

const latest = check2.campaign.rollLog[0];
if (latest?.kind === 'character_opposed') {
  console.log(latest.defenderName, latest.defenderXpEarned, latest.checkResult.opposition.pool.rawDice);
}

// Symmetric Campaign JSON backup export/import
const backupJson = check2.campaign.serialize();
const standalone = Campaign.deserialize(backupJson);
const imported = check2.workspace.importCampaign(backupJson);
await imported.save(adapter);
```

---

## 3. Public Interface Reference

All public symbols exported by [`src/campaign/index.ts`](./index.ts):

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
  constructor(options?: { readonly key?: string; readonly storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> });
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
    options?: { readonly id?: string; readonly description?: string; readonly rules?: Partial<CampaignRulesConfig> },
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
    options?: { readonly description?: string; readonly rules?: Partial<CampaignRulesConfig> },
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
  character(idOrName: string): CampaignCharacterScope<{ readonly workspace: Workspace; readonly campaign: Campaign }>;
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
