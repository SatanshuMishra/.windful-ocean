---
Status: accepted
Date: 2026-08-10T00:42:17.293Z
Thread-Id: 01KZCF28RN4RMR46VDXFKSQZY3
---

# 0310. The receipt's restated scope flags are disclosed as a threatened M2 rather than fixed in the same unit

## Context

The step 0 receipt proves the workflow passes --event and --base-ref by naming them in its own SCOPE_FLAGS constant, which restates a subset of the flags scripts/invariant-coverage-check.mjs declares. Nothing turns red if the two diverge, and M2 forbids exactly that: a gate that classifies must be a closed census, never a pinned list.

The obvious repair is unavailable. invariant-coverage-check.mjs assigns process.exitCode from main() at module scope, so importing its constant runs the CLI as a side effect. Deriving the list from the checker's full flag set is also wrong, because --root is a flag the workflow must not pass - so no machine-derivable notion of a scope flag exists in the code today.

## Options

- Record M2 as threatened, name the mitigation in the coverage record, and merge with the disclosure - ADOPTED
- Guard the checker's entry point and export the constant in this unit - rejected, M4 forbids a structural refactor sharing one reviewable range with a behavior change absent a characterization test written first
- Parse the checker's source text for its flag list - rejected, the derivation would demand the workflow pass --root, encoding a wrong fact to satisfy a check
- Drop the assertion so no restated fact exists - rejected, it is one of the receipt's three properties, and weakening a check to clear a gate is forbidden

## Outcome

main now carries a self-declared threatened verdict, which is the honest state of the code: a truthful threatened beats a fabricated not-threatened, and the record names the mitigation rather than implying none is needed.

The mitigation belongs to the next unit that opens invariant-coverage-check.mjs. Step (3) must open that file anyway to wire invariant-shape-check.mjs, which makes it the natural home - guard the entry point, export the scope flags, and have the receipt derive from them.

Until that happens, any later change that adds a scope input to the checker must remember to pass it in the workflow by hand, because nothing will fail if it does not. That is the cost being accepted, stated plainly rather than discovered later.
