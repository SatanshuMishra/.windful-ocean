# Continuity Ledger

Per-project continuity: each session teaches the next the cumulative project state. The live implementation is the `logbook` plugin. Write side: the `logbook:debrief` skill. Read side: the `logbook:preflight` skill. Both skills only orchestrate the plugin's `ledger` MCP tools — the server owns the load-bearing rules (lifecycle, Definition-of-Done, caps, validation) and refuses an illegal write rather than trusting the caller.

## Location and layout

- The ledger is written by the plugin's MCP server, never by hand. It lives under the plugin's per-project data directory, which the server resolves from `CLAUDE_PLUGIN_DATA` plus a key derived from the project path — NOT in the repository working tree. Writes into that store through Write/Edit/MultiEdit/NotebookEdit are denied by the plugin's PreToolUse guard.
- Git projects: a `ledger-worktree/` checkout of a dedicated git ref (default backend `orphan-branch`, default branch `_ledger`, both overridable through the plugin's user config), pushed to `origin`. Non-git projects: a plain `ledger/` directory in the same per-project data directory.
- Inside either: `threads/<ULID>.json` (the thread record, spine included), `decisions/<NNNN>-<slug>.md`, `sessions/<ULID>/<timestamp>--<label>.md`, `bindings/<ULID>.json`. `index/` is derived, gitignored, and rebuilt by `rebuild_index`.
- The plugin data root carries one directory per install source, so a stale sibling store can answer with a plausible near-complete ledger instead of an obvious nothing. Resolve the store from the running server, and prefer `get_resume_brief` / `read_decision` over reading files.

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

`done` requires: at least one un-struck entry in `completion_criteria`, EVERY un-struck entry marked done, plus a non-empty closure statement. Criteria are set at thread creation (`open_thread` requires at least one) and afterwards change only through `amend_criteria`, which needs a resolving decision reference to insert, rewrite or strike one; a struck criterion is retained, never deleted. The server evaluates this gate inside `transition_thread` and REFUSES the move when it fails — the thread never leaves its current state, and the refusal is surfaced to the user rather than worked around.

## Finish before you start (WIP)

If a non-terminal thread (`active`/`paused`/`blocked`) exists and the user starts unrelated new work, prompt to dispose of the existing thread (resume / pause / done / abandon) before opening a new one. Stop starting; start finishing.

## Staleness (prompt, never auto-close)

Nothing in the plugin measures thread age: the SessionStart roster carries status, slug, progress, title, next step and id, and no scan flags a stale thread. These thresholds are therefore a duty on the agent, which reads the ages itself and surfaces threads for disposition. Nothing here EVER auto-closes:
- `active` (any age): an anomaly under the this-session-only semantic; prompt to dispose. Hard prompt once idle past 7 days.
- `paused` idle > 30 days: soft prompt to confirm it is still wanted.
- `blocked` idle > 90 days: confirm the blocker still holds.
The clock only raises the question; the human decides.

## Resume = present then STOP

On resume, never auto-select a thread by recency, by last-modified time, or by branch. Present the menu of resumable threads (the `active`, `paused` and `blocked` ones), or honor an explicit `/logbook:preflight <slug>`; then load only the chosen thread, present the Resumption Brief, and STOP. The brief is the synthesis-by-receiver step; auto-proceeding into the work is forbidden.

## Decision-time capture (the core duty)

When a decision is locked mid-session — an approval, a chosen approach, a rejected alternative that carries signal — call `record_decision` IMMEDIATELY. The server allocates the next four-digit number, writes `decisions/<NNNN>-<slug>.md` as a MADR record carrying `Status: accepted` and a `Thread-Id`, and links it into the thread spine's `key_decisions` under a scope defaulting to the current criterion. Never reconstruct decisions at wrap-up; wrap-up catches stragglers only.

Decision records are write-once, and structurally so: no tool amends a recorded decision, and direct edits into the ledger store are denied. A reversal is a NEW record whose text supersedes the old; the superseded record's file and number remain. The number sequence is project-wide, not per-thread, so gaps in what one thread references are normal — cite records by bare number.

## Progressive-summary spine

Each thread record carries a fixed-field running summary (the spine), and the schema requires all six: `active_goal`, `next_step`, `last_session`, `open_risks`, `key_decisions` (links only), `out_of_scope`. `status` is a sibling field on the thread, not part of the spine. At session close, merge the old spine with the latest session log into a refreshed spine through `update_thread`. This keeps the resume budget viable whether a thread spans 2 sessions or 20, and it is what populates the roster's next step and the resume brief.

Decisions are NEVER compressed: they live in append-only `decisions/*.md` sidecars, referenced by their four-digit number and read on demand through `read_decision`. A decision from session 3 is never summarized away by session 20.

Hierarchy (two-level epic/branch) is deferred until a project crosses ~15 threads; until then a flat thread list plus the spine is correct. Adopt hierarchy only with a deterministic active-leaf pointer, never fuzzy retrieval.

## Discipline

- Pointers, not payloads: ledger files carry paths, never file contents.
- Ledger claims are hints; verify against code and git before acting. On conflict, code wins — then fix the ledger.
- Spine caps are enforced at every write by REFUSAL, not truncation: the server rejects the whole call with the offending field, its limit and a remedy, and nothing is written. Shorten the value and re-send, or move the detail into the session log and keep a pointer. Nothing is silently dropped.
