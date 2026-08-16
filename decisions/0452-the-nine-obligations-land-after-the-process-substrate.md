---
Status: accepted
Date: 2026-08-16T01:38:59.384Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0452. C7 builds the process substrate first and converts the nine obligations onto it afterwards

## Context

C7 was dispatched obligations-first, on the reading that each conversion was an independent edit to a call site. Phase 1 disproved that empirically. mitosis.js is compiled as a single AsyncFunction body (mitosis-scheduler.test.mjs:23-25) inside a VM sandbox that denies require, module, process and dynamic import (workflow-sandbox.mjs:29, :269) and injects only seven hooks (:36). Any library that touches the filesystem, spawns a process or reads a clock is therefore unreachable from the incumbent engine, which is exactly why boundary-gate.mjs, journal-store.mjs and prompt-registry.mjs all have zero production importers today. A pure library can be reached only by verbatim inlining, and run-engine.mjs cannot be converted alone because mirror-guard.test.mjs:45 declares it a WHOLE inline twin. Five of phase 1's eight scope items downgraded to unverified-reasoned against this single wall. The disposition record already stated it - every re-filed obligation is blocked on the caller becoming a process - and the phase order contradicted its own source.

## Options

- Keep obligations-first and reach the libraries by verbatim inlining into the sandbox. Rejected: it duplicates into mitosis.js exactly the code D2 deletes, and prompt-registry.mjs:22 re-exports in a form that normalizes to invalid JS so it cannot be a WHOLE inline twin at all.
- Invert the order: build engine.mjs and cli.mjs first, then convert the nine obligations onto the process substrate they now have.
- Split the obligations across C7 and the D-series. Rejected: it would leave C7 without the end-to-end capability the SPEC says returns at C7.

## Outcome

Invert the order. The process substrate - engine.mjs, cli.mjs, the tick-loop composition per 0451, the integration test - lands first; the nine obligations convert onto it afterwards, within the same MSP and the same acceptance ceiling. Three obligation-adjacent changes that did NOT need the substrate already landed and stand: B3-remainder at d5171ceb, the six mechanical remediation detachments per 0450 at 89bfdae0, and the ship-cut assertion rewrite at 5a0b8128. The ceiling in 2026-08-15-c7-scope-and-ceiling.md is unchanged; only the sequence within it moves. This also converts phase 1's five downgrades from unverified-reasoned into work that is simply not yet due, rather than a capability gap needing escalation.
