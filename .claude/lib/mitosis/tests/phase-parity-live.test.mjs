import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GATE_CLEAN_EXIT, runMitosisGate } from '../mitosis-gate-core.mjs';

const EVERY_DECLARED_TITLE_SORTED = Object.freeze([
  'Decompose',
  'Execute',
  'Integrate',
  'Prep',
  'Probe',
  'Remediate',
  'Resume',
  'Ship',
]);

function runPhaseParityOverLiveSource() {
  const stdout = [];
  const stderr = [];
  const out = Object.freeze({
    log: (text) => { stdout.push(text); },
    err: (text) => { stderr.push(text); },
  });
  const code = runMitosisGate(['phase-parity'], out, (path) => readFileSync(path, 'utf8'));
  return { code, stdout: stdout.join(''), stderr: stderr.join('') };
}

test('the phase-parity verb exits clean over live engine source rather than halting or reporting a violation', () => {
  const gate = runPhaseParityOverLiveSource();
  assert.equal(
    gate.code,
    GATE_CLEAN_EXIT,
    `phase-parity exited ${gate.code} over the real engine source; 42 is a halt and 41 a violation, and both are failures rather than a pass: ${gate.stderr}`,
  );
});

test('every declared phase is entered by live engine source, so the run advances through the whole eight-phase model', () => {
  const gate = runPhaseParityOverLiveSource();
  const verdict = JSON.parse(gate.stdout);
  assert.deepEqual(
    verdict.used,
    ['Decompose', 'Execute', 'Integrate', 'Prep', 'Probe', 'Remediate', 'Resume', 'Ship'],
    'the phase titles live engine source enters must be exactly the eight the authority declares, named one by one in sorted order; a count or a not-empty assertion would pass while Prep, Probe, Remediate and Ship stayed unreachable',
  );
  assert.deepEqual(
    verdict.declaredNeverEntered,
    [],
    'a declared phase no engine source enters is a phase the pipeline announces and never drives; the set must be empty by name, not merely smaller than it was',
  );
  assert.deepEqual(
    verdict.phases,
    [...EVERY_DECLARED_TITLE_SORTED],
    'the gate must be judging the eight-title authority, so that the two assertions above cannot pass against a shrunken phase model',
  );
});
