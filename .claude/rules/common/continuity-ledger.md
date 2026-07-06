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
- blocked -> active: via the Resumption Brief, when the blocker is now being addressed (never silent).
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
