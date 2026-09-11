# Agent Orchestration

## Parallelism is decided by shared state, not by role

Two dispatches that touch disjoint files and share no state go out in ONE message, as multiple tool calls. Two that do not — where one consumes the other's output, or both would edit the same file — go sequentially.

Role is not the test. Two reviewers of the same diff share no state and run together, always. Two makers are the opposite case and the exclusion is wider than it looks: they share one working tree and one git index even when the files they edit do not overlap, so they run sequentially unless each has been given its own worktree. `delivery-lead` owns that rule in full; this line exists so nobody reads the paragraph above it as permission.

## A dispatching agent's clock is the sum of its children

An agent that dispatches eight children one at a time takes as long as those eight children take. Measured over 144 `delivery-lead` runs in this configuration (September 2026 observer log), the sum of child time was 97% of the parent's wall time; the parent's own reasoning was the remaining 3%.

The levers that follow from that are dispatching FEWER children and overlapping the independent ones. Picking a faster model for the parent is not a lever — it targets the 3%.

## Turn lifetime (a harness property, not a setting)

A child agent does not survive its parent's turn ending, and there is no supported way for an agent to wait on a child, end its turn, and be resumed. A dispatching agent finishes its work inside one turn or hands back.

Never dispatch an agent whose only purpose is to keep a turn alive. It produces nothing, and its completion notices are noise for whoever reads the hand-back.

## Fan-out is paid for per dispatch

Every subagent re-receives CLAUDE.md and every `.claude/rules/**` file at dispatch. Fan-out multiplies that cost. Dispatch because a surface needs a different agent, never to parallelise for its own sake.

## Every output contract carries a work-forcing field

An output format gives a dispatched agent a place to stop. That is its value and also its hazard: an agent stops when the fields are full, whether or not the work behind them happened.

So every contract — in an agent's body, and in every brief you write — carries at least one field that CANNOT be filled without doing the work. A count. An ordered enumeration with nothing left off it. A verbatim quote. A command with its captured exit code. A `path:line` confirmed by reading that location.

Fields answerable by attestation are not fields. "Whether you reviewed the diff", "is X present, yes or no", "confirm the tests pass" all cost nothing to answer falsely — and nothing to answer honestly but carelessly, which is the commoner failure by far.

Measured 2026-09-10: a probe asked a dispatched agent three yes-or-no questions about its own context. It answered "1. No. 2. Absent. 3. No." in under two seconds, fully compliant with the format it was given, having scanned nothing. The same question re-asked as "count them, then list them in order, then quote the last one verbatim" produced a correct answer in which the agent caught and reported its own first-pass undercount. Nothing changed but the shape of the fields.

Where it matters, make two fields cross-check each other — a count beside the list it counts. That makes a careless answer visible to the agent writing it, which is the only place it can still be cheaply fixed.

## Multi-Perspective Analysis

For complex problems, split-role sub-agents (where multiple subagents review the same artifact from different angles) produce higher-quality output than a single review pass. Use sparingly: complex security/architecture decisions, not routine reviews.

## See Also

Project-level rules in `<project>/.claude/agents/` define available subagents for that project. Global subagents in `~/.claude/agents/` apply across all projects (installed via Spec B of the 2026-05-14 redesign).
