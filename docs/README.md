# Roll for Shoes — Software Documentation

Client-only TypeScript implementation of the tabletop micro-RPG **Roll for Shoes** (based on [`reference/rules.md`](../reference/rules.md)).

## Goals & Architectural Tenets

1. **Strict Modularity & SOLID OOP**: Five distinct modules (`dice`, `checks`, `character`, `campaign`, `ui`) connected in a strict one-way Directed Acyclic Graph (DAG). Domain entities are immutable classes exposing fluent/builder APIs (`workspace.activeCampaign.character('Alice').makeCheck('Do Anything').against(new StaticOpposition(6)).roll(diceRoller)`) and polymorphic abstractions (`CheckOpposition`, `DiceRoller`, `StorageAdapter`).
2. **Computed Getters (Single Source of Truth)**: Totals, modifiers, margins, outcomes, non-`6` counts, and XP costs are calculated dynamically via getters from underlying arrays/fields rather than stored separately, preventing state drift.
3. **Real Collaborators & High-Coverage TDD**: Automated Vitest boundary tests cover every public class, method, and getter across `dice`, `checks`, `character`, and `campaign`. **Only `DiceRoller` (`StubDiceRoller`) is ever stubbed across module boundaries**—all higher-level tests run against real production `checks`, `character`, and `campaign` code (including real production storage adapters).
4. **Untested Declarative Browser UI**: `src/ui/` is a thin React + TypeScript layer that **uses** the domain modules' game rules rather than re-implementing them.
5. **Multi-Character & Multi-Campaign Support**: Track multiple campaigns, each with its own rule settings and roster of characters displayed simultaneously in the browser workspace, backed by pluggable `StorageAdapter` implementations (`LocalStorageAdapter` + `MemoryStorageAdapter`) and JSON export/import.
6. **Small, Review-Gated Commits**: Built in ~100-LOC TDD commits (hard limit <= 200 LOC of `src/` production + test code). **Commits 1–10** pause for human review before `git commit`; **Commits 11+** proceed autonomously.

---

## Documentation Index

| Document | Purpose |
| :--- | :--- |
| **[`architecture.md`](./architecture.md)** | Layered module graph, OOP/fluent builder design, computed-getter model, persistence strategy, and testing philosophy. |
| **[`interfaces.md`](./interfaces.md)** | Authoritative TypeScript classes, interfaces, fluent builders, getters, and contracts for all 5 modules. |
| **[`test-cases.md`](./test-cases.md)** | Comprehensive catalog of boundary test cases (`DICE-*`, `CHK-*`, `CHR-*`, `CMP-*`) covering every public method/getter, plus manual UI scenarios (`UI-*`). |
| **[`implementation-plan.md`](./implementation-plan.md)** | Fine-grained 29-commit roadmap (~100 LOC target, <= 200 LOC max per commit), marking the human review gate on Commits 1–10. |
| **[`subagents.md`](./subagents.md)** | Specification of the multi-agent TDD team (`rfs-coordinator`, `rfs-test-author`, `rfs-implementer`, `rfs-ui-builder`, `rfs-commit-reviewer`). |

---

## Rules Coverage Summary

All rules from [`reference/rules.md`](../reference/rules.md) are mapped to explicit phases in [`implementation-plan.md`](./implementation-plan.md):

| Rules Section | Summary | Target Commits |
| :--- | :--- | :--- |
| **Basic Rules 1–6** | Roll `N`d6 for skill level `N`; beat opposing roll or static target; start with `Do Anything 1`; natural all-`6`s grants a `level + 1` skill; `+1 XP` on every failed roll; spend `1 XP` per non-`6` die to upgrade dice to `6`s for advancement only (including immediately after failing). | Commits 1–19 (Basic Rules MVP) |
| **Difficulty** | Integer `DifficultyTier` (`Easy = 1`, `Moderate = 2`, `Hard = 3`, `VeryHard = 4`) via `DifficultyOpposition` in static (`tier * 3`) or dynamic (`tier`d6) mode. | Commits 20–22 |
| **Ties** | Configurable campaign rule (`tiesMode: 'fail' \| 'twist'`). In `'twist'` mode, equal totals yield `'tie'` (partial success with twist) and `0 XP`. | Commits 20–22 |
| **Statuses** | Persistent rated character conditions (`Status.create` / `Status.roll`) and situational check modifiers. Modifies check totals while advancement still inspects **raw rolled dice** only. | Commits 23–25 |
| **Starting Skills** | Optional custom archetype/scenario starting skills via `Character.builder(name).withStartingSkill(...)` alongside `Do Anything 1`. | Commit 26 |
| **Skill Slots & Leveling** | Optional per-level slot caps (`SkillSlotConfig.triangle()`: 4x L2, 3x L3, 2x L4), skill replacement when full, and optional slot purchasing (`allowSlotPurchase`, default `false`) at `2 * level` XP. | Commits 27–29 |
