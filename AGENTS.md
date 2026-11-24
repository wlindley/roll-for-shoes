# Roll for Shoes — Workspace Agent Rules

Every agent and subagent working in this repository MUST follow these rules without exception:

## 1. Authoritative Specifications
- **Game Rules**: [`reference/rules.md`](reference/rules.md)
- **Architecture**: [`docs/architecture.md`](docs/architecture.md)
- **Module Interfaces**: [`docs/interfaces.md`](docs/interfaces.md)
- **Boundary Test Cases**: [`docs/test-cases.md`](docs/test-cases.md)
- **Commit Plan**: [`docs/implementation-plan.md`](docs/implementation-plan.md)
- **Subagent Roles**: [`docs/subagents.md`](docs/subagents.md)

## 2. Software Engineering Principles (TDD, SOLID, DRY)
- **Strict Red-Green-Refactor TDD**: Write failing module-boundary tests first (Red), then write the **minimal** production code required to make the tests pass (Green), then clean up duplication while keeping tests green (Refactor). Maintain high line and branch test coverage across every public class, method, and getter.
- **SOLID & Clean OOP Design**:
  - **Single Responsibility (SRP)**: Keep classes small and focused (e.g., `Status.roll(...)` creates a rolled status; `character.addStatus(status)` attaches a status—never fuse unrelated responsibilities into combinatorial helpers).
  - **Open/Closed (OCP)**: Use polymorphic interfaces (such as `CheckOpposition` implemented by `StaticOpposition`, `RolledOpposition`, and `DifficultyOpposition`) rather than `switch` chains over type tags.
  - **Liskov Substitution & Interface Segregation (LSP / ISP)**: Keep interfaces narrow (`DiceRoller` exposes only `roll(count)`; `StorageAdapter` exposes only `load`, `save`, `clear`).
  - **Dependency Inversion (DIP)**: Inject abstractions (`DiceRoller`, `CheckOpposition`, `StorageAdapter`) rather than hardcoding concrete implementations.
- **DRY & Computed Getters (Single Source of Truth)**: Never store derived totals, counts, margins, or outcomes alongside the underlying array/fields. Compute them via getters (`get total()`, `get rawTotal()`, `get modifierTotal()`, `get finalTotal()`, `get nonSixCount()`, `get naturalAllSixes()`, `get margin()`, `get outcome()`, `get xpCostToAdvance()`, `get totalXpSpent()`) so state can never drift out of sync.
- **Pragmatic Validation**: Use plain `number` in TypeScript signatures and enforce `Number.isInteger()` only at critical entry boundaries (`DiceRoller.roll(count)`, `StubDiceRoller` face values, `Skill` level), backed by dedicated tests.

## 3. Strict Module Boundaries (One-Way DAG)
Cross-module imports MUST go exclusively through public `index.ts` entrypoints (`../dice`, `../checks`, `../character`, `../campaign`) and follow this strict downward hierarchy:
1. `src/dice` imports **nothing** from `src/*`.
2. `src/checks` imports **only** from `src/dice`.
3. `src/character` imports **only** from `src/dice` and `src/checks`.
4. `src/campaign` imports **only** from `src/dice`, `src/checks`, and `src/character`.
5. `src/ui` imports from `src/dice`, `src/checks`, `src/character`, and `src/campaign`. No domain module (`dice`, `checks`, `character`, `campaign`) may ever import from `src/ui` or `react`.

## 4. Testing & Stubbing Mandate
- Automated Vitest boundary tests are required for `src/dice`, `src/checks`, `src/character`, and `src/campaign`, covering **every** public class, method, getter, and documented error condition.
- **ONLY `DiceRoller` (`StubDiceRoller` from `src/dice`, plus `RandomDiceRoller`'s optional byte-source parameter inside `random-dice-roller.test.ts`) may be stubbed or faked in tests.**
- **NEVER** use `vi.mock`, `vi.fn`, `vi.spyOn`, or custom stubs/fakes for `checks`, `character`, `campaign`, or `StorageAdapter`. All tests above `src/dice` must execute real production implementations end-to-end.
- `src/ui` has **no** automated unit/component test suite; verify UI changes via `npm run typecheck`, `npm run build`, and existing domain `npm test` suites.

## 5. Domain Integrity, Fluent Builders & Immutability
- Domain entities (`DiceRoll`, `RolledPool`, `CheckResult`, `Character`, `Campaign`, `Workspace`) are **immutable classes** with fluent/builder APIs (e.g., `workspace.activeCampaign.character('Alice').makeCheck('Climbing').against(new StaticOpposition(6)).roll(diceRoller)`). State-changing methods always return a **new** instance (`next !== prev`) and never mutate `this` or input arguments.
- **UI uses domain rules—never re-implements them**: `src/ui` must always invoke the domain methods/getters and never calculate check outcomes, XP gains, dice upgrade costs, status sums, or skill slot limits on its own.
- When rolling opposed or dynamic-difficulty checks, **always roll the actor's dice pool first and resolve opposition second** so `StubDiceRoller` sequences remain deterministic.

## 6. Commit Size & Review Gate Policy
- **Commit Size Budget**: Target **~100 lines of code** per commit, with a **hard limit of <= 200 lines of code** (counting added/modified lines across `src/` production + test files and project configs, excluding `package-lock.json` and markdown docs).
- **Human Review Gate (Commits 1–6 — Completed)**: Commits 1 through 6 were reviewed prior to `git commit`.
- **Autonomous Execution (Commit 7+)**: Starting at **Commit 7**, `rfs-coordinator` stages, audits via `rfs-commit-reviewer`, runs `git commit`, and advances autonomously once `rfs-commit-reviewer` approves each commit.

## 7. UI Development Best Practices
- Before writing or updating HTML/CSS/React UI components in `src/ui/`, consult the `modern-web-guidance` skill for accessible semantic HTML, native `<dialog>`, forms, layout, and styling patterns.
