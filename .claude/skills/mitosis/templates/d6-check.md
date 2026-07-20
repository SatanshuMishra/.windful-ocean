# D6 cluster-boundary interaction check (convention)

Composed CI step beside the unmodified receipts enforcer. Covers the irreducible semantic-conflict residual no static oracle catches — the seams where native-LSP recall fails (dynamic dispatch, dependency injection, FFI, SQL, codegen). Receipts' G7 (dependent-test-selection) is unbuilt, so each project supplies this.

## Contract

Invoked by `.github/workflows/receipts.yml` as: `node scripts/d6-check.cjs --base <baseSha> --head <headSha>`. Write the script as CommonJS in a `.cjs` file so it runs regardless of the target repo's package.json `type` (an ESM/`type:module` repo would break a `.js` CommonJS script).

The script MUST:
1. Build the reverse-dependency set of the files changed between base..head, using the stack's import grapher: dependency-cruiser or madge (JS/TS), grimp or importlab (Python), `go list -deps` (Go).
2. Diff against the merge base and keep ONLY the NEW dependents (the integration-regression subset introduced by this change).
3. Map each new dependent to its tests and run them on head.

## Verdict folding

- A new dependent whose test FAILS on head -> exit non-zero (BLOCK).
- A new dependent with no test -> print its name and WARN (do not block).
- No new dependents, or no import graph available for the stack -> print "dependents not computed" and pass (honest degradation — NEVER a false all-clear).

## Why composed, not depended-on from receipts

receipts' G7 exists only as design prose (enforcer/GENERALIZATION.md), not in enforcer/verify.js. The session-end Notion Stop hook is inert on non-Notion trackers and not config-fixable, so it is never the gate. The CI enforcer (red->green receipt, G8 fresh-base, G9 full-suite, G10 contract backstop) plus this D6 step are the merge gate.
