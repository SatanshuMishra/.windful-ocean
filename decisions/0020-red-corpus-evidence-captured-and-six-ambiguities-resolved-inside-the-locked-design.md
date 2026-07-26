---
Status: accepted
Date: 2026-07-26T22:35:03.152Z
Thread-Id: 01KYG4AEKA6NM746BXVRAZ9DWE
---

# 0020. RED corpus evidence captured at b60ac56; all six corpus ambiguities resolve inside the locked design with no amendment

## Context

Commits 1-3 of 7 landed on fix/pre-tool-use-guard. Commit 1 b920ddd fail-closed size cap, MAX_COMMAND_BYTES 16384 compared against command.length before scanSegments, deny only when the oversized command names a root by substring; genuine red at the 16385 root-referencing cell, green at 515 pass 0 fail. Commit 2 11cfa0e tokenizer characterization tripwire, 16 tests all pass; every one of the 11 probe-table facts was re-verified empirically against the frozen shell-tokens.mjs and ALL ELEVEN MATCHED with zero discrepancies, so the design's measured foundation is confirmed independently. Commit 3 b60ac56 is the RED corpus, deliberately committed failing so the red state is reachable via git checkout b60ac56 then npm test. Corpus counts as ACTUALLY COMMITTED: 48 deny, 5 ask, 71 allow, 124 cases; the 12 and 41 figures remain floors with no upstream provenance and were asserted as floors only, never as targets and never written into a file header. Verbatim corpus RED block: tests 126, pass 77, fail 49, duration_ms 65.17825. The 49 failing ids are G1 G2 G3 E1 E2 E4 E5 P1 P2 P3 E18 E20 E21 S1 S2 F1 F2 GIT1 GIT2 E8 E9 X1 A1 E3 E6 B4 O1 O2 E16 E22 E23 FP1 J1 OB1 OB2 OB3 OB4 OB5 OB6 OB7 OB8 OB9 OB11 OB12 X2 O2OV HEREDOC1 AWKPIPE SUBST. Four deny cases already pass at red because the TIP guard catches them: N2, N3, E17, OB10. All 71 allow cases pass at red, zero allow-side false failures. Full suite at red: 657 tests, 608 pass, 49 fail, with 531 non-corpus tests green, so nothing pre-existing regressed. The test-engineer flagged six ambiguities for orchestrator resolution.

## Options

- Resolve all six ambiguities inside the locked design, amending nothing
- Amend the design to add a process-substitution carve-out for E12
- Amend the design to allow FP1, the escaped-paren find grouping
- Reopen decisions A-H and re-litigate the over-block bill

## Outcome

All six resolve INSIDE the locked design; NO amendment is warranted and A-H stay closed. (1) FP1 escaped-paren find grouping is DENY: it is Over-Block Bill item 8, named collateral of the control split, and the engineer derived it correctly. (2) J1 deny vs J2 allow already constrains the split to LEADING characters only, which is exactly what the design states - the paren and brace rules fire only when the token is standalone or leading, never mid-token. No change. (3) THE ENGINEER MISREAD E12: no process-substitution carve-out is needed. splitControl already emits a boundary at the leading paren AND THEN EMITS THE REMAINDER as a new head, so diff process-substitution yields heads diff, cat, cat which are all allowlisted, while E1 yields head rm which is not. The post-paren head IS the E1-versus-E12 discriminator and it is already in the design; adding a carve-out would be redundant and would weaken G1's cheapest detector. (4) E16 denying a path that resolves outside the store to /data/etc is a known accepted over-block from the substring scope trigger, not a true positive; recorded as such, unchanged. (5) AWKPIPE ask vs OB3 deny confirms per-segment scoping, which is decision E4 as adopted: the head and residue rules apply to the sub-segment that names the store, the O1 overlay applies across sub-segments. (6) SUBST ask vs the canonical false positive allow confirms the residue rule is specifically dollar-paren or backtick command substitution and NOT bare dollar-VAR, and E7 stays allow because it never names the store - the bounding guarantee outranks residue. Remaining build order unchanged: commit 4 allowlist tables, commit 5 splitControl with the mandatory fd-dup exemption, commit 6 the inversion plus rewriting every mutatesUnderRoot call site in pre-tool-use.test.mjs to classifyBashCommand and deleting the five assertions the corpus now owns, commit 7 the narrow runGuardEntry approved by 0018 call 3. Merge block on fix/pre-tool-use-guard STILL STANDS; do not merge.
