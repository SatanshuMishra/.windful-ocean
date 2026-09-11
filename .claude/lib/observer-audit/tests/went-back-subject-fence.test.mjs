import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXIT, SESSION_SUBJECT, WENT_BACK_EVENT } from '../contract.mjs';

const LIB_DIR = fileURLToPath(new URL('..', import.meta.url));
const FIXTURES = join(LIB_DIR, 'fixtures');
const PAST_THE_CORPUS = '2027-01-01T00:00:00.000Z';

function stageFixture(label) {
  const dir = mkdtempSync(join(tmpdir(), `observer-audit-${label}-`));
  cpSync(FIXTURES, dir, { recursive: true });
  return dir;
}

function ask(id, logRoot) {
  const args = [join(LIB_DIR, 'run.mjs'), id, '--log-root', logRoot, '--roster', join(FIXTURES, 'roster')];
  const result = spawnSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  assert.equal(result.status, EXIT.OK, `${id} did not answer over ${logRoot}: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

function appendWentBackRow(dir) {
  const file = join(dir, 'events', '2026-08.jsonl');
  const row = JSON.stringify({
    ts: PAST_THE_CORPUS,
    subject: SESSION_SUBJECT,
    event: WENT_BACK_EVENT,
    session_id: 's-went-back',
    cwd: '/w',
    went_back_kind: 'repeat_read',
    went_back_signature: 'Read /a/x.ts',
  });
  writeFileSync(file, `${readFileSync(file, 'utf8')}${row}\n`);
}

test('a went_back row is admitted by the key census, so the fence guards below cannot pass by the row being absent', () => {
  const dir = stageFixture('fence-admitted');
  const before = ask('never-observed', dir);
  appendWentBackRow(dir);
  const after = ask('never-observed', dir);

  assert.equal(
    after.key_census.total_rows,
    before.key_census.total_rows + 1,
    'the went_back row never reached the corpus, so every other assertion in this file would pass over nothing',
  );
  assert.deepEqual(
    after.key_census.shapes.filter((entry) => entry.shape === 'went-back-seven'),
    [{ shape: 'went-back-seven', rows: 1 }],
    'the census must classify the went_back row against a declared shape rather than halting or ignoring it',
  );
  rmSync(dir, { recursive: true, force: true });
});

test('a went_back row must not enter the coverage denominator the agent questions divide by', () => {
  const dir = stageFixture('fence-coverage');
  const before = ask('never-observed', dir);
  appendWentBackRow(dir);
  const after = ask('never-observed', dir);

  assert.equal(
    after.coverage.total_rows,
    before.coverage.total_rows,
    'the subject fence in eventsCte is gone: a session-subject row inflated the total_rows denominator and diluted dispatch coverage',
  );
  assert.equal(after.coverage.dispatch_coverage_pct, before.coverage.dispatch_coverage_pct);
  assert.deepEqual(after.rows, before.rows);
  rmSync(dir, { recursive: true, force: true });
});

test('a went_back row dated past the corpus must not move the horizon the failed question measures against', () => {
  const dir = stageFixture('fence-horizon');
  const before = ask('failed', dir);
  appendWentBackRow(dir);
  const after = ask('failed', dir);

  assert.deepEqual(
    after.rows,
    before.rows,
    'the subject fence in eventsCte is gone: a session-subject row became the latest timestamp in the corpus and reclassified in-flight dispatches as failures',
  );
  rmSync(dir, { recursive: true, force: true });
});
