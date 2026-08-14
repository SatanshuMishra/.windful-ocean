import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CI_FACT_FIELDS,
  CI_MODEL_FIELDS,
  ciFactProbes,
  parseCiConclusion,
  parseConflictPaths,
  parseFailedChecks,
  parsePublishedHeadSha,
} from '../ci-facts.mjs';
import { EXEC_COMPLETED, EXEC_TIMEOUT_EXPIRED } from '../exec-run.mjs';
import { CI_SHA_PATTERN, classifyCiReport } from '../ci-escalation.mjs';

function ran(status, stdout = '') {
  return Object.freeze({ outcome: EXEC_COMPLETED, status, stdout, stderr: '', signal: null, error: null });
}

const SHA = '4444444444444444444444444444444444444444';

test('the four fields this module derives and the two it leaves to a model are disjoint and together cover the contract', () => {
  assert.deepEqual([...CI_FACT_FIELDS].sort(), ['ciConclusion', 'conflictPaths', 'failedChecks', 'publishedHeadSha']);
  assert.deepEqual([...CI_MODEL_FIELDS].sort(), ['failingAssertionFiles', 'implicatedPaths']);
  for (const field of CI_MODEL_FIELDS) {
    assert.ok(!CI_FACT_FIELDS.includes(field), `${field} is claimed as both derived and model-read`);
  }
});

test('the conclusion is read verbatim from what gh printed', () => {
  const read = parseCiConclusion(ran(0, 'failure\n'));
  assert.equal(read.ok, true, JSON.stringify(read));
  assert.equal(read.ciConclusion, 'failure');
});

test('a conclusion outside the closed terminal set is refused rather than passed to the classifier', () => {
  const read = parseCiConclusion(ran(0, 'in_progress\n'));
  assert.equal(read.ok, false);
  assert.equal(read.ciConclusion, null);
});

test('a watch that expired reports the timeout-expired token the contract names, not a generic failure', () => {
  const read = parseCiConclusion(Object.freeze({ outcome: EXEC_TIMEOUT_EXPIRED, status: null, stdout: '', stderr: '', signal: 'SIGTERM', error: null }));
  assert.equal(read.ok, true, JSON.stringify(read));
  assert.equal(read.ciConclusion, 'timeout-expired');
  assert.notEqual(read.ciConclusion, 'failure');
});

test('the failed checks are the jobs gh reported as anything but success', () => {
  const jobs = JSON.stringify({
    jobs: [
      { name: 'receipts', conclusion: 'success' },
      { name: 'unit', conclusion: 'failure' },
      { name: 'lint', conclusion: 'cancelled' },
    ],
  });
  const read = parseFailedChecks(ran(0, `${jobs}\n`));
  assert.equal(read.ok, true, JSON.stringify(read));
  assert.deepEqual([...read.failedChecks], ['unit', 'lint']);
});

test('a run whose jobs all succeeded reports an empty failed list rather than refusing', () => {
  const read = parseFailedChecks(ran(0, `${JSON.stringify({ jobs: [{ name: 'receipts', conclusion: 'success' }] })}\n`));
  assert.equal(read.ok, true, JSON.stringify(read));
  assert.deepEqual([...read.failedChecks], []);
});

test('a job carrying no name, a null conclusion or an unreadable body fails closed', () => {
  const nameless = parseFailedChecks(ran(0, `${JSON.stringify({ jobs: [{ conclusion: 'failure' }] })}\n`));
  assert.equal(nameless.ok, false);
  const pending = parseFailedChecks(ran(0, `${JSON.stringify({ jobs: [{ name: 'unit', conclusion: null }] })}\n`));
  assert.equal(pending.ok, false);
  for (const stdout of ['not json', '[]', '{}', '{"jobs":{}}']) {
    assert.equal(parseFailedChecks(ran(0, stdout)).ok, false, `${JSON.stringify(stdout)} was read as a job listing`);
  }
});

test('the conflicting paths are the unmerged entries git named', () => {
  const read = parseConflictPaths(ran(0, 'src/a.ts\n"src/caf\\303\\251.txt"\n'));
  assert.equal(read.ok, true, JSON.stringify(read));
  assert.deepEqual([...read.conflictPaths], ['src/a.ts', 'src/caf\u00e9.txt']);
});

test('an aborted merge with nothing unmerged reports an empty conflict list', () => {
  const read = parseConflictPaths(ran(0, ''));
  assert.equal(read.ok, true, JSON.stringify(read));
  assert.deepEqual([...read.conflictPaths], []);
});

test('the published head is the object name git resolved, never a ref name echoed back', () => {
  const read = parsePublishedHeadSha(ran(0, `${SHA}\n`));
  assert.equal(read.ok, true, JSON.stringify(read));
  assert.equal(read.publishedHeadSha, SHA);
  assert.equal(parsePublishedHeadSha(ran(0, 'mitosis/c4c\n')).ok, false);
});

test('a published head this reader accepts is one the engine sha gate also accepts', () => {
  for (const printed of [SHA, '4444444']) {
    const read = parsePublishedHeadSha(ran(0, `${printed}\n`));
    assert.equal(read.ok, true, `${printed} was refused here yet the engine gate accepts it`);
    assert.ok(CI_SHA_PATTERN.test(read.publishedHeadSha), `${printed} passed this reader and would then be rejected by the engine gate with no fact left to report`);
  }
  for (const printed of ['zzzzzzz', '', 'refs/heads/main']) {
    assert.equal(parsePublishedHeadSha(ran(0, `${printed}\n`)).ok, false, `${JSON.stringify(printed)} was read as a published head`);
  }
});

test('the derived facts complete a report the escalation classifier accepts', () => {
  const report = {
    ciConclusion: parseCiConclusion(ran(0, 'failure\n')).ciConclusion,
    failedChecks: [...parseFailedChecks(ran(0, `${JSON.stringify({ jobs: [{ name: 'unit', conclusion: 'failure' }] })}\n`)).failedChecks],
    conflictPaths: [...parseConflictPaths(ran(0, '')).conflictPaths],
    publishedHeadSha: parsePublishedHeadSha(ran(0, `${SHA}\n`)).publishedHeadSha,
    implicatedPaths: ['src/a.ts'],
    failingAssertionFiles: ['src/a.test.ts'],
    receiptsPass: true,
    d6Pass: true,
  };
  const verdict = classifyCiReport(report, ['src/**']);
  assert.equal(verdict.escalate, false, `the classifier escalated on a complete report: ${JSON.stringify(verdict)}`);
});

test('the probes the verb runs cover each derived field and its fail-closed case', () => {
  const probes = ciFactProbes();
  for (const field of CI_FACT_FIELDS) {
    assert.ok(probes.some((probe) => probe.name.includes(field)), `no probe covers ${field}`);
  }
  for (const probe of probes) assert.equal(probe.ok, true, `${probe.name}: ${probe.detail}`);
});
