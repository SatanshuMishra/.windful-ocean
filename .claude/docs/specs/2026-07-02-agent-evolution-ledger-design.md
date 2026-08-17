# Agent Evolution Ledger — Design Spec

- Date: 2026-07-02
- Status: approved (design); implementation pending `writing-plans`
- Scope: global `~/.claude` configuration (spans all projects)
- Author context: brainstorming session, feasibility-verified against `code.claude.com/docs`, design-verified against cited research (see References)

## 1. Problem and goal

The global config ships a roster of specialized subagents, but nothing observes how well that roster covers real work. Three blind spots:

1. When the model falls back to a built-in generalist (`claude`, `general-purpose`), that is an unrecorded signal that a specialist was missing or unroutable.
2. When an agent is blocked by its own scope (a tool absent from its `tools:` allowlist) or by a global deny rule, that failure is not cataloged.
3. When an agent completes but does so inefficiently, there is no record — no failure fires, so the inefficiency is invisible.

Goal: a durable, low-cost telemetry-and-audit architecture that captures these signals across every project, then — on manual demand — clusters them into capability gaps and recommends concrete roster changes (modify / create / merge / delete / split an agent). The architecture must actively resist agent sprawl: it produces a small "smart swiss-army-knife" roster, not hundreds of narrow agents.

This is an observability + capability-gap-management system for the agent roster itself.

## 2. Non-goals

- Not a real-time enforcement/blocking system. The default posture is observe-and-nudge, never hard-gate (hard-gating fights the model mid-task and is brittle; see Approaches).
- Not a token/cost accounting backend. Hooks expose no token data; full cost telemetry (OpenTelemetry) is explicitly out of scope. Best-effort token capture from the transcript only.
- Not an automated agent-editor. The audit recommends; a human approves; only then does a subagent apply the change.
- Not a per-step "was this action necessary" judge. Research shows fine-grained step-redundancy detection is unreliable (RedundancyBench best score 24.88%); automated flagging is restricted to deterministic signals.

## 3. Guiding principles

- Three Pillars (Quality > Optimization > Speed), applied throughout:
  - Quality: deterministic capture on the write path; event-sourced, never-deleted audit trail; Rule-of-Three gate prevents premature/wrong abstractions; anti-sprawl gate keeps the roster maintainable.
  - Optimization: cheap appends on the hot path; heavy analysis deferred to on-demand audit; the system's purpose is to drive down generalist reliance over time, yielding more targeted (cheaper, higher-quality) runs.
  - Speed: capture hooks are async or bounded and never block the session; audit runs off the hot path on manual trigger.
- Pointers, not payloads. Ledger lines carry excerpts and file pointers, never full prompts or transcripts. Mirrors the existing continuity-ledger discipline.
- Append-only write path. Resolutions are new events, never mutations. Mirrors the no-direct-db audit-trail value and the continuity-ledger append-only decision records.
- Consolidate before proliferate. A recurring gap is first tested as a mode/parameter on an existing specialist before any new agent is proposed (Anthropic tool-design guidance).

## 4. Architecture overview

Five components, in dependency order:

1. Storage layer — append-only JSONL event log + derived read-model index + optional per-gap markdown records. Under `~/.claude/agent-ledger/`.
2. Capture layer — three hooks plus two model-side conventions that append events.
3. Audit command — `/agent-gap-audit`, a user-triggered skill that clusters gaps, researches fixes, and emits a cited report.
4. Anti-sprawl doctrine — `~/.claude/rules/common/agent-roster.md`, governing all agent creation, enforced as an executable gate inside the audit.
5. Config integration — hook wiring in `settings.json`, conventions in `CLAUDE.md`, and a roster index generator.

```
main session / subagents
        │  (spawn generalist / deny / finish)
        ▼
[Capture hooks] ──append──▶ ~/.claude/agent-ledger/events/YYYY-MM-DD.jsonl   (write path, immutable)
                                        │
                          /agent-gap-audit (manual)
                                        ▼
                            index/ (derived read-model, regenerable)
                                        ▼
                    cluster → Rule-of-Three gate → research → anti-sprawl gate
                                        ▼
                            report (via report skill) + gaps/<id>.md
                                        ▼
                     human approval → subagent applies change → resolution events
```

## 5. Storage layer

### 5.1 Directory layout

```
~/.claude/agent-ledger/
  events/
    YYYY-MM-DD.jsonl        write path: append-only, one JSON object per line, one file per day
  index/
    gaps.json               derived read-model: current gap clusters and their status
    agent-baselines.json    derived: per-agent efficiency baselines for outlier detection
    checkpoint.json         last processed event pointer, for incremental rebuild
  gaps/
    <gap-id>.md             optional human-browsable ADR-style record, one per gap cluster
  reports/
    YYYY-MM-DD-<slug>.md    audit reports (or .html rendered via report skill)
  roster-index.json         generated snapshot of available agents (name, description, tools, scope)
```

Rationale (answers the "single file vs many" question):
- One unified event stream for the write path. Event type is a field, filtered with `jq 'select(.type=="fallback_used")'`; separate-file-per-concern would fragment the timeline and make cross-signal correlation within a session harder (a `fallback_used` followed by a `capability_blocked` in the same session must be trivially joinable). Precedent: Claude Code and Codex both store one JSONL stream per session.
- Faceted derived indexes for the read path. The per-concern views the audit needs (`gaps.json`, `agent-baselines.json`) are materialized read models, regenerable from the log at any time (CQRS). Delete them, replay the log, get them back.
- Optional per-gap markdown as a human/resolution surface only (ADR-style status field), rendered by the audit, never on the write path.

### 5.2 Growth and rotation

- One file per day bounds each file. Low-volume weeks may segment per week instead; the analyzer keys off the file naming pattern, not a single path.
- The log is data, never loaded into an agent's context wholesale. Growth to thousands of lines is a non-issue for context budget.
- If a single segment ever grows large enough to slow `jq`, the audit adds a DuckDB/SQLite materialization step at query time. The write format never changes.
- Optional monthly archival: `events/archive/YYYY-MM.jsonl.gz`. Archived events remain replayable; nothing is deleted.

### 5.3 Event envelope

Every event line is a JSON object sharing this envelope:

```
{
  "ts": "2026-07-02T14:33:10Z",
  "schema_version": 1,
  "type": "fallback_used",
  "session_id": "abc123",
  "project": "-Users-me-Documents-foo",
  "cwd": "/Users/me/Documents/foo",
  "emitter": "main"
}
```

- `ts` ISO-8601 UTC. `project` is the cwd-derived slug (matches the existing projects/ slug convention) for cross-project analysis. `emitter` is `main` or the subagent `agent_type` that produced the event.
- Each line MUST stay small (excerpts capped, see 5.5) so a single `>>` append stays within `PIPE_BUF` and is atomic; a shared `flock` guards concurrent appends regardless.

### 5.4 Event types

Written by capture hooks:

| type | trigger | key fields (beyond envelope) |
|---|---|---|
| `fallback_used` | generalist spawned | `subagent_type` (claude\|general-purpose), `description`, `prompt_excerpt`, `rationale` (parsed or null), `candidates_offered` (from nudge) |
| `permission_denied` | `PermissionDenied` hook fires (auto-mode classifier denials ONLY; static deny-rules and interactive denials fire no hook — see 6.2) | `tool_name`, `denied_input_excerpt`, `deny_rule` (matched rule or null), `agent_type` |
| `capability_blocked` | `CAPABILITY-BLOCKED:` self-report seen at `SubagentStop` | `agent_type`, `needed` (tool/capability), `task_excerpt` |
| `agent_run` | `SubagentStop` for any agent | `agent_type`, `tool_calls_total`, `duplicate_tool_calls`, `retry_loops`, `redundant_reads`, `tokens` (best-effort or null), `duration_ms` (or null), `transcript_ptr`, `outcome` (best-effort or null) |

Written by the audit command (lifecycle):

| type | meaning | key fields |
|---|---|---|
| `gap_detected` | a cluster crossed the Rule-of-Three gate | `gap_id`, `cluster_key`, `count`, `sessions`, `evidence_refs` |
| `gap_resolved` | a gap was addressed | `gap_id`, `resolution` (modify\|create\|merge\|delete\|split), `agent_refs`, `notes` |
| `gap_merged` | a gap folded into another | `gap_id`, `into_gap_id` |
| `recommendation_rejected` | a proposal failed the anti-sprawl gate | `gap_id`, `reason` |
| `agent_created` / `agent_modified` / `agent_deleted` | roster change applied | `agent_name`, `change_summary`, `gap_id` |

### 5.5 Privacy and size caps

- `prompt_excerpt`, `task_excerpt`, `denied_input_excerpt`: capped (default 500 chars) and passed through the existing secret-scanner redaction before write. Never store full prompts, never store transcript contents (pointer only).

### 5.6 Derived read-model (index)

- `gaps.json`: map of `gap_id → { cluster_key, status (open|actionable|resolved|merged|rejected), count, first_seen, last_seen, sessions[], evidence_refs[], resolution_ref }`.
- `agent-baselines.json`: per `agent_type → { runs, median_tool_calls, median_duplicate_ratio, median_redundant_reads, median_tokens, p90_* }`. Baselines make inefficiency a ratio against the agent's own norm, not an absolute count (research: absolute counts conflate hard tasks with inefficiency).
- `checkpoint.json`: `{ last_processed_ts, last_processed_file }` so the audit rebuilds incrementally, touching only new lines.
- All three are disposable caches, fully regenerable by replaying `events/`.

## 6. Capture layer

### 6.1 Fallback capture and soft nudge

- Hook: `PreToolUse` matching the `Agent` tool. Reads `tool_input.subagent_type`.
- If `subagent_type ∈ { claude, general-purpose }`:
  - Append a `fallback_used` event (`prompt_excerpt`, `description`, parsed `rationale`).
  - Emit exit-0 JSON with `hookSpecificOutput.additionalContext` listing candidate specialists drawn from `roster-index.json` whose scope keywords match the task — a non-blocking nudge. Never blocks (this hook always exits 0).
  - Nudge is capped to once per session per normalized task-type to avoid spamming.
- `Explore` and `Plan` are excluded from gap signaling by default (purposeful built-ins); may be logged at low severity if enabled later.
- Feasibility fallback: if `subagent_type` proves not to be exposed in `PreToolUse(Agent)` `tool_input` (marked unverified in docs), degrade to a `SubagentStart` hook with matcher `general-purpose` for logging only (loses the pre-spawn nudge). Verified during implementation by dumping a real hook input.

### 6.2 Permission-failure capture (two paths, by necessity)

A subagent whose `tools:` list omits a tool cannot call it at all — the tool is absent from its context, so no permission event fires. Therefore two distinct capture paths:

- Path A — auto-mode classifier denials ONLY: the `PermissionDenied` hook fires only when the auto-mode classifier denies a tool call, and appends `permission_denied`. VERIFIED LIMITATION (live probe 2026-07-02, docs-confirmed at code.claude.com/docs/en/hooks-guide.md): static `settings.json` deny-rule hits (curl, `git push -f`, supabase, secret reads) block silently and fire NO hook; interactive user denials also fire no post-denial hook (only `PermissionRequest`, pre-dialog). No hook exists for those two cases, so Path A's coverage is narrow by construction and the primary agent-scope signal is Path B. The system's stated goal of recording "permission failures" is therefore scoped to auto-mode classifier denials plus Path B self-reports, not the deny list.
- Path B — too-narrow own scope (the primary "agent scope too small" signal, e.g. a DB agent lacking Write): a model-side convention. Any agent blocked by a missing tool/permission emits, before returning, a line:
  `CAPABILITY-BLOCKED: needed=<tool-or-capability> task=<short description>`
  A `SubagentStop` hook scans the subagent transcript for this line and appends `capability_blocked`.

### 6.3 Inefficiency capture

- Hook: `SubagentStop` (async), for all agent types. Reads `agent_type` and `transcript_path`.
- A bounded Node analyzer (`agent-run-analyzer.mjs`) streams the transcript JSONL line-by-line and computes deterministic signals only:
  - `tool_calls_total`
  - `duplicate_tool_calls`: identical (tool_name + normalized input) hashes seen more than once
  - `retry_loops`: consecutive identical tool calls that returned errors
  - `redundant_reads`: same `Read` `file_path` read more than once
  - `tokens`: summed from per-message `usage` if the transcript carries it, else null
  - `duration_ms`, `outcome`: best-effort if derivable, else null
- Appends one `agent_run` event plus a `transcript_ptr` pointer. It records metrics; it does not judge. Outlier judgment happens at audit time against `agent-baselines.json`.
- Bounded: streaming parse, capped memory, hard timeout; async so it never blocks turn completion.

### 6.4 Model-side conventions (CLAUDE.md)

Two short rules, both degrade gracefully if the model omits them:

1. Fallback rationale: when dispatching `general-purpose` or `claude`, prefix the subagent `description` with `FALLBACK-RATIONALE: <why no specialist fit>`. The `PreToolUse` hook reads it from `tool_input`. This is how the "why" is captured — the hook cannot read the model's reasoning, but it can read a line placed in the call.
2. Capability self-report: any agent blocked by a missing tool/permission emits `CAPABILITY-BLOCKED: needed=<...> task=<...>` before returning.

### 6.5 Roster index generator

- A `SessionStart` (or lazy, mtime-gated) generator scans `~/.claude/agents/*.md` and the active project's `.claude/agents/*.md`, writing `roster-index.json`: `{ name, description, tools, scope_keywords }` per agent.
- Consumed by the nudge (6.1) and the audit (7). Regenerated only when the agents directories' mtime changes, to stay cheap.

### 6.6 Shared append library

- `agent-ledger-lib.sh` exposes `append_event <json>`: resolves today's segment path, ensures the dir exists, acquires a short `flock`, appends one line. Mirrors the defensive jq/python-absent fallbacks already used by existing hooks (e.g. `block-deep-research.sh`).
- Recursion guard: the audit sets `AGENT_LEDGER_SUPPRESS=1` for its own internal subagent spawns so audit-time research does not pollute the gap log.

## 7. Audit command — `/agent-gap-audit`

User-triggered skill (never automatic; runs "at a randomized time" per the user). Algorithm:

1. Incremental index rebuild: process `events/` since `checkpoint.json`; update `gaps.json` and `agent-baselines.json`.
2. Cluster open signals (`fallback_used`, `permission_denied`, `capability_blocked`, and `agent_run` outliers) by `cluster_key` = normalized (task-type signature, missing-capability, failure-mode). Task-type normalization is fuzzy but runs off the hot path, so the cost is acceptable.
3. Rule-of-Three gate: a cluster is actionable only at count >= 3 across distinct sessions. Below that it stays `open` and dormant. This is the primary defense against premature/wrong abstractions. Emit `gap_detected` for newly actionable clusters.
4. Research + roster audit per actionable cluster: dispatch `researcher` (recursively, as many passes as needed) and read `roster-index.json` / `~/.claude/agents/`. Produce a candidate recommendation, defaulting to extend-an-existing-specialist over create-new.
5. Anti-sprawl gate (Section 8). A `create-new` recommendation must pass all three tests or be downgraded to extend/merge, or rejected with a `recommendation_rejected` event.
6. Inefficiency handling: flag `agent_run` outliers (metric beyond the agent's own p90 baseline — high duplicate ratio, redundant reads, or tool-count far above its median for comparable task size). Surface trajectories for human review; never auto-conclude that a step was unnecessary.
7. Report: render via the existing `report` skill (researcher verification → report-writer → visual-explainer). Cited, teaching-oriented, with concrete recommended diffs to agent files and the gap evidence.
8. Resolution: on human approval per recommendation, a subagent (per delegation-discipline) applies the agent-file change; the skill appends `agent_created` / `agent_modified` / `agent_deleted` and `gap_resolved`, updates `gaps.json` status, and flips `gaps/<id>.md` status to `resolved` with a pointer to the resolving change.

Inefficiency is defined operationally as: a deterministic metric (duplicate tool calls, retry loops, redundant reads, or tool/token count) exceeding the agent type's own historical p90 baseline for comparable work. Fuzzy notions of wasted reasoning are explicitly excluded from automated conclusions.

## 8. Anti-sprawl doctrine — `agent-roster.md`

A recurring gap justifies a NEW specialist only when all three hold; otherwise extend an existing one:

1. Distinct reason-to-change — genuinely separate scope from every existing agent (service right-sizing / single-responsibility).
2. Clearer orchestrator routing — the main thread reasons better with it as a named role than with one more mode/parameter on an existing agent (Anthropic tool-design).
3. Recurrence — has cleared the Rule-of-Three gate.

Over-narrow proposals (the "WebGL 3.0 implementer" antipattern) fail test 1 or 2 and are rejected or folded. The doctrine is both a rule doc governing all agent creation (project or global) and the executable gate in Section 7 step 5.

## 9. Config integration (files touched)

- `settings.json` hooks: add `PreToolUse` matcher `Agent` (fallback + nudge), `PermissionDenied` (auto-mode classifier denials only; see 6.2), `SubagentStop` (async analyzer + capability-blocked scan). Optionally `SessionStart` for the roster-index generator.
- `CLAUDE.md`: add the two conventions (6.4) and a pointer to `agent-roster.md`. (Protected file — the write triggers a confirm prompt by design.)
- New rule: `rules/common/agent-roster.md` (Section 8).
- New skill: `skills/agent-gap-audit/` (Section 7).
- New scripts under `hooks/`: `agent-ledger-lib.sh`, `agent-run-analyzer.mjs`, `agent-fallback-capture.sh`, `agent-permission-capture.sh`, `roster-index-gen.sh`.
- New data root: `~/.claude/agent-ledger/` (git-ignored; it is machine-written telemetry).

## 10. Feasibility caveats (verify during implementation)

Each is confirmed by a quick hook-input dump before the dependent code is finalized:

1. `PreToolUse(Agent)` exposes `subagent_type` in `tool_input`. If not, use `SubagentStart` matcher `general-purpose` (logging only). [VERIFIED live probe 2026-07-02: `fallback_used` captured `subagent_type=general-purpose`]
2. ~~`SubagentStop` input carries the subagent's own `transcript_path`. [VERIFIED live probe 2026-07-02: `agent_run.tokens` non-null across real dispatches]~~

   [CORRECTED 2026-08-16 — the claim is FALSE, and the 2026-07-02 verification was a proxy that could not fail]

   - `transcript_path` is always the PARENT's flat session file. Measured across 16,014 recorded pointers: parent 16,014, subagent 0.
   - The probe asserted `agent_run.tokens` non-null. A parent transcript satisfies that exactly as well as a subagent transcript would, so the probe passed under both outcomes and discriminated nothing. A check that cannot fail is not a verification: pin the claim itself, never a downstream symptom of it.
   - The subagent's own output IS addressable. `SubagentStop` delivers `agent_id`, `agent_type`, `agent_transcript_path` and `last_assistant_message` unconditionally, confirmed against the shipped binary's payload construction (Claude Code 2.1.233).
   - Cost of the error: the capability-blocked detector scanned the parent transcript and recorded zero events in six weeks while at least 33 genuine emissions sat in the subagent output. Fixed 2026-08-16 in `.claude/hooks/agent-ledger/agent-run-analyzer.mjs`.
3. A subagent's missing-tool truly fires no `PermissionDenied` (hence Path B self-report). [CONFIRMED AND EXPANDED, live probe 2026-07-02: `PermissionDenied` fires ONLY for auto-mode classifier denials; static deny-rules and interactive denials also fire no hook — see 6.2 Path A limitation]
4. Transcript JSONL carries per-message `usage` tokens. If absent, `tokens=null`. [VERIFIED live probe 2026-07-02: tokens non-null]
5. Hooks fire inside subagents in this installation and carry `agent_type`. [VERIFIED live probe 2026-07-02: `agent-baselines.json` attributes runs per `agent_type`, e.g. general-purpose/implementer/codebase-analyst]
6. Async `SubagentStop` completes its transcript read before the transcript can be reclaimed. [UNVERIFIED — never probed; no measurement of reclamation timing exists. Not known to be false, and not to be relied on as established.]

   The adjacent ordering hazard that WAS measured runs the other way: the parent relay of a subagent's final message lands roughly two seconds AFTER `SubagentStop` fires, so a hook reading the parent transcript reads it too early rather than too late (2026-08-16, `agent-run-analyzer.mjs`). That bears on write ordering, not on reclamation, which remains unprobed.

## 11. Failure modes and edge cases

- Missing `jq`/`python`/`node`: hooks degrade to no-op append or grep-based parse; never crash the session (mirror existing hook fallbacks).
- Concurrent appends from parallel subagents: `flock` + small lines (< `PIPE_BUF`).
- Missing rationale/self-report lines: fields become null; the audit infers from the prompt corpus.
- Nudge noise: non-blocking, terse, capped once per session per task-type.
- Self-referential logging: `AGENT_LEDGER_SUPPRESS=1` around audit-time spawns.
- Secret leakage into excerpts: secret-scanner redaction on every excerpt before write.
- Index corruption: delete `index/`, replay `events/` — the log is the single source of truth.

## 12. Implementation sequencing (for writing-plans)

1. Doctrine + storage: `agent-roster.md`, directory layout, event schema, `agent-ledger-lib.sh`, roster-index generator.
2. Capture: the three hooks + `agent-run-analyzer.mjs`, CLAUDE.md conventions, `settings.json` wiring. Gate on the Section 10 dumps.
3. Audit read-side: incremental index rebuild, clustering, Rule-of-Three gate, baselines, anti-sprawl gate.
4. Audit report + resolution flow: `report`-skill integration, approval, apply-change subagent, lifecycle events, gap markdown.

Each phase leaves the config green and is independently useful (capture is valuable even before the audit exists).

## 13. Decisions locked in this session

- Approach A (capture → derive → on-demand audit); B (hard-gate) and C (OTEL backend) rejected.
- Posture: log + soft nudge. Fallback scope: `claude` + `general-purpose` only. Rationale source: model line + raw capture.
- Storage: unified append-only JSONL + faceted derived indexes + optional ADR-style per-gap markdown; event-sourced resolutions, never delete.
- Inefficiency: deterministic signals against per-agent p90 baselines only; fuzzy step-necessity excluded from automated conclusions.
- Gap actionability: Rule-of-Three across distinct sessions. New-agent creation: three-part anti-sprawl test, consolidate-before-proliferate default.

## 14. References

Claude Code hooks/permissions (feasibility):
- https://code.claude.com/docs/en/hooks.md
- https://code.claude.com/docs/en/hooks-guide.md
- https://code.claude.com/docs/en/permissions.md
- https://code.claude.com/docs/en/agent-sdk/observability.md

Design best-practices (storage, lifecycle, signals, gap-detection, right-sizing):
- Event Sourcing — https://martinfowler.com/eaaDev/EventSourcing.html
- CQRS — https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs
- Architecture Decision Records — https://martinfowler.com/bliki/ArchitectureDecisionRecord.html
- Structured logging / JSONL — https://uptrace.dev/glossary/structured-logging
- RedundancyBench (step-redundancy detection is hard) — https://arxiv.org/html/2605.29893v1
- LangSmith trajectory evals — https://docs.langchain.com/langsmith/trajectory-evals
- Spotify golden paths — https://engineering.atspotify.com/2020/08/how-we-use-golden-paths-to-solve-fragmentation-in-our-software-ecosystem
- Rule of three — https://en.wikipedia.org/wiki/Rule_of_three_(computer_programming)
- Anthropic, Writing effective tools for AI agents — https://www.anthropic.com/engineering/writing-tools-for-agents
- Anthropic, Multi-agent research system — https://www.anthropic.com/engineering/multi-agent-research-system
