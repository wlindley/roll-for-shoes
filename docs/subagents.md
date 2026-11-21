# Subagent Architecture & Orchestration Protocol

To build **Roll for Shoes** with strict TDD, SOLID design, high test coverage, and <= 200-LOC commits, the project defines five specialized subagents.

Where they live:
- **Workspace Plugin (Version-Controlled)**: [`.agents/plugins/rfs-team/`](../.agents/plugins/rfs-team/) (`plugin.json` + `agents/*.md`), automatically discovered by Antigravity across sessions.
- **Conversation-Scoped Registration**: Registered via `define_subagent` so any orchestrating session can invoke them immediately via `invoke_subagent(TypeName="<agent-name>", ...)`.
- **Shared Guardrails**: [`AGENTS.md`](../AGENTS.md) at the repository root applies automatically to every subagent.

---

## 1. Subagent Roster

| Subagent Name | Role | Write Files? | Run Commands? | Spawn Subagents? | Core Responsibility |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **`rfs-coordinator`** | Technical Lead & Release Coordinator | Yes (git staging/commits & docs) | Yes | **Yes** | Drives [`implementation-plan.md`](./implementation-plan.md) commit-by-commit (~100 LOC target, <= 200 LOC max), pausing before `git commit` on Commits 1–10 for user review and running autonomously from Commit 11+. |
| **`rfs-test-author`** | Module Boundary TDD Engineer | Yes (`*.test.ts` + contract stubs) | Yes (`vitest`, `tsc`) | No | Translates [`test-cases.md`](./test-cases.md) & [`interfaces.md`](./interfaces.md) into failing boundary tests covering **every** public method/getter, using **only** `StubDiceRoller`. |
| **`rfs-implementer`** | Core Domain TypeScript Engineer | Yes (`src/{dice,checks,character,campaign}/` & build configs) | Yes (`vitest`, `tsc`) | No | Writes **minimal**, SOLID, DRY TypeScript production code (using computed getters and immutable fluent classes) to make failing tests pass with high test coverage. |
| **`rfs-ui-builder`** | React Browser UI Engineer | Yes (`index.html`, `src/main.tsx`, `src/ui/**`) | Yes (`tsc`, `vite build`, `vitest`) | No | Builds & evolves the untested multi-campaign, multi-character React UI by **using** the domain modules' game rules rather than re-implementing them. |
| **`rfs-commit-reviewer`** | Architectural, Quality & Commit Auditor | **No** (strictly read-only) | Yes (`git diff/show`, `vitest --coverage`, `tsc`, `vite build`) | No | Audits every commit for <= 200 LOC size limit, high test coverage, SOLID/DRY/getter adherence, module DAG boundaries, stub-only-dice compliance, and spec fidelity. |

---

## 2. Detailed Responsibilities & Guardrails

### 2.1 `rfs-coordinator`
- **Workflow per Commit**:
  1. **Scaffold / Red Phase** *(for domain commits)*:
     - Invoke `rfs-test-author` with the Commit number, target module, public signatures from `docs/interfaces.md`, and Test Case IDs from `docs/test-cases.md`. *(In Commit 1, `rfs-implementer` first scaffolds `package.json`, `tsconfig.json`, and `vite.config.ts`.)*
     - Verify `rfs-test-author` produces a compiling **Red** test run using only `StubDiceRoller`.
  2. **Green Phase** *(for domain commits)*:
     - Invoke `rfs-implementer` to write minimal production code turning all tests **Green** with high coverage and zero modifications to `*.test.ts` assertions.
  3. **UI Phase** *(for UI commits)*:
     - Invoke `rfs-ui-builder` to implement the slice in `src/ui/`, verifying `npm run typecheck`, `npm run build`, and `npm test`.
  4. **Size & Quality Audit Gate**:
     - Stage intended files (`git add`), verify changed LOC across `src/` and config files is **<= 200 LOC** (aiming for ~100 LOC; split the commit if > 200 LOC), and invoke `rfs-commit-reviewer` on the staged diff (`git diff --cached`).
     - If `rfs-commit-reviewer` returns `CHANGES_REQUESTED`, dispatch fixes to the responsible specialist and re-audit until `APPROVED`.
  5. **Autonomous Commit Gate (Commit 7+)**:
     - Commits 1–6 paused for human review prior to `git commit`. From **Commit 7 through Commit 29**, run `git commit` immediately upon `rfs-commit-reviewer` `APPROVED` and proceed to the next assigned commit autonomously.

---

### 2.2 `rfs-test-author`
- **Allowed Edits**:
  - `src/<module>/*.test.ts`
  - Minimal public class/interface skeletons (`throw new Error('Not implemented')`) in `src/<module>/` when introducing new signatures from [`docs/interfaces.md`](./interfaces.md) so the Red suite compiles.
- **Guardrails**:
  - Cover **every** public class, constructor, method, fluent builder step, getter, and error condition scheduled for the commit (including symmetric opponent cases and distinct invalid-value cases).
  - Verify immutability on state-transforming methods: assert both that the original instance is unchanged **and** that the returned instance is a distinct object (`next !== prev`).
  - **NEVER** write real production implementation logic, and **NEVER** use `vi.mock`, `vi.fn`, `vi.spyOn`, or any fake/stub other than `StubDiceRoller` (and `RandomDiceRoller`'s byte-source callback inside `dice.test.ts`).

---

### 2.3 `rfs-implementer`
- **Allowed Edits**:
  - Production domain files in `src/dice/`, `src/checks/`, `src/character/`, `src/campaign/` (excluding `*.test.ts`), plus project config files when assigned.
- **Guardrails**:
  - **Minimal Code & High Coverage**: Write the minimal, clean code necessary to pass the failing boundary tests—avoid speculative branches or unused helpers so line and branch coverage stay near 100%.
  - **SOLID, DRY & Computed Getters**: Use polymorphic classes (`CheckOpposition`), single-responsibility methods, immutable returns, and computed getters (`get total()`, `get finalTotal()`, `get outcome()`, etc.) rather than storing derived values.
  - **NEVER** edit, skip, or weaken assertions in `*.test.ts`. Report any spec discrepancy to `rfs-coordinator`.

---

### 2.4 `rfs-ui-builder`
- **Allowed Edits**:
  - `index.html`, `src/main.tsx`, and `src/ui/**`.
- **Guardrails**:
  - **Use domain game rules—never re-implement them**: Delegate all check resolution, XP awards, dice upgrade costs, status modifiers, and skill slot calculations to `Workspace`, `Campaign`, `Character`, and `CheckResult` methods/getters.
  - Keep each UI commit focused and **<= 200 LOC**.
  - Consult `modern-web-guidance` before implementing HTML/CSS/React components.
  - Verify `npm run typecheck`, `npm run build`, and `npm test` pass cleanly.

---

### 2.5 `rfs-commit-reviewer`
- **Permissions**: Strictly read-only file access + verification commands (`git diff --cached`, `git show`, `git status`, `npx vitest run --coverage`, `npm run typecheck`, `npm run build`).
- **Mandatory 8-Point Review Checklist**:
  1. **Commit Size Gate**: Confirm added/modified lines across `src/` + config files (excluding `package-lock.json` and markdown docs) are **<= 200 LOC** (target ~100 LOC).
  2. **Test Coverage Audit**: Confirm every public class, method, getter, and error path introduced in the commit is exercised by boundary tests with high line/branch coverage.
  3. **SOLID, DRY & Engineering Quality**: Verify SRP, OCP (polymorphism over `switch` tags), DRY, clean naming, and **computed getters** instead of duplicated stored totals.
  4. **Module DAG & UI Rule Usage**: Confirm imports strictly follow `ui -> campaign -> character -> checks -> dice` via `index.ts`; confirm `src/ui` **uses** domain rules rather than re-implementing them.
  5. **Zero-Mock Audit**: Confirm `*.test.ts` contains zero `vi.mock`, `vi.fn`, `vi.spyOn`, or non-dice fakes.
  6. **Spec & Rules Conformance**: Confirm public APIs match [`docs/interfaces.md`](./interfaces.md), test IDs match [`docs/test-cases.md`](./test-cases.md), and behavior matches [`reference/rules.md`](../reference/rules.md).
  7. **Immutability & Roll Order**: Confirm methods return new instances without mutating `this`/inputs, and actor dice roll before opposition dice.
  8. **Build, Tests & Git Hygiene**: Confirm `npm test`, `npm run typecheck` (and `npm run build` from Commit 15+) pass and no stray untracked files are staged.
- **Return Verdict**: `VERDICT: APPROVED` or `VERDICT: CHANGES_REQUESTED` with exact `file:line` citations.
