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

        RESUMPTION BRIEF — <thread-slug>            state: <current-state> -> active (awaiting confirm)
        Priority:     <high | medium | low>
        Done so far:  <2-3 sentences: what shipped, current state of the work>
        Left off at:  <the precise stopping point>
        Next step(s): <the single first action, then any follow-ons>
        Open / risks: <blockers, open questions>
        — Awaiting your instruction. I will not proceed until you direct.

   Do NOT proceed to the next action. Do NOT offer "which path?" prompts. The brief gives the user what they need to instruct next; transition the thread to active (from its current state, paused or blocked) only after the brief is shown and the user directs.

## Hard rules

- Read budget: PROJECT.md + one thread file + one session log (<=3k tokens). Never bulk-read `decisions/` or `sessions/`.
- Never auto-select a thread by recency or last-modified time. Drift from this is the core failure this redesign fixes; always present the menu unless an explicit slug is given.
- Always STOP after the Resumption Brief; never auto-proceed into the work.
- Never act on remembered or invented state when a ledger exists; the ledger plus the code are the sources. The ledger is hints; the code is truth.
- If the user names a thread explicitly, skip the menu and use it.
