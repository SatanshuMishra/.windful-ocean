# Continuity v2 — Plan 06: Skills + Packaging + End-to-End

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This is plan 6 of 6 — the TERMINAL plan. The shared contract lives in `2026-06-30-continuity-v2-00-overview.md` and is authoritative for every schema, interface, tool name, hook, and userConfig key referenced here. **Deps: Plans 01–05 (all of them).**

**Goal:** Ship the installable Claude Code plugin: the `.claude-plugin/plugin.json` metadata + `userConfig`, the two THIN skills (`session-handoff`, `resume-project`) that call the ledger MCP tools, the runtime-dependency delivery that makes the bundled stdio server run on a fresh install, and an END-TO-END test suite over throwaway git and non-git fixtures asserting the full flow (handoff -> resume -> drift -> re-attach) through the public surface only.

**Architecture:** Everything below the packaging line already exists after Plans 01–05: the record core + `LocalDriver` (01), the `GitRefDriver` (02), the MCP tool surface + FSM/DoD (03), the hooks + `commit-msg` trailer (04), and `reconcile` + re-attach (05). This plan does NOT re-implement any of it. It assembles the shipped artifact set, declares install-time config, writes prose-only skills that delegate to `mcp__ledger__*`, and proves the assembled whole works by driving the real stdio server over JSON-RPC. Skills are THIN: the SKILL.md prose calls tools; no FSM/cap/format logic is restated in prose — the server is the sole authority.

**Tech Stack:** Node.js >= 20 (ESM), `node --test`, the three pinned runtime deps from Plan 01 (`@modelcontextprotocol/sdk` 1.29.0, `ajv` 8.20.0, `ulid` 3.0.2). Plain JS, no TypeScript, **no build/bundle step, no 4th dependency**. E2E drives the server with the MCP SDK's own `Client` + `StdioClientTransport` (already a runtime dep — free).

## Global Constraints (verbatim from Plan 00 — apply to EVERY task)

- Runtime: Node.js >= 20, ES modules only (`.mjs`). No TypeScript. No build step.
- Tests: Node's built-in runner only — `node --test`. No jest/vitest/mocha.
- Dependencies: exactly three runtime deps across the whole plugin — `@modelcontextprotocol/sdk`, `ulid`, `ajv`. Pin EXACT versions (no `^`/`~`). A 4th dependency (including any dev/bundler dependency) requires a plan amendment — this plan adds NONE.
- No code comments anywhere (shebang / tooling-pragma / codegen-marker carve-outs only). No emojis. No AI attribution in commits. (SKILL.md prose and markdown headings are content, not code comments.)
- Immutability; small focused files (200–400 lines typical, 800 hard max); comprehensive error handling; validate at every boundary; never silently swallow errors.
- All cross-references use a stable ULID (or a decision's stable NNNN). A slug or file path is NEVER a link target.
- Storage is reached ONLY through the driver interface / MCP tools. Skills NEVER hand-write ledger files.
- Commit cadence: one logical change per commit; Conventional Commits (`feat:`/`fix:`/`test:`/`refactor:`/`chore:`).

## Context to read first

- `2026-06-30-continuity-v2-00-overview.md` — the frozen cross-plan contract (schemas, StorageDriver, MCP tool surface, FSM/DoD, hook contracts, plan index). LAW.
- `2026-06-30-continuity-v2-01-core-and-local-driver.md` — the structure this plan mirrors + the downstream contract it produced (`selectDriver`, drivers, `newThread`/`newBinding`, `buildIndex`/`rebuildIndex`, `layout`, `fsm`).
- Plans 02–05 for the git driver, the MCP server tool surface + return envelopes, the `hooks.json` + `commit-msg` install contract, and `reconcile` + re-attach. **If a plan is not yet on disk at execution time, consume its surface from Plan 00 verbatim and honor the coupling flags in this plan's Integration Verification section.**
- `docs/session-continuity-redesign/DESIGN-STATE.md` §5 (enforcement planes), §5.5 (thin skills), §7.8 (Resumption Brief), §9 (plugin packaging + userConfig), §6.3/§6.4 (drift + re-attach).

## File Structure (this plan creates)

- `.claude-plugin/plugin.json` — metadata + `userConfig` (`ledger_backend`, `ledger_branch`, `disable_trailer`).
- `skills/session-handoff/SKILL.md` — thin, write-side tools.
- `skills/resume-project/SKILL.md` — thin, read-side tools.
- `scripts/check-packaging.mjs` — pure-Node packaging guard (pins, ensemble presence, no native addons).
- `test/unit/plugin-manifest.test.mjs`, `test/unit/packaging.test.mjs`, `test/unit/skills.test.mjs`, `test/unit/dep-delivery.test.mjs` — unit gates.
- `test/e2e/helpers/mcp-client.mjs`, `test/e2e/helpers/fixtures.mjs` — E2E harness.
- `test/e2e/fsm-dod.test.mjs`, `test/e2e/handoff.test.mjs`, `test/e2e/resume.test.mjs`, `test/e2e/non-git.test.mjs`, `test/e2e/drift.test.mjs`, `test/e2e/reattach.test.mjs` — end-to-end flow.
- Modified for distribution: `.gitignore` (stops ignoring `node_modules/` so the pinned deps ship; see Task 3).
- Co-owned with Plan 03: `.mcp.json` (Plan 03 authors `command`/`args`; this plan adds the `env` block that forwards `userConfig`; see Task 2).

---

### Task 1: Plugin manifest — metadata + userConfig

**Files:**
- Create: `.claude-plugin/plugin.json`
- Test: `test/unit/plugin-manifest.test.mjs`

**Interfaces:**
- Consumes: the `userConfig` contract from Plan 00 §"Repository layout" + DESIGN-STATE §9 (`ledger_backend` orphan-branch default / custom-ref opt-in; `ledger_branch` name; opt-outs).
- Produces: install-time config declarations exposed to `.mcp.json`/hooks as `${user_config.<key>}`. `userConfig` field shape follows the verified manifest schema (`type` ∈ string|number|boolean|directory|file; `title`, `description`, optional `default`). Enum values for `ledger_backend` are validated at the server boundary (Plan 03), not by the manifest (the schema has no enum type).

- [ ] **Step 1: Write the failing test**

`test/unit/plugin-manifest.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

async function manifest() {
  return JSON.parse(await readFile(join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8'))
}

test('manifest carries the required metadata', async () => {
  const m = await manifest()
  assert.equal(m.name, 'session-continuity')
  assert.match(m.version, /^\d+\.\d+\.\d+$/)
  assert.equal(typeof m.description, 'string')
  assert.ok(m.description.length > 0)
})

test('userConfig declares ledger_backend with the orphan-branch default', async () => {
  const c = (await manifest()).userConfig.ledger_backend
  assert.equal(c.type, 'string')
  assert.equal(c.default, 'orphan-branch')
  assert.equal(typeof c.title, 'string')
  assert.equal(typeof c.description, 'string')
})

test('userConfig declares ledger_branch and the trailer opt-out', async () => {
  const u = (await manifest()).userConfig
  assert.equal(u.ledger_branch.type, 'string')
  assert.equal(u.ledger_branch.default, '_ledger')
  assert.equal(u.disable_trailer.type, 'boolean')
  assert.equal(u.disable_trailer.default, false)
})

test('every userConfig key is fully described', async () => {
  const u = (await manifest()).userConfig
  for (const [key, spec] of Object.entries(u)) {
    assert.ok(['string', 'number', 'boolean', 'directory', 'file'].includes(spec.type), `${key} type`)
    assert.equal(typeof spec.title, 'string', `${key} title`)
    assert.equal(typeof spec.description, 'string', `${key} description`)
  }
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/plugin-manifest.test.mjs`
Expected: FAIL — cannot read `.claude-plugin/plugin.json` (ENOENT).

- [ ] **Step 3: Write the manifest**

`.claude-plugin/plugin.json`:

```json
{
  "name": "session-continuity",
  "displayName": "Session Continuity",
  "version": "0.1.0",
  "description": "Git-native, multi-user, drift-aware session-continuity ledger. A bundled stdio MCP server is the sole reader and writer; thin skills and hooks enforce the thread lifecycle. Replaces the prose-based Continuity Ledger with a schema- and FSM-guaranteed store.",
  "author": {
    "name": "Session Continuity Plugin"
  },
  "license": "MIT",
  "keywords": ["session-continuity", "ledger", "mcp", "handoff", "resume", "drift"],
  "userConfig": {
    "ledger_backend": {
      "type": "string",
      "title": "Ledger storage backend",
      "description": "How the shared ledger is stored in a git project. orphan-branch (default) is a tool-owned orphan branch that works on any host. custom-ref stores under refs/ledger/* for a cleaner branch list but depends on the host accepting custom refs.",
      "default": "orphan-branch"
    },
    "ledger_branch": {
      "type": "string",
      "title": "Ledger branch name",
      "description": "Name of the tool-owned branch (orphan-branch backend) or the ref stem (custom-ref backend) that holds ledger state. Chosen to sort away from feature branches and read as infrastructure.",
      "default": "_ledger"
    },
    "disable_trailer": {
      "type": "boolean",
      "title": "Disable the Thread-Id commit trailer",
      "description": "When true, the commit-msg hook does not insert the Thread-Id trailer. Branch re-attach then degrades to slug matching and manual selection; ledger state is unaffected.",
      "default": false
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/plugin-manifest.test.mjs`
Expected: PASS — 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add .claude-plugin/plugin.json test/unit/plugin-manifest.test.mjs
git commit -m "feat: add plugin manifest with ledger userConfig"
```

---

### Task 2: Packaging ensemble guard + userConfig->env wiring in .mcp.json

**Files:**
- Modify: `.mcp.json` (authored by Plan 03; this plan adds/ensures the `env` block)
- Create: `scripts/check-packaging.mjs`
- Test: `test/unit/packaging.test.mjs`

**Interfaces:**
- Consumes: `package.json` (Plan 01), `.mcp.json` (Plan 03), `bin/ledger-server.mjs` (Plan 03), `hooks/hooks.json` + `hooks/commit-msg` (Plan 04), both SKILL.md files (Tasks 4–5).
- Produces: `checkPackaging(root): { ok, problems[] }` — a pure-Node audit (no deps) asserting exact-pinned deps, the required file ensemble, the `.mcp.json` server shape, and the `userConfig`->env mapping the server reads. The mapping is the packaging half of userConfig delivery: plugin.json (Task 1) DECLARES the keys; `.mcp.json` FORWARDS them to the server process as env.
- **Env consumer split (Plan 00 pin 2 / B5).** ONLY the driver-selection vars go to the SERVER env in `.mcp.json`: `LEDGER_BACKEND=${user_config.ledger_backend}`, `LEDGER_BRANCH=${user_config.ledger_branch}`. The trailer/nudge vars — `LEDGER_DISABLE_TRAILER` (=`${user_config.disable_trailer}`), `LEDGER_NUDGE_FRACTION`, `LEDGER_NUDGE_BYTES` — are HOOK-runtime/installer env (owned by Plan 04's `hooks/hooks.json` + installer), NEVER the server. The trailer flow is env -> Plan 04 installer -> git config `continuity.trailer` -> runtime `commit-msg` hook; the server plays no part. The packaging guard therefore asserts the trailer var is ABSENT from the server env (regression guard for the split).

- [ ] **Step 1: Write the failing test**

`test/unit/packaging.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { checkPackaging } from '../../scripts/check-packaging.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

test('dependencies are exactly the three pinned runtime deps', async () => {
  const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'))
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), ['@modelcontextprotocol/sdk', 'ajv', 'ulid'])
  for (const v of Object.values(pkg.dependencies)) {
    assert.match(v, /^\d+\.\d+\.\d+$/, `version must be exact-pinned: ${v}`)
  }
  assert.match(pkg.engines.node, />=\s*20/)
})

test('.mcp.json declares the ledger stdio server and forwards only the driver vars as env', async () => {
  const mcp = JSON.parse(await readFile(join(ROOT, '.mcp.json'), 'utf8'))
  const server = mcp.mcpServers.ledger
  assert.equal(server.command, 'node')
  assert.ok(server.args.some((a) => a.includes('bin/ledger-server.mjs')))
  assert.equal(server.env.LEDGER_BACKEND, '${user_config.ledger_backend}')
  assert.equal(server.env.LEDGER_BRANCH, '${user_config.ledger_branch}')
})

test('.mcp.json server env excludes the trailer/nudge vars (they are hook env, Plan 00 pin 2)', async () => {
  const mcp = JSON.parse(await readFile(join(ROOT, '.mcp.json'), 'utf8'))
  const server = mcp.mcpServers.ledger
  for (const hookVar of ['LEDGER_DISABLE_TRAILER', 'LEDGER_NUDGE_FRACTION', 'LEDGER_NUDGE_BYTES']) {
    assert.equal(server.env?.[hookVar], undefined, `${hookVar} is hook env, not server env`)
  }
})

test('checkPackaging reports the full shipped ensemble present', async () => {
  const { ok, problems } = await checkPackaging(ROOT)
  assert.deepEqual(problems, [])
  assert.equal(ok, true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/packaging.test.mjs`
Expected: FAIL — `checkPackaging` module not found; `.mcp.json` env block absent.

- [ ] **Step 3: Ensure `.mcp.json` forwards userConfig (patch Plan 03's file)**

`.mcp.json` (Plan 03 owns `command`/`args`; this plan ensures the `env` block exists — merge, do not clobber the command/args). Per Plan 00 pin 2, the SERVER env carries ONLY the driver-selection vars; the trailer/nudge vars are HOOK env (Plan 04) and are deliberately absent here:

```json
{
  "mcpServers": {
    "ledger": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/bin/ledger-server.mjs"],
      "env": {
        "LEDGER_BACKEND": "${user_config.ledger_backend}",
        "LEDGER_BRANCH": "${user_config.ledger_branch}"
      }
    }
  }
}
```

The `disable_trailer` userConfig key still reaches its consumer, but via the HOOK side (Plan 04's `hooks/hooks.json` forwards `LEDGER_DISABLE_TRAILER=${user_config.disable_trailer}` plus the nudge knobs to the hook/installer runtime). Do NOT add the trailer/nudge vars to this server `env`.

If Plan 03 already created `.mcp.json`, add only the `env` object and keep its `command`/`args` verbatim. If Plan 03 named the server anything other than `ledger` or pointed `args` anywhere other than `${CLAUDE_PLUGIN_ROOT}/bin/ledger-server.mjs`, STOP and reconcile — the tool names `mcp__ledger__*` in Plan 00 require the server key to be `ledger`.

- [ ] **Step 4: Write the packaging guard**

`scripts/check-packaging.mjs`:

```js
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

const REQUIRED_FILES = [
  '.claude-plugin/plugin.json',
  '.mcp.json',
  'package.json',
  'package-lock.json',
  'bin/ledger-server.mjs',
  'bin/ledger-cli.mjs',
  'hooks/hooks.json',
  'hooks/commit-msg',
  'skills/session-handoff/SKILL.md',
  'skills/resume-project/SKILL.md',
]

const REQUIRED_DEPS = ['@modelcontextprotocol/sdk', 'ajv', 'ulid']

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

export async function checkPackaging(root) {
  const problems = []

  for (const rel of REQUIRED_FILES) {
    if (!(await exists(join(root, rel)))) {
      problems.push(`missing required file: ${rel}`)
    }
  }

  try {
    const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
    const deps = pkg.dependencies ?? {}
    const keys = Object.keys(deps).sort()
    if (keys.join(',') !== REQUIRED_DEPS.slice().sort().join(',')) {
      problems.push(`dependencies must be exactly ${REQUIRED_DEPS.join(', ')}, got ${keys.join(', ')}`)
    }
    for (const [name, version] of Object.entries(deps)) {
      if (!/^\d+\.\d+\.\d+$/.test(version)) {
        problems.push(`dependency ${name} must be exact-pinned, got ${version}`)
      }
    }
    if (pkg.devDependencies && Object.keys(pkg.devDependencies).length > 0) {
      problems.push('no devDependencies are permitted (no 4th dependency, no bundler)')
    }
    const testScript = pkg.scripts?.test ?? ''
    if (!/\bnode\s+--test\b/.test(testScript)) {
      problems.push('package.json test script must run "node --test"')
    }
    if (/\btest\//.test(testScript) && !/test\/e2e/.test(testScript)) {
      problems.push('package.json test script lists explicit paths but omits test/e2e (the e2e suite would never run)')
    }
  } catch (err) {
    problems.push(`package.json unreadable: ${err.message}`)
  }

  try {
    const mcp = JSON.parse(await readFile(join(root, '.mcp.json'), 'utf8'))
    const server = mcp.mcpServers?.ledger
    if (!server) {
      problems.push('.mcp.json must declare an mcpServers.ledger entry')
    } else {
      if (server.command !== 'node') {
        problems.push('.mcp.json ledger.command must be "node"')
      }
      if (!Array.isArray(server.args) || !server.args.some((a) => a.includes('bin/ledger-server.mjs'))) {
        problems.push('.mcp.json ledger.args must launch bin/ledger-server.mjs')
      }
      for (const key of ['LEDGER_BACKEND', 'LEDGER_BRANCH']) {
        if (!server.env || typeof server.env[key] !== 'string') {
          problems.push(`.mcp.json ledger.env.${key} must forward a userConfig value`)
        }
      }
      for (const hookVar of ['LEDGER_DISABLE_TRAILER', 'LEDGER_NUDGE_FRACTION', 'LEDGER_NUDGE_BYTES']) {
        if (server.env && hookVar in server.env) {
          problems.push(`.mcp.json ledger.env.${hookVar} is hook env (Plan 04), not server env; remove it`)
        }
      }
    }
  } catch (err) {
    problems.push(`.mcp.json unreadable: ${err.message}`)
  }

  return { ok: problems.length === 0, problems }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/unit/packaging.test.mjs`
Expected: PASS — 3 tests pass (assuming Plans 01/03/04 artifacts are present; if a required file is missing the guard names it precisely).

- [ ] **Step 6: Commit**

```bash
git add .mcp.json scripts/check-packaging.mjs test/unit/packaging.test.mjs
git commit -m "feat: forward userConfig to the ledger server and guard the packaging ensemble"
```

---

### Task 3: Runtime-dependency delivery (vendored, committed node_modules)

**Files:**
- Modify: `.gitignore` (Plan 01 ignored `node_modules/`; distribution requires it to ship)
- Test: `test/unit/dep-delivery.test.mjs`

**Interfaces:**
- Consumes: `package.json` + `package-lock.json` (Plan 01), `bin/ledger-server.mjs` (Plan 03).
- Produces: a fresh-install-runnable plugin — the three pinned runtime deps are materialized under `${CLAUDE_PLUGIN_ROOT}/node_modules` and TRACKED by git, so a marketplace clone yields a working stdio server with ZERO install step, ZERO network, and ZERO build step.

**OPEN QUESTION resolved here (packaging half of the MCP runtime dependency).** Three candidates were on the table: (A) vendored/committed `node_modules`, (B) an esbuild single-file bundle (the receipts-plugin precedent), (C) a first-run `npm ci` bootstrap. Decision under the Three Pillars (Quality > Optimization > Speed): **(A) vendored committed `node_modules`.** Rationale: it uniquely satisfies the two hardest frozen constraints simultaneously — **no build/bundle step** and **no 4th dependency** (B needs a devDependency bundler + a build step; both are otherwise forbidden). It also gives offline determinism (pins + `package-lock.json`) and removes the runtime-install failure mode of (C). The three deps (`@modelcontextprotocol/sdk`, `ajv`, `ulid`) are pure JavaScript with no native addons, so a committed `node_modules` is portable across darwin/win32/linux — the test enforces this. Cost accepted: the repo carries the dependency tree (a few MB). Fallback if repo size ever becomes a real problem: switch to (B), which would require a plan amendment to admit `esbuild` as a devDependency and a bundle step (documented, not adopted now). **Reconciliation with Plan 03:** Plan 03's `.mcp.json` must launch `node ${CLAUDE_PLUGIN_ROOT}/bin/ledger-server.mjs` (source entrypoint, not a bundle) so Node resolves the bare imports against the vendored `${CLAUDE_PLUGIN_ROOT}/node_modules`; Task 2 verifies exactly that shape. If Plan 03 instead shipped a self-contained bundle entrypoint, this task is redundant and should be dropped — flag it.

- [ ] **Step 1: Write the failing test**

`test/unit/dep-delivery.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readdir, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const execFileAsync = promisify(execFile)
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

async function gitTracked(pathspec) {
  const { stdout } = await execFileAsync('git', ['ls-files', '--', pathspec], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 })
  return stdout.split('\n').filter(Boolean)
}

test('the three runtime deps are present under the plugin-root node_modules', async () => {
  for (const dep of ['@modelcontextprotocol/sdk', 'ajv', 'ulid']) {
    const s = await stat(join(ROOT, 'node_modules', dep))
    assert.ok(s.isDirectory(), `${dep} not vendored`)
  }
})

test('node_modules is tracked by git so it ships on clone', async () => {
  const tracked = await gitTracked('node_modules/ulid')
  assert.ok(tracked.length > 0, 'node_modules/ulid must be committed for fresh-install delivery')
})

test('no native addons are vendored (cross-platform safe)', async () => {
  async function findNodeAddons(dir) {
    let hits = []
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return hits
    }
    for (const e of entries) {
      const p = join(dir, e.name)
      if (e.isDirectory()) {
        hits = hits.concat(await findNodeAddons(p))
      } else if (e.name.endsWith('.node')) {
        hits.push(p)
      }
    }
    return hits
  }
  const addons = await findNodeAddons(join(ROOT, 'node_modules'))
  assert.deepEqual(addons, [], `native addons break vendoring portability: ${addons.join(', ')}`)
})

test('the server entrypoint resolves its deps from the plugin root with a scrubbed environment', async () => {
  const probe = [
    "import('@modelcontextprotocol/sdk/server/index.js').then(",
    "() => Promise.all([import('ajv'), import('ulid')])).then(",
    "() => { process.stdout.write('RESOLVED'); }).catch((e) => {",
    " process.stderr.write(String(e)); process.exit(1); })",
  ].join('')
  const { stdout } = await execFileAsync(
    process.execPath,
    ['--input-type=module', '-e', probe],
    { cwd: ROOT, env: { PATH: process.env.PATH, NODE_PATH: '' }, maxBuffer: 8 * 1024 * 1024 },
  ).catch((err) => {
    throw new Error(`dep resolution failed from a clean env: ${err.stderr ?? err.message}`)
  })
  assert.equal(stdout.trim(), 'RESOLVED')
})
```

Note: the last test runs the probe from a temporary `--input-type=module -e` script whose module resolution base is `cwd: ROOT` — the plugin root, exactly where `.mcp.json` launches the server via `${CLAUDE_PLUGIN_ROOT}`. Node resolves bare specifiers by walking up from that base, so the vendored `${CLAUDE_PLUGIN_ROOT}/node_modules` is the resolver's tree. Anchoring the probe at `ROOT` (rather than `/`) makes it deterministic regardless of the caller's shell `cwd`: it proves the vendored tree is self-sufficient from the plugin root and does not depend on globally reachable deps. `NODE_PATH: ''` scrubs any inherited resolution path so only the vendored tree can satisfy the imports.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/dep-delivery.test.mjs`
Expected: FAIL — `node_modules/ulid` is not git-tracked (Plan 01's `.gitignore` ignores `node_modules/`).

- [ ] **Step 3: Materialize and commit the vendored deps**

Rewrite `.gitignore` so the pinned dependency tree ships (keep the tmp-file ignore):

```
*.tmp-*
```

Then materialize exactly the pinned production tree and stage it:

```bash
npm ci --omit=dev
git add -A node_modules
```

`npm ci` installs from `package-lock.json`, so the committed tree is byte-deterministic against the pins. There are no `devDependencies` (Task 2 guards this), so `--omit=dev` yields precisely the runtime closure.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/dep-delivery.test.mjs`
Expected: PASS — 4 tests pass; the three deps are vendored, tracked, addon-free, and resolvable.

- [ ] **Step 5: Commit**

```bash
git add .gitignore node_modules test/unit/dep-delivery.test.mjs
git commit -m "chore: vendor pinned runtime deps for fresh-install delivery"
```

---

### Task 4: Thin skill — session-handoff (write side)

**Files:**
- Create: `skills/session-handoff/SKILL.md`
- Test: `test/unit/skills.test.mjs` (shared with Task 5; write the handoff cases first)

**Interfaces:**
- Consumes (as prose that CALLS them): `mcp__ledger__append_session_event`, `mcp__ledger__record_decision`, `mcp__ledger__update_thread`, `mcp__ledger__transition_thread`, `mcp__ledger__rebuild_index`.
- Produces: a THIN write-side skill. All FSM/DoD/cap/format logic stays in the server; the prose only orchestrates tool calls. The thinness test forbids the prose from restating server-owned logic (no transition matrix, no cap numbers, no schema/regex).
- **Drift #2 LINCHPIN (Plan 00 tool #12 `update_thread`).** Handoff MUST refresh the thread spine before transitioning: it calls `mcp__ledger__update_thread` to populate `spine.active_goal`, `spine.next_step`, and `spine.open_risks` (and toggle any now-satisfied `completion_criteria[].done`). Without this step the derived `resumable[].next_step` and `get_resume_brief` both come out BLANK — the resume side has no other source, because the brief is spine-only (DD-F). This is why `update_thread` is in `allowed-tools` and is a mandatory step, not an optional one.

- [ ] **Step 1: Write the failing test**

`test/unit/skills.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

async function skill(name) {
  return readFile(join(ROOT, 'skills', name, 'SKILL.md'), 'utf8')
}

function frontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---/.exec(text)
  assert.ok(m, 'SKILL.md must start with YAML frontmatter')
  return m[1]
}

const FORBIDDEN_LOGIC = [
  /ALLOWED_TRANSITIONS/,
  /additionalProperties/,
  /\b80 lines\b/,
  /active\s*->\s*paused/,
  /schema_version/,
]

test('session-handoff frontmatter names the skill and its write-side tools', async () => {
  const text = await skill('session-handoff')
  const fm = frontmatter(text)
  assert.match(fm, /name:\s*session-handoff/)
  for (const tool of [
    'mcp__ledger__append_session_event',
    'mcp__ledger__record_decision',
    'mcp__ledger__update_thread',
    'mcp__ledger__transition_thread',
    'mcp__ledger__rebuild_index',
  ]) {
    assert.ok(fm.includes(tool), `allowed-tools must include ${tool}`)
  }
})

test('session-handoff mandates a spine refresh (Drift #2 guard)', async () => {
  const text = await skill('session-handoff')
  assert.ok(text.includes('mcp__ledger__update_thread'), 'handoff must call update_thread to refresh the spine')
  assert.match(text, /spine/i)
})

test('session-handoff is thin: it references tools and restates no server logic', async () => {
  const text = await skill('session-handoff')
  assert.ok(text.includes('mcp__ledger__transition_thread'))
  for (const re of FORBIDDEN_LOGIC) {
    assert.doesNotMatch(text, re, `thin skill must not restate server logic: ${re}`)
  }
})

test('session-handoff carries no emoji', async () => {
  const text = await skill('session-handoff')
  assert.doesNotMatch(text, /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/skills.test.mjs`
Expected: FAIL — cannot read `skills/session-handoff/SKILL.md`.

- [ ] **Step 3: Write the skill**

`skills/session-handoff/SKILL.md`:

```markdown
---
name: session-handoff
description: Use when the user says "session handoff", "wrap up session", "hand off", "handoff summary", or confirms a wrap-up after the context nudge. Records the session in the project ledger via the ledger MCP server so any fresh session resumes from the ledger alone, then prints the hand-off chat summary.
allowed-tools:
  - mcp__ledger__append_session_event
  - mcp__ledger__record_decision
  - mcp__ledger__update_thread
  - mcp__ledger__transition_thread
  - mcp__ledger__rebuild_index
---

# Session Handoff

The ledger MCP server is the sole reader and writer of the ledger. This skill never creates, edits, or deletes any ledger file; it only calls `mcp__ledger__*` tools. Every schema, lifecycle, cap, and write-once rule lives in the server. If a tool refuses an action, relay the server's message verbatim and stop.

## Steps

1. Identify the thread being worked this session and its `thread_id`.
2. Call `mcp__ledger__append_session_event` with `thread_id`, `actor`, and a `body` that captures where the session started, what shipped, what was tried and rejected (with the reasoning, not just the conclusion), decisions locked, verification run, and where to pick up next.
3. For each decision locked this session that is not yet recorded, call `mcp__ledger__record_decision` with `thread_id`, `slug`, `title`, `context`, `options` (a list of the options weighed), and `outcome`.
4. Refresh the thread spine with `mcp__ledger__update_thread` BEFORE transitioning. Pass a `spine` that sets `active_goal`, `next_step`, and `open_risks` (and `status`, `key_decisions`, `out_of_scope` where they changed) so the resumable roster and the Resumption Brief are non-blank; in the same call toggle any `completion_criteria` entry whose work is now finished to `done`. Skipping this leaves the next session with a blank next step and an empty brief.
5. Transition the thread with `mcp__ledger__transition_thread`. Pass `to_status: "paused"` for a normal wrap; `to_status: "blocked"` with `blocked_by` when a dependency stops the work; `to_status: "done"` only when the work is finished, passing a `closure_statement`. The server enforces the lifecycle and the Definition-of-Done gate and refuses anything illegal. On a normal wrap the paused transition also clears the active-thread pointer, which is what lets the session end cleanly.
6. Call `mcp__ledger__rebuild_index` so the resumable roster reflects the new state.
7. Print the hand-off chat summary from the tool results.

## Rules

- Never hand-write, edit, or delete a file under the ledger store. If a write is needed, a `mcp__ledger__*` tool performs it.
- Do not restate lifecycle rules, caps, or record formats here. The server owns them; surface its errors and stop.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/skills.test.mjs`
Expected: PASS — the 3 session-handoff cases pass (resume-project cases still fail until Task 5).

- [ ] **Step 5: Commit**

```bash
git add skills/session-handoff/SKILL.md test/unit/skills.test.mjs
git commit -m "feat: add thin session-handoff skill"
```

---

### Task 5: Thin skill — resume-project (read side)

**Files:**
- Create: `skills/resume-project/SKILL.md`
- Modify: `test/unit/skills.test.mjs` (add resume-project cases)

**Interfaces:**
- Consumes (as prose that CALLS them): `mcp__ledger__reconcile`, `mcp__ledger__rebuild_index`, `mcp__ledger__get_resume_brief`.
- Produces: a THIN read-side skill that presents the resumable roster, loads exactly one thread's brief, and STOPS. No drift/FSM/brief logic restated in prose.
- **DD-F (SPINE-ONLY brief).** The Resumption Brief is `get_resume_brief` output, which is SPINE-ONLY (Plan 00): the refreshed spine (written at handoff by `update_thread`, Task 4) SUBSUMES the latest session log, so the resume path needs NO session-read tool and none exists. `allowed-tools` deliberately omits any `append_session_event`/session-read capability, and the skill prose must NOT instruct loading a session log — there is no wording tension to resolve because the brief draws solely from the spine. Task 9's e2e proves the spine-refreshed content surfaces in the brief.

- [ ] **Step 1: Extend the failing test**

Append to `test/unit/skills.test.mjs`:

```js
test('resume-project frontmatter names the skill and its read-side tools', async () => {
  const fm = frontmatter(await skill('resume-project'))
  assert.match(fm, /name:\s*resume-project/)
  for (const tool of [
    'mcp__ledger__reconcile',
    'mcp__ledger__rebuild_index',
    'mcp__ledger__get_resume_brief',
  ]) {
    assert.ok(fm.includes(tool), `allowed-tools must include ${tool}`)
  }
})

test('resume-project is thin and enforces present-then-stop', async () => {
  const text = await skill('resume-project')
  assert.ok(text.includes('mcp__ledger__get_resume_brief'))
  assert.match(text, /STOP/)
  for (const re of FORBIDDEN_LOGIC) {
    assert.doesNotMatch(text, re, `thin skill must not restate server logic: ${re}`)
  }
})

test('resume-project carries no emoji', async () => {
  assert.doesNotMatch(await skill('resume-project'), /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/skills.test.mjs`
Expected: FAIL — cannot read `skills/resume-project/SKILL.md`.

- [ ] **Step 3: Write the skill**

`skills/resume-project/SKILL.md`:

```markdown
---
name: resume-project
description: Use when the user says "continue", "resume", "pick up where we left off", "/resume-project", or a near-equivalent at the start of work in a project tracked by the ledger. Presents the resumable thread roster (or honors an explicit /resume-project <slug>), loads one thread plus its brief, presents the Resumption Brief, then STOPS for the user's instruction.
allowed-tools:
  - mcp__ledger__reconcile
  - mcp__ledger__rebuild_index
  - mcp__ledger__get_resume_brief
---

# Resume Project

The ledger MCP server is the sole reader and writer. This skill only calls `mcp__ledger__*` tools and never reads or writes ledger files directly. The server composes drift, lifecycle, and the brief; this skill presents them and waits.

## Steps

1. Call `mcp__ledger__rebuild_index` and present the resumable roster the SessionStart hook injected. Show each resumable thread with its next step. Never auto-select by recency or last-modified time.
2. If the user named a thread (for example `/resume-project <slug>`), select it. Otherwise wait for the user to choose from the roster.
3. Call `mcp__ledger__reconcile` to fold drift and re-attach signals into the picture for the chosen thread.
4. Call `mcp__ledger__get_resume_brief` with the chosen `thread_id` and render the Resumption Brief exactly as returned.
5. STOP. Do not begin the work. Wait for the user's instruction.

## Rules

- Present, then STOP. Auto-proceeding into the work is forbidden.
- Never hand-write or edit ledger files; the server is the only writer.
- Do not re-derive drift, lifecycle, or brief formatting here; relay what the server returns.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/skills.test.mjs`
Expected: PASS — all 6 skill cases pass.

- [ ] **Step 5: Commit**

```bash
git add skills/resume-project/SKILL.md test/unit/skills.test.mjs
git commit -m "feat: add thin resume-project skill"
```

---

### Task 6: E2E harness — stdio MCP client + fixtures

**Files:**
- Create: `test/e2e/helpers/mcp-client.mjs`, `test/e2e/helpers/fixtures.mjs`
- Test: `test/e2e/handoff.test.mjs` (a smoke case that exercises the harness; expanded in Task 8)

**Interfaces:**
- Consumes: `bin/ledger-server.mjs` (Plan 03) launched as a child process; the MCP SDK `Client` + `StdioClientTransport`; `git` for git fixtures.
- Produces: `startLedger({projectDir, dataDir, backend, branch})` -> connected `Client`; `callTool(client, name, args)` -> the tool's JSON result (`structuredContent` when present, else the parsed text content); `expectToolError(client, name, args, pattern)`; and fixture builders `tempDir`, `cleanup`, `initGitRepo`, `initGitRepoWithRemote`, `initNonGitDir`, plus the non-git pointer/index readers `projectKey`, `readActiveThread`, `readResumableIndex`.
- Env faithfulness (Plan 00 pin 2): `startLedger` forwards ONLY the driver vars (`LEDGER_BACKEND`, `LEDGER_BRANCH`) into the server env, mirroring the corrected `.mcp.json` (Task 2). The trailer var is hook env and is intentionally NOT set — E2E drives the server directly over stdio and never exercises the `commit-msg` hook, so trailer presence is controlled per-test via the `trailer_present` arg to `bind_branch`, not via env.

- [ ] **Step 1: Write the harness**

`test/e2e/helpers/mcp-client.mjs`:

```js
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const PLUGIN_ROOT = join(HERE, '..', '..', '..')
const SERVER_ENTRY = join(PLUGIN_ROOT, 'bin', 'ledger-server.mjs')

export async function startLedger({ projectDir, dataDir, backend = 'orphan-branch', branch = '_ledger', extraEnv = {} }) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER_ENTRY],
    cwd: projectDir,
    env: {
      ...process.env,
      CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
      CLAUDE_PROJECT_DIR: projectDir,
      CLAUDE_PLUGIN_DATA: dataDir,
      LEDGER_BACKEND: backend,
      LEDGER_BRANCH: branch,
      ...extraEnv,
    },
  })
  const client = new Client({ name: 'ledger-e2e', version: '0.0.0' }, { capabilities: {} })
  await client.connect(transport)
  return client
}

function resultToJson(res) {
  if (res.structuredContent !== undefined) {
    return res.structuredContent
  }
  const text = (res.content ?? []).map((c) => c.text ?? '').join('')
  return text ? JSON.parse(text) : {}
}

export async function callTool(client, name, args = {}) {
  const res = await client.callTool({ name, arguments: args })
  if (res.isError) {
    const text = (res.content ?? []).map((c) => c.text ?? '').join('\n')
    throw new Error(`tool ${name} error: ${text}`)
  }
  return resultToJson(res)
}

export async function expectToolError(client, name, args, pattern) {
  let message = ''
  try {
    const res = await client.callTool({ name, arguments: args })
    if (!res.isError) {
      throw new Error(`expected ${name} to fail but it succeeded`)
    }
    message = (res.content ?? []).map((c) => c.text ?? '').join('\n')
  } catch (err) {
    message = err.message
  }
  if (!pattern.test(message)) {
    throw new Error(`expected ${name} error to match ${pattern}, got: ${message}`)
  }
  return message
}
```

`test/e2e/helpers/fixtures.mjs`:

```js
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export async function tempDir(prefix) {
  return mkdtemp(join(tmpdir(), prefix))
}

export async function cleanup(...dirs) {
  for (const d of dirs) {
    await rm(d, { recursive: true, force: true })
  }
}

async function runGit(cwd, args) {
  const { stdout } = await execFileAsync('git', args, { cwd, maxBuffer: 16 * 1024 * 1024 })
  return stdout.trim()
}

export async function initGitRepo() {
  const dir = await tempDir('ledger-e2e-repo-')
  await runGit(dir, ['init', '-b', 'main'])
  await runGit(dir, ['config', 'user.email', 'e2e@example.com'])
  await runGit(dir, ['config', 'user.name', 'E2E'])
  await writeFile(join(dir, 'README.md'), '# fixture\n')
  await runGit(dir, ['add', '.'])
  await runGit(dir, ['commit', '-m', 'chore: init fixture'])
  return { dir, git: (...args) => runGit(dir, args) }
}

export async function initGitRepoWithRemote() {
  const remote = await tempDir('ledger-e2e-remote-')
  await runGit(remote, ['init', '--bare', '-b', 'main'])
  const repo = await initGitRepo()
  await repo.git('remote', 'add', 'origin', remote)
  await repo.git('push', '-u', 'origin', 'main')
  await repo.git('remote', 'set-head', 'origin', 'main')
  return { ...repo, remote }
}

export async function initNonGitDir() {
  return tempDir('ledger-e2e-plain-')
}

export function projectKey(absoluteDir) {
  return absoluteDir.replace(/[^a-zA-Z0-9]/g, '-')
}

function nonGitBase(dataDir, projectDir) {
  return join(dataDir, projectKey(projectDir))
}

export async function readActiveThread(dataDir, projectDir) {
  try {
    return (await readFile(join(nonGitBase(dataDir, projectDir), 'active-thread'), 'utf8')).trim()
  } catch {
    return ''
  }
}

export async function readResumableIndex(dataDir, projectDir) {
  const path = join(nonGitBase(dataDir, projectDir), 'ledger', 'index', 'resumable.json')
  return JSON.parse(await readFile(path, 'utf8'))
}
```

- [ ] **Step 2: Write a harness smoke test**

`test/e2e/handoff.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { startLedger, callTool } from './helpers/mcp-client.mjs'
import { initNonGitDir, tempDir, cleanup, readActiveThread, readResumableIndex } from './helpers/fixtures.mjs'

test('harness connects to the server and opens a thread', async () => {
  const projectDir = await initNonGitDir()
  const dataDir = await tempDir('ledger-e2e-data-')
  const client = await startLedger({ projectDir, dataDir })
  try {
    const { thread } = await callTool(client, 'open_thread', {
      title: 'Smoke thread',
      slug: 'smoke',
      completion_criteria: [{ text: 'connect works', done: true }],
    })
    assert.equal(thread.slug, 'smoke')
    assert.equal(thread.status, 'active')
    assert.match(thread.id, /^[0-9A-HJKMNP-TV-Z]{26}$/)
  } finally {
    await client.close()
    await cleanup(projectDir, dataDir)
  }
})
```

- [ ] **Step 3: Run test to verify it passes**

Run: `node --test test/e2e/handoff.test.mjs`
Expected: PASS — the harness spawns the real server, opens a thread, and returns the validated record. (RED precondition: without the harness modules this file cannot import; it fails first, then passes once the helpers exist and Plan 03's server is present.)

- [ ] **Step 4: Commit**

```bash
git add test/e2e/helpers/mcp-client.mjs test/e2e/helpers/fixtures.mjs test/e2e/handoff.test.mjs
git commit -m "test: add e2e stdio MCP harness and fixtures"
```

---

### Task 7: E2E — FSM + DoD enforced by the server

**Files:**
- Create: `test/e2e/fsm-dod.test.mjs`

**Interfaces:**
- Consumes: `open_thread`, `update_thread`, `transition_thread` (Plan 03); the FSM matrix + DoD gate (Plan 01 `fsm.mjs`, enforced by Plan 03).
- Produces: behavioral proof that illegal transitions and a premature `done` are refused, that a legal `done` (all criteria checked + closure statement) succeeds, and (DD-A) that the realistic MULTI-SESSION path works — a thread opened with an unchecked criterion is checked off later via `update_thread` (match-by-text, flip `done` only), after which `done` is accepted. Asserted through the tool surface, not internals.

- [ ] **Step 1: Write the test**

`test/e2e/fsm-dod.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { startLedger, callTool, expectToolError } from './helpers/mcp-client.mjs'
import { initNonGitDir, tempDir, cleanup } from './helpers/fixtures.mjs'

async function withServer(fn) {
  const projectDir = await initNonGitDir()
  const dataDir = await tempDir('ledger-e2e-data-')
  const client = await startLedger({ projectDir, dataDir })
  try {
    await fn(client)
  } finally {
    await client.close()
    await cleanup(projectDir, dataDir)
  }
}

test('an illegal transition is refused by the server', async () => {
  await withServer(async (client) => {
    const { thread } = await callTool(client, 'open_thread', {
      title: 'Legal moves only', slug: 'legal',
      completion_criteria: [{ text: 'ship', done: false }],
    })
    await callTool(client, 'transition_thread', { thread_id: thread.id, to_status: 'paused' })
    await expectToolError(
      client,
      'transition_thread',
      { thread_id: thread.id, to_status: 'blocked' },
      /transition|illegal|not allowed/i,
    )
  })
})

test('done is refused until every criterion is checked and a closure statement is given', async () => {
  await withServer(async (client) => {
    const { thread } = await callTool(client, 'open_thread', {
      title: 'Gated done', slug: 'gated',
      completion_criteria: [{ text: 'do the thing', done: false }],
    })
    await expectToolError(
      client,
      'transition_thread',
      { thread_id: thread.id, to_status: 'done', closure_statement: 'trying to close early' },
      /criteri|definition of done|dod/i,
    )
  })
})

test('done succeeds when criteria are all checked and a closure statement is supplied', async () => {
  await withServer(async (client) => {
    const { thread } = await callTool(client, 'open_thread', {
      title: 'Finished work', slug: 'finished',
      completion_criteria: [{ text: 'done and verified', done: true }],
    })
    const { thread: closed } = await callTool(client, 'transition_thread', {
      thread_id: thread.id, to_status: 'done', closure_statement: 'shipped and verified',
    })
    assert.equal(closed.status, 'done')
  })
})

test('multi-session DoD: an unchecked criterion is checked off via update_thread, then done succeeds', async () => {
  await withServer(async (client) => {
    const { thread } = await callTool(client, 'open_thread', {
      title: 'Multi-session done', slug: 'multi-done',
      completion_criteria: [{ text: 'implement the fix', done: false }],
    })

    await expectToolError(
      client,
      'transition_thread',
      { thread_id: thread.id, to_status: 'done', closure_statement: 'too early' },
      /criteri|definition of done|dod/i,
    )

    const { thread: checked } = await callTool(client, 'update_thread', {
      thread_id: thread.id,
      completion_criteria: [{ text: 'implement the fix', done: true }],
    })
    assert.ok(
      checked.completion_criteria.every((c) => c.done),
      'update_thread must flip the criterion to done (match-by-text)',
    )

    const { thread: closed } = await callTool(client, 'transition_thread', {
      thread_id: thread.id, to_status: 'done', closure_statement: 'implemented and verified',
    })
    assert.equal(closed.status, 'done')
  })
})
```

- [ ] **Step 2: Run test to verify it passes**

Run: `node --test test/e2e/fsm-dod.test.mjs`
Expected: PASS — 4 tests pass. The server refuses `paused -> blocked` and a premature `done`, accepts a fully-satisfied `done`, and accepts `done` after an unchecked criterion is checked off mid-life via `update_thread`.

- [ ] **Step 3: Commit**

```bash
git add test/e2e/fsm-dod.test.mjs
git commit -m "test: e2e FSM and DoD enforcement through the server"
```

---

### Task 8: E2E — handoff writes a session log, records a decision, refreshes the spine, transitions

**Files:**
- Modify: `test/e2e/handoff.test.mjs`

**Interfaces:**
- Consumes: `open_thread`, `append_session_event`, `record_decision`, `update_thread`, `transition_thread`, `rebuild_index`, `get_resume_brief` (Plan 03); the active-thread control pointer (Plan 03/Plan 00 control plane).
- Produces: proof that the `session-handoff` skill's tool chain produces valid state and a NON-BLANK resumable roster + brief, all via MCP with no hand-written files. Binds four amended contract points at once: Drift #1 (`record_decision.options` is a STRING ARRAY), Drift #2 (`update_thread` refreshes the spine so `resumable.next_step` and the brief are non-blank), pin 1 (the `active -> paused` transition CLEARS the active-thread pointer, so the Stop gate passes), and H6(c) (spine `active_goal`/`next_step` are asserted non-empty and present in the brief — this assertion FAILS on an all-empty-string spine, guarding the Drift #2 regression).
- **COUPLING FLAGS (white-box reads).** (1) The pin-1 pointer assertion reads the active-thread pointer at `<dataDir>/<project-key>/active-thread` (non-git home, Plan 00 control plane) via `readActiveThread`. (2) The Drift #2 roster guard reads `resumable.json` at `<dataDir>/<project-key>/ledger/index/resumable.json` via `readResumableIndex`, assuming the LocalDriver materializes derived indexes under `<ledgerRoot>/index/` (consistent with Plan 00's derived `index/` files and Task 10's `<ledgerRoot>/threads|sessions` assertions). If Plan 01 places the pointer or the derived index elsewhere, adjust the two readers in `fixtures.mjs`. The brief guard (`get_resume_brief`) is pure public surface and is unaffected by either path.

- [ ] **Step 1: Extend the test**

Append to `test/e2e/handoff.test.mjs`:

```js
test('handoff chain: log, decision, spine refresh, pause; pointer clears; roster + brief non-blank', async () => {
  const projectDir = await initNonGitDir()
  const dataDir = await tempDir('ledger-e2e-data-')
  const client = await startLedger({ projectDir, dataDir })
  try {
    const { thread } = await callTool(client, 'open_thread', {
      title: 'Fix signup 500', slug: 'fix-signup',
      completion_criteria: [{ text: 'returns 409', done: false }],
    })

    assert.equal(
      await readActiveThread(dataDir, projectDir),
      thread.id,
      'open_thread (new -> active) must write the active-thread pointer (Plan 00 control-pointer timing)',
    )

    const evt = await callTool(client, 'append_session_event', {
      thread_id: thread.id, actor: 'cursor',
      body: 'Reproduced the 500; wrote a failing test asserting 409.',
    })
    assert.match(evt.path, /sessions\//)

    const dec = await callTool(client, 'record_decision', {
      thread_id: thread.id, slug: 'signup-error-contract',
      title: 'Return 409 on duplicate email', context: 'Callers rely on status codes.',
      options: ['Keep the 500', 'Return 409 on duplicate email'], outcome: 'Return 409.',
    })
    assert.match(dec.number, /^\d{4}$/)
    assert.match(dec.path, /decisions\//)

    const ACTIVE_GOAL = 'Make signup return 409 on duplicate email'
    const NEXT_STEP = 'Wire the 409 path through the controller and green the failing test'
    await callTool(client, 'update_thread', {
      thread_id: thread.id,
      spine: {
        status: 'paused',
        active_goal: ACTIVE_GOAL,
        next_step: NEXT_STEP,
        open_risks: ['callers may still branch on 500'],
        key_decisions: [dec.number],
        out_of_scope: ['rate limiting'],
      },
    })

    const { thread: paused } = await callTool(client, 'transition_thread', {
      thread_id: thread.id, to_status: 'paused',
    })
    assert.equal(paused.status, 'paused')

    assert.equal(
      await readActiveThread(dataDir, projectDir),
      '',
      'the active -> paused handoff transition must CLEAR the pointer so the Stop gate passes (Plan 00 pin 1)',
    )

    const { counts } = await callTool(client, 'rebuild_index', {})
    assert.equal(counts.resumable, 1)

    const resumable = await readResumableIndex(dataDir, projectDir)
    const entry = resumable.find((r) => r.id === thread.id)
    assert.ok(entry, 'the paused thread must be on the resumable roster')
    assert.ok(entry.next_step && entry.next_step.length > 0, 'resumable.next_step must be non-blank (Drift #2 guard)')
    assert.equal(entry.next_step, NEXT_STEP)

    const brief = await callTool(client, 'get_resume_brief', { thread_id: thread.id })
    const rendered = typeof brief.brief === 'string' ? brief.brief : JSON.stringify(brief.brief)
    assert.ok(rendered.length > 0, 'the brief must be non-blank')
    assert.ok(rendered.includes(ACTIVE_GOAL), 'the brief must carry the refreshed active_goal')
    assert.ok(rendered.includes(NEXT_STEP), 'the brief must carry the refreshed next_step')
  } finally {
    await client.close()
    await cleanup(projectDir, dataDir)
  }
})
```

- [ ] **Step 2: Run test to verify it passes**

Run: `node --test test/e2e/handoff.test.mjs`
Expected: PASS — 2 tests pass; the handoff chain writes valid records, refreshes the spine, clears the active-thread pointer on pause, and the roster + brief carry the non-blank next step and active goal.

- [ ] **Step 3: Commit**

```bash
git add test/e2e/handoff.test.mjs
git commit -m "test: e2e session-handoff tool chain"
```

---

### Task 9: E2E — resume presents the roster, composes a brief, and stops

**Files:**
- Create: `test/e2e/resume.test.mjs`

**Interfaces:**
- Consumes: `open_thread`, `update_thread`, `transition_thread`, `rebuild_index`, `get_resume_brief` (Plan 03).
- Produces: proof that the `resume-project` substrate yields a multi-thread roster and a SPINE-ONLY brief for a chosen thread that reflects the refreshed spine (DD-F: the refreshed spine subsumes the latest session log, so no session-read tool exists or is needed). The menu-then-STOP behavior is skill prose (verified in Task 5); this asserts the server pieces that back it.

- [ ] **Step 1: Write the test**

`test/e2e/resume.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { startLedger, callTool } from './helpers/mcp-client.mjs'
import { initNonGitDir, tempDir, cleanup } from './helpers/fixtures.mjs'

test('resume substrate: roster counts resumables and a spine-only brief resolves for one', async () => {
  const projectDir = await initNonGitDir()
  const dataDir = await tempDir('ledger-e2e-data-')
  const client = await startLedger({ projectDir, dataDir })
  try {
    const a = await callTool(client, 'open_thread', {
      title: 'Active work', slug: 'active-one',
      completion_criteria: [{ text: 'x', done: false }],
    })
    const b = await callTool(client, 'open_thread', {
      title: 'Paused work', slug: 'paused-one',
      completion_criteria: [{ text: 'y', done: false }],
    })

    const B_NEXT = 'Resume by finishing the paused-one migration'
    await callTool(client, 'update_thread', {
      thread_id: b.thread.id,
      spine: {
        status: 'paused', active_goal: 'Ship paused-one', next_step: B_NEXT,
        open_risks: [], key_decisions: [], out_of_scope: [],
      },
    })
    await callTool(client, 'transition_thread', { thread_id: b.thread.id, to_status: 'paused' })

    const { counts } = await callTool(client, 'rebuild_index', {})
    assert.equal(counts.resumable, 2)

    const brief = await callTool(client, 'get_resume_brief', { thread_id: b.thread.id })
    assert.ok('brief' in brief)
    const rendered = typeof brief.brief === 'string' ? brief.brief : JSON.stringify(brief.brief)
    assert.ok(rendered.length > 0)
    assert.ok(rendered.includes(B_NEXT), 'the spine-only brief must reflect the refreshed next_step (DD-F)')

    assert.notEqual(a.thread.id, b.thread.id)
  } finally {
    await client.close()
    await cleanup(projectDir, dataDir)
  }
})
```

- [ ] **Step 2: Run test to verify it passes**

Run: `node --test test/e2e/resume.test.mjs`
Expected: PASS — the roster counts both resumable threads and `get_resume_brief` returns a non-empty brief.

- [ ] **Step 3: Commit**

```bash
git add test/e2e/resume.test.mjs
git commit -m "test: e2e resume roster and brief composition"
```

---

### Task 10: E2E — non-git driver parity

**Files:**
- Create: `test/e2e/non-git.test.mjs`

**Interfaces:**
- Consumes: `open_thread`, `append_session_event`, `get_resume_brief` (Plan 03); the `LocalDriver` selection for non-git projects (Plan 01 `selectDriver`).
- Produces: proof the same tool surface operates on a non-git project with `vcs_ref = null` and without binding/drift machinery, and that state persists under `${CLAUDE_PLUGIN_DATA}/<project-key>/ledger`.

- [ ] **Step 1: Write the test**

`test/e2e/non-git.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { startLedger, callTool } from './helpers/mcp-client.mjs'
import { initNonGitDir, tempDir, cleanup } from './helpers/fixtures.mjs'

function projectKey(absoluteDir) {
  return absoluteDir.replace(/[^a-zA-Z0-9]/g, '-')
}

test('non-git project stores threads locally with vcs_ref null', async () => {
  const projectDir = await initNonGitDir()
  const dataDir = await tempDir('ledger-e2e-data-')
  const client = await startLedger({ projectDir, dataDir })
  try {
    const { thread } = await callTool(client, 'open_thread', {
      title: 'Local-only thread', slug: 'local-only',
      completion_criteria: [{ text: 'no git needed', done: false }],
    })
    assert.equal(thread.vcs_ref, null)

    await callTool(client, 'append_session_event', {
      thread_id: thread.id, actor: 'cursor', body: 'local store works',
    })

    const ledgerRoot = join(dataDir, projectKey(projectDir), 'ledger')
    assert.ok((await stat(join(ledgerRoot, 'threads'))).isDirectory())
    assert.ok((await stat(join(ledgerRoot, 'sessions'))).isDirectory())

    const brief = await callTool(client, 'get_resume_brief', { thread_id: thread.id })
    assert.ok('brief' in brief)
  } finally {
    await client.close()
    await cleanup(projectDir, dataDir)
  }
})
```

- [ ] **Step 2: Run test to verify it passes**

Run: `node --test test/e2e/non-git.test.mjs`
Expected: PASS — the local store materializes under `<dataDir>/<project-key>/ledger`, threads carry `vcs_ref: null`, and the brief resolves without any binding/drift.

- [ ] **Step 3: Commit**

```bash
git add test/e2e/non-git.test.mjs
git commit -m "test: e2e non-git local driver parity"
```

---

### Task 11: E2E — per-signal drift classification over git fixtures

**Files:**
- Create: `test/e2e/drift.test.mjs`

**Interfaces:**
- Consumes: `open_thread`, `bind_branch`, `reconcile` (Plan 03 + Plan 05); `GitRefDriver` on a git project (Plan 02); the `BranchObservation` signal set from Plan 00 (`branch_exists`, `first_commit_present`, `merged`, `squash_merged`, `ahead`, `behind`, `force_push_detected`, `diverged_from_upstream`, `key_files_modified[]`, `key_files_deleted[]`; the `divergence` signal fires exclusively off `ahead`/`behind`). `force_push_detected` is consumed but is ALWAYS the literal `false` in v2 (decision 2026-07-01-continuity-v2-force-push-detected-false), so no fixture can make the `force-push` rung fire.
- Produces: per-signal proof (H6a) that `reconcile` returns the pinned `{drift, dispositions}` envelope AND CLASSIFIES each producible signal, driving ONE fixture per scenario — deleted branch, merged, squash-merge, force-push (classified via `head-missing`), divergence, key-file modified, key-file deleted — and asserting for each (a) the named signal `code` with its classification (one of CRITICAL / WARNING / COMPLETE) inside the branch's drift entry, and (b) grounded disposition/drift CONTENT referencing the churned branch plus an outcome keyword (a BranchBinding `status`/`closed_reason` enum value from Plan 00 where a status change is expected, or the affected key-file path). NOT `drift.length > 0`.
- **CLASSIFICATION mapping (design-faithful, DESIGN-STATE §6.3 "reconcile, not police").** Each drift entry carries a literal `classification` field (the primary binding — read directly, no fallback), one of the frozen vocabulary `{CRITICAL, WARNING, COMPLETE}`. Plan 05 sets the mapping; this task asserts it per signal:
  - **CRITICAL** — head-missing, force-push, key-file-deleted (history was destroyed or a depended-on file was removed: recovery needs the human). The `force-push` rung is UNREACHABLE in v2: `force_push_detected` is always the literal `false` (decision 2026-07-01-continuity-v2-force-push-detected-false), so the force-push SCENARIO classifies CRITICAL via `head-missing` — after `commit --amend` + `push --force` the recorded `first_commit` is rewritten away and is no longer an ancestor of the new head, so `first_commit_present` is `false`.
  - **WARNING** — not-ancestor, divergence, key-file-modified, branch-gone(DELETED) (recoverable/re-attachable state; the deleted-but-unmerged branch is a WARNING, NOT a CRITICAL, because the durability reframe treats the thread as re-attachable rather than lost).
  - **COMPLETE** — squash-merged, branch-gone(MERGED) (the work landed).
  The seven fixtures below assert: deleted->WARNING via branch-gone(deleted), merged->COMPLETE via branch-gone(merged), squash-merged->COMPLETE via squash-merged, force-push scenario->CRITICAL via head-missing (the force-push rung itself cannot fire), divergence->WARNING, key-file-modified->WARNING, key-file-deleted->CRITICAL.
- **COUPLING FLAG (Plan 05 disposition shape).** The `classification` field name + vocabulary, the per-signal `code` vocabulary, and the above mapping are LOCKED (Plan 05 sets them to match). The disposition ELEMENT shape is still Plan 05's, so disposition/drift CONTENT is asserted by JSON-containment of the branch name plus a grounded keyword against the whole envelope, not a fixed field path. If Plan 05 emits an off-vocabulary classification or a different mapping, THIS TEST is the reconciliation trip-wire — reconcile with Plan 05; do NOT weaken the assertion silently.

- [ ] **Step 1: Write the test**

`test/e2e/drift.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { startLedger, callTool } from './helpers/mcp-client.mjs'
import { initGitRepo, initGitRepoWithRemote, tempDir, cleanup } from './helpers/fixtures.mjs'

const CLASSES = new Set(['CRITICAL', 'WARNING', 'COMPLETE'])

function classificationOf(entry) {
  return entry.classification
}

function classificationsFor(result, needle) {
  return [...result.drift, ...result.dispositions]
    .filter((e) => JSON.stringify(e).includes(needle))
    .map(classificationOf)
    .filter(Boolean)
}

function signalsFor(result, needle) {
  return result.drift
    .filter((e) => JSON.stringify(e).includes(needle))
    .flatMap((e) => (Array.isArray(e.signals) ? e.signals : []))
}

function assertEnvelope(result) {
  assert.ok(Array.isArray(result.drift), 'reconcile must return a drift array')
  assert.ok(Array.isArray(result.dispositions), 'reconcile must return a dispositions array')
}

async function runDriftScenario({ slug, branch, keyFile = 'widget.txt', withRemote = false, churn, expectSignal, expectClass, expectContent }) {
  const repo = withRemote ? await initGitRepoWithRemote() : await initGitRepo()
  const { dir: projectDir, git } = repo
  const dataDir = await tempDir('ledger-e2e-data-')
  const client = await startLedger({ projectDir, dataDir })
  try {
    await git('checkout', '-b', branch)
    await writeFile(join(projectDir, keyFile), 'v1\n')
    await git('add', '.')
    await git('commit', '-m', `feat: start ${branch}`)
    const firstCommit = await git('rev-parse', 'HEAD')
    if (withRemote) await git('push', '-u', 'origin', branch)

    const { thread } = await callTool(client, 'open_thread', {
      title: `Thread ${slug}`, slug, vcs_ref: branch,
      completion_criteria: [{ text: 'ships', done: false }],
    })
    await callTool(client, 'bind_branch', {
      thread_id: thread.id, repo: projectDir, branch, first_commit: firstCommit, trailer_present: true,
    })

    await churn({ projectDir, git, branch, keyFile, firstCommit })

    const result = await callTool(client, 'reconcile', {})
    assertEnvelope(result)

    const classes = classificationsFor(result, branch)
    assert.ok(classes.length > 0, `${branch} must surface a CLASSIFIED signal, not merely drift.length`)
    for (const c of classes) {
      assert.ok(CLASSES.has(c), `classification ${c} must be one of CRITICAL/WARNING/COMPLETE`)
    }
    const signals = signalsFor(result, branch)
    const hit = signals.find((s) => s.code === expectSignal)
    assert.ok(hit, `${branch} must fire ${expectSignal}, got [${signals.map((s) => s.code)}]`)
    assert.equal(hit.classification, expectClass, `${branch} ${expectSignal} must classify as ${expectClass}`)

    const resultText = JSON.stringify(result)
    assert.ok(resultText.includes(branch), 'the reconcile output must reference the churned branch')
    assert.ok(expectContent.test(resultText), `reconcile output must carry the grounded signal (${expectContent})`)
  } finally {
    await client.close()
    const dirs = [projectDir, dataDir]
    if (repo.remote) dirs.push(repo.remote)
    await cleanup(...dirs)
  }
}

test('drift: a deleted unmerged bound branch classifies WARNING via branch-gone(deleted)', () => runDriftScenario({
  slug: 'del', branch: 'feat/del', expectSignal: 'branch-gone', expectClass: 'WARNING', expectContent: /orphan|delet/i,
  churn: async ({ git, branch }) => {
    await git('checkout', 'main')
    await git('branch', '-D', branch)
  },
}))

test('drift: a merged branch classifies COMPLETE via branch-gone(merged)', () => runDriftScenario({
  slug: 'mrg', branch: 'feat/mrg', withRemote: true, expectSignal: 'branch-gone', expectClass: 'COMPLETE', expectContent: /merged|complete|done/i,
  churn: async ({ git, branch }) => {
    await git('checkout', 'main')
    await git('merge', '--no-ff', branch, '-m', `merge: ${branch}`)
    await git('push', 'origin', 'main')
  },
}))

test('drift: a squash-merged branch classifies COMPLETE via squash-merged', () => runDriftScenario({
  slug: 'sq', branch: 'feat/sq', withRemote: true, expectSignal: 'squash-merged', expectClass: 'COMPLETE', expectContent: /merged|squash|complete/i,
  churn: async ({ git, branch }) => {
    await git('checkout', 'main')
    await git('merge', '--squash', branch)
    await git('commit', '-m', `feat: squash ${branch}`)
    await git('push', 'origin', 'main')
  },
}))

test('drift: a force-pushed branch classifies CRITICAL via head-missing (recorded first_commit rewritten away)', () => runDriftScenario({
  slug: 'fp', branch: 'feat/fp', withRemote: true, expectSignal: 'head-missing', expectClass: 'CRITICAL', expectContent: /first_commit|unreachable|diverge/i,
  churn: async ({ projectDir, git, branch, keyFile }) => {
    await writeFile(join(projectDir, keyFile), 'rewritten\n')
    await git('add', '.')
    await git('commit', '--amend', '-m', `feat: rewritten ${branch}`)
    await git('push', '--force', 'origin', branch)
  },
}))

test('drift: a branch diverged from upstream classifies WARNING', () => runDriftScenario({
  slug: 'dv', branch: 'feat/dv', withRemote: true, expectSignal: 'divergence', expectClass: 'WARNING', expectContent: /diverge|ahead/i,
  churn: async ({ projectDir, git, branch, keyFile, firstCommit }) => {
    await writeFile(join(projectDir, keyFile), 'upstream\n')
    await git('add', '.')
    await git('commit', '-m', 'feat: upstream commit')
    await git('push', 'origin', branch)
    await git('reset', '--hard', firstCommit)
    await writeFile(join(projectDir, keyFile), 'local-divergent\n')
    await git('add', '.')
    await git('commit', '-m', 'feat: local divergent commit')
  },
}))

test('drift: a key file modified on the bound branch classifies WARNING', () => runDriftScenario({
  slug: 'km', branch: 'feat/km', keyFile: 'README.md', withRemote: true, expectSignal: 'key-file-modified', expectClass: 'WARNING', expectContent: /README|modif/i,
  churn: async ({ projectDir, git, branch, keyFile }) => {
    await writeFile(join(projectDir, keyFile), 'v2\n')
    await git('add', '.')
    await git('commit', '-m', 'docs: branch modifies README again')
    await git('push', 'origin', branch)
  },
}))

test('drift: a key file deleted on the bound branch classifies CRITICAL', () => runDriftScenario({
  slug: 'kd', branch: 'feat/kd', keyFile: 'README.md', withRemote: true, expectSignal: 'key-file-deleted', expectClass: 'CRITICAL', expectContent: /README|delet/i,
  churn: async ({ git, branch }) => {
    await git('rm', 'README.md')
    await git('commit', '-m', 'chore: branch deletes README')
    await git('push', 'origin', branch)
  },
}))
```

- [ ] **Step 2: Run test to verify it passes**

Run: `node --test test/e2e/drift.test.mjs`
Expected: PASS — 7 per-signal tests pass. `reconcile` returns `{drift, dispositions}` for each churned repo and classifies every producible signal per the design-faithful mapping: deleted->WARNING via branch-gone(deleted), merged->COMPLETE via branch-gone(merged), squash-merge->COMPLETE via squash-merged, force-push scenario->CRITICAL via head-missing (`force_push_detected` is always the literal `false` in v2, so the force-push rung never fires; the amend + force-push makes the recorded `first_commit` unreachable), divergence->WARNING, key-file-modified->WARNING, key-file-deleted->CRITICAL, each with grounded content referencing the branch. If a signal code or classification is missing or off-vocabulary, the failing scenario names the Plan 05 seam to reconcile (see the coupling flag).

- [ ] **Step 3: Commit**

```bash
git add test/e2e/drift.test.mjs
git commit -m "test: e2e per-signal drift classification over git fixtures"
```

---

### Task 12: E2E — branch re-attach via reconcile (trailer, slug, manual rungs)

**Files:**
- Create: `test/e2e/reattach.test.mjs`

**Interfaces:**
- Consumes: `open_thread`, `bind_branch`, `get_resume_brief`, `reconcile` (Plan 03 + Plan 05); the re-attach ladder (Plan 05 pin 7/H3: `runReconcile` scans new/renamed branches and re-attaches, dispositions include re-attach outcomes) over the `Thread-Id:` trailer, the by-slug fallback, and the manual rung (Plan 00 §6.4 / DESIGN-STATE §6.4).
- Produces: proof (H6b) that re-attach is performed BY THE PLUGIN via `reconcile` (NOT via a `git log --grep` shortcut), across THREE rungs: (1) a new branch carrying the thread's `Thread-Id:` trailer re-attaches to the thread; (2) a new branch whose NAME matches the thread slug re-attaches via the by-slug fallback; (3) a new branch with neither trailer nor slug match is LEFT ALONE for the human — `reconcile` writes no binding and emits no disposition for it (Plan 05 appends a disposition only when a rung MATCHED), and it is never silently auto-bound. The auto rungs assert the re-attach outcome inside the `reconcile` dispositions plus observable durability (the thread's brief still resolves after its first branch is deleted); the manual rung asserts ABSENCE alongside an in-scenario slug-rung control that DOES re-attach, proving the scan ran and the absence is non-vacuous. The trailer is authored directly (DISCOVERY half, Plan 05); the test does not depend on the `commit-msg` INSERTION half (Plan 04, tested there).
- **Fixture preconditions (pinned upstream behavior, both load-bearing).** (a) Plan 05's `runReconcile` derives the repo scan set SOLELY from existing bindings (`[...new Set(bindings.map((b) => b.repo))]`) — a repo with zero bindings is never scanned, so every rung establishes at least one binding first (rung 1's own `feat/first` binding; rungs 2–3 bind an incidental anchor thread to `chore/anchor`). (b) Plan 02's `observeNewBranch` finds a branch's unique first commit via `rev-list base..branch` only when the default base resolves through `refs/remotes/origin/HEAD`; with no remote it falls back to the repo ROOT commit, which carries no trailer. All three rungs therefore use `initGitRepoWithRemote` (which pushes `main` and runs `git remote set-head origin main`).
- **COUPLING FLAG (Plan 05).** The re-attach disposition field names/shape are Plan 05's. This binds tolerantly: the auto rungs assert JSON-containment of the new branch name + the thread id against the `dispositions` envelope; the manual rung asserts the unmatched branch appears NOWHERE in the `{drift, dispositions}` envelope (matched-only dispositions make binding-written and disposition-emitted equivalent, so absence proves no auto-bind). If Plan 05 exposes a dedicated re-attach tool, a fixed disposition schema, or ever emits explicit manual dispositions, tighten to a direct field assertion.

- [ ] **Step 1: Write the test**

`test/e2e/reattach.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { startLedger, callTool } from './helpers/mcp-client.mjs'
import { initGitRepoWithRemote, tempDir, cleanup } from './helpers/fixtures.mjs'

async function bindAnchor(client, git, projectDir) {
  const { thread: anchor } = await callTool(client, 'open_thread', {
    title: 'Anchor work', slug: 'anchor-work',
    completion_criteria: [{ text: 'anchors the repo scan', done: false }],
  })
  await git('checkout', '-b', 'chore/anchor')
  await writeFile(join(projectDir, 'anchor.txt'), 'a\n')
  await git('add', '.')
  await git('commit', '-m', 'chore: anchor work')
  const anchorCommit = await git('rev-parse', 'HEAD')
  await callTool(client, 'bind_branch', {
    thread_id: anchor.id, repo: projectDir, branch: 'chore/anchor',
    first_commit: anchorCommit, trailer_present: false,
  })
  await git('checkout', 'main')
  return anchor
}

test('re-attach rung 1: a new branch with the Thread-Id trailer re-attaches via reconcile', async () => {
  const repo = await initGitRepoWithRemote()
  const { dir: projectDir, git } = repo
  const dataDir = await tempDir('ledger-e2e-data-')
  const client = await startLedger({ projectDir, dataDir })
  try {
    const { thread } = await callTool(client, 'open_thread', {
      title: 'Reattachable work', slug: 'reattach-trailer',
      completion_criteria: [{ text: 'reattaches', done: false }],
    })

    await git('checkout', '-b', 'feat/first')
    await writeFile(join(projectDir, 'a.txt'), '1\n')
    await git('add', '.')
    await git('commit', '-m', `feat: first pass\n\nThread-Id: ${thread.id}`)
    const firstCommit = await git('rev-parse', 'HEAD')
    await callTool(client, 'bind_branch', {
      thread_id: thread.id, repo: projectDir, branch: 'feat/first',
      first_commit: firstCommit, trailer_present: true,
    })

    await git('checkout', 'main')
    await git('branch', '-D', 'feat/first')

    const stillThere = await callTool(client, 'get_resume_brief', { thread_id: thread.id })
    assert.ok('brief' in stillThere, 'the thread outlives its deleted branch (durability)')

    await git('checkout', '-b', 'feat/second')
    await writeFile(join(projectDir, 'b.txt'), '2\n')
    await git('add', '.')
    await git('commit', '-m', `feat: second pass\n\nThread-Id: ${thread.id}`)

    const result = await callTool(client, 'reconcile', {})
    assert.ok(Array.isArray(result.dispositions))
    const text = JSON.stringify(result.dispositions)
    assert.ok(text.includes('feat/second'), 'reconcile (the plugin) re-attaches the new trailer-bearing branch')
    assert.ok(text.includes(thread.id), 'the re-attach binds the new branch to the original thread')
  } finally {
    await client.close()
    await cleanup(projectDir, dataDir, repo.remote)
  }
})

test('re-attach rung 2: a new branch named for the slug re-attaches via the by-slug fallback', async () => {
  const repo = await initGitRepoWithRemote()
  const { dir: projectDir, git } = repo
  const dataDir = await tempDir('ledger-e2e-data-')
  const client = await startLedger({ projectDir, dataDir })
  try {
    await bindAnchor(client, git, projectDir)

    const { thread } = await callTool(client, 'open_thread', {
      title: 'Slug reattach', slug: 'payments-refactor',
      completion_criteria: [{ text: 'reattaches', done: false }],
    })

    await git('checkout', '-b', 'payments-refactor')
    await writeFile(join(projectDir, 'c.txt'), '3\n')
    await git('add', '.')
    await git('commit', '-m', 'feat: work without a trailer')

    const result = await callTool(client, 'reconcile', {})
    assert.ok(Array.isArray(result.dispositions))
    const text = JSON.stringify(result.dispositions)
    assert.ok(text.includes('payments-refactor'), 'reconcile scans the slug-named branch')
    assert.ok(text.includes(thread.id), 'the by-slug fallback re-attaches to the thread when no trailer is present')
  } finally {
    await client.close()
    await cleanup(projectDir, dataDir, repo.remote)
  }
})

test('re-attach rung 3: a branch with neither trailer nor slug match is left alone for the human', async () => {
  const repo = await initGitRepoWithRemote()
  const { dir: projectDir, git } = repo
  const dataDir = await tempDir('ledger-e2e-data-')
  const client = await startLedger({ projectDir, dataDir })
  try {
    await bindAnchor(client, git, projectDir)

    const { thread: control } = await callTool(client, 'open_thread', {
      title: 'Manual reattach control', slug: 'well-known-slug',
      completion_criteria: [{ text: 'reattaches', done: false }],
    })

    await git('checkout', '-b', 'well-known-slug')
    await writeFile(join(projectDir, 'c.txt'), '3\n')
    await git('add', '.')
    await git('commit', '-m', 'feat: control work without a trailer')
    await git('checkout', 'main')

    await git('checkout', '-b', 'feature/unrelated-name')
    await writeFile(join(projectDir, 'd.txt'), '4\n')
    await git('add', '.')
    await git('commit', '-m', 'feat: unmatchable work')

    const result = await callTool(client, 'reconcile', {})
    assert.ok(Array.isArray(result.dispositions))
    const dispositionText = JSON.stringify(result.dispositions)
    assert.ok(dispositionText.includes('well-known-slug'), 'the slug control proves the scan reached the unbound branches')
    assert.ok(dispositionText.includes(control.id), 'the control re-attaches via the by-slug fallback')
    assert.ok(!JSON.stringify(result).includes('feature/unrelated-name'), 'the unmatched branch is left alone: no binding, no disposition')
    const again = await callTool(client, 'reconcile', {})
    assert.ok(!JSON.stringify(again.dispositions).includes('feature/unrelated-name'), 'a second reconcile still leaves the unmatched branch alone')
  } finally {
    await client.close()
    await cleanup(projectDir, dataDir, repo.remote)
  }
})
```

- [ ] **Step 2: Run test to verify it passes**

Run: `node --test test/e2e/reattach.test.mjs`
Expected: PASS — 3 tests pass. The plugin's `reconcile` re-attaches across all three rungs: the trailer-bearing new branch and the slug-named new branch bind back to the thread, and the unmatched branch is left alone for the human — no binding is written and no disposition references it, while the in-scenario slug control still re-attaches (so the absence is non-vacuous). The thread's brief still resolves after its first branch is deleted.

- [ ] **Step 3: Commit**

```bash
git add test/e2e/reattach.test.mjs
git commit -m "test: e2e branch re-attach across trailer, slug, and manual rungs"
```

---

### Task 13: Full-suite green + packaging smoke

**Files:**
- Test: run only (no new artifact)

**Interfaces:**
- Consumes: everything above plus Plans 01–05.
- Produces: a single green run of the whole plugin suite and a final packaging audit — the acceptance gate for the terminal plan.

- [ ] **Step 1: Run the packaging guard end-to-end**

Run: `node -e "import('./scripts/check-packaging.mjs').then(m => m.checkPackaging(process.cwd())).then(r => { if (!r.ok) { console.error(r.problems.join('\n')); process.exit(1); } console.log('packaging OK'); })"`
Expected: `packaging OK` — every shipped file present, deps exact-pinned, `.mcp.json` forwards userConfig.

- [ ] **Step 2: Run the whole test suite**

Run: `npm test`
Expected: PASS — every unit test (Plans 01–06) and every E2E test green. Unit surface: schema/FSM/DoD/driver/index (01–05) + manifest/packaging/skills/dep-delivery (06). E2E surface: harness smoke, handoff chain (+ spine refresh, pointer clear, non-blank roster/brief), FSM+DoD (+ multi-session DoD), resume, non-git parity, per-signal drift (7 scenarios), re-attach (3 rungs).

**`npm test` must DISCOVER `test/e2e/`.** The `test` script is Plan 01-owned. It must either run bare `node --test` (recursive discovery finds `test/unit/**` AND `test/e2e/**`) or pass explicit paths that include BOTH `test/unit` and `test/e2e`. A script that lists only `test/unit` would silently skip the entire E2E surface. Task 2's `checkPackaging` now flags a `test` script that lists explicit paths omitting `test/e2e`; if Plan 01 scoped it to `test/unit`, broaden it here (one-line `package.json` edit) and re-run the guard. COUPLING FLAG: confirm against Plan 01's `package.json` at execution.

- [ ] **Step 3: Commit the run marker (if the plan tracks one) and tag readiness**

```bash
git commit --allow-empty -m "chore: continuity plugin suite green end-to-end"
```

---

## Plan 06 Self-Review

- **Spec coverage (acceptance criteria §"Acceptance criteria" of the design):**
  - Plugin built and installable (criterion 5): `.claude-plugin/plugin.json` (Task 1) + `.mcp.json` wiring (Task 2) + vendored deps (Task 3) + thin skills (Tasks 4–5) assembled and audited (Task 2 guard, Task 13). The server (`bin/ledger-server.mjs`, Plan 03), hooks (Plan 04), and `commit-msg` (Plan 04) are consumed and verified present.
  - Handoff via MCP, no hand-written files (criterion 6a): Task 8 — now also asserts the Drift #2 spine refresh (`update_thread`), the pin-1 pointer clear on `active -> paused`, and a non-blank roster/brief (H6c regression guard).
  - Resume roster + brief + STOP (criterion 6b): Task 9 (substrate, spine-only brief per DD-F) + Task 5 (present-then-STOP prose).
  - Drift classification (criterion 6c): Task 11 — seven per-signal fixtures asserting CRITICAL/WARNING/COMPLETE + grounded content (H6a), not `drift.length>0`.
  - Branch re-attach (criterion 6d): Task 12 — real re-attach BY THE PLUGIN via `reconcile` across trailer/slug/manual rungs (H6b), replacing the `git log --grep` shortcut.
  - FSM + DoD server-enforced (criterion 6e): Task 7 — includes the multi-session DoD path (DD-A: `update_thread` checks a criterion off mid-life, then `done` succeeds).
  - Non-git driver parity (criterion 6f): Task 10.
- **Phase-2 amendment bindings applied (2026-07-01):** Drift #1 (`record_decision.options` is a string array — Task 8); Drift #2 (`update_thread` spine refresh — Tasks 4/8); Drift #3 (`ledger_remote` absent — verified in Tasks 1/2); pin 1 (pointer clears on pause — Task 8); pin 2 (server env = backend+branch only, trailer/nudge to hook env — Task 2 + harness); pin 10/A4 (Cold-tier deferral — GAP #6); DD-A (`update_thread` #12 — Tasks 4/7/8); DD-F (spine-only brief — Tasks 5/9); H6a/b/c (Tasks 11/12/8); plus the LOWs (probe `cwd: ROOT`, `check-packaging` requires `bin/ledger-cli.mjs`, `skills.test` frontmatter includes `update_thread`, `npm test` discovers `test/e2e/`, `counts.resumable` pinned).
- **Thin-skill guarantee:** Tasks 4–5 assert the skills reference `mcp__ledger__*` tools and restate NO server logic (no transition matrix, no cap numbers, no schema/regex) — the server stays the sole authority (design A6/§5.5).
- **Constraint scan:** no code comments authored; markdown headings in SKILL.md are content, not code comments. No emojis (asserted in Tasks 4–5). No 4th dependency: the E2E harness uses the already-pinned MCP SDK; the packaging guard and dep-delivery script are pure-Node; Task 2 fails the build if any devDependency appears. No build/bundle step: delivery is vendored `node_modules` (Task 3).
- **Placeholder scan:** none — every task ships complete code/config and a concrete run command with expected output.
- **Boundary validation:** `checkPackaging` validates the shipped ensemble; `expectToolError` asserts the server refuses illegal input; the dep-delivery probe validates deps resolve from a clean environment.

---

## Integration Verification (Plan 06 is the de-facto integration check)

Every symbol/tool/hook/userConfig key Plan 06 references, checked against the upstream contract. **On-disk status at authoring time: only Plans 00 and 01 exist. Plans 02–05 were consumed from Plan 00's frozen contract (§"MCP tool surface", §"Hook contracts", §"StorageDriver interface", §"Repository layout") — flagged below.**

**MCP tools consumed (all pinned in Plan 00 §"MCP tool surface"; server impl is Plan 03, on-disk: NO — consumed from Plan 00):**
- `open_thread`, `bind_branch`, `append_session_event`, `record_decision`, `transition_thread`, `reconcile`, `rebuild_index`, `get_resume_brief` — CONFIRMED present in Plan 00 with the exact arg/return envelopes used here (`{thread}`, `{binding}`, `{path}`, `{number,path}`, `{thread}`, `{drift,dispositions}`, `{counts}`, `{brief}`).
- `create_successor`, `reopen`, `archive_thread` — pinned in Plan 00 but NOT exercised by Plan 06 E2E (out of the handoff/resume/drift/reattach flow); noted, not a mismatch.

**Server infrastructure consumed (Plan 03, on-disk: NO):**
- `bin/ledger-server.mjs` entrypoint + `.mcp.json` server key `ledger` launching `node ${CLAUDE_PLUGIN_ROOT}/bin/ledger-server.mjs` — CONFIRMED against Plan 00 §"Repository layout" line 31–32 and DESIGN-STATE §5.1. COUPLING FLAG: if Plan 03 named the server anything other than `ledger`, the `mcp__ledger__*` names break and Task 2's guard fails by design.
- Tool result envelope (`structuredContent` vs `content[0].text` JSON) — NOT pinned in Plan 00. ASSUMED (see ASSUMPTIONS). `callTool` handles both.
- Server reads env `CLAUDE_PROJECT_DIR`, `CLAUDE_PLUGIN_DATA`, `LEDGER_BACKEND`, `LEDGER_BRANCH` to build the `userConfig`/driver selection — the `CLAUDE_*` names are host-standard (DESIGN-STATE §9); the `LEDGER_*` names are NEW (see NEW SYMBOLS). Per Plan 00 pin 2, the `.mcp.json` SERVER `env` forwards ONLY `LEDGER_BACKEND`/`LEDGER_BRANCH`; the trailer/nudge vars (`LEDGER_DISABLE_TRAILER`, `LEDGER_NUDGE_FRACTION`, `LEDGER_NUDGE_BYTES`) are HOOK env (Plan 04), and Task 2's guard now asserts they are ABSENT from the server env. Plan 03's server may still map `LEDGER_DISABLE_TRAILER->disable_trailer` defensively (Plan 00 pin 4), but Plan 06 does not forward it to the server. COUPLING FLAG: Plan 03's server bootstrap must read `LEDGER_BACKEND`/`LEDGER_BRANCH`; Plan 04 owns forwarding the trailer/nudge vars to the hook runtime.

**Driver / core consumed (Plan 01, on-disk: YES; Plan 02 GitRefDriver on-disk: NO):**
- `selectDriver` returns a `LocalDriver` rooted at `<dataRoot>/<project-key>/ledger` — CONFIRMED in Plan 01 Task 15; Task 10 asserts exactly this path (`projectKey` = non-alphanumeric -> `-`, CONFIRMED Plan 01 Task 4).
- `GitRefDriver` selection on a git work tree with `backend = userConfig.ledger_backend` — CONFIRMED as Plan 00 line 126 + Plan 02's remit; on-disk NO. COUPLING FLAG: Tasks 11–12 assume Plan 02's git driver is active for a git `CLAUDE_PROJECT_DIR`.

**Hooks / trailer consumed (Plan 04, on-disk: NO):**
- `hooks/hooks.json`, `hooks/commit-msg` presence — CONFIRMED required by Plan 00 §"Repository layout" + §"Hook contracts"; Task 2 guard asserts both files exist. COUPLING FLAG: Plan 04 owns their content; Plan 06 only asserts presence + wiring.
- SessionStart injects `resumable.json` roster — CONFIRMED Plan 00 §"Hook contracts"; Task 5 prose relies on it; Task 9 asserts the `rebuild_index` substrate that feeds it.
- `commit-msg` inserts the `Thread-Id:` trailer — CONFIRMED Plan 00 §"Hook contracts". Task 12 authors the trailer directly to test DISCOVERY independently of INSERTION; the insertion half is Plan 04's to test.

**userConfig keys (Plan 06 owns plugin.json; upstream references in Plan 00 + DESIGN-STATE §9):**
- `ledger_backend` (default `orphan-branch`) — CONFIRMED pinned in Plan 00 (S1/S2, line 126 `userConfig.ledger_backend`) + DESIGN-STATE §9.
- `ledger_branch` (default `_ledger`) — CONFIRMED in DESIGN-STATE §9 + Plan 00 S1 ("configurable via userConfig, e.g. `_ledger`").
- `disable_trailer` — NEW (DESIGN-STATE §9 says "opt-outs" generically but does not pin this name). See NEW SYMBOLS.

**MISMATCHES / GAPS surfaced (the reconciliation payload):**
1. **Criterion-mutation tool — RESOLVED by amendment DD-A.** The frozen surface now includes `update_thread({thread_id, spine?, completion_criteria?})` (Plan 00 tool #12): it patches spine fields AND toggles `completion_criteria[].done` (match-by-text, immutable texts, flip-only), caps-enforced and terminal-refused. This closes the mid-life criterion-check gap: Task 7's new multi-session DoD test opens a thread with `done:false`, checks it off via `update_thread`, then transitions to `done`. It is also the Drift #2 linchpin — handoff (Task 4) calls `update_thread` to refresh the spine so `resumable.next_step` and the brief are non-blank. No longer a gap; now a bound, tested contract point.
2. **Re-attach entry point = `reconcile` (amendment pin 7/H3).** Plan 05's `runReconcile` scans new/renamed branches and re-attaches, with re-attach outcomes in the `dispositions` array — there is no separate re-attach tool. Task 12 now asserts a REAL re-attach performed BY THE PLUGIN via `reconcile` across all three rungs (trailer, by-slug, manual), reading the auto-rung outcomes from `dispositions` (tolerant JSON-containment, per the Task 12 coupling flag) and proving the manual rung by ABSENCE — Plan 05 appends dispositions only for MATCHED re-attaches, so the unmatched branch is left alone for the human (no binding, no disposition) rather than surfaced via a phantom manual disposition — rather than the retired `git log --grep` shortcut. If Plan 05 later exposes re-attach as a distinct tool or a fixed disposition schema, tighten to a direct field assertion.
3. **`.mcp.json` co-ownership.** Plan 00 assigns `.mcp.json` to Plan 03, but the `userConfig`->`env` forwarding is intrinsically Plan 06's (it declares the userConfig). Task 2 merges the `env` block into Plan 03's file. If Plan 03 froze `.mcp.json` without an `env` block, this is an additive edit, not a conflict. FLAGGED.
4. **Vendored-`node_modules` vs Plan 01 `.gitignore`.** Plan 01 Task 1 gitignores `node_modules/`; Task 3 removes that line so the pinned tree ships. Intentional deviation, justified by the delivery decision (offline determinism, no build step). If Plan 03 instead ships a bundle entrypoint, Task 3 is redundant and should be dropped. FLAGGED.
5. **Drift-entry classification (H6a — literal field, locked mapping).** Task 11 drives one fixture per drift scenario and asserts the named signal code with the literal `classification` field (one of CRITICAL / WARNING / COMPLETE) plus grounded content. The field name, vocabulary, and per-signal mapping are LOCKED and design-faithful to DESIGN-STATE §6.3's "reconcile, not police" durability reframe (Plan 05 sets the same mapping): CRITICAL = head-missing / force-push / key-file-deleted (the force-push rung is unreachable in v2: `force_push_detected` is always the literal `false` — decision 2026-07-01-continuity-v2-force-push-detected-false); WARNING = not-ancestor / divergence / key-file-modified / branch-gone(DELETED); COMPLETE = squash-merged / branch-gone(MERGED). The seven fixtures assert deleted->WARNING, merged->COMPLETE, squash->COMPLETE, force-push scenario->CRITICAL via head-missing (the recorded first_commit is rewritten away), divergence->WARNING, key-file-modified->WARNING, key-file-deleted->CRITICAL. Only the disposition ELEMENT shape stays Plan 05's (content asserted by JSON-containment). If Plan 05's classification or mapping diverges, the Task 11 coupling flag is the reconciliation trip-wire. Not a silent gap.

6. **Cold memory tier / `Project` entity DEFERRED (amendment A4 / pin 10).** `PROJECT.md` (the Cold tier named in SPEC §8) stays a human/skill-edited prose file OUTSIDE the MCP tool surface for v2 — no `project`/`update_project` tool, no driver method, no `Project` record, no cap. This keeps the frozen 12-tool surface intact (11 + `update_thread`). Plan 06 therefore ships NO Cold-tier packaging, manifest key, or e2e; the deferral is intentional and revisited post-v2. Consistent with Plan 00's "Open items deferred to execution."

7. **`ledger_remote` DROPPED (Drift #3).** The manifest (`.claude-plugin/plugin.json`, Task 1) and `.mcp.json` (Task 2) carry NO `ledger_remote` userConfig key or `LEDGER_REMOTE` env — the default remote is `'origin'` (`DEFAULT_REMOTE`, Plan 02). Verified absent in this plan at authoring; no scrub was required here (the residual textual refs the amendment scrubs live in Plans 00/02, not Plan 06). Do NOT reintroduce it.
