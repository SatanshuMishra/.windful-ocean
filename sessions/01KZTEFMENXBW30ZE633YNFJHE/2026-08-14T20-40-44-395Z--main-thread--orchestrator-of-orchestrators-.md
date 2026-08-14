Shipped six MSPs as stacked PRs by dispatching five successive dedicated orchestrator subagents, per the user's instruction that a dedicated orchestrator fan out to workers.

SHIPPED, every claim re-verified against git by the main thread rather than taken on the orchestrator's word:
- B3 critical-path ordering, PR #100, head 18d5e4c9, base feat/mitosis-os-process
- C1 phase model thirteen-to-eight, PR #101, head 65a696a4
- C2 prompt registry, PR #102, head fb195e47
- C3 journal dispatches, PR #103, head 4656b8ad
- C4a transcription substrate and census, PR #105, head 7f0e7513
- C4b the twelve git sites, PR #107, head 6acc7171

Full chain linearity verified end to end at every hand-off: each head is an ancestor of the next, every branch pushed with local == origin, every PR based on the previous MSP's branch. Nothing merged; merging stays human-gated.

WHAT FAILED. Orchestrator run 1 was killed by the host Claude Code process exiting mid-B3, losing its in-process state. B3's work survived on disk but existed nowhere in the record: a built and pushed branch with no PR, no test counts, no review verdicts, no mutation proof. The main thread reconstructed the state from git and wrote STACK-STATE.md, and run 2 verified rather than rebuilt it. Two hardening rules came out of that loss and are now binding in the brief: write STACK-STATE.md after every worker returns rather than once per MSP, and open each PR as soon as its MSP verifies, because a pushed branch with no PR is invisible state.

WHAT DID NOT FAIL. Decision 0385 had rejected the nested orchestrator in practice because a dispatching agent ends its turn narrating that it is holding while nothing ran. The user overrode that and it held across all five runs: every child was dispatched with run_in_background false, and roughly forty workers really ran and really committed. The guard, not the pattern, was the fix.

THE RECURRING FINDING. Every MSP hit the same trap: a SPEC claim whose stated fact was true but whose conclusion was false. C1's premise, C2's file paths and counts, C3's three-way collapse, C4's four false claims, C5's decorative verdict, C6's already-diverged prose bodies, and in C4b five further errors inside a plan that had itself been verified. Verifying every claim against a running command before planning against it is now binding.

THE MOST DANGEROUS DEFECT. C4a's manifest-ref policy shipped inert: a complete, well-tested module with zero production callers, while the gate printed that force-push onto the manifest ref was refused. Neither reviewer caught it by reading; only by running. C4b then found the same class again, plus live arbitrary code execution via git option injection at seven sites. The generalizable rule is to mutate at the gate rather than only at the suite, because a guard whose removal reddens the suite but leaves its verb at exit 0 means the verb overclaims, and the verb's receipt is what C7 will trust.

STOPPED DELIBERATELY at C4b on the user's instruction, for a fresh session to resume at C4c following the same fan-out pattern.