Shipped waves 1 and 2 to completion and left wave 3 one pull request in.

FOUND FIRST: the thread's own claim that wave 1 was complete was false. U1.2, the name-integrity census, had no implementation at all - no module, no registered gate, nothing censusing names across rules and skills. Three merged wave-1-adjacent PRs made the claim look corroborated. PR 170 was the tell: it repointed dangling names by hand, which is exactly the defect class U1.2 exists to catch automatically.

SHIPPED, all by parallel Opus fan-out with Sonnet workers, each with a red-on-parent check, an inertness mutation and a no-collateral diff:
- PR 191 U1.2 name-integrity census. Live verdict 31 resolved, 0 dangling across 236 files. Publishes a notAttested list naming its own blind spots. It halted on its own constant during development and the lead widened the grammar rather than renaming to hide from the gate.
- PR 190 U2.1 platform-engineer skill, 3114 bytes. Its first head was BLOCKED by the enforcer at G14, 5 of 12 mutants surviving; the lead strengthened the receipt rather than arguing equivalence.
- PR 189 U2.2 conformance-auditor skill, 3080 bytes. Put the three binding laws in the always-delivered body rather than a side file.

All three merged by the user, all three verified LANDED by ancestry rather than by the MERGED label, all branches confirmed deleted. main is 23603b16 and green. Pulled the primary checkout afterwards: the merged config was NOT in force locally until then, and the first census run against the stale tree produced a phantom failure.

DECIDED: 0521 stacked PRs for blocked chains with mandatory parent-branch deletion; 0524 the observer record contract; 0527 the standing order for the fresh session.

0524 is the substantive one. Investigation went to the shipping binary rather than the documentation and found the SPEC's premise false in both directions: no hook event carries a parent, so U3.2's acceptance was unsatisfiable, and 13 fields are unreachable rather than the 7 the SPEC named. But attribution is recoverable from a platform sidecar at a payload-derived path, which also fixes agent_type being "unknown" on 56.7 percent of rows. Record collapses from 22 fields to 10. The official hooks documentation lists fields for SubagentStart that the binary never produces; the binary was treated as authoritative.

FAILED / COST: the binary investigation was unbounded and its subagents consumed over 130 GB of memory before the user killed them by hand. The dispatch demanded ground truth without bounding the method - an instruction defect, not an agent defect. Saved to memory with a bounded alternative. One of those searches also produced nothing across two attempts.

FILED, NOT FOLDED IN: capability_blocked loses its only emitter when U3.4 retires the old observer, destroying decision 0493's work unless the new log gets an event type for it. Separately, agent-fallback-capture.py reads the rationale from the wrong field and 265 rows carry a null rationale while the marker sits on the same row.

LEFT IN FLIGHT: U3.1 pull request 192, feat/observer-write-path at 424924b2, base current with main, 14 of 15 checks green with only the receipts gate still running. Its lead was STOPPED at the user's instruction while it waited on CI, so its final report - acceptance results, ladder downgrades, and where the new observer hook is or is not registered - was never delivered. Read the pull request itself; do not assume. Its worktree is removed and the branch is free for U3.2 to stack on. Note the receipts gate is the one that blocked PR 190's first head, so it may yet fail.