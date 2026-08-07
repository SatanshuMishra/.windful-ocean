# Continuity v2 — Plan 03: MCP Server (tool surface + FSM/DoD/caps)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This is plan 3 of 6; the shared contract lives in `2026-06-30-continuity-v2-00-overview.md` and is authoritative for every schema, interface, tool name, and constraint referenced here. **Deps: Plan 01 (Plan 02 optional at runtime — this plan only depends on the Plan 01 driver surface).**

**Goal:** Ship the ledger's entire write surface as a bundled stdio MCP server plus its hook-facing CLI. One tool per file implementing all twelve tools from Plan 00's "MCP tool surface" — including `update_thread` (tool #12: spine patch + completion-criteria toggle) — each enforcing schema (ajv), the five-state FSM + DoD gate (Plan 01 `fsm`), spine caps, immutability, and referential integrity. `reconcile` ships as a DECLARED tool over a thin `runReconcile(ctx)` stub that Plan 05 fills; the Plan 03 tool WRAPPER commits via `commitAndReindex` while the `runReconcile` core stays COMMIT-FREE (pin 6 / H1). The server WRITES/CLEARS the `active-thread` control pointer on enter/leave-active (pin 3), reads `LEDGER_*` env into `userConfig` (pin 4), and — via `bin/ledger-cli.mjs` (DD-B) — exposes the `roster`/`reconcile`/`active-thread`/`record-sha`/`sync` subcommands the hooks call. The server is the SOLE ledger writer: every mutation goes through a typed tool, so malformed ledger state is structurally impossible.

**Architecture:** `bin/ledger-server.mjs` is the stdio entrypoint. It builds a per-session context (`selectDriver` -> `init()`), constructs the low-level SDK `Server`, and wires two request handlers: `tools/list` (advertises each tool's `inputSchema`) and `tools/call` (validates args with ajv, dispatches to the tool's `handler(args, ctx)`, wraps the result). Each `src/tools/<tool>.mjs` exports `{ name, description, inputSchema, handler }` and reaches storage ONLY through `ctx.driver` (a Plan 01 `StorageDriver`). Business rules that recur (thread lookup, index+commit, FSM transition) live in `src/tools/shared.mjs` so every tool is the same shape. The entrypoint maps `LEDGER_*` env into `userConfig` (via `envToUserConfig`) before `buildContext`, and the handlers that change active-membership WRITE/CLEAR the `active-thread` control pointer through `src/util/active-thread.mjs` (the pointer path resolves via `git rev-parse --git-common-dir`, matching the Plan 04 `commit-msg` hook — control-plane path resolution, not ledger storage). The tool handlers are pure functions of `(args, ctx)` and are unit-tested directly against a `LocalDriver` in a temp dir; the entrypoint gets one integration test that drives it over a real stdio transport via the SDK `Client`. `bin/ledger-cli.mjs` is the thin hook-facing seam over `runCli(argv, buildOpts)`.

**Tech Stack:** Node.js >= 20 (ESM, `.mjs`), `node --test`, `@modelcontextprotocol/sdk` 1.29.0 (`Server`, `StdioServerTransport`, `ListToolsRequestSchema`, `CallToolRequestSchema`; `Client`/`StdioClientTransport` in the one integration test), `ajv` 8.20.0 for per-tool argument validation, `ulid` (via Plan 01). Plain JS, no TypeScript, no build step. Deps stay at exactly three — the low-level `Server` accepts raw JSON-Schema `inputSchema` and hands raw `arguments` to `tools/call`, so ajv (already a dep) does validation and no 4th dependency (e.g. zod) is pulled in.

## Context to read first

- `2026-06-30-continuity-v2-00-overview.md` — MCP tool surface (§"MCP tool surface"), FSM + DoD (§"FSM"), record schemas, StorageDriver interface, repo layout. LAW.
- `2026-06-30-continuity-v2-01-core-and-local-driver.md` — the "Downstream contract produced by Plan 01" line + every module this plan imports by exact name.
- `docs/superpowers/specs/2026-06-30-continuity-redesign-v2-design.md` — tool semantics (§"Enforcement planes"), lifecycle (§"Lifecycle and drift"), caps/memory tiers.
- `docs/session-continuity-redesign/DESIGN-STATE.md` — §5.1–5.2 (MCP concretely; `mcp__ledger__<tool>` naming), §6.1 (FSM + DoD), §7.5 (Decision MADR), §7.6 (spine), §7.8 (Resumption Brief).

## Global Constraints (verbatim from Plan 00 — apply to EVERY task)

- Runtime: Node.js >= 20, ES modules only (`.mjs`). No TypeScript. No build step.
- Tests: Node's built-in runner only — `node --test`. No jest/vitest/mocha.
- Dependencies: exactly three runtime deps across the whole plugin — `@modelcontextprotocol/sdk` (added by THIS plan to the import surface; already pinned in Plan 01's `package.json`), `ulid`, `ajv`. Pin EXACT versions. A 4th dependency requires a plan amendment.
- No code comments anywhere (shebang / tooling-pragma / codegen-marker carve-outs only). No emojis. No AI attribution in commits.
- Immutability: never mutate a record in place; construct a new object and atomically write it (through the driver). Small focused files (200–400 lines typical, 800 hard max). Comprehensive error handling; validate at every boundary; never silently swallow errors.
- All cross-references use a stable ULID (or a decision's stable NNNN). A slug or file path is NEVER a link target.
- Storage is reached ONLY through the driver interface. No tool hard-codes a git command or a filesystem path.
- Commit cadence: one logical change per commit; Conventional Commits (`feat:`/`fix:`/`test:`/`refactor:`/`chore:`).

## Design decisions baked into this plan (read once)

1. **Low-level `Server`, not `McpServer`.** `McpServer.registerTool` expects a standard-schema (Zod-style) `inputSchema` and converts it to JSON Schema internally — adopting it would force a 4th dependency. The low-level `Server` (from `@modelcontextprotocol/sdk/server/index.js`) accepts a raw JSON-Schema `inputSchema` in the `tools/list` result and passes raw `arguments` to `tools/call`; ajv validates. Verified against context7 `/modelcontextprotocol/typescript-sdk/v1.29.0` (`docs/server.md` StdioServerTransport + `server.connect`; `CLAUDE.md` `setRequestHandler(CallToolRequestSchema, …)`; `server.ts` low-level `tools/list`/`tools/call`).
2. **Server name = `ledger`.** So tools register as `mcp__ledger__<tool>` (DESIGN-STATE §5.1 uses `mcp__ledger__transition_thread` verbatim). Plan 04 auto-approves `mcp__ledger__*`; Plan 06 packages.
3. **Tool module shape (intra-plan convention).** Each `src/tools/<tool>.mjs` exports `name` (string), `description` (string), `inputSchema` (JSON Schema), `handler(args, ctx)` (async, returns the result payload object). `ctx = { driver, projectDir, userConfig, now }` where `now` is a function returning an ISO timestamp (injected for deterministic tests).
4. **`update_thread` is FROZEN tool #12 (DD-A).** Plan 00's tool surface names `update_thread({thread_id, spine?, completion_criteria?}) -> {thread}` as tool #12 (it SUPERSEDES the earlier Plan-03-only `update_thread_spine`). It patches `spine` fields AND toggles `completion_criteria[].done` matched by immutable `text` (texts are never added/removed/edited — only `done` flips; unknown texts rejected). Caps-enforced and terminal-refused on BOTH the spine and the criteria paths; `spine.key_decisions` is EXEMPT from the array count cap (M1) so a >20-decision epic can still refresh its spine. No cross-plan flag needed — this is a frozen name/shape; Plan 06 `session-handoff` and the multi-session DoD e2e consume it. The other eleven frozen tools keep their EXACT names/args/returns.
5. **`reconcile` is a thin stub over a pinned seam; the tool WRAPPER commits.** `src/tools/reconcile.mjs` delegates to `runReconcile(ctx)` in `src/drift/reconcile.mjs`. This plan ships `runReconcile` returning `{ drift: [], dispositions: [] }` COMMIT-FREE; Plan 05 replaces only the body, keeping the exact export name, `ctx` signature, and return shape. Per pin 6 / H1 the Plan 03 tool WRAPPER wraps the `runReconcile` result with `commitAndReindex` (like the other 8 write-capable tools), so Plan 05's binding mutations are committed exactly once (neither dropped nor doubled). `reconcile` MUTATES bindings, so "recommend-only" is true of THREAD TRANSITIONS only.
6. **`get_resume_brief` composes from the spine + children index, not raw session-log content.** The frozen `StorageDriver` (Plan 00) exposes `appendSessionEvent` but no session-READ method, so brief content is drawn from the warm `spine` (the intended progressive summary) plus `index/children.json`. This is FROZEN as DD-F (spine-only): the refreshed spine subsumes the latest session log, so no session-read method is added.
7. **`bind_branch` is not gated on `isGit()`.** Plan 01's `LocalDriver` fully implements binding storage, so `bind_branch` writes through whatever driver `ctx` holds (keeps Plan 03 testable with Plan 01 alone). The S3 "non-git projects have no bindings" invariant is caller policy (skills/hooks simply never call it off-git), not a server refusal.

## File Structure (this plan creates)

- `src/tools/slug.mjs` — `slugify(title)`, `ensureUniqueSlug(driver, base)`.
- `src/tools/caps.mjs` — `SPINE_CAPS`, `enforceSpineCaps(spine)` (`key_decisions` exempt from the count cap, M1).
- `src/tools/decision-md.mjs` — `renderDecision(fields)` (MADR markdown, `Thread-Id:` frontmatter).
- `src/tools/shared.mjs` — `requireThread`, `commitAndReindex`, `applyTransition`.
- `src/util/active-thread.mjs` — `activeThreadPath`/`writeActiveThread`/`clearActiveThread`/`readActiveThread` (the `active-thread` control pointer; pin 3).
- `src/tools/open_thread.mjs`, `bind_branch.mjs`, `append_session_event.mjs`, `record_decision.mjs`, `transition_thread.mjs`, `update_thread.mjs`, `archive_thread.mjs`, `create_successor.mjs`, `reopen.mjs`, `reconcile.mjs`, `rebuild_index.mjs`, `get_resume_brief.mjs` — one tool per file.
- `src/drift/reconcile.mjs` — `runReconcile(ctx)` STUB (Plan 05 fills; commit-free).
- `src/tools/context.mjs` — `buildContext(opts)`, `envToUserConfig(env)` (pin 4).
- `src/tools/registry.mjs` — `listTools()`, `callTool(name, args, ctx)`.
- `src/cli/run.mjs` — `runCli(argv, buildOpts)` (DD-B command dispatch).
- `bin/ledger-server.mjs` — stdio MCP entrypoint.
- `bin/ledger-cli.mjs` — hook-facing CLI (thin wrapper over `runCli`).
- `.mcp.json` — stdio server declaration.
- `test/helpers/tool-ctx.mjs` — shared `freshCtx()` / `disposeCtx()` test helper.
- `test/unit/*.test.mjs`, `test/integration/ledger-server.test.mjs`.

---

### Task 1: Slug utility

**Files:**
- Create: `src/tools/slug.mjs`
- Test: `test/unit/slug.test.mjs`

**Interfaces:**
- Consumes: a `StorageDriver` (for `ensureUniqueSlug`, via `readIndexFile('by-slug')`).
- Produces: `slugify(title): string` (lowercase, non-alnum -> `-`, trimmed, capped 64, never empty); `ensureUniqueSlug(driver, base): Promise<string>` (returns `base`, else `base-2`, `base-3`, … using the derived `by-slug` index).

- [ ] **Step 1: Write the failing test**

`test/unit/slug.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { slugify, ensureUniqueSlug } from '../../src/tools/slug.mjs'
import { LocalDriver } from '../../src/drivers/local-driver.mjs'

test('slugify normalizes to lowercase kebab and never returns empty', () => {
  assert.equal(slugify('Fix Sign-up 500!'), 'fix-sign-up-500')
  assert.equal(slugify('  Trailing --- dashes  '), 'trailing-dashes')
  assert.equal(slugify('***'), 'thread')
})

test('ensureUniqueSlug returns the base when free and suffixes on collision', async () => {
  const root = join(await mkdtemp(join(tmpdir(), 'ledger-slug-')), 'ledger')
  const d = new LocalDriver(root)
  await d.init()
  assert.equal(await ensureUniqueSlug(d, 'fix-x'), 'fix-x')
  await d.writeIndexFile('by-slug', { 'fix-x': '01ARZ3NDEKTSV4RRFFQ69G5FAV', 'fix-x-2': '01ARZ3NDEKTSV4RRFFQ69G5FBW' })
  assert.equal(await ensureUniqueSlug(d, 'fix-x'), 'fix-x-3')
  await rm(root, { recursive: true, force: true })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/slug.test.mjs`
Expected: FAIL — cannot find module `../../src/tools/slug.mjs`.

- [ ] **Step 3: Write the implementation**

`src/tools/slug.mjs`:

```js
export function slugify(title) {
  const base = String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '')
  return base === '' ? 'thread' : base
}

export async function ensureUniqueSlug(driver, base) {
  const bySlug = await driver.readIndexFile('by-slug')
  if (!(base in bySlug)) {
    return base
  }
  let n = 2
  while (`${base}-${n}` in bySlug) {
    n += 1
  }
  return `${base}-${n}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/slug.test.mjs`
Expected: PASS — 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/tools/slug.mjs test/unit/slug.test.mjs
git commit -m "feat: add slug derivation and uniqueness for tool inputs"
```

---

### Task 2: Spine caps

**Files:**
- Create: `src/tools/caps.mjs`
- Test: `test/unit/caps.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `SPINE_CAPS` (`{ scalarFieldMaxChars, arrayMaxItems, arrayItemMaxChars }`); `enforceSpineCaps(spine): spine` — throws when a scalar field, array length, or array item exceeds its cap. **`key_decisions` is EXEMPT from the array COUNT cap (M1)** — the per-item char cap still applies — so a >20-decision epic can still refresh its spine via `update_thread`. Consumed by `open_thread` (defensively) and `update_thread`.

- [ ] **Step 1: Write the failing test**

`test/unit/caps.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SPINE_CAPS, enforceSpineCaps } from '../../src/tools/caps.mjs'

const ok = {
  status: 'paused', active_goal: 'g', next_step: 'n',
  open_risks: ['r'], key_decisions: ['0007-x'], out_of_scope: ['later'],
}

test('SPINE_CAPS exposes numeric caps', () => {
  assert.equal(typeof SPINE_CAPS.scalarFieldMaxChars, 'number')
  assert.equal(typeof SPINE_CAPS.arrayMaxItems, 'number')
  assert.equal(typeof SPINE_CAPS.arrayItemMaxChars, 'number')
})

test('a within-caps spine passes and is returned', () => {
  assert.equal(enforceSpineCaps(ok), ok)
})

test('an over-long scalar field is rejected', () => {
  const bad = { ...ok, active_goal: 'x'.repeat(SPINE_CAPS.scalarFieldMaxChars + 1) }
  assert.throws(() => enforceSpineCaps(bad), /active_goal exceeds/)
})

test('too many array items is rejected', () => {
  const bad = { ...ok, open_risks: Array.from({ length: SPINE_CAPS.arrayMaxItems + 1 }, () => 'r') }
  assert.throws(() => enforceSpineCaps(bad), /open_risks exceeds/)
})

test('an over-long array item is rejected', () => {
  const bad = { ...ok, out_of_scope: ['y'.repeat(SPINE_CAPS.arrayItemMaxChars + 1)] }
  assert.throws(() => enforceSpineCaps(bad), /out_of_scope item exceeds/)
})

test('key_decisions is EXEMPT from the array count cap (M1) but keeps the per-item char cap', () => {
  const many = { ...ok, key_decisions: Array.from({ length: SPINE_CAPS.arrayMaxItems + 5 }, (_, i) => `${String(i).padStart(4, '0')}-d`) }
  assert.equal(enforceSpineCaps(many), many)
  const longItem = { ...ok, key_decisions: ['z'.repeat(SPINE_CAPS.arrayItemMaxChars + 1)] }
  assert.throws(() => enforceSpineCaps(longItem), /key_decisions item exceeds/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/caps.test.mjs`
Expected: FAIL — cannot find module `../../src/tools/caps.mjs`.

- [ ] **Step 3: Write the implementation**

`src/tools/caps.mjs`:

```js
export const SPINE_CAPS = {
  scalarFieldMaxChars: 500,
  arrayMaxItems: 20,
  arrayItemMaxChars: 300,
}

const SCALAR_FIELDS = ['status', 'active_goal', 'next_step']
const ARRAY_FIELDS = ['open_risks', 'key_decisions', 'out_of_scope']
const COUNT_CAPPED_ARRAY_FIELDS = ['open_risks', 'out_of_scope']

export function enforceSpineCaps(spine) {
  for (const field of SCALAR_FIELDS) {
    const value = spine[field]
    if (typeof value === 'string' && value.length > SPINE_CAPS.scalarFieldMaxChars) {
      throw new Error(`spine.${field} exceeds ${SPINE_CAPS.scalarFieldMaxChars} chars`)
    }
  }
  for (const field of ARRAY_FIELDS) {
    const arr = spine[field]
    if (!Array.isArray(arr)) {
      continue
    }
    if (COUNT_CAPPED_ARRAY_FIELDS.includes(field) && arr.length > SPINE_CAPS.arrayMaxItems) {
      throw new Error(`spine.${field} exceeds ${SPINE_CAPS.arrayMaxItems} items`)
    }
    for (const item of arr) {
      if (typeof item === 'string' && item.length > SPINE_CAPS.arrayItemMaxChars) {
        throw new Error(`spine.${field} item exceeds ${SPINE_CAPS.arrayItemMaxChars} chars`)
      }
    }
  }
  return spine
}
```

`key_decisions` is intentionally absent from `COUNT_CAPPED_ARRAY_FIELDS` (M1): `record_decision` grows it unbounded, so a count cap would make a mature epic un-refreshable. The per-item char cap still guards every `key_decisions` entry.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/caps.test.mjs`
Expected: PASS — 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/tools/caps.mjs test/unit/caps.test.mjs
git commit -m "feat: add spine field caps enforcement"
```

---

### Task 3: Decision MADR renderer

**Files:**
- Create: `src/tools/decision-md.mjs`
- Test: `test/unit/decision-md.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `renderDecision({ nnnn, title, context, options, outcome, threadId, date }): string` — a MADR markdown record matching DESIGN-STATE §7.5 (frontmatter `Status: accepted`, `Date`, `Thread-Id: <ulid>`; sections Context and Problem / Considered Options / Decision Outcome / More Information).

- [ ] **Step 1: Write the failing test**

`test/unit/decision-md.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderDecision } from '../../src/tools/decision-md.mjs'

const THREAD = '01ARZ3NDEKTSV4RRFFQ69G5FAV'

test('renderDecision produces a MADR record with the ULID Thread-Id and options list', () => {
  const md = renderDecision({
    nnnn: '0007', title: 'Adopt orphan branch', context: 'Where to store the ledger.',
    options: ['Orphan branch (chosen)', 'refs/ledger/* namespace', 'git notes'],
    outcome: 'Chosen: orphan branch, because host portability.',
    threadId: THREAD, date: '2026-06-30',
  })
  assert.match(md, /^# 0007 — Adopt orphan branch$/m)
  assert.match(md, /^Status: accepted$/m)
  assert.match(md, /^Date: 2026-06-30$/m)
  assert.match(md, new RegExp(`^Thread-Id: ${THREAD}$`, 'm'))
  assert.match(md, /## Considered Options\n- Orphan branch \(chosen\)\n- refs\/ledger\/\* namespace\n- git notes/)
  assert.match(md, /## Decision Outcome\nChosen: orphan branch/)
  assert.match(md, /## More Information\nSupersedes: \(none\)   Superseded-by: \(none\)/)
})

test('renderDecision tolerates an empty options list', () => {
  const md = renderDecision({ nnnn: '0001', title: 'T', context: 'c', options: [], outcome: 'o', threadId: THREAD, date: '2026-06-30' })
  assert.match(md, /## Considered Options\n\n## Decision Outcome/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/decision-md.test.mjs`
Expected: FAIL — cannot find module `../../src/tools/decision-md.mjs`.

- [ ] **Step 3: Write the implementation**

`src/tools/decision-md.mjs`:

```js
export function renderDecision({ nnnn, title, context, options, outcome, threadId, date }) {
  const optionLines = (options ?? []).map((o) => `- ${o}`).join('\n')
  return [
    `# ${nnnn} — ${title}`,
    'Status: accepted',
    `Date: ${date}`,
    `Thread-Id: ${threadId}`,
    '',
    '## Context and Problem',
    context,
    '',
    '## Considered Options',
    optionLines,
    '',
    '## Decision Outcome',
    outcome,
    '',
    '## More Information',
    'Supersedes: (none)   Superseded-by: (none)',
    '',
  ].join('\n')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/decision-md.test.mjs`
Expected: PASS — 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/tools/decision-md.mjs test/unit/decision-md.test.mjs
git commit -m "feat: add MADR decision markdown renderer"
```

---

### Task 4: Shared tool helpers + FSM transition core + active-thread pointer

**Files:**
- Create: `src/tools/shared.mjs`, `src/util/active-thread.mjs`, `test/helpers/tool-ctx.mjs`
- Test: `test/unit/shared.test.mjs`, `test/unit/active-thread.test.mjs`

**Interfaces:**
- Consumes: `isUlid` (`src/util/ulid.mjs`), `rebuildIndex` (`src/index/build-index.mjs`), `canTransition`/`isTerminal`/`dodSatisfied` (`src/model/fsm.mjs`), `ulid` (`ulid`), `node:child_process`/`node:fs/promises` (control-plane path resolution + atomic pointer write).
- Produces: `requireThread(driver, id): Promise<Thread>` (throws on non-ULID / missing); `commitAndReindex(driver, message): Promise<counts>` (rebuilds the derived index then `driver.commit`); `applyTransition(driver, thread, toStatus, opts): Promise<Thread>` — enforces the FSM matrix + DoD gate + `blocked`/`abandoned` reason requirements, PERSISTS `blocked_by`/`abandoned_reason`/`closure_statement` (Plan 00 Thread schema fields) into the immutably-updated thread on the matching transition, writes it, and appends a `ledger`-actor transition session event as an audit log. Consumed by `transition_thread`, `archive_thread`, `reopen`; `applyTransition` is also offered to Plan 05 drift dispositions.
- `src/util/active-thread.mjs` (pin 3) produces `writeActiveThread(ctx, threadId)`, `clearActiveThread(ctx)`, `readActiveThread(ctx): Promise<string|null>`, `activeThreadPath(ctx): Promise<string>`. The path resolves via `git rev-parse --git-common-dir` → `<git-common-dir>/ledger/active-thread` for git projects, else the sibling of `ctx.driver.root()` (`${CLAUDE_PLUGIN_DATA}/<project-key>/active-thread`, per Plan 00). This is Plan-00-sanctioned control-plane path resolution — identical to the Plan 04 `commit-msg` hook's `--git-common-dir` resolution, NOT ledger storage — so it is exempt from the "storage only through the driver" rule. Consumed by `open_thread`/`create_successor`/`bind_branch`/`transition_thread`/`reopen`/`archive_thread` (writers/clearers) and by the CLI `active-thread`/`record-sha` reader.
- `test/helpers/tool-ctx.mjs` produces `FIXED_NOW`, `freshCtx()` (`{ base, driver, projectDir, userConfig, now }`), `disposeCtx(ctx)` — reused by every tool test.

- [ ] **Step 1: Write the test helper**

`test/helpers/tool-ctx.mjs`:

```js
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LocalDriver } from '../../src/drivers/local-driver.mjs'

export const FIXED_NOW = '2026-06-30T10:00:00Z'

export async function freshCtx() {
  const base = await mkdtemp(join(tmpdir(), 'ledger-tool-'))
  const driver = new LocalDriver(join(base, 'ledger'))
  await driver.init()
  return { base, driver, projectDir: join(base, 'proj'), userConfig: { dataRoot: base }, now: () => FIXED_NOW }
}

export async function disposeCtx(ctx) {
  await rm(ctx.base, { recursive: true, force: true })
}
```

- [ ] **Step 2: Write the failing test**

`test/unit/shared.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { requireThread, commitAndReindex, applyTransition } from '../../src/tools/shared.mjs'
import { newThread } from '../../src/model/thread.mjs'
import { freshCtx, disposeCtx, FIXED_NOW } from '../helpers/tool-ctx.mjs'

async function seed(ctx, fields) {
  const t = newThread({ slug: fields.slug ?? 's', title: 'T', now: FIXED_NOW, ...fields })
  await ctx.driver.writeThread(t)
  return t
}

test('requireThread throws on a non-ULID and on a missing thread', async () => {
  const ctx = await freshCtx()
  await assert.rejects(() => requireThread(ctx.driver, 'nope'), /ULID/)
  await assert.rejects(() => requireThread(ctx.driver, '01ARZ3NDEKTSV4RRFFQ69G5FAV'), /not found/)
  await disposeCtx(ctx)
})

test('commitAndReindex rebuilds the index and reports counts', async () => {
  const ctx = await freshCtx()
  await seed(ctx, { slug: 'a', status: 'active' })
  const counts = await commitAndReindex(ctx.driver, 'msg')
  assert.equal(counts['by-slug'], 1)
  assert.equal(counts.resumable, 1)
  await disposeCtx(ctx)
})

test('applyTransition performs a legal move and appends a transition session event', async () => {
  const ctx = await freshCtx()
  const t = await seed(ctx, { status: 'active' })
  const next = await applyTransition(ctx.driver, t, 'paused', { now: FIXED_NOW })
  assert.equal(next.status, 'paused')
  assert.equal(next.spine.status, 'paused')
  const dir = join(await ctx.driver.root(), 'sessions', t.id)
  const body = await readFile(join(dir, '2026-06-30T10-00-00Z--ledger.md'), 'utf8')
  assert.match(body, /Transition active -> paused/)
  await disposeCtx(ctx)
})

test('applyTransition refuses an illegal move', async () => {
  const ctx = await freshCtx()
  const t = await seed(ctx, { status: 'blocked' })
  await assert.rejects(() => applyTransition(ctx.driver, t, 'abandoned', { abandonedReason: 'x', now: FIXED_NOW }), /illegal transition/)
  await disposeCtx(ctx)
})

test('applyTransition enforces the DoD gate for done', async () => {
  const ctx = await freshCtx()
  const undone = await seed(ctx, { slug: 'u', status: 'active', completion_criteria: [{ text: 'a', done: false }] })
  await assert.rejects(() => applyTransition(ctx.driver, undone, 'done', { closureStatement: 'ship', now: FIXED_NOW }), /DoD gate/)
  const done = await seed(ctx, { slug: 'd', status: 'active', completion_criteria: [{ text: 'a', done: true }] })
  const next = await applyTransition(ctx.driver, done, 'done', { closureStatement: 'shipped', now: FIXED_NOW })
  assert.equal(next.status, 'done')
  assert.equal(next.closure_statement, 'shipped')
  await disposeCtx(ctx)
})

test('applyTransition requires a reason for blocked and abandoned', async () => {
  const ctx = await freshCtx()
  const t = await seed(ctx, { status: 'active' })
  await assert.rejects(() => applyTransition(ctx.driver, t, 'blocked', { now: FIXED_NOW }), /blocked_by/)
  await assert.rejects(() => applyTransition(ctx.driver, t, 'abandoned', { now: FIXED_NOW }), /abandoned_reason/)
  await disposeCtx(ctx)
})

test('applyTransition persists blocked_by and abandoned_reason into the Thread record', async () => {
  const ctx = await freshCtx()
  const b = await seed(ctx, { slug: 'b', status: 'active' })
  const blocked = await applyTransition(ctx.driver, b, 'blocked', { blockedBy: 'dep-123', now: FIXED_NOW })
  assert.equal(blocked.blocked_by, 'dep-123')
  assert.deepEqual(await ctx.driver.readThread(b.id), blocked)
  const a = await seed(ctx, { slug: 'a2', status: 'active' })
  const abandoned = await applyTransition(ctx.driver, a, 'abandoned', { abandonedReason: 'obsolete', now: FIXED_NOW })
  assert.equal(abandoned.abandoned_reason, 'obsolete')
  await disposeCtx(ctx)
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test test/unit/shared.test.mjs`
Expected: FAIL — cannot find module `../../src/tools/shared.mjs`.

- [ ] **Step 4: Write the implementation**

`src/tools/shared.mjs`:

```js
import { isUlid } from '../util/ulid.mjs'
import { rebuildIndex } from '../index/build-index.mjs'
import { canTransition, dodSatisfied } from '../model/fsm.mjs'

function nonEmpty(value) {
  return typeof value === 'string' && value.trim() !== ''
}

function transitionNote(from, to, opts) {
  const parts = [`Transition ${from} -> ${to}.`]
  if (nonEmpty(opts.closureStatement)) {
    parts.push(`Closure: ${opts.closureStatement.trim()}`)
  }
  if (nonEmpty(opts.blockedBy)) {
    parts.push(`Blocked by: ${opts.blockedBy.trim()}`)
  }
  if (nonEmpty(opts.abandonedReason)) {
    parts.push(`Abandoned: ${opts.abandonedReason.trim()}`)
  }
  return parts.join(' ')
}

export async function requireThread(driver, id) {
  if (!isUlid(id)) {
    throw new Error(`thread id must be a ULID, got: ${id}`)
  }
  const thread = await driver.readThread(id)
  if (!thread) {
    throw new Error(`thread not found: ${id}`)
  }
  return thread
}

export async function commitAndReindex(driver, message) {
  const counts = await rebuildIndex(driver)
  await driver.commit(message)
  return counts
}

export async function applyTransition(driver, thread, toStatus, opts = {}) {
  const now = opts.now ?? new Date().toISOString()
  if (!canTransition(thread.status, toStatus)) {
    throw new Error(`illegal transition: ${thread.status} -> ${toStatus}`)
  }
  if (toStatus === 'done' && !dodSatisfied(thread, opts.closureStatement)) {
    throw new Error('DoD gate: done requires non-empty, all-checked completion_criteria and a closure statement')
  }
  if (toStatus === 'blocked' && !nonEmpty(opts.blockedBy)) {
    throw new Error('transition to blocked requires blocked_by')
  }
  if (toStatus === 'abandoned' && !nonEmpty(opts.abandonedReason)) {
    throw new Error('transition to abandoned requires abandoned_reason')
  }
  const next = {
    ...thread,
    status: toStatus,
    updated_at: now,
    blocked_by: toStatus === 'blocked' ? opts.blockedBy : (thread.blocked_by ?? null),
    abandoned_reason: toStatus === 'abandoned' ? opts.abandonedReason : (thread.abandoned_reason ?? null),
    closure_statement: toStatus === 'done' ? opts.closureStatement : (thread.closure_statement ?? null),
    spine: { ...thread.spine, status: toStatus },
  }
  await driver.writeThread(next)
  await driver.appendSessionEvent(thread.id, now, 'ledger', transitionNote(thread.status, toStatus, opts))
  return next
}
```

`blocked_by`/`abandoned_reason`/`closure_statement` are now first-class Plan 00 Thread schema fields (nullable). `applyTransition` writes each on its matching transition and carries prior values forward otherwise, so the Resumption Brief has a lossless home; the appended session event remains as a transition audit log.

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/unit/shared.test.mjs`
Expected: PASS — 7 tests pass.

- [ ] **Step 6: Write the active-thread pointer module + test**

`src/util/active-thread.mjs`:

```js
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, writeFile, readFile, rename, rm } from 'node:fs/promises'
import { dirname, join, isAbsolute } from 'node:path'
import { ulid } from 'ulid'

const execFileAsync = promisify(execFile)

async function gitCommonDir(projectDir) {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--git-common-dir'], { cwd: projectDir })
    const dir = stdout.trim()
    if (dir === '') {
      return null
    }
    return isAbsolute(dir) ? dir : join(projectDir, dir)
  } catch {
    return null
  }
}

export async function activeThreadPath(ctx) {
  const common = await gitCommonDir(ctx.projectDir)
  if (common) {
    return join(common, 'ledger', 'active-thread')
  }
  const ledgerRoot = await ctx.driver.root()
  return join(dirname(ledgerRoot), 'active-thread')
}

export async function writeActiveThread(ctx, threadId) {
  const path = await activeThreadPath(ctx)
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.tmp-${ulid()}`
  await writeFile(tmp, `${threadId}\n`, 'utf8')
  await rename(tmp, path)
  return path
}

export async function clearActiveThread(ctx) {
  const path = await activeThreadPath(ctx)
  await rm(path, { force: true })
  return path
}

export async function readActiveThread(ctx) {
  const path = await activeThreadPath(ctx)
  try {
    const value = (await readFile(path, 'utf8')).trim()
    return value === '' ? null : value
  } catch (err) {
    if (err.code === 'ENOENT') {
      return null
    }
    throw err
  }
}
```

`test/unit/active-thread.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { writeActiveThread, clearActiveThread, readActiveThread, activeThreadPath } from '../../src/util/active-thread.mjs'
import { freshCtx, disposeCtx } from '../helpers/tool-ctx.mjs'

const ULID_A = '01ARZ3NDEKTSV4RRFFQ69G5FAV'

test('the pointer writes, reads, and clears; non-git home sits beside the ledger root', async () => {
  const ctx = await freshCtx()
  assert.equal(await readActiveThread(ctx), null)
  const path = await writeActiveThread(ctx, ULID_A)
  assert.equal(await readActiveThread(ctx), ULID_A)
  assert.equal(path, await activeThreadPath(ctx))
  assert.match(path, /\/active-thread$/)
  await clearActiveThread(ctx)
  assert.equal(await readActiveThread(ctx), null)
  await disposeCtx(ctx)
})
```

- [ ] **Step 7: Run the active-thread test**

Run: `node --test test/unit/active-thread.test.mjs`
Expected: PASS — 1 test passes (non-git ctx resolves the pointer beside the ledger root; git-common-dir resolution is exercised by Plan 06 e2e in a real repo).

- [ ] **Step 8: Commit**

```bash
git add src/tools/shared.mjs src/util/active-thread.mjs test/helpers/tool-ctx.mjs test/unit/shared.test.mjs test/unit/active-thread.test.mjs
git commit -m "feat: add shared tool helpers, FSM transition core, and active-thread pointer"
```

---

### Task 5: `open_thread` tool

**Files:**
- Create: `src/tools/open_thread.mjs`
- Test: `test/unit/tool-open-thread.test.mjs`

**Interfaces:**
- Consumes: `newThread` (`src/model/thread.mjs`), `slugify`/`ensureUniqueSlug` (Task 1), `requireThread`/`commitAndReindex` (Task 4).
- Produces: tool `open_thread` — `{ name, description, inputSchema, handler(args, ctx) }`. Args: `{title, slug?, parent_id?, predecessor_id?, completion_criteria?, vcs_ref?, external_refs?}`. Verifies any `parent_id`/`predecessor_id` exists (referential integrity), derives a unique slug, writes the Thread, reindexes+commits, returns `{thread}`.

- [ ] **Step 1: Write the failing test**

`test/unit/tool-open-thread.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as openThread from '../../src/tools/open_thread.mjs'
import { isUlid } from '../../src/util/ulid.mjs'
import { readActiveThread } from '../../src/util/active-thread.mjs'
import { freshCtx, disposeCtx } from '../helpers/tool-ctx.mjs'

test('open_thread exports the tool contract with the exact name', () => {
  assert.equal(openThread.name, 'open_thread')
  assert.equal(typeof openThread.description, 'string')
  assert.equal(openThread.inputSchema.type, 'object')
  assert.equal(openThread.inputSchema.additionalProperties, false)
})

test('open_thread creates, persists, and indexes a Thread', async () => {
  const ctx = await freshCtx()
  const { thread } = await openThread.handler({ title: 'Fix Sign-up 500' }, ctx)
  assert.ok(isUlid(thread.id))
  assert.equal(thread.slug, 'fix-sign-up-500')
  assert.equal(thread.status, 'active')
  assert.deepEqual(await ctx.driver.readThread(thread.id), thread)
  assert.deepEqual(await ctx.driver.readIndexFile('by-slug'), { 'fix-sign-up-500': thread.id })
  assert.equal(await readActiveThread(ctx), thread.id)
  await disposeCtx(ctx)
})

test('open_thread de-duplicates a colliding slug', async () => {
  const ctx = await freshCtx()
  const a = await openThread.handler({ title: 'Same' }, ctx)
  const b = await openThread.handler({ title: 'Same' }, ctx)
  assert.equal(a.thread.slug, 'same')
  assert.equal(b.thread.slug, 'same-2')
  await disposeCtx(ctx)
})

test('open_thread rejects an unknown parent_id', async () => {
  const ctx = await freshCtx()
  await assert.rejects(() => openThread.handler({ title: 'child', parent_id: '01ARZ3NDEKTSV4RRFFQ69G5FAV' }, ctx), /not found/)
  await disposeCtx(ctx)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/tool-open-thread.test.mjs`
Expected: FAIL — cannot find module `../../src/tools/open_thread.mjs`.

- [ ] **Step 3: Write the implementation**

`src/tools/open_thread.mjs`:

```js
import { newThread } from '../model/thread.mjs'
import { slugify, ensureUniqueSlug } from './slug.mjs'
import { requireThread, commitAndReindex } from './shared.mjs'
import { writeActiveThread } from '../util/active-thread.mjs'

const ULID = '^[0-9A-HJKMNP-TV-Z]{26}$'

export const name = 'open_thread'
export const description = 'Create a new Thread (top-level or a child via parent_id).'
export const inputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title'],
  properties: {
    title: { type: 'string', minLength: 1 },
    slug: { type: 'string', minLength: 1 },
    parent_id: { type: 'string', pattern: ULID },
    predecessor_id: { type: 'string', pattern: ULID },
    completion_criteria: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text'],
        properties: { text: { type: 'string', minLength: 1 }, done: { type: 'boolean' } },
      },
    },
    vcs_ref: { type: ['string', 'null'] },
    external_refs: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['system', 'id', 'url'],
        properties: { system: { type: 'string' }, id: { type: 'string' }, url: { type: 'string' } },
      },
    },
  },
}

export async function handler(args, ctx) {
  const now = ctx.now()
  const { driver } = ctx
  if (args.parent_id) {
    await requireThread(driver, args.parent_id)
  }
  if (args.predecessor_id) {
    await requireThread(driver, args.predecessor_id)
  }
  const base = slugify(args.slug ?? args.title)
  const slug = await ensureUniqueSlug(driver, base)
  const thread = newThread({
    slug,
    title: args.title,
    parent_id: args.parent_id ?? null,
    predecessor_id: args.predecessor_id ?? null,
    completion_criteria: args.completion_criteria ?? [],
    vcs_ref: args.vcs_ref ?? null,
    external_refs: args.external_refs ?? [],
    now,
  })
  await driver.writeThread(thread)
  await commitAndReindex(driver, `open thread ${thread.id}`)
  await writeActiveThread(ctx, thread.id)
  return { thread }
}
```

`open_thread` is a new->active ENTER-active trigger (pin 3), so it WRITES the `active-thread` pointer after the commit — this closes the "freshly opened unbound thread leaves the pointer empty" gap.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/tool-open-thread.test.mjs`
Expected: PASS — 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/tools/open_thread.mjs test/unit/tool-open-thread.test.mjs
git commit -m "feat: add open_thread MCP tool"
```

---

### Task 6: `bind_branch` tool

**Files:**
- Create: `src/tools/bind_branch.mjs`
- Test: `test/unit/tool-bind-branch.test.mjs`

**Interfaces:**
- Consumes: `newBinding` (`src/model/binding.mjs`), `requireThread`/`commitAndReindex` (Task 4).
- Produces: tool `bind_branch` — args `{thread_id, repo, branch, first_commit?, trailer_present?}` -> `{binding}`. Verifies the Thread exists, constructs + writes the BranchBinding, reindexes+commits.

- [ ] **Step 1: Write the failing test**

`test/unit/tool-bind-branch.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as bindBranch from '../../src/tools/bind_branch.mjs'
import * as openThread from '../../src/tools/open_thread.mjs'
import { clearActiveThread, readActiveThread } from '../../src/util/active-thread.mjs'
import { freshCtx, disposeCtx } from '../helpers/tool-ctx.mjs'

test('bind_branch writes a binding, indexes it by repo+branch, and writes the active-thread pointer', async () => {
  const ctx = await freshCtx()
  const { thread } = await openThread.handler({ title: 'work' }, ctx)
  await clearActiveThread(ctx)
  const { binding } = await bindBranch.handler({ thread_id: thread.id, repo: 'r', branch: 'feat/x', first_commit: '9f3a1c2' }, ctx)
  assert.equal(binding.thread_id, thread.id)
  assert.equal(binding.status, 'active')
  assert.equal(binding.first_commit, '9f3a1c2')
  assert.deepEqual(await ctx.driver.readIndexFile('by-branch'), { 'r feat/x': [binding.id] })
  assert.equal(await readActiveThread(ctx), thread.id)
  await disposeCtx(ctx)
})

test('bind_branch rejects an unknown thread_id', async () => {
  const ctx = await freshCtx()
  await assert.rejects(() => bindBranch.handler({ thread_id: '01ARZ3NDEKTSV4RRFFQ69G5FAV', repo: 'r', branch: 'b' }, ctx), /not found/)
  await disposeCtx(ctx)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/tool-bind-branch.test.mjs`
Expected: FAIL — cannot find module `../../src/tools/bind_branch.mjs`.

- [ ] **Step 3: Write the implementation**

`src/tools/bind_branch.mjs`:

```js
import { newBinding } from '../model/binding.mjs'
import { requireThread, commitAndReindex } from './shared.mjs'
import { writeActiveThread } from '../util/active-thread.mjs'

const ULID = '^[0-9A-HJKMNP-TV-Z]{26}$'

export const name = 'bind_branch'
export const description = 'Bind a git branch to a Thread (append-only BranchBinding).'
export const inputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['thread_id', 'repo', 'branch'],
  properties: {
    thread_id: { type: 'string', pattern: ULID },
    repo: { type: 'string', minLength: 1 },
    branch: { type: 'string', minLength: 1 },
    first_commit: { type: ['string', 'null'] },
    trailer_present: { type: 'boolean' },
  },
}

export async function handler(args, ctx) {
  const now = ctx.now()
  const { driver } = ctx
  await requireThread(driver, args.thread_id)
  const binding = newBinding({
    thread_id: args.thread_id,
    repo: args.repo,
    branch: args.branch,
    first_commit: args.first_commit ?? null,
    trailer_present: args.trailer_present ?? false,
    now,
  })
  await driver.writeBinding(binding)
  await commitAndReindex(driver, `bind branch ${binding.id}`)
  await writeActiveThread(ctx, args.thread_id)
  return { binding }
}
```

`bind_branch` is an ENTER-active trigger (pin 3): binding a branch marks its thread the active one, so the handler WRITES the `active-thread` pointer to `thread_id` after the commit.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/tool-bind-branch.test.mjs`
Expected: PASS — 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/tools/bind_branch.mjs test/unit/tool-bind-branch.test.mjs
git commit -m "feat: add bind_branch MCP tool"
```

---

### Task 7: `append_session_event` tool

**Files:**
- Create: `src/tools/append_session_event.mjs`
- Test: `test/unit/tool-append-session-event.test.mjs`

**Interfaces:**
- Consumes: `requireThread` (Task 4).
- Produces: tool `append_session_event` — args `{thread_id, actor, body}` -> `{path}`. Verifies the Thread exists, appends via `driver.appendSessionEvent`, commits (no reindex — session logs are not indexed).

- [ ] **Step 1: Write the failing test**

`test/unit/tool-append-session-event.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import * as appendEvent from '../../src/tools/append_session_event.mjs'
import * as openThread from '../../src/tools/open_thread.mjs'
import { freshCtx, disposeCtx } from '../helpers/tool-ctx.mjs'

test('append_session_event appends to the thread session log', async () => {
  const ctx = await freshCtx()
  const { thread } = await openThread.handler({ title: 'work' }, ctx)
  const { path } = await appendEvent.handler({ thread_id: thread.id, actor: 'cursor', body: 'did a thing' }, ctx)
  assert.match(path, new RegExp(`sessions/${thread.id}/2026-06-30T10-00-00Z--cursor\\.md$`))
  assert.equal(await readFile(path, 'utf8'), 'did a thing\n')
  await disposeCtx(ctx)
})

test('append_session_event rejects an unknown thread_id', async () => {
  const ctx = await freshCtx()
  await assert.rejects(() => appendEvent.handler({ thread_id: '01ARZ3NDEKTSV4RRFFQ69G5FAV', actor: 'a', body: 'b' }, ctx), /not found/)
  await disposeCtx(ctx)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/tool-append-session-event.test.mjs`
Expected: FAIL — cannot find module `../../src/tools/append_session_event.mjs`.

- [ ] **Step 3: Write the implementation**

`src/tools/append_session_event.mjs`:

```js
import { requireThread } from './shared.mjs'

const ULID = '^[0-9A-HJKMNP-TV-Z]{26}$'

export const name = 'append_session_event'
export const description = 'Append an entry to a Thread session log (hot layer, append-only).'
export const inputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['thread_id', 'actor', 'body'],
  properties: {
    thread_id: { type: 'string', pattern: ULID },
    actor: { type: 'string', minLength: 1 },
    body: { type: 'string', minLength: 1 },
  },
}

export async function handler(args, ctx) {
  const now = ctx.now()
  const { driver } = ctx
  await requireThread(driver, args.thread_id)
  const path = await driver.appendSessionEvent(args.thread_id, now, args.actor, args.body)
  await driver.commit(`session event ${args.thread_id}`)
  return { path }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/tool-append-session-event.test.mjs`
Expected: PASS — 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/tools/append_session_event.mjs test/unit/tool-append-session-event.test.mjs
git commit -m "feat: add append_session_event MCP tool"
```

---

### Task 8: `record_decision` tool

**Files:**
- Create: `src/tools/record_decision.mjs`
- Test: `test/unit/tool-record-decision.test.mjs`

**Interfaces:**
- Consumes: `renderDecision` (Task 3), `slugify` (Task 1), `requireThread`/`commitAndReindex` (Task 4).
- Produces: tool `record_decision` — args `{thread_id, slug, title, context, options, outcome}` -> `{number, path}`. Allocates the next NNNN via `driver.nextDecisionNumber`, writes the MADR record, and links `NNNN-slug` into the Thread's `spine.key_decisions` (dedup), reindexes+commits.

- [ ] **Step 1: Write the failing test**

`test/unit/tool-record-decision.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as recordDecision from '../../src/tools/record_decision.mjs'
import * as openThread from '../../src/tools/open_thread.mjs'
import { freshCtx, disposeCtx } from '../helpers/tool-ctx.mjs'

test('record_decision writes a numbered MADR record and links it into the spine', async () => {
  const ctx = await freshCtx()
  const { thread } = await openThread.handler({ title: 'work' }, ctx)
  const res = await recordDecision.handler({
    thread_id: thread.id, slug: 'Error Contract', title: 'Adopt 409',
    context: 'c', options: ['409', '500'], outcome: 'Chosen: 409',
  }, ctx)
  assert.equal(res.number, '0001')
  assert.match(res.path, /decisions\/0001-error-contract\.md$/)
  assert.match(await ctx.driver.readDecision('0001'), /Thread-Id: /)
  const updated = await ctx.driver.readThread(thread.id)
  assert.deepEqual(updated.spine.key_decisions, ['0001-error-contract'])
  await disposeCtx(ctx)
})

test('record_decision rejects an unknown thread_id', async () => {
  const ctx = await freshCtx()
  await assert.rejects(() => recordDecision.handler({
    thread_id: '01ARZ3NDEKTSV4RRFFQ69G5FAV', slug: 's', title: 't', context: 'c', options: [], outcome: 'o',
  }, ctx), /not found/)
  await disposeCtx(ctx)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/tool-record-decision.test.mjs`
Expected: FAIL — cannot find module `../../src/tools/record_decision.mjs`.

- [ ] **Step 3: Write the implementation**

`src/tools/record_decision.mjs`:

```js
import { renderDecision } from './decision-md.mjs'
import { slugify } from './slug.mjs'
import { requireThread, commitAndReindex } from './shared.mjs'

const ULID = '^[0-9A-HJKMNP-TV-Z]{26}$'

export const name = 'record_decision'
export const description = 'Record an immutable MADR decision and link it to its Thread.'
export const inputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['thread_id', 'slug', 'title', 'context', 'options', 'outcome'],
  properties: {
    thread_id: { type: 'string', pattern: ULID },
    slug: { type: 'string', minLength: 1 },
    title: { type: 'string', minLength: 1 },
    context: { type: 'string' },
    options: { type: 'array', items: { type: 'string' } },
    outcome: { type: 'string' },
  },
}

export async function handler(args, ctx) {
  const now = ctx.now()
  const { driver } = ctx
  const thread = await requireThread(driver, args.thread_id)
  const nnnn = await driver.nextDecisionNumber()
  const slug = slugify(args.slug)
  const markdown = renderDecision({
    nnnn,
    title: args.title,
    context: args.context,
    options: args.options,
    outcome: args.outcome,
    threadId: args.thread_id,
    date: now.slice(0, 10),
  })
  const path = await driver.writeDecision(nnnn, slug, markdown)
  const filename = `${nnnn}-${slug}`
  const keyDecisions = thread.spine.key_decisions.includes(filename)
    ? thread.spine.key_decisions
    : [...thread.spine.key_decisions, filename]
  const next = { ...thread, updated_at: now, spine: { ...thread.spine, key_decisions: keyDecisions } }
  await driver.writeThread(next)
  await commitAndReindex(driver, `record decision ${filename}`)
  return { number: nnnn, path }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/tool-record-decision.test.mjs`
Expected: PASS — 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/tools/record_decision.mjs test/unit/tool-record-decision.test.mjs
git commit -m "feat: add record_decision MCP tool"
```

---

### Task 9: `transition_thread` tool

**Files:**
- Create: `src/tools/transition_thread.mjs`
- Test: `test/unit/tool-transition-thread.test.mjs`

**Interfaces:**
- Consumes: `requireThread`/`applyTransition`/`commitAndReindex` (Task 4).
- Produces: tool `transition_thread` — args `{thread_id, to_status, closure_statement?, blocked_by?, abandoned_reason?}` -> `{thread}`. Enforces the FSM matrix + DoD + reason requirements via `applyTransition`; the server refuses any transition not in the matrix.

- [ ] **Step 1: Write the failing test**

`test/unit/tool-transition-thread.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as transitionThread from '../../src/tools/transition_thread.mjs'
import * as openThread from '../../src/tools/open_thread.mjs'
import { readActiveThread } from '../../src/util/active-thread.mjs'
import { freshCtx, disposeCtx } from '../helpers/tool-ctx.mjs'

test('transition_thread moves active -> paused, updates the resumable index, and clears the pointer', async () => {
  const ctx = await freshCtx()
  const { thread } = await openThread.handler({ title: 'work' }, ctx)
  assert.equal(await readActiveThread(ctx), thread.id)
  const res = await transitionThread.handler({ thread_id: thread.id, to_status: 'paused' }, ctx)
  assert.equal(res.thread.status, 'paused')
  const roster = await ctx.driver.readIndexFile('resumable')
  assert.equal(roster.find((r) => r.id === thread.id).status, 'paused')
  assert.equal(await readActiveThread(ctx), null)
  await disposeCtx(ctx)
})

test('transition_thread persists blocked_by into the thread record and clears the pointer', async () => {
  const ctx = await freshCtx()
  const { thread } = await openThread.handler({ title: 'work' }, ctx)
  const res = await transitionThread.handler({ thread_id: thread.id, to_status: 'blocked', blocked_by: 'dep-x' }, ctx)
  assert.equal(res.thread.blocked_by, 'dep-x')
  assert.equal((await ctx.driver.readThread(thread.id)).blocked_by, 'dep-x')
  assert.equal(await readActiveThread(ctx), null)
  await disposeCtx(ctx)
})

test('transition_thread refuses an out-of-matrix move', async () => {
  const ctx = await freshCtx()
  const { thread } = await openThread.handler({ title: 'work', completion_criteria: [{ text: 'a', done: true }] }, ctx)
  await transitionThread.handler({ thread_id: thread.id, to_status: 'done', closure_statement: 'shipped' }, ctx)
  await assert.rejects(() => transitionThread.handler({ thread_id: thread.id, to_status: 'active' }, ctx), /illegal transition/)
  await disposeCtx(ctx)
})

test('transition_thread refuses done without a satisfied DoD gate', async () => {
  const ctx = await freshCtx()
  const { thread } = await openThread.handler({ title: 'work', completion_criteria: [{ text: 'a', done: false }] }, ctx)
  await assert.rejects(() => transitionThread.handler({ thread_id: thread.id, to_status: 'done', closure_statement: 'x' }, ctx), /DoD gate/)
  await disposeCtx(ctx)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/tool-transition-thread.test.mjs`
Expected: FAIL — cannot find module `../../src/tools/transition_thread.mjs`.

- [ ] **Step 3: Write the implementation**

`src/tools/transition_thread.mjs`:

```js
import { requireThread, applyTransition, commitAndReindex } from './shared.mjs'
import { writeActiveThread, clearActiveThread } from '../util/active-thread.mjs'

const ULID = '^[0-9A-HJKMNP-TV-Z]{26}$'

export const name = 'transition_thread'
export const description = 'Transition a Thread through the five-state FSM (DoD-gated for done).'
export const inputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['thread_id', 'to_status'],
  properties: {
    thread_id: { type: 'string', pattern: ULID },
    to_status: { enum: ['active', 'paused', 'blocked', 'done', 'abandoned'] },
    closure_statement: { type: 'string' },
    blocked_by: { type: 'string' },
    abandoned_reason: { type: 'string' },
  },
}

export async function handler(args, ctx) {
  const now = ctx.now()
  const { driver } = ctx
  const thread = await requireThread(driver, args.thread_id)
  const next = await applyTransition(driver, thread, args.to_status, {
    closureStatement: args.closure_statement,
    blockedBy: args.blocked_by,
    abandonedReason: args.abandoned_reason,
    now,
  })
  await commitAndReindex(driver, `transition ${thread.id} -> ${args.to_status}`)
  if (args.to_status === 'active') {
    await writeActiveThread(ctx, thread.id)
  } else {
    await clearActiveThread(ctx)
  }
  return { thread: next }
}
```

Per pin 3, `transition_thread` WRITES the `active-thread` pointer on ENTER-active (`paused`/`blocked` -> `active`) and CLEARS it on LEAVE-active (`active` -> `{paused,blocked,done,abandoned}`). Session-handoff's `active` -> `paused` therefore clears the pointer, which is the exact signal the Plan 04 Stop gate reads (empty pointer = pass).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/tool-transition-thread.test.mjs`
Expected: PASS — 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/tools/transition_thread.mjs test/unit/tool-transition-thread.test.mjs
git commit -m "feat: add transition_thread MCP tool with FSM and DoD enforcement"
```

---

### Task 10: `update_thread` tool (FROZEN #12 — spine patch + completion-criteria toggle)

**Files:**
- Create: `src/tools/update_thread.mjs`
- Test: `test/unit/tool-update-thread.test.mjs`

**Interfaces:**
- Consumes: `isTerminal` (`src/model/fsm.mjs`), `enforceSpineCaps` (Task 2), `requireThread`/`commitAndReindex` (Task 4).
- Produces: tool `update_thread` — args `{thread_id, spine?, completion_criteria?}` -> `{thread}` (Plan 00 FROZEN tool #12; DD-A). SPINE PATH: merges a partial `spine` patch onto the current spine, forces `spine.status = thread.status` (status only changes via `transition_thread`), enforces caps (with `key_decisions` EXEMPT from the count cap, M1). CRITERIA PATH: toggles `completion_criteria[].done` matched by immutable `text` — texts are never added/removed/edited, only `done` flips; unknown texts are rejected. Terminal Threads are refused on BOTH paths (single guard before either patch applies). Supersedes the earlier Plan-03-only `update_thread_spine`. Plan 06 `session-handoff` and the multi-session DoD e2e consume it.

- [ ] **Step 1: Write the failing test**

`test/unit/tool-update-thread.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as updateThread from '../../src/tools/update_thread.mjs'
import * as openThread from '../../src/tools/open_thread.mjs'
import * as transitionThread from '../../src/tools/transition_thread.mjs'
import { SPINE_CAPS } from '../../src/tools/caps.mjs'
import { freshCtx, disposeCtx } from '../helpers/tool-ctx.mjs'

test('update_thread exports the frozen tool contract with the exact name', () => {
  assert.equal(updateThread.name, 'update_thread')
  assert.equal(updateThread.inputSchema.type, 'object')
  assert.equal(updateThread.inputSchema.additionalProperties, false)
  assert.deepEqual(updateThread.inputSchema.required, ['thread_id'])
})

test('update_thread merges a spine patch and keeps spine.status synced to the thread', async () => {
  const ctx = await freshCtx()
  const { thread } = await openThread.handler({ title: 'work' }, ctx)
  const { thread: next } = await updateThread.handler({
    thread_id: thread.id, spine: { active_goal: 'return 409', next_step: 'write the test' },
  }, ctx)
  assert.equal(next.spine.active_goal, 'return 409')
  assert.equal(next.spine.status, 'active')
  await disposeCtx(ctx)
})

test('update_thread toggles completion_criteria.done matched by immutable text and rejects unknown texts', async () => {
  const ctx = await freshCtx()
  const { thread } = await openThread.handler({
    title: 'work', completion_criteria: [{ text: 'a', done: false }, { text: 'b', done: false }],
  }, ctx)
  const { thread: next } = await updateThread.handler({
    thread_id: thread.id, completion_criteria: [{ text: 'a', done: true }],
  }, ctx)
  assert.deepEqual(next.completion_criteria, [{ text: 'a', done: true }, { text: 'b', done: false }])
  await assert.rejects(() => updateThread.handler({
    thread_id: thread.id, completion_criteria: [{ text: 'ghost', done: true }],
  }, ctx), /unknown completion criterion/)
  await disposeCtx(ctx)
})

test('update_thread enforces spine caps but EXEMPTS key_decisions from the count cap (M1)', async () => {
  const ctx = await freshCtx()
  const { thread } = await openThread.handler({ title: 'work' }, ctx)
  await assert.rejects(() => updateThread.handler({
    thread_id: thread.id, spine: { active_goal: 'x'.repeat(SPINE_CAPS.scalarFieldMaxChars + 1) },
  }, ctx), /exceeds/)
  const manyDecisions = Array.from({ length: SPINE_CAPS.arrayMaxItems + 5 }, (_, i) => `${String(i).padStart(4, '0')}-d`)
  const { thread: refreshed } = await updateThread.handler({
    thread_id: thread.id, spine: { key_decisions: manyDecisions, next_step: 'still refreshable' },
  }, ctx)
  assert.equal(refreshed.spine.key_decisions.length, SPINE_CAPS.arrayMaxItems + 5)
  await disposeCtx(ctx)
})

test('update_thread refuses a terminal thread on BOTH the spine and criteria paths', async () => {
  const ctx = await freshCtx()
  const { thread } = await openThread.handler({ title: 'work', completion_criteria: [{ text: 'a', done: true }] }, ctx)
  await transitionThread.handler({ thread_id: thread.id, to_status: 'done', closure_statement: 'shipped' }, ctx)
  await assert.rejects(() => updateThread.handler({ thread_id: thread.id, spine: { next_step: 'x' } }, ctx), /terminal/)
  await assert.rejects(() => updateThread.handler({ thread_id: thread.id, completion_criteria: [{ text: 'a', done: false }] }, ctx), /terminal/)
  await disposeCtx(ctx)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/tool-update-thread.test.mjs`
Expected: FAIL — cannot find module `../../src/tools/update_thread.mjs`.

- [ ] **Step 3: Write the implementation**

`src/tools/update_thread.mjs`:

```js
import { isTerminal } from '../model/fsm.mjs'
import { enforceSpineCaps } from './caps.mjs'
import { requireThread, commitAndReindex } from './shared.mjs'

const ULID = '^[0-9A-HJKMNP-TV-Z]{26}$'

export const name = 'update_thread'
export const description = 'Patch a Thread spine and/or toggle completion_criteria.done (matched by immutable text).'
export const inputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['thread_id'],
  properties: {
    thread_id: { type: 'string', pattern: ULID },
    spine: {
      type: 'object',
      additionalProperties: false,
      properties: {
        status: { type: 'string' },
        active_goal: { type: 'string' },
        next_step: { type: 'string' },
        open_risks: { type: 'array', items: { type: 'string' } },
        key_decisions: { type: 'array', items: { type: 'string' } },
        out_of_scope: { type: 'array', items: { type: 'string' } },
      },
    },
    completion_criteria: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'done'],
        properties: {
          text: { type: 'string', minLength: 1 },
          done: { type: 'boolean' },
        },
      },
    },
  },
}

function toggleCriteria(current, patch) {
  const known = new Set(current.map((c) => c.text))
  for (const entry of patch) {
    if (!known.has(entry.text)) {
      throw new Error(`unknown completion criterion text: ${entry.text}`)
    }
  }
  const flips = new Map(patch.map((entry) => [entry.text, entry.done]))
  return current.map((c) => (flips.has(c.text) ? { ...c, done: flips.get(c.text) } : c))
}

export async function handler(args, ctx) {
  const now = ctx.now()
  const { driver } = ctx
  const thread = await requireThread(driver, args.thread_id)
  if (isTerminal(thread.status)) {
    throw new Error(`cannot update a terminal thread (${thread.status})`)
  }
  let next = { ...thread, updated_at: now }
  if (args.spine) {
    const merged = { ...thread.spine, ...args.spine, status: thread.status }
    enforceSpineCaps(merged)
    next = { ...next, spine: merged }
  }
  if (args.completion_criteria) {
    next = { ...next, completion_criteria: toggleCriteria(thread.completion_criteria, args.completion_criteria) }
  }
  await driver.writeThread(next)
  await commitAndReindex(driver, `update thread ${thread.id}`)
  return { thread: next }
}
```

The terminal-refuse guard runs once BEFORE either patch, so both the spine and criteria paths are terminal-refused (Plan 00 DD-A). `enforceSpineCaps` guards the spine path with `key_decisions` exempt from the count cap (M1). `toggleCriteria` matches by immutable `text`, flips only `done`, and rejects unknown texts — texts are never added, removed, or edited. `completion_criteria` values pattern-validate through ajv in the registry, and the merged Thread re-validates on `driver.writeThread`. (There is no numeric criteria-count cap defined in Plan 00; "caps-enforced on the criteria path" is realized as the terminal-refuse guard plus the immutable-text + schema validation.)

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/tool-update-thread.test.mjs`
Expected: PASS — 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/tools/update_thread.mjs test/unit/tool-update-thread.test.mjs
git commit -m "feat: add update_thread MCP tool (frozen #12: spine patch + criteria toggle)"
```

---

### Task 11: `archive_thread` tool

**Files:**
- Create: `src/tools/archive_thread.mjs`
- Test: `test/unit/tool-archive-thread.test.mjs`

**Interfaces:**
- Consumes: `requireThread`/`applyTransition`/`commitAndReindex` (Task 4).
- Produces: tool `archive_thread` — args `{thread_id, reason}` -> `{thread}`. Archives = transition to `abandoned` with `abandoned_reason = reason` through the shared FSM guard. A `blocked` thread cannot be archived directly (matrix has no `blocked -> abandoned`); it must first go `blocked -> paused`.

- [ ] **Step 1: Write the failing test**

`test/unit/tool-archive-thread.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as archiveThread from '../../src/tools/archive_thread.mjs'
import * as openThread from '../../src/tools/open_thread.mjs'
import * as transitionThread from '../../src/tools/transition_thread.mjs'
import { readActiveThread } from '../../src/util/active-thread.mjs'
import { freshCtx, disposeCtx } from '../helpers/tool-ctx.mjs'

test('archive_thread abandons an active thread with a reason and clears the pointer', async () => {
  const ctx = await freshCtx()
  const { thread } = await openThread.handler({ title: 'work' }, ctx)
  const { thread: next } = await archiveThread.handler({ thread_id: thread.id, reason: 'superseded' }, ctx)
  assert.equal(next.status, 'abandoned')
  assert.equal(next.abandoned_reason, 'superseded')
  const roster = await ctx.driver.readIndexFile('resumable')
  assert.equal(roster.find((r) => r.id === thread.id), undefined)
  assert.equal(await readActiveThread(ctx), null)
  await disposeCtx(ctx)
})

test('archive_thread refuses a blocked thread (no blocked -> abandoned)', async () => {
  const ctx = await freshCtx()
  const { thread } = await openThread.handler({ title: 'work' }, ctx)
  await transitionThread.handler({ thread_id: thread.id, to_status: 'blocked', blocked_by: 'dep' }, ctx)
  await assert.rejects(() => archiveThread.handler({ thread_id: thread.id, reason: 'x' }, ctx), /illegal transition/)
  await disposeCtx(ctx)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/tool-archive-thread.test.mjs`
Expected: FAIL — cannot find module `../../src/tools/archive_thread.mjs`.

- [ ] **Step 3: Write the implementation**

`src/tools/archive_thread.mjs`:

```js
import { requireThread, applyTransition, commitAndReindex } from './shared.mjs'
import { clearActiveThread } from '../util/active-thread.mjs'

const ULID = '^[0-9A-HJKMNP-TV-Z]{26}$'

export const name = 'archive_thread'
export const description = 'Archive a Thread as abandoned (terminal) with a reason.'
export const inputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['thread_id', 'reason'],
  properties: {
    thread_id: { type: 'string', pattern: ULID },
    reason: { type: 'string', minLength: 1 },
  },
}

export async function handler(args, ctx) {
  const now = ctx.now()
  const { driver } = ctx
  const thread = await requireThread(driver, args.thread_id)
  const next = await applyTransition(driver, thread, 'abandoned', { abandonedReason: args.reason, now })
  await commitAndReindex(driver, `archive ${thread.id}`)
  await clearActiveThread(ctx)
  return { thread: next }
}
```

`archive_thread` is a LEAVE-active trigger (pin 3): abandoning the thread CLEARS the `active-thread` pointer after the commit.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/tool-archive-thread.test.mjs`
Expected: PASS — 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/tools/archive_thread.mjs test/unit/tool-archive-thread.test.mjs
git commit -m "feat: add archive_thread MCP tool"
```

---

### Task 12: `create_successor` tool

**Files:**
- Create: `src/tools/create_successor.mjs`
- Test: `test/unit/tool-create-successor.test.mjs`

**Interfaces:**
- Consumes: `newThread`, `slugify`/`ensureUniqueSlug` (Task 1), `isTerminal` (`src/model/fsm.mjs`), `requireThread`/`commitAndReindex` (Task 4).
- Produces: tool `create_successor` — args `{predecessor_id, title, completion_criteria}` -> `{thread}`. Requires a TERMINAL predecessor and non-empty `completion_criteria`; new Thread carries `predecessor_id` and inherits the predecessor's `parent_id`; starts `active`.

- [ ] **Step 1: Write the failing test**

`test/unit/tool-create-successor.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as createSuccessor from '../../src/tools/create_successor.mjs'
import * as openThread from '../../src/tools/open_thread.mjs'
import * as transitionThread from '../../src/tools/transition_thread.mjs'
import { readActiveThread } from '../../src/util/active-thread.mjs'
import { freshCtx, disposeCtx } from '../helpers/tool-ctx.mjs'

async function terminalThread(ctx) {
  const { thread } = await openThread.handler({ title: 'orig', completion_criteria: [{ text: 'a', done: true }] }, ctx)
  await transitionThread.handler({ thread_id: thread.id, to_status: 'done', closure_statement: 'shipped' }, ctx)
  return thread
}

test('create_successor links a new active Thread to a terminal predecessor and writes the pointer', async () => {
  const ctx = await freshCtx()
  const pred = await terminalThread(ctx)
  const { thread } = await createSuccessor.handler({
    predecessor_id: pred.id, title: 'Follow-up', completion_criteria: [{ text: 'b', done: false }],
  }, ctx)
  assert.equal(thread.predecessor_id, pred.id)
  assert.equal(thread.status, 'active')
  assert.equal(await readActiveThread(ctx), thread.id)
  await disposeCtx(ctx)
})

test('create_successor refuses a non-terminal predecessor and empty criteria', async () => {
  const ctx = await freshCtx()
  const { thread: open } = await openThread.handler({ title: 'live' }, ctx)
  await assert.rejects(() => createSuccessor.handler({ predecessor_id: open.id, title: 'x', completion_criteria: [{ text: 'b' }] }, ctx), /terminal/)
  const pred = await terminalThread(ctx)
  await assert.rejects(() => createSuccessor.handler({ predecessor_id: pred.id, title: 'x', completion_criteria: [] }, ctx), /completion_criteria/)
  await disposeCtx(ctx)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/tool-create-successor.test.mjs`
Expected: FAIL — cannot find module `../../src/tools/create_successor.mjs`.

- [ ] **Step 3: Write the implementation**

`src/tools/create_successor.mjs`:

```js
import { newThread } from '../model/thread.mjs'
import { isTerminal } from '../model/fsm.mjs'
import { slugify, ensureUniqueSlug } from './slug.mjs'
import { requireThread, commitAndReindex } from './shared.mjs'
import { writeActiveThread } from '../util/active-thread.mjs'

const ULID = '^[0-9A-HJKMNP-TV-Z]{26}$'

export const name = 'create_successor'
export const description = 'Create a successor Thread for a terminal predecessor (lineage via predecessor_id).'
export const inputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['predecessor_id', 'title', 'completion_criteria'],
  properties: {
    predecessor_id: { type: 'string', pattern: ULID },
    title: { type: 'string', minLength: 1 },
    completion_criteria: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text'],
        properties: { text: { type: 'string', minLength: 1 }, done: { type: 'boolean' } },
      },
    },
  },
}

export async function handler(args, ctx) {
  const now = ctx.now()
  const { driver } = ctx
  const predecessor = await requireThread(driver, args.predecessor_id)
  if (!isTerminal(predecessor.status)) {
    throw new Error(`create_successor requires a terminal predecessor; ${args.predecessor_id} is ${predecessor.status}`)
  }
  if (!Array.isArray(args.completion_criteria) || args.completion_criteria.length === 0) {
    throw new Error('create_successor requires non-empty completion_criteria')
  }
  const slug = await ensureUniqueSlug(driver, slugify(args.title))
  const thread = newThread({
    slug,
    title: args.title,
    parent_id: predecessor.parent_id,
    predecessor_id: predecessor.id,
    completion_criteria: args.completion_criteria,
    now,
  })
  await driver.writeThread(thread)
  await commitAndReindex(driver, `successor of ${predecessor.id}`)
  await writeActiveThread(ctx, thread.id)
  return { thread }
}
```

`create_successor` creates a new->active thread, so it is an ENTER-active trigger (pin 3, per the amended Plan 00): the handler WRITES the `active-thread` pointer to the NEW successor's id after the commit — exactly like `open_thread`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/tool-create-successor.test.mjs`
Expected: PASS — 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/tools/create_successor.mjs test/unit/tool-create-successor.test.mjs
git commit -m "feat: add create_successor MCP tool"
```

---

### Task 13: `reopen` tool

**Files:**
- Create: `src/tools/reopen.mjs`
- Test: `test/unit/tool-reopen.test.mjs`

**Interfaces:**
- Consumes: `isTerminal` (`src/model/fsm.mjs`), `requireThread`/`applyTransition`/`commitAndReindex` (Task 4).
- Produces: tool `reopen` — args `{thread_id}` -> `{thread}`. Moves a `paused`/`blocked` Thread back to `active` (both legal in the matrix). Refuses a terminal Thread (directs to `create_successor`) and a Thread already `active`.

- [ ] **Step 1: Write the failing test**

`test/unit/tool-reopen.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as reopen from '../../src/tools/reopen.mjs'
import * as openThread from '../../src/tools/open_thread.mjs'
import * as transitionThread from '../../src/tools/transition_thread.mjs'
import { readActiveThread } from '../../src/util/active-thread.mjs'
import { freshCtx, disposeCtx } from '../helpers/tool-ctx.mjs'

test('reopen moves a paused thread back to active and re-writes the pointer', async () => {
  const ctx = await freshCtx()
  const { thread } = await openThread.handler({ title: 'work' }, ctx)
  await transitionThread.handler({ thread_id: thread.id, to_status: 'paused' }, ctx)
  assert.equal(await readActiveThread(ctx), null)
  const { thread: next } = await reopen.handler({ thread_id: thread.id }, ctx)
  assert.equal(next.status, 'active')
  assert.equal(await readActiveThread(ctx), thread.id)
  await disposeCtx(ctx)
})

test('reopen refuses a terminal thread and an already-active thread', async () => {
  const ctx = await freshCtx()
  const { thread } = await openThread.handler({ title: 'work', completion_criteria: [{ text: 'a', done: true }] }, ctx)
  await assert.rejects(() => reopen.handler({ thread_id: thread.id }, ctx), /already active/)
  await transitionThread.handler({ thread_id: thread.id, to_status: 'done', closure_statement: 'shipped' }, ctx)
  await assert.rejects(() => reopen.handler({ thread_id: thread.id }, ctx), /terminal/)
  await disposeCtx(ctx)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/tool-reopen.test.mjs`
Expected: FAIL — cannot find module `../../src/tools/reopen.mjs`.

- [ ] **Step 3: Write the implementation**

`src/tools/reopen.mjs`:

```js
import { isTerminal } from '../model/fsm.mjs'
import { requireThread, applyTransition, commitAndReindex } from './shared.mjs'
import { writeActiveThread } from '../util/active-thread.mjs'

const ULID = '^[0-9A-HJKMNP-TV-Z]{26}$'

export const name = 'reopen'
export const description = 'Reopen a paused or blocked Thread to active.'
export const inputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['thread_id'],
  properties: {
    thread_id: { type: 'string', pattern: ULID },
  },
}

export async function handler(args, ctx) {
  const now = ctx.now()
  const { driver } = ctx
  const thread = await requireThread(driver, args.thread_id)
  if (isTerminal(thread.status)) {
    throw new Error(`cannot reopen a terminal thread (${thread.status}); use create_successor`)
  }
  if (thread.status === 'active') {
    throw new Error('thread is already active')
  }
  const next = await applyTransition(driver, thread, 'active', { now })
  await commitAndReindex(driver, `reopen ${thread.id}`)
  await writeActiveThread(ctx, thread.id)
  return { thread: next }
}
```

`reopen` is an ENTER-active trigger (pin 3): moving the thread back to `active` WRITES the `active-thread` pointer after the commit.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/tool-reopen.test.mjs`
Expected: PASS — 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/tools/reopen.mjs test/unit/tool-reopen.test.mjs
git commit -m "feat: add reopen MCP tool"
```

---

### Task 14: `reconcile` stub seam + `reconcile` and `rebuild_index` tools

**Files:**
- Create: `src/drift/reconcile.mjs`, `src/tools/reconcile.mjs`, `src/tools/rebuild_index.mjs`
- Test: `test/unit/tool-reconcile-rebuild.test.mjs`

**Interfaces:**
- Consumes: `rebuildIndex` (`src/index/build-index.mjs`).
- Produces:
  - `src/drift/reconcile.mjs` — `runReconcile(ctx): Promise<{drift, dispositions}>` STUB returning empty arrays, COMMIT-FREE. **This is the exact seam Plan 05 fills** — Plan 05 replaces only the body and MUST keep the export name, the `ctx` shape (`{driver, projectDir, userConfig, now}`), the `{drift, dispositions}` return, AND the commit-free contract (the tool wrapper owns the commit).
  - tool `reconcile` — args `{}` -> `{drift, dispositions}`. Delegates to `runReconcile`, then WRAPS the result with `commitAndReindex` (pin 6 / H1) — like the other 8 write-capable tools — so Plan 05's binding mutations are committed exactly once. Because `runReconcile` stays commit-free, the commit is neither dropped nor doubled.
  - tool `rebuild_index` — args `{}` -> `{counts}` (rebuilds the derived index, commits).

- [ ] **Step 1: Write the failing test**

`test/unit/tool-reconcile-rebuild.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runReconcile } from '../../src/drift/reconcile.mjs'
import * as reconcile from '../../src/tools/reconcile.mjs'
import * as rebuildIndexTool from '../../src/tools/rebuild_index.mjs'
import * as openThread from '../../src/tools/open_thread.mjs'
import { freshCtx, disposeCtx } from '../helpers/tool-ctx.mjs'

test('runReconcile stub returns the pinned empty shape', async () => {
  const ctx = await freshCtx()
  assert.deepEqual(await runReconcile(ctx), { drift: [], dispositions: [] })
  await disposeCtx(ctx)
})

test('reconcile tool delegates to runReconcile', async () => {
  const ctx = await freshCtx()
  assert.equal(reconcile.name, 'reconcile')
  assert.deepEqual(await reconcile.handler({}, ctx), { drift: [], dispositions: [] })
  await disposeCtx(ctx)
})

test('rebuild_index tool rebuilds and returns counts', async () => {
  const ctx = await freshCtx()
  await openThread.handler({ title: 'work' }, ctx)
  const { counts } = await rebuildIndexTool.handler({}, ctx)
  assert.equal(counts['by-slug'], 1)
  assert.equal(counts.resumable, 1)
  await disposeCtx(ctx)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/tool-reconcile-rebuild.test.mjs`
Expected: FAIL — cannot find module `../../src/drift/reconcile.mjs`.

- [ ] **Step 3: Write the reconcile stub seam**

`src/drift/reconcile.mjs`:

```js
export async function runReconcile(ctx) {
  return { drift: [], dispositions: [] }
}
```

- [ ] **Step 4: Write the reconcile tool**

`src/tools/reconcile.mjs`:

```js
import { runReconcile } from '../drift/reconcile.mjs'
import { commitAndReindex } from './shared.mjs'

export const name = 'reconcile'
export const description = 'Reconcile ledger state against git drift signals (Plan 05 fills the pipeline).'
export const inputSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {},
  required: [],
}

export async function handler(_args, ctx) {
  const result = await runReconcile(ctx)
  await commitAndReindex(ctx.driver, 'reconcile')
  return result
}
```

The `runReconcile` core stays COMMIT-FREE (Plan 05's contract); this wrapper owns the single `commitAndReindex` (pin 6 / H1) so binding disposition/status mutations Plan 05 performs are persisted exactly once. The stub is a no-op, so the wrapped commit is an empty LocalDriver no-op today.

- [ ] **Step 5: Write the rebuild_index tool**

`src/tools/rebuild_index.mjs`:

```js
import { rebuildIndex } from '../index/build-index.mjs'

export const name = 'rebuild_index'
export const description = 'Rebuild the derived index files from records and report per-file counts.'
export const inputSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {},
  required: [],
}

export async function handler(_args, ctx) {
  const counts = await rebuildIndex(ctx.driver)
  await ctx.driver.commit('rebuild index')
  return { counts }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node --test test/unit/tool-reconcile-rebuild.test.mjs`
Expected: PASS — 3 tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/drift/reconcile.mjs src/tools/reconcile.mjs src/tools/rebuild_index.mjs test/unit/tool-reconcile-rebuild.test.mjs
git commit -m "feat: add reconcile stub seam plus reconcile and rebuild_index tools"
```

---

### Task 15: `get_resume_brief` tool

**Files:**
- Create: `src/tools/get_resume_brief.mjs`
- Test: `test/unit/tool-get-resume-brief.test.mjs`

**Interfaces:**
- Consumes: `requireThread` (Task 4).
- Produces: tool `get_resume_brief` — args `{thread_id}` -> `{brief}`. Composes the Resumption Brief (DESIGN-STATE §7.8) from the Thread `spine` + `index/children.json` (resolved to child summaries) + lineage; `drift` defaults to `[]` (the SessionStart hook / `reconcile` tool supplies repo-wide drift separately). Does NOT read raw session-log content (the frozen driver exposes no session-read method).

- [ ] **Step 1: Write the failing test**

`test/unit/tool-get-resume-brief.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as getResumeBrief from '../../src/tools/get_resume_brief.mjs'
import * as openThread from '../../src/tools/open_thread.mjs'
import * as updateThread from '../../src/tools/update_thread.mjs'
import { freshCtx, disposeCtx } from '../helpers/tool-ctx.mjs'

test('get_resume_brief composes spine fields, children, and lineage', async () => {
  const ctx = await freshCtx()
  const { thread: parent } = await openThread.handler({ title: 'epic' }, ctx)
  await updateThread.handler({ thread_id: parent.id, spine: { active_goal: 'ship epic', next_step: 'do child' } }, ctx)
  const { thread: child } = await openThread.handler({ title: 'child one', parent_id: parent.id }, ctx)
  const { brief } = await getResumeBrief.handler({ thread_id: parent.id }, ctx)
  assert.equal(brief.thread_id, parent.id)
  assert.equal(brief.active_goal, 'ship epic')
  assert.equal(brief.next_step, 'do child')
  assert.deepEqual(brief.children, [{ id: child.id, slug: 'child-one', title: 'child one', status: 'active' }])
  assert.deepEqual(brief.drift, [])
  await disposeCtx(ctx)
})

test('get_resume_brief rejects an unknown thread_id', async () => {
  const ctx = await freshCtx()
  await assert.rejects(() => getResumeBrief.handler({ thread_id: '01ARZ3NDEKTSV4RRFFQ69G5FAV' }, ctx), /not found/)
  await disposeCtx(ctx)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/tool-get-resume-brief.test.mjs`
Expected: FAIL — cannot find module `../../src/tools/get_resume_brief.mjs`.

- [ ] **Step 3: Write the implementation**

`src/tools/get_resume_brief.mjs`:

```js
import { requireThread } from './shared.mjs'

const ULID = '^[0-9A-HJKMNP-TV-Z]{26}$'

export const name = 'get_resume_brief'
export const description = 'Compose a Resumption Brief for a Thread from its spine, children, and lineage.'
export const inputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['thread_id'],
  properties: {
    thread_id: { type: 'string', pattern: ULID },
  },
}

export async function handler(args, ctx) {
  const { driver } = ctx
  const thread = await requireThread(driver, args.thread_id)
  const childrenIndex = await driver.readIndexFile('children')
  const childIds = childrenIndex[thread.id] ?? []
  const children = []
  for (const childId of childIds) {
    const child = await driver.readThread(childId)
    if (child) {
      children.push({ id: child.id, slug: child.slug, title: child.title, status: child.status })
    }
  }
  const brief = {
    thread_id: thread.id,
    slug: thread.slug,
    title: thread.title,
    status: thread.status,
    active_goal: thread.spine.active_goal,
    next_step: thread.spine.next_step,
    open_risks: thread.spine.open_risks,
    key_decisions: thread.spine.key_decisions,
    out_of_scope: thread.spine.out_of_scope,
    predecessor_id: thread.predecessor_id,
    children,
    drift: [],
  }
  return { brief }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/tool-get-resume-brief.test.mjs`
Expected: PASS — 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/tools/get_resume_brief.mjs test/unit/tool-get-resume-brief.test.mjs
git commit -m "feat: add get_resume_brief MCP tool"
```

---

### Task 16: Server context builder

**Files:**
- Create: `src/tools/context.mjs`
- Test: `test/unit/context.test.mjs`

**Interfaces:**
- Consumes: `selectDriver` (`src/drivers/select-driver.mjs`).
- Produces: `buildContext({projectDir?, userConfig?, now?}): Promise<ctx>` where `ctx = { driver, projectDir, userConfig, now }`. Resolves `projectDir` from arg -> `CLAUDE_PROJECT_DIR` -> `process.cwd()`; selects + `init()`s the driver; `now` defaults to a wall-clock ISO function. Also produces `envToUserConfig(env): userConfig` (pin 4 / M3) — the explicit UPPER->lower mapping `LEDGER_BACKEND->ledger_backend`, `LEDGER_BRANCH->ledger_branch`, `LEDGER_DISABLE_TRAILER->disable_trailer` (`selectDriver` consumes the lowercase keys). The entrypoint and CLI pass `envToUserConfig(process.env)` into `buildContext` instead of a hardcoded `{}`.

- [ ] **Step 1: Write the failing test**

`test/unit/context.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildContext, envToUserConfig } from '../../src/tools/context.mjs'
import { LocalDriver } from '../../src/drivers/local-driver.mjs'

test('envToUserConfig maps LEDGER_* env to lowercase userConfig keys (pin 4)', () => {
  assert.deepEqual(
    envToUserConfig({ LEDGER_BACKEND: 'custom-ref', LEDGER_BRANCH: 'refs/ledger/main', LEDGER_DISABLE_TRAILER: 'true' }),
    { ledger_backend: 'custom-ref', ledger_branch: 'refs/ledger/main', disable_trailer: true },
  )
  assert.deepEqual(envToUserConfig({ LEDGER_DISABLE_TRAILER: 'false' }), { disable_trailer: false })
  assert.deepEqual(envToUserConfig({}), {})
})

test('buildContext selects and initializes a driver rooted under dataRoot', async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'ledger-ctx-'))
  const ctx = await buildContext({ projectDir: '/Users/dev/proj', userConfig: { dataRoot }, now: () => '2026-06-30T10:00:00Z' })
  assert.ok(ctx.driver instanceof LocalDriver)
  assert.equal(await ctx.driver.root(), join(dataRoot, '-Users-dev-proj', 'ledger'))
  assert.ok((await stat(await ctx.driver.root())).isDirectory())
  assert.equal(ctx.now(), '2026-06-30T10:00:00Z')
  await rm(dataRoot, { recursive: true, force: true })
})

test('buildContext defaults now to an ISO clock', async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'ledger-ctx-'))
  const ctx = await buildContext({ projectDir: '/a/b', userConfig: { dataRoot } })
  assert.match(ctx.now(), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  await rm(dataRoot, { recursive: true, force: true })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/context.test.mjs`
Expected: FAIL — cannot find module `../../src/tools/context.mjs`.

- [ ] **Step 3: Write the implementation**

`src/tools/context.mjs`:

```js
import { selectDriver } from '../drivers/select-driver.mjs'

export function envToUserConfig(env = {}) {
  const config = {}
  if (env.LEDGER_BACKEND) {
    config.ledger_backend = env.LEDGER_BACKEND
  }
  if (env.LEDGER_BRANCH) {
    config.ledger_branch = env.LEDGER_BRANCH
  }
  if (env.LEDGER_DISABLE_TRAILER !== undefined) {
    config.disable_trailer = env.LEDGER_DISABLE_TRAILER === 'true'
  }
  return config
}

export async function buildContext(options = {}) {
  const projectDir = options.projectDir ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
  const userConfig = options.userConfig ?? {}
  const driver = selectDriver(projectDir, userConfig)
  await driver.init()
  const now = options.now ?? (() => new Date().toISOString())
  return { driver, projectDir, userConfig, now }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/context.test.mjs`
Expected: PASS — 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/tools/context.mjs test/unit/context.test.mjs
git commit -m "feat: add MCP server context builder"
```

---

### Task 17: Tool registry (list + validated dispatch)

**Files:**
- Create: `src/tools/registry.mjs`
- Test: `test/unit/registry.test.mjs`

**Interfaces:**
- Consumes: `ajv` (`import Ajv from 'ajv'`), all twelve tool modules.
- Produces: `listTools(): [{name, description, inputSchema}]` (advertised to `tools/list`); `callTool(name, args, ctx): Promise<payload>` — looks up the tool, validates `args` against its compiled `inputSchema`, dispatches to `handler`. Throws on an unknown tool and on invalid arguments (boundary validation). Consumed by the entrypoint and by Plan 06 e2e.

- [ ] **Step 1: Write the failing test**

`test/unit/registry.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { listTools, callTool } from '../../src/tools/registry.mjs'
import { freshCtx, disposeCtx } from '../helpers/tool-ctx.mjs'

const EXPECTED = [
  'open_thread', 'bind_branch', 'append_session_event', 'record_decision',
  'transition_thread', 'update_thread', 'archive_thread', 'create_successor',
  'reopen', 'reconcile', 'rebuild_index', 'get_resume_brief',
]

test('listTools advertises every tool with a name, description, and inputSchema', () => {
  const names = listTools().map((t) => t.name).sort()
  assert.deepEqual(names, [...EXPECTED].sort())
  for (const t of listTools()) {
    assert.equal(typeof t.description, 'string')
    assert.equal(t.inputSchema.type, 'object')
  }
})

test('callTool validates arguments and rejects an unknown tool', async () => {
  const ctx = await freshCtx()
  await assert.rejects(() => callTool('nope', {}, ctx), /unknown tool/)
  await assert.rejects(() => callTool('open_thread', {}, ctx), /invalid arguments/)
  await assert.rejects(() => callTool('open_thread', { title: 'x', surprise: 1 }, ctx), /invalid arguments/)
  await disposeCtx(ctx)
})

test('callTool dispatches a valid call to the handler', async () => {
  const ctx = await freshCtx()
  const { thread } = await callTool('open_thread', { title: 'work' }, ctx)
  assert.equal(thread.title, 'work')
  const { counts } = await callTool('rebuild_index', {}, ctx)
  assert.equal(counts['by-slug'], 1)
  await disposeCtx(ctx)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/registry.test.mjs`
Expected: FAIL — cannot find module `../../src/tools/registry.mjs`.

- [ ] **Step 3: Write the implementation**

`src/tools/registry.mjs`:

```js
import Ajv from 'ajv'
import * as openThread from './open_thread.mjs'
import * as bindBranch from './bind_branch.mjs'
import * as appendSessionEvent from './append_session_event.mjs'
import * as recordDecision from './record_decision.mjs'
import * as transitionThread from './transition_thread.mjs'
import * as updateThread from './update_thread.mjs'
import * as archiveThread from './archive_thread.mjs'
import * as createSuccessor from './create_successor.mjs'
import * as reopen from './reopen.mjs'
import * as reconcile from './reconcile.mjs'
import * as rebuildIndex from './rebuild_index.mjs'
import * as getResumeBrief from './get_resume_brief.mjs'

const MODULES = [
  openThread, bindBranch, appendSessionEvent, recordDecision,
  transitionThread, updateThread, archiveThread, createSuccessor,
  reopen, reconcile, rebuildIndex, getResumeBrief,
]

const ajv = new Ajv({ allErrors: true, strict: false })
const REGISTRY = new Map()
for (const mod of MODULES) {
  REGISTRY.set(mod.name, {
    name: mod.name,
    description: mod.description,
    inputSchema: mod.inputSchema,
    handler: mod.handler,
    validate: ajv.compile(mod.inputSchema),
  })
}

function formatErrors(errors) {
  return (errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ')
}

export function listTools() {
  return [...REGISTRY.values()].map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }))
}

export async function callTool(name, args, ctx) {
  const tool = REGISTRY.get(name)
  if (!tool) {
    throw new Error(`unknown tool: ${name}`)
  }
  const input = args ?? {}
  if (!tool.validate(input)) {
    throw new Error(`invalid arguments for ${name}: ${formatErrors(tool.validate.errors)}`)
  }
  return tool.handler(input, ctx)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/registry.test.mjs`
Expected: PASS — 3 tests pass.

- [ ] **Step 5: Run the whole suite to catch regressions**

Run: `npm test`
Expected: PASS — every Plan 01 + Plan 03 unit test green.

- [ ] **Step 6: Commit**

```bash
git add src/tools/registry.mjs test/unit/registry.test.mjs
git commit -m "feat: add tool registry with per-tool ajv validation and dispatch"
```

---

### Task 18: Entrypoint + `.mcp.json` + stdio integration test

**Files:**
- Create: `bin/ledger-server.mjs`, `.mcp.json`
- Test: `test/integration/ledger-server.test.mjs`, `test/unit/mcp-json.test.mjs`

**Interfaces:**
- Consumes: `@modelcontextprotocol/sdk` (`Server` from `server/index.js`, `StdioServerTransport` from `server/stdio.js`, `ListToolsRequestSchema`/`CallToolRequestSchema` from `types.js`); `buildContext` (Task 16); `listTools`/`callTool` (Task 17). The test also consumes `Client` (`client/index.js`) + `StdioClientTransport` (`client/stdio.js`).
- Produces: `bin/ledger-server.mjs` — the stdio MCP entrypoint (server name `ledger` -> tools register as `mcp__ledger__<tool>`); `.mcp.json` — the plugin stdio server declaration (`command: node`, `args: ${CLAUDE_PLUGIN_ROOT}/bin/ledger-server.mjs`). Consumed by Plan 04 (auto-approve `mcp__ledger__*`) and Plan 06 (packaging + e2e).

- [ ] **Step 1: Write the failing tests**

`test/unit/mcp-json.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

test('.mcp.json declares the ledger stdio server', async () => {
  const cfg = JSON.parse(await readFile(join(root, '.mcp.json'), 'utf8'))
  assert.ok(cfg.mcpServers.ledger)
  assert.equal(cfg.mcpServers.ledger.command, 'node')
  assert.deepEqual(cfg.mcpServers.ledger.args, ['${CLAUDE_PLUGIN_ROOT}/bin/ledger-server.mjs'])
})
```

`test/integration/ledger-server.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const binPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'ledger-server.mjs')

async function connect() {
  const projectDir = await mkdtemp(join(tmpdir(), 'ledger-proj-'))
  const dataRoot = await mkdtemp(join(tmpdir(), 'ledger-data-'))
  const transport = new StdioClientTransport({
    command: 'node',
    args: [binPath],
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir, CLAUDE_PLUGIN_DATA: dataRoot },
  })
  const client = new Client({ name: 'test', version: '0' }, { capabilities: {} })
  await client.connect(transport)
  return { client, projectDir, dataRoot }
}

test('server advertises every tool over stdio', async () => {
  const { client, projectDir, dataRoot } = await connect()
  try {
    const names = (await client.listTools()).tools.map((t) => t.name).sort()
    for (const expected of ['open_thread', 'transition_thread', 'reconcile', 'update_thread', 'get_resume_brief']) {
      assert.ok(names.includes(expected), `missing ${expected}`)
    }
  } finally {
    await client.close()
    await rm(projectDir, { recursive: true, force: true })
    await rm(dataRoot, { recursive: true, force: true })
  }
})

test('server executes a tool call and enforces the DoD gate end-to-end', async () => {
  const { client, projectDir, dataRoot } = await connect()
  try {
    const opened = await client.callTool({ name: 'open_thread', arguments: { title: 'e2e work' } })
    const { thread } = JSON.parse(opened.content[0].text)
    assert.match(thread.id, /^[0-9A-HJKMNP-TV-Z]{26}$/)

    const rebuilt = await client.callTool({ name: 'rebuild_index', arguments: {} })
    assert.equal(JSON.parse(rebuilt.content[0].text).counts['by-slug'], 1)

    const refused = await client.callTool({ name: 'transition_thread', arguments: { thread_id: thread.id, to_status: 'done', closure_statement: 'x' } })
    assert.equal(refused.isError, true)
    assert.match(refused.content[0].text, /DoD gate/)
  } finally {
    await client.close()
    await rm(projectDir, { recursive: true, force: true })
    await rm(dataRoot, { recursive: true, force: true })
  }
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/unit/mcp-json.test.mjs test/integration/ledger-server.test.mjs`
Expected: FAIL — `.mcp.json` missing and `bin/ledger-server.mjs` cannot be spawned (client connect rejects).

- [ ] **Step 3: Write the entrypoint**

`bin/ledger-server.mjs`:

```js
#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { buildContext, envToUserConfig } from '../src/tools/context.mjs'
import { listTools, callTool } from '../src/tools/registry.mjs'

async function main() {
  const ctx = await buildContext({ userConfig: envToUserConfig(process.env) })
  const server = new Server(
    { name: 'ledger', version: '0.1.0' },
    { capabilities: { tools: {} } },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: listTools() }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params
    try {
      const payload = await callTool(name, args, ctx)
      return { content: [{ type: 'text', text: JSON.stringify(payload) }] }
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true }
    }
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  process.stderr.write(`ledger-server fatal: ${err.stack ?? err.message}\n`)
  process.exitCode = 1
})
```

- [ ] **Step 4: Write `.mcp.json`**

`.mcp.json`:

```json
{
  "mcpServers": {
    "ledger": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/bin/ledger-server.mjs"]
    }
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test test/unit/mcp-json.test.mjs test/integration/ledger-server.test.mjs`
Expected: PASS — `.mcp.json` shape asserted (1 test); server advertises tools and enforces DoD over real stdio (2 tests).

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS — all Plan 01 + Plan 03 unit tests and the integration test green.

- [ ] **Step 7: Commit**

```bash
git add bin/ledger-server.mjs .mcp.json test/integration/ledger-server.test.mjs test/unit/mcp-json.test.mjs
git commit -m "feat: add stdio ledger MCP server entrypoint and declaration"
```

---

### Task 19: `bin/ledger-cli.mjs` — hook-facing CLI (DD-B) + `record-sha` set-once (pin 9)

**Files:**
- Create: `src/cli/run.mjs`, `bin/ledger-cli.mjs`
- Test: `test/unit/cli.test.mjs`

**Interfaces:**
- Consumes: `buildContext` (Task 16), `callTool` (Task 17), `commitAndReindex` (Task 4), `readActiveThread` (Task 4), `envToUserConfig` (Task 16).
- Produces: `runCli(argv, buildOpts): Promise<result>` (env-agnostic command dispatch) and `bin/ledger-cli.mjs` (thin wrapper that maps `envToUserConfig(process.env)` into `buildOpts` and prints JSON). Subcommands (DD-B): `roster` -> `resumable[]`; `reconcile` -> `{drift, dispositions}` (via the `reconcile` TOOL, so the wrapper commit applies); `active-thread` -> `{thread_id}` (reads the pointer; `null` when empty — the Plan 04 Stop gate treats `null` as pass); `record-sha <sha>` -> `{}` (sets `binding.first_commit` set-once, pin 9 / M8); `sync` -> `{synced, ...}` (drives `driver.sync()`). There is NO `has-handoff` subcommand — it is SUPERSEDED by `active-thread` (A3 / pin 1). The hook-facing seam exists because hooks cannot speak MCP stdio; `record-sha` is gated to commit-ish operations by the Plan 04 PostToolUse hook (M11), not by this plan.
- `record-sha` writes `binding.first_commit` ONLY when it is currently `null` (set-once); it NEVER overwrites (overwriting corrupts the first-commit re-attach rung). It resolves the target via the `active-thread` pointer -> the thread's ACTIVE binding(s) with `first_commit === null`.

- [ ] **Step 1: Write the failing test**

`test/unit/cli.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildContext } from '../../src/tools/context.mjs'
import { callTool } from '../../src/tools/registry.mjs'
import { runCli } from '../../src/cli/run.mjs'
import { FIXED_NOW } from '../helpers/tool-ctx.mjs'

async function freshOpts() {
  const dataRoot = await mkdtemp(join(tmpdir(), 'ledger-cli-'))
  return { dataRoot, opts: { projectDir: join(dataRoot, 'proj'), userConfig: { dataRoot }, now: () => FIXED_NOW } }
}

test('roster returns the resumable array and active-thread reflects the pointer', async () => {
  const { dataRoot, opts } = await freshOpts()
  const ctx = await buildContext(opts)
  const { thread } = await callTool('open_thread', { title: 'work' }, ctx)
  const roster = await runCli(['roster'], opts)
  assert.equal(roster.find((r) => r.id === thread.id).status, 'active')
  assert.deepEqual(await runCli(['active-thread'], opts), { thread_id: thread.id })
  await rm(dataRoot, { recursive: true, force: true })
})

test('reconcile and sync delegate to the tool and the driver', async () => {
  const { dataRoot, opts } = await freshOpts()
  await buildContext(opts)
  assert.deepEqual(await runCli(['reconcile'], opts), { drift: [], dispositions: [] })
  assert.deepEqual(await runCli(['sync'], opts), { synced: false })
  await rm(dataRoot, { recursive: true, force: true })
})

test('record-sha sets first_commit once on the active binding and NEVER overwrites', async () => {
  const { dataRoot, opts } = await freshOpts()
  const ctx = await buildContext(opts)
  const { thread } = await callTool('open_thread', { title: 'work' }, ctx)
  const { binding } = await callTool('bind_branch', { thread_id: thread.id, repo: 'r', branch: 'feat/x' }, ctx)
  assert.equal(binding.first_commit, null)
  await runCli(['record-sha', '9f3a1c2'], opts)
  assert.equal((await ctx.driver.readBinding(binding.id)).first_commit, '9f3a1c2')
  await runCli(['record-sha', 'deadbeef'], opts)
  assert.equal((await ctx.driver.readBinding(binding.id)).first_commit, '9f3a1c2')
  await rm(dataRoot, { recursive: true, force: true })
})

test('an unknown subcommand rejects', async () => {
  const { dataRoot, opts } = await freshOpts()
  await assert.rejects(() => runCli(['nope'], opts), /unknown command/)
  await rm(dataRoot, { recursive: true, force: true })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/cli.test.mjs`
Expected: FAIL — cannot find module `../../src/cli/run.mjs`.

- [ ] **Step 3: Write the command dispatch**

`src/cli/run.mjs`:

```js
import { buildContext } from '../tools/context.mjs'
import { callTool } from '../tools/registry.mjs'
import { commitAndReindex } from '../tools/shared.mjs'
import { readActiveThread } from '../util/active-thread.mjs'

async function recordSha(ctx, sha) {
  if (typeof sha !== 'string' || sha.trim() === '') {
    throw new Error('record-sha requires a <sha> argument')
  }
  const threadId = await readActiveThread(ctx)
  if (!threadId) {
    return {}
  }
  const bindings = await ctx.driver.listBindings()
  let changed = false
  for (const binding of bindings) {
    if (binding.thread_id === threadId && binding.status === 'active' && binding.first_commit === null) {
      await ctx.driver.writeBinding({ ...binding, first_commit: sha })
      changed = true
    }
  }
  if (changed) {
    await commitAndReindex(ctx.driver, `record first commit ${sha}`)
  }
  return {}
}

export async function runCli(argv, buildOpts = {}) {
  const [command, ...rest] = argv
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

- [ ] **Step 4: Write the thin CLI wrapper**

`bin/ledger-cli.mjs`:

```js
#!/usr/bin/env node
import { envToUserConfig } from '../src/tools/context.mjs'
import { runCli } from '../src/cli/run.mjs'

runCli(process.argv.slice(2), { userConfig: envToUserConfig(process.env) })
  .then((result) => {
    process.stdout.write(`${JSON.stringify(result ?? {})}\n`)
  })
  .catch((err) => {
    process.stderr.write(`ledger-cli fatal: ${err.stack ?? err.message}\n`)
    process.exitCode = 1
  })
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/unit/cli.test.mjs`
Expected: PASS — 4 tests pass.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS — all Plan 01 + Plan 03 unit tests, the CLI tests, and the integration test green.

- [ ] **Step 7: Commit**

```bash
git add src/cli/run.mjs bin/ledger-cli.mjs test/unit/cli.test.mjs
git commit -m "feat: add hook-facing ledger CLI (roster/reconcile/active-thread/record-sha/sync)"
```

---

## Plan 03 Self-Review

- **Spec coverage:** MCP write surface (A4 / DESIGN-STATE §5.2) — all twelve FROZEN tools implemented with exact names/args/returns, including `update_thread` (#12: spine patch + completion-criteria toggle by immutable text, `key_decisions` count-cap exempt per M1, terminal-refused on both paths). FSM + DoD (§6.1, Plan 00 "FSM") — enforced in `shared.applyTransition` via Plan 01 `canTransition`/`dodSatisfied`; the server refuses any transition not in the matrix and PERSISTS `blocked_by`/`abandoned_reason`/`closure_statement` into the Thread record. Caps (spec §8) — `enforceSpineCaps` on the warm spine. Immutability/atomic writes — every tool constructs a new object and writes through the Plan 01 driver (no in-place mutation); the `active-thread` pointer is written tmp+rename. Boundary validation — ajv per-tool `inputSchema` in the registry; referential integrity (`requireThread`) on every id argument. Control plane — the `active-thread` pointer (pin 3) is written on ENTER-active (`open_thread`/`create_successor` new->active, `bind_branch`, `transition_thread`->active, `reopen`) and cleared on LEAVE-active (`transition_thread`->non-active/`archive_thread`); `bin/ledger-cli.mjs` (DD-B) exposes `roster`/`reconcile`/`active-thread`/`record-sha`/`sync`; `envToUserConfig` maps `LEDGER_*` into `userConfig` (pin 4). Decoupling (A3) — `external_refs[]` stored opaquely by `open_thread`; no workflow-tool coupling. `reconcile` (§6.3) — declared tool over the commit-free `runReconcile(ctx)` stub, with the tool WRAPPER owning `commitAndReindex` (pin 6). Deferred by design: the real drift pipeline (05), hooks/trailer (04), packaging/skills/e2e (06), GitRefDriver runtime (02, optional). RESOLVED (amended Plan 00): `create_successor` creates a thread new->active, so it now WRITES the `active-thread` pointer to the new successor's id exactly like `open_thread`.
- **Placeholder scan:** none — every step ships complete comment-free code with a concrete run command and expected output. The only intentional stub is `runReconcile`, which is a real, tested function returning the pinned shape (not a placeholder).
- **Type consistency:** every tool reaches storage only through `ctx.driver` (Plan 01 `StorageDriver`); ULID argument patterns match Plan 01's schema pattern byte-for-byte; tool return payloads (`{thread}`, `{binding}`, `{path}`, `{number,path}`, `{drift,dispositions}`, `{counts}`, `{brief}`) match Plan 00's tool surface; FSM/DoD logic is Plan 01's, not re-implemented. Server name `ledger` yields `mcp__ledger__<tool>` exactly as DESIGN-STATE §5.1 specifies.
- **No comments / no emojis:** verified across all modules; the only non-code lines are the required `#!/usr/bin/env node` shebangs on `bin/ledger-server.mjs` and `bin/ledger-cli.mjs` (functional carve-out).

**Downstream contract produced by Plan 03 (consumed by 04–06):**
- Entrypoint + declaration: `bin/ledger-server.mjs` (stdio server, name `ledger`; reads `LEDGER_*` env via `envToUserConfig` into `userConfig`) and `.mcp.json` (`mcpServers.ledger`, `command: node`, `args: ["${CLAUDE_PLUGIN_ROOT}/bin/ledger-server.mjs"]`). Plan 04 auto-approves `mcp__ledger__*`; Plan 06 packages and runs e2e.
- Hook-facing CLI (DD-B): `bin/ledger-cli.mjs` over `src/cli/run.mjs` `runCli(argv, buildOpts)` with subcommands `roster` -> `resumable[]`, `reconcile` -> `{drift, dispositions}`, `active-thread` -> `{thread_id|null}`, `record-sha <sha>` -> `{}` (`first_commit` set-once), `sync` -> `{synced, ...}`. NO `has-handoff` (superseded by `active-thread`, A3/pin 1). Plan 04 hooks call these (Stop reads `active-thread`; SessionStart calls `sync` then `reconcile`; PostToolUse gates `record-sha` to commit-ish ops per M11).
- Active-thread control pointer (pin 3): `src/util/active-thread.mjs` `writeActiveThread`/`clearActiveThread`/`readActiveThread`/`activeThreadPath`, resolving via `git rev-parse --git-common-dir` (`<git-common-dir>/ledger/active-thread`) or the non-git sibling of the ledger root (`${CLAUDE_PLUGIN_DATA}/<project-key>/active-thread`). Server WRITES on ENTER-active, CLEARS on LEAVE-active; the Plan 04 `commit-msg` hook resolves the SAME path with `--git-common-dir`.
- Tool surface: `mcp__ledger__{open_thread,bind_branch,append_session_event,record_decision,transition_thread,update_thread,archive_thread,create_successor,reopen,reconcile,rebuild_index,get_resume_brief}` with the exact args/returns above (`update_thread` is FROZEN tool #12).
- **Reconcile seam (Plan 05 fills):** `src/drift/reconcile.mjs` exports `async runReconcile(ctx) -> {drift, dispositions}` with `ctx = {driver, projectDir, userConfig, now}`, COMMIT-FREE. Plan 05 replaces ONLY the body; it must not rename the export, change the `ctx` shape, alter the return shape, or add a commit (the `reconcile` TOOL WRAPPER owns the single `commitAndReindex`, pin 6). The `reconcile` tool and `get_resume_brief.drift` consume it unchanged.
- Programmatic surface: `src/tools/registry.mjs` `listTools()` / `callTool(name, args, ctx)`; `src/tools/context.mjs` `buildContext({projectDir?, userConfig?, now?}) -> ctx` and `envToUserConfig(env) -> userConfig` (pin 4); `src/tools/shared.mjs` `requireThread`, `commitAndReindex`, `applyTransition(driver, thread, toStatus, opts)` (offered to Plan 05 drift dispositions); `src/tools/caps.mjs` `SPINE_CAPS`, `enforceSpineCaps` (`key_decisions` count-cap exempt, M1); `src/cli/run.mjs` `runCli(argv, buildOpts)`.
- Tool module convention: each `src/tools/<tool>.mjs` exports `{ name, description, inputSchema, handler(args, ctx) }`.

**Packaging contract required from Plan 06 (runtime dependency delivery):** the entrypoint imports `@modelcontextprotocol/sdk/*` as bare specifiers, resolved from `node_modules`. Plan 06 MUST ship the production `node_modules` (the three pinned deps via `npm ci --omit=dev`) at the plugin root so `${CLAUDE_PLUGIN_ROOT}/bin/ledger-server.mjs`'s bare imports resolve with zero install step, and MUST document the Node >= 20 runtime requirement (userConfig cannot install Node). Install-time `npm install` is rejected (no reliable plugin post-install hook; network + non-pinned risk).
