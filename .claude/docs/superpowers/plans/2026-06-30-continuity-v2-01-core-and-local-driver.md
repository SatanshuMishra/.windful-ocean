# Continuity v2 — Plan 01: Core + LocalDriver + Derived Index

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This is plan 1 of 6; the shared contract lives in `2026-06-30-continuity-v2-00-overview.md` and is authoritative for every schema, interface, and constraint referenced here.

**Goal:** Ship a working, non-git session-continuity ledger core: identity + atomic-write utilities, JSON-Schema record validation, the recursive `Thread` model + 5-state FSM, the `StorageDriver` interface with a complete `LocalDriver`, and the derived-index builder.

**Architecture:** Everything the later plans build on. The `LocalDriver` is the reference `StorageDriver`; Plan 02's `GitRefDriver` implements the same interface. Records are validated on every write and persisted atomically (tmp-file + `rename`). The four `index/` files are pure derivations rebuilt from records, never hand-edited. No git is required to run any code in this plan.

**Tech Stack:** Node.js >= 20 (ESM), `node --test`, `ulid` 3.0.2, `ajv` 8.20.0, `@modelcontextprotocol/sdk` 1.29.0 (pinned here in Task 1; consumed by Plan 03). Plain JS, no TypeScript, no build step.

## Global Constraints (verbatim from Plan 00 — apply to EVERY task)

- Runtime: Node.js >= 20, ES modules only (`.mjs`). No TypeScript. No build step.
- Tests: Node's built-in runner only — `node --test`. No jest/vitest/mocha.
- Dependencies: exactly three runtime deps across the whole plugin — `@modelcontextprotocol/sdk` (pinned in Task 1 of this plan; consumed by Plan 03), `ulid`, `ajv`. Pin EXACT versions (no `^`/`~`). A 4th dependency requires a plan amendment. (Consequence for this plan: ajv 8 dropped built-in `format` validation and `ajv-formats` would be a 4th dep — so timestamps are validated by `pattern`, never by `format`.)
- No code comments anywhere (shebang / tooling-pragma / codegen-marker carve-outs only). No emojis. No AI attribution in commits.
- Immutability: never mutate a record in place; construct a new object and atomically write it. Small focused files (200–400 lines typical, 800 hard max). Comprehensive error handling; validate at every boundary; never silently swallow errors.
- All cross-references use a stable ULID (or a decision's stable NNNN). A slug or file path is NEVER a link target.
- Atomic writes: write to `<path>.tmp-<ulid>` then `rename()` over the target (POSIX atomic). Never partial-write a record. (Append-only session logs are the one documented exception — `appendFile`, not tmp+rename.)
- Storage is reached ONLY through the driver interface. No task hard-codes a git command or a filesystem path outside a driver or the `layout` helpers.
- Commit cadence: one logical change per commit; Conventional Commits (`feat:`/`fix:`/`test:`/`refactor:`/`chore:`).

## File Structure (this plan creates)

- `package.json` — pinned deps, `"type":"module"`, `test` script, `engines.node >=20`.
- `.gitignore` — `node_modules/`, `*.tmp-*`.
- `src/util/ulid.mjs` — `newUlid()`, `isUlid()`, `ulidTime()`.
- `src/util/atomic-write.mjs` — `atomicWriteFile(path, contents)`.
- `src/util/project-key.mjs` — `projectKey(absoluteDir)`.
- `src/util/git-exec.mjs` — `git(args, opts)`, `isGitWorkTree(dir)`.
- `src/drivers/layout.mjs` — pure path helpers + record serialize/parse.
- `src/schema/thread.schema.mjs`, `src/schema/binding.schema.mjs`, `src/schema/validate.mjs`.
- `src/model/fsm.mjs` — `ALLOWED_TRANSITIONS`, `canTransition()`, `isTerminal()`, `dodSatisfied()`.
- `src/model/thread.mjs` — `newThread()`.
- `src/model/binding.mjs` — `newBinding()`.
- `src/drivers/storage-driver.mjs` — abstract base.
- `src/drivers/local-driver.mjs` — `LocalDriver`.
- `src/index/build-index.mjs` — `buildIndex()`, `rebuildIndex(driver)`.
- `src/drivers/select-driver.mjs` — `selectDriver(projectDir, userConfig)`.
- `test/unit/*.test.mjs` — one test file per module above.

---

### Task 1: Repository scaffold

**Files:**
- Create: `package.json`, `.gitignore`, `src/`, `test/unit/`, `test/fixtures/` (empty dirs via `.gitkeep`)

**Interfaces:**
- Consumes: nothing.
- Produces: a runnable repo where `npm test` invokes `node --test` and the three deps resolve at pinned versions.

- [ ] **Step 1: Initialize the repo and directory skeleton**

The exact repo path/name is designated at execution kickoff. From the repo root:

```bash
git init
mkdir -p src/util src/schema src/model src/drivers src/index test/unit test/fixtures
touch test/fixtures/.gitkeep
```

- [ ] **Step 2: Write `package.json` with exact-pinned deps**

`package.json`:

```json
{
  "name": "continuity-ledger-plugin",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=20"
  },
  "scripts": {
    "test": "node --test"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "1.29.0",
    "ajv": "8.20.0",
    "ulid": "3.0.2"
  }
}
```

- [ ] **Step 3: Write `.gitignore`**

`.gitignore`:

```
node_modules/
*.tmp-*
```

- [ ] **Step 4: Install and verify the pins**

Run: `npm install`
Then run: `npm ls --depth=0`
Expected: `@modelcontextprotocol/sdk@1.29.0`, `ajv@8.20.0`, `ulid@3.0.2` — no carets, no mismatches.

- [ ] **Step 5: Verify the test runner is wired**

Run: `npm test`
Expected: `node --test` runs with `tests 0` / `pass 0` / `fail 0` (no test files yet), exit code 0.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .gitignore test/fixtures/.gitkeep
git commit -m "chore: scaffold continuity-ledger plugin repo with pinned deps"
```

---

### Task 2: ULID utility

**Files:**
- Create: `src/util/ulid.mjs`
- Test: `test/unit/ulid.test.mjs`

**Interfaces:**
- Consumes: `ulid` package (`ulid`, `decodeTime` named exports; verified ESM in v3).
- Produces: `newUlid(): string` (26-char Crockford-base32), `isUlid(v): boolean`, `ulidTime(v): number`.

- [ ] **Step 1: Write the failing test**

`test/unit/ulid.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newUlid, isUlid, ulidTime } from '../../src/util/ulid.mjs'

test('newUlid returns a 26-char Crockford-base32 string', () => {
  const id = newUlid()
  assert.equal(id.length, 26)
  assert.match(id, /^[0-9A-HJKMNP-TV-Z]{26}$/)
})

test('newUlid returns distinct values', () => {
  assert.notEqual(newUlid(), newUlid())
})

test('isUlid accepts valid and rejects invalid', () => {
  assert.equal(isUlid(newUlid()), true)
  assert.equal(isUlid('not-a-ulid'), false)
  assert.equal(isUlid('01ARZ3NDEKTSV4RRFFQ69G5FAI'), false)
  assert.equal(isUlid(''), false)
  assert.equal(isUlid(null), false)
})

test('ulidTime decodes an embedded timestamp and rejects junk', () => {
  const before = Date.now()
  const id = newUlid()
  const t = ulidTime(id)
  assert.ok(t >= before - 1000 && t <= Date.now() + 1000)
  assert.throws(() => ulidTime('nope'), /invalid ULID/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/ulid.test.mjs`
Expected: FAIL — cannot import from `../../src/util/ulid.mjs` (module not found).

- [ ] **Step 3: Write the implementation**

`src/util/ulid.mjs`:

```js
import { ulid, decodeTime } from 'ulid'

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/

export function newUlid() {
  return ulid()
}

export function isUlid(value) {
  return typeof value === 'string' && ULID_RE.test(value)
}

export function ulidTime(value) {
  if (!isUlid(value)) {
    throw new Error(`invalid ULID: ${value}`)
  }
  return decodeTime(value)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/ulid.test.mjs`
Expected: PASS — 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/util/ulid.mjs test/unit/ulid.test.mjs
git commit -m "feat: add ULID identity utility"
```

---

### Task 3: Atomic write utility

**Files:**
- Create: `src/util/atomic-write.mjs`
- Test: `test/unit/atomic-write.test.mjs`

**Interfaces:**
- Consumes: `newUlid` (Task 2), `node:fs/promises`.
- Produces: `atomicWriteFile(targetPath, contents): Promise<void>` — creates parent dirs, writes to a unique tmp file, `rename`s over the target, cleans up the tmp file on failure.

- [ ] **Step 1: Write the failing test**

`test/unit/atomic-write.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { atomicWriteFile } from '../../src/util/atomic-write.mjs'

async function scratch() {
  return mkdtemp(join(tmpdir(), 'ledger-atomic-'))
}

test('writes contents and creates missing parent directories', async () => {
  const dir = await scratch()
  const target = join(dir, 'nested', 'deep', 'file.json')
  await atomicWriteFile(target, '{"ok":true}\n')
  assert.equal(await readFile(target, 'utf8'), '{"ok":true}\n')
  await rm(dir, { recursive: true, force: true })
})

test('overwrites an existing file atomically and leaves no tmp files', async () => {
  const dir = await scratch()
  const target = join(dir, 'file.json')
  await atomicWriteFile(target, 'v1')
  await atomicWriteFile(target, 'v2')
  assert.equal(await readFile(target, 'utf8'), 'v2')
  const leftover = (await readdir(dir)).filter((f) => f.includes('.tmp-'))
  assert.deepEqual(leftover, [])
  await rm(dir, { recursive: true, force: true })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/atomic-write.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/util/atomic-write.mjs`:

```js
import { mkdir, rename, writeFile, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import { newUlid } from './ulid.mjs'

export async function atomicWriteFile(targetPath, contents) {
  if (typeof targetPath !== 'string' || targetPath.trim() === '') {
    throw new Error('atomicWriteFile: targetPath must be a non-empty string')
  }
  await mkdir(dirname(targetPath), { recursive: true })
  const tmpPath = `${targetPath}.tmp-${newUlid()}`
  try {
    await writeFile(tmpPath, contents)
    await rename(tmpPath, targetPath)
  } catch (err) {
    await rm(tmpPath, { force: true }).catch(() => {})
    throw err
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/atomic-write.test.mjs`
Expected: PASS — 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/util/atomic-write.mjs test/unit/atomic-write.test.mjs
git commit -m "feat: add atomic file write utility"
```

---

### Task 4: Project-key derivation

**Files:**
- Create: `src/util/project-key.mjs`
- Test: `test/unit/project-key.test.mjs`

**Interfaces:**
- Consumes: `node:path`.
- Produces: `projectKey(absoluteDir): string` — deterministic filesystem-safe key derived from an absolute path; formalizes the existing `~/.claude/projects/<slug>/` convention (each non-alphanumeric char -> `-`).

- [ ] **Step 1: Write the failing test**

`test/unit/project-key.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { projectKey } from '../../src/util/project-key.mjs'

test('maps an absolute path to a filesystem-safe key (existing convention)', () => {
  assert.equal(projectKey('/Users/dev/.claude'), '-Users-dev--claude')
  assert.equal(projectKey('/home/a/proj'), '-home-a-proj')
})

test('is deterministic', () => {
  assert.equal(projectKey('/x/y/z'), projectKey('/x/y/z'))
})

test('rejects non-absolute or non-string input', () => {
  assert.throws(() => projectKey('relative/path'), /absolute/)
  assert.throws(() => projectKey(42), /absolute/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/project-key.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/util/project-key.mjs`:

```js
import { isAbsolute } from 'node:path'

export function projectKey(absoluteDir) {
  if (typeof absoluteDir !== 'string' || !isAbsolute(absoluteDir)) {
    throw new Error(`projectKey requires an absolute path, got: ${absoluteDir}`)
  }
  return absoluteDir.replace(/[^a-zA-Z0-9]/g, '-')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/project-key.test.mjs`
Expected: PASS — 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/util/project-key.mjs test/unit/project-key.test.mjs
git commit -m "feat: add project-key derivation for the non-git store"
```

---

### Task 5: Git exec wrapper

**Files:**
- Create: `src/util/git-exec.mjs`
- Test: `test/unit/git-exec.test.mjs`

**Interfaces:**
- Consumes: `node:child_process`, `node:util`.
- Produces: `git(args: string[], opts?: {cwd?, env?}): Promise<string>` (resolves stdout, rejects with stderr on non-zero); `isGitWorkTree(dir): Promise<boolean>`. Consumed by Plan 02 (`GitRefDriver`) and Plan 01's `selectDriver`. `opts.env` is forwarded MERGED OVER `process.env` (`{ ...process.env, ...opts.env }`), never replacing it, so `PATH`/`HOME`/etc. survive — Plan 02's deterministic C1 orphan root and init-scaffold commits call `git(args, {cwd, env})` with `GIT_AUTHOR_DATE`/`GIT_COMMITTER_DATE` (+ fixed identity) set via `opts.env` and rely on this merge. Plan 00 pins this in the driver-interface notes.

- [ ] **Step 1: Write the failing test**

`test/unit/git-exec.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { git, isGitWorkTree } from '../../src/util/git-exec.mjs'

test('git() returns stdout for a valid command', async () => {
  const out = await git(['--version'])
  assert.match(out, /git version/)
})

test('git() rejects with stderr detail on failure', async () => {
  await assert.rejects(() => git(['not-a-real-subcommand']), /failed:/)
})

test('git() validates its arguments', async () => {
  await assert.rejects(() => git('status'), /array of string/)
})

test('git() forwards opts.env merged over process.env (PATH preserved)', async () => {
  const out = await git(['var', 'GIT_AUTHOR_IDENT'], {
    env: {
      GIT_AUTHOR_NAME: 'Ledger Bot',
      GIT_AUTHOR_EMAIL: 'bot@example.com',
      GIT_AUTHOR_DATE: '@1112911993 +0000',
    },
  })
  assert.match(out, /^Ledger Bot <bot@example\.com> 1112911993 \+0000/)
})

test('isGitWorkTree is true inside a repo, false outside', async () => {
  const repo = await mkdtemp(join(tmpdir(), 'ledger-git-'))
  await git(['init'], { cwd: repo })
  assert.equal(await isGitWorkTree(repo), true)
  const plain = await mkdtemp(join(tmpdir(), 'ledger-plain-'))
  assert.equal(await isGitWorkTree(plain), false)
  await rm(repo, { recursive: true, force: true })
  await rm(plain, { recursive: true, force: true })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/git-exec.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/util/git-exec.mjs`:

```js
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export async function git(args, opts = {}) {
  if (!Array.isArray(args) || args.some((a) => typeof a !== 'string')) {
    throw new Error('git() requires an array of string arguments')
  }
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      maxBuffer: 32 * 1024 * 1024,
    })
    return stdout.toString()
  } catch (err) {
    const detail = err.stderr ? err.stderr.toString().trim() : err.message
    throw new Error(`git ${args.join(' ')} failed: ${detail}`)
  }
}

export async function isGitWorkTree(dir) {
  try {
    const out = await git(['rev-parse', '--is-inside-work-tree'], { cwd: dir })
    return out.trim() === 'true'
  } catch {
    return false
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/git-exec.test.mjs`
Expected: PASS — 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/util/git-exec.mjs test/unit/git-exec.test.mjs
git commit -m "feat: add git exec wrapper and work-tree detection"
```

---

### Task 6: Ledger layout helpers

**Files:**
- Create: `src/drivers/layout.mjs`
- Test: `test/unit/layout.test.mjs`

**Interfaces:**
- Consumes: `node:path`.
- Produces (all pure): `SUBDIRS: string[]`, `INDEX_NAMES: string[]`, `threadPath(root,id)`, `bindingPath(root,id)`, `decisionFileName(nnnn,slug)`, `indexPath(root,name)`, `sessionDir(root,threadId)`, `projectMdPath(root)`, `serializeRecord(obj): string`, `parseRecord(text): object`. Reused verbatim by Plan 02's `GitRefDriver`.

- [ ] **Step 1: Write the failing test**

`test/unit/layout.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SUBDIRS, INDEX_NAMES, threadPath, bindingPath, decisionFileName,
  indexPath, sessionDir, projectMdPath, serializeRecord, parseRecord,
} from '../../src/drivers/layout.mjs'

test('SUBDIRS and INDEX_NAMES match the on-store layout', () => {
  assert.deepEqual(SUBDIRS, ['threads', 'bindings', 'decisions', 'sessions', 'index'])
  assert.deepEqual(INDEX_NAMES, ['by-slug', 'by-branch', 'children', 'resumable'])
})

test('path helpers compose the documented layout', () => {
  assert.equal(threadPath('/r', 'ID'), '/r/threads/ID.json')
  assert.equal(bindingPath('/r', 'B'), '/r/bindings/B.json')
  assert.equal(decisionFileName('0007', 'error-contract'), '0007-error-contract.md')
  assert.equal(indexPath('/r', 'by-slug'), '/r/index/by-slug.json')
  assert.equal(sessionDir('/r', 'T'), '/r/sessions/T')
  assert.equal(projectMdPath('/r'), '/r/PROJECT.md')
})

test('serializeRecord is pretty JSON with a trailing newline and round-trips', () => {
  const obj = { a: 1, b: ['x'] }
  const text = serializeRecord(obj)
  assert.ok(text.endsWith('\n'))
  assert.deepEqual(parseRecord(text), obj)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/layout.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/drivers/layout.mjs`:

```js
import { join } from 'node:path'

export const SUBDIRS = ['threads', 'bindings', 'decisions', 'sessions', 'index']
export const INDEX_NAMES = ['by-slug', 'by-branch', 'children', 'resumable']

export function threadPath(root, id) {
  return join(root, 'threads', `${id}.json`)
}

export function bindingPath(root, id) {
  return join(root, 'bindings', `${id}.json`)
}

export function decisionFileName(nnnn, slug) {
  return `${nnnn}-${slug}.md`
}

export function indexPath(root, name) {
  return join(root, 'index', `${name}.json`)
}

export function sessionDir(root, threadId) {
  return join(root, 'sessions', threadId)
}

export function projectMdPath(root) {
  return join(root, 'PROJECT.md')
}

export function serializeRecord(obj) {
  return `${JSON.stringify(obj, null, 2)}\n`
}

export function parseRecord(text) {
  return JSON.parse(text)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/layout.test.mjs`
Expected: PASS — 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/drivers/layout.mjs test/unit/layout.test.mjs
git commit -m "feat: add ledger layout path helpers"
```

---

### Task 7: Record schemas + validators

**Files:**
- Create: `src/schema/thread.schema.mjs`, `src/schema/binding.schema.mjs`, `src/schema/validate.mjs`
- Test: `test/unit/validate.test.mjs`

**Interfaces:**
- Consumes: `ajv` 8.20.0 (`import Ajv from 'ajv'`).
- Produces: `threadSchema`, `bindingSchema`, `validateThread(record): record` (throws on invalid), `validateBinding(record): record` (throws on invalid). Schemas match Plan 00's canonical record shapes verbatim.

- [ ] **Step 1: Write the failing test**

`test/unit/validate.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateThread, validateBinding } from '../../src/schema/validate.mjs'

const goodThread = {
  schema_version: 1,
  id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  slug: 'fix-signup-bug',
  title: 'Fix sign-up 500 on duplicate email',
  status: 'paused',
  parent_id: null,
  predecessor_id: null,
  completion_criteria: [{ text: 'returns 409', done: true }],
  vcs_ref: 'fix/signup-bug',
  external_refs: [],
  blocked_by: null,
  abandoned_reason: null,
  closure_statement: null,
  spine: {
    status: 'paused', active_goal: 'g', next_step: 'n',
    open_risks: [], key_decisions: [], out_of_scope: [],
  },
  created_at: '2026-06-30T10:00:00Z',
  updated_at: '2026-06-30T10:00:00Z',
}

const goodBinding = {
  id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  thread_id: '01ARZ3NDEKTSV4RRFFQ69G5FBW',
  repo: 'git@github.com:acme/app.git',
  branch: 'fix/signup-bug',
  status: 'merged',
  created_at: '2026-06-28T14:02:00Z',
  closed_at: '2026-06-29T09:10:00Z',
  closed_reason: 'merged',
  first_commit: '9f3a1c2',
  trailer_present: true,
}

test('valid Thread passes and is returned unchanged', () => {
  const record = structuredClone(goodThread)
  assert.doesNotThrow(() => validateThread(record))
  assert.equal(validateThread(record), record)
})

test('Thread with bad status enum is rejected', () => {
  const bad = { ...structuredClone(goodThread), status: 'wip' }
  assert.throws(() => validateThread(bad), /invalid Thread/)
})

test('Thread missing a required field is rejected', () => {
  const bad = structuredClone(goodThread)
  delete bad.completion_criteria
  assert.throws(() => validateThread(bad), /invalid Thread/)
})

test('Thread with an unknown extra property is rejected', () => {
  const bad = { ...structuredClone(goodThread), surprise: 1 }
  assert.throws(() => validateThread(bad), /invalid Thread/)
})

test('Thread with a non-ULID id is rejected', () => {
  const bad = { ...structuredClone(goodThread), id: 'short' }
  assert.throws(() => validateThread(bad), /invalid Thread/)
})

test('valid BranchBinding passes; bad closed_reason is rejected', () => {
  assert.doesNotThrow(() => validateBinding(structuredClone(goodBinding)))
  const bad = { ...structuredClone(goodBinding), closed_reason: 'nuked' }
  assert.throws(() => validateBinding(bad), /invalid BranchBinding/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/validate.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the Thread schema**

`src/schema/thread.schema.mjs`:

```js
const ULID_PATTERN = '^[0-9A-HJKMNP-TV-Z]{26}$'
const ISO_PATTERN = '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}'

export const threadSchema = {
  $id: 'ledger:thread',
  type: 'object',
  additionalProperties: false,
  required: [
    'schema_version', 'id', 'slug', 'title', 'status',
    'parent_id', 'predecessor_id', 'completion_criteria',
    'vcs_ref', 'external_refs', 'blocked_by', 'abandoned_reason',
    'closure_statement', 'spine', 'created_at', 'updated_at',
  ],
  properties: {
    schema_version: { const: 1 },
    id: { type: 'string', pattern: ULID_PATTERN },
    slug: { type: 'string', minLength: 1 },
    title: { type: 'string', minLength: 1 },
    status: { enum: ['active', 'paused', 'blocked', 'done', 'abandoned'] },
    parent_id: { type: ['string', 'null'], pattern: ULID_PATTERN },
    predecessor_id: { type: ['string', 'null'], pattern: ULID_PATTERN },
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
    vcs_ref: { type: ['string', 'null'] },
    external_refs: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['system', 'id', 'url'],
        properties: {
          system: { type: 'string' },
          id: { type: 'string' },
          url: { type: 'string' },
        },
      },
    },
    blocked_by: { type: ['string', 'null'] },
    abandoned_reason: { type: ['string', 'null'] },
    closure_statement: { type: ['string', 'null'] },
    spine: {
      type: 'object',
      additionalProperties: false,
      required: ['status', 'active_goal', 'next_step', 'open_risks', 'key_decisions', 'out_of_scope'],
      properties: {
        status: { type: 'string' },
        active_goal: { type: 'string' },
        next_step: { type: 'string' },
        open_risks: { type: 'array', items: { type: 'string' } },
        key_decisions: { type: 'array', items: { type: 'string' } },
        out_of_scope: { type: 'array', items: { type: 'string' } },
      },
    },
    created_at: { type: 'string', pattern: ISO_PATTERN },
    updated_at: { type: 'string', pattern: ISO_PATTERN },
  },
}
```

- [ ] **Step 4: Write the BranchBinding schema**

`src/schema/binding.schema.mjs`:

```js
const ULID_PATTERN = '^[0-9A-HJKMNP-TV-Z]{26}$'
const ISO_PATTERN = '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}'

export const bindingSchema = {
  $id: 'ledger:binding',
  type: 'object',
  additionalProperties: false,
  required: [
    'id', 'thread_id', 'repo', 'branch', 'status',
    'created_at', 'closed_at', 'closed_reason', 'first_commit', 'trailer_present',
  ],
  properties: {
    id: { type: 'string', pattern: ULID_PATTERN },
    thread_id: { type: 'string', pattern: ULID_PATTERN },
    repo: { type: 'string', minLength: 1 },
    branch: { type: 'string', minLength: 1 },
    status: { enum: ['active', 'merged', 'orphaned', 'abandoned'] },
    created_at: { type: 'string', pattern: ISO_PATTERN },
    closed_at: { type: ['string', 'null'] },
    closed_reason: { enum: ['merged', 'deleted', 'abandoned', 'superseded', null] },
    first_commit: { type: ['string', 'null'] },
    trailer_present: { type: 'boolean' },
  },
}
```

- [ ] **Step 5: Write the validator factory**

`src/schema/validate.mjs`:

```js
import Ajv from 'ajv'
import { threadSchema } from './thread.schema.mjs'
import { bindingSchema } from './binding.schema.mjs'

const ajv = new Ajv({ allErrors: true, strict: false })
const compiledThread = ajv.compile(threadSchema)
const compiledBinding = ajv.compile(bindingSchema)

function formatErrors(errors) {
  return (errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ')
}

export function validateThread(record) {
  if (!compiledThread(record)) {
    throw new Error(`invalid Thread: ${formatErrors(compiledThread.errors)}`)
  }
  return record
}

export function validateBinding(record) {
  if (!compiledBinding(record)) {
    throw new Error(`invalid BranchBinding: ${formatErrors(compiledBinding.errors)}`)
  }
  return record
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node --test test/unit/validate.test.mjs`
Expected: PASS — 6 tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/schema/ test/unit/validate.test.mjs
git commit -m "feat: add Thread and BranchBinding schema validators"
```

---

### Task 8: Five-state FSM

**Files:**
- Create: `src/model/fsm.mjs`
- Test: `test/unit/fsm.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `STATES`, `TERMINAL_STATES`, `ALLOWED_TRANSITIONS`, `canTransition(from,to): boolean`, `isTerminal(status): boolean`, `dodSatisfied(thread, closureStatement): boolean`. The transition matrix is copied verbatim from Plan 00 / `rules/common/continuity-ledger.md`. Enforced by Plan 03's `transition_thread`.

- [ ] **Step 1: Write the failing test**

`test/unit/fsm.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canTransition, isTerminal, dodSatisfied, ALLOWED_TRANSITIONS } from '../../src/model/fsm.mjs'

test('allowed transitions match the continuity-ledger matrix', () => {
  assert.deepEqual(ALLOWED_TRANSITIONS.active, ['paused', 'blocked', 'done', 'abandoned'])
  assert.deepEqual(ALLOWED_TRANSITIONS.paused, ['active', 'done', 'abandoned'])
  assert.deepEqual(ALLOWED_TRANSITIONS.blocked, ['active', 'paused'])
  assert.deepEqual(ALLOWED_TRANSITIONS.done, [])
  assert.deepEqual(ALLOWED_TRANSITIONS.abandoned, [])
})

test('canTransition permits legal and refuses illegal moves', () => {
  assert.equal(canTransition('active', 'paused'), true)
  assert.equal(canTransition('blocked', 'active'), true)
  assert.equal(canTransition('done', 'active'), false)
  assert.equal(canTransition('paused', 'blocked'), false)
  assert.equal(canTransition('bogus', 'active'), false)
})

test('isTerminal is true only for done/abandoned', () => {
  assert.equal(isTerminal('done'), true)
  assert.equal(isTerminal('abandoned'), true)
  assert.equal(isTerminal('paused'), false)
})

test('dodSatisfied requires non-empty, all-checked criteria and a closure statement', () => {
  const ok = { completion_criteria: [{ text: 'a', done: true }] }
  assert.equal(dodSatisfied(ok, 'shipped it'), true)
  assert.equal(dodSatisfied(ok, '   '), false)
  assert.equal(dodSatisfied({ completion_criteria: [] }, 'x'), false)
  assert.equal(dodSatisfied({ completion_criteria: [{ text: 'a', done: false }] }, 'x'), false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/fsm.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/model/fsm.mjs`:

```js
export const STATES = ['active', 'paused', 'blocked', 'done', 'abandoned']
export const TERMINAL_STATES = ['done', 'abandoned']

export const ALLOWED_TRANSITIONS = {
  active: ['paused', 'blocked', 'done', 'abandoned'],
  paused: ['active', 'done', 'abandoned'],
  blocked: ['active', 'paused'],
  done: [],
  abandoned: [],
}

export function canTransition(from, to) {
  if (!STATES.includes(from) || !STATES.includes(to)) {
    return false
  }
  return ALLOWED_TRANSITIONS[from].includes(to)
}

export function isTerminal(status) {
  return TERMINAL_STATES.includes(status)
}

export function dodSatisfied(thread, closureStatement) {
  const criteria = thread?.completion_criteria
  if (!Array.isArray(criteria) || criteria.length === 0) {
    return false
  }
  if (!criteria.every((c) => c && c.done === true)) {
    return false
  }
  return typeof closureStatement === 'string' && closureStatement.trim() !== ''
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/fsm.test.mjs`
Expected: PASS — 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/model/fsm.mjs test/unit/fsm.test.mjs
git commit -m "feat: add five-state thread FSM with DoD gate"
```

---

### Task 9: Thread constructor

**Files:**
- Create: `src/model/thread.mjs`
- Test: `test/unit/thread.test.mjs`

**Interfaces:**
- Consumes: `newUlid` (Task 2), `validateThread` (Task 7).
- Produces: `newThread(fields): Thread` — fills defaults (schema_version 1, generated `id`, `status:'active'`, null parents, empty spine/refs, null `blocked_by`/`abandoned_reason`/`closure_statement`, ISO timestamps), validates, returns a fresh object. The three lifecycle fields are declared+required in the schema and default to null at creation; `transition_thread` (Plan 03) is what sets them. Accepts `fields.now` and `fields.id` for deterministic tests.

- [ ] **Step 1: Write the failing test**

`test/unit/thread.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newThread } from '../../src/model/thread.mjs'
import { isUlid } from '../../src/util/ulid.mjs'

test('newThread fills defaults and validates', () => {
  const t = newThread({ slug: 'fix-x', title: 'Fix X', now: '2026-06-30T10:00:00Z' })
  assert.equal(t.schema_version, 1)
  assert.ok(isUlid(t.id))
  assert.equal(t.status, 'active')
  assert.equal(t.parent_id, null)
  assert.equal(t.predecessor_id, null)
  assert.deepEqual(t.completion_criteria, [])
  assert.equal(t.vcs_ref, null)
  assert.deepEqual(t.external_refs, [])
  assert.equal(t.blocked_by, null)
  assert.equal(t.abandoned_reason, null)
  assert.equal(t.closure_statement, null)
  assert.deepEqual(t.spine.open_risks, [])
  assert.equal(t.created_at, '2026-06-30T10:00:00Z')
  assert.equal(t.updated_at, '2026-06-30T10:00:00Z')
})

test('newThread honors provided fields and normalizes criteria', () => {
  const t = newThread({
    slug: 'child', title: 'Child', parent_id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    completion_criteria: [{ text: 'do it', done: 0 }], vcs_ref: 'feat/child',
    now: '2026-06-30T10:00:00Z',
  })
  assert.equal(t.parent_id, '01ARZ3NDEKTSV4RRFFQ69G5FAV')
  assert.deepEqual(t.completion_criteria, [{ text: 'do it', done: false }])
  assert.equal(t.vcs_ref, 'feat/child')
})

test('newThread rejects a missing slug/title', () => {
  assert.throws(() => newThread({ title: 'no slug', now: '2026-06-30T10:00:00Z' }), /slug/)
  assert.throws(() => newThread({ slug: 'no-title', now: '2026-06-30T10:00:00Z' }), /title/)
})

test('newThread does not share spine array references between instances', () => {
  const a = newThread({ slug: 'a', title: 'A', now: '2026-06-30T10:00:00Z' })
  const b = newThread({ slug: 'b', title: 'B', now: '2026-06-30T10:00:00Z' })
  assert.notEqual(a.spine.open_risks, b.spine.open_risks)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/thread.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/model/thread.mjs`:

```js
import { newUlid } from '../util/ulid.mjs'
import { validateThread } from '../schema/validate.mjs'

function requireStr(fields, name) {
  const v = fields[name]
  if (typeof v !== 'string' || v.trim() === '') {
    throw new Error(`newThread: '${name}' is required and must be a non-empty string`)
  }
  return v
}

function normalizeCriteria(criteria = []) {
  if (!Array.isArray(criteria)) {
    throw new Error('newThread: completion_criteria must be an array')
  }
  return criteria.map((c) => ({ text: String(c.text), done: Boolean(c.done) }))
}

function buildSpine(spine = {}) {
  return {
    status: spine.status ?? '',
    active_goal: spine.active_goal ?? '',
    next_step: spine.next_step ?? '',
    open_risks: [...(spine.open_risks ?? [])],
    key_decisions: [...(spine.key_decisions ?? [])],
    out_of_scope: [...(spine.out_of_scope ?? [])],
  }
}

export function newThread(fields = {}) {
  const now = fields.now ?? new Date().toISOString()
  const thread = {
    schema_version: 1,
    id: fields.id ?? newUlid(),
    slug: requireStr(fields, 'slug'),
    title: requireStr(fields, 'title'),
    status: fields.status ?? 'active',
    parent_id: fields.parent_id ?? null,
    predecessor_id: fields.predecessor_id ?? null,
    completion_criteria: normalizeCriteria(fields.completion_criteria),
    vcs_ref: fields.vcs_ref ?? null,
    external_refs: (fields.external_refs ?? []).map((r) => ({
      system: String(r.system), id: String(r.id), url: String(r.url ?? ''),
    })),
    blocked_by: fields.blocked_by ?? null,
    abandoned_reason: fields.abandoned_reason ?? null,
    closure_statement: fields.closure_statement ?? null,
    spine: buildSpine(fields.spine),
    created_at: fields.created_at ?? now,
    updated_at: fields.updated_at ?? now,
  }
  return validateThread(thread)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/thread.test.mjs`
Expected: PASS — 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/model/thread.mjs test/unit/thread.test.mjs
git commit -m "feat: add Thread record constructor"
```

---

### Task 10: BranchBinding constructor

**Files:**
- Create: `src/model/binding.mjs`
- Test: `test/unit/binding.test.mjs`

**Interfaces:**
- Consumes: `newUlid`, `isUlid` (Task 2), `validateBinding` (Task 7).
- Produces: `newBinding(fields): BranchBinding` — requires a ULID `thread_id`, `repo`, `branch`; defaults `status:'active'`, null closed fields, `trailer_present:false`; validates. Accepts `fields.now`/`fields.id`.

- [ ] **Step 1: Write the failing test**

`test/unit/binding.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newBinding } from '../../src/model/binding.mjs'
import { isUlid } from '../../src/util/ulid.mjs'

const THREAD = '01ARZ3NDEKTSV4RRFFQ69G5FAV'

test('newBinding fills defaults and validates', () => {
  const b = newBinding({ thread_id: THREAD, repo: 'r', branch: 'feat/x', now: '2026-06-30T10:00:00Z' })
  assert.ok(isUlid(b.id))
  assert.equal(b.thread_id, THREAD)
  assert.equal(b.status, 'active')
  assert.equal(b.closed_at, null)
  assert.equal(b.closed_reason, null)
  assert.equal(b.first_commit, null)
  assert.equal(b.trailer_present, false)
  assert.equal(b.created_at, '2026-06-30T10:00:00Z')
})

test('newBinding rejects a non-ULID thread_id', () => {
  assert.throws(() => newBinding({ thread_id: 'nope', repo: 'r', branch: 'b' }), /thread_id/)
})

test('newBinding rejects a missing repo or branch', () => {
  assert.throws(() => newBinding({ thread_id: THREAD, branch: 'b' }), /repo/)
  assert.throws(() => newBinding({ thread_id: THREAD, repo: 'r' }), /branch/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/binding.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/model/binding.mjs`:

```js
import { newUlid, isUlid } from '../util/ulid.mjs'
import { validateBinding } from '../schema/validate.mjs'

function requireStr(fields, name) {
  const v = fields[name]
  if (typeof v !== 'string' || v.trim() === '') {
    throw new Error(`newBinding: '${name}' is required and must be a non-empty string`)
  }
  return v
}

export function newBinding(fields = {}) {
  if (!isUlid(fields.thread_id)) {
    throw new Error('newBinding: thread_id must be a ULID')
  }
  const now = fields.now ?? new Date().toISOString()
  const binding = {
    id: fields.id ?? newUlid(),
    thread_id: fields.thread_id,
    repo: requireStr(fields, 'repo'),
    branch: requireStr(fields, 'branch'),
    status: fields.status ?? 'active',
    created_at: fields.created_at ?? now,
    closed_at: fields.closed_at ?? null,
    closed_reason: fields.closed_reason ?? null,
    first_commit: fields.first_commit ?? null,
    trailer_present: Boolean(fields.trailer_present ?? false),
  }
  return validateBinding(binding)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/binding.test.mjs`
Expected: PASS — 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/model/binding.mjs test/unit/binding.test.mjs
git commit -m "feat: add BranchBinding record constructor"
```

---

### Task 11: Abstract StorageDriver base

**Files:**
- Create: `src/drivers/storage-driver.mjs`
- Test: `test/unit/storage-driver.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `class StorageDriver` — every method from Plan 00's interface throws `not implemented` so a subclass that forgets one fails loudly. Extended by `LocalDriver` (Task 12) and Plan 02's `GitRefDriver`.

- [ ] **Step 1: Write the failing test**

`test/unit/storage-driver.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { StorageDriver } from '../../src/drivers/storage-driver.mjs'

test('base methods throw not-implemented', async () => {
  const d = new StorageDriver()
  assert.throws(() => d.isGit(), /not implemented/)
  await assert.rejects(() => d.readThread('x'), /not implemented/)
  await assert.rejects(() => d.writeThread({}), /not implemented/)
  await assert.rejects(() => d.sync(), /not implemented/)
})

test('exposes the full contract method set', () => {
  const names = [
    'isGit', 'init', 'root', 'readThread', 'writeThread', 'listThreads',
    'readBinding', 'writeBinding', 'listBindings', 'nextDecisionNumber',
    'writeDecision', 'readDecision', 'listDecisions', 'appendSessionEvent',
    'readIndexFile', 'writeIndexFile', 'commit', 'sync',
    'observeBranch', 'observeNewBranch', 'listRepoBranches',
  ]
  const proto = StorageDriver.prototype
  for (const n of names) {
    assert.equal(typeof proto[n], 'function', `missing ${n}`)
  }
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/storage-driver.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/drivers/storage-driver.mjs`:

```js
const NI = 'StorageDriver is abstract; method not implemented'

export class StorageDriver {
  isGit() { throw new Error(NI) }
  async init() { throw new Error(NI) }
  async root() { throw new Error(NI) }
  async readThread(id) { throw new Error(NI) }
  async writeThread(thread) { throw new Error(NI) }
  async listThreads() { throw new Error(NI) }
  async readBinding(id) { throw new Error(NI) }
  async writeBinding(binding) { throw new Error(NI) }
  async listBindings() { throw new Error(NI) }
  async nextDecisionNumber() { throw new Error(NI) }
  async writeDecision(nnnn, slug, markdown) { throw new Error(NI) }
  async readDecision(nnnn) { throw new Error(NI) }
  async listDecisions() { throw new Error(NI) }
  async appendSessionEvent(threadId, isoTs, actor, markdown) { throw new Error(NI) }
  async readIndexFile(name) { throw new Error(NI) }
  async writeIndexFile(name, obj) { throw new Error(NI) }
  async commit(message) { throw new Error(NI) }
  async sync() { throw new Error(NI) }
  async observeBranch(binding) { throw new Error(NI) }
  async observeNewBranch(repo, branch) { throw new Error(NI) }
  async listRepoBranches(repo) { throw new Error(NI) }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/storage-driver.test.mjs`
Expected: PASS — 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/drivers/storage-driver.mjs test/unit/storage-driver.test.mjs
git commit -m "feat: add abstract StorageDriver interface"
```

---

### Task 12: LocalDriver — init + Thread + Binding

**Files:**
- Create: `src/drivers/local-driver.mjs`
- Test: `test/unit/local-driver-records.test.mjs`

**Interfaces:**
- Consumes: `StorageDriver` (Task 11), `atomicWriteFile` (Task 3), `validateThread`/`validateBinding` (Task 7), `layout` helpers (Task 6), `isUlid` (Task 2).
- Produces: `class LocalDriver extends StorageDriver` implementing `isGit()`, `init()`, `root()`, Thread read/write/list, Binding read/write/list. Later tasks add the remaining methods to the same class. `readThread`/`readBinding` return `null` on ENOENT; `writeThread`/`writeBinding` validate then atomic-write.

- [ ] **Step 1: Write the failing test**

`test/unit/local-driver-records.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LocalDriver } from '../../src/drivers/local-driver.mjs'
import { newThread } from '../../src/model/thread.mjs'
import { newBinding } from '../../src/model/binding.mjs'

async function freshDriver() {
  const root = join(await mkdtemp(join(tmpdir(), 'ledger-local-')), 'ledger')
  const d = new LocalDriver(root)
  await d.init()
  return d
}

test('init creates the ledger subdirectories and isGit is false', async () => {
  const d = await freshDriver()
  assert.equal(d.isGit(), false)
  for (const sub of ['threads', 'bindings', 'decisions', 'sessions', 'index']) {
    assert.ok((await stat(join(await d.root(), sub))).isDirectory())
  }
  await rm(await d.root(), { recursive: true, force: true })
})

test('Thread round-trips and readThread returns null when absent', async () => {
  const d = await freshDriver()
  const t = newThread({ slug: 's', title: 'T', now: '2026-06-30T10:00:00Z' })
  await d.writeThread(t)
  assert.deepEqual(await d.readThread(t.id), t)
  assert.equal(await d.readThread('01ARZ3NDEKTSV4RRFFQ69G5FAV'), null)
  await rm(await d.root(), { recursive: true, force: true })
})

test('writeThread rejects an invalid record before touching disk', async () => {
  const d = await freshDriver()
  await assert.rejects(() => d.writeThread({ id: 'bad' }), /invalid Thread/)
  await rm(await d.root(), { recursive: true, force: true })
})

test('listThreads returns every written thread', async () => {
  const d = await freshDriver()
  const a = newThread({ slug: 'a', title: 'A', now: '2026-06-30T10:00:00Z' })
  const b = newThread({ slug: 'b', title: 'B', now: '2026-06-30T10:00:00Z' })
  await d.writeThread(a)
  await d.writeThread(b)
  const ids = (await d.listThreads()).map((t) => t.id).sort()
  assert.deepEqual(ids, [a.id, b.id].sort())
  await rm(await d.root(), { recursive: true, force: true })
})

test('Binding round-trips and listBindings returns it', async () => {
  const d = await freshDriver()
  const b = newBinding({ thread_id: '01ARZ3NDEKTSV4RRFFQ69G5FAV', repo: 'r', branch: 'feat/x', now: '2026-06-30T10:00:00Z' })
  await d.writeBinding(b)
  assert.deepEqual(await d.readBinding(b.id), b)
  assert.deepEqual((await d.listBindings()).map((x) => x.id), [b.id])
  await rm(await d.root(), { recursive: true, force: true })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/local-driver-records.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/drivers/local-driver.mjs`:

```js
import { readFile, readdir, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { StorageDriver } from './storage-driver.mjs'
import { atomicWriteFile } from '../util/atomic-write.mjs'
import { validateThread, validateBinding } from '../schema/validate.mjs'
import { isUlid } from '../util/ulid.mjs'
import {
  SUBDIRS, threadPath, bindingPath, serializeRecord, parseRecord,
} from './layout.mjs'

export class LocalDriver extends StorageDriver {
  constructor(rootDir) {
    super()
    if (typeof rootDir !== 'string' || rootDir.trim() === '') {
      throw new Error('LocalDriver requires a root directory path')
    }
    this.rootDir = rootDir
  }

  isGit() {
    return false
  }

  async init() {
    await mkdir(this.rootDir, { recursive: true })
    for (const sub of SUBDIRS) {
      await mkdir(join(this.rootDir, sub), { recursive: true })
    }
    return this.rootDir
  }

  async root() {
    return this.rootDir
  }

  async readThread(id) {
    return this.#readJson(threadPath(this.rootDir, id))
  }

  async writeThread(thread) {
    validateThread(thread)
    await atomicWriteFile(threadPath(this.rootDir, thread.id), serializeRecord(thread))
    return thread
  }

  async listThreads() {
    return this.#listRecords('threads')
  }

  async readBinding(id) {
    return this.#readJson(bindingPath(this.rootDir, id))
  }

  async writeBinding(binding) {
    validateBinding(binding)
    await atomicWriteFile(bindingPath(this.rootDir, binding.id), serializeRecord(binding))
    return binding
  }

  async listBindings() {
    return this.#listRecords('bindings')
  }

  async #readJson(path) {
    try {
      return parseRecord(await readFile(path, 'utf8'))
    } catch (err) {
      if (err.code === 'ENOENT') {
        return null
      }
      throw err
    }
  }

  async #listDir(sub) {
    try {
      return await readdir(join(this.rootDir, sub))
    } catch (err) {
      if (err.code === 'ENOENT') {
        return []
      }
      throw err
    }
  }

  async #listRecords(sub) {
    const files = await this.#listDir(sub)
    const out = []
    for (const f of files) {
      if (!f.endsWith('.json') || f.includes('.tmp-')) {
        continue
      }
      const rec = await this.#readJson(join(this.rootDir, sub, f))
      if (rec) {
        out.push(rec)
      }
    }
    return out
  }
}

export { isUlid }
```

Note: the `isUlid` re-export is a convenience the later LocalDriver tasks and Plan 03 use; it costs nothing and keeps the driver the single import surface.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/local-driver-records.test.mjs`
Expected: PASS — 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/drivers/local-driver.mjs test/unit/local-driver-records.test.mjs
git commit -m "feat: add LocalDriver init and record read/write"
```

---

### Task 13: LocalDriver — decisions, sessions, index files, commit/sync

**Files:**
- Modify: `src/drivers/local-driver.mjs`
- Test: `test/unit/local-driver-aux.test.mjs`

**Interfaces:**
- Consumes: everything Task 12 imported, plus `appendFile` and `decisionFileName`/`indexPath`/`sessionDir`/`INDEX_NAMES` from `layout`.
- Produces (added to `LocalDriver`): `nextDecisionNumber()`, `writeDecision(nnnn,slug,markdown)` (validates `slug` against `^[a-z0-9][a-z0-9-]*$` before path interpolation — the `nnnn` sibling is already validated; an unvalidated slug is an arbitrary-write path traversal), `readDecision(nnnn)`, `listDecisions()`, `appendSessionEvent(threadId,isoTs,actor,markdown)`, `readIndexFile(name)`, `writeIndexFile(name,obj)`, `commit()`, `sync()`, plus the git-driver-only `observeBranch(binding)`/`observeNewBranch(repo,branch)`/`listRepoBranches(repo)` throwing stubs. `commit()` -> `{committed:false}`; `sync()` -> `{synced:false}` (no-ops for the local store). `observeBranch`/`observeNewBranch`/`listRepoBranches` throw `"<method>: git drivers only"` — a loud not-implemented, never a raw `TypeError`; the real implementations land in Plan 02's `GitRefDriver` (`listRepoBranches` returns feature-repo branch names; Plan 05 uses it for the new/renamed-branch re-attach scan). `readIndexFile` returns an empty `[]`/`{}` for a missing file.

- [ ] **Step 1: Write the failing test**

`test/unit/local-driver-aux.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LocalDriver } from '../../src/drivers/local-driver.mjs'

async function freshDriver() {
  const root = join(await mkdtemp(join(tmpdir(), 'ledger-aux-')), 'ledger')
  const d = new LocalDriver(root)
  await d.init()
  return d
}

const T = '01ARZ3NDEKTSV4RRFFQ69G5FAV'

test('decision numbering starts at 0001 and increments across existing files', async () => {
  const d = await freshDriver()
  assert.equal(await d.nextDecisionNumber(), '0001')
  await d.writeDecision('0001', 'first', '# 0001\n')
  await d.writeDecision('0002', 'second', '# 0002\n')
  assert.equal(await d.nextDecisionNumber(), '0003')
  assert.match(await d.readDecision('0002'), /# 0002/)
  assert.deepEqual(await d.listDecisions(), [
    { nnnn: '0001', slug: 'first' },
    { nnnn: '0002', slug: 'second' },
  ])
  await rm(await d.root(), { recursive: true, force: true })
})

test('writeDecision rejects a malformed number', async () => {
  const d = await freshDriver()
  await assert.rejects(() => d.writeDecision('7', 'x', 'y'), /NNNN/)
  await rm(await d.root(), { recursive: true, force: true })
})

test('appendSessionEvent appends to a per-session, ts-named file', async () => {
  const d = await freshDriver()
  const p1 = await d.appendSessionEvent(T, '2026-06-30T09:00:00Z', 'cursor', 'line one')
  const p2 = await d.appendSessionEvent(T, '2026-06-30T09:00:00Z', 'cursor', 'line two')
  assert.equal(p1, p2)
  assert.match(p1, /sessions\/01ARZ3NDEKTSV4RRFFQ69G5FAV\/2026-06-30T09-00-00Z--cursor\.md$/)
  assert.equal(await readFile(p1, 'utf8'), 'line one\nline two\n')
  await rm(await d.root(), { recursive: true, force: true })
})

test('appendSessionEvent rejects a non-ULID threadId', async () => {
  const d = await freshDriver()
  await assert.rejects(() => d.appendSessionEvent('nope', '2026-06-30T09:00:00Z', 'a', 'b'), /ULID/)
  await rm(await d.root(), { recursive: true, force: true })
})

test('index files round-trip; missing file yields empty shape; bad name rejected', async () => {
  const d = await freshDriver()
  assert.deepEqual(await d.readIndexFile('by-slug'), {})
  assert.deepEqual(await d.readIndexFile('resumable'), [])
  await d.writeIndexFile('by-slug', { s: T })
  assert.deepEqual(await d.readIndexFile('by-slug'), { s: T })
  await assert.rejects(() => d.readIndexFile('bogus'), /unknown index/)
  await rm(await d.root(), { recursive: true, force: true })
})

test('commit and sync are no-ops for the local store', async () => {
  const d = await freshDriver()
  assert.deepEqual(await d.commit('msg'), { committed: false })
  assert.deepEqual(await d.sync(), { synced: false })
  await rm(await d.root(), { recursive: true, force: true })
})

test('observeBranch throws because it is git-drivers-only', async () => {
  const d = await freshDriver()
  await assert.rejects(() => d.observeBranch({ repo: 'r', branch: 'b' }), /observeBranch: git drivers only/)
  await rm(await d.root(), { recursive: true, force: true })
})

test('observeNewBranch throws because it is git-drivers-only', async () => {
  const d = await freshDriver()
  await assert.rejects(() => d.observeNewBranch('r', 'feat/x'), /observeNewBranch: git drivers only/)
  await rm(await d.root(), { recursive: true, force: true })
})

test('listRepoBranches throws because it is git-drivers-only', async () => {
  const d = await freshDriver()
  await assert.rejects(() => d.listRepoBranches('r'), /listRepoBranches: git drivers only/)
  await rm(await d.root(), { recursive: true, force: true })
})

test('writeDecision rejects a path-traversal slug before touching disk', async () => {
  const d = await freshDriver()
  await assert.rejects(() => d.writeDecision('0001', '../evil', 'x'), /slug must match/)
  await rm(await d.root(), { recursive: true, force: true })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/local-driver-aux.test.mjs`
Expected: FAIL — `d.nextDecisionNumber is not a function`.

- [ ] **Step 3: Extend the imports**

In `src/drivers/local-driver.mjs`, replace the two import lines for `node:fs/promises` and `./layout.mjs` with:

```js
import { readFile, readdir, mkdir, appendFile } from 'node:fs/promises'
```

```js
import {
  SUBDIRS, INDEX_NAMES, threadPath, bindingPath, decisionFileName,
  indexPath, sessionDir, serializeRecord, parseRecord,
} from './layout.mjs'
```

- [ ] **Step 4: Add the auxiliary methods to `LocalDriver`**

Insert these methods into the `LocalDriver` class body (before the private `#readJson`):

```js
  async nextDecisionNumber() {
    const files = await this.#listDir('decisions')
    let max = 0
    for (const f of files) {
      const m = /^(\d{4})-/.exec(f)
      if (m) {
        max = Math.max(max, Number(m[1]))
      }
    }
    return String(max + 1).padStart(4, '0')
  }

  async writeDecision(nnnn, slug, markdown) {
    if (!/^\d{4}$/.test(nnnn)) {
      throw new Error(`writeDecision: number must be NNNN, got: ${nnnn}`)
    }
    if (typeof slug !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
      throw new Error(`writeDecision: slug must match ^[a-z0-9][a-z0-9-]*$, got: ${slug}`)
    }
    const path = join(this.rootDir, 'decisions', decisionFileName(nnnn, slug))
    await atomicWriteFile(path, markdown)
    return path
  }

  async readDecision(nnnn) {
    const files = await this.#listDir('decisions')
    const match = files.find((f) => f.startsWith(`${nnnn}-`) && f.endsWith('.md'))
    if (!match) {
      return null
    }
    return readFile(join(this.rootDir, 'decisions', match), 'utf8')
  }

  async listDecisions() {
    const files = await this.#listDir('decisions')
    return files
      .map((f) => /^(\d{4})-(.+)\.md$/.exec(f))
      .filter(Boolean)
      .map((m) => ({ nnnn: m[1], slug: m[2] }))
      .sort((a, b) => a.nnnn.localeCompare(b.nnnn))
  }

  async appendSessionEvent(threadId, isoTs, actor, markdown) {
    if (!isUlid(threadId)) {
      throw new Error('appendSessionEvent: threadId must be a ULID')
    }
    const safeActor = String(actor).replace(/[^a-zA-Z0-9._-]/g, '-')
    const fileTs = String(isoTs).replace(/[:.]/g, '-')
    const dir = sessionDir(this.rootDir, threadId)
    await mkdir(dir, { recursive: true })
    const path = join(dir, `${fileTs}--${safeActor}.md`)
    const body = markdown.endsWith('\n') ? markdown : `${markdown}\n`
    await appendFile(path, body)
    return path
  }

  async readIndexFile(name) {
    this.#assertIndexName(name)
    const rec = await this.#readJson(indexPath(this.rootDir, name))
    if (rec !== null) {
      return rec
    }
    return name === 'resumable' ? [] : {}
  }

  async writeIndexFile(name, obj) {
    this.#assertIndexName(name)
    await atomicWriteFile(indexPath(this.rootDir, name), serializeRecord(obj))
    return obj
  }

  #assertIndexName(name) {
    if (!INDEX_NAMES.includes(name)) {
      throw new Error(`unknown index file: ${name}`)
    }
  }

  async commit(message) {
    return { committed: false }
  }

  async sync() {
    return { synced: false }
  }

  async observeBranch(binding) {
    throw new Error('observeBranch: git drivers only')
  }

  async observeNewBranch(repo, branch) {
    throw new Error('observeNewBranch: git drivers only')
  }

  async listRepoBranches(repo) {
    throw new Error('listRepoBranches: git drivers only')
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/unit/local-driver-aux.test.mjs`
Expected: PASS — 10 tests pass.

- [ ] **Step 6: Run the whole suite to catch regressions**

Run: `npm test`
Expected: PASS — every unit test green.

- [ ] **Step 7: Commit**

```bash
git add src/drivers/local-driver.mjs test/unit/local-driver-aux.test.mjs
git commit -m "feat: add LocalDriver decisions, sessions, and index storage"
```

---

### Task 14: Derived-index builder

**Files:**
- Create: `src/index/build-index.mjs`
- Test: `test/unit/build-index.test.mjs`

**Interfaces:**
- Consumes: a `StorageDriver` instance (for `rebuildIndex`); no schema import (operates on already-valid records).
- Produces: `buildIndex(threads, bindings): {'by-slug','by-branch','children','resumable'}` (pure; `by-slug` keeps the EARLIEST-created thread on slug collision — smallest ULID wins — so the §6.4 re-attach slug fallback is order-independent and stable); `rebuildIndex(driver): Promise<counts>` — lists records, builds, writes each index file, returns per-file counts. Consumed by Plan 03's `rebuild_index` tool and SessionStart.

- [ ] **Step 1: Write the failing test**

`test/unit/build-index.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildIndex, rebuildIndex } from '../../src/index/build-index.mjs'
import { LocalDriver } from '../../src/drivers/local-driver.mjs'
import { newThread } from '../../src/model/thread.mjs'
import { newBinding } from '../../src/model/binding.mjs'

const NOW = '2026-06-30T10:00:00Z'

test('buildIndex derives all four maps and only lists resumable statuses', () => {
  const root = newThread({ id: '01ARZ3NDEKTSV4RRFFQ69G5F00', slug: 'epic', title: 'Epic', status: 'active', now: NOW })
  const child = newThread({ id: '01ARZ3NDEKTSV4RRFFQ69G5F01', slug: 'child', title: 'Child', status: 'paused', parent_id: root.id, now: NOW })
  const closed = newThread({ id: '01ARZ3NDEKTSV4RRFFQ69G5F02', slug: 'old', title: 'Old', status: 'done', now: NOW })
  const b = newBinding({ id: '01ARZ3NDEKTSV4RRFFQ69G5F03', thread_id: root.id, repo: 'r', branch: 'feat/x', now: NOW })

  const idx = buildIndex([root, child, closed], [b])
  assert.deepEqual(idx['by-slug'], { epic: root.id, child: child.id, old: closed.id })
  assert.deepEqual(idx.children, { [root.id]: [child.id] })
  assert.deepEqual(idx['by-branch'], { 'r feat/x': [b.id] })
  assert.deepEqual(idx.resumable.map((r) => r.slug).sort(), ['child', 'epic'])
  assert.ok(idx.resumable.every((r) => 'next_step' in r))
})

test('by-slug keeps the earliest-created thread on slug collision', () => {
  const early = newThread({ id: '01ARZ3NDEKTSV4RRFFQ69G5F00', slug: 'dup', title: 'Early', now: NOW })
  const late = newThread({ id: '01ARZ3NDEKTSV4RRFFQ69G5F99', slug: 'dup', title: 'Late', now: NOW })
  const idx = buildIndex([late, early], [])
  assert.equal(idx['by-slug'].dup, early.id)
})

test('rebuildIndex writes files and returns counts', async () => {
  const root = join(await mkdtemp(join(tmpdir(), 'ledger-idx-')), 'ledger')
  const d = new LocalDriver(root)
  await d.init()
  await d.writeThread(newThread({ slug: 'a', title: 'A', status: 'active', now: NOW }))
  const counts = await rebuildIndex(d)
  assert.equal(counts['by-slug'], 1)
  assert.equal(counts.resumable, 1)
  assert.deepEqual(Object.keys(await d.readIndexFile('by-slug')), ['a'])
  await rm(root, { recursive: true, force: true })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/build-index.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/index/build-index.mjs`:

```js
const RESUMABLE = new Set(['active', 'paused', 'blocked'])

export function buildIndex(threads, bindings) {
  const bySlug = {}
  const children = {}
  const resumable = []
  for (const t of threads) {
    const existing = bySlug[t.slug]
    if (existing === undefined || t.id < existing) {
      bySlug[t.slug] = t.id
    }
    if (t.parent_id) {
      if (!children[t.parent_id]) {
        children[t.parent_id] = []
      }
      children[t.parent_id].push(t.id)
    }
    if (RESUMABLE.has(t.status)) {
      resumable.push({
        id: t.id,
        slug: t.slug,
        title: t.title,
        status: t.status,
        next_step: t.spine?.next_step ?? '',
      })
    }
  }
  const byBranch = {}
  for (const b of bindings) {
    const key = `${b.repo} ${b.branch}`
    if (!byBranch[key]) {
      byBranch[key] = []
    }
    byBranch[key].push(b.id)
  }
  return { 'by-slug': bySlug, 'by-branch': byBranch, children, resumable }
}

export async function rebuildIndex(driver) {
  const [threads, bindings] = await Promise.all([driver.listThreads(), driver.listBindings()])
  const index = buildIndex(threads, bindings)
  const counts = {}
  for (const name of Object.keys(index)) {
    await driver.writeIndexFile(name, index[name])
    const value = index[name]
    counts[name] = Array.isArray(value) ? value.length : Object.keys(value).length
  }
  return counts
}
```

Tie-break (`by-slug` slug collision): keep the EARLIEST-created thread — first-created wins. ULIDs are lexicographically time-ordered, so the smallest `id` is the earliest creation; `t.id < existing` keeps it. This is order-independent (the result does not depend on `listThreads()` readdir order), which is what makes the §6.4 re-attach slug fallback stable and deterministic. Plan 00 freezes this rule.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/build-index.test.mjs`
Expected: PASS — 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/index/build-index.mjs test/unit/build-index.test.mjs
git commit -m "feat: add derived-index builder"
```

---

### Task 15: Driver selector

**Files:**
- Create: `src/drivers/select-driver.mjs`
- Test: `test/unit/select-driver.test.mjs`

**Interfaces:**
- Consumes: `LocalDriver` (Task 12), `projectKey` (Task 4).
- Produces: `selectDriver(projectDir, userConfig?): StorageDriver`. In Plan 01 it returns a `LocalDriver` rooted at `<dataRoot>/<project-key>/ledger` for BOTH git and non-git projects (the git branch is added in Plan 02, which rewrites this function to return `GitRefDriver` when `isGitWorkTree(projectDir)` is true). `dataRoot` comes from `userConfig.dataRoot` or `process.env.CLAUDE_PLUGIN_DATA`.

- [ ] **Step 1: Write the failing test**

`test/unit/select-driver.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { selectDriver } from '../../src/drivers/select-driver.mjs'
import { LocalDriver } from '../../src/drivers/local-driver.mjs'

test('returns a LocalDriver rooted under dataRoot/<project-key>/ledger', async () => {
  const d = selectDriver('/Users/dev/proj', { dataRoot: '/data' })
  assert.ok(d instanceof LocalDriver)
  assert.equal(await d.root(), '/data/-Users-dev-proj/ledger')
})

test('falls back to CLAUDE_PLUGIN_DATA from the environment', async () => {
  const prev = process.env.CLAUDE_PLUGIN_DATA
  process.env.CLAUDE_PLUGIN_DATA = '/env-data'
  try {
    const d = selectDriver('/a/b')
    assert.equal(await d.root(), '/env-data/-a-b/ledger')
  } finally {
    if (prev === undefined) delete process.env.CLAUDE_PLUGIN_DATA
    else process.env.CLAUDE_PLUGIN_DATA = prev
  }
})

test('throws when no data root is available', () => {
  const prev = process.env.CLAUDE_PLUGIN_DATA
  delete process.env.CLAUDE_PLUGIN_DATA
  try {
    assert.throws(() => selectDriver('/a/b', {}), /CLAUDE_PLUGIN_DATA/)
  } finally {
    if (prev !== undefined) process.env.CLAUDE_PLUGIN_DATA = prev
  }
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/select-driver.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/drivers/select-driver.mjs`:

```js
import { join } from 'node:path'
import { LocalDriver } from './local-driver.mjs'
import { projectKey } from '../util/project-key.mjs'

export function selectDriver(projectDir, userConfig = {}) {
  const dataRoot = userConfig.dataRoot ?? process.env.CLAUDE_PLUGIN_DATA
  if (typeof dataRoot !== 'string' || dataRoot.trim() === '') {
    throw new Error('selectDriver requires CLAUDE_PLUGIN_DATA or userConfig.dataRoot')
  }
  const root = join(dataRoot, projectKey(projectDir), 'ledger')
  return new LocalDriver(root)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/select-driver.test.mjs`
Expected: PASS — 3 tests pass.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS — all Plan 01 unit tests green (ulid, atomic-write, project-key, git-exec, layout, validate, fsm, thread, binding, storage-driver, local-driver x2, build-index, select-driver).

- [ ] **Step 6: Commit**

```bash
git add src/drivers/select-driver.mjs test/unit/select-driver.test.mjs
git commit -m "feat: add automatic driver selection (LocalDriver baseline)"
```

---

## Plan 01 Self-Review

- **Spec coverage:** Non-git driver (S3) — `LocalDriver` + `selectDriver` with `vcs_ref=null`, no binding/drift required at this layer. Data model (A2) — recursive `Thread` with `parent_id`, dual ULID/slug identity, `external_refs[]` opaque bag. Guaranteed-valid state (A4 data plane) — schema validation on every write. FSM + DoD (Section 6.1) — `fsm.mjs`. Derived index (Section 7.1) — `build-index.mjs`. Atomic/immutable writes, small files, boundary validation (Constraints) — throughout. Deferred to later plans by design: git storage (02), MCP tool surface (03), hooks/trailer (04), drift/re-attach (05), skills/packaging/e2e (06).
- **Placeholder scan:** none — every step ships complete code and a concrete run command with expected output.
- **Type consistency:** `StorageDriver` method names in Task 11 match `LocalDriver` (Tasks 12–13) and Plan 00's interface exactly; index keys (`by-slug`/`by-branch`/`children`/`resumable`) are identical in `layout.INDEX_NAMES`, `buildIndex`, and the LocalDriver index methods; ULID pattern string is identical across `ulid.mjs`, both schemas; `newThread`/`newBinding` outputs validate against the same schemas the driver enforces on write.

**Downstream contract produced by Plan 01 (consumed by 02–06):** `selectDriver`, the `StorageDriver` interface + `LocalDriver`, `newThread`/`newBinding`, `validateThread`/`validateBinding`, `fsm` (`canTransition`/`isTerminal`/`dodSatisfied`/`ALLOWED_TRANSITIONS`), `layout` helpers, `git`/`isGitWorkTree`, `atomicWriteFile`, `newUlid`/`isUlid`, `buildIndex`/`rebuildIndex`.
