---
Status: accepted
Date: 2026-08-06T19:29:46.490Z
Thread-Id: 01KZC5TSBXJDM28F8ZCRXC9JQM
---

# 0267. Workflow runtime forbids dynamic import, so codegen is the only path off the twinning tax

## Context

mitosis.js is 5,515 lines largely because the Workflow runtime executes it as new AsyncFunction('args','agent','parallel','log','phase','workflow', body) with no module resolution, forcing ~25 clean .mjs modules to be hand-copied verbatim inline and kept in sync by mirror-guard.test.mjs:26-66. The codebase-analyst flagged one possible escape: ~/.claude/workflows/parallel-plan-execution.js:27-28 performs a top-level await import('node:os') and a file:// import of run-engine.mjs, implying production might permit dynamic import even though the local test sandbox forbids it. Settled 2026-08-06 by running a zero-agent capability probe through the real Workflow tool. Measured production global surface: require undefined, process undefined, module undefined, fetch undefined, globalThis object, Function available, workflow hook available. All three dynamic imports failed identically with the explicit runtime error "import() is not available in workflow scripts."

## Options

- Dynamic import works in production: the twinning tax evaporates and mitosis.js collapses to a thin stub importing canonical .mjs modules. REFUTED by measurement.
- Generate mitosis.js by literal concatenation from the canonical .mjs sources, replacing hand-copy-plus-mirror-guard-diff with real codegen. Precedent exists in-repo at generate-run-script.mjs:19-32.
- Move the engine off the Workflow runtime entirely. Forfeits agent(), which is the only effector available, so it is not viable without designing a replacement effector.
- Keep hand-maintained inline twins and the mirror-guard test. Status quo; the file keeps accreting.

## Outcome

Dynamic import is REFUTED by direct measurement, so the twinning tax is structural and permanent, and codegen is the only viable path for the decomposition goal. Three consequences the new SPEC carries. First, ~/.claude/workflows/parallel-plan-execution.js is dead code whose top-level imports would throw on invocation; nothing calls it, since mitosis.js has zero workflow() call sites, and block-inline-engine.mjs guards an entry point that could never have worked. Second, both existing test harnesses misrepresent production in OPPOSITE directions and must be corrected against this measurement: mitosis-scheduler.test.mjs:22-24 rebuilds the engine with new AsyncFunction in real Node, far more permissive than production, while workflow-sandbox.mjs:36 denies Function, which production actually allows. Third, the sandbox validator is a SOURCE-level check, not runtime-only: it rejected a probe that merely mentioned Date and Math.random inside typeof expressions, so generated output must avoid those identifiers textually.
