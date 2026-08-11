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
