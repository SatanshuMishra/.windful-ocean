# Session-Continuity Plugin v2 — Complete Design Specification

## 1. Metadata & Provenance

- **Spec ID:** continuity-v2-plugin
- **Date:** 2026-07-13
- **Status:** authoritative build input (supersedes the stale `specs/2026-06-30-continuity-redesign-v2-design.md`, which is retained only as a record of what NOT to ship)
- **Consumer:** this document is the SOLE, COMPLETE, SELF-CONTAINED input to the mitosis build workflow. mitosis RE-DECOMPOSES this spec into its own minimum-shippable-product (MSP) task graph; it does NOT read any pre-authored plan file. Every subsystem, contract, invariant, and acceptance criterion the plugin must have is therefore stated HERE. Anything omitted will be silently absent from the built plugin.
- **Provenance (folded and reconciled into this single document):** the amended `2026-06-30-continuity-v2-00-overview.md` shared contract; the task-level detail of Plans 01–07; the `2026-07-01-continuity-v2-PHASE1-AMENDMENTS.md` set (decisions A1–A4 + the full Plan 00 diff + cross-editor pins); the two 2026-07-13 migration decisions (`adopt-ledger-migration-architecture`, `ratify-migration-open-items`); and the `DESIGN-STATE.md` architecture narrative (narrative only, not contract). NOTE (2026-07-14 amendment): the v1→v2 migration subsystem was subsequently EXTRACTED from the published plugin — it ships as a separate local/private tool (see the §16 non-goal). Migration decisions remain provenance but their build content is out of scope here; `restore` (disaster recovery) stays.

## 2. Goal & Non-Goals

**Goal.** Build a portable, installable, publishable Claude Code plugin that replaces the prose-based Continuity Ledger with a Git-native, multi-user, drift-aware session-continuity system whose correctness is guaranteed by a bundled MCP server plus hooks. The plugin teaches each session the cumulative project state from a durable, machine-managed ledger of POINTERS and PROSE (never code), and it survives normal post-completion branch pruning by reconciling and re-attaching context rather than policing deletion.

**Durability posture (reframe).** The system exists to survive NORMAL post-completion branch pruning and to recover context for related future work — NOT to police mid-feature deletion or resist tampering. Drift is reconciled, not policed.

**Non-Goals (v2 boundaries — see §16 for the full list).**
- No Cold memory tier / `Project` entity / `PROJECT.md` MCP tooling. `PROJECT.md` stays a human/skill-edited prose file OUTSIDE the MCP surface (decision A4).
- No `query_ledger`/`search_ledger` tool (the 12-tool MCP surface is frozen).
- No reflog-based force-push detection (deferred post-v2).
- No per-platform compiled binary (require Node; revisit only if the Node runtime dependency proves a barrier).

## 3. Architecture Overview

A single **stdio MCP server** (Node) is the SOLE reader/writer of a ledger that stores POINTERS + PROSE, never code. Storage sits behind a **driver interface** with three implementations selected automatically:
- **orphan-branch** (git default): the ledger lives on a deterministic orphan branch of the project repo.
- **custom-ref** (git opt-in): the ledger lives under a custom `refs/ledger/*` namespace.
- **local-dir** (non-git): the ledger lives under a plugin data directory.

Work is modeled by ONE recursive `Thread` entity (adjacency-list self-reference). **Hooks** enforce lifecycle and drive sync/reconcile/nudge/trailer. Two **thin skills** (`session-handoff`, `resume-project`) call MCP tools and carry no business logic. A hook-facing **CLI** (`bin/ledger-cli.mjs`) bridges hooks (which cannot speak MCP stdio) to the server, and additionally exposes the human-run, CLI-only `restore` verb (disaster recovery) that is deliberately NOT part of the MCP tool surface.

## 4. Global Constraints & Tech Stack

- **Runtime:** Node.js >= 20, ES modules only (`import`/`export`, `.mjs` or `"type":"module"`). No TypeScript build step — plain JS.
- **Tests:** Node's built-in test runner only — `node --test`. No jest/vitest/mocha.
- **Dependencies:** EXACTLY three runtime deps — `@modelcontextprotocol/sdk`, `ulid`, `ajv`. Pin EXACT versions in `package.json` (no `^`/`~`): the FROZEN pins in §14.A3 (`@modelcontextprotocol/sdk` 1.29.0, `ajv` 8.20.0, `ulid` 3.0.2) govern; they are NOT re-resolved at init (the exact pins were validated only against MCP SDK 1.29.0, so re-resolving current-stable would break the validated closure). No auto-update. Adding any fourth dependency requires a spec amendment. Timestamps are validated by pattern, not by ajv `format`.
- **Style:** No code comments anywhere (shebang / tooling-pragma / codegen-marker carve-outs only). No emojis. No AI attribution in commits.
- **Immutability:** never mutate a record in place; construct a new object and atomically write it.
- **File size:** small focused files, 200–400 lines typical, 800 hard max.
- **Error handling:** comprehensive; validate at every boundary; never silently swallow errors.
- **Identity:** all cross-references use a stable ULID (or a decision's stable zero-padded `NNNN`). A slug or file path is NEVER a link target.
- **Atomic writes:** write to `<path>.tmp-<ulid>` then `rename()` over the target (POSIX atomic). Never partial-write a record.
- **Storage isolation:** storage is reached ONLY through the driver interface. No module hard-codes a git command or a filesystem path outside a driver.
- **Commit cadence:** one logical change per commit; Conventional Commits (`feat:`/`fix:`/`test:`/`refactor:`/`chore:`).

## 5. Repository Layout (the plugin repo)

```
<plugin-repo>/
  .claude-plugin/plugin.json        metadata + userConfig
  .claude-plugin/marketplace.json   marketplace manifest for publishing (see §14)
  .mcp.json                         stdio server declaration
  package.json                      pinned deps, "type":"module", test script
  package-lock.json                 committed lockfile for deterministic npm ci
  node_modules/                     VENDORED, committed (3 pinned deps ship with the plugin)
  bin/ledger-server.mjs             MCP entrypoint
  bin/ledger-cli.mjs                hook-facing CLI: registry wrap + fs subcommands + restore
  src/
    schema/                         JSON Schemas + ajv validators
    model/                          record constructors + FSM
    drivers/                        StorageDriver + LocalDriver + GitRefDriver + layout.mjs + git-ledger.mjs
    index/                          derived-index builder
    tools/                          one MCP tool per file (+ shared.mjs, context.mjs)
    drift/                          reconcile + signals + re-attach
    util/                           ulid, atomic-write, git-exec, project-key, active-thread
  hooks/hooks.json                  control plane
  hooks/commit-msg                  Thread-Id trailer inserter
  hooks/dispatcher                  chain-not-clobber shim (copied under every standard hook name)
  hooks/session-start.mjs           SessionStart entry: installer self-heal + sync + reconcile + roster
  hooks/user-prompt-submit.mjs      UserPromptSubmit entry: resume-intent roster
  hooks/pre-tool-use.mjs            PreToolUse entry: deny raw ledger writes + auto-approve mcp__ledger__*
  hooks/post-tool-use.mjs           PostToolUse entry: nudge + commit-ish SHA capture
  hooks/stop.mjs                    Stop entry: active-thread pointer gate
  hooks/pre-compact.mjs             PreCompact entry: checkpoint sentinel
  hooks/lib/                        hook implementations + installer
  skills/session-handoff/SKILL.md   thin (write side)
  skills/resume-project/SKILL.md    thin (read side)
  scripts/check-packaging.mjs       packaging ensemble guard (checkPackaging)
  test/
    unit/                           per-module unit tests
    e2e/                            stdio-client end-to-end tests
    fixtures/                       throwaway git repos for driver/drift tests
```

### 5.1 File ownership / MSP boundaries

MSP ownership is split at the FILE level, not the directory level. `src/drivers/` in particular is owned by three different MSPs.

- **Foundational core/util MSP** owns `src/util/` (`ulid`, `atomic-write`, `git-exec`, `project-key`, `active-thread`), `src/index/` (the derived-index builder), and `src/drivers/git-ledger.mjs`. It lands FIRST and every other MSP `dependsOn` it.
- **Core driver MSP** owns the `StorageDriver` base, `LocalDriver`, and `src/drivers/layout.mjs` (which exports `serializeRecord`). `dependsOn` the foundational MSP.
- **Git driver MSP** owns `src/drivers/git-ref-driver.mjs` (`GitRefDriver`) only. `dependsOn` the core-driver + foundational MSPs.
- **Control-plane CLI MSP** is a SINGLE MSP: `bin/ledger-cli.mjs`. The `restore` verb EXTENDS this one MSP; it is NOT a separate parallel MSP. `dependsOn` the foundational + tool-layer MSPs.

`src/drivers/git-ledger.mjs` (foundational MSP) is the SOLE export site of `EMPTY_TREE_SHA` (`4b825dc642cb6eb9a060e54bf8d69288fbee4904`), `LEDGER_ROOT_MESSAGE` (`chore: initialize continuity ledger`), and `LEDGER_INIT_IDENTITY`, the deterministic root-minting helper `mintLedgerRoot(repoDir)` (mints the fixed-identity, fixed-date root commit over `EMPTY_TREE_SHA` via `git commit-tree` and returns the well-known root SHA — a SINGLE named export so the driver and any out-of-repo consumer mint a byte-identical root), alongside the ref/backend helpers (`LEDGER_BACKENDS`, `DEFAULT_LEDGER_BRANCH`, `DEFAULT_REMOTE`, `MAX_SYNC_ATTEMPTS`, `assertBackend`, `ledgerRefName`, `mirrorRefName`, `fetchRefspecFor`). `GitRefDriver` and the multi-user clone-adoption path IMPORT these from here; they are REDECLARED nowhere. The out-of-repo local migration tool (§16 non-goal) ALSO imports these exports — including `mintLedgerRoot` — so its migrated ledger ref carries the byte-identical deterministic root SHA and is legitimately adopted.

`project-key` derivation (foundational MSP; keys LocalDriver paths, the outside-repo ledger worktree, and the non-git active-thread pointer) is defined ONCE in `src/util/project-key.mjs`: `projectKey(absoluteDir)` replaces every non-alphanumeric char with `-` (`absoluteDir.replace(/[^a-zA-Z0-9]/g, '-')`) over an ABSOLUTE path; a non-string or non-absolute input throws.

`commitAndReindex(driver, message)` (rebuild the derived index, then `driver.commit`) lives in `src/tools/shared.mjs`; its full signature is defined in the tool layer (§8).

## 6. Data Model

All records are validated by ajv against JSON Schemas. Every record schema is `additionalProperties: false` (unknown fields are rejected), and `additionalProperties: false` applies to EVERY nested object schema too — the `spine` object, each `completion_criteria` item, and each `external_refs` item — not only the top-level record. Records are immutable in place: every mutation constructs a new object and atomically rewrites the file.

### 6.1 Thread (`threads/<id>.json`)

```
{
  schema_version, id, slug, title, status,
  parent_id, predecessor_id,
  completion_criteria,
  vcs_ref, external_refs,
  blocked_by, abandoned_reason, closure_statement,
  spine,
  created_at, updated_at
}
```

| Field | Type | Contract |
|---|---|---|
| `schema_version` | integer | `const 1` (NOT 2). The live ajv validator pins `{const:1}`; emitting 2 fails validation. |
| `id` | string | ULID `pattern:^[0-9A-HJKMNP-TV-Z]{26}$`, 26 chars, generated once, immutable. The only link target. |
| `slug` | string | `minLength:1` (non-empty). Display handle only; NEVER a link key. |
| `title` | string | `minLength:1` (non-empty). Human title. |
| `status` | enum | `active` \| `paused` \| `blocked` \| `done` \| `abandoned`. |
| `parent_id` | string \| null | `{type:['string','null'], pattern:^[0-9A-HJKMNP-TV-Z]{26}$}` — null OR a 26-char ULID (SAME pattern as `id`). Self-reference (adjacency list); null = top-level. |
| `predecessor_id` | string \| null | `{type:['string','null'], pattern:^[0-9A-HJKMNP-TV-Z]{26}$}` — null OR a 26-char ULID (SAME pattern as `id`). Lineage on supersession. |
| `completion_criteria` | `[{text, done}]` | Each item is a CLOSED object (`additionalProperties:false`, `required:[text,done]`): `text` string `minLength:1`, `done` boolean. Non-empty required before `done`. Texts are immutable after creation (only `done` may flip). |
| `vcs_ref` | string \| null | `{type:['string','null']}`. Branch name; null for non-git. |
| `external_refs` | `[{system, id, url}]` | Each item is a CLOSED object (`additionalProperties:false`, `required:[system,id,url]`); `system`/`id`/`url` are strings, `system` free. External pointers. |
| `blocked_by` | string \| null | Set by `transition_thread`. |
| `abandoned_reason` | string \| null | Set by `transition_thread`. |
| `closure_statement` | string \| null | Set by `transition_thread`; required for `done`. |
| `spine` | object | CLOSED object (`additionalProperties:false`, all six `required`): `{status, active_goal, next_step, open_risks[], key_decisions[], out_of_scope[]}`. `status`/`active_goal`/`next_step` are strings; `open_risks`/`key_decisions`/`out_of_scope` are arrays of `{type:'string'}` items; `key_decisions` items are `NNNN`(-slug) decision-refs (NOT ULIDs — decisions are identified by the zero-padded monotonic `NNNN` of §6.4 and carry no ULID; only threads/bindings carry ULIDs), stored as plain `{type:'string'}` with no ULID pattern. The progressive-summary spine. |
| `created_at` / `updated_at` | string | ISO 8601, validated by `pattern:^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}` (deliberately loose — no end-anchor, no required timezone; pattern, not ajv `format`). |

`blocked_by`/`abandoned_reason`/`closure_statement` are declared, nullable fields (so `additionalProperties:false` still holds) that give the resume brief a lossless home instead of surviving only as session-note prose.

### 6.2 BranchBinding (`bindings/<id>.json`; git projects only)

```
{
  id, thread_id, repo, branch, status,
  created_at, closed_at, closed_reason,
  first_commit, trailer_present
}
```

| Field | Type | Contract |
|---|---|---|
| `id` | string | ULID. |
| `thread_id` | string | ULID of the bound Thread. |
| `repo` | string | `minLength:1` (non-empty). Feature repo identity. |
| `branch` | string | `minLength:1` (non-empty). Branch name. |
| `status` | enum | `active` \| `merged` \| `orphaned` \| `abandoned`. |
| `created_at` | string | ISO 8601. |
| `closed_at` | string \| null | Set on close. |
| `closed_reason` | enum \| null | `merged` \| `deleted` \| `abandoned` \| `superseded` \| null. |
| `first_commit` | string \| null | Written by `record-sha` ONLY when currently null (set-once); never overwritten (overwriting corrupts the first-commit re-attach rung). No `head_sha`/`last_sha` field exists. |
| `trailer_present` | boolean | Whether the branch's first commit carries the `Thread-Id:` trailer. |

### 6.3 BranchObservation (return of `observeBranch`; consumed by drift signals)

```
{
  branch_exists, head_sha, first_commit_present,
  merged, squash_merged, ahead, behind,
  force_push_detected, diverged_from_upstream,
  key_files_deleted, key_files_modified
}
```

| Field | Type | Contract |
|---|---|---|
| `branch_exists` | boolean | Branch present in the feature repo. |
| `head_sha` | string \| null | Carried for consumers even though `signals.mjs` does not read it. |
| `first_commit_present` | boolean | TRUE when `binding.first_commit` is null OR `branch_exists === false` (deletion NEVER invalidates the anchor); otherwise TRUE only while the recorded `first_commit` is still reachable. So the `head-missing` CRITICAL trigger is UNREACHABLE on a deleted branch (reachable only on a LIVE, rewritten branch — `branch_exists === true` with a missing recorded head). |
| `merged` | boolean | Merged into the integration base (base resolution defined authoritatively in §7). When the branch is deleted (`branch_exists === false`), computed BEST-EFFORT from `binding.first_commit` (ancestry reachability vs base), NOT from a live tip — so a merged-then-pruned branch still reports `merged:true`. |
| `squash_merged` | boolean | Squash-merged (first_commit absent but content merged). When the branch is deleted, computed BEST-EFFORT from `binding.first_commit` (patch-id vs the integration base, §7), NOT from a live tip. |
| `ahead` / `behind` | number | Commit counts vs the upstream `origin/<branch>`; both are `0` when there is NO upstream (a missing upstream yields `ahead=0`/`behind=0`, never an error). |
| `force_push_detected` | boolean | Force-push signal; always the literal `false` in v2 (reflog-based detection is a deferred non-goal — matches §7, §12.2, §16). |
| `diverged_from_upstream` | boolean | Replaces the earlier `is_ancestor_of_base`. Definition: against `origin/<branch>`, `diverged = NOT(head is-ancestor-of origin/<branch>) AND NOT(origin/<branch> is-ancestor-of head)` via bidirectional `git merge-base --is-ancestor`. TRUE only on genuine divergence/force-push; a healthy ahead/behind/in-sync branch and a branch with no upstream are FALSE. |
| `key_files_deleted` / `key_files_modified` | string[] | Tracked key-file changes affecting disposition. |

### 6.4 Decision (`decisions/NNNN-slug.md`)

MADR markdown. Frontmatter carries `Status`, `Date`, and `Thread-Id: <ulid>`. Immutable after `accepted` (only the status line may change). `record_decision` MUST emit the `Thread-Id:` frontmatter (the driver takes raw markdown). `NNNN` is zero-padded and monotonic (`nextDecisionNumber`).

### 6.5 Derived indexes (`index/`; rebuilt from records, never hand-edited)

| File | Shape | Contract |
|---|---|---|
| `by-slug.json` | `{ [slug]: threadId }` | On slug collision, **keep-EARLIEST** (first-created wins) so the re-attach slug fallback is stable. |
| `by-branch.json` | `{ [repo + " " + branch]: [bindingId, ...] }` | Branch lookup. |
| `children.json` | `{ [parentId]: [childId, ...] }` | Adjacency children. |
| `resumable.json` | `[ {id, slug, title, status, next_step} ]` | `status` in `active`\|`paused`\|`blocked`. |

## 7. Storage Driver Layer

`isGit()` is SYNCHRONOUS; every other method is async and throws on failure (no silent nulls except the documented `read*` misses).

```
class StorageDriver {
  isGit()                                  boolean (synchronous)
  async init()                             ensure ledger root + subdirs exist
  async root()                             absolute path to ledger root

  async readThread(id)                     Thread | null
  async writeThread(thread)                validate + atomic write
  async listThreads()                      Thread[]

  async readBinding(id)                    BranchBinding | null
  async writeBinding(binding)              validate + atomic write
  async listBindings()                     BranchBinding[]

  async nextDecisionNumber()               zero-padded "NNNN"
  async writeDecision(nnnn, slug, markdown)  path
  async readDecision(nnnn)                 string | null
  async listDecisions()                    [{ nnnn, slug }]

  async appendSessionEvent(threadId, isoTs, actor, markdown)  path (append-only; file <iso-ts>--<actor>.md)

  async readIndexFile(name)                object; missing 'resumable' -> [], any other missing index -> {}
  async writeIndexFile(name, obj)          atomic write

  async commit(message)                    LocalDriver -> {committed:false}; GitRefDriver -> {committed, sha, empty}
  async sync()                             LocalDriver -> {synced:false}; GitRefDriver -> {synced, pushed, merged, remote, attempts}

  async observeBranch(binding)             git drivers only -> BranchObservation
  async observeNewBranch(repo, branch)     git drivers only -> {thread_id_trailer, first_commit}
  async listRepoBranches(repo)             git drivers only -> string[] (feature-repo branch names)
}
```

**Requirements & invariants.**
- `writeDecision(nnnn, slug, markdown)` VALIDATES `slug` against `^[a-z0-9][a-z0-9-]*$` before interpolating it into a path (an unvalidated slug is an arbitrary-write path traversal).
- `observeBranch`/`observeNewBranch`/`listRepoBranches` are GIT-DRIVER-ONLY. `LocalDriver` ships THROWING STUBS (`throw new Error("<method>: git drivers only")`) — a loud not-implemented, never a raw `TypeError`; one unit test per stub asserts the throw. All three query the FEATURE repo (`binding.repo` / `repo`), never the ledger worktree. `listRepoBranches(repo)` returns the repo's branch names; drift reconciliation uses it to find new/renamed branches to re-attach (keeps all live-git behind the driver).
- `observeBranch(binding)` deleted-branch conformance (CRITICAL — the durability headline). The `branch_exists === false` path is a FIRST-CLASS branch of `observeBranch`, NEVER an early return, and computes all four of: (1) `first_commit_present` is TRUE when `binding.first_commit` is null OR `branch_exists === false` — deletion never invalidates the anchor; (2) `head-missing` (the CRITICAL trigger) is reachable ONLY on a LIVE, rewritten branch (`branch_exists === true` with a missing recorded head) — never on a deleted branch, so a deleted+GC'd branch cannot escalate to CRITICAL (honoring §12.2's deleted-incomplete -> WARNING invariant); (3) when the branch is deleted, `merged`/`squash_merged` are computed BEST-EFFORT from `binding.first_commit` (ancestry reachability + patch-id vs the integration base, resolved below), NOT from a live tip — so a merged-then-pruned branch reports `merged:true` and classifies COMPLETE instead of mis-classifying as orphaned. This COMPLETE headline is CONTINGENT on `binding.first_commit` being non-null: when `first_commit` is null AND the branch is deleted, the best-effort `merged`/`squash_merged` have no anchor, so no merge is detectable and the observation degrades to `branch-gone(deleted)` WARNING -> orphaned (honest degradation, never a crash); (4) `ahead`/`behind` resolve vs `origin/<branch>` and are `0/0` when there is no upstream (never an error). `force_push_detected` is always the literal `false` in v2 (reflog detection deferred). **Integration-base resolution (authoritative; consumed by `merged`/`squash_merged` here and referenced from §6.3/§12.1/§12.2).** The base resolves, in order: (a) the `LEDGER_BASE_REF` env override when set — read at runtime from `process.env` inside the git driver, NOT part of the two-var server userConfig map (§10, §14.A2), analogous to how the nudge knobs are read directly from `process.env`; (b) the remote default branch via `git symbolic-ref refs/remotes/origin/HEAD` (e.g. `origin/main`); (c) `origin/main`, then `origin/master`. All base-ref resolution runs inside the git driver (git-driver-only), so no `src/drift/*` file shells out. Source: Plan 05 `observeBranch` spec + the observation-semantics-conformance decision; the source leaves the base abstract ("the integration base"), so this concrete resolution is pinned here.
- The shared git-exec util (`util/`) accepts an optional `{env}` merged over `process.env`, so drivers can set `GIT_AUTHOR_DATE`/`GIT_COMMITTER_DATE` for the deterministic root and init-scaffold commits.
- The shared record serializer `serializeRecord(obj): string` (`src/drivers/layout.mjs`, pure) emits EXACTLY `JSON.stringify(obj, null, 2) + '\n'` (2-space pretty-print plus exactly one trailing newline). This canonical form is reused byte-for-byte by `GitRefDriver` and the PreCompact hook (checkpoint sentinel) — it MUST be identical everywhere. The out-of-repo local migration tool reuses this SAME exported serializer, so its emitted records are byte-identical.
- `appendSessionEvent(threadId, isoTs, actor, markdown)` is append-only and writes `<iso-ts>--<actor>.md` under `sessions/<threadId>/`, where the ULID `threadId` is boundary-validated (`isUlid`, throws otherwise), `isoTs` is sanitized `[:.] -> '-'`, and `actor` is sanitized `[^a-zA-Z0-9._-] -> '-'`.
- The context object `ctx` has ONE defined shape: `{ driver, projectDir, userConfig, now }`, built by `buildContext({projectDir?, userConfig?, now?}): Promise<ctx>` in `src/tools/context.mjs` (which resolves `projectDir` from arg -> `CLAUDE_PROJECT_DIR` -> `process.cwd()`, then `selectDriver` + `init()`s the driver; `now` defaults to a wall-clock ISO FUNCTION, never a stamped field). `ctx` is consumed by every MCP tool handler, `runReconcile`, `reattach`, and `bin/ledger-cli.mjs`. The active-thread pointer writer/clearer/reader helpers `writeActiveThread(ctx, threadId)` / `clearActiveThread(ctx)` / `readActiveThread(ctx)` / `activeThreadPath(ctx)` live in `src/util/active-thread.mjs`.
- `sync()` trigger (pinned): the SessionStart hook runs `ledger-cli sync` (fetch/merge = pull) BEFORE reconcile; the handoff / Stop path runs `ledger-cli sync` (CAS-push) to publish local commits. Without a pinned trigger `sync()` is never called and the multi-user goal is inert.
- `selectDriver(projectDir, userConfig)` is SYNCHRONOUS (it branches on the synchronous `isGitWorkTreeSync(projectDir)`; it never awaits).

**Deterministic orphan root (CRITICAL — multi-user bootstrap correctness).** The orphan-branch backend mints its root commit (`git commit-tree`) over the well-known empty tree `EMPTY_TREE_SHA = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'` with a FIXED identity and FIXED dates — `LEDGER_INIT_IDENTITY`: author + committer name `'Continuity Ledger'`, email `'ledger@continuity.invalid'`, `GIT_AUTHOR_DATE` = `GIT_COMMITTER_DATE` = `'2020-01-01T00:00:00Z'` — and the FIXED message `LEDGER_ROOT_MESSAGE = 'chore: initialize continuity ledger'`. Every machine yields an IDENTICAL root SHA, so all clones literally share history and first-divergence merges are ordinary fast-forward/3-way, conflict-minimal. `--allow-unrelated-histories` is explicitly REJECTED (it joins two unrelated DAGs into an add/add conflict storm exactly where the goal is conflict-free concurrent writes); a divergent root must surface as a loud error, not be silently merged. `EMPTY_TREE_SHA`, `LEDGER_ROOT_MESSAGE`, `LEDGER_INIT_IDENTITY`, and the root-minting helper `mintLedgerRoot(repoDir)` are exported ONCE from `src/drivers/git-ledger.mjs` (§5.1) and imported by `GitRefDriver` and the multi-user clone-adoption path — redeclared nowhere. The out-of-repo local migration tool imports the SAME `mintLedgerRoot` so a migrated ledger ref carries the byte-identical root SHA and is legitimately adopted by `#ensureLedgerRef`. A two-clones-init-before-push fixture proves the property.

**`GitRefDriver` behavior.**

*Worktree placement.* `commit()`/`sync()` operate a DETACHED worktree at `<dataRoot>/<project-key>/ledger-worktree` — OUTSIDE the user's repo working tree (`fs.rm` before `worktree add`, WITHOUT `--force`, for crash recovery). Invariant: because the worktree is a separate detached checkout outside the repo, ledger writes NEVER appear in the user's `git status`. The `worktreeDir` argument is passed by `selectDriver` at construction (see Driver selection).

*`init()` scaffold (idempotent).* `init()` ensures the ledger ref exists, then WRITES and COMMITS BOTH scaffold files into the ledger ref: `.gitattributes` containing `sessions/**/*.md merge=union`, AND `.gitignore` containing `index/`. Both files are required: `commit()` runs `git add -A`, so WITHOUT the `.gitignore`, the derived `index/` would be committed into the ledger ref and collide across clones (a same-line union of two JSON objects is non-parseable). The derived `index/` therefore NEVER enters the ledger ref; it is rebuilt from records on startup. When the ref ALREADY exists, that branch is the ADOPTION path (a pre-seeded ref — whether from another clone or from the out-of-repo local migration tool — is adopted, not re-created). All ledger-side commits use `--no-verify`.

*`commit()`* returns `{committed, sha, empty}` (`{committed:false, sha:null, empty:true}` when nothing is staged, else `{committed:true, sha, empty:false}`).

*`sync()`* is a bounded CAS-retry loop, `MAX_SYNC_ATTEMPTS = 5`, throwing on exhaustion. Each attempt fetches the remote tip and takes one of three branches: remote is BEHIND (an ancestor of local) -> fast-forward push guarded by `--force-with-lease`; local is BEHIND (an ancestor of remote) -> fast-forward the local ref/worktree to remote, push nothing; DIVERGED -> in the detached worktree `git merge --no-verify --no-edit -X theirs -m 'chore: merge ledger' <mirrorRef>`, advance the ledger ref, then re-lease and re-push. Returns `{synced, pushed, merged, remote, attempts}` (no remote -> `{synced:false, pushed:false, merged:false, remote:false, attempts:0}`).

*custom-ref backend.* On the `custom-ref` backend, `init()` additionally installs a clobber-guarded fetch refspec `+refs/ledger/*:refs/ledger-remote/*` into `remote.<remote>.fetch` (append-only via `git config --add`, never clobbering the existing `+refs/heads/*:...`). Because arbitrary `refs/ledger/*` acceptance is host-dependent, a rejected first push surfaces a clear error (the standard git push failure) so the user can flip `ledger_backend` back to `orphan-branch`.

**Driver selection.** `selectDriver(projectDir, userConfig)` is SYNCHRONOUS: if `isGitWorkTreeSync(projectDir)` -> `GitRefDriver({ repoDir: projectDir, worktreeDir: <dataRoot>/<project-key>/ledger-worktree, backend: userConfig.ledger_backend ?? 'orphan-branch', branch: userConfig.ledger_branch ?? '_ledger', remote: DEFAULT_REMOTE })` (orphan-branch default, custom-ref opt-in; `worktreeDir` is the outside-repo detached worktree); else -> `LocalDriver(<dataRoot>/<project-key>/ledger)`. `selectDriver` NEVER auto-git-inits a project. `bin/ledger-server.mjs` reads `LEDGER_*` env into `userConfig` with an explicit UPPER->lower mapping of EXACTLY two keys — `LEDGER_BACKEND->ledger_backend`, `LEDGER_BRANCH->ledger_branch` — and passes it INTO `buildContext` (never hardcoded `{}`). The trailer var (`LEDGER_DISABLE_TRAILER`) is HOOK-plane only and is NEVER mapped into the server userConfig; the server has no `disable_trailer` consumer (§10, §14.A1/§14.A2). Default remote is `'origin'` (`DEFAULT_REMOTE`); there is NO `ledger_remote` config key.

## 8. MCP Server & Tool Surface

Tool names are `mcp__ledger__<tool>`. Args/returns are JSON validated by each tool's `inputSchema` (low-level `Server` + per-tool ajv — the correct single validator, no fourth dependency). The surface is EXACTLY these 12 tools; `restore` is deliberately absent (a human-run CLI verb only — see §10, §13).

| Tool | Signature | Returns / semantics |
|---|---|---|
| `open_thread` | `{title, slug?, parent_id?, predecessor_id?, completion_criteria?, vcs_ref?, external_refs?}` | `{thread}`. New thread; enters `active`; writes the active-thread pointer. Any `parent_id`/`predecessor_id` MUST reference an EXISTING thread (referential integrity is verified before creation) — an unknown id is rejected. |
| `bind_branch` | `{thread_id, repo, branch, first_commit?, trailer_present?}` | `{binding}`. Writes the active-thread pointer. |
| `append_session_event` | `{thread_id, actor, body}` | `{path}`. Append-only session log. Commits WITHOUT reindex (session logs are not indexed) — the only write tool that calls `driver.commit` directly instead of `commitAndReindex`. |
| `record_decision` | `{thread_id, slug, title, context, options, outcome}` | `{number, path}`. Emits `Thread-Id:` frontmatter, then appends the `NNNN-slug` id to the owning thread's `spine.key_decisions` (dedup — skipped if already present), then reindexes + commits. Skipping the link would leave the resume brief's `key_decisions` empty. |
| `transition_thread` | `{thread_id, to_status, closure_statement?, blocked_by?, abandoned_reason?}` | `{thread}`. FSM + DoD enforced (§9). Enter-`active` writes the active-thread pointer to this thread; leave-`active` CLEARS the pointer ONLY when this thread IS the current pointer target (identity-matched — §10), never unconditionally. A legal transition also appends a `ledger`-actor session event (transition audit note). |
| `update_thread` | `{thread_id, spine?, completion_criteria?}` | `{thread}`. Patches `spine` fields AND toggles `completion_criteria[].done`. On the spine patch it FORCES `spine.status = thread.status` (status changes ONLY via `transition_thread`, NEVER via `update_thread`). Matches criteria by `text` (immutable; may only flip `done`, never add/remove/edit texts; unknown texts rejected). Caps-enforced and terminal-refused on BOTH paths; `spine.key_decisions` is EXEMPT from the array-count cap so a >20-decision epic can still refresh its spine. Supersedes the earlier `update_thread_spine`. |
| `archive_thread` | `{thread_id, reason}` | `{thread}`. Archives = transition to `abandoned` (setting `abandoned_reason = reason`) through the SAME shared FSM transition guard as every other state change — NOT an out-of-FSM `archived` state. A `blocked` thread is REFUSED (the matrix has no `blocked -> abandoned`; it must first go `blocked -> paused`). Clears the active-thread pointer if it was the active thread (identity-matched — §10; never unconditionally). |
| `create_successor` | `{predecessor_id, title, completion_criteria}` | `{thread}`. New thread (new->active); writes the active-thread pointer. REQUIRES a TERMINAL predecessor (`done` \| `abandoned`) and non-empty `completion_criteria`; the successor carries `predecessor_id` and INHERITS `predecessor.parent_id`. |
| `reopen` | `{thread_id}` | `{thread}`. Moves a `paused`/`blocked` thread back to `active` (both legal in the matrix); REFUSES a terminal thread (directs to `create_successor`) and a thread already `active`. Writes the active-thread pointer. |
| `reconcile` | `{}` | `{drift:[...], dispositions:[...]}` (§12). MUTATES bindings (disposition/status) and scans for new/renamed branches to re-attach; "recommend-only" is true of THREAD TRANSITIONS only. |
| `rebuild_index` | `{}` | `{counts}` — includes a `resumable` count. |
| `get_resume_brief` | `{thread_id}` | `{brief}` — SPINE-ONLY; the refreshed spine subsumes the latest session log, so no session-read method is added. `brief` = the thread's spine fields (`active_goal`/`next_step`/`open_risks`/`key_decisions`/`out_of_scope`, plus `thread_id`/`slug`/`title`/`status`) + `children` (resolved child summaries, each `{id, slug, title, status}`) + `predecessor_id` + `drift: []` (repo-wide drift is supplied separately by the SessionStart hook / `reconcile`). |

**Tool-input `completion_criteria` shape.** On `open_thread` and `create_successor`, each INPUT `completion_criteria` item requires ONLY `text` (string, `minLength:1`); `done` is OPTIONAL and defaults to `false`. This is the tool INPUT schema — do NOT mirror the record schema's `required:[text,done]` (§6.1) onto the tool input. `create_successor` additionally requires the array be non-empty (`minItems:1`); `open_thread`'s `completion_criteria` is optional.

**Commit responsibility.** `commitAndReindex(driver, message): Promise<counts>` (in `src/tools/shared.mjs`, §5.1) rebuilds the derived index (`rebuildIndex(driver)`) THEN calls `driver.commit(message)`, returning the index `counts`. The nine write-capable tools (including the `reconcile` WRAPPER) wrap their result with `commitAndReindex`. `append_session_event` is the one exception: it calls `driver.commit` directly (no reindex — session logs are not indexed). The `runReconcile(ctx)` CORE stays COMMIT-FREE (§12), so the commit is neither dropped nor doubled.

## 9. Lifecycle: FSM, DoD, Caps

**States:** `active | paused | blocked | done | abandoned`; `done`/`abandoned` are terminal. `ALLOWED_TRANSITIONS` is copied verbatim from `rules/common/continuity-ledger.md`:

- `(new)->active`
- `active->paused`
- `active->blocked` (`blocked_by` required)
- `active->done` (DoD gate)
- `active->abandoned` (`abandoned_reason` required)
- `paused->active`
- `paused->done`
- `paused->abandoned`
- `blocked->active`
- `blocked->paused`

The server REFUSES any transition not in the matrix. Every legal transition also appends a `ledger`-actor session event (via `appendSessionEvent`) as an immutable transition audit note.

**Definition-of-Done gate for `done`:** `completion_criteria` non-empty AND every entry `done:true` AND a non-empty `closure_statement`. Any unmet condition refuses the transition.

**Caps enforcement.** Spine SCALAR fields (`status`/`active_goal`/`next_step`), spine ARRAY fields, and `completion_criteria` are cap-enforced on write; terminal threads are refused mutation. Pinned values: `SPINE_CAPS = { scalarFieldMaxChars: 500, arrayMaxItems: 20, arrayItemMaxChars: 300 }` — each scalar spine field is char-capped at `scalarFieldMaxChars`; the count-capped arrays (`open_risks`/`out_of_scope`) are capped at `arrayMaxItems`; every array item (all three arrays) is char-capped at `arrayItemMaxChars`. `completion_criteria` has NO numeric count cap — `SPINE_CAPS` has no criteria key and `COUNT_CAPPED_ARRAY_FIELDS` is exactly `['open_risks','out_of_scope']`; "cap-enforced on the criteria path" means ONLY the terminal-refuse guard + the immutable-criterion-text rule + ajv schema validation. A thread with 21+ criteria is therefore legal and can still flip every criterion `done:true` to reach `done` (applying `arrayMaxItems` to `completion_criteria` would permanently strand such a thread short of `done` — a permanent stuck state). `spine.key_decisions` is EXEMPT from the array-count cap (an epic accumulates many decision links and must still refresh its spine) but retains the per-item char cap. Caps mirror the prose-ledger discipline (bounded spine; decisions live in append-only sidecars, linked by `NNNN`(-slug) decision-ref, never compressed away).

## 10. Control Plane: CLI, active-thread pointer, env/config

**`bin/ledger-cli.mjs`** is the hook-facing seam (hooks cannot speak MCP stdio). It wraps `listTools`/`callTool`/`buildContext` and exposes thin subcommands:

| Subcommand | Returns | Notes |
|---|---|---|
| `roster` | `resumable[]` | For the SessionStart / UserPromptSubmit roster. |
| `reconcile` | `{drift, dispositions}` | Drives `runReconcile` via the tool wrapper. |
| `active-thread` | `{thread_id}` | Reads the pointer below. |
| `record-sha <sha>` | `{}` | Sets `first_commit` set-once. Resolves the target via the active-thread pointer -> that thread's ACTIVE binding(s) whose `first_commit` is still `null`, and writes `<sha>` on each (never overwriting a non-null anchor). The PostToolUse hook supplies `<sha>` (the current `HEAD`, §11) and gates this to commit-ish operations. Anchors the §12.6 first-commit re-attach rung. |
| `sync` | `{synced, ...}` | Drives `driver.sync()`. |
| `restore <target>` | result | HUMAN-RUN, CLI-ONLY (§13). |

`restore` is NEVER an `mcp__ledger__*` tool: the frozen 12-tool surface is not widened by it. Same containment as `no-direct-db-access`: the destructive one-shot verb simply does not exist in the model's tool set, so a prompt-injected model can never trigger it. The `has-handoff` subcommand does NOT exist (superseded by `active-thread`).

**Active-thread control pointer.** A single-line ULID at `<git-common-dir>/ledger/active-thread` (non-git home: `${CLAUDE_PLUGIN_DATA}/<project-key>/active-thread`). BOTH the server writer AND the commit-msg/CLI reader resolve the path via `git rev-parse --git-common-dir` (NOT `--git-dir`), so linked worktrees/submodules share ONE pointer. The `commit-msg` trailer resolves the Thread-Id in order `LEDGER_THREAD_ID` env -> the pointer file -> no-op (no trailer written when both are empty). The SERVER WRITES the pointer whenever a thread ENTERS `active` — `open_thread` (new->active), `create_successor` (new->active), `transition_thread`->active, `reopen`, `bind_branch` — and CLEARS it whenever the active thread LEAVES `active` — `transition_thread` active->{paused,blocked,done,abandoned}, `archive_thread`. Writing on every creation-into-active closes the "freshly created active thread leaves the pointer empty" gap and makes the Stop-gate signal (§11) correct. Multi-thread-safe clear (spec-tightening beyond the plan): a LEAVE-`active` transition clears the pointer ONLY when the transitioned thread IS the current pointer target (identity-matched — `readActiveThread(ctx) === thread.id`). A legal transition of a DIFFERENT thread out of `active` — e.g. `transition_thread(B -> abandoned)` while thread A owns the pointer — MUST leave A's pointer intact, because the Stop gate (§11) reads it. The raw Plan 03 handler clears UNCONDITIONALLY on any non-`active` target (a latent multi-thread bug); the built system MUST implement the identity-matched clear pinned here.

**Env / config wiring.**
- `bin/ledger-server.mjs` maps `LEDGER_*` -> `userConfig` (UPPER->lower) and passes it into `buildContext`.
- Trailer opt-out: canonical env `LEDGER_DISABLE_TRAILER="true"` is read by the Plan-04 INSTALLER (hook side, NOT the server), which writes git config `continuity.trailer=false`; the runtime `commit-msg` hook reads `continuity.trailer` and no-ops the trailer when false. Flow: env -> installer -> git config -> runtime hook. The non-contract name `CONTINUITY_INSTALL_COMMIT_MSG` does NOT exist.
- Nudge knobs `LEDGER_NUDGE_FRACTION` / `LEDGER_NUDGE_BYTES` are read at runtime by the PostToolUse hook from its own `process.env`. The nudge is a transcript-BYTE proxy, NOT a context-% API (Claude Code does not expose context-% to hooks): it fires when `size(transcript) >= budget * fraction`, defaulting `fraction = 0.7` and `budget = 1_200_000` bytes, overridable via `LEDGER_NUDGE_FRACTION` / `LEDGER_NUDGE_BYTES` respectively (a `fraction` outside `(0, 1)` or a non-positive/NaN `budget` falls back to the default).
- Consumer split for packaging (§14): SERVER env (via `.mcp.json`) = `LEDGER_BACKEND`, `LEDGER_BRANCH`. HOOK-runtime/installer env = `LEDGER_DISABLE_TRAILER`, `LEDGER_NUDGE_FRACTION`, `LEDGER_NUDGE_BYTES`. The trailer/nudge vars go to the HOOK env, never the server.

## 11. Hooks & Installer

Per the Claude Code hook JSON protocol:

| Hook | Kind | Contract |
|---|---|---|
| `SessionStart` | inject-only | (RE)INSTALLS the managed git-hooks dir (installer self-heal, git projects only) BEFORE anything else, THEN runs `ledger-cli sync` (pull) THEN `reconcile`, then injects the `resumable.json` roster. |
| `UserPromptSubmit` | can block | Injects the resumable roster on resume-intent detection (tightened intent regex). |
| `PreToolUse` | deny + rewrite | DENIES a `Write` \| `Edit` \| `MultiEdit` \| `NotebookEdit` whose target path is under a ledger root, and a `Bash` command that BOTH references a ledger-root path AND contains a mutating construct (matcher `Write\|Edit\|MultiEdit\|NotebookEdit\|Bash`); AUTO-APPROVES `mcp__ledger__*`. Reads are never denied. |
| `PostToolUse` | observe | Nudges via a transcript-BYTE proxy for the ~70% compaction threshold (env-tunable via `LEDGER_NUDGE_*`; see §10); reads the current `HEAD` sha and calls `record-sha <sha>` (§10) ONLY on commit-ish operations, not every edit. |
| `Stop` | exit 2 | BLOCKS WHILE the active-thread pointer is NON-EMPTY. A handed-off thread has cleared the pointer (active->paused at handoff), so an empty pointer PASSES. This replaces the old always-true "handoff event exists" predicate. When the pointer is EMPTY (Stop ALLOWS), the hook runs `ledger-cli sync` (CAS-push, fail-open) to PUBLISH local ledger commits — without this the commits sit unpushed until the next SessionStart, weakening the multi-user publish path. |
| `PreCompact` | observe | Writes a checkpoint sentinel (imports `serializeRecord`). |
| `commit-msg` | mutate | Inserts an idempotent `Thread-Id:` trailer (resolving `--git-common-dir`) unless `continuity.trailer=false`. |

**Hook-plane env (`hooks/hooks.json`).** `hooks/hooks.json` is BOTH the six-event control-plane wiring AND the concrete delivery path for the HOOK-plane trailer env. Its single top-level `env` block delivers EXACTLY ONE key — `LEDGER_DISABLE_TRAILER=${user_config.disable_trailer}` — to the hook/installer runtime, NEVER to the server (§10, §14.A2). The nudge knobs `LEDGER_NUDGE_FRACTION` / `LEDGER_NUDGE_BYTES` are NOT in this `env` block and are NOT `${user_config.*}`-sourced (userConfig is frozen to exactly `ledger_backend`/`ledger_branch`/`disable_trailer`, §14.A1 — there is no nudge key); they are AMBIENT operator overrides read directly from the hook's own `process.env` at runtime (§10). This realizes the trailer flow: userConfig `disable_trailer` -> `hooks/hooks.json` env `LEDGER_DISABLE_TRAILER` -> installer -> git config `continuity.trailer` -> runtime `commit-msg`.

Concrete `hooks/hooks.json` artifact shape (contrast the `.mcp.json` contract in §14.A2): each of the six events maps to its plugin-root entry script, plus the single top-level `env` block:

```json
{
  "hooks": {
    "SessionStart":     [{ "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/session-start.mjs\"", "timeout": 30 }] }],
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/user-prompt-submit.mjs\"", "timeout": 15 }] }],
    "PreToolUse":       [{ "matcher": "Write|Edit|MultiEdit|NotebookEdit|Bash|mcp__ledger__.*", "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/pre-tool-use.mjs\"", "timeout": 10 }] }],
    "PostToolUse":      [{ "matcher": "Write|Edit|MultiEdit|NotebookEdit|Bash", "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/post-tool-use.mjs\"", "timeout": 15 }] }],
    "Stop":             [{ "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/stop.mjs\"", "timeout": 15 }] }],
    "PreCompact":       [{ "hooks": [{ "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/pre-compact.mjs\"", "timeout": 10 }] }]
  },
  "env": { "LEDGER_DISABLE_TRAILER": "${user_config.disable_trailer}" }
}
```

Only `PreToolUse`/`PostToolUse` carry a `matcher`; the four session-level events omit it. The `commit-msg`/`dispatcher` git hooks are NOT wired here — they are installed into `core.hooksPath` by the SessionStart installer (below), never via the Claude Code hook protocol.

**Hook installer (dispatcher, chain-not-clobber, fail-open).** The installer `installCommitMsgHook({repoDir, managedDir, sourceHook, disableTrailer?})` sets `core.hooksPath=<managedDir>`, where `<managedDir>` is pinned to `${CLAUDE_PLUGIN_DATA}/<project-key>/githooks` (persistent plugin DATA, keyed by `project-key`). The installer's `sourceHook` argument is pinned to `${CLAUDE_PLUGIN_ROOT}/hooks/commit-msg`, and it resolves the dispatcher as `sourceHook`'s SIBLING (`join(dirname(sourceHook), 'dispatcher')`) — so `hooks/commit-msg` MUST be staged BESIDE `hooks/dispatcher` in the packaged tree. Staging `commit-msg` anywhere else breaks the dispatcher copy, leaving the managed dir with `commit-msg` but NO dispatcher, so every OTHER git-hook name (pre-commit/pre-push/husky) stops chaining. The managed dir contains a DISPATCHER for EVERY standard hook name that execs the same-named hook from the PRIOR hooks location (recorded as `continuity.priorHooksPath`; default `<git-common-dir>/hooks`). Only `commit-msg` additionally inserts the trailer. The dispatcher FAILS OPEN if the managed dir is missing (a deleted plugin dir must not leave `core.hooksPath` dangling and run NO hooks). This CHAINS rather than clobbers, so a Husky/pre-commit repo keeps its secret-scan/lint/test and pre-push — never silently disabling a user's security hooks. The dispatcher is copied under the 17 `STANDARD_HOOKS` names (`applypatch-msg`, `pre-applypatch`, `post-applypatch`, `pre-commit`, `pre-merge-commit`, `prepare-commit-msg`, `post-commit`, `pre-rebase`, `post-checkout`, `post-merge`, `pre-push`, `post-rewrite`, `pre-auto-gc`, `push-to-checkout`, `post-index-change`, `sendemail-validate`, `reference-transaction`); `commit-msg` is the trailer script.

**Installer invoker + self-heal (CRITICAL — without this the whole trailer chain is DEAD).** SessionStart is the installer's INVOKER: on EVERY git session it (RE)INSTALLS the managed git-hooks dir as a fail-open self-heal, running BEFORE `sync`. Without this trigger `core.hooksPath` is never set, so the `commit-msg` trailer + dispatcher chain never activate, `Thread-Id:` trailers are never written, and the trailer / first-commit branch re-attach (§12.6) is silently DEAD. On every (re)install the installer UNCONDITIONALLY re-copies `commit-msg` + every dispatcher (so a plugin upgrade never leaves a stale hook script), and it is re-run each SessionStart. The FIRST install records the prior `core.hooksPath` into `continuity.priorHooksPath` (empty encodes "git default was in effect") and repoints `core.hooksPath` at `<managedDir>`; a reinstall (`core.hooksPath` already equals `<managedDir>`) refreshes the copies, leaves the config keys untouched, and returns `alreadyInstalled:true` (never overwriting `continuity.priorHooksPath` with `<managedDir>`, which would make dispatchers exec themselves). On git < 2.9 (detected by `supportsHooksPath`, which parses `git --version` and requires major > 2 OR major == 2 && minor >= 9) the installer is a NO-OP returning `installed:false`.

**Uninstall / restore.** `uninstallCommitMsgHook({repoDir, managedDir})` RESTORES the prior `core.hooksPath` value (or `--unset`s it back to the git default when the recorded prior value was empty) and clears `continuity.priorHooksPath` BEFORE removing anything; it no-ops (`removed:false`) when the managed dir is not the current `core.hooksPath`. It NEVER deletes user hooks — only the managed `core.hooksPath` redirect is undone.

## 12. Drift Reconciliation & Branch Re-attach

`runReconcile(ctx)` compares each open `BranchBinding` against live git state (observed only through the driver), emits an 8-signal drift report, dispositions each binding, applies the binding-status bookkeeping it owns, then scans each bound repo's branches for new/renamed ones with no binding and re-attaches them. It returns `{ drift: DriftEntry[], dispositions: Disposition[] }`.

The layer is split into pure classification/disposition/slug functions (exhaustively unit-testable with hand-built observations and in-memory fake drivers) and I/O orchestration (`runReconcile`, `reattach`). No file in this subsystem shells out to git; every live-git fact arrives through three driver methods (`observeBranch`, `observeNewBranch`, `listRepoBranches`).

### 12.1 Contracts

`DriftEntry` = `{ binding_id, thread_id, repo, branch, classification, signals: [{ code, classification, detail }] }`.

`classification` is a field literally named `classification`, valued exactly one of the uppercase string constants `"CRITICAL"`, `"WARNING"`, `"COMPLETE"` (NOT `severity`/`level`). `CLASSIFICATION_RANK` = `{ CRITICAL: 3, WARNING: 2, COMPLETE: 1 }`. An entry's `classification` is the max over its signals' classifications by that rank.

`Disposition` has two variants sharing one array:
- binding-drift: `{ binding_id, thread_id, action, binding_status, closed_reason, thread_recommendation, dod_ready, reason }`.
- re-attach: `{ kind: "reattach", thread_id, branch, repo, method }`.

`BranchObservation` field semantics that drive signals: `first_commit_present` is `true` when `binding.first_commit` is null (nothing to miss) OR `branch_exists === false` (deletion never invalidates the anchor, so `head-missing` never fires on a deleted branch); `merged` = branch tip reachable from the integration base (resolved per §7's observeBranch base-ref rule), computed BEST-EFFORT from `binding.first_commit` when the branch is deleted; `squash_merged` = patch-id of branch content matches a commit on that base, likewise best-effort from `binding.first_commit` when deleted; `ahead`/`behind` are integers `>= 0` vs `origin/<branch>` (`0/0` when there is no upstream, never an error); `diverged_from_upstream` is `true` only on genuine divergence/force-push.

### 12.2 Drift classifier — the 8 signals

`classifyObservation(binding, observation): DriftEntry | null` is pure. It validates inputs at the boundary (throws `malformed BranchObservation` on a bad observation; throws referencing `thread_id` when the binding lacks `id`/`thread_id`), evaluates the 8 signal conditions in the fixed order below, appends each fired signal as `{ code, classification, detail }`, and returns `null` when no signal fires.

| # | Signal code | Raising condition | Classification | Meaning |
|---|---|---|---|---|
| 1 | `head-missing` | `!first_commit_present` | CRITICAL | Recorded `first_commit` unreachable — anchor invalid. |
| 2 | `force-push` | `force_push_detected` | CRITICAL | Non-fast-forward rewrite. In v2 `force_push_detected` is always literal `false` (reflog detection deferred post-v2); the rung is retained but unreachable — divergence is carried by `diverged_from_upstream`. |
| 3 | `key-file-deleted` | `key_files_deleted.length > 0` | CRITICAL | Ledger/thread key files deleted; detail = joined path list. |
| 4 | `not-ancestor` | `branch_exists && diverged_from_upstream` | WARNING | Head and `origin/<branch>` diverged. Gated on `branch_exists` so it never false-positives on every live branch. |
| 5 | `divergence` | `ahead > 0 \|\| behind > 0` | WARNING | Out of sync; detail exactly `ahead <N>, behind <M>`. |
| 6 | `key-file-modified` | `key_files_modified.length > 0` | WARNING | Ledger/thread key files modified; detail = joined path list. |
| 7 | `squash-merged` | `squash_merged` | COMPLETE | Patch-id match on the integration base (§7). |
| 8 | `branch-gone` | `merged \|\| squash_merged \|\| !branch_exists` | COMPLETE when `merged\|\|squash_merged` (detail `"merged"`); WARNING otherwise (detail `"deleted"`) | Work landed OR branch deleted incomplete. A deleted-incomplete branch is WARNING, never CRITICAL (de-policed reframe). |

Invariants: multiple signals may fire on one observation; the entry `classification` is the max across them. A squash-merged branch reports BOTH `squash-merged` and `branch-gone(merged)`. The `branch-gone` detail (`"merged"` vs `"deleted"`) is the merged/deleted discriminator downstream, decoupled from the classification value. A GENUINE squash-merge co-fires the `key-file-modified` WARNING, so the ENTRY-max classification is WARNING even though the `squash-merged` signal itself is COMPLETE; disposition still resolves `mark-merged` from the `squash-merged` signal CODE (codes-vs-classification decoupling, §12.3), so tests assert at the SIGNAL level, never entry=COMPLETE for the squash flow.

### 12.3 Disposition policy

`disposeBinding(entry, thread): Disposition` is pure, consumes `isTerminal` (FSM), and is called only for bindings that produced a drift entry. It inspects the entry's signal codes/details — NOT the classification — to detect merged vs deleted:
- `merged` = codes include `squash-merged`, OR a `branch-gone` signal has detail `"merged"`.
- `orphaned` = a `branch-gone` signal has detail `"deleted"`.

| Precedence | Trigger | action | binding_status | closed_reason | thread_recommendation | dod_ready |
|---|---|---|---|---|---|---|
| 1 | merged | `mark-merged` | `merged` | `merged` | `none` if thread terminal, else `complete` | all criteria checked |
| 2 | orphaned (deleted) | `mark-orphaned` | `orphaned` | `deleted` | `none` if terminal, else `reopen-paused` | `false` |
| 3 | else (divergence, not-ancestor, force-push, head-missing, key-file-modified, key-file-deleted-without-merge/delete) | `re-verify` | `null` | `null` | `re-verify` | `false` |

`dod_ready` = `completion_criteria` is a non-empty array with every element `done === true`; a `null` thread degrades to `dod_ready: false` while still emitting the merged/orphaned action and its recommendation.

Which dispositions MUTATE a binding: `mark-merged` and `mark-orphaned` carry a non-null `binding_status`, so `runReconcile` writes the binding. `re-verify` carries `binding_status: null` — it touches NO binding status (recommend-only at the binding level).

CRITICAL invariant: `reconcile` DOES mutate bindings (applies `binding_status` bookkeeping via `writeBinding`, no FSM gate — bookkeeping the tool owns). "Recommend-only" applies to THREAD TRANSITIONS: `thread_recommendation` is always advisory. `reconcile`/`reattach` NEVER auto-transition a thread's lifecycle state — every thread transition is applied downstream through `transition_thread`, the single place the FSM/DoD gate lives.

### 12.4 Branch-name to slug derivation

`branchSlug(branch): string` is pure: trim, then replace every `/` with `-` (`fix/signup-bug` -> `fix-signup-bug`). Rejects a non-string or empty/blank branch. Produces the `by-slug` index lookup key used by re-attach's slug rung.

### 12.5 `runReconcile(ctx)` orchestration

`runReconcile(ctx, opts?): Promise<{ drift, dispositions }>` FILLS the stub Plan 03 declares (it must not create, rename, or clobber the module) and additionally exports the pure `closedBinding(...)`. It consumes `classifyObservation`, `disposeBinding`, `reattach`, and driver methods `isGit()`, `listBindings()`, `readThread(id)`, `writeBinding(b)`, plus git-only `observeBranch`, `observeNewBranch`, `listRepoBranches`.

Guards: requires `ctx.driver`; a non-git driver short-circuits to `{ drift: [], dispositions: [] }`; a git driver missing `observeBranch`/`listRepoBranches` fails loudly. Timestamp rule (M7): `now = opts.now ?? (typeof ctx.now === 'function' ? ctx.now() : new Date().toISOString())` — `ctx.now` is a FUNCTION on the context, never stamped into a record field.

- **Phase 1 — binding drift.** Iterate `listBindings()`; skip any binding whose `status !== 'active'` (terminal/closed bindings are never observed). For each active binding: `observeBranch` -> `classifyObservation`; if `null`, continue; else `readThread` -> `disposeBinding`. If the disposition has a non-null `binding_status`, build a fresh closed binding via `closedBinding(binding, status, closed_reason, now)` and `writeBinding` it — the ONLY binding side effect. Append to `drift[]`/`dispositions[]`.
- **Phase 2 — new/renamed-branch scan.** Compute `boundKeys` = set of `"${repo} ${branch}"` over all bindings. For each repo, `listRepoBranches(repo)`; for every branch NOT in `boundKeys`, call `reattach(driver, {repo, branch}, {now})`. Each matched re-attach appends `{ kind: "reattach", thread_id, branch, repo, method }`; unmatched (manual) branches are left alone.

`closedBinding(binding, status, reason, nowIso)` is pure/immutable: returns `{ ...binding, status, closed_at: nowIso, closed_reason: reason }`; throws when `nowIso` is missing/blank.

Commit-free invariant (pin 6): `runReconcile` mutates bindings via `writeBinding` but performs NO `commit`/`sync`/re-index. The Plan-03-owned `reconcile` tool wrapper wraps the result with `commitAndReindex`, so the commit is neither dropped nor doubled.

### 12.6 Branch re-attach

`reattach(driver, { repo, branch }, opts?)` re-binds a Thread whose branch was renamed or re-created to the new branch, writing a NEW binding on the same Thread (the new binding's `thread_id` is the lineage link). Consumes `isUlid`, `isTerminal`, `newBinding`, `branchSlug`, driver methods `isGit`, `readThread`, `listBindings`, `readIndexFile('by-slug')`, `writeBinding`, plus git-only `observeNewBranch(repo, branch) -> { thread_id_trailer, first_commit }`. A non-git driver returns `{ matched:false, method:"unsupported" }`; empty `repo`/`branch` rejected; a git driver lacking `observeNewBranch` fails loudly.

Resolution ladder — a 4-rung superset, tried strictly in priority order:

1. **trailer** — `observation.thread_id_trailer` `isUlid` and `readThread` resolves -> method `"trailer"`.
2. **first-commit** — `observation.first_commit` set, find an existing binding whose `first_commit` equals it and whose thread resolves -> method `"first-commit"`.
3. **slug** — `bySlug = readIndexFile('by-slug')`, `candidate = bySlug[branchSlug(branch)]`; if `candidate` `isUlid` and resolves -> method `"slug"`.
4. **manual** — nothing resolved -> `{ matched:false, method:"manual" }`, writes nothing.

ULID-only-keys invariant: every rung resolves TO a stable ULID before binding; a slug or SHA is only a lookup key, never a link target. Keep-EARLIEST tie-break on `by-slug` collisions makes the slug fallback deterministic across rebuilds.

On a match, `readThread(resolved.thread_id)` decides the disposition:
- Non-terminal: `newBinding({ thread_id, repo, branch, first_commit: observation.first_commit ?? null, trailer_present: method === 'trailer', now })` validated + written; result `{ matched:true, method, thread_id, binding, recommendation:{ action:"resume", thread_to:"active", predecessor_id:null } }`.
- Terminal: writes NO binding; result `{ matched:true, method, thread_id, binding:null, recommendation:{ action:"offer-successor", predecessor_id:thread.id, thread_to:null } }` (the successor is created downstream by `create_successor`).

Thread transitions are recommended here, never applied. `reattach` is a library export (no `reattach` MCP tool); besides the Phase-2 scan it may be invoked directly (e.g. from `bind_branch` on an unmatched branch).

### 12.7 File-ownership & rename handling

`key_files_deleted`/`key_files_modified` raise `key-file-deleted` (CRITICAL) and `key-file-modified` (WARNING). In disposition, absent a `branch-gone(merged/deleted)` signal, both fall to `re-verify`, which touches no binding status and only recommends re-verification against HEAD — file-ownership drift raises severity but never mutates a binding short of an actual merge/deletion. Branch renames/re-creations are handled by the Phase-2 scan (a renamed branch has no binding under its new name, so the scan re-attaches it through the §12.6 ladder).

## 13. Restore (disaster recovery)

The plugin ships ONE human-run CLI verb on `bin/ledger-cli.mjs`: `restore` — rebuilds a working store from the committed ledger ref (disaster recovery for a lost checkout). It is CLI-ONLY and HUMAN-RUN: it MUST NOT exist as an `mcp__ledger__*` tool and MUST NOT be reachable through the MCP surface (the frozen 12-tool set). The security property is structural: the destructive verb does not exist in the model's tool set, so a prompt-injected agent cannot trigger it. `runCli` early-branches `restore` BEFORE `buildContext`, so it does not initialize the current project's driver; it constructs its own target.

Signature: `restore <target> [--ref <ref>] [--force]`. Reads the committed orphan ref (default `refs/heads/_ledger`), materializes EVERY record (`git ls-tree -r --name-only` + `git show <ref>:<path>`) into `<target>`, then runs `rebuildIndex`. Refuses a non-empty `<target>` unless `--force`. Invariant: `restore` reads the LEDGER REF ONLY, never a v1 store — disaster recovery, not a migration step. Returns `{ target, ref, restored: <recordCount>, counts }`.

Migration (v1 markdown ledger → v2 store) is OUT OF SCOPE for the published plugin — see the §16 non-goal.

## 14. Packaging, Skills, Installability & Publishing

Parts A and B assemble and prove the artifacts produced by §6–§13 but re-implement none of them. Part C is net-new to this spec (§14.C4). The plugin's internal `name` is `session-continuity` (declared in `plugin.json`); the distribution repository is the standalone private repo `SatanshuMishra/continuity-ledger-plugin` on base branch `main`. Repository name and plugin name are deliberately distinct and both load-bearing.

### Part A — Packaging & Installability

#### A1. Plugin manifest (`.claude-plugin/plugin.json`)

Metadata contract: `name` = `session-continuity` (exact; the skill/tool namespace, must match the marketplace entry's plugin `name`); `version` a SemVer `^\d+\.\d+\.\d+$` (seed `0.1.0`); `description` non-empty; `displayName` = `Session Continuity`; `author.name` = `Session Continuity Plugin`; `license` = `MIT`; `keywords` = `["session-continuity", "ledger", "mcp", "handoff", "resume", "drift"]`.

`userConfig` — EXACTLY these three keys:

| Key | type | default | Consumer plane |
|---|---|---|---|
| `ledger_backend` | string | `orphan-branch` | server (driver selection) |
| `ledger_branch` | string | `_ledger` | server (driver selection) |
| `disable_trailer` | boolean | `false` | hook/installer (never server) |

Every `userConfig` entry declares `type` (string/number/boolean/directory/file), a `title`, and a `description`. The manifest schema has no enum type, so `ledger_backend`'s valid values (`orphan-branch` | `custom-ref`) are validated at the server boundary, NOT the manifest. `ledger_remote` is DROPPED — neither the manifest nor `.mcp.json` carries it; default remote is `origin`. Acceptance: manifest parses; `name === "session-continuity"`; `version` matches SemVer; the three defaults exact; every key fully described.

#### A2. MCP server declaration + userConfig -> env forwarding (`.mcp.json`)

`command === "node"`; `args` launch `${CLAUDE_PLUGIN_ROOT}/bin/ledger-server.mjs` (source entrypoint, not a bundle, so Node resolves the three bare imports against the vendored `${CLAUDE_PLUGIN_ROOT}/node_modules`). The server key MUST be `ledger` (the whole `mcp__ledger__*` surface depends on it) — anything else is a reconcile-and-stop condition, not a silent adaptation.

Env-consumer split (the hard invariant): SERVER env (`mcpServers.ledger.env`) forwards ONLY `LEDGER_BACKEND=${user_config.ledger_backend}` and `LEDGER_BRANCH=${user_config.ledger_branch}`. The `hooks/hooks.json` env block (§11 — NOT this file) delivers EXACTLY ONE `${user_config.*}`-sourced key to the hook/installer plane: `LEDGER_DISABLE_TRAILER=${user_config.disable_trailer}`. The nudge knobs `LEDGER_NUDGE_FRACTION` / `LEDGER_NUDGE_BYTES` are NOT delivered by `hooks/hooks.json` and are NOT `${user_config.*}`-sourced (no userConfig key backs them, §14.A1); they are ambient operator overrides read directly from the hook's `process.env` (§10). Trailer flow: userConfig `disable_trailer` -> hook env `LEDGER_DISABLE_TRAILER` -> installer -> git config `continuity.trailer` -> runtime `commit-msg`. Regression guard: all three hook vars (`LEDGER_DISABLE_TRAILER`, `LEDGER_NUDGE_FRACTION`, `LEDGER_NUDGE_BYTES`) are ABSENT from the server env; their presence there is a packaging failure.

#### A3. Runtime-dependency delivery (`package.json`, lockfile, vendored `node_modules`, `.gitignore`)

`package.json`: `type: "module"`; `engines.node` satisfies `>= 20`; `dependencies` EXACTLY `@modelcontextprotocol/sdk` (1.29.0), `ajv` (8.20.0), `ulid` (3.0.2), each exact-pinned (no `^`/`~`); NO `devDependencies` (any is a packaging failure — implies a fourth dep or a bundler); `scripts.test` runs `node --test` and, if it lists explicit paths, includes BOTH `test/unit` and `test/e2e`; a committed `package-lock.json` pins the transitive closure.

Vendored-dependency delivery (resolved OPEN QUESTION — decision: vendored committed `node_modules`, chosen under Quality > Optimization > Speed because it uniquely satisfies "no build step" AND "no fourth dependency"; a bundle needs a devDependency bundler + build step, a first-run `npm ci` adds a network/runtime failure mode): the three deps are materialized under `${CLAUDE_PLUGIN_ROOT}/node_modules` and TRACKED by git; `.gitignore` STOPS ignoring `node_modules/` (the `*.tmp-*` ignore is retained). Invariants: a marketplace clone yields a working stdio server with ZERO install, ZERO network, ZERO build step; no native addons (`*.node`) may be vendored (the three deps are pure JS, portable across darwin/win32/linux). Generation / vendored-tree parity procedure: `npm ci --omit=dev` against the committed `package-lock.json` materializes EXACTLY the pinned closure (zero devDependencies) into `node_modules/`, which is then committed — keeping the lockfile and the vendored tree in parity. The `package.json` deliberately declares NO `exports` field, keeping deep subpath imports open — this openness is relied upon OUT OF REPO by the separate local migration tool (§16 non-goal), which imports the plugin's driver/serializer/validator modules directly and resolves the three bare deps against this vendored `node_modules`. Acceptance includes: the server entrypoint resolves all three imports from a scrubbed environment (resolution base = plugin root, `NODE_PATH` empty), proving the vendored tree — not a globally reachable copy — satisfies the imports.

#### A4. Packaging ensemble guard (`scripts/check-packaging.mjs`)

A pure-Node (zero-dependency) audit `checkPackaging(root) -> { ok, problems[] }` failing the build with a precise problem list if the ensemble is incomplete. `REQUIRED_FILES`: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.mcp.json`, `package.json`, `package-lock.json`, `bin/ledger-server.mjs`, `bin/ledger-cli.mjs`, `scripts/check-packaging.mjs`, `hooks/hooks.json`, `hooks/commit-msg`, `hooks/dispatcher`, `hooks/session-start.mjs`, `hooks/user-prompt-submit.mjs`, `hooks/pre-tool-use.mjs`, `hooks/post-tool-use.mjs`, `hooks/stop.mjs`, `hooks/pre-compact.mjs`, `skills/session-handoff/SKILL.md`, `skills/resume-project/SKILL.md`. Beyond presence it asserts: `dependencies` are exactly the three, exact-pinned; no `devDependencies`; the `test` script runs `node --test` and does not omit `test/e2e` when listing explicit paths; the `.mcp.json` `ledger` server is shaped correctly; the two server env vars are forwarded strings; the three hook vars are absent from the server env; the `hooks/hooks.json` `env` block DELIVERS `LEDGER_DISABLE_TRAILER=${user_config.disable_trailer}` (present on the HOOK plane — asserting the opt-out is actually wired, so a user who sets `disable_trailer:true` is not silently ignored) while carrying NEITHER nudge knob (ambient `process.env`, §10); the six hook entry scripts (`session-start.mjs`, `user-prompt-submit.mjs`, `pre-tool-use.mjs`, `post-tool-use.mjs`, `stop.mjs`, `pre-compact.mjs`), `hooks/commit-msg`, and `hooks/dispatcher` carry the executable bit; and the `.claude-plugin/marketplace.json` marketplace manifest is present and well-formed (`name === "continuity-ledger"`, `owner.name` present, `plugins[0].name === "session-continuity"`, `plugins[0].source === "./"`). Without this last check `checkPackaging` could return `{ok:true}` while the marketplace manifest is missing/malformed — leaving the plugin uninstallable via `/plugin` and publishing silently unbuilt. Each defect is named precisely in `problems[]`.

#### A5. The two thin skills

Both are THIN: `SKILL.md` prose orchestrates `mcp__ledger__*` calls and restates NO server-owned logic. The thinness invariant forbids the prose from containing any transition matrix, cap number, or schema/regex (must NOT match `ALLOWED_TRANSITIONS`, `additionalProperties`, `80 lines`, `active -> paused`, or `schema_version`). No emojis.

`session-handoff` (write side). `allowed-tools` = `append_session_event`, `record_decision`, `update_thread`, `transition_thread`, `rebuild_index`. Prose behavior: (1) append the session log; (2) record each not-yet-recorded decision (`options` is a STRING ARRAY); (3) MANDATORY spine refresh via `update_thread` BEFORE transitioning — the linchpin populating `spine.active_goal`/`next_step`/`open_risks` and toggling satisfied `completion_criteria[].done`; skipping it leaves the roster's `next_step` and the resume brief BLANK (the brief is spine-only). (4) transition (`paused` normal; `blocked` with `blocked_by`; `done` only with `closure_statement`) — the server enforces FSM+DoD; `active -> paused` CLEARS the active-thread pointer; (5) `rebuild_index`, then print the hand-off summary.

`resume-project` (read side). `allowed-tools` = `reconcile`, `rebuild_index`, `get_resume_brief`. Prose: rebuild the index, present the resumable roster (never auto-select by recency), honor an explicit `/resume-project <slug>` or wait for the user to choose, `reconcile` to fold drift/re-attach into the chosen thread, render `get_resume_brief` verbatim, then STOP. The brief is SPINE-ONLY: no session-read capability exists in `allowed-tools`; present-then-STOP is a hard invariant.

### Part B — End-to-End Acceptance

#### B1. E2E harness

Drives the REAL stdio MCP server over JSON-RPC through the public tool surface only (no internal imports of driver/FSM code), using the MCP SDK's own `Client` + `StdioClientTransport` (already a runtime dep). `startLedger({ projectDir, dataDir, backend, branch, extraEnv }) -> connected Client` forwards ONLY the driver vars + host-standard `CLAUDE_PLUGIN_ROOT`/`CLAUDE_PROJECT_DIR`/`CLAUDE_PLUGIN_DATA` (the trailer var is deliberately NOT set; `trailer_present` is controlled per-test via `bind_branch`). `callTool`/`expectToolError` assert results/refusals. Fixtures: `initGitRepo`, `initGitRepoWithRemote` (pushes `main`, `git remote set-head origin main`), `initNonGitDir`, `tempDir`/`cleanup`. Two coupling-flagged white-box readers (`readActiveThread`, `readResumableIndex`) express the two assertions the public surface cannot.

#### B2. Acceptance flows

| Flow | What it must prove |
|---|---|
| FSM + DoD | Server refuses an illegal transition (e.g. `paused -> blocked`) and a premature `done`; accepts a legal `done`; accepts the MULTI-SESSION path (open with an unchecked criterion -> check off later via `update_thread` match-by-text -> `done` succeeds). Asserted via `expectToolError`, not internals. |
| Handoff chain | `open_thread` writes the pointer; `append_session_event` writes under `sessions/`; `record_decision` writes a numbered decision (`options` a string array); `update_thread` refreshes the spine; `transition_thread` to `paused` CLEARS the pointer; `rebuild_index` yields `counts.resumable === 1`; the resumable entry's `next_step` is non-blank; `get_resume_brief` renders a non-blank brief carrying the refreshed `active_goal`/`next_step`. No hand-written files. |
| Resume substrate | A multi-thread roster counts both resumables; `get_resume_brief` returns a SPINE-ONLY brief reflecting the refreshed `next_step`. |
| Non-git parity | The same tool surface operates on a non-git project: threads carry `vcs_ref: null`, no binding/drift machinery runs, state persists under `${CLAUDE_PLUGIN_DATA}/<project-key>/ledger`; the brief still resolves. |
| Per-signal drift | `reconcile` returns the pinned `{ drift, dispositions }` envelope and CLASSIFIES each producible signal with a literal `classification` from `{CRITICAL, WARNING, COMPLETE}` — asserted per signal with grounded content, NOT `drift.length > 0`. One fixture per scenario (deleted-unmerged -> WARNING; merged -> COMPLETE; merged-then-deleted -> COMPLETE via best-effort `merged` from `binding.first_commit` even though `branch_exists === false` — the durability headline, contingent on `binding.first_commit` being non-null; a null `first_commit` on a deleted branch has no anchor and honestly degrades to `branch-gone(deleted)` WARNING -> orphaned, never a crash (§7); squash-merged -> the `squash-merged` SIGNAL classifies COMPLETE, but a genuine squash co-fires the `key-file-modified` WARNING so the ENTRY-max is WARNING — assert at SIGNAL level (`expectSignal`), NEVER entry=COMPLETE for the squash flow; force-push scenario -> CRITICAL via head-missing since `force_push_detected` is always literal `false`; divergence -> WARNING; key-file-modified -> WARNING; key-file-deleted -> CRITICAL). The reconcile trip-wire — do not weaken silently. |
| Branch re-attach | Performed BY THE PLUGIN via `reconcile` (not a `git log --grep` shortcut) across three rungs: trailer re-attaches; slug-name re-attaches via by-slug fallback; neither-match is LEFT ALONE (no binding, no disposition — proven by ABSENCE alongside an in-scenario slug control that DOES re-attach, so the absence is non-vacuous). Durability: the brief still resolves after the first branch is deleted. |
| Full-suite + packaging smoke | `checkPackaging` returns `{ ok: true }`; a unit test asserts the `.claude-plugin/marketplace.json` manifest (`name === "continuity-ledger"`, `owner.name` present, `plugins[0].name === "session-continuity"`, `plugins[0].source === "./"`); `npm test` runs green while DISCOVERING both `test/unit/**` and `test/e2e/**`. The acceptance gate for the terminal work. |

### Part C — Publishing (net-new requirement)

#### C1. Current Claude Code plugin publishing mechanism (verified against live docs)

A Claude Code plugin is distributed and installed through a plugin marketplace — a catalog manifest listing plugins and their sources; users add the marketplace, then install named plugins. Verified against current docs (both pages 301-redirect from former `docs.anthropic.com/en/docs/claude-code/*` to live `code.claude.com`):

- The marketplace manifest is `.claude-plugin/marketplace.json` at the marketplace repo root, with required fields `name` (kebab-case, public-facing, used in the install command), `owner` (object; `name` required), and `plugins` (array; each entry requires at minimum `name` and `source`). — [Create and distribute a plugin marketplace](https://code.claude.com/docs/en/plugin-marketplaces).
- A marketplace is hosted by pushing the repo to a git host. Users add it with `/plugin marketplace add <source>` and install with `/plugin install <plugin-name>@<marketplace-name>`; GitHub `owner/repo` shorthand is accepted, optionally pinned with `@ref`. — [same](https://code.claude.com/docs/en/plugin-marketplaces).
- Non-interactive CLI equivalents: `claude plugin marketplace add <source>`, `claude plugin install <name>@<marketplace>`, `claude plugin validate .` (validates `marketplace.json` + each entry's `plugin.json`). — [same](https://code.claude.com/docs/en/plugin-marketplaces).
- Private repos are supported: manual install and `/plugin marketplace update` use existing git credential helpers (HTTPS via `gh auth login`/`git-credential-store`, or SSH via `ssh-agent`); background auto-updates disable helpers by default and re-clone using stored credentials; `CLAUDE_CODE_PLUGIN_KEEP_MARKETPLACE_ON_FAILURE=1` + a configured helper make private behavior predictable. — [Private repositories](https://code.claude.com/docs/en/plugin-marketplaces#private-repositories).
- On install, Claude Code clones the plugin into the versioned cache at `~/.claude/plugins/cache`; components reference files via `${CLAUDE_PLUGIN_ROOT}` and persistent data via `${CLAUDE_PLUGIN_DATA}`. — [Create plugins](https://code.claude.com/docs/en/plugins).
- Version resolution: a `version` in `plugin.json` pins the plugin; users receive updates only when it changes; omitting it makes each git commit SHA a new version. — [Version resolution](https://code.claude.com/docs/en/plugin-marketplaces#version-resolution-and-release-channels).

#### C2. Publishing requirement for THIS plugin

The plugin MUST be publishable and installable from `SatanshuMishra/continuity-ledger-plugin` (base `main`) via the marketplace mechanism. Net-new artifact: a marketplace manifest at `.claude-plugin/marketplace.json` (repo root, co-located with `plugin.json` — a single repo that is simultaneously a one-plugin marketplace and the plugin). Contract:
- `name`: a kebab-case marketplace id NOT reserved by Anthropic; pinned to `continuity-ledger` (the right-hand side of the install command). — [Marketplace schema](https://code.claude.com/docs/en/plugin-marketplaces#marketplace-schema).
- `owner.name`: required; pinned to `SatanshuMishra`.
- `plugins`: a single entry whose `name` is `session-continuity` and whose `source` is the relative path `"./"` (plugin root = marketplace root = repo root). `strict` defaults to `true`, so `plugin.json` remains authoritative for userConfig/MCP/hooks/skills and the marketplace entry merely lists the plugin. — [Relative paths](https://code.claude.com/docs/en/plugin-marketplaces#relative-paths).

Distribution/version invariants: adding the marketplace clones the entire private repo, so the vendored `node_modules/` travels into `~/.claude/plugins/cache` and the server starts with zero install/network/build — where the vendored-deps invariant and the publishing mechanism meet. Because `plugin.json` sets an explicit `version`, that field MUST be bumped on each release (pushing to `main` without bumping it delivers no update). Install commands the published plugin must satisfy: `/plugin marketplace add SatanshuMishra/continuity-ledger-plugin` (append `@main` to pin) and `/plugin install session-continuity@continuity-ledger`.

#### C3. Publishing acceptance check

On a fresh machine with valid git credentials for the private repo and no prior install: (1) `claude plugin validate .` passes; (2) `/plugin marketplace add SatanshuMishra/continuity-ledger-plugin` registers the `continuity-ledger` marketplace; (3) `/plugin install session-continuity@continuity-ledger` installs with NO `npm install`/network/build; (4) after install/reload the three planes ACTIVATE — the `ledger` MCP server starts (`mcp__ledger__*` available) with `LEDGER_BACKEND`/`LEDGER_BRANCH` populated and trailer/nudge routed only to the hook plane; the `hooks/hooks.json` hooks register; the two skills are invocable (`/session-continuity:session-handoff`, `/session-continuity:resume-project`); (5) a smoke run of handoff -> resume through those surfaces succeeds end-to-end.

#### C4. Scope note

Plan 06 specifies installability (the `plugin.json` manifest, `.mcp.json` wiring, vendored runtime-dependency delivery, packaging guard) but does NOT specify the publishing act — no marketplace manifest, no `/plugin marketplace add`/`install` path, no fresh-machine publishing acceptance — so this entire Publishing requirement (Part C, including the `.claude-plugin/marketplace.json` artifact) is net-new to this spec.

## 15. Acceptance Criteria (Definition of Done)

The built plugin is DONE when ALL of the following are demonstrated end-to-end through the public surface (MCP tools + hooks + CLI), over throwaway git and non-git fixtures:

1. **Core + non-git parity.** A `LocalDriver` ledger supports the full Thread lifecycle; a `GitRefDriver` ledger (orphan-branch default) supports the same. Non-git and git flows are asserted at parity.
2. **FSM + DoD enforcement.** Illegal transitions are refused; `done` is refused unless `completion_criteria` is non-empty, all `done:true`, and `closure_statement` non-empty. A multi-session DoD flow (create with `done:false` criteria -> check off via `update_thread` -> transition `done`) passes.
3. **Handoff (write side).** `session-handoff` writes a session log, records a decision, refreshes the spine via `update_thread`, and transitions the worked thread `active->paused` (clearing the active-thread pointer).
4. **Resume (read side).** `resume-project` presents the resumable roster, composes a SPINE-ONLY brief via `get_resume_brief`, and STOPS.
5. **Stop-gate.** `Stop` blocks while the active-thread pointer is non-empty and passes once it is cleared by handoff.
6. **Deterministic root / multi-user.** Two clones that each init before either pushes share an identical orphan-root SHA; a first-divergence `sync()` merges without "unrelated histories".
7. **Drift detection.** Per-signal drift fixtures classify each of the 8 signals and produce the correct disposition (§12).
8. **Branch re-attach.** Trailer, first_commit, slug (keep-EARLIEST), and manual re-attach rungs each re-bind a Thread to a new/renamed branch (§12).
9. **Hook chaining.** The dispatcher preserves a pre-existing user hook (e.g. a Husky pre-commit) and fails open when the managed dir is absent.
10. **Restore.** `restore` round-trips a working store from the ledger ref (§13).
11. **Installability.** A marketplace clone yields a working stdio server with ZERO install, ZERO network, and ZERO build step (vendored deps); the packaging ensemble guard confirms all REQUIRED_FILES present (§14).
12. **Publishing.** The plugin is publishable from the private repo `SatanshuMishra/continuity-ledger-plugin` and installs via the plugin/marketplace mechanism, activating its MCP server + hooks + skills on a fresh machine (§14).

## 16. Non-Goals & Deferrals

- **Cold memory tier / `Project` entity / `PROJECT.md` tooling (A4):** deferred for v2. `PROJECT.md` stays a human/skill-edited prose file outside the MCP surface. Do NOT build `project`/`update_project` tools or `readProjectMd`/`writeProjectMd` driver methods. Revisit post-v2. The published plugin adds NO driver/MCP `PROJECT.md` method — the live `PROJECT.md` remains a working-tree prose file — preserving this A4 deferral.
- **`query_ledger`/`search_ledger`:** not built; absent from the frozen 12-tool surface.
- **`ledger_remote` config key:** dropped; the default remote is `'origin'`.
- **Reflog-based force-push detection:** deferred post-v2 (divergence is detected via `diverged_from_upstream`).
- **Per-platform compiled binary:** not built; require Node. Revisit only if the Node runtime dependency proves a barrier.
- **Any fourth runtime dependency:** requires a spec amendment.
- **`restore` as an MCP tool:** never; it is a human-run CLI verb only (containment).
- **v1→v2 ledger migration is OUT OF SCOPE for the published plugin.** It is performed by a THROWAWAY local script — NOT a repo, NOT a maintained or published artifact — run ONCE against each existing project to migrate it, then discarded when no longer needed. The script reuses the plugin's exported primitives (`EMPTY_TREE_SHA`/`LEDGER_ROOT_MESSAGE`/`LEDGER_INIT_IDENTITY`, `mintLedgerRoot`, `serializeRecord`, the frozen validators, `rebuildIndex`, the drivers via `selectDriver`) by deep-importing a local plugin checkout's ESM modules (no `exports` field, §14.A3) and resolving the three bare deps against its vendored `node_modules`. It produces a `_ledger` ref adoptable through the deterministic-root invariant (§7). The published repo contains NO `migrate` verb, NO `src/migrate/` tree, and NO migration test fixture — a reviewer/forker finds only `restore`.
```
