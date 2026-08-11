# Continuity Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Ledger / Hand-off / Resume continuity system deterministic and lifecycle-enforced: menu-fallback thread selection, a 5-state thread machine with a Definition-of-Done gate, resume that presents a Resumption Brief then STOPS, a progressive-summary spine for long threads, and three hooks that move the load-bearing guarantees out of model-discipline and into the harness.

**Architecture:** Phase 1 rewrites the three governing prose artifacts (the `continuity-ledger` rule and the `resume-project` / `session-handoff` skills) plus reconciles the live ledger. Phase 2 adds five small bash hooks (one shared lib + four event hooks) and wires them into `~/.claude/settings.json`. Phase 3 verifies the whole cycle end-to-end against a throwaway fixture ledger and the real one (read-only). The canonical source for every decision is `decisions/2026-06-25-continuity-redesign-direction.md`; the brief at `scratchpad/continuity-redesign-brief.md` supplies the exact user-facing templates.

**Tech Stack:** Markdown skill/rule files; POSIX-ish bash hooks (`#!/usr/bin/env bash`, `set -u`); `jq` for JSON I/O; `awk`/`sed` for frontmatter parsing; BSD `date` (macOS) with a GNU fallback.

## Global Constraints

- `~/.claude` is NOT a git repository: no git commands, no commits. Per-task verification commands are the gate; the ledger is write-only.
- NEVER write code comments anywhere (shebang is the only carve-out for the hooks). No emojis, no AI attribution.
- The `protect-claude-config.sh` PreToolUse hook returns `ask` on writes under `hooks/*`, `rules/*`, and `settings.json` (and `CLAUDE.md`, `keybindings.json`). Every edit to those paths prompts the human, who approves. Edits under `skills/*` and the live ledger under `projects/*` do NOT prompt.
- Pinned versions, no auto-update; do not touch `enabledPlugins`, `extraKnownMarketplaces`, or any version string in `settings.json`.
- The four design forks are LOCKED (decisions/2026-06-25-continuity-redesign-direction.md). Explicitly OUT of scope: git-worktree / `cwd` thread binding (rejected) and two-level hierarchy / active-leaf pointer (deferred until ~15+ threads). Do not implement them.
- Decided plan-time values: staleness thresholds `active >7d / paused >30d / blocked >90d`; full user-facing templates (Resumption Brief + hand-off summary) as given; PreCompact = checkpoint-write (re-injection instructs a ledger checkpoint).
- Hooks must locate the ledger exactly as the skills do: repo-local `<cwd>/.claude/ledger/` if `PROJECT.md` exists there, else the global fallback derived from `dirname "$transcript_path"` + `/ledger`. Never re-derive the project slug by hand.
- New hook wiring takes effect on the NEXT session (settings.json is read at SessionStart); it will not disturb the session that implements it.
- Hooks are non-critical enhancements: if `jq` is absent, if the ledger is missing, or if anything is ambiguous, exit 0 silently. Never block the user.

**Canonical paths (verbatim):**
- Rule: `/Users/satanshumishra/.claude/rules/common/continuity-ledger.md`
- Skills: `/Users/satanshumishra/.claude/skills/resume-project/SKILL.md`, `/Users/satanshumishra/.claude/skills/session-handoff/SKILL.md`
- Hooks dir: `/Users/satanshumishra/.claude/hooks/`
- Settings: `/Users/satanshumishra/.claude/settings.json`
- Live ledger: `/Users/satanshumishra/.claude/projects/-Users-satanshumishra--claude/ledger/`

---

## Phase 1 — Spec fixes (prose + live ledger, no new infra)

### Task 1: Rewrite the continuity-ledger rule (5-state lifecycle, DoD gate, WIP, staleness, spine)

**Files:**
- Modify (full replace): `/Users/satanshumishra/.claude/rules/common/continuity-ledger.md`

**Interfaces:**
- Produces: the canonical vocabulary every later task and hook references — the 5 states (`active`/`paused`/`blocked`/`done`/`abandoned`), the `active = this-session-only` semantic, the DoD gate, the staleness thresholds (7/30/90), and the spine field set (Status, Active Goal, Next Step, Open Risks, Key Decisions, Out of Scope).

- [ ] **Step 1: Define the acceptance checks (run after writing — they must all pass)**

These greps are the test for this prose task:

```bash
cd /Users/satanshumishra/.claude
F=rules/common/continuity-ledger.md
grep -q "active.*this-session-only\|active.*this session" "$F" && echo ok-semantic
grep -q "abandoned" "$F" && grep -q "blocked" "$F" && echo ok-5state
grep -q "Definition-of-Done\|DoD gate" "$F" && echo ok-dod
grep -q "completion_criteria" "$F" && echo ok-criteria
grep -q "30 days\|> 30\|>30" "$F" && grep -q "90" "$F" && echo ok-staleness
grep -qi "never auto-close" "$F" && echo ok-noautoclose
grep -qi "present the Resumption Brief\|present the menu" "$F" && grep -qi "STOP" "$F" && echo ok-stop
grep -qi "progressive-summary spine\|running summary" "$F" && echo ok-spine
grep -qi "never compressed" "$F" && echo ok-decisions
grep -qi "deferred until\|~15" "$F" && echo ok-hierarchy-deferred
```

- [ ] **Step 2: Replace the file with the new content**

Write this exact content to `rules/common/continuity-ledger.md`:

```markdown
# Continuity Ledger

Per-project, file-based continuity: each session teaches the next the cumulative project state. Write side: the `session-handoff` skill. Read side: the `resume-project` skill. Load-bearing guarantees live in hooks (deterministic); procedure and judgment live in the skills.

## Location and layout

- Git projects: `<repo>/.claude/ledger/`, committed. Non-git projects: `~/.claude/projects/<project-slug>/ledger/`.
- `PROJECT.md` (stable core, cap 80 lines), `threads/<slug>.md` (one per line of work, cap 80 lines), `decisions/YYYY-MM-DD-<slug>.md` (append-only, cap 20 lines), `sessions/YYYY-MM-DD-NN-<thread-slug>.md` (append-only).

## Thread lifecycle (5 states)

A thread is in exactly one state. `active` means "being worked in THIS session" and nothing more. Hand-off auto-transitions the worked thread `active -> paused`. Therefore any `active` thread found at session start is an anomaly (a crashed or abandoned session), which makes zombie detection trivial.

States: `active`, `paused`, `blocked`, `done`, `abandoned`. `done` and `abandoned` are terminal; reopening creates a NEW thread that references the old.

Allowed transitions:
- (new) -> active: thread created with non-empty `completion_criteria`.
- active -> paused: session end (automatic, at hand-off).
- active -> blocked: explicit; `blocked_by` filled.
- active -> done: DoD gate passes.
- active -> abandoned: explicit; `abandoned_reason` filled.
- paused -> active: only via the Resumption Brief (never silent).
- paused -> done | abandoned: DoD gate / explicit reason.
- blocked -> paused: dependency cleared or timed out.

## Definition-of-Done gate (structural)

`done` requires: non-empty `completion_criteria` (defined at thread CREATION, never retroactively), ALL checked, plus a one-sentence closure statement. If any criterion is unchecked or the list is empty, the agent REFUSES `done` and returns the thread to its prior non-terminal state.

## Finish before you start (WIP)

If a non-terminal thread (`active`/`paused`/`blocked`) exists and the user starts unrelated new work, prompt to dispose of the existing thread (resume / pause / done / abandon) before opening a new one. Stop starting; start finishing.

## Staleness (prompt, never auto-close)

A SessionStart scan flags threads, and the agent surfaces them for disposition. It NEVER auto-closes:
- `active` (any age): an anomaly under the this-session-only semantic; prompt to dispose. Hard prompt once idle past 7 days.
- `paused` idle > 30 days: soft prompt to confirm it is still wanted.
- `blocked` idle > 90 days: confirm the blocker still holds.
The clock only raises the question; the human decides.

## Resume = present then STOP

On resume, never auto-select a thread by recency or last-modified time. Present the menu of resumable threads (or honor an explicit `/resume-project <slug>`), load only the chosen thread, present the Resumption Brief, and STOP. The brief is the synthesis-by-receiver step; auto-proceeding into the work is forbidden.

## Decision-time capture (the core duty)

When a decision is locked mid-session — an approval, a chosen approach, a rejected alternative that carries signal — write `decisions/YYYY-MM-DD-<slug>.md` IMMEDIATELY and add its one-line entry to PROJECT.md's Active Decisions index. Never reconstruct decisions at wrap-up; wrap-up catches stragglers only.

Decision records are write-once: after acceptance only the Status line may change (`accepted` -> `superseded-by: <filename>`). Reversals create a new record superseding the old. Superseded entries leave the PROJECT.md index; their files remain.

## Progressive-summary spine

Each thread file carries a fixed-field running summary (the spine): Status, Active Goal, Next Step, Open Risks, Key Decisions (links only), Out of Scope. At session close, merge the old spine with the latest session log into a refreshed spine. This keeps the resume budget viable whether a thread spans 2 sessions or 20.

Decisions are NEVER compressed: they live in append-only `decisions/*.md` sidecars, linked by filename, loaded on demand. A decision from session 3 is never summarized away by session 20.

Hierarchy (two-level epic/branch) is deferred until a project crosses ~15 threads; until then a flat thread list plus the spine is correct. Adopt hierarchy only with a deterministic active-leaf pointer, never fuzzy retrieval.

## Discipline

- Pointers, not payloads: ledger files carry paths, never file contents.
- Ledger claims are hints; verify against code and git before acting. On conflict, code wins — then fix the ledger.
- Caps are enforced at every write: over-cap content is demoted to the session log with a pointer retained. Nothing is deleted outright.
```

- [ ] **Step 3: Run the acceptance checks**

Run the Step 1 block.
Expected: all ten `ok-*` lines print.

---

### Task 2: Rewrite the resume-project skill (menu-first, kill recency, brief-then-STOP)

**Files:**
- Modify (full replace): `/Users/satanshumishra/.claude/skills/resume-project/SKILL.md`

**Interfaces:**
- Consumes: the lifecycle vocabulary and the "resume = present then STOP" rule from Task 1.
- Produces: the Resumption Brief template (consumed by Task 11's structural check) and the explicit-arg fast path that the new hand-off summary (Task 3) emits as `/resume-project <slug>`.

- [ ] **Step 1: Define the acceptance checks**

```bash
cd /Users/satanshumishra/.claude
F=skills/resume-project/SKILL.md
grep -q "RESUMPTION BRIEF" "$F" && echo ok-brief
grep -qi "Awaiting your instruction" "$F" && echo ok-await
grep -qi "never auto-select" "$F" && echo ok-norecency
! grep -qi "proceed with the Now section" "$F" && echo ok-no-autoproceed
! grep -qi "git branch --show-current" "$F" && echo ok-no-branchmatch
grep -qi "present a menu\|present the menu" "$F" && echo ok-menu
grep -qi "highest-sorting\|lexical sort" "$F" && echo ok-most-recent-defined
```

- [ ] **Step 2: Replace the file with the new content**

Write this exact content to `skills/resume-project/SKILL.md`:

```markdown
---
name: resume-project
description: Use when the user says "continue", "resume", "pick up where we left off", "/resume-project", or near-equivalents at the start of work in a project that has a .claude/ledger/ directory (or its global fallback under ~/.claude/projects/<slug>/ledger/). Presents a menu of resumable threads (or honors an explicit /resume-project <slug>), loads only the chosen thread plus its latest session log (<=3k tokens), verifies against code, presents a Resumption Brief, then STOPS for user instruction.
---

# Resume Project

Teach this session the cumulative project state from the ledger, cheaply, present a Resumption Brief, then STOP. Layout, lifecycle, and discipline: `~/.claude/rules/common/continuity-ledger.md`. The write side is the `session-handoff` skill.

A `UserPromptSubmit` hook injects the roster of resumable threads when it detects resume intent; use it if present, but this skill is the source of truth for the procedure.

## Read protocol

1. Locate the ledger: `<repo>/.claude/ledger/` first; else `~/.claude/projects/<project-slug>/ledger/`. Missing -> tell the user, offer to initialize via the session-handoff skill, stop.
2. Read PROJECT.md.
3. Select the thread DETERMINISTICALLY:
   - Explicit argument (`/resume-project <slug>`, or the user names a thread): use that thread. Skip the menu.
   - Otherwise: present a menu of every resumable thread (`status` active, paused, or blocked) with a one-line summary each (from the injected roster, else each thread's Next Step or Status), and STOP for the user to choose. NEVER auto-select by recency, last-modified time, or branch.
4. Read the chosen thread file and its most recent session log. "Most recent" is scoped WITHIN the chosen thread: the highest-sorting `sessions/YYYY-MM-DD-NN-<slug>.md` (lexical sort equals chronological because NN is zero-padded), cross-checked against the thread's Recent Sessions list. Session logs are NEVER used to select a thread. Read NOTHING else from the ledger now; decision records load on demand later, named by the PROJECT.md index line.
5. Verify before presenting:
   - `git log --oneline -5` (file mtimes for non-git) against the thread's `updated` date; flag work that happened after the last wrap-up.
   - Spot-check that the thread's Pointers exist on disk.
   - On divergence: code wins; note it in the brief, fix the ledger entry.
6. Present the Resumption Brief, then STOP:

        RESUMPTION BRIEF — <thread-slug>            state: paused -> (awaiting confirm)
        Priority:     <high | medium | low>
        Done so far:  <2-3 sentences: what shipped, current state of the work>
        Left off at:  <the precise stopping point>
        Next step(s): <the single first action, then any follow-ons>
        Open / risks: <blockers, open questions>
        — Awaiting your instruction. I will not proceed until you direct.

   Do NOT proceed to the next action. Do NOT offer "which path?" prompts. The brief gives the user what they need to instruct next; transition the thread paused -> active only after the brief is shown and the user directs.

## Hard rules

- Read budget: PROJECT.md + one thread file + one session log (<=3k tokens). Never bulk-read `decisions/` or `sessions/`.
- Never auto-select a thread by recency or last-modified time. Drift from this is the core failure this redesign fixes; always present the menu unless an explicit slug is given.
- Always STOP after the Resumption Brief; never auto-proceed into the work.
- Never act on remembered or invented state when a ledger exists; the ledger plus the code are the sources. The ledger is hints; the code is truth.
- If the user names a thread explicitly, skip the menu and use it.
```

- [ ] **Step 3: Run the acceptance checks**

Run the Step 1 block.
Expected: all seven `ok-*` lines print (the two `! grep` lines print `ok-no-autoproceed` and `ok-no-branchmatch` only when the forbidden phrases are absent).

---

### Task 3: Rewrite the session-handoff skill (auto-pause, DoD gate, WIP, spine merge, new templates + summary)

**Files:**
- Modify (full replace): `/Users/satanshumishra/.claude/skills/session-handoff/SKILL.md`

**Interfaces:**
- Consumes: the lifecycle, DoD gate, spine, and staleness rule from Task 1.
- Produces: the new `threads/<slug>.md` template (5-state frontmatter + `completion_criteria` + `next_step` + spine body) that the hooks parse (Tasks 6, 7) and that Task 4 applies to the live ledger; the new PROJECT.md Threads line format `<slug> — <state> — <one-line summary or "-">`; and the hand-off summary with the copy-paste `/resume-project <slug>` command.

- [ ] **Step 1: Define the acceptance checks**

```bash
cd /Users/satanshumishra/.claude
F=skills/session-handoff/SKILL.md
grep -q "SESSION HAND-OFF" "$F" && echo ok-summary
grep -q "/resume-project <slug>" "$F" && echo ok-resumecmd
grep -qi "active -> paused" "$F" && echo ok-autopause
grep -q "completion_criteria" "$F" && echo ok-criteria
grep -qi "DoD gate\|Definition-of-Done" "$F" && echo ok-dod
grep -q "## Next Step" "$F" && grep -q "## Out of Scope" "$F" && echo ok-spine
grep -qi "finish before you start\|WIP" "$F" && echo ok-wip
grep -q "active|paused|blocked|done|abandoned" "$F" && echo ok-5state
```

- [ ] **Step 2: Replace the file with the new content**

Write this exact content to `skills/session-handoff/SKILL.md`:

````markdown
---
name: session-handoff
description: Use when the user says "session handoff", "wrap up session", "hand off", "handoff summary", or confirms a wrap-up after the context nudge. Writes the project ledger (session log, straggler decision records, thread spine refresh with state transition, PROJECT.md index updates) so any fresh session resumes from files alone, then prints the hand-off chat summary.
---

# Session Handoff

Write the ledger. The files are canonical; the chat summary is a courtesy. The audience is a future session with zero context. Layout, lifecycle, and discipline: `~/.claude/rules/common/continuity-ledger.md`. The read side is the `resume-project` skill.

## Wrap-up protocol

1. Wind down: collect results from running subagents and background tasks or stop them cleanly. Never abandon a write mid-flight. Anything that must keep running goes in the session log's Running state with shell IDs and kill commands.
2. Locate or initialize the ledger.
   - Git project: `<repo>/.claude/ledger/`. Non-git project: `~/.claude/projects/<project-slug>/ledger/`.
   - If absent: create PROJECT.md from the template below plus empty `threads/`, `decisions/`, `sessions/` directories. Initialization is idempotent: never overwrite an existing file.
3. Append the session log `sessions/YYYY-MM-DD-NN-<thread-slug>.md` (NN: next free zero-padded number for that date and thread). Template below. Record what FAILED and why, not just what shipped.
4. Promote stragglers: any decision locked this session with no `decisions/` record gets one now. Decision-time capture during the session is the norm; this step is the safety net.
5. Refresh the thread spine and apply the state transition:
   - Merge the old spine with this session's log into the refreshed spine fields (Status, Active Goal, Next Step, Open Risks, Key Decisions [links only], Out of Scope). Keep the latest session pointer in Recent Sessions.
   - Apply the transition. The default at hand-off is `active -> paused`. A new thread is created with non-empty `completion_criteria` set up front. For `blocked` fill `blocked_by`; for `abandoned` fill `abandoned_reason`.
6. DoD gate (only when closing a thread `done`): `completion_criteria` must be non-empty, ALL checked, plus a one-sentence closure. If not, REFUSE `done`, leave the thread `paused` or `blocked`, and say why.
7. WIP check ("finish before you start"): if more than one thread is non-terminal (active/paused/blocked) and they are unrelated, surface it and recommend disposing of the stragglers. Never auto-close.
8. Touch PROJECT.md only if project-level facts changed: new decision index line, thread added or status changed, new constraint. Threads index line format: `<slug> — <state> — <one-line summary or "-">`.
9. Enforce caps: PROJECT.md 80 lines, thread files 80, decision records 20. Demote over-cap content into this session's log and keep a pointer in its place. Nothing is deleted outright.
10. Git projects: commit only the ledger files with message `chore: ledger handoff <thread-slug>`. The user's wrap-up confirmation is the consent for this commit. Non-git projects: write only.
11. Print the hand-off chat summary:

        SESSION HAND-OFF — <thread-slug>
        Shipped this session:  <the delta>
        Thread + state:        <slug> — active -> paused
        Handed off (next):     <the single next action>
        Resume command:        /resume-project <slug>
        Open / blockers:       <if any, else "none">
        Files written:         <ledger paths>
        Then: /clear

## Templates

PROJECT.md:

    # <project> — Project Ledger

    ## Goal
    <2-3 sentences>

    ## Constraints
    - <non-derivable constraint, one line each, or "none">

    ## Active Decisions
    - decisions/<filename> — <one-line summary>

    ## Threads
    - <slug> — <active|paused|blocked|done|abandoned> — <one-line summary or "-">

    ## Pointers
    - <repo-relative path> — <why it matters>

threads/<slug>.md:

    ---
    thread: <slug>
    status: <active|paused|blocked|done|abandoned>
    updated: <YYYY-MM-DD>
    priority: <high|medium|low>
    completion_criteria:
      - <criterion to satisfy before done>
    next_step: <single immediate next action>
    blocked_by: <dependency, only when status is blocked>
    abandoned_reason: <why, only when status is abandoned>
    branch: <git branch, informational only, or "-">
    ---

    ## Status
    <one line: where the work stands>

    ## Active Goal
    <one sentence>

    ## Next Step
    <single immediate next action>

    ## Open Risks
    - <risk or open question, or "none">

    ## Key Decisions
    - decisions/<filename> — <one-line summary>

    ## Out of Scope
    - <explicitly excluded, or "none">

    ## Pointers
    - <repo-relative path> — <plan, spec, key files>

    ## Recent Sessions
    - sessions/<filename>

decisions/YYYY-MM-DD-<slug>.md:

    Status: accepted
    Date: <YYYY-MM-DD>
    Thread: <slug or "-">

    ## Context
    <2-3 sentences>

    ## Decision
    <1-2 sentences>

    ## Consequences
    <1-3 lines; include rejected alternatives when they carry signal>

On supersession: change the old record's Status line to `superseded-by: <new filename>` and replace its PROJECT.md index line with the new record's line. No other edit to an accepted record, ever.

sessions/YYYY-MM-DD-NN-<thread-slug>.md:

    # Session <YYYY-MM-DD-NN> — <thread-slug>

    ## Where it started
    <1-2 sentences>

    ## What shipped
    - <change> — <where it lives>

    ## Tried and failed
    - <attempt> — <why> (or "none")

    ## Verification
    - `<command>` — <expected and observed>

    ## Running state
    - <shell IDs + kill commands, or "none">

    ## Deferred + open
    - <item, or "none">

    ## Pick up here
    <1-2 sentences>

## Hard rules

1. Never invent state. Empty section -> write "none", never omit.
2. Paths inside PROJECT.md and thread files are repo-relative (they travel with worktrees and clones); paths in session logs to things outside the repo are absolute.
3. No emojis, no hype, no retrospectives.
4. Review the FULL session before writing, not the last few turns.
5. Session logs are write-once; never edit a previous session's log.
6. Decision records follow the write-once rule from the continuity-ledger rule file.
7. The default transition is active -> paused; `done` requires the DoD gate; terminal states (done/abandoned) are write-once for the thread — reopening creates a new thread referencing the old.
````

- [ ] **Step 3: Run the acceptance checks**

Run the Step 1 block.
Expected: all eight `ok-*` lines print.

---

### Task 4: Reconcile the live ledger to the new model

**Files:**
- Modify: `/Users/satanshumishra/.claude/projects/-Users-satanshumishra--claude/ledger/PROJECT.md` (Threads index)
- Modify: `/Users/satanshumishra/.claude/projects/-Users-satanshumishra--claude/ledger/threads/vibesec-integration.md` (status frontmatter)

**Interfaces:**
- Consumes: the new Threads line format and 5-state vocabulary from Task 3.
- Produces: a live ledger whose index matches the files on disk and the new lifecycle, so the Phase 2 hooks behave correctly against it.

- [ ] **Step 1: Confirm the divergences before editing**

```bash
cd /Users/satanshumishra/.claude/projects/-Users-satanshumishra--claude/ledger
echo "=== indexed threads ==="; grep -A20 '## Threads' PROJECT.md | grep '^- '
echo "=== files on disk ==="; ls threads/
echo "=== vibesec status ==="; grep '^status:' threads/vibesec-integration.md
```
Expected: index lists `test-discipline` and `project-ledger` (no files on disk); `vibesec-integration` shows `status: active` (a zombie under the new this-session-only semantic, since it is not this session's work).

- [ ] **Step 2: Remove the two orphan index lines**

In PROJECT.md, delete exactly these two lines from the `## Threads` section:
```
- test-discipline — done — -
- project-ledger — done — -
```
Rationale: their thread files do not exist; a `done` thread with no file is noise. The decision records and session logs for that work remain on disk and in the Active Decisions index — only the dangling Threads entries go.

- [ ] **Step 3: Repoint vibesec-integration to paused and update its frontmatter date**

In `threads/vibesec-integration.md`, change the frontmatter line `status: active` to `status: paused`. Leave `updated:` as-is (do not backdate; its real idle age is what the staleness scan should see).

- [ ] **Step 4: Update the remaining Threads index lines to the new format**

Rewrite the surviving `## Threads` lines so the third field is a one-line summary instead of a branch dash. Set `vibesec-integration` to `paused` and keep `continuity-redesign` as `active` (it is this session's work until hand-off). Example target shape (summaries may be tightened to fit the 80-line cap):
```
## Threads
- agent-suite — done — 9-agent SDLC suite reworked
- parallel-two-lane — done — two-lane router engine
- model-tiering — done — quality-first model tiering
- graphify-integration — done — graphify always-on map
- vibesec-integration — paused — security-guidance integration
- research-config — done — researcher agent + research standard
- continuity-redesign — active — ledger/handoff/resume rework
```

- [ ] **Step 5: Verify the reconciliation**

```bash
cd /Users/satanshumishra/.claude/projects/-Users-satanshumishra--claude/ledger
! grep -q 'test-discipline' PROJECT.md && echo ok-no-testdiscipline
! grep -q 'project-ledger —' PROJECT.md && echo ok-no-projectledger
grep -q 'vibesec-integration — paused' PROJECT.md && echo ok-vibesec-paused
grep '^status:' threads/vibesec-integration.md | grep -q paused && echo ok-vibesec-file
for s in $(grep -A20 '## Threads' PROJECT.md | grep '^- ' | sed -E 's/^- ([a-z-]+) .*/\1/'); do
  [ -f "threads/$s.md" ] || echo "MISSING FILE: $s"
done
echo "index/file reconciliation done"
awk 'END{print NR" lines"}' PROJECT.md
```
Expected: `ok-no-testdiscipline`, `ok-no-projectledger`, `ok-vibesec-paused`, `ok-vibesec-file` all print; no `MISSING FILE` lines; PROJECT.md still <= 80 lines.

---

## Phase 2 — Determinism hooks

### Task 5: Shared ledger helper library + its test

**Files:**
- Create: `/Users/satanshumishra/.claude/hooks/lib/ledger-common.sh`
- Test: `/Users/satanshumishra/.claude/hooks/tests/ledger-common.test.sh`

**Interfaces:**
- Produces three sourced shell functions consumed by every hook in Tasks 6-9:
  - `ledger_locate "$cwd" "$transcript"` -> prints the ledger dir path, returns 0; returns 1 if none found.
  - `ledger_field "$file" "$key"` -> prints the trimmed scalar value of frontmatter `key:` (e.g. `status`, `thread`, `updated`, `next_step`, `priority`); empty if absent.
  - `ledger_section_line "$file" "## Header"` -> prints the first non-empty content line under a Markdown header, with a leading list marker stripped; empty if absent.

- [ ] **Step 1: Write the failing test**

Create `hooks/tests/ledger-common.test.sh`:

```bash
#!/usr/bin/env bash
set -u

HERE="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
. "$HERE/_assert.sh"
. "$HERE/../lib/ledger-common.sh"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/repo/.claude/ledger/threads"
printf '# x\n' > "$TMP/repo/.claude/ledger/PROJECT.md"
mkdir -p "$TMP/proj/ledger/threads"
printf '# y\n' > "$TMP/proj/ledger/PROJECT.md"
T="$TMP/proj/ledger/threads/demo.md"
cat > "$T" <<'EOF'
---
thread: demo
status: paused
updated: 2026-01-02
next_step: do the next thing
---

## Status
work is half done

## Next Step
do the next thing
EOF

loc1="$(ledger_locate "$TMP/repo" "")"
assert_contains "$loc1" "$TMP/repo/.claude/ledger" "repo-local ledger wins"

loc2="$(ledger_locate "$TMP/none" "$TMP/proj/ledger/sess.jsonl")"
assert_contains "$loc2" "$TMP/proj/ledger" "global fallback via transcript dir"

if ledger_locate "$TMP/none" "$TMP/none/x.jsonl" >/dev/null 2>&1; then
  printf 'FAIL - missing ledger should return non-zero\n'; ASSERT_FAILS=$((ASSERT_FAILS+1))
else
  printf 'ok   - missing ledger returns non-zero\n'
fi

assert_contains "$(ledger_field "$T" status)" "paused" "field status"
assert_contains "$(ledger_field "$T" thread)" "demo" "field thread"
assert_contains "$(ledger_field "$T" next_step)" "do the next thing" "field next_step"
assert_empty "$(ledger_field "$T" nonesuch)" "missing field empty"
assert_contains "$(ledger_section_line "$T" '## Status')" "work is half done" "section line"

finish
```

- [ ] **Step 2: Write the assert helper**

Create `hooks/tests/_assert.sh`:

```bash
#!/usr/bin/env bash
set -u
ASSERT_FAILS=0
assert_contains() {
  case "$1" in
    *"$2"*) printf 'ok   - %s\n' "$3" ;;
    *) printf 'FAIL - %s (missing: %s)\n' "$3" "$2"; ASSERT_FAILS=$((ASSERT_FAILS+1)) ;;
  esac
}
assert_empty() {
  if [ -z "$1" ]; then printf 'ok   - %s\n' "$2"; else printf 'FAIL - %s (expected empty, got: %s)\n' "$2" "$1"; ASSERT_FAILS=$((ASSERT_FAILS+1)); fi
}
assert_file_exists() {
  if [ -e "$1" ]; then printf 'ok   - %s\n' "$2"; else printf 'FAIL - %s (missing file: %s)\n' "$2" "$1"; ASSERT_FAILS=$((ASSERT_FAILS+1)); fi
}
assert_file_absent() {
  if [ ! -e "$1" ]; then printf 'ok   - %s\n' "$2"; else printf 'FAIL - %s (file should be gone: %s)\n' "$2" "$1"; ASSERT_FAILS=$((ASSERT_FAILS+1)); fi
}
finish() {
  if [ "$ASSERT_FAILS" -eq 0 ]; then printf 'PASS\n'; exit 0; else printf '%d assertion(s) failed\n' "$ASSERT_FAILS"; exit 1; fi
}
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `bash /Users/satanshumishra/.claude/hooks/tests/ledger-common.test.sh`
Expected: FAIL — `ledger-common.sh` does not exist yet, so sourcing it errors (non-zero exit).

- [ ] **Step 4: Write the library**

Create `hooks/lib/ledger-common.sh`:

```bash
#!/usr/bin/env bash
set -u

ledger_locate() {
  _cwd="$1"
  _transcript="$2"
  if [ -n "$_cwd" ] && [ -f "$_cwd/.claude/ledger/PROJECT.md" ]; then
    printf '%s' "$_cwd/.claude/ledger"
    return 0
  fi
  if [ -n "$_transcript" ]; then
    _proj="$(dirname "$_transcript")"
    if [ -f "$_proj/ledger/PROJECT.md" ]; then
      printf '%s' "$_proj/ledger"
      return 0
    fi
  fi
  return 1
}

ledger_field() {
  awk -v k="$2" '
    /^---[[:space:]]*$/ { fm = (fm ? 0 : 1); next }
    fm && index($0, k ":") == 1 {
      sub("^" k ":[[:space:]]*", "")
      gsub(/^[[:space:]]+|[[:space:]]+$/, "")
      print
      exit
    }
  ' "$1"
}

ledger_section_line() {
  awk -v h="$2" '
    $0 == h { found = 1; next }
    found && NF {
      gsub(/^[[:space:]]*[-*][[:space:]]*/, "")
      print
      exit
    }
  ' "$1"
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bash /Users/satanshumishra/.claude/hooks/tests/ledger-common.test.sh`
Expected: all `ok` lines, final line `PASS`, exit 0.

---

### Task 6: UserPromptSubmit roster injector + test

**Files:**
- Create: `/Users/satanshumishra/.claude/hooks/ledger-resume-roster.sh`
- Test: `/Users/satanshumishra/.claude/hooks/tests/ledger-resume-roster.test.sh`

**Interfaces:**
- Consumes: `ledger_locate`, `ledger_field`, `ledger_section_line` (Task 5).
- Reads stdin JSON `{prompt, cwd, transcript_path}`. On resume intent + a locatable ledger with resumable threads, emits `{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"..."}}`. Otherwise exits 0 silently.

- [ ] **Step 1: Write the failing test**

Create `hooks/tests/ledger-resume-roster.test.sh`:

```bash
#!/usr/bin/env bash
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
. "$HERE/_assert.sh"
HOOK="$HERE/../ledger-resume-roster.sh"

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
L="$TMP/proj/ledger"; mkdir -p "$L/threads"
printf '# p\n' > "$L/PROJECT.md"
cat > "$L/threads/alpha.md" <<'EOF'
---
thread: alpha
status: paused
updated: 2026-02-01
next_step: finish alpha
---
## Status
midway
EOF
cat > "$L/threads/beta.md" <<'EOF'
---
thread: beta
status: done
updated: 2026-02-01
next_step: nothing
---
## Status
closed
EOF
TP="$L/sess.jsonl"

mkjson() { printf '{"prompt":"%s","cwd":"/nope","transcript_path":"%s"}' "$1" "$TP"; }

out_resume="$(mkjson 'continue' | bash "$HOOK")"
assert_contains "$out_resume" "alpha" "resume intent lists paused thread"
case "$out_resume" in *beta*) printf 'FAIL - done thread must not appear\n'; ASSERT_FAILS=$((ASSERT_FAILS+1));; *) printf 'ok   - done thread excluded\n';; esac
assert_contains "$out_resume" "UserPromptSubmit" "emits correct hookEventName"

out_noise="$(mkjson 'please refactor the parser' | bash "$HOOK")"
assert_empty "$out_noise" "non-resume prompt is silent"

out_noledger="$(printf '{"prompt":"resume","cwd":"/nope","transcript_path":"/nope/x.jsonl"}' | bash "$HOOK")"
assert_empty "$out_noledger" "no ledger is silent"

finish
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bash /Users/satanshumishra/.claude/hooks/tests/ledger-resume-roster.test.sh`
Expected: FAIL — hook file does not exist (`bash: ... No such file`), assertions fail.

- [ ] **Step 3: Write the hook**

Create `hooks/ledger-resume-roster.sh`:

```bash
#!/usr/bin/env bash
set -u

input="$(cat)" || exit 0
command -v jq >/dev/null 2>&1 || exit 0

prompt="$(printf '%s' "$input" | jq -r '.prompt // empty' 2>/dev/null)"
[ -n "$prompt" ] || exit 0
cwd="$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null)"
transcript="$(printf '%s' "$input" | jq -r '.transcript_path // empty' 2>/dev/null)"

lc="$(printf '%s' "$prompt" | tr '[:upper:]' '[:lower:]' | sed -E 's/^[[:space:]]+//')"
intent=0
case "$lc" in
  continue|resume) intent=1 ;;
  continue\ *|resume\ *) intent=1 ;;
  /resume-project*) intent=1 ;;
  *"pick up where"*|"pick up the"*|"pick up "*) intent=1 ;;
esac
[ "$intent" -eq 1 ] || exit 0

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
. "$HOOK_DIR/lib/ledger-common.sh" 2>/dev/null || exit 0

ledger="$(ledger_locate "$cwd" "$transcript")" || exit 0
[ -d "$ledger/threads" ] || exit 0

roster=""
for f in "$ledger"/threads/*.md; do
  [ -e "$f" ] || continue
  status="$(ledger_field "$f" status)"
  case "$status" in
    active|paused|blocked) : ;;
    *) continue ;;
  esac
  slug="$(ledger_field "$f" thread)"
  [ -n "$slug" ] || slug="$(basename "$f" .md)"
  summary="$(ledger_field "$f" next_step)"
  [ -n "$summary" ] || summary="$(ledger_section_line "$f" "## Next Step")"
  [ -n "$summary" ] || summary="$(ledger_section_line "$f" "## Active Goal")"
  [ -n "$summary" ] || summary="$(ledger_section_line "$f" "## Objective")"
  [ -n "$summary" ] || summary="(no summary)"
  roster="${roster}- ${slug} [${status}] — ${summary}
"
done

[ -n "$roster" ] || exit 0

msg="Resume intent detected. Resumable ledger threads:
${roster}
Use the resume-project skill: if the user named a thread (/resume-project <slug>), load that one; otherwise present this list as a menu and STOP for the user to choose. Load only the chosen thread plus its latest session log, present the Resumption Brief, then STOP. Never auto-select by recency."

jq -cn --arg ctx "$msg" '{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":$ctx}}'
exit 0
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bash /Users/satanshumishra/.claude/hooks/tests/ledger-resume-roster.test.sh`
Expected: all `ok` lines, `PASS`, exit 0.

- [ ] **Step 5: Make the hook executable**

Run: `chmod +x /Users/satanshumishra/.claude/hooks/ledger-resume-roster.sh`
Expected: no output, exit 0.

---

### Task 7: SessionStart staleness scan + test

**Files:**
- Create: `/Users/satanshumishra/.claude/hooks/ledger-staleness-scan.sh`
- Test: `/Users/satanshumishra/.claude/hooks/tests/ledger-staleness-scan.test.sh`

**Interfaces:**
- Consumes: `ledger_locate`, `ledger_field` (Task 5).
- Reads stdin JSON `{source, cwd, transcript_path}`. Runs only for `source` in {startup, resume, clear}. Honors env `LEDGER_NOW_EPOCH` for deterministic testing (falls back to `date -u +%s`). Flags `active` (any age, hard past 7d), `paused` >30d, `blocked` >90d; emits a SessionStart additionalContext disposition prompt or exits 0 silently.

- [ ] **Step 1: Write the failing test**

Create `hooks/tests/ledger-staleness-scan.test.sh`:

```bash
#!/usr/bin/env bash
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
. "$HERE/_assert.sh"
HOOK="$HERE/../ledger-staleness-scan.sh"

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
L="$TMP/proj/ledger"; mkdir -p "$L/threads"
printf '# p\n' > "$L/PROJECT.md"
TP="$L/sess.jsonl"
NOW=1750000000

mkthread() { cat > "$L/threads/$1.md" <<EOF
---
thread: $1
status: $2
updated: $3
---
## Status
x
EOF
}
mkthread zombie active 2026-06-20
mkthread fresh paused 2026-06-19
mkthread oldpause paused 2026-01-01
mkthread freshblock blocked 2026-06-01
mkthread oldblock blocked 2025-12-01

run() { printf '{"source":"%s","cwd":"/nope","transcript_path":"%s"}' "$1" "$TP" | LEDGER_NOW_EPOCH="$NOW" bash "$HOOK"; }

out="$(run startup)"
assert_contains "$out" "zombie" "active thread flagged"
assert_contains "$out" "oldpause" "paused >30d flagged"
assert_contains "$out" "oldblock" "blocked >90d flagged"
case "$out" in *fresh*) :;; esac
case "$out" in *"- fresh"*|*"fresh:"*) printf 'FAIL - fresh paused must not flag\n'; ASSERT_FAILS=$((ASSERT_FAILS+1));; *) printf 'ok   - fresh paused not flagged\n';; esac
case "$out" in *freshblock*) printf 'FAIL - fresh blocked must not flag\n'; ASSERT_FAILS=$((ASSERT_FAILS+1));; *) printf 'ok   - fresh blocked not flagged\n';; esac
assert_contains "$out" "SessionStart" "emits SessionStart hookEventName"

out_compact="$(run compact)"
assert_empty "$out_compact" "compact source is silent (other hook handles it)"

finish
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bash /Users/satanshumishra/.claude/hooks/tests/ledger-staleness-scan.test.sh`
Expected: FAIL — hook file does not exist.

- [ ] **Step 3: Write the hook**

Create `hooks/ledger-staleness-scan.sh`:

```bash
#!/usr/bin/env bash
set -u

input="$(cat)" || exit 0
command -v jq >/dev/null 2>&1 || exit 0

source_val="$(printf '%s' "$input" | jq -r '.source // empty' 2>/dev/null)"
case "$source_val" in
  startup|resume|clear) : ;;
  *) exit 0 ;;
esac

cwd="$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null)"
transcript="$(printf '%s' "$input" | jq -r '.transcript_path // empty' 2>/dev/null)"

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
. "$HOOK_DIR/lib/ledger-common.sh" 2>/dev/null || exit 0

ledger="$(ledger_locate "$cwd" "$transcript")" || exit 0
[ -d "$ledger/threads" ] || exit 0

now_epoch="${LEDGER_NOW_EPOCH:-$(date -u +%s)}"

to_epoch() {
  _e="$(date -j -f "%Y-%m-%d" "$1" +%s 2>/dev/null)" || _e=""
  [ -n "$_e" ] || _e="$(date -d "$1" +%s 2>/dev/null)" || _e=""
  printf '%s' "$_e"
}

flags=""
for f in "$ledger"/threads/*.md; do
  [ -e "$f" ] || continue
  status="$(ledger_field "$f" status)"
  updated="$(ledger_field "$f" updated)"
  slug="$(ledger_field "$f" thread)"
  [ -n "$slug" ] || slug="$(basename "$f" .md)"
  upd_epoch="$(to_epoch "$updated")"
  days=""
  if [ -n "$upd_epoch" ]; then
    days=$(( (now_epoch - upd_epoch) / 86400 ))
  fi
  case "$status" in
    active)
      if [ -n "$days" ] && [ "$days" -gt 7 ]; then
        flags="${flags}- ${slug}: ACTIVE and idle ${days}d — active means this-session-only, so this is a zombie. Dispose: resume / pause / done / abandon.
"
      else
        flags="${flags}- ${slug}: ACTIVE at session start — active means this-session-only, likely a crashed session. Dispose: resume / pause / done / abandon.
"
      fi
      ;;
    paused)
      if [ -n "$days" ] && [ "$days" -gt 30 ]; then
        flags="${flags}- ${slug}: paused, idle ${days}d (>30) — confirm it is still wanted, or close it.
"
      fi
      ;;
    blocked)
      if [ -n "$days" ] && [ "$days" -gt 90 ]; then
        flags="${flags}- ${slug}: blocked, idle ${days}d (>90) — confirm the blocker still holds.
"
      fi
      ;;
  esac
done

[ -n "$flags" ] || exit 0

msg="Ledger staleness scan flagged threads needing disposition (never auto-closed):
${flags}
Surface these to the user and ask how to dispose each. Do not act on them silently."

jq -cn --arg ctx "$msg" '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":$ctx}}'
exit 0
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bash /Users/satanshumishra/.claude/hooks/tests/ledger-staleness-scan.test.sh`
Expected: all `ok` lines, `PASS`, exit 0.

- [ ] **Step 5: Make the hook executable**

Run: `chmod +x /Users/satanshumishra/.claude/hooks/ledger-staleness-scan.sh`
Expected: no output, exit 0.

---

### Task 8: PreCompact sentinel writer + test

**Files:**
- Create: `/Users/satanshumishra/.claude/hooks/ledger-precompact-checkpoint.sh`
- Test: `/Users/satanshumishra/.claude/hooks/tests/ledger-precompact-checkpoint.test.sh`

**Interfaces:**
- Consumes: `ledger_locate`, `ledger_field` (Task 5).
- Reads stdin JSON `{session_id, cwd, transcript_path, trigger}`. Writes `<ledger>/.compact-sentinel-<session_id>.json` containing `{session_id, thread_slug, transcript_path, trigger, ts}` where `thread_slug` is the single `active` thread or `-`. Never blocks compaction (always exit 0, no decision). The sentinel is consumed by Task 9.

- [ ] **Step 1: Write the failing test**

Create `hooks/tests/ledger-precompact-checkpoint.test.sh`:

```bash
#!/usr/bin/env bash
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
. "$HERE/_assert.sh"
HOOK="$HERE/../ledger-precompact-checkpoint.sh"

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
L="$TMP/proj/ledger"; mkdir -p "$L/threads"
printf '# p\n' > "$L/PROJECT.md"
TP="$L/sess.jsonl"
cat > "$L/threads/cur.md" <<'EOF'
---
thread: cur
status: active
updated: 2026-06-20
---
## Status
working
EOF

printf '{"session_id":"S1","cwd":"/nope","transcript_path":"%s","trigger":"auto"}' "$TP" | bash "$HOOK"
SENT="$L/.compact-sentinel-S1.json"
assert_file_exists "$SENT" "sentinel written"
assert_contains "$(jq -r '.thread_slug' "$SENT")" "cur" "sentinel captures active thread"
assert_contains "$(jq -r '.trigger' "$SENT")" "auto" "sentinel captures trigger"
assert_contains "$(jq -r '.session_id' "$SENT")" "S1" "sentinel captures session id"

finish
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bash /Users/satanshumishra/.claude/hooks/tests/ledger-precompact-checkpoint.test.sh`
Expected: FAIL — hook file does not exist.

- [ ] **Step 3: Write the hook**

Create `hooks/ledger-precompact-checkpoint.sh`:

```bash
#!/usr/bin/env bash
set -u

input="$(cat)" || exit 0
command -v jq >/dev/null 2>&1 || exit 0

session_id="$(printf '%s' "$input" | jq -r '.session_id // empty' 2>/dev/null)"
[ -n "$session_id" ] || exit 0
cwd="$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null)"
transcript="$(printf '%s' "$input" | jq -r '.transcript_path // empty' 2>/dev/null)"
trigger="$(printf '%s' "$input" | jq -r '.trigger // empty' 2>/dev/null)"

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
. "$HOOK_DIR/lib/ledger-common.sh" 2>/dev/null || exit 0

ledger="$(ledger_locate "$cwd" "$transcript")" || exit 0

thread_slug="-"
if [ -d "$ledger/threads" ]; then
  for f in "$ledger"/threads/*.md; do
    [ -e "$f" ] || continue
    if [ "$(ledger_field "$f" status)" = "active" ]; then
      thread_slug="$(ledger_field "$f" thread)"
      [ -n "$thread_slug" ] || thread_slug="$(basename "$f" .md)"
      break
    fi
  done
fi

sentinel="$ledger/.compact-sentinel-${session_id}.json"
ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
jq -cn \
  --arg sid "$session_id" \
  --arg slug "$thread_slug" \
  --arg tp "$transcript" \
  --arg tr "$trigger" \
  --arg ts "$ts" \
  '{session_id:$sid, thread_slug:$slug, transcript_path:$tp, trigger:$tr, ts:$ts}' \
  > "$sentinel" 2>/dev/null

exit 0
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bash /Users/satanshumishra/.claude/hooks/tests/ledger-precompact-checkpoint.test.sh`
Expected: all `ok` lines, `PASS`, exit 0.

- [ ] **Step 5: Make the hook executable**

Run: `chmod +x /Users/satanshumishra/.claude/hooks/ledger-precompact-checkpoint.sh`
Expected: no output, exit 0.

---

### Task 9: SessionStart compact re-injector + test

**Files:**
- Create: `/Users/satanshumishra/.claude/hooks/ledger-compact-checkpoint.sh`
- Test: `/Users/satanshumishra/.claude/hooks/tests/ledger-compact-checkpoint.test.sh`

**Interfaces:**
- Consumes: `ledger_locate` (Task 5) and the sentinel written by Task 8.
- Reads stdin JSON `{source, session_id, cwd, transcript_path}`. Runs only for `source == "compact"`. Reads `<ledger>/.compact-sentinel-<session_id>.json`, emits a SessionStart additionalContext instructing a ledger checkpoint write, then DELETES the sentinel (consume-once). Also reaps sentinels older than 1 day. Absent sentinel -> exit 0 silently.

- [ ] **Step 1: Write the failing test**

Create `hooks/tests/ledger-compact-checkpoint.test.sh`:

```bash
#!/usr/bin/env bash
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
. "$HERE/_assert.sh"
HOOK="$HERE/../ledger-compact-checkpoint.sh"

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
L="$TMP/proj/ledger"; mkdir -p "$L/threads"
printf '# p\n' > "$L/PROJECT.md"
TP="$L/sess.jsonl"
SENT="$L/.compact-sentinel-S1.json"
printf '{"session_id":"S1","thread_slug":"cur","transcript_path":"%s","trigger":"auto","ts":"2026-06-20T00:00:00Z"}' "$TP" > "$SENT"

out="$(printf '{"source":"compact","session_id":"S1","cwd":"/nope","transcript_path":"%s"}' "$TP" | bash "$HOOK")"
assert_contains "$out" "compacted" "re-injection mentions compaction"
assert_contains "$out" "cur" "re-injection names the thread"
assert_contains "$out" "checkpoint" "re-injection instructs a checkpoint"
assert_contains "$out" "SessionStart" "emits SessionStart hookEventName"
assert_file_absent "$SENT" "sentinel deleted after consumption"

out_nostart="$(printf '{"source":"startup","session_id":"S1","cwd":"/nope","transcript_path":"%s"}' "$TP" | bash "$HOOK")"
assert_empty "$out_nostart" "non-compact source is silent"

out_nosent="$(printf '{"source":"compact","session_id":"NOPE","cwd":"/nope","transcript_path":"%s"}' "$TP" | bash "$HOOK")"
assert_empty "$out_nosent" "absent sentinel is silent"

finish
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bash /Users/satanshumishra/.claude/hooks/tests/ledger-compact-checkpoint.test.sh`
Expected: FAIL — hook file does not exist.

- [ ] **Step 3: Write the hook**

Create `hooks/ledger-compact-checkpoint.sh`:

```bash
#!/usr/bin/env bash
set -u

input="$(cat)" || exit 0
command -v jq >/dev/null 2>&1 || exit 0

source_val="$(printf '%s' "$input" | jq -r '.source // empty' 2>/dev/null)"
[ "$source_val" = "compact" ] || exit 0

session_id="$(printf '%s' "$input" | jq -r '.session_id // empty' 2>/dev/null)"
[ -n "$session_id" ] || exit 0
cwd="$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null)"
transcript="$(printf '%s' "$input" | jq -r '.transcript_path // empty' 2>/dev/null)"

HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
. "$HOOK_DIR/lib/ledger-common.sh" 2>/dev/null || exit 0

ledger="$(ledger_locate "$cwd" "$transcript")" || exit 0

find "$ledger" -maxdepth 1 -name '.compact-sentinel-*.json' -mmin +1440 -delete 2>/dev/null

sentinel="$ledger/.compact-sentinel-${session_id}.json"
[ -r "$sentinel" ] || exit 0

slug="$(jq -r '.thread_slug // "-"' "$sentinel" 2>/dev/null)"
tp="$(jq -r '.transcript_path // ""' "$sentinel" 2>/dev/null)"
trig="$(jq -r '.trigger // ""' "$sentinel" 2>/dev/null)"
rm -f "$sentinel" 2>/dev/null

msg="Context was just compacted (trigger: ${trig}) for thread ${slug}. The pre-compaction narrative is at ${tp}. The in-context narrative was compressed — write a ledger checkpoint NOW before continuing: append a session log entry and refresh the thread's running-summary spine (use the session-handoff skill, session-log + spine-refresh steps only; do not /clear and do not auto-pause). Then continue the work."

jq -cn --arg ctx "$msg" '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":$ctx}}'
exit 0
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bash /Users/satanshumishra/.claude/hooks/tests/ledger-compact-checkpoint.test.sh`
Expected: all `ok` lines, `PASS`, exit 0.

- [ ] **Step 5: Make the hook executable**

Run: `chmod +x /Users/satanshumishra/.claude/hooks/ledger-compact-checkpoint.sh`
Expected: no output, exit 0.

---

### Task 10: Wire the hooks into settings.json

**Files:**
- Modify: `/Users/satanshumishra/.claude/settings.json`

**Interfaces:**
- Consumes: the five scripts from Tasks 5-9 (the lib is sourced, not registered).
- Produces: a `UserPromptSubmit` event, two added `SessionStart` hooks, and a `PreCompact` event — all at user level.

- [ ] **Step 1: Snapshot current validity**

Run: `jq -e '.hooks | keys' /Users/satanshumishra/.claude/settings.json`
Expected: prints `["Notification","PostToolUse","PreToolUse","SessionStart","Stop"]` (order may vary) and exit 0 — confirms valid JSON before editing.

- [ ] **Step 2: Add the UserPromptSubmit event**

Inside the top-level `"hooks"` object, add this key (sibling of `Stop`, `SessionStart`, etc.):

```json
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "/Users/satanshumishra/.claude/hooks/ledger-resume-roster.sh",
            "timeout": 10
          }
        ]
      }
    ],
```

- [ ] **Step 3: Add the two staleness/compact hooks to the existing SessionStart array**

In the existing `"SessionStart"` -> `[0]` -> `"hooks"` array, append these two objects AFTER the `graphify-provision.sh` entry:

```json
          {
            "type": "command",
            "command": "/Users/satanshumishra/.claude/hooks/ledger-staleness-scan.sh",
            "timeout": 10
          },
          {
            "type": "command",
            "command": "/Users/satanshumishra/.claude/hooks/ledger-compact-checkpoint.sh",
            "timeout": 10
          }
```

- [ ] **Step 4: Add the PreCompact event**

Inside the top-level `"hooks"` object, add this key:

```json
    "PreCompact": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "/Users/satanshumishra/.claude/hooks/ledger-precompact-checkpoint.sh",
            "timeout": 10
          }
        ]
      }
    ],
```

- [ ] **Step 5: Validate the edited settings.json**

```bash
cd /Users/satanshumishra/.claude
jq -e . settings.json >/dev/null && echo ok-valid-json
jq -e '.hooks.UserPromptSubmit[0].hooks[0].command' settings.json | grep -q ledger-resume-roster && echo ok-roster
jq -e '.hooks.PreCompact[0].hooks[0].command' settings.json | grep -q ledger-precompact && echo ok-precompact
jq -r '.hooks.SessionStart[0].hooks[].command' settings.json | grep -q ledger-staleness-scan && echo ok-staleness
jq -r '.hooks.SessionStart[0].hooks[].command' settings.json | grep -q ledger-compact-checkpoint && echo ok-compact-reinject
jq -e '.model' settings.json | grep -q 'opus-4-8' && echo ok-model-untouched
jq -e '.includeCoAuthoredBy == false' settings.json && echo ok-attribution-untouched
```
Expected: `ok-valid-json`, `ok-roster`, `ok-precompact`, `ok-staleness`, `ok-compact-reinject`, `ok-model-untouched`, `ok-attribution-untouched` all print.

---

## Phase 3 — Integration verification

### Task 11: End-to-end dry run + real-ledger read-only smoke

**Files:**
- Create (throwaway, under the scratchpad): a fixture ledger and a runner script. Nothing under `~/.claude` is mutated by this task except read-only reads of the real ledger.

**Interfaces:**
- Consumes: every artifact from Tasks 1-10.
- Produces: proof that the full chain works — handoff-shaped thread -> roster -> staleness -> precompact sentinel -> compact re-injection+delete -> resume brief-then-STOP prose is in place — plus a real-ledger smoke that the hooks are silent/correct against live data.

- [ ] **Step 1: Run every hook unit test together**

```bash
cd /Users/satanshumishra/.claude/hooks/tests
fail=0
for t in ledger-common ledger-resume-roster ledger-staleness-scan ledger-precompact-checkpoint ledger-compact-checkpoint; do
  printf '\n== %s ==\n' "$t"
  bash "$t.test.sh" || fail=1
done
[ "$fail" -eq 0 ] && echo "ALL HOOK TESTS PASS" || echo "SOME HOOK TESTS FAILED"
```
Expected: each test prints `PASS`; final line `ALL HOOK TESTS PASS`.

- [ ] **Step 2: Run all Phase 1 prose acceptance checks together**

```bash
cd /Users/satanshumishra/.claude
echo "== rule =="; bash -c '
F=rules/common/continuity-ledger.md
grep -qi "this session" "$F" && grep -q abandoned "$F" && grep -qi "DoD\|Definition-of-Done" "$F" \
 && grep -q completion_criteria "$F" && grep -qi "never auto-close" "$F" \
 && grep -qi "progressive-summary spine\|running summary" "$F" && grep -qi "never compressed" "$F" \
 && echo ok-rule || echo FAIL-rule'
echo "== resume =="; bash -c '
F=skills/resume-project/SKILL.md
grep -q "RESUMPTION BRIEF" "$F" && grep -qi "never auto-select" "$F" \
 && ! grep -qi "proceed with the Now section" "$F" && ! grep -qi "git branch --show-current" "$F" \
 && echo ok-resume || echo FAIL-resume'
echo "== handoff =="; bash -c '
F=skills/session-handoff/SKILL.md
grep -q "SESSION HAND-OFF" "$F" && grep -q "/resume-project <slug>" "$F" \
 && grep -qi "active -> paused" "$F" && grep -q completion_criteria "$F" \
 && grep -q "## Out of Scope" "$F" && echo ok-handoff || echo FAIL-handoff'
```
Expected: `ok-rule`, `ok-resume`, `ok-handoff`.

- [ ] **Step 3: Full-chain fixture run**

```bash
SP="$(mktemp -d)"
H=/Users/satanshumishra/.claude/hooks
L="$SP/proj/ledger"; mkdir -p "$L/threads" "$L/sessions"
printf '# fixture — Project Ledger\n\n## Threads\n- work — active — do the thing\n' > "$L/PROJECT.md"
TP="$L/sess.jsonl"; : > "$TP"
cat > "$L/threads/work.md" <<'EOF'
---
thread: work
status: active
updated: 2026-06-20
priority: high
next_step: wire the last hook
---
## Status
mid-flight
## Next Step
wire the last hook
EOF

echo "1) roster on 'continue':"
printf '{"prompt":"continue","cwd":"/nope","transcript_path":"%s"}' "$TP" | bash "$H/ledger-resume-roster.sh" | jq -r '.hookSpecificOutput.additionalContext' | head -4

echo "2) staleness on startup (active = anomaly):"
printf '{"source":"startup","cwd":"/nope","transcript_path":"%s"}' "$TP" | LEDGER_NOW_EPOCH=1750000000 bash "$H/ledger-staleness-scan.sh" | jq -r '.hookSpecificOutput.additionalContext' | head -3

echo "3) precompact writes sentinel:"
printf '{"session_id":"FX","cwd":"/nope","transcript_path":"%s","trigger":"auto"}' "$TP" | bash "$H/ledger-precompact-checkpoint.sh"
ls -1 "$L"/.compact-sentinel-FX.json && echo "   sentinel present"

echo "4) compact re-injects then deletes sentinel:"
printf '{"source":"compact","session_id":"FX","cwd":"/nope","transcript_path":"%s"}' "$TP" | bash "$H/ledger-compact-checkpoint.sh" | jq -r '.hookSpecificOutput.additionalContext' | head -2
[ -e "$L"/.compact-sentinel-FX.json ] && echo "   ERROR sentinel still present" || echo "   sentinel consumed"

rm -rf "$SP"
```
Expected, in order: (1) roster lists `work [active]`; (2) staleness flags `work` as an active-at-startup anomaly; (3) `sentinel present`; (4) re-injection text mentions compaction + a checkpoint, then `sentinel consumed`.

- [ ] **Step 4: Real-ledger read-only smoke**

```bash
H=/Users/satanshumishra/.claude/hooks
RL=/Users/satanshumishra/.claude/projects/-Users-satanshumishra--claude/ledger
TP="$RL/realsmoke.jsonl"

echo "roster against the real ledger (read-only):"
printf '{"prompt":"resume","cwd":"/nope","transcript_path":"%s"}' "$TP" | bash "$H/ledger-resume-roster.sh" | jq -r '.hookSpecificOutput.additionalContext' | head -8

echo "staleness against the real ledger at real time (read-only):"
printf '{"source":"startup","cwd":"/nope","transcript_path":"%s"}' "$TP" | bash "$H/ledger-staleness-scan.sh" | jq -r '.hookSpecificOutput.additionalContext // "（silent — nothing stale）"' | head -8

echo "confirm no sentinel was created in the real ledger:"
ls -1 "$RL"/.compact-sentinel-*.json 2>/dev/null && echo "ERROR stray sentinel" || echo "ok-no-sentinel"
```
Expected: roster lists the real resumable threads (`vibesec-integration [paused]`, `continuity-redesign [active]`, and any others non-terminal); staleness either lists genuinely stale/active threads or prints the silent marker; `ok-no-sentinel`. Note: the `transcript_path` points at a non-existent file inside the real ledger dir, so `dirname` resolves to the real ledger — this exercises location without writing anything.

- [ ] **Step 5: Confirm the suite is repeatable and self-cleaning**

Re-run Step 1 and Step 3.
Expected: identical results both times (tests use `mktemp -d` and `trap ... EXIT`; no state leaks between runs).

---

## Self-Review

**Spec coverage (against decisions/2026-06-25-continuity-redesign-direction.md + the brief):**
- Fork 1 (menu-fallback, explicit-arg, no worktrees): Task 2 (menu-first resume, recency killed, branch-match removed) + Task 6 (roster injector). Covered.
- Fork 2 (active=this-session, auto-pause, 5-state, DoD gate, WIP): Task 1 (rule) + Task 3 (handoff auto-pause/DoD/WIP/template) + Task 7 (staleness) + Task 4 (live reconciliation). Covered.
- Fork 3 (progressive-summary spine + decisions sidecar now, hierarchy deferred): Task 1 (rule spine/decisions/defer) + Task 3 (spine body + merge step). Covered.
- Fork 4 (full hook set + skill rewrites + resume brief-then-STOP + hand-off copy-paste cmd): Tasks 2, 3, 6, 7, 8, 9, 10. Covered.
- Bonus findings: PreCompact checkpoint (Tasks 8+9); orphan index reconciliation (Task 4). Covered.

**Placeholder scan:** No `TBD`/`TODO`/"add error handling"/"similar to Task N". Every hook and every rewritten file is given in full; every verification is a runnable command with an expected result.

**Type/name consistency:** Sentinel path `<ledger>/.compact-sentinel-<session_id>.json` is identical in Task 8 (writer) and Task 9 (reader). Library function names (`ledger_locate`, `ledger_field`, `ledger_section_line`) are defined in Task 5 and called with the same arity in Tasks 6-9. Spine section headers (`## Status`, `## Active Goal`, `## Next Step`, `## Open Risks`, `## Key Decisions`, `## Out of Scope`, `## Pointers`, `## Recent Sessions`) match between the Task 3 template and the Task 6 roster fallbacks. The `LEDGER_NOW_EPOCH` test override is defined in Task 7's hook and used by Task 7's test and Task 11's fixture run. `hookEventName` strings match the doc-confirmed values (`UserPromptSubmit`, `SessionStart`; PreCompact emits no additionalContext).

**Out-of-scope guard:** No worktree/`cwd` binding and no hierarchy/active-leaf pointer appear in any task — consistent with the locked decision.

---

## Execution Handoff

Per the delegation-discipline rule (main thread is a pure orchestrator), execution runs through subagents regardless of mode. Note that edits in Tasks 1, 5-10 touch `rules/`, `hooks/`, and `settings.json`, so each write will surface the `protect-claude-config.sh` approval prompt for the user to accept.
