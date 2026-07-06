# Session-Continuity System Redesign — DESIGN STATE (v2, complete)

Date: 2026-06-30
Status: ARCHITECTURE COMPLETE — awaiting explicit user approval before any spec.
Purpose: Ground-up redesign of the session-handoff / resume-project / ledger ("Continuity Ledger") system into a portable, installable Claude Code PLUGIN. This file is the durable, authoritative capture of the full design + research so the work survives compaction or a fresh session. The visual report (architecture-report.html) is rendered from THIS file.

This v2 supersedes the v1 draft. It incorporates seven follow-up concerns raised by the user and three new research probes (F: MCP/plugin mechanics; G: durable git-metadata storage as distributed-tool practice; H: generic work-unit modeling). Where v2 changes a v1 decision, the change is called out explicitly.

---

## 1. Why this exists — the 3 original problems

1. **Single-user only.** The current ledger is committed for git projects but has ZERO merge/conflict/drift logic. A teammate's pull can clobber work; resume then trusts a stale ledger. ("Are we rebuilding Git?")
2. **Robustness via prose.** All format/rules (thread YAML, the state machine, caps, write-once, filename schemes) live in SKILL PROSE, parsed by awk hooks. Rename a field -> silent empty match -> broken scan. ~8 unenforced drift points. The redesign wants a GUARANTEE via schema/tooling.
3. **Architecture broken.** The old "tree-branch" language never actually linked threads; open and closed threads shared one directory; there was no real Project <-> thread <-> decision relationship. The redesign wants a real, scalable hierarchy.

Long-term goal: a componentized, published plugin installable into ANY Claude Code config — not something hard-wired to the author's personal setup.

---

## 2. Goals and non-goals (concern 1 — the durability reframe)

The core promise of this system is often mis-stated as "the ledger survives branch deletion." The precise, corrected goal:

- **GOAL — survive the NORMAL lifecycle of a branch.** A feature branch is routinely PRUNED after its work completes (post-merge cleanup, periodic housekeeping). The ledger's recorded context for that work must still be present afterward, so that if RELATED future work happens later — possibly in a new session, possibly by a teammate who no longer has the original branch — the earlier context (decisions, session history, pointers) is recoverable.
- **NON-GOAL — policing bad development practices.** Defending the ledger against someone deleting a branch MID-FEATURE, force-pushing over history, or deliberately erasing the record is explicitly OUT OF SCOPE. That is a bad-practice / adversarial scenario, not the design target. We do not build alarm machinery for it, and we do not let it drive storage or lifecycle decisions.

Why the reframe matters architecturally (validated by Probe G): once "survive deliberate deletion" is off the table, the durability bar drops to "outlive normal branch cleanup." No storage backend defends against a direct `git push --delete` of its own ref, so tamper-resistance was never achievable anyway. The decision therefore reduces to three practical axes — **zero-config propagation, host portability, and UI cleanliness** — not "how hard is it to destroy."

Consequence for the drift pipeline (Section 6): its FRAMING shifts from "detect and warn about dangerous git states" to "reconcile the ledger with reality and recover context gracefully after normal events (merge, squash, prune, rebase)." Same signals, calmer purpose.

---

## 3. The unified data model (concerns 5 and 6)

### 3.1 The flaw in v1

v1 declared a fixed three-level hierarchy Tree(project) -> Thread(line of work) -> Leaf(shippable unit), and said a Leaf "maps to an MSP when the mitosis skill is present." Two defects:

- **Over-coupling (concern 5).** "MSP"/"mitosis" is ONE workflow tool in the author's personal config. The plugin must never behave specially because a particular tool is installed. It must work identically for any config — a different sub-unit notion, or none.
- **Over-ceremony for small work (concern 6).** Tree -> Thread -> Leaf is right for a large multi-part effort (a "database migration" epic with 5-6 table migrations) but absurd for a single fix ("fix the sign-up bug" over two sessions).

### 3.2 The fix — one recursive entity (Probe H)

Collapse Tree / Thread / Leaf into ONE recursive entity. The current system already calls a line of work a **Thread**; we keep that word and make it recursive. There is no separate "Leaf" or "Tree" schema.

Convergent evidence (Probe H): Linear, GitHub sub-issues, git-bug, Fossil, and MADR all model a "unit of work" with ONE entity shape reused at every depth plus a nullable self-referential parent. Jira — the one system with a fixed type-per-level hierarchy — is the documented cautionary tale (teams "outgrow" the fixed levels and must migrate). Sources in Section 12.

Rules that make it collapse gracefully:

- **One shape at every depth.** A Thread is a Thread whether it stands alone or contains children.
- **"Has children" is a QUERY, never a stored flag.** A Thread is an "epic" iff some other Thread has `parent_id` pointing at it. This is what removes the two-data-model problem entirely.
- **Lazy promotion.** Start flat. A standalone fix is ONE Thread with `parent_id = null` and no children. Promote to a parent only when a second related unit actually appears — never pre-declare hierarchy. (Linear/GitHub precedent.)
- **Adjacency list** (`parent_id` pointer), not materialized path or nested set — correct for our shallow, dozens-of-nodes, append-heavy scale (Probe H tradeoff table).

### 3.3 Decoupling from any workflow tool (concern 5)

The core auto-detects and models work from UNIVERSAL signals only. Anything workflow-specific enriches the model through ONE generic, optional extension point the core never inspects.

| Signal | Universality | Role |
|---|---|---|
| A session starting with no active Thread | Universal (plugin-runtime fact) | Core may prompt to create/resume a Thread |
| A new git branch distinct from any tracked binding | Near-universal (any git project) | Core may auto-suggest a Thread + binding |
| First commit on a branch | Near-universal | Enrich a binding (never gate creation on it) |
| An explicit user "start work on X" | Universal (available), active | Authoritative Thread creation |
| An MSP / mitosis cluster, a Jira epic, a Linear issue | TOOL-SPECIFIC | Never gates core behavior — see below |

Tool-specific concepts attach only via a generic `external_refs` bag on the Thread: a list of `{ system, id, url }`. The core stores it opaquely and never reads it. mitosis becomes ONE possible implementer of a capability-detected interface — indistinguishable in the core's eyes from a Jira integration, a Linear integration, or nothing at all. This mirrors the capability-negotiation pattern of LSP and the dependency-inversion principle (Probe H), and it mirrors the config's own existing `/verify-<project>` convention ("call it if it exists, else fall back").

Optional enrichment interface (capability-detected, no core dependency): if the project declares a well-known "unit provider" (a command or config the plugin looks for), the plugin may call it to (a) suggest a label/status, (b) suggest a `parent_id` linking two units, (c) populate `external_refs`. Absent -> silent no-op. The core never depends on any provider existing.

### 3.4 Entities

- **Project** (0-or-1 per repo/config scope; durable; NOT recursive). Holds the cold-layer `PROJECT.md` and project-wide config. The LangGraph "store" analogue.
- **Thread** (recursive; the ONLY work-item schema). Fields:
  - `id` — stable ULID, generated once, NEVER changes (rename-safe identity).
  - `slug` — human display handle only; never used as a cross-reference key.
  - `title`, `status` (`active|paused|blocked|done|abandoned`).
  - `parent_id` — nullable self-reference (adjacency list). `null` = top-level.
  - `predecessor_id` — nullable; lineage when a terminal Thread is superseded by a new one (ADR superseded-by pattern; the old Thread is never mutated).
  - `completion_criteria[]` — non-empty BEFORE a Thread may reach `done` (the DoD gate; defined at creation, never retroactively).
  - `vcs_ref` — nullable git branch name (null for non-git projects; see Section 10).
  - `external_refs[]` — the single optional `{system,id,url}` extension bag (Section 3.3).
  - `spine` — the progressive-summary object (Section 7.6).
  - `schema_version`.
- **BranchBinding** (junction; MANY per Thread; append-only; git projects only). A Thread HAS branches over its life; it is not one branch. Fields: `id` (ULID), `thread_id` (stable FK), `repo`, `branch` (name only), `status` (`active|merged|orphaned|abandoned`), `created_at`, `closed_at`, `closed_reason` (`merged|deleted|abandoned|superseded`), `first_commit` SHA, `trailer_present`.
- **Decision** — MADR record; immutable after `accepted` (only the status line changes); lineage via `superseded-by`. Cross-referenced by filename + Thread id.

Dual-ID everywhere: stable ULID + human slug; every cross-reference uses the ULID, NEVER the slug or path (rename trap). Children carry `parent_id`; parents hold NO child list (write-contention/drift); reverse lookups come from a DERIVED index (Section 7).

### 3.5 Worked examples (same model, both sizes)

- **Small — a single bug fix over 2 sessions.** Session 1 creates ONE Thread: `{ id: u1, title: "fix sign-up bug", status: active, parent_id: null, vcs_ref: "fix/signup-bug", completion_criteria: [...] }`. Session 2 resumes the SAME Thread (`paused -> active`), appends a session log, then `-> done` when criteria pass. Zero children ever created. One identity, open to close. This is the lightweight case with no ceremony.
- **Large — a 6-part database-migration epic.** First create a root Thread: `{ id: uEpic, title: "database migration", parent_id: null }`. As each table migration is identified (typed by the user, or suggested by an OPTIONAL provider that wrote 6 entries into `uEpic.external_refs`), create 6 child Threads `{ id: u1..u6, parent_id: uEpic }` — each byte-for-byte the same shape as the standalone bug-fix Thread. `uEpic` is untouched; it simply now "has children," discovered by querying `parent_id = uEpic`. When all 6 reach `done`, `uEpic` may auto-roll to `done` (Linear precedent) or be closed manually.

---

## 4. Storage architecture (concern 3)

### 4.1 What must be stored, and where it can live

The ledger stores POINTERS and PROSE, never code: Thread/BranchBinding JSON, MADR decisions, append-only session logs, a derived index, and PROJECT.md. For a multi-user git project this state must (a) be shared across clones, (b) outlive any single feature branch's normal pruning, (c) not require each teammate to run a manual sync step, and (d) work on whatever git host the team uses.

### 4.2 The core tension (Probe G)

- Only a real branch under `refs/heads/*` is transferred by git's DEFAULT fetch refspec (`+refs/heads/*:refs/remotes/origin/*`) — i.e. auto-syncs with zero configuration.
- Only a CUSTOM ref namespace (e.g. `refs/ledger/*`, the git-bug / git-spice / GitHub-`refs/pull/*` idiom) stays OUT of the branch list / GitHub UI.
- These two properties are mutually exclusive for the same ref. No ref type gives both for free.

Survey finding (Probe G): of six git-native tools, ZERO use a plain orphan branch for metadata; the idiom is a custom ref namespace or purely-local storage. So an orphan branch is, by community convention, the LESS idiomatic choice. Probe A independently flagged that a plugin creating a branch in a user's repo is "unusual — must be visible, opt-in, documented, and cleaned up," not a silent side effect.

### 4.3 Two facts that keep the orphan branch viable

1. **Host portability (Pillar 1: robustness).** A branch is guaranteed pushable/fetchable on EVERY git host. A custom ref namespace depends on the host accepting non-standard ref pushes — widely supported (GitHub, GitLab) but NOT universally guaranteed, and a known friction source for tools like git-bug. This is the strongest argument for the branch.
2. **The MCP server neutralizes the custom-ref sync burden.** Probe G rejected the custom ref only because "someone must remember to run the sync step." In THIS architecture the sync step is run by the plugin's MCP server automatically on every session (SessionStart reconcile + Stop handoff both fetch/push the ledger ref). No human remembers anything. The one disadvantage of the custom ref therefore does not apply to us.

### 4.4 Recommendation (a decision to ratify)

Given Pillar 1 (robustness/universality first), the reframed goal (Section 2), and the MCP-managed sync:

> **Default: a single, tool-owned ORPHAN BRANCH, treated as owned infrastructure — the exact posture GitButler takes with its `gitbutler/workspace` branch ("an internal branch the tool owns; don't touch it").** Named distinctively so it sorts away from feature branches and reads as infrastructure (e.g. `_ledger` or `ledger/state`; configurable via userConfig). The MCP server is its sole writer and accesses it via `git worktree add` (Section 4.6). Because it is orphan, pruning/squashing/deleting any feature branch is a NON-EVENT for it.
>
> **Documented opt-in alternative: a custom ref namespace `refs/ledger/*`** for teams that prefer a clean branch list AND are on a host known to accept custom refs. The MCP server auto-installs the fetch refspec (guarded against clobbering an existing `remote.origin.fetch`) and owns push/pull, so it stays zero-touch for the user. The storage backend sits behind the MCP tools, so switching is a config choice, not a data-model change.

This does not reverse v1's orphan-branch decision; it hardens the justification (host portability + reframe), corrects the rationale (drops the now-moot "GC-proof/deletion-immune" claims), names it as infrastructure per Probe A/G etiquette, and adds the custom-ref opt-in. The one honest cost of the default remains cosmetic: the infra branch appears in `git branch -a` and the host's branch dropdown. Trade taken deliberately (robustness + zero-config over branch-list tidiness). **This is the single biggest open decision for the user to confirm.**

### 4.5 Non-git projects (concern 7)

Git-ref storage is impossible without git. For a non-git project (e.g. `~/.claude` itself), the ledger falls back to a LOCAL, per-project store:

- Location: `${CLAUDE_PLUGIN_DATA}/<project-key>/ledger/`, where `CLAUDE_PLUGIN_DATA` (`~/.claude/plugin-data/<plugin>/`) persists across plugin updates (Probe A), and `<project-key>` is derived from the absolute `CLAUDE_PROJECT_DIR` path (git or not, `CLAUDE_PROJECT_DIR` is always set).
- Consequences: single-user and machine-local (no sharing — acceptable, since a non-git project has no shared remote anyway). BranchBinding and the git drift pipeline are simply INACTIVE; Threads carry `vcs_ref = null` and the model degrades gracefully (the recursive Thread model does not require git — Probe H made `vcs_ref` nullable for exactly this).
- The SAME data model, the SAME MCP tools, the SAME skills. Only the storage driver behind the MCP server differs (git-ref driver vs. local-dir driver), selected by "is `CLAUDE_PROJECT_DIR` a git work tree?" This is dependency inversion: skills and hooks never know which driver is active.

This also cleanly explains how the CURRENT system already handles `~/.claude`: it uses the `~/.claude/projects/<slug>/ledger/` fallback. v2 preserves that behavior and formalizes it as the non-git storage driver.

### 4.6 How the ledger is accessed alongside a feature branch (the worktree mechanism)

The ledger branch is a SEPARATE branch; it is never checked out into the developer's working tree. A git repo can host multiple working trees that share ONE object database, each with its own HEAD/index. The MCP server runs `git worktree add <dir> <ledger-branch>` to materialize the ledger's files into a side directory while the developer stays on their feature branch, untouched. It reads/writes there, then commits, fetches, merges, and pushes the ledger branch.

- The feature branch carries NO ledger files -> deleting/switching feature branches never touches the ledger, and ledger data is never accidentally committed into feature history.
- Worktree placement: cleanest is OUTSIDE the repo working dir, under `${CLAUDE_PLUGIN_DATA}` (no `.gitignore` needed). If placed in-repo, it must be excluded via `.git/info/exclude` (local, no per-branch gitignore churn). To be pinned at spec time.
- The bridge from "I am on branch X" to "this is Thread T" is NOT a working-tree file — it is the `Thread-Id:` commit trailer (Section 5.3) plus the derived `branch -> binding -> thread` index.

### 4.7 Concurrency

The MCP server serializes writes per machine. Cross-machine, it does fetch -> auto-merge -> push with CAS (compare-and-swap) retry on a non-fast-forward race. All shared files are per-session / per-thread / per-binding and therefore DISJOINT, so concurrent pushes auto-merge with no content conflicts. A `merge=union` driver on append-only text files is a belt-and-suspenders option.

---

## 5. Enforcement planes (concern 4 — what MCP is and whether we are building one)

The redesign's robustness guarantee (original problem 2) comes from moving the ledger's rules OUT of skill prose and INTO tooling. Two planes do this: an MCP server (data plane) and hooks (control/lifecycle plane).

### 5.1 What "MCP" means here, concretely (Probe A)

MCP (Model Context Protocol) is an open standard for exposing tools to an AI agent. In Claude Code, an MCP server is NOT a website — it is a LOCAL SUBPROCESS the plugin ships. Concretely:

- **What we build and bundle:** one small program (Node, Python, or a compiled binary) that Claude Code launches as a child process and talks to over stdio (stdin/stdout) using JSON-RPC. Declared in a `.mcp.json` at the plugin root, e.g. `command: "node", args: ["${CLAUDE_PLUGIN_ROOT}/bin/ledger-server.js"]`.
- **How its tools reach the model:** the server advertises a list of typed tools; Claude Code registers each as a native tool named `mcp__<server>__<tool>` (e.g. `mcp__ledger__transition_thread`). The model calls them like any other tool; arguments and results are structured JSON validated against the tool's schema.
- **Lifecycle:** one instance starts when the plugin loads / the session begins and lives for the whole session; many tool calls reuse it. First call in a session prompts for approval, then auto-approves for the rest of the session (project-level `allowedMcpServers` can pre-approve).
- **So "are we creating an MCP?"** Yes — we author and ship a stdio MCP server as part of the plugin. It is the SOLE reader/writer of the ledger. Because every mutation goes through a typed, schema-validated, FSM-aware tool, malformed ledger state becomes structurally impossible — the model cannot hand-write a broken YAML field, because it never hand-writes files at all; it calls `transition_thread(id, "done")` and the server enforces the DoD gate, caps, write-once, and atomic write.

Honest tradeoff (Pillar 1 vs portability): the MCP server is a RUNTIME DEPENDENCY — the user's machine needs the chosen runtime (Node or Python) or we ship a compiled binary per platform. A pure-hooks-plus-CLI design would avoid the daemon but reintroduce stringly-typed, permission-prompted, parse-prone interactions and lose the schema guarantee. We choose the MCP server because the guarantee is the whole point of the redesign; the runtime cost is documented and mitigated by shipping a binary or requiring Node (already common).

### 5.2 MCP typed tools (the ledger's entire write surface)

`open_thread`, `bind_branch`, `append_session_event`, `record_decision`, `transition_thread` (FSM-validated), `reconcile` (drift pipeline), `archive_thread`, `create_successor` / `reopen`, `rebuild_index`, `get_resume_brief`. Each enforces schema + the 5-state FSM + caps + write-once + atomic commit. Ledger state is reached via the worktree on the ledger branch (git) or the local dir (non-git); `${CLAUDE_PLUGIN_DATA}` holds only caches.

### 5.3 The `Thread-Id:` commit trailer + auto-installed hook (Probe G — Gerrit precedent)

To bridge a branch to its Thread durably, the first commit of every feature branch carries a `Thread-Id: <ulid>` trailer. This is directly modeled on Gerrit's `Change-Id`: a stable identity in the commit-message footer that survives amend/rebase/cherry-pick, discoverable via `git log --grep="Thread-Id:"`, and thus recoverable even after the branch is deleted.

Mechanism (from Gerrit): a `commit-msg` hook inserts the trailer if absent, does nothing if present (idempotent -> amend-safe), and is opt-out via git config. The critical lesson from Gerrit's real-world friction is DISTRIBUTION: Gerrit still makes users manually `curl` + `chmod` the hook into every clone, and "missing Change-Id" rejections are the common result. A distributable plugin must AUTO-INSTALL the hook — via `core.hooksPath` (Git 2.9+) pointing at a plugin-managed hooks dir, NOT by hand-copying into `.git/hooks/`. Caveat to handle at spec time: if the user already sets `core.hooksPath` (Husky, pre-commit), the plugin must chain/append rather than clobber. Enforcement that the trailer is present can also ride a `PreToolUse`/pre-push check, but the trailer is a convenience for re-attach, not a correctness gate — its absence degrades to slug/manual re-attach (Section 6.4), it does not corrupt state.

### 5.4 Hooks (control/lifecycle plane) — verified capabilities (Probe A)

| Hook | Can block? | Role in the ledger |
|---|---|---|
| SessionStart | No (inject only) | Inject resumable-Thread roster; run `reconcile`; inject drift report |
| UserPromptSubmit | Yes | Detect resume intent; inject the roster on demand |
| PreToolUse | Yes (deny + rewrite input) | DENY raw writes to ledger paths -> force everything through MCP; auto-approve ledger MCP tools |
| PostToolUse | No | Context-percentage nudge; capture current SHA |
| Stop | Yes (exit 2) | Block session end until a handoff is written / dirty-state gate |
| PreCompact | No | Write a checkpoint sentinel before compaction |
| WorktreeCreate / WorktreeRemove | Create: yes | Optional mitosis-style adapter hook points (must remain optional) |

Note (Probe A): SessionStart CANNOT block, so the resume gate is enforced via context injection + the Stop hook, not by blocking startup. Plugin-bundled AGENTS cannot declare their own hooks/mcpServers; enforcement is declared at plugin level.

### 5.5 Skills

`session-handoff` (write) and `resume-project` (read) become thin: they CALL MCP tools (via allowed-tools), never hand-write ledger files. All format/FSM/cap logic lives in the server, not the prose. This is what closes the ~8 prose-drift points from original problem 2.

---

## 6. Lifecycle and drift (reframed per Section 2)

### 6.1 Five-state FSM (unchanged, now server-enforced)

States: `active`, `paused`, `blocked`, `done`, `abandoned`. `done`/`abandoned` are terminal. `active` means "being worked THIS session." Allowed transitions and the DoD gate (`done` requires non-empty, all-checked `completion_criteria` + a closure statement) are validated by `transition_thread` — the server refuses an illegal transition rather than a hook parsing prose.

### 6.2 BranchBinding lifecycle — branch gone, work continues

- **Merged:** binding -> `merged`; Thread -> `done` (iff DoD met). The normal, primary path.
- **Pruned-after-merge (concern 1's target case):** the branch is deleted in cleanup AFTER merge; binding already `merged`; the Thread's context lives on the ledger branch; a later related effort finds it via `predecessor_id` or `external_refs`. This is the case the whole system exists to serve.
- **Orphaned (branch deleted while incomplete):** binding -> `orphaned`; Thread -> `paused` (NOT terminal). This is the bad-practice case (Section 2 non-goal) — handled gracefully but never optimized for.
- **Continued (new branch, same in-progress work):** SAME Thread + a NEW binding; `predecessor_id` unchanged.
- **Extended (terminal Thread, feature evolves later):** NEW Thread with `predecessor_id` = old; old Thread untouched (terminal = immutable).

### 6.3 Drift pipeline on resume — reconcile, not police

Eight git signals, computed by `reconcile`: head SHA missing; head not-ancestor of remote branch; divergence count; force-push in reflog; key file deleted; key file modified; squash-merged (patch-id match); branch deleted / merged. Classified as CRITICAL / WARNING / COMPLETE-candidate, then dispositioned: re-verify (reset ledger to HEAD), reopen (paused), or archive-as-superseded (append-only terminal record). Under the reframe, the report is presented as reconciliation and recovery, not as an accusation.

### 6.4 Re-attach flow on a new branch

1. Trailer lookup (primary): `Thread-Id:` in nearby/first commits -> Thread.
2. Slug match (fallback): branch-name slug -> derived index.
3. Manual prompt (last resort).
Then: `paused`/`blocked` -> new binding + set `active` + present the Resumption Brief; `done`/`abandoned` -> offer a successor Thread (`predecessor_id`).

---

## 7. File structures, summary formats, and link examples (concern 2)

This section is the concrete artifact set that v1 lacked.

### 7.1 On-store layout (identical logical shape for git-ref store and non-git local store)

```
<ledger root>/
  PROJECT.md                              # cold layer, cap ~80 lines (prose index)
  threads/<thread-ulid>.json              # one recursive Thread per file (parent_id nullable)
  bindings/<binding-ulid>.json            # BranchBinding junction (git projects only)
  decisions/NNNN-slug.md                  # MADR record; immutable; superseded-by
  sessions/<thread-ulid>/<ts>--<actor>.md # hot layer: append-only session logs
  index/                                  # DERIVED, rebuilt on startup — never hand-edited
    by-slug.json                          #   slug            -> thread-ulid
    by-branch.json                        #   repo+branch     -> [binding-ulid]
    children.json                         #   parent-ulid     -> [child-ulid]
    resumable.json                        #   the roster SessionStart injects
```

For a git project, `<ledger root>` is the worktree checkout of the ledger branch. For a non-git project, it is `${CLAUDE_PLUGIN_DATA}/<project-key>/ledger/`.

### 7.2 Thread record (example — the small bug-fix, standalone)

```json
{
  "schema_version": 1,
  "id": "01J9Z3K7Q8...THREAD",
  "slug": "fix-signup-bug",
  "title": "Fix sign-up 500 on duplicate email",
  "status": "paused",
  "parent_id": null,
  "predecessor_id": null,
  "completion_criteria": [
    { "text": "duplicate-email path returns 409, not 500", "done": true },
    { "text": "regression test asserts the 409", "done": false }
  ],
  "vcs_ref": "fix/signup-bug",
  "external_refs": [],
  "spine": { "...": "see 7.6" }
}
```

### 7.3 Thread record (example — a child of the migration epic; note the ONLY difference is parent_id)

```json
{
  "schema_version": 1,
  "id": "01J9ZAA10...CHILD3",
  "slug": "migrate-orders-table",
  "title": "Migrate orders table to partitioned schema",
  "status": "active",
  "parent_id": "01J9ZA0EPIC...ROOT",
  "predecessor_id": null,
  "completion_criteria": [ { "text": "orders migration + rollback authored", "done": false } ],
  "vcs_ref": "feat/migrate-orders",
  "external_refs": [
    { "system": "mitosis", "id": "MSP-3", "url": "" }
  ]
}
```

The epic root (`01J9ZA0EPIC...ROOT`) is a Thread with `parent_id: null`; it holds NO child list. Its children are found by reading `index/children.json` or querying `parent_id`.

### 7.4 BranchBinding record (example)

```json
{
  "id": "01J9ZBIND...01",
  "thread_id": "01J9Z3K7Q8...THREAD",
  "repo": "git@github.com:acme/app.git",
  "branch": "fix/signup-bug",
  "status": "merged",
  "created_at": "2026-06-28T14:02:00Z",
  "closed_at": "2026-06-29T09:10:00Z",
  "closed_reason": "merged",
  "first_commit": "9f3a1c2",
  "trailer_present": true
}
```

### 7.5 Decision record (MADR; example)

```
# NNNN — Adopt orphan branch as the default ledger store
Status: accepted
Date: 2026-06-30
Thread-Id: 01J9Z3K7Q8...THREAD      <- links to the Thread by stable ULID, never by slug

## Context and Problem
...
## Considered Options
- Orphan branch (chosen)
- refs/ledger/* custom namespace
- git notes
## Decision Outcome
Chosen: orphan branch, because ...
## More Information
Supersedes: (none)   Superseded-by: (none)
```

### 7.6 The progressive-summary "spine" (warm layer; stored on the Thread)

Fixed fields, merged forward each session so the resume budget stays small whether a Thread spans 2 sessions or 20:

```json
"spine": {
  "status": "paused",
  "active_goal": "Return 409 on duplicate-email sign-up",
  "next_step": "Write the failing regression test, then implement the guard",
  "open_risks": ["Existing callers may depend on the 500 body shape"],
  "key_decisions": ["0007-signup-error-contract"],
  "out_of_scope": ["Rate-limiting the sign-up endpoint"]
}
```

`key_decisions` holds decision FILENAMES (which embed the stable NNNN), resolved on demand — decisions are never compressed into the spine; they live in append-only `decisions/*.md` and are loaded by pointer.

### 7.7 Session log entry (hot layer; append-only; example `sessions/<thread>/2026-06-29T09-00--cursor.md`)

```
# Session 2026-06-29-01 — fix-signup-bug
Where it started: resumed paused Thread to add the regression test.
What shipped: reproduced the 500; wrote failing test asserting 409.
Tried and failed: -
Decisions locked: 0007-signup-error-contract
Verification: npm test -- signup.spec (1 failing as expected, RED).
Pick up here: implement the duplicate-email guard to turn the test GREEN.
Drift observed: none (head SHA matches recorded pointer).
```

### 7.8 The Resumption Brief (what `get_resume_brief` composes; what resume-project renders)

Composed from the Thread spine + latest session log + `reconcile` output. Format:

```
RESUMPTION BRIEF — fix-signup-bug            state: paused -> active (awaiting confirm)
Thread-Id:    01J9Z3K7Q8...THREAD
Priority:     high
Done so far:  Reproduced the duplicate-email 500; wrote a failing test asserting 409.
Left off at:  Test is RED; guard not yet implemented.
Next step(s): Implement the duplicate-email guard; run signup.spec to GREEN.
Open/risks:   Callers may depend on the old 500 body shape (see 0007).
Drift:        none — recorded head SHA matches branch tip.
Children:     (none — standalone Thread)
— Awaiting your instruction. Will not proceed until directed.
```

For an epic, `Children:` lists each child Thread with its status (rolled up from `index/children.json`).

### 7.9 How links work end-to-end (worked resolution)

- **Parent/child (hierarchy):** child Thread `01J9ZAA10...CHILD3` carries `parent_id = 01J9ZA0EPIC...ROOT`. The derived `index/children.json` inverts this so the epic can list its children without storing them.
- **Lineage (supersession):** an extended Thread carries `predecessor_id` = the old terminal Thread's ULID. Follow it to read prior context; the old Thread is immutable.
- **Branch -> Thread:** commit trailer `Thread-Id: <ulid>` on the feature branch -> that Thread. Independently, `index/by-branch.json` maps `repo+branch -> [binding]` -> `binding.thread_id -> Thread`. Two paths, both surviving branch deletion (the trailer lives in commit history; the binding lives on the ledger branch).
- **Thread -> decisions:** `spine.key_decisions` holds decision filenames; each decision's front matter carries `Thread-Id:` back to the Thread. Bidirectional, both by stable ID.
- **Invariant:** every cross-reference is a ULID (or the decision's stable NNNN). A slug or path is NEVER a link target, so renames never break links (the rename trap Probe H and B both warn against).

---

## 8. Memory tiers (Probe B, prior art)

- **Hot** = per-session append-only log (`sessions/<thread>/*.md`). Full detail, including rejected-option rationale.
- **Warm** = the Thread `spine` (~80 lines equivalent). Merged forward each session.
- **Cold** = `PROJECT.md` (~80 lines). Low-churn index.
Compact at ~70% context, not at the hard limit. Always preserve reasoning traces (WHY an option was rejected), never just conclusions.

---

## 9. Plugin packaging (Probe A)

```
<plugin>/
  .claude-plugin/plugin.json     # metadata + userConfig declarations
  .mcp.json                      # the bundled stdio ledger server
  bin/ledger-server.(js|py|bin)  # the sole ledger reader/writer
  hooks/hooks.json               # SessionStart / Stop / PreToolUse / PreCompact / etc.
  hooks/commit-msg               # Thread-Id trailer inserter (installed via core.hooksPath)
  skills/session-handoff/…       # thin; calls MCP tools
  skills/resume-project/…        # thin; calls MCP tools
```

- `${CLAUDE_PLUGIN_ROOT}` = ephemeral install dir (never write state there). `${CLAUDE_PLUGIN_DATA}` = persistent (survives updates) — caches + the non-git ledger store. `${CLAUDE_PROJECT_DIR}` = project root (git or not).
- `userConfig` (per-user, per-installation; prompted at enable; exposed as `${user_config.KEY}`): `ledger_backend` (`orphan-branch` | `custom-ref`), `ledger_branch` name, opt-outs. NOTE: userConfig is NOT per-project (Probe A) — per-project variance, if ever needed, would come from project settings, not userConfig.
- Marketplace-distributable; `--scope user|project|local`.

---

## 10. Non-git projects — consolidated (concern 7)

Covered inline in 4.5. Summary: git project -> git-ref storage driver (shared, multi-user, drift pipeline active). Non-git project (e.g. `~/.claude`) -> local `${CLAUDE_PLUGIN_DATA}/<project-key>/ledger/` driver (single-user, machine-local, `vcs_ref = null`, no BranchBinding, no drift pipeline). Same data model, same MCP tools, same skills; only the storage driver differs, selected automatically. This formalizes and preserves how the current system already treats `~/.claude`.

---

## 11. Open questions, risks, and what would change the decisions

- **PRIMARY DECISION TO CONFIRM:** orphan branch (robust default) vs. `refs/ledger/*` custom namespace (idiomatic/clean, host-dependent). Recommendation: orphan-branch default + custom-ref opt-in (Section 4.4). If the team is known to be entirely on GitHub/GitLab and values branch-list cleanliness over universal-host guarantees, flip the default to custom-ref.
- **`core.hooksPath` clobber risk:** must detect and chain an existing hooks path (Husky/pre-commit) rather than overwrite. Verify `core.hooksPath` semantics before locking the install mechanism (Probe G flagged this as not re-verified).
- **Custom-ref host support:** if the custom-ref opt-in is offered, verify the target host accepts `refs/ledger/*` pushes; some hosts restrict non-standard refs (git-bug friction precedent).
- **MCP runtime dependency:** Node/Python required, or ship per-platform binaries. Portability cost accepted for the schema guarantee (Section 5.1).
- **Worktree placement:** in-repo (`.git/info/exclude`) vs. outside-repo (`${CLAUDE_PLUGIN_DATA}`). Lean outside-repo. Pin at spec time.
- **CAS-retry push:** the concurrency path (fetch -> merge -> push, retry on non-ff) needs a careful, tested implementation.
- **Scale:** adjacency-list "has children" scan is fine at dozens of Threads; a cached child-index (already in `index/`) covers larger scale. Materialized path only if re-parenting ever becomes frequent (it will not).

---

## 12. Research provenance and sources

Five original probes (v1): A CC plugin/MCP/hooks mechanics; B handoff/ADR/memory prior art; C git drift detection; D storage durability; E durable work-item identity. Three v2 follow-up probes:

- **Probe F — MCP/plugin mechanics (verified against current CC docs).** stdio server model, `.mcp.json`, `mcp__server__tool` naming, per-session lifecycle, first-call approval; hook capability table (SessionStart cannot block; UserPromptSubmit/PreToolUse/Stop/WorktreeCreate can); plugin agents cannot self-declare hooks/mcp; non-git behavior (`CLAUDE_PROJECT_DIR` always set, `CLAUDE_PLUGIN_DATA` persists across updates); userConfig is per-installation.
- **Probe G — durable git-metadata storage.** Six-tool survey (git-spice `refs/spice/*`, git-town `git config`, Graphite local+cloud, git-bug `refs/bugs/*`, jj local DB + `refs/jj/*`, GitButler local `gitbutler/workspace`); none use orphan branches; custom-ref namespace is the idiom (also GitHub `refs/pull/*`, GitLab `refs/merge-requests/*`); default fetch refspec transfers only `refs/heads/*`; Gerrit `Change-Id` + `commit-msg` hook precedent and its install-friction lesson (auto-install via `core.hooksPath`).
- **Probe H — generic work-unit modeling.** One recursive entity + nullable `parent_id`; "has children" is a query; lazy promotion; adjacency list for shallow trees; capability-negotiation / dependency-inversion for optional tool enrichment via a generic `external_refs` bag; Jira's fixed type-per-level hierarchy as the anti-pattern.

Key source URLs (from Probes G and H): LangGraph persistence (docs.langchain.com); git-bug data model (github.com/git-bug/git-bug); Fossil tickets (fossil-scm.org); Linear conceptual model + parent/sub-issues (linear.app/docs); GitHub sub-issues (docs.github.com); MADR (adr.github.io/madr); LSP capability negotiation (microsoft.github.io/language-server-protocol); git fetch/refspec + githooks + git-notes (git-scm.com); Gerrit Change-Id + commit-msg hook (gerrit-review.googlesource.com); git-spice internals (abhinav.github.io/git-spice); git-town config (git-town.com); jj git-compatibility (docs.jj-vcs.dev); GitButler integration branch (docs.gitbutler.com).

---

## 13. Glossary

- **Ref / branch / orphan branch / custom ref namespace / refspec / trailer** — see Probe G glossary; the load-bearing one: the DEFAULT clone refspec transfers only `refs/heads/*`, which is why a real branch auto-syncs and a custom ref does not.
- **Adjacency list** — each node stores its own `parent_id`; children found by querying it. Chosen tree representation.
- **Lazy promotion** — a unit starts flat and only becomes a parent when a second related unit appears; never pre-declared.
- **Capability negotiation / dependency inversion** — the core defines a generic interface and never depends on any specific integration; optional tools (mitosis, Jira) implement it or are simply absent.
- **CAS retry** — compare-and-swap: push, and if the remote moved, re-fetch/merge and retry.
- **MCP server** — the bundled local stdio subprocess exposing the ledger's typed tools; the sole writer.
- **Spine** — the fixed-field progressive summary carried on each Thread (warm memory tier).
