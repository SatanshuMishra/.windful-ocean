---
Status: accepted
Date: 2026-07-31T04:26:51.601Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0144. B-6's lint fix masks only the defining module's own literals, and the phase-parity gate is the production caller

## Context

B-6 was funded as one MSP with a two-part oracle taken from the plan (docs/superpowers/specs/2026-07-30-two-track-invariant-plan.md:112): mask strings and comments in dead-export-lint.test.mjs before counting, AND include tests/ in liveness. Executed against the live tree before any edit, the two halves contradict each other and contradict the plan's own falsifier at :113.

A simulation of the lint over all 287 lib exports, run in the scratchpad against the real tree rather than reasoned from the source, gives three different dead lists. Rule (a), today's raw-source rule with tests/ excluded: empty. Rule (b), literals masked with tests/ still excluded: exactly two dead exports, workflow-sandbox.mjs::compileWorkflow and engine-args.mjs::buildEngineArgs. Rule (c), the plan's prescribed rule, masked AND tests/ counted: empty again, because compileWorkflow's own four self-test files supply 25 masked references. So the plan's rule restores the vacuity it was written to remove, swapping liveness-by-its-own-error-strings for liveness-by-its-own-tests. Every existing call site of compileWorkflow is a test.

Rule (b) is also wrong, for the opposite reason. Masking mitosis.js destroys a genuine call path: mitosis.js:4496 instructs a dispatched implementer agent, inside a prompt template literal, to import buildEngineArgs from engine-args.mjs and call it with fourteen named keys. In an agentic engine a prompt-embedded invocation is a real caller, and masking it manufactures a false positive that would drag an unrelated export into B-6's scope.

The distinction that survives both failures: a reference inside the DEFINING module's own literals is self-referential and proves nothing, while a reference inside another file's literals may be a real dispatch. That is exactly the difference between compileWorkflow's two TypeError messages (workflow-sandbox.mjs:241,:244) and buildEngineArgs' prompt line.

Second finding, from the same read: the intended production caller is itself orphaned. mitosis-gate.mjs is the only non-test, non-doc module in the tree that reads .claude/workflows/mitosis.js as source to analyze; block-inline-engine.mjs:17 only names the path in a denial-reason string. But a repo-wide grep for the gate and for its sole verb phase-parity finds no CI job, git hook, script, package.json entry, settings entry or skill that ever runs it. Only its own unit test calls its exported functions. A production caller that never executes discharges B6 nominally, which is the same class of defect B6 exists to close.

## Options

- Adopt the plan verbatim: mask literals and count tests/ as liveness — restores the vacuity through compileWorkflow's own self-tests
- Mask literals everywhere and keep tests/ excluded — false-positives buildEngineArgs on its prompt call path and drags an unrelated export into B-6
- Mask literals only in the defining module's own body; count mitosis.js and sibling lib modules raw; keep tests/ excluded
- Delete dead-export-lint.test.mjs outright as unfixable

## Outcome

Third option. The lint masks literals only in the module that declares the export, and counts mitosis.js and the sibling lib modules as raw text; tests/ stays excluded. compileWorkflow then scores zero and reads dead until a non-test caller exists, buildEngineArgs stays live on its genuine prompt dispatch path, and nothing is enumerated or allowlisted, so M2 holds. This is a strictly narrower change than the plan's and it produces the M3 receipt 0143 demands as two ordered commits: commit one changes the counting rule and is red on its parent, commit two wires the caller and is green.

The production caller is mitosis-gate.mjs. Compiling its target under the production sandbox is a non-decorative extension of a gate that today validates only phase-token shape and never general JS validity or sandbox-policy compliance. The gate must normalize the leading export const meta the way frontier-train-e2e.test.mjs:24 does, and must COMPILE ONLY, never invoke the returned function — invoking it would dispatch real agents.

B-6 also wires the gate into .github/workflows/test.yml as an executed step, closing the second-order vacuity in the same unit. Without that the caller exists and never runs.

Two constraints re-derived and now on the record. Neither mitosis-gate.mjs nor workflow-sandbox.mjs appears in either mirror mechanism of mirror-guard.test.mjs — not the 21-name twin list at :19, not the engine-args knob region at :29-36 — so B-6 touches no file under .claude/workflows/ and incurs no twinning tax. And mitosis-gate.test.mjs already characterizes resolveCallSitePhases' forwarding behaviour across 477 lines, including forward resolution at :176 and five fail-closed halts at :324-353, so it is the M4 characterization suite the mitosis-gate.mjs:455 ReDoS refactor requires; that refactor may proceed without writing one first, and the semgrep finding is adjudicated by removing the variable-built RegExp rather than suppressing it.
