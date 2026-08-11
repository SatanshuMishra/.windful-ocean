# Continuity v2 — Cross-Plan Reconciliation Worklist

Authoritative worklist produced by the cross-plan reconciliation of Plans 00-06 (Plans 02-06 parallel-authored, blind to each other). Rulings from decisions/2026-06-30-continuity-v2-reconciliation-contract-amendments.md are BAKED IN below. Execute as a two-phase edit wave (Phase 1 amends the frozen contract; Phase 2 binds the downstream plans to it).

Plan files (all on disk):
- 00-overview.md (frozen contract), 01-core-and-local-driver.md, 02-git-ref-driver.md, 03-mcp-server.md, 04-hooks-and-trailer.md, 05-drift-and-reattach.md, 06-skills-packaging-e2e.md (all under docs/superpowers/plans/2026-06-30-continuity-v2-*)

## Approved rulings (design decisions — now FIXED)
- DD-A: broaden `update_thread_spine` -> `update_thread({thread_id, spine?, completion_criteria?})`. One tool; caps-enforced; terminal-refused; patches spine AND sets completion_criteria[].done. Replaces update_thread_spine (still tool #12, renamed).
- DD-B: Plan 03 ALSO ships `bin/ledger-cli.mjs` wrapping the tool registry (listTools/callTool/buildContext) + thin fs subcommands: `roster`->resumable[], `reconcile`->{drift,dispositions}, `active-thread`->{thread_id}, `has-handoff <id>`->{hasHandoff}, `record-sha <sha>`->{}.
- DD-G: the MCP SERVER writes/clears `.git/ledger/active-thread` (single-line ULID) on bind_branch + active-transitions; CLI `active-thread` subcommand reads it. Control pointer lives in `.git/ledger/` (NOT the driver store or worktree).
- DD-F: resume brief is SPINE-ONLY (no driver session-read method added). Contingent on Drift #2 fix (handoff must refresh the spine).

## Silent drift to fix (verified against plan text)
1. Plan 06 Task 8 e2e passes `record_decision` `options` as a STRING; Plan 03 inputSchema pins array. FIX Plan 06 -> string array.
2. LINCHPIN: `update_thread(_spine)` is built but Plan 06 `session-handoff` never calls it -> spine.active_goal/next_step/risks stay empty -> resumable.json.next_step + get_resume_brief come out BLANK. FIX Plan 06: add the spine tool to session-handoff allowed-tools + a spine-refresh step.
3. `userConfig.ledger_remote` orphaned: Plan 02 introduces it; Plan 06 manifest/.mcp.json don't forward it. RESOLUTION: default remote:'origin' (Plan 02 DEFAULT_REMOTE) and DROP the ledger_remote key (simplest); if kept, wire into manifest+env. (Chosen: drop.)
4. active-thread pointer ownership -> resolved by DD-G (server writes .git/ledger/active-thread).
5. disable_trailer polarity: chain disable_trailer(true) -> LEDGER_DISABLE_TRAILER="true" -> installer sets continuity.trailer=FALSE (inverts). Plan 04 installer must invert.
6. Plan 05 `tools/reconcile.mjs` omits `description` and overwrites a Plan-03-owned file. FIX Plan 05: drop the overwrite; align to {name,description,inputSchema,handler(args,ctx)} calling runReconcile.
7. VERIFY (truncation-shadowed): `bin/ledger-server.mjs` must read LEDGER_BACKEND/BRANCH/DISABLE_TRAILER env into userConfig before buildContext. Confirm in Plan 03 un-read sections; fix if missing.
8. Plan 00 undocumented return shapes: writeDecision->path, appendSessionEvent->path, commit/sync shapes. Document in Plan 00.

## Verified-fine (no action)
- M: Plan 03 buildContext does selectDriver->init() (verify buildContext code when editing Plan 03). J: Plan 05 disposeBinding recommend-only, FSM faithful. K/L/N/O: GitRefDriver extends LocalDriver (instanceof holds); richer commit/sync returns unconsumed; merge-not-rebase fine; private ref namespaces non-colliding. I: Plan 06 Task 3 already rewrites .gitignore -> node_modules committed for distribution; Plan 01 needs no functional edit. No Global-Constraint violations found (3-dep cap, no-comments, immutability, atomic writes, ULID-only link keys all upheld).

## PER-FILE EDIT PLAN (one editor per file; Phase 1 THEN Phase 2)

### PHASE 1 — Plan 00 (frozen contract; do FIRST, everything binds to it)
- [DD-A] Replace update_thread_spine in the tool surface with `update_thread({thread_id, spine?, completion_criteria?}) -> {thread}` (tool #12). Note it patches spine AND checks off criteria; caps-enforced; terminal-refused.
- [DD-B] Add `bin/ledger-cli.mjs` to the repo layout + document its 5 subcommands (roster/reconcile/active-thread/has-handoff/record-sha) as the hook-facing seam.
- [DD-G] Document the `.git/ledger/active-thread` control pointer: path, written/cleared by the server on bind_branch + active-transitions, read by commit-msg + CLI.
- [E] Add to StorageDriver interface section: `observeBranch(binding) -> BranchObservation` (11 fields: branch_exists, head_sha, first_commit_present, merged, squash_merged, ahead, behind, force_push_detected, is_ancestor_of_base, key_files_deleted[], key_files_modified[]) and `observeNewBranch(repo,branch) -> {thread_id_trailer, first_commit}` (git drivers only).
- [Drift #8] Document return shapes: writeDecision->path, appendSessionEvent->path, commit()/sync() (LocalDriver minimal vs GitRefDriver rich).
- [Drift #5/H] Document the single opt-out path with polarity (disable_trailer -> LEDGER_DISABLE_TRAILER -> continuity.trailer=false).
- [Drift #3] Decide ledger_remote: default origin, drop the key.
RETURN the exact canonical signatures/names/paths written (Phase 2 editors bind to them).

### PHASE 2 — Plans 02-06 (parallel, against amended Plan 00)
Plan 02: [E] new task implementing observeBranch + observeNewBranch (fixture tests). [Drift #3] default remote:'origin', drop ledger_remote (or wire through per Plan 00). [M] note callers await init().
Plan 03: [DD-A] implement broadened update_thread (spine + completion_criteria[].done). [DD-B] new task: bin/ledger-cli.mjs (registry wrap + 3 fs subcommands). [DD-G] write/clear .git/ledger/active-thread in bind_branch + transition_thread. [D] keep src/drift/reconcile.mjs stub exporting runReconcile(ctx). [Drift #7] bin/ledger-server.mjs reads LEDGER_* env -> userConfig.
Plan 04: [Drift #5] installer inverts LEDGER_DISABLE_TRAILER -> continuity.trailer=false. [DD-B] consume bin/ledger-cli.mjs from Plan 03 (already assumed). [DD-G] confirm pointer path matches Plan 03.
Plan 05: [D/#6] rename reconcile(driver,opts) -> runReconcile(ctx,opts?) reading ctx.driver; drop the src/tools/reconcile.mjs overwrite (Plan 03 owns it) or align to the tool-module shape calling runReconcile.
Plan 06: [Drift #2] add update_thread to session-handoff allowed-tools + spine-refresh step. [Drift #1] fix e2e record_decision options -> string array. [DD-A] add multi-session DoD e2e (open done:false -> check off criterion -> transition done). [Drift #3] drop ledger_remote from manifest/.mcp.json.

## After the edit wave
- Optional final consistency re-check (light) that Phase 2 bound correctly to Plan 00.
- Then offer the execution-vehicle choice (task #7): mitosis is NON-VIABLE here (~/.claude is non-git -> no worktree/branch/PR/CI substrate; same finding as report-system-spec-approved.md). Realistic path = writing-plans -> subagent-driven-development, BUT note report-system-execution-adaptation.md: subagents may be unable to write files in this harness -> fallback = main thread authors, delegated read-only reviews. The plugin repo ITSELF is a NEW dedicated git repo (Plan 01 Task 1), so its own build CAN be git-native once created.
