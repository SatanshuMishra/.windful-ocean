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

## Mid-session checkpoint

A distinct, lighter mode, NOT the full hand-off. Invoked mid-session when context was just compacted (the `ledger-compact-checkpoint` hook requests it) to durably capture what compaction would otherwise lose. Do ONLY these, then keep working:
1. Append the session log `sessions/YYYY-MM-DD-NN-<thread-slug>.md` (protocol step 3).
2. Refresh the thread spine fields by merging the old spine with this session's log (protocol step 5's merge), keeping the latest session pointer in Recent Sessions.

No state transition: the thread STAYS `active`. No DoD gate, no chat hand-off summary, and no `/clear`. The full hand-off (`active -> paused` plus the chat summary) remains a separate, later action.

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
