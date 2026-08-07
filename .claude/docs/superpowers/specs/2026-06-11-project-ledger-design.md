# Project Ledger — Design Spec

Date: 2026-06-11
Status: Approved design, pending user spec review
Sub-project: 2 of 4 (Testing -> Context -> Parallelization -> Code Quality)

## Context

The original concern (2026-06-11 audit): no context-usage detection and no handoff automation. During brainstorming the problem was reframed by the user: the KEY weakness of the current `session-handoff` skill is lack of continuity ACROSS handoffs. Each handoff summarizes one session; decisions made several handoffs ago are silently lost unless actively re-carried. The goal is to teach each fresh session the cumulative project state — work done, decisions made, position in plan — token-efficiently (far below the 15-20% of context that makes a fresh session pointless). Automation for session pickup was explicitly rejected as brittle (PID-matching hybrid considered and discarded); manual starts are acceptable. File-based, robust, reliable, secure, efficient.

Latent bugs found in the existing skill (`~/.claude/skills/session-handoff/SKILL.md`): it references `C:\Users\nateh\.claude\plans\` (a Windows path from the original author) and TodoWrite (superseded by the Task tools). Both die in the rewrite.

## Research basis (condensed; full citations in session research)

- Anthropic's multi-session pattern: progress log + feature checklist created once, read at every session start, written back at session end; "ASSUME INTERRUPTION" write discipline — [Memory tool docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool), [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents).
- Token-efficiency mechanism: index always loaded, detail on demand — Claude Code's own MEMORY.md loads only its first 200 lines/25KB — [How Claude remembers your project](https://code.claude.com/docs/en/memory); lightweight identifiers over payloads — [Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents).
- Decision survival standard: ADRs — one decision per record, immutable once accepted, superseded by a new record linking back, one-line-per-record index — [Nygard 2011](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions), [adr-tools](https://github.com/npryce/adr-tools), [AWS Prescriptive Guidance](https://docs.aws.amazon.com/prescriptive-guidance/latest/architectural-decision-records/adr-process.html), [ThoughtWorks Radar (Adopt)](https://www.thoughtworks.com/radar/techniques/lightweight-architecture-decision-records). Colocate with code in version control.
- Curated tiny core + append-only long tail is the convergent architecture: MemGPT core/archival paging — [arXiv:2310.08560](https://arxiv.org/abs/2310.08560); Manus recitation (constantly rewritten plan file) and restorable compression (drop bodies, keep paths) — [Manus blog](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus); compress history into "key details, events, and decisions" because "actions carry implicit decisions" — [Cognition](https://cognition.ai/blog/dont-build-multi-agents); GSD STATE.md + structured decision capture + milestone archival — [open-gsd/gsd-core](https://github.com/open-gsd/gsd-core).
- Negative results that shaped the design: Cline Memory Bank's read-ALL-files startup documented as token-bloated and deprecated by Kilo Code — [Cline docs](https://docs.cline.bot/best-practices/memory-bank), [Kilo docs](https://kilo.ai/docs/advanced-usage/memory-bank); hook-automated memory systems document stale-heartbeat and deadlock failure modes — [Continuous-Claude-v3](https://github.com/parcadei/Continuous-Claude-v3); record failures, not just successes — [Manus blog](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus).
- Wrap-up threshold evidence: Claude Code auto-compact community-measured at ~83-84% used (officially undocumented) — [claudefa.st](https://claudefa.st/blog/guide/mechanics/context-buffer-management) [community measurement]; Anthropic server-side API compaction default 150k tokens = 75% of a 200k window — [Compaction docs](https://platform.claude.com/docs/en/build-with-claude/compaction.md); community red zone at 80% — [ccusage](https://ccusage.com/guide/statusline); recall degradation measurable well before these points — [Chroma context rot](https://research.trychroma.com/context-rot), [NoLiMa](https://arxiv.org/html/2502.05167v1); statusline JSON officially exposes `context_window.used_percentage` — [Statusline docs](https://code.claude.com/docs/en/statusline).

## Decisions (locked with user)

1. No pickup automation. Manual starts ("continue", "resume") are the only entry path. No PID matching, no SessionStart injection, no hybrid.
2. Approach A: three-layer ledger — curated capped core, append-only ADR-lite decisions, append-only session logs.
3. Ledger lives in-repo, committed (`<project>/.claude/ledger/`); non-git projects (including `~/.claude` itself) fall back to `~/.claude/projects/<slug>/ledger/`.
4. Detection: a stateless-as-possible PostToolUse nudge hook, two tiers — advisory at 70% used, urgent at 80% — that tells Claude to wind down running agents/tasks cleanly and recommend a handoff, which the user may decline. Thresholds are variables at the top of the script.
5. Multi-feature parallelism: project state and thread state are separate files. One thread file per line of work; worktree cwd plus branch name disambiguate pickup. Decision files are keyed date+slug (merge-safe), never sequential numbers.
6. Scope is global-only (`~/.claude`). Running the ledger on real projects (Pathfinder, Swiftee) is later, as normal usage.

## Ledger anatomy (per project)

```
<project>/.claude/ledger/
  PROJECT.md                              stable core, cap 80 lines
  threads/<slug>.md                       one per line of work, cap 80 lines each
  decisions/YYYY-MM-DD-<slug>.md          append-only, cap 20 lines each
  sessions/YYYY-MM-DD-NN-<thread-slug>.md append-only, target <=60 lines each
```

### PROJECT.md (rewritten only when project-level facts change)

Sections: Goal (2-3 sentences) / Constraints (non-derivable, one line each) / Active Decisions (one line each: `2026-06-11-event-sourcing — billing uses event sourcing`) / Threads (one line each: `billing-events — active — feat/billing-events`) / Pointers (spec, plan, key docs — paths only, never content). Superseded decisions drop out of the index; their files remain.

### threads/<slug>.md (rewritten at every wrap-up — the recitation file)

Frontmatter: `thread`, `branch`, `status: active | paused | done`, `updated` (absolute date). Sections: Objective / Now (current position + immediate next action) / Open Questions / Pointers (plan file, key source files) / Recent Sessions (last 2-3 session log paths). Single-feature projects use one thread, slug `main`.

### decisions/ (ADR-lite, write-once)

Header lines: Status (`accepted` or `superseded-by: <filename>`), Date, Thread (optional). Sections: Context (2-3 sentences) / Decision (1-2 sentences) / Consequences (1-3 lines, including rejected alternatives when they carry signal). Never edited after acceptance except the Status line on supersession; reversals create a new record.

### sessions/ (episodic, write-once)

Compressed handoff: Where it started / What shipped / What was tried and FAILED (with why — failure evidence prevents re-walking dead ends) / Verification commands run / Deferred + open / Pick up here. Absolute paths always.

## Components (deliverables, all in `~/.claude`)

### 1. `rules/common/continuity-ledger.md` (new, always loaded, <=40 lines)

Establishes, tersely: what a ledger is and where it lives (both locations); decision-time capture — when a decision is locked mid-session in a ledgered project, write the decision record immediately and add its PROJECT.md index line, never reconstruct decisions at wrap-up; resume duty — on "continue"/"resume" in a ledgered project, read PROJECT.md and the matching thread before acting; pointers-not-payloads discipline for all ledger files; ledger claims are hints — code wins on conflict (same principle as memory discipline).

### 2. `skills/session-handoff/SKILL.md` (rewritten in place — same name, same trigger phrases)

Wrap-up protocol:
1. Wind down running subagents/background tasks cleanly (collect results or stop; never abandon mid-write).
2. Initialize the ledger if absent (idempotent; create directories, PROJECT.md skeleton, thread file for current work).
3. Append the session log.
4. Promote any decisions locked this session that lack records (stragglers only — decision-time capture is the norm).
5. Rewrite the thread file (position, next action, open questions); update PROJECT.md indices only if project-level facts changed.
6. Enforce caps: over-cap content is demoted into the session log with a pointer retained (restorable compression — nothing is deleted outright).
7. In git projects, commit the ledger files (`chore: ledger handoff <thread>`) — the user's wrap-up confirmation is the consent for this commit. Non-git fallback: write only.
8. Output a 5-line chat summary and suggest `/clear`. The file is canonical; the chat summary is a courtesy.

Hard rules carried over from the old skill: never invent state; absolute paths; no emojis/hype; background shell IDs recorded if any survive wind-down. Dropped: chat-only rule, Windows path, TodoWrite reference.

### 3. `skills/resume-project/SKILL.md` (new)

Triggers: "continue", "resume", "pick up where we left off", "/resume-project", or any near-equivalent at session start in a ledgered project.

Read protocol (budget <=3k tokens):
1. Locate the ledger (in-repo first, global fallback). Missing -> say so, offer to initialize, stop.
2. Read PROJECT.md.
3. Match the thread: `git branch --show-current` against thread frontmatter `branch` fields. Exactly one active match -> proceed. Zero or multiple -> list the Threads index and ask one question.
4. Read the matched thread file and its most recent session log. Nothing else loads at start; decision records load on demand only when the task touches them.
5. Verify against reality before acting: thread's `updated` date vs `git log` since; spot-check that named files/paths exist. Divergence -> code wins, flag it, fix the ledger.
6. State position in one short paragraph, then proceed with the Now section's next action.

### 4. `hooks/context-wrapup-nudge.sh` + settings.json registration (PostToolUse, matcher "")

Behavior:
- Determine context utilization. Preferred source: `context_window.used_percentage` if present in hook input JSON; fallback: compute from the transcript JSONL's most recent assistant usage (`input_tokens + cache_creation_input_tokens + cache_read_input_tokens`) against the window size. Which source is available is verified during implementation; the fixture tests the chosen one.
- Thresholds as script-top variables: `NUDGE_PCT=70`, `URGENT_PCT=80` (rationale in Research basis; firing at 70% leaves ~26k tokens before the ~83% auto-compact — enough for the in-flight turn (~5-15k) plus wind-down and ledger write (~10-20k)).
- At >=70%: emit one advisory line to Claude (via the hook's JSON output; exact field chosen at implementation and exercised by the fixture): wind down running agents and tasks cleanly, then recommend a session handoff to the user, who may decline and continue. At >=80%: emit one urgent line recommending immediate wrap-up.
- Anti-spam: each tier fires at most once per session — a marker file `/tmp/claude-ledger-nudge-<session_id>` records the highest tier already fired; loss of the marker repeats one sentence, nothing worse.
- Sentinel side-effect (interface for sub-project 3): on every evaluation past 50%, write `~/.claude/run/context-sentinel-<session_id>.json` containing `{"used_pct": <n>, "ts": "<iso8601>"}`; the hook deletes sentinel files older than 24h. Sub-project 3's orchestrator reads this to size or defer agent waves.
- Failure mode: any error (unreadable transcript, missing fields) -> exit 0 silently. Detection degrades to the human watching the statusline; the hook never blocks a tool call.

## Concurrency model

- Parallel sessions in separate worktrees (recommended pattern): each worktree carries its own checkout of the ledger on its own branch. Wrap-ups touch disjoint files (own thread file, own session logs, new decision files); merges are clean. PROJECT.md is the only shared file — append-mostly index lines; worst case a one-line conflict resolved by keeping both lines.
- Pickup disambiguation chain: cwd (worktree) -> branch-name match against thread frontmatter -> ask the user with the Threads index (one-word answer). No process state, no timestamps-as-truth.
- Parallel sessions in the SAME directory (no worktrees): thread files and session logs still cannot collide; PROJECT.md is last-writer-wins. Documented limitation; worktrees are the recommended pattern because they eliminate it.
- Decision filename collisions across branches are prevented by date+slug naming; identical slugs same-day for different decisions are resolved by a more specific slug at write time.

## Error handling

- Resume with no ledger: offer initialization, never fabricate state.
- Thread file over cap at wrap-up: curation pass demotes detail to the session log, pointers retained.
- Ledger contradicts code: code wins; divergence stated in chat and corrected in the ledger.
- Handoff declined after nudge: Claude continues working; the advisory tier never re-fires; the urgent tier fires once at 80%.
- Auto-compact fires before any wrap-up: ledger still holds everything written at decision time plus prior session logs; the post-compact session can run a late wrap-up from the summary. Degraded, not destroyed — this is why decision-time capture is the norm.

## Cross-cutting integration

- `session-handoff` and `resume-project` follow existing skill conventions (SKILL.md, name/description frontmatter).
- The continuity rule references both skills by name; neither skill invokes the other automatically.
- Relationship to existing layers: auto-memory keeps durable non-derivable facts (unchanged); the ledger holds task/plan/decision state — the layer Claude Code has no built-in surface for; `docs/superpowers/` specs and plans are referenced from Pointers sections, never duplicated.
- Sub-project 3 interface: the sentinel file format above, plus `/verify-<project>` commands (from sub-project 1) as the validation source its orchestrator will call.

## Out of scope

- Automated session pickup of any kind (SessionStart injection, PID matching) — rejected as brittle.
- Hard-blocking enforcement (denying tool calls past a threshold).
- Project-side migration: running the ledger on Pathfinder/Swiftee happens later as normal usage.
- Modifying auto-memory, CLAUDE.md behavior, or plugin-owned files.
- Sub-projects 3-4 (parallelization, code-quality automation).

## Verification plan (for the implementation phase)

1. Ledger fixture (/tmp git repo): initialize via the skill -> two simulated wrap-ups on two worktree branches -> one decision superseding another -> verify: caps enforced, PROJECT.md index correct (superseded decision absent, file present), session logs append-only, merge of both branches conflicts at most on PROJECT.md index lines.
2. Resume fixture: fresh read of the merged fixture -> branch-match selects the right thread -> total resume read <=3k tokens (measure by file sizes) -> divergence test: delete a file the thread references, confirm resume flags it instead of proceeding.
3. Hook fixture: synthetic transcript/input evaluated at 45/69/71/76/81% -> expected emissions: none, none, advisory (once), nothing (advisory already fired), urgent (once); sentinel file written for every evaluation past 50%; malformed transcript exits 0 silently.
4. Rule/skill greps: continuity-ledger.md <=40 lines; no Windows paths or TodoWrite references anywhere in the rewritten skill; both skills' frontmatter parses (head -4 pattern from sub-project 1).

## Success criteria

- A fresh session resumes a thread with <=3k tokens of ledger reads and states the correct position before acting.
- A decision locked N sessions ago survives to session N+M as an index line + record, without any session re-carrying it; losing it requires an explicit supersession record.
- Two parallel worktree sessions hand off and resume independently with zero cross-contamination and a clean merge.
- The nudge fires before auto-compact with enough headroom to wind down and write a complete ledger update; declining it is always possible.
