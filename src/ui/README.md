# Module 5: Browser UI (`src/ui`)

Declarative React 19 + TypeScript browser user interface for **Roll for Shoes**, providing multi-campaign management, side-by-side character sheets with quota-safe portraits, interactive check resolution, post-roll skill advancement, persistent statuses, skill slots, JSON backup import/export, and Progressive Web App (PWA) installation.

---

## 1. What It Is

`src/ui` sits at the top of Roll for Shoes' strict one-way module dependency graph ([`../../docs/architecture.md`](../../docs/architecture.md)):

- **Top of the Downward Module DAG**: `src/ui` imports domain abstractions and entities exclusively through the public `index.ts` entrypoints of [`../dice`](../dice/index.ts), [`../checks`](../checks/index.ts), [`../character`](../character/index.ts), and [`../campaign`](../campaign/index.ts). Nothing in `src/*` ever imports from `src/ui`, and only [`../main.tsx`](../main.tsx) mounts [`./App.tsx`](./App.tsx) and loads [`./styles.css`](./styles.css).
- **Uses Domain Rules—Never Re-Implements Them**: Every component in `src/ui` is a thin, declarative view over immutable domain objects—invoking fluent domain builders (`campaign.character(id).makeCheck(...)`, `character.advance(...)`, `Character.create(...)`) and reading computed domain getters (`checkResult.outcome`, `checkResult.margin`, `actor.finalTotal`, `pending.xpCostToAdvance`, `summary.availableSlots`, `summary.nextSlotXpCost`).
- **High Cohesion & Narrow Props (ISP / Low Coupling)**:
  - Only [`./App.tsx`](./App.tsx) and [`./components/CampaignSidebar.tsx`](./components/CampaignSidebar.tsx) touch `Workspace`; [`./components/CharacterGrid.tsx`](./components/CharacterGrid.tsx) and [`./components/CheckRollerPanel.tsx`](./components/CheckRollerPanel.tsx) operate on `Campaign`, while leaf components (`RenameCampaignDialog`, `CampaignSettingsDialog`, `CreateCharacterDialog`, `CharacterCard`, `AdvancementPrompt`, `StatusManager`, `SkillSlotBar`) receive only the exact domain slice and narrow callbacks they need.
  - Shared leaf primitives—[`./error.ts`](./error.ts) (`formatError`), [`./components/ModalDialog.tsx`](./components/ModalDialog.tsx), [`./components/CharacterAvatar.tsx`](./components/CharacterAvatar.tsx), [`./components/DiceRow.tsx`](./components/DiceRow.tsx), and [`./components/RollSummary.tsx`](./components/RollSummary.tsx)—eliminate cross-sibling component imports and duplicated modal/error/roll-display boilerplate.
- **Unrepresentable Invalid UI States**:
  - `App.tsx` tracks campaign modals with a single `activeDialog: 'none' | 'rename' | 'rules'` union rather than competing booleans.
  - `PhysicalDiceInput` uses a single `value: readonly DieValue[] | null` prop (`null` = auto-rolled via `DiceRoller`, non-null = manual tabletop dice).
  - `CheckRollerPanel` models check setup via `ActorCheckState` + discriminated `OppositionFormState` (`'static' | 'rolled' | 'difficulty' | 'character'` with nested `'static' | 'dynamic'` difficulty and independent `actorStatusIds` vs. `defenderStatusIds`).

### Directory Layout

```text
src/ui/
├── README.md                            # Module 5 documentation (this file)
├── App.tsx                              # Root <App /> shell, activeDialog union & Workspace coordinator
├── error.ts                             # Shared formatError(err, fallback) helper
├── portrait-image.ts                    # <= 256×256 WebP/JPEG portrait encoder & initials helper
├── styles.css                           # Light/dark tokens, responsive grid, dialog & badge styles
└── components/
    ├── ActionMenu.tsx                   # Accessible WAI-ARIA dropdown menu primitive
    ├── AdvancementPrompt.tsx            # Post-roll skill advancement & slot replacement/purchase UI
    ├── AppIcon.tsx                      # Inline SVG sneaker-and-6d6 brand logo
    ├── CampaignSettingsDialog.tsx       # ModalDialog form for campaign rule toggles
    ├── CampaignSidebar.tsx              # Hideable campaign switcher, creator & JSON export/import
    ├── CharacterAvatar.tsx              # Shared 64×64 portrait <img> / initials fallback badge
    ├── CharacterCard.tsx                # Individual character sheet, portrait, skills & controls
    ├── CharacterGrid.tsx                # Multi-character responsive card grid & creation trigger
    ├── CheckRollerPanel.tsx             # Discriminated OppositionFormState check builder & live output
    ├── CreateCharacterDialog.tsx        # ModalDialog form for new characters & custom starting skills
    ├── DiceRow.tsx                      # Shared d6 face badge row (highlighting 6s)
    ├── InstallAppButton.tsx             # Standalone-aware PWA install button & live status region
    ├── ModalDialog.tsx                  # Native <dialog> primitive (showModal/close, Escape & light-dismiss)
    ├── PhysicalDiceInput.tsx            # Nullable-array 1..6 physical dice selectors & count normalizer
    ├── RenameCampaignDialog.tsx         # ModalDialog form for renaming the active campaign
    ├── RollHistoryLog.tsx               # Campaign-scoped chronological check history list
    ├── RollSummary.tsx                  # Shared outcome badge, twist banner & actor/opposition pool summary
    ├── SkillSlotBar.tsx                 # Per-level capped skill slot badges & XP slot purchasing
    └── StatusManager.tsx                # Character status badges & fixed/rolled status creator
```

---

## 2. How to Use It

### Mounting `<App />` in Production vs. Deterministic Sandboxes

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LocalStorageAdapter } from '../campaign';
import { RandomDiceRoller } from '../dice';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App diceRoller={new RandomDiceRoller()} storageAdapter={new LocalStorageAdapter()} />
  </StrictMode>,
);
```

In isolated sandboxes or demos, mount `<App />` with `StubDiceRoller` and `MemoryStorageAdapter`:

```tsx
import { Character } from '../character';
import { MemoryStorageAdapter, Workspace } from '../campaign';
import { StubDiceRoller } from '../dice';
import { App } from './App';

const storageAdapter = new MemoryStorageAdapter();
const seedWorkspace = Workspace.empty()
  .createCampaign('Heist at Midnight')
  .activeCampaign.addCharacter(Character.create('Alice'));

await seedWorkspace.save(storageAdapter);

<App diceRoller={new StubDiceRoller([6, 3, 4])} storageAdapter={storageAdapter} />;
```

### Verification Workflow

```bash
npm run typecheck  # Strict TypeScript check across all domain + React UI files
npm run build      # Typecheck + bundle production app & PWA service worker into dist/
npm test           # Run all 16 Vitest domain boundary test suites
```

---

## 3. Public & Component Interface Reference

### Root & Shared Utilities

- **[`App.tsx`](./App.tsx)**: `AppProps { readonly diceRoller: DiceRoller; readonly storageAdapter: StorageAdapter }` — loads `Workspace`, auto-saves via `commitWorkspace` / `commitCampaign`, manages `sidebarOpen` and `activeDialog: 'none' | 'rename' | 'rules'`, and wires narrow props to child views.
- **[`error.ts`](./error.ts)**: `formatError(err: unknown, fallback: string): string` — returns `err.message` when `err instanceof Error`, otherwise `fallback`.
- **[`portrait-image.ts`](./portrait-image.ts)**: `MAX_PORTRAIT_DIMENSION = 256`, `encodePortraitFile(file: File): Promise<string>`, `characterInitials(name: string): string`.

### Components (`./components/*.tsx`)

| Component | Props Contract | Key Responsibilities & Domain Calls |
| :--- | :--- | :--- |
| **[`ModalDialog`](./components/ModalDialog.tsx)** | `{ open: boolean; title: string; onClose: () => void; children: React.ReactNode }` | Native `<dialog>` lifecycle (`showModal` / `close`), `aria-labelledby`, `Escape` `onCancel`, `.dialog-body` backdrop light-dismiss, and header Close button. |
| **[`CharacterAvatar`](./components/CharacterAvatar.tsx)** | `{ name: string; portrait?: string \| null; alt?: string }` | Renders `64×64` portrait `<img>` or `characterInitials(name) \|\| '?'` fallback badge. |
| **[`DiceRow`](./components/DiceRow.tsx)** | `{ dice: readonly DieValue[] }` | Renders rolled `d6` badges, highlighting `6`s with `.die-six`. |
| **[`RollSummary`](./components/RollSummary.tsx)** | `{ title: string; checkResult: CheckResult; xpText: string; actionDescription?: string; timestamp?: string; showTwistBanner?: boolean }` | Renders outcome badge, signed `checkResult.margin`, optional `<time>` / action quote / twist banner, and discriminated `checkResult.opposition` (`kind === 'rolled'`) pool breakdown. |
| **[`ActionMenu`](./components/ActionMenu.tsx)** | `{ label: string; items: readonly ActionMenuItem[]; align?: 'left' \| 'right'; disabled?: boolean }` | WAI-ARIA menu button with `ArrowUp`/`ArrowDown`/`Home`/`End`/`Escape` roving focus and outside-click dismissal. |
| **[`AppIcon`](./components/AppIcon.tsx)** | *(none)* | Decorative `30×30` inline SVG sneaker-and-`6`d6 brand mark. |
| **[`InstallAppButton`](./components/InstallAppButton.tsx)** | *(none)* | Standalone-aware PWA install button (`navigator.install()` + `beforeinstallprompt`). |
| **[`CampaignSidebar`](./components/CampaignSidebar.tsx)** | `{ id: string; hidden: boolean; workspace: Workspace \| null; onClose: () => void; onChange: (next: Workspace) => void; onError: (message: string) => void }` | Switches/creates/deletes campaigns by ID (`selectCampaign`, `createCampaign`, `deleteCampaign`) and exports/imports `.json` backups (`campaign.serialize()`, `workspace.importCampaign()`). |
| **[`RenameCampaignDialog`](./components/RenameCampaignDialog.tsx)** | `{ open: boolean; currentName: string; onRename: (name: string) => void; onClose: () => void }` | `<ModalDialog>` form invoking `onRename(name)` with inline error banner. |
| **[`CampaignSettingsDialog`](./components/CampaignSettingsDialog.tsx)** | `{ open: boolean; campaignName: string; rules: CampaignRulesConfig; onSaveRules: (patch: Partial<CampaignRulesConfig>) => void; onClose: () => void }` | `<ModalDialog>` form configuring `tiesMode`, `SkillSlotConfig.triangle({ allowSlotPurchase })`, `statusesEnabled`, and `allowCustomStartingSkills`. |
| **[`CreateCharacterDialog`](./components/CreateCharacterDialog.tsx)** | `{ open: boolean; allowCustomStartingSkills: boolean; onAddCharacter: (character: Character) => void; onClose: () => void }` | `<ModalDialog>` form creating characters via `Character.create(name, { portrait, startingSkills })`. |
| **[`CharacterGrid`](./components/CharacterGrid.tsx)** | `{ campaign: Campaign; diceRoller: DiceRoller; selectedActorId: string \| null; onSelectActor: (id: string) => void; onCampaignChange: (next: Campaign) => void; onError: (msg: string) => void }` | Renders side-by-side `<CharacterCard>` sheets (`campaign.removeCharacter`, `campaign.character(id).update`) and `<CreateCharacterDialog>` (`campaign.addCharacter`). |
| **[`CharacterCard`](./components/CharacterCard.tsx)** | `{ character: Character; statusesEnabled: boolean; slotConfig: SkillSlotConfig \| null; diceRoller: DiceRoller; isSelected: boolean; onSelectForCheck: (id: string) => void; onRemove: (id: string) => void; onUpdateCharacter: (fn: (c: Character) => Character) => void; onError: (msg: string) => void }` | Displays `<CharacterAvatar>`, portrait upload/clear (`c.withPortrait`), XP, skill lineage, `<StatusManager>`, and `<SkillSlotBar>`. |
| **[`StatusManager`](./components/StatusManager.tsx)** | `{ character: Character; statusesEnabled: boolean; diceRoller: DiceRoller; onUpdateCharacter: (fn: (c: Character) => Character) => void; onError: (msg: string) => void }` | Renders active statuses (`c.removeStatus(s.id)`) and attaches fixed/rolled statuses (`Status.create`, `Status.roll`, `c.addStatus`). |
| **[`SkillSlotBar`](./components/SkillSlotBar.tsx)** | `{ character: Character; slotConfig: SkillSlotConfig; onPurchaseSlot: (level: number) => void; onError: (msg: string) => void }` | Displays `CappedSkillSlotSummary` (`summary.kind === 'capped'`) badges and triggers `c.purchaseSkillSlot(level, slotConfig)`. |
| **[`PhysicalDiceInput`](./components/PhysicalDiceInput.tsx)** | `{ label: string; diceCount: number; value: readonly DieValue[] \| null; onChange: (next: readonly DieValue[] \| null) => void }` | Single-prop nullable-array toggle + `1..6` `<select>` controls (`normalizePhysicalDice`). |
| **[`CheckRollerPanel`](./components/CheckRollerPanel.tsx)** | `{ campaign: Campaign; diceRoller: DiceRoller; selectedActorId: string \| null; onSelectActor: (id: string) => void; onCampaignChange: (next: Campaign) => void; onError: (msg: string) => void }` | Interactive check builder using `ActorCheckState` + discriminated `OppositionFormState` (`StaticOpposition`, `RolledOpposition.withDice`, `DifficultyOpposition.static` / `.dynamic`, and `againstCharacter` with independent actor/defender status & physical dice inputs) and `<RollSummary>`. |
| **[`AdvancementPrompt`](./components/AdvancementPrompt.tsx)** | `{ character: Character; pending: PendingAdvancement; slotConfig: SkillSlotConfig \| null; onUpdateCharacter: (fn: (c: Character) => Character) => void }` | Claims advancements via `c.advance(name).withSlotConfig(slotConfig)` (`.replacingSkill` / `.purchasingSlot` -> `.claim()`) or dismisses via `c.dismissAdvancement()`. |
| **[`RollHistoryLog`](./components/RollHistoryLog.tsx)** | `{ entries: readonly CampaignRollLogEntry[] }` | Renders chronological `CampaignRollLogEntry` cards (`VsOppositionRollLogEntry` & `CharacterOpposedRollLogEntry`) via `<RollSummary>`. |
