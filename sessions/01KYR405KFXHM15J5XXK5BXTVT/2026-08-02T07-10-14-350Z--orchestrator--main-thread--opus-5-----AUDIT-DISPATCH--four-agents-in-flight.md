FOUR AUDITS DISPATCHED AND STILL RUNNING AT THE TIME OF THIS WRITE. Nothing implemented, nothing staged, nothing committed, nothing pushed, no PR. The thread is deliberately left ACTIVE because work is in flight; this entry exists so a crashed session is not a total loss.

USER SAID "Approved. Go." on the 0201 audit-first directive. Reading order executed as the next_step required: the 2026-08-02T06-59 session entry, then 0200 and 0201, then the M4 REMAINING-PHASES BRIEF, then the THREE DECISIONS (A-D). Ledger read via git on the _ledger branch: there is NO MCP read tool for session entries or decision records, only writers plus get_resume_brief, so `git show _ledger:<path>` is the only read path. Note that for future sessions - the lift-off skill asserts the spine is sufficient, and for this thread it was not.

GIT STATE CONFIRMED AGAINST THE LEDGER, no drift: fc035fc on feat/m4-divergence-instrumentation sits on 777617b on feat/m4-fixed-build-ahead-cap; neither pushed; five pre-existing dirty paths exactly as described; four deliberate worktrees present.

DISPATCH, one dedicated audit per finding, all read-only, all forbidden from implementing:
- F2 invariant-coverage gate (researcher) - PRIORITY, blocks both commits.
- F1 foreign-branch-filtering coverage (researcher).
- F3 buildAheadCap silent null refusal (SOLUTION-ARCHITECT, chosen because this is a which-surface question, not a does-it-work question).
- F4 inert window:9999 clamp-test premise (researcher).

EVERY PROMPT CARRIES: 0201's method rule verbatim (a drafted mutation-proven fix answers 'does this edit work', never 'is this the right surface'); an explicit instruction to inherit NO claim unmeasured, including the lens verdicts; re-locate by symbol because 777617b moved every line number; the 1830-not-1839 baseline; mutants only via MITOSIS_PATH scratch copies with a distinct scratch dir per agent; hands off the five dirty paths and the four deliberate worktrees; no git add / stash / checkout / commit / push, and no PR path at all.

ONE QUESTION ADDED THAT NO LENS COVERED AND NO PRIOR ENTRY NAMES - AMEND MECHANICS. Amending 777617b changes its SHA, so feat/m4-divergence-instrumentation must be REBASED onto the new commit 1, and that rebase demands its own re-verification (full suite on each commit separately, mirror guard, and the coverage gate re-run on each). Since 0201 already ruled the coverage remedy is an amend to EACH commit, this rebase is now on the critical path and is exactly the unnamed-path shape the standing fix-round memory warns about. All four audits must state whether their remedy requires it.

TWO SHARPENED SUB-QUESTIONS WORTH KEEPING IF THE AUDITS CONFIRM THEM: (1) for F2, what GITHUB_BASE_REF does to the computed diff of a STACKED PR whose base is feat/m4-fixed-build-ahead-cap rather than main - whether PR 2 needs its own coverage file, or whether commit 1's file falls out of PR 2's diff entirely. (2) For F3, whether the null-swallowing is ONE clause or a CLASS of engine args sharing the shape, in which case the drafted one-clause deletion fixes one instance of a general defect.

NEXT ACTION WHEN THE AUDITS RETURN: reconcile all four reports AGAINST EACH OTHER before any implementer is dispatched. Several remedies land in the same two commits, so the amend-and-rebase sequence gets planned ONCE, not four times. Do not dispatch implementers per-finding in isolation.