import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COUPLING_PARITY_ATTESTS,
  attestCoverageCensus,
  couplingParityFailures,
  probeCouplingSubstrate,
} from '../coupling-parity-gate.mjs';
import {
  COUPLING_GRID_PROBES,
  censusRegistryReaders,
  couplingCoverageCensus,
  gridShapeCensus,
  readClassifierSources,
} from '../coupling-specimens.mjs';
import {
  COUPLING_SIGNAL_CLASSES,
  COUPLING_SIGNAL_DETAIL_SEPARATOR,
  couplingSignalClass,
  couplingSignalClassRegistryProblems,
} from '../coupling-review.mjs';
import { GATE_CLEAN_EXIT, runMitosisGate } from '../mitosis-gate.mjs';

const UNREGISTERED_CELL = 'coupling-parity-gate-test-unregistered-cell';
const UNREGISTERED_SIGNAL_CLASS = 'coupling-parity-gate-test-unregistered-signal-class';
const UNREGISTERED_REASON = 'coupling-parity-gate-test-unregistered-edge-reason';

function capture() {
  const stdout = [];
  const stderr = [];
  return {
    stdout,
    stderr,
    out: Object.freeze({ log: (text) => stdout.push(text), err: (text) => stderr.push(text) }),
  };
}

test('couplingCoverageCensus refuses an observation carrying a cell, a signal class and a derived edge reason no live registry declares, naming each', () => {
  const observation = Object.freeze({
    cells: Object.freeze([UNREGISTERED_CELL]),
    signalClasses: Object.freeze([UNREGISTERED_SIGNAL_CLASS]),
    reasons: Object.freeze([UNREGISTERED_REASON]),
  });
  const result = couplingCoverageCensus([observation]);
  assert.equal(result.ok, false);
  assert.ok(result.error.includes(UNREGISTERED_CELL));
  assert.ok(result.error.includes(UNREGISTERED_SIGNAL_CLASS));
  assert.ok(result.error.includes(UNREGISTERED_REASON));
});

test('couplingCoverageCensus refuses an empty observation list, naming an uncovered registry token', () => {
  const result = couplingCoverageCensus([]);
  assert.equal(result.ok, false);
  assert.ok(result.error.includes(COUPLING_SIGNAL_CLASSES[0]), result.error);
});

test('gridShapeCensus reports a derived classifier cell the probe set does not carry, naming that cell', () => {
  const derivedCells = censusRegistryReaders(readClassifierSources());
  const probeKeys = Object.keys(COUPLING_GRID_PROBES);
  const droppedCell = derivedCells[0];
  assert.ok(probeKeys.includes(droppedCell), 'the live probe set does not carry the first derived cell, so dropping it from the probes cannot be exercised as a probe-side gap');
  const narrowedProbes = Object.fromEntries(probeKeys.filter((cell) => cell !== droppedCell).map((cell) => [cell, () => {}]));
  const problems = gridShapeCensus(derivedCells, narrowedProbes);
  assert.equal(problems.length, 1, problems.join(' | '));
  assert.ok(problems[0].includes(droppedCell), problems[0]);
});

test('gridShapeCensus reports a probe cell the derived classifier scan does not carry, naming that cell', () => {
  const derivedCells = censusRegistryReaders(readClassifierSources());
  const probeKeys = Object.keys(COUPLING_GRID_PROBES);
  const droppedCell = probeKeys[0];
  assert.ok(derivedCells.includes(droppedCell), 'the live derived classifier scan does not carry the first probe cell, so dropping it from the scan cannot be exercised as a derived-side gap');
  const narrowedDerived = derivedCells.filter((cell) => cell !== droppedCell);
  const problems = gridShapeCensus(narrowedDerived, COUPLING_GRID_PROBES);
  assert.equal(problems.length, 1, problems.join(' | '));
  assert.ok(problems[0].includes(droppedCell), problems[0]);
});

test('attestCoverageCensus refuses a control claiming an attest id the attest list does not carry, naming that id', () => {
  const attests = Object.freeze([Object.freeze({ id: 'coupling-parity-gate-test-attest', text: 'irrelevant to this probe' })]);
  const rogueId = 'coupling-parity-gate-test-rogue-attest';
  const controls = Object.freeze([
    Object.freeze({ name: 'covers the declared attest', attests: Object.freeze([attests[0].id]) }),
    Object.freeze({ name: 'claims an attest nobody declared', attests: Object.freeze([rogueId]) }),
  ]);
  const problems = attestCoverageCensus(attests, controls);
  assert.equal(problems.length, 1);
  assert.ok(problems[0].includes(rogueId), problems[0]);
});

test('attestCoverageCensus returns no problems when a synthetic control set claims every live attest id', () => {
  const controls = COUPLING_PARITY_ATTESTS.map((attest) => ({ name: `probe for ${attest.id}`, attests: [attest.id] }));
  const problems = attestCoverageCensus(COUPLING_PARITY_ATTESTS, controls);
  assert.deepEqual(problems, []);
});

test('couplingParityFailures returns a failure for a probe carrying a non-null liveFailure, naming it', () => {
  const probe = Object.freeze({
    id: 'coupling-parity-gate-test-control',
    name: 'a synthetic control failing on the live substrate',
    attests: Object.freeze(['coupling-parity-gate-test-attest']),
    liveFailure: 'a synthetic live failure only this probe would produce',
    firesWhenDegraded: true,
    threw: null,
  });
  const failures = couplingParityFailures([probe]);
  assert.equal(failures.length, 1, failures.join(' | '));
  assert.equal(failures[0], probe.liveFailure);
});

test('couplingParityFailures returns a failure for a probe whose firesWhenDegraded is false, naming the control id and the attests it claims', () => {
  const probe = Object.freeze({
    id: 'coupling-parity-gate-test-control',
    name: 'a synthetic control that stopped firing on its own degradation',
    attests: Object.freeze(['coupling-parity-gate-test-attest-one', 'coupling-parity-gate-test-attest-two']),
    liveFailure: null,
    firesWhenDegraded: false,
    threw: null,
  });
  const failures = couplingParityFailures([probe]);
  assert.equal(failures.length, 1, failures.join(' | '));
  assert.ok(failures[0].includes(probe.id), failures[0]);
  assert.ok(failures[0].includes('coupling-parity-gate-test-attest-one'), failures[0]);
  assert.ok(failures[0].includes('coupling-parity-gate-test-attest-two'), failures[0]);
});

test('couplingParityFailures returns a failure for a probe whose threw is non-null, naming the control id and the thrown message', () => {
  const probe = Object.freeze({
    id: 'coupling-parity-gate-test-control',
    name: 'a synthetic control whose degradation blew up',
    attests: Object.freeze(['coupling-parity-gate-test-attest']),
    liveFailure: null,
    firesWhenDegraded: true,
    threw: 'a synthetic detector failure',
  });
  const failures = couplingParityFailures([probe]);
  assert.equal(failures.length, 1, failures.join(' | '));
  assert.ok(failures[0].includes(probe.id), failures[0]);
  assert.ok(failures[0].includes(probe.threw), failures[0]);
});

test('couplingParityFailures returns a failure for an empty probe array', () => {
  const failures = couplingParityFailures([]);
  assert.equal(failures.length, 1, failures.join(' | '));
  assert.match(failures[0], /no control/);
});

test('couplingParityFailures returns no failures for a probe array where every entry is clean, proving the failure cases above are not vacuous', () => {
  const probes = Object.freeze([
    Object.freeze({
      id: 'coupling-parity-gate-test-control-one',
      name: 'a synthetic clean control',
      attests: Object.freeze(['coupling-parity-gate-test-attest-one']),
      liveFailure: null,
      firesWhenDegraded: true,
      threw: null,
    }),
    Object.freeze({
      id: 'coupling-parity-gate-test-control-two',
      name: 'another synthetic clean control',
      attests: Object.freeze(['coupling-parity-gate-test-attest-two']),
      liveFailure: null,
      firesWhenDegraded: true,
      threw: null,
    }),
  ]);
  assert.deepEqual(couplingParityFailures(probes), []);
});

test('couplingSignalClass splits only on the first detail separator, so a detail carrying the separator round-trips whole', () => {
  const probeDetail = 'probe-detail';
  const detailedClass = COUPLING_SIGNAL_CLASSES.find(
    (name) => couplingSignalClass(`${name}${COUPLING_SIGNAL_DETAIL_SEPARATOR}${probeDetail}`).ok,
  );
  assert.ok(detailedClass, 'no live signal class in the registry accepts a detail suffix, so this round-trip has nothing to exercise');
  const innerDetail = `left${COUPLING_SIGNAL_DETAIL_SEPARATOR}right`;
  const signal = `${detailedClass}${COUPLING_SIGNAL_DETAIL_SEPARATOR}${innerDetail}`;
  const classified = couplingSignalClass(signal);
  assert.equal(classified.ok, true, classified.error);
  assert.equal(classified.className, detailedClass);
  assert.equal(classified.detail, innerDetail);
});

test('couplingSignalClassRegistryProblems refuses a non-array registry, naming what it received', () => {
  const problems = couplingSignalClassRegistryProblems('not-a-registry-array', COUPLING_SIGNAL_DETAIL_SEPARATOR);
  assert.equal(problems.length, 1);
  assert.ok(problems[0].includes('received "not-a-registry-array"'), problems[0]);
});

test('couplingSignalClassRegistryProblems refuses an empty-string separator, naming what it received', () => {
  const problems = couplingSignalClassRegistryProblems(COUPLING_SIGNAL_CLASSES, '');
  assert.equal(problems.length, 1);
  assert.ok(problems[0].includes('received ""'), problems[0]);
});

test('probeCouplingSubstrate on the real production source yields a grid shape with no problems and every grid probe refused and named', () => {
  const substrate = probeCouplingSubstrate();
  assert.deepEqual(substrate.gridShape, []);
  assert.ok(substrate.gridProbes.length > 0);
  for (const probe of substrate.gridProbes) {
    assert.ok(probe.refused, `${probe.cell} did not refuse the unregistered token`);
    assert.ok(probe.named, `${probe.cell} refused but did not name the unregistered token`);
  }
});

test('the coupling-parity verb exits clean over the real substrate and reports its own verb name', () => {
  const { out, stdout, stderr } = capture();
  const code = runMitosisGate(['coupling-parity'], out, () => '');
  assert.deepEqual(stderr, []);
  assert.equal(code, GATE_CLEAN_EXIT);
  const verdict = JSON.parse(stdout.join(''));
  assert.equal(verdict.verb, 'coupling-parity');
});
