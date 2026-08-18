Executed directive 0573's audit phase: no implementation, no engine run, no git mutation, nothing edited in the repo.

WHAT SHIPPED (durable, outside the repo, at ~/.claude/projects/-Users-satanshumishra-Documents-DevLabs--windful-ocean/artifacts-2026-08-18-boundary-audit/):
- family-1-state-loss.md (172 lines, all 8 charter sections) — "state that dies at a phase or process boundary".
- family-2-false-success.md (262 lines, all 8 charter sections) — "status fields that report success for non-success".
- family-1-notes/ (w1-w5 + lead-timeline-draft, ~1050 lines) and family-2-notes/ (w1-w5 + _brief, ~750 lines): per-worker evidence with quoted code and path:line citations.
Both reports carry a closed census (state-surface x boundary; status field x population), numbered root causes with symptoms grouped under them, fragility/complexity counts, a test-coverage map, labelled CANDIDATE remedies only (C1-C10 and C-1..C-12), and an explicit [unverified] list. No implementation was proposed as settled.

FAMILY 1 ROOT CAUSES (audit lead's result, cites relative to the audit worktree):
RC1 resume "settled" hole — settled = forge-merged union status==='built' (resume-plan.mjs:148, parking.mjs:96,114); 'shipped' is set at PR OPEN (recovery.mjs:141-145) and reconcile only queries --state merged (gh-commands.mjs:65), so a shipped-but-open unit and a parked unit are both re-planned and re-implemented from zero. Explains 0571's re-parked shipped unit and 0526.
RC2 journal rewritten at every process boundary — unconditional writeGenesis (engine.mjs:297) via replaceFileAtomically (journal-store.mjs:241); deliberate, tested compaction (journal-store.test.mjs:127-134). Destructive in combination with RC1.
RC3 no NeedsHuman remediation path — remediatePhase is a stub (phase-driver.mjs:290-293); runRemediationLoop is fully built and tested with zero production callers; park diagnosis computed then dropped (engine.mjs:227-238).
RC4 boundary gate content collapse (0569) — HEAD census scans the untouched repoRoot (boundary-collect.mjs:556-562) while worktree-isolated children commit elsewhere; the INTEGRATE git site (git-commands.mjs:54-61) has zero production callers; no integrate journal kind exists.
RC5 prState probe is Execute-phase, run-wide, and read by nothing but the summary (engine.mjs:317-325, cli.mjs:532); the load-bearing oracle is ship-publish.mjs:142-153.
RC6 lock never auto-recovered after a kill (run-store.mjs:233-247); relative --journal refused only at engine.mjs:297, after the lock, plan.json and paid Prep dispatches.
Fragility: 10 unit-state representations, 6 computations of "what already happened", 3 unrelated "attempt" counters, at least 7 built-but-unwired or write-only subsystems. Test receipts run by the lead: journal-store 55/55, phase-driver 24/24, parking 26/26, e2e-integrate-boundary 2/2, all exit 0. No test runs two consecutive invocations over one journal; planResume and resume-plan.mjs have no test file.

FAMILY 2 ROOT CAUSES:
RC-1 no single terminal-state function — six independent outcome derivations juxtaposed in one summary (cli.mjs:504-516; merge-policy.mjs:29-53; leases.mjs:90-94; exec-run.mjs:106-115; pr-state-facts.mjs via ship-publish.mjs:143-152; engine.mjs:139-161).
RC-2 names hide the population — 'all-shipped' counts only Ship's units (ship-plan.mjs:580-587, total = integrated.length); 'partial' is the bare fallthrough (merge-policy.mjs:52) covering both "nothing pending" and "nothing shipped".
RC-3 last-write-wins journal fold with a precedence guard in only one writer — recovery.mjs:184 protects shipped-vs-built, parking.mjs:66-69 clobbers shipped with park; restarted means only "journal identity matched" (resume-plan.mjs:152).
RC-4 vacuous pass — boundary gate pass = blocking.length===0 over a possibly empty or base==head domain (boundary-gate.mjs:55-57,61-75); boundaryFixes:0 is a literal (integrate-plan.mjs:173,186).
RC-5 "shipped" means PR opened, consumed as landed (ship-plan.mjs:346-357,425-435); 0526's all-unwatched-CI case is pinned as intended by tests/e2e-ci-green.test.mjs:112-125.
RC-6 decompose cannot represent "no work" (decompose-schema.mjs:29,34 minItems:1 plus constrained generation at dispatch.mjs:251-253) — 0529.
RC-7 attestation over a stand-in — EXEC_ALLOWLIST_ATTESTS[2] (mitosis-gate-core.mjs:43) proved against specimens fed NO_INDIRECT_IO; the real stdin reader gh-merge-shim.mjs:318-352 has zero tests — 0525.
Also established: 0541 is fixed and regression-pinned (ship-stack.test.mjs:187-199) but green is structurally always false (cli.mjs:703 never supplies it); merge-watch.mjs and handoff.mjs are tested dead code with zero production importers; resume-plan.mjs and integrate-plan.mjs have no dedicated tests; SKILL.md's exit-code table matches the code but its field list omits five summary blocks including outcomes.

WHAT FAILED, AND WHY:
Anthropic opened an incident at 16:20Z, "elevated errors on requests to Claude Opus 5" (status.claude.com, still investigating at session end). Every agent in ~/.claude/agents pins a model in frontmatter — 7 opus, 6 sonnet — so the first two audit leads and all their workers died on API 529 at their first call, repeatedly, across four resume attempts and three backoffs (2 min, 5 min, 10 min) plus a 30-minute status poll that never cleared. The main thread was never affected, which is what made the tier-specific cause visible. Re-dispatching the leads with an explicit model override (fable) and instructing them to route their own workers to sonnet resolved it immediately; both reports then completed. Roughly an hour of wall-clock was spent on this, no work product was lost, and the retired agents' partial output was superseded rather than merged.
One incidental defect observed: the artifacts directory was silently removed twice while empty; creating it with a file inside made it persist. Not investigated.

INFRASTRUCTURE LEFT IN PLACE:
- Read-only audit worktree at .claude/worktrees/boundary-audit, detached at origin/main ffb6103f. Deliberately created so auditors never touched the primary checkout, which holds another thread's staged Wave 7 work on chore/wave-7-delete-retired-agents. It is unmodified and can be reused by the next session or removed with `git worktree remove .claude/worktrees/boundary-audit`.
- Nothing else was created, and no background process is still running.

NOT DONE (deliberately, per 0573): the whole-solution design for both families. The reports stop at root cause plus labelled candidates; the architecture judgment (is the system too fragile, too complex, does it need simplifying, where does it depart from best practice) and the single settled solution are the next phase's work.