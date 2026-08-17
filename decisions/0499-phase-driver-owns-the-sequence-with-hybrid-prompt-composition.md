---
Status: accepted
Date: 2026-08-17T04:35:07.495Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0499. A phase-driver module owns the eight-phase sequence, with hybrid prompt composition

## Context

The entry point cli.mjs reaches 27 of 87 modules. Sixty are orphaned, including the whole prompt system and every integrate and ship value object. phases.mjs declares eight phases and nothing advances a run between them; only Execute is implemented. The wiring question is where the sequence lives and when prompts get composed. Four facts constrain it: cli.mjs is a single-shape argv parser whose lock lifetime is one attempt, so phase verbs would turn it into a subcommand router with per-verb lock semantics; the run key hashes the MSP table that decompose produces, so decompose cannot fold into the same process without breaking that hash; a prompt whose input is a prior child's verdict cannot exist before that verdict does; and phase-scan halts on a non-literal phase argument.

## Options

- cli.mjs grows phase verbs and becomes a subcommand router
- A new phase-driver module owns the sequence and cli.mjs delegates to it
- decompose-emit folds into the CLI so one process runs the whole flow
- Compose every prompt at decompose time, or every prompt at dispatch time

## Outcome

A new flat phase-driver.mjs at the mitosis root owns the eight-phase sequence; runCli keeps its exact argv contract and delegates. Decompose stays a separate process invoked by the driver, preserving the run-key-over-task-prose property. Prompt composition is HYBRID: implement and decompose stay baked into the run document so the document stays replayable and the run key stays stable, while review, security, diagnose, redispatch, boundary-fix, replan and plan-review are composed at dispatch through composePrompt, because their input is a prior child's verdict and baking them would require a placeholder, which is the fabrication the honesty rule bans. Integrate and Ship are their own phases running after Execute quiesces, iterating MSPs in topological order, rather than per-unit steps on built, which would open a pull request whose prerequisite is unmerged. The eight literal phase calls go at the head of each body function. One sequencing trap is load-bearing: phase-parity HALTS at exit 42 on an empty use-set, and today that set comes mostly from dead code in run-engine.mjs, so the live phase sites must land before any MSP that deletes those dead bodies.
