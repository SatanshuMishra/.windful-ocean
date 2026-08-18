import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLAUDE_BEHAVIOURS,
  boundaryFixArgvs,
  claudeArgvs,
  planRun,
  runMitosisCli,
  withSandbox,
} from './e2e-substrate.mjs';

const TWO_UNITS = Object.freeze([
  Object.freeze({ id: 'alpha', behaviour: CLAUDE_BEHAVIOURS.succeed }),
  Object.freeze({ id: 'beta', behaviour: CLAUDE_BEHAVIOURS.succeed, prereqs: ['alpha'], boundaryViolation: true }),
]);

function buildAndIntegrate(sandbox, repair) {
  planRun(sandbox, TWO_UNITS, { boundaryFix: repair });
  const run = runMitosisCli(sandbox);
  assert.equal(run.summary === null, false, `the run printed no summary to read: ${run.stderr}`);
  assert.deepEqual(run.summary.resume.built, [], 'nothing is built when the run plans, so the units Integrate gates can only have come from the Execute this same invocation ran');
  assert.equal(
    claudeArgvs(sandbox).length - boundaryFixArgvs(sandbox).length,
    2,
    'the run dispatches exactly one implement child per unit, and every further child is a bounded boundary fix',
  );
  return run;
}

test('Integrate runs the real boundary gate per built unit and bounds the violating unit to one fix', () => {
  withSandbox({ boundaryToolchain: true }, (sandbox) => {
    const integrate = buildAndIntegrate(sandbox, 'clear');

    assert.equal(boundaryFixArgvs(sandbox).length, 1, 'exactly one boundary-fix prompt is composed: the clean unit composes none and the violating unit composes one');
    assert.deepEqual(integrate.summary.integrate.outcomes, [
      { id: 'alpha', state: 'integrated', boundaryFixes: 0 },
      { id: 'beta', state: 'integrated', boundaryFixes: 1 },
    ]);
    assert.deepEqual(integrate.summary.integrate.integrated, ['alpha', 'beta']);
    assert.deepEqual(integrate.summary.integrate.parked, []);
    assert.deepEqual(integrate.summary.integrate.diverged, []);
  });
});

test('a boundary violation that survives its one fix parks the unit, and is never dispatched a second time', () => {
  withSandbox({ boundaryToolchain: true }, (sandbox) => {
    const integrate = buildAndIntegrate(sandbox, 'none');

    assert.equal(boundaryFixArgvs(sandbox).length, 1, 'the fix is bounded at one attempt: a surviving violation parks rather than dispatching again');
    assert.deepEqual(integrate.summary.integrate.outcomes, [
      { id: 'alpha', state: 'integrated', boundaryFixes: 0 },
      { id: 'beta', state: 'parked', boundaryFixes: 1 },
    ]);
    assert.deepEqual(integrate.summary.integrate.integrated, ['alpha']);
    assert.deepEqual(integrate.summary.integrate.parked, ['beta']);
    assert.equal(integrate.summary.integrate.parkedStages.beta, 'execute');
  });
});
