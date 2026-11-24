# Use Cases & Module Boundary Test Cases

This document specifies automated Vitest boundary test cases covering **every public class, factory, method, fluent builder, getter, discriminated union, and error condition** across 16 focused test suites in `dice`, `checks`, `character`, and `campaign` (`325` single-behavior tests, `100%` statement/branch/function/line coverage), plus manual verification scenarios for the untested `ui` module.

## Collaborator & Stubbing Policy

Every automated test imports solely through public `index.ts` entrypoints. **Only `DiceRoller` (`StubDiceRoller`, plus `RandomDiceRoller`'s optional byte-source callback inside `random-dice-roller.test.ts`) may be stubbed or faked.**

| Test Suites | Module Under Test | Real Production Collaborators Used | Permitted Test Double |
| :--- | :--- | :--- | :--- |
| `src/dice/{dice-roll,random-dice-roller}.test.ts` | `src/dice` | `DiceRoll`, `RandomDiceRoller`, `StubDiceRoller`, `isDieValue`, `assertPositiveInt`, `validateDiceValues` | Optional `RandomBytesSource` callback in `random-dice-roller.test.ts` |
| `src/checks/{rolled-pool,opposition,check,check-modifiers}.test.ts` | `src/checks` | `Check`, `ReadyCheck`, `RolledPool`, `StaticOpposition`, `RolledOpposition`, `DifficultyOpposition`, `CheckResult` + real `src/dice` | `StubDiceRoller` (`src/dice`) |
| `src/character/character-{creation,statuses,checks,advancement,slots,serialization}.test.ts` | `src/character` | `Character`, `Skill`, `Status`, `SkillSlotConfig`, check/advancement builders, snapshot mappers + real `src/checks` | `StubDiceRoller` (`src/dice`) |
| `src/campaign/{campaign-entity,workspace,campaign-scopes,campaign-persistence}.test.ts` | `src/campaign` | `Workspace`, `Campaign`, `rules`, scopes, `MemoryStorageAdapter`, `LocalStorageAdapter` + real `src/character` + real `src/checks` | `StubDiceRoller` (`src/dice`) |
| `src/ui/*` | `src/ui` | *(No automated test suite — verified via `tsc`, `vite build`, and manual `UI-*` scenarios)* | N/A |

---

## 1. Dice Module Boundary Cases (`src/dice/dice-roll.test.ts` & `src/dice/random-dice-roller.test.ts`)

| Case Group | Suite | Coverage & Invariants Verified |
| :--- | :--- | :--- |
| `DICE-01`..`03` | `dice-roll.test.ts` | `isDieValue` (`1..6` accepted; out-of-range, decimals, `NaN`, `Infinity`, non-numbers rejected), `assertPositiveInt`, `validateDiceValues`, and `DiceRoll` defensive copy/freeze + computed `total`. |
| `DICE-04`..`08` | `dice-roll.test.ts` | `StubDiceRoller` FIFO `roll(count)`, fluent `enqueue`, `remaining` getter, invalid face `RangeError` (atomic, non-mutating), invalid count `RangeError`, and queue exhaustion `Error`. |
| `DICE-09`..`11` | `random-dice-roller.test.ts` | Default `RandomDiceRoller` (`crypto.getRandomValues`), deterministic `RandomBytesSource` `< 252` rejection sampling, and upfront invalid-count `RangeError` without invoking `RandomBytesSource`. |

---

## 2. Check Resolution Boundary Cases (`src/checks/{rolled-pool,opposition,check,check-modifiers}.test.ts`)

| Case Group | Suite | Coverage & Invariants Verified |
| :--- | :--- | :--- |
| `CHK-POOL` | `rolled-pool.test.ts` | `RolledPool` defensive freezing, `rawTotal`, `modifierTotal`, `finalTotal` (including `<= 0`), `nonSixCount`, and `naturalAllSixes` invariance under positive/negative modifiers. |
| `CHK-OPP` | `opposition.test.ts` | `StaticOpposition` (`StaticOppositionResult`, 0 dice consumed), `RolledOpposition.withDice` / `RolledOpposition.fromDice` (`RolledOppositionResult`, modifiers, `withDiceValues`), and `DifficultyOpposition.static` (`StaticDifficultyOpposition`, `tier * 3`, omits `withDiceValues` at compile time) vs. `DifficultyOpposition.dynamic` (`DynamicDifficultyOpposition`, `tier`d6 or predetermined `withDiceValues`). |
| `CHK-CHECK` & `CHK-TIE` & `CHK-MAN` | `check.test.ts` | `Check.withDice` / `Check.fromDice`, `.withDiceValues`, `.withTiesMode('fail' \| 'twist')`, single-purpose terminal `ReadyCheck<TOpp>.resolve(diceRoller)`, actor-first / opposition-second roll ordering, and parameterized `CheckResult<TOpp>` narrowing (`result.opposition.pool` without optional chaining on rolled oppositions). |
| `CHK-STS` | `check-modifiers.test.ts` | Symmetric actor (`.withModifier`, `.withModifiers`) and opposition (`RolledOpposition`, `DifficultyOpposition`) modifiers, additive stacking, and `naturalAllSixes` / `nonSixCount` invariance. |

---

## 3. Character Module Boundary Cases (`src/character/character-*.test.ts`)

| Case Group | Suite | Coverage & Invariants Verified |
| :--- | :--- | :--- |
| `CHR-BASIC-01`..`06`, `CHR-START`, `CHR-PORTRAIT-01`..`02` | `character-creation.test.ts` | `Skill` validation, single canonical `Character.create(name, { id, portrait, startingSkills })` (`Do Anything 1` + custom starting skills, `portrait: null` normalization), `skill(idOrName)`, `addSkill`, and immutable `withPortrait`. |
| `CHR-STS-01`..`04` | `character-statuses.test.ts` | `Status.create`, `Status.roll` (`positive` / `negative`), `addStatus`, strict ID-only `removeStatus(statusId)` (disambiguating duplicate status names and rejecting display names), and check `.withStatus(...)` / defender `.withStatus(...)`. |
| `CHR-BASIC-07`..`13`, `20`..`23`, `CHR-TIE`, `CHR-MAN` | `character-checks.test.ts` | `character.makeCheck(skill)` -> `against(opposition)` / `againstCharacter(defender, skill, configureDefender?)` -> terminal `ReadyCharacterCheck` / `ReadyOpposedCharacterCheck.roll(roller)`, `+1 XP` on `'failure'`, `0 XP` on `'success'`/`'tie'`, `pendingAdvancement` eligibility, `dismissAdvancement()`, and actor/defender physical `withDiceValues`. |
| `CHR-BASIC-14`..`19` | `character-advancement.test.ts` | Natural all-`6`s `0 XP` advancement (including on failed checks), `1 XP` per non-`6` die upgrades, `ClaimableAdvancement` compile-time mutual exclusion between `replacingSkill` and `purchasingSlot`, and double-claim/validation errors preserving `pendingAdvancement`. |
| `CHR-SLOT-01`..`07` | `character-slots.test.ts` | `SkillSlotConfig.triangle`, `SkillSlotConfig.slotCostForLevel(level)` (`2 * level`), discriminated `SkillSlotSummary` (`UnrestrictedSkillSlotSummary` vs. `CappedSkillSlotSummary`), `.replacingSkill(...)`, standalone `purchaseSkillSlot`, and simultaneous `.purchasingSlot()`. |
| `CHR-BASIC-24`..`26`, `CHR-STS-05`, `CHR-SLOT-08`, `CHR-PORTRAIT-03` | `character-serialization.test.ts` | `character.serialize()` / `Character.deserialize()` and `toCharacterSnapshot` / `fromCharacterSnapshot` round-trips and exhaustive invalid-DTO error cases. |

---

## 4. Campaign & Workspace Boundary Cases (`src/campaign/*.test.ts`)

| Case Group | Suite | Coverage & Invariants Verified |
| :--- | :--- | :--- |
| `CMP-BASIC-01`..`02`, `CMP-START-01` | `campaign-entity.test.ts` | `Campaign.create`, `rename`, `withDescription`, `withRules`, single-way `addCharacter(character)` (`allowCustomStartingSkills` enforcement), strict ID-only `findCharacter(id)` & `removeCharacter(id)`, case-insensitive `findCharacterByName(name)`, and `replaceCharacter`. |
| `CMP-BASIC-06`..`07` | `workspace.test.ts` | `Workspace.empty()`, `createCampaign`, strict ID-only `selectCampaign(id)`, `deleteCampaign(id)`, and `campaign(id)` (including duplicate-named campaign disambiguation and display-name rejection), `replaceCampaign`, `tryGetActiveCampaign`, and `WorkspaceCampaignScope`. |
| `CMP-BASIC-03`..`05`, `CMP-TIE-01`, `CMP-STS-01`, `CMP-SLOT-01`, `CMP-MAN-01` | `campaign-scopes.test.ts` | `CampaignCharacterScope`, `ScopedCheckBuilder`, compositional `ScopedDefenderBuilder`, `ScopedAdvancementBuilder` / `ScopedClaimableAdvancement`, rule forwarding/enforcement (`tiesMode`, `statusesEnabled`, `skillSlots`), physical dice, and discriminated `CampaignRollLogEntry` (`VsOppositionRollLogEntry` vs. `CharacterOpposedRollLogEntry`) narrowing. |
| `CMP-BASIC-08`..`10`, `CMP-PORTRAIT-01` | `campaign-persistence.test.ts` | `MemoryStorageAdapter` & `LocalStorageAdapter`, symmetric `Campaign.serialize()` / `Campaign.deserialize()`, `Workspace.serialize()` / `Workspace.deserialize()` / `importCampaign` (duplicate-ID collision regeneration), and malformed Workspace/Campaign/`rollLog` DTO rejection. |

---

## 5. Manual Browser UI Scenarios (`UI-*`)

1. **`UI-01` (Multi-Campaign & Simultaneous Multi-Character Tracking)**: Create two campaigns (*"Tavern Brawl"* with 3 characters side-by-side and *"Cyberpunk"* with 2 characters). Switch between campaigns and reload the browser tab to confirm `localStorage` restores everything.
2. **`UI-02` (JSON Backup Export & Duplicate-Safe Import)**: Export a campaign `.json` via `Advanced Options` (`campaign.serialize()`), import it back into the workspace (`workspace.importCampaign()`), and verify duplicate campaign IDs receive a fresh ID cleanly.
3. **`UI-03` (Immediate Failure-XP Advancement)**: On a fresh character (`0 XP`, `Do Anything 1`), fail against static target `6` (`+1 XP`), spend `1 XP` to upgrade the die to `6`, and create a Level 2 skill while the roll log still shows the failed check.
4. **`UI-04` (Character-vs-Character Opposed Roll & Independent Statuses)**: Pit Character A against Character B with independent actor and defender status selections and verify both character cards update simultaneously in the grid.
5. **`UI-05` (Bob's Lost Shoe Full Walkthrough — `reference/rules.md`)**: Walk through Bob's `Climbing 3` Hard dynamic tie (`7` vs `7` -> Twist, `0 XP`), `-4 Raining` descent, `+2 Clean Shoe` bonus & removal, and `-3 Broken Nose` status.
6. **`UI-06` (Skill Triangle & Slot Leveling)**: Enable Skill Slots on a campaign, fill Level 2 slots (4/4), trigger a 5th Level 2 advancement, and test both replacing an existing Level 2 skill and enabling `allowSlotPurchase` to spend `4 XP` (`2 * 2`) for an extra slot.
7. **`UI-07` (Physical / Tabletop Dice Entry)**: Enable actor and/or opposition physical dice in `CheckRollerPanel`, select `1..6` faces across GM Dynamic Dice, Dynamic Difficulty, and Character Opposed modes, and verify check resolution, XP awards, advancement prompts, and roll history match the entered physical dice.
