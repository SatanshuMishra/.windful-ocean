# Continuity v2 — Plan 02: GitRefDriver (orphan-branch default + custom-ref opt-in)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This is plan 2 of 6; the shared contract lives in `2026-06-30-continuity-v2-00-overview.md` and is authoritative for every schema, interface, and constraint referenced here. This plan depends on Plan 01 (`2026-06-30-continuity-v2-01-core-and-local-driver.md`) being complete.

**Goal:** Ship the git storage backend: `GitRefDriver`, satisfying the SAME `StorageDriver` interface Plan 01 defined, storing the ledger on a dedicated git ref reached through a detached side worktree. Two backends selected by `userConfig.ledger_backend`: orphan-branch (default, universally host-portable) and custom-ref (opt-in, `refs/ledger/*`). Implement `commit(message)` (detached-worktree add+commit, advance ref) and `sync()` (fetch → merge → CAS-push with bounded retry). Flip `selectDriver` to return `GitRefDriver` for git work trees.

**Architecture:** `GitRefDriver` **extends `LocalDriver`** — the records/decisions/session-logs/index are stored as plain files exactly as Plan 01 defined, but rooted in a git worktree checkout of the ledger ref. All record read/write/list/decision/session/index methods are inherited unchanged (the records ARE files); git versioning is layered on by the overridden `init()`, `commit()`, and `sync()`. The ledger ref is never checked out into the developer's working tree: the server materializes it with `git worktree add --detach` into a side directory outside the repo under `${CLAUDE_PLUGIN_DATA}`, so the feature branch carries no ledger files and `git status` in the user's tree stays clean. Because the orphan/custom ref shares nothing with feature branches, pruning/squashing/deleting any feature branch is a non-event for the ledger. All shared ledger files are disjoint (per-thread/per-binding/per-session), so concurrent pushes reconcile by a conflict-free merge; a compare-and-swap push (`--force-with-lease`) with bounded retry guards the cross-machine race.

**Tech Stack:** Node.js >= 20 (ESM), `node --test`, git via `child_process.execFile`/`execFileSync` (through Plan 01's `git`/`isGitWorkTree` wrapper + one new sync helper). No new runtime dependencies — the three pinned deps (`@modelcontextprotocol/sdk`, `ulid`, `ajv`) are unchanged; this plan adds none. Plain JS, no TypeScript, no build step.

## Global Constraints (verbatim from Plan 00 — apply to EVERY task)

- Runtime: Node.js >= 20, ES modules only (`.mjs`). No TypeScript. No build step.
- Tests: Node's built-in runner only — `node --test`. No jest/vitest/mocha.
- Dependencies: exactly three runtime deps across the whole plugin — `@modelcontextprotocol/sdk` (Plan 03), `ulid`, `ajv`. Pin EXACT versions (no `^`/`~`). A 4th dependency requires a plan amendment. **This plan adds no dependency: git is invoked as a subprocess, not linked.**
- No code comments anywhere (shebang / tooling-pragma / codegen-marker carve-outs only). No emojis. No AI attribution in commits.
- Immutability: never mutate a record in place; construct a new object and atomically write it. Small focused files (200–400 lines typical, 800 hard max). Comprehensive error handling; validate at every boundary; never silently swallow errors.
- All cross-references use a stable ULID (or a decision's stable NNNN). A slug or file path is NEVER a link target.
- Atomic writes: write to `<path>.tmp-<ulid>` then `rename()` over the target (POSIX atomic). Never partial-write a record. Append-only session logs are the one documented exception (`appendFile`).
- Storage is reached ONLY through the driver interface. No task outside a driver hard-codes a git command or a filesystem path. Within this plan, `GitRefDriver` and its `git-ledger` helpers ARE the storage layer, so they own the git commands.
- Commit cadence: one logical change per commit; Conventional Commits (`feat:`/`fix:`/`test:`/`refactor:`/`chore:`).

## Context to read first

- `2026-06-30-continuity-v2-00-overview.md` — the frozen shared contract: `StorageDriver` interface (every method signature), the driver-selection rule, canonical record schemas, the on-store layout, and the note that Plan 01 ships `selectDriver` returning `LocalDriver` for both branches "until Plan 02 lands GitRefDriver behind the git branch."
- Plan 01, "Downstream contract" (final section) — the exact symbols this plan consumes by name: `selectDriver`, `StorageDriver` + `LocalDriver`, `newThread`/`newBinding`, `layout` helpers (`SUBDIRS`, `INDEX_NAMES`), `git`/`isGitWorkTree`, `atomicWriteFile`, `newUlid`/`isUlid`, `buildIndex`/`rebuildIndex`.
- Plan 01 Task 5 (`git`/`isGitWorkTree`), Task 12–13 (`LocalDriver` — the class this plan extends), Task 15 (`selectDriver` — the function this plan rewrites).
- `docs/session-continuity-redesign/DESIGN-STATE.md` §4.2–4.7 (the storage tension, orphan-vs-custom-ref, the worktree mechanism, concurrency/CAS) and §7.1 (on-store layout).

## Design resolutions (the three open questions this plan closes)

**1. Custom-ref host support — when custom-ref is safe; why orphan-branch is the default.**
Git's default clone/fetch refspec is `+refs/heads/*:refs/remotes/origin/*`, a git-protocol default (not a host feature), so it transfers ONLY `refs/heads/*` — [git-scm.com/docs/git-clone](https://git-scm.com/docs/git-clone). A real branch under `refs/heads/*` is therefore guaranteed pushable/fetchable on EVERY host and auto-syncs with zero configuration — this is why **orphan-branch is the universally-safe default**. Custom-ref host acceptance of arbitrary `refs/ledger/*` pushes (neither `refs/heads/*` nor `refs/tags/*`) is host-dependent: **GitHub ACCEPTS** arbitrary custom refs — its ref-creation API only requires a name that "start[s] with `refs` and ha[s] at least two slashes" ([docs.github.com/en/rest/git/refs](https://docs.github.com/en/rest/git/refs)), corroborated by [community discussion #30507](https://github.com/orgs/community/discussions/30507) and real-world `refs/notes/*` pushes by [google/git-appraise](https://github.com/google/git-appraise); GitHub rejects only namespaces IT manages (`refs/pull/*` → `deny updating a hidden ref`). **GitLab** accepts non-reserved namespaces via the same unrestricted ref store (reserved names are `heads`/`tags`/`merge-requests`/`keep-around`/`environments`/`pipelines`), evidenced but not covered by a single doc — [GitLab keep-around-refs dev docs](https://docs.gitlab.com/development/merge_request_concepts/keep_around_refs/) — so treat as moderate-confidence. **Bitbucket Cloud is UNVERIFIED** (no resolving source found). Design consequence: custom-ref is OPT-IN, safe on hosts verified to accept non-heads/non-tags pushes (GitHub confirmed). The driver never assumes acceptance: a rejected first push to `refs/ledger/*` surfaces a clear error (the standard git push failure via the `git()` wrapper) so the user can flip `ledger_backend` back to `orphan-branch`. The storage backend sits behind the same interface, so switching is a config change, not a data migration.

**2. Worktree placement — outside the repo, under `${CLAUDE_PLUGIN_DATA}`.**
The ledger worktree is materialized at `${dataRoot}/<project-key>/ledger-worktree` (computed by `selectDriver`, outside the user's repo working directory), per DESIGN-STATE §4.6's "lean outside-repo" ruling. Consequences, all verified in this plan's tests: (a) a separate worktree has its own index/HEAD, so ledger writes never appear in the user's `git status`; (b) no `.gitignore`/`.git/info/exclude` churn is needed because the worktree is not inside the working tree; (c) `git worktree add` records bookkeeping under `<repo>/.git/worktrees/ledger-worktree`, invisible to status; (d) the worktree persists across sessions and is reused (idempotent `init()`), never re-added; `git worktree prune` runs before a fresh add to clear stale bookkeeping. A populated but UNREGISTERED leftover path from a crashed session is reclaimed by REMOVING it (`fs.rm(rootDir, { recursive: true, force: true })`) before `git worktree add`, because `git worktree add --force` does NOT clear a non-empty unregistered directory (it only overrides an already-registered / already-checked-out ref, not "destination exists and is not empty"); the add therefore runs WITHOUT `--force`.

**3. CAS-retry push — fetch, reconcile onto the fetched remote tip, `--force-with-lease` compare-and-swap, bounded retry.**
`sync()` runs a loop bounded by `MAX_SYNC_ATTEMPTS = 5`. Each attempt: read the local ledger tip; `git fetch origin +<ledgerRef>:<mirrorRef>` to capture the exact remote tip into a private mirror ref (absent remote ref → create case). Then: remote absent → plain push to create (rejection ⇒ a concurrent create won the race ⇒ retry); remote == local → nothing to push; remote is an ancestor of local (local ahead) → fast-forward push guarded by `--force-with-lease=<ledgerRef>:<remoteSha>`; local is an ancestor of remote (we are behind) → fast-forward the local ref/worktree to remote, nothing to push; otherwise TRUE DIVERGENCE → in the detached worktree, `git merge --no-verify --no-edit -X theirs <mirrorRef>` (`--no-verify` so the Plan 04 `commit-msg` trailer hook never brands the ledger merge commit — the same mechanism every ledger-side commit in this plan uses) (disjoint files reconcile cleanly; `-X theirs` plus a `.gitattributes merge=union` on the append-only session logs is belt-and-suspenders per DESIGN-STATE §4.7; the derived `index/*.json` files are NOT merged and carry NO `merge=union` — a same-line union of two JSON objects yields non-parseable JSON, so the derived index is `.gitignore`d inside the ledger worktree and rebuilt from records on startup, never entering git), advance the ledger ref to the merge commit, then push guarded by `--force-with-lease=<ledgerRef>:<remoteSha>`. The lease is the compare-and-swap: the push mutates the remote ref ONLY if it still equals the `<remoteSha>` we fetched and merged onto; if a concurrent push moved it, the lease fails and the loop retries with a fresh fetch. After `MAX_SYNC_ATTEMPTS` exhausted, `sync()` throws. Merge (not rebase) is chosen deliberately: disjoint files make the merge conflict-free, it never rewrites history (Pillar 1 robustness), and the lease still provides exact CAS.

**Deterministic bootstrap (C1).** The orphan root is minted DETERMINISTICALLY: `git commit-tree` over the well-known empty tree (`4b825dc642cb6eb9a060e54bf8d69288fbee4904`) with a FIXED author+committer identity, FIXED `GIT_AUTHOR_DATE`/`GIT_COMMITTER_DATE`, and a FIXED message, so every machine computes an IDENTICAL root SHA. Two clones that each `init()` before anyone pushes therefore share the same root commit; the first true-divergence `sync()` is an ordinary 3-way merge instead of dying on "refusing to merge unrelated histories". `--allow-unrelated-histories` is NEVER used — a genuinely unrelated root must surface as a loud error, not be silently merged into an add/add conflict storm.

## File Structure (this plan creates / modifies)

- Create: `src/drivers/git-ledger.mjs` — pure ref-name / backend / refspec helpers + tuning constants.
- Modify: `src/util/git-exec.mjs` — add `isGitWorkTreeSync(dir)` (keeps `selectDriver` synchronous, preserving Plan 01's signature and tests).
- Create: `src/drivers/git-ref-driver.mjs` — `class GitRefDriver extends LocalDriver`.
- Modify: `src/drivers/select-driver.mjs` — return `GitRefDriver` for git work trees, `LocalDriver` otherwise.
- Create: `test/unit/git-ledger.test.mjs`, `test/unit/git-exec-sync.test.mjs`, `test/unit/git-ref-driver-init.test.mjs`, `test/unit/git-ref-driver-commit.test.mjs`, `test/unit/git-ref-driver-sync.test.mjs`, `test/unit/git-ref-driver-merge.test.mjs`, `test/unit/git-ref-driver-custom-ref.test.mjs`, `test/unit/select-driver-git.test.mjs`, `test/unit/git-ref-driver-observe.test.mjs`.

Plan 01's `test/unit/select-driver.test.mjs` is NOT edited: its cases use non-existent paths, so `isGitWorkTreeSync` returns `false` and `selectDriver` still returns a `LocalDriver` rooted at `<dataRoot>/<project-key>/ledger` — those assertions remain green after the rewrite.

---

### Task 1: git-ledger pure helpers (ref names, backends, refspec, constants)

**Files:**
- Create: `src/drivers/git-ledger.mjs`
- Test: `test/unit/git-ledger.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces (all pure): `LEDGER_BACKENDS`, `DEFAULT_LEDGER_BRANCH`, `DEFAULT_REMOTE`, `MAX_SYNC_ATTEMPTS`, `assertBackend(backend)`, `ledgerRefName(backend, branch)`, `mirrorRefName(branch)`, `fetchRefspecFor(backend)`. Consumed by `GitRefDriver` (Tasks 3–7) and `selectDriver` (Task 8); `ledgerRefName`/backend helpers are available to Plan 05's `reconcile`.

- [ ] **Step 1: Write the failing test**

`test/unit/git-ledger.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  LEDGER_BACKENDS, DEFAULT_LEDGER_BRANCH, DEFAULT_REMOTE, MAX_SYNC_ATTEMPTS,
  assertBackend, ledgerRefName, mirrorRefName, fetchRefspecFor,
} from '../../src/drivers/git-ledger.mjs'

test('backend constants and defaults are pinned', () => {
  assert.deepEqual(LEDGER_BACKENDS, ['orphan-branch', 'custom-ref'])
  assert.equal(DEFAULT_LEDGER_BRANCH, '_ledger')
  assert.equal(DEFAULT_REMOTE, 'origin')
  assert.equal(MAX_SYNC_ATTEMPTS, 5)
})

test('ledgerRefName maps each backend to its ref namespace', () => {
  assert.equal(ledgerRefName('orphan-branch', '_ledger'), 'refs/heads/_ledger')
  assert.equal(ledgerRefName('custom-ref', '_ledger'), 'refs/ledger/_ledger')
  assert.equal(ledgerRefName('custom-ref', 'state'), 'refs/ledger/state')
})

test('ledgerRefName rejects an unknown backend or empty branch', () => {
  assert.throws(() => ledgerRefName('bogus', '_ledger'), /unknown ledger backend/)
  assert.throws(() => ledgerRefName('orphan-branch', ''), /branch/)
  assert.throws(() => ledgerRefName('orphan-branch', '   '), /branch/)
})

test('mirrorRefName is the private per-branch sync scratch ref', () => {
  assert.equal(mirrorRefName('_ledger'), 'refs/ledger-mirror/_ledger')
  assert.throws(() => mirrorRefName(''), /branch/)
})

test('fetchRefspecFor installs a custom-ref refspec only for custom-ref', () => {
  assert.equal(fetchRefspecFor('custom-ref'), '+refs/ledger/*:refs/ledger-remote/*')
  assert.equal(fetchRefspecFor('orphan-branch'), null)
})

test('assertBackend returns valid backends and throws otherwise', () => {
  assert.equal(assertBackend('orphan-branch'), 'orphan-branch')
  assert.equal(assertBackend('custom-ref'), 'custom-ref')
  assert.throws(() => assertBackend('nope'), /unknown ledger backend/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/git-ledger.test.mjs`
Expected: FAIL — cannot import from `../../src/drivers/git-ledger.mjs` (module not found).

- [ ] **Step 3: Write the implementation**

`src/drivers/git-ledger.mjs`:

```js
export const LEDGER_BACKENDS = ['orphan-branch', 'custom-ref']
export const DEFAULT_LEDGER_BRANCH = '_ledger'
export const DEFAULT_REMOTE = 'origin'
export const MAX_SYNC_ATTEMPTS = 5

const MIRROR_PREFIX = 'refs/ledger-mirror'
const CUSTOM_REF_FETCH_REFSPEC = '+refs/ledger/*:refs/ledger-remote/*'

export function assertBackend(backend) {
  if (!LEDGER_BACKENDS.includes(backend)) {
    throw new Error(`unknown ledger backend: ${backend}`)
  }
  return backend
}

function requireBranch(branch) {
  if (typeof branch !== 'string' || branch.trim() === '') {
    throw new Error('ledger branch must be a non-empty string')
  }
  return branch
}

export function ledgerRefName(backend, branch) {
  assertBackend(backend)
  requireBranch(branch)
  return backend === 'custom-ref' ? `refs/ledger/${branch}` : `refs/heads/${branch}`
}

export function mirrorRefName(branch) {
  requireBranch(branch)
  return `${MIRROR_PREFIX}/${branch}`
}

export function fetchRefspecFor(backend) {
  assertBackend(backend)
  return backend === 'custom-ref' ? CUSTOM_REF_FETCH_REFSPEC : null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/git-ledger.test.mjs`
Expected: PASS — 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/drivers/git-ledger.mjs test/unit/git-ledger.test.mjs
git commit -m "feat: add git-ledger ref-name and backend helpers"
```

---

### Task 2: synchronous work-tree detection

**Files:**
- Modify: `src/util/git-exec.mjs`
- Test: `test/unit/git-exec-sync.test.mjs`

**Interfaces:**
- Consumes: `node:child_process` (`execFileSync`).
- Produces: `isGitWorkTreeSync(dir): boolean` — a synchronous sibling of Plan 01's async `isGitWorkTree`, so `selectDriver` (Task 8) stays synchronous and Plan 01's `selectDriver` signature and tests are preserved. Never throws; returns `false` on any error.

- [ ] **Step 1: Write the failing test**

`test/unit/git-exec-sync.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { git, isGitWorkTreeSync } from '../../src/util/git-exec.mjs'

test('isGitWorkTreeSync is true inside a repo, false outside', async () => {
  const repo = await mkdtemp(join(tmpdir(), 'ledger-gitsync-'))
  await git(['init', repo])
  assert.equal(isGitWorkTreeSync(repo), true)
  const plain = await mkdtemp(join(tmpdir(), 'ledger-plainsync-'))
  assert.equal(isGitWorkTreeSync(plain), false)
  await rm(repo, { recursive: true, force: true })
  await rm(plain, { recursive: true, force: true })
})

test('isGitWorkTreeSync returns false for a non-existent path', () => {
  assert.equal(isGitWorkTreeSync('/nonexistent/path/xyz-123'), false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/git-exec-sync.test.mjs`
Expected: FAIL — `isGitWorkTreeSync` is not exported by `../../src/util/git-exec.mjs`.

- [ ] **Step 3: Extend the implementation**

In `src/util/git-exec.mjs`, replace the `node:child_process` import line:

```js
import { execFile, execFileSync } from 'node:child_process'
```

Then append this export to the end of the file:

```js
export function isGitWorkTreeSync(dir) {
  try {
    const out = execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd: dir,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return out.toString().trim() === 'true'
  } catch {
    return false
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/git-exec-sync.test.mjs`
Expected: PASS — 2 tests pass. Also run `node --test test/unit/git-exec.test.mjs` — Plan 01's git-exec tests still PASS (the change is additive).

- [ ] **Step 5: Commit**

```bash
git add src/util/git-exec.mjs test/unit/git-exec-sync.test.mjs
git commit -m "feat: add synchronous git work-tree detection"
```

---

### Task 3: GitRefDriver — constructor, isGit/root, init (orphan-branch)

**Files:**
- Create: `src/drivers/git-ref-driver.mjs`
- Test: `test/unit/git-ref-driver-init.test.mjs`

**Interfaces:**
- Consumes: `LocalDriver` (Plan 01 Task 12), `git` (Plan 01 Task 5), `atomicWriteFile` (Plan 01 Task 3), and from `git-ledger` (Task 1): `assertBackend`, `ledgerRefName`, `mirrorRefName`, `DEFAULT_LEDGER_BRANCH`, `DEFAULT_REMOTE`.
- Produces: `class GitRefDriver extends LocalDriver` with `isGit() -> true`, inherited `root()` (the worktree path), and `init()` which ensures the orphan ledger ref exists — minting a DETERMINISTIC root (fixed identity + fixed dates over the well-known empty tree `4b825dc642cb6eb9a060e54bf8d69288fbee4904`, so the root SHA is identical on every machine; C1), or adopting the remote tip when the remote already carries the ledger ref — materializes a detached worktree outside the repo (reclaiming a crash-left populated unregistered path via `fs.rm` first; M10), creates the ledger subdirectories inside it, and writes + COMMITS (idempotently, via the same fixed identity so the scaffold commit is also deterministic; `--no-verify`) the belt-and-suspenders `.gitattributes` plus a `.gitignore` that excludes the derived `index/` (H7 — an uncommitted scaffold would leave the worktree dirty and break the "empty commit is a no-op" invariant). Record/decision/session/index read/write/list methods are inherited from `LocalDriver` (records ARE files, now rooted in the worktree). `commit()`/`sync()` are added in Tasks 4–6; `observeBranch`/`observeNewBranch` in Task 9.

- [ ] **Step 1: Write the failing test**

`test/unit/git-ref-driver-init.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, stat, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { git } from '../../src/util/git-exec.mjs'
import { GitRefDriver } from '../../src/drivers/git-ref-driver.mjs'
import { newThread } from '../../src/model/thread.mjs'

const NOW = '2026-06-30T10:00:00Z'

async function fixtureRepo() {
  const base = await mkdtemp(join(tmpdir(), 'ledger-gitdrv-'))
  const repo = join(base, 'repo')
  await git(['init', repo])
  await git(['config', 'user.name', 'Test'], { cwd: repo })
  await git(['config', 'user.email', 'test@example.com'], { cwd: repo })
  await git(['commit', '--allow-empty', '-m', 'feat: initial'], { cwd: repo })
  return { base, repo }
}

function driverFor(base, repo, overrides = {}) {
  return new GitRefDriver({
    repoDir: repo,
    worktreeDir: join(base, 'ledger-worktree'),
    backend: 'orphan-branch',
    branch: '_ledger',
    remote: 'origin',
    ...overrides,
  })
}

test('isGit is true and root is the side worktree checkout', async () => {
  const { base, repo } = await fixtureRepo()
  const d = driverFor(base, repo)
  await d.init()
  assert.equal(d.isGit(), true)
  assert.equal(await d.root(), join(base, 'ledger-worktree'))
  await rm(base, { recursive: true, force: true })
})

test('the constructor rejects a bad backend or missing paths', () => {
  assert.throws(() => new GitRefDriver({ repoDir: '/r', worktreeDir: '/w', backend: 'nope' }), /unknown ledger backend/)
  assert.throws(() => new GitRefDriver({ worktreeDir: '/w' }), /repoDir/)
  assert.throws(() => new GitRefDriver({ repoDir: '/r' }), /worktreeDir/)
})

test('init creates an orphan ledger ref and a detached worktree with subdirs', async () => {
  const { base, repo } = await fixtureRepo()
  const d = driverFor(base, repo)
  await d.init()
  const ref = (await git(['rev-parse', '--verify', 'refs/heads/_ledger'], { cwd: repo })).trim()
  assert.match(ref, /^[0-9a-f]{40}$/)
  const head = (await git(['rev-parse', 'HEAD'], { cwd: await d.root() })).trim()
  assert.equal(head, ref)
  for (const sub of ['threads', 'bindings', 'decisions', 'sessions', 'index']) {
    assert.ok((await stat(join(await d.root(), sub))).isDirectory())
  }
  await rm(base, { recursive: true, force: true })
})

test('init leaves the user working tree untouched and is idempotent', async () => {
  const { base, repo } = await fixtureRepo()
  const d = driverFor(base, repo)
  await d.init()
  await d.init()
  assert.equal((await git(['status', '--porcelain'], { cwd: repo })).trim(), '')
  const branch = (await git(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repo })).trim()
  assert.notEqual(branch, '_ledger')
  await rm(base, { recursive: true, force: true })
})

test('records written through the driver land in the worktree, not the user tree', async () => {
  const { base, repo } = await fixtureRepo()
  const d = driverFor(base, repo)
  await d.init()
  const t = newThread({ slug: 's', title: 'T', now: NOW })
  await d.writeThread(t)
  assert.deepEqual(await d.readThread(t.id), t)
  assert.deepEqual((await d.listThreads()).map((x) => x.id), [t.id])
  assert.equal((await git(['status', '--porcelain'], { cwd: repo })).trim(), '')
  await rm(base, { recursive: true, force: true })
})

test('init reclaims a populated unregistered worktree path left by a crashed session (M10)', async () => {
  const { base, repo } = await fixtureRepo()
  const worktreeDir = join(base, 'ledger-worktree')
  await mkdir(worktreeDir, { recursive: true })
  await writeFile(join(worktreeDir, 'stale.txt'), 'leftover from a crashed session')
  const d = driverFor(base, repo)
  await d.init()
  assert.equal(d.isGit(), true)
  assert.equal(await d.root(), worktreeDir)
  const head = (await git(['rev-parse', 'HEAD'], { cwd: await d.root() })).trim()
  const ref = (await git(['rev-parse', 'refs/heads/_ledger'], { cwd: repo })).trim()
  assert.equal(head, ref)
  assert.equal((await git(['status', '--porcelain'], { cwd: await d.root() })).trim(), '')
  await rm(base, { recursive: true, force: true })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/git-ref-driver-init.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/drivers/git-ref-driver.mjs`:

```js
import { join } from 'node:path'
import { rm } from 'node:fs/promises'
import { LocalDriver } from './local-driver.mjs'
import { git } from '../util/git-exec.mjs'
import { atomicWriteFile } from '../util/atomic-write.mjs'
import {
  assertBackend, ledgerRefName, mirrorRefName,
  DEFAULT_LEDGER_BRANCH, DEFAULT_REMOTE,
} from './git-ledger.mjs'

const EMPTY_TREE_SHA = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
const LEDGER_ROOT_MESSAGE = 'chore: initialize continuity ledger'
const LEDGER_SCAFFOLD_MESSAGE = 'chore: ledger merge policy'
const LEDGER_INIT_IDENTITY = Object.freeze({
  GIT_AUTHOR_NAME: 'Continuity Ledger',
  GIT_AUTHOR_EMAIL: 'ledger@continuity.invalid',
  GIT_AUTHOR_DATE: '2020-01-01T00:00:00Z',
  GIT_COMMITTER_NAME: 'Continuity Ledger',
  GIT_COMMITTER_EMAIL: 'ledger@continuity.invalid',
  GIT_COMMITTER_DATE: '2020-01-01T00:00:00Z',
})

const GITATTRIBUTES = [
  'sessions/**/*.md merge=union',
  '',
].join('\n')

const GITIGNORE = [
  'index/',
  '',
].join('\n')

export class GitRefDriver extends LocalDriver {
  constructor(options = {}) {
    const {
      repoDir, worktreeDir,
      backend = 'orphan-branch',
      branch = DEFAULT_LEDGER_BRANCH,
      remote = DEFAULT_REMOTE,
    } = options
    if (typeof repoDir !== 'string' || repoDir.trim() === '') {
      throw new Error('GitRefDriver requires a repoDir')
    }
    if (typeof worktreeDir !== 'string' || worktreeDir.trim() === '') {
      throw new Error('GitRefDriver requires a worktreeDir')
    }
    assertBackend(backend)
    super(worktreeDir)
    this.repoDir = repoDir
    this.backend = backend
    this.branch = branch
    this.remote = remote
    this.ledgerRef = ledgerRefName(backend, branch)
    this.mirrorRef = mirrorRefName(branch)
  }

  isGit() {
    return true
  }

  async init() {
    await this.#ensureLedgerRef()
    await this.#ensureWorktree()
    await super.init()
    await this.#ensureLedgerScaffold()
    return this.rootDir
  }

  async #ensureLedgerRef() {
    if (await this.#refExists(this.ledgerRef)) {
      return
    }
    if (await this.#hasRemote()) {
      const remoteSha = await this.#fetchRemoteTip()
      if (remoteSha !== null) {
        await git(['update-ref', this.ledgerRef, remoteSha], { cwd: this.repoDir })
        return
      }
    }
    const initSha = (await git(
      ['commit-tree', EMPTY_TREE_SHA, '-m', LEDGER_ROOT_MESSAGE],
      { cwd: this.repoDir, env: { ...process.env, ...LEDGER_INIT_IDENTITY } },
    )).trim()
    await git(['update-ref', this.ledgerRef, initSha], { cwd: this.repoDir })
  }

  async #ensureWorktree() {
    if (await this.#isRegisteredWorktree()) {
      await git(['checkout', '--detach', this.ledgerRef], { cwd: this.rootDir })
      return
    }
    await git(['worktree', 'prune'], { cwd: this.repoDir })
    await rm(this.rootDir, { recursive: true, force: true })
    await git(['worktree', 'add', '--detach', this.rootDir, this.ledgerRef], { cwd: this.repoDir })
  }

  async #ensureLedgerScaffold() {
    await atomicWriteFile(join(this.rootDir, '.gitattributes'), GITATTRIBUTES)
    await atomicWriteFile(join(this.rootDir, '.gitignore'), GITIGNORE)
    await git(['add', '.gitattributes', '.gitignore'], { cwd: this.rootDir })
    if (await this.#nothingStaged()) {
      return
    }
    await git(
      ['commit', '--no-verify', '-m', LEDGER_SCAFFOLD_MESSAGE],
      { cwd: this.rootDir, env: { ...process.env, ...LEDGER_INIT_IDENTITY } },
    )
    const sha = (await git(['rev-parse', 'HEAD'], { cwd: this.rootDir })).trim()
    await git(['update-ref', this.ledgerRef, sha], { cwd: this.repoDir })
  }

  async #nothingStaged() {
    try {
      await git(['diff', '--cached', '--quiet'], { cwd: this.rootDir })
      return true
    } catch {
      return false
    }
  }

  async #fetchRemoteTip() {
    let listing
    try {
      listing = (await git(['ls-remote', this.remote, this.ledgerRef], { cwd: this.repoDir })).trim()
    } catch (err) {
      throw new Error(`sync: unable to reach remote '${this.remote}' for ${this.ledgerRef}: ${err.message}`)
    }
    if (listing === '') {
      return null
    }
    await git(['fetch', this.remote, `+${this.ledgerRef}:${this.mirrorRef}`], { cwd: this.repoDir })
    return (await git(['rev-parse', this.mirrorRef], { cwd: this.repoDir })).trim()
  }

  async #hasRemote() {
    try {
      await git(['remote', 'get-url', this.remote], { cwd: this.repoDir })
      return true
    } catch {
      return false
    }
  }

  async #refExists(ref) {
    try {
      await git(['rev-parse', '--verify', '--quiet', ref], { cwd: this.repoDir })
      return true
    } catch {
      return false
    }
  }

  async #isRegisteredWorktree() {
    try {
      const out = await git(['rev-parse', '--is-inside-work-tree'], { cwd: this.rootDir })
      return out.trim() === 'true'
    } catch {
      return false
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/git-ref-driver-init.test.mjs`
Expected: PASS — 6 tests pass. `#ensureLedgerRef` mints the root over the fixed empty tree with the fixed identity/dates in `LEDGER_INIT_IDENTITY`, `#ensureWorktree` removes any populated unregistered leftover before `git worktree add`, and `#ensureLedgerScaffold` commits `.gitattributes` + `.gitignore` so the worktree is clean.

> NOTE (cross-plan dependency): the deterministic root/scaffold commits pass `env` to the `git()` wrapper (`git(args, { cwd, env })`, merged over `process.env`) — the only way to pin `GIT_AUTHOR_DATE`/`GIT_COMMITTER_DATE` (there is no config/`-c` equivalent for commit dates). Plan 01's `git()` MUST forward an `env` option onto the `execFile` options; confirm this when implementing, and extend `git()` if it does not (additive, no signature change).

- [ ] **Step 5: Commit**

```bash
git add src/drivers/git-ref-driver.mjs test/unit/git-ref-driver-init.test.mjs
git commit -m "feat: add GitRefDriver init with detached ledger worktree"
```

---

### Task 4: GitRefDriver.commit — detached-worktree add + commit, advance ref

**Files:**
- Modify: `src/drivers/git-ref-driver.mjs`
- Test: `test/unit/git-ref-driver-commit.test.mjs`

**Interfaces:**
- Consumes: everything Task 3 imported.
- Produces (added to `GitRefDriver`): `async commit(message)` — stages every change in the worktree (`git add -A`), and if nothing is staged returns `{ committed: false, sha: null, empty: true }`; otherwise commits with `--no-verify` (so the Plan 04 `commit-msg` trailer hook never adds a `Thread-Id:` to a ledger commit), reads the new SHA, advances the ledger ref via `git update-ref`, and returns `{ committed: true, sha, empty: false }`. Rejects an empty message. Reuses the `#nothingStaged` private already defined in Task 3 (init's scaffold commit); it is not redefined here.

- [ ] **Step 1: Write the failing test**

`test/unit/git-ref-driver-commit.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, mkdir, writeFile, chmod } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { git } from '../../src/util/git-exec.mjs'
import { GitRefDriver } from '../../src/drivers/git-ref-driver.mjs'
import { newThread } from '../../src/model/thread.mjs'

const NOW = '2026-06-30T10:00:00Z'

async function fixtureRepo() {
  const base = await mkdtemp(join(tmpdir(), 'ledger-commit-'))
  const repo = join(base, 'repo')
  await git(['init', repo])
  await git(['config', 'user.name', 'Test'], { cwd: repo })
  await git(['config', 'user.email', 'test@example.com'], { cwd: repo })
  await git(['commit', '--allow-empty', '-m', 'feat: initial'], { cwd: repo })
  return { base, repo }
}

function driverFor(base, repo) {
  return new GitRefDriver({ repoDir: repo, worktreeDir: join(base, 'ledger-worktree'), backend: 'orphan-branch', branch: '_ledger', remote: 'origin' })
}

test('commit stages the worktree, advances the ledger ref, returns the sha', async () => {
  const { base, repo } = await fixtureRepo()
  const d = driverFor(base, repo)
  await d.init()
  await d.writeThread(newThread({ slug: 's', title: 'T', now: NOW }))
  const res = await d.commit('chore: ledger update')
  assert.equal(res.committed, true)
  assert.equal(res.empty, false)
  assert.match(res.sha, /^[0-9a-f]{40}$/)
  const ref = (await git(['rev-parse', 'refs/heads/_ledger'], { cwd: repo })).trim()
  assert.equal(ref, res.sha)
  await rm(base, { recursive: true, force: true })
})

test('init commits the scaffold so the worktree is clean and an empty commit is a no-op (H7)', async () => {
  const { base, repo } = await fixtureRepo()
  const d = driverFor(base, repo)
  await d.init()
  assert.equal((await git(['status', '--porcelain'], { cwd: await d.root() })).trim(), '')
  assert.deepEqual(await d.commit('chore: empty'), { committed: false, sha: null, empty: true })
  await rm(base, { recursive: true, force: true })
})

test('commit rejects an empty message', async () => {
  const { base, repo } = await fixtureRepo()
  const d = driverFor(base, repo)
  await d.init()
  await assert.rejects(() => d.commit('   '), /message/)
  await rm(base, { recursive: true, force: true })
})

test('commit uses --no-verify so ledger commits never carry a Thread-Id trailer', async () => {
  const { base, repo } = await fixtureRepo()
  const hooks = join(base, 'hooks')
  await mkdir(hooks, { recursive: true })
  await writeFile(join(hooks, 'commit-msg'), '#!/bin/sh\nprintf "\\nThread-Id: 01ARZ3NDEKTSV4RRFFQ69G5FAV\\n" >> "$1"\n')
  await chmod(join(hooks, 'commit-msg'), 0o755)
  await git(['config', 'core.hooksPath', hooks], { cwd: repo })
  const d = driverFor(base, repo)
  await d.init()
  await d.writeThread(newThread({ slug: 's', title: 'T', now: NOW }))
  await d.commit('chore: ledger update')
  const msg = (await git(['log', '-1', '--format=%B', 'refs/heads/_ledger'], { cwd: repo })).trim()
  assert.equal(msg, 'chore: ledger update')
  assert.ok(!msg.includes('Thread-Id'))
  await rm(base, { recursive: true, force: true })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/git-ref-driver-commit.test.mjs`
Expected: FAIL — `d.commit` inherits the `LocalDriver` no-op (`{ committed: false }`), so the round-trip and ref-advance assertions fail.

- [ ] **Step 3: Add the commit method**

Insert this method into the `GitRefDriver` class body (after `init()`). `#nothingStaged` is ALREADY defined in Task 3 (init's scaffold commit reuses it), so it is NOT redefined here — reuse the existing private:

```js
  async commit(message) {
    if (typeof message !== 'string' || message.trim() === '') {
      throw new Error('commit: message must be a non-empty string')
    }
    await git(['add', '-A'], { cwd: this.rootDir })
    if (await this.#nothingStaged()) {
      return { committed: false, sha: null, empty: true }
    }
    await git(['commit', '--no-verify', '-m', message], { cwd: this.rootDir })
    const sha = (await git(['rev-parse', 'HEAD'], { cwd: this.rootDir })).trim()
    await git(['update-ref', this.ledgerRef, sha], { cwd: this.repoDir })
    return { committed: true, sha, empty: false }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/git-ref-driver-commit.test.mjs`
Expected: PASS — 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/drivers/git-ref-driver.mjs test/unit/git-ref-driver-commit.test.mjs
git commit -m "feat: add GitRefDriver.commit via detached worktree"
```

---

### Task 5: GitRefDriver.sync — create / fast-forward / no-op / no-remote

**Files:**
- Modify: `src/drivers/git-ref-driver.mjs`
- Test: `test/unit/git-ref-driver-sync.test.mjs`

**Interfaces:**
- Consumes: everything so far, plus `MAX_SYNC_ATTEMPTS` from `git-ledger`.
- Produces (added to `GitRefDriver`): `async sync()` returning `{ synced, pushed, merged, remote, attempts }`. This task lands the non-divergent paths: no remote → `{ synced:false, pushed:false, merged:false, remote:false, attempts:0 }`; remote ledger ref absent → create-push; remote is an ancestor of local → `--force-with-lease` fast-forward push; local == remote → nothing to push. The divergence branch is delegated to a `#reconcileDivergence` stub (thrown-not-implemented) that Task 6 replaces. Helpers added: `#tryPush`, `#isAncestor`.

- [ ] **Step 1: Write the failing test**

`test/unit/git-ref-driver-sync.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { git } from '../../src/util/git-exec.mjs'
import { GitRefDriver } from '../../src/drivers/git-ref-driver.mjs'
import { newThread } from '../../src/model/thread.mjs'

const NOW = '2026-06-30T10:00:00Z'

async function fixtureRepo(withRemote) {
  const base = await mkdtemp(join(tmpdir(), 'ledger-sync-'))
  const repo = join(base, 'repo')
  await git(['init', repo])
  await git(['config', 'user.name', 'Test'], { cwd: repo })
  await git(['config', 'user.email', 'test@example.com'], { cwd: repo })
  await git(['commit', '--allow-empty', '-m', 'feat: initial'], { cwd: repo })
  if (withRemote) {
    const remote = join(base, 'remote.git')
    await git(['init', '--bare', remote])
    await git(['remote', 'add', 'origin', remote], { cwd: repo })
    return { base, repo, remote }
  }
  return { base, repo }
}

function driverFor(base, repo) {
  return new GitRefDriver({ repoDir: repo, worktreeDir: join(base, 'ledger-worktree'), backend: 'orphan-branch', branch: '_ledger', remote: 'origin' })
}

test('sync without a remote is a no-op', async () => {
  const { base, repo } = await fixtureRepo(false)
  const d = driverFor(base, repo)
  await d.init()
  assert.deepEqual(await d.sync(), { synced: false, pushed: false, merged: false, remote: false, attempts: 0 })
  await rm(base, { recursive: true, force: true })
})

test('first sync creates the remote ledger ref; a clean re-sync pushes nothing', async () => {
  const { base, repo, remote } = await fixtureRepo(true)
  const d = driverFor(base, repo)
  await d.init()
  await d.writeThread(newThread({ slug: 's', title: 'T', now: NOW }))
  await d.commit('chore: first')
  const first = await d.sync()
  assert.deepEqual(first, { synced: true, pushed: true, merged: false, remote: true, attempts: 1 })
  const local = (await git(['rev-parse', 'refs/heads/_ledger'], { cwd: repo })).trim()
  const onRemote = (await git(['rev-parse', 'refs/heads/_ledger'], { cwd: remote })).trim()
  assert.equal(onRemote, local)
  const again = await d.sync()
  assert.equal(again.synced, true)
  assert.equal(again.pushed, false)
  assert.equal(again.merged, false)
  await rm(base, { recursive: true, force: true })
})

test('sync fast-forwards the remote when local is strictly ahead', async () => {
  const { base, repo, remote } = await fixtureRepo(true)
  const d = driverFor(base, repo)
  await d.init()
  await d.writeThread(newThread({ slug: 'a', title: 'A', now: NOW }))
  await d.commit('chore: a')
  await d.sync()
  await d.writeThread(newThread({ slug: 'b', title: 'B', now: NOW }))
  await d.commit('chore: b')
  const res = await d.sync()
  assert.equal(res.pushed, true)
  assert.equal(res.merged, false)
  const local = (await git(['rev-parse', 'refs/heads/_ledger'], { cwd: repo })).trim()
  assert.equal((await git(['rev-parse', 'refs/heads/_ledger'], { cwd: remote })).trim(), local)
  await rm(base, { recursive: true, force: true })
})

test('sync throws on an unreachable remote instead of misreading it as an absent ref (LOW)', async () => {
  const { base, repo } = await fixtureRepo(false)
  const d = driverFor(base, repo)
  await d.init()
  await git(['remote', 'add', 'origin', join(base, 'nope.git')], { cwd: repo })
  await d.writeThread(newThread({ slug: 's', title: 'T', now: NOW }))
  await d.commit('chore: c')
  await assert.rejects(() => d.sync(), /unable to reach remote/)
  await rm(base, { recursive: true, force: true })
})
```

The last test drives the LOW `#fetchRemoteTip` fix: `init()` mints the local root first (no remote yet), then an unreachable `origin` is added. `#fetchRemoteTip` probes with `git ls-remote` — a genuinely absent ledger ref returns empty output (null → create), but an unreachable remote makes `ls-remote` exit non-zero, which `#fetchRemoteTip` re-throws rather than collapsing to `null`. This prevents a transient network failure from being misread as "remote ledger ref absent" and spuriously minting/creating a divergent history.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/git-ref-driver-sync.test.mjs`
Expected: FAIL — `d.sync` inherits the `LocalDriver` no-op (`{ synced:false }`), so the shape and push assertions fail.

- [ ] **Step 3: Extend the imports**

In `src/drivers/git-ref-driver.mjs`, replace the `./git-ledger.mjs` import block with:

```js
import {
  assertBackend, ledgerRefName, mirrorRefName,
  DEFAULT_LEDGER_BRANCH, DEFAULT_REMOTE, MAX_SYNC_ATTEMPTS,
} from './git-ledger.mjs'
```

- [ ] **Step 4: Add the sync method and its helpers**

Insert these methods into the `GitRefDriver` class body (after `commit()`):

```js
  async sync() {
    if (!(await this.#hasRemote())) {
      return { synced: false, pushed: false, merged: false, remote: false, attempts: 0 }
    }
    for (let attempt = 1; attempt <= MAX_SYNC_ATTEMPTS; attempt += 1) {
      const localSha = (await git(['rev-parse', this.ledgerRef], { cwd: this.repoDir })).trim()
      const remoteSha = await this.#fetchRemoteTip()
      if (remoteSha === null) {
        if (await this.#tryPush(localSha, null)) {
          return { synced: true, pushed: true, merged: false, remote: true, attempts: attempt }
        }
        continue
      }
      if (remoteSha === localSha) {
        return { synced: true, pushed: false, merged: false, remote: true, attempts: attempt }
      }
      if (await this.#isAncestor(remoteSha, localSha)) {
        if (await this.#tryPush(localSha, remoteSha)) {
          return { synced: true, pushed: true, merged: false, remote: true, attempts: attempt }
        }
        continue
      }
      const result = await this.#reconcileDivergence(localSha, remoteSha, attempt)
      if (!result.retry) {
        return result
      }
    }
    throw new Error(`sync: CAS push to ${this.ledgerRef} failed after ${MAX_SYNC_ATTEMPTS} attempts`)
  }

  async #reconcileDivergence(localSha, remoteSha, attempt) {
    throw new Error('sync: divergent ledger histories are not yet reconciled')
  }

  async #tryPush(sha, expectedRemoteSha) {
    const args = ['push']
    if (expectedRemoteSha !== null) {
      args.push(`--force-with-lease=${this.ledgerRef}:${expectedRemoteSha}`)
    }
    args.push(this.remote, `${sha}:${this.ledgerRef}`)
    try {
      await git(args, { cwd: this.repoDir })
      return true
    } catch {
      return false
    }
  }

  async #isAncestor(a, b) {
    try {
      await git(['merge-base', '--is-ancestor', a, b], { cwd: this.repoDir })
      return true
    } catch {
      return false
    }
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/unit/git-ref-driver-sync.test.mjs`
Expected: PASS — 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/drivers/git-ref-driver.mjs test/unit/git-ref-driver-sync.test.mjs
git commit -m "feat: add GitRefDriver.sync create and fast-forward paths"
```

---

### Task 6: GitRefDriver.sync — divergence reconciliation (merge + CAS)

**Files:**
- Modify: `src/drivers/git-ref-driver.mjs`
- Test: `test/unit/git-ref-driver-merge.test.mjs`

**Interfaces:**
- Consumes: everything so far.
- Produces (replaces the Task 5 stub): a real `#reconcileDivergence(localSha, remoteSha, attempt)` — if local is an ancestor of remote (we are strictly behind), fast-forward the ledger ref and worktree to the remote tip (`merged: true`, `pushed: false`); otherwise TRUE divergence → `#mergeRemoteIntoLocal` merges the fetched remote tip into the local ledger in the detached worktree (`--no-verify` so the Plan 04 `commit-msg` trailer hook, installed via the repo's shared `core.hooksPath`, never adds a `Thread-Id:` to the ledger merge commit; `-X theirs`, disjoint files reconcile cleanly), advances the ledger ref to the merge commit, and pushes with `--force-with-lease`; a lease rejection (a concurrent push won the race) returns `{ retry: true }` so `sync()` re-fetches and retries within `MAX_SYNC_ATTEMPTS`. A hook-installed fixture (a `commit-msg` hook matching Plan 04's trailer-appender, installed through `core.hooksPath`) forces the divergence-merge path and proves the resulting merge commit message carries NO `Thread-Id` trailer. The strictly-behind path is exercised by a REAL re-sync (a peer advances the remote; a clone with NO local commits re-syncs) rather than by `init()`-adoption — `init()` adopts the remote tip for a clone that had no local ledger ref, so the behind-state must be produced afterward. The C1 two-clones-init-before-anyone-pushes fixture proves the DETERMINISTIC root makes the first cross-clone divergence an ordinary 3-way merge (shared root as common ancestor), never "refusing to merge unrelated histories".

- [ ] **Step 1: Write the failing test**

`test/unit/git-ref-driver-merge.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, mkdir, writeFile, chmod } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { git } from '../../src/util/git-exec.mjs'
import { GitRefDriver } from '../../src/drivers/git-ref-driver.mjs'
import { newThread } from '../../src/model/thread.mjs'

const NOW = '2026-06-30T10:00:00Z'
const TA = '01ARZ3NDEKTSV4RRFFQ69G5F0A'
const TB = '01ARZ3NDEKTSV4RRFFQ69G5F0B'
const TC = '01ARZ3NDEKTSV4RRFFQ69G5F0C'

async function bareRemote(base) {
  const remote = join(base, 'remote.git')
  await git(['init', '--bare', remote])
  return remote
}

async function clone(base, remote, name) {
  const repo = join(base, name)
  await git(['clone', remote, repo])
  await git(['config', 'user.name', name], { cwd: repo })
  await git(['config', 'user.email', `${name}@example.com`], { cwd: repo })
  return repo
}

function driver(base, repo, name) {
  return new GitRefDriver({ repoDir: repo, worktreeDir: join(base, `wt-${name}`), backend: 'orphan-branch', branch: '_ledger', remote: 'origin' })
}

test('two clones writing disjoint records converge via merge + CAS push', async () => {
  const base = await mkdtemp(join(tmpdir(), 'ledger-merge-'))
  const remote = await bareRemote(base)

  const repoA = await clone(base, remote, 'A')
  const dA = driver(base, repoA, 'A')
  await dA.init()
  await dA.writeThread(newThread({ id: TA, slug: 'a', title: 'A', now: NOW }))
  await dA.commit('chore: A first')
  assert.equal((await dA.sync()).pushed, true)

  const repoB = await clone(base, remote, 'B')
  const dB = driver(base, repoB, 'B')
  await dB.init()
  await dB.writeThread(newThread({ id: TB, slug: 'b', title: 'B', now: NOW }))
  await dB.commit('chore: B first')

  await dA.writeThread(newThread({ id: TC, slug: 'a2', title: 'A2', now: NOW }))
  await dA.commit('chore: A second')

  const bSync = await dB.sync()
  assert.equal(bSync.pushed, true)
  assert.equal(bSync.merged, false)

  const aSync = await dA.sync()
  assert.equal(aSync.merged, true)
  assert.equal(aSync.pushed, true)

  await git(['fetch', 'origin', '+refs/heads/_ledger:refs/ledger-check'], { cwd: repoA })
  const files = (await git(['ls-tree', '-r', '--name-only', 'refs/ledger-check'], { cwd: repoA })).trim().split('\n')
  assert.ok(files.includes(`threads/${TA}.json`))
  assert.ok(files.includes(`threads/${TB}.json`))
  assert.ok(files.includes(`threads/${TC}.json`))
  await rm(base, { recursive: true, force: true })
})

test('a clone with no local commits re-syncs to a peer-advanced remote (strictly behind, H7)', async () => {
  const base = await mkdtemp(join(tmpdir(), 'ledger-behind-'))
  const remote = await bareRemote(base)
  const repoA = await clone(base, remote, 'A')
  const repoB = await clone(base, remote, 'B')
  const dA = driver(base, repoA, 'A')
  const dB = driver(base, repoB, 'B')
  await dA.init()
  await dB.init()

  await dA.writeThread(newThread({ id: TA, slug: 'a', title: 'A', now: NOW }))
  await dA.commit('chore: A')
  await dA.sync()

  const bFirst = await dB.sync()
  assert.equal(bFirst.merged, true)
  assert.equal(bFirst.pushed, false)

  await dA.writeThread(newThread({ id: TB, slug: 'b', title: 'B', now: NOW }))
  await dA.commit('chore: A2')
  await dA.sync()

  const res = await dB.sync()
  assert.equal(res.merged, true)
  assert.equal(res.pushed, false)
  const ids = (await dB.listThreads()).map((t) => t.id).sort()
  assert.ok(ids.includes(TA))
  assert.ok(ids.includes(TB))
  await rm(base, { recursive: true, force: true })
})

test('two clones that each init before anyone pushes share a deterministic root and merge without unrelated-histories (C1)', async () => {
  const base = await mkdtemp(join(tmpdir(), 'ledger-detroot-'))
  const remote = await bareRemote(base)
  const repoA = await clone(base, remote, 'A')
  const repoB = await clone(base, remote, 'B')
  const dA = driver(base, repoA, 'A')
  const dB = driver(base, repoB, 'B')
  await dA.init()
  await dB.init()

  const rootA = (await git(['rev-list', '--max-parents=0', 'refs/heads/_ledger'], { cwd: repoA })).trim()
  const rootB = (await git(['rev-list', '--max-parents=0', 'refs/heads/_ledger'], { cwd: repoB })).trim()
  assert.equal(rootA, rootB)

  await dA.writeThread(newThread({ id: TA, slug: 'a', title: 'A', now: NOW }))
  await dA.commit('chore: A')
  assert.equal((await dA.sync()).pushed, true)

  await dB.writeThread(newThread({ id: TB, slug: 'b', title: 'B', now: NOW }))
  await dB.commit('chore: B')
  const bSync = await dB.sync()
  assert.equal(bSync.merged, true)
  assert.equal(bSync.pushed, true)

  await git(['fetch', 'origin', '+refs/heads/_ledger:refs/ledger-check'], { cwd: repoA })
  const files = (await git(['ls-tree', '-r', '--name-only', 'refs/ledger-check'], { cwd: repoA })).trim().split('\n')
  assert.ok(files.includes(`threads/${TA}.json`))
  assert.ok(files.includes(`threads/${TB}.json`))
  await rm(base, { recursive: true, force: true })
})

test('the divergence merge commit carries no Thread-Id trailer when a commit-msg hook is installed', async () => {
  const base = await mkdtemp(join(tmpdir(), 'ledger-mergehook-'))
  const remote = await bareRemote(base)

  const repoA = await clone(base, remote, 'A')
  const hooks = join(base, 'hooks')
  await mkdir(hooks, { recursive: true })
  await writeFile(join(hooks, 'commit-msg'), '#!/bin/sh\nprintf "\\nThread-Id: 01ARZ3NDEKTSV4RRFFQ69G5FAV\\n" >> "$1"\n')
  await chmod(join(hooks, 'commit-msg'), 0o755)
  await git(['config', 'core.hooksPath', hooks], { cwd: repoA })

  const dA = driver(base, repoA, 'A')
  await dA.init()
  await dA.writeThread(newThread({ id: TA, slug: 'a', title: 'A', now: NOW }))
  await dA.commit('chore: A first')
  assert.equal((await dA.sync()).pushed, true)

  const repoB = await clone(base, remote, 'B')
  const dB = driver(base, repoB, 'B')
  await dB.init()
  await dB.writeThread(newThread({ id: TB, slug: 'b', title: 'B', now: NOW }))
  await dB.commit('chore: B first')
  assert.equal((await dB.sync()).pushed, true)

  await dA.writeThread(newThread({ id: TC, slug: 'a2', title: 'A2', now: NOW }))
  await dA.commit('chore: A second')
  const aSync = await dA.sync()
  assert.equal(aSync.merged, true)
  assert.equal(aSync.pushed, true)

  const msg = (await git(['log', '-1', '--format=%B', 'refs/heads/_ledger'], { cwd: repoA })).trim()
  assert.equal(msg, 'chore: merge ledger')
  assert.ok(!msg.includes('Thread-Id'))
  await rm(base, { recursive: true, force: true })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/git-ref-driver-merge.test.mjs`
Expected: FAIL — the divergent A-sync hits the Task 5 stub and throws `divergent ledger histories are not yet reconciled`.

- [ ] **Step 3: Replace the divergence handler**

In `src/drivers/git-ref-driver.mjs`, replace the `#reconcileDivergence` stub with the real implementation and add `#mergeRemoteIntoLocal`:

```js
  async #reconcileDivergence(localSha, remoteSha, attempt) {
    if (await this.#isAncestor(localSha, remoteSha)) {
      await git(['update-ref', this.ledgerRef, remoteSha], { cwd: this.repoDir })
      await git(['checkout', '--detach', remoteSha], { cwd: this.rootDir })
      return { synced: true, pushed: false, merged: true, remote: true, attempts: attempt }
    }
    const mergeSha = await this.#mergeRemoteIntoLocal(localSha)
    if (await this.#tryPush(mergeSha, remoteSha)) {
      return { synced: true, pushed: true, merged: true, remote: true, attempts: attempt }
    }
    return { retry: true }
  }

  async #mergeRemoteIntoLocal(localSha) {
    await git(['checkout', '--detach', localSha], { cwd: this.rootDir })
    await git(
      ['merge', '--no-verify', '--no-edit', '-X', 'theirs', '-m', 'chore: merge ledger', this.mirrorRef],
      { cwd: this.rootDir },
    )
    const mergeSha = (await git(['rev-parse', 'HEAD'], { cwd: this.rootDir })).trim()
    await git(['update-ref', this.ledgerRef, mergeSha], { cwd: this.repoDir })
    return mergeSha
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/git-ref-driver-merge.test.mjs`
Expected: PASS — 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/drivers/git-ref-driver.mjs test/unit/git-ref-driver-merge.test.mjs
git commit -m "feat: reconcile divergent ledger histories via merge and CAS push"
```

---

### Task 7: custom-ref backend — clobber-guarded fetch refspec + refs/ledger/* push

**Files:**
- Modify: `src/drivers/git-ref-driver.mjs`
- Test: `test/unit/git-ref-driver-custom-ref.test.mjs`

**Interfaces:**
- Consumes: everything so far, plus `fetchRefspecFor` from `git-ledger`.
- Produces: `init()` gains a final step that, for the `custom-ref` backend, installs the fetch refspec `+refs/ledger/*:refs/ledger-remote/*` into `remote.<remote>.fetch` WITHOUT clobbering the existing `+refs/heads/*:...` (idempotent, append-only). With `backend: 'custom-ref'` the ledger ref is `refs/ledger/<branch>`, so `commit()`/`sync()` operate on `refs/ledger/*` unchanged (the ref name flows from `ledgerRefName`). Helpers added: `#ensureFetchRefspec`, `#configValues`.

- [ ] **Step 1: Write the failing test**

`test/unit/git-ref-driver-custom-ref.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { git } from '../../src/util/git-exec.mjs'
import { GitRefDriver } from '../../src/drivers/git-ref-driver.mjs'
import { newThread } from '../../src/model/thread.mjs'

const NOW = '2026-06-30T10:00:00Z'

async function fixtureRepo() {
  const base = await mkdtemp(join(tmpdir(), 'ledger-custom-'))
  const repo = join(base, 'repo')
  await git(['init', repo])
  await git(['config', 'user.name', 'Test'], { cwd: repo })
  await git(['config', 'user.email', 'test@example.com'], { cwd: repo })
  await git(['commit', '--allow-empty', '-m', 'feat: initial'], { cwd: repo })
  const remote = join(base, 'remote.git')
  await git(['init', '--bare', remote])
  await git(['remote', 'add', 'origin', remote], { cwd: repo })
  return { base, repo, remote }
}

function customDriver(base, repo) {
  return new GitRefDriver({ repoDir: repo, worktreeDir: join(base, 'ledger-worktree'), backend: 'custom-ref', branch: '_ledger', remote: 'origin' })
}

test('custom-ref init installs the fetch refspec without clobbering refs/heads', async () => {
  const { base, repo } = await fixtureRepo()
  const d = customDriver(base, repo)
  await d.init()
  await d.init()
  const fetch = (await git(['config', '--get-all', 'remote.origin.fetch'], { cwd: repo }))
    .split('\n').map((l) => l.trim()).filter(Boolean)
  assert.ok(fetch.includes('+refs/heads/*:refs/remotes/origin/*'))
  assert.ok(fetch.includes('+refs/ledger/*:refs/ledger-remote/*'))
  assert.equal(fetch.filter((l) => l === '+refs/ledger/*:refs/ledger-remote/*').length, 1)
  await rm(base, { recursive: true, force: true })
})

test('custom-ref stores the ledger under refs/ledger/* and syncs there', async () => {
  const { base, repo, remote } = await fixtureRepo()
  const d = customDriver(base, repo)
  await d.init()
  assert.equal(d.ledgerRef, 'refs/ledger/_ledger')
  await d.writeThread(newThread({ slug: 's', title: 'T', now: NOW }))
  await d.commit('chore: first')
  const res = await d.sync()
  assert.equal(res.pushed, true)
  const onRemote = (await git(['rev-parse', 'refs/ledger/_ledger'], { cwd: remote })).trim()
  const local = (await git(['rev-parse', 'refs/ledger/_ledger'], { cwd: repo })).trim()
  assert.equal(onRemote, local)
  const heads = (await git(['for-each-ref', '--format=%(refname)', 'refs/heads'], { cwd: remote })).trim()
  assert.equal(heads, '')
  await rm(base, { recursive: true, force: true })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/git-ref-driver-custom-ref.test.mjs`
Expected: FAIL — `init()` does not yet install the fetch refspec, so the `remote.origin.fetch` assertions fail.

- [ ] **Step 3: Extend the imports**

In `src/drivers/git-ref-driver.mjs`, replace the `./git-ledger.mjs` import block with:

```js
import {
  assertBackend, ledgerRefName, mirrorRefName, fetchRefspecFor,
  DEFAULT_LEDGER_BRANCH, DEFAULT_REMOTE, MAX_SYNC_ATTEMPTS,
} from './git-ledger.mjs'
```

- [ ] **Step 4: Install the refspec in init and add the helpers**

In `init()`, add the refspec-install step after `#ensureLedgerScaffold()`:

```js
  async init() {
    await this.#ensureLedgerRef()
    await this.#ensureWorktree()
    await super.init()
    await this.#ensureLedgerScaffold()
    const refspec = fetchRefspecFor(this.backend)
    if (refspec) {
      await this.#ensureFetchRefspec(refspec)
    }
    return this.rootDir
  }
```

Add these helpers to the `GitRefDriver` class body:

```js
  async #ensureFetchRefspec(refspec) {
    const existing = await this.#configValues(`remote.${this.remote}.fetch`)
    if (existing.includes(refspec)) {
      return
    }
    await git(['config', '--add', `remote.${this.remote}.fetch`, refspec], { cwd: this.repoDir })
  }

  async #configValues(key) {
    try {
      const out = await git(['config', '--get-all', key], { cwd: this.repoDir })
      return out.split('\n').map((line) => line.trim()).filter(Boolean)
    } catch {
      return []
    }
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/unit/git-ref-driver-custom-ref.test.mjs`
Expected: PASS — 2 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/drivers/git-ref-driver.mjs test/unit/git-ref-driver-custom-ref.test.mjs
git commit -m "feat: add custom-ref backend with clobber-guarded fetch refspec"
```

---

### Task 8: flip selectDriver to GitRefDriver for git work trees

**Files:**
- Modify: `src/drivers/select-driver.mjs`
- Test: `test/unit/select-driver-git.test.mjs`

**Interfaces:**
- Consumes: `LocalDriver` (Plan 01), `GitRefDriver` (Task 3), `projectKey` (Plan 01), `isGitWorkTreeSync` (Task 2), `DEFAULT_LEDGER_BRANCH`/`DEFAULT_REMOTE` (Task 1).
- Produces: `selectDriver(projectDir, userConfig?)` — UNCHANGED synchronous signature (Plan 01's contract). When `projectDir` is a git work tree it returns a `GitRefDriver` with `repoDir = projectDir`, `worktreeDir = <dataRoot>/<project-key>/ledger-worktree`, `backend = userConfig.ledger_backend ?? 'orphan-branch'`, `branch = userConfig.ledger_branch ?? '_ledger'`, `remote = 'origin'` (the `DEFAULT_REMOTE` constant — there is NO `ledger_remote` config key; Drift #3); otherwise it returns the Plan 01 `LocalDriver` rooted at `<dataRoot>/<project-key>/ledger`. `dataRoot` still comes from `userConfig.dataRoot` or `CLAUDE_PLUGIN_DATA` and is still required (it now also anchors the outside-repo worktree).

- [ ] **Step 1: Write the failing test**

`test/unit/select-driver-git.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { git } from '../../src/util/git-exec.mjs'
import { selectDriver } from '../../src/drivers/select-driver.mjs'
import { LocalDriver } from '../../src/drivers/local-driver.mjs'
import { GitRefDriver } from '../../src/drivers/git-ref-driver.mjs'

test('a git work tree selects a GitRefDriver with an outside-repo worktree', async () => {
  const repo = await mkdtemp(join(tmpdir(), 'ledger-select-git-'))
  await git(['init', repo])
  const data = await mkdtemp(join(tmpdir(), 'ledger-select-data-'))
  const d = selectDriver(repo, { dataRoot: data })
  assert.ok(d instanceof GitRefDriver)
  assert.equal(d.backend, 'orphan-branch')
  assert.equal(d.ledgerRef, 'refs/heads/_ledger')
  assert.equal(d.repoDir, repo)
  assert.ok((await d.root()).startsWith(data))
  assert.ok((await d.root()).endsWith('ledger-worktree'))
  await rm(repo, { recursive: true, force: true })
  await rm(data, { recursive: true, force: true })
})

test('userConfig selects the custom-ref backend', async () => {
  const repo = await mkdtemp(join(tmpdir(), 'ledger-select-custom-'))
  await git(['init', repo])
  const d = selectDriver(repo, { dataRoot: '/data', ledger_backend: 'custom-ref', ledger_branch: 'state' })
  assert.ok(d instanceof GitRefDriver)
  assert.equal(d.ledgerRef, 'refs/ledger/state')
  await rm(repo, { recursive: true, force: true })
})

test('a non-git directory still selects a LocalDriver rooted under the data root', async () => {
  const plain = await mkdtemp(join(tmpdir(), 'ledger-select-plain-'))
  const d = selectDriver(plain, { dataRoot: '/data' })
  assert.ok(d instanceof LocalDriver)
  assert.equal(d.isGit(), false)
  assert.ok((await d.root()).endsWith('/ledger'))
  await rm(plain, { recursive: true, force: true })
})

test('still requires a data root', () => {
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

Run: `node --test test/unit/select-driver-git.test.mjs`
Expected: FAIL — Plan 01's `selectDriver` always returns a `LocalDriver`, so `d instanceof GitRefDriver` is false.

- [ ] **Step 3: Rewrite the implementation**

Replace `src/drivers/select-driver.mjs` with:

```js
import { join } from 'node:path'
import { LocalDriver } from './local-driver.mjs'
import { GitRefDriver } from './git-ref-driver.mjs'
import { projectKey } from '../util/project-key.mjs'
import { isGitWorkTreeSync } from '../util/git-exec.mjs'
import { DEFAULT_LEDGER_BRANCH, DEFAULT_REMOTE } from './git-ledger.mjs'

export function selectDriver(projectDir, userConfig = {}) {
  const dataRoot = userConfig.dataRoot ?? process.env.CLAUDE_PLUGIN_DATA
  if (typeof dataRoot !== 'string' || dataRoot.trim() === '') {
    throw new Error('selectDriver requires CLAUDE_PLUGIN_DATA or userConfig.dataRoot')
  }
  const base = join(dataRoot, projectKey(projectDir))
  if (isGitWorkTreeSync(projectDir)) {
    return new GitRefDriver({
      repoDir: projectDir,
      worktreeDir: join(base, 'ledger-worktree'),
      backend: userConfig.ledger_backend ?? 'orphan-branch',
      branch: userConfig.ledger_branch ?? DEFAULT_LEDGER_BRANCH,
      remote: DEFAULT_REMOTE,
    })
  }
  return new LocalDriver(join(base, 'ledger'))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/select-driver-git.test.mjs`
Expected: PASS — 4 tests pass. Also run `node --test test/unit/select-driver.test.mjs` — Plan 01's cases use non-existent paths, so `isGitWorkTreeSync` is `false` and they still PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS — every Plan 01 unit test plus every Plan 02 unit test green (git-ledger, git-exec-sync, git-ref-driver-init, git-ref-driver-commit, git-ref-driver-sync, git-ref-driver-merge, git-ref-driver-custom-ref, select-driver-git).

- [ ] **Step 6: Commit**

```bash
git add src/drivers/select-driver.mjs test/unit/select-driver-git.test.mjs
git commit -m "feat: select GitRefDriver for git work trees"
```

---

### Task 9: GitRefDriver observeBranch / observeNewBranch / listRepoBranches (git-signal producers for Plan 05)

**Files:**
- Modify: `src/drivers/git-ref-driver.mjs`
- Test: `test/unit/git-ref-driver-observe.test.mjs`

**Interfaces:**
- Consumes: everything so far (`git`, the driver's `remote`).
- Produces (added to `GitRefDriver`, OVERRIDING the `LocalDriver` throwing stubs) the THREE git-driver-only methods from Plan 00: `observeBranch(binding) -> BranchObservation`, `observeNewBranch(repo, branch) -> { thread_id_trailer, first_commit }`, and `listRepoBranches(repo) -> string[]`. All three are GIT-DRIVER-ONLY and query the FEATURE repo (`binding.repo` / the `repo` argument), NEVER the ledger worktree. `observeBranch` returns EXACTLY the 11 Plan 00 fields: `branch_exists, head_sha, first_commit_present, merged, squash_merged, ahead, behind, force_push_detected, diverged_from_upstream, key_files_deleted[], key_files_modified[]`. `first_commit_present` is `true` when `binding.first_commit` is null (nothing to miss, the Plan 00 field semantic) AND `true` when the branch is deleted (no live head exists to contradict the recorded anchor); deletion is carried by `branch_exists: false`, so a deleted branch classifies through Plan 05's `branch-gone` signal (WARNING when unmerged, COMPLETE when merged), NEVER `head-missing` — `head-missing` CRITICAL remains reachable only on a LIVE branch whose recorded `first_commit` is no longer an ancestor of the head (the force-push-rewrite case). On a deleted branch, `merged`/`squash_merged` are still computed best-effort from the recorded `binding.first_commit` anchor (when the commit still exists per `git cat-file -e`: ancestry / `git cherry` against the integration base; degrading to `false` when the base or the anchor is unresolvable), honoring Plan 05's pinned observeBranch responsibility. `diverged_from_upstream` (which REPLACES the removed `is_ancestor_of_base`) is computed against `origin/<branch>` as `NOT(head is-ancestor-of origin/<branch>) AND NOT(origin/<branch> is-ancestor-of head)` via bidirectional `git merge-base --is-ancestor` — TRUE only on genuine divergence / force-push, FALSE for a healthy ahead / behind / in-sync branch AND when no upstream exists. `force_push_detected` is ALWAYS the literal `false` in v2: no reflog-based force-push detection is attempted (deferred post-v2), so divergence is carried solely by `diverged_from_upstream`, which Plan 05 classifies as WARNING — the force-push CRITICAL rung is unreachable in v2 by design. `listRepoBranches` enumerates the feature repo's LOCAL branch names via `git for-each-ref --format='%(refname:short)' refs/heads` (cwd = `repo`) and returns a `string[]`, EXCLUDING the driver's own configured ledger branch (the name whose `refs/heads/<name>` equals `this.ledgerRef` — the configured name, never a hardcoded `_ledger` literal); without the exclusion the orphan ledger branch would surface to Plan 05's `runReconcile` as an unbound feature branch and trigger a spurious re-attach on every reconcile. Helpers added: `#refExistsIn`, `#commitExistsIn`, `#isAncestorIn`, `#defaultBaseRef`, `#changedFilesBetween`, `#squashMergedInto`.
- Consumed by Plan 05 `drift/signals.mjs` (which reads the `BranchObservation` fields to classify drift) and `runReconcile`, which calls `listRepoBranches` to ENUMERATE the feature repo's branches, diffs them against the bound set to find unbound (new/renamed) ones, and calls `observeNewBranch` on each to re-attach. Plan 05 owns the CLASSIFICATION semantics; Plan 02 owns PRODUCTION of the fields.

- [ ] **Step 1: Write the failing test**

`test/unit/git-ref-driver-observe.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { git } from '../../src/util/git-exec.mjs'
import { GitRefDriver } from '../../src/drivers/git-ref-driver.mjs'

const TID = '01ARZ3NDEKTSV4RRFFQ69G5FAV'

async function featureRepo() {
  const base = await mkdtemp(join(tmpdir(), 'ledger-observe-'))
  const remote = join(base, 'remote.git')
  await git(['init', '--bare', remote])
  const repo = join(base, 'repo')
  await git(['clone', remote, repo])
  await git(['config', 'user.name', 'Dev'], { cwd: repo })
  await git(['config', 'user.email', 'dev@example.com'], { cwd: repo })
  await git(['checkout', '-b', 'main'], { cwd: repo })
  await git(['commit', '--allow-empty', '-m', 'feat: base'], { cwd: repo })
  await git(['push', '-u', 'origin', 'main'], { cwd: repo })
  await git(['remote', 'set-head', 'origin', 'main'], { cwd: repo })
  return { base, repo }
}

function driver(base, repo) {
  return new GitRefDriver({ repoDir: repo, worktreeDir: join(base, 'wt'), backend: 'orphan-branch', branch: '_ledger', remote: 'origin' })
}

test('observeBranch queries the feature repo and reports a healthy ahead branch as not diverged', async () => {
  const { base, repo } = await featureRepo()
  const d = driver(base, repo)
  await git(['checkout', '-b', 'feat/x'], { cwd: repo })
  await git(['commit', '--allow-empty', '-m', 'feat: x1'], { cwd: repo })
  await git(['push', '-u', 'origin', 'feat/x'], { cwd: repo })
  await git(['commit', '--allow-empty', '-m', 'feat: x2'], { cwd: repo })
  const obs = await d.observeBranch({ repo, branch: 'feat/x', first_commit: null })
  assert.equal(obs.branch_exists, true)
  assert.match(obs.head_sha, /^[0-9a-f]{40}$/)
  assert.equal(obs.first_commit_present, true)
  assert.equal(obs.diverged_from_upstream, false)
  assert.equal(obs.force_push_detected, false)
  assert.equal(obs.ahead, 1)
  assert.equal(obs.behind, 0)
  await rm(base, { recursive: true, force: true })
})

test('observeBranch reports diverged_from_upstream true and force_push_detected false after a force-push rewrite', async () => {
  const { base, repo } = await featureRepo()
  const d = driver(base, repo)
  await git(['checkout', '-b', 'feat/y'], { cwd: repo })
  await git(['commit', '--allow-empty', '-m', 'feat: y1'], { cwd: repo })
  await git(['push', '-u', 'origin', 'feat/y'], { cwd: repo })
  await git(['commit', '--amend', '--allow-empty', '-m', 'feat: y1 rewritten'], { cwd: repo })
  const obs = await d.observeBranch({ repo, branch: 'feat/y', first_commit: null })
  assert.equal(obs.diverged_from_upstream, true)
  assert.equal(obs.force_push_detected, false)
  await rm(base, { recursive: true, force: true })
})

test('observeBranch reports diverged_from_upstream false when the branch has no upstream', async () => {
  const { base, repo } = await featureRepo()
  const d = driver(base, repo)
  await git(['checkout', '-b', 'feat/z'], { cwd: repo })
  await git(['commit', '--allow-empty', '-m', 'feat: z1'], { cwd: repo })
  const obs = await d.observeBranch({ repo, branch: 'feat/z', first_commit: null })
  assert.equal(obs.branch_exists, true)
  assert.equal(obs.diverged_from_upstream, false)
  assert.equal(obs.ahead, 0)
  assert.equal(obs.behind, 0)
  await rm(base, { recursive: true, force: true })
})

test('observeBranch reports a missing branch with no recorded anchor as first_commit_present true and no merge evidence', async () => {
  const { base, repo } = await featureRepo()
  const d = driver(base, repo)
  const obs = await d.observeBranch({ repo, branch: 'feat/gone', first_commit: null })
  assert.equal(obs.branch_exists, false)
  assert.equal(obs.head_sha, null)
  assert.equal(obs.first_commit_present, true)
  assert.equal(obs.merged, false)
  assert.equal(obs.squash_merged, false)
  assert.equal(obs.diverged_from_upstream, false)
  await rm(base, { recursive: true, force: true })
})

test('observeBranch reports a deleted unmerged branch as first_commit_present true with merged and squash_merged false', async () => {
  const { base, repo } = await featureRepo()
  const d = driver(base, repo)
  await git(['checkout', '-b', 'feat/dropped'], { cwd: repo })
  await writeFile(join(repo, 'dropped.txt'), 'dropped\n')
  await git(['add', 'dropped.txt'], { cwd: repo })
  await git(['commit', '-m', 'feat: dropped work'], { cwd: repo })
  const firstSha = (await git(['rev-parse', 'feat/dropped'], { cwd: repo })).trim()
  await git(['checkout', 'main'], { cwd: repo })
  await git(['branch', '-D', 'feat/dropped'], { cwd: repo })
  const obs = await d.observeBranch({ repo, branch: 'feat/dropped', first_commit: firstSha })
  assert.equal(obs.branch_exists, false)
  assert.equal(obs.head_sha, null)
  assert.equal(obs.first_commit_present, true)
  assert.equal(obs.merged, false)
  assert.equal(obs.squash_merged, false)
  assert.equal(obs.ahead, 0)
  assert.equal(obs.behind, 0)
  assert.deepEqual(obs.key_files_deleted, [])
  assert.deepEqual(obs.key_files_modified, [])
  await rm(base, { recursive: true, force: true })
})

test('observeBranch reports best-effort merged true for a branch deleted after merging into the base', async () => {
  const { base, repo } = await featureRepo()
  const d = driver(base, repo)
  await git(['checkout', '-b', 'feat/landed'], { cwd: repo })
  await git(['commit', '--allow-empty', '-m', 'feat: landed work'], { cwd: repo })
  const firstSha = (await git(['rev-parse', 'feat/landed'], { cwd: repo })).trim()
  await git(['checkout', 'main'], { cwd: repo })
  await git(['merge', '--ff-only', 'feat/landed'], { cwd: repo })
  await git(['push', 'origin', 'main'], { cwd: repo })
  await git(['branch', '-d', 'feat/landed'], { cwd: repo })
  const obs = await d.observeBranch({ repo, branch: 'feat/landed', first_commit: firstSha })
  assert.equal(obs.branch_exists, false)
  assert.equal(obs.first_commit_present, true)
  assert.equal(obs.merged, true)
  assert.equal(obs.squash_merged, false)
  await rm(base, { recursive: true, force: true })
})

test('observeNewBranch returns the branch first commit and its Thread-Id trailer', async () => {
  const { base, repo } = await featureRepo()
  const d = driver(base, repo)
  await git(['checkout', '-b', 'feat/w'], { cwd: repo })
  await git(['commit', '--allow-empty', '-m', `feat: w1\n\nThread-Id: ${TID}`], { cwd: repo })
  const firstSha = (await git(['rev-parse', 'feat/w'], { cwd: repo })).trim()
  await git(['commit', '--allow-empty', '-m', 'feat: w2'], { cwd: repo })
  const res = await d.observeNewBranch(repo, 'feat/w')
  assert.equal(res.first_commit, firstSha)
  assert.equal(res.thread_id_trailer, TID)
  await rm(base, { recursive: true, force: true })
})

test('listRepoBranches enumerates feature branches and excludes the ledger branch', async () => {
  const { base, repo } = await featureRepo()
  const d = driver(base, repo)
  await d.init()
  await git(['branch', 'feat/a'], { cwd: repo })
  await git(['branch', 'feat/b'], { cwd: repo })
  const heads = (await git(['for-each-ref', '--format=%(refname:short)', 'refs/heads'], { cwd: repo })).trim().split('\n')
  assert.ok(heads.includes('_ledger'))
  const branches = await d.listRepoBranches(repo)
  assert.deepEqual(branches.sort(), ['feat/a', 'feat/b', 'main'])
  assert.ok(!branches.includes('_ledger'))
  await rm(base, { recursive: true, force: true })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/unit/git-ref-driver-observe.test.mjs`
Expected: FAIL — `GitRefDriver` inherits the `LocalDriver` throwing stubs (`observeBranch: git drivers only`), so every case throws instead of returning an observation.

- [ ] **Step 3: Add the observe methods and their helpers**

Insert into the `GitRefDriver` class body:

```js
  async observeBranch(binding) {
    const repo = binding.repo
    const branch = binding.branch
    const branchRef = `refs/heads/${branch}`
    const upstream = `${this.remote}/${branch}`
    const upstreamRef = `refs/remotes/${this.remote}/${branch}`
    if (!(await this.#refExistsIn(repo, branchRef))) {
      const goneBase = await this.#defaultBaseRef(repo)
      const anchor = binding.first_commit && (await this.#commitExistsIn(repo, binding.first_commit))
        ? binding.first_commit
        : null
      const anchorMerged = goneBase && anchor
        ? await this.#isAncestorIn(repo, anchor, goneBase)
        : false
      const anchorSquashMerged = goneBase && anchor && !anchorMerged
        ? await this.#squashMergedInto(repo, anchor, goneBase)
        : false
      return {
        branch_exists: false, head_sha: null, first_commit_present: true,
        merged: anchorMerged, squash_merged: anchorSquashMerged, ahead: 0, behind: 0,
        force_push_detected: false, diverged_from_upstream: false,
        key_files_deleted: [], key_files_modified: [],
      }
    }
    const head_sha = (await git(['rev-parse', branchRef], { cwd: repo })).trim()
    const first_commit_present = binding.first_commit
      ? await this.#isAncestorIn(repo, binding.first_commit, head_sha)
      : true
    let ahead = 0
    let behind = 0
    let diverged_from_upstream = false
    if (await this.#refExistsIn(repo, upstreamRef)) {
      const counts = (await git(
        ['rev-list', '--left-right', '--count', `${upstream}...${branchRef}`],
        { cwd: repo },
      )).trim().split(/\s+/)
      behind = Number(counts[0] ?? 0)
      ahead = Number(counts[1] ?? 0)
      const headIsAncestor = await this.#isAncestorIn(repo, head_sha, upstream)
      const upstreamIsAncestor = await this.#isAncestorIn(repo, upstream, head_sha)
      diverged_from_upstream = !headIsAncestor && !upstreamIsAncestor
    }
    const force_push_detected = false
    const base = await this.#defaultBaseRef(repo)
    let merged = false
    let squash_merged = false
    let key_files_deleted = []
    let key_files_modified = []
    if (base && base !== branchRef) {
      merged = await this.#isAncestorIn(repo, head_sha, base)
      squash_merged = merged ? false : await this.#squashMergedInto(repo, head_sha, base)
      const changes = await this.#changedFilesBetween(repo, base, head_sha)
      key_files_deleted = changes.deleted
      key_files_modified = changes.modified
    }
    return {
      branch_exists: true, head_sha, first_commit_present, merged, squash_merged,
      ahead, behind, force_push_detected, diverged_from_upstream,
      key_files_deleted, key_files_modified,
    }
  }

  async observeNewBranch(repo, branch) {
    const branchRef = `refs/heads/${branch}`
    const head = (await git(['rev-parse', branchRef], { cwd: repo })).trim()
    const base = await this.#defaultBaseRef(repo)
    let first_commit = null
    if (base && base !== branchRef) {
      const unique = (await git(['rev-list', '--reverse', `${base}..${branchRef}`], { cwd: repo })).trim()
      first_commit = unique ? unique.split('\n')[0] : null
    }
    if (!first_commit) {
      const roots = (await git(['rev-list', '--max-parents=0', branchRef], { cwd: repo })).trim()
      first_commit = roots ? roots.split('\n')[0] : head
    }
    const trailer = (await git(
      ['show', '-s', '--format=%(trailers:key=Thread-Id,valueonly)', first_commit],
      { cwd: repo },
    )).trim()
    const thread_id_trailer = trailer ? trailer.split('\n')[0].trim() : null
    return { thread_id_trailer, first_commit }
  }

  async listRepoBranches(repo) {
    const out = (await git(['for-each-ref', '--format=%(refname:short)', 'refs/heads'], { cwd: repo })).trim()
    if (out === '') {
      return []
    }
    return out.split('\n')
      .map((line) => line.trim())
      .filter((name) => name !== '' && `refs/heads/${name}` !== this.ledgerRef)
  }

  async #refExistsIn(repo, ref) {
    try {
      await git(['rev-parse', '--verify', '--quiet', ref], { cwd: repo })
      return true
    } catch {
      return false
    }
  }

  async #commitExistsIn(repo, sha) {
    try {
      await git(['cat-file', '-e', `${sha}^{commit}`], { cwd: repo })
      return true
    } catch {
      return false
    }
  }

  async #isAncestorIn(repo, a, b) {
    try {
      await git(['merge-base', '--is-ancestor', a, b], { cwd: repo })
      return true
    } catch {
      return false
    }
  }

  async #defaultBaseRef(repo) {
    try {
      const out = (await git(['symbolic-ref', '--quiet', `refs/remotes/${this.remote}/HEAD`], { cwd: repo })).trim()
      return out || null
    } catch {
      return null
    }
  }

  async #changedFilesBetween(repo, base, head) {
    let out
    try {
      out = (await git(['diff', '--name-status', `${base}...${head}`], { cwd: repo })).trim()
    } catch {
      return { deleted: [], modified: [] }
    }
    const deleted = []
    const modified = []
    for (const line of out.split('\n').filter(Boolean)) {
      const tab = line.indexOf('\t')
      if (tab === -1) {
        continue
      }
      const status = line.slice(0, tab)
      const path = line.slice(tab + 1)
      if (status.startsWith('D')) {
        deleted.push(path)
      } else {
        modified.push(path)
      }
    }
    return { deleted, modified }
  }

  async #squashMergedInto(repo, head, base) {
    try {
      const cherry = (await git(['cherry', base, head], { cwd: repo })).trim()
      if (cherry === '') {
        return false
      }
      return cherry.split('\n').every((line) => line.startsWith('-'))
    } catch {
      return false
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/unit/git-ref-driver-observe.test.mjs`
Expected: PASS — 8 tests pass.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS — every Plan 01 unit test plus every Plan 02 unit test green, now including `git-ref-driver-observe`.

- [ ] **Step 6: Commit**

```bash
git add src/drivers/git-ref-driver.mjs test/unit/git-ref-driver-observe.test.mjs
git commit -m "feat: add GitRefDriver observeBranch, observeNewBranch, listRepoBranches git signals"
```

> BINDING NOTE (flag for Plan 05 confirmation): Plan 00 pins ONLY `diverged_from_upstream` precisely; the other base-relative fields are produced here with defensible git queries that Plan 05's `signals.mjs` + the Plan 06 H6 drift fixtures own the final classification of. Bindings made in Plan 02 because Plan 00 leaves them to the consumer: (1) the integration base is the remote default branch resolved via `git symbolic-ref refs/remotes/<remote>/HEAD` (null when absent → `merged`/`squash_merged`/`key_files_*` degrade to `false`/`[]`); (2) `merged` = head is-ancestor-of base (on a deleted branch, best-effort: the recorded `binding.first_commit` stands in for the head when the commit still exists per `git cat-file -e`, degrading to `false` when the base or the anchor is unresolvable — Plan 05's cross-plan seam pins the "best-effort `merged`/`squash_merged` even after branch deletion" responsibility); (3) `squash_merged` = `git cherry` shows every branch commit as patch-equivalent upstream (same anchor stand-in on a deleted branch; detects patch-preserving reintegration; a true squash collapses patch-ids, so Plan 05 may refine); (4) `key_files_*` = the branch's file-level delta vs base (`git diff --name-status base...head`), a superset Plan 05 may filter to thread-relevant files since no key-file list lives in `BranchBinding`; (5) `force_push_detected` is the literal `false` in v2 — Plan 02 has no remote reflog to distinguish a force-push from ordinary divergence, so reflog-based detection is deferred post-v2 and divergence is reported solely via `diverged_from_upstream`, which Plan 05 classifies as WARNING (the force-push CRITICAL rung is unreachable in v2 by design; decision 2026-07-01-continuity-v2-force-push-detected-false).

---

## Plan 02 Self-Review

- **Spec coverage:** git-ref driver / orphan-branch default (S1, DESIGN-STATE §4.4) — `GitRefDriver` with `backend: 'orphan-branch'`, ledger on `refs/heads/<branch>`, sole writer via a detached worktree (§4.6). Custom-ref opt-in (S2, §4.4) — `backend: 'custom-ref'`, ledger on `refs/ledger/<branch>`, clobber-guarded fetch refspec auto-installed. Worktree mechanism (§4.6) — `git worktree add --detach` into an outside-repo dir; feature branch carries no ledger files; user `git status` verified clean. Concurrency / CAS (§4.7) — `sync()` fetch → merge (disjoint, `-X theirs` + `merge=union` belt-and-suspenders) → `--force-with-lease` push with bounded retry. Automatic driver selection (§4.5) — `selectDriver` flips on `isGitWorkTreeSync`, preserving the non-git `LocalDriver` path, with `remote` fixed to `DEFAULT_REMOTE` (`'origin'`) and NO `ledger_remote` key (Drift #3). Trailer-safety — every ledger-side commit (the init scaffold, `commit()`, and the divergence merge) uses `--no-verify` so the Plan 04 `commit-msg` hook never brands them with a `Thread-Id`; `commit()` and the divergence merge are each proven by a hook-installed fixture. Deterministic bootstrap (C1) — orphan root minted over the fixed empty tree with fixed identity/dates → identical root SHA on every machine, so cross-clone divergence merges as an ordinary 3-way (no `--allow-unrelated-histories`); the scaffold (`.gitattributes` + derived-index `.gitignore`) is committed in `init()` (H7) with the same fixed identity, keeping the worktree clean. Crash recovery (M10) — a populated unregistered worktree path is reclaimed via `fs.rm` before `git worktree add`. Git signals for Plan 05 (§4.7 / drift) — the three git-driver-only methods `observeBranch` / `observeNewBranch` / `listRepoBranches` override the `LocalDriver` throwing stubs, query the FEATURE repo, and produce the 11-field `BranchObservation` (with `diverged_from_upstream`; `force_push_detected` always `false` in v2; `first_commit_present: true` on a null `binding.first_commit` and on a deleted branch, whose `merged`/`squash_merged` are computed best-effort from the recorded `first_commit` anchor so deletion classifies via Plan 05's `branch-gone` — WARNING unmerged, COMPLETE merged — never `head-missing`) plus the branch enumeration — excluding the driver's own ledger branch — `runReconcile` uses to find unbound new/renamed branches.
- **Interface fidelity:** `GitRefDriver` implements the frozen `StorageDriver` interface by extending `LocalDriver` (which extends `StorageDriver`), so it satisfies `instanceof StorageDriver` and every method name/arity from Plan 00. The record/decision/session/index methods are inherited verbatim (records ARE files, now under the worktree root); only the git-specific `isGit`/`init`/`commit`/`sync`/`observeBranch`/`observeNewBranch`/`listRepoBranches` are overridden (the latter three replacing `LocalDriver`'s throwing stubs). `observeBranch` returns EXACTLY the 11 Plan 00 `BranchObservation` fields, with `diverged_from_upstream` replacing the removed `is_ancestor_of_base`. No schema field, tool name, FSM state, or driver method is renamed or reshaped.
- **Placeholder scan:** none — every step ships complete comment-free code and a concrete run command with expected output. The Task 5 `#reconcileDivergence` "stub" is an intentional RED anchor, fully replaced in Task 6.
- **Type consistency:** `ledgerRefName`/`mirrorRefName`/`fetchRefspecFor` produce the exact ref strings the driver and tests assert; `MAX_SYNC_ATTEMPTS` is the single retry bound used by `sync()`; the `sync()`/`commit()` return shapes are identical across the impl and every test.
- **Empirical grounding:** every load-bearing git sequence in this plan (orphan ref via `commit-tree`, detached outside-repo worktree, `--no-verify` skipping the trailer hook, empty-commit detection, create/fast-forward/no-op push, divergence merge preserving disjoint records, `--force-with-lease` CAS accepting on match and rejecting on stale lease, custom-ref push to a bare remote, clobber-guarded fetch-refspec install) was executed against real git in a sandbox before this plan was written.

**Downstream contract produced by Plan 02 (consumed by Plans 05 and 06):**
- `GitRefDriver` (`src/drivers/git-ref-driver.mjs`) — `new GitRefDriver({ repoDir, worktreeDir, backend, branch, remote })`; instance fields `repoDir`, `backend`, `branch`, `remote`, `ledgerRef`, `mirrorRef`; `isGit() -> true`; `init()` (deterministic root + committed scaffold), `commit(message) -> { committed, sha, empty }`, `sync() -> { synced, pushed, merged, remote, attempts }`, `observeBranch(binding) -> BranchObservation` (11 fields incl. `diverged_from_upstream`; `force_push_detected` always `false` in v2; `first_commit_present` `true` when `binding.first_commit` is null AND `true` when the branch is deleted, with best-effort `merged`/`squash_merged` computed from the recorded `first_commit` anchor even after deletion — a deleted branch classifies via `branch-gone`, never `head-missing`), `observeNewBranch(repo, branch) -> { thread_id_trailer, first_commit }`, `listRepoBranches(repo) -> string[]` excluding the configured ledger branch (all three query the FEATURE repo); all Plan 01 `LocalDriver` record/decision/session/index methods inherited, rooted in the ledger worktree.
- `git-ledger` helpers (`src/drivers/git-ledger.mjs`) — `LEDGER_BACKENDS`, `DEFAULT_LEDGER_BRANCH`, `DEFAULT_REMOTE`, `MAX_SYNC_ATTEMPTS`, `assertBackend`, `ledgerRefName(backend, branch)`, `mirrorRefName(branch)`, `fetchRefspecFor(backend)`. Plan 05's `reconcile` uses `ledgerRefName` to name the ledger ref for its git-signal queries.
- `isGitWorkTreeSync(dir)` (`src/util/git-exec.mjs`) — synchronous work-tree probe.
- `selectDriver(projectDir, userConfig)` — same synchronous signature, now backend-aware: `GitRefDriver` for git work trees (honoring `ledger_backend`/`ledger_branch`; `remote` fixed to `DEFAULT_REMOTE` = `'origin'`, no `ledger_remote` key per Drift #3), `LocalDriver` otherwise. Plan 03's MCP server bootstrap and Plan 06's packaging consume this.
