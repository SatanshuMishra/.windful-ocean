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

function buildThenIntegrate(sandbox, repair) {
  planRun(sandbox, TWO_UNITS, { boundaryFix: repair });
  const build = runMitosisCli(sandbox);
  assert.equal(build.status, 0, `the build run must reach a clean exit before Integrate has anything to gate: ${build.stderr}`);
  assert.deepEqual(build.summary.resume.built, [], 'the first run builds the units, so nothing is built when it plans');
  assert.equal(claudeArgvs(sandbox).length, 2, 'the build run dispatches exactly one implement child per unit');
  const integrate = runMitosisCli(sandbox);
  assert.equal(integrate.summary === null, false, `the integrate run printed no summary to read: ${integrate.stderr}`);
  assert.deepEqual(integrate.summary.resume.built, ['alpha', 'beta'], 'the journal from the build run is what makes both units Integrate input');
  return integrate;
}

test('Integrate runs the real boundary gate per built unit and bounds the violating unit to one fix', () => {
  withSandbox({ boundaryToolchain: true }, (sandbox) => {
    const integrate = buildThenIntegrate(sandbox, 'clear');

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
    const integrate = buildThenIntegrate(sandbox, 'none');

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
