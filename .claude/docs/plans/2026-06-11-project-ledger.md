# Project Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the three-layer project ledger (cumulative cross-session continuity), the rewritten session-handoff and new resume-project skills, and the two-tier context wrap-up nudge hook.

**Architecture:** All changes live in `~/.claude` (global config). One new rule file, one skill rewritten in place, one new skill, one new hook script registered in settings.json. Two throwaway fixtures in /tmp validate the hook's threshold logic and the full ledger write/merge/resume cycle.

**Tech Stack:** Markdown rule/skill files, bash + jq for the hook, git worktrees in the fixture.

**Execution constraints for this plan:**
- `~/.claude` is NOT a git repository. No git commands there; each task's verification step is the gate. Fixtures in /tmp MAY use git.
- The PreToolUse hook `protect-claude-config.sh` returns permission "ask" for Edit/Write under `~/.claude` rule/skill/settings paths — expected; the human approves each one.
- Global rule: never write code comments. The hook script must contain ZERO comment lines other than the line-1 shebang. Markdown prose in rule/skill documents is fine.
- Spec: `~/.claude/docs/superpowers/specs/2026-06-11-project-ledger-design.md`
- Task dependencies: Tasks 1-5 touch disjoint files and may run in parallel. Task 6 requires Task 4. Task 7 requires Tasks 1-3.

---

### Task 1: Create the continuity-ledger rule

**Files:**
- Create: `/Users/satanshumishra/.claude/rules/common/continuity-ledger.md`

- [x] **Step 1: Create the file with exactly this content**

```markdown
# Continuity Ledger

Per-project, file-based continuity: each session teaches the next the cumulative project state. Write side: the `session-handoff` skill. Read side: the `resume-project` skill.

## Location and layout

- Git projects: `<repo>/.claude/ledger/`, committed. Non-git projects: `~/.claude/projects/<project-slug>/ledger/`.
- `PROJECT.md` (stable core, cap 80 lines), `threads/<slug>.md` (one per line of work, cap 80 lines), `decisions/YYYY-MM-DD-<slug>.md` (append-only, cap 20 lines), `sessions/YYYY-MM-DD-NN-<thread-slug>.md` (append-only).

## Decision-time capture (the core duty)

When a decision is locked mid-session in a ledgered project — an approval, a chosen approach, a rejected alternative that carries signal — write `decisions/YYYY-MM-DD-<slug>.md` IMMEDIATELY and add its one-line entry to PROJECT.md's Active Decisions index. Never reconstruct decisions at wrap-up; wrap-up catches stragglers only.

Decision records are write-once: after acceptance only the Status line may change (`accepted` -> `superseded-by: <filename>`). Reversals create a new record superseding the old. Superseded entries leave the PROJECT.md index; their files remain.

## Resume duty

On "continue", "resume", or near-equivalents in a ledgered project: read PROJECT.md and the matching thread file BEFORE acting (use the `resume-project` skill). Never act on a ledgered project's ongoing work from conversation memory alone.

## Discipline

- Pointers, not payloads: ledger files carry paths, never file contents.
- Ledger claims are hints; verify against code and git before acting. On conflict, code wins — then fix the ledger.
- Caps are enforced at every write: over-cap content is demoted to the session log with a pointer retained. Nothing is deleted outright.
```

- [x] **Step 2: Verify size and key duties present**

Run: `wc -l < /Users/satanshumishra/.claude/rules/common/continuity-ledger.md`
Expected: a number <= 40

Run: `grep -c "IMMEDIATELY\|resume-project\|session-handoff\|code wins" /Users/satanshumishra/.claude/rules/common/continuity-ledger.md`
Expected: >= 4

---

### Task 2: Rewrite the session-handoff skill

**Files:**
- Rewrite: `/Users/satanshumishra/.claude/skills/session-handoff/SKILL.md`

- [x] **Step 1: Read the current file** (required before overwrite)

- [x] **Step 2: Replace the entire file content with exactly this**

```markdown
---
name: session-handoff
description: Use when the user says "session handoff", "wrap up session", "hand off", "handoff summary", or confirms a wrap-up after the context nudge. Writes the project ledger (session log, straggler decision records, thread rewrite, PROJECT.md index updates) so any fresh session resumes from files alone, then prints a 5-line chat summary.
---

# Session Handoff

Write the ledger. The files are canonical; the chat summary is a courtesy. The audience is a future session with zero context. Layout and discipline: `~/.claude/rules/common/continuity-ledger.md`. The read side is the `resume-project` skill.

## Wrap-up protocol

1. Wind down: collect results from running subagents and background tasks or stop them cleanly. Never abandon a write mid-flight. Anything that must keep running goes in the session log's Running state with shell IDs and kill commands.
2. Locate or initialize the ledger.
   - Git project: `<repo>/.claude/ledger/`. Non-git project: `~/.claude/projects/<project-slug>/ledger/`.
   - If absent: create PROJECT.md from the template below plus empty `threads/`, `decisions/`, `sessions/` directories. Initialization is idempotent: never overwrite an existing file.
3. Append the session log `sessions/YYYY-MM-DD-NN-<thread-slug>.md` (NN: next free zero-padded number for that date and thread). Template below. Record what FAILED and why, not just what shipped.
4. Promote stragglers: any decision locked this session that has no `decisions/` record gets one now. Decision-time capture during the session is the norm; this step is the safety net.
5. Rewrite `threads/<thread-slug>.md` from the template: position, single immediate next action, open questions, last 2-3 session log paths, updated date. Touch PROJECT.md only if project-level facts changed: new decision index line, thread added or status changed, new constraint.
6. Enforce caps: PROJECT.md 80 lines, thread files 80, decision records 20. Demote over-cap content into this session's log and keep a pointer in its place. Nothing is deleted outright.
7. Git projects: commit only the ledger files with message `chore: ledger handoff <thread-slug>`. The user's wrap-up confirmation is the consent for this commit. Non-git projects: write only.
8. Print a 5-line chat summary: thread, position, next action, files written, suggestion to `/clear`.

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
    - <slug> — <active|paused|done> — <branch or "-">

    ## Pointers
    - <repo-relative path> — <why it matters>

threads/<slug>.md:

    ---
    thread: <slug>
    branch: <branch or "-">
    status: active
    updated: <YYYY-MM-DD>
    ---

    ## Objective
    <1-2 sentences>

    ## Now
    - Position: <where the work stands>
    - Next: <single immediate next action>

    ## Open Questions
    - <item, or "none">

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
```

- [x] **Step 3: Verify the latent bugs are dead and the new protocol is in**

Run: `grep -n "nateh\|TodoWrite\|chat-only\|Chat output only" /Users/satanshumishra/.claude/skills/session-handoff/SKILL.md; echo "exit: $?"`
Expected: no matches, `exit: 1`

Run: `grep -c "^## " /Users/satanshumishra/.claude/skills/session-handoff/SKILL.md`
Expected: `3` (Wrap-up protocol, Templates, Hard rules)

Run: `head -4 /Users/satanshumishra/.claude/skills/session-handoff/SKILL.md`
Expected: `---`, `name: session-handoff`, `description:` line containing "Writes the project ledger"

---

### Task 3: Create the resume-project skill

**Files:**
- Create: `/Users/satanshumishra/.claude/skills/resume-project/SKILL.md`

- [x] **Step 1: Create the file with exactly this content**

```markdown
---
name: resume-project
description: Use when the user says "continue", "resume", "pick up where we left off", "/resume-project", or near-equivalents at the start of work in a project that has a .claude/ledger/ directory (or its global fallback under ~/.claude/projects/<slug>/ledger/). Reads PROJECT.md plus the branch-matched thread and its latest session log (<=3k tokens), verifies against code, states position, then continues the work.
---

# Resume Project

Teach this session the cumulative project state from the ledger, cheaply, then continue. Layout and discipline: `~/.claude/rules/common/continuity-ledger.md`. The write side is the `session-handoff` skill.

## Read protocol

1. Locate the ledger: `<repo>/.claude/ledger/` first; else `~/.claude/projects/<project-slug>/ledger/`. Missing -> tell the user, offer to initialize via the session-handoff skill, stop.
2. Read PROJECT.md.
3. Match the thread: run `git branch --show-current`; compare against each `threads/*.md` frontmatter `branch` field, considering only `status: active` threads.
   - Exactly one match: proceed with it.
   - Zero or multiple matches, or a non-git project: print the Threads index from PROJECT.md and ask the user one question (which thread).
4. Read the matched thread file and its most recent session log. Read NOTHING else from the ledger now. Decision records load on demand later, only when the task touches them — the PROJECT.md index line names the file to read.
5. Verify before acting:
   - `git log --oneline -5` (file mtimes for non-git) against the thread's `updated` date; flag work that happened after the last wrap-up.
   - Spot-check that the thread's Pointers exist on disk.
   - On divergence: code wins; state the divergence, fix the ledger entry, then continue.
6. State position in one short paragraph (thread, position, next action), then proceed with the Now section's next action.

## Hard rules

- Read budget: PROJECT.md + one thread file + one session log (<=3k tokens). Never bulk-read `decisions/` or `sessions/`.
- Never act on remembered or invented state when a ledger exists; the ledger plus the code are the sources.
- The ledger is hints; the code is truth.
- If the user names a thread explicitly ("continue billing"), skip branch matching and use it.
```

- [x] **Step 2: Verify frontmatter and budget rule**

Run: `head -4 /Users/satanshumishra/.claude/skills/resume-project/SKILL.md`
Expected: `---`, `name: resume-project`, `description:` line starting with "Use when the user says \"continue\""

Run: `grep -c "3k tokens\|Never bulk-read\|code is truth" /Users/satanshumishra/.claude/skills/resume-project/SKILL.md`
Expected: >= 3

---

### Task 4: Create the context wrap-up nudge hook

**Files:**
- Create: `/Users/satanshumishra/.claude/hooks/context-wrapup-nudge.sh` (executable)

- [x] **Step 1: Create the file with exactly this content**

```bash
#!/usr/bin/env bash
set -u
NUDGE_PCT=70
URGENT_PCT=80
SENTINEL_PCT=50

input=$(cat) || exit 0
command -v jq >/dev/null 2>&1 || exit 0

session_id=$(printf '%s' "$input" | jq -r '.session_id // empty' 2>/dev/null)
[ -n "$session_id" ] || exit 0

used_pct=$(printf '%s' "$input" | jq -r '.context_window.used_percentage // empty' 2>/dev/null)

if [ -z "$used_pct" ]; then
  transcript=$(printf '%s' "$input" | jq -r '.transcript_path // empty' 2>/dev/null)
  { [ -n "$transcript" ] && [ -r "$transcript" ]; } || exit 0
  window=$(printf '%s' "$input" | jq -r '.context_window.context_window_size // empty' 2>/dev/null)
  case "$window" in (''|*[!0-9]*) window=200000;; esac
  tokens=$(tail -n 200 "$transcript" | jq -rR 'fromjson? | select(.type=="assistant") | select(.isSidechain != true) | .message.usage | select(. != null) | ((.input_tokens // 0) + (.cache_creation_input_tokens // 0) + (.cache_read_input_tokens // 0))' 2>/dev/null | tail -n 1)
  [ -n "$tokens" ] || exit 0
  case "$tokens" in (*[!0-9]*) exit 0;; esac
  used_pct=$(( tokens * 100 / window ))
fi

used_int=${used_pct%%.*}
case "$used_int" in (''|*[!0-9]*) exit 0;; esac

if [ "$used_int" -ge "$SENTINEL_PCT" ]; then
  run_dir="$HOME/.claude/run"
  mkdir -p "$run_dir" 2>/dev/null || exit 0
  printf '{"used_pct": %s, "ts": "%s"}\n' "$used_int" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$run_dir/context-sentinel-$session_id.json" 2>/dev/null
  find "$run_dir" -name 'context-sentinel-*.json' -mmin +1440 -delete 2>/dev/null
fi

marker="/tmp/claude-ledger-nudge-$session_id"
fired=0
[ -r "$marker" ] && fired=$(cat "$marker" 2>/dev/null)
case "$fired" in (''|*[!0-9]*) fired=0;; esac

msg=""
if [ "$used_int" -ge "$URGENT_PCT" ] && [ "$fired" -lt "$URGENT_PCT" ]; then
  msg="Context usage is at ${used_int}% — past the urgent threshold. Recommend immediate wrap-up: wind down running agents and tasks cleanly, then offer the user a session handoff now (session-handoff skill). The user may decline and continue."
  printf '%s' "$URGENT_PCT" > "$marker" 2>/dev/null
elif [ "$used_int" -ge "$NUDGE_PCT" ] && [ "$fired" -lt "$NUDGE_PCT" ]; then
  msg="Context usage is at ${used_int}%. Wind down running agents and tasks cleanly, then recommend a session handoff to the user (they may decline and continue without one). Once confirmed, use the session-handoff skill."
  printf '%s' "$NUDGE_PCT" > "$marker" 2>/dev/null
fi

[ -n "$msg" ] || exit 0
jq -cn --arg ctx "$msg" '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":$ctx}}'
exit 0
```

- [x] **Step 2: Make it executable and syntax-check**

Run: `chmod +x /Users/satanshumishra/.claude/hooks/context-wrapup-nudge.sh && bash -n /Users/satanshumishra/.claude/hooks/context-wrapup-nudge.sh && echo SYNTAX_OK`
Expected: `SYNTAX_OK`

- [x] **Step 3: Verify the no-comments rule**

Run: `grep -cn '^[[:space:]]*#' /Users/satanshumishra/.claude/hooks/context-wrapup-nudge.sh`
Expected: `1` (the shebang only)

- [x] **Step 4: Smoke-test fail-silent behavior**

Run: `printf 'garbage' | /Users/satanshumishra/.claude/hooks/context-wrapup-nudge.sh; echo "exit: $?"`
Expected: no output, `exit: 0`

---

### Task 5: Register the hook in settings.json

**Files:**
- Modify: `/Users/satanshumishra/.claude/settings.json` (hooks.PostToolUse)

- [x] **Step 1: Read the current file**

- [x] **Step 2: Apply exactly this edit**

Old string:
```
          {
            "type": "command",
            "command": "/Users/satanshumishra/.claude/hooks/ui-ux-audit-on-edit.sh",
            "timeout": 5
          }
        ]
      }
    ]
  },
```

New string:
```
          {
            "type": "command",
            "command": "/Users/satanshumishra/.claude/hooks/ui-ux-audit-on-edit.sh",
            "timeout": 5
          }
        ]
      },
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "/Users/satanshumishra/.claude/hooks/context-wrapup-nudge.sh",
            "timeout": 10
          }
        ]
      }
    ]
  },
```

- [x] **Step 3: Verify JSON validity and registration**

Run: `jq -r '.hooks.PostToolUse | length' /Users/satanshumishra/.claude/settings.json`
Expected: `2`

Run: `jq -r '.hooks.PostToolUse[1].hooks[0].command' /Users/satanshumishra/.claude/settings.json`
Expected: `/Users/satanshumishra/.claude/hooks/context-wrapup-nudge.sh`

---

### Task 6: Hook fixture validation

**Files:**
- Create (throwaway): `/tmp/nudge-fixture.sh`, `/tmp/ledger-fixture-transcript.jsonl`

Requires: Task 4 complete.

- [x] **Step 1: Write the fixture script with exactly this content**

```bash
#!/usr/bin/env bash
HOOK=/Users/satanshumishra/.claude/hooks/context-wrapup-nudge.sh
SID="fixture-$$"
fail=0
run() { printf '%s' "$1" | "$HOOK"; }

out=$(run "{\"session_id\":\"$SID-a\",\"context_window\":{\"used_percentage\":45}}")
{ [ -z "$out" ] && [ ! -f "$HOME/.claude/run/context-sentinel-$SID-a.json" ]; } && echo "case1 PASS" || { echo "case1 FAIL: $out"; fail=1; }

out=$(run "{\"session_id\":\"$SID-b\",\"context_window\":{\"used_percentage\":69}}")
{ [ -z "$out" ] && [ -f "$HOME/.claude/run/context-sentinel-$SID-b.json" ]; } && echo "case2 PASS" || { echo "case2 FAIL: $out"; fail=1; }

out=$(run "{\"session_id\":\"$SID-c\",\"context_window\":{\"used_percentage\":71}}")
printf '%s' "$out" | grep -q "session handoff" && echo "case3 PASS" || { echo "case3 FAIL: $out"; fail=1; }

out=$(run "{\"session_id\":\"$SID-c\",\"context_window\":{\"used_percentage\":76}}")
[ -z "$out" ] && echo "case4 PASS" || { echo "case4 FAIL: $out"; fail=1; }

out=$(run "{\"session_id\":\"$SID-c\",\"context_window\":{\"used_percentage\":81}}")
printf '%s' "$out" | grep -q "immediate wrap-up" && echo "case5 PASS" || { echo "case5 FAIL: $out"; fail=1; }

out=$(run "{\"session_id\":\"$SID-c\",\"context_window\":{\"used_percentage\":81}}")
[ -z "$out" ] && echo "case6 PASS" || { echo "case6 FAIL: $out"; fail=1; }

t=/tmp/ledger-fixture-transcript.jsonl
printf '%s\n' 'not json' '{"type":"assistant","message":{"usage":{"input_tokens":100000,"cache_creation_input_tokens":20000,"cache_read_input_tokens":24000}}}' > "$t"
out=$(run "{\"session_id\":\"$SID-d\",\"transcript_path\":\"$t\"}")
printf '%s' "$out" | grep -q "session handoff" && echo "case7 PASS" || { echo "case7 FAIL: $out"; fail=1; }

out=$(run "{\"session_id\":\"$SID-e\",\"transcript_path\":\"/tmp/does-not-exist.jsonl\"}")
[ -z "$out" ] && echo "case8 PASS" || { echo "case8 FAIL: $out"; fail=1; }

out=$(printf 'garbage' | "$HOOK"); rc=$?
{ [ "$rc" -eq 0 ] && [ -z "$out" ]; } && echo "case9 PASS" || { echo "case9 FAIL"; fail=1; }

sentinel=$(cat "$HOME/.claude/run/context-sentinel-$SID-c.json" 2>/dev/null)
printf '%s' "$sentinel" | jq -e '.used_pct == 81 and (.ts | length) > 0' >/dev/null 2>&1 && echo "case10 PASS" || { echo "case10 FAIL: $sentinel"; fail=1; }

rm -f /tmp/claude-ledger-nudge-$SID-* "$HOME/.claude/run/context-sentinel-$SID-"*.json "$t"
[ "$fail" -eq 0 ] && echo ALL_PASS
```

- [x] **Step 2: Run it**

Run: `chmod +x /tmp/nudge-fixture.sh && /tmp/nudge-fixture.sh`
Expected: `case1 PASS` through `case10 PASS`, then `ALL_PASS`. Case 7 verifies the transcript-fallback path: 144000/200000 = 72% -> advisory fires despite the leading malformed line.

- [x] **Step 3: If any case fails**

Fix the hook script (Task 4's file), not the fixture expectations — unless the fixture itself contradicts the spec, in which case report the divergence. Re-run until ALL_PASS.

- [x] **Step 4: Clean up**

Run: `rm -f /tmp/nudge-fixture.sh && echo CLEANED`
Expected: `CLEANED`

- [x] **Step 5: Live-input probe (report only, no gate)**

Run: `ls "$HOME/.claude/run/" 2>/dev/null | head -5`
Report whether a real sentinel for the current session exists yet (it appears once a live session crosses 50% with the hook registered). If none exists, report "live input shape unverified; transcript-fallback path is fixture-proven" — do not instrument the hook to capture live input.

---

### Task 7: Ledger write/merge/resume fixture validation

**Files:**
- Create (throwaway): `/tmp/ledger-fixture/` (git repo + two worktrees)

Requires: Tasks 1-3 complete. This task validates the skills' WRITTEN protocols by acting as them; divergences are skill-text bugs to fix in Task 2/3's files.

- [x] **Step 1: Create the repo and initialize the ledger on main (acting as session-handoff step 2)**

```bash
mkdir -p /tmp/ledger-fixture && cd /tmp/ledger-fixture
git init -q -b main
echo "fixture" > README.md
mkdir -p .claude/ledger/threads .claude/ledger/decisions .claude/ledger/sessions
cat > .claude/ledger/PROJECT.md <<'EOF'
# ledger-fixture — Project Ledger

## Goal
Throwaway fixture proving the ledger write, merge, and resume protocols.

## Constraints
- none

## Active Decisions
- none

## Threads
- none

## Pointers
- README.md — fixture marker
EOF
git add -A && git commit -qm "chore: ledger init" && echo INIT_OK
```
Expected: `INIT_OK`

- [x] **Step 2: Create two worktrees**

```bash
cd /tmp/ledger-fixture
git worktree add -q -b feat/billing-events /tmp/ledger-fixture-billing
git worktree add -q -b feat/auth-rbac /tmp/ledger-fixture-rbac
echo WT_OK
```
Expected: `WT_OK`

- [x] **Step 3: Session A wrap-up in the billing worktree (acting as the skill, steps 3-7)**

In `/tmp/ledger-fixture-billing/.claude/ledger/`: write `decisions/2026-06-11-event-sourcing.md` (Status accepted, Thread billing-events, Context/Decision/Consequences filled per template), `sessions/2026-06-11-01-billing-events.md` (all seven template sections, including a real "Tried and failed" line), `threads/billing-events.md` (frontmatter branch `feat/billing-events`, status active, Now position "tasks 1-4 done", Next "webhook retries"). Update PROJECT.md: decision index line replaces `- none` under Active Decisions; `- billing-events — active — feat/billing-events` replaces `- none` under Threads. Then:

```bash
cd /tmp/ledger-fixture-billing && git add .claude/ledger && git commit -qm "chore: ledger handoff billing-events" && echo HANDOFF_A_OK
```
Expected: `HANDOFF_A_OK`

- [x] **Step 4: Supersession in the billing worktree**

Write `decisions/2026-06-11-event-sourcing-v2.md` (accepted; Consequences names what changed). Edit ONLY the Status line of `decisions/2026-06-11-event-sourcing.md` to `Status: superseded-by: 2026-06-11-event-sourcing-v2.md`. Replace the old index line in PROJECT.md with the new one. Commit `chore: ledger supersession` -> expect success.

Verify: `grep -c "event-sourcing" /tmp/ledger-fixture-billing/.claude/ledger/PROJECT.md` -> `1` (only the v2 line) and both decision files exist.

- [x] **Step 5: Session B wrap-up in the rbac worktree**

Same as Step 3 with thread `auth-rbac`, branch `feat/auth-rbac`, its own decision `decisions/2026-06-11-deny-case-tests.md`, session log `sessions/2026-06-11-01-auth-rbac.md`, thread file. Commit `chore: ledger handoff auth-rbac` -> `HANDOFF_B_OK`.

- [x] **Step 6: Merge both branches into main**

```bash
cd /tmp/ledger-fixture
git merge -q feat/billing-events -m "merge billing" && echo MERGE_A_CLEAN
git merge feat/auth-rbac -m "merge rbac" || echo CONFLICT_AS_EXPECTED
git status --porcelain | grep -c "^UU\|^AA"
```
Expected: `MERGE_A_CLEAN`; the second merge either succeeds clean or conflicts ONLY in `.claude/ledger/PROJECT.md` (count <= 1, path is PROJECT.md). If conflicted: resolve by keeping both decision index lines and both thread lines, `git add` + `git commit`. Any conflict in `threads/`, `decisions/`, or `sessions/` files is a DESIGN FAILURE — stop and report.

Post-merge verify:
```bash
ls /tmp/ledger-fixture/.claude/ledger/decisions | wc -l
ls /tmp/ledger-fixture/.claude/ledger/threads | wc -l
ls /tmp/ledger-fixture/.claude/ledger/sessions | wc -l
```
Expected: `3`, `2`, `2`

- [x] **Step 7: Resume protocol in the rbac worktree (acting as resume-project)**

Before merging or after — use the rbac worktree, which still sits on `feat/auth-rbac`:
1. `git -C /tmp/ledger-fixture-rbac branch --show-current` -> `feat/auth-rbac`; exactly one thread frontmatter matches -> `threads/auth-rbac.md`. Confirm `threads/billing-events.md` is NOT read.
2. Read budget check: `wc -c /tmp/ledger-fixture-rbac/.claude/ledger/PROJECT.md /tmp/ledger-fixture-rbac/.claude/ledger/threads/auth-rbac.md /tmp/ledger-fixture-rbac/.claude/ledger/sessions/2026-06-11-01-auth-rbac.md | tail -1` -> total bytes < 12000 (~3k tokens).
3. Divergence check: `rm` one file named in the thread's Pointers, re-walk protocol step 5 -> the missing pointer is flagged (report the flag text), ledger entry corrected, work would continue. Restore not needed (fixture).

- [x] **Step 8: Caps check on every generated file**

```bash
find /tmp/ledger-fixture/.claude/ledger -name '*.md' -exec wc -l {} +
```
Expected: PROJECT.md <= 80, each thread <= 80, each decision <= 20.

- [x] **Step 9: Report divergences**

If acting out the protocols required improvisation the SKILL.md texts do not cover, fix the skill text (Task 2/3 files — permission "ask" expected) and report exactly what changed and why. Then:

```bash
git -C /tmp/ledger-fixture worktree remove --force /tmp/ledger-fixture-billing
git -C /tmp/ledger-fixture worktree remove --force /tmp/ledger-fixture-rbac
rm -rf /tmp/ledger-fixture && echo CLEANED
```
Expected: `CLEANED`

---

## Final verification (after all tasks)

1. `ls /Users/satanshumishra/.claude/rules/common/continuity-ledger.md /Users/satanshumishra/.claude/skills/session-handoff/SKILL.md /Users/satanshumishra/.claude/skills/resume-project/SKILL.md /Users/satanshumishra/.claude/hooks/context-wrapup-nudge.sh` -> all four exist.
2. `grep -rn "nateh\|TodoWrite" /Users/satanshumishra/.claude/skills/session-handoff/ /Users/satanshumishra/.claude/skills/resume-project/; echo "exit: $?"` -> exit 1.
3. `jq -r '.hooks.PostToolUse[1].hooks[0].command' /Users/satanshumishra/.claude/settings.json` -> the nudge hook path.
4. `grep -c '^[[:space:]]*#' /Users/satanshumishra/.claude/hooks/context-wrapup-nudge.sh` -> `1`.
5. `wc -l < /Users/satanshumishra/.claude/rules/common/continuity-ledger.md` -> <= 40.
6. New session smoke check (human): `/resume-project` and `session-handoff` appear in the skills list; after a session crosses 70%, the advisory nudge appears exactly once.
