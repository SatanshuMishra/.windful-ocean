import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOUNDARY_PARITY_ATTESTS,
  BOUNDARY_PARITY_NOT_ATTESTED,
  boundaryParityFailures,
  boundaryParityVerdict,
  probeBoundarySubstrate,
} from '../boundary-parity-gate.mjs';

test('the verb exits clean over the real engine trees and reports what it measured', () => {
  const verdict = boundaryParityVerdict();
  assert.equal(verdict.kind, 'clean', JSON.stringify(verdict, null, 1));
  assert.equal(verdict.payload.verb, 'boundary-parity');
  assert.equal(verdict.payload.siteCount, 6);
  assert.equal(verdict.payload.twinSiteCount, 3);
  assert.equal(verdict.payload.mechanicalSiteCount, 4);
  assert.equal(verdict.payload.judgmentSiteCount, 2);
});

test('every attest is a sentence long enough to state what was measured', () => {
  assert.ok(BOUNDARY_PARITY_ATTESTS.length >= 8);
  for (const attest of BOUNDARY_PARITY_ATTESTS) {
    assert.equal(typeof attest, 'string');
    assert.ok(attest.length > 60, `this attest is too short to state what it measured: ${JSON.stringify(attest)}`);
  }
  assert.ok(BOUNDARY_PARITY_NOT_ATTESTED.length >= 4);
  for (const entry of BOUNDARY_PARITY_NOT_ATTESTED) {
    assert.ok(entry.length > 60, `this not-attested entry is too short to state the gap: ${JSON.stringify(entry)}`);
  }
});

test('the verdict states plainly that both mechanical dispatches are still live', () => {
  const verdict = boundaryParityVerdict();
  assert.equal(verdict.kind, 'clean');
  const stated = [...verdict.payload.notAttested].join(' ');
  assert.match(stated, /still dispatch/i);
});

test('every control the substrate runs halts on the thing it names', () => {
  const substrate = probeBoundarySubstrate();
  const inert = substrate.controls.filter((control) => !(control.anchorPresent && control.halted && control.named));
  assert.deepEqual(inert.map((control) => `${control.name} (${control.detail})`), []);
  assert.ok(substrate.controls.length >= 6);
});

test('an identity probe that stopped distinguishing two TS codes is a failure naming the collision', () => {
  const substrate = probeBoundarySubstrate();
  const failures = boundaryParityFailures({ ...substrate, identity: { ...substrate.identity, codesDistinct: false } });
  assert.ok(failures.some((failure) => /collaps|distinct/i.test(failure)), failures.join(' | '));
});

test('a comparator that started blocking an unchanged pre-existing finding is a failure', () => {
  const substrate = probeBoundarySubstrate();
  const failures = boundaryParityFailures({ ...substrate, comparator: { ...substrate.comparator, unchangedPasses: false } });
  assert.ok(failures.some((failure) => /pre-existing|unchanged/i.test(failure)), failures.join(' | '));
});

test('a zero-file run that started reading as clean is a failure', () => {
  const substrate = probeBoundarySubstrate();
  const failures = boundaryParityFailures({ ...substrate, failClosed: { ...substrate.failClosed, zeroFilesRefused: false } });
  assert.ok(failures.some((failure) => /zero files/i.test(failure)), failures.join(' | '));
});

test('a teardown that stopped running on the throw path is a failure', () => {
  const substrate = probeBoundarySubstrate();
  const failures = boundaryParityFailures({ ...substrate, teardown: { ...substrate.teardown, tornDownOnThrow: false } });
  assert.ok(failures.some((failure) => /teardown|torn down/i.test(failure)), failures.join(' | '));
});

test('a first pass and recheck that stopped agreeing is a failure', () => {
  const substrate = probeBoundarySubstrate();
  const failures = boundaryParityFailures({ ...substrate, equivalence: { ...substrate.equivalence, agree: false } });
  assert.ok(failures.some((failure) => /recheck|equivalen/i.test(failure)), failures.join(' | '));
});

test('an unlisted binary that stopped being refused before any child started is a failure', () => {
  const substrate = probeBoundarySubstrate();
  const failures = boundaryParityFailures({ ...substrate, exec: { ...substrate.exec, refusedUnlisted: false, childrenStarted: 1 } });
  assert.ok(failures.some((failure) => /unlisted|before any child/i.test(failure)), failures.join(' | '));
});

test('a census that stopped resolving the real engine trees is a halt rather than a pass', () => {
  const substrate = probeBoundarySubstrate();
  assert.equal(substrate.census.ok, true, substrate.census.error);
});
