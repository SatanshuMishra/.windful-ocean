import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COUPLING_PARITY_ATTESTS,
  couplingParityFailures,
  factAttestCensus,
  probeCouplingSubstrate,
} from '../coupling-parity-gate.mjs';
import {
  COUPLING_GRID_PROBES,
  COUPLING_RISK_MARKERS,
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

function cleanFactsFor(attests) {
  return Object.freeze(Object.fromEntries(attests.map((attest) => [attest.fact, Object.freeze({ ok: true, detail: '' })])));
}

test('factAttestCensus refuses in all four directions, each named in the returned problem', () => {
  const facts = Object.freeze({
    cleanFact: Object.freeze({ ok: true, detail: '' }),
    orphanFact: Object.freeze({ ok: true, detail: '' }),
    contestedFact: Object.freeze({ ok: true, detail: '' }),
    repeatA: Object.freeze({ ok: true, detail: '' }),
    repeatB: Object.freeze({ ok: true, detail: '' }),
  });
  const attests = Object.freeze([
    Object.freeze({ id: 'soleClaimant', fact: 'cleanFact', text: 'claims cleanFact cleanly' }),
    Object.freeze({ id: 'firstClaimant', fact: 'contestedFact', text: 'claims contestedFact first' }),
    Object.freeze({ id: 'secondClaimant', fact: 'contestedFact', text: 'claims contestedFact second' }),
    Object.freeze({ id: 'phantomClaimant', fact: 'ghostFact', text: 'names a fact nobody computes' }),
    Object.freeze({ id: 'duplicateId', fact: 'repeatA', text: 'claims repeatA under a repeated id' }),
    Object.freeze({ id: 'duplicateId', fact: 'repeatB', text: 'claims repeatB under the same repeated id' }),
  ]);
  const problems = factAttestCensus(facts, attests);
  assert.ok(problems.some((p) => p.includes('orphanFact')), problems.join(' | '));
  assert.ok(problems.some((p) => p.includes('phantomClaimant') && p.includes('ghostFact')), problems.join(' | '));
  assert.ok(problems.some((p) => p.includes('firstClaimant') && p.includes('secondClaimant') && p.includes('contestedFact')), problems.join(' | '));
  assert.ok(problems.some((p) => p.includes('duplicateId')), problems.join(' | '));
});

test('factAttestCensus returns no problems for the live attests paired with the live substrate facts, so the four refusals above are not vacuous', () => {
  const substrate = probeCouplingSubstrate();
  const problems = factAttestCensus(substrate.facts, COUPLING_PARITY_ATTESTS);
  assert.deepEqual(problems, []);
});

test('couplingParityFailures on a synthetic substrate whose one fact fails returns exactly one failure naming that attest id and its detail', () => {
  const target = COUPLING_PARITY_ATTESTS[0];
  const facts = Object.freeze({
    ...cleanFactsFor(COUPLING_PARITY_ATTESTS),
    [target.fact]: Object.freeze({ ok: false, detail: ' (a synthetic failure detail)' }),
  });
  const failures = couplingParityFailures({ facts });
  assert.equal(failures.length, 1, failures.join(' | '));
  assert.ok(failures[0].includes(target.id), failures[0]);
  assert.ok(failures[0].includes('a synthetic failure detail'), failures[0]);
});

test('couplingParityFailures on a synthetic substrate where every live attest fact holds returns no failures', () => {
  const facts = cleanFactsFor(COUPLING_PARITY_ATTESTS);
  const failures = couplingParityFailures({ facts });
  assert.deepEqual(failures, []);
});

test('couplingCoverageCensus refuses an observation carrying a cell, a signal class and a derived edge reason no live registry declares, naming each', () => {
  const observation = Object.freeze({
    cells: Object.freeze([UNREGISTERED_CELL]),
    signalClasses: Object.freeze([UNREGISTERED_SIGNAL_CLASS]),
    reasons: Object.freeze([UNREGISTERED_REASON]),
    markers: Object.freeze([]),
  });
  const result = couplingCoverageCensus([observation]);
  assert.equal(result.ok, false);
  assert.ok(result.error.includes(UNREGISTERED_CELL));
  assert.ok(result.error.includes(UNREGISTERED_SIGNAL_CLASS));
  assert.ok(result.error.includes(UNREGISTERED_REASON));
});

test('couplingCoverageCensus refuses an empty observation list, naming an uncovered registry token and an uncovered risk marker', () => {
  const result = couplingCoverageCensus([]);
  assert.equal(result.ok, false);
  assert.ok(result.error.includes(COUPLING_SIGNAL_CLASSES[0]), result.error);
  assert.ok(result.error.includes(COUPLING_RISK_MARKERS[0]), result.error);
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
  assert.equal(substrate.facts.gridShapeAgrees.ok, true, substrate.facts.gridShapeAgrees.detail);
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
