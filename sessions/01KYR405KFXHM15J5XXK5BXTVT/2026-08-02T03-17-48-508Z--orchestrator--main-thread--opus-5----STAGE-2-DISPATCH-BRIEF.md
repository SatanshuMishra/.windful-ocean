STAGE 2 CONTRACT. Read 0193 and 0194 first. Dispatch a SMALL TARGETED dynamic workflow - about FOUR agents, NOT nineteen. Do NOT re-run M5. Do NOT re-open the audit; it is closed by 0193.

PRECONDITIONS to confirm before dispatching (all were true at hand-off): HEAD ba981cc on feat/m5-quiescent-exit; 1 commit ahead of origin/main 42e7d49; NOT pushed; no PR open; working tree carries ONLY the five known pre-existing dirty paths (.claude/settings.json, .zshrc, the two .bak-pre-promptsfix-043a2526 files, .claude/skills/context7-mcp/). Full suite at ba981cc is 1845 pass / 0 fail, measured by the pre-commit hook. Both coverage-gate modes exit 0.

FOUR DELIVERABLES.

D1. Add ONE new test file, its own file, ORDINARY name (suggest .claude/lib/superpowers-parallel/tests/quiescent-exit-bound.test.mjs). NO aaa- prefix - 0193 rejected it. Source below is auditor B's, already mutation-proven; re-verify imports resolve rather than trusting it. Expect the suite to go 1845 -> 1846 pass / 0 fail.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Built } from '../boundary.mjs';
import { indexUnits, runSchedule } from '../leases.mjs';

test('QUIESCENT EXIT TERMINATES THE EPOCH-EXHAUSTED LOOP: a unit whose raw planTick dispatch never empties still returns once its every (unit, state) epoch is spent, so the live window accessor is resolved a bounded number of times', async () => {
  const RESOLUTION_BOUND = 64;
  let resolutions = 0;
  const boundedWindow = () => {
    resolutions += 1;
    if (resolutions > RESOLUTION_BOUND) {
      throw new Error(`runSchedule resolved the live window accessor ${resolutions} times without returning, so the scheduler loop is not terminating on this fixture. Only this accessor can observe that: the loop re-reads it every iteration but dispatches nothing, so no agent runs and no dispatch-side bound counts, and its sole await joins an empty tick, which yields microtasks only and therefore starves every timer - no test timeout can end this run.`);
    }
    return 3;
  };

  const { units, ticks, quiescent } = await runSchedule(
    [{ id: 'a', fileScope: ['a.mjs'] }],
    async () => Built({ mspId: 'a' }),
    { window: boundedWindow },
  );

  assert.equal(quiescent, true, 'the run returns the quiescent disposition under its own power rather than being cut short by the accessor bound');
  assert.ok(resolutions >= 1, 'the accessor was genuinely resolved, so the bound is not satisfied vacuously by a loop that never ran');
  assert.ok(resolutions <= RESOLUTION_BOUND, `the loop returned after ${resolutions} window resolution(s) rather than spinning`);
  assert.ok(ticks.length >= 1, 'the unit was genuinely dispatched, so termination was not bought by refusing to dispatch it');
  assert.equal(indexUnits(units).get('a').state, 'built', 'the unit ends in the state its outcome names; a run that tripped the accessor bound would reject instead of resolving');
});

D1 RECEIPT, re-established first-hand, NEVER cited from this brief: control green; exit-removed mutant (scratch copy of leases.mjs with ONLY the quiescent return deleted, selected by copying the lib tree to scratch so ../leases.mjs resolves to the copy) RED at 65 resolutions; a behaviour-preserving refactor mutant STAYS GREEN, which is the not-a-change-detector proof and is mandatory.

D2. Fix the M6 row's false sentence in docs/invariants/coverage/feat-m5-quiescent-exit.json. It reads '...and that the staged set is empty'. That was FALSE when written - the 12 intended paths were staged. Do NOT simply delete the clause and do NOT let it stand because ba981cc has since made it accidentally true. Restate what was actually verified, in this file's established candid-correction style: no UNINTENDED path was staged or modified, the intended set was staged and has since been committed as ba981cc.

D3. Extend the M3 row with the termination residual, MEASURED, per 0193. It must state: exit removal from both twins manifests as a full-suite HANG with zero tests reddened, not a red; the mechanism is that the loop's sole await is Promise.allSettled([]) which yields microtasks only (3,000,001 iterations / 1941ms with ZERO macrotasks, against a probe self-validated at 26 macrotasks in 140ms), so node:test's { timeout: N } cannot fire; suite-level invisibility is compounded because unbounded ticks.push starves node --test's output flush, which makes a LONGER kill deadline strictly worse; the new bound pins termination deterministically (80/80 across four variants, 20 consecutive runs each, no timers, no sleeps); coverage composes as mirror-guard RED on any one-sided twin mutation plus this lib-side bound on the both-twins mutation, which mirror-guard alone passes 46/0; and the full-suite EXIT CODE is NOT recovered - declared, not fixed, in this MSP. Recording the limit alongside the test is 0192's fallback kept in addition to the remedy, not instead of it.

D4. Ship. Push, then open ONE PR via node .claude/lib/superpowers-parallel/mitosis-git.mjs pr-create. Never gh pr create. --origin machine REQUIRES --provenance. No angle brackets in any --what value. Title is Conventional Commits, max 72 chars, scope max 16, lowercase imperative, no trailing period. Honesty rule is absolute: --verified only for checks actually run and read; anything else is --not-verified. MERGE IS HUMAN-GATED - the workflow must NOT merge.

WORKFLOW SHAPE, four agents: (1) implementer does D1 incl. the mutation battery AND COMMITS; (2) receipt editor does D2+D3 and commits; (3) adversarial verifier re-derives every claim in both edited rows against the tree and independently re-runs the refactor-mutant green and exit-mutant red; (4) ship does D4. Stages 2 and 3 may pipeline behind 1.

ORDERING RULE FROM 0194, and it is the one thing that most be got right: DO NOT instruct any agent not to commit. Every verification lens - the coverage gate especially - runs AFTER the commit that produces what it measures. Placing the receipt lens before the commit phase is what manufactured two of M5's four blockers and burned a whole remediation round; this thread has paid for that lesson twice.

OTHER STANDING CONSTRAINTS: give each agent a DISTINCT scratch subdirectory. Stage explicit paths only, NEVER git add -A/./-a. The engine is .claude/workflows/mitosis.js, NOT under .claude/lib/superpowers-parallel/. Tests are not policed twins, so D1 needs no mirror edit - but confirm that against MIRROR_CENSUS rather than assuming it. Re-derive every anchor; all :line cites in the receipt are stated at 42e7d49 and the tree is now ba981cc.