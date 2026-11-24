# Roll for Shoes

A 100% client-side, offline-capable Progressive Web App (PWA) for the tabletop micro-RPG **[Roll for Shoes](reference/rules.md)**, built with strict downward-DAG TypeScript domain modules, React, Vite, and Vitest.

- **Live App**: https://wlindley.github.io/roll-for-shoes/
- **Architecture & Specifications**: [`docs/README.md`](docs/README.md)

---

## Quick Start

```sh
npm install
npm run dev            # Start local Vite dev server
npm test               # Run all 325 Vitest module-boundary tests across 16 suites
npm run test:coverage  # Verify 100% statement/branch/function/line coverage
npm run build          # Typecheck + build production PWA bundle into dist/
```

---

## Module Guides

Dependencies flow strictly downward (`ui -> campaign -> character -> checks -> dice`) exclusively through each module's public `index.ts` entrypoint. Each module includes a standalone guide explaining what it is, how to use it, and its complete public interface:

| Layer | Module | Guide | Summary |
| :---: | :--- | :--- | :--- |
| **1** | `src/dice` | **[`src/dice/README.md`](src/dice/README.md)** | Zero-dependency d6 rolling (`DiceRoller`, `DiceRoll`, unbiased cryptographic `RandomDiceRoller`, deterministic `StubDiceRoller`). |
| **2** | `src/checks` | **[`src/checks/README.md`](src/checks/README.md)** | Stateless fluent `Check` builder, `RolledPool` computed getters, `TiesMode`, and polymorphic `CheckOpposition` (`StaticOpposition`, `RolledOpposition`, `DifficultyOpposition`). |
| **3** | `src/character` | **[`src/character/README.md`](src/character/README.md)** | Immutable `Character`, `Skill`, `Status`, `SkillSlotConfig`, optional `portrait`, fluent check/advancement builders, and JSON serialization. |
| **4** | `src/campaign` | **[`src/campaign/README.md`](src/campaign/README.md)** | Immutable `Campaign` & `Workspace`, scoped fluent traversal (`workspace.activeCampaign.character(...)`), discriminated `CampaignRollLogEntry`, symmetric JSON serialization, and `StorageAdapter`. |
| **5** | `src/ui` | **[`src/ui/README.md`](src/ui/README.md)** | Responsive React + TypeScript browser UI, native `<ModalDialog>` & `<ActionMenu>` primitives, character portraits (`portrait-image.ts`), discriminated check form state, and PWA install controls. |

---

## Project Documentation

- **[`docs/README.md`](docs/README.md)** — Documentation index & rules coverage overview
- **[`docs/architecture.md`](docs/architecture.md)** — Module dependency graph, OOP/fluent design decisions, PWA & responsive architecture
- **[`docs/interfaces.md`](docs/interfaces.md)** — Cross-module TypeScript contracts
- **[`docs/test-cases.md`](docs/test-cases.md)** — Module-boundary test catalog (`DICE-*`, `CHK-*`, `CHR-*`, `CMP-*`, `UI-*`)
- **[`docs/implementation-plan.md`](docs/implementation-plan.md)** — Incremental `<= 200 LOC` TDD commit log
