# Session-Continuity Redesign v2 — Final Spec

Status: approved for planning. The user approved the v2 architecture and confirmed the PRIMARY storage decision (orphan branch) on 2026-06-30 (`/resume-project continuity-redesign-v2` -> "Go" -> storage = orphan branch). Gate cleared. Next step after user review of this spec is the `writing-plans` skill. Nothing in this spec is applied to a live system: every artifact is authored, and the human installs/enables the plugin. Writes under `~/.claude` trip the protect-config hook ("ask"); the human approves.

## Context

The current continuity system (the "Continuity Ledger": `session-handoff` + `resume-project` skills + a file-based `.claude/ledger/`) has three structural defects, restated from the approved design:

1. Single-user only — committed for git projects but with ZERO merge/conflict/drift logic; a teammate's pull can clobber work and resume then trusts a stale ledger.
2. Robustness via prose — all format/FSM/cap/write-once rules live in SKILL PROSE parsed by awk hooks; renaming a field silently breaks a scan (~8 unenforced drift points).
3. Broken architecture — the "tree-branch" language never actually linked threads; open and closed threads shared one directory; no real Project <-> Thread <-> Decision relationship.

This spec defines the replacement: a portable, installable, marketplace-distributable Claude Code **plugin** whose correctness is GUARANTEED by a bundled MCP server + hooks (schema + FSM + caps enforced in tooling), not by prose. It generalizes to any config (no coupling to mitosis/MSP or any single workflow), models work with ONE recursive entity that scales from a single fix to a multi-part epic, and is multi-user and drift-aware for git projects while degrading gracefully for non-git projects.

Canonical sources this spec is derived from (authoritative for full rationale and research provenance):
- `docs/session-continuity-redesign/DESIGN-STATE.md` — the FINALIZED v2 architecture (13 sections; the reviewed design surface).
- `docs/session-continuity-redesign/architecture-report.html` — the v2 visual-explainer report (10 sections, 7 diagrams).
- Ledger decisions: `decisions/2026-06-30-session-continuity-architecture.md`, `-continuity-durability-reframe.md`, `-continuity-storage-orphan-confirmed.md`.
- Predecessor context: `threads/continuity-redesign.md` (the done, file-based system being replaced) and `rules/common/continuity-ledger.md` (the current prose rules this plugin supersedes in behavior).

## Decisions locked

Storage (confirmed by user, 2026-06-30):
- S1. PRIMARY STORAGE = a single tool-owned ORPHAN BRANCH, treated as owned infrastructure (GitButler `gitbutler/workspace` posture). Named distinctively so it sorts away from feature branches and reads as infrastructure (default configurable via userConfig, e.g. `_ledger` or `ledger/state`). The MCP server is its sole writer and reaches it via `git worktree add`. Because it is orphan, pruning/squashing/deleting any feature branch is a NON-EVENT for it.
- S2. `refs/ledger/*` custom-ref namespace is a DOCUMENTED OPT-IN alternative (cleaner branch list; host-dependent). The storage backend sits behind the MCP tools, so switching is a config choice, not a data-model change. The MCP server auto-installs the fetch refspec (guarded against clobbering an existing `remote.origin.fetch`) and owns push/pull.
- S3. Non-git projects fall back to a LOCAL driver at `${CLAUDE_PLUGIN_DATA}/<project-key>/ledger/` (single-user, machine-local, `vcs_ref = null`, no BranchBinding, no drift pipeline). Same data model, same MCP tools, same skills; only the storage driver differs, selected automatically by "is `CLAUDE_PROJECT_DIR` a git work tree?".

Architecture (approved with the v2 report):
- A1. Durability GOAL is REFRAMED: survive the NORMAL lifecycle of a branch (routine post-completion pruning) so RELATED future work can recover context. Policing mid-feature deletion / force-push / deliberate erasure is an explicit NON-GOAL (no alarm machinery; it must not drive storage or lifecycle decisions). Ref: `decisions/2026-06-30-continuity-durability-reframe.md`.
- A2. ONE recursive entity (Thread) replaces the fixed Tree/Thread/Leaf hierarchy. One shape at every depth; "has children" is a QUERY (never a stored flag); lazy promotion (start flat, promote only when a second related unit appears); adjacency list (`parent_id`), not materialized path.
- A3. DECOUPLE from any workflow tool. The core auto-detects work from UNIVERSAL signals only (DESIGN-STATE §3.3): (a) a session starting with no active Thread -> may prompt to create/resume; (b) a new git branch distinct from any tracked binding -> may auto-suggest a Thread + binding; (c) first commit on a branch -> enrich a binding, never gate creation on it; (d) an explicit user "start work on X" -> authoritative Thread creation. Tool-specifics (mitosis/MSP, Jira, Linear) NEVER gate core behavior — they attach ONLY via a generic optional `external_refs[]` bag the core stores opaquely and never reads. Optional enrichment is capability-detected (call-if-declared, else silent no-op) — mirrors the existing `/verify-<project>` convention.
- A4. The robustness guarantee comes from two enforcement planes: a bundled stdio MCP server (data plane; the SOLE ledger reader/writer; typed, schema- and FSM-validated tools) and hooks (control/lifecycle plane). The model NEVER hand-writes ledger files.
- A5. A `Thread-Id: <ulid>` commit trailer bridges a branch to its Thread durably (Gerrit Change-Id precedent), inserted by an auto-installed `commit-msg` hook via `core.hooksPath` (NOT hand-copied into `.git/hooks/`). The trailer is a convenience for re-attach, NOT a correctness gate — its absence degrades to slug/manual re-attach.
- A6. `session-handoff` (write) and `resume-project` (read) skills become THIN: they CALL MCP tools via allowed-tools and never hand-write ledger files. This closes the ~8 prose-drift points.

## Goals and non-goals

GOALS:
- Multi-user correctness for git projects: shared ledger across clones, auto-sync with zero manual steps, conflict-free concurrent writes (disjoint per-session/per-thread/per-binding files), drift reconciliation on resume.
- Guaranteed-valid ledger state: every mutation is schema- + FSM- + cap- + write-once-validated by the MCP server; malformed state is structurally impossible.
- One data model that fits both a single 2-session bug fix (one flat Thread, zero children) and a 6-part epic (root + 6 identically-shaped children).
- Portability: installable into ANY Claude Code config; git and non-git projects both work via automatic driver selection.
- Behavior-preserving for `~/.claude` itself (non-git): the local driver formalizes today's `~/.claude/projects/<slug>/ledger/` fallback.

NON-GOALS:
- Policing bad development practices (A1). Orphaned-mid-feature bindings degrade gracefully (Thread -> `paused`) but are never optimized for.
- Tamper-resistance / deletion-immunity (no backend defends against a direct `git push --delete` of its own ref; this was never achievable and is dropped from the storage calculus).
- Special-casing any workflow tool (A3). mitosis is indistinguishable from a Jira integration or nothing at all in the core's eyes.
- Re-implementing git (no bespoke VCS; the design leans on refs, refspecs, worktrees, trailers, and CAS push).

## Data model (A2)

Entities (full field lists and JSON examples in DESIGN-STATE §3.4, §7.2–7.6):

- **Project** — 0-or-1 per repo/config scope; durable; NOT recursive. Holds `PROJECT.md` (cold layer, cap ~80 lines) and project-wide config.
- **Thread** — recursive; the ONLY work-item schema. Fields: `id` (stable ULID, generated once, never changes), `slug` (display handle only, never a link key), `title`, `status` (`active|paused|blocked|done|abandoned`), `parent_id` (nullable self-reference; `null` = top-level), `predecessor_id` (nullable lineage for supersession), `completion_criteria[]` (non-empty BEFORE `done`; defined at creation, never retroactively), `vcs_ref` (nullable branch name; `null` for non-git), `external_refs[]` (the single optional `{system,id,url}` extension bag), `spine` (progressive-summary object), `schema_version`.
- **BranchBinding** — junction; MANY per Thread; append-only; git projects only. A Thread HAS branches over its life; it is not one branch. Fields: `id` (ULID), `thread_id` (stable FK), `repo`, `branch` (name only), `status` (`active|merged|orphaned|abandoned`), `created_at`, `closed_at`, `closed_reason` (`merged|deleted|abandoned|superseded`), `first_commit` SHA, `trailer_present`.
- **Decision** — MADR record; immutable after `accepted` (only the status line changes); lineage via `superseded-by`; cross-referenced by filename + Thread id.

Identity invariants:
- Dual-ID everywhere: stable ULID + human slug. EVERY cross-reference uses the ULID (or a decision's stable NNNN), NEVER a slug or path (the rename trap).
- Children carry `parent_id`; parents hold NO child list (avoids write-contention/drift). Reverse lookups come from the DERIVED index.

## Storage architecture (S1–S3)

- **On-store layout** (identical logical shape for git-ref store and non-git local store) — DESIGN-STATE §7.1:
  - `PROJECT.md`; `threads/<thread-ulid>.json`; `bindings/<binding-ulid>.json`; `decisions/NNNN-slug.md`; `sessions/<thread-ulid>/<ts>--<actor>.md`; `index/` (DERIVED, rebuilt on startup, never hand-edited: `by-slug.json`, `by-branch.json`, `children.json`, `resumable.json`).
- **git-ref driver** (default, orphan branch): `<ledger root>` is the worktree checkout of the ledger branch. The ledger branch is never checked out into the developer's working tree; the MCP server runs `git worktree add <dir> <ledger-branch>` into a side directory (placement pinned during planning — lean OUTSIDE the repo under `${CLAUDE_PLUGIN_DATA}`; if in-repo, exclude via `.git/info/exclude`). The feature branch carries NO ledger files.
- **custom-ref driver** (opt-in): storage under `refs/ledger/*`; MCP auto-installs the fetch refspec (clobber-guarded); requires host acceptance of custom-ref pushes.
- **non-git driver** (S3): `${CLAUDE_PLUGIN_DATA}/<project-key>/ledger/`, `<project-key>` derived from absolute `CLAUDE_PROJECT_DIR`. BranchBinding + drift pipeline INACTIVE; Threads carry `vcs_ref = null`.
- **Concurrency** — the MCP server serializes writes per machine. Cross-machine: fetch -> auto-merge -> push with CAS (compare-and-swap) retry on non-fast-forward. All shared files are disjoint (per-session/per-thread/per-binding) so concurrent pushes auto-merge with no content conflicts. `merge=union` on append-only text files is a belt-and-suspenders option.

## Enforcement planes (A4, A5, A6)

- **MCP server** (bundled stdio subprocess; the SOLE ledger reader/writer). Declared in `.mcp.json` at the plugin root (e.g. `command: "node", args: ["${CLAUDE_PLUGIN_ROOT}/bin/ledger-server.js"]`). One instance per session; first call prompts approval then auto-approves. Typed tool surface (the ledger's ENTIRE write surface): `open_thread`, `bind_branch`, `append_session_event`, `record_decision`, `transition_thread` (FSM-validated), `reconcile` (drift pipeline), `archive_thread`, `create_successor`/`reopen`, `rebuild_index`, `get_resume_brief`. Each enforces schema + the 5-state FSM + caps + write-once + atomic commit. Runtime dependency (Node/Python or a per-platform binary) is an accepted, documented cost — the schema guarantee is the whole point.
- **Hooks** (control/lifecycle plane; verified capabilities in DESIGN-STATE §5.4):
  - SessionStart (inject-only): inject resumable-Thread roster; run `reconcile`; inject drift report.
  - UserPromptSubmit (can block): detect resume intent; inject roster on demand.
  - PreToolUse (can deny + rewrite): DENY raw writes to ledger paths (force everything through MCP); auto-approve ledger MCP tools.
  - PostToolUse: context-percentage nudge; capture current SHA.
  - Stop (can block, exit 2): block session end until a handoff is written / dirty-state gate.
  - PreCompact: write a checkpoint sentinel before compaction.
  - WorktreeCreate (can block) / WorktreeRemove: OPTIONAL adapter hook points (must remain optional).
  - Constraint (Probe F): plugin-bundled AGENTS cannot declare their own hooks/mcpServers; enforcement is declared at plugin level. SessionStart CANNOT block, so the resume gate is enforced via context injection + the Stop hook.
- **commit-msg trailer hook** (A5): inserts `Thread-Id: <ulid>` if absent, no-op if present (amend/rebase/cherry-pick safe), opt-out via git config; AUTO-INSTALLED via `core.hooksPath` (Git 2.9+). If the user already sets `core.hooksPath` (Husky/pre-commit), the plugin CHAINS/appends rather than clobbers.
- **Thin skills** (A6): `session-handoff` and `resume-project` call MCP tools via allowed-tools; all format/FSM/cap logic lives in the server.

## Lifecycle and drift (reframed per A1)

- **Five-state FSM** (server-enforced): `active|paused|blocked|done|abandoned`; `done`/`abandoned` terminal; `active` = "being worked THIS session". `transition_thread` refuses illegal transitions. The concrete allowed-transition matrix that `transition_thread` must enforce is the one already specified in `rules/common/continuity-ledger.md` ("Thread lifecycle (5 states)" / "Allowed transitions") — the server implements that matrix verbatim. DoD gate: `done` requires non-empty, all-checked `completion_criteria` + a closure statement.
- **Epic rollup**: when ALL children of a parent Thread reach `done`, the parent MAY auto-roll to `done` (Linear precedent) or be closed manually (DESIGN-STATE §3.5/§6.2).
- **BranchBinding lifecycle** (DESIGN-STATE §6.2): Merged (binding -> `merged`, Thread -> `done` iff DoD); Pruned-after-merge (the target case — context survives on the ledger branch; later work finds it via `predecessor_id`/`external_refs`); Orphaned (binding -> `orphaned`, Thread -> `paused`, non-terminal); Continued (same Thread + new binding); Extended (new Thread, `predecessor_id` = old terminal Thread, old untouched).
- **Drift pipeline** `reconcile` (8 git signals, DESIGN-STATE §6.3): head SHA missing; head not-ancestor of remote; divergence count; force-push in reflog; key file deleted; key file modified; squash-merged (patch-id match); branch deleted/merged. Classified CRITICAL/WARNING/COMPLETE-candidate, dispositioned as re-verify / reopen / archive-as-superseded. Presented as reconciliation + recovery, NOT accusation.
- **Re-attach flow** (DESIGN-STATE §6.4): trailer lookup (primary) -> slug match (fallback) -> manual prompt (last resort); then paused/blocked -> new binding + active + Resumption Brief; done/abandoned -> offer successor Thread.

## Memory tiers (DESIGN-STATE §8)

Three tiers keep the resume budget viable whether a Thread spans 2 sessions or 20:
- **Hot** = per-session append-only log (`sessions/<thread>/*.md`) — full detail, INCLUDING rejected-option rationale.
- **Warm** = the Thread `spine` (~80 lines equivalent) — merged forward each session.
- **Cold** = `PROJECT.md` (~80 lines) — low-churn index.

Load-bearing behavior the server + hooks must honor: compact at ~70% context (NOT the hard limit; PostToolUse nudge + PreCompact sentinel); ALWAYS preserve reasoning traces (WHY an option was rejected), never just conclusions; decisions are NEVER compressed into the spine — `spine.key_decisions` holds decision filenames resolved on demand, and decision records live in append-only `decisions/*.md`.

## Plugin packaging (DESIGN-STATE §9)

Layout:
- `.claude-plugin/plugin.json` (metadata + userConfig declarations)
- `.mcp.json` (the bundled stdio ledger server)
- `bin/ledger-server.(js|py|bin)` (sole ledger reader/writer)
- `hooks/hooks.json` (SessionStart / UserPromptSubmit / PreToolUse / PostToolUse / Stop / PreCompact / etc.)
- `hooks/commit-msg` (Thread-Id trailer inserter; installed via `core.hooksPath`)
- `skills/session-handoff/…` and `skills/resume-project/…` (thin; call MCP tools)

Environment + config:
- `${CLAUDE_PLUGIN_ROOT}` = ephemeral install dir (never write state there); `${CLAUDE_PLUGIN_DATA}` = persistent (survives updates; caches + the non-git ledger store); `${CLAUDE_PROJECT_DIR}` = project root (git or not; always set).
- `userConfig` (per-user, per-installation; prompted at enable; `${user_config.KEY}`): `ledger_backend` (`orphan-branch` | `custom-ref`), `ledger_branch` name, opt-outs. NOT per-project.
- Marketplace-distributable; `--scope user|project|local`.

## Repository and build target (to confirm at planning)

The deliverable is a Git-native, marketplace-distributable plugin, so its source should live in a DEDICATED git repository (its own version control, real `.git`, proper package). This is DISTINCT from the report-system decision (which targeted the non-git `~/.claude` tree and therefore rejected git-native execution vehicles). The exact repo location, name, and whether the git-native execution vehicle (mitosis) is used for the build are OPEN and resolved during `writing-plans` / execution-vehicle selection. The plugin is then installed/enabled into `~/.claude` by the human.

## Open implementation questions (resolve during planning)

From DESIGN-STATE §11 (none block this spec; each is a planning-time decision):
- `core.hooksPath` clobber-guard: detect and chain an existing hooks path (Husky/pre-commit) rather than overwrite; verify `core.hooksPath` semantics before locking the install mechanism.
- Custom-ref host support: if the opt-in is offered, verify the target host accepts `refs/ledger/*` pushes.
- MCP runtime: require Node/Python or ship per-platform binaries (choose at planning; document the cost).
- Worktree placement: in-repo (`.git/info/exclude`) vs outside-repo (`${CLAUDE_PLUGIN_DATA}`) — lean outside-repo; pin at spec-to-plan.
- CAS-retry push: the fetch -> merge -> push, retry-on-non-ff path needs a careful, tested implementation.
- Language/runtime choice for `bin/ledger-server` (Node vs Python vs compiled) — affects packaging and the runtime-dependency story.

## Acceptance criteria (maps to thread completion criteria)

The thread's Definition-of-Done requires (`threads/continuity-redesign-v2.md`):
1. [MET] User explicitly confirms the architecture after reviewing the visual report.
2. [MET] Storage backend decision confirmed — orphan branch (this spec, S1).
3. [THIS SPEC] Spec written in `docs/superpowers/specs/` AFTER confirmation.
4. Implementation plan created via `writing-plans`.
5. Plugin built and installable: `plugin.json` + `.mcp.json` + `bin/ledger-server` + `hooks/` + thin `skills/`, enablable into a Claude Code config.
6. Verified end-to-end, asserting observable behavior through the public surface (MCP tools + skills + hooks):
   - Handoff: `session-handoff` writes a valid session log + refreshes the Thread spine + transitions state, all via MCP (no hand-written files).
   - Resume: `resume-project` presents the resumable roster, loads one Thread + latest session log, renders a Resumption Brief from `get_resume_brief`, then STOPS.
   - Drift detection: `reconcile` classifies each of the 8 git signals correctly (fixture repos: squash-merge, force-push, deleted branch, modified/deleted key file) and dispositions them.
   - Branch re-attach: a new branch re-attaches to its Thread via the `Thread-Id:` trailer (primary), slug (fallback), and manual prompt (last resort).
   - FSM + DoD enforced by the server: illegal transitions refused; `done` refused unless `completion_criteria` non-empty and all checked.
   - Non-git driver: on a non-git project the same tools/skills operate against the local store with `vcs_ref = null` and no BranchBinding/drift.

Verification is diff-scoped and behavior-through-public-surface per `rules/common/testing.md`; the MCP server's schema/FSM/cap logic is the primary unit-test surface, with fixture-repo integration tests for the drift pipeline and re-attach.

## Constraints

- No code comments anywhere (shebang/pragma/codegen-marker carve-outs only); no emojis; no AI attribution.
- Immutability, small focused files, comprehensive error handling, boundary input validation per `rules/common/coding-style.md`.
- Never edit vendored plugin files; precedence over plugin skills asserted from user rules.
- Pinned versions, no auto-update.
- The plugin is authored, never silently installed; the human enables it. Writes under `~/.claude` trip the protect-config hook ("ask").

## Out of scope

- Writing the implementation plan or any plugin code before this spec is reviewed (the next gate is `writing-plans`).
- Building any workflow-tool-specific integration (mitosis/Jira/Linear adapters) beyond the generic `external_refs[]` bag + capability-detected enrichment interface.
- Reversing the durability reframe or the orphan-branch default (both locked).
