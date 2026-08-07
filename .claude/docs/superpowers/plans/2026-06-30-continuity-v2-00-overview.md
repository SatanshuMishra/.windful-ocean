# Session-Continuity Plugin v2 — Plan Overview & Shared Contract

> **For agentic workers:** This is the OVERVIEW + shared interface contract for a 6-plan set. Do NOT implement from this file. Implement plans 01–06 in order via superpowers:subagent-driven-development. Every plan's Global Constraints and cross-plan Interfaces are defined HERE and referenced by each plan.

> **AMENDED 2026-07-01 (EXPANDED Phase 1).** This contract folds in the cross-editor pins and the four approved design decisions from `docs/superpowers/plans/2026-07-01-continuity-v2-PHASE1-AMENDMENTS.md` (which supersedes the Phase-1 rows of `2026-06-30-continuity-v2-RECONCILIATION.md`). Phase-2 editors bind to the names/shapes/paths frozen HERE.

**Goal:** Build a portable, installable Claude Code plugin that replaces the prose-based Continuity Ledger with a Git-native, multi-user, drift-aware session-continuity system whose correctness is guaranteed by a bundled MCP server + hooks.

**Architecture:** A single stdio MCP server (Node) is the SOLE reader/writer of a ledger that stores POINTERS + PROSE (never code). Storage sits behind a driver interface with three implementations selected automatically: orphan-branch (git default), custom-ref (git opt-in), and local-dir (non-git). Work is modeled by ONE recursive `Thread` entity; hooks enforce lifecycle; thin skills call MCP tools. Full design: `docs/session-continuity-redesign/DESIGN-STATE.md`. Spec: `docs/superpowers/specs/2026-06-30-continuity-redesign-v2-design.md`.

**Tech Stack:** Node.js (ESM), `node --test` (built-in runner, no external framework), `@modelcontextprotocol/sdk` (MCP), `ulid` (stable identity), `ajv` (JSON-Schema record validation), git via `child_process.execFile` (no libgit2).

---

## Global Constraints (apply to EVERY task in EVERY plan)

- Runtime: Node.js >= 20, ES modules only (`import`/`export`, `.mjs` or `"type":"module"`). No TypeScript build step — plain JS, matching the existing `lib/superpowers-parallel/*.mjs` style.
- Tests: Node's built-in test runner only — `node --test`. No jest/vitest/mocha.
- Dependencies: exactly three runtime deps — `@modelcontextprotocol/sdk`, `ulid`, `ajv`. Pin EXACT versions in `package.json` (no `^`/`~`); resolve the current stable version at init and pin it. No auto-update. Adding any 4th dependency requires a plan amendment.
- No code comments anywhere (shebang / tooling-pragma / codegen-marker carve-outs only). No emojis. No AI attribution in commits.
- Immutability: never mutate a record in place; construct a new object and atomically write it. Small focused files (200–400 lines typical, 800 hard max). Comprehensive error handling; validate at every boundary; never silently swallow errors.
- All cross-references use a stable ULID (or a decision's stable NNNN). A slug or file path is NEVER a link target.
- Atomic writes: write to `<path>.tmp-<ulid>` then `rename()` over the target (POSIX atomic). Never partial-write a record.
- Storage is reached ONLY through the driver interface (below). No task hard-codes a git command or a filesystem path outside a driver.
- Commit cadence: one logical change per commit; Conventional Commits (`feat:`/`fix:`/`test:`/`refactor:`/`chore:`). Frequent small commits on the plugin repo's working branch.

## Repository layout (the plugin repo — created in Plan 01, Task 1)

```
<plugin-repo>/
  .claude-plugin/plugin.json        # metadata + userConfig (Plan 06)
  .mcp.json                         # stdio server declaration (Plan 03)
  package.json                      # pinned deps, "type":"module", test script
  package-lock.json                 # committed lockfile for deterministic npm ci
  bin/ledger-server.mjs             # MCP entrypoint (Plan 03)
  bin/ledger-cli.mjs                # hook-facing CLI: registry wrap + fs subcommands (Plan 03)
  src/
    schema/                         # JSON Schemas + validators (Plan 01)
    model/                          # record constructors + FSM (Plan 01)
    drivers/                        # StorageDriver + LocalDriver (Plan 01), GitRefDriver (Plan 02)
    index/                          # derived-index builder (Plan 01)
    tools/                          # one MCP tool per file (Plan 03)
    drift/                          # reconcile + signals + re-attach (Plan 05)
    util/                           # ulid, atomic-write, git exec, project-key (Plan 01)
  hooks/hooks.json                  # control plane (Plan 04)
  hooks/commit-msg                  # Thread-Id trailer inserter (Plan 04)
  skills/session-handoff/SKILL.md   # thin (Plan 06)
  skills/resume-project/SKILL.md    # thin (Plan 06)
  test/
    unit/                           # per-module unit tests
    fixtures/                       # throwaway git repos for driver/drift tests
```

## Canonical record schemas (Plan 01 defines; all plans consume verbatim)

`Thread` (`threads/<id>.json`):
```
{
  schema_version: 1,
  id: string,                 // ULID, 26 chars, generated once, immutable
  slug: string,               // display handle only; NEVER a link key
  title: string,
  status: "active"|"paused"|"blocked"|"done"|"abandoned",
  parent_id: string|null,     // self-reference (adjacency list); null = top-level
  predecessor_id: string|null,// lineage on supersession
  completion_criteria: [ { text: string, done: boolean } ],  // non-empty required before done
  vcs_ref: string|null,       // branch name; null for non-git
  external_refs: [ { system: string, id: string, url: string } ],
  blocked_by: string|null,
  abandoned_reason: string|null,
  closure_statement: string|null,
  spine: {
    status: string, active_goal: string, next_step: string,
    open_risks: string[], key_decisions: string[], out_of_scope: string[]
  },
  created_at: string,         // ISO 8601
  updated_at: string          // ISO 8601
}
```
`blocked_by`/`abandoned_reason`/`closure_statement` are nullable and set by `transition_thread` (their same-named args); they give the brief a lossless home rather than surviving only as session-note prose. `additionalProperties:false` still holds — these are declared fields.

`BranchBinding` (`bindings/<id>.json`; git projects only):
```
{
  id: string, thread_id: string, repo: string, branch: string,
  status: "active"|"merged"|"orphaned"|"abandoned",
  created_at: string, closed_at: string|null,
  closed_reason: "merged"|"deleted"|"abandoned"|"superseded"|null,
  first_commit: string|null, trailer_present: boolean
}
```
`record-sha` writes `first_commit` ONLY when it is currently null (set-once); it never overwrites it (overwriting corrupts the first-commit re-attach rung). No `head_sha`/`last_sha` field is added.

`BranchObservation` (return of `observeBranch`; consumed by Plan 05 `drift/signals.mjs`):
```
{
  branch_exists: boolean,
  head_sha: string|null,
  first_commit_present: boolean,
  merged: boolean,
  squash_merged: boolean,
  ahead: number,
  behind: number,
  force_push_detected: boolean,
  diverged_from_upstream: boolean,
  key_files_deleted: string[],
  key_files_modified: string[]
}
```
`diverged_from_upstream` (replaces the earlier `is_ancestor_of_base`): computed against `origin/<vcs_ref>` as `NOT(head is-ancestor-of origin/<branch>) AND NOT(origin/<branch> is-ancestor-of head)` via bidirectional `git merge-base --is-ancestor`. TRUE only on genuine divergence / force-push; a healthy ahead / behind / in-sync branch and a branch with no upstream are FALSE. `head_sha` is carried for other consumers even though `signals.mjs` does not read it.

`Decision` — MADR markdown at `decisions/NNNN-slug.md`, frontmatter carries `Status`, `Date`, `Thread-Id: <ulid>`. Immutable after `accepted` (status line only may change). `record_decision` MUST emit the `Thread-Id:` frontmatter (the driver takes raw markdown).

Derived `index/` files (rebuilt from records; never hand-edited):
- `by-slug.json`: `{ [slug]: threadId }` — on slug collision, keep-EARLIEST (first-created wins) so the §6.4 re-attach slug fallback is stable.
- `by-branch.json`: `{ [repo + " " + branch]: [bindingId, ...] }`
- `children.json`: `{ [parentId]: [childId, ...] }`
- `resumable.json`: `[ { id, slug, title, status, next_step } ]` (status in active|paused|blocked)

## StorageDriver interface (Plan 01 defines + LocalDriver; Plan 02 adds GitRefDriver)

`isGit()` is SYNCHRONOUS; every other method is async and throws on failure (no silent nulls except the documented `read*` misses).

```
class StorageDriver {
  isGit()                                  // -> boolean (synchronous)
  async init()                             // ensure ledger root + subdirs exist
  async root()                             // -> absolute path to ledger root

  async readThread(id)                     // -> Thread | null
  async writeThread(thread)                // validate + atomic write
  async listThreads()                      // -> Thread[]

  async readBinding(id)                    // -> BranchBinding | null
  async writeBinding(binding)              // validate + atomic write
  async listBindings()                     // -> BranchBinding[]

  async nextDecisionNumber()               // -> zero-padded "NNNN"
  async writeDecision(nnnn, slug, markdown)
  async readDecision(nnnn)                 // -> string | null
  async listDecisions()                    // -> [{ nnnn, slug }]

  async appendSessionEvent(threadId, isoTs, actor, markdown)  // append-only file

  async readIndexFile(name)                // -> object (name in by-slug|by-branch|children|resumable)
  async writeIndexFile(name, obj)          // atomic write

  async commit(message)                    // LocalDriver -> {committed:false}. GitRefDriver: worktree add+commit -> {committed, sha?}
  async sync()                             // LocalDriver -> {synced:false}. GitRefDriver: fetch/merge/CAS-push -> {synced, merged, pushed}

  async observeBranch(binding)             // git drivers only -> BranchObservation
  async observeNewBranch(repo, branch)     // git drivers only -> {thread_id_trailer, first_commit}
  async listRepoBranches(repo)             // git drivers only -> string[] (feature-repo branch names)
}
```

- Return shapes (Drift #8): `writeDecision -> path`, `appendSessionEvent -> path`, `commit()`/`sync()` as annotated above (LocalDriver minimal, GitRefDriver rich).
- `writeDecision(nnnn, slug, markdown)` VALIDATES `slug` against `^[a-z0-9][a-z0-9-]*$` before interpolating it into a path (the `nnnn` sibling is already validated; an unvalidated slug is an arbitrary-write path-traversal).
- `observeBranch`/`observeNewBranch`/`listRepoBranches` are GIT-DRIVER-ONLY. LocalDriver ships THROWING STUBS (`throw new Error("<method>: git drivers only")`) — a loud not-implemented, never a raw `TypeError`; Plan 01 adds one test per stub asserting the throw. All query the FEATURE repo (`binding.repo` / `repo`), never the ledger worktree. `listRepoBranches(repo)` returns the repo's branch names; Plan 05 `runReconcile` uses it to find new/renamed branches to re-attach (keeps all live-git behind the driver).
- The shared git-exec util (Plan 01 `util/`) accepts an optional `{env}` merged over `process.env`, so drivers can set `GIT_AUTHOR_DATE`/`GIT_COMMITTER_DATE` for the deterministic C1 root and init-scaffold commits.
- The shared record serializer `serializeRecord(obj): string` (Plan 01 `src/drivers/layout.mjs`, pure) is a cross-plan export: Plan 02's `GitRefDriver` reuses it verbatim, and Plan 04's PreCompact hook imports it to write the checkpoint sentinel.
- `sync()` trigger (pinned): the SessionStart hook runs `ledger-cli sync` (fetch/merge = pull) BEFORE reconcile; the handoff / Stop path runs `ledger-cli sync` (CAS-push) to publish local commits. Without a pinned trigger `sync()` is never called and the multi-user goal is inert.

Driver selection (Plan 01, `selectDriver(projectDir, userConfig)`): if `projectDir` is a git work tree -> `GitRefDriver(backend = userConfig.ledger_backend)`; else -> `LocalDriver(${CLAUDE_PLUGIN_DATA}/<project-key>/ledger)`. Plan 01 ships the selector returning LocalDriver for both until Plan 02 lands GitRefDriver behind the git branch. `bin/ledger-server.mjs` reads `LEDGER_*` env into `userConfig` with an explicit UPPER->lower mapping (`LEDGER_BACKEND->ledger_backend`, `LEDGER_BRANCH->ledger_branch`, `LEDGER_DISABLE_TRAILER->disable_trailer`) and passes it INTO `buildContext` (never hardcoded `{}`; `selectDriver` consumes the lowercase keys). Default remote is `'origin'` (`DEFAULT_REMOTE`); there is no `ledger_remote` config key.

## MCP tool surface (Plan 03 defines signatures; Plan 05 fills `reconcile`)

Names are `mcp__ledger__<tool>`. Args/returns are JSON validated by the tool's `inputSchema`.
- `open_thread({title, slug?, parent_id?, predecessor_id?, completion_criteria?, vcs_ref?, external_refs?})` -> `{thread}`
- `bind_branch({thread_id, repo, branch, first_commit?, trailer_present?})` -> `{binding}`
- `append_session_event({thread_id, actor, body})` -> `{path}`
- `record_decision({thread_id, slug, title, context, options, outcome})` -> `{number, path}`
- `transition_thread({thread_id, to_status, closure_statement?, blocked_by?, abandoned_reason?})` -> `{thread}` (FSM + DoD enforced)
- `update_thread({thread_id, spine?, completion_criteria?})` -> `{thread}` (tool #12) — patches `spine` fields AND toggles `completion_criteria[].done`. Matches criteria by `text` (immutable; may only flip `done`, never add/remove/edit texts; unknown texts rejected). Caps-enforced and terminal-refused on BOTH the spine and the criteria path; `spine.key_decisions` is EXEMPT from the array count cap (or: only the patched spine fields are validated) so a >20-decision epic can still refresh its spine. Supersedes the earlier `update_thread_spine`.
- `archive_thread({thread_id, reason})` -> `{thread}`
- `create_successor({predecessor_id, title, completion_criteria})` -> `{thread}`
- `reopen({thread_id})` -> `{thread}`
- `reconcile({})` -> `{drift:[...], dispositions:[...]}` (Plan 05) — MUTATES bindings (disposition/status) and scans for new/renamed branches to re-attach; "recommend-only" is true of THREAD TRANSITIONS only. The Plan 03 tool WRAPPER wraps the result with `commitAndReindex` (like the other 8 write-capable tools); the Plan 05 `runReconcile(ctx)` core stays COMMIT-FREE, so the commit is neither dropped nor doubled.
- `rebuild_index({})` -> `{counts}` — `counts` includes a `resumable` field.
- `get_resume_brief({thread_id})` -> `{brief}` — SPINE-ONLY (DD-F); the refreshed spine subsumes the latest session log, so no session-read method is added.

## Control plane: CLI + active-thread pointer + env

`bin/ledger-cli.mjs` is the hook-facing seam (hooks cannot speak MCP stdio). It wraps `listTools`/`callTool`/`buildContext` and exposes thin subcommands:
- `roster` -> `resumable[]`
- `reconcile` -> `{drift, dispositions}`
- `active-thread` -> `{thread_id}` (reads the pointer below)
- `record-sha <sha>` -> `{}` (sets `first_commit` set-once; the PostToolUse hook gates this to commit-ish operations, not every edit)
- `sync` -> `{synced, ...}` (drives `driver.sync()`)
- `migrate <store-path> [--plan-out <file>]` -> writes a dry-run plan artifact (full pipeline through verification, zero target mutation); `migrate <store-path> --apply --plan <file>` executes the locked plan; `--verify-only`/`--resume`/`--rollback` complete the verb set. HUMAN-RUN, CLI-ONLY (Plan 07).
- `restore <target>` -> rebuilds a working store from the ledger ref (V2-audit precedent). HUMAN-RUN, CLI-ONLY.

`migrate`/`restore` are NEVER `mcp__ledger__*` tools: the frozen 12-tool MCP surface above is not widened by migration or restore. Same containment as `no-direct-db-access.md` — the destructive one-shot verbs simply do not exist in the model's tool set, so a prompt-injected model can never trigger them.

Active-thread control pointer: a single-line ULID at `<git-common-dir>/ledger/active-thread` (non-git home: `${CLAUDE_PLUGIN_DATA}/<project-key>/active-thread`). BOTH the server writer AND the commit-msg / CLI reader resolve the path via `git rev-parse --git-common-dir` (NOT `--git-dir`), so linked worktrees / submodules share one pointer. The SERVER WRITES the pointer whenever a thread ENTERS active — `open_thread` (new->active), `create_successor` (new->active), `transition_thread`->active, `reopen`, `bind_branch` — and CLEARS it whenever the active thread LEAVES active — `transition_thread` active->{paused,blocked,done,abandoned}, `archive_thread`. Writing on every creation-into-active (including `create_successor`) closes the "freshly created active thread leaves the pointer empty" gap.

Trailer / nudge environment (consumed by hooks, NOT the server):
- `LEDGER_DISABLE_TRAILER="true"` is read by the Plan 04 INSTALLER, which writes git config `continuity.trailer=false`; the runtime `commit-msg` hook reads `continuity.trailer` and no-ops the trailer when false. (There is no `CONTINUITY_INSTALL_COMMIT_MSG`.)
- `LEDGER_NUDGE_FRACTION` / `LEDGER_NUDGE_BYTES` are read at runtime by the PostToolUse hook from its own `process.env`.
- Plan 06 forwards `LEDGER_BACKEND` / `LEDGER_BRANCH` into the SERVER env (`.mcp.json`); the trailer / nudge vars go to the HOOK env, never the server.

## FSM (Plan 01 defines `ALLOWED_TRANSITIONS`; Plan 03 enforces via `transition_thread`)

States: `active|paused|blocked|done|abandoned`; `done`/`abandoned` terminal. The allowed-transition matrix is copied verbatim from `rules/common/continuity-ledger.md` ("Allowed transitions"):
- (new)->active; active->paused; active->blocked (blocked_by required); active->done (DoD gate); active->abandoned (abandoned_reason required); paused->active; paused->done; paused->abandoned; blocked->active; blocked->paused.
DoD gate for `done`: `completion_criteria` non-empty AND every `done:true` AND a non-empty `closure_statement`. Server refuses any transition not in the matrix.

## Hook contracts (Plan 04)

Per CC hook JSON protocol (verified in DESIGN-STATE §5.4): SessionStart (inject-only) runs `ledger-cli sync` then `reconcile` + injects `resumable.json` roster; UserPromptSubmit (can block) injects roster on resume intent; PreToolUse (deny+rewrite) denies raw Write/Edit/Bash writes to ledger paths and auto-approves `mcp__ledger__*`; PostToolUse nudges at context % (env-tunable) and records the current SHA on commit-ish operations; Stop (exit 2) BLOCKS WHILE the active-thread pointer is non-empty (a handed-off thread has cleared it via active->paused; empty pointer = pass); PreCompact writes a checkpoint sentinel; `commit-msg` (resolving `--git-common-dir`) inserts an idempotent `Thread-Id:` trailer unless `continuity.trailer=false`.

Hook installer (Task 11): sets `core.hooksPath=<managedDir>` where the managed dir contains a DISPATCHER for every standard hook name that execs the same-named hook from the PRIOR hooks location (recorded `continuity.priorHooksPath`; default `<git-common-dir>/hooks`); only `commit-msg` additionally inserts the trailer. Fail-OPEN if the managed dir is missing. This chains rather than clobbers, so a Husky/pre-commit repo keeps its secret-scan/lint/test and pre-push.

## Plan index & dependency order

1. `01-core-and-local-driver` — no deps. Ships a working non-git ledger.
2. `02-git-ref-driver` — deps 01. Ships git storage (orphan-branch default + custom-ref opt-in); orphan root is DETERMINISTIC (fixed identity+dates over the empty tree -> identical root SHA on every machine).
3. `03-mcp-server` — deps 01 (02 optional at runtime). Ships the tool surface + FSM/DoD/caps + `bin/ledger-cli.mjs`.
4. `04-hooks-and-trailer` — deps 03. Ships the control plane + trailer auto-install (dispatcher + fail-open).
5. `05-drift-and-reattach` — deps 02, 03. Ships `reconcile` (incl. new/renamed-branch scan -> re-attach) + re-attach; commit-free core.
6. `06-skills-packaging-e2e` — deps 01–05. Ships the installable plugin + E2E.
7. `07-migration` — deps 01, 02, 03, 04, 06 (Amendments 4/5 edit Plan 04 `install-commit-msg.mjs` + Plan 06 `fixtures.mjs`, so under a PARALLEL vehicle 07 MUST serialize AFTER 04 and 06). Ships human-run `ledger-cli migrate`/`restore` (v1->v2 lossless ledger migration via a 20-node DAG + five-layer verification harness, orphan-ref restore); CLI-only, never an MCP tool.

## Open items deferred to execution (not plan-blocking)

- Exact plugin repo path/name — designated at execution kickoff (Plan 01 Task 1 parameterizes it).
- Execution vehicle — mitosis NON-VIABLE (`~/.claude` is non-git); path = writing-plans -> subagent-driven-development, with the report-system caveat (subagents may not write files in this harness -> fallback = main-thread authoring + delegated reviews). The plugin repo itself is a NEW git repo (Plan 01 Task 1).
- Cold memory tier / `Project` entity (`PROJECT.md`) — DEFERRED for v2 (A4); stays prose-managed, outside the MCP tool surface. Revisit post-v2 if tier-3 tooling is needed.
- Per-platform compiled binary — only if the Node runtime dependency proves a barrier; default is "require Node".
