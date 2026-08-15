import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COUPLING_PARITY_ATTESTS,
  attestCoverageCensus,
  couplingCoverageCensus,
  couplingParityFailures,
  probeCouplingSubstrate,
  registryClassifierGridCensus,
} from '../coupling-parity-gate.mjs';
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

const SUBSTRATE = probeCouplingSubstrate();

function capture() {
  const stdout = [];
  const stderr = [];
  return {
    stdout,
    stderr,
    out: Object.freeze({ log: (text) => stdout.push(text), err: (text) => stderr.push(text) }),
  };
}

function liveRegistries() {
  return [...new Set(SUBSTRATE.gridProbes.map((probe) => probe.registry))];
}

function liveClassifiersFor(registry) {
  return SUBSTRATE.gridProbes.filter((probe) => probe.registry === registry).map((probe) => probe.classifier);
}

function placeholderRow(classifiers) {
  return Object.fromEntries(classifiers.map((classifier) => [classifier, true]));
}

function fullSyntheticGrid(registries) {
  return Object.fromEntries(registries.map((registry) => [registry, placeholderRow(liveClassifiersFor(registry))]));
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

test('registryClassifierGridCensus refuses a grid missing a whole registry row, naming the missing registry', () => {
  const registries = liveRegistries();
  assert.ok(registries.length > 1, 'the live grid carries only one registry, so dropping one cannot be exercised in isolation');
  const [droppedRegistry, ...remainingRegistries] = registries;
  const problems = registryClassifierGridCensus(fullSyntheticGrid(remainingRegistries));
  assert.equal(problems.length, 1);
  assert.ok(problems[0].includes(droppedRegistry), problems[0]);
});

test('registryClassifierGridCensus refuses a grid whose one row is missing a classifier cell, naming the registry and the missing classifier', () => {
  const registries = liveRegistries();
  const targetRegistry = registries[0];
  const classifiers = liveClassifiersFor(targetRegistry);
  assert.ok(classifiers.length > 1, 'the target registry carries only one classifier, so dropping one cannot be exercised in isolation');
  const [droppedClassifier, ...remainingClassifiers] = classifiers;
  const grid = fullSyntheticGrid(registries);
  grid[targetRegistry] = placeholderRow(remainingClassifiers);
  const problems = registryClassifierGridCensus(grid);
  assert.equal(problems.length, 1);
  assert.ok(problems[0].includes(targetRegistry), problems[0]);
  assert.ok(problems[0].includes(droppedClassifier), problems[0]);
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

test('couplingParityFailures reddens when the relaxation probe stops finding a rationale-carrying override honoured', () => {
  assert.deepEqual(couplingParityFailures(SUBSTRATE), [], 'the live substrate is not clean, so the degradation below proves nothing');
  const degraded = { ...SUBSTRATE, relaxation: { ...SUBSTRATE.relaxation, honoured: false } };
  const failures = couplingParityFailures(degraded);
  assert.equal(failures.length, 1, failures.join(' | '));
  assert.match(failures[0], /honoured/);
});

test('couplingParityFailures reddens when the rerun probe stops finding an already-settled pair left alone', () => {
  assert.deepEqual(couplingParityFailures(SUBSTRATE), [], 'the live substrate is not clean, so the degradation below proves nothing');
  const degraded = { ...SUBSTRATE, rerun: { ...SUBSTRATE.rerun, nothingWithdrawn: false } };
  const failures = couplingParityFailures(degraded);
  assert.equal(failures.length, 1, failures.join(' | '));
  assert.match(failures[0], /oscillates/);
});

test('couplingParityFailures reddens when the cycle probe stops finding a coupling-induced cycle halted', () => {
  assert.deepEqual(couplingParityFailures(SUBSTRATE), [], 'the live substrate is not clean, so the degradation below proves nothing');
  const degraded = { ...SUBSTRATE, cycle: { ...SUBSTRATE.cycle, refused: false } };
  const failures = couplingParityFailures(degraded);
  assert.equal(failures.length, 1, failures.join(' | '));
  assert.match(failures[0], /deadlocks/);
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

test('the coupling-parity verb exits clean over the real substrate and reports its own verb name', () => {
  const { out, stdout, stderr } = capture();
  const code = runMitosisGate(['coupling-parity'], out, () => '');
  assert.deepEqual(stderr, []);
  assert.equal(code, GATE_CLEAN_EXIT);
  const verdict = JSON.parse(stdout.join(''));
  assert.equal(verdict.verb, 'coupling-parity');
});
