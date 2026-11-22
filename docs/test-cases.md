# Use Cases & Module Boundary Test Cases

This document specifies automated Vitest boundary test cases covering **every public class, constructor, method, fluent builder, getter, and error condition** in `dice`, `checks`, `character`, and `campaign`, plus manual verification scenarios for the untested `ui` module.

## Collaborator & Stubbing Policy

Every automated test imports solely through public `index.ts` entrypoints. **Only `DiceRoller` (`StubDiceRoller`, plus `RandomDiceRoller`'s optional byte-source callback inside `dice.test.ts`) may be stubbed or faked.**

| Test Suite | Module Under Test | Real Production Collaborators Used | Permitted Test Double |
| :--- | :--- | :--- | :--- |
| `src/dice/dice.test.ts` | `src/dice` | `DiceRoll`, `RandomDiceRoller`, `StubDiceRoller`, `isDieValue` | Optional `RandomBytesSource` callback for deterministic byte-rejection testing |
| `src/checks/checks.test.ts` | `src/checks` | `Check`, `RolledPool`, `StaticOpposition`, `RolledOpposition`, `DifficultyOpposition`, `CheckResult` | `StubDiceRoller` (`src/dice`) |
| `src/character/character.test.ts` | `src/character` | `Character`, `Skill`, `Status`, `SkillSlotConfig`, builders + real `src/checks` | `StubDiceRoller` (`src/dice`) |
| `src/campaign/campaign.test.ts` | `src/campaign` | `Workspace`, `Campaign`, scopes, `MemoryStorageAdapter`, `LocalStorageAdapter` + real `src/character` + real `src/checks` | `StubDiceRoller` (`src/dice`) |
| `src/ui/*` | `src/ui` | *(No automated test suite — verified via `tsc`, `vite build`, and manual `UI-*` scenarios)* | N/A |

---

## 1. Dice Module Boundary Cases (`src/dice/dice.test.ts`)

### 1.1 `isDieValue` & `DiceRoll` (`[Commit 1]`)

| Case ID | Scenario | Inputs / Setup | Expected Outcome |
| :--- | :--- | :--- | :--- |
| `DICE-01` | `isDieValue` accepts integers `1..6` | `1, 2, 3, 4, 5, 6` | Returns `true` for all six values. |
| `DICE-02` | `isDieValue` rejects out-of-range, non-integer, and non-number values | `0`, `7`, `-1`, `3.5`, `NaN`, `Infinity`, `'6'`, `null`, `undefined` | Returns `false` for each value. |
| `DICE-03` | `DiceRoll` copies input array and computes `total` dynamically via getter | Mutate caller's input array after `new DiceRoll([2, 6, 4])` | `roll.dice` remains `[2, 6, 4]` (frozen/defensive copy) and `roll.total === 12`. |

### 1.2 `StubDiceRoller` (`[Commit 2]`)

| Case ID | Scenario | Inputs / Setup | Expected Outcome |
| :--- | :--- | :--- | :--- |
| `DICE-04` | `StubDiceRoller.roll(1)` and `roll(n)` consume values in FIFO order | `new StubDiceRoller([2, 6, 4, 1])`; call `roll(1)` then `roll(3)` | First returns `{ dice: [2], total: 2 }` (`remaining === 3`); second returns `{ dice: [6, 4, 1], total: 11 }` (`remaining === 0`). |
| `DICE-05` | `StubDiceRoller.enqueue()` appends fluently (`returns this`) | `new StubDiceRoller([1]).enqueue(6, 2).roll(3)` | Returns `DiceRoll` with `dice: [1, 6, 2]`, `total: 9`. |
| `DICE-06` | `StubDiceRoller` throws when queue is exhausted | `new StubDiceRoller([4])`, call `roll(2)` | Throws `Error` matching `/exhausted/i`. |
| `DICE-07` | `StubDiceRoller` rejects invalid `DieValue` in constructor or `enqueue` | Pass `0`, `7`, `2.5`, or `NaN` (via runtime cast) | Throws `RangeError` for each invalid face value. |
| `DICE-08` | `StubDiceRoller.roll()` rejects `count === 0`, negative `count`, decimal `count`, and `NaN` (separate assertions/cases) | `roll(0)`, `roll(-2)`, `roll(1.5)`, `roll(NaN)` | Each throws `RangeError` without consuming queued dice (`remaining` unchanged). |

### 1.3 `RandomDiceRoller` (`[Commit 3]`)

| Case ID | Scenario | Inputs / Setup | Expected Outcome |
| :--- | :--- | :--- | :--- |
| `DICE-09` | Default `RandomDiceRoller` (`crypto.getRandomValues`) produces valid single & multi-die `DiceRoll`s | Call `roll(1)` 50 times and `roll(5)` 50 times | Every face satisfies `isDieValue`, `dice.length` matches `count`, and `total` equals sum of `dice`. |
| `DICE-10` | Injected `RandomBytesSource` maps `< 252` via `(byte % 6) + 1` and retries bytes `>= 252` | Inject byte sequence `[255, 252, 0, 5, 251]`, call `roll(3)` | Skips `255` and `252`, maps `0 -> 1`, `5 -> 6`, `251 -> 6`, returning `dice: [1, 6, 6]`, `total: 13`. |
| `DICE-11` | `RandomDiceRoller.roll()` rejects `count === 0`, negative `count`, decimal `count`, and `NaN` (separate cases) | `roll(0)`, `roll(-1)`, `roll(2.2)`, `roll(NaN)` | Each throws `RangeError`. |

---

## 2. Check Resolution Boundary Cases (`src/checks/checks.test.ts`)

### 2.1 Static Checks & `RolledPool` Getters (`[Commit 4]`)

| Case ID | Scenario | Stubbed Dice | Fluent Call | Expected Outcome |
| :--- | :--- | :--- | :--- | :--- |
| `CHK-BASIC-01` | Static target success (`actor > target`) & single `opposition.total` threshold | `[4, 5]` | `Check.withDice(2).against(new StaticOpposition(6, 'Guard')).resolve(roller)` | `outcome: 'success'`, `actor.rawTotal: 9`, `actor.finalTotal: 9`, `opposition.total: 6`, `opposition.label: 'Guard'`, `opposition.pool: undefined`, `margin: 3`, `roller.remaining === 0`. |
| `CHK-BASIC-02` | Static target failure (`actor < target`) | `[2, 3]` | `Check.withDice(2).against(new StaticOpposition(6)).resolve(roller)` | `outcome: 'failure'`, `margin: -1`. |
| `CHK-BASIC-03` | Static target tie fails under Basic Rules (`tiesMode: 'fail'` default) | `[2, 4]` | `Check.withDice(2).against(new StaticOpposition(6)).resolve(roller)` | `outcome: 'failure'`, `margin: 0`, `tiesMode: 'fail'`. |
| `CHK-BASIC-04` | Actor single-die natural `6` getter detection | `[6]` | `Check.withDice(1).against(new StaticOpposition(3)).resolve(roller)` | `actor.naturalAllSixes: true`, `actor.nonSixCount: 0`. |
| `CHK-BASIC-05` | Actor multi-die natural all-`6`s detection (even when check fails) | `[6, 6]` | `Check.withDice(2).against(new StaticOpposition(15)).resolve(roller)` | `outcome: 'failure'`, `actor.naturalAllSixes: true`, `actor.nonSixCount: 0`. |
| `CHK-BASIC-06` | Actor mixed pool `nonSixCount` getter | `[6, 2, 6, 5]` | `Check.withDice(4).against(new StaticOpposition(10)).resolve(roller)` | `actor.naturalAllSixes: false`, `actor.nonSixCount: 2`. |
| `CHK-BASIC-07` | `Check.withDice()` rejects `0` | `[]` | `Check.withDice(0)` | Throws `RangeError`. |
| `CHK-BASIC-08` | `Check.withDice()` rejects negative integers | `[]` | `Check.withDice(-2)` | Throws `RangeError`. |
| `CHK-BASIC-09` | `Check.withDice()` rejects non-integers (`1.5`, `NaN`) | `[]` | `Check.withDice(1.5)` / `Check.withDice(NaN)` | Throws `RangeError`. |

### 2.2 Opposed Checks (`RolledOpposition`) & Symmetric Opponent Pool Tests (`[Commit 5]`)

| Case ID | Scenario | Stubbed Dice | Fluent Call | Expected Outcome |
| :--- | :--- | :--- | :--- | :--- |
| `CHK-BASIC-10` | Opposed roll success & deterministic roll order (actor rolled first, opponent second) | `[5, 6, 2, 3]` | `Check.withDice(2).against(new RolledOpposition(2)).resolve(roller)` | `actor.rawDice: [5, 6]` (`11`), `opposition.pool.rawDice: [2, 3]` (`opposition.total === 5`), `outcome: 'success'`, `margin: 6`. |
| `CHK-BASIC-11` | Opposed roll failure (`actor < opponent`) | `[1, 2, 4, 5]` | `Check.withDice(2).against(new RolledOpposition(2)).resolve(roller)` | `actor.finalTotal: 3`, `opposition.total: 9`, `outcome: 'failure'`, `margin: -6`. |
| `CHK-BASIC-12` | Opposed roll tie fails under Basic Rules | `[3, 4, 2, 5]` | `Check.withDice(2).against(new RolledOpposition(2)).resolve(roller)` | Both totals `7`, `outcome: 'failure'`, `margin: 0`. |
| `CHK-BASIC-13` | Opponent single-die natural `6` detection | `[3, 6]` | `Check.withDice(1).against(new RolledOpposition(1)).resolve(roller)` | `opposition.pool.naturalAllSixes: true`, `opposition.pool.nonSixCount: 0`. |
| `CHK-BASIC-14` | Opponent multi-die natural all-`6`s detection (including when opponent still loses!) | `[5, 5, 5, 6, 6]` | `Check.withDice(3).against(new RolledOpposition(2)).resolve(roller)` | Actor `15 > 12` (`outcome: 'success'`), `opposition.pool.naturalAllSixes: true`, `opposition.pool.nonSixCount: 0`. |
| `CHK-BASIC-15` | Opponent mixed pool `nonSixCount` calculation | `[4, 6, 2, 6, 5]` | `Check.withDice(1).against(new RolledOpposition(4)).resolve(roller)` | `opposition.pool.naturalAllSixes: false`, `opposition.pool.nonSixCount: 2`. |
| `CHK-BASIC-16` | `RolledOpposition` rejects `diceCount === 0` | `[]` | `new RolledOpposition(0)` | Throws `RangeError`. |
| `CHK-BASIC-17` | `RolledOpposition` rejects negative `diceCount` | `[]` | `new RolledOpposition(-1)` | Throws `RangeError`. |
| `CHK-BASIC-18` | `RolledOpposition` rejects non-integer `diceCount` (`2.5`, `NaN`) | `[]` | `new RolledOpposition(2.5)` / `new RolledOpposition(NaN)` | Throws `RangeError`. |

### 2.3 Difficulty Tiers (`1..4`) & Ties (`[Commit 20]`)

| Case ID | Scenario | Stubbed Dice | Fluent Call | Expected Outcome |
| :--- | :--- | :--- | :--- | :--- |
| `CHK-DIFF-01` | `DifficultyTier` integer values equal `1, 2, 3, 4` | *(none)* | Inspect `DifficultyTier.Easy .. VeryHard` | `Easy === 1`, `Moderate === 2`, `Hard === 3`, `VeryHard === 4`. |
| `CHK-DIFF-02` | `DifficultyOpposition` static mode (`tier * 3`: `3, 6, 9, 12`, default mode) | `[4]` x 4 | `new DifficultyOpposition(tier)` across all 4 tiers | Thresholds `opposition.total` are `3, 6, 9, 12`; `opposition.pool` is `undefined`; consumes 0 opposition dice. |
| `CHK-DIFF-03` | `DifficultyOpposition` dynamic mode rolls `1d6, 2d6, 3d6, 4d6` | Actor `[5]` + Hard `[2, 2, 3]` | `Check.withDice(1).against(new DifficultyOpposition(DifficultyTier.Hard, 'dynamic')).resolve(roller)` | Opposition rolls `3d6 = [2, 2, 3]` (`total: 7`), `outcome: 'failure'`, `margin: -2`. |
| `CHK-TIE-01` | Static target tie with `withTiesMode('twist')` (called before or after `.against()`) | `[3, 4]` | `Check.withDice(2).withTiesMode('twist').against(new StaticOpposition(7)).resolve(roller)` | `outcome: 'tie'`, `margin: 0`, `tiesMode: 'twist'`. |
| `CHK-TIE-02` | Dynamic difficulty tie with `'twist'` (Bob climbs wall: `7` vs `7`) | `[3, 4, 2, 2, 3]` | `Check.withDice(2).against(new DifficultyOpposition(DifficultyTier.Hard, 'dynamic')).withTiesMode('twist').resolve(roller)` | Actor `7`, opposition `7`, `outcome: 'tie'`, `margin: 0`. |
| `CHK-TIE-03` | Strict win and strict loss unaffected by `tiesMode: 'twist'` | `[5]`, `[2]` | Static `3` with `tiesMode: 'twist'` | Returns `'success'` and `'failure'` respectively. |

### 2.4 Symmetric Actor & Opponent Status Modifiers (`[Commit 23]`)

| Case ID | Scenario | Stubbed Dice | Fluent Call | Expected Outcome |
| :--- | :--- | :--- | :--- | :--- |
| `CHK-STS-01` | Actor negative penalty (`reference/rules.md` Bob Climbing 3 with `-4 Raining`) | `[3, 5, 6]` | `Check.withDice(3).withModifier('Raining', -4).against(new StaticOpposition(9)).resolve(roller)` | `actor.rawTotal: 14`, `actor.modifierTotal: -4`, `actor.finalTotal: 10`, `outcome: 'success'`, `actor.nonSixCount: 2`. |
| `CHK-STS-02` | Actor positive bonus turns failing raw roll into success (`+2 Clean Shoe`) | `[2, 3]` | `Check.withDice(2).withModifier('Clean Shoe', 2).against(new StaticOpposition(6)).resolve(roller)` | `actor.rawTotal: 5`, `actor.finalTotal: 7`, `outcome: 'success'`. |
| `CHK-STS-03` | Actor natural all-`6`s unaffected by negative penalty | `[6, 6]` | `Check.withDice(2).withModifier('Broken Nose', -3).against(new StaticOpposition(10)).resolve(roller)` | `actor.finalTotal: 9` (`'failure'`), **`actor.naturalAllSixes: true`**, **`actor.nonSixCount: 0`**. |
| `CHK-STS-04` | Actor positive bonus does NOT manufacture fake `6`s on `rawDice` | `[4, 4]` | `Check.withDice(2).withModifier('Inspired', 4).against(new StaticOpposition(10)).resolve(roller)` | `actor.finalTotal: 12` (`'success'`), **`actor.naturalAllSixes: false`**, **`actor.nonSixCount: 2`**. |
| `CHK-STS-05` | Multiple actor modifiers (`withModifiers`) combine additively (including negative `finalTotal`) | `[1]` | `Check.withDice(1).withModifiers([{ label: 'Rain', value: -4 }, { label: 'Grip', value: 1 }]).against(new StaticOpposition(1)).resolve(roller)` | `actor.modifierTotal: -3`, `actor.finalTotal: -2`, `margin: -3`, `outcome: 'failure'`. |
| `CHK-STS-06` | Opponent negative penalty reduces `opposition.total` (turning actor loss into success) | `[3, 5]` | `Check.withDice(1).against(new RolledOpposition(1).withModifier('Blinded', -3)).resolve(roller)` | Opponent `rawTotal: 5`, `modifierTotal: -3`, `opposition.total: 2`; actor `3 > 2` -> `outcome: 'success'`. |
| `CHK-STS-07` | Opponent positive bonus increases `opposition.total` (turning actor win into failure) | `[5, 4]` | `Check.withDice(1).against(new RolledOpposition(1).withModifier('Armored', 2)).resolve(roller)` | Opponent `rawTotal: 4`, `opposition.total: 6`; actor `5 < 6` -> `outcome: 'failure'`. |
| `CHK-STS-08` | Opponent natural all-`6`s unaffected by negative opponent penalty | `[5, 6, 6]` | `Check.withDice(1).against(new RolledOpposition(2).withModifier('Dazed', -8)).resolve(roller)` | `opposition.total: 4` (opponent loses `5 > 4`), **`opposition.pool.naturalAllSixes: true`**, **`opposition.pool.nonSixCount: 0`**. |
| `CHK-STS-09` | Opponent positive bonus does NOT manufacture fake `6`s on opponent `rawDice` | `[3, 4, 4]` | `Check.withDice(1).against(new RolledOpposition(2).withModifier('Boost', 4)).resolve(roller)` | `opposition.total: 12`, **`opposition.pool.naturalAllSixes: false`**, **`opposition.pool.nonSixCount: 2`**. |
| `CHK-STS-10` | Multiple opponent modifiers combine additively (including negative `opposition.total` and on `DifficultyOpposition`) | `[1, 2]` | `new DifficultyOpposition(DifficultyTier.Easy, 'dynamic', { modifiers: [{ label: 'Rusty', value: -5 }, { label: 'Oil', value: 1 }] })` | Opponent `rawTotal: 2`, `modifierTotal: -4`, `opposition.total: -2`; actor `1 > -2` -> `outcome: 'success'`. |
| `CHK-STS-11` | Simultaneous actor & opponent modifiers on the same opposed check | `[4, 5]` | Actor `+3`, Opponent `+1` | Actor `7` vs Opponent `6` -> `outcome: 'success'`, `margin: 1`. |

---

## 3. Character Module Boundary Cases (`src/character/character.test.ts`)

All tests use **real `src/checks`** and **`StubDiceRoller`**.

### 3.1 `Skill`, `Character` Creation & `addSkill` (`[Commit 6]`)

| Case ID | Scenario | Action & Preconditions | Expected Outcome |
| :--- | :--- | :--- | :--- |
| `CHR-BASIC-01` | `Character.create` & `Character.builder().withId()` defaults (`Rule 3`) | `Character.create('Bob')` and `Character.builder('Ada').withId('c-1').build()` | `xp === 0`, `skills` has `[Do Anything 1]`, `statuses: []`, `purchasedSlots: {}`, `pendingAdvancement: null`, custom ID respected. |
| `CHR-BASIC-02` | `character.skill(idOrName)` finds by exact ID or case-insensitive name and throws on unknown | Lookup `'do anything'` and `skill.id`, then `'Nonexistent'` | Both lookups return `Do Anything 1`; unknown throws `Error`. |
| `CHR-BASIC-03` | `character.addSkill` adds a valid skill (with optional `parentSkillId`) and returns a distinct `Character` | `const next = bob.addSkill('Cooking', 2, { parentSkillId: doAnything.id })` | `next !== bob`, `bob.skills.length === 1` (unmodified), `next.skills.length === 2` with `Cooking 2`. |
| `CHR-BASIC-04` | Blank character name or blank skill name rejected | `Character.create('   ')`, `bob.addSkill('  ', 2)` | Throws validation `Error`. |
| `CHR-BASIC-05` | Duplicate skill name (case-insensitive) rejected | `bob.addSkill('do anything', 2)` | Throws duplicate skill `Error`; `bob` unchanged. |
| `CHR-BASIC-06` | `Skill` / `addSkill` rejects `level === 0`, negative `level`, and non-integer `level` (separate cases) | `level: 0`, `level: -1`, `level: 1.5` | Each throws `RangeError`. |

### 3.2 `Character.makeCheck()` & `PendingAdvancement` Lifecycle (`[Commit 7]`)

| Case ID | Scenario | Stubbed Dice | Fluent Call | Expected Outcome |
| :--- | :--- | :--- | :--- | :--- |
| `CHR-BASIC-07` | Successful check with `0 XP` and non-`6` roll leaves `pendingAdvancement === null` | `[5]` | `bob.makeCheck('Do Anything').against(new StaticOpposition(3)).roll(roller)` | `outcome: 'success'`, `xpEarned: 0`, `character.xp === 0`, `canAdvance: false`, `character.pendingAdvancement === null`, `character !== bob`. |
| `CHR-BASIC-08` | Failed check awards `+1 XP` and creates `pendingAdvancement` when `xp >= nonSixCount` | `[2]` | `bob.makeCheck('Do Anything').withAction('Jump gap').against(new StaticOpposition(4)).roll(roller)` | `outcome: 'failure'`, `xpEarned: 1`, `character.xp === 1`, `canAdvance: true`, `pendingAdvancement.xpCostToAdvance === 1`, `pendingAdvancement.targetLevel === 2`, `actionDescription === 'Jump gap'`. |
| `CHR-BASIC-09` | Failed multi-die check where `xp < nonSixCount` awards `+1 XP` but leaves `pendingAdvancement === null` | `[2, 3]` | Bob (`0 XP`, `Climbing 2`) fails vs static `6` | `character.xp === 1`, `nonSixCount === 2` (`1 < 2`) -> `pendingAdvancement === null`, `canAdvance === false`. |
| `CHR-BASIC-10` | Natural all-`6`s creates `pendingAdvancement` with `xpCostToAdvance === 0` even at `0 XP` | `[6]` | `bob.makeCheck('Do Anything').against(new StaticOpposition(3)).roll(roller)` | `canAdvanceNaturally: true`, `canAdvance: true`, `pendingAdvancement.xpCostToAdvance === 0`, `pendingAdvancement.naturalAllSixes === true`. |
| `CHR-BASIC-11` | Rolling a higher-level skill rolls `skill.level` d6s | `[4, 5, 6]` | Bob (`Climbing 3`) rolls vs static `10` | Consumes 3 dice; `rawTotal === 15`. |
| `CHR-BASIC-12` | Consecutive ineligible check clears an earlier unclaimed `pendingAdvancement` to `null` | `[6]`, `[4]` | Roll `[6]` vs `3` (`pendingAdvancement !== null`), then without claiming roll `[4]` vs `3` (`0 XP`, ineligible) | Second check returns character with **`pendingAdvancement === null`** (prior unclaimed advancement cleared). |
| `CHR-BASIC-13` | `character.dismissAdvancement()` clears `pendingAdvancement` to `null` without changing XP or skills | `[2]` | Fail `[2]` vs `5` (`xp === 1`, `pendingAdvancement !== null`), call `const dismissed = afterRoll.dismissAdvancement()` | `dismissed !== afterRoll`, `afterRoll.pendingAdvancement !== null` (unmodified), `dismissed.pendingAdvancement === null`, `dismissed.xp === 1`. |

### 3.3 `Character.advance()` Skill Advancement (`[Commit 8]`)

| Case ID | Scenario | Stubbed Dice | Fluent Call | Expected Outcome |
| :--- | :--- | :--- | :--- | :--- |
| `CHR-BASIC-14` | Natural all-`6`s unlocks `level + 1` skill for `0 XP` (`Rule 4`) | `[6]` | Roll `[6]` vs `3` -> `.advance('Climbing').claim()` | `createdSkill` is `{ name: 'Climbing', level: 2, parentSkillId: doAnything.id }`, `diceUpgradeXpSpent: 0`, `totalXpSpent: 0`, `character.xp === 0`, `character.pendingAdvancement === null`. |
| `CHR-BASIC-15` | Natural all-`6`s on a **failed** roll grants **both** `+1 XP` AND `0 XP` advancement | `[6, 5, 5]` | Roll `Do Anything 1` vs `RolledOpposition(2)` (`6` vs `10`) -> `.advance('Parkour').claim()` | Check `xpEarned: 1`; after claiming `'Parkour'` (`level: 2`), `totalXpSpent === 0` and **`character.xp === 1`**. |
| `CHR-BASIC-16` | Immediate XP advancement right after failing (`Rule 6` & `Advancement`, line 18) | `[2]` | Start at `0 XP`; fail `[2]` vs `5` (`xp` becomes `1`) -> `.advance('Sneaking').claim()` | Spends `1 XP` (`xp === 0`), creates `'Sneaking'` (`level: 2`), while `checkResult.outcome` stays `'failure'`. |
| `CHR-BASIC-17` | Multi-die XP upgrade costs `1 XP` per non-`6` die (not pip difference) | `[2, 6, 1]` | Bob (`2 XP`, `Climbing 3`) rolls `[2, 6, 1]` vs `6` (`9 > 6` success) -> `.advance('Free Soloing').claim()` | `diceUpgradeXpSpent: 2`, `totalXpSpent: 2`, `character.xp === 0`, creates `'Free Soloing'` (`level: 4`). |
| `CHR-BASIC-18` | Calling `.advance().claim()` when `pendingAdvancement === null` (or claiming twice) throws | `[6]` | Claim once (`'Jumping'`), then call `.advance('Vaulting').claim()` on returned character | Throws `No pending advancement` error; returned character from first claim remains unmodified. |
| `CHR-BASIC-19` | Invalid/duplicate `newSkillName` on `.advance().claim()` throws and preserves `pendingAdvancement` | `[6]` | Roll `[6]` -> call `char.advance('Do Anything').claim()` | Throws duplicate skill error; `char.pendingAdvancement` is still intact so user can retry with a valid name. |

### 3.4 Character-vs-Character Opposed Checks (`[Commit 9]`)

| Case ID | Scenario | Stubbed Dice | Fluent Call | Expected Outcome |
| :--- | :--- | :--- | :--- | :--- |
| `CHR-BASIC-20` | Actor beats defender (`actor > defender`) | `[5, 2]` | `alice.makeCheck('Do Anything').againstCharacter(bob, 'Do Anything').roll(roller)` | `outcome: 'success'`, `actorXpEarned: 0` (`aliceAfter.xp === 0`), `defenderXpEarned: 1` (`bobAfter.xp === 1`, `bobAfter.pendingAdvancement !== null`), `aliceAfter !== alice`, `bobAfter !== bob`. |
| `CHR-BASIC-21` | Actor strictly loses to defender (`actor < defender`) | `[2, 5]` | `alice.makeCheck('Do Anything').againstCharacter(bob, 'Do Anything').roll(roller)` | `outcome: 'failure'`, `margin: -3`, `actorXpEarned: 1` (`aliceAfter.xp === 1`, `aliceAfter.pendingAdvancement !== null`), `defenderXpEarned: 0` (`bobAfter.xp === 0`). |
| `CHR-BASIC-22` | Basic Rules tie (`actor === defender`, `tiesMode: 'fail'`) | `[4, 4]` | `alice.makeCheck('Do Anything').againstCharacter(bob, 'Do Anything').roll(roller)` | `outcome: 'failure'`, `margin: 0`, `actorXpEarned: 1`, `defenderXpEarned: 0`. |
| `CHR-BASIC-23` | Both actor and defender receive independent `pendingAdvancement` when both qualify | `[2, 6]` | Alice (`0 XP`) rolls `[2]`, Bob (`0 XP`) rolls `[6]` | Alice fails (`xp: 1`, `xpCostToAdvance: 1` -> eligible!); Bob wins with natural `6` (`xp: 0`, `xpCostToAdvance: 0` -> eligible!); both can `.advance(...).claim()`. |

### 3.5 `Character` Serialization & Deserialization (`[Commit 10]`)

| Case ID | Scenario | Stubbed Dice | Action | Expected Outcome |
| :--- | :--- | :--- | :--- | :--- |
| `CHR-BASIC-24` | Round-trip with multiple skills, XP, and active `pendingAdvancement` preserves class methods & getters | `[3]` | Fail check (`xp: 1`, `pendingAdvancement !== null`) -> `char.serialize()` -> `Character.deserialize(json)` -> `.advance('Dodge').claim()` | Restored `Character` equals original, getters work, and `.advance('Dodge').claim()` succeeds cleanly. |
| `CHR-BASIC-25` | Round-trip when `pendingAdvancement === null` | *(none)* | `Character.deserialize(Character.create('Bob').addSkill('Run', 2).serialize())` | Restores skills, `xp === 0`, and `pendingAdvancement === null`. |
| `CHR-BASIC-26` | `Character.deserialize` rejects malformed JSON, unsupported `schemaVersion`, and invalid/missing fields | *(none)* | Pass `'{bad'`, `'{"schemaVersion":99}'`, `'{"schemaVersion":1,"name":""}'` | Each throws descriptive validation `Error`. |

### 3.6 Ties (`[Commit 21]`)

| Case ID | Scenario | Stubbed Dice | Fluent Call | Expected Outcome |
| :--- | :--- | :--- | :--- | :--- |
| `CHR-TIE-01` | Character tie with `withTiesMode('twist')` earns `0 XP` | `[3, 4]` | Bob (`0 XP`, `Climbing 2`) ties static `7` in `'twist'` mode | `outcome: 'tie'`, `xpEarned: 0`, `character.xp === 0`, `pendingAdvancement === null`. |
| `CHR-TIE-02` | Character can still advance on a `'tie'` when natural `6`s or enough banked XP | `[6, 3]` | Bob (`1 XP`, `Climbing 2`) ties static `9` in `'twist'` mode -> `.advance('Ledge Grab').claim()` | `xpEarned: 0`, `pendingAdvancement.xpCostToAdvance === 1` (`<= 1 XP`), spends `1 XP` to unlock `'Ledge Grab 3'`. |
| `CHR-TIE-03` | Character-vs-character opposed tie with `withTiesMode('twist')` | `[4, 4]` | `alice.makeCheck(...).againstCharacter(bob, ...).withTiesMode('twist').roll(roller)` | `outcome: 'tie'`, `actorXpEarned: 0`, `defenderXpEarned: 0`. |

### 3.7 `Status` & Character Status Methods (`[Commit 24]`)

| Case ID | Scenario | Stubbed Dice | Action | Expected Outcome |
| :--- | :--- | :--- | :--- | :--- |
| `CHR-STS-01` | `Status.create` & `Status.roll` (positive and negative polarities) | `[2, 4]`, `[3]` | `Status.create('Clean Shoe', 2)`, `Status.roll('Poisoned', 2, 'negative', roller)`, `Status.roll('Inspired', 1, 'positive', roller)` | Ratings are `2`, `-6`, and `+3`; blank name or `rating === 0` throws `Error`. |
| `CHR-STS-02` | `character.addStatus`, selective `.withStatus()` on checks, and `character.removeStatus` (by ID or name) | `[2, 3]`, `[2, 3]` | Add `+2 Clean Shoe` & `-3 Broken Nose` to Bob; roll `Karate 2` `.withStatus('Clean Shoe')` vs `6`; remove `'Clean Shoe'`; re-roll | First roll `5 + 2 = 7` (`'success'`); after `removeStatus`, only `-3 Broken Nose` remains (`next !== prev`); second roll `5 < 6` (`'failure'`); unknown status throws `Error`. |
| `CHR-STS-03` | Defender statuses & modifiers in `againstCharacter(..., b => b.withStatus(...).withModifier(...))` | `[5, 4]` | Alice rolls `5`; Bob rolls `4` with `+2 Shield` status | Bob's total `6 > 5` -> Alice fails (`+1 XP`), Bob wins (`+0 XP`). |
| `CHR-STS-04` | Status penalty causes check failure (`+1 XP`) while preserving natural all-`6`s `0 XP` advancement | `[6]` | Bob rolls `Do Anything 1` `.withModifier('Raining', -4)` vs static `3` | `finalTotal: 2 < 3` (`'failure'`, `xpEarned: 1`), `pendingAdvancement.xpCostToAdvance === 0`. |
| `CHR-STS-05` | Serialization round-trip preserves `statuses` | *(none)* | Add statuses -> `serialize()` -> `Character.deserialize()` | Deserialized character retains exact `Status` instances. |

### 3.8 Custom Starting Skills (`[Commit 26]`)

| Case ID | Scenario | Stubbed Dice | Action | Expected Outcome |
| :--- | :--- | :--- | :--- | :--- |
| `CHR-START-01` | `Character.builder(name).withStartingSkill(...)` adds starting skills alongside `Do Anything 1` | `[4, 5]` | `Character.builder('Ada').withStartingSkill('Hacking', 2).withStartingSkill('Pilot', 3).build()`, roll `Hacking` | Has 3 skills (`Do Anything 1`, `Hacking 2`, `Pilot 3`); rolling `Hacking` consumes 2 dice. |
| `CHR-START-02` | Rejects duplicate `'Do Anything'`, duplicate custom names, blank names, and invalid levels | *(none)* | `.withStartingSkill('do anything', 2)` or `level: 0` | Throws `Error` / `RangeError`. |

### 3.9 `SkillSlotConfig`, Slot Caps & Slot Purchasing (`[Commits 27–28]`)

| Case ID | Scenario | Stubbed Dice | Action | Expected Outcome |
| :--- | :--- | :--- | :--- | :--- |
| `CHR-SLOT-01` | `SkillSlotConfig` defaults (`allowSlotPurchase === false` non-optional; L1 unrestricted; L5 defaults to `1` when `allowSlotPurchase === false` and `0` when `true`) | *(none)* | Inspect `SkillSlotConfig.triangle()` vs `SkillSlotConfig.triangle({ allowSlotPurchase: true })` | `allowSlotPurchase` is `false` by default; `baseLimitForLevel(1) === null`, `baseLimitForLevel(2) === 4`, `baseLimitForLevel(5)` is `1` (`false`) vs `0` (`true`). |
| `CHR-SLOT-02` | Filling Level 2 up to cap (4/4) & verifying `SkillSlotSummary` getters | `[6]` x 4 | Advance `Do Anything 1` 4 times `.withSlotConfig(triangle)` | `getSkillSlotSummary(2, triangle)` has `maxSlots: 4, usedSlots: 4, availableSlots: 0, nextSlotXpCost: 4`. |
| `CHR-SLOT-03` | Rejects advancement (and `addSkill`) into full level without replacement or slot purchase, keeping `pendingAdvancement` intact | `[6]` | At 4/4 L2, roll `[6]` and call `.advance('5th').withSlotConfig(triangle).claim()` | Throws slot limit `Error`; `pendingAdvancement` remains intact on character. |
| `CHR-SLOT-04` | `.replacingSkill(idOrName)` replaces same-level skill and rejects wrong-level or `Do Anything 1` | `[6]` | At 4/4 L2, replace an L2 skill (succeeds), vs trying to replace `Do Anything 1` or an L3 skill (throws) | Valid replacement returns `replacedSkill` and keeps `usedSlots === 4`; invalid target throws `Error`. |
| `CHR-SLOT-05` | `purchasedSlots` do NOT apply when `allowSlotPurchase === false` | `[6]` | Buy +1 L2 slot under `allowSlotPurchase: true`, then evaluate `getSkillSlotSummary` & `.advance()` under `SkillSlotConfig.triangle({ allowSlotPurchase: false })` | `effectivePurchasedSlots === 0`, `maxSlots === 4` (5th L2 skill blocked unless replacing!). |
| `CHR-SLOT-06` | Standalone `character.purchaseSkillSlot(level, config)` spends `2 * level` XP and validates rules | `[6]` | With `6 XP` & `allowSlotPurchase: true`, call `purchaseSkillSlot(2, config)` (`xp -> 2`, `maxSlots -> 5`); also test `allowSlotPurchase: false`, `level: 1`, and insufficient XP | Valid purchase returns new `Character` (`next !== prev`) with `xp: 2`; invalid calls throw `Error`. |
| `CHR-SLOT-07` | Simultaneous `.purchasingSlot()` + dice XP upgrade in `.advance().claim()` | `[6, 6, 3]` | At 2/2 L4 with `9 XP`, roll L3 `[6, 6, 3]` vs `10` -> `.advance('Mastery').withSlotConfig(config).purchasingSlot().claim()` | `diceUpgradeXpSpent: 1`, `slotPurchaseXpSpent: 8`, `totalXpSpent: 9`, `character.xp === 0`, adds 3rd L4 skill. |
| `CHR-SLOT-08` | Serialization round-trip preserves `purchasedSlots` | *(none)* | Purchase L2 slot -> `serialize()` -> `Character.deserialize()` | `purchasedSlots` preserved identically. |

### 3.10 Character Portraits (`[Commit 33]`)

| Case ID | Scenario | Stubbed Dice | Action | Expected Outcome |
| :--- | :--- | :--- | :--- | :--- |
| `CHR-PORTRAIT-01` | `Character.create` & `Character.builder().withPortrait()` (`undefined` default, trimmed non-blank string, `null` clear, blank error, builder immutability) | *(none)* | Create with/without `portrait`, chain `withPortrait` / `withId` / `withStartingSkill`, pass `null` and `''` / `'   '` | `portrait` defaults to `undefined`, trims non-blank strings, clears to `undefined` on `null`, and throws `Error` on blank strings without mutating builders. |
| `CHR-PORTRAIT-02` | `character.withPortrait(portrait)` sets, replaces, and clears (`null`) immutably, survives state transitions, and rejects blank strings | `[2]` | Set/replace/clear `portrait`, run check/advancement/skill/status/slot updates, and pass `''` / `'   '` | Each `withPortrait` returns `next !== prev`; `portrait` persists across subsequent immutable `Character` updates; blank string throws `Error`. |
| `CHR-PORTRAIT-03` | `serialize()` / `Character.deserialize()` round-trips with & without `portrait` (including omitted legacy field) and rejects invalid `portrait` payloads | *(none)* | Serialize/deserialize with `portrait`, without `portrait`, with legacy JSON omitting `portrait`, and with `portrait: 123` / `null` / `''` / `'   '` | Preserves/trims valid `portrait` or `undefined`; throws `Error` when `portrait` is non-undefined and non-string or blank. |

---

## 4. Campaign & Workspace Boundary Cases (`src/campaign/campaign.test.ts`)

All tests use **real `src/character`**, **real `src/checks`**, **real `MemoryStorageAdapter` & `LocalStorageAdapter`**, and **`StubDiceRoller`**.

### 4.1 `Campaign` Entity & Fluent Scopes (`[Commits 11–12]`)

| Case ID | Scenario | Stubbed Dice | Action | Expected Outcome |
| :--- | :--- | :--- | :--- | :--- |
| `CMP-BASIC-01` | `Campaign.create`, `rename`, `withDescription`, `withRules` immutability & validation | *(none)* | Exercise each method + blank name check | Each returns a new `Campaign` (`next !== prev`), leaving original unchanged; blank name throws `Error`. |
| `CMP-BASIC-02` | `addCharacter`, `findCharacter`, `replaceCharacter`, `removeCharacter` | *(none)* | Add `'Alice'` & `Character.create('Bob')`, find/replace/remove, test duplicate/missing character errors | Roster updates immutably; missing character on `removeCharacter` / `character()` throws `Error`. |
| `CMP-BASIC-03` | `campaign.character('Alice').makeCheck('Do Anything').against(...).roll(roller)` | `[2]` | Alice fails check in campaign | Alice's `xp === 1` in returned `campaign`, `rollLog` has `'vs_opposition'` entry, Bob untouched. |
| `CMP-BASIC-04` | `campaign.character('Alice').makeCheck(...).againstCharacter('Bob', ...).roll(roller)` & self-opposition error | `[6, 3]` | Alice opposes Bob; also test `againstCharacter('Alice', ...)` | Updates both Alice and Bob in `campaign`, logs `'character_opposed'`; self-opposition throws `Error`. |
| `CMP-BASIC-05` | `campaign.character('Alice').advance('Lockpicking').claim()`, `.dismissAdvancement()`, and `.update(fn)` | `[6]` | Exercise all three methods on `CampaignCharacterScope` | Each returns updated immutable `Campaign` with updated `Alice`. |

### 4.2 `Workspace` & Pluggable Persistence (`[Commits 13–14]`)

| Case ID | Scenario | Stubbed Dice | Action | Expected Outcome |
| :--- | :--- | :--- | :--- | :--- |
| `CMP-BASIC-06` | `Workspace.empty()`, `createCampaign`, `selectCampaign`, `deleteCampaign`, `tryGetActiveCampaign`, and `activeCampaign` error when empty | *(none)* | Manage `'Heist'` & `'Sci-Fi'` campaigns; delete active campaign; call `Workspace.empty().activeCampaign` | Campaigns stay isolated; `Workspace.empty().tryGetActiveCampaign() === null`; `Workspace.empty().activeCampaign` throws `Error`. |
| `CMP-BASIC-07` | End-to-end fluent traversal: `workspace.activeCampaign.character('Alice').makeCheck(...).against(...).roll(roller)` & `.advance(...).claim()` | `[2]` | Fail roll via `workspace.activeCampaign`, then claim `'Sneaking'` via `nextWorkspace.activeCampaign`, plus `workspace.campaign('Sci-Fi')` | Returns updated `Workspace` (`next !== prev`) with Alice at `0 XP` and `'Sneaking 2'`. |
| `CMP-BASIC-08` | `MemoryStorageAdapter` (`save`, `load`, `clear`, and empty load) | `[2]` | Populate multi-campaign `Workspace` -> `await ws.save(mem)` -> `await Workspace.load(mem)` -> `await mem.clear()` -> `await Workspace.load(mem)` | Restores identical `Workspace` with working class methods; after `clear()`, `Workspace.load(mem)` returns empty `Workspace`. |
| `CMP-BASIC-09` | `LocalStorageAdapter` (default key & custom key, `save`, `load`, `clear`) | `[6]` | Pass real Web `Storage` instance to `LocalStorageAdapter` -> `ws.save(local)` -> fresh `LocalStorageAdapter` -> `Workspace.load(local)` -> `local.clear()` | Persists JSON under key, restores identical `Workspace`, and `clear()` removes key. |
| `CMP-BASIC-10` | `campaign.exportJson()`, `Campaign.fromJson()`, `workspace.importCampaign()` (including duplicate-ID collision handling), and `Workspace.deserialize` errors | *(none)* | Export `'Heist'`, import twice into same `Workspace`; pass invalid JSON/schemaVersion to `Workspace.deserialize` & `Campaign.fromJson` | Both imported campaigns coexist with distinct IDs; invalid JSON throws `Error`. |

### 4.3 Incremental Advanced Rules in `Campaign` & `Workspace` (`[Commits 21, 25–26, 28]`)

| Case ID | Commit | Scenario | Expected Outcome |
| :--- | :--- | :--- | :--- |
| `CMP-TIE-01` | Commit 21 | `workspace.activeCampaign` forwards `campaign.rules.tiesMode` (`'twist'` vs `'fail'`) on single & opposed checks | Tied roll (`[4]` vs `4`) yields `'tie'` (`0 XP`) in `'twist'` campaign and `'failure'` (`1 XP`) in `'fail'` campaign. |
| `CMP-STS-01` | Commit 25 | Campaign enforces `rules.statusesEnabled` (rejecting `.withStatus()` when `false`, applying & persisting statuses when `true`) | Throws rule-disabled `Error` when `false`; modifies check & survives `LocalStorageAdapter` round-trip when `true`. |
| `CMP-START-01` | Commit 26 | `campaign.addCharacter(customChar)` enforces `rules.allowCustomStartingSkills` | Succeeds when `true`; throws rule-disabled `Error` when `false` and character has skills beyond `Do Anything 1`. |
| `CMP-SLOT-01` | Commit 28 | `workspace.activeCampaign.character(...).advance(...)` automatically supplies `campaign.rules.skillSlots` | Enforces 4/3/2 triangle & `allowSlotPurchase` in slot-limited campaign while leaving `skillSlots: null` campaign unrestricted. |
| `CMP-PORTRAIT-01` | Commit 33 | `Campaign` & `Workspace` persist character portraits across `addCharacter`, `character().update(c => c.withPortrait(...))`, `LocalStorageAdapter`, and `exportJson` / `importCampaign` | Portrait sets, updates, and clears (`null`) immutably and survives `LocalStorageAdapter` save/load and campaign JSON export/import round-trips. |

---

## 5. Manual Browser UI Scenarios (`UI-*`)

1. **`UI-01` (Multi-Campaign & Simultaneous Multi-Character Tracking)**: Create two campaigns (*"Tavern Brawl"* with 3 characters side-by-side and *"Cyberpunk"* with 2 characters). Switch between campaigns and reload the browser tab to confirm `localStorage` restores everything.
2. **`UI-02` (Pluggable Storage Toggle & JSON Backup)**: Export a campaign `.json`, switch UI storage mode to `MemoryStorageAdapter`, import the `.json` campaign, and play without touching `localStorage`.
3. **`UI-03` (Immediate Failure-XP Advancement)**: On a fresh character (`0 XP`, `Do Anything 1`), fail against static target `6` (`+1 XP`), spend `1 XP` to upgrade the die to `6`, and create a Level 2 skill while the roll log still shows the failed check.
4. **`UI-04` (Character-vs-Character Opposed Roll)**: Pit Character A against Character B in the same campaign and verify both character cards update simultaneously in the grid.
5. **`UI-05` (Bob's Lost Shoe Full Walkthrough — `reference/rules.md`)**: Walk through Bob's `Climbing 3` Hard dynamic tie (`7` vs `7` -> Twist, `0 XP`), `-4 Raining` descent, `+2 Clean Shoe` bonus & removal, and `-3 Broken Nose` status.
6. **`UI-06` (Skill Triangle & Slot Leveling)**: Enable Skill Slots on a campaign, fill Level 2 slots (4/4), trigger a 5th Level 2 advancement, and test both replacing an existing Level 2 skill and enabling `allowSlotPurchase` to spend `4 XP` (`2 * 2`) for an extra slot.
