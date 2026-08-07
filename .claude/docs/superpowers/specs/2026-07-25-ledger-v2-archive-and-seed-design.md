# Ledger v2: Archive-and-Seed Design

Status: APPROVED 2026-07-25 — all three open decisions resolved by the user; ready for execution
Date: 2026-07-25
Thread: ledger-v2-archive-and-seed
Supersedes: `2026-07-20-ledger-v1-to-v2-migration-design.md` (Workstreams B and D deleted outright)
Governing decisions: `decisions/2026-07-25-archive-not-migrate-v1-ledger.md`, `decisions/2026-07-25-v2-read-surface-audit.md`, `decisions/2026-07-25-archive-and-seed-decisions-resolved.md`

---

## 1. Purpose

Retire the v1 file ledger without migrating it. The v1 store is frozen as a grep-only archive; v2 is stood up empty and seeded with newly hand-authored threads written from each live line of work's CURRENT state. No migrator is written. No thread, decision, or session is transformed.

The deciding fact, established by the read-surface audit: v2 exposes 12 MCP tools and none of them read, search, or query decisions or sessions. Migrated or archived, that content is equally grep-only. Seeding ~10 spines instead of transforming 502 records therefore loses nothing a tool could have returned, and cuts the leak surface by roughly 99%.

## 2. What is inherited

Exactly one element of the superseded SPEC survives: **A1** (rename the plugin's two skills) and **A2** (update the global rule in lockstep). Everything else in Sections B, D, and E of that document is void.

## 3. Verified ground truth

Every fact below was confirmed against the source on 2026-07-25. These supersede the assumptions carried in the thread's Open Risks.

| Fact | Evidence |
|---|---|
| v2 store root for a git repo is `${CLAUDE_PLUGIN_DATA}/<projectKey>/ledger-worktree` — **outside the project tree entirely** | `src/drivers/select.mjs:36-44` |
| `projectKey` = absolute path with every non-alphanumeric replaced by `-` | `src/util/project-key.mjs:10` |
| `CLAUDE_PLUGIN_DATA` throws if unset; it is not set in an ordinary login shell | `src/drivers/select.mjs:24-30` |
| Store subdirectories are `threads, bindings, decisions, sessions, index` | `src/drivers/local-driver.mjs:9` |
| Spine caps: scalars 500 chars; `open_risks`/`out_of_scope` 20 items; every array item 300 chars; `key_decisions` has **no item-count cap** | `src/model/caps.mjs:1-10` |
| `open_thread` accepts title, slug, parent_id, predecessor_id, completion_criteria, vcs_ref, external_refs — **not spine**; forces status active | `src/tools/open-thread.mjs:27-40`, `src/model/thread.mjs:50` |
| `update_thread` is the only spine writer; refuses terminal threads; enforces caps | `src/tools/update-thread.mjs:30-37,52-62` |
| `get_resume_brief` returns spine fields only; `external_refs` is never returned | `src/tools/get-resume-brief.mjs:14-27` |
| Roster shows only `active`, `paused`, `blocked` | `src/index/rebuild-index.mjs:1,38-49` |
| Every write tool calls `commitAndReindex` — one commit per call | `src/tools/open-thread.mjs:20` |
| Installer records the prior hooks path, then repoints `core.hooksPath` | `hooks/lib/installer.mjs:85-93` |
| `STANDARD_HOOKS` includes `pre-commit`; the dispatcher is copied to every standard name and `exec`s `$prior/$hook_name` | `hooks/lib/installer.mjs:6-24,50-60`; `hooks/dispatcher:22-25` |
| This repo already sets `core.hooksPath=.githooks`, whose only hook is `pre-commit` running `npm test` | `git config`; `.githooks/pre-commit:8` |
| `~/.claude/rules/common/continuity-ledger.md` is the **same inode** as the tracked repo copy (120169513) | `stat` |
| `~/.claude/settings.json` is a **symlink** to the tracked `.claude/settings.json` (target inode 122185420) | `stat -L` |
| `~/.claude/skills/session-handoff/SKILL.md` is the **same inode** as the repo copy (119692734) | `stat` |
| Plugin skills still declare `name: session-handoff` and `name: resume-project` — the collision with the v1 skills is live | `skills/*/SKILL.md:2` |
| Origin is `git@github.com:SatanshuMishra/.windful-ocean.git` | `git remote -v` |
| `.claude/ledger/` is gitignored; `.claude/docs/superpowers/` is gitignored (this SPEC is local-only) | `.claude/.gitignore` |
| No `_ledger` branch exists; the plugin is not installed in any marketplace | `git branch -a`; `~/.claude/plugins/marketplaces/` |
| Leak scan of the 10 seed-source threads: **0 hits** for the confidential codename. Only 3 files in the whole v1 ledger carry it, all under `sessions/` | `grep -ric` |

## 4. Corrections to the inherited SPEC and to the thread's risk list

**C-1. The collision risk was mis-stated.** The thread's Open Risks say the archive layout must avoid the v2 store's subdir names or "the two file organizations collide". They cannot physically collide: the v2 store lives under `CLAUDE_PLUGIN_DATA`, not under `.claude/`. The *real* hazard is different and sharper — the v1 `resume-project` skill probes `<repo>/.claude/ledger/` first. Leave the archive there and v1 keeps resuming from it, defeating the retirement. **The archive must move off the path the v1 locate protocol probes.** Root-level name hygiene is retained as cheap belt-and-braces, not as the primary control.

**C-2. NEW, not previously recorded: relocating the archive un-ignores it.** `.claude/.gitignore` ignores the literal directory `ledger/`. A sibling such as `.claude/ledger-archive-v1/` does **not** match. Verified: `git check-ignore` reports `.claude/ledger-archive-v1/v1/PROJECT.md` as TRACKABLE while `.claude/ledger/PROJECT.md` is IGNORED. Moving 3.3 MB — including the 3 session files carrying the confidential codename — into an un-ignored path stages a leak to a repo whose origin is a GitHub remote. This is the single most dangerous step in the whole plan and it appears in no prior risk list.

**C-3. A2's sequencing trap dissolves.** The open question was whether repointing the global rule before install "documents away the working v1 path". Order it `A1 -> C(install) -> A2` and the rule is never wrong at any point: before install it names the v1 skills, which exist; after install both skill sets exist; A2 then repoints to `ledgerize`/`lift-off`, which by then also exist. No window of incorrectness.

**C-4. A2 is committable, contradicting the inherited text.** Section 8 of the superseded SPEC calls the rule file "under `~/.claude` (not git)". It is the same inode as the tracked repo file. Editing it through either path edits one file, and that file is tracked in this repo. The recorded loss of A2 to an uncommitted working tree is therefore fully preventable: edit, then commit in the same step.

**C-5. `core.hooksPath` needs no bespoke reconciliation.** The installer copies the dispatcher into every name in `STANDARD_HOOKS`, which includes `pre-commit`, and the dispatcher `exec`s the same-named hook under the recorded prior path. Install records `.githooks` as prior, so `.githooks/pre-commit` (`npm test`) still runs. Criterion 5's "hooksPath reconciled" is satisfied by *verifying* the chain, not by building anything.

## 5. Workstream A — Archive the v1 ledger

### A0. Archive root — DECIDED (user, 2026-07-25)

**In-repo, gitignored.** The archive stays inside the project it documents so it remains greppable in the same searches that reach the rest of the project:

```
/Users/satanshumishra/Documents/DevLabs/.windful-ocean/.claude/ledger-archive-v1/
```

The name satisfies all three constraints the user set: it is inside `.windful-ocean`; it does not collide with the v2 store (whose root sits under `CLAUDE_PLUGIN_DATA`, and whose subdir names are excluded by the `v1/` nesting in A2a); and it is reachable by ordinary `grep -r` from the project root.

The out-of-repo option is rejected. The cost of this choice is that leak safety now rests on a gitignore rule rather than on construction, which makes gate A1a mandatory and non-negotiable.

### A1a. Ignore gate — MANDATORY, blocking

The archive path is TRACKABLE today (verified: `git check-ignore` reports `.claude/ledger/PROJECT.md` IGNORED and `.claude/ledger-archive-v1/v1/PROJECT.md` TRACKABLE). Three archived session files carry a confidential client codename and this repo pushes to a GitHub remote.

Before any file is moved, add `ledger-archive-v1/` to `.claude/.gitignore`, commit that edit on its own, and prove it:

```sh
git check-ignore -v .claude/ledger-archive-v1/v1/PROJECT.md
git status --short .claude/ | grep ledger-archive && echo "VISIBLE TO GIT - STOP" || echo "invisible to git - proceed"
```

The first command must exit 0 and name the new rule; the second must print `invisible to git`. If either fails, **stop** — do not move any files. This gate is the only thing standing between the archive and a published leak.

### A2a. Layout

```
<archive-root>/
  ARCHIVE-MANIFEST.md
  MANIFEST.sha256
  v1/
    PROJECT.md
    threads/  decisions/  sessions/  analysis/  graphify-out/
```

The v1 tree is nested one level under `v1/` so the archive root's own children are `ARCHIVE-MANIFEST.md`, `MANIFEST.sha256`, `v1/` — none of which is `threads`, `bindings`, `decisions`, `sessions`, or `index`. Root-level collision is impossible by construction regardless of where the root is placed.

`ARCHIVE-MANIFEST.md` records: what this is, the freeze date, the corpus counts measured at freeze time, the pointer back to this SPEC and to the governing decision record, and one line stating that the contents are grep-only and are not read by any v2 tool.

### A3a. Freeze procedure

Digest first, move second, digest again, compare. Nothing is deleted at any point.

```sh
cd /Users/satanshumishra/Documents/DevLabs/.windful-ocean/.claude/ledger
find . -type f -print0 | sort -z | xargs -0 shasum -a 256 > /tmp/v1-before.sha256
wc -l < /tmp/v1-before.sha256
```

Move the tree to `<archive-root>/v1/`, then:

```sh
cd <archive-root>/v1
find . -type f -print0 | sort -z | xargs -0 shasum -a 256 > /tmp/v1-after.sha256
diff /tmp/v1-before.sha256 /tmp/v1-after.sha256 && echo BYTE-IDENTICAL
```

`diff` must be empty. Then copy `/tmp/v1-after.sha256` to `<archive-root>/MANIFEST.sha256` and freeze:

```sh
chmod -R a-w <archive-root>
```

**Honesty clause that must travel with this step:** `chmod -R a-w` is a guardrail against accidental writes, not tamper resistance. The owner can reverse it in one command. It is sufficient for the stated goal (nothing writes here by habit) and must never be described as immutability.

### A4a. Backup

The archive is local-only under either option, and unbacked by any remote. Produce one tarball outside the repo and outside `~/.claude`, and record its path in `ARCHIVE-MANIFEST.md`. Recommended, not gating.

### A5a. Confirm the v1 probe now misses

```sh
test -e /Users/satanshumishra/Documents/DevLabs/.windful-ocean/.claude/ledger && echo "STILL PRESENT - not done" || echo "v1 path clear"
```

The directory must be gone, not merely emptied. An empty-but-present `.claude/ledger/` makes the v1 locate protocol find a ledger and then fail confusingly.

## 6. Workstream B — Skill rename (A1) and global rule (A2)

### B1 (= A1). Rename the plugin's skills in the dedicated plugin repo, then publish

Confirmed by the user 2026-07-25: the rename happens in the dedicated repo, which is then **published and installed from GitHub** — not installed from a local path.

Repo: `/Users/satanshumishra/Documents/DevLabs/continuity-ledger-plugin`, remote `https://github.com/SatanshuMishra/continuity-ledger-plugin.git`, currently on `main` in sync with `origin/main` at `bcc29dd`, working tree clean apart from untracked `node_modules`.

`session-handoff -> ledgerize`, `resume-project -> lift-off`. Three surfaces per skill: the directory name, the `name:` frontmatter at `skills/*/SKILL.md:2`, and every invocation string inside `description:` and the body checklists. The `allowed-tools:` lines list `mcp__ledger__*` tools and do not change.

Then, in order: commit the rename; run the repo's own test suite; push to `origin/main`. Publication is what makes the renamed skills installable, so it strictly precedes C. Do not install from a local path — the marketplace source must be the GitHub repo, so that what is installed is what is published.

### B2 (= A2). Repoint the global rule — AFTER install

Edit `~/.claude/rules/common/continuity-ledger.md` (identically, `.claude/rules/common/continuity-ledger.md` — one file, inode 120169513). Two known sites name the old skills: line 3 ("Write side ... Read side") and line 45 ("or honor an explicit `/resume-project <slug>`"). Re-grep at edit time rather than trusting these line numbers.

**Commit immediately, in the same step as the edit.** This work was verified lost once already to an uncommitted working tree. The commit is the deliverable, not the edit.

Note that `protect-claude-config.sh` returns "ask" on writes under `~/.claude` rule paths. That prompt is expected; a human approves it.

## 7. Workstream C — Install and set up the plugin

### C1. Enablement writes to an off-limits file — DECIDED: wait

Enabling the plugin writes `enabledPlugins` into `~/.claude/settings.json`, which is a symlink to the **tracked** `.claude/settings.json`. That file currently carries uncommitted changes belonging to the off-limits MSP-3 work (`fix/mitosis-git-actions-robustness`, user boundary of 2026-07-25).

User ruling 2026-07-25: **wait.** The MSP-3 thread will commit those changes and park itself before anything is pushed. This SPEC does not stash, revert, or commit that file, and does not enable the plugin until the MSP-3 changes are committed.

Precondition to be re-checked at execution time, not assumed:

```sh
git status --short .claude/settings.json
```

Empty output means MSP-3 has landed and C may proceed. Non-empty means **stop and wait** — enabling now would mix this work into another thread's uncommitted diff.

### C2. Install

Add the marketplace from the **GitHub** source (per B1) and install `session-continuity` from it. The marketplace declares `name: continuity-ledger`, owner `SatanshuMishra`, one plugin with `source: "./"` resolved relative to the published repo.

### C3. Verify coexistence

Both skill sets must resolve with no collision: v1 `session-handoff` / `resume-project` (in `~/.claude/skills`, hardlinked into this repo) and v2 `ledgerize` / `lift-off` (from the plugin). Confirm all four are listed and that invoking each reaches the intended one.

### C4. Verify `CLAUDE_PLUGIN_DATA`

It is unset in an ordinary shell and `select.mjs:24-30` throws without it, so it must be confirmed **as the MCP server sees it**, not from a terminal. Confirm the resolved store root is:

```
${CLAUDE_PLUGIN_DATA}/-Users-satanshumishra-Documents-DevLabs--windful-ocean/ledger-worktree
```

### C5. Verify the hook chain (criterion 5's "hooksPath reconciled")

After install, assert all three:

```sh
git config --get core.hooksPath
git config --get continuity.priorHooksPath
```

The first must be the managed dir under `CLAUDE_PLUGIN_DATA`; the second must be `.githooks`. Then prove the chain end to end by making a throwaway commit in a scratch branch and confirming `npm test` still fires from `.githooks/pre-commit` via the dispatcher. A passing config read is not proof; the firing hook is.

### C6. Do not sync

`DEFAULT_REMOTE` is hardcoded to `origin` and the `_ledger` ref lives in this repo, so `ledger-cli sync` publishes ledger content to GitHub. **Do not run it as part of this work.** Any future sync is gated on Section 10's leak scan.

## 8. Workstream D — Seed the v2 threads

### D1. Seed set

Ten threads: the nine live v1 threads plus this one.

| Slug | v1 criteria | Notes |
|---|---|---|
| ledger-v2-archive-and-seed | 5 | Seed **first**; final spine update last |
| mitosis-git-actions-robustness | 6 | Has a real `vcs_ref` |
| agent-roster-gap-resolution | 5 | |
| claude-config-dotfiles-migration | 6 | |
| continuity-plugin-realworld-test | 5 | |
| mitosis-frontier-default | 7 | |
| mitosis-preflight-hardening | 3 | |
| mitosis-resilience-implementation | 4 | `next_step` over cap |
| mitosis-robustness-overhaul | 8 | `next_step` over cap; prose-form progress, adjudicate per D5a |
| vibesec-integration | **0** | Seed and keep paused (user, 2026-07-25); criteria must be authored — see D1a |

### D1a. `vibesec-integration` — criteria authored at seed time

The user ruled it stays live and will be worked on soon. It has no `completion_criteria` block at all, and v2 refuses `done` on an empty criteria list while criteria can only be set at creation. Keeping it alive therefore *entails* authoring criteria now: `open_thread` is the only moment they can ever exist.

Draft them from the thread's own stated goal — understand the VibeSec secure-coding skill and decide whether and how to fold it into the `security-reviewer` agent — with evaluation marked `done: true` (the v1 thread records evaluation complete) and implementation `done: false`. **Show the drafted criteria to the user for confirmation before the `open_thread` call**, since they are permanent from that moment. This is the only thread whose criteria are invented rather than carried forward.

The chicken-and-egg thread is resolved by seeding `ledger-v2-archive-and-seed` **first**, so the remaining work is tracked in v2 as it happens, then refreshing its spine with a final `update_thread` once seeding completes. This also gives `/lift-off` something real to present from the first moment.

### D2. Per-thread call sequence

Three calls, in order:

1. `open_thread` — `title`, `slug` (reuse the v1 slug verbatim), `completion_criteria` (carry v1's forward as `{text, done}`; `criteriaCreateItem` requires `text` and accepts `done`), `vcs_ref` (the v1 `branch`, or null where it is `-`). Status is forced to `active` and timestamps are `now()`; both are accepted, since created_at fidelity is explicitly waived.
2. `update_thread` — the spine: `active_goal`, `next_step`, `open_risks[]`, `key_decisions[]`, `out_of_scope[]`.
3. `transition_thread` — `active -> paused`.

Do **not** pass `external_refs`. It is accepted at creation and never returned by `get_resume_brief`, so anything placed there is invisible. This is why archive pointers ride in `key_decisions`, which has no item-count cap.

### D3. Archive pointer

Every seeded thread carries one `key_decisions` entry, under the 300-char item cap:

```
v1 archive (frozen 2026-07-25, grep-only): <archive-root>/v1/threads/<slug>.md; decisions and sessions under the same root
```

### D4. Cap compliance

Two `next_step` values exceed the 500-char scalar cap. Reported measurements disagree between sources (505/603 from the earlier probe, 460/558 from a first-line-only read), so **re-measure at seed time** with an exact reader rather than trusting either figure, and hand-trim what actually overflows. Trimming is lossless in effect: the full v1 text remains in the archive, which the pointer names. Apply the same check to `active_goal` and to every array item against the 300-char cap.

### D5. Content rule — a seeded thread must be resumable on its own

Amended by the user 2026-07-25. Each spine is hand-authored and stamped to the present, but it must **preserve both halves of the picture: what has already been done, and what remains.** A seeded thread that says only where to go next is a failed seed — resuming it would mean re-deriving progress from the archive, which is exactly the archaeology this migration is meant to end.

The v2 spine has no "done so far" field, so progress is carried structurally across three fields working together:

| What must survive | Where it goes |
|---|---|
| Work already completed | `completion_criteria` entries seeded with `done: true` — the authoritative record |
| Work still outstanding | `completion_criteria` entries with `done: false`, plus `next_step` |
| Where the work stands right now | `active_goal` — the goal **and** a one-line statement of current state |
| The immediate action on resume | `next_step` — concrete and executable, not a topic |
| Why the thread is where it is | `key_decisions` — load-bearing rulings, plus the archive pointer |

The test to apply before parking each thread: **could someone resume this thread from the brief alone, without opening the archive?** If not, the spine is incomplete. The archive is a citation, never a dependency.

### D5a. Carrying progress across — the criteria done-state map

v1 threads encode progress in **two incompatible formats**, so each thread needs adjudication rather than mechanical copying:

- **Checkbox form** (e.g. `mitosis-frontier-default`): `- "[x] ..."` / `- "[ ] ..."`. Maps directly onto `done: true` / `done: false`.
- **Prose form** (e.g. `mitosis-robustness-overhaul`): state is embedded in parentheses — `(broader sweep still open; the minimal slice DONE in B2)`. These need a judgement call per criterion, plus the residual scope restated in the criterion text so the boolean is not misleading.

Two known cases require special handling:

1. **Compound criteria must be split.** `mitosis-frontier-default` criterion 7 contains both `[x DONE @ 8eedadd, PUSHED + PR #3]` and `[ ] STILL NOT DONE` on one line. A single boolean cannot represent it. Seed it as **two** criteria, one `done: true` and one `done: false`. Note that this thread's own `next_step` refers to "the last open half of criterion 7", so the split must preserve which half is which.
2. **Partially-met criteria get restated.** Where a v1 criterion is half-done, rewrite its text to name only the outstanding scope and seed it `done: false`; record the completed portion either as its own `done: true` criterion or in `key_decisions`. Never seed a half-done criterion as `true`.

Criteria text is fixed at creation — `update_thread` can only toggle `done` on text that already exists, and rejects unknown text (`src/tools/update-thread.mjs:11-22`). **Get the wording right at `open_thread` time**; it cannot be edited afterwards.

### D6. Cost

Every write tool commits, so the ten threads produce roughly thirty commits on the `_ledger` orphan branch. This is expected and local-only.

## 9. Sequencing

```
A1a ignore gate  ->  A archive  ->  B1 rename + push  ->  [C1 wait gate]  ->  C install + verify  ->  B2 rule repoint + commit  ->  D seed
```

- **A1a strictly precedes every file move.** It is the leak gate; nothing in A may start until `git check-ignore` passes.
- A is otherwise independent of B1, but running it first means the v1 probe path is dead before any v2 surface appears, so there is never ambiguity about which ledger is live.
- B1 strictly precedes C: the install source is the published GitHub repo, so the rename must be pushed before it can be installed.
- **C is blocked on the C1 wait gate** — `.claude/settings.json` must be clean, i.e. MSP-3 has committed and parked. This is a timing dependency on another thread, re-checked at execution time.
- B2 strictly follows C (per correction C-3), and is committed in the same step as the edit (per correction C-4).
- D strictly follows C, since the tools must exist to be called.

The first executable action in the next session is the A1a ignore gate. It is cheap, blocking, and independent of every other decision.

## 10. Acceptance, mapped to the thread's five completion criteria

| # | Criterion | Check |
|---|---|---|
| 1 | SPEC authored and approved | This document, plus explicit user approval |
| 2 | v1 archived, non-colliding, frozen, byte-unchanged | `diff` of before/after sha256 manifests is empty; `MANIFEST.sha256` present; archive root children contain no store subdir name; `.claude/ledger/` absent; archive not writable; (in-repo option only) `git check-ignore` exits 0 |
| 3 | Skills renamed and global rule updated **and committed** | Plugin `SKILL.md` frontmatter reads `ledgerize`/`lift-off`; rule file greps clean of `session-handoff`/`resume-project` and names the new skills; `git log` shows the rule commit |
| 4 | Every non-terminal v1 thread has a new v2 thread, seeded and parked | Roster returns 10 threads, all `paused`; each spine carries the archive pointer in `key_decisions`; slugs match the v1 set exactly; **every thread's `completion_criteria` carry accurate `done` flags, and its brief alone is sufficient to resume without opening the archive** (D5) |
| 5 | Plugin installed and set up, live round trip | `CLAUDE_PLUGIN_DATA` resolves to the expected store root; `core.hooksPath` is the managed dir and `continuity.priorHooksPath` is `.githooks`, with `.githooks/pre-commit` proven to still fire; a live `/lift-off` presents the seeded roster; a live `/ledgerize` writes back into the same store |

Criterion 5's last clause is the only end-to-end proof in the plan. Nothing else substitutes for it.

## 11. Decisions — all resolved 2026-07-25

Recorded in `decisions/2026-07-25-archive-and-seed-decisions-resolved.md`.

| # | Decision | Ruling | Consequence |
|---|---|---|---|
| 1 | Archive root | **In-repo, gitignored**, at `.claude/ledger-archive-v1/` — tied to the project and greppable | Gate A1a becomes mandatory and blocking; leak safety rests on a rule, not on construction |
| 2 | `vibesec-integration` | **Keep it live** (paused), to be worked on soon | Criteria must be authored at `open_thread` time — D1a; user confirms the drafted wording before the call |
| 3 | `settings.json` collision | **Wait** — MSP-3 will commit and park before any push | C is blocked until `git status --short .claude/settings.json` is empty |
| 4 | Skill rename venue | **Dedicated plugin repo, then publish, then install** | B1 pushes to `origin/main` first; install source is GitHub, never a local path |
| 5 | Seed content | Spines must preserve **work done and work remaining** | D5 rewritten; D5a adds the criteria done-state map |

No open decisions remain. Execution is unblocked except for the C1 precondition, which is a timing dependency on another thread rather than a question for the user.

## 12. Out of scope

- Migrating any v1 thread, decision, or session. No migrator is written.
- Preserving `created_at` or any historical timestamp — explicitly waived.
- Deleting the v1 ledger. It is archived and frozen, never removed.
- The other four canonical v1 stores — a future per-repo rollout.
- Modifying the plugin beyond the two skill renames.
- `ledger-cli sync` and any publication of the `_ledger` ref.
- Compaction of the 198-line `PROJECT.md` against its 80-line cap (pre-existing, still deferred; the file is archived as-is).
- Branch `fix/mitosis-git-actions-robustness`, its uncommitted files, and the seven worktrees (user boundary, 2026-07-25), except for the read-only observation in C1.
