---
Status: accepted
Date: 2026-08-16T05:39:58.852Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0458. The sast ReDoS finding is fixed by a frozen literal table, and semgrep joins every acceptance ceiling

## Context

PR #137 passed twelve of thirteen checks - receipts, test, pr-title-lint, label, sca, secret-scan and all three mitosis-gate verbs - and was blocked by one Semgrep finding: detect-non-literal-regexp at decompose-schema.mjs:90, new RegExp(node.pattern).test(value). DECOMPOSE_SCHEMA is deep-frozen and lib-resident so there is no live exploit, but the module exports validateAgainstSchema(schema, value, label) as a generic validator over any caller-supplied schema, which makes the dynamic-RegExp surface reachable by a future caller. This repository has already lost a fix round to a ReDoS in the receipts enforcer. Separately, the finding could only appear at CI because the acceptance ceilings written for both units of this MSP enumerated the four mitosis-gate verbs and npm test and never named sast; semgrep was subsequently found installed locally, so it never needed to be a CI-only check.

## Options

- Suppress with a nosemgrep pragma, which the no-comments carve-out permits as a tooling directive
- Replace dynamic construction with a frozen table of regex literals, guarded against pattern-to-literal drift
- Keep the dynamic construction and argue the frozen schema makes the finding a false positive

## Outcome

Fix it with a frozen table of RegExp literals, one per patterned schema node, looked up by source equality; an unknown pattern halts with a named error rather than silently skipping the check. DECOMPOSE_SCHEMA keeps its string patterns untouched and stayed byte-identical at 980 bytes, so the --json-schema payload the decompose child receives is unchanged. The drift hazard the swap introduces is closed by a census that halts in BOTH directions - a patterned node with no literal, and a literal claiming no node - proven against the real schema and the real table, with no pinned count and no allowlist. A pragma was refused because suppression of a ReDoS class this repository has already been burned by buys a green check and no safety. Two standing consequences: semgrep runs locally and therefore belongs in every acceptance ceiling for the rest of this stack alongside the four gate verbs, and validateAgainstSchema's exported contract is now honestly narrower - it serves only schemas whose patterns this module ships, and refuses the rest instead of validating less than it claims.
