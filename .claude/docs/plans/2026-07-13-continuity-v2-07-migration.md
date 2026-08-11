# Continuity v2 — Plan 07: v1→v2 Ledger Migration (`ledger-cli migrate` / `restore`)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This is plan 7 of 7; the shared contract lives in `2026-06-30-continuity-v2-00-overview.md` and is authoritative for every schema, interface, and constraint referenced here. Deps: Plans 01, 02, 03 for runtime imports (the frozen record schemas + validators, the `GitRefDriver` + deterministic orphan root, and `bin/ledger-cli.mjs` + `renderDecision`/session append + `get_resume_brief`) PLUS 04 and 06 for BUILD ORDERING — Amendments 4/5 edit their source files (`hooks/lib/install-commit-msg.mjs`, `test/e2e/helpers/fixtures.mjs`), so under a parallel vehicle 07 MUST serialize after 04 and 06. Amendments to Plans 00, 02, 04, 06 ship alongside this plan (see the Amendments section at the end).

**Goal:** Ship a human-run, idempotent, resumable `ledger-cli migrate` subcommand (plus a `restore` companion) that transforms an actively-used v1 markdown ledger into a v2 store — losslessly, proving zero loss through a five-layer verification harness before any cutover — and never connects to or through the MCP surface.

**Architecture:** Migration is a 20-node transform DAG (N0–N19) driven from the CLI, never from a tool. v1 stores are read **read-only** (expand-contract); the v2 target is a fresh **orphan-branch** ref (git stores) or a `LocalDriver` plain-file store (non-git), built once via git **plumbing** (`hash-object` → `write-tree` → `commit-tree` → `update-ref`) on the same deterministic root Plan 02 mints. Identity is minted **once** into committed manifests (real `ulid` values, timestamp-seeded from a derived `created_at`) — those manifests are the idempotency spine: a re-run resolves every id through the map before minting, so `--resume` and re-runs are safe. Every emitted `Thread`/`BranchBinding` passes the **frozen** `validateThread`/`validateBinding` before it enters the tree; decisions are rendered markdown, sessions are byte-copied. Nothing is ever silently dropped — every lossy or manual decision routes to a `ReviewQueue` that blocks `done`.

**Tech Stack:** Node.js >= 20 (ESM), `node --test`, `ulid` 3.0.2 (`monotonicFactory` for seeded minting). No new runtime dependency: the SHA-256 losslessness proof uses `node:crypto`, git plumbing and the tarball snapshot use `node:child_process` (`execFile`) against system `git`/`tar`, filesystem work uses `node:fs/promises`. `ajv` 8.20.0 (already a dep) validates this plan's net-new manifest/plan artifacts. The migration verbs are wired into `bin/ledger-cli.mjs` (Plan 03). Plain JS, no TypeScript, no build step.

## Global Constraints (verbatim from Plan 00 — apply to EVERY task)

- Runtime: Node.js >= 20, ES modules only (`.mjs`). No TypeScript. No build step.
- Tests: Node's built-in runner only — `node --test`. No jest/vitest/mocha.
- Dependencies: exactly three runtime deps across the whole plugin — `@modelcontextprotocol/sdk`, `ulid`, `ajv`. Pin EXACT versions (no `^`/`~`). A 4th dependency requires a plan amendment. (Consequence for this plan: ajv 8 dropped built-in `format` validation and `ajv-formats` would be a 4th dep — so timestamps are validated by `pattern`, never by `format`. The SHA-256, git-plumbing, and tarball needs are met by Node built-ins + system binaries, never a new npm dep.)
- No code comments anywhere (shebang / tooling-pragma / codegen-marker carve-outs only). No emojis. No AI attribution in commits.
- Immutability: never mutate a record in place; construct a new object and atomically write it. Small focused files (200–400 lines typical, 800 hard max). Comprehensive error handling; validate at every boundary; never silently swallow errors.
- All cross-references use a stable ULID (or a decision's stable NNNN). A slug or file path is NEVER a link target.
- Atomic writes: write to `<path>.tmp-<ulid>` then `rename()` over the target (POSIX atomic). Never partial-write a record. (Append-only session logs are the one documented exception — `appendFile`, not tmp+rename.)
- Storage is reached ONLY through the driver interface. No task hard-codes a git command or a filesystem path outside a driver or the `layout` helpers. **Migration carve-out (this plan only):** the orphan-build task (N18) constructs the target tree with git plumbing directly rather than through the driver's per-record write path — this is the single sanctioned bulk-build bypass. Every emitted record is still validated by the frozen `validateThread`/`validateBinding` before it enters the tree, so the bypass changes only how records are *written in bulk*, never whether they are *valid*.
- Commit cadence: one logical change per commit; Conventional Commits (`feat:`/`fix:`/`test:`/`refactor:`/`chore:`).

## Migration Design Decisions (pinned — read before Task 1)

These resolve every open GAP the migration-architecture report left narrative-only, and every conflict between that report and the frozen Plan 00/01 contract. The frozen contract wins on every conflict. Grounded in `decisions/2026-07-13-ratify-migration-open-items.md` and `decisions/2026-07-13-adopt-ledger-migration-architecture.md`.

1. **`schema_version` = `1`, top-level.** The report emits `2` in all six occurrences; Plan 01's Thread schema pins `schema_version: { const: 1 }` and V3 runs that live validator, so the report's `2` would FAIL verification. N10 emits `1`; V3 asserts `1`. `BranchBinding` carries **no** `schema_version` field (it is absent from the frozen binding schema) — a migrated binding must not add one.
2. **Only `Thread` and `BranchBinding` are ajv-validated.** There is no frozen `Session`, `Decision`, or `ReviewQueue` schema. So: N10 threads → `validateThread`; N13 bindings → `validateBinding`; N11 decisions → `renderDecision` markdown (structural check only: frontmatter present + `Thread-Id` resolves); N12 sessions → byte-copy (SHA-256 equality only). The three identity maps and the ReviewQueue are **net-new artifacts this plan defines** (Task 1) — they get their own ajv schemas for internal integrity, but they are NOT ledger entities and never touch the frozen validators.
3. **`actor` = `"migrated"`, `external_refs[].system` = `"file"`.** Both fields are free-form strings with no enum in the frozen schema, so both values are legal net-new usage (resolutions (d) and (f)). `migrated` is the actor on N14 migration/demotion session records; `{ system: "file", id: <path>, url: "" }` is the shape for the DevTails `artifacts/` and stray-manifest pointers (resolution (h)).
4. **`Thread: -` and stray artifacts route to ReviewQueue, held.** The frozen `Decision` requires a `Thread-Id`; a decision whose thread is unresolvable is flagged (never given a fabricated thread) and held for human assignment at review (resolutions (g)/(h)). Never drop, never relocate — pointers-not-payloads.
5. **Manifests live under `_migration/` in the target, committed.** `_migration/thread-map.json`, `_migration/decision-map.json`, `_migration/session-map.json`, `_migration/review-queue.json`, and the dry-run `plan.json`. They are the idempotency spine (committed to the orphan ref; for a `LocalDriver` target, plain files under `<store>/_migration/`). `_migration/` is a reserved top-level name, never a ledger record dir, so it never collides with `threads/`, `decisions/`, `sessions/`, `bindings/`, `index/`.
6. **Identity is minted once, timestamp-seeded.** Thread ULIDs come from `ulid`'s `monotonicFactory()` seeded with the derived `created_at` epoch ms (`mint(createdAtMs)`), so ids sort by creation time and same-ms collisions are impossible within a run. Decision `NNNN` = `String(max + 1).padStart(4, '0')` over the per-store `(date, lexical-filename)` sort. A re-run resolves slug→ULID / date-slug→NNNN through the committed manifest BEFORE minting — the Flyway "already applied" pattern.
7. **`created_at` derivation ladder (rung recorded per record):** rung 1 git first-commit date of the thread file → rung 2 earliest session date for the thread → rung 3 earliest decision date referencing the thread → rung 4 the thread's `updated:` field. The rung is stored on the ThreadMap entry so verification and review can see the provenance.
8. **Non-git target = `LocalDriver` plain files.** The frozen `selectDriver` returns `GitRefDriver` only for a git work tree; a non-git store migrates to `${CLAUDE_PLUGIN_DATA}/<project-key>/ledger` (plain files, `vcs_ref: null`, zero bindings). Migration NEVER auto-`git init`s a project (Amendment 3 documents this): git-backed continuity for a non-git project is an explicit human prerequisite (`git init` first, then migrate). Durability for the one gitignored, history-less store is provided by the mandatory pre-run tarball snapshot (batch order step 5), not by an implicit git repo.
9. **Orphan build is plumbing-primary on the deterministic root.** N18 builds the target with `git hash-object -w` → a temp-index `write-tree` → `commit-tree -p <root>` → `update-ref refs/heads/_ledger`, where `<root>` is the SAME deterministic orphan root Plan 02 mints (`commit-tree $EMPTY_TREE_SHA` under `LEDGER_INIT_IDENTITY`). Building on the identical root means Plan 02's bootstrap ADOPTS the pre-seeded ref as legitimate (Amendment 2) and reconcile/restore determinism checks pass. Every migration commit carries an `Op-Id: <ulid>` trailer and runs under `-c core.fsync=all -c core.fsyncMethod=fsync`.
10. **`--verify-only` runs V1–V4 against an emitted plan, no commit; `--rollback` deletes only the target.** `--verify-only` re-hashes the source, replays V1–V4 over a dry-run `plan.json` + its would-be tree, exits non-zero on any failure, and writes nothing to the target. `--rollback` (pre-cutover) is `git update-ref -d refs/heads/_ledger` (or `rm -rf` the `LocalDriver` store) — the v1 source was never touched, so rollback is deletion of the target and nothing more. Reversibility is structural, not scripted.
11. **`restore <target>` rebuilds a working store from the ledger ref.** Companion verb (V2-audit precedent): reads the committed orphan ref (default `refs/heads/_ledger`, override `--ref`) and materializes every record into `<target>` as a working store, then rebuilds the derived index; refuses a non-empty `<target>` unless `--force`. It is disaster-recovery for a lost working checkout, not part of the migration pipeline; it never reads a v1 store.
12. **Batch is whole-store, sequential, human-gated.** `migrate --all` drives the 8-group store order (pilot → small/medium → multi-worktree → gitignored-with-tarball → CLIENT-with-sentinel-GC → worktree-copies-skip → non-git-fallback-archive), one store at a time, each with its own manifests/target/plan/verification/cutover confirm. No sub-store record chunking (stores are tens of records; process serially, deterministically). No fully-unattended mode — every `--apply` is a conscious human action. Worktree copies are subset-verified then SKIPPED, never unioned (unioning resurrects superseded decisions — the worst corruption mode).
13. **Soak window is a recommendation, not a gate.** The archived v1 dir is kept ≥2 weeks of real resumes (expand-contract) before decommission; nothing enforces the number and it never blocks cutover. Decommission (retire v1 hooks, delete the archive) is a separate post-soak human checklist.

---

## File Structure (this plan creates)

- `src/migrate/schemas.mjs` — net-new ajv schemas: `planArtifactSchema`, `threadMapSchema`, `decisionMapSchema`, `sessionMapSchema`, `reviewQueueSchema`, plus `validatePlanArtifact`/`validateThreadMap`/… compiled validators. (Task 1)
- `src/migrate/inventory.mjs` — N1 store detection + exclusions. (Task 2)
- `src/migrate/dedup.mjs` — N2 canonical election, worktree subset-verify, HALT signals. (Task 3)
- `src/migrate/preconditions.mjs` — N3 per-store safety gate. (Task 3)
- `src/migrate/parse.mjs` — N4 thread/decision/PROJECT.md/session parsers + Key-Decisions expansion. (Task 4)
- `src/migrate/created-at.mjs` — N5 derivation ladder. (Task 5)
- `src/migrate/identity.mjs` — N6/N7 minting + ThreadMap/DecisionMap. (Task 6)
- `src/migrate/crossref.mjs` — N8/N9 reverse index + 15-surface rewrite plan. (Task 7)
- `src/migrate/emit.mjs` — N10–N15 emit threads/decisions/sessions/bindings/demotions/PROJECT.md into an in-memory `MigrationOutput`. (Task 8)
- `src/migrate/materialize.mjs` — N16/N18: orphan-build (plumbing) OR LocalDriver plain-file write + `rebuildIndex`. (Task 9)
- `src/migrate/verify.mjs` — N17 / V1–V5 harness. (Task 10)
- `src/migrate/review-report.mjs` — N19 ReviewQueue roll-up + human-readable migration report. (Task 11)
- `src/migrate/pipeline.mjs` — N0–N19 orchestration, dry-run vs apply, checkpoint/resume. (Task 12)
- `src/migrate/restore.mjs` — the `restore` verb. (Task 13)
- `bin/ledger-cli.mjs` — MODIFY: register `migrate`/`restore` verbs (Plan 03). (Task 12/13)
- `test/unit/migrate/*.test.mjs` — per-module unit tests (each task).
- `test/e2e/migration.e2e.test.mjs` — full pilot-store migration E2E. (Task 14)

Amendments (edits to sibling plans, shipped with this plan): Plan 02 `#ensureLedgerRef` (adopt pre-seeded ref); Plan 02 `selectDriver` + Plan 00:164 (non-git git-init prerequisite prose); Plan 04 Task 11 (v1-hook retirement, net-new); Plan 06 `fixtures.mjs` (migration fixture builder).

**Import paths:** every `src/migrate/*` module imports the frozen helpers that Plans 01–03 create. Because plan-07 executes only after Plans 01–03 are built, each imported symbol is cited by `plan:line` in the task's Interfaces block (the authoritative source of its name/signature). The import paths used in code below follow Plans 01–03's own module layout — `src/util/{ulid,atomic-write,git}.mjs`, `src/drivers/{layout,storage-driver,local-driver,git-ref-driver,select-driver}.mjs`, `src/schema/validate.mjs`, `src/index/build-index.mjs`, `src/model/{fsm,decision}.mjs` (or wherever those plans place `renderDecision`), `src/cli/run.mjs`, `src/tools/context.mjs`. Confirm each path against the sibling plan cited in the Interfaces block at implementation; a mismatched filename is a one-line import fix, never a logic change.

---

### Task 1: Net-new migration artifact schemas

**Files:**
- Create: `src/migrate/schemas.mjs`
- Test: `test/unit/migrate/schemas.test.mjs`

**Interfaces:**
- Consumes: `ajv` 8.20.0 (`new Ajv({ allErrors: true, strict: false })` — same options object as Plan 01's `src/schema/validate.mjs:786`), `ULID_PATTERN`/`ISO_PATTERN` (redeclared locally; identical to Plan 01:678-679 — these are net-new files and do not import from the frozen schema module).
- Produces: `validatePlanArtifact(obj)`, `validateThreadMap(obj)`, `validateDecisionMap(obj)`, `validateSessionMap(obj)`, `validateReviewQueue(obj)` — each throws `Error` with joined ajv messages on failure, returns the object on success (mirrors Plan 01's `validateThread` contract at `2026-06-30-continuity-v2-01-core-and-local-driver.md:791-796`). And the raw schema objects `planArtifactSchema`, `threadMapSchema`, `decisionMapSchema`, `sessionMapSchema`, `reviewQueueSchema` for reuse in tests.

- [ ] **Step 1: Write the failing test**

`test/unit/migrate/schemas.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  validateThreadMap,
  validateDecisionMap,
  validateSessionMap,
  validateReviewQueue,
  validatePlanArtifact,
} from '../../../src/migrate/schemas.mjs'

const ULID = '01JZ0000000000000000000000'

test('threadMap accepts a well-formed map and records the created_at rung', () => {
  const map = {
    schema_version: 1,
    store: 'Users-x-project',
    entries: [
      { slug: 'my-thread', id: ULID, created_at: '2026-06-30T12:00:00Z', created_at_rung: 2, title: 'My Thread' },
    ],
  }
  assert.equal(validateThreadMap(map), map)
})

test('threadMap rejects an out-of-range created_at rung', () => {
  const map = {
    schema_version: 1,
    store: 'x',
    entries: [{ slug: 's', id: ULID, created_at: '2026-06-30T12:00:00Z', created_at_rung: 5, title: 't' }],
  }
  assert.throws(() => validateThreadMap(map), /created_at_rung|enum/)
})

test('threadMap rejects a non-ULID id', () => {
  const map = {
    schema_version: 1,
    store: 'x',
    entries: [{ slug: 's', id: 'not-a-ulid', created_at: '2026-06-30T12:00:00Z', created_at_rung: 1, title: 't' }],
  }
  assert.throws(() => validateThreadMap(map), /pattern|id/)
})

test('decisionMap accepts NNNN + nullable thread_id', () => {
  const map = {
    schema_version: 1,
    store: 'x',
    entries: [
      { old_filename: '2026-06-30-a.md', nnnn: '0001', slug: 'a', thread_id: ULID },
      { old_filename: '2026-06-30-b.md', nnnn: '0002', slug: 'b', thread_id: null },
    ],
  }
  assert.equal(validateDecisionMap(map), map)
})

test('decisionMap rejects a non-4-digit NNNN', () => {
  const map = {
    schema_version: 1,
    store: 'x',
    entries: [{ old_filename: 'f.md', nnnn: '12', slug: 'a', thread_id: null }],
  }
  assert.throws(() => validateDecisionMap(map), /nnnn|pattern/)
})

test('sessionMap accepts a routed path and lossy_time flag', () => {
  const map = {
    schema_version: 1,
    store: 'x',
    entries: [
      {
        old_path: 'sessions/2026-06-30-01-a.md',
        new_path: `sessions/${ULID}/2026-06-30T00-01-00Z--migrated.md`,
        thread_id: ULID,
        lossy_time: true,
      },
    ],
  }
  assert.equal(validateSessionMap(map), map)
})

test('reviewQueue accepts each flag class and rejects an unknown one', () => {
  const good = {
    schema_version: 1,
    store: 'x',
    entries: [
      { id: ULID, record_type: 'decision', source_path: 'decisions/x.md', flag_class: 'MANUAL', reason: 'no Thread-Id', suggestion: 'assign at review', resolution_status: 'open' },
    ],
  }
  assert.equal(validateReviewQueue(good), good)
  const bad = { ...good, entries: [{ ...good.entries[0], flag_class: 'WHATEVER' }] }
  assert.throws(() => validateReviewQueue(bad), /flag_class|enum/)
})

test('planArtifact accepts a full dry-run plan', () => {
  const plan = {
    schema_version: 1,
    tool_version: '0.0.0',
    store_path: '/abs/store',
    project_key: 'x',
    backend: 'orphan-branch',
    source_inventory_hash: 'a'.repeat(64),
    baseline_counts: { threads: 1, decisions: 2, sessions: 3, bindings: 0 },
    source_checksums: [{ path: 'threads/t.md', sha256: 'b'.repeat(64) }],
    thread_map: { schema_version: 1, store: 'x', entries: [] },
    decision_map: { schema_version: 1, store: 'x', entries: [] },
    session_map: { schema_version: 1, store: 'x', entries: [] },
    binding_plan: [],
    cross_ref_rewrites: [{ surface: 1, old: 'decisions/a.md', new: '0001-a', class: 'DERIVED', status: 'resolved' }],
    review_queue: { schema_version: 1, store: 'x', entries: [] },
    flags: { lossy: 0, manual: 0, halt: 0 },
    verification: { v1: null, v2: null, v3: null, v4: null, v5: null },
  }
  assert.equal(validatePlanArtifact(plan), plan)
})

test('planArtifact rejects an unknown backend and a short inventory hash', () => {
  const base = {
    schema_version: 1, tool_version: '0.0.0', store_path: '/s', project_key: 'x',
    backend: 'orphan-branch', source_inventory_hash: 'a'.repeat(64),
    baseline_counts: { threads: 0, decisions: 0, sessions: 0, bindings: 0 },
    source_checksums: [], thread_map: { schema_version: 1, store: 'x', entries: [] },
    decision_map: { schema_version: 1, store: 'x', entries: [] },
    session_map: { schema_version: 1, store: 'x', entries: [] },
    binding_plan: [], cross_ref_rewrites: [],
    review_queue: { schema_version: 1, store: 'x', entries: [] },
    flags: { lossy: 0, manual: 0, halt: 0 },
    verification: { v1: null, v2: null, v3: null, v4: null, v5: null },
  }
  assert.throws(() => validatePlanArtifact({ ...base, backend: 'sqlite' }), /backend|enum/)
  assert.throws(() => validatePlanArtifact({ ...base, source_inventory_hash: 'short' }), /source_inventory_hash|pattern/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/migrate/schemas.test.mjs`
Expected: FAIL — cannot import from `../../../src/migrate/schemas.mjs` (module not found).

- [ ] **Step 3: Write the implementation**

`src/migrate/schemas.mjs`:

```js
import Ajv from 'ajv'

const ULID_PATTERN = '^[0-9A-HJKMNP-TV-Z]{26}$'
const ISO_PATTERN = '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}'
const SHA256_PATTERN = '^[0-9a-f]{64}$'
const NNNN_PATTERN = '^[0-9]{4}$'

const mapEnvelope = (entryItems) => ({
  type: 'object',
  additionalProperties: false,
  required: ['schema_version', 'store', 'entries'],
  properties: {
    schema_version: { const: 1 },
    store: { type: 'string', minLength: 1 },
    entries: { type: 'array', items: entryItems },
  },
})

export const threadMapSchema = {
  $id: 'migrate:thread-map',
  ...mapEnvelope({
    type: 'object',
    additionalProperties: false,
    required: ['slug', 'id', 'created_at', 'created_at_rung', 'title'],
    properties: {
      slug: { type: 'string', minLength: 1 },
      id: { type: 'string', pattern: ULID_PATTERN },
      created_at: { type: 'string', pattern: ISO_PATTERN },
      created_at_rung: { enum: [1, 2, 3, 4] },
      title: { type: 'string' },
    },
  }),
}

export const decisionMapSchema = {
  $id: 'migrate:decision-map',
  ...mapEnvelope({
    type: 'object',
    additionalProperties: false,
    required: ['old_filename', 'nnnn', 'slug', 'thread_id'],
    properties: {
      old_filename: { type: 'string', minLength: 1 },
      nnnn: { type: 'string', pattern: NNNN_PATTERN },
      slug: { type: 'string', minLength: 1 },
      thread_id: { type: ['string', 'null'], pattern: ULID_PATTERN },
    },
  }),
}

export const sessionMapSchema = {
  $id: 'migrate:session-map',
  ...mapEnvelope({
    type: 'object',
    additionalProperties: false,
    required: ['old_path', 'new_path', 'thread_id', 'lossy_time'],
    properties: {
      old_path: { type: 'string', minLength: 1 },
      new_path: { type: 'string', minLength: 1 },
      thread_id: { type: ['string', 'null'], pattern: ULID_PATTERN },
      lossy_time: { type: 'boolean' },
    },
  }),
}

export const reviewQueueSchema = {
  $id: 'migrate:review-queue',
  ...mapEnvelope({
    type: 'object',
    additionalProperties: false,
    required: ['id', 'record_type', 'source_path', 'flag_class', 'reason', 'suggestion', 'resolution_status'],
    properties: {
      id: { type: 'string', pattern: ULID_PATTERN },
      record_type: { enum: ['thread', 'decision', 'session', 'binding', 'artifact', 'projectmd'] },
      source_path: { type: 'string', minLength: 1 },
      flag_class: { enum: ['LOSSY', 'MANUAL', 'HALT'] },
      reason: { type: 'string', minLength: 1 },
      suggestion: { type: 'string' },
      resolution_status: { enum: ['open', 'resolved', 'deferred'] },
    },
  }),
}

export const planArtifactSchema = {
  $id: 'migrate:plan-artifact',
  type: 'object',
  additionalProperties: false,
  required: [
    'schema_version', 'tool_version', 'store_path', 'project_key', 'backend',
    'source_inventory_hash', 'baseline_counts', 'source_checksums',
    'thread_map', 'decision_map', 'session_map', 'binding_plan',
    'cross_ref_rewrites', 'review_queue', 'flags', 'verification',
  ],
  properties: {
    schema_version: { const: 1 },
    tool_version: { type: 'string', minLength: 1 },
    store_path: { type: 'string', minLength: 1 },
    project_key: { type: 'string', minLength: 1 },
    backend: { enum: ['orphan-branch', 'local'] },
    source_inventory_hash: { type: 'string', pattern: SHA256_PATTERN },
    baseline_counts: {
      type: 'object',
      additionalProperties: false,
      required: ['threads', 'decisions', 'sessions', 'bindings'],
      properties: {
        threads: { type: 'integer', minimum: 0 },
        decisions: { type: 'integer', minimum: 0 },
        sessions: { type: 'integer', minimum: 0 },
        bindings: { type: 'integer', minimum: 0 },
      },
    },
    source_checksums: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['path', 'sha256'],
        properties: {
          path: { type: 'string', minLength: 1 },
          sha256: { type: 'string', pattern: SHA256_PATTERN },
        },
      },
    },
    thread_map: threadMapSchema,
    decision_map: decisionMapSchema,
    session_map: sessionMapSchema,
    binding_plan: { type: 'array', items: { type: 'object' } },
    cross_ref_rewrites: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['surface', 'old', 'new', 'class', 'status'],
        properties: {
          surface: { type: 'integer', minimum: 1, maximum: 15 },
          old: { type: 'string' },
          new: { type: 'string' },
          class: { enum: ['PARSED', 'DERIVED', 'MANUAL', 'SYNTHESIZED'] },
          status: { enum: ['resolved', 'halt'] },
        },
      },
    },
    review_queue: reviewQueueSchema,
    flags: {
      type: 'object',
      additionalProperties: false,
      required: ['lossy', 'manual', 'halt'],
      properties: {
        lossy: { type: 'integer', minimum: 0 },
        manual: { type: 'integer', minimum: 0 },
        halt: { type: 'integer', minimum: 0 },
      },
    },
    verification: {
      type: 'object',
      additionalProperties: false,
      required: ['v1', 'v2', 'v3', 'v4', 'v5'],
      properties: {
        v1: { type: ['object', 'null'] },
        v2: { type: ['object', 'null'] },
        v3: { type: ['object', 'null'] },
        v4: { type: ['object', 'null'] },
        v5: { type: ['object', 'null'] },
      },
    },
  },
}

const ajv = new Ajv({ allErrors: true, strict: false })
const compiled = {
  planArtifact: ajv.compile(planArtifactSchema),
  threadMap: ajv.compile(threadMapSchema),
  decisionMap: ajv.compile(decisionMapSchema),
  sessionMap: ajv.compile(sessionMapSchema),
  reviewQueue: ajv.compile(reviewQueueSchema),
}

function formatErrors(errors) {
  return (errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ')
}

function makeValidator(kind, label) {
  const check = compiled[kind]
  return (obj) => {
    if (!check(obj)) {
      throw new Error(`invalid ${label}: ${formatErrors(check.errors)}`)
    }
    return obj
  }
}

export const validatePlanArtifact = makeValidator('planArtifact', 'plan artifact')
export const validateThreadMap = makeValidator('threadMap', 'ThreadMap')
export const validateDecisionMap = makeValidator('decisionMap', 'DecisionMap')
export const validateSessionMap = makeValidator('sessionMap', 'SessionMap')
export const validateReviewQueue = makeValidator('reviewQueue', 'ReviewQueue')
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/migrate/schemas.test.mjs`
Expected: PASS — all 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/migrate/schemas.mjs test/unit/migrate/schemas.test.mjs
git commit -m "feat: add net-new migration manifest and plan-artifact schemas"
```

---

### Task 2: v1 store inventory + exclusions (N1)

**Files:**
- Create: `src/migrate/inventory.mjs`
- Test: `test/unit/migrate/inventory.test.mjs`

**Interfaces:**
- Consumes: `node:fs/promises` (`readdir`, `access`), `node:path`. Pure filesystem scan — no Plan 01–03 imports; a v1 store is detected by shape, never by a driver.
- Produces: `discoverStores(root)` → sorted `[{ path, kind }]` where `kind ∈ {'ledger','project-md-only'}`; `isV1Store(dir)` → boolean; `EXCLUDE_SEGMENTS` constant. N1 detects every candidate v1 ledger under `root` and EXCLUDES any path with a `graphify-out` (or `node_modules`/`.git`) segment at ANY depth and the packaged skills example store (a `skills/**/example*` leaf). A candidate is a directory that holds a `PROJECT.md` OR any of the `threads/`/`decisions/`/`sessions/` record subdirs.

- [ ] **Step 1: Write the failing test**

`test/unit/migrate/inventory.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { discoverStores, isV1Store } from '../../../src/migrate/inventory.mjs'

async function scaffold() {
  const root = await mkdtemp(join(tmpdir(), 'inv-'))
  const store = join(root, '.claude', 'ledger')
  await mkdir(join(store, 'threads'), { recursive: true })
  await mkdir(join(store, 'decisions'), { recursive: true })
  await mkdir(join(store, 'sessions'), { recursive: true })
  await writeFile(join(store, 'PROJECT.md'), '# PROJECT\n')
  await writeFile(join(store, 'threads', 'a.md'), '# a\n')
  return { root, store }
}

test('discovers a v1 ledger store by its PROJECT.md and record dirs', async () => {
  const { root, store } = await scaffold()
  const found = await discoverStores(root)
  assert.deepEqual(found.map((s) => s.path), [store])
  assert.equal(found[0].kind, 'ledger')
  await rm(root, { recursive: true, force: true })
})

test('excludes any graphify-out directory at any depth', async () => {
  const { root } = await scaffold()
  const buried = join(root, 'graphify-out', '.claude', 'ledger')
  await mkdir(join(buried, 'threads'), { recursive: true })
  await writeFile(join(buried, 'PROJECT.md'), '# x\n')
  const nested = join(root, 'pkg', 'graphify-out', 'ledger')
  await mkdir(join(nested, 'threads'), { recursive: true })
  await writeFile(join(nested, 'PROJECT.md'), '# y\n')
  const found = await discoverStores(root)
  assert.ok(!found.some((s) => s.path.includes('graphify-out')))
  await rm(root, { recursive: true, force: true })
})

test('excludes the packaged skills example store', async () => {
  const { root } = await scaffold()
  const example = join(root, 'skills', 'continuity', 'example-ledger')
  await mkdir(join(example, 'threads'), { recursive: true })
  await writeFile(join(example, 'PROJECT.md'), '# example\n')
  const found = await discoverStores(root)
  assert.ok(!found.some((s) => s.path.includes('example-ledger')))
  await rm(root, { recursive: true, force: true })
})

test('a PROJECT.md-only directory is discovered as project-md-only', async () => {
  const root = await mkdtemp(join(tmpdir(), 'inv-pmo-'))
  const store = join(root, 'notes')
  await mkdir(store, { recursive: true })
  await writeFile(join(store, 'PROJECT.md'), '# only\n')
  const found = await discoverStores(root)
  assert.deepEqual(found.map((s) => [s.path, s.kind]), [[store, 'project-md-only']])
  await rm(root, { recursive: true, force: true })
})

test('isV1Store is false for an empty directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'inv-empty-'))
  assert.equal(await isV1Store(root), false)
  await rm(root, { recursive: true, force: true })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/migrate/inventory.test.mjs`
Expected: FAIL — cannot import from `../../../src/migrate/inventory.mjs` (module not found).

- [ ] **Step 3: Write the implementation**

`src/migrate/inventory.mjs`:

```js
import { readdir, access } from 'node:fs/promises'
import { join, sep } from 'node:path'

export const EXCLUDE_SEGMENTS = ['graphify-out', 'node_modules', '.git']

function hasExcludedSegment(path) {
  return path.split(sep).some((seg) => EXCLUDE_SEGMENTS.includes(seg))
}

function isSkillsExample(path) {
  const segs = path.split(sep)
  const at = segs.indexOf('skills')
  if (at === -1) {
    return false
  }
  return segs.slice(at + 1).some((seg) => /^example/.test(seg))
}

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export async function isV1Store(dir) {
  if (await exists(join(dir, 'PROJECT.md'))) {
    return true
  }
  for (const sub of ['threads', 'decisions', 'sessions']) {
    if (await exists(join(dir, sub))) {
      return true
    }
  }
  return false
}

export async function discoverStores(root) {
  const out = []
  async function walk(dir) {
    if (hasExcludedSegment(dir) || isSkillsExample(dir)) {
      return
    }
    if (await isV1Store(dir)) {
      const kind = (await exists(join(dir, 'threads'))) ? 'ledger' : 'project-md-only'
      out.push({ path: dir, kind })
      return
    }
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        await walk(join(dir, e.name))
      }
    }
  }
  await walk(root)
  return out.sort((a, b) => a.path.localeCompare(b.path))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/migrate/inventory.test.mjs`
Expected: PASS — 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/migrate/inventory.mjs test/unit/migrate/inventory.test.mjs
git commit -m "feat: add v1 store inventory with graphify-out and skills-example exclusions"
```

---

### Task 3: canonical dedup election + per-store precondition gate (N2, N3)

**Files:**
- Create: `src/migrate/dedup.mjs`, `src/migrate/preconditions.mjs`
- Test: `test/unit/migrate/dedup.test.mjs`, `test/unit/migrate/preconditions.test.mjs`

**Interfaces:**
- Consumes: `node:fs/promises` (`readdir`, `readFile`), `node:path`.
- Produces (dedup / N2): `electCanonical(stores)` → `{ canonical, copies }` (primary worktree wins, then shortest path); `subsetVerify(canonicalPath, copyPath)` → `{ subset, onlyInCopy, disposition }` where a copy whose record set is a subset is dispositioned `SKIP` and a copy carrying any record ABSENT from canonical is dispositioned `HALT` with the `onlyInCopy` list (never unioned — decision 12). A non-git store's disposition is `archive` (handled by the pipeline, not here).
- Produces (preconditions / N3): `checkPreconditions(storePath)` → `{ ok, halts, zombieActive }`. A compact/checkpoint sentinel means the store is not quiescent → `HALT`. Threads at `status: active` are catalogued as `zombieActive` (an anomaly under the this-session-only semantic) but never block — they are demoted at emit (N14).

- [ ] **Step 1: Write the failing tests**

`test/unit/migrate/dedup.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { electCanonical, subsetVerify } from '../../../src/migrate/dedup.mjs'

async function storeWith(files) {
  const dir = await mkdtemp(join(tmpdir(), 'dedup-'))
  await mkdir(join(dir, 'threads'), { recursive: true })
  for (const f of files) {
    await writeFile(join(dir, 'threads', f), '# x\n')
  }
  return dir
}

test('electCanonical prefers the primary worktree, then the shortest path', () => {
  const stores = [
    { path: '/a/b/copy', isPrimaryWorktree: false },
    { path: '/a', isPrimaryWorktree: true },
    { path: '/a/b', isPrimaryWorktree: false },
  ]
  const { canonical, copies } = electCanonical(stores)
  assert.equal(canonical.path, '/a')
  assert.deepEqual(copies.map((c) => c.path), ['/a/b', '/a/b/copy'])
})

test('a copy whose records are a subset is dispositioned SKIP', async () => {
  const canon = await storeWith(['t1.md', 't2.md'])
  const copy = await storeWith(['t1.md'])
  const r = await subsetVerify(canon, copy)
  assert.equal(r.subset, true)
  assert.equal(r.disposition, 'SKIP')
  await rm(canon, { recursive: true, force: true })
  await rm(copy, { recursive: true, force: true })
})

test('a copy with a record absent from canonical HALTs and lists only-in-copy', async () => {
  const canon = await storeWith(['t1.md'])
  const copy = await storeWith(['t1.md', 't9.md'])
  const r = await subsetVerify(canon, copy)
  assert.equal(r.subset, false)
  assert.equal(r.disposition, 'HALT')
  assert.deepEqual(r.onlyInCopy, ['threads/t9.md'])
  await rm(canon, { recursive: true, force: true })
  await rm(copy, { recursive: true, force: true })
})
```

`test/unit/migrate/preconditions.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkPreconditions } from '../../../src/migrate/preconditions.mjs'

async function store() {
  const dir = await mkdtemp(join(tmpdir(), 'pre-'))
  await mkdir(join(dir, 'threads'), { recursive: true })
  await mkdir(join(dir, 'sessions'), { recursive: true })
  return dir
}

test('a quiescent store with no active thread passes', async () => {
  const dir = await store()
  await writeFile(join(dir, 'threads', 'a.md'), 'Status: paused\n')
  const r = await checkPreconditions(dir)
  assert.equal(r.ok, true)
  assert.deepEqual(r.halts, [])
  assert.deepEqual(r.zombieActive, [])
  await rm(dir, { recursive: true, force: true })
})

test('a compact sentinel HALTs the store', async () => {
  const dir = await store()
  await writeFile(join(dir, 'sessions', '.compact-pending'), '')
  const r = await checkPreconditions(dir)
  assert.equal(r.ok, false)
  assert.match(r.halts[0].reason, /compact sentinel/)
  await rm(dir, { recursive: true, force: true })
})

test('an active thread is catalogued as a zombie but does not block', async () => {
  const dir = await store()
  await writeFile(join(dir, 'threads', 'z.md'), '# z\nStatus: active\n')
  const r = await checkPreconditions(dir)
  assert.equal(r.ok, true)
  assert.deepEqual(r.zombieActive, ['z.md'])
  await rm(dir, { recursive: true, force: true })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/unit/migrate/dedup.test.mjs test/unit/migrate/preconditions.test.mjs`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the implementations**

`src/migrate/dedup.mjs`:

```js
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

async function recordSet(store) {
  const names = new Set()
  for (const sub of ['threads', 'decisions', 'sessions']) {
    let files
    try {
      files = await readdir(join(store, sub))
    } catch {
      files = []
    }
    for (const f of files) {
      if (f.endsWith('.md')) {
        names.add(`${sub}/${f}`)
      }
    }
  }
  return names
}

export function electCanonical(stores) {
  const sorted = [...stores].sort((a, b) => {
    if (a.isPrimaryWorktree !== b.isPrimaryWorktree) {
      return a.isPrimaryWorktree ? -1 : 1
    }
    return a.path.length - b.path.length
  })
  const [canonical, ...copies] = sorted
  return { canonical, copies }
}

export async function subsetVerify(canonicalPath, copyPath) {
  const canon = await recordSet(canonicalPath)
  const copy = await recordSet(copyPath)
  const onlyInCopy = [...copy].filter((name) => !canon.has(name)).sort()
  return {
    subset: onlyInCopy.length === 0,
    onlyInCopy,
    disposition: onlyInCopy.length === 0 ? 'SKIP' : 'HALT',
  }
}
```

`src/migrate/preconditions.mjs`:

```js
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const SENTINEL_NAMES = ['.compact-pending', '.checkpoint', 'CHECKPOINT']
const ACTIVE = /^\s*(?:status|Status):\s*active\s*$/m

async function listSentinels(store) {
  const hits = []
  for (const dir of ['', 'sessions']) {
    const base = dir === '' ? store : join(store, dir)
    let files
    try {
      files = await readdir(base)
    } catch {
      continue
    }
    for (const f of files) {
      if (SENTINEL_NAMES.includes(f)) {
        hits.push(dir === '' ? f : join(dir, f))
      }
    }
  }
  return hits
}

async function catalogueActiveThreads(store) {
  let files
  try {
    files = await readdir(join(store, 'threads'))
  } catch {
    return []
  }
  const active = []
  for (const f of files) {
    if (!f.endsWith('.md')) {
      continue
    }
    if (ACTIVE.test(await readFile(join(store, 'threads', f), 'utf8'))) {
      active.push(f)
    }
  }
  return active.sort()
}

export async function checkPreconditions(store) {
  const sentinels = await listSentinels(store)
  const zombieActive = await catalogueActiveThreads(store)
  const halts = sentinels.map((path) => ({
    reason: 'compact sentinel present; store is not quiescent',
    path,
  }))
  return { ok: halts.length === 0, halts, zombieActive }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/unit/migrate/dedup.test.mjs test/unit/migrate/preconditions.test.mjs`
Expected: PASS — 3 dedup tests + 3 precondition tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/migrate/dedup.mjs src/migrate/preconditions.mjs test/unit/migrate/dedup.test.mjs test/unit/migrate/preconditions.test.mjs
git commit -m "feat: add v1 dedup election and per-store precondition gate"
```

---

### Task 4: v1 markdown parsers (N4)

**Files:**
- Create: `src/migrate/parse.mjs`
- Test: `test/unit/migrate/parse.test.mjs`

**Interfaces:**
- Consumes: nothing (pure string parsing).
- Produces: `parseThread(markdown, filename)` (handles both thread generations — YAML frontmatter and inline `Status:`/`Updated:` fields — extracting slug, title, status, updated, spine, completion_criteria, key_decisions, external_refs); `parseDecision(markdown, filename)` (handles the four decision header generations, extracting date, slug, title, threadRef, context, options, outcome); `parseProjectMd(markdown)` (Active-Decisions index expander + thread index + count oracles); `censusSessions(filenames)` (session filename census, lexical-order preserving); `expandKeyDecisions(spine)` (Key-Decisions reference expansion). No fact is fabricated — an unresolvable field is returned `null`/empty for the pipeline to route to ReviewQueue.

- [ ] **Step 1: Write the failing test**

`test/unit/migrate/parse.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseThread, parseDecision, parseProjectMd, censusSessions, expandKeyDecisions,
} from '../../../src/migrate/parse.mjs'

test('parseThread reads generation 1 (YAML frontmatter)', () => {
  const md = [
    '---', 'slug: auth-refactor', 'title: Auth refactor', 'status: paused', 'updated: 2026-06-10', '---',
    '# Auth refactor', 'Active Goal: ship auth', 'Next Step: write tests',
  ].join('\n')
  const t = parseThread(md, 'auth-refactor.md')
  assert.equal(t.slug, 'auth-refactor')
  assert.equal(t.title, 'Auth refactor')
  assert.equal(t.status, 'paused')
  assert.equal(t.updated, '2026-06-10')
  assert.equal(t.spine.active_goal, 'ship auth')
  assert.equal(t.spine.next_step, 'write tests')
})

test('parseThread reads generation 2 (inline fields, no frontmatter)', () => {
  const md = ['# Cache layer', 'Status: blocked', 'Updated: 2026-06-11', 'Next Step: pick a store'].join('\n')
  const t = parseThread(md, 'cache-layer.md')
  assert.equal(t.slug, 'cache-layer')
  assert.equal(t.title, 'Cache layer')
  assert.equal(t.status, 'blocked')
  assert.equal(t.updated, '2026-06-11')
})

test('parseThread reads checkbox completion criteria', () => {
  const md = ['# t', 'Status: paused', '- [x] design done', '- [ ] tests green'].join('\n')
  const t = parseThread(md, 't.md')
  assert.deepEqual(t.completion_criteria, [
    { text: 'design done', done: true },
    { text: 'tests green', done: false },
  ])
})

test('parseDecision reads the NNNN header generation and Thread-Id', () => {
  const md = [
    '# 0003 — Pick argon2', 'Status: accepted', 'Thread-Id: auth-refactor',
    '## Context and Problem', 'need a hash', '## Considered Options', '- bcrypt', '- argon2',
    '## Decision Outcome', 'argon2',
  ].join('\n')
  const d = parseDecision(md, '2026-06-02-pick-argon2.md')
  assert.equal(d.date, '2026-06-02')
  assert.equal(d.slug, 'pick-argon2')
  assert.equal(d.title, 'Pick argon2')
  assert.equal(d.threadRef, 'auth-refactor')
  assert.deepEqual(d.options, ['bcrypt', 'argon2'])
  assert.equal(d.outcome, 'argon2')
})

test('parseDecision reads the "Decision:" header generation', () => {
  const md = ['# Decision: adopt event sourcing', 'Thread: billing'].join('\n')
  const d = parseDecision(md, '2026-05-01-adopt-es.md')
  assert.equal(d.title, 'adopt event sourcing')
  assert.equal(d.threadRef, 'billing')
})

test('parseProjectMd expands the Active-Decisions index and reads count oracles', () => {
  const md = [
    '# PROJECT', '2 threads / 3 decisions', '',
    '## Active Decisions', '- 0001-pick-argon2', '- 0002-adopt-es',
  ].join('\n')
  const p = parseProjectMd(md)
  assert.deepEqual(p.activeDecisions, [
    { nnnn: '0001', slug: 'pick-argon2' },
    { nnnn: '0002', slug: 'adopt-es' },
  ])
  assert.equal(p.counts.threads, 2)
  assert.equal(p.counts.decisions, 3)
})

test('censusSessions parses and lexically orders session filenames', () => {
  const c = censusSessions([
    '2026-06-05-02-auth-refactor.md',
    '2026-06-05-01-auth-refactor.md',
    'not-a-session.md',
  ])
  assert.deepEqual(c.map((s) => s.seq), ['01', '02'])
  assert.equal(c[0].threadSlug, 'auth-refactor')
})

test('expandKeyDecisions resolves dated decision references', () => {
  const refs = expandKeyDecisions({ key_decisions: ['see 2026-06-02-pick-argon2', 'freeform note'] })
  assert.equal(refs[0].date, '2026-06-02')
  assert.equal(refs[0].slug, 'pick-argon2')
  assert.equal(refs[1].date, null)
})

test('parseThread reads parent and predecessor lineage surfaces', () => {
  const md = ['---', 'slug: child', 'title: Child', 'status: paused', 'parent: epic', 'predecessor: old-thread', '---', '# Child'].join('\n')
  const t = parseThread(md, 'child.md')
  assert.equal(t.parent, 'epic')
  assert.equal(t.predecessor, 'old-thread')
})

test('parseDecision reads supersession surfaces and treats (none) as null', () => {
  const md = ['# 0005 — Redo', 'Thread-Id: t', 'Supersedes: 0004-old', 'Superseded-by: (none)', '## Decision Outcome', 'x'].join('\n')
  const d = parseDecision(md, '2026-06-10-redo.md')
  assert.equal(d.supersedes, '0004-old')
  assert.equal(d.supersededBy, null)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/migrate/parse.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/migrate/parse.mjs`:

```js
const FM_BLOCK = /^---\n([\s\S]*?)\n---\n?/

function parseFrontmatter(markdown) {
  const m = FM_BLOCK.exec(markdown)
  if (!m) {
    return { fields: {}, body: markdown }
  }
  const fields = {}
  for (const line of m[1].split('\n')) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line)
    if (kv) {
      fields[kv[1].toLowerCase()] = kv[2].trim()
    }
  }
  return { fields, body: markdown.slice(m[0].length) }
}

function inlineField(body, name) {
  const m = new RegExp(`^\\s*${name}:\\s*(.+)$`, 'im').exec(body)
  return m ? m[1].trim() : null
}

function listField(body, label) {
  const block = new RegExp(`${label}:\\s*\\n((?:\\s*[-*].*\\n?)*)`, 'i').exec(body)
  if (!block) {
    return []
  }
  return block[1]
    .split('\n')
    .map((l) => /^\s*[-*]\s*(.*)$/.exec(l))
    .filter(Boolean)
    .map((mm) => mm[1].trim())
    .filter((s) => s.length > 0)
}

function parseSpine(body) {
  return {
    status: inlineField(body, 'Status') ?? '',
    active_goal: inlineField(body, 'Active Goal') ?? '',
    next_step: inlineField(body, 'Next Step') ?? '',
    open_risks: listField(body, 'Open Risks'),
    key_decisions: listField(body, 'Key Decisions'),
    out_of_scope: listField(body, 'Out of Scope'),
  }
}

export function parseThread(markdown, filename) {
  const { fields, body } = parseFrontmatter(markdown)
  const slug = (fields.slug || filename.replace(/\.md$/, '')).trim()
  const heading = /^#\s+(.*)$/m.exec(body)
  const title = (fields.title || (heading ? heading[1] : slug)).trim()
  const status = (fields.status || inlineField(body, 'Status') || 'paused').trim().toLowerCase()
  const updated = fields.updated || inlineField(body, 'Updated') || null
  const spine = parseSpine(body)
  const completion_criteria = (body.match(/^\s*[-*]\s*\[([ xX])\]\s*(.+)$/gm) || []).map((line) => {
    const mm = /\[([ xX])\]\s*(.+)$/.exec(line)
    return { text: mm[2].trim(), done: mm[1].toLowerCase() === 'x' }
  })
  const parent = (fields.parent || inlineField(body, 'Parent') || '').trim() || null
  const predecessor = (fields.predecessor || inlineField(body, 'Predecessor') || '').trim() || null
  return {
    slug, title, status, updated, spine,
    completion_criteria,
    key_decisions: spine.key_decisions,
    parent, predecessor,
    external_refs: [],
  }
}

const DECISION_HEADERS = [
  /^#\s*(\d{4})\s*[—-]\s*(.+)$/m,
  /^#\s*Decision:\s*(.+)$/m,
  /^#\s*(\d{4}-\d{2}-\d{2})\s+(.+)$/m,
  /^##?\s*(.+)$/m,
]

function section(markdown, label) {
  const m = new RegExp(`##\\s*${label}[^\\n]*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, 'i').exec(markdown)
  return m ? m[1].trim() : ''
}

export function parseDecision(markdown, filename) {
  const fn = /^(\d{4}-\d{2}-\d{2})-(.+)\.md$/.exec(filename)
  const date = fn ? fn[1] : (inlineField(markdown, 'Date') || null)
  const slug = fn ? fn[2] : filename.replace(/\.md$/, '')
  let title = slug
  for (const re of DECISION_HEADERS) {
    const m = re.exec(markdown)
    if (m) {
      title = (m[2] ?? m[1]).trim()
      break
    }
  }
  const threadRef = inlineField(markdown, 'Thread-Id') || inlineField(markdown, 'Thread')
  const options = (section(markdown, 'Considered Options').match(/^\s*[-*]\s*(.+)$/gm) || [])
    .map((l) => l.replace(/^\s*[-*]\s*/, '').trim())
  const cleanRef = (v) => (v && v.trim() && v.trim() !== '(none)' ? v.trim() : null)
  const supersedes = cleanRef(inlineField(markdown, 'Supersedes'))
  const supersededBy = cleanRef(inlineField(markdown, 'Superseded-by') || inlineField(markdown, 'Superseded-By'))
  return {
    date,
    slug,
    title,
    threadRef: threadRef ? threadRef.trim() : null,
    context: section(markdown, 'Context'),
    options,
    outcome: section(markdown, 'Decision Outcome') || section(markdown, 'Outcome'),
    supersedes,
    supersededBy,
  }
}

export function parseProjectMd(markdown) {
  const activeDecisions = []
  const idx = /Active Decisions[^\n]*\n([\s\S]*?)(?=\n#|$)/i.exec(markdown)
  if (idx) {
    const re = /(\d{4})-([a-z0-9][a-z0-9-]*)/gi
    let m
    while ((m = re.exec(idx[1])) !== null) {
      activeDecisions.push({ nnnn: m[1], slug: m[2] })
    }
  }
  const threadIndex = (markdown.match(/^\s*[-*]\s*\[([^\]]+)\]\(([^)]+)\)/gm) || []).map((line) => {
    const m = /\[([^\]]+)\]\(([^)]+)\)/.exec(line)
    return { label: m[1].trim(), target: m[2].trim() }
  })
  const oracle = (label) => {
    const m = new RegExp(`(\\d+)\\s+${label}`, 'i').exec(markdown)
    return m ? Number(m[1]) : null
  }
  const epicChildren = []
  const childBlock = /(?:Epic Children|Children)[^\n]*\n((?:\s*[-*].*\n?)*)/i.exec(markdown)
  if (childBlock) {
    for (const line of childBlock[1].split('\n')) {
      const m = /^\s*[-*]\s*([a-z0-9][a-z0-9-]*)\s*$/i.exec(line)
      if (m) {
        epicChildren.push(m[1].trim())
      }
    }
  }
  return {
    activeDecisions,
    threadIndex,
    epicChildren,
    counts: { threads: oracle('threads'), decisions: oracle('decisions') },
  }
}

export function censusSessions(filenames) {
  return filenames
    .map((filename) => {
      const m = /^(\d{4}-\d{2}-\d{2})-(\d{2})-(.+)\.md$/.exec(filename)
      return m ? { date: m[1], seq: m[2], threadSlug: m[3], filename } : null
    })
    .filter(Boolean)
    .sort((a, b) => (a.date === b.date ? a.seq.localeCompare(b.seq) : a.date.localeCompare(b.date)))
}

export function expandKeyDecisions(spine) {
  return (spine.key_decisions ?? []).map((raw) => {
    const m = /(\d{4}-\d{2}-\d{2})-([a-z0-9][a-z0-9-]*)/i.exec(raw)
    return m ? { date: m[1], slug: m[2], raw } : { date: null, slug: null, raw }
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/migrate/parse.test.mjs`
Expected: PASS — 10 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/migrate/parse.mjs test/unit/migrate/parse.test.mjs
git commit -m "feat: add multi-generation v1 thread/decision/PROJECT.md parsers"
```

---

### Task 5: created_at derivation ladder (N5)

**Files:**
- Create: `src/migrate/created-at.mjs`
- Test: `test/unit/migrate/created-at.test.mjs`

**Interfaces:**
- Consumes: the shared `git` exec util at implementation (`../util/git-exec.mjs`, cited from Plan 02:342/Plan 01 `git`) — injected as a resolved date so the derivation itself is git-free and deterministic in unit tests.
- Produces: `deriveCreatedAt({ gitDate, sessions, decisions, updated })` → `{ created_at, rung }` walking the four-rung ladder (1 git first-commit date → 2 earliest session date → 3 earliest decision date → 4 the thread `updated:` field) and RECORDING the rung; `gitFirstCommitDate(git, repoDir, relPath)` (the rung-1 resolver, `git log --reverse --format=%aI`); `earliestSessionDate(sessions)` / `earliestDecisionDate(decisions)`. Exhausting all four rungs throws — a store that cannot supply any timestamp is a HALT, never a fabricated date.

- [ ] **Step 1: Write the failing test**

`test/unit/migrate/created-at.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveCreatedAt, earliestSessionDate } from '../../../src/migrate/created-at.mjs'

test('rung 1 uses the git first-commit date when present', async () => {
  const r = await deriveCreatedAt({
    gitDate: '2026-06-01T09:00:00Z',
    sessions: [{ date: '2026-06-05' }],
    decisions: [{ date: '2026-06-03' }],
    updated: '2026-06-10',
  })
  assert.deepEqual(r, { created_at: '2026-06-01T09:00:00Z', rung: 1 })
})

test('rung 2 falls back to the earliest session date', async () => {
  const r = await deriveCreatedAt({
    gitDate: null,
    sessions: [{ date: '2026-06-05' }, { date: '2026-06-02' }],
    decisions: [{ date: '2026-06-03' }],
    updated: '2026-06-10',
  })
  assert.deepEqual(r, { created_at: '2026-06-02T00:00:00Z', rung: 2 })
})

test('rung 3 falls back to the earliest decision date', async () => {
  const r = await deriveCreatedAt({ gitDate: null, sessions: [], decisions: [{ date: '2026-06-03' }], updated: '2026-06-10' })
  assert.deepEqual(r, { created_at: '2026-06-03T00:00:00Z', rung: 3 })
})

test('rung 4 falls back to the updated field', async () => {
  const r = await deriveCreatedAt({ gitDate: null, sessions: [], decisions: [], updated: '2026-06-10' })
  assert.deepEqual(r, { created_at: '2026-06-10T00:00:00Z', rung: 4 })
})

test('exhausting all rungs throws', async () => {
  await assert.rejects(
    () => deriveCreatedAt({ gitDate: null, sessions: [], decisions: [], updated: null }),
    /derivation exhausted/,
  )
})

test('earliestSessionDate returns null for no sessions', () => {
  assert.equal(earliestSessionDate([]), null)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/migrate/created-at.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/migrate/created-at.mjs`:

```js
export async function gitFirstCommitDate(git, repoDir, relPath) {
  try {
    const out = await git(['log', '--reverse', '--format=%aI', '--', relPath], { cwd: repoDir })
    const first = out.split('\n').find((l) => l.trim() !== '')
    return first ? first.trim() : null
  } catch {
    return null
  }
}

export function earliestSessionDate(sessions) {
  const dates = (sessions ?? []).map((s) => s.date).filter(Boolean).sort()
  return dates.length ? `${dates[0]}T00:00:00Z` : null
}

export function earliestDecisionDate(decisions) {
  const dates = (decisions ?? []).map((d) => d.date).filter(Boolean).sort()
  return dates.length ? `${dates[0]}T00:00:00Z` : null
}

function normalizeUpdated(updated) {
  if (!updated) {
    return null
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(updated)) {
    return updated
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(updated)) {
    return `${updated}T00:00:00Z`
  }
  return null
}

export async function deriveCreatedAt({ gitDate, sessions, decisions, updated }) {
  if (gitDate) {
    return { created_at: gitDate, rung: 1 }
  }
  const s = earliestSessionDate(sessions)
  if (s) {
    return { created_at: s, rung: 2 }
  }
  const d = earliestDecisionDate(decisions)
  if (d) {
    return { created_at: d, rung: 3 }
  }
  const u = normalizeUpdated(updated)
  if (u) {
    return { created_at: u, rung: 4 }
  }
  throw new Error('created_at derivation exhausted all four rungs; store cannot supply a timestamp')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/migrate/created-at.test.mjs`
Expected: PASS — 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/migrate/created-at.mjs test/unit/migrate/created-at.test.mjs
git commit -m "feat: add four-rung created_at derivation ladder with recorded rung"
```

---

### Task 6: identity minting — ThreadMap + DecisionMap (N6, N7)

**Files:**
- Create: `src/migrate/identity.mjs`
- Test: `test/unit/migrate/identity.test.mjs`

**Interfaces:**
- Consumes: `ulid` 3.0.2 `monotonicFactory`; `validateThreadMap`/`validateDecisionMap` (Task 1).
- Produces: `mintThreadMap(store, threads, existing?)` → a validated ThreadMap whose ULIDs come from a `monotonicFactory()` seeded per record with the derived `created_at` epoch ms (`mint(createdAtMs)`) after sorting ascending by `created_at` — so ids sort by creation time and same-ms threads still mint distinct monotonic ids; `mintDecisionMap(store, decisions, existing?)` → a validated DecisionMap whose `nnnn` = `String(max + 1).padStart(4, '0')` over the per-store `(date, old_filename)` sort. Both accept the prior committed map (`existing`) and RESOLVE an already-seen slug/filename through it BEFORE minting (the Flyway "already applied" idempotency pattern that makes `--resume` and re-runs safe). `makeMinter()` exposes the seeded factory. `sanitizeSlug(slug)` normalizes a decision slug to the driver's kebab constraint (`^[a-z0-9][a-z0-9-]*$`) so a non-kebab v1 filename can never make `driver.writeDecision` throw and abort the whole local migration; `mintDecisionMap` stores the sanitized slug, and the pipeline routes any slug it had to change to a `LOSSY` ReviewQueue entry (decision 4 — never hard-drop, never silently rename).

- [ ] **Step 1: Write the failing test**

`test/unit/migrate/identity.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mintThreadMap, mintDecisionMap } from '../../../src/migrate/identity.mjs'

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/

test('thread ids sort by created_at and are all valid ULIDs', () => {
  const map = mintThreadMap('store-x', [
    { slug: 'late', created_at: '2026-06-10T00:00:00Z', created_at_rung: 1, title: 'Late' },
    { slug: 'early', created_at: '2026-06-01T00:00:00Z', created_at_rung: 2, title: 'Early' },
  ])
  const ids = map.entries.map((e) => e.id)
  assert.ok(ids.every((id) => ULID_RE.test(id)))
  const early = map.entries.find((e) => e.slug === 'early')
  const late = map.entries.find((e) => e.slug === 'late')
  assert.ok(early.id < late.id)
})

test('same-millisecond threads still mint distinct monotonic ids', () => {
  const map = mintThreadMap('store-x', [
    { slug: 'a', created_at: '2026-06-01T00:00:00Z', created_at_rung: 1, title: 'A' },
    { slug: 'b', created_at: '2026-06-01T00:00:00Z', created_at_rung: 1, title: 'B' },
  ])
  const [a, b] = map.entries
  assert.notEqual(a.id, b.id)
  assert.ok(a.id < b.id)
})

test('re-mint resolves an existing slug instead of minting a new id', () => {
  const first = mintThreadMap('s', [{ slug: 'keep', created_at: '2026-06-01T00:00:00Z', created_at_rung: 1, title: 'Keep' }])
  const keptId = first.entries[0].id
  const second = mintThreadMap('s', [
    { slug: 'keep', created_at: '2026-06-01T00:00:00Z', created_at_rung: 1, title: 'Keep' },
    { slug: 'new', created_at: '2026-06-02T00:00:00Z', created_at_rung: 1, title: 'New' },
  ], first)
  assert.equal(second.entries.find((e) => e.slug === 'keep').id, keptId)
  assert.equal(second.entries.length, 2)
})

test('decision NNNN is a zero-padded running max over (date, filename)', () => {
  const map = mintDecisionMap('s', [
    { old_filename: '2026-06-02-b.md', date: '2026-06-02', slug: 'b', thread_id: null },
    { old_filename: '2026-06-01-a.md', date: '2026-06-01', slug: 'a', thread_id: null },
  ])
  assert.deepEqual(map.entries.map((e) => [e.nnnn, e.slug]), [['0001', 'a'], ['0002', 'b']])
})

test('re-mint continues decision numbering from the prior max', () => {
  const first = mintDecisionMap('s', [{ old_filename: '2026-06-01-a.md', date: '2026-06-01', slug: 'a', thread_id: null }])
  const second = mintDecisionMap('s', [
    { old_filename: '2026-06-01-a.md', date: '2026-06-01', slug: 'a', thread_id: null },
    { old_filename: '2026-06-03-c.md', date: '2026-06-03', slug: 'c', thread_id: null },
  ], first)
  assert.deepEqual(second.entries.map((e) => e.nnnn), ['0001', '0002'])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/migrate/identity.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/migrate/identity.mjs`:

```js
import { monotonicFactory } from 'ulid'
import { validateThreadMap, validateDecisionMap } from './schemas.mjs'

export function makeMinter() {
  const factory = monotonicFactory()
  return (createdAtMs) => factory(createdAtMs)
}

export function sanitizeSlug(slug) {
  const cleaned = String(slug ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
  return cleaned.length > 0 ? cleaned : 'decision'
}

export function mintThreadMap(store, threads, existing = null) {
  const priorBySlug = new Map((existing?.entries ?? []).map((e) => [e.slug, e]))
  const mint = makeMinter()
  const ordered = [...threads].sort((a, b) => {
    const ma = Date.parse(a.created_at)
    const mb = Date.parse(b.created_at)
    return ma === mb ? a.slug.localeCompare(b.slug) : ma - mb
  })
  const entries = ordered.map((t) => {
    const prior = priorBySlug.get(t.slug)
    const id = prior ? prior.id : mint(Date.parse(t.created_at))
    return {
      slug: t.slug,
      id,
      created_at: t.created_at,
      created_at_rung: t.created_at_rung,
      title: t.title,
    }
  })
  return validateThreadMap({ schema_version: 1, store, entries })
}

export function mintDecisionMap(store, decisions, existing = null) {
  const priorByFile = new Map((existing?.entries ?? []).map((e) => [e.old_filename, e]))
  const ordered = [...decisions].sort((a, b) => (
    a.date === b.date ? a.old_filename.localeCompare(b.old_filename) : String(a.date).localeCompare(String(b.date))
  ))
  let max = 0
  for (const e of priorByFile.values()) {
    max = Math.max(max, Number(e.nnnn))
  }
  const entries = ordered.map((d) => {
    const prior = priorByFile.get(d.old_filename)
    if (prior) {
      return prior
    }
    max += 1
    return {
      old_filename: d.old_filename,
      nnnn: String(max).padStart(4, '0'),
      slug: sanitizeSlug(d.slug),
      thread_id: d.thread_id ?? null,
    }
  })
  return validateDecisionMap({ schema_version: 1, store, entries })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/migrate/identity.test.mjs`
Expected: PASS — 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/migrate/identity.mjs test/unit/migrate/identity.test.mjs
git commit -m "feat: mint timestamp-seeded thread ULIDs and running decision NNNN maps"
```

---

### Task 7: cross-reference reverse index + 15-surface rewrite (N8, N9)

**Files:**
- Create: `src/migrate/crossref.mjs`
- Test: `test/unit/migrate/crossref.test.mjs`

**Interfaces:**
- Consumes: the ThreadMap/DecisionMap from Task 6.
- Produces: `CROSS_REF_SURFACES` (the 15 enumerated reference surfaces); `buildReverseIndex(threadMap, decisionMap)` → `{ slugToId, decisionRefToNnnn }` (N8 — pass one, all ids known); `planRewrites(surfaces, reverseIndex, decisionMap)` → `{ rewrites, dangling }` (N9 — pass two, resolve every reference to a stable id/NNNN). This is the two-pass ids-then-refs design: minting (Task 6) completes for the WHOLE store before any reference is resolved. Every emitted rewrite carries `{surface, old, new, class, status}` matching the plan schema; a reference that resolves to nothing is emitted `status:'halt' class:'MANUAL'` AND collected in `dangling` — never silently dropped, never fabricated.

- [ ] **Step 1: Write the failing test**

`test/unit/migrate/crossref.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildReverseIndex, planRewrites, CROSS_REF_SURFACES } from '../../../src/migrate/crossref.mjs'

const ULID_A = '01JZ000000000000000000000A'
const ULID_B = '01JZ000000000000000000000B'

const threadMap = {
  schema_version: 1, store: 's',
  entries: [
    { slug: 'parent', id: ULID_A, created_at: '2026-06-01T00:00:00Z', created_at_rung: 1, title: 'Parent' },
    { slug: 'child', id: ULID_B, created_at: '2026-06-02T00:00:00Z', created_at_rung: 1, title: 'Child' },
  ],
}
const decisionMap = {
  schema_version: 1, store: 's',
  entries: [{ old_filename: '2026-06-01-pick.md', nnnn: '0001', slug: 'pick', thread_id: ULID_A }],
}

test('exactly 15 cross-ref surfaces are enumerated 1..15', () => {
  assert.equal(CROSS_REF_SURFACES.length, 15)
  assert.deepEqual(CROSS_REF_SURFACES.map((s) => s.surface), Array.from({ length: 15 }, (_, i) => i + 1))
})

test('the reverse index resolves thread slugs and decision refs', () => {
  const idx = buildReverseIndex(threadMap, decisionMap)
  assert.equal(idx.slugToId.get('parent'), ULID_A)
  assert.equal(idx.decisionRefToNnnn.get('pick'), '0001')
  assert.equal(idx.decisionRefToNnnn.get('2026-06-01-pick'), '0001')
})

test('a resolvable surface rewrites to the stable id', () => {
  const idx = buildReverseIndex(threadMap, decisionMap)
  const { rewrites, dangling } = planRewrites(
    [{ surface: 1, old: 'parent' }, { surface: 10, old: '2026-06-01-pick.md' }],
    idx, decisionMap,
  )
  assert.deepEqual(dangling, [])
  assert.equal(rewrites[0].new, ULID_A)
  assert.equal(rewrites[0].status, 'resolved')
  assert.equal(rewrites[1].new, '0001-pick')
})

test('a dangling reference is HALT-flagged, never dropped', () => {
  const idx = buildReverseIndex(threadMap, decisionMap)
  const { rewrites, dangling } = planRewrites([{ surface: 5, old: 'ghost' }], idx, decisionMap)
  assert.equal(rewrites[0].status, 'halt')
  assert.equal(rewrites[0].class, 'MANUAL')
  assert.equal(dangling.length, 1)
  assert.match(dangling[0].reason, /unresolved/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/migrate/crossref.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/migrate/crossref.mjs`:

```js
export const CROSS_REF_SURFACES = [
  { surface: 1, name: 'thread.parent', kind: 'thread-slug' },
  { surface: 2, name: 'thread.predecessor', kind: 'thread-slug' },
  { surface: 3, name: 'thread.spine.key_decisions', kind: 'decision-ref' },
  { surface: 4, name: 'thread.spine.next_step', kind: 'thread-slug' },
  { surface: 5, name: 'decision.thread_id', kind: 'thread-slug' },
  { surface: 6, name: 'decision.supersedes', kind: 'decision-ref' },
  { surface: 7, name: 'decision.superseded_by', kind: 'decision-ref' },
  { surface: 8, name: 'session.thread', kind: 'thread-slug' },
  { surface: 9, name: 'binding.thread_id', kind: 'thread-slug' },
  { surface: 10, name: 'projectmd.active_decisions', kind: 'decision-ref' },
  { surface: 11, name: 'projectmd.thread_index', kind: 'thread-slug' },
  { surface: 12, name: 'projectmd.epic_children', kind: 'thread-slug' },
  { surface: 13, name: 'thread.body.decision_link', kind: 'decision-ref' },
  { surface: 14, name: 'thread.body.thread_link', kind: 'thread-slug' },
  { surface: 15, name: 'decision.body.thread_link', kind: 'thread-slug' },
]

const SURFACE_KIND = new Map(CROSS_REF_SURFACES.map((s) => [s.surface, s.kind]))

export function buildReverseIndex(threadMap, decisionMap) {
  const slugToId = new Map(threadMap.entries.map((e) => [e.slug, e.id]))
  const decisionRefToNnnn = new Map()
  for (const e of decisionMap.entries) {
    decisionRefToNnnn.set(e.old_filename.replace(/\.md$/, ''), e.nnnn)
    decisionRefToNnnn.set(e.slug, e.nnnn)
  }
  return { slugToId, decisionRefToNnnn }
}

function resolveRef(kind, oldRef, reverseIndex, decisionMap) {
  if (kind === 'thread-slug') {
    const id = reverseIndex.slugToId.get(oldRef)
    return id ? { new: id, class: 'DERIVED' } : null
  }
  const nnnn = reverseIndex.decisionRefToNnnn.get(oldRef.replace(/\.md$/, ''))
  if (!nnnn) {
    return null
  }
  const entry = decisionMap.entries.find((e) => e.nnnn === nnnn)
  return { new: `${nnnn}-${entry.slug}`, class: 'DERIVED' }
}

export function planRewrites(surfaces, reverseIndex, decisionMap) {
  const rewrites = []
  const dangling = []
  for (const ref of surfaces) {
    const kind = SURFACE_KIND.get(ref.surface)
    if (!kind) {
      throw new Error(`unknown cross-ref surface: ${ref.surface}`)
    }
    const resolved = resolveRef(kind, ref.old, reverseIndex, decisionMap)
    if (!resolved) {
      rewrites.push({ surface: ref.surface, old: ref.old, new: '', class: 'MANUAL', status: 'halt' })
      dangling.push({ surface: ref.surface, old: ref.old, reason: 'unresolved cross-reference' })
      continue
    }
    rewrites.push({ surface: ref.surface, old: ref.old, new: resolved.new, class: resolved.class, status: 'resolved' })
  }
  return { rewrites, dangling }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/migrate/crossref.test.mjs`
Expected: PASS — 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/migrate/crossref.mjs test/unit/migrate/crossref.test.mjs
git commit -m "feat: add two-pass cross-reference reverse index and 15-surface rewrite planner"
```

---

### Task 8: emit validated records into a MigrationOutput (N10–N15)

**Files:**
- Create: `src/migrate/emit.mjs`
- Test: `test/unit/migrate/emit.test.mjs`

**Interfaces:**
- Consumes: `validateThread`/`validateBinding` (`../schema/validate.mjs`, Plan 01:798-810 — the FROZEN validators, run BEFORE any record enters the tree); `renderDecision` (`../tools/decision-md.mjs`, Plan 03:317). SPINE caps are redeclared locally (scalar 500 / array 20 / item 300, `key_decisions` EXEMPT — identical to Plan 03's `SPINE_CAPS`): migration writes final validated records directly and DEMOTES over-cap spine itself, never calling the throwing `enforceSpineCaps`.
- Produces: `emitThread(fields, parsed, refs)` → a validated `Thread` with `schema_version: 1` and all 16 required fields (N10); it consumes `refs.parent_id`/`refs.predecessor_id` (the resolved lineage the pipeline feeds from cross-ref surfaces 1/2) and recomputes `spine.status` from the migrated top-level `status` so a demoted zombie can never leave `spine.status` contradicting the record status; `resolveMigratedStatus(rawStatus)` → maps a zombie `active` to `paused` with `demoted:true` (N14 input); `emitDecision(decEntry, parsed, threadId)` → `{ nnnn, slug, markdown }` via `renderDecision`, THROWING if `threadId` is unresolved (a decision with no thread routes to ReviewQueue, never a fabricated thread — decision 4) (N11); `emitSession(sessionEntry, sourceBytes)` → `{ path, bytes }` byte-copy (N12); `emitBinding(spec)` → a validated `BranchBinding` with NO `schema_version` field (N13); `emitDemotionSession(threadId, isoTs, demotedItems)` → `{ threadId, isoTs, actor:'migrated', markdown }` (N14); `capProjectMd(markdown)` → `{ kept, overflow }` holding PROJECT.md to 80 lines (N15); `demoteSpine(spine)` → `{ spine, overflow }`.

- [ ] **Step 1: Write the failing test**

`test/unit/migrate/emit.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  emitThread, emitDecision, emitBinding, emitSession,
  emitDemotionSession, capProjectMd, resolveMigratedStatus, demoteSpine,
} from '../../../src/migrate/emit.mjs'

const ULID_A = '01JZ000000000000000000000A'
const ULID_B = '01JZ000000000000000000000B'

function baseSpine() {
  return { status: 'paused', active_goal: 'ship', next_step: 'do', open_risks: [], key_decisions: [], out_of_scope: [] }
}

test('emitThread produces a schema_version 1 Thread that passes validateThread', () => {
  const t = emitThread(
    { id: ULID_A, slug: 'x', title: 'X', status: 'paused', createdAt: '2026-06-01T00:00:00Z', updatedAt: '2026-06-02T00:00:00Z' },
    { spine: baseSpine(), completion_criteria: [], external_refs: [] },
    {},
  )
  assert.equal(t.schema_version, 1)
  assert.equal(t.parent_id, null)
  assert.equal(t.blocked_by, null)
  assert.equal(t.updated_at, '2026-06-02T00:00:00Z')
  const zombie = emitThread(
    { id: ULID_B, slug: 'z', title: 'Z', status: 'paused', createdAt: '2026-06-01T00:00:00Z', updatedAt: '2026-06-02T00:00:00Z' },
    { spine: { ...baseSpine(), status: 'active' }, completion_criteria: [], external_refs: [] },
    { parent_id: ULID_A, predecessor_id: ULID_A },
  )
  assert.equal(zombie.spine.status, 'paused')
  assert.equal(zombie.parent_id, ULID_A)
  assert.equal(zombie.predecessor_id, ULID_A)
})

test('emitBinding produces a BranchBinding with NO schema_version field', () => {
  const b = emitBinding({ id: ULID_B, threadId: ULID_A, repo: '/r', branch: 'feat/x', createdAt: '2026-06-01T00:00:00Z' })
  assert.equal('schema_version' in b, false)
  assert.equal(b.status, 'active')
  assert.equal(b.closed_reason, null)
})

test('resolveMigratedStatus demotes a zombie active thread to paused', () => {
  assert.deepEqual(resolveMigratedStatus('active'), { status: 'paused', demoted: true })
  assert.deepEqual(resolveMigratedStatus('blocked'), { status: 'blocked', demoted: false })
})

test('emitDecision renders through renderDecision and requires a resolved thread', () => {
  const d = emitDecision(
    { nnnn: '0001', slug: 'pick' },
    { title: 'Pick', context: 'why', options: ['a', 'b'], outcome: 'a', date: '2026-06-01' },
    ULID_A,
  )
  assert.match(d.markdown, /^# 0001 — Pick/)
  assert.match(d.markdown, new RegExp(`Thread-Id: ${ULID_A}`))
  assert.throws(() => emitDecision({ nnnn: '0002', slug: 'orphan' }, { title: 'O', options: [] }, null), /ReviewQueue/)
})

test('emitSession byte-copies the source verbatim', () => {
  const src = Buffer.from('# session\nline\n', 'utf8')
  const s = emitSession({ new_path: `sessions/${ULID_A}/2026-06-01T00-01-00Z--migrated.md` }, src)
  assert.equal(Buffer.compare(s.bytes, src), 0)
  assert.match(s.path, /--migrated\.md$/)
})

test('emitDemotionSession stamps actor migrated', () => {
  const s = emitDemotionSession(ULID_A, '2026-06-01T00:02:00Z', ['status was active'])
  assert.equal(s.actor, 'migrated')
  assert.match(s.markdown, /Actor: migrated/)
})

test('demoteSpine trims over-cap scalars and non-exempt arrays but keeps key_decisions', () => {
  const big = 'x'.repeat(600)
  const decisions = Array.from({ length: 25 }, (_, i) => `d${i}`)
  const risks = Array.from({ length: 25 }, (_, i) => `r${i}`)
  const { spine, overflow } = demoteSpine({ ...baseSpine(), active_goal: big, key_decisions: decisions, open_risks: risks })
  assert.equal(spine.active_goal.length, 500)
  assert.equal(spine.key_decisions.length, 25)
  assert.equal(spine.open_risks.length, 20)
  assert.ok(overflow.length > 0)
})

test('capProjectMd holds PROJECT.md to 80 lines and returns the overflow', () => {
  const long = Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n')
  const { kept, overflow } = capProjectMd(long)
  assert.equal(kept.split('\n').filter((l) => l.length > 0).length, 80)
  assert.equal(overflow.length, 20)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/migrate/emit.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/migrate/emit.mjs`:

```js
import { validateThread, validateBinding } from '../schema/validate.mjs'
import { renderDecision } from '../tools/decision-md.mjs'

const SPINE_SCALAR_CAP = 500
const SPINE_ARRAY_CAP = 20
const SPINE_ITEM_CAP = 300
const PROJECT_MD_CAP = 80
const LEGAL_STATES = new Set(['active', 'paused', 'blocked', 'done', 'abandoned'])

function capScalar(value) {
  const s = String(value ?? '')
  return s.length > SPINE_SCALAR_CAP
    ? { kept: s.slice(0, SPINE_SCALAR_CAP), overflow: s.slice(SPINE_SCALAR_CAP) }
    : { kept: s, overflow: '' }
}

function capArray(items, exempt) {
  const trimmed = (items ?? []).map((it) => {
    const s = String(it)
    return s.length > SPINE_ITEM_CAP ? s.slice(0, SPINE_ITEM_CAP) : s
  })
  if (exempt || trimmed.length <= SPINE_ARRAY_CAP) {
    return { kept: trimmed, overflow: [] }
  }
  return { kept: trimmed.slice(0, SPINE_ARRAY_CAP), overflow: trimmed.slice(SPINE_ARRAY_CAP) }
}

export function demoteSpine(spine) {
  const status = capScalar(spine.status)
  const goal = capScalar(spine.active_goal)
  const next = capScalar(spine.next_step)
  const risks = capArray(spine.open_risks, false)
  const decisions = capArray(spine.key_decisions, true)
  const scope = capArray(spine.out_of_scope, false)
  const overflow = []
  for (const [label, part] of [['status', status], ['active_goal', goal], ['next_step', next]]) {
    if (part.overflow) {
      overflow.push(`${label}: ${part.overflow}`)
    }
  }
  for (const [label, part] of [['open_risks', risks], ['out_of_scope', scope]]) {
    for (const item of part.overflow) {
      overflow.push(`${label}: ${item}`)
    }
  }
  return {
    spine: {
      status: status.kept,
      active_goal: goal.kept,
      next_step: next.kept,
      open_risks: risks.kept,
      key_decisions: decisions.kept,
      out_of_scope: scope.kept,
    },
    overflow,
  }
}

export function resolveMigratedStatus(rawStatus) {
  const s = String(rawStatus ?? '').toLowerCase()
  if (s === 'active') {
    return { status: 'paused', demoted: true }
  }
  if (LEGAL_STATES.has(s)) {
    return { status: s, demoted: false }
  }
  return { status: 'paused', demoted: true }
}

export function emitThread({ id, slug, title, status, createdAt, updatedAt }, parsed, refs) {
  const { spine } = demoteSpine(parsed.spine)
  const thread = {
    schema_version: 1,
    id,
    slug,
    title,
    status,
    parent_id: refs.parent_id ?? null,
    predecessor_id: refs.predecessor_id ?? null,
    completion_criteria: parsed.completion_criteria ?? [],
    vcs_ref: refs.vcs_ref ?? null,
    external_refs: parsed.external_refs ?? [],
    blocked_by: null,
    abandoned_reason: null,
    closure_statement: null,
    spine: { ...spine, status },
    created_at: createdAt,
    updated_at: updatedAt ?? createdAt,
  }
  return validateThread(thread)
}

export function emitDecision({ nnnn, slug }, parsed, threadId) {
  if (!threadId) {
    throw new Error(`emitDecision: decision ${nnnn}-${slug} has no resolved Thread-Id; route to ReviewQueue`)
  }
  const markdown = renderDecision({
    nnnn,
    title: parsed.title,
    context: parsed.context,
    options: parsed.options,
    outcome: parsed.outcome,
    threadId,
    date: parsed.date,
  })
  return { nnnn, slug, markdown }
}

export function emitSession({ new_path }, sourceBytes) {
  return { path: new_path, bytes: Buffer.from(sourceBytes) }
}

export function emitBinding({ id, threadId, repo, branch, createdAt, firstCommit = null, trailerPresent = false }) {
  const binding = {
    id,
    thread_id: threadId,
    repo,
    branch,
    status: 'active',
    created_at: createdAt,
    closed_at: null,
    closed_reason: null,
    first_commit: firstCommit,
    trailer_present: trailerPresent,
  }
  return validateBinding(binding)
}

export function emitDemotionSession(threadId, isoTs, demotedItems) {
  const markdown = [
    `# Migration demotion — ${isoTs}`,
    '',
    'Actor: migrated',
    '',
    '## Demoted (over-cap or status)',
    ...demotedItems.map((d) => `- ${d}`),
    '',
  ].join('\n')
  return { threadId, isoTs, actor: 'migrated', markdown }
}

export function capProjectMd(markdown) {
  const lines = markdown.split('\n')
  if (lines.length <= PROJECT_MD_CAP) {
    return { kept: markdown, overflow: [] }
  }
  return {
    kept: `${lines.slice(0, PROJECT_MD_CAP).join('\n')}\n`,
    overflow: lines.slice(PROJECT_MD_CAP),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/migrate/emit.test.mjs`
Expected: PASS — 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/migrate/emit.mjs test/unit/migrate/emit.test.mjs
git commit -m "feat: emit frozen-validated threads/decisions/sessions/bindings with spine demotion"
```

---

### Task 9: materialize — orphan plumbing build OR LocalDriver (N16, N18)

**Files:**
- Create: `src/migrate/materialize.mjs`
- Test: `test/unit/migrate/materialize.test.mjs`

**Interfaces:**
- Consumes: `git` (`../util/git-exec.mjs`); `EMPTY_TREE_SHA`, `LEDGER_ROOT_MESSAGE`, `LEDGER_INIT_IDENTITY` (`../drivers/git-ledger.mjs` — **promoted to exports by Amendment 2** so the migration root is byte-identical to the driver's, guaranteeing `#ensureLedgerRef` adoption; do not redeclare them); `rebuildIndex` (`../index/build-index.mjs`, Plan 01:1834); `LocalDriver` (`../drivers/local-driver.mjs`); `ulid` `monotonicFactory` for the `Op-Id`.
- Produces: `deterministicRoot(repoDir)` → the SAME root SHA Plan 02 mints (`commit-tree EMPTY_TREE_SHA` under `LEDGER_INIT_IDENTITY`); `materializeOrphan({ repoDir, ledgerRef, files, opId })` → `{ commit, root, tree }` built with the sanctioned plumbing bypass (`hash-object -w` → temp-`GIT_INDEX_FILE` `update-index --cacheinfo` → `write-tree` → `commit-tree -p <root>` → `update-ref`), every commit carrying an `Op-Id: <ulid>` trailer and running under `-c core.fsync=all -c core.fsyncMethod=fsync`; the committed tree holds only records (`threads/`/`bindings/`/`decisions/`/`sessions/`/`PROJECT.md`) and NEVER `index/` (N16: the derived index is rebuilt post-checkout, never committed). `materializeLocal({ store, output })` → writes plain records via `LocalDriver` (each thread/binding re-validated on write), byte-copies sessions to their computed paths, writes `PROJECT.md`, then `rebuildIndex` → counts (the non-git branch, decision 8). `newOpId()` mints an `Op-Id`.

- [ ] **Step 1: Write the failing test**

`test/unit/migrate/materialize.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { git } from '../../../src/util/git-exec.mjs'
import { materializeOrphan, deterministicRoot, materializeLocal, newOpId } from '../../../src/migrate/materialize.mjs'

async function repo() {
  const dir = await mkdtemp(join(tmpdir(), 'mat-repo-'))
  await git(['init', dir])
  return dir
}

function sampleThread(id) {
  return {
    schema_version: 1, id, slug: 'x', title: 'X', status: 'paused',
    parent_id: null, predecessor_id: null, completion_criteria: [], vcs_ref: null, external_refs: [],
    blocked_by: null, abandoned_reason: null, closure_statement: null,
    spine: { status: 'paused', active_goal: '', next_step: 'go', open_risks: [], key_decisions: [], out_of_scope: [] },
    created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-01T00:00:00Z',
  }
}

test('deterministicRoot is identical on repeated calls', async () => {
  const r = await repo()
  assert.equal(await deterministicRoot(r), await deterministicRoot(r))
  await rm(r, { recursive: true, force: true })
})

test('materializeOrphan builds a ref parented on the deterministic root, without index/', async () => {
  const r = await repo()
  const opId = newOpId()
  const id = '01JZ000000000000000000000A'
  const files = [
    [`threads/${id}.json`, `${JSON.stringify(sampleThread(id), null, 2)}\n`],
    [`sessions/${id}/2026-06-01T00-01-00Z--migrated.md`, '# s\n'],
  ]
  const { commit, root } = await materializeOrphan({ repoDir: r, ledgerRef: 'refs/heads/_ledger', files, opId })
  assert.equal((await git(['rev-parse', 'refs/heads/_ledger'], { cwd: r })).trim(), commit)
  assert.equal((await git(['rev-parse', 'refs/heads/_ledger^'], { cwd: r })).trim(), root)
  assert.equal(root, await deterministicRoot(r))
  const tree = await git(['ls-tree', '-r', '--name-only', 'refs/heads/_ledger'], { cwd: r })
  assert.ok(tree.includes(`threads/${id}.json`))
  assert.ok(!tree.split('\n').some((p) => p.startsWith('index/')))
  assert.match(await git(['log', '-1', '--format=%B', 'refs/heads/_ledger'], { cwd: r }), new RegExp(`Op-Id: ${opId}`))
  await rm(r, { recursive: true, force: true })
})

test('materializeLocal writes plain records and rebuilds a derived index', async () => {
  const store = await mkdtemp(join(tmpdir(), 'mat-local-'))
  const id = '01JZ000000000000000000000A'
  const out = {
    threads: [sampleThread(id)], bindings: [], decisions: [],
    sessions: [{ relPath: `sessions/${id}/2026-06-01T00-01-00Z--migrated.md`, bytes: Buffer.from('# s\n') }],
    projectMd: '# PROJECT\n',
  }
  const { counts } = await materializeLocal({ store, output: out })
  assert.equal(counts.resumable, 1)
  await rm(store, { recursive: true, force: true })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/migrate/materialize.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/migrate/materialize.mjs`:

```js
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { monotonicFactory } from 'ulid'
import { git } from '../util/git-exec.mjs'
import { EMPTY_TREE_SHA, LEDGER_ROOT_MESSAGE, LEDGER_INIT_IDENTITY } from '../drivers/git-ledger.mjs'
import { rebuildIndex } from '../index/build-index.mjs'
import { LocalDriver } from '../drivers/local-driver.mjs'

const FSYNC = ['-c', 'core.fsync=all', '-c', 'core.fsyncMethod=fsync']

export function newOpId() {
  return monotonicFactory()()
}

export async function deterministicRoot(repoDir) {
  const env = { ...process.env, ...LEDGER_INIT_IDENTITY }
  return (await git([...FSYNC, 'commit-tree', EMPTY_TREE_SHA, '-m', LEDGER_ROOT_MESSAGE], { cwd: repoDir, env })).trim()
}

export async function materializeOrphan({ repoDir, ledgerRef, files, opId }) {
  const root = await deterministicRoot(repoDir)
  const stage = await mkdtemp(join(tmpdir(), 'mig-stage-'))
  const env = { ...process.env, GIT_INDEX_FILE: join(stage, 'index'), ...LEDGER_INIT_IDENTITY }
  try {
    let n = 0
    for (const [relPath, content] of files) {
      const blobSrc = join(stage, `blob-${n}`)
      n += 1
      await writeFile(blobSrc, content)
      const blob = (await git(['hash-object', '-w', '--', blobSrc], { cwd: repoDir })).trim()
      await git(['update-index', '--add', '--cacheinfo', `100644,${blob},${relPath}`], { cwd: repoDir, env })
    }
    const tree = (await git(['write-tree'], { cwd: repoDir, env })).trim()
    const message = `chore: migrate v1 ledger\n\nOp-Id: ${opId}`
    const commit = (await git(
      [...FSYNC, 'commit-tree', tree, '-p', root, '-m', message],
      { cwd: repoDir, env: { ...process.env, ...LEDGER_INIT_IDENTITY } },
    )).trim()
    await git([...FSYNC, 'update-ref', ledgerRef, commit], { cwd: repoDir })
    return { commit, root, tree }
  } finally {
    await rm(stage, { recursive: true, force: true })
  }
}

export async function materializeLocal({ store, output }) {
  const driver = new LocalDriver(store)
  await driver.init()
  for (const thread of output.threads) {
    await driver.writeThread(thread)
  }
  for (const binding of output.bindings) {
    await driver.writeBinding(binding)
  }
  for (const decision of output.decisions) {
    await driver.writeDecision(decision.nnnn, decision.slug, decision.markdown)
  }
  for (const session of output.sessions) {
    const abs = join(store, session.relPath)
    await mkdir(dirname(abs), { recursive: true })
    await writeFile(abs, session.bytes)
  }
  if (output.projectMd) {
    await writeFile(join(store, 'PROJECT.md'), output.projectMd)
  }
  const counts = await rebuildIndex(driver)
  return { store, counts }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/migrate/materialize.test.mjs`
Expected: PASS — 3 tests pass. (Requires Amendment 2's constant exports; see the Amendments section.)

- [ ] **Step 5: Commit**

```bash
git add src/migrate/materialize.mjs test/unit/migrate/materialize.test.mjs
git commit -m "feat: materialize target via orphan plumbing build or LocalDriver plain files"
```

---

### Task 10: five-layer verification harness (N17 / V1–V5)

**Files:**
- Create: `src/migrate/verify.mjs`
- Test: `test/unit/migrate/verify.test.mjs`

**Interfaces:**
- Consumes: `createHash` (`node:crypto`) for the SHA-256 losslessness proof; `validateThread`/`validateBinding` (`../schema/validate.mjs`). The V4 cold-read consumer (`get_resume_brief`, Plan 03:1954) is INJECTED as `resumeBriefFn` so the harness stays free of a live MCP surface.
- Produces: `sha256(bytes)`; `verifyCounts(baseline, output)` (V1 — count parity of threads/decisions/sessions/bindings); `verifyBytes({ sessions, lineItems })` (V2 — SHA-256 byte-equality for sessions, line-level source-fact preservation for reserialized threads/decisions); `verifyStructural({ threads, bindings, rewrites, indexCounts })` (V3 — every thread/binding passes the frozen validators, every status ∈ the five legal states, every cross-ref `status:'resolved'`, `index.resumable` count equals the resumable-status thread count); `verifyColdRead({ threads, resumeBriefFn })` (V4 — a cold `get_resume_brief` returns the persisted `active_goal`/`next_step`); `verifySourceHash(sourceChecksums, reHashed)` (V5 — apply-time re-hash of the untouched source detects any drift or missing file); and the composed `runVerification(input)` → `{ ok, v1, v2, v3, v4, v5 }`. Asserting `schema_version` is `1` is intrinsic to V3 because `validateThread` runs the frozen Thread schema (`schema_version: { const: 1 }`).

- [ ] **Step 1: Write the failing test**

`test/unit/migrate/verify.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  sha256, verifyCounts, verifyBytes, verifyStructural, verifyColdRead, verifySourceHash,
} from '../../../src/migrate/verify.mjs'

const ULID_A = '01JZ000000000000000000000A'

function thread(status) {
  return {
    schema_version: 1, id: ULID_A, slug: 'x', title: 'X', status,
    parent_id: null, predecessor_id: null, completion_criteria: [], vcs_ref: null, external_refs: [],
    blocked_by: null, abandoned_reason: null, closure_statement: null,
    spine: { status, active_goal: 'goal', next_step: 'next', open_risks: [], key_decisions: [], out_of_scope: [] },
    created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-01T00:00:00Z',
  }
}

test('V1 passes on count parity and fails on a mismatch', () => {
  const output = { threads: [1], decisions: [1, 2], sessions: [1, 2, 3], bindings: [] }
  assert.equal(verifyCounts({ threads: 1, decisions: 2, sessions: 3, bindings: 0 }, output).ok, true)
  assert.equal(verifyCounts({ threads: 1, decisions: 1, sessions: 3, bindings: 0 }, output).ok, false)
})

test('V2 catches a session SHA-256 mismatch and a missing source line', () => {
  const good = verifyBytes({
    sessions: [{ sourcePath: 's/a.md', sourceBytes: Buffer.from('x'), outputBytes: Buffer.from('x') }],
    lineItems: [{ label: 't/x', sourceLines: ['keep me'], renderedText: 'header\nkeep me\n' }],
  })
  assert.equal(good.ok, true)
  const bad = verifyBytes({
    sessions: [{ sourcePath: 's/a.md', sourceBytes: Buffer.from('x'), outputBytes: Buffer.from('y') }],
    lineItems: [{ label: 't/x', sourceLines: ['dropped'], renderedText: 'nothing here' }],
  })
  assert.equal(bad.ok, false)
  assert.equal(bad.failures.length, 2)
})

test('V3 fails an invalid status, an unresolved cross-ref, and an index-count mismatch', () => {
  const okRes = verifyStructural({
    threads: [thread('paused')], bindings: [],
    rewrites: [{ surface: 1, old: 'p', new: ULID_A, class: 'DERIVED', status: 'resolved' }],
    indexCounts: { resumable: 1 },
  })
  assert.equal(okRes.ok, true)
  const bad = verifyStructural({
    threads: [thread('paused')], bindings: [],
    rewrites: [{ surface: 1, old: 'ghost', new: '', class: 'MANUAL', status: 'halt' }],
    indexCounts: { resumable: 5 },
  })
  assert.equal(bad.ok, false)
  assert.ok(bad.errors.some((e) => e.kind === 'unresolved-crossref'))
  assert.ok(bad.errors.some((e) => e.kind === 'index-count-mismatch'))
})

test('V4 confirms a cold get_resume_brief returns persisted spine fields', async () => {
  const t = thread('paused')
  const ok = await verifyColdRead({ threads: [t], resumeBriefFn: async () => ({ active_goal: 'goal', next_step: 'next' }) })
  assert.equal(ok.ok, true)
  const bad = await verifyColdRead({ threads: [t], resumeBriefFn: async () => ({ active_goal: 'WRONG', next_step: 'next' }) })
  assert.equal(bad.ok, false)
})

test('V5 detects source drift and a missing file at apply time', () => {
  const base = [{ path: 't/a.md', sha256: sha256(Buffer.from('a')) }, { path: 't/b.md', sha256: sha256(Buffer.from('b')) }]
  assert.equal(verifySourceHash(base, base).ok, true)
  const drifted = verifySourceHash(base, [{ path: 't/a.md', sha256: sha256(Buffer.from('CHANGED')) }])
  assert.equal(drifted.ok, false)
  assert.equal(drifted.missing.length, 1)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/migrate/verify.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/migrate/verify.mjs`:

```js
import { createHash } from 'node:crypto'
import { validateThread, validateBinding } from '../schema/validate.mjs'

const LEGAL_STATES = new Set(['active', 'paused', 'blocked', 'done', 'abandoned'])
const RESUMABLE = new Set(['active', 'paused', 'blocked'])

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

export function verifyCounts(baseline, output) {
  const actual = {
    threads: output.threads.length,
    decisions: output.decisions.length,
    sessions: output.sessions.length,
    bindings: output.bindings.length,
  }
  const mismatches = Object.keys(baseline).filter((k) => baseline[k] !== actual[k])
  return { ok: mismatches.length === 0, baseline, actual, mismatches }
}

export function verifyBytes({ sessions = [], lineItems = [] }) {
  const failures = []
  for (const s of sessions) {
    if (sha256(s.sourceBytes) !== sha256(s.outputBytes)) {
      failures.push({ path: s.sourcePath, kind: 'session-sha256' })
    }
  }
  for (const item of lineItems) {
    const missing = item.sourceLines
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .filter((l) => !item.renderedText.includes(l))
    if (missing.length > 0) {
      failures.push({ path: item.label, kind: 'line-parity', missing })
    }
  }
  return { ok: failures.length === 0, failures }
}

export function verifyStructural({ threads, bindings, rewrites, indexCounts }) {
  const errors = []
  for (const t of threads) {
    try {
      validateThread(t)
    } catch (err) {
      errors.push({ kind: 'thread-invalid', id: t.id, message: err.message })
    }
    if (!LEGAL_STATES.has(t.status)) {
      errors.push({ kind: 'bad-status', id: t.id, status: t.status })
    }
  }
  for (const b of bindings) {
    try {
      validateBinding(b)
    } catch (err) {
      errors.push({ kind: 'binding-invalid', id: b.id, message: err.message })
    }
  }
  for (const r of rewrites ?? []) {
    if (r.status !== 'resolved') {
      errors.push({ kind: 'unresolved-crossref', surface: r.surface, old: r.old })
    }
  }
  const expectedResumable = threads.filter((t) => RESUMABLE.has(t.status)).length
  if (indexCounts && indexCounts.resumable !== expectedResumable) {
    errors.push({ kind: 'index-count-mismatch', expected: expectedResumable, actual: indexCounts.resumable })
  }
  return { ok: errors.length === 0, errors }
}

export async function verifyColdRead({ threads, resumeBriefFn }) {
  const failures = []
  for (const t of threads) {
    if (!RESUMABLE.has(t.status)) {
      continue
    }
    const brief = await resumeBriefFn(t.id)
    if (!brief || brief.active_goal !== t.spine.active_goal || brief.next_step !== t.spine.next_step) {
      failures.push({ id: t.id })
    }
  }
  return { ok: failures.length === 0, failures }
}

export function verifySourceHash(sourceChecksums, reHashed) {
  const before = new Map(sourceChecksums.map((c) => [c.path, c.sha256]))
  const after = new Map(reHashed.map((c) => [c.path, c.sha256]))
  const drift = []
  for (const [path, sha] of after) {
    if (before.get(path) !== sha) {
      drift.push({ path, before: before.get(path) ?? null, after: sha })
    }
  }
  const missing = [...before.keys()].filter((p) => !after.has(p))
  return { ok: drift.length === 0 && missing.length === 0, drift, missing }
}

export async function runVerification(input) {
  const v1 = verifyCounts(input.baseline, input.output)
  const v2 = verifyBytes(input.bytes)
  const v3 = verifyStructural(input.structural)
  const v4 = input.coldRead ? await verifyColdRead(input.coldRead) : null
  const v5 = input.sourceReHash ? verifySourceHash(input.sourceChecksums, input.sourceReHash) : null
  const ok = [v1, v2, v3, v4, v5].every((v) => v === null || v.ok)
  return { ok, v1, v2, v3, v4, v5 }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/migrate/verify.test.mjs`
Expected: PASS — 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/migrate/verify.mjs test/unit/migrate/verify.test.mjs
git commit -m "feat: add five-layer migration verification harness (V1-V5)"
```

---

### Task 11: ReviewQueue roll-up + human migration report (N19)

**Files:**
- Create: `src/migrate/review-report.mjs`
- Test: `test/unit/migrate/review-report.test.mjs`

**Interfaces:**
- Consumes: `validateReviewQueue` (Task 1).
- Produces: `rollupReviewQueue(queue)` → `{ counts, byClass, blocksDone }` where `blocksDone` is `true` whenever ANY entry is `resolution_status: 'open'` OR ANY entry is `flag_class: 'HALT'` — the roll-up is the gate that BLOCKS a `done`/cutover until every lossy or manual decision is human-resolved (decision 4; no drop, no relocate); `renderMigrationReport({ store, plan, verification, queue, snapshot? })` → a human-readable markdown report summarizing baseline counts, V1–V5 outcomes, the durability artifacts (the reported absolute path of the pre-apply tarball snapshot), the queue by status and class, and the cutover verdict.

- [ ] **Step 1: Write the failing test**

`test/unit/migrate/review-report.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rollupReviewQueue, renderMigrationReport } from '../../../src/migrate/review-report.mjs'

const ULID_A = '01JZ000000000000000000000A'

function entry(overrides) {
  return {
    id: ULID_A, record_type: 'decision', source_path: 'decisions/x.md',
    flag_class: 'MANUAL', reason: 'no Thread-Id', suggestion: 'assign at review', resolution_status: 'open',
    ...overrides,
  }
}

test('an open or HALT entry blocks done', () => {
  assert.equal(rollupReviewQueue({ schema_version: 1, store: 's', entries: [entry({})] }).blocksDone, true)
  const halt = rollupReviewQueue({ schema_version: 1, store: 's', entries: [entry({ flag_class: 'HALT', resolution_status: 'resolved' })] })
  assert.equal(halt.blocksDone, true)
})

test('a fully resolved, non-HALT queue clears cutover', () => {
  const roll = rollupReviewQueue({
    schema_version: 1, store: 's',
    entries: [entry({ flag_class: 'LOSSY', resolution_status: 'resolved' })],
  })
  assert.equal(roll.blocksDone, false)
  assert.equal(roll.byClass.LOSSY, 1)
  assert.equal(roll.counts.resolved, 1)
})

test('renderMigrationReport surfaces verification, the snapshot path, and the cutover verdict', () => {
  const md = renderMigrationReport({
    store: '/s',
    plan: { baseline_counts: { threads: 2, decisions: 1, sessions: 3, bindings: 0 } },
    verification: { v1: { ok: true }, v2: { ok: true }, v3: { ok: true }, v4: null, v5: { ok: true } },
    queue: { schema_version: 1, store: 's', entries: [entry({ flag_class: 'HALT' })] },
    snapshot: '/abs/_migration/v1-source.tgz',
  })
  assert.match(md, /# Migration report/)
  assert.match(md, /V1 counts: true/)
  assert.match(md, /pre-apply snapshot: \/abs\/_migration\/v1-source\.tgz/)
  assert.match(md, /Cutover: BLOCKED/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/migrate/review-report.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/migrate/review-report.mjs`:

```js
import { validateReviewQueue } from './schemas.mjs'

export function rollupReviewQueue(queue) {
  validateReviewQueue(queue)
  const counts = { open: 0, resolved: 0, deferred: 0 }
  const byClass = { LOSSY: 0, MANUAL: 0, HALT: 0 }
  for (const e of queue.entries) {
    counts[e.resolution_status] += 1
    byClass[e.flag_class] += 1
  }
  return { counts, byClass, blocksDone: counts.open > 0 || byClass.HALT > 0 }
}

export function renderMigrationReport({ store, plan, verification, queue, snapshot = null }) {
  const roll = rollupReviewQueue(queue)
  const line = (k, v) => `- ${k}: ${v}`
  const vres = (v) => (v === null || v === undefined ? 'skipped' : v.ok)
  return [
    `# Migration report — ${store}`,
    '',
    '## Baseline counts',
    line('threads', plan.baseline_counts.threads),
    line('decisions', plan.baseline_counts.decisions),
    line('sessions', plan.baseline_counts.sessions),
    line('bindings', plan.baseline_counts.bindings),
    '',
    '## Verification',
    line('V1 counts', vres(verification.v1)),
    line('V2 bytes', vres(verification.v2)),
    line('V3 structural', vres(verification.v3)),
    line('V4 cold-read', vres(verification.v4)),
    line('V5 source re-hash', vres(verification.v5)),
    '',
    '## Artifacts',
    line('pre-apply snapshot', snapshot ?? '(dry-run; taken at --apply)'),
    '',
    '## Review queue',
    line('open', roll.counts.open),
    line('resolved', roll.counts.resolved),
    line('deferred', roll.counts.deferred),
    line('LOSSY', roll.byClass.LOSSY),
    line('MANUAL', roll.byClass.MANUAL),
    line('HALT', roll.byClass.HALT),
    '',
    `## Cutover: ${roll.blocksDone ? 'BLOCKED (resolve open/HALT items first)' : 'clear'}`,
    '',
  ].join('\n')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/migrate/review-report.test.mjs`
Expected: PASS — 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/migrate/review-report.mjs test/unit/migrate/review-report.test.mjs
git commit -m "feat: add ReviewQueue roll-up gate and human migration report"
```

---

### Task 12: N0–N19 pipeline orchestration + `migrate` CLI verb

**Files:**
- Create: `src/migrate/pipeline.mjs`
- Modify: `src/cli/run.mjs` (early-branch `migrate`/`restore` BEFORE `buildContext`)
- Test: `test/unit/migrate/pipeline.test.mjs`, `test/unit/migrate/cli-migrate-branch.test.mjs`

**Interfaces:**
- Consumes: every migration module (Tasks 2–11) — including `electCanonical`/`subsetVerify` (`./dedup.mjs`, N2) and `rollupReviewQueue`/`renderMigrationReport` (`./review-report.mjs`, N19) — plus `runRestore` (`./restore.mjs`, Task 13, dynamically imported for the V4 cold-read so it never fails to load before Task 13 ships); `git` (`../util/git-exec.mjs`); `projectKey` (`../util/project-key.mjs`); `serializeRecord` (`../drivers/layout.mjs`, Plan 01:560); `LocalDriver` (`../drivers/local-driver.mjs`); `node:child_process` `execFile` for the mandatory pre-apply `tar` snapshot; `runCli`'s existing structure (Plan 03:2527).
- Produces: `runMigrate(opts)` orchestrating N0 (pre-flight: quiescence gate + source SHA-256 baseline + inventory hash) through N19; `assemblePlan(...)` (N1–N15 → a `validatePlanArtifact`-checked plan + in-memory `MigrationOutput`); `loadPlanArtifact(...)` (loads + `validatePlanArtifact`s a committed `plan.json` and drives from ITS identity maps); `dedupeStores(...)` (N2 canonical election per repo identity); `runMigrateFromArgs(rest, buildOpts)` / `parseMigrateArgs(rest)`; `runMigrateAll(...)` driving the human-gated `STORE_GROUP_ORDER`; `orderStores`/`classifyStore`. Behavior: **dry-run** (default) reads the source read-only, writes a `plan.json` + a human `renderMigrationReport`, mutates NO target; **`--apply`** rolls up the ReviewQueue and — per decision 4/N19 — REFUSES with an explicit `blocked:true`/`blocksDone:true` whenever any MANUAL/HALT or open entry remains (writing the report so the blockers are visible), otherwise re-hashes the untouched source (V5), writes the pre-apply tarball snapshot to a stable, reported `_migration/` path (git backend: `<repo>/.git/continuity-migration/`) surfaced in the result, materializes (N16/N18), re-verifies V1–V4 — with **V4** a real cold `get_resume_brief` run against the freshly-built ref (git) or the local store — writes the report, and only then leaves the target in place; **`--plan <file>`** loads + validates the LOCKED plan and drives apply/verify from its committed thread/decision maps (resolve-before-mint, Plan 00:190 / decision 10 — never re-assembling fresh identity), V5 still guarding the source bytes; **`--verify-only`** replays V1–V4 over the plan and exits without committing; **`--resume`** loads the committed `_migration/*` maps so minting resolves-before-mints (idempotent); **`--rollback`** deletes ONLY the target (`update-ref -d` or `rm -rf`), never the source; **`--all`** first runs the N2 dedup (`electCanonical`/`subsetVerify`) to elect one canonical store per repo identity — subset worktree copies are SKIPPED and any only-in-copy divergence is HALTed into the ReviewQueue, never silently migrated — then iterates the survivors in group order behind a mandatory per-store `confirm` gate (no unattended apply). The `src/cli/run.mjs` change early-branches `migrate`/`restore` BEFORE `buildContext`, so these verbs never initialize the current project's driver and instead construct their own per-store target.

- [ ] **Step 1: Write the failing tests**

`test/unit/migrate/pipeline.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { git } from '../../../src/util/git-exec.mjs'
import { materializeOrphan, newOpId } from '../../../src/migrate/materialize.mjs'
import { runMigrate, parseMigrateArgs, orderStores, dedupeStores } from '../../../src/migrate/pipeline.mjs'

async function localStore() {
  const root = await mkdtemp(join(tmpdir(), 'pipe-'))
  const store = join(root, 'ledger')
  await mkdir(join(store, 'threads'), { recursive: true })
  await mkdir(join(store, 'decisions'), { recursive: true })
  await mkdir(join(store, 'sessions'), { recursive: true })
  await writeFile(join(store, 'PROJECT.md'), '# PROJECT\n1 threads / 1 decisions\n')
  await writeFile(join(store, 'threads', 'auth.md'), ['---', 'slug: auth', 'title: Auth', 'status: paused', 'updated: 2026-06-10', '---', '# Auth', 'Status: paused', 'Active Goal: ship', 'Next Step: test'].join('\n'))
  await writeFile(join(store, 'decisions', '2026-06-02-pick.md'), ['# 0001 — Pick', 'Thread-Id: auth', '## Context and Problem', 'c', '## Considered Options', '- a', '- b', '## Decision Outcome', 'a'].join('\n'))
  await writeFile(join(store, 'sessions', '2026-06-05-01-auth.md'), '# session\nbody\n')
  return { root, store }
}

test('dry-run assembles a schema-valid plan without touching a target', async () => {
  const { root, store } = await localStore()
  const planOut = join(root, 'plan.json')
  const res = await runMigrate({ store, apply: false, planOut })
  assert.equal(res.committed, false)
  assert.equal(res.backend, 'local')
  assert.equal(res.verification.v1.ok, true)
  assert.equal(res.verification.v3.ok, true)
  assert.ok((await stat(planOut)).isFile())
  await rm(root, { recursive: true, force: true })
})

test('--verify-only computes verification and never commits', async () => {
  const { root, store } = await localStore()
  const res = await runMigrate({ store, verifyOnly: true })
  assert.equal(res.committed, false)
  assert.equal(res.verifyOnly, true)
  assert.equal(res.verification.v1.ok, true)
  await rm(root, { recursive: true, force: true })
})

test('--rollback deletes only the target ledger ref', async () => {
  const repo = await mkdtemp(join(tmpdir(), 'pipe-repo-'))
  await git(['init', repo])
  await materializeOrphan({ repoDir: repo, ledgerRef: 'refs/heads/_ledger', opId: newOpId(), files: [['PROJECT.md', '# p\n']] })
  const store = join(repo, '.claude', 'ledger')
  await mkdir(join(store, 'threads'), { recursive: true })
  const res = await runMigrate({ store, rollback: true })
  assert.equal(res.rolledBack, true)
  await assert.rejects(() => git(['rev-parse', 'refs/heads/_ledger'], { cwd: repo }))
  await rm(repo, { recursive: true, force: true })
})

test('parseMigrateArgs reads the verb flags and orderStores honors the group order', () => {
  const a = parseMigrateArgs(['/s', '--apply', '--plan', 'p.json'])
  assert.equal(a.store, '/s')
  assert.equal(a.apply, true)
  assert.equal(a.planPath, 'p.json')
  const ordered = orderStores([{ path: '/z', kind: 'project-md-only' }, { path: '/a', kind: 'ledger' }])
  assert.deepEqual(ordered.map((s) => s.path), ['/a', '/z'])
})

test('a divergent worktree copy HALTs and is never migrated (N2 dedup)', async () => {
  const canon = await localStore()
  const copy = await localStore()
  await writeFile(join(copy.store, 'threads', 'extra.md'), ['---', 'slug: extra', 'title: Extra', 'status: paused', 'updated: 2026-06-10', '---', '# Extra'].join('\n'))
  const identify = async (path) => ({ identity: 'shared-repo', isPrimaryWorktree: path === canon.store })
  const { toMigrate, skipped, halts } = await dedupeStores(
    [{ path: canon.store, kind: 'ledger' }, { path: copy.store, kind: 'ledger' }],
    identify,
  )
  assert.deepEqual(toMigrate.map((s) => s.path), [canon.store])
  assert.deepEqual(skipped, [])
  assert.equal(halts.length, 1)
  assert.equal(halts[0].store, copy.store)
  assert.deepEqual(halts[0].onlyInCopy, ['threads/extra.md'])
  await rm(canon.root, { recursive: true, force: true })
  await rm(copy.root, { recursive: true, force: true })
})

test('an unresolvable decision Thread-Id blocks --apply and lands in the report (N19 gate)', async () => {
  const { root, store } = await localStore()
  await writeFile(join(store, 'decisions', '2026-06-03-orphan.md'), ['# 0002 — Orphan', 'Thread-Id: ghost', '## Context and Problem', 'c', '## Considered Options', '- a', '## Decision Outcome', 'a'].join('\n'))
  const res = await runMigrate({ store, apply: true })
  assert.equal(res.committed, false)
  assert.equal(res.blocked, true)
  assert.equal(res.blocksDone, true)
  assert.match(res.report, /Cutover: BLOCKED/)
  assert.match(res.report, /MANUAL: [1-9]/)
  await rm(root, { recursive: true, force: true })
})

test('--plan drives apply from the committed maps without re-minting identity', async () => {
  const { root, store } = await localStore()
  const planOut = join(root, 'plan.json')
  const targetStore = join(root, 'v2')
  const dry = await runMigrate({ store, apply: false, planOut, targetStore })
  const lockedId = dry.thread_map.entries[0].id
  const res = await runMigrate({ store, apply: true, planPath: planOut, targetStore })
  assert.equal(res.committed, true)
  assert.equal(res.thread_map.entries[0].id, lockedId)
  await rm(root, { recursive: true, force: true })
})
```

`test/unit/migrate/cli-migrate-branch.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runCli } from '../../../src/cli/run.mjs'

test('runCli routes migrate before buildContext (no current-project driver init)', async () => {
  const prev = process.env.CLAUDE_PLUGIN_DATA
  delete process.env.CLAUDE_PLUGIN_DATA
  try {
    const root = await mkdtemp(join(tmpdir(), 'cli-mig-'))
    const store = join(root, 'ledger')
    await mkdir(join(store, 'threads'), { recursive: true })
    await mkdir(join(store, 'decisions'), { recursive: true })
    await mkdir(join(store, 'sessions'), { recursive: true })
    await writeFile(join(store, 'PROJECT.md'), '# PROJECT\n')
    await writeFile(join(store, 'threads', 'x.md'), '# X\nStatus: paused\nActive Goal: g\nNext Step: n\n')
    const res = await runCli(['migrate', store, '--dry-run', '--plan-out', join(root, 'p.json')], { projectDir: '/no/such/project' })
    assert.equal(res.backend, 'local')
    await rm(root, { recursive: true, force: true })
  } finally {
    if (prev !== undefined) process.env.CLAUDE_PLUGIN_DATA = prev
  }
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/unit/migrate/pipeline.test.mjs test/unit/migrate/cli-migrate-branch.test.mjs`
Expected: FAIL — `../../../src/migrate/pipeline.mjs` missing and `run.mjs` does not yet route `migrate`.

- [ ] **Step 3: Write the pipeline implementation**

`src/migrate/pipeline.mjs`:

```js
import { readFile, readdir, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname, relative } from 'node:path'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { git } from '../util/git-exec.mjs'
import { projectKey } from '../util/project-key.mjs'
import { serializeRecord } from '../drivers/layout.mjs'
import { LocalDriver } from '../drivers/local-driver.mjs'
import { discoverStores } from './inventory.mjs'
import { checkPreconditions } from './preconditions.mjs'
import { electCanonical, subsetVerify } from './dedup.mjs'
import { parseThread, parseDecision, parseProjectMd, censusSessions } from './parse.mjs'
import { deriveCreatedAt, gitFirstCommitDate } from './created-at.mjs'
import { mintThreadMap, mintDecisionMap } from './identity.mjs'
import { buildReverseIndex, planRewrites } from './crossref.mjs'
import {
  emitThread, emitDecision, emitSession, emitDemotionSession, resolveMigratedStatus, demoteSpine, capProjectMd,
} from './emit.mjs'
import { materializeOrphan, materializeLocal, newOpId } from './materialize.mjs'
import { verifyCounts, verifyBytes, verifyStructural, verifyColdRead, verifySourceHash, sha256 } from './verify.mjs'
import { rollupReviewQueue, renderMigrationReport } from './review-report.mjs'
import { validatePlanArtifact } from './schemas.mjs'

const execFileAsync = promisify(execFile)
const TOOL_VERSION = '0.0.0'
const LEDGER_REF = 'refs/heads/_ledger'

export const STORE_GROUP_ORDER = [
  'pilot', 'small', 'medium', 'multi-worktree',
  'gitignored-tarball', 'client-sentinel-gc', 'worktree-copy-skip', 'non-git-archive',
]

export function classifyStore(store) {
  return store.kind === 'project-md-only' ? 'non-git-archive' : 'small'
}

export function orderStores(stores, classify = classifyStore) {
  const rank = new Map(STORE_GROUP_ORDER.map((g, i) => [g, i]))
  return [...stores].sort((a, b) => (rank.get(classify(a)) ?? 99) - (rank.get(classify(b)) ?? 99))
}

async function listMd(dir) {
  try {
    return (await readdir(dir)).filter((f) => f.endsWith('.md')).sort()
  } catch {
    return []
  }
}

function toIso(value, fallback) {
  if (!value) {
    return fallback
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
    return value
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return `${value}T00:00:00Z`
  }
  return fallback
}

async function readOrNull(path) {
  try {
    return await readFile(path)
  } catch {
    return null
  }
}

export async function hashSource(store) {
  const checksums = []
  for (const sub of ['threads', 'decisions', 'sessions']) {
    for (const f of await listMd(join(store, sub))) {
      const rel = `${sub}/${f}`
      checksums.push({ path: rel, sha256: sha256(await readFile(join(store, rel))) })
    }
  }
  const projectMd = await readOrNull(join(store, 'PROJECT.md'))
  if (projectMd !== null) {
    checksums.push({ path: 'PROJECT.md', sha256: sha256(projectMd) })
  }
  checksums.sort((a, b) => a.path.localeCompare(b.path))
  const inventoryHash = createHash('sha256')
    .update(checksums.map((c) => `${c.path}:${c.sha256}`).join('\n'))
    .digest('hex')
  return { checksums, inventoryHash }
}

function review(recordType, sourcePath, flagClass, reason, suggestion) {
  return {
    id: newOpId(), record_type: recordType, source_path: sourcePath,
    flag_class: flagClass, reason, suggestion, resolution_status: 'open',
  }
}

function threadIndexSlug(target) {
  return target.split('/').pop().replace(/\.md$/, '')
}

function collectSurfaces(threadRecords, parsedDecisions, projectMd) {
  const surfaces = []
  for (const t of threadRecords) {
    if (t.parsed.parent) {
      surfaces.push({ surface: 1, old: t.parsed.parent })
    }
    if (t.parsed.predecessor) {
      surfaces.push({ surface: 2, old: t.parsed.predecessor })
    }
    for (const kd of t.parsed.key_decisions ?? []) {
      const m = /(\d{4}-\d{2}-\d{2}-[a-z0-9-]+)/i.exec(kd)
      if (m) {
        surfaces.push({ surface: 3, old: `${m[1]}.md` })
      }
    }
  }
  for (const d of parsedDecisions) {
    if (d.parsed.threadRef) {
      surfaces.push({ surface: 5, old: d.parsed.threadRef })
    }
    if (d.parsed.supersedes) {
      surfaces.push({ surface: 6, old: d.parsed.supersedes })
    }
    if (d.parsed.supersededBy) {
      surfaces.push({ surface: 7, old: d.parsed.supersededBy })
    }
  }
  for (const ad of projectMd?.activeDecisions ?? []) {
    surfaces.push({ surface: 10, old: ad.slug })
  }
  for (const ti of projectMd?.threadIndex ?? []) {
    surfaces.push({ surface: 11, old: threadIndexSlug(ti.target) })
  }
  for (const ec of projectMd?.epicChildren ?? []) {
    surfaces.push({ surface: 12, old: ec })
  }
  return surfaces
}

export async function assemblePlan({ store, backend, isGit, repoDir, now, existing = null }) {
  const pre = await checkPreconditions(store)
  if (!pre.ok) {
    throw new Error(`preconditions HALT for ${store}: ${pre.halts.map((h) => h.reason).join('; ')}`)
  }
  const { checksums, inventoryHash } = await hashSource(store)
  const key = projectKey(store)

  const threadFiles = await listMd(join(store, 'threads'))
  const decisionFiles = await listMd(join(store, 'decisions'))
  const sessionFiles = await listMd(join(store, 'sessions'))
  const projectMdText = await readFile(join(store, 'PROJECT.md'), 'utf8').catch(() => '')
  const parsedProjectMd = parseProjectMd(projectMdText)
  const census = censusSessions(sessionFiles)

  const parsedDecisions = []
  for (const f of decisionFiles) {
    parsedDecisions.push({ file: f, parsed: parseDecision(await readFile(join(store, 'decisions', f), 'utf8'), f) })
  }

  const threadRecords = []
  for (const f of threadFiles) {
    const parsed = parseThread(await readFile(join(store, 'threads', f), 'utf8'), f)
    const sessions = census.filter((s) => s.threadSlug === parsed.slug)
    const decisions = parsedDecisions.filter((d) => d.parsed.threadRef === parsed.slug).map((d) => d.parsed)
    const gitDate = isGit ? await gitFirstCommitDate(git, repoDir, join(relative(repoDir, store), 'threads', f)) : null
    const { created_at, rung } = await deriveCreatedAt({ gitDate, sessions, decisions, updated: parsed.updated })
    threadRecords.push({ file: f, parsed, created_at, created_at_rung: rung })
  }

  const threadMap = mintThreadMap(
    key,
    threadRecords.map((t) => ({ slug: t.parsed.slug, created_at: t.created_at, created_at_rung: t.created_at_rung, title: t.parsed.title })),
    existing?.thread_map ?? null,
  )
  const idBySlug = new Map(threadMap.entries.map((e) => [e.slug, e.id]))

  const decisionMap = mintDecisionMap(
    key,
    parsedDecisions.map((d) => ({
      old_filename: d.file, date: d.parsed.date, slug: d.parsed.slug,
      thread_id: d.parsed.threadRef ? (idBySlug.get(d.parsed.threadRef) ?? null) : null,
    })),
    existing?.decision_map ?? null,
  )

  const reverseIndex = buildReverseIndex(threadMap, decisionMap)
  const { rewrites, dangling } = planRewrites(collectSurfaces(threadRecords, parsedDecisions, parsedProjectMd), reverseIndex, decisionMap)

  const reviewEntries = []
  const output = { threads: [], decisions: [], heldDecisions: [], sessions: [], demotions: [], bindings: [], lineItems: [], indexCounts: null }

  const slugSeen = new Map()
  for (const t of threadRecords) {
    const prior = slugSeen.get(t.parsed.slug)
    if (prior) {
      reviewEntries.push(review('thread', `threads/${t.file}`, 'HALT', `duplicate thread slug "${t.parsed.slug}" also declared by ${prior}; the migration must not collapse two threads onto one id`, 'reconcile or rename one of the colliding threads before cutover'))
    } else {
      slugSeen.set(t.parsed.slug, `threads/${t.file}`)
    }
  }

  for (const t of threadRecords) {
    const id = idBySlug.get(t.parsed.slug)
    const migrated = resolveMigratedStatus(t.parsed.status)
    const demo = demoteSpine(t.parsed.spine)
    const parentId = t.parsed.parent ? (idBySlug.get(t.parsed.parent) ?? null) : null
    const predecessorId = t.parsed.predecessor ? (idBySlug.get(t.parsed.predecessor) ?? null) : null
    if (t.parsed.parent && !parentId) {
      reviewEntries.push(review('thread', `threads/${t.file}`, 'MANUAL', `parent slug "${t.parsed.parent}" does not resolve to a migrated thread`, 'assign the parent lineage at review'))
    }
    if (t.parsed.predecessor && !predecessorId) {
      reviewEntries.push(review('thread', `threads/${t.file}`, 'MANUAL', `predecessor slug "${t.parsed.predecessor}" does not resolve to a migrated thread`, 'assign the predecessor lineage at review'))
    }
    const thread = emitThread(
      { id, slug: t.parsed.slug, title: t.parsed.title, status: migrated.status, createdAt: t.created_at, updatedAt: toIso(t.parsed.updated, t.created_at) },
      { spine: t.parsed.spine, completion_criteria: t.parsed.completion_criteria, external_refs: t.parsed.external_refs },
      { parent_id: parentId, predecessor_id: predecessorId },
    )
    output.threads.push(thread)
    let demotionText = ''
    if (migrated.demoted || demo.overflow.length > 0) {
      const seq = String(output.demotions.length % 60).padStart(2, '0')
      const isoTs = `${t.created_at.slice(0, 10)}T23:${seq}:00Z`
      const demotion = emitDemotionSession(id, isoTs, [
        ...(migrated.demoted ? [`status was ${t.parsed.status}`] : []),
        ...demo.overflow,
      ])
      const relPath = `sessions/${id}/${isoTs.replace(/[:.]/g, '-')}--${demotion.actor}.md`
      demotionText = `${demotion.markdown}\n`
      output.demotions.push({ relPath, bytes: Buffer.from(demotionText) })
    }
    const reattach = (field) => {
      const suffix = demo.overflow
        .filter((o) => o.startsWith(`${field}: `))
        .map((o) => o.slice(field.length + 2))
        .join('')
      return `${thread.spine[field] ?? ''}${suffix}`
    }
    const threadSourceLines = [
      t.parsed.slug,
      t.parsed.title,
      t.parsed.spine.active_goal,
      t.parsed.spine.next_step,
      ...(t.parsed.spine.key_decisions ?? []),
      ...(t.parsed.spine.open_risks ?? []),
      ...(t.parsed.spine.out_of_scope ?? []),
      ...(t.parsed.completion_criteria ?? []).map((c) => (typeof c === 'string' ? c : c.text)),
    ].filter((s) => typeof s === 'string' && s.trim().length > 0)
    const threadRenderedText = [
      thread.slug,
      thread.title,
      thread.status,
      reattach('active_goal'),
      reattach('next_step'),
      ...(thread.spine.key_decisions ?? []),
      ...(thread.spine.open_risks ?? []),
      ...(thread.spine.out_of_scope ?? []),
      ...(thread.completion_criteria ?? []).map((c) => (typeof c === 'string' ? c : c.text)),
      demotionText,
    ].join('\n')
    output.lineItems.push({ label: `threads/${t.file}`, sourceLines: threadSourceLines, renderedText: threadRenderedText })
  }

  for (const dEntry of decisionMap.entries) {
    const parsed = parsedDecisions.find((d) => d.file === dEntry.old_filename).parsed
    if (!dEntry.thread_id) {
      output.heldDecisions.push({ old_filename: dEntry.old_filename })
      reviewEntries.push(review('decision', `decisions/${dEntry.old_filename}`, 'MANUAL', 'decision has no resolvable Thread-Id', 'assign a thread at review'))
      continue
    }
    if (parsed.slug !== dEntry.slug) {
      reviewEntries.push(review('decision', `decisions/${dEntry.old_filename}`, 'LOSSY', `decision slug "${parsed.slug}" was sanitized to "${dEntry.slug}" to satisfy the kebab-case record name`, 'confirm the sanitized decision filename at review'))
    }
    if (parsed.supersedes || parsed.supersededBy) {
      reviewEntries.push(review('decision', `decisions/${dEntry.old_filename}`, 'MANUAL', `supersession (supersedes=${parsed.supersedes ?? '-'}, superseded_by=${parsed.supersededBy ?? '-'}) is captured in cross_ref_rewrites but the frozen renderDecision cannot inline it into the v2 record`, 're-apply the supersession in the v2 decision at review'))
    }
    const emitted = emitDecision({ nnnn: dEntry.nnnn, slug: dEntry.slug }, parsed, dEntry.thread_id)
    output.decisions.push(emitted)
    output.lineItems.push({
      label: `decisions/${dEntry.old_filename}`,
      sourceLines: [parsed.title, parsed.outcome, parsed.context, ...(parsed.options ?? [])].filter((s) => typeof s === 'string' && s.trim().length > 0),
      renderedText: emitted.markdown,
    })
  }

  for (const s of census) {
    const id = idBySlug.get(s.threadSlug) ?? null
    const sourcePath = `sessions/${s.filename}`
    const sourceBytes = await readFile(join(store, sourcePath))
    if (!id) {
      reviewEntries.push(review('session', sourcePath, 'MANUAL', 'session thread slug does not resolve', 'assign a thread at review'))
      output.sessions.push({ relPath: null, bytes: sourceBytes, sourceBytes, sourcePath, threadId: null, held: true })
      continue
    }
    const isoTs = `${s.date}T00:${s.seq}:00Z`
    const relPath = `sessions/${id}/${isoTs.replace(/[:.]/g, '-')}--migrated.md`
    const emitted = emitSession({ new_path: relPath }, sourceBytes)
    output.sessions.push({ relPath, bytes: emitted.bytes, sourceBytes, sourcePath, threadId: id, held: false })
  }

  for (const d of dangling) {
    reviewEntries.push(review('artifact', `crossref/surface-${d.surface}/${d.old}`, 'HALT', d.reason, 'resolve the reference manually'))
  }

  const capped = capProjectMd(projectMdText)
  output.projectMd = capped.kept
  if (capped.overflow.length > 0) {
    reviewEntries.push(review('projectmd', 'PROJECT.md', 'LOSSY', `PROJECT.md exceeded 80 lines; ${capped.overflow.length} demoted`, 'review the demoted PROJECT.md tail'))
  }

  const sessionMap = {
    schema_version: 1, store: key,
    entries: output.sessions.map((s) => ({
      old_path: s.sourcePath,
      new_path: s.relPath ?? `_migration/held/${s.sourcePath.split('/').pop()}`,
      thread_id: s.threadId,
      lossy_time: true,
    })),
  }
  const reviewQueue = { schema_version: 1, store: key, entries: reviewEntries }
  const flags = {
    lossy: reviewEntries.filter((e) => e.flag_class === 'LOSSY').length,
    manual: reviewEntries.filter((e) => e.flag_class === 'MANUAL').length,
    halt: reviewEntries.filter((e) => e.flag_class === 'HALT').length,
  }

  const plan = {
    schema_version: 1,
    tool_version: TOOL_VERSION,
    store_path: store,
    project_key: key,
    backend,
    source_inventory_hash: inventoryHash,
    baseline_counts: { threads: threadFiles.length, decisions: decisionFiles.length, sessions: census.length, bindings: 0 },
    source_checksums: checksums,
    thread_map: threadMap,
    decision_map: decisionMap,
    session_map: sessionMap,
    binding_plan: [],
    cross_ref_rewrites: rewrites,
    review_queue: reviewQueue,
    flags,
    verification: { v1: null, v2: null, v3: null, v4: null, v5: null },
  }
  validatePlanArtifact(plan)
  return { plan, output, now }
}

async function verifyPlan({ plan, output, coldRead }) {
  const v1 = verifyCounts(plan.baseline_counts, {
    threads: output.threads,
    decisions: [...output.decisions, ...output.heldDecisions],
    sessions: output.sessions,
    bindings: output.bindings,
  })
  const v2 = verifyBytes({
    sessions: output.sessions.filter((s) => !s.held).map((s) => ({ sourcePath: s.sourcePath, sourceBytes: s.sourceBytes, outputBytes: s.bytes })),
    lineItems: output.lineItems,
  })
  const v3 = verifyStructural({ threads: output.threads, bindings: output.bindings, rewrites: plan.cross_ref_rewrites, indexCounts: output.indexCounts })
  const v4 = coldRead ? await verifyColdRead(coldRead) : null
  const ok = [v1, v2, v3, v4].every((v) => v === null || v.ok)
  return { ok, v1, v2, v3, v4, v5: null }
}

async function resolveGit(store) {
  try {
    return { isGit: true, repoDir: (await git(['rev-parse', '--show-toplevel'], { cwd: store })).trim() }
  } catch {
    return { isGit: false, repoDir: null }
  }
}

function localTarget(store, key, targetStore) {
  if (targetStore) {
    return targetStore
  }
  const dataRoot = process.env.CLAUDE_PLUGIN_DATA
  return dataRoot ? join(dataRoot, key, 'ledger') : join(dirname(store), 'ledger-v2')
}

function orphanFiles(plan, output) {
  const files = []
  for (const t of output.threads) {
    files.push([`threads/${t.id}.json`, serializeRecord(t)])
  }
  for (const b of output.bindings) {
    files.push([`bindings/${b.id}.json`, serializeRecord(b)])
  }
  for (const d of output.decisions) {
    files.push([`decisions/${d.nnnn}-${d.slug}.md`, d.markdown])
  }
  for (const s of output.sessions.filter((x) => !x.held)) {
    files.push([s.relPath, s.bytes])
  }
  for (const s of output.demotions) {
    files.push([s.relPath, s.bytes])
  }
  if (output.projectMd) {
    files.push(['PROJECT.md', output.projectMd])
  }
  files.push(['_migration/thread-map.json', serializeRecord(plan.thread_map)])
  files.push(['_migration/decision-map.json', serializeRecord(plan.decision_map)])
  files.push(['_migration/session-map.json', serializeRecord(plan.session_map)])
  files.push(['_migration/review-queue.json', serializeRecord(plan.review_queue)])
  files.push(['_migration/plan.json', serializeRecord(plan)])
  return files
}

function migrationArtifactsDir({ backend, repoDir, store, targetStore, projectKeyValue }) {
  if (backend === 'local') {
    return join(localTarget(store, projectKeyValue, targetStore), '_migration')
  }
  return join(repoDir, '.git', 'continuity-migration')
}

async function snapshotSource(store, outDir) {
  const parent = dirname(store)
  const base = store.slice(parent.length + 1)
  const out = join(outDir, 'v1-source.tgz')
  await execFileAsync('tar', ['-czf', out, '-C', parent, base])
  return out
}

async function materializeTarget({ plan, output, backend, repoDir, store, targetStore }) {
  if (backend === 'local') {
    const target = localTarget(store, plan.project_key, targetStore)
    const writable = {
      threads: output.threads,
      bindings: output.bindings,
      decisions: output.decisions,
      sessions: [
        ...output.sessions.filter((s) => !s.held).map((s) => ({ relPath: s.relPath, bytes: s.bytes })),
        ...output.demotions,
      ],
      projectMd: output.projectMd,
    }
    const res = await materializeLocal({ store: target, output: writable })
    output.indexCounts = res.counts
    const migDir = join(target, '_migration')
    await mkdir(migDir, { recursive: true })
    for (const [name, value] of [['thread-map', plan.thread_map], ['decision-map', plan.decision_map], ['session-map', plan.session_map], ['review-queue', plan.review_queue], ['plan', plan]]) {
      await writeFile(join(migDir, `${name}.json`), serializeRecord(value))
    }
    const cold = new LocalDriver(target)
    const resumeBriefFn = async (id) => {
      const t = await cold.readThread(id)
      return t ? { active_goal: t.spine.active_goal, next_step: t.spine.next_step } : null
    }
    return { target, coldRead: { threads: output.threads, resumeBriefFn } }
  }
  const res = await materializeOrphan({ repoDir, ledgerRef: LEDGER_REF, files: orphanFiles(plan, output), opId: newOpId() })
  const { runRestore } = await import('./restore.mjs')
  const coldRoot = await mkdtemp(join(tmpdir(), 'mig-coldread-'))
  await runRestore({ repoDir, ref: LEDGER_REF, target: coldRoot, force: true })
  const cold = new LocalDriver(coldRoot)
  const resumeBriefFn = async (id) => {
    const t = await cold.readThread(id)
    return t ? { active_goal: t.spine.active_goal, next_step: t.spine.next_step } : null
  }
  return { target: LEDGER_REF, commit: res.commit, coldRead: { threads: output.threads, resumeBriefFn }, coldRoot }
}

async function loadCheckpoints({ backend, repoDir, store, targetStore, projectKeyValue }) {
  const readMap = async (name) => {
    try {
      if (backend === 'orphan-branch') {
        return JSON.parse(await git(['show', `${LEDGER_REF}:_migration/${name}`], { cwd: repoDir }))
      }
      return JSON.parse(await readFile(join(localTarget(store, projectKeyValue, targetStore), '_migration', name), 'utf8'))
    } catch {
      return null
    }
  }
  return { thread_map: await readMap('thread-map.json'), decision_map: await readMap('decision-map.json') }
}

async function rollbackTarget({ backend, repoDir, store, targetStore, projectKeyValue }) {
  if (backend === 'orphan-branch') {
    await git(['update-ref', '-d', LEDGER_REF], { cwd: repoDir }).catch(() => {})
    return { rolledBack: true, target: LEDGER_REF }
  }
  const target = localTarget(store, projectKeyValue, targetStore)
  await rm(target, { recursive: true, force: true })
  return { rolledBack: true, target }
}

function reportPathFor(planOut) {
  return planOut.endsWith('.json') ? `${planOut.slice(0, -5)}.report.md` : `${planOut}.report.md`
}

async function loadPlanArtifact(planPath, { store, backend, isGit, repoDir, now }) {
  let raw
  try {
    raw = await readFile(planPath, 'utf8')
  } catch (err) {
    throw new Error(`migrate --plan: cannot read plan artifact ${planPath}: ${err.message}`)
  }
  let locked
  try {
    locked = JSON.parse(raw)
  } catch (err) {
    throw new Error(`migrate --plan: ${planPath} is not valid JSON: ${err.message}`)
  }
  validatePlanArtifact(locked)
  if (locked.store_path !== store) {
    throw new Error(`migrate --plan: plan store_path ${locked.store_path} does not match ${store}`)
  }
  if (locked.backend !== backend) {
    throw new Error(`migrate --plan: plan backend ${locked.backend} does not match the resolved backend ${backend}`)
  }
  const { output } = await assemblePlan({
    store, backend, isGit, repoDir, now,
    existing: { thread_map: locked.thread_map, decision_map: locked.decision_map },
  })
  return { plan: locked, output }
}

export async function runMigrate(opts) {
  const { store } = opts
  if (!store) {
    throw new Error('migrate requires a <store-path>')
  }
  const { isGit, repoDir } = await resolveGit(store)
  const backend = isGit ? 'orphan-branch' : 'local'
  const projectKeyValue = projectKey(store)
  if (opts.rollback) {
    return rollbackTarget({ backend, repoDir, store, targetStore: opts.targetStore, projectKeyValue })
  }
  const existing = opts.resume ? await loadCheckpoints({ backend, repoDir, store, targetStore: opts.targetStore, projectKeyValue }) : null
  const { plan, output } = opts.planPath
    ? await loadPlanArtifact(opts.planPath, { store, backend, isGit, repoDir, now: opts.now })
    : await assemblePlan({ store, backend, isGit, repoDir, now: opts.now, existing })

  const reviewRoll = rollupReviewQueue(plan.review_queue)

  if (opts.verifyOnly) {
    const verification = await verifyPlan({ plan, output, coldRead: null })
    return { ...plan, verification, output, review: reviewRoll, committed: false, verifyOnly: true }
  }
  if (!opts.apply) {
    const verification = await verifyPlan({ plan, output, coldRead: null })
    const report = renderMigrationReport({ store, plan, verification, queue: plan.review_queue })
    if (opts.planOut) {
      await writeFile(opts.planOut, `${JSON.stringify({ ...plan, verification }, null, 2)}\n`)
      await writeFile(reportPathFor(opts.planOut), report)
    }
    return { ...plan, verification, output, review: reviewRoll, report, committed: false, dryRun: true }
  }

  if (reviewRoll.blocksDone) {
    const verification = await verifyPlan({ plan, output, coldRead: null })
    const report = renderMigrationReport({ store, plan, verification, queue: plan.review_queue })
    if (opts.planOut) {
      await writeFile(reportPathFor(opts.planOut), report)
    }
    return { ...plan, verification, output, review: reviewRoll, report, blocked: true, blocksDone: true, committed: false }
  }

  const reHash = (await hashSource(store)).checksums
  const v5 = verifySourceHash(plan.source_checksums, reHash)
  if (!v5.ok) {
    throw new Error('source changed since the plan was built; re-run the dry-run')
  }
  const artifactsDir = migrationArtifactsDir({ backend, repoDir, store, targetStore: opts.targetStore, projectKeyValue })
  await mkdir(artifactsDir, { recursive: true })
  const snapshot = await snapshotSource(store, artifactsDir)
  const materialized = await materializeTarget({ plan, output, backend, repoDir, store, targetStore: opts.targetStore })
  try {
    const verification = await verifyPlan({ plan, output, coldRead: materialized.coldRead })
    verification.v5 = v5
    const report = renderMigrationReport({ store, plan, verification, queue: plan.review_queue, snapshot })
    const reportPath = join(artifactsDir, 'report.md')
    await writeFile(reportPath, report)
    if (!verification.ok || !v5.ok) {
      throw new Error('post-materialize verification failed; the target is left in place for --rollback')
    }
    return { ...plan, verification, output, review: reviewRoll, report, snapshot, reportPath, committed: true, target: materialized.target }
  } finally {
    if (materialized?.coldRoot) {
      await rm(materialized.coldRoot, { recursive: true, force: true })
    }
  }
}

export function parseMigrateArgs(rest) {
  const args = { apply: false, verifyOnly: false, resume: false, rollback: false, all: false, planOut: null, planPath: null }
  const positionals = []
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i]
    if (a === '--apply') {
      args.apply = true
    } else if (a === '--dry-run') {
      args.apply = false
    } else if (a === '--verify-only') {
      args.verifyOnly = true
    } else if (a === '--resume') {
      args.resume = true
    } else if (a === '--rollback') {
      args.rollback = true
    } else if (a === '--all') {
      args.all = true
    } else if (a === '--plan-out') {
      args.planOut = rest[i + 1]
      i += 1
    } else if (a === '--plan') {
      args.planPath = rest[i + 1]
      i += 1
    } else {
      positionals.push(a)
    }
  }
  args.store = positionals[0]
  return args
}

async function storeIdentity(storePath) {
  try {
    const commonDir = (await git(['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: storePath })).trim()
    const gitDir = (await git(['rev-parse', '--path-format=absolute', '--git-dir'], { cwd: storePath })).trim()
    return { identity: commonDir, isPrimaryWorktree: gitDir === commonDir }
  } catch {
    return { identity: storePath, isPrimaryWorktree: true }
  }
}

export async function dedupeStores(stores, identify = storeIdentity) {
  const groups = new Map()
  for (const store of stores) {
    const { identity, isPrimaryWorktree } = await identify(store.path)
    if (!groups.has(identity)) {
      groups.set(identity, [])
    }
    groups.get(identity).push({ ...store, isPrimaryWorktree })
  }
  const toMigrate = []
  const skipped = []
  const halts = []
  for (const group of groups.values()) {
    if (group.length === 1) {
      toMigrate.push(group[0])
      continue
    }
    const { canonical, copies } = electCanonical(group)
    toMigrate.push(canonical)
    for (const copy of copies) {
      const verdict = await subsetVerify(canonical.path, copy.path)
      if (verdict.disposition === 'SKIP') {
        skipped.push({ store: copy.path, canonical: canonical.path, reason: 'worktree copy is a subset of the canonical store' })
      } else {
        halts.push({ store: copy.path, canonical: canonical.path, onlyInCopy: verdict.onlyInCopy })
      }
    }
  }
  return { toMigrate, skipped, halts }
}

export async function runMigrateAll({ root, confirm = null, ...rest }) {
  if (rest.apply && !confirm) {
    throw new Error('migrate --all --apply requires a per-store confirm gate; no unattended apply')
  }
  const discovered = orderStores(await discoverStores(root))
  const { toMigrate, skipped, halts } = await dedupeStores(discovered)
  const results = []
  for (const s of skipped) {
    results.push({ store: s.store, skipped: true, reason: s.reason, canonical: s.canonical })
  }
  for (const h of halts) {
    results.push({
      store: h.store,
      halted: true,
      blocksDone: true,
      review: review('artifact', h.store, 'HALT', `worktree copy carries records absent from canonical ${h.canonical}: ${h.onlyInCopy.join(', ')}`, 'reconcile the divergent worktree copy before migrating'),
    })
  }
  for (const store of orderStores(toMigrate)) {
    if (confirm && !(await confirm(store))) {
      results.push({ store: store.path, skipped: true })
      continue
    }
    results.push(await runMigrate({ ...rest, store: store.path }))
  }
  return { root, count: discovered.length, migrated: toMigrate.length, skipped: skipped.length, halted: halts.length, results }
}

export async function runMigrateFromArgs(rest, buildOpts = {}) {
  const args = parseMigrateArgs(rest)
  if (args.all) {
    return runMigrateAll({ ...args, root: args.store ?? buildOpts.projectDir ?? process.cwd() })
  }
  return runMigrate({ ...args, now: buildOpts.now })
}
```

- [ ] **Step 4: Wire the early branch into `src/cli/run.mjs`**

In `src/cli/run.mjs`, replace the top of `runCli` (Plan 03:2527-2530) so `migrate`/`restore` route BEFORE `buildContext` (they must not initialize the current project's driver — they build their own per-store target). The existing `switch` is unchanged:

```js
export async function runCli(argv, buildOpts = {}) {
  const [command, ...rest] = argv
  if (command === 'migrate') {
    const { runMigrateFromArgs } = await import('../migrate/pipeline.mjs')
    return runMigrateFromArgs(rest, buildOpts)
  }
  if (command === 'restore') {
    const { runRestoreFromArgs } = await import('../migrate/restore.mjs')
    return runRestoreFromArgs(rest, buildOpts)
  }
  const ctx = await buildContext(buildOpts)
  switch (command) {
    case 'roster':
      return ctx.driver.readIndexFile('resumable')
    case 'reconcile':
      return callTool('reconcile', {}, ctx)
    case 'active-thread':
      return { thread_id: await readActiveThread(ctx) }
    case 'record-sha':
      return recordSha(ctx, rest[0])
    case 'sync':
      return ctx.driver.sync()
    default:
      throw new Error(`unknown command: ${command ?? '(none)'}`)
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test test/unit/migrate/pipeline.test.mjs test/unit/migrate/cli-migrate-branch.test.mjs`
Expected: PASS — 7 pipeline tests + 1 CLI-branch test. (The CLI-branch test proves the early branch: with `CLAUDE_PLUGIN_DATA` unset and a non-git `projectDir`, reaching `backend:'local'` means `buildContext`/`selectDriver` never ran. The three added pipeline tests prove: N2 dedup HALTs a divergent worktree copy; the N19 ReviewQueue gate blocks `--apply` on an unresolvable `Thread-Id` and surfaces it in the report; and `--plan` drives apply from the committed identity maps without re-minting.)

- [ ] **Step 6: Commit**

```bash
git add src/migrate/pipeline.mjs src/cli/run.mjs test/unit/migrate/pipeline.test.mjs test/unit/migrate/cli-migrate-branch.test.mjs
git commit -m "feat: orchestrate N0-N19 migration pipeline and wire the migrate CLI verb"
```

---

### Task 13: `restore` verb — rebuild a working store from the ledger ref

**Files:**
- Create: `src/migrate/restore.mjs`
- Test: `test/unit/migrate/restore.test.mjs`

**Interfaces:**
- Consumes: `git` (`../util/git-exec.mjs`); `LocalDriver` (`../drivers/local-driver.mjs`); `rebuildIndex` (`../index/build-index.mjs`).
- Produces: `runRestore({ repoDir, ref?, target, force? })` → reads the committed orphan ref (default `refs/heads/_ledger`, override `--ref`), materializes EVERY record (`git ls-tree -r` + `git show <ref>:<path>`) into `<target>` as a working store, then `rebuildIndex`; refuses a non-empty `<target>` unless `--force`. `parseRestoreArgs(rest)` / `runRestoreFromArgs(rest, buildOpts)`. It is disaster-recovery for a lost working checkout (the V2-audit precedent) — it reads the ledger ref only, NEVER a v1 store, and is not part of the migration pipeline.

- [ ] **Step 1: Write the failing test**

`test/unit/migrate/restore.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { git } from '../../../src/util/git-exec.mjs'
import { materializeOrphan, newOpId } from '../../../src/migrate/materialize.mjs'
import { runRestore, parseRestoreArgs } from '../../../src/migrate/restore.mjs'

function sampleThread(id) {
  return {
    schema_version: 1, id, slug: 'x', title: 'X', status: 'paused',
    parent_id: null, predecessor_id: null, completion_criteria: [], vcs_ref: null, external_refs: [],
    blocked_by: null, abandoned_reason: null, closure_statement: null,
    spine: { status: 'paused', active_goal: '', next_step: 'go', open_risks: [], key_decisions: [], out_of_scope: [] },
    created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-01T00:00:00Z',
  }
}

test('restore materializes every record from the ledger ref and rebuilds the index', async () => {
  const repoDir = await mkdtemp(join(tmpdir(), 'restore-repo-'))
  await git(['init', repoDir])
  const id = '01JZ000000000000000000000A'
  await materializeOrphan({
    repoDir, ledgerRef: 'refs/heads/_ledger', opId: newOpId(),
    files: [[`threads/${id}.json`, `${JSON.stringify(sampleThread(id), null, 2)}\n`]],
  })
  const target = await mkdtemp(join(tmpdir(), 'restore-target-'))
  const r = await runRestore({ repoDir, target, force: true })
  assert.equal(r.restored, 1)
  assert.equal(r.counts.resumable, 1)
  const back = JSON.parse(await readFile(join(target, 'threads', `${id}.json`), 'utf8'))
  assert.equal(back.id, id)
  await rm(repoDir, { recursive: true, force: true })
  await rm(target, { recursive: true, force: true })
})

test('restore refuses a non-empty target without --force', async () => {
  const repoDir = await mkdtemp(join(tmpdir(), 'restore-repo2-'))
  await git(['init', repoDir])
  await materializeOrphan({ repoDir, ledgerRef: 'refs/heads/_ledger', opId: newOpId(), files: [['PROJECT.md', '# p\n']] })
  const target = await mkdtemp(join(tmpdir(), 'restore-target2-'))
  await writeFile(join(target, 'busy'), 'x')
  await assert.rejects(() => runRestore({ repoDir, target, force: false }), /non-empty target/)
  await rm(repoDir, { recursive: true, force: true })
  await rm(target, { recursive: true, force: true })
})

test('parseRestoreArgs reads --ref and --force', () => {
  const a = parseRestoreArgs(['/tgt', '--ref', 'refs/ledger/state', '--force'])
  assert.equal(a.target, '/tgt')
  assert.equal(a.ref, 'refs/ledger/state')
  assert.equal(a.force, true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/migrate/restore.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/migrate/restore.mjs`:

```js
import { mkdir, writeFile, readdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { git } from '../util/git-exec.mjs'
import { LocalDriver } from '../drivers/local-driver.mjs'
import { rebuildIndex } from '../index/build-index.mjs'

const DEFAULT_REF = 'refs/heads/_ledger'

async function isEmptyDir(dir) {
  try {
    return (await readdir(dir)).length === 0
  } catch {
    return true
  }
}

export async function runRestore({ repoDir, ref = DEFAULT_REF, target, force = false }) {
  if (typeof target !== 'string' || target.trim() === '') {
    throw new Error('restore requires a <target> directory')
  }
  if (!force && !(await isEmptyDir(target))) {
    throw new Error(`restore refuses a non-empty target: ${target} (use --force)`)
  }
  const listing = await git(['ls-tree', '-r', '--name-only', ref], { cwd: repoDir })
  const paths = listing.split('\n').map((p) => p.trim()).filter((p) => p.length > 0)
  if (paths.length === 0) {
    throw new Error(`restore: ref ${ref} has no records`)
  }
  for (const rel of paths) {
    const content = await git(['show', `${ref}:${rel}`], { cwd: repoDir })
    const abs = join(target, rel)
    await mkdir(dirname(abs), { recursive: true })
    await writeFile(abs, content)
  }
  const driver = new LocalDriver(target)
  await driver.init()
  const counts = await rebuildIndex(driver)
  return { target, ref, restored: paths.length, counts }
}

export function parseRestoreArgs(rest) {
  const args = { ref: DEFAULT_REF, force: false }
  const positionals = []
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i]
    if (a === '--ref') {
      args.ref = rest[i + 1]
      i += 1
    } else if (a === '--force') {
      args.force = true
    } else {
      positionals.push(a)
    }
  }
  args.target = positionals[0]
  return args
}

export async function runRestoreFromArgs(rest, buildOpts = {}) {
  const args = parseRestoreArgs(rest)
  const repoDir = buildOpts.projectDir ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
  return runRestore({ repoDir, ...args })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/migrate/restore.test.mjs`
Expected: PASS — 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/migrate/restore.mjs test/unit/migrate/restore.test.mjs
git commit -m "feat: add restore verb rebuilding a working store from the ledger ref"
```

---

### Task 14: end-to-end pilot-store migration + restore round-trip

**Files:**
- Create: `test/e2e/migration.e2e.test.mjs`
- Depends on: Amendment 5 (`initV1MigrationFixture` added to `test/e2e/helpers/fixtures.mjs`).

**Interfaces:**
- Consumes: `initV1MigrationFixture`/`tempDir`/`cleanup` (`./helpers/fixtures.mjs`, Amendment 5); `runMigrate` (`../../src/migrate/pipeline.mjs`); `runRestore` (`../../src/migrate/restore.mjs`); `git` (`../../src/util/git-exec.mjs`).
- Produces: a full pilot-store E2E — dry-run (plan + V1–V3), `--apply` (orphan ref built + V1–V4 green — V4 is a real cold `get_resume_brief` run against the freshly-restored ref — + `Op-Id` trailer + a reported pre-apply snapshot), then `restore` into a fresh working store proving the ledger ref round-trips. No target mutation on dry-run; the source is never written.

- [ ] **Step 1: Write the E2E test**

`test/e2e/migration.e2e.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { git } from '../../src/util/git-exec.mjs'
import { runMigrate } from '../../src/migrate/pipeline.mjs'
import { runRestore } from '../../src/migrate/restore.mjs'
import { initV1MigrationFixture, tempDir, cleanup } from './helpers/fixtures.mjs'

test('pilot store migrates losslessly and restores round-trip', async () => {
  const fx = await initV1MigrationFixture()
  const store = join(fx.dir, '.claude', 'ledger')
  const planOut = join(await tempDir('mig-plan-'), 'plan.json')

  const dry = await runMigrate({ store, apply: false, planOut, now: () => '2026-07-13T00:00:00Z' })
  assert.equal(dry.committed, false)
  assert.equal(dry.backend, 'orphan-branch')
  assert.equal(dry.verification.v1.ok, true)
  assert.equal(dry.verification.v2.ok, true)
  assert.equal(dry.verification.v3.ok, true)
  await assert.rejects(() => git(['rev-parse', 'refs/heads/_ledger'], { cwd: fx.dir }))

  const applied = await runMigrate({ store, apply: true, now: () => '2026-07-13T00:00:00Z' })
  assert.equal(applied.committed, true)
  assert.equal(applied.verification.ok, true)
  assert.equal(applied.verification.v4.ok, true)
  assert.match(applied.snapshot, /continuity-migration\/v1-source\.tgz$/)
  const ref = (await git(['rev-parse', 'refs/heads/_ledger'], { cwd: fx.dir })).trim()
  assert.match(ref, /^[0-9a-f]{40}$/)
  assert.match(await git(['log', '-1', '--format=%B', 'refs/heads/_ledger'], { cwd: fx.dir }), /Op-Id: [0-9A-HJKMNP-TV-Z]{26}/)

  const target = await tempDir('mig-restore-')
  const restored = await runRestore({ repoDir: fx.dir, target, force: true })
  assert.ok(restored.counts.resumable >= 1)
  const threadPaths = restored.restored
  assert.ok(threadPaths >= applied.baseline_counts.threads)
  const back = JSON.parse(await readFile(join(target, 'threads', `${applied.thread_map.entries[0].id}.json`), 'utf8'))
  assert.equal(back.schema_version, 1)

  await cleanup(fx.dir, target, planOut)
})
```

- [ ] **Step 2: Run the E2E to verify it fails**

Run: `node --test test/e2e/migration.e2e.test.mjs`
Expected: FAIL — `initV1MigrationFixture` is not yet exported (Amendment 5) / the migration modules are not yet wired end-to-end.

- [ ] **Step 3: Land Amendment 5, then implement to green**

Apply Amendment 5 (fixture builder) and ensure Tasks 2–13 are on `main`. Re-run.

- [ ] **Step 4: Run the E2E to verify it passes**

Run: `node --test test/e2e/migration.e2e.test.mjs`
Expected: PASS — dry-run verifies V1–V3, `--apply` builds the orphan ref with an `Op-Id` trailer, green V1–V4 verification (V4 restores the ref into a throwaway store for a real cold `get_resume_brief`), and a reported pre-apply snapshot, and `restore` round-trips every record.

- [ ] **Step 5: Commit**

```bash
git add test/e2e/migration.e2e.test.mjs
git commit -m "test: add end-to-end pilot-store migration and restore round-trip"
```

---

## Amendments to sibling plans (ship with this plan)

These amendments are numbered to match the in-plan cross-references already frozen in the pinned decisions: decision 9 cites **Amendment 2** (the `#ensureLedgerRef` adoption) and decision 8 cites **Amendment 3** (the non-git `selectDriver` prerequisite). There is no Amendment 1 — the migration plan carries no edit to a sibling that precedes the adoption amendment, so the set runs 2–5. Each amendment is surgical: it names the target plan, the exact anchor, the rationale, and the precise edit. Apply them in the same change-set that ships Tasks 1–14; they are the reason plan-07 declares deps on Plans 00, 02, 04, and 06.

### Amendment 2 — Plan 02 `#ensureLedgerRef`: the "ref exists" branch IS the migration-adoption path (and export the deterministic-root constants)

- **Target:** `2026-06-30-continuity-v2-02-git-ref-driver.md` — `#ensureLedgerRef` at lines 450–466; the constant block at lines 392–401; the `git-ledger.mjs` export block at lines 122–159.
- **Rationale (grounded in pinned decision 9):** N18 builds the target ref by parenting on `deterministicRoot(repoDir)` = `commit-tree $EMPTY_TREE_SHA -m $LEDGER_ROOT_MESSAGE` under `$LEDGER_INIT_IDENTITY`, the SAME root the driver mints at 461–465. When the driver later runs `init()` over a migration-pre-seeded store, `#ensureLedgerRef`'s first branch (`if (await this.#refExists(this.ledgerRef)) return`) fires and **adopts** the pre-seeded ref as legitimate — no re-mint, no clobber. That adoption is only sound if the pre-seeded ref's ROOT ancestor is byte-identical to the driver's deterministic root; otherwise reconcile/restore determinism checks would later disagree. Today `EMPTY_TREE_SHA`, `LEDGER_ROOT_MESSAGE`, and `LEDGER_INIT_IDENTITY` are module-private `const`s in `git-ref-driver.mjs`, so the migration would have to REDECLARE them — a silent-drift hazard (Quality pillar). Promoting them to a single exported source of truth makes root-identity mechanical, not a copy-paste coincidence.
- **Edit (two parts):**
  1. **Normative note** at `#ensureLedgerRef` (prose in Task 3's Interfaces/notes, NEVER a code comment): "Branch (1) — the ref already exists — is the migration-adoption path. A migration (Plan 07 N18) pre-seeds `refs/heads/_ledger` by parenting on the identical `deterministicRoot`; because the root SHA is byte-identical, `#ensureLedgerRef` legitimately adopts the pre-seeded ref and never re-mints. INVARIANT: any pre-seeded `_ledger` MUST have `deterministicRoot(repoDir)` as its root ancestor."
  2. **Promote the constants.** In `src/drivers/git-ledger.mjs` add three exports alongside the existing tuning constants (after line 126):
     ```js
     export const EMPTY_TREE_SHA = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
     export const LEDGER_ROOT_MESSAGE = 'chore: initialize continuity ledger'
     export const LEDGER_INIT_IDENTITY = Object.freeze({
       GIT_AUTHOR_NAME: 'Continuity Ledger',
       GIT_AUTHOR_EMAIL: 'ledger@continuity.invalid',
       GIT_AUTHOR_DATE: '2020-01-01T00:00:00Z',
       GIT_COMMITTER_NAME: 'Continuity Ledger',
       GIT_COMMITTER_EMAIL: 'ledger@continuity.invalid',
       GIT_COMMITTER_DATE: '2020-01-01T00:00:00Z',
     })
     ```
     Then in `src/drivers/git-ref-driver.mjs` DELETE the local `const EMPTY_TREE_SHA` / `const LEDGER_ROOT_MESSAGE` / `const LEDGER_INIT_IDENTITY` (lines 392–401) and add those three names to the existing `from './git-ledger.mjs'` import (lines 387–390), leaving `LEDGER_SCAFFOLD_MESSAGE` local. Values are byte-identical to the current definitions, so the driver's minted root SHA is unchanged and every Plan 02 test stays green. `src/migrate/materialize.mjs` (Task 9) imports the three names from `../drivers/git-ledger.mjs`.

### Amendment 3 — Plan 02 `selectDriver` + Plan 00:164: migration NEVER auto-git-inits a project

- **Target:** `2026-06-30-continuity-v2-02-git-ref-driver.md` — Task 8 `selectDriver` at lines 1259–1379 (Interfaces block, lines 1265–1267); and `2026-06-30-continuity-v2-00-overview.md` — the "Driver selection" prose at line 164.
- **Rationale (grounded in pinned decision 8):** `selectDriver` returns a `GitRefDriver` only for an existing git work tree; a non-git project migrates to a `LocalDriver` plain-file store (`${CLAUDE_PLUGIN_DATA}/<project-key>/ledger`, `vcs_ref: null`, zero bindings). Migration must inherit this exactly and must NOT paper over a non-git project by running `git init` — an implicit repo would fabricate history the human never authored and silently change the durability model. Durability for the one gitignored, history-less store comes from the mandatory pre-run tarball snapshot (pipeline N0 / decision 12 step 5), not an implicit repo.
- **Edit (recorded here; applied to both siblings at ship time):** add a normative note to `selectDriver`'s Interfaces block and to Plan 00:164 prose: "Migration (Plan 07) reuses `selectDriver`'s git-vs-non-git decision verbatim and NEVER auto-`git init`s a project. A non-git project migrates to the `LocalDriver` plain-file store (`vcs_ref: null`, zero bindings). Git-backed continuity for a currently-non-git project is an explicit human prerequisite: `git init` first, then migrate. There is no code path in `selectDriver`, `migrate`, or the installer that creates a git repo on the user's behalf."

### Amendment 4 — Plan 04 Task 11: v1-hook retirement at migration cutover (net-new)

- **Target:** `2026-06-30-continuity-v2-04-hooks-and-trailer.md` — Task 11 (managed-hooks installer) at lines 1163–1412; insert a new Step 6 BEFORE Task 12 at line 1415. No existing anchor covers this — it is net-new content that extends the installer already shipping `installCommitMsgHook`/`uninstallCommitMsgHook`.
- **Rationale:** once a store is migrated to v2, the OLD v1 markdown-ledger continuity hooks must stop running against it — otherwise a chained v1 SessionStart/Stop hook would keep operating on the retired v1 directory, re-creating drift the migration just eliminated. The v2 installer already CHAINS (never clobbers) prior hooks via the dispatcher (fail-open); retirement is the narrow, reversible act of removing the NAMED v1 continuity hooks from that chained set at cutover, reusing the installer's `git config` plumbing. It must never touch unrelated user hooks (Husky/lint/test stay chained).
- **Edit — add Step 6 to Task 11:**
  - **Produces:** `retireV1Hooks({ repoDir, managedDir, v1HookNames }): Promise<{ retired, moved }>` and its inverse `restoreV1Hooks({ repoDir })`. `retireV1Hooks` records the current `continuity.priorHooksPath` and, for each name in `v1HookNames` (the v1 continuity hook basenames), relocates that hook out of the chained prior-hooks directory into a recorded `continuity.retiredHooksPath` sidecar and sets `continuity.v1Retired=true`, so the v2 dispatcher (which only execs an executable at `$prior_dir/$hook_name`) no longer chains it. It NEVER deletes a hook (reversible: `restoreV1Hooks` moves them back and clears the keys) and NEVER touches a hook name outside `v1HookNames`. Refuses (no-op, `retired:false`) when `core.hooksPath` is not the managed dir (i.e. the v2 installer never ran). The migration cutover (Plan 07 pipeline, post-`--apply` success) calls `retireV1Hooks` for the migrated repo.
  - **Test names (one new test file `test/unit/retire-v1-hooks.test.mjs`):** "retireV1Hooks stops the dispatcher from chaining a named v1 hook" (seed a prior `pre-commit`-style v1 continuity hook that touches a sentinel; install the managed dir; `retireV1Hooks`; exec the managed same-named hook; assert the sentinel is NOT created); "restoreV1Hooks re-chains a retired hook and clears the keys"; "retireV1Hooks leaves an unrelated user hook (husky pre-push) chained".
  - The Step 6 body follows Task 11's exact structure (write failing test → run red → implement in `hooks/lib/install-commit-msg.mjs` alongside `installCommitMsgHook`/`uninstallCommitMsgHook`, reusing `getConfig`/`git` → run green → commit `feat: retire v1 continuity hooks at migration cutover`).

### Amendment 5 — Plan 06 `fixtures.mjs`: add a v1 migration-fixture builder

- **Target:** `2026-06-30-continuity-v2-06-skills-packaging-e2e.md` — the `fixtures.mjs` listing at lines 790–861; insert AFTER `initGitRepoWithRemote` (ends line 835) and BEFORE `initNonGitDir` (line 837), reusing the existing `runGit`/`tempDir`/`initGitRepo` helpers.
- **Rationale:** Task 14's E2E needs a realistic, committed v1 store (git repo + `.claude/ledger` with a PROJECT.md, two threads across two statuses, two decisions with resolvable `Thread-Id`s, and three sessions) to exercise the full pipeline. It belongs with the other fixture builders, not duplicated in the test.
- **Edit — add `mkdir` to the `node:fs/promises` import (line 793) and insert:**
  ```js
  export async function initV1MigrationFixture() {
    const repo = await initGitRepo()
    const ledger = join(repo.dir, '.claude', 'ledger')
    await mkdir(join(ledger, 'threads'), { recursive: true })
    await mkdir(join(ledger, 'decisions'), { recursive: true })
    await mkdir(join(ledger, 'sessions'), { recursive: true })
    await writeFile(join(ledger, 'PROJECT.md'), [
      '# PROJECT', '2 threads / 2 decisions', '',
      '## Active Decisions', '- 0001-pick-argon2', '- 0002-adopt-orphan-ref', '',
    ].join('\n'))
    await writeFile(join(ledger, 'threads', 'auth-refactor.md'), [
      '---', 'slug: auth-refactor', 'title: Auth refactor', 'status: paused', 'updated: 2026-06-10', '---',
      '# Auth refactor', 'Status: paused', 'Active Goal: ship argon2 auth', 'Next Step: write deny-case tests',
      'Key Decisions:', '- see 2026-06-02-pick-argon2', '',
    ].join('\n'))
    await writeFile(join(ledger, 'threads', 'cache-layer.md'), [
      '# Cache layer', 'Status: blocked', 'Updated: 2026-06-11',
      'Active Goal: pick a cache store', 'Next Step: benchmark redis vs sqlite', '',
    ].join('\n'))
    await writeFile(join(ledger, 'decisions', '2026-06-02-pick-argon2.md'), [
      '# 0001 — Pick argon2', 'Status: accepted', 'Thread-Id: auth-refactor',
      '## Context and Problem', 'need a password hash', '## Considered Options', '- bcrypt', '- argon2',
      '## Decision Outcome', 'argon2 for memory hardness', '',
    ].join('\n'))
    await writeFile(join(ledger, 'decisions', '2026-06-03-adopt-orphan-ref.md'), [
      '# Decision: adopt orphan ref', 'Thread-Id: cache-layer',
      '## Context and Problem', 'where to store the ledger', '## Considered Options', '- branch', '- notes',
      '## Decision Outcome', 'orphan branch', '',
    ].join('\n'))
    await writeFile(join(ledger, 'sessions', '2026-06-05-01-auth-refactor.md'), '# session 1\nstarted auth\n')
    await writeFile(join(ledger, 'sessions', '2026-06-06-01-auth-refactor.md'), '# session 2\nmore auth\n')
    await writeFile(join(ledger, 'sessions', '2026-06-05-01-cache-layer.md'), '# session\ncache spike\n')
    await repo.git('add', '.')
    await repo.git('commit', '-m', 'chore: seed v1 ledger fixture')
    return repo
  }
  ```

---

## Node coverage map (N0–N19 → task)

Every DAG node lands in exactly one task; verification layers V1–V5 land in Task 10 and are driven by Task 12.

| Node | Responsibility | Task |
|---|---|---|
| N0 | pre-flight: quiescence gate + source SHA-256 baseline + inventory hash + tarball snapshot | Task 12 (`assemblePlan` gate, `hashSource`, `snapshotSource`) |
| N1 | store inventory + exclusions | Task 2 |
| N2 | canonical election / worktree subset-verify / only-in-copy HALT | Task 3 (`dedup.mjs`) |
| N3 | preconditions: no compact sentinel, catalogue zombie active | Task 3 (`preconditions.mjs`) |
| N4 | thread/decision/PROJECT.md/session parsers + Key-Decisions expansion | Task 4 |
| N5 | created_at derivation ladder (rung recorded) | Task 5 |
| N6 | thread ULID minting (monotonicFactory seeded by created_at ms) | Task 6 |
| N7 | decision NNNN = `String(max+1).padStart(4,'0')` over (date, filename) | Task 6 |
| N8 | cross-ref reverse index | Task 7 |
| N9 | two-pass rewrite, dangling → HALT | Task 7 |
| N10 | emit Thread JSON (`schema_version:1`, `validateThread`) | Task 8 |
| N11 | emit Decision markdown (`renderDecision`) | Task 8 |
| N12 | emit Session (byte-copy) | Task 8 |
| N13 | emit BranchBinding (`validateBinding`, no `schema_version`) | Task 8 |
| N14 | demotion records (`actor:'migrated'`, zombie-active → paused) | Task 8 |
| N15 | PROJECT.md ≤ 80 lines | Task 8 |
| N16 | rebuildIndex (NOT committed) | Task 9 (`materializeLocal`) / Task 12 (`indexCounts`) |
| N17 | verification harness V1–V5 | Task 10 |
| N18 | orphan plumbing build on deterministic root (Op-Id trailer, `core.fsync=all`) OR LocalDriver plain-file | Task 9 |
| N19 | ReviewQueue roll-up + human report (blocks done) | Task 11 |
