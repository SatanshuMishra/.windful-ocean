import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXIT, START_EVENT, STOP_EVENT } from '../contract.mjs';

const LIB_DIR = fileURLToPath(new URL('..', import.meta.url));

const SESSION_ID = 'reentry-session';
const AGENT_ID = 'reentry-agent';
const AGENT_TYPE = 'implementer';
const DEPTH = 1;

const START_TIMESTAMPS = Object.freeze([
  '2026-09-01T00:00:00.000Z',
  '2026-09-01T00:05:00.000Z',
  '2026-09-01T00:10:00.000Z',
]);

const STOP_TIMESTAMPS = Object.freeze([
  '2026-09-01T00:00:02.000Z',
  '2026-09-01T00:04:00.000Z',
]);

const OVERLAP_START_TIMESTAMPS = Object.freeze([
  '2026-09-02T00:00:00.000Z',
  '2026-09-02T00:01:00.000Z',
]);

const OVERLAP_STOP_TIMESTAMPS = Object.freeze([
  '2026-09-02T00:02:00.000Z',
  '2026-09-02T00:03:00.000Z',
]);

function reentryRow(ts, event) {
  return JSON.stringify({
    ts,
    subject: 'agent',
    event,
    session_id: SESSION_ID,
    cwd: '/w',
    agent_id: AGENT_ID,
    agent_type: AGENT_TYPE,
    agent_transcript_path: event === STOP_EVENT ? '/t/reentry.jsonl' : null,
    parent_agent_id: null,
    depth: DEPTH,
  });
}

function fixtureDirFrom(starts, stops) {
  const dir = mkdtempSync(join(tmpdir(), 'observer-audit-reentry-'));
  mkdirSync(join(dir, 'events'), { recursive: true });
  const rows = [...starts.map((ts) => reentryRow(ts, START_EVENT)), ...stops.map((ts) => reentryRow(ts, STOP_EVENT))];
  writeFileSync(join(dir, 'events', '2026-09.jsonl'), `${rows.join('\n')}\n`);
  return dir;
}

function reentryFixtureDir() {
  return fixtureDirFrom(START_TIMESTAMPS, STOP_TIMESTAMPS);
}

function overlapFixtureDir() {
  return fixtureDirFrom(OVERLAP_START_TIMESTAMPS, OVERLAP_STOP_TIMESTAMPS);
}

function ask(id, logRoot) {
  const args = [join(LIB_DIR, 'run.mjs'), id, '--log-root', logRoot];
  const result = spawnSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const parsed = (() => {
    try {
      return JSON.parse(result.stdout);
    } catch {
      return null;
    }
  })();
  return { code: result.status, stdout: result.stdout, stderr: result.stderr, json: parsed };
}

function answered(id, logRoot) {
  const got = ask(id, logRoot);
  assert.equal(got.code, EXIT.OK, `${id} did not answer: ${got.stderr}`);
  assert.ok(got.json, `${id} produced no JSON`);
  return got.json;
}

function reentryRowFrom(rows) {
  const found = rows.filter(
    (row) => row.population === 'dispatch' && row.agent_type === AGENT_TYPE && row.depth_bucket === String(DEPTH),
  );
  assert.equal(found.length, 1, `expected exactly one re-entry row, got ${found.length}: ${JSON.stringify(rows)}`);
  return found[0];
}

test('ran-and-duration reports the true start-row count and ordinal-pair columns under re-entry, excluding the misordered pair from duration, never the S x T fan-out this fixture used to produce', () => {
  const dir = reentryFixtureDir();
  try {
    const answer = answered('ran-and-duration', dir);
    const row = reentryRowFrom(answer.rows);
    const trueStartRows = START_TIMESTAMPS.length;
    const trueStopRows = STOP_TIMESTAMPS.length;
    const fanOutProduct = trueStartRows * trueStopRows;
    const pairedRuns = Math.min(trueStartRows, trueStopRows);
    const unpairedStarts = trueStartRows - pairedRuns;
    const countColumns = ['dispatches', 'start_rows', 'paired_runs', 'unpaired_starts', 'misordered_pairs'];

    assert.equal(row.dispatches, 1, 'dispatches must count the single (session_id, agent_id) group, never the row-grain fan-out');
    assert.equal(row.start_rows, trueStartRows, `start_rows must equal the true raw start-row count S=${trueStartRows}, not the retired S x T cross-product ${fanOutProduct}`);
    assert.ok(row.dispatches < row.start_rows, `dispatches (${row.dispatches}) must be strictly less than start_rows (${row.start_rows}) under re-entry`);
    assert.equal(row.paired_runs, pairedRuns, `paired_runs must equal min(S, T) = min(${trueStartRows}, ${trueStopRows}) = ${pairedRuns}`);
    assert.equal(row.unpaired_starts, unpairedStarts, `unpaired_starts must equal S - min(S,T) = ${trueStartRows} - ${pairedRuns} = ${unpairedStarts}`);
    assert.equal(row.misordered_pairs, 1, 'misordered_pairs must surface the one ordinal pair whose stop precedes its own start');
    assert.equal(row.well_ordered_pairs, 1, 'well_ordered_pairs must be paired_runs minus the misordered pair, reported directly, not by consumer subtraction');

    for (const column of countColumns) {
      assert.notEqual(
        row[column],
        fanOutProduct,
        `${column} (${row[column]}) must never equal the S x T fan-out product ${fanOutProduct} = ${trueStartRows} x ${trueStopRows}; a count matching it means the retired cross join is back`,
      );
    }

    assert.equal(typeof row.min_duration_ms, 'number', 'min_duration_ms must be a number, not null, once a well-ordered pair exists to measure');
    assert.equal(
      row.min_duration_ms,
      2000,
      'exactly one pair is well-ordered (rank 1: start 00:00:00 -> stop 00:00:02), so min/max/mean must all read 2000ms, not merely be non-negative',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a later start whose ts falls strictly inside an earlier ordinal pair window is reported as an overlapping group, even though both individual pairs are well-ordered', () => {
  const dir = overlapFixtureDir();
  try {
    const answer = answered('ran-and-duration', dir);
    const row = reentryRowFrom(answer.rows);

    assert.equal(row.dispatches, 1);
    assert.equal(row.start_rows, OVERLAP_START_TIMESTAMPS.length);
    assert.equal(row.paired_runs, OVERLAP_STOP_TIMESTAMPS.length);
    assert.equal(row.unpaired_starts, 0);
    assert.equal(row.misordered_pairs, 0, 'both ordinal pairs individually satisfy stopped >= started');
    assert.equal(row.well_ordered_pairs, 2, 'misordered_pairs alone is blind to this defect: both pairs look well-ordered');
    assert.equal(row.overlapping_groups, 1, 'the group must be flagged as overlapping despite misordered_pairs reading 0');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
