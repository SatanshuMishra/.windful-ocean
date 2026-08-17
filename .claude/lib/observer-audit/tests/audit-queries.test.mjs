import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXIT, NEVER_OBSERVED_LABEL, QUESTION_IDS } from '../contract.mjs';
import { questionIds } from '../questions.mjs';

const LIB_DIR = fileURLToPath(new URL('..', import.meta.url));
const FIXTURES = join(LIB_DIR, 'fixtures');
const EXPECTED_IDS = Object.freeze([
  'blocked',
  'downgrade-recurrence',
  'failed',
  'fell-back',
  'never-observed',
  'ran-and-duration',
]);

function scratch(label) {
  return mkdtempSync(join(tmpdir(), `observer-audit-${label}-`));
}

function stageFixture(label) {
  const dir = scratch(label);
  cpSync(FIXTURES, dir, { recursive: true });
  return dir;
}

function stageLib(label) {
  const dir = scratch(label);
  cpSync(LIB_DIR, dir, { recursive: true });
  return dir;
}

function substitute(file, from, to) {
  const before = readFileSync(file, 'utf8');
  const after = before.split(from).join(to);
  assert.notEqual(after, before, `the mutation did not change ${file}; a no-op substitution reports a false survivor`);
  writeFileSync(file, after);
  return { before, after };
}

function ask(id, options = {}) {
  const lib = options.lib || LIB_DIR;
  const args = [join(lib, 'run.mjs'), id, '--log-root', options.logRoot || FIXTURES];
  if (options.roster !== null) args.push('--roster', options.roster || join(FIXTURES, 'roster'));
  if (options.horizonMs !== undefined) args.push('--horizon-ms', String(options.horizonMs));
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

function answered(id, options) {
  const got = ask(id, options);
  assert.equal(got.code, EXIT.OK, `${id} did not answer: ${got.stderr}`);
  assert.ok(got.json, `${id} produced no JSON`);
  return got.json;
}

function rowFor(rows, predicate) {
  const found = rows.filter(predicate);
  assert.equal(found.length, 1, `expected exactly one matching row, got ${found.length}`);
  return found[0];
}

function generateOversampled(label, withCapabilityRow) {
  const dir = scratch(label);
  mkdirSync(join(dir, 'events'), { recursive: true });
  const base = (index) =>
    JSON.stringify({
      ts: '2026-09-01T00:00:00.000Z',
      subject: 'agent',
      event: 'SubagentStart',
      session_id: 'oversample',
      cwd: '/w',
      agent_id: `o-${index}`,
      agent_type: 'implementer',
      agent_transcript_path: '/t/o.jsonl',
      parent_agent_id: null,
      depth: 1,
    });
  const bulk = Array.from({ length: 20600 }, (unused, index) => base(index)).join('\n');
  const tail = withCapabilityRow
    ? `\n${JSON.stringify({
        ts: '2026-09-01T00:00:01.000Z',
        subject: 'agent',
        event: 'capability_blocked',
        session_id: 'oversample',
        cwd: '/w',
        agent_id: 'o-cap',
        agent_type: 'implementer',
        agent_transcript_path: '/t/o.jsonl',
        parent_agent_id: null,
        depth: 1,
        needed: 'Agent',
        task: 'rare row past the sampling threshold',
        detected_from: 'last_assistant_message',
      })}`
    : '';
  writeFileSync(join(dir, 'events', '2026-09.jsonl'), `${bulk}${tail}\n`);
  return dir;
}

test('the question registry is closed at exactly the six declared ids', () => {
  assert.deepEqual(questionIds(), EXPECTED_IDS);
  assert.deepEqual([...QUESTION_IDS].sort(), EXPECTED_IDS);
});

test('the key census classifies every event against the two declared shapes', () => {
  const answer = answered('blocked');
  assert.equal(answer.key_census.total_rows, 21);
  assert.deepEqual(answer.key_census.shapes, [
    { shape: 'shared-ten', rows: 19 },
    { shape: 'capability-thirteen', rows: 2 },
  ]);
});

test('the key census HALTS on an event shape it cannot classify', () => {
  const dir = stageFixture('census-halt');
  const file = join(dir, 'events', '2026-08.jsonl');
  writeFileSync(
    file,
    `${readFileSync(file, 'utf8')}${JSON.stringify({
      ts: '2026-08-01T00:02:00.000Z',
      subject: 'agent',
      event: 'SubagentStop',
      session_id: 's1',
      cwd: '/w',
      agent_id: 'a-new',
      agent_type: 'implementer',
      agent_transcript_path: '/t/s1.jsonl',
      parent_agent_id: null,
      depth: 1,
      total_cost_usd: 0.42,
    })}\n`,
  );
  const got = ask('blocked', { logRoot: dir });
  assert.equal(got.code, EXIT.CENSUS_HALT, got.stderr);
  assert.match(got.stderr, /total_cost_usd/);
  rmSync(dir, { recursive: true, force: true });
});

test('ran-and-duration separates populations, buckets null depth, and omits every ceiling field', () => {
  const answer = answered('ran-and-duration');
  const populations = [...new Set(answer.rows.map((row) => row.population))].sort();
  assert.deepEqual(populations, ['dispatch', 'internal']);

  const implementer = rowFor(answer.rows, (row) => row.population === 'dispatch' && row.agent_type === 'implementer');
  assert.equal(implementer.started, 3);
  assert.equal(implementer.paired, 3);
  assert.equal(implementer.max_duration_ms, 12000);

  const nested = rowFor(answer.rows, (row) => row.agent_type === 'code-reviewer');
  assert.equal(nested.depth_bucket, '2');
  assert.equal(nested.max_duration_ms, 5500);

  const depthNull = rowFor(answer.rows, (row) => row.population === 'dispatch' && row.agent_type === 'claude');
  assert.equal(depthNull.depth_bucket, 'null', 'a null depth is its own bucket, never folded into 1');

  const internal = rowFor(answer.rows, (row) => row.population === 'internal');
  assert.equal(internal.started, 1);

  const fields = new Set(answer.rows.flatMap((row) => Object.keys(row)));
  for (const forbidden of ['cost', 'total_cost_usd', 'tokens', 'tokens_in', 'tokens_out', 'cache_read', 'num_turns']) {
    assert.ok(!fields.has(forbidden), `${forbidden} is a platform ceiling and must be absent, not zero`);
  }
});

test('fell-back counts the which over the dispatch denominator and ships no why', () => {
  const answer = answered('fell-back');
  const row = rowFor(answer.rows, () => true);
  assert.equal(row.population, 'dispatch');
  assert.equal(row.dispatch_starts, 9, 'the denominator is dispatch starts, never all 21 rows');
  assert.equal(row.fell_back, 2);
  assert.equal(row.fell_back_claude, 1);
  assert.equal(row.fell_back_general_purpose, 1);
  assert.ok(!Object.keys(row).some((key) => key.includes('why') || key.includes('reason')));
  assert.match(answer.why_not_answered, /U3\.3c/);
});

test('blocked preserves the detected_from split rather than aggregating it away', () => {
  const answer = answered('blocked');
  assert.equal(answer.rows.length, 2);
  const channels = answer.rows.map((row) => row.detected_from).sort();
  assert.deepEqual(channels, ['agent_transcript_path', 'last_assistant_message']);
  assert.deepEqual([...new Set(answer.rows.map((row) => row.needed))], ['Agent']);
  assert.equal(
    answer.rows.reduce((sum, row) => sum + row.blocked_rows, 0),
    2,
  );
});

test('failed counts only starts past the horizon and reports stop-without-start separately', () => {
  const answer = answered('failed');
  const dispatch = rowFor(answer.rows, (row) => row.population === 'dispatch');
  assert.equal(dispatch.failed_started_no_stop, 1);
  assert.equal(dispatch.in_flight_within_horizon, 1, 'an in-flight start is never published as a failure');
  assert.equal(dispatch.stop_without_start_coverage, 1, 'a stop with no start is coverage, never a failure');
  const internal = rowFor(answer.rows, (row) => row.population === 'internal');
  assert.equal(internal.failed_started_no_stop, 0);
});

test('a horizon wide enough to cover the whole corpus reclassifies the failure as in-flight', () => {
  const answer = answered('failed', { horizonMs: 99999999999 });
  const dispatch = rowFor(answer.rows, (row) => row.population === 'dispatch');
  assert.equal(dispatch.failed_started_no_stop, 0);
  assert.equal(dispatch.in_flight_within_horizon, 2);
});

test('the roster question labels a zero-dispatch agent never-observed, never unused', () => {
  const answer = answered('never-observed');
  const missing = answer.rows.filter((row) => row.status === NEVER_OBSERVED_LABEL).map((row) => row.agent);
  assert.deepEqual(missing.sort(), ['debugger', 'security-reviewer']);
  for (const row of answer.rows.filter((entry) => entry.status === NEVER_OBSERVED_LABEL)) {
    assert.equal(row.status, 'never-observed');
    assert.equal(row.dispatch_coverage_pct, 90.48);
  }
  assert.equal(answer.coverage.dispatch_rows, 19);
  assert.equal(answer.coverage.total_rows, 21);
  assert.ok(
    !JSON.stringify(answer).includes('unused'),
    'the string unused must appear nowhere in the output; a zero count against partial coverage is not disuse',
  );
});

test('the roster question refuses when given no roster, because the log does not hold one', () => {
  const got = ask('never-observed', { roster: null });
  assert.equal(got.code, EXIT.USAGE, got.stderr);
});

test('downgrade-recurrence refuses loudly and never returns an empty result set', () => {
  const got = ask('downgrade-recurrence');
  assert.equal(got.code, EXIT.NO_SOURCE);
  assert.equal(got.json, null, 'a refusal must not emit a result set that reads as a count of zero');
  assert.match(got.stderr, /U3\.3d/);
  assert.match(got.stderr, /pull request bodies/);
});

test('an absent duckdb binary fails loudly and never skips', () => {
  const result = spawnSync(process.execPath, [join(LIB_DIR, 'run.mjs'), 'blocked', '--log-root', FIXTURES], {
    encoding: 'utf8',
    env: { ...process.env, OBSERVER_AUDIT_DUCKDB: join(tmpdir(), 'no-such-duckdb-binary') },
  });
  assert.equal(result.status, EXIT.NO_DUCKDB);
  assert.match(result.stderr, /never skips/);
  assert.match(result.stderr, /duckdb_cli/);
});

test('the reader carries the rare capability keys past the default sampling threshold', () => {
  const dir = generateOversampled('oversampled-rare', true);
  const answer = answered('blocked', { logRoot: dir });
  assert.equal(answer.key_census.total_rows, 20601);
  assert.equal(answer.rows.length, 1, 'the capability row sits past the 20480-row sample and must not be dropped');
  assert.equal(answer.rows[0].needed, 'Agent');
  rmSync(dir, { recursive: true, force: true });
});

test('a corpus with no capability row answers zero rather than crashing', () => {
  const dir = generateOversampled('oversampled-none', false);
  const answer = answered('blocked', { logRoot: dir });
  assert.equal(answer.key_census.total_rows, 20600);
  assert.deepEqual(answer.rows, [], 'zero blocked rows is an answer; it must not be an error and must not be absent');
  rmSync(dir, { recursive: true, force: true });
});

test('MUTATION 1: corrupting the paired stop timestamp turns ran-and-duration red', () => {
  const dir = stageFixture('mutation-duration');
  substitute(join(dir, 'events', '2026-07.jsonl'), '"ts":"2026-07-01T00:00:12.000Z"', '"ts":"corrupt"');
  const answer = answered('ran-and-duration', { logRoot: dir });
  const implementer = rowFor(answer.rows, (row) => row.population === 'dispatch' && row.agent_type === 'implementer');
  assert.notEqual(implementer.max_duration_ms, 12000, 'the mutant survived: duration did not move');
  assert.equal(implementer.paired, 2);
  rmSync(dir, { recursive: true, force: true });
});

test('MUTATION 2: renaming the fallback agent type turns fell-back red', () => {
  const dir = stageFixture('mutation-fallback');
  substitute(join(dir, 'events', '2026-08.jsonl'), '"agent_type":"general-purpose"', '"agent_type":"implementer"');
  const answer = answered('fell-back', { logRoot: dir });
  const row = rowFor(answer.rows, () => true);
  assert.equal(row.fell_back, 1, 'the mutant survived: the fallback count did not move');
  assert.equal(row.fell_back_general_purpose, 0);
  rmSync(dir, { recursive: true, force: true });
});

test('MUTATION 3: dropping the detected_from split collapses two blocked rows into one', () => {
  const dir = stageLib('mutation-split');
  substitute(
    join(dir, 'questions.mjs'),
    "       coalesce(detected_from, 'null') AS detected_from,\n",
    '',
  );
  const got = ask('blocked', { lib: dir });
  assert.equal(got.code, EXIT.OK, got.stderr);
  assert.equal(got.json.rows.length, 1, 'the mutant survived: the split was already absent from the answer');
  rmSync(dir, { recursive: true, force: true });
});

test('MUTATION 4: pairing the orphan start turns failed red', () => {
  const dir = stageFixture('mutation-failed');
  const file = join(dir, 'events', '2026-07.jsonl');
  writeFileSync(
    file,
    `${readFileSync(file, 'utf8')}${JSON.stringify({
      ts: '2026-07-01T00:00:08.000Z',
      subject: 'agent',
      event: 'SubagentStop',
      session_id: 's1',
      cwd: '/w',
      agent_id: 'a-orphan-1',
      agent_type: 'researcher',
      agent_transcript_path: '/t/s1.jsonl',
      parent_agent_id: null,
      depth: 1,
    })}\n`,
  );
  const answer = answered('failed', { logRoot: dir });
  const dispatch = rowFor(answer.rows, (row) => row.population === 'dispatch');
  assert.equal(dispatch.failed_started_no_stop, 0, 'the mutant survived: the failure count did not move');
  rmSync(dir, { recursive: true, force: true });
});

test('MUTATION 5: observing the missing agent turns never-observed red', () => {
  const dir = stageFixture('mutation-roster');
  substitute(join(dir, 'events', '2026-08.jsonl'), '"agent_type":"test-engineer"', '"agent_type":"security-reviewer"');
  const answer = answered('never-observed', { logRoot: dir, roster: join(dir, 'roster') });
  const missing = answer.rows.filter((row) => row.status === NEVER_OBSERVED_LABEL).map((row) => row.agent);
  assert.deepEqual(missing.sort(), ['debugger', 'test-engineer'], 'the mutant survived: the never-observed set did not move');
  rmSync(dir, { recursive: true, force: true });
});

test('MUTATION 6: making the downgrade stub return rows turns its refusal red', () => {
  const dir = stageLib('mutation-downgrade');
  substitute(
    join(dir, 'questions.mjs'),
    "  'downgrade-recurrence': () => {\n    throw new AuditError(",
    "  'downgrade-recurrence': () => {\n    if (true) return Object.freeze({ population_note: 'none', rows: Object.freeze([]) });\n    throw new AuditError(",
  );
  const got = ask('downgrade-recurrence', { lib: dir });
  assert.notEqual(got.code, EXIT.NO_SOURCE, 'the mutant survived: the stub still refused');
  assert.equal(got.code, EXIT.OK);
  assert.deepEqual(got.json.rows, [], 'this is exactly the empty result set that reads as a count of zero');
  rmSync(dir, { recursive: true, force: true });
});

test('MUTATION 7: removing the declared column list turns the no-capability corpus red', () => {
  const dir = stageLib('mutation-columns');
  substitute(join(dir, 'reader.mjs'), ', ${columnsClause()})`;', ')`;');
  const corpus = generateOversampled('oversampled-mutant', false);
  const got = ask('blocked', { lib: dir, logRoot: corpus });
  assert.notEqual(got.code, EXIT.OK, 'the mutant survived: the reader still bound a key no row carries');
  assert.match(got.stderr, /needed/);
  rmSync(dir, { recursive: true, force: true });
  rmSync(corpus, { recursive: true, force: true });
});

test('MUTATION 8: an empty corpus makes ALL SIX questions exit non-zero', () => {
  const dir = scratch('mutation-vacuity');
  mkdirSync(join(dir, 'events'), { recursive: true });
  const codes = EXPECTED_IDS.map((id) => ({ id, code: ask(id, { logRoot: dir }).code }));
  const passing = codes.filter((entry) => entry.code === EXIT.OK);
  assert.deepEqual(passing, [], `a query over nothing must never look like a successful answer: ${JSON.stringify(codes)}`);
  for (const entry of codes.filter((row) => row.id !== 'downgrade-recurrence')) {
    assert.equal(entry.code, EXIT.EMPTY_CORPUS, `${entry.id} did not report an empty corpus`);
  }
  rmSync(dir, { recursive: true, force: true });
});

test('the runner never mutates its inputs', () => {
  const before = ['2026-07.jsonl', '2026-08.jsonl'].map((name) => readFileSync(join(FIXTURES, 'events', name), 'utf8'));
  answered('ran-and-duration');
  answered('blocked');
  const after = ['2026-07.jsonl', '2026-08.jsonl'].map((name) => readFileSync(join(FIXTURES, 'events', name), 'utf8'));
  assert.deepEqual(after, before);
});
