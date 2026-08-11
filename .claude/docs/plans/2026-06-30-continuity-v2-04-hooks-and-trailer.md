# Continuity v2 — Plan 04: Hooks Control Plane + Thread-Id Trailer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This is plan 4 of 6; the shared contract lives in `2026-06-30-continuity-v2-00-overview.md` and is authoritative for every schema, interface, tool name, and hook contract referenced here. Deps: **Plan 03** (the MCP tool surface + the `bin/ledger-cli.mjs` seam) and Plan 01 (utilities reused by the hooks).

**Goal:** Ship the plugin's control/lifecycle plane. Wire six Claude Code hook events (`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, `PreCompact`) through `hooks/hooks.json` to dependency-free Node entry scripts that emit the correct CC hook JSON (verified §5.4 protocol). Ship the idempotent `commit-msg` `Thread-Id:` trailer inserter and a non-destructive `core.hooksPath` auto-installer that chains every standard hook name through a per-name DISPATCHER (so a Husky/pre-commit repo keeps its secret-scan/lint/test and pre-push), fails OPEN if the managed dir is missing, and uninstalls cleanly. Every hook FAILS SAFE — a hook error never bricks the user's session.

**Architecture:** Hooks are NOT the model, so they cannot call `mcp__ledger__*` tools. Every hook that needs ledger data or mutation shells out to a single seam — `bin/ledger-cli.mjs` (owned by Plan 03; the same tool functions the MCP server exposes, invoked one-shot over a CLI transport so the server code stays the sole ledger reader/writer). All decision logic lives in small pure modules under `hooks/lib/` (unit-tested directly); the six entry scripts are thin fail-safe wrappers (spawn-tested end-to-end with a stubbed CLI). The `commit-msg` hook is a portable POSIX-sh script (no Node start-up per commit) that resolves the active Thread's ULID from the `<git-common-dir>/ledger/active-thread` pointer (resolved via `git rev-parse --git-common-dir`, matching the Plan 03 writer), inserts the trailer via `git interpret-trailers` (idempotent, amend/rebase/cherry-pick safe) unless `continuity.trailer=false`, and chains to any pre-existing `commit-msg`. Redirecting `core.hooksPath` chains rather than clobbers: the managed dir holds the `commit-msg` trailer script plus a generic POSIX-sh `dispatcher` copied under every OTHER standard hook name, which execs the same-named hook from the prior hooks location (`continuity.priorHooksPath`; default `<git-common-dir>/hooks`) — so a repo's existing `pre-commit`/`pre-push` keep running. Hooks reuse Plan 01 utilities (`projectKey`, `atomicWriteFile`, `serializeRecord`, `git`/`isGitWorkTree`) by relative import — `hooks/` and `src/` ship in the same package.

**Tech Stack:** Node.js >= 20 (ESM `.mjs`), `node --test`, no runtime deps in the hooks (the three package deps are unused here). `commit-msg` is `/bin/sh`. Plain JS, no TypeScript, no build step.

## Global Constraints (verbatim from Plan 00 — apply to EVERY task)

- Runtime: Node.js >= 20, ES modules only (`.mjs`); `commit-msg` is POSIX `/bin/sh`. No TypeScript. No build step.
- Tests: Node's built-in runner only — `node --test`. No jest/vitest/mocha.
- Dependencies: no new dependency is added by this plan; hooks are dependency-free. A 4th dependency requires a plan amendment.
- No code comments anywhere (shebang / tooling-pragma / codegen-marker carve-outs only). No emojis. No AI attribution in commits.
- Immutability; small focused files (200–400 lines typical, 800 hard max). Comprehensive error handling; validate at every boundary; never silently swallow errors — EXCEPT the deliberate, documented fail-safe: a hook catches its own errors, degrades, and exits 0 so it cannot trap the user's session.
- Atomic writes for any file a hook persists (`atomicWriteFile` from Plan 01).
- Storage is reached ONLY through the driver/CLI seam. No hook hard-codes a git write to the ledger; the `commit-msg` hook writes only the commit-message file it is handed.
- Commit cadence: one logical change per commit; Conventional Commits (`feat:`/`fix:`/`test:`/`refactor:`/`chore:`).

## Context to read first

- `2026-06-30-continuity-v2-00-overview.md` — "Hook contracts (Plan 04)", the MCP tool surface, repo layout, env vars.
- `2026-06-30-continuity-v2-03-mcp-server.md` — the tool implementations and the `bin/ledger-cli.mjs` seam this plan invokes. **If Plan 03 is not yet on disk at execution time, this plan pins the exact CLI subcommand contract it needs (Task 2 + Downstream contract) — treat those as the coupling to reconcile against Plan 03.**
- `docs/session-continuity-redesign/DESIGN-STATE.md` §5.3 (trailer + auto-install), §5.4 (verified hook JSON protocol — the capability table), §6.4 (re-attach), §7.8 (Resumption Brief), §8 (memory tiers / ~70% compaction nudge), §9 (packaging), §11 (the `core.hooksPath` clobber open question).
- `2026-06-30-continuity-redesign-v2-design.md` — approved spec (A5 trailer, A6 thin skills, enforcement planes).

## Verified CC hook JSON protocol (DESIGN-STATE §5.4; re-confirmed against code.claude.com/docs/en/hooks.md)

- Every hook reads a JSON object on stdin (`session_id`, `transcript_path`, `cwd`, `hook_event_name`, plus event-specific fields) and may write a JSON object on stdout.
- Exit 0 → stdout JSON is parsed and applied. Exit 2 → blocking; stderr is the reason; stdout ignored. Any other code → non-blocking; logged.
- SessionStart (cannot block): `{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"..."}}`; stdin adds `source`.
- UserPromptSubmit (can block): inject via `{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"..."}}`; block via top-level `{"decision":"block","reason":"..."}`; stdin adds `prompt`. 30s timeout.
- PreToolUse (can block): `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow|deny|ask","permissionDecisionReason":"..."}}`; stdin adds `tool_name`, `tool_input`.
- PostToolUse: `{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"..."}}` or `{"decision":"block","reason":"..."}`; stdin adds `tool_name`, `tool_input`, `tool_output`.
- Stop (can block, exit 2): stdin adds `stop_hook_active` (true when a Stop hook is already active — never re-block). Block via exit 2 + stderr reason.
- PreCompact (cannot usefully block): stdin adds `trigger` (`manual|auto`), `custom_instructions`.
- Common output fields: `continue`, `stopReason`, `suppressOutput`, `systemMessage`.

## File Structure (this plan creates)

- `hooks/lib/hook-io.mjs` — stdin read + parse + emit + `runHook` fail-safe harness.
- `hooks/lib/cli.mjs` — the `bin/ledger-cli.mjs` seam (`cliCommand`, `runCli`, `runCliJson`).
- `hooks/lib/resume-intent.mjs` — `isResumeIntent(prompt)`.
- `hooks/lib/roster.mjs` — `formatRoster`, `sessionStartContext`, `userPromptContext`.
- `hooks/lib/ledger-roots.mjs` — `ledgerRoots`, `isUnderRoot`, `pathIsProtected`.
- `hooks/lib/pre-tool-decision.mjs` — `decidePreToolUse`.
- `hooks/lib/nudge.mjs` — context-fraction proxy + `nudgeContext`.
- `hooks/lib/commit-detect.mjs` — `isCommitishCommand` (gates `record-sha` to commit-ish Bash).
- `hooks/lib/stop-decision.mjs` — `stopDecision`.
- `hooks/lib/checkpoint.mjs` — `buildCheckpoint`.
- `hooks/lib/install-commit-msg.mjs` — `installCommitMsgHook`, `uninstallCommitMsgHook`.
- `hooks/commit-msg` — POSIX-sh `Thread-Id:` trailer inserter (executable).
- `hooks/dispatcher` — POSIX-sh generic hook dispatcher: execs the same-named prior hook, exit 0 when absent (executable; copied under every standard hook name by the installer).
- `hooks/session-start.mjs`, `hooks/user-prompt-submit.mjs`, `hooks/pre-tool-use.mjs`, `hooks/post-tool-use.mjs`, `hooks/stop.mjs`, `hooks/pre-compact.mjs` — the six entry scripts (executable).
- `hooks/hooks.json` — the control plane.
- `test/unit/*.test.mjs` — one test file per module above.

---

### Task 1: Fail-safe hook IO harness

**Files:**
- Create: `hooks/lib/hook-io.mjs`
- Test: `test/unit/hook-io.test.mjs`

**Interfaces:**
- Consumes: `node:process`.
- Produces: `readStdin(): Promise<string>`, `parseHookInput(text): object` (throws on non-object JSON; returns `{}` for empty), `emit(output): void` (writes `JSON.stringify+"\n"`; no-op on null/undefined), `runHook(main): Promise<void>` (reads+parses stdin, awaits `main(input)`, emits its return, exit 0; on ANY throw writes a diagnostic to stderr and STILL exits 0 — the fail-safe guarantee for every non-blocking hook).

- [ ] **Step 1: Write the failing test**

`test/unit/hook-io.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseHookInput } from '../../hooks/lib/hook-io.mjs'

test('parseHookInput returns the object for valid JSON', () => {
  assert.deepEqual(parseHookInput('{"a":1}'), { a: 1 })
})

test('parseHookInput returns {} for empty or whitespace input', () => {
  assert.deepEqual(parseHookInput(''), {})
  assert.deepEqual(parseHookInput('   \n'), {})
})

test('parseHookInput rejects non-object JSON and malformed JSON', () => {
  assert.throws(() => parseHookInput('[1,2]'), /must be a JSON object/)
  assert.throws(() => parseHookInput('42'), /must be a JSON object/)
  assert.throws(() => parseHookInput('{bad'), /invalid hook input JSON/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/hook-io.test.mjs`
Expected: FAIL — cannot import from `../../hooks/lib/hook-io.mjs` (module not found).

- [ ] **Step 3: Write the implementation**

`hooks/lib/hook-io.mjs`:

```js
import process from 'node:process'

export async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export function parseHookInput(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    return {}
  }
  let value
  try {
    value = JSON.parse(text)
  } catch (err) {
    throw new Error(`invalid hook input JSON: ${err.message}`)
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('hook input must be a JSON object')
  }
  return value
}

export function emit(output) {
  if (output === undefined || output === null) {
    return
  }
  process.stdout.write(`${JSON.stringify(output)}\n`)
}

export async function runHook(main) {
  try {
    const input = parseHookInput(await readStdin())
    emit(await main(input))
    process.exitCode = 0
  } catch (err) {
    process.stderr.write(`continuity hook error (degraded, allowing session): ${err?.message ?? err}\n`)
    process.exitCode = 0
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/hook-io.test.mjs`
Expected: PASS — 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add hooks/lib/hook-io.mjs test/unit/hook-io.test.mjs
git commit -m "feat: add fail-safe hook IO harness"
```

---

### Task 2: Ledger CLI seam

**Files:**
- Create: `hooks/lib/cli.mjs`
- Test: `test/unit/cli.test.mjs`

**Interfaces:**
- Consumes: `node:child_process`, `node:util`.
- Produces: `cliCommand(env?): string[]` (resolves the `LEDGER_CLI` env override verbatim, else `[process.execPath, '${CLAUDE_PLUGIN_ROOT}/bin/ledger-cli.mjs']` — the packaged Node binary, never a bare `'node'` off PATH), `runCli(args, opts?): Promise<string>` (spawns via `execFile`; rejects on non-zero/timeout), `runCliJson(args, opts?): Promise<any>` (parses stdout JSON; `null` on empty). **This is the coupling to Plan 03.** The subcommands the hooks call (per Plan 00's control-plane surface): `roster` → `resumable.json` array `[{id,slug,title,status,next_step}]`; `reconcile` → `{drift:[...],dispositions:[...]}`; `active-thread` → `{thread_id: <ulid>|null}`; `record-sha <sha>` → `{}` (first_commit set-once; PostToolUse gates it to commit-ish operations); `sync` → `{synced, ...}` (drives `driver.sync()`; SessionStart pulls, Stop/handoff pushes). There is NO `has-handoff` subcommand — the Stop gate reads `active-thread` instead (Plan 00 pin 1). `LEDGER_CLI` exists so tests (and any adapter) can inject a stub CLI.

- [ ] **Step 1: Write the failing test**

`test/unit/cli.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm, chmod } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { cliCommand, runCliJson, runCli } from '../../hooks/lib/cli.mjs'

test('cliCommand honors LEDGER_CLI and falls back to CLAUDE_PLUGIN_ROOT', () => {
  assert.deepEqual(cliCommand({ LEDGER_CLI: 'node /x/cli.mjs' }), ['node', '/x/cli.mjs'])
  assert.deepEqual(cliCommand({ CLAUDE_PLUGIN_ROOT: '/root' }), [process.execPath, '/root/bin/ledger-cli.mjs'])
  assert.throws(() => cliCommand({}), /LEDGER_CLI or CLAUDE_PLUGIN_ROOT/)
})

async function fakeCli(body) {
  const dir = await mkdtemp(join(tmpdir(), 'ledger-cli-'))
  const path = join(dir, 'fake.mjs')
  await writeFile(path, body)
  await chmod(path, 0o755)
  return { dir, path }
}

test('runCliJson parses stdout JSON from the stub CLI', async () => {
  const { dir, path } = await fakeCli(
    'process.stdout.write(JSON.stringify({ ok: process.argv.slice(2) }))\n',
  )
  const env = { ...process.env, LEDGER_CLI: `${process.execPath} ${path}` }
  assert.deepEqual(await runCliJson(['roster'], { env }), { ok: ['roster'] })
  await rm(dir, { recursive: true, force: true })
})

test('runCli rejects when the CLI exits non-zero', async () => {
  const { dir, path } = await fakeCli('process.exit(3)\n')
  const env = { ...process.env, LEDGER_CLI: `${process.execPath} ${path}` }
  await assert.rejects(() => runCli(['reconcile'], { env }))
  await rm(dir, { recursive: true, force: true })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/cli.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`hooks/lib/cli.mjs`:

```js
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import process from 'node:process'

const execFileAsync = promisify(execFile)

export function cliCommand(env = process.env) {
  const override = env.LEDGER_CLI
  if (typeof override === 'string' && override.trim() !== '') {
    return override.trim().split(/\s+/)
  }
  const root = env.CLAUDE_PLUGIN_ROOT
  if (typeof root !== 'string' || root.trim() === '') {
    throw new Error('cliCommand requires LEDGER_CLI or CLAUDE_PLUGIN_ROOT')
  }
  return [process.execPath, `${root}/bin/ledger-cli.mjs`]
}

export async function runCli(args, opts = {}) {
  if (!Array.isArray(args) || args.some((a) => typeof a !== 'string')) {
    throw new Error('runCli requires an array of string arguments')
  }
  const env = opts.env ?? process.env
  const [cmd, ...prefix] = cliCommand(env)
  const { stdout } = await execFileAsync(cmd, [...prefix, ...args], {
    cwd: opts.cwd,
    env,
    timeout: opts.timeout ?? 15000,
    maxBuffer: 8 * 1024 * 1024,
  })
  return stdout.toString()
}

export async function runCliJson(args, opts = {}) {
  const out = (await runCli(args, opts)).trim()
  if (out === '') {
    return null
  }
  return JSON.parse(out)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/cli.test.mjs`
Expected: PASS — 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add hooks/lib/cli.mjs test/unit/cli.test.mjs
git commit -m "feat: add ledger-cli seam for hooks"
```

---

### Task 3: Resume-intent detection

**Files:**
- Create: `hooks/lib/resume-intent.mjs`
- Test: `test/unit/resume-intent.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `isResumeIntent(prompt): boolean` — true when the user's prompt reads as resume intent (continue / resume / pick up where we left off / `/resume-project`). Drives the UserPromptSubmit roster injection.

- [ ] **Step 1: Write the failing test**

`test/unit/resume-intent.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isResumeIntent } from '../../hooks/lib/resume-intent.mjs'

test('detects resume intent across phrasings', () => {
  for (const p of [
    'continue',
    'Resume the work',
    'pick up where we left off',
    'lets pick up where I left off please',
    '/resume-project continuity-v2',
    'Can we continue from yesterday?',
  ]) {
    assert.equal(isResumeIntent(p), true, p)
  }
})

test('does not fire on unrelated prompts, new-work phrasings, or empty input', () => {
  for (const p of [
    'build a new login form',
    'what does this function do?',
    'continue building the form',
    'resume writing the parser',
    'continue adding tests',
    '',
    null,
  ]) {
    assert.equal(isResumeIntent(p), false, String(p))
  }
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/resume-intent.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`hooks/lib/resume-intent.mjs`:

```js
const EXPLICIT = [
  /pick (?:this |the |it )?back up\b/i,
  /pick up where (?:we|i) left off/i,
  /where (?:we|i) left off/i,
  /\/resume-project\b/i,
]

const RESUME_VERB = /\b(?:resume|continue)\b/i
const NEW_WORK_AFTER = /\b(?:resume|continue)\s+(?:a\s+new\b|the\s+new\b|building|adding|creating|writing|implementing|making|developing|refactoring|fixing|working\s+on)\b/i

export function isResumeIntent(prompt) {
  if (typeof prompt !== 'string' || prompt.trim() === '') {
    return false
  }
  if (EXPLICIT.some((re) => re.test(prompt))) {
    return true
  }
  return RESUME_VERB.test(prompt) && !NEW_WORK_AFTER.test(prompt)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/resume-intent.test.mjs`
Expected: PASS — 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add hooks/lib/resume-intent.mjs test/unit/resume-intent.test.mjs
git commit -m "feat: add resume-intent detection"
```

---

### Task 4: Roster injection shapes

**Files:**
- Create: `hooks/lib/roster.mjs`
- Test: `test/unit/roster.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `formatRoster(resumable): string` (human-readable roster from the `resumable.json` array; friendly empty message), `sessionStartContext(resumable, driftText?): object` (exact SessionStart injection JSON, drift appended when present), `userPromptContext(resumable): object` (exact UserPromptSubmit injection JSON). Emits the verified `hookSpecificOutput.hookEventName` + `additionalContext` shape.

- [ ] **Step 1: Write the failing test**

`test/unit/roster.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatRoster, sessionStartContext, userPromptContext } from '../../hooks/lib/roster.mjs'

const ROSTER = [
  { id: '01ARZ3NDEKTSV4RRFFQ69G5FAV', slug: 'fix-x', title: 'Fix X', status: 'paused', next_step: 'write the test' },
]

test('formatRoster lists threads and handles the empty case', () => {
  const text = formatRoster(ROSTER)
  assert.match(text, /fix-x/)
  assert.match(text, /01ARZ3NDEKTSV4RRFFQ69G5FAV/)
  assert.match(text, /paused/)
  assert.match(text, /write the test/)
  assert.match(formatRoster([]), /No resumable threads/)
})

test('sessionStartContext emits the verified SessionStart shape and appends drift', () => {
  const out = sessionStartContext(ROSTER, 'head SHA missing on fix/x')
  assert.equal(out.hookSpecificOutput.hookEventName, 'SessionStart')
  assert.match(out.hookSpecificOutput.additionalContext, /fix-x/)
  assert.match(out.hookSpecificOutput.additionalContext, /Drift on resume/)
  assert.match(out.hookSpecificOutput.additionalContext, /head SHA missing/)
  const noDrift = sessionStartContext(ROSTER, '')
  assert.doesNotMatch(noDrift.hookSpecificOutput.additionalContext, /Drift on resume/)
})

test('userPromptContext emits the verified UserPromptSubmit shape', () => {
  const out = userPromptContext(ROSTER)
  assert.equal(out.hookSpecificOutput.hookEventName, 'UserPromptSubmit')
  assert.match(out.hookSpecificOutput.additionalContext, /fix-x/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/roster.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`hooks/lib/roster.mjs`:

```js
export function formatRoster(resumable) {
  const rows = Array.isArray(resumable) ? resumable : []
  if (rows.length === 0) {
    return 'No resumable threads. Start fresh, or open a new thread with mcp__ledger__open_thread.'
  }
  const lines = rows.map((t) => {
    const status = String(t.status ?? '')
    const slug = String(t.slug ?? '')
    const title = String(t.title ?? '')
    const next = String(t.next_step ?? '').trim()
    const tail = next === '' ? '' : ` -- next: ${next}`
    return `- [${status}] ${slug} (${t.id}): ${title}${tail}`
  })
  return ['Resumable threads (run resume-project to load one):', ...lines].join('\n')
}

export function sessionStartContext(resumable, driftText) {
  const parts = [formatRoster(resumable)]
  if (typeof driftText === 'string' && driftText.trim() !== '') {
    parts.push('', 'Drift on resume:', driftText.trim())
  }
  return {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: parts.join('\n'),
    },
  }
}

export function userPromptContext(resumable) {
  return {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: formatRoster(resumable),
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/roster.test.mjs`
Expected: PASS — 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add hooks/lib/roster.mjs test/unit/roster.test.mjs
git commit -m "feat: add roster injection context builders"
```

---

### Task 5: Ledger-root resolution + path protection

**Files:**
- Create: `hooks/lib/ledger-roots.mjs`
- Test: `test/unit/ledger-roots.test.mjs`

**Interfaces:**
- Consumes: `node:path`, Plan 01 `projectKey` (`../../src/util/project-key.mjs`).
- Produces: `ledgerRoots(projectDir, env?): string[]` (the absolute subtrees a raw write must never touch: the per-project plugin data subtree `${CLAUDE_PLUGIN_DATA}/<project-key>` — which covers the non-git local store, the git ledger worktree, the managed githooks dir, and checkpoints — plus the defensive in-repo `<projectDir>/.claude/ledger` and `<projectDir>/.git/ledger`), `isUnderRoot(target, root): boolean`, `pathIsProtected(target, roots): boolean`. Protecting the whole per-project data subtree deliberately avoids coupling to Plan 02's exact worktree directory name.

- [ ] **Step 1: Write the failing test**

`test/unit/ledger-roots.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { ledgerRoots, isUnderRoot, pathIsProtected } from '../../hooks/lib/ledger-roots.mjs'
import { projectKey } from '../../src/util/project-key.mjs'

test('isUnderRoot matches the root itself and descendants only', () => {
  assert.equal(isUnderRoot('/data/proj/ledger/threads/a.json', '/data/proj'), true)
  assert.equal(isUnderRoot('/data/proj', '/data/proj'), true)
  assert.equal(isUnderRoot('/data/project-other/x', '/data/proj'), false)
  assert.equal(isUnderRoot('/elsewhere/x', '/data/proj'), false)
})

test('ledgerRoots includes the per-project data subtree and in-repo defensive roots', () => {
  const roots = ledgerRoots('/Users/dev/proj', { CLAUDE_PLUGIN_DATA: '/data' })
  assert.ok(roots.includes(join('/data', projectKey('/Users/dev/proj'))))
  assert.ok(roots.includes('/Users/dev/proj/.claude/ledger'))
  assert.ok(roots.includes('/Users/dev/proj/.git/ledger'))
})

test('pathIsProtected flags ledger writes and passes unrelated paths', () => {
  const roots = ledgerRoots('/Users/dev/proj', { CLAUDE_PLUGIN_DATA: '/data' })
  const key = projectKey('/Users/dev/proj')
  assert.equal(pathIsProtected(join('/data', key, 'ledger', 'threads', 'x.json'), roots), true)
  assert.equal(pathIsProtected('/Users/dev/proj/src/app.js', roots), false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/ledger-roots.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`hooks/lib/ledger-roots.mjs`:

```js
import { join, resolve, sep } from 'node:path'
import process from 'node:process'
import { projectKey } from '../../src/util/project-key.mjs'

export function ledgerRoots(projectDir, env = process.env) {
  const roots = []
  if (typeof projectDir !== 'string' || projectDir.trim() === '') {
    return roots
  }
  const abs = resolve(projectDir)
  const dataRoot = env.CLAUDE_PLUGIN_DATA
  if (typeof dataRoot === 'string' && dataRoot.trim() !== '') {
    roots.push(resolve(join(dataRoot, projectKey(abs))))
  }
  roots.push(resolve(join(abs, '.claude', 'ledger')))
  roots.push(resolve(join(abs, '.git', 'ledger')))
  return roots
}

export function isUnderRoot(target, root) {
  if (typeof target !== 'string' || typeof root !== 'string' || target === '' || root === '') {
    return false
  }
  const t = resolve(target)
  const r = resolve(root)
  return t === r || t.startsWith(r + sep)
}

export function pathIsProtected(target, roots) {
  return Array.isArray(roots) && roots.some((r) => isUnderRoot(target, r))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/ledger-roots.test.mjs`
Expected: PASS — 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add hooks/lib/ledger-roots.mjs test/unit/ledger-roots.test.mjs
git commit -m "feat: add ledger-root resolution and path protection"
```

---

### Task 6: PreToolUse decision core

**Files:**
- Create: `hooks/lib/pre-tool-decision.mjs`
- Test: `test/unit/pre-tool-decision.test.mjs`

**Interfaces:**
- Consumes: `pathIsProtected` (Task 5).
- Produces: `decidePreToolUse(toolName, toolInput, roots): {permissionDecision, permissionDecisionReason} | null`. Rules: `mcp__ledger__*` → `allow` (auto-approve the sanctioned write surface); a `Write|Edit|MultiEdit|NotebookEdit` whose target path is under a ledger root → `deny`; a `Bash` command that BOTH references a ledger-root path AND contains a mutating construct → `deny`; everything else → `null` (no opinion; the hook emits nothing and CC's normal permission flow applies). Reads are never denied. The Bash rule is conservative defense-in-depth — the MCP server, not this heuristic, is the correctness guarantee.

- [ ] **Step 1: Write the failing test**

`test/unit/pre-tool-decision.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decidePreToolUse } from '../../hooks/lib/pre-tool-decision.mjs'

const ROOTS = ['/data/proj']

test('auto-approves ledger MCP tools', () => {
  const d = decidePreToolUse('mcp__ledger__transition_thread', { thread_id: 'x' }, ROOTS)
  assert.equal(d.permissionDecision, 'allow')
})

test('denies raw edits to ledger paths, passes edits elsewhere', () => {
  assert.equal(
    decidePreToolUse('Write', { file_path: '/data/proj/ledger/threads/a.json' }, ROOTS).permissionDecision,
    'deny',
  )
  assert.equal(decidePreToolUse('Edit', { file_path: '/data/proj/src/app.js' }, ROOTS), null)
})

test('denies mutating Bash into a ledger path, passes reads and unrelated writes', () => {
  assert.equal(
    decidePreToolUse('Bash', { command: 'echo x > /data/proj/ledger/threads/a.json' }, ROOTS).permissionDecision,
    'deny',
  )
  assert.equal(decidePreToolUse('Bash', { command: 'cat /data/proj/ledger/threads/a.json' }, ROOTS), null)
  assert.equal(decidePreToolUse('Bash', { command: 'echo hi > /tmp/other' }, ROOTS), null)
})

test('has no opinion on unrelated tools or missing input', () => {
  assert.equal(decidePreToolUse('Read', { file_path: '/data/proj/ledger/x' }, ROOTS), null)
  assert.equal(decidePreToolUse('', {}, ROOTS), null)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/pre-tool-decision.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`hooks/lib/pre-tool-decision.mjs`:

```js
import { pathIsProtected } from './ledger-roots.mjs'

const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])
const MUTATING_BASH = /(?:^|[\s;&|(])(?:rm|mv|cp|tee|truncate|dd|install)\s|>>?|\bsed\s+-i|\bgit\s+(?:add|commit|apply|checkout|restore|rm|mv|clean|reset|stash|worktree|push|fetch|pull)\b/
const LEDGER_TOOL_PREFIX = 'mcp__ledger__'
const DENY_REASON = 'Raw writes to the ledger are forbidden; the ledger MCP tools (mcp__ledger__*) are its only write surface.'

function allow(reason) {
  return { permissionDecision: 'allow', permissionDecisionReason: reason }
}

function deny(reason) {
  return { permissionDecision: 'deny', permissionDecisionReason: reason }
}

function collectPaths(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') {
    return []
  }
  const out = []
  for (const key of ['file_path', 'path', 'notebook_path']) {
    const v = toolInput[key]
    if (typeof v === 'string' && v !== '') {
      out.push(v)
    }
  }
  return out
}

export function decidePreToolUse(toolName, toolInput, roots) {
  if (typeof toolName !== 'string' || toolName === '') {
    return null
  }
  if (toolName.startsWith(LEDGER_TOOL_PREFIX)) {
    return allow('Ledger MCP tools are the sanctioned, schema-validated ledger write surface.')
  }
  if (WRITE_TOOLS.has(toolName)) {
    return collectPaths(toolInput).some((p) => pathIsProtected(p, roots)) ? deny(DENY_REASON) : null
  }
  if (toolName === 'Bash') {
    const command = toolInput && typeof toolInput.command === 'string' ? toolInput.command : ''
    if (command === '' || !MUTATING_BASH.test(command)) {
      return null
    }
    const list = Array.isArray(roots) ? roots : []
    const referencesLedger = list.some((r) => typeof r === 'string' && r !== '' && command.includes(r))
    return referencesLedger ? deny(DENY_REASON) : null
  }
  return null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/pre-tool-decision.test.mjs`
Expected: PASS — 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add hooks/lib/pre-tool-decision.mjs test/unit/pre-tool-decision.test.mjs
git commit -m "feat: add PreToolUse deny/allow decision core"
```

---

### Task 7: Context-nudge core

**Files:**
- Create: `hooks/lib/nudge.mjs`
- Test: `test/unit/nudge.test.mjs`

**Interfaces:**
- Consumes: `node:fs`.
- Produces: `nudgeFraction(env?): number` (default 0.7; override `LEDGER_NUDGE_FRACTION`), `transcriptBytes(path): number` (size of the transcript file; 0 on miss), `shouldNudge(bytes, budgetBytes, fraction): boolean` (byte-size proxy for the ~70% compaction threshold — CC does not expose context% to hooks), `nudgeContext(): object` (the PostToolUse `additionalContext` recommending `session-handoff`). Budget default 1_200_000 bytes; override `LEDGER_NUDGE_BYTES`. Both knobs are read at runtime by PostToolUse from its own `process.env` (Plan 00 pin 2).

- [ ] **Step 1: Write the failing test**

`test/unit/nudge.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { nudgeFraction, transcriptBytes, shouldNudge, nudgeContext } from '../../hooks/lib/nudge.mjs'

test('nudgeFraction defaults to 0.7 and honors a valid override', () => {
  assert.equal(nudgeFraction({}), 0.7)
  assert.equal(nudgeFraction({ LEDGER_NUDGE_FRACTION: '0.5' }), 0.5)
  assert.equal(nudgeFraction({ LEDGER_NUDGE_FRACTION: 'nonsense' }), 0.7)
  assert.equal(nudgeFraction({ LEDGER_NUDGE_FRACTION: '2' }), 0.7)
})

test('shouldNudge fires at or above budget*fraction', () => {
  assert.equal(shouldNudge(700, 1000, 0.7), true)
  assert.equal(shouldNudge(699, 1000, 0.7), false)
  assert.equal(shouldNudge(0, 1000, 0.7), false)
})

test('transcriptBytes returns file size and 0 on a missing path', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ledger-nudge-'))
  const f = join(dir, 't.jsonl')
  await writeFile(f, 'x'.repeat(42))
  assert.equal(transcriptBytes(f), 42)
  assert.equal(transcriptBytes(join(dir, 'nope')), 0)
  assert.equal(transcriptBytes(''), 0)
  await rm(dir, { recursive: true, force: true })
})

test('nudgeContext emits the verified PostToolUse shape', () => {
  const out = nudgeContext()
  assert.equal(out.hookSpecificOutput.hookEventName, 'PostToolUse')
  assert.match(out.hookSpecificOutput.additionalContext, /session-handoff/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/nudge.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`hooks/lib/nudge.mjs`:

```js
import { statSync } from 'node:fs'
import process from 'node:process'

const DEFAULT_FRACTION = 0.7
const DEFAULT_BUDGET_BYTES = 1_200_000

export function nudgeFraction(env = process.env) {
  const raw = Number(env.LEDGER_NUDGE_FRACTION)
  return Number.isFinite(raw) && raw > 0 && raw < 1 ? raw : DEFAULT_FRACTION
}

export function nudgeBudgetBytes(env = process.env) {
  const raw = Number(env.LEDGER_NUDGE_BYTES)
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_BUDGET_BYTES
}

export function transcriptBytes(transcriptPath) {
  if (typeof transcriptPath !== 'string' || transcriptPath === '') {
    return 0
  }
  try {
    return statSync(transcriptPath).size
  } catch {
    return 0
  }
}

export function shouldNudge(bytes, budgetBytes, fraction) {
  const budget = Number.isFinite(budgetBytes) && budgetBytes > 0 ? budgetBytes : DEFAULT_BUDGET_BYTES
  const frac = Number.isFinite(fraction) && fraction > 0 && fraction < 1 ? fraction : DEFAULT_FRACTION
  return bytes >= budget * frac
}

export function nudgeContext() {
  return {
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: 'Context is near the compaction threshold (~70%). Run the session-handoff skill to checkpoint this thread (session log + spine refresh + state transition via the ledger MCP tools) before compaction.',
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/nudge.test.mjs`
Expected: PASS — 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add hooks/lib/nudge.mjs test/unit/nudge.test.mjs
git commit -m "feat: add context-nudge proxy core"
```

---

### Task 8: Stop-gate decision core

**Files:**
- Create: `hooks/lib/stop-decision.mjs`
- Test: `test/unit/stop-decision.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `stopDecision({activeThreadId, stopHookActive}): {block: boolean, reason?: string}`. Blocks WHILE the active-thread pointer is non-empty and `stopHookActive` is not already set (loop guard). An empty pointer → allow (a handed-off thread cleared it via `active->paused`); re-entry → allow. This is Plan 00 pin 1: the pointer IS the handoff signal, so there is no `has-handoff` input (that subcommand is dropped).

- [ ] **Step 1: Write the failing test**

`test/unit/stop-decision.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stopDecision } from '../../hooks/lib/stop-decision.mjs'

const T = '01ARZ3NDEKTSV4RRFFQ69G5FAV'

test('blocks while the active-thread pointer is non-empty', () => {
  const d = stopDecision({ activeThreadId: T, stopHookActive: false })
  assert.equal(d.block, true)
  assert.match(d.reason, /session-handoff/)
})

test('allows on an empty pointer or on re-entry', () => {
  assert.equal(stopDecision({ activeThreadId: '', stopHookActive: false }).block, false)
  assert.equal(stopDecision({ activeThreadId: T, stopHookActive: true }).block, false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/stop-decision.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`hooks/lib/stop-decision.mjs`:

```js
export function stopDecision({ activeThreadId, stopHookActive } = {}) {
  if (stopHookActive === true) {
    return { block: false }
  }
  if (typeof activeThreadId !== 'string' || activeThreadId === '') {
    return { block: false }
  }
  return {
    block: true,
    reason: `Thread ${activeThreadId} is still active (the active-thread pointer is set). Run the session-handoff skill (it refreshes the spine, writes the session log, and transitions the thread active->paused via the ledger MCP tools, which clears the pointer) before ending, or explicitly park/abandon the thread with mcp__ledger__transition_thread.`,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/stop-decision.test.mjs`
Expected: PASS — 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add hooks/lib/stop-decision.mjs test/unit/stop-decision.test.mjs
git commit -m "feat: add Stop-gate decision core"
```

---

### Task 9: PreCompact checkpoint builder

**Files:**
- Create: `hooks/lib/checkpoint.mjs`
- Test: `test/unit/checkpoint.test.mjs`

**Interfaces:**
- Consumes: `node:path`, Plan 01 `projectKey`.
- Produces: `buildCheckpoint(input, env?): {path, record}` — computes the sentinel path `${CLAUDE_PLUGIN_DATA}/<project-key>/checkpoints/<safe-ts>--<session_id>.json` and the record `{kind:'precompact-checkpoint', session_id, trigger, transcript_path, created_at}`. Throws if `CLAUDE_PLUGIN_DATA` or `projectDir` is missing (the caller's `runHook` fail-safe turns that into a no-op exit 0). The hook writes it via Plan 01 `atomicWriteFile` + `serializeRecord`.

- [ ] **Step 1: Write the failing test**

`test/unit/checkpoint.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { buildCheckpoint } from '../../hooks/lib/checkpoint.mjs'
import { projectKey } from '../../src/util/project-key.mjs'

test('buildCheckpoint composes the sentinel path and record', () => {
  const { path, record } = buildCheckpoint(
    { projectDir: '/Users/dev/proj', sessionId: 'abc', trigger: 'auto', transcriptPath: '/t.jsonl', now: '2026-06-30T10:00:00.500Z' },
    { CLAUDE_PLUGIN_DATA: '/data' },
  )
  assert.equal(path, join('/data', projectKey('/Users/dev/proj'), 'checkpoints', '2026-06-30T10-00-00-500Z--abc.json'))
  assert.equal(record.kind, 'precompact-checkpoint')
  assert.equal(record.session_id, 'abc')
  assert.equal(record.trigger, 'auto')
  assert.equal(record.transcript_path, '/t.jsonl')
  assert.equal(record.created_at, '2026-06-30T10:00:00.500Z')
})

test('buildCheckpoint validates required inputs', () => {
  assert.throws(() => buildCheckpoint({ projectDir: '/p' }, {}), /CLAUDE_PLUGIN_DATA/)
  assert.throws(() => buildCheckpoint({}, { CLAUDE_PLUGIN_DATA: '/data' }), /projectDir/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/checkpoint.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`hooks/lib/checkpoint.mjs`:

```js
import { join, resolve } from 'node:path'
import process from 'node:process'
import { projectKey } from '../../src/util/project-key.mjs'

export function buildCheckpoint(input = {}, env = process.env) {
  const dataRoot = env.CLAUDE_PLUGIN_DATA
  if (typeof dataRoot !== 'string' || dataRoot.trim() === '') {
    throw new Error('buildCheckpoint requires CLAUDE_PLUGIN_DATA')
  }
  if (typeof input.projectDir !== 'string' || input.projectDir.trim() === '') {
    throw new Error('buildCheckpoint requires projectDir')
  }
  const now = typeof input.now === 'string' && input.now !== '' ? input.now : new Date().toISOString()
  const sessionId = typeof input.sessionId === 'string' && input.sessionId !== '' ? input.sessionId : 'unknown'
  const safeTs = now.replace(/[:.]/g, '-')
  const path = join(dataRoot, projectKey(resolve(input.projectDir)), 'checkpoints', `${safeTs}--${sessionId}.json`)
  const record = {
    kind: 'precompact-checkpoint',
    session_id: sessionId,
    trigger: typeof input.trigger === 'string' && input.trigger !== '' ? input.trigger : 'unknown',
    transcript_path: typeof input.transcriptPath === 'string' && input.transcriptPath !== '' ? input.transcriptPath : null,
    created_at: now,
  }
  return { path, record }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/checkpoint.test.mjs`
Expected: PASS — 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add hooks/lib/checkpoint.mjs test/unit/checkpoint.test.mjs
git commit -m "feat: add PreCompact checkpoint builder"
```

---

### Task 10: commit-msg Thread-Id trailer script

**Files:**
- Create: `hooks/commit-msg` (executable POSIX sh)
- Test: `test/unit/commit-msg.test.mjs`

**Interfaces:**
- Consumes: `git`, `git interpret-trailers`; the active-thread pointer file `<git-common-dir>/ledger/active-thread` (single-line ULID, resolved via `git rev-parse --git-common-dir` to match the Plan 03 writer so linked worktrees/submodules share one pointer; written by the MCP server on `bind_branch`/active transition — Plan 03/05); env override `LEDGER_THREAD_ID`; git config `continuity.trailer` (bool opt-out) and `continuity.priorHooksPath` (chain target).
- Produces: an idempotent commit-msg hook. Thread-Id resolution order: `LEDGER_THREAD_ID` → `<git-common-dir>/ledger/active-thread` → no-op. Inserts `Thread-Id: <ulid>` via `git interpret-trailers --if-exists doNothing` (present already → unchanged; amend/rebase/cherry-pick safe). Its own insertion is best-effort (never fails a commit); it then `exec`s any prior hook (`continuity.priorHooksPath/commit-msg`, else the default `<git-common-dir>/hooks/commit-msg`) so pre-existing policy hooks keep their exit code.

- [ ] **Step 1: Write the failing test**

`test/unit/commit-msg.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, writeFile, readFile, mkdir, rm, chmod } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFile)
const HOOK = resolve(fileURLToPath(new URL('../../hooks/commit-msg', import.meta.url)))
const ULID = '01ARZ3NDEKTSV4RRFFQ69G5FAV'

async function repo() {
  const dir = await mkdtemp(join(tmpdir(), 'ledger-cm-'))
  await execFileAsync('git', ['init'], { cwd: dir })
  return dir
}

async function runHook(dir, msgFile, env = {}) {
  return execFileAsync('sh', [HOOK, msgFile], { cwd: dir, env: { ...process.env, ...env } })
}

test('inserts the trailer once and is idempotent across repeated runs', async () => {
  const dir = await repo()
  await mkdir(join(dir, '.git', 'ledger'), { recursive: true })
  await writeFile(join(dir, '.git', 'ledger', 'active-thread'), `${ULID}\n`)
  const msg = join(dir, 'MSG')
  await writeFile(msg, 'feat: do a thing\n')
  await runHook(dir, msg)
  await runHook(dir, msg)
  const body = await readFile(msg, 'utf8')
  assert.equal(body.match(/Thread-Id:/g).length, 1)
  assert.match(body, new RegExp(`Thread-Id: ${ULID}`))
  await rm(dir, { recursive: true, force: true })
})

test('LEDGER_THREAD_ID overrides and opt-out disables insertion', async () => {
  const dir = await repo()
  const msg = join(dir, 'MSG')
  await writeFile(msg, 'fix: y\n')
  await runHook(dir, msg, { LEDGER_THREAD_ID: ULID })
  assert.match(await readFile(msg, 'utf8'), new RegExp(`Thread-Id: ${ULID}`))
  await execFileAsync('git', ['config', 'continuity.trailer', 'false'], { cwd: dir })
  const msg2 = join(dir, 'MSG2')
  await writeFile(msg2, 'fix: z\n')
  await runHook(dir, msg2, { LEDGER_THREAD_ID: ULID })
  assert.doesNotMatch(await readFile(msg2, 'utf8'), /Thread-Id:/)
  await rm(dir, { recursive: true, force: true })
})

test('no pointer and no override is a clean no-op', async () => {
  const dir = await repo()
  const msg = join(dir, 'MSG')
  await writeFile(msg, 'chore: nothing\n')
  await runHook(dir, msg)
  assert.doesNotMatch(await readFile(msg, 'utf8'), /Thread-Id:/)
  await rm(dir, { recursive: true, force: true })
})

test('chains to a prior hooks-path commit-msg and propagates it', async () => {
  const dir = await repo()
  const prior = join(dir, 'prior-hooks')
  await mkdir(prior, { recursive: true })
  const priorHook = join(prior, 'commit-msg')
  await writeFile(priorHook, '#!/bin/sh\nprintf "CHAINED\\n" >> "$1"\nexit 0\n')
  await chmod(priorHook, 0o755)
  await execFileAsync('git', ['config', 'continuity.priorHooksPath', prior], { cwd: dir })
  const msg = join(dir, 'MSG')
  await writeFile(msg, 'feat: chained\n')
  await runHook(dir, msg, { LEDGER_THREAD_ID: ULID })
  const body = await readFile(msg, 'utf8')
  assert.match(body, new RegExp(`Thread-Id: ${ULID}`))
  assert.match(body, /CHAINED/)
  await rm(dir, { recursive: true, force: true })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/commit-msg.test.mjs`
Expected: FAIL — `hooks/commit-msg` does not exist (ENOENT from `sh`).

- [ ] **Step 3: Write the implementation**

`hooks/commit-msg`:

```sh
#!/bin/sh

MSG_FILE="$1"
[ -n "${MSG_FILE:-}" ] || exit 0
[ -f "$MSG_FILE" ] || exit 0

common_dir="$(git rev-parse --git-common-dir 2>/dev/null || printf '')"

is_ulid() {
  printf '%s' "$1" | grep -Eq '^[0-9A-HJKMNP-TV-Z]{26}$'
}

resolve_thread_id() {
  if [ -n "${LEDGER_THREAD_ID:-}" ]; then
    printf '%s' "$LEDGER_THREAD_ID"
    return 0
  fi
  if [ -n "$common_dir" ] && [ -f "$common_dir/ledger/active-thread" ]; then
    head -n 1 "$common_dir/ledger/active-thread" | tr -d ' \t\r\n'
    return 0
  fi
  printf ''
}

enabled="$(git config --bool --get continuity.trailer 2>/dev/null || printf 'true')"
if [ "$enabled" != "false" ]; then
  tid="$(resolve_thread_id)"
  if [ -n "$tid" ] && is_ulid "$tid"; then
    git interpret-trailers --if-exists doNothing \
      --trailer "Thread-Id: $tid" --in-place "$MSG_FILE" 2>/dev/null || true
  fi
fi

prior_dir="$(git config --get continuity.priorHooksPath 2>/dev/null || printf '')"
if [ -z "$prior_dir" ] && [ -n "$common_dir" ]; then
  prior_dir="$common_dir/hooks"
fi
if [ -n "$prior_dir" ] && [ -x "$prior_dir/commit-msg" ]; then
  exec "$prior_dir/commit-msg" "$@"
fi
exit 0
```

Make it executable:

```bash
chmod +x hooks/commit-msg
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/commit-msg.test.mjs`
Expected: PASS — 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add hooks/commit-msg test/unit/commit-msg.test.mjs
git update-index --chmod=+x hooks/commit-msg
git commit -m "feat: add idempotent Thread-Id commit-msg trailer hook"
```

---

### Task 11: managed-hooks installer (multi-hook dispatcher + fail-open)

**Files:**
- Create: `hooks/lib/install-commit-msg.mjs`
- Create: `hooks/dispatcher` (executable POSIX sh)
- Test: `test/unit/install-commit-msg.test.mjs`

**Interfaces:**
- Consumes: Plan 01 `git` (`../../src/util/git-exec.mjs`), `node:fs/promises`, `node:path`.
- Produces: `installCommitMsgHook({repoDir, managedDir, sourceHook, disableTrailer?}): Promise<{installed, ...}>` and `uninstallCommitMsgHook({repoDir, managedDir}): Promise<{removed, ...}>`. NEVER edits `.git/hooks/` directly. On install it ALWAYS (re)populates `managedDir`: copies `sourceHook` to `managedDir/commit-msg` AND copies the sibling `hooks/dispatcher` under EVERY OTHER standard hook name — the multi-hook DISPATCHER (Plan 00 C2). This re-copy is unconditional, so a plugin upgrade never leaves a stale `commit-msg`/dispatcher (Plan 00 LOW). On the FIRST install it records the prior `core.hooksPath` into `continuity.priorHooksPath` (empty string encodes "default was in effect" → the dispatcher resolves `<git-common-dir>/hooks`) and points `core.hooksPath` at `managedDir`; on reinstall (`core.hooksPath` already equals `managedDir`) it refreshes the copies but leaves the config keys untouched and returns `alreadyInstalled:true` (never overwriting `continuity.priorHooksPath` with `managedDir`, which would make dispatchers exec themselves). `disableTrailer:true` (from `LEDGER_DISABLE_TRAILER="true"`) additionally writes git config `continuity.trailer=false` so the runtime `commit-msg` no-ops the trailer while the dispatcher chain still runs (Plan 00 pin 2); it never writes `continuity.trailer=true`, so a manual opt-out is never silently re-enabled. Refuses (no-op, `installed:false`) on git < 2.9. Existing hooks are preserved by CHAINING at runtime (Task 10 + dispatcher), not clobbered — a Husky/pre-commit repo keeps its secret-scan/lint/test and pre-push. FAIL-OPEN: the managed dir lives in persistent plugin DATA and SessionStart re-installs (self-heals) it every session, and every dispatcher/commit-msg exits 0 when a prior hook is absent — so `core.hooksPath` never dangles, and a missing managed dir degrades to git running no hooks (commits still succeed), never a hard block. Uninstall restores the prior value (or unsets to the default) and clears the bookkeeping key BEFORE anything is removed; it never deletes user hooks.

- [ ] **Step 1: Write the failing test**

`test/unit/install-commit-msg.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, mkdir, writeFile, readFile, rm, stat, chmod } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { installCommitMsgHook, uninstallCommitMsgHook } from '../../hooks/lib/install-commit-msg.mjs'

const execFileAsync = promisify(execFile)
const HOOKS_DIR = resolve(fileURLToPath(new URL('../../hooks', import.meta.url)))

async function fixture() {
  const base = await mkdtemp(join(tmpdir(), 'ledger-inst-'))
  const repo = join(base, 'repo')
  await execFileAsync('git', ['init', repo])
  const source = join(HOOKS_DIR, 'commit-msg')
  const managed = join(base, 'managed')
  return { base, repo, source, managed }
}

async function cfg(repo, key) {
  try {
    return (await execFileAsync('git', ['config', '--local', '--get', key], { cwd: repo })).stdout.trim()
  } catch {
    return ''
  }
}

test('installs the dispatcher set + commit-msg and records default-was-in-effect', async () => {
  const f = await fixture()
  const r = await installCommitMsgHook({ repoDir: f.repo, managedDir: f.managed, sourceHook: f.source })
  assert.equal(r.installed, true)
  assert.equal(await cfg(f.repo, 'core.hooksPath'), f.managed)
  assert.equal(await cfg(f.repo, 'continuity.priorHooksPath'), '')
  assert.ok((await stat(join(f.managed, 'commit-msg'))).isFile())
  assert.ok((await stat(join(f.managed, 'pre-commit'))).isFile())
  assert.ok((await stat(join(f.managed, 'pre-push'))).isFile())
  await rm(f.base, { recursive: true, force: true })
})

test('chains an existing hooksPath without clobbering it, and is idempotent', async () => {
  const f = await fixture()
  await execFileAsync('git', ['config', '--local', 'core.hooksPath', '/existing/husky'], { cwd: f.repo })
  const first = await installCommitMsgHook({ repoDir: f.repo, managedDir: f.managed, sourceHook: f.source })
  assert.equal(first.chainedFrom, '/existing/husky')
  assert.equal(await cfg(f.repo, 'continuity.priorHooksPath'), '/existing/husky')
  assert.equal(await cfg(f.repo, 'core.hooksPath'), f.managed)
  const second = await installCommitMsgHook({ repoDir: f.repo, managedDir: f.managed, sourceHook: f.source })
  assert.equal(second.alreadyInstalled, true)
  assert.equal(await cfg(f.repo, 'continuity.priorHooksPath'), '/existing/husky')
  await rm(f.base, { recursive: true, force: true })
})

test('always re-copies commit-msg on reinstall (no stale copy on upgrade)', async () => {
  const f = await fixture()
  await installCommitMsgHook({ repoDir: f.repo, managedDir: f.managed, sourceHook: f.source })
  await writeFile(join(f.managed, 'commit-msg'), 'STALE\n')
  await installCommitMsgHook({ repoDir: f.repo, managedDir: f.managed, sourceHook: f.source })
  assert.doesNotMatch(await readFile(join(f.managed, 'commit-msg'), 'utf8'), /STALE/)
  await rm(f.base, { recursive: true, force: true })
})

test('a dispatcher execs the same-named prior hook (pre-commit chains)', async () => {
  const f = await fixture()
  const prior = join(f.base, 'prior-hooks')
  await mkdir(prior, { recursive: true })
  const sentinel = join(f.base, 'ran')
  const preCommit = join(prior, 'pre-commit')
  await writeFile(preCommit, `#!/bin/sh\ntouch "${sentinel}"\nexit 0\n`)
  await chmod(preCommit, 0o755)
  await execFileAsync('git', ['config', '--local', 'core.hooksPath', prior], { cwd: f.repo })
  await installCommitMsgHook({ repoDir: f.repo, managedDir: f.managed, sourceHook: f.source })
  await execFileAsync('sh', [join(f.managed, 'pre-commit')], { cwd: f.repo })
  assert.ok((await stat(sentinel)).isFile())
  await rm(f.base, { recursive: true, force: true })
})

test('uninstall restores the prior hooksPath, or unsets it for the default', async () => {
  const f = await fixture()
  await installCommitMsgHook({ repoDir: f.repo, managedDir: f.managed, sourceHook: f.source })
  const back = await uninstallCommitMsgHook({ repoDir: f.repo, managedDir: f.managed })
  assert.equal(back.removed, true)
  assert.equal(await cfg(f.repo, 'core.hooksPath'), '')

  await execFileAsync('git', ['config', '--local', 'core.hooksPath', '/existing/husky'], { cwd: f.repo })
  await installCommitMsgHook({ repoDir: f.repo, managedDir: f.managed, sourceHook: f.source })
  await uninstallCommitMsgHook({ repoDir: f.repo, managedDir: f.managed })
  assert.equal(await cfg(f.repo, 'core.hooksPath'), '/existing/husky')
  await rm(f.base, { recursive: true, force: true })
})

test('disableTrailer installs the chain but suppresses the trailer via continuity.trailer=false', async () => {
  const f = await fixture()
  const r = await installCommitMsgHook({ repoDir: f.repo, managedDir: f.managed, sourceHook: f.source, disableTrailer: true })
  assert.equal(r.installed, true)
  assert.equal(await cfg(f.repo, 'core.hooksPath'), f.managed)
  assert.equal(await cfg(f.repo, 'continuity.trailer'), 'false')
  await rm(f.base, { recursive: true, force: true })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/install-commit-msg.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`hooks/lib/install-commit-msg.mjs`:

```js
import { mkdir, copyFile, chmod } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { git } from '../../src/util/git-exec.mjs'

const STANDARD_HOOKS = [
  'applypatch-msg', 'pre-applypatch', 'post-applypatch',
  'pre-commit', 'pre-merge-commit', 'prepare-commit-msg',
  'post-commit', 'pre-rebase', 'post-checkout', 'post-merge',
  'pre-push', 'post-rewrite', 'pre-auto-gc', 'push-to-checkout',
  'post-index-change', 'sendemail-validate', 'reference-transaction',
]

async function getConfig(repoDir, key) {
  try {
    return (await git(['config', '--local', '--get', key], { cwd: repoDir })).trim()
  } catch {
    return ''
  }
}

async function supportsHooksPath(repoDir) {
  try {
    const out = await git(['--version'], { cwd: repoDir })
    const m = out.match(/(\d+)\.(\d+)/)
    if (!m) {
      return true
    }
    const major = Number(m[1])
    const minor = Number(m[2])
    return major > 2 || (major === 2 && minor >= 9)
  } catch {
    return false
  }
}

async function writeManagedHooks(managedDir, sourceHook) {
  const dispatcherSrc = join(dirname(sourceHook), 'dispatcher')
  await mkdir(managedDir, { recursive: true })
  const commitMsg = join(managedDir, 'commit-msg')
  await copyFile(sourceHook, commitMsg)
  await chmod(commitMsg, 0o755)
  for (const name of STANDARD_HOOKS) {
    const target = join(managedDir, name)
    await copyFile(dispatcherSrc, target)
    await chmod(target, 0o755)
  }
}

export async function installCommitMsgHook({ repoDir, managedDir, sourceHook, disableTrailer = false }) {
  if (!(await supportsHooksPath(repoDir))) {
    return { installed: false, reason: 'git<2.9' }
  }
  const prior = await getConfig(repoDir, 'core.hooksPath')
  const already = prior === managedDir
  await writeManagedHooks(managedDir, sourceHook)
  if (!already) {
    await git(['config', '--local', 'continuity.priorHooksPath', prior], { cwd: repoDir })
    await git(['config', '--local', 'core.hooksPath', managedDir], { cwd: repoDir })
  }
  if (disableTrailer) {
    await git(['config', '--local', 'continuity.trailer', 'false'], { cwd: repoDir })
  }
  return already
    ? { installed: true, alreadyInstalled: true }
    : { installed: true, chainedFrom: prior === '' ? null : prior }
}

export async function uninstallCommitMsgHook({ repoDir, managedDir }) {
  const current = await getConfig(repoDir, 'core.hooksPath')
  if (current !== managedDir) {
    return { removed: false, reason: 'not-managed' }
  }
  const prior = await getConfig(repoDir, 'continuity.priorHooksPath')
  if (prior !== '') {
    await git(['config', '--local', 'core.hooksPath', prior], { cwd: repoDir })
  } else {
    await git(['config', '--local', '--unset', 'core.hooksPath'], { cwd: repoDir }).catch(() => {})
  }
  await git(['config', '--local', '--unset', 'continuity.priorHooksPath'], { cwd: repoDir }).catch(() => {})
  return { removed: true, restoredTo: prior === '' ? null : prior }
}
```

`hooks/dispatcher` — the generic shim copied under every standard hook name (except `commit-msg`). It resolves its own hook name from `$0`, finds the prior hooks location (`continuity.priorHooksPath`; empty → `<git-common-dir>/hooks`), and execs the same-named prior hook so it keeps its exit code; absent → exit 0 (fail-open):

```sh
#!/bin/sh

hook_name="$(basename "$0")"
[ -n "${hook_name:-}" ] || exit 0

common_dir="$(git rev-parse --git-common-dir 2>/dev/null || printf '')"
prior_dir="$(git config --get continuity.priorHooksPath 2>/dev/null || printf '')"
if [ -z "$prior_dir" ] && [ -n "$common_dir" ]; then
  prior_dir="$common_dir/hooks"
fi

if [ -n "$prior_dir" ] && [ -x "$prior_dir/$hook_name" ]; then
  exec "$prior_dir/$hook_name" "$@"
fi
exit 0
```

Make it executable:

```bash
chmod +x hooks/dispatcher
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/install-commit-msg.test.mjs`
Expected: PASS — 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add hooks/lib/install-commit-msg.mjs hooks/dispatcher test/unit/install-commit-msg.test.mjs
git update-index --chmod=+x hooks/dispatcher
git commit -m "feat: add managed-hooks installer with multi-hook dispatcher and fail-open"
```

---

### Task 12: SessionStart + UserPromptSubmit entry scripts

**Files:**
- Create: `hooks/session-start.mjs`, `hooks/user-prompt-submit.mjs` (executable)
- Test: `test/unit/session-start.test.mjs`, `test/unit/user-prompt-submit.test.mjs`

**Interfaces:**
- Consumes: `runHook` (T1), `runCliJson` (T2), roster builders (T4), `isResumeIntent` (T3), `installCommitMsgHook` (T11), Plan 01 `isGitWorkTree`/`projectKey`.
- Produces: `session-start.mjs` — for a git project ensures the managed hooks dir (dispatcher chain + commit-msg trailer) is installed (fail-open; `disableTrailer` from `LEDGER_DISABLE_TRAILER="true"`), runs `sync` (fetch/merge = pull) BEFORE `reconcile`, then `roster` via the CLI seam (each fail-open), and emits the SessionStart roster+drift context (Plan 00 M4). `user-prompt-submit.mjs` — injects the roster context only when `isResumeIntent(prompt)`; never blocks; emits nothing otherwise. Both are wrapped by `runHook` (always exit 0).

- [ ] **Step 1: Write the failing tests**

`test/unit/session-start.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, writeFile, rm, chmod } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const SCRIPT = resolve(fileURLToPath(new URL('../../hooks/session-start.mjs', import.meta.url)))

function runScript(script, stdinObj, env) {
  return new Promise((resolvePromise) => {
    const child = execFile(process.execPath, [script], { env: { ...process.env, ...env } }, (err, stdout, stderr) => {
      resolvePromise({ code: err && typeof err.code === 'number' ? err.code : 0, stdout, stderr })
    })
    child.stdin.end(JSON.stringify(stdinObj))
  })
}

async function stubCli(body) {
  const dir = await mkdtemp(join(tmpdir(), 'ledger-ss-'))
  const path = join(dir, 'cli.mjs')
  await writeFile(path, body)
  await chmod(path, 0o755)
  return { dir, cli: `${process.execPath} ${path}` }
}

const ROSTER_STUB = `
const cmd = process.argv[2]
if (cmd === 'roster') process.stdout.write(JSON.stringify([{ id: '01ARZ3NDEKTSV4RRFFQ69G5FAV', slug: 'fix-x', title: 'Fix X', status: 'paused', next_step: 'do it' }]))
else if (cmd === 'reconcile') process.stdout.write(JSON.stringify({ drift: [{ signal: 'head-missing', detail: 'on fix/x' }], dispositions: [] }))
else process.stdout.write('{}')
`

test('SessionStart emits roster + drift context (non-git project skips install)', async () => {
  const { dir, cli } = await stubCli(ROSTER_STUB)
  const proj = await mkdtemp(join(tmpdir(), 'ledger-proj-'))
  const res = await runScript(SCRIPT, { cwd: proj, source: 'startup' }, { CLAUDE_PROJECT_DIR: proj, LEDGER_CLI: cli })
  assert.equal(res.code, 0)
  const out = JSON.parse(res.stdout)
  assert.equal(out.hookSpecificOutput.hookEventName, 'SessionStart')
  assert.match(out.hookSpecificOutput.additionalContext, /fix-x/)
  assert.match(out.hookSpecificOutput.additionalContext, /Drift on resume/)
  await rm(dir, { recursive: true, force: true })
  await rm(proj, { recursive: true, force: true })
})

test('SessionStart fails open to an empty roster when the CLI errors', async () => {
  const { dir, cli } = await stubCli('process.exit(4)\n')
  const proj = await mkdtemp(join(tmpdir(), 'ledger-proj-'))
  const res = await runScript(SCRIPT, { cwd: proj }, { CLAUDE_PROJECT_DIR: proj, LEDGER_CLI: cli })
  assert.equal(res.code, 0)
  assert.match(JSON.parse(res.stdout).hookSpecificOutput.additionalContext, /No resumable threads/)
  await rm(dir, { recursive: true, force: true })
  await rm(proj, { recursive: true, force: true })
})
```

`test/unit/user-prompt-submit.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, writeFile, rm, chmod } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const SCRIPT = resolve(fileURLToPath(new URL('../../hooks/user-prompt-submit.mjs', import.meta.url)))

function runScript(stdinObj, env) {
  return new Promise((resolvePromise) => {
    const child = execFile(process.execPath, [SCRIPT], { env: { ...process.env, ...env } }, (err, stdout, stderr) => {
      resolvePromise({ code: err && typeof err.code === 'number' ? err.code : 0, stdout, stderr })
    })
    child.stdin.end(JSON.stringify(stdinObj))
  })
}

async function stubCli() {
  const dir = await mkdtemp(join(tmpdir(), 'ledger-ups-'))
  const path = join(dir, 'cli.mjs')
  await writeFile(path, "process.stdout.write(JSON.stringify([{ id: '01ARZ3NDEKTSV4RRFFQ69G5FAV', slug: 'fix-x', title: 'Fix X', status: 'paused', next_step: 'do it' }]))\n")
  await chmod(path, 0o755)
  return { dir, cli: `${process.execPath} ${path}` }
}

test('injects the roster on resume intent', async () => {
  const { dir, cli } = await stubCli()
  const res = await runScript({ prompt: 'continue where we left off', cwd: process.cwd() }, { CLAUDE_PROJECT_DIR: process.cwd(), LEDGER_CLI: cli })
  assert.equal(res.code, 0)
  assert.equal(JSON.parse(res.stdout).hookSpecificOutput.hookEventName, 'UserPromptSubmit')
  assert.match(JSON.parse(res.stdout).hookSpecificOutput.additionalContext, /fix-x/)
  await rm(dir, { recursive: true, force: true })
})

test('emits nothing on a non-resume prompt', async () => {
  const { dir, cli } = await stubCli()
  const res = await runScript({ prompt: 'add a new endpoint' }, { CLAUDE_PROJECT_DIR: process.cwd(), LEDGER_CLI: cli })
  assert.equal(res.code, 0)
  assert.equal(res.stdout.trim(), '')
  await rm(dir, { recursive: true, force: true })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/unit/session-start.test.mjs test/unit/user-prompt-submit.test.mjs`
Expected: FAIL — the hook scripts do not exist yet.

- [ ] **Step 3: Write the implementations**

`hooks/session-start.mjs`:

```js
#!/usr/bin/env node
import { join } from 'node:path'
import process from 'node:process'
import { runHook } from './lib/hook-io.mjs'
import { runCli, runCliJson } from './lib/cli.mjs'
import { sessionStartContext } from './lib/roster.mjs'
import { installCommitMsgHook } from './lib/install-commit-msg.mjs'
import { isGitWorkTree } from '../src/util/git-exec.mjs'
import { projectKey } from '../src/util/project-key.mjs'

async function ensureTrailerInstall(projectDir, env) {
  try {
    if (!(await isGitWorkTree(projectDir))) {
      return
    }
    const dataRoot = env.CLAUDE_PLUGIN_DATA
    const root = env.CLAUDE_PLUGIN_ROOT
    if (!dataRoot || !root) {
      return
    }
    const managedDir = join(dataRoot, projectKey(projectDir), 'githooks')
    const sourceHook = join(root, 'hooks', 'commit-msg')
    const disableTrailer = env.LEDGER_DISABLE_TRAILER === 'true'
    await installCommitMsgHook({ repoDir: projectDir, managedDir, sourceHook, disableTrailer })
  } catch {
    return
  }
}

async function pullLedger(projectDir, env) {
  try {
    await runCli(['sync'], { cwd: projectDir, env })
  } catch {
    return
  }
}

async function loadRoster(projectDir, env) {
  try {
    return (await runCliJson(['roster'], { cwd: projectDir, env })) ?? []
  } catch {
    return []
  }
}

async function loadDrift(projectDir, env) {
  try {
    const result = await runCliJson(['reconcile'], { cwd: projectDir, env })
    const drift = result && Array.isArray(result.drift) ? result.drift : []
    return drift.map((d) => `- ${d.signal ?? d.kind ?? 'signal'}: ${d.detail ?? ''}`.trimEnd()).join('\n')
  } catch {
    return ''
  }
}

runHook(async (input) => {
  const env = process.env
  const projectDir = env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd()
  await ensureTrailerInstall(projectDir, env)
  await pullLedger(projectDir, env)
  const drift = await loadDrift(projectDir, env)
  const roster = await loadRoster(projectDir, env)
  return sessionStartContext(roster, drift)
})
```

`hooks/user-prompt-submit.mjs`:

```js
#!/usr/bin/env node
import process from 'node:process'
import { runHook } from './lib/hook-io.mjs'
import { runCliJson } from './lib/cli.mjs'
import { isResumeIntent } from './lib/resume-intent.mjs'
import { userPromptContext } from './lib/roster.mjs'

runHook(async (input) => {
  if (!isResumeIntent(input.prompt)) {
    return null
  }
  const env = process.env
  const projectDir = env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd()
  let roster = []
  try {
    roster = (await runCliJson(['roster'], { cwd: projectDir, env })) ?? []
  } catch {
    roster = []
  }
  return userPromptContext(roster)
})
```

Make both executable:

```bash
chmod +x hooks/session-start.mjs hooks/user-prompt-submit.mjs
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/unit/session-start.test.mjs test/unit/user-prompt-submit.test.mjs`
Expected: PASS — 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add hooks/session-start.mjs hooks/user-prompt-submit.mjs test/unit/session-start.test.mjs test/unit/user-prompt-submit.test.mjs
git update-index --chmod=+x hooks/session-start.mjs hooks/user-prompt-submit.mjs
git commit -m "feat: add SessionStart and UserPromptSubmit hooks"
```

---

### Task 13: PreToolUse + PostToolUse entry scripts

**Files:**
- Create: `hooks/lib/commit-detect.mjs`, `hooks/pre-tool-use.mjs`, `hooks/post-tool-use.mjs` (entry scripts executable)
- Test: `test/unit/commit-detect.test.mjs`, `test/unit/pre-tool-use.test.mjs`, `test/unit/post-tool-use.test.mjs`

**Interfaces:**
- Consumes: `runHook` (T1), `decidePreToolUse` (T6), `ledgerRoots` (T5), nudge core (T7), `runCli` (T2), `isCommitishCommand` (this task), Plan 01 `isGitWorkTree`/`git`.
- Produces: `isCommitishCommand(toolName, toolInput): boolean` (true only for a `Bash` command that creates/moves commits — `git commit|merge|cherry-pick|revert|am|rebase|pull`). `pre-tool-use.mjs` — resolves ledger roots and emits the verified PreToolUse `permissionDecision` JSON (allow ledger tools; deny raw ledger writes; else nothing). `post-tool-use.mjs` — records the current HEAD SHA to the active binding via CLI `record-sha` ONLY on a commit-ish Bash command (Plan 00 M11 — gating avoids a per-edit commit storm on the ledger; `record-sha` writes `first_commit` set-once), then emits the `session-handoff` nudge when the transcript-size proxy crosses the threshold; else nothing. Both fail-open.

- [ ] **Step 1: Write the failing tests**

`test/unit/commit-detect.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isCommitishCommand } from '../../hooks/lib/commit-detect.mjs'

test('fires only on commit-creating Bash commands', () => {
  for (const c of ['git commit -m x', 'git commit --amend', 'git merge feat', 'git cherry-pick abc', 'git rebase --continue', 'git pull']) {
    assert.equal(isCommitishCommand('Bash', { command: c }), true, c)
  }
})

test('does not fire on edits, reads, or non-commit git commands', () => {
  assert.equal(isCommitishCommand('Write', { file_path: '/x' }), false)
  assert.equal(isCommitishCommand('Edit', { file_path: '/x' }), false)
  assert.equal(isCommitishCommand('Bash', { command: 'git status' }), false)
  assert.equal(isCommitishCommand('Bash', { command: 'echo hi > /tmp/x' }), false)
  assert.equal(isCommitishCommand('Bash', {}), false)
  assert.equal(isCommitishCommand('', {}), false)
})
```

`test/unit/pre-tool-use.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const SCRIPT = resolve(fileURLToPath(new URL('../../hooks/pre-tool-use.mjs', import.meta.url)))

function runScript(stdinObj, env) {
  return new Promise((resolvePromise) => {
    const child = execFile(process.execPath, [SCRIPT], { env: { ...process.env, ...env } }, (err, stdout) => {
      resolvePromise({ code: err && typeof err.code === 'number' ? err.code : 0, stdout })
    })
    child.stdin.end(JSON.stringify(stdinObj))
  })
}

test('allows ledger MCP tools', async () => {
  const res = await runScript({ tool_name: 'mcp__ledger__open_thread', tool_input: {} }, { CLAUDE_PROJECT_DIR: '/proj', CLAUDE_PLUGIN_DATA: '/data' })
  assert.equal(JSON.parse(res.stdout).hookSpecificOutput.permissionDecision, 'allow')
})

test('denies a raw Write into the ledger subtree', async () => {
  const target = join('/data', '-proj', 'ledger', 'threads', 'a.json')
  const res = await runScript({ tool_name: 'Write', tool_input: { file_path: target } }, { CLAUDE_PROJECT_DIR: '/proj', CLAUDE_PLUGIN_DATA: '/data' })
  assert.equal(JSON.parse(res.stdout).hookSpecificOutput.permissionDecision, 'deny')
})

test('emits nothing for an unrelated write', async () => {
  const res = await runScript({ tool_name: 'Write', tool_input: { file_path: '/proj/src/app.js' } }, { CLAUDE_PROJECT_DIR: '/proj', CLAUDE_PLUGIN_DATA: '/data' })
  assert.equal(res.stdout.trim(), '')
})
```

`test/unit/post-tool-use.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const SCRIPT = resolve(fileURLToPath(new URL('../../hooks/post-tool-use.mjs', import.meta.url)))

function runScript(stdinObj, env) {
  return new Promise((resolvePromise) => {
    const child = execFile(process.execPath, [SCRIPT], { env: { ...process.env, ...env } }, (err, stdout) => {
      resolvePromise({ code: err && typeof err.code === 'number' ? err.code : 0, stdout })
    })
    child.stdin.end(JSON.stringify(stdinObj))
  })
}

test('nudges when the transcript proxy crosses the threshold', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ledger-ptu-'))
  const proj = await mkdtemp(join(tmpdir(), 'ledger-proj-'))
  const transcript = join(dir, 't.jsonl')
  await writeFile(transcript, 'x'.repeat(1000))
  const res = await runScript(
    { tool_name: 'Write', tool_input: {}, transcript_path: transcript, cwd: proj },
    { CLAUDE_PROJECT_DIR: proj, LEDGER_NUDGE_BYTES: '1000', LEDGER_NUDGE_FRACTION: '0.5' },
  )
  assert.equal(res.code, 0)
  assert.match(JSON.parse(res.stdout).hookSpecificOutput.additionalContext, /session-handoff/)
  await rm(dir, { recursive: true, force: true })
  await rm(proj, { recursive: true, force: true })
})

test('emits nothing below the threshold', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ledger-ptu-'))
  const proj = await mkdtemp(join(tmpdir(), 'ledger-proj-'))
  const transcript = join(dir, 't.jsonl')
  await writeFile(transcript, 'x'.repeat(10))
  const res = await runScript(
    { tool_name: 'Write', tool_input: {}, transcript_path: transcript, cwd: proj },
    { CLAUDE_PROJECT_DIR: proj, LEDGER_NUDGE_BYTES: '1000', LEDGER_NUDGE_FRACTION: '0.5' },
  )
  assert.equal(res.stdout.trim(), '')
  await rm(dir, { recursive: true, force: true })
  await rm(proj, { recursive: true, force: true })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/unit/commit-detect.test.mjs test/unit/pre-tool-use.test.mjs test/unit/post-tool-use.test.mjs`
Expected: FAIL — the module + hook scripts do not exist yet.

- [ ] **Step 3: Write the implementations**

`hooks/lib/commit-detect.mjs`:

```js
const COMMITISH = /\bgit\s+(?:commit|merge|cherry-pick|revert|am|rebase|pull)\b/

export function isCommitishCommand(toolName, toolInput) {
  if (toolName !== 'Bash') {
    return false
  }
  const command = toolInput && typeof toolInput.command === 'string' ? toolInput.command : ''
  return command !== '' && COMMITISH.test(command)
}
```

`hooks/pre-tool-use.mjs`:

```js
#!/usr/bin/env node
import process from 'node:process'
import { runHook } from './lib/hook-io.mjs'
import { decidePreToolUse } from './lib/pre-tool-decision.mjs'
import { ledgerRoots } from './lib/ledger-roots.mjs'

runHook(async (input) => {
  const env = process.env
  const projectDir = env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd()
  const roots = ledgerRoots(projectDir, env)
  const decision = decidePreToolUse(input.tool_name, input.tool_input, roots)
  if (!decision) {
    return null
  }
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: decision.permissionDecision,
      permissionDecisionReason: decision.permissionDecisionReason,
    },
  }
})
```

`hooks/post-tool-use.mjs`:

```js
#!/usr/bin/env node
import process from 'node:process'
import { runHook } from './lib/hook-io.mjs'
import { runCli } from './lib/cli.mjs'
import { isGitWorkTree, git } from '../src/util/git-exec.mjs'
import { transcriptBytes, shouldNudge, nudgeFraction, nudgeBudgetBytes, nudgeContext } from './lib/nudge.mjs'
import { isCommitishCommand } from './lib/commit-detect.mjs'

async function captureSha(projectDir, env) {
  try {
    if (!(await isGitWorkTree(projectDir))) {
      return
    }
    const sha = (await git(['rev-parse', 'HEAD'], { cwd: projectDir })).trim()
    if (sha !== '') {
      await runCli(['record-sha', sha], { cwd: projectDir, env }).catch(() => {})
    }
  } catch {
    return
  }
}

runHook(async (input) => {
  const env = process.env
  const projectDir = env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd()
  if (isCommitishCommand(input.tool_name, input.tool_input)) {
    await captureSha(projectDir, env)
  }
  const bytes = transcriptBytes(input.transcript_path)
  if (shouldNudge(bytes, nudgeBudgetBytes(env), nudgeFraction(env))) {
    return nudgeContext()
  }
  return null
})
```

Make both executable:

```bash
chmod +x hooks/pre-tool-use.mjs hooks/post-tool-use.mjs
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/unit/commit-detect.test.mjs test/unit/pre-tool-use.test.mjs test/unit/post-tool-use.test.mjs`
Expected: PASS — 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add hooks/lib/commit-detect.mjs hooks/pre-tool-use.mjs hooks/post-tool-use.mjs test/unit/commit-detect.test.mjs test/unit/pre-tool-use.test.mjs test/unit/post-tool-use.test.mjs
git update-index --chmod=+x hooks/pre-tool-use.mjs hooks/post-tool-use.mjs
git commit -m "feat: add PreToolUse deny/allow and PostToolUse nudge + gated SHA capture"
```

---

### Task 14: Stop + PreCompact entry scripts

**Files:**
- Create: `hooks/stop.mjs`, `hooks/pre-compact.mjs` (executable)
- Test: `test/unit/stop.test.mjs`, `test/unit/pre-compact.test.mjs`

**Interfaces:**
- Consumes: `readStdin`/`parseHookInput` (T1), `runCli`/`runCliJson` (T2), `stopDecision` (T8), `runHook` (T1), `buildCheckpoint` (T9), Plan 01 `atomicWriteFile`/`serializeRecord`.
- Produces: `stop.mjs` — the ONE hook that intentionally uses exit 2. Honors `stop_hook_active` (never re-block), asks the CLI for the `active-thread` pointer (Plan 00 pin 1 — there is no `has-handoff` call), and BLOCKS (exit 2 + stderr reason) WHILE the pointer is non-empty; otherwise runs `sync` (CAS-push = publish the handoff, fail-open, Plan 00 M4) and exits 0. Any internal error → exit 0 (fail OPEN — a hook bug must never trap the user in a session). `pre-compact.mjs` — writes the checkpoint sentinel atomically; cannot block; emits nothing; fail-safe via `runHook`.

- [ ] **Step 1: Write the failing tests**

`test/unit/stop.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, writeFile, rm, chmod } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const SCRIPT = resolve(fileURLToPath(new URL('../../hooks/stop.mjs', import.meta.url)))

function runScript(stdinObj, env) {
  return new Promise((resolvePromise) => {
    const child = execFile(process.execPath, [SCRIPT], { env: { ...process.env, ...env } }, (err, stdout, stderr) => {
      resolvePromise({ code: err && typeof err.code === 'number' ? err.code : 0, stdout, stderr })
    })
    child.stdin.end(JSON.stringify(stdinObj))
  })
}

async function stubCli(activeThreadId) {
  const dir = await mkdtemp(join(tmpdir(), 'ledger-stop-'))
  const path = join(dir, 'cli.mjs')
  await writeFile(path, `
const cmd = process.argv[2]
if (cmd === 'active-thread') process.stdout.write(JSON.stringify({ thread_id: ${JSON.stringify(activeThreadId)} }))
else process.stdout.write('{}')
`)
  await chmod(path, 0o755)
  return { dir, cli: `${process.execPath} ${path}` }
}

test('blocks (exit 2) while the active-thread pointer is non-empty', async () => {
  const { dir, cli } = await stubCli('01ARZ3NDEKTSV4RRFFQ69G5FAV')
  const res = await runScript({ stop_hook_active: false }, { CLAUDE_PROJECT_DIR: process.cwd(), LEDGER_CLI: cli })
  assert.equal(res.code, 2)
  assert.match(res.stderr, /session-handoff/)
  await rm(dir, { recursive: true, force: true })
})

test('allows (exit 0) when the pointer is empty (handed off)', async () => {
  const { dir, cli } = await stubCli(null)
  const res = await runScript({ stop_hook_active: false }, { CLAUDE_PROJECT_DIR: process.cwd(), LEDGER_CLI: cli })
  assert.equal(res.code, 0)
  await rm(dir, { recursive: true, force: true })
})

test('never re-blocks when stop_hook_active is set', async () => {
  const { dir, cli } = await stubCli('01ARZ3NDEKTSV4RRFFQ69G5FAV')
  const res = await runScript({ stop_hook_active: true }, { CLAUDE_PROJECT_DIR: process.cwd(), LEDGER_CLI: cli })
  assert.equal(res.code, 0)
  await rm(dir, { recursive: true, force: true })
})

test('fails open (exit 0) when the CLI is unavailable', async () => {
  const res = await runScript({ stop_hook_active: false }, { CLAUDE_PROJECT_DIR: process.cwd(), LEDGER_CLI: `${process.execPath} /nonexistent/cli.mjs` })
  assert.equal(res.code, 0)
})
```

`test/unit/pre-compact.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import { projectKey } from '../../src/util/project-key.mjs'

const SCRIPT = resolve(fileURLToPath(new URL('../../hooks/pre-compact.mjs', import.meta.url)))

function runScript(stdinObj, env) {
  return new Promise((resolvePromise) => {
    const child = execFile(process.execPath, [SCRIPT], { env: { ...process.env, ...env } }, (err, stdout, stderr) => {
      resolvePromise({ code: err && typeof err.code === 'number' ? err.code : 0, stdout, stderr })
    })
    child.stdin.end(JSON.stringify(stdinObj))
  })
}

test('writes a checkpoint sentinel with the expected fields', async () => {
  const data = await mkdtemp(join(tmpdir(), 'ledger-pc-'))
  const proj = '/Users/dev/pc-proj'
  const res = await runScript(
    { session_id: 'sess1', trigger: 'auto', transcript_path: '/t.jsonl', cwd: proj },
    { CLAUDE_PROJECT_DIR: proj, CLAUDE_PLUGIN_DATA: data },
  )
  assert.equal(res.code, 0)
  const cpDir = join(data, projectKey(proj), 'checkpoints')
  const files = await readdir(cpDir)
  assert.equal(files.length, 1)
  const record = JSON.parse(await readFile(join(cpDir, files[0]), 'utf8'))
  assert.equal(record.kind, 'precompact-checkpoint')
  assert.equal(record.session_id, 'sess1')
  assert.equal(record.trigger, 'auto')
  await rm(data, { recursive: true, force: true })
})

test('is a safe no-op (exit 0) when CLAUDE_PLUGIN_DATA is missing', async () => {
  const res = await runScript({ session_id: 'x', trigger: 'manual', cwd: '/p' }, { CLAUDE_PROJECT_DIR: '/p' })
  assert.equal(res.code, 0)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/unit/stop.test.mjs test/unit/pre-compact.test.mjs`
Expected: FAIL — the hook scripts do not exist yet.

- [ ] **Step 3: Write the implementations**

`hooks/stop.mjs`:

```js
#!/usr/bin/env node
import process from 'node:process'
import { readStdin, parseHookInput } from './lib/hook-io.mjs'
import { runCli, runCliJson } from './lib/cli.mjs'
import { stopDecision } from './lib/stop-decision.mjs'

async function pushLedger(projectDir, env) {
  try {
    await runCli(['sync'], { cwd: projectDir, env })
  } catch {
    return
  }
}

async function main() {
  const input = parseHookInput(await readStdin())
  if (input.stop_hook_active === true) {
    process.exitCode = 0
    return
  }
  const env = process.env
  const projectDir = env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd()
  const active = await runCliJson(['active-thread'], { cwd: projectDir, env })
  const activeThreadId = active && typeof active.thread_id === 'string' ? active.thread_id : ''
  const decision = stopDecision({ activeThreadId, stopHookActive: false })
  if (decision.block) {
    process.stderr.write(`${decision.reason}\n`)
    process.exitCode = 2
    return
  }
  await pushLedger(projectDir, env)
  process.exitCode = 0
}

main().catch((err) => {
  process.stderr.write(`continuity stop hook error (allowing stop): ${err?.message ?? err}\n`)
  process.exitCode = 0
})
```

`hooks/pre-compact.mjs`:

```js
#!/usr/bin/env node
import process from 'node:process'
import { runHook } from './lib/hook-io.mjs'
import { buildCheckpoint } from './lib/checkpoint.mjs'
import { atomicWriteFile } from '../src/util/atomic-write.mjs'
import { serializeRecord } from '../src/drivers/layout.mjs'

runHook(async (input) => {
  const env = process.env
  const projectDir = env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd()
  const { path, record } = buildCheckpoint(
    {
      projectDir,
      sessionId: input.session_id,
      trigger: input.trigger,
      transcriptPath: input.transcript_path,
      now: new Date().toISOString(),
    },
    env,
  )
  await atomicWriteFile(path, serializeRecord(record))
  return null
})
```

Make both executable:

```bash
chmod +x hooks/stop.mjs hooks/pre-compact.mjs
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/unit/stop.test.mjs test/unit/pre-compact.test.mjs`
Expected: PASS — 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add hooks/stop.mjs hooks/pre-compact.mjs test/unit/stop.test.mjs test/unit/pre-compact.test.mjs
git update-index --chmod=+x hooks/stop.mjs hooks/pre-compact.mjs
git commit -m "feat: add Stop gate and PreCompact checkpoint hooks"
```

---

### Task 15: hooks.json control plane + full suite

**Files:**
- Create: `hooks/hooks.json`
- Test: `test/unit/hooks-json.test.mjs`

**Interfaces:**
- Consumes: the six entry scripts (T12–T14).
- Produces: `hooks/hooks.json` — the control plane wiring each event to `node "${CLAUDE_PLUGIN_ROOT}/hooks/<script>.mjs"`. PreToolUse/PostToolUse carry tool-name matchers; session-level events omit the matcher. This is the file Claude Code auto-loads for the plugin (Plan 06 packaging wires it via `plugin.json`).

- [ ] **Step 1: Write the failing test**

`test/unit/hooks-json.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PATH = resolve(fileURLToPath(new URL('../../hooks/hooks.json', import.meta.url)))

test('hooks.json wires all six events to plugin-root scripts', async () => {
  const config = JSON.parse(await readFile(PATH, 'utf8'))
  const events = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop', 'PreCompact']
  for (const ev of events) {
    assert.ok(Array.isArray(config.hooks[ev]) && config.hooks[ev].length >= 1, `missing ${ev}`)
    const cmd = config.hooks[ev][0].hooks[0].command
    assert.match(cmd, /\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\//, `${ev} command must use CLAUDE_PLUGIN_ROOT`)
    assert.equal(config.hooks[ev][0].hooks[0].type, 'command')
  }
})

test('PreToolUse matcher covers write tools and ledger MCP tools', async () => {
  const config = JSON.parse(await readFile(PATH, 'utf8'))
  const matcher = config.hooks.PreToolUse[0].matcher
  assert.match(matcher, /Write/)
  assert.match(matcher, /Bash/)
  assert.match(matcher, /mcp__ledger__/)
})

test('session-level events omit a matcher', async () => {
  const config = JSON.parse(await readFile(PATH, 'utf8'))
  for (const ev of ['SessionStart', 'UserPromptSubmit', 'Stop', 'PreCompact']) {
    assert.equal(config.hooks[ev][0].matcher, undefined, `${ev} must not set a matcher`)
  }
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/hooks-json.test.mjs`
Expected: FAIL — `hooks/hooks.json` does not exist.

- [ ] **Step 3: Write the implementation**

`hooks/hooks.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/session-start.mjs\"", "timeout": 30 }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/user-prompt-submit.mjs\"", "timeout": 15 }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit|NotebookEdit|Bash|mcp__ledger__.*",
        "hooks": [
          { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/pre-tool-use.mjs\"", "timeout": 10 }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit|NotebookEdit|Bash",
        "hooks": [
          { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/post-tool-use.mjs\"", "timeout": 15 }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/stop.mjs\"", "timeout": 15 }
        ]
      }
    ],
    "PreCompact": [
      {
        "hooks": [
          { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/pre-compact.mjs\"", "timeout": 10 }
        ]
      }
    ]
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/hooks-json.test.mjs`
Expected: PASS — 3 tests pass.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS — all Plan 01 + Plan 04 unit tests green (hook-io, cli, resume-intent, roster, ledger-roots, pre-tool-decision, nudge, commit-detect, stop-decision, checkpoint, commit-msg, install-commit-msg, dispatcher chaining, session-start, user-prompt-submit, pre-tool-use, post-tool-use, stop, pre-compact, hooks-json).

- [ ] **Step 6: Commit**

```bash
git add hooks/hooks.json test/unit/hooks-json.test.mjs
git commit -m "feat: add hooks.json control plane wiring all six events"
```

---

## Plan 04 Self-Review

- **Spec coverage:** Hook contracts (Plan 00 "Hook contracts (Plan 04)" + DESIGN-STATE §5.4) — all six events shipped with the verified JSON shapes: SessionStart inject-only roster + `sync` (pull) BEFORE `reconcile` (Tasks 4, 12; Plan 00 M4); UserPromptSubmit resume-intent roster inject (tightened regex), never blocks (Tasks 3, 12); PreToolUse deny raw ledger writes + auto-approve `mcp__ledger__*` (Tasks 5, 6, 13); PostToolUse context nudge + commit-ish-gated SHA capture (Tasks 7, 13; Plan 00 M11 via `commit-detect.mjs`); Stop exit-2 gate that BLOCKS WHILE the `active-thread` pointer is non-empty then `sync` pushes on allow (Tasks 8, 14; Plan 00 pin 1 + M4); PreCompact checkpoint sentinel (Tasks 9, 14). Trailer (A5, DESIGN-STATE §5.3) — idempotent `commit-msg` resolving the pointer via `--git-common-dir` (Task 10; Plan 00 pin 3) + non-destructive `core.hooksPath` auto-install/uninstall via a multi-hook DISPATCHER that chains every standard hook name, fails open, and re-copies on upgrade (Task 11; Plan 00 C2 + LOW), opt-out via `LEDGER_DISABLE_TRAILER` → `continuity.trailer=false` (Plan 00 pin 2). Fail-safe (Constraints) — `runHook` swallows errors to exit 0; Stop fails open on internal error while still honoring the pinned exit-2 block. Deferred by design: the MCP tool bodies + `bin/ledger-cli.mjs` (Plan 03), drift computation inside `reconcile` (Plan 05), plugin.json/userConfig wiring + E2E (Plan 06).
- **Placeholder scan:** none — every task ships complete comment-free code, a RED run with expected failure, and a GREEN run with expected pass.
- **Type/name consistency:** the tool prefix `mcp__ledger__` is identical in `pre-tool-decision.mjs`, `hooks.json`, and the deny reason; the roster shape `{id,slug,title,status,next_step}` matches Plan 00's `resumable.json`; the SessionStart/UserPromptSubmit/PreToolUse/PostToolUse `hookSpecificOutput` key names match the verified §5.4 protocol exactly; hooks reuse Plan 01 exports (`projectKey`, `atomicWriteFile`, `serializeRecord`, `git`, `isGitWorkTree`) by their pinned names.
- **Fail-safe audit:** every entry script cannot exit non-zero on an internal fault except Stop, which exits 2 ONLY on a clean block decision and exits 0 on any thrown error. The `commit-msg` hook's own insertion is `|| true` (never fails a commit) and it propagates only a chained hook's exit code; each `dispatcher` shim execs the same-named prior hook (propagating its exit code) or exits 0 when absent, so redirecting `core.hooksPath` never silently disables a user's security hook and a missing managed dir degrades to no-hooks (fail-open), never a hard block.

**Downstream contract produced by Plan 04 (consumed by Plan 06 packaging + E2E):**
- `hooks/hooks.json` is auto-loaded by Claude Code when the plugin is enabled; Plan 06's `.claude-plugin/plugin.json` must ship it at the plugin root (no extra wiring beyond declaring the plugin — plugin `hooks/hooks.json` is discovered automatically) and forward the HOOK-runtime/installer env: `LEDGER_DISABLE_TRAILER` (=`true`, read by the installer → writes git config `continuity.trailer=false`), `LEDGER_NUDGE_FRACTION`, `LEDGER_NUDGE_BYTES` (read at runtime by PostToolUse from `process.env`), plus the git config keys `continuity.trailer` / `continuity.priorHooksPath`. These go to the HOOK env, never the server (Plan 00 pin 2); there is NO `CONTINUITY_INSTALL_COMMIT_MSG`.
- The six entry scripts, `hooks/commit-msg`, and `hooks/dispatcher` must be packaged with the executable bit set; the installer copies `commit-msg` (trailer) plus `dispatcher` (under every other standard hook name) into `${CLAUDE_PLUGIN_DATA}/<project-key>/githooks/` (persistent DATA, re-copied every SessionStart), which SessionStart runs for git projects.
- Plan 06 must ship `bin/ledger-cli.mjs` (Plan 03's CLI seam) executable and on the packaged path; the hooks invoke it via `cliCommand` (`process.execPath ${CLAUDE_PLUGIN_ROOT}/bin/ledger-cli.mjs <subcommand>`, override `LEDGER_CLI`). Required subcommands: `roster`, `reconcile`, `active-thread`, `record-sha <sha>`, `sync` (there is NO `has-handoff` — Plan 00 pin 1).
- Plan 06's disable/uninstall path must call `uninstallCommitMsgHook({repoDir, managedDir})` per git project so `core.hooksPath` is cleanly restored.
- The active-thread pointer `<git-common-dir>/ledger/active-thread` (single-line ULID) is READ by `commit-msg` (resolved via `git rev-parse --git-common-dir`, Plan 00 pin 3); the MCP server (Plan 03/05) must WRITE it on `bind_branch` / active transition using the SAME resolution. Plan 06 E2E asserts the trailer appears on a real commit once a thread is active.
