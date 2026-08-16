---
Status: accepted
Date: 2026-08-16T08:01:06.272Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0466. The falsifier is unevaluable, and c6 closes as a tracked downgrade rather than a false pass

## Context

D3 shipped as PR #143 and did everything its re-scoped ceiling named: the dispatch envelope now survives the pool seam into the frozen terminal record, decompose-emit and cli retain it, run-store gained a per-attempt recordUsage that takes its timestamp as a validated argument so the determinism verb stays green, and fifteen tests were proven red on the parent with two separate inertness mutations. The report landed under .claude/docs/ because .claude/reports/ is gitignored. But criterion c6 as written demands a MEASURED comparison against the pre-move baseline with cold and warm cache reported separately, and that is impossible: no .mitosis directory exists anywhere, so no engine dispatch exists to divide by a shipped MSP. The proxy D3 published measures human-orchestrated dispatches, a different population, and D3 measured its own disqualifying limits rather than assuming them — the token field is a non-decreasing session watermark with 8490 rows collapsing to 2295 distinct session-token pairs and zero exceptions across 333 sessions, 64.3 percent of rows carry agent_type unknown, emitter is the constant main on 100 percent of rows, outcome is null on 100 percent, and consequently the log cannot even establish whether one row is one subagent dispatch or one main-thread turn. The leak gate was live rather than theoretical: 4439 rows in the pinned snapshot carried a confidential cross-project identifier and were excluded by the project filter, with zero codename hits verified across the 8814 rows the report draws on.

## Options

- Mark c6 done because the report shipped and the plumbing landed
- Publish the proxy as the falsifier measurement so the release gate can resolve
- Close c6 as unverified-reasoned, record the falsifier as unevaluable, and leave the release gate to a human

## Outcome

c6 stays open as a tracked unverified-reasoned downgrade rather than being marked done. Eight items carry that status in the report with their reasons: the 10-dispatch falsifier, all four token metrics, total_cost_usd, the cold-versus-warm cache split, and the baseline comparison. Marking c6 done would be exactly the false fixed the honesty ladder exists to prevent, and receipts.md makes I could not verify this a first-class outcome while a false fixed is not. The falsifier is recorded as UNEVALUABLE — neither cleared nor falsified — because a ratio with no denominator cannot pass or fail, and the release gate's text at criterion c7 covers cleared and falsified but not unevaluable. That gap is a human ruling, not an agent one, so c7 stays open with the evidence assembled rather than being resolved by inference. What would make c6 genuinely closable is one real engine run against the now-wired envelope, which is a future unit and not more review of this one.
