Session pivoted from the parked billed run into diagnosis, then into an approved migration SPEC. No code was changed and no billed run was spent. Six read-only agents ran; all returned.

WHAT SHIPPED

1. The park question is answered. A failed implementation review parks at cli.mjs:836 with retryable unset and no ledger.record call, so engine.mjs:41's retry gate never opens and the wired remediation modules are never reached. The dispatch-failure branch eleven lines above does both. Proven by a control run: a dispatch failure produced a diagnostician child, a review failure produced a byte-identical repeat prompt. All four review outcomes, including "the lens could not run", collapse into one non-retryable park. A second, independent dead path: the Remediate phase only acts on ApproachFixable, which no production code ever assigns.

2. The fanout premise was inverted. Mitosis's scheduler spine existed 2026-07-20; fanout's repo was created 2026-08-10; fanout's planning vocabulary entered this repo 2026-08-12. Sibling projects, not a fork. Mitosis is ~25x fanout's source, 8 phases against 2. Seven fanout capabilities mitosis never took, including per-item model tiering and --dry-run.

3. The recurrence has a named mechanism. Every instrument capable of telling live truth is built outside the repository and outside CI, where no gate grades it: the artifact the testing SPEC names as its own root cause is not in the repo, the predictiveness census excluded it by construction and returned 0 rewrite rows, all ten failure scenarios and the sweep driver are out of repo, and the one cassette bought with real money has zero consumers. Five testing overhauls in 34 days, three substantially deleted by the next.

4. The conformance audit settled the user's question. The governing property IS in the testing SPEC, in its title and section 1 - but under "The property this SPEC buys", and absent from the inherited-invariant list, so no unit could fail for missing it and none did. 75 obligations enumerated: 49 met, 18 not met, 8 unverifiable. The declared guarantee itself not met. The second half of the standard, that a red means something real is broken, appears nowhere in that SPEC.

5. An approved extraction SPEC exists. 1,603 lines, 16 units, each with files, an acceptance criterion, a verification command and a mandatory Unproven field. Governing property quoted verbatim as section 1.1 AND as I1, the first inherited invariant. Four tiered lanes split on the boundary that nondeterminism lives in the model's content, not its interface. Authored cassettes legal only with a conformsTo field naming a real capture, enforced as a load-time refusal rather than README prose.

WHAT FAILED OR WAS WITHDRAWN

The headline "zero commit bodies credit a test with catching a defect" did NOT survive corroboration. A mechanical body-only pass over all 131 fix commits scored TEST 6, LIVE 8, GATE 13, REVIEW 5, UNSTATED 99. At 76% unstated the commit-body census cannot carry an asymmetry claim in either direction. The structural argument stands on the fixture architecture instead, which is direct evidence. Memory was corrected on contact.

NOT RUN, DELIBERATELY

No live engine run. No implementation. Section 9 of the SPEC and U12's scope were flagged to the user for reading before anyone executes.