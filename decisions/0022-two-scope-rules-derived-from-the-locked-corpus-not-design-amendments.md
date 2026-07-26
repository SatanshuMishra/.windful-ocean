---
Status: accepted
Date: 2026-07-26T23:27:00.947Z
Thread-Id: 01KYG4AEKA6NM746BXVRAZ9DWE
---

# 0022. Two scope rules were DERIVED from the locked corpus, not amended into the design: cwd-scope and control-split inheritance

## Context

Commits 4-6 landed on fix/pre-tool-use-guard: c304b7c allowlist tables, 025a5a3 splitControl, 1668944 the inversion. Corpus went 126 tests / 77 pass / 49 fail at 025a5a3 to 126 / 126 / 0 at 1668944; full suite 675 pass / 0 fail. Measured corpus counts as committed: 48 deny, 5 ask, 71 allow, 124 cases plus 2 floor assertions; 12 and 41 remain floors with no upstream provenance. While writing the commit-6 dispatch the orchestrator found the design prose under-determines two points that the USER-APPROVED corpus nonetheless forces. FIRST: OB5 (cd ROOT then rm -rf dollar-D) must deny, but its second segment names no root and dollar-D is unresolvable, so Decision A rules 1 and 2 never put it in scope; only the tracked cwd reaches it. SECOND: FP1 (find ROOT escaped-paren grouping) must deny via the head dash-name per Over-Block Bill item 8, but that sub-segment carries no root token either, so per-sub-segment scoping alone returns allow. Both were derived, hand-checked against all 71 allow cases before dispatch, then confirmed empirically when the corpus went fully green with no case edited. Commit 5 also established that standalone paren and brace tokens never survive splitControl, so Decision D's residue clause about surviving control tokens is unreachable in practice and the rule reduces to backtick and dollar-paren.

## Options

- Derive both rules inside the locked design and prove them against the untouched corpus
- Amend the design with new scope rules and re-open Decision A
- Edit the corpus so FP1 and OB5 expect allow, matching a literal reading of the prose
- Ship per-sub-segment scoping only, leaving FP1 and OB5 failing

## Outcome

Both rules are DERIVATIONS, not amendments; A-H stay closed and no corpus case, id, command or expectation was touched. (1) CWD-SCOPE: a sub-segment is in scope when the tracked cwd in effect for it is itself under a root, alongside the resolvable-token and raw-substring triggers. (2) CONTROL-SPLIT INHERITANCE: when any sub-segment produced from ONE original segment is in scope, all sub-segments of that segment are in scope. Inheritance NEVER crosses a tokenizer segment boundary (and-and, or-or, semicolon, newline, pipe) - crossing would resurrect the canonical false positive, which is exactly the whole-command scoping that decision 0018 disqualified. Inheritance is not merely FP1 collateral: without it ls ROOT ampersand rm -rf dollar-D evades entirely, since the backgrounded sub-segment names no root and carries only an unresolvable token. Load-bearing conjunction confirmed in the same pass: overlay O2 requires the unresolvable token AND the SINK_HEADS head on the SAME other sub-segment, which is the sole reason the canonical live false positive stays allowed - its cat segment has the unresolvable token but cat is not a sink, its python3 segment is a sink but has no unresolvable token. Verified by a programmatic check that all 38 surviving guard assertions in pre-tool-use.test.mjs kept their verdict (true to deny, false to null), 38/38 with zero flips; exactly the five assertions the corpus now owns were deleted. Merge block on fix/pre-tool-use-guard STILL STANDS.
