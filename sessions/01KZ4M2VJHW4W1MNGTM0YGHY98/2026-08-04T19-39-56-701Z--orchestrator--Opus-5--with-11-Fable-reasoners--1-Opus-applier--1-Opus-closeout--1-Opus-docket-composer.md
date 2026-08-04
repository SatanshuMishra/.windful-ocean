Round 7 executed and completed. The repair round the round 6 gate called for, run under 0238's method.

WHAT SHIPPED

Prep: verified the two documents unchanged since the gate (844/615 lines, anchors spot-checked at SPEC:400/617 and DOCKET:9/401), confirmed the scope fence at the gate's own base (HEAD da0cefd, five porcelain paths, mitosis.js 5,514 lines), and snapshotted both as *.pre-round7.

Partition: all 47 defects split across 10 claim-keyed clusters, each defect assigned exactly once (I3 23, I4 3, I5 5, I7 1, I8 15). Keyed by CLAIM rather than by document or invariant, so both halves of every mirrored claim sat with one owner. An 11th cluster (K11) was added mid-round for the 0125 misquotation, found by K9 and owned by nobody.

Authoring: 11 Fable subagents, hard-fenced read-only on both documents, each writing only its own patch file. 126 edits authored. A published site-ownership map plus a running collision register (13 entries) carried cross-cluster interactions the authors could declare but not settle.

Fold: one Opus applier (0235). 122 of 126 applied, 0 failed anchors, 0 unlanded pairs. Replaying the 122 edits onto the untouched snapshots reproduced both live files byte-for-byte, proving zero collateral change. It found one collision the register missed (DOCKET:223, edited by both K1 and K3, undeclared by either; disjoint by 182 bytes, both intents survived).

Closeout: the 4 held edits were closed by re-measurement, and round 7's own changelog was written into both documents (SPEC preface repair history, DOCKET Section E), non-exhaustive per SPEC:17's register and explicit that round 7 carries NO verdict.

RESULT: 43 of 47 defects closed on the patches' own accounting, unverified by any gate. Four remain, all reserved to the user: I3-23, I4-1, I8-2, I8-5. Documents grew SPEC 844 to 885 lines, DOCKET 615 to 632. No code changed; HEAD still da0cefd with exactly five porcelain paths. Nothing committed, nothing pushed.

WHAT ROUND 7 FOUND THAT THE GATE DID NOT

Nine previously-unlogged sites of the gate's OWN claims, every one byte-identical to .pre-round5 - they survived a round 6 gate specifically hunting that shape: DOCKET:403, DOCKET:536, SPEC:149 gloss (K4); SPEC:240, SPEC:129, DOCKET:223 (K3); SPEC:820 (K7); SPEC:772, DOCKET:422 (K2). Also MSP-8 absent from the START HERE table entirely (K9); a paraphrase of 0125 presented as a quotation at SPEC:65/788 and DOCKET:48, inside an [RB-RATIFIED] bullet two lines below the contract saying that marker IS a quotation - same instant, so meaning never changed, purely presentational (K11); two self-refuting grep claims about invariant-coverage (K6); and record 0219 carrying the same Context-resident attribution shape as 0195, an unflagged instance of the same double standard (K2).

Three gate errata: 0197 appears nowhere in either document, so I4-2's attribution claim is not reproducible (the constant is cited with NO ratifying record; true record is 0086) - K1; the corpus was 238 not 236, records 0237/0238 having landed at 12:16 after the gate measured - K1; I3-5's cited DOCKET:146 is an empty line, real sites are DOCKET:83/219/561 - K3.

WHAT FAILED, AND WHY

The K5/K8 fold contradiction. K5 replaced a vague "most explicitly labelled" with an exact six and enumerated them; K8 then added that literal label to eight more blocks. Each patch was correct alone; K5's figure was false the instant K8 landed. Neither author could have seen it. The applier held all four of K5's edits together rather than invent a figure no patch authored, leaving I5-3/I5-4 open at fold time. Closeout re-measured from scratch (15 occurrences = 14 Recommendation-block openers + 1 meta-use in DOCKET:9's own prose; unlabelled blocks are D-01 and D-13; split is 6 pre-fold + 8 from K8) and landed the corrected matched pair with K5's marker placement preserved byte-for-byte so the pending I3-23 ruling was not pre-empted. I5-3/I5-4 are closed. Recorded as 0240.

One orchestrator error, caught by the subagent: K6's dispatch prompt attributed MIRROR_CENSUS to mitosis.js. It lives in .claude/lib/superpowers-parallel/tests/mirror-guard.test.mjs. The gate report names no file; the orchestrator supplied the wrong one. K6 verified the real location before writing anything under a fact marker.

DECISIONS RECORDED: 0239 (claim-keyed partition, parallel read-only authoring, single applier on a higher tier - the Opus applier directed by the user), 0240 (fold-time contradictions are held, never reconciled by the applier).

DELIVERABLE FOR THE USER: round7-patches/RESERVED-QUESTIONS-FOR-RULING.md - eleven questions, up from the gate's six, ordered by how much each unblocks, with mapped options and consequences and no recommendations. Q1 (where an [RB] note's scope ends, four options) and Q2 (what "user-ratified" means) gate others; K6 named SPEC:865 and DOCKET:510 as the revisit sites if Q2 rules the other way. Q9, Q10 and Q11 block nothing. Two questions (Q5, Q11) had no mapped option set and say so rather than inventing one.

ARTIFACTS: all under handoff-2026-08-03-mitosis-core-rebuild/artifacts/round7-patches/ - 00-COMMON-BRIEF.md (the contract all reasoners worked to), 00-APPLIER-BRIEF.md, 00-COLLISION-REGISTER.md, 00-STATE.md, PATCH-R7-K1..K11.md, APPLY-REPORT.md (with the Closeout section), RESERVED-QUESTIONS-FOR-RULING.md. Rollback baseline is *.pre-round7 in the parent artifacts directory, byte-identical to the dispatch hashes.

NOT DONE, DELIBERATELY: the gate was not re-run (user instruction), so round 7 has no verdict. The audit, anchor derivation and band enumeration were not re-run. DOCKET:551's "every pair landed on both sides" was left as the fold left it - further falsified by round 7's findings, not rewritten.