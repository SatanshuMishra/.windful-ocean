---
Status: accepted
Date: 2026-08-11T23:53:14.851Z
Thread-Id: 01KZQ2BVF2386ATV5YFD43NQVX
---

# 0353. The engine stays in the Workflow sandbox, so Part III codegen decomposition is live again

## Context

0352 cut the SDK supervisor and the dispatched orchestrator but explicitly left the engine's RUNTIME undecided, and by withdrawing the Node host it withdrew 0325's justification for dropping Part III, leaving the ~25 verbatim inline module twins undecided. Re-verified 2026-08-11 against the working tree: .claude/lib/mitosis/workflow-sandbox.mjs:269 throws SandboxViolationError('import', 'dynamic import()'), and HOOK_NAMES at :36 is frozen at args, agent, parallel, pipeline, log, phase, workflow - budget is absent from it. SPEC B section 7 rules out leaving the Workflow runtime because doing so forfeits agent(), the only effector, and the SDK host that was to replace that effector is now cut.

## Options

- Engine stays in the Workflow sandbox, invoked by the main thread - chosen
- Engine runs as a plain Node script via Bash, with no agent() effector
- Revive an SDK host purely to host the engine

## Outcome

The engine stays in the Workflow sandbox and the main thread invokes it. The consequence is recorded rather than buried: 0325 dropped SPEC B Part III (codegen decomposition, the generator, the byte-identity proof, the mirror-guard role change) as MOOT because a real Node host restores ESM. With no Node host, Part III is UN-MOOTED and returns as live work, and the inline module twins remain forced by the sandbox's import refusal rather than being a legacy choice. The citation SPEC B carries for this fact is stale and must be re-cut: .claude/lib/superpowers-parallel/workflow-sandbox.mjs:36 is now .claude/lib/mitosis/workflow-sandbox.mjs:36, and .claude/lib/superpowers-parallel/ survives only as an untracked 324K leftover holding graphify-out and tests, with 0 tracked files against mitosis's 97.
