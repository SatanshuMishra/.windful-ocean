---
Status: accepted
Date: 2026-08-24T20:01:11.393Z
Thread-Id: 01M0RZP75VCZJPP2R127YBFK3Z
---

# 0718. The path-literal census classifies by rule; the allowlist holds only the residue

## Context

U2.1's census was first built against an orchestrator-supplied predicate: a literal is path-shaped if it contains a slash or ends in a known file extension, and everything unresolved fails closed. Against the repository that predicate produced 3640 candidate literals and, to reach the unit's acceptance criterion, a 1440-entry allowlist of 378KB. Eleven reason shapes covered it: 1200 synthetic fixture and example-URL values, 110 git refs and refspecs, 32 ambiguous basenames, 27 bare extension constants, 2 git-internal paths, and 3 genuinely load-bearing entries for the modules deliberately not carried. The project testing rule forbids a sampled allowlist as a change-detector wearing a census costume, and with the allowlist's self-cleaning clause active every specifier U2.2 rewrites and every test U4 deletes would turn the check red for reasons unrelated to a carry gap.

## Options

- Keep the 1440-entry allowlist: the acceptance criterion is met and the check does fire on a real carry gap
- Narrow the predicate and classify each category by a stated rule with a printed count, leaving the allowlist as the small residue no rule covers
- Drop the census and prove the carry by a module-presence check alone

## Outcome

Classify by rule, not by entry. The set of in-scope file extensions is computed from git ls-files at run time rather than hardcoded, so a literal naming an extension the repository does not ship is out of scope and stays correct as the repository changes. Git refs, URLs, globs, bare extension constants and git-internal paths each become their own predicate with a stated reason and a printed match count. An ambiguous basename matching two or more tracked paths is classified as present-at-multiple-paths rather than failed, because this census answers presence and wiring belongs to U2.2. No blanket exemption for literals appearing in test files, which would gut the red-on-parent baseline. The allowlist keeps only what no rule covers, and every surviving entry must be individually defensible. The defective predicate was the orchestrator's instruction, not the implementer's execution.
