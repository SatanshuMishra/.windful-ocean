---
Status: accepted
Date: 2026-08-12T16:37:07.899Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0379. c2 settled by probe: Workflow auto-grants, so A4 defends a migration hazard not a live defect

## Context

SPEC residual 4 makes the A4 Workflow schema question a gate: if schema enforcement proved already void on main, that defect had to be fixed and shipped before the rest of the stack. The CLI trap was measured and reproduced (claude -p --agent code-reviewer --json-schema returns success, is_error false, and NO structured_output; general-purpose returns it). The Workflow agent path inspected as different but the load-bearing sub-question — whether its enforcement is gated on the target agent's tools frontmatter — was undetermined, and the orchestrator subagent does not hold the Workflow tool.

## Options

- Proceed to A0 treating the question as A4-internal scope and probe before A4 is cut - the orchestrator's own recommendation
- Hold the whole stack until the question is settled - strictest reading of residual 4
- Main thread runs the probe under user opt-in while A0 proceeds in parallel, since A0 depends on nothing - chosen

## Outcome

Measured, not inferred: code-reviewer, which declares no StructuredOutput and carries an explicit restricted tool list, returned a validated object; the general-purpose control returned the same. The Workflow agent schema path AUTO-GRANTS StructuredOutput and is NOT gated on frontmatter. No live defect on main, residual 4's contingency does not fire, nothing ships ahead of the stack. The consequential half is the reframe: mitosis.js is itself a Workflow script, which is exactly why nothing is broken today, while SPEC 0.3 defines a dispatch as one claude -p subprocess. The re-architecture moves every dispatch off the safe path onto the trapped one, so A4 defends against a hazard the migration introduces. Three bindings follow: A4's red case must run through the CLI path, because a red case dispatched through the Workflow agent path passes unconditionally and is a guarantee that cannot fail; it must assert the SILENT failure (success with no structured_output), not a throw, or it never goes red; and adding StructuredOutput to all 16 dispatchable agents is load-bearing, not housekeeping.
