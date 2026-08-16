---
Status: accepted
Date: 2026-08-16T22:47:08.164Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0488. The StructuredOutput grant lands on main as its own change because ~/.claude/agents is a symlink

## Context

Stage one of the n=1 run failed with missing-structured-output. Root cause established empirically against claude 2.1.233: --json-schema is honored only when the dispatched agent's tool set admits a tool named StructuredOutput. An agent declaring an explicit tools: allowlist filters it out, and the CLI then silently drops the schema, returning exit 0, subtype success, prose in result, and no structured_output field. An A/B on codebase-analyst's real tool list confirmed it: without the grant the field is absent, with it added the field is present and valid. Commit d9911cf4 already made this fix and shipped the dispatchable-agent-schema-capable gate, but it never reached main and sits on a dozen feature branches. ~/.claude/agents is a symlink into the primary checkout's working tree, which is on main, so the definitions the CLI loads are main's. Separately, agent-schema-lint.mjs:15 resolves its census target as new URL('../../agents/', import.meta.url), the copy beside the running module rather than the one the CLI loads: against a worktree it reports ok, against the primary checkout it reports a violation for every dispatchable agent. That is why PR #147 could truthfully report the gate green while real dispatch degraded to prose.

## Options

- Land the grant on main as its own PR before any dependent work
- Carry the grant inside the stacked feature work already in flight
- Work around it per-worktree with a project-local agents directory

## Outcome

The grant ships to main as its own change, PR #148, replicating only d9911cf4's seven agent-definition hunks byte for byte and bringing nothing else from that commit. The dispatchable set is derived by the gate from engine source string literals rather than a hardcoded list, and is pinned by d9911cf4's own test to code-reviewer, codebase-analyst, debugger, implementer, security-reviewer, solution-architect and test-engineer. receipts.md's rule that global rules land on the default branch immediately is extended by observation to a class it does not name: ~/.claude/agents is the same kind of symlink as rules, CLAUDE.md and skills, so an agent-definition change on a feature branch is not in force and vanishes when the checkout moves. The measurement run is blocked on a human merge of #148 and the primary checkout picking it up; until then no engine dispatch that requests a schema can succeed. PR #147's premise survives, since a schema does yield structured_output conditional on the agent admitting the tool, but its acceptance test proves only the half its fake emulates, and merging #147 before #148 would park every unit as NeedsHuman because unit dispatch uses agentType implementer. The gate's target-directory defect is filed as a separate item and deliberately left unfixed in #148, since fixing it first would redden the gate on every branch until the grant lands.
