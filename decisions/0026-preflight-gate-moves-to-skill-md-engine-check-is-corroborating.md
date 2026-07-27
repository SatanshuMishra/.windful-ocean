---
Status: accepted
Date: 2026-07-27T03:39:06.362Z
Thread-Id: 01KYERCMSSYD9ZBF28B51HMRWW
---

# 0026. The authoritative preflight gate lives in SKILL.md, not the engine; the engine-side check is corroborating only

## Context

Build A's preflight was gated ONLY inside mitosis.js, which is a Workflow script with no exec surface. It therefore consumed a verdict self-reported by the `reconcile` subagent, which a compromised or lazy agent could fabricate as {passed:true, halted:[]} — the same client-side trust that 0009 tore down MSP-2/MSP-3 for. Analysis established the limitation is NOT catastrophic: the real boundary is the GitHub ruleset plus the non-admin machine user, both server-enforced, so a faked verdict buys nothing except a run that halts later at GitHub instead of early with a readable reason. Search for a shell launcher to host a real-exit-code gate found NONE: .claude/skills/mitosis/SKILL.md:36-39 shows the engine is started by the main thread calling Workflow({scriptPath}) directly, with no wrapping process. run-engine.mjs has no child_process; only generate-run-script.mjs, gh-merge-shim.mjs and mitosis-git.mjs do, and none of them launch the engine.

## Options

- (a) Accept as advisory, document the limitation, ship unchanged — cheapest, but leaves the only gate agent-reported
- (b) Move the gate into a shell launcher with real exec — REJECTED as written: no such launcher exists
- (c) CHOSEN: gate in SKILL.md preconditions (main-thread Bash, real exit code, before dispatch) AND keep the engine-side read as corroborating defense-in-depth, with reason strings reworded to stop overstating what an agent-reported verdict proves
- (d) PreToolUse hook on the Workflow tool — structurally strongest, but requires a settings.json edit, which agents are forbidden from making in this thread

## Outcome

USER-LOCKED option (c). The authoritative gate is a REQUIRED third precondition in SKILL.md that runs `node merge-boundary-preflight.mjs` from the MAIN thread before dispatch and refuses to call Workflow on any non-zero exit — real process, real exit code, visible in the transcript, no subagent in the loop. The engine-side readBoundaryPreflightVerdict gate is retained unchanged in control flow and fail-closed behavior, but demoted in WORDING to a corroborating re-check; its reason strings now say an agent-reported verdict was absent/malformed/self-contradictory/non-passing rather than claiming the boundary itself is unproven. Option (d) is the acknowledged stronger form and is deferred as a human-applied follow-on, recorded in the PR description rather than silently dropped — it is NOT implemented by any agent. The four MITOSIS_BOUNDARY_* env vars remain the deployment config; unset vars exit 31 and halt, which is already correct fail-closed behavior and needs no new mechanism.
