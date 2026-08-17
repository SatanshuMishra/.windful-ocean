import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SUPERSEDE_SUMMARY_CAP,
  composeSupersedeSummary,
  parseNumstat,
  supersedeSummaryProbes,
} from '../supersede-summary.mjs';
import { PR_VALUE_CAP } from '../../git/pr-format.mjs';
import { EXEC_COMPLETED, EXEC_TIMEOUT_EXPIRED } from '../exec-run.mjs';

function ran(status, stdout = '') {
  return Object.freeze({ outcome: EXEC_COMPLETED, status, stdout, stderr: '', signal: null, error: null });
}

test('the cap the summary is bounded to is the one pr-create enforces, never a second copy of the number', () => {
  assert.equal(SUPERSEDE_SUMMARY_CAP, PR_VALUE_CAP);
});

test('a numstat listing reads as one added, deleted and path triple per file', () => {
  const read = parseNumstat(ran(0, '12\t3\tsrc/a.ts\n0\t7\tsrc/b.ts\n'));
  assert.equal(read.ok, true, JSON.stringify(read));
  assert.deepEqual(read.files.map((file) => file.path), ['src/a.ts', 'src/b.ts']);
  assert.equal(read.added, 12);
  assert.equal(read.deleted, 10);
  assert.equal(read.fileCount, 2);
});

test('a binary file numstat line reports no line counts rather than counting a dash as zero', () => {
  const read = parseNumstat(ran(0, '-\t-\tassets/logo.png\n4\t0\tsrc/a.ts\n'));
  assert.equal(read.ok, true, JSON.stringify(read));
  assert.equal(read.fileCount, 2);
  assert.equal(read.binaryCount, 1);
  assert.equal(read.added, 4);
  assert.equal(read.deleted, 0);
});

test('a rename path git c-quotes is reported as the identity git named, not as its escaped spelling', () => {
  const read = parseNumstat(ran(0, '1\t1\t"src/caf\\303\\251.txt"\n'));
  assert.equal(read.ok, true, JSON.stringify(read));
  assert.equal(read.files[0].path, 'src/caf\u00e9.txt');
});

test('a numstat line this reader cannot split fails closed rather than being counted as zero', () => {
  for (const stdout of ['not a numstat line\n', '1\tsrc/a.ts\n', 'x\t1\tsrc/a.ts\n', '1\t1\t\n']) {
    const read = parseNumstat(ran(0, stdout));
    assert.equal(read.ok, false, `${JSON.stringify(stdout)} was read as a numstat listing`);
  }
});

test('a run that did not complete is refused rather than read as an empty interdiff', () => {
  const interrupted = parseNumstat(Object.freeze({ ...ran(0, '1\t1\tsrc/a.ts\n'), outcome: EXEC_TIMEOUT_EXPIRED }));
  assert.equal(interrupted.ok, false);
  const failed = parseNumstat(ran(128, ''));
  assert.equal(failed.ok, false);
});

test('the composed summary states the file count and the line totals the parse measured', () => {
  const composed = composeSupersedeSummary(parseNumstat(ran(0, '12\t3\tsrc/a.ts\n0\t7\tsrc/b.ts\n')));
  assert.equal(composed.ok, true, JSON.stringify(composed));
  assert.match(composed.summary, /2 files? changed/);
  assert.match(composed.summary, /\+12/);
  assert.match(composed.summary, /-10/);
});

test('an interdiff with no file at all still composes a summary that says so', () => {
  const composed = composeSupersedeSummary(parseNumstat(ran(0, '')));
  assert.equal(composed.ok, true, JSON.stringify(composed));
  assert.match(composed.summary, /0 files changed/);
});

test('a summary that would exceed the pr-create cap is bounded by this composer, not by its caller', () => {
  const many = Array.from({ length: 400 }, (unused, index) => `1\t1\tsrc/a-very-long-directory-name/module-${index}/index.ts`).join('\n');
  const read = parseNumstat(ran(0, `${many}\n`));
  assert.equal(read.ok, true, JSON.stringify(read).slice(0, 200));
  const composed = composeSupersedeSummary(read);
  assert.equal(composed.ok, true, JSON.stringify(composed));
  assert.ok(composed.summary.length <= SUPERSEDE_SUMMARY_CAP, `the composed summary is ${composed.summary.length} characters, past the ${SUPERSEDE_SUMMARY_CAP} pr-create accepts`);
  assert.equal(composed.bounded, true, 'a summary long enough to be cut does not report that it was');
  assert.match(composed.summary, /400 files changed/);
});

test('no composed summary can carry a value pr-create reads as anything but one inert value', () => {
  const composed = composeSupersedeSummary(parseNumstat(ran(0, '1\t1\t--upload-pack=touch /tmp/pwn\n')));
  assert.equal(composed.ok, true, JSON.stringify(composed));
  assert.ok(!composed.summary.startsWith('-'), 'the summary begins with a dash, so pr-create would read it as a flag rather than as a value');
  assert.ok(!composed.summary.includes('\n'), 'the summary carries a newline, so it would not render as one body line');
});

test('a refused parse composes no summary rather than a summary of nothing', () => {
  const composed = composeSupersedeSummary(parseNumstat(ran(128, '')));
  assert.equal(composed.ok, false);
  assert.equal(composed.summary, null);
});

test('the probes the verb runs cover the bound, the empty interdiff and the refusal', () => {
  const probes = supersedeSummaryProbes();
  assert.ok(probes.length >= 4, 'the probe set is narrower than the cases it is meant to cover');
  for (const probe of probes) assert.equal(probe.ok, true, `${probe.name}: ${probe.detail}`);
  assert.ok(probes.some((probe) => probe.name.includes('cap')), 'no probe exercises the structural cap');
});
