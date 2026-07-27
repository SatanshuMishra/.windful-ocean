---
Status: accepted
Date: 2026-07-27T22:52:45.225Z
Thread-Id: 01KYJTVMQ06B0NY6ENYKZCRYBP
---

# 0049. Full-repo no-baseline scan against the real pinned ruleset clears main and discharges the SAST residue as a security matter

## Context

Two standing caveats both required the same measurement. 0044 held that a green diff-aware CI check is not proof main is clean, and demanded a no-baseline full-repo scan before any such claim. 0038 adjudicated 3 sites as NARROW and 3 unpragma'd sites as benign, but explicitly caveated that the latter rested on a hand-written replica rule -- "confirming needs the real ruleset". Run 2026-07-27 at origin/main (00f495d) with semgrep 1.170.0 against the genuine pinned p/default: 507 applicable rules over 294 files.

## Options

- Continue trusting the diff-aware green and the replica-rule assessment
- Run the no-baseline full-repo scan against the real pinned ruleset and adjudicate from measurement (CHOSEN)

## Outcome

Pin verified INTACT (canonical sha256 d9f73571cb16f43a3a51b5c9c29d712a77bfe5133f684bd7d713347205a55c96, expected == actual): no upstream drift, so the hash-only pin still holds and the feared from-scratch re-adjudication is NOT due. RUN A (no baseline, full repo): 0 findings -- 0044's caveat is DISCHARGED, main is proven clean independently of any baseline. RUN B (--disable-nosem): 23 findings, all mapping to the 19 existing pragma sites; every pragma is load-bearing, none vestigial. The 3 unpragma'd sites (run-engine.mjs, mitosis.js, design-parser.mjs -- lines had shifted, checked by content) do NOT fire under the real ruleset: 0038's replica caveat is DISCHARGED and its benign verdict confirmed. All 3 NARROW suppressions are SOUND with verdict NOT-REACHABLE: for ledger-lint.mjs:77/79 the identifier charset is enforced at scanFlagDeclarations:61 via IDENTIFIER='[A-Za-z_$][A-Za-z0-9_$]*', whose ONLY regex metacharacter is $ -- exactly what escapeIdentifier escapes -- confirmed by an empirical probe feeding hostile source text and extracting zero names; for live-accept.mjs:357 parseVariantNum:598-605 admits only canonical positive decimal integers. CONCLUSION: the SAST residue is discharged as a SECURITY matter -- no CRITICAL/HIGH, nothing exploitable. What survives is a caller-vs-callee documentation gap, not a vulnerability. NEW RISK surfaced by the scan, NOT previously captured: 9 warn-level PartialParsing errors leave regions unscanned in 6 shell hooks (context-wrapup-nudge.sh, ledger-compact-checkpoint.sh, ledger-precompact-checkpoint.sh, ledger-resume-roster.sh, ledger-staleness-scan.sh, secret-scanner.sh -- embedded Python inside shell) plus msp-driven-approach-report.html and receipts.yml. CI shares this exact blind spot, so "0 findings" means "0 findings in what semgrep could parse", and the weakest-parsed area is the security-relevant hook layer.
