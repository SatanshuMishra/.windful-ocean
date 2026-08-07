# Continuity v2 — EXPANDED Phase-1 Amendment Set for Plan 00 (for review, pre-edit)

Date: 2026-07-01. Status: DRAFT for user sign-off. Nothing in Plan 00 or Plans 01-06 is edited yet.

Purpose: fold RECONCILIATION's Phase-1 items + REVIEW-FINDINGS Section 1 (2 CRITICAL + 7 HIGH + MEDIUM/LOW) + Section 2 corrections + the Section 4 cross-editor pins into ONE amendment set for the frozen contract (Plan 00), so the 5 blind Phase-2 editors bind to a single source of truth and the seams do not re-open. Inputs: `2026-07-01-continuity-v2-REVIEW-FINDINGS.md`, `2026-06-30-continuity-v2-RECONCILIATION.md`, `2026-06-30-continuity-v2-00-overview.md`.

Reading order: **Section A first** — four design decisions that need your explicit sign-off (two are the CRITICALs; two alter an approved amendment / project scope). Section B is the concrete Plan 00 diff those decisions imply. Section C routes every remaining finding to exactly one Phase-2 editor so nothing drops. Section D is the do-not-touch list. Section E is sequencing.

---

## Section A — Design decisions needing your sign-off

### A1 (C1) — Orphan-root determinism: mint a DETERMINISTIC root [RECOMMENDED]

Problem: `#ensureLedgerRef` mints the orphan root via `git commit-tree <emptyTree>`, whose SHA is time-dependent. Two machines that each initialize before either pushes get UNRELATED roots; the first true-divergence `sync()` dies on `git merge` ("refusing to merge unrelated histories"), retries 5x, throws. This is the exact multi-user bootstrap the system exists for (S1 / §4.7). Empirically verified.

- **Option 1 (recommend): deterministic root.** Mint the root over the well-known empty tree (`4b825dc642cb6eb9a060e54bf8d69288fbee4904`) with FIXED author + committer identity, FIXED `GIT_AUTHOR_DATE`/`GIT_COMMITTER_DATE`, and a FIXED message. Every machine yields an IDENTICAL root SHA → all clones literally share history → first-divergence merges are ordinary fast-forward/3-way, conflict-minimal.
- Option 2: add `--allow-unrelated-histories` to `#mergeRemoteIntoLocal`. One-flag change, but it joins two unrelated DAGs → every record/index file becomes an add/add conflict on the first cross-root sync — maximizing conflicts exactly where the goal is conflict-free concurrent writes.

Rationale (Pillar 1): Option 1 removes the failure class instead of tolerating it, and avoids the add/add conflict storm Option 2 invites. I recommend Option 1 alone (no `--allow-unrelated-histories` fallback — a divergent root should surface as a loud error, not be silently merged with conflicts). Plan 02 Task 6 implements it; add a two-clones-init-before-push fixture (currently hidden by the clone-after-push test).

### A2 (C2) — Hook install: multi-hook DISPATCHER + fail-open [RECOMMENDED]

Problem: setting `core.hooksPath=<managedDir>` makes git resolve ALL hook types from the managed dir, which holds only `commit-msg`. A Husky/pre-commit repo silently loses pre-commit secret-scan/lint/test and pre-push; a plain repo loses `.git/hooks/pre-commit`. This can silently disable SECURITY hooks (→ CRITICAL). Violates §5.3 / §11 / A5 ("chain, don't clobber").

- **Option 1 (recommend): dispatcher for every standard hook name.** At install, capture the PRIOR hooks location (record `continuity.priorHooksPath`; default = `$GIT_DIR/hooks`). The managed dir contains a shim for every standard hook name that execs the same-named hook from the prior location; ONLY `commit-msg` additionally inserts the trailer. Fail-OPEN if the managed dir is missing (a deleted plugin dir must not leave `core.hooksPath` dangling → git running NO hooks).
- Option 2: install the trailer INSIDE the existing hooksPath instead of redirecting `core.hooksPath`. Less invasive but pollutes a user-owned/version-controlled dir (Husky's `.husky/_`), gets clobbered by `husky install`, and is fragile across the default-vs-custom hooksPath cases.

Rationale (Pillar 1): Option 1 is the only choice that guarantees we never silently disable a user's security hook, and it keeps the clean uninstallable managed-dir architecture. Plan 04 Task 11 implements the dispatcher + fail-open.

### A3 (pin 1 / H2) — Handoff-gate signal: use the active-thread pointer [RECOMMEND, alters DD-B]

Problem: Plan 00 L151 blocks Stop "until a handoff event exists for the active thread," but `applyTransition` appends a `ledger`-actor session event on EVERY transition and no plan defines what makes an event a "handoff." A naive predicate is always-true → Stop never blocks. DD-F removed session-read, so there is no data source; DD-B's lifetime-scoped `has-handoff <id>` cannot express "this session." Three reviewers flagged it.

- **Option 1 (recommend): the active-thread pointer IS the signal.** The pointer (pin A/B below) is written when a thread ENTERS active and CLEARED when it LEAVES active. Session-handoff transitions the worked thread active→paused (the ledger's own "hand-off auto-transitions active→paused"), which clears the pointer. So Stop blocks iff the pointer is non-empty. This is deterministic, inherently session-scoped, needs no new store, and DISSOLVES H2. Consequence: DD-B's `has-handoff` subcommand is SUPERSEDED by the existing `active-thread` subcommand (Stop reads `active-thread`; empty = pass). Plan 00 L151 is reworded accordingly.
- Option 2: define an explicit handoff event (`actor:"handoff"`) + a SessionStart sentinel to scope "this session," and keep/redefine `has-handoff`. More faithful to the "handoff event" wording but reintroduces the DD-F data-source gap and more moving parts across 3 blind plans.

Rationale (Pillars 1+2): Option 1 reuses an already-required pointer, is fully deterministic and session-scoped for free, and removes a subcommand. It DOES refine approved amendment DD-B — REVIEW-FINDINGS explicitly authorizes correcting DD-B's scope (H2 + M8), so this is in-bounds, but it is a real change to a locked amendment, hence sign-off.

### A4 (pin 10 / M9) — Cold memory tier / `Project` entity: DEFER explicitly [RECOMMENDED]

Problem: SPEC L101 / §8 names three memory tiers (Hot/Warm/Cold). `PROJECT.md` (the Cold tier) has no MCP tool, no driver method, no ~80-line cap, no `Project` record. Outside the strict acceptance criteria (hence MEDIUM), but a named tier with no management surface.

- **Option 1 (recommend): defer explicitly.** For v2, `PROJECT.md` stays a human/skill-edited prose file OUTSIDE the MCP tool surface (as the current ledger already treats it). Document the deferral in Plan 00 + the spec as a known, intentional v2 boundary. Keeps the verified 12-tool surface intact (after DD-A adds `update_thread`), no ripple.
- Option 2: build it — add `project`/`update_project` tools + `readProjectMd`/`writeProjectMd` driver methods + an 80-line cap + a `Project` config home. Fuller spec compliance; adds surface, scope, and time, and ripples the "all tools match byte-for-byte" verification.

Rationale (Pillars): the acceptance criteria don't require it and the Cold tier is the STABLE, rarely-churning core — exactly the content the MCP server's write-discipline adds least value to. Defer now; revisit post-v2 if tier-3 tooling proves needed.

---

## Section B — The Plan 00 amendment set (the frozen-contract diff)

Everything below EDITS Plan 00 once Section A is signed off. Grouped by contract area.

### B1 — MCP tool surface
- **[DD-A] ADD `update_thread({thread_id, spine?, completion_criteria?}) -> {thread}` as tool #12.** (Plan 00's list is currently 11 and omits the spine tool entirely; the Drift-#2 linchpin tool must be named in the frozen surface.) Semantics: patches `spine` fields AND toggles `completion_criteria[].done`. Caps-enforced; terminal-refused. Supersedes the Plan-03-only `update_thread_spine`.
  - **[M1] `key_decisions` is EXEMPT from the array count cap** (or: validate only the PATCHED spine fields). Otherwise a >20-decision epic can never refresh its spine → un-handoffable.
  - **[Section-1 LOW] `completion_criteria` patch shape:** match by `text` (immutable, per "criteria defined at creation, never retroactively"); the tool may only FLIP `done`, never add/remove/edit criteria texts; unknown texts rejected. Apply caps-enforce + terminal-refuse to this path too (today only `spine` gets them).
- **[pin 6 / H1] `reconcile` commit-responsibility note:** the Plan 03 TOOL WRAPPER wraps its result with `commitAndReindex` (like the other 8 write-capable tools); the Plan 05 `runReconcile(ctx)` core stays COMMIT-FREE. State the split so the commit is neither dropped nor doubled. Note in the surface: `reconcile` MUTATES bindings (disposition/status), so "recommend-only" is true of THREAD TRANSITIONS only (corrects Section-2 "J").
- **[LOW] `record_decision`** MUST emit the `Thread-Id:` MADR frontmatter (driver takes raw markdown; confirm the tool supplies it).

### B2 — Record schemas
- **[LOW → adopt] Thread schema: ADD three nullable fields** `blocked_by: string|null`, `abandoned_reason: string|null`, `closure_statement: string|null`. Today `additionalProperties:false` rejects them so they survive only as session-note prose → the brief is lossier than §7.8. Additive; does not disturb the verified field-for-field matches.
- **[pin 5 / M5 + pin 8 / H5] `BranchObservation` (11 fields), sourced from Plan 05's consumer (`signals.mjs`):** `branch_exists, head_sha, first_commit_present, merged, squash_merged, ahead, behind, force_push_detected, diverged_from_upstream, key_files_deleted[], key_files_modified[]`.
  - **REPLACE `is_ancestor_of_base` with `diverged_from_upstream`** (boolean). Definition: against `origin/<vcs_ref>`, `diverged = NOT(head ancestor-of origin/<branch>) AND NOT(origin/<branch> ancestor-of head)` via bidirectional `git merge-base --is-ancestor`. TRUE only on genuine divergence/force-push; healthy ahead/behind/in-sync = FALSE; no upstream = FALSE. Fixes the false-positive-on-every-live-branch defect and the backwards clean-default.
  - `head_sha` is retained though `signals.mjs` doesn't currently read it (available for pin 9 / other consumers).
- **[pin 9 / M8] `record-sha` write target = `first_commit`, written ONLY when currently null** (set-once). No new `BranchBinding` field. Writing HEAD into `first_commit` unconditionally would corrupt the reattach ladder; set-once captures the branch's first commit and no more (pairs with M11 gating in C).

### B3 — StorageDriver interface
- **[pin 5 / M5] `observeBranch(binding) -> BranchObservation` and `observeNewBranch(repo, branch) -> {thread_id_trailer, first_commit}` are GIT-DRIVER-ONLY.** Mark them "(git drivers only)" in the interface. LocalDriver ships THROWING STUBS (`throw new Error("observeBranch: git drivers only")`) — a loud not-implemented, never a raw `TypeError`; Plan 01 adds two test names asserting the throw. Both methods query the FEATURE repo (`binding.repo` / `repo`), never the ledger worktree.
- **[Drift #8 + Section-2] Return shapes:** document `writeDecision -> path`, `appendSessionEvent -> path`, `commit(message)` (LocalDriver `-> {committed:false}` no-op; GitRefDriver rich `{committed, sha?}`), `sync()` (LocalDriver `-> {synced:false}`; GitRefDriver `-> {synced, merged, pushed}`).
- **[LOW] Contract wording:** `isGit()` is SYNCHRONOUS; correct L95 from "Every method is async" to "isGit() is synchronous; every other method is async."
- **[M6] `writeDecision(nnnn, slug, markdown)` validates `slug` against `^[a-z0-9][a-z0-9-]*$`** before path interpolation (the sibling `nnnn` is already validated; unvalidated slug = arbitrary-write path traversal).
- **[M4] `sync()` trigger, pinned:** SessionStart hook calls `ledger-cli sync` (fetch/merge = pull) BEFORE reconcile; the handoff/Stop path calls `ledger-cli sync` (CAS-push) to publish local commits. Without a pinned trigger `sync()` is never called and the multi-user goal is inert.

### B4 — Control pointer (active-thread)
- **[pin 3 / M2, supersedes DD-G] active-thread pointer resolution + timing + non-git home:**
  - Path resolves via `git rev-parse --git-common-dir` for BOTH the server writer AND the commit-msg/CLI reader (NOT `--git-dir`), so linked worktrees/submodules share one pointer. Pointer file: `<git-common-dir>/ledger/active-thread` (single-line ULID).
  - Non-git home: `${CLAUDE_PLUGIN_DATA}/<project-key>/active-thread` (mirrors LocalDriver).
  - Write-timing: the SERVER WRITES the pointer whenever a thread ENTERS active — `open_thread` (new→active), `transition_thread`→active (paused/blocked→active), `reopen`, and `bind_branch`; and CLEARS it whenever the active thread LEAVES active — `transition_thread` active→{paused,blocked,done,abandoned}, `archive_thread`. Writing on creation-into-active closes the "freshly opened unbound thread leaves pointer empty → Stop silently skipped" gap and makes A3 (pointer-as-handoff-signal) correct.

### B5 — Env / config wiring
- **[pin 4 / M3] `bin/ledger-server.mjs` reads `LEDGER_*` env → `userConfig` with an explicit UPPER→lower mapping, passed INTO `buildContext`** (not hardcoded `{}`): `LEDGER_BACKEND→ledger_backend`, `LEDGER_BRANCH→ledger_branch`, `LEDGER_DISABLE_TRAILER→disable_trailer`. Fixes the silent LocalDriver fallback and the case-mismatch (`selectDriver` consumes lowercase).
- **[pin 2 / H4, supersedes Drift #5] trailer/nudge opt-out — ONE name + the consuming PROCESS:**
  - Canonical opt-out env: `LEDGER_DISABLE_TRAILER="true"`. Consumed by the Plan 04 INSTALLER (hook side), NOT the server: installer writes git config `continuity.trailer=false`; the runtime `commit-msg` hook reads `continuity.trailer` and no-ops the trailer when false. Flow: env → installer → git config → runtime hook. DROP the non-contract name `CONTINUITY_INSTALL_COMMIT_MSG`.
  - Nudge knobs: `LEDGER_NUDGE_FRACTION`, `LEDGER_NUDGE_BYTES`, read at runtime by the PostToolUse hook from its own `process.env`.
  - Consumer split (for Plan 06 forwarding): SERVER env (via `.mcp.json`) = `LEDGER_BACKEND`, `LEDGER_BRANCH`. HOOK-runtime/installer env (ambient) = `LEDGER_DISABLE_TRAILER`, `LEDGER_NUDGE_FRACTION`, `LEDGER_NUDGE_BYTES`. Plan 06 must forward the trailer/nudge vars to the HOOK env, never the server.

### B6 — Derived indexes
- **[LOW] `rebuild_index` `{counts}` shape** explicitly includes a `resumable` count (Plan 06 e2e asserts `counts.resumable`).
- **[LOW] `by-slug` tie-break = keep-EARLIEST** (first-created wins) on slug collision, so the §6.4 reattach slug fallback is stable. Document it.

### B7 — Dropped / scrubbed / superseded
- **[Drift #3] DROP `userConfig.ledger_remote`;** default remote = `'origin'` (Plan 02 `DEFAULT_REMOTE`). Scrub the 2 residual textual refs.
- **[A3] `has-handoff` subcommand SUPERSEDED** by `active-thread` (see B-CLI below).
- **[pin 2] Drift #5 (polarity sign-flip) SUPERSEDED** by B5 pin 2 (the real defect is name/process/coverage, not polarity).
- **[DD-F] resume brief stays SPINE-ONLY.** Document that the refreshed spine SUBSUMES the latest session log (drop the "load latest session log" wording tension); no session-read tool added.

### B-CLI — `bin/ledger-cli.mjs` (DD-B, corrected)
- Add `bin/ledger-cli.mjs` to the repo layout as the hook-facing seam (wraps `listTools`/`callTool`/`buildContext`). Subcommands: `roster` → `resumable[]`; `reconcile` → `{drift, dispositions}`; `active-thread` → `{thread_id}`; `record-sha <sha>` → `{}` (first_commit set-once, gated to commit-ish — see C); `sync` → `{synced,...}` (new, per B3/M4). `has-handoff` is DROPPED (A3).

---

## Section C — Phase-2 per-file routing (does NOT amend Plan 00; assigned so nothing drops)

Each blind editor gets exactly these, in addition to binding to the amended Plan 00.

**Plan 01 (core + LocalDriver):** M5(a) observeBranch/observeNewBranch throwing stubs + 2 test names (git-only); M6 slug validation in `writeDecision`; Thread schema +3 nullable fields (B2); `commit()->{committed:false}` + `isGit()` sync wording (B3); `by-slug` keep-earliest in the index builder (B6).

**Plan 02 (GitRefDriver):** **C1 deterministic orphan root** (Task 6) + two-clones-init fixture; **H7** commit `.gitattributes` in `init()` idempotently, fix Task 4 test 2 (empty-commit no-op) and Task 6 test 2 (drive behind-state via real re-sync); **M10** worktree crash-recovery (`fs.rm` before `worktree add`, crash fixture); implement `observeBranch`/`observeNewBranch` on `repoDir` with `diverged_from_upstream` (B2/pin 8); Drift #3 default remote `'origin'`, drop `ledger_remote`; LOW `#fetchRemoteTip` distinguish absent-vs-network (`git ls-remote`); LOW index `merge=union` → prefer `-X theirs`/gitignore derived index.

**Plan 03 (MCP server):** DD-A implement `update_thread` (spine + criteria-by-text, immutable texts) with M1 `key_decisions` cap exemption + criteria caps/terminal-refuse; DD-B `bin/ledger-cli.mjs` (registry wrap + subcommands roster/reconcile/active-thread/record-sha/sync, NO has-handoff); pin 3 write/clear active-thread via `--git-common-dir` on enter/leave-active incl. `open_thread`; pin 4 `bin/ledger-server.mjs` env→userConfig mapping→`buildContext`; pin 6 `reconcile` wrapper `commitAndReindex`; pin 9 `record-sha` first_commit-when-null; LOW `record_decision` emits `Thread-Id` frontmatter.

**Plan 04 (hooks + trailer):** **C2 multi-hook dispatcher + fail-open** (Task 11); pin 2 `LEDGER_DISABLE_TRAILER` reader → `continuity.trailer=false` writer + nudge knobs `LEDGER_NUDGE_FRACTION/BYTES` at runtime, drop `CONTINUITY_INSTALL_COMMIT_MSG`; pin 1 Stop gate reads `active-thread` (empty=pass), drop has-handoff; pin 3 `commit-msg` reader uses `--git-common-dir`; M4 SessionStart calls `ledger-cli sync` (pull) then reconcile, Stop/handoff pushes; **M11** gate `record-sha` to commit-ish Bash (not every edit); LOW installer always re-copies `commit-msg`, `cliCommand` uses `process.execPath`, tighten `resume-intent` regex.

**Plan 05 (drift + reattach):** pin 5/8 `signals.mjs` consumes `diverged_from_upstream`; **pin 7 / H3** `runReconcile` scans new/renamed branches → `observeNewBranch` + `reattach`, dispositions include reattach outcomes; pin 6 `runReconcile` stays commit-free; **M7** timestamp via `ctx.now` (function) not `opts.now`, FILL Plan 03's stub (not create/clobber), tests pass a `ctx`; Drift #6/D file-ownership + rename (retain); LOW document by-slug keep-earliest (per B6/Plan 00), confirm 4-rung reattach superset.

**Plan 06 (skills + packaging + e2e):** **Drift #2 LINCHPIN** session-handoff calls `update_thread` + spine-refresh step; pin 1 handoff transition (active→paused) clears the pointer (makes Stop pass); **H6** e2e per-signal drift fixtures (assert classification + disposition), real re-attach assertion + slug/manual cases, spine-non-blank assertion; Drift #1 e2e `record_decision` options → string array; DD-A multi-session DoD e2e (done:false → check off → transition done); Drift #3 drop `ledger_remote` from manifest/`.mcp.json`; pin 2 forward `LEDGER_BACKEND/BRANCH` into SERVER env, trailer/nudge into HOOK env; pin 10 Cold-tier deferral doc (if A4 = defer); LOW dep-delivery probe `cwd:ROOT`, `check-packaging` REQUIRED_FILES add `bin/ledger-cli.mjs`, `skills.test` frontmatter add `update_thread`, confirm `npm test` discovers `test/e2e/`, pin `counts.resumable`.

---

## Section D — Verified SOLID (do NOT re-litigate)
Record schemas match field-for-field; FSM `ALLOWED_TRANSITIONS` + DoD predicate exact; all frozen tools match name/args/return (only ADD `update_thread` #12); low-level `Server` + per-tool ajv is the correct single validator (no 4th dep, MCP SDK v1.29.0); hook JSON protocol correct vs current CC docs; git plumbing (empty-tree root, `--force-with-lease` CAS, `--no-verify`, clone-adopts); 3-dep cap, no-comments, immutability, atomic tmp+rename, ULID-only keys; NO NON-GOAL built.

## Section E — Sequencing
1. **You sign off Section A** (A1 root, A2 dispatcher, A3 handoff signal, A4 Cold-tier) — or redirect any.
2. I edit **Plan 00** per Section B (single editor), returning the exact canonical names/shapes/paths.
3. **Phase 2:** 5 blind editors (Plans 02-06; Plan 01 folded with 02's core) bind to amended Plan 00 per Section C.
4. Light **consistency re-check** that Phase 2 bound correctly.
5. **Execution-vehicle choice:** mitosis NON-VIABLE (~/.claude non-git); path = writing-plans → subagent-driven-development, with the report-system caveat (subagents may not write files here → fallback = main-thread authoring + delegated reviews). The plugin repo itself is a NEW git repo (Plan 01 Task 1).
