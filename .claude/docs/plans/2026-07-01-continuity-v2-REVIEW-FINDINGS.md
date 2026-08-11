# Continuity v2 — Independent Plan Review Findings (pre-edit-wave)

Date: 2026-07-01. Produced by 8 parallel independent reviewers over Plans 00-06 + RECONCILIATION, each rubric-checked against the approved SPEC (`specs/2026-06-30-continuity-redesign-v2-design.md`) and DESIGN-STATE (13 sections). Reviewers were told the plans are in their PRE-edit-wave state, so the 8 known RECONCILIATION drift items are NOT re-reported as discoveries; this file is what the reconciliation MISSED or GOT WRONG, plus verification of what it prescribes.

Coverage: one deep reviewer per plan (01-06) + one requirements-traceability pass + one cross-plan-consistency/reconciliation-audit pass. Corroboration count in brackets = how many independent reviewers found the same issue (higher = higher confidence).

## Verdict

The set is structurally coherent and substantially spec-faithful: frozen record schemas match verbatim across plans, all 11 frozen MCP tools match Plan 00 byte-for-byte, the FSM/DoD/write-once/atomic planes are correctly delegated, the MCP SDK usage is verified correct against v1.29.0, the hook JSON protocol is verified correct against current CC docs, and NO plan builds a NON-GOAL (no deletion-policing, tamper-resistance, mitosis special-casing, or git re-implementation). BUT: (1) the review found defects BEYOND the reconciliation — 2 CRITICAL and 7 HIGH — and (2) the RECONCILIATION itself is incomplete or wrong on several load-bearing seams, so running the current two-phase edit wave verbatim would NOT produce a correct, consistent set. The edit wave's Phase 1 must be EXPANDED (Section 4) before the blind Phase-2 editors run.

---

## Section 1 — New defects beyond RECONCILIATION (severity-ranked, deduplicated)

### CRITICAL

- **C1. Concurrent first-init crashes with "refusing to merge unrelated histories."** [Plan 02, empirically verified] `#ensureLedgerRef` mints the orphan root via `git commit-tree <emptyTree>`, which is NON-deterministic (time-dependent SHA). Two machines that each initialize the ledger before either pushes produce unrelated roots; the first true-divergence `sync()` then dies (`git merge` without `--allow-unrelated-histories`), retries 5x, throws. This is the exact multi-user bootstrap the system exists for (S1 / §4.7 / Goals "conflict-free concurrent writes"). Task 6 test 1 hides it (clone-after-push shares history). FIX: mint a DETERMINISTIC root (fixed author/committer + `GIT_AUTHOR_DATE`/`GIT_COMMITTER_DATE` + fixed message over the empty tree so every machine yields an identical root SHA) OR add `--allow-unrelated-histories` to `#mergeRemoteIntoLocal`; add a two-clones-init-before-push fixture.

- **C2. `core.hooksPath` installer clobbers every non-`commit-msg` hook.** [Plan 04; corroborated conceptually by the "chain-not-clobber" requirement] Setting `core.hooksPath=<managedDir>` makes git resolve ALL hook types from the managed dir, which contains only `commit-msg` and whose runtime chain re-runs only the prior `commit-msg`. A Husky/pre-commit repo (routes all hooks through `core.hooksPath`) silently loses pre-commit secret-scan/lint/test and pre-push; a plain repo loses `.git/hooks/pre-commit`. Directly violates §5.3 / §11 / A5 ("chain/append rather than clobber"). Can silently disable SECURITY-relevant hooks in the user's repo — elevated to CRITICAL for that reason. RECONCILIATION applied the "chain-not-clobber" LABEL without verifying coverage; the defect stands. FIX: managed dir must contain a dispatcher for every standard hook name that execs the same-named hook from the prior hooksPath (or `$GIT_DIR/hooks` when prior was default), only `commit-msg` additionally inserting the trailer; OR install the trailer inside the existing hooksPath rather than redirecting `core.hooksPath`. Also fail-open if the managed dir is missing (compounding: a deleted plugin dir leaves `core.hooksPath` dangling -> git runs NO hooks).

### HIGH

- **H1. `reconcile` mutates bindings but never commits/reindexes -> git-backend data loss.** [Cross-plan, grep-confirmed] The `reconcile` tool wrapper is `return runReconcile(ctx)` with NO `commitAndReindex` — the ONLY one of 9 write-capable tools that omits it (the other 8 all call it). On `GitRefDriver`, `writeBinding` writes the worktree file but the ledger ref never advances: dispositions are uncommitted (invisible to other clones, lost on re-checkout) and `by-branch`/`resumable` indexes go stale after every reconcile. NOT covered by Drift #6 (which is only file-ownership + rename). FIX: Plan 03 wraps the `reconcile` handler result with `commitAndReindex`; Plan 05 `runReconcile` stays commit-free; state the split so the commit is neither dropped nor doubled.

- **H2. Stop-gate "handoff event" marker is undefined -> the core guarantee can be a permanent no-op.** [Cross-plan HIGH + Plan 03 + Plan 04 = 3 reviewers] Plan 00 L151: Stop blocks "until a handoff event exists for the active thread." But `applyTransition` appends a `ledger`-actor session event on EVERY transition, and no plan defines what distinguishes a handoff event from an ordinary session event. A naive `has-handoff` ("any session event for the thread") returns true after any transition -> Stop never blocks. Compounded: DD-F removed session-read so there is no data source at all; and Plan 04's "this session" wording is unimplementable through DD-B's lifetime-scoped `has-handoff <id>`. FIX: Phase 1 pins the handoff-event predicate (e.g. `actor:'handoff'` or a body/sentinel tag) and its store; Phase 2 binds the Plan 03 detector + Plan 06 writer + Plan 04 CLI to it. Sits at the intersection of 3 blind plans, so it MUST be pinned centrally in Phase 1.

- **H3. Re-attach ladder ships dead — no production invoker.** [Cross-plan HIGH + Plan 06 HIGH] Plan 05 builds `reattach(...)` + requires `observeNewBranch`, but explicitly defers wiring; Plan 03 `bind_branch` never calls it (and can't — backward dep), no CLI subcommand invokes it, and Plan 06's e2e deliberately avoids "an unpinned re-attach tool name." `reconcile` only iterates EXISTING bindings, so a renamed/new branch classifies branch-gone and nothing ever calls `observeNewBranch`/`reattach`. The Continued-lifecycle rebind (§6.4) and acceptance bullet 6d are unreachable through the public surface. FIX: Phase 1 folds new-branch scanning into `runReconcile(ctx)` so it rides the existing `reconcile` subcommand + SessionStart hook; Phase 2 Plan 02 implements `observeNewBranch`, Plan 05 calls it inside `runReconcile`.

- **H4. Trailer opt-out chain is broken end-to-end; Drift #5's fix is mis-scoped.** [Cross-plan HIGH + Plan 04] There is NO `LEDGER_DISABLE_TRAILER` reader in Plan 04; the installer keys off `CONTINUITY_INSTALL_COMMIT_MSG` (a name nowhere in the contract, opposite polarity) and never writes the `continuity.trailer` git config the commit-msg hook actually reads; Plan 06 forwards `LEDGER_DISABLE_TRAILER` into the MCP SERVER env (wrong process — the server installs no hooks); nudge knobs (`CONTINUITY_NUDGE_FRACTION/BYTES`) are not exposed. RECONCILIATION #5 mis-frames this as a polarity sign-flip. FIX: Phase 1 pins ONE opt-out env name AND which process reads it (the hook env, not server env) plus the nudge knobs; Plan 04 adds a reader + a `continuity.trailer=false` writer (to disable an ALREADY-installed trailer); Plan 06 forwards into the hook env.

- **H5. `is_ancestor_of_base` / not-ancestor drift signal may fire on every healthy branch.** [Plan 05; baked into Plan 00 amendment E] DESIGN-STATE §6.3 signal 2 is "head not-ancestor of REMOTE branch," but the amendment-E field is `is_ancestor_of_base` (integration base). Computed literally, a normal in-progress feature head is NEVER an ancestor of the base until merge -> `not-ancestor` WARNING fires on every live branch, and the clean-observation default `is_ancestor_of_base:true` implies "clean = already merged" (backwards). Constant false-positive contradicting the A1 "reconcile, not accuse" reframe. Frozen into amendment E unresolved. FIX: pin the reference to the branch's own remote upstream (`origin/<branch>`) per §6.3, or redefine the drift-meaningful direction (base-is-ancestor-of-head). See also M5 (observeBranch field semantics).

- **H6. E2E coverage is materially below the SPEC acceptance criteria.** [Plan 06 = 3 HIGH sub-findings] (a) 6c drift: the e2e drives ONLY 1 of 8 signals (deleted branch) and asserts only `drift.length>0` — no classification (CRITICAL/WARNING/COMPLETE) and no disposition content; squash-merge, force-push, merged, key-file modified/deleted, divergence untested. (b) 6d re-attach: only the trailer path, asserted via raw `git log --grep` (tests git, not the plugin), with NO assertion the plugin re-attached; slug + manual paths absent (ties to H3). (c) 6a spine-refresh linchpin (Drift #2): no e2e asserts spine `active_goal`/`next_step` non-empty or brief non-blank — the exact bug #2 exists to kill has zero regression guard; the Task 9 brief check passes even on an all-empty-string spine. FIX: per-signal drift fixtures asserting classification+disposition; a real re-attach assertion + slug/manual cases; a spine-non-blank assertion.

- **H7. Two Plan 02 tests fail as written (and reveal a real hygiene hazard).** [Plan 02, empirically verified] (a) Task 4 test 2 "empty commit is a no-op" fails: `init()` writes `.gitattributes` but never commits it, so `git add -A` stages it and the "empty" commit actually commits it -> `{committed:true}`; also leaves the worktree persistently dirty until first real commit (latent `sync()`/merge hazard). (b) Task 6 test 2 "clone strictly behind fast-forwards" is unreachable: `init()` adopts the remote tip, so `localSha===remoteSha` and `sync()` returns `{merged:false}`. Both contradict the "tested against real git" claim and halt the TDD flow. FIX: commit `.gitattributes` in `init()` (idempotently); drive the behind-state via a real re-sync (A pushes a new commit, B re-syncs with no local commits).

### MEDIUM

- **M1. `record_decision` cap-bypass -> decision-heavy epic becomes un-handoffable.** [Plan 03] `record_decision` appends to `spine.key_decisions` with NO cap, but `update_thread_spine` validates the ENTIRE merged spine against `arrayMaxItems:20`. Past 20 decisions, every future spine-refresh throws `key_decisions exceeds 20 items` — and since session-handoff refreshes the spine every session (Drift #2), the thread can never be handed off again. Survives the DD-A rename. FIX: exempt `key_decisions` from the count cap, OR validate only the PATCHED spine fields, OR trim/enforce the same cap in `record_decision`.

- **M2. DD-G active-thread pointer: wrong path in worktrees/submodules, undefined for non-git, writer/reader divergence, and unspecified write-timing.** [Plan 03 + Plan 04 + Cross-plan A8/A9 = 3 reviewers] Literal `.git/ledger/active-thread` is wrong where `.git` is a file (linked worktree/submodule) and undefined for LocalDriver (no `.git`). The commit-msg reader uses `git rev-parse --git-dir` (per-worktree) while DD-G writes the common dir -> trailer silently no-ops in linked worktrees (a first-class flow — GitRefDriver itself uses a ledger worktree). And WHEN it is written is under-specified: if `open_thread` (new->active) doesn't write it, a freshly opened unbound thread leaves the pointer empty -> Plan 04 Stop reads nothing -> gate silently skipped (a second Stop bypass). FIX: standardize BOTH server writer and hook reader on `git rev-parse --git-common-dir`; define a non-git home (e.g. `${CLAUDE_PLUGIN_DATA}/<key>/active-thread`); write the pointer on creation-into-active too.

- **M3. Server never reads `LEDGER_*` env; `userConfig` is hardcoded `{}`; and the env keys are case-mismatched.** [Plan 03 + Cross-plan A5] `buildContext` reads only `CLAUDE_PROJECT_DIR` and the entrypoint passes no args, so `userConfig` is permanently `{}` -> at runtime `selectDriver(projectDir, {})` gives `GitRefDriver` `backend`/`branch` = undefined (orphan-branch name unconfigurable; silent fallback toward LocalDriver). Additionally the forwarded env is UPPERCASE `LEDGER_BACKEND`/`LEDGER_BRANCH` but `selectDriver` consumes lowercase `ledger_backend`/`ledger_branch`. RECONCILIATION #7 flags the absence but not the `{}` severity or the mapping. FIX: thread env->userConfig WITH the mapping (`LEDGER_BACKEND->ledger_backend`, `LEDGER_BRANCH->ledger_branch`, `LEDGER_DISABLE_TRAILER->disable_trailer`) AND pass it into `buildContext`.

- **M4. `sync()` is never called anywhere -> the multi-user goal is inert.** [Cross-plan] No Plan-03 tool, no Plan-05 reconcile, no Plan-04 hook, no CLI subcommand invokes `sync()`; it runs only in Plan 02's own tests. `commit()` only advances the LOCAL ref; `sync()` is the fetch/merge/CAS-push, so the ledger never reaches a remote. RECONCILIATION's "richer sync returns unconsumed" (L/K/N/O) hides that `sync` is never CALLED at all. FIX: decide a sync trigger (SessionStart/Stop hook or a CLI subcommand) — a Plan 00 + Plan 04 amendment.

- **M5. `observeBranch`/`observeNewBranch` [E] ripple is under-reconciled.** [Plan 01 + Plan 05 + Plan 02 + Cross-plan A10] Amendment E adds the two methods to Plan 00's interface + Plan 02 impl, but: (a) Plan 01's abstract base + its "full contract method set" test are NOT updated -> `LocalDriver.observeBranch` throws a raw `TypeError` instead of a loud not-implemented; (b) the 11-field `BranchObservation` shape should be sourced from Plan 05's actual consumer (`signals.mjs` reads 10 of 11; `head_sha` is declared-but-unread) rather than enumerated as if Plan 02 is the source; (c) the methods must query `repoDir` (the feature repo), not the ledger worktree. FIX: either declare the pair GitRefDriver-only in Plan 00 (base legitimately omits) or add throwing stubs + two test names to Plan 01; pin the field shape from Plan 05's usage.

- **M6. `writeDecision` slug path-traversal.** [Plan 01] `writeDecision(nnnn, slug, markdown)` interpolates `slug` into a filesystem path with zero validation while the sibling `nnnn` IS validated; a slug with `/` or `..` escapes `decisions/` (arbitrary write). Internally inconsistent — `appendSessionEvent` sanitizes `actor`. FIX: validate/sanitize `slug` (e.g. `^[a-z0-9][a-z0-9-]*$`).

- **M7. `#6/D` reconcile rename is incomplete: timestamp source + test ripple + create-vs-fill.** [Plan 05 + Cross-plan] After renaming to `runReconcile(ctx, opts?)`: Plan 05 still uses `opts.now ?? new Date()`, ignoring Plan 03's injected `ctx.now` (a FUNCTION) -> reconcile stamps wall-clock under a fixed test clock, and a naive `opts.now = ctx.now` stamps a function into `closed_at`. The Task-4 tests call `reconcile(d)` with a BARE driver -> `ctx.driver` undefined -> the suite reds. And Task 4 says "Create `src/drift/reconcile.mjs`" — it must FILL Plan 03's already-tested stub (body-only), not clobber it. FIX: `const now = opts.now ?? (typeof ctx.now==='function'?ctx.now():new Date().toISOString())`; rewrite Task-4 tests to pass a ctx; reframe as fill-not-create.

- **M8. `record-sha` has no schema field to write into.** [Cross-plan] Plan 04 PostToolUse "captures HEAD SHA to the active binding via `record-sha`," but `BranchBinding` has `first_commit` only — no `head_sha`/`last_sha`. Writing HEAD into `first_commit` corrupts the first-commit reattach ladder (`observeBranch.first_commit_present`). FIX: Phase 1 pins the target (set `first_commit` only when null, or add an explicit binding field).

- **M9. Cold memory tier / `Project` entity is unmanaged (dropped requirement).** [Requirements-traceability GAP] `PROJECT.md` appears only as a path helper + a `.gitattributes` line; no MCP tool creates/reads/updates it, the driver exposes no `readProjectMd/writeProjectMd`, there is no ~80-line cap and no `Project` record/config home. One of the three named memory tiers (Hot/Warm/Cold — SPEC L101 / §8) has no management surface. Not in RECONCILIATION; outside the strict acceptance criteria (hence MEDIUM). FIX: a Plan 03 `project`/`update_project` tool + a Plan 01 driver method, or an explicit spec decision to defer the Cold tier.

- **M10. GitRefDriver worktree crash-recovery gap.** [Plan 02, verified] `git worktree add --force <dir>` does NOT reclaim an existing NON-EMPTY, unregistered worktree dir (fails `fatal: '<dir>' already exists` even after prune); §4.6(d) overstates `--force`. A crash that leaves the worktree dir populated but its `.git` link broken leaves `init()` unable to recover. FIX: `fs.rm(rootDir,{recursive,force})` on the not-registered branch before `worktree add`, or catch "already exists" and recreate; add a crash-recovery fixture.

- **M11. `record-sha` runs a git+Node commit path on every Write/Edit/Bash.** [Plan 04] PostToolUse spawns `isGitWorkTree` + `git rev-parse HEAD` + a full `ledger-cli record-sha` process (which can drive a GitRefDriver ledger commit) on EVERY matched tool use, most of which don't change HEAD — a per-edit commit-storm (Pillars 1+2). FIX: gate `record-sha` to commit-ish Bash commands (or debounce), not every edit.

### LOW (grouped; each cites its reviewer)

- `blocked_by` / `abandoned_reason` / `closure_statement` have NO home in the canonical Thread schema and `additionalProperties:false` hard-rejects them; they persist only as free prose in a session note, so the brief is lossier than §7.8. [Plan 01 + Plan 03] Cross-plan: pin where they live (session log vs `spine.open_risks`) or add nullable fields.
- `by-slug` index is last-wins on slug collision -> the re-attach slug fallback (§6.4 step 2) can resolve to the wrong thread; also Plan 03 derives slugs from titles, so slug-match frequently misses and degrades to manual. [Plan 01 + Plan 05] Document last-wins / keep-earliest.
- DD-F "spine-only brief" vs SPEC 6b / live skill "load latest session log" — unreconciled semantic tension. [Plan 06 + Plan 03] Either document that the refreshed spine subsumes the log (drop the wording) or add a bounded session-read tool.
- Re-attach ladder is a 4-rung superset (trailer -> first_commit SHA -> slug -> manual) vs the §6.4 3-rung spec; benign additive robustness, keyed by ULID; confirm intended. [Plan 05 + Requirements-traceability]
- A3 capability-detected enrichment CALLER not built (storage half is covered); spec fallback is "absent -> no-op," so behaviorally fine but the named capability doesn't exist. [Requirements-traceability]
- Epic auto-rollup not built; spec says "MAY," manual path supported. [Requirements-traceability]
- `open_thread`'s claimed "defensive" spine cap does not exist (no live bug; `newThread` seeds an empty spine). [Plan 03]
- No decision-supersession tool in the frozen 11-tool surface, so Plan 00 L85 / §7.5 "immutable after accepted, only status line changes to superseded-by" has no implementation path. [Plan 03] Future amendment if supersession must be tool-driven.
- Decision MADR `Thread-Id:` frontmatter is unenforced at the driver (`writeDecision` takes raw markdown); confirm Plan 03 `record_decision` emits it. [Cross-plan]
- `dep-delivery.test.mjs` probe runs with `cwd:'/'` -> resolves against `/node_modules` and fails even for a correctly vendored tree (or passes spuriously via a global install). [Plan 06] Set `cwd: ROOT`.
- `check-packaging.mjs` `REQUIRED_FILES` omits `bin/ledger-cli.mjs` (the hook-facing seam), so a build missing the CLI passes packaging yet breaks every hook. [Plan 06] Add it.
- `counts.resumable` sub-field is asserted by Plan 06 e2e but not pinned in Plan 00's `{counts}` shape. [Plan 06]
- `skills.test.mjs` frontmatter check still lists only the original 4 tools, so it won't fail if the Drift-#2 linchpin `update_thread` later vanishes from allowed-tools. [Plan 06] Add it as a cheap second guard.
- `npm test` may scope to `test/unit` and never discover `test/e2e/` in the acceptance gate. [Plan 06] Confirm discovery.
- `resume-intent.mjs` `\bcontinue\b`/`\bresume\b` fire on "continue building the form" etc. -> spurious roster injection (low harm). [Plan 04]
- Installer idempotency early-returns when `core.hooksPath===managedDir` and never re-copies the source hook -> a changed `commit-msg` after upgrade leaves a stale copy. [Plan 04] Always re-copy on install.
- `cliCommand` fallback returns bare `'node'` (PATH-dependent); `process.execPath` is more robust. [Plan 04]
- `#fetchRemoteTip` returns null on ANY fetch failure, conflating "remote ref absent" with a transient network error -> misleading "CAS push failed after 5 attempts." [Plan 02] Distinguish via `git ls-remote`.
- `index/*.json merge=union` yields non-parseable JSON if both sides change the same lines (harmless only because indexes rebuild on startup). [Plan 02] Prefer `-X theirs` or gitignore the derived index inside the worktree.
- `isGit()` is synchronous, contra Plan 00 L95 "Every method is async" (consumers call it un-awaited; harmless). [Cross-plan] Correct the contract wording.
- Plan 00 L121 gives `commit()` no return shape while `sync()` has one; Drift #8 should also document `commit()->{committed:false}`. [Plan 01]
- DD-A leaves the `completion_criteria` patch shape unspecified (check off by index or by `text`?) and only `spine` currently gets caps-enforce + terminal-refuse; the criteria path needs the same. [Plan 03 + Plan 06 + Cross-plan]

---

## Section 2 — Where RECONCILIATION is itself wrong or incomplete

Verified CORRECT: Drift #1 (options string->array), #2 (spine linchpin diagnosis — but see H6a: no e2e guard), #3 (drop `ledger_remote`; near no-op, scrub the 2 residual textual refs), #8 (return shapes; add `commit()->{committed:false}` to Plan 00), DD-B (correct but under-specified — see H2 `has-handoff` predicate + M8 `record-sha` target), DD-F (spine-only brief already satisfied in Plan 03), #6/D file-ownership + rename (but see M7 — the fix is INCOMPLETE on commit split, tests, and fill-vs-create).

INCOMPLETE: #4 / DD-G (worktree path + write-timing — M2), #7 (case mapping + `{}` severity — M3), [E] (Plan 01 ripple + field-source — M5), DD-A (criteria patch shape + caps/terminal on that path — Section 1 LOW).

WRONG / mis-diagnosed: **#5 (trailer opt-out)** — framed as a polarity sign-flip against a var/config Plan 04 doesn't use; the whole chain is name/process/coverage-broken (H4). Applying #5 verbatim leaves the opt-out dead.

"Verified-fine" list errors: **J** is imprecise — bindings ARE mutated by reconcile (`writeBinding` -> status/closed_reason); "recommend-only" is true of THREAD TRANSITIONS only, and J masks the H1 no-commit durability defect. **L** ("richer sync returns unconsumed") understates — `sync()` is never CALLED at all (M4). K/N/O, M, I confirmed fine.

---

## Section 3 — Spec alignment

- All six acceptance-criterion bullets, S1-S3, A1-A6, identity invariants, memory-tier behaviors (except the Cold tier — M9), and every GOAL/NON-GOAL trace to concrete plan tasks once the reconciliation + these findings land.
- NON-GOALS: CLEAN. No plan builds deletion-policing/alarm machinery, tamper-resistance, mitosis/Jira special-casing (`external_refs` stays opaque; the enrichment caller isn't even built), or a git re-implementation.
- Only genuine coverage GAPS: Cold tier / `Project` entity (M9, MEDIUM), A3 enrichment caller (LOW, spec-optional), epic auto-rollup (LOW, spec-optional "MAY").

---

## Section 4 — Expanded Phase 1 the edit wave MUST pin before Phase-2 fan-out

The two-phase shape (Phase 1 amends frozen Plan 00 -> 5 blind Phase-2 editors) is right, but Phase 1's "RETURN the canonical signatures" checklist is too narrow: several cross-editor contracts are needed by TWO blind editors and will re-open if not pinned centrally first. Add to Phase 1:

1. The **handoff-event marker** predicate + store (Plan 03 detector + Plan 06 writer + Plan 04 CLI) — H2.
2. The **trailer/nudge opt-out env name + which PROCESS reads it** (hook env) + nudge knobs (Plan 04 + Plan 06) — H4, replacing the mis-scoped Drift #5.
3. The **active-thread pointer resolution (`--git-common-dir`) + write-timing + non-git home** (Plan 03 writer + Plan 04 reader) — M2.
4. The **env UPPER->lower key mapping** (Plan 03) — M3.
5. The **11-field `BranchObservation` sourced from Plan 05's consumer**, and whether `observeBranch/observeNewBranch` are GitRefDriver-only (Plan 01 base + Plan 02 impl + Plan 05 consumer) — M5.
6. The **`reconcile` commit responsibility split** (Plan 03 wrapper commits; Plan 05 stays commit-free) — H1.
7. A **new-branch scan invoker folded into `runReconcile`** so the re-attach ladder is reachable (Plan 02 `observeNewBranch` + Plan 05 caller + the `reconcile` subcommand) — H3.
8. The **`is_ancestor_of_base` reference-point** (base vs `origin/<branch>`) — H5.
9. The **`record-sha` write target** (binding field) — M8.
10. A **decision on the Cold tier** (`Project`/`PROJECT.md` tool) — M9 — even if to defer explicitly.

Plus the two CRITICALs (C1 deterministic-root / `--allow-unrelated-histories`; C2 hooksPath multi-hook dispatcher) are DESIGN decisions, not mere bindings — resolve before Plan 02 Task 6 / Plan 04 Task 11 are built.

---

## Section 5 — Verified solid (do not re-litigate)

- Record schemas (Thread/BranchBinding/Decision/spine) match Plan 00 / SPEC / DESIGN-STATE field-for-field across all plans; FSM `ALLOWED_TRANSITIONS` + DoD predicate exact.
- All 11 frozen MCP tools match Plan 00 name/args/return byte-for-byte; the low-level `Server` + per-tool ajv architecture is the correct single boundary validator (no 4th dep), verified against MCP SDK v1.29.0.
- Hook JSON protocol (event names, matcher groups, output shapes, timeout units, env vars, Stop exit-2 resume gate, no reliance on SessionStart blocking) verified correct against current CC hook docs.
- Load-bearing git plumbing verified empirically: empty-tree `commit-tree` root, `--force-with-lease` CAS, `--no-verify`, clone-adopts-not-creates; `GitRefDriver extends LocalDriver` (instanceof holds); private ref namespaces disjoint.
- 3-runtime-dep cap, no-comments, immutability, atomic tmp+rename, ULID-only link keys, file-size discipline all upheld; no NON-GOAL built.

---

## Section 6 — Recommended path

1. Fold RECONCILIATION's 12 items AND Section 1 (esp. the 2 CRITICAL + 7 HIGH) AND Section 2 corrections into an EXPANDED Phase 1 (Section 4) — the frozen-contract amendment must resolve the cross-editor seams and the two CRITICAL design questions.
2. Then run Phase 2 (blind per-file editors) against the expanded Plan 00.
3. Then a consistency re-check, then the execution-vehicle choice (mitosis NON-VIABLE — ~/.claude non-git; path = writing-plans -> subagent-driven-development with the report-system harness caveat; the plugin repo itself is a new git repo).

The reconciliation wave is a HARD prerequisite for the E2E acceptance suite to pass, and as currently scoped it is insufficient. Expand it per Section 4 before executing.
