# Test Discipline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace coverage-quota testing rules with an admission-gate constitution and ship two global skills (verify-setup, test-cleanup) so scoped verification and suite cleanup work in any project.

**Architecture:** All changes live in `~/.claude` (global config). One rule file is rewritten, two rule/skill files get surgical edits, two new skills are created as SKILL.md documents, and the verify-setup skill is validated end-to-end against a throwaway fixture project in /tmp.

**Tech Stack:** Markdown rule/skill files, Claude Code skill conventions (frontmatter: name, description), bash for verification.

**Execution constraints for this plan:**
- `~/.claude` is NOT a git repository. There are no commit steps; each task's verification step is the gate. Do not run git commands in `~/.claude`.
- The PreToolUse hook `protect-claude-config.sh` returns permission "ask" for any Edit/Write under `~/.claude/rules/` — this is expected; the human approves each one.
- Global rule: never write code comments; markdown prose in rule/skill documents is fine.
- Spec: `~/.claude/docs/superpowers/specs/2026-06-11-test-discipline-design.md`

---

### Task 1: Rewrite testing.md as the admission-gate constitution

**Files:**
- Rewrite: `/Users/satanshumishra/.claude/rules/common/testing.md`

- [x] **Step 1: Read the current file**

Run: Read `/Users/satanshumishra/.claude/rules/common/testing.md` (required before overwrite).

- [x] **Step 2: Replace the entire file content with exactly this**

```markdown
# Testing Discipline

Tests exist to create trust that the code works. The health metric of a suite is trust, never test count or coverage percentage.

## Test Admission Gate

A new test may be created ONLY when ALL of these hold:

1. The change introduces or changes a behavior, fixes a bug, or defines a public contract.
2. A search of existing tests finds no coverage of that behavior. If a similar test exists, update or replace it; never duplicate.
3. The test asserts observable behavior through a public surface (API response, rendered UI, returned state) — not implementation details.

Gate fails → no test, unless the user explicitly requests one.

## Exemptions (never tested by default)

Styling and visual tweaks, copy/text changes, configuration, generated code, pure refactors already covered by existing tests, throwaway prototypes.

## TDD (scoped)

For changes that pass the admission gate: write the test first, watch it fail (RED), implement, watch it pass (GREEN). Bug fixes always start with a red test reproducing the bug. A test that has never failed proves nothing.

## Placement and Consolidation

- Place each test at the lowest layer that can express the behavior (unit before integration before E2E).
- When a new lower-level test covers what a higher-level test checked, delete the redundant higher-level test in the same change.
- One behavior, one home: a behavior is asserted at one layer, not several.

## Quality Bar

- Maximum 1–2 test doubles per test; never mock types you don't own unless a contract or integration test covers that boundary elsewhere.
- No change-detector tests (tests that fail on refactors that preserve behavior).
- No assertion-weak tests: snapshot-everything, assert-not-null-only, expected values copied from actual output.
- Deterministic: no sleeps, no real network, no shared mutable state between tests.

## Trust Rules

- Authorization changes require deny-case assertions: roles that must NOT have access are asserted as denied, not just the allowed role as allowed.
- Critical user journeys keep E2E coverage asserting user-visible behavior (role-based locators, not CSS internals).

## Verification

- Default verification is diff-scoped: run the project's `/verify-<project> <scope>`.
- The full suite runs only at integration boundaries or pre-push — never as a per-change reflex.
- If `/verify-<project>` does not exist, suggest running the `verify-setup` skill once for the project.

## Cleanup Discipline

- Every test addition includes a local dedup pass: superseded or duplicated tests in the affected area are updated or deleted in the same change.
- Suite-wide cleanup happens only via the `test-cleanup` skill, only on explicit user request.

## Precedence

This rule supersedes plugin-skill defaults, including the superpowers test-driven-development skill's unconditional "no production code without a failing test" law. User instructions outrank skills per superpowers' own instruction-priority order. Scoped TDD as defined here is the operative discipline.
```

- [x] **Step 3: Verify old mandates are gone**

Run: `grep -n "80%\|80+\|tdd-guide\|ALL required\|Minimum Test Coverage" /Users/satanshumishra/.claude/rules/common/testing.md; echo "exit: $?"`
Expected: no matches, `exit: 1`

- [x] **Step 4: Verify new structure is complete**

Run: `grep -c "^## " /Users/satanshumishra/.claude/rules/common/testing.md`
Expected: `9` (Admission Gate, Exemptions, TDD, Placement and Consolidation, Quality Bar, Trust Rules, Verification, Cleanup Discipline, Precedence)

---

### Task 2: Align git-workflow.md with the new constitution

**Files:**
- Modify: `/Users/satanshumishra/.claude/rules/common/git-workflow.md` (Feature Implementation Workflow, TDD Approach block)

- [x] **Step 1: Read the current file**

Run: Read `/Users/satanshumishra/.claude/rules/common/git-workflow.md`.

- [x] **Step 2: Apply exactly this edit**

Old string:
```
2. **TDD Approach**
   - Use **tdd-guide** agent
   - Write tests first (RED)
   - Implement to pass tests (GREEN)
   - Refactor (IMPROVE)
   - Verify 80%+ coverage
```

New string:
```
2. **TDD Approach**
   - Apply the test admission gate (see testing.md) before writing any test
   - For gated changes: write tests first (RED)
   - Implement to pass tests (GREEN)
   - Refactor (IMPROVE)
   - Verify via diff-scoped checks (/verify-<project>)
```

- [x] **Step 3: Verify**

Run: `grep -n "80%" /Users/satanshumishra/.claude/rules/common/git-workflow.md; echo "exit: $?"`
Expected: no matches, `exit: 1`

Run: `grep -n "admission gate" /Users/satanshumishra/.claude/rules/common/git-workflow.md`
Expected: one match in the TDD Approach block

---

### Task 3: Create the verify-setup skill

**Files:**
- Create: `/Users/satanshumishra/.claude/skills/verify-setup/SKILL.md`

- [x] **Step 1: Create the file with exactly this content**

```markdown
---
name: verify-setup
description: Use when a project has no /verify-<project> command and the user asks to set up scoped verification (or verification-discipline suggests it). Inspects the project's build system, discovers native scoped runners, and writes the project-local /verify-<project> slash command with a glob routing table. Run once per project; idempotent.
---

# Verify Setup

Generates the project-local scoped verification command that `verification-discipline` and the `verification-strategist` agent expect.

## Process

1. Detect the project:
   - Project name: package.json `name` field, else pyproject.toml `[project] name`, else Cargo.toml `[package] name`, else the repo directory name. Strip scope prefixes (`@org/app` → `app`).
   - Build system: check for `turbo.json`, `nx.json`, `package.json` workspaces, `vitest.config.*`, `jest.config.*`, `playwright.config.*`, `pyproject.toml`/`pytest.ini`, `Cargo.toml`, `Makefile`.

2. Discover native scoped capabilities, preferring what already exists. In priority order per ecosystem:
   - turbo: `turbo run <task> --filter=<pkg>` for each workspace task
   - Nx: `nx affected -t <task>`
   - vitest: `vitest run --changed <ref>` and `vitest related <files>`
   - jest: `jest --findRelatedTests <files>`
   - pytest: `pytest --testmon` if installed, else `pytest <path> -k <expr>`
   - cargo: `cargo test -p <crate>`
   - Plus always: the project's typecheck command and per-file lint command.
   Never invent scripts: only emit commands whose binaries/scripts exist in the project.

3. Build two tables:
   - Glob routing table: maps source globs to scope names (e.g. `src/auth/**` → `auth`, `packages/api/**` → `api`). Derive areas from workspace packages, top-level src directories, and test directory structure.
   - Scope command table: maps each scope name to the exact command(s), plus `typecheck`, `lint`, and `full`.

4. Write `<project>/.claude/commands/verify-<project>.md` using the output template below.

5. Validate: run the `typecheck` and `lint` scopes, and one cheap unit scope. Record measured runtimes in the scope table. If a command fails, keep its row but annotate it `BROKEN: <error summary>` and report it; never silently drop a scope.

6. Report: list created scopes, measured runtimes, and gaps (areas with no runner found).

## Output template

The generated file must contain a glob routing table (the `verification-strategist` agent matches touched files against these globs) and a scope command table:

    ---
    name: verify-<project>
    description: Scoped verification for <project>. Usage: /verify-<project> <scope>[,<scope>] or /verify-<project> full
    ---

    # Verify <project>

    Run the command for each requested scope. `full` is reserved for integration boundaries and pre-push.

    ## Routing table

    | Glob | Scope |
    |---|---|
    | src/auth/** | auth |
    | packages/api/** | api |
    | *.md, docs/** | skip |

    ## Scopes

    | Scope | Command | Runtime |
    |---|---|---|
    | typecheck | npx tsc --noEmit | 4s |
    | lint | npx eslint <touched files> | 2s |
    | auth | npx vitest run src/auth | 6s |
    | full | npm run lint && npm run build && npm test | 4m |

## Error handling

- No recognizable runner: write a minimal command with only `typecheck`, `lint`, and `full` scopes, plus a `## TODO` section naming what could not be discovered. Tell the user.
- Heterogeneous monorepo: one routing table; scope commands may differ per workspace.
- Re-run on an existing command: regenerate tables, preserve any rows the user added manually (rows marked with `keep` in a trailing column).

## Boundaries

- Never connect to databases or deployed environments (global no-direct-db-access rule).
- Never modify package.json or project source; the only file written is the verify command.
```

- [x] **Step 2: Verify frontmatter and location**

Run: `head -4 /Users/satanshumishra/.claude/skills/verify-setup/SKILL.md`
Expected: `---`, `name: verify-setup`, then a `description:` line starting with "Use when".

Run: `grep -c "Routing table\|Scopes" /Users/satanshumishra/.claude/skills/verify-setup/SKILL.md`
Expected: at least `2` (output template includes both tables the verification-strategist contract requires).

---

### Task 4: Create the test-cleanup skill

**Files:**
- Create: `/Users/satanshumishra/.claude/skills/test-cleanup/SKILL.md`

- [x] **Step 1: Create the file with exactly this content**

```markdown
---
name: test-cleanup
description: Use ONLY when the user explicitly asks to clean up, consolidate, or audit tests (e.g. "clean up tests", "/test-cleanup", optionally scoped to an area). Never proactive, never invoked by other skills. Inventories the suite, finds redundant and low-value tests with evidence, and applies deletions only in user-approved batches.
---

# Test Cleanup

Reduces a test suite to fewer, more trustworthy tests. Evidence first, approval always, revertible batches.

## Preconditions

- Explicit user request. If this skill was reached any other way, stop.
- Clean git working tree in the target project. If dirty, stop and tell the user.

## Phases

1. Inventory
   - Count test files and cases. Map each test file to a behavior area and layer (unit, integration, E2E) from naming, imports, and directory structure.
   - Collect per-file runtimes if the runner reports them.

2. Detect candidates
   - For suites over ~200 files, dispatch parallel read-only subagents, one per behavior area. Each returns candidates in the evidence format below.
   - Categories:
     - duplicate: same behavior asserted at the same layer as another test
     - shadowed: higher-level test fully covered by a lower-level test
     - change-detector: asserts implementation structure; fails on behavior-preserving refactors
     - assertion-weak: snapshot-everything, assert-not-null-only, expected values copied from actuals
     - over-mocked: asserts mock choreography rather than observable behavior
     - dead: permanently skipped, tests for removed features, unreferenced helpers

3. Evidence per candidate
   - `file:line`, category, proposed action (delete | merge into <named test> | rewrite assertions), and for duplicate/shadowed the surviving test that covers the behavior.
   - Confidence tier: `proven` (mutation spot-check passed) or `heuristic`.

4. Mutation spot-check (only if the project has Stryker, PIT, or mutmut configured)
   - For delete candidates: run mutation on the covered module with and without the candidate. Unchanged score → mark `proven`. Changed score → drop the candidate.

5. Approval and apply
   - Present candidates grouped by category and area. The user approves batches; default batch cap is 20 candidates.
   - Per approved batch: apply, run the affected tests (via /verify-<project> when available), one git commit per batch.
   - If a batch's test run fails: revert that batch, report it, continue with the next batch only on user confirmation.
   - After all batches: one full-suite run to prove green; write a ledger to `<project>/docs/test-cleanup-<date>.md` recording every removal and its evidence.

## Boundaries

- Nothing is deleted without explicit batch approval.
- Never weaken an assertion to make a test pass.
- Never touch production source; this skill edits test files only.
- Authorization deny-case tests are never candidates, whatever their smell profile.
```

- [x] **Step 2: Verify frontmatter and safety language**

Run: `head -4 /Users/satanshumishra/.claude/skills/test-cleanup/SKILL.md`
Expected: `---`, `name: test-cleanup`, then a `description:` line containing "ONLY when the user explicitly".

Run: `grep -c "approval\|Approval" /Users/satanshumishra/.claude/skills/test-cleanup/SKILL.md`
Expected: at least `3`

---

### Task 5: Wire the verify-setup suggestion into verification-discipline

**Files:**
- Modify: `/Users/satanshumishra/.claude/skills/verification-discipline/SKILL.md:26-27`

- [x] **Step 1: Read the current file**

Run: Read `/Users/satanshumishra/.claude/skills/verification-discipline/SKILL.md`.

- [x] **Step 2: Apply exactly this edit**

Old string:
```
3. If no:
   - Run `npx tsc --noEmit --incremental` and `npx eslint <changed-files>` directly.
```

New string:
```
3. If no:
   - Run `npx tsc --noEmit --incremental` and `npx eslint <changed-files>` directly.
   - Suggest running the `verify-setup` skill once so future verification can be scoped via `/verify-<project>`.
```

- [x] **Step 3: Verify**

Run: `grep -n "verify-setup" /Users/satanshumishra/.claude/skills/verification-discipline/SKILL.md`
Expected: exactly one match, inside the Implementation section.

---

### Task 6: Fixture validation of verify-setup

**Files:**
- Create (throwaway): `/tmp/verify-setup-fixture/` (package.json, vitest config, one source file, one test)
- Create (validation output): `/tmp/verify-setup-fixture/.claude/commands/verify-fixture-app.md`

- [x] **Step 1: Create the fixture project**

Run:
```bash
mkdir -p /tmp/verify-setup-fixture/src /tmp/verify-setup-fixture/tests
cd /tmp/verify-setup-fixture
cat > package.json <<'EOF'
{
  "name": "fixture-app",
  "private": true,
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {}
}
EOF
cat > src/add.ts <<'EOF'
export function add(a: number, b: number): number {
  return a + b;
}
EOF
cat > tests/add.test.ts <<'EOF'
import { describe, expect, it } from 'vitest';
import { add } from '../src/add';

describe('add', () => {
  it('adds two numbers', () => {
    expect(add(2, 3)).toBe(5);
  });
});
EOF
npm install -D vitest typescript >/dev/null 2>&1 && echo INSTALL_OK
```
Expected: `INSTALL_OK` (if offline, note it and validate generation only, skipping runtime measurement).

- [x] **Step 2: Follow the verify-setup skill's process steps 1-5 against the fixture**

Acting as the skill would: detect name `fixture-app`, discover `vitest run` / `vitest related` / `tsc --noEmit`, build both tables, and write `/tmp/verify-setup-fixture/.claude/commands/verify-fixture-app.md` with exactly this content (runtimes filled from the validation runs):

```markdown
---
name: verify-fixture-app
description: Scoped verification for fixture-app. Usage: /verify-fixture-app <scope>[,<scope>] or /verify-fixture-app full
---

# Verify fixture-app

Run the command for each requested scope. `full` is reserved for integration boundaries and pre-push.

## Routing table

| Glob | Scope |
|---|---|
| src/** | unit |
| tests/** | unit |
| *.md, docs/** | skip |

## Scopes

| Scope | Command | Runtime |
|---|---|---|
| typecheck | npx tsc --noEmit | <measured>s |
| unit | npx vitest run | <measured>s |
| full | npm run typecheck && npm test | <measured>s |
```

The `<measured>` values are the actual runtimes observed in Step 3 — they are the only part not known in advance.

- [x] **Step 3: Verify the generated command satisfies the verification-strategist contract**

Run: `grep -c "| Glob | Scope |\|| Scope | Command |" /tmp/verify-setup-fixture/.claude/commands/verify-fixture-app.md`
Expected: `2` (both table headers present)

Run: `cd /tmp/verify-setup-fixture && npx vitest run 2>&1 | tail -3`
Expected: `1 passed` (the scope command recorded in the table actually works)

- [x] **Step 4: Confirm idempotency intent and clean up**

Re-running generation must produce the same tables (no duplicated rows). Then:
Run: `rm -rf /tmp/verify-setup-fixture && echo CLEANED`
Expected: `CLEANED`

- [x] **Step 5: Report any divergence**

If following the skill's written steps required improvisation not covered by the SKILL.md text, list each divergence — these are skill-text bugs to fix in Task 3's file before the plan is complete.

---

### Task 7: Fixture validation of test-cleanup detection

**Files:**
- Create (throwaway): `/tmp/test-cleanup-fixture/` with planted low-value tests
- No files modified: detection phases are read-only; this task verifies candidates are found and nothing is touched without approval.

- [x] **Step 1: Create a fixture with planted candidates**

Run:
```bash
mkdir -p /tmp/test-cleanup-fixture/tests
cd /tmp/test-cleanup-fixture
cat > package.json <<'EOF'
{ "name": "cleanup-fixture", "private": true, "scripts": { "test": "vitest run" } }
EOF
cat > tests/math.test.ts <<'EOF'
import { describe, expect, it } from 'vitest';

function add(a: number, b: number): number { return a + b; }

describe('add', () => {
  it('adds two numbers', () => {
    expect(add(2, 3)).toBe(5);
  });
  it('adds two numbers again', () => {
    expect(add(2, 3)).toBe(5);
  });
  it('returns something', () => {
    expect(add(1, 1)).not.toBeNull();
  });
  it.skip('legacy feature removed in v2', () => {
    expect(true).toBe(true);
  });
});
EOF
git init -q && git add -A && git commit -qm "fixture" && echo FIXTURE_OK
```
Expected: `FIXTURE_OK`

- [x] **Step 2: Run the test-cleanup skill's phases 1-3 (inventory, detect, evidence) against the fixture**

Acting as the skill would, produce the candidate list. Expected detections:
- `tests/math.test.ts` "adds two numbers again" → duplicate (same behavior, same layer; survivor: "adds two numbers"), action: delete, confidence: heuristic
- `tests/math.test.ts` "returns something" → assertion-weak (assert-not-null-only), action: rewrite assertions or delete, confidence: heuristic
- `tests/math.test.ts` "legacy feature removed in v2" → dead (permanently skipped), action: delete, confidence: heuristic

- [x] **Step 3: Verify detection found all three planted candidates and modified nothing**

Run: `cd /tmp/test-cleanup-fixture && git status --porcelain | wc -l`
Expected: `0` (detection phases are read-only; no edits before approval)

If any of the three planted candidates was missed, the detection heuristics in Task 4's SKILL.md need sharpening — fix the skill text and note the change.

- [x] **Step 4: Clean up**

Run: `rm -rf /tmp/test-cleanup-fixture && echo CLEANED`
Expected: `CLEANED`

---

## Final verification (after all tasks)

1. `grep -rn "80%" /Users/satanshumishra/.claude/rules/common/ | grep -v performance.md; echo "exit: $?"` → expect exit 1 (no coverage mandates left in testing/git-workflow rules).
2. `ls /Users/satanshumishra/.claude/skills/verify-setup/SKILL.md /Users/satanshumishra/.claude/skills/test-cleanup/SKILL.md` → both exist.
3. `grep -n "verify-setup" /Users/satanshumishra/.claude/skills/verification-discipline/SKILL.md /Users/satanshumishra/.claude/rules/common/testing.md` → one match in each.
4. New session smoke check (human): confirm `/verify-setup` and `/test-cleanup` appear in the skills list.
