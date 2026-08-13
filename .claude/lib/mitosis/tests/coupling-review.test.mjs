import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reviewCoupling } from '../coupling-review.mjs';

const scratchDirs = [];

after(() => {
  for (const dir of scratchDirs) rmSync(dir, { recursive: true, force: true });
});

function scratch(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratchDirs.push(dir);
  return dir;
}

function side(id, ...fileScope) {
  return { id, fileScope };
}

function candidate(a, b) {
  return { a, b };
}

test('T1: import-adjacent fires symmetrically when one scope is one hop from the other', () => {
  const emitted = reviewCoupling(
    [candidate(side('t1', 'lib/a.js'), side('t2', 'lib/b.js'))],
    { importAdjacency: { 'lib/b.js': ['lib/a.js'] } },
  );
  assert.equal(emitted.length, 1);
  assert.deepEqual(emitted[0].signals, ['import-adjacent']);
  assert.equal(emitted[0].default, 'parallel');
});

test('T2: shared-risk-marker fires once per marker present in BOTH scopes, sorted', () => {
  const emitted = reviewCoupling([
    candidate(side('t1', 'srv/auth/login.ts', 'srv/deploy/run.ts'), side('t2', 'web/auth/form.tsx', 'web/deploy/ci.ts')),
    candidate(side('t3', 'srv/auth/token.ts'), side('t4', 'web/profile.tsx')),
  ]);
  const byPair = Object.fromEntries(emitted.map((e) => [e.pair.join('|'), e]));
  assert.deepEqual(byPair['t1|t2'].signals, ['shared-risk-marker:auth', 'shared-risk-marker:deploy']);
  assert.equal(byPair['t1|t2'].default, 'serialize');
  assert.equal(byPair['t3|t4'], undefined, 'a marker present in only one scope must not fire');
});

test('T3: regression-history matches the recorded pair regardless of the order it was written', () => {
  const emitted = reviewCoupling(
    [candidate(side('t1', 'lib/a.js'), side('t2', 'lib/b.js'))],
    { regressions: [{ pair: ['t2', 't1'] }] },
  );
  assert.deepEqual(emitted[0].signals, ['regression-history']);
  assert.equal(emitted[0].default, 'serialize');
});

test('T4: same-migration-dir fires on a shared migrations prefix and reports the repo root as <root>', () => {
  const nested = reviewCoupling([candidate(
    side('t1', 'supabase/migrations/20260101_a.sql'),
    side('t2', 'supabase/migrations/20260102_b.sql'),
  )]);
  assert.deepEqual(nested[0].signals, ['shared-risk-marker:migrations', 'same-migration-dir:supabase']);
  assert.equal(nested[0].default, 'serialize');

  const root = reviewCoupling([candidate(
    side('t3', 'migrations/0001_a.sql'),
    side('t4', 'migrations/0002_b.sql'),
  )]);
  assert.ok(root[0].signals.includes('same-migration-dir:<root>'));

  const different = reviewCoupling([candidate(
    side('t5', 'appone/migrations/0001_a.sql'),
    side('t6', 'apptwo/migrations/0001_b.sql'),
  )]);
  assert.deepEqual(
    different[0].signals,
    ['shared-risk-marker:migrations'],
    'different migration directories must not collide into a same-migration-dir signal',
  );

  const notASegment = reviewCoupling([candidate(
    side('t7', 'docs/nomigrations/a.sql'),
    side('t8', 'docs/nomigrations/b.sql'),
  )]);
  assert.deepEqual(notASegment, [], 'migrations must be a path segment, not a substring of one');
});

test('T5: only a hard signal forces the serialize default; import adjacency alone does not', () => {
  const soft = reviewCoupling(
    [candidate(side('t1', 'lib/a.js'), side('t2', 'lib/b.js'))],
    { importAdjacency: { 'lib/a.js': ['lib/b.js'] } },
  );
  assert.equal(soft[0].default, 'parallel');

  const hard = reviewCoupling(
    [candidate(side('t1', 'lib/a.js'), side('t2', 'lib/b.js'))],
    { importAdjacency: { 'lib/a.js': ['lib/b.js'] }, regressions: [{ pair: ['t1', 't2'] }] },
  );
  assert.deepEqual(hard[0].signals, ['import-adjacent', 'regression-history']);
  assert.equal(hard[0].default, 'serialize');
});

test('T6: a signal-free pair is omitted from the emission entirely', () => {
  assert.deepEqual(reviewCoupling([candidate(side('t1', 'lib/a.js'), side('t2', 'web/b.tsx'))]), []);
});

test('T7: the emission is canonically ordered and identical when the same candidates arrive reversed', () => {
  const first = candidate(side('t1', 'srv/auth/a.ts'), side('t2', 'web/auth/b.tsx'));
  const second = candidate(side('t3', 'srv/crypto/c.ts'), side('t4', 'web/crypto/d.tsx'));
  const forward = reviewCoupling([first, second]);
  const backward = reviewCoupling([second, first]);
  assert.deepEqual(forward.map((e) => e.pair), [['t1', 't2'], ['t3', 't4']]);
  assert.equal(JSON.stringify(forward), JSON.stringify(backward));
});

test('T8: the emission and every record inside it is frozen', () => {
  const emitted = reviewCoupling([candidate(side('t1', 'srv/auth/a.ts'), side('t2', 'web/auth/b.tsx'))]);
  assert.ok(Object.isFrozen(emitted));
  assert.ok(Object.isFrozen(emitted[0]));
  assert.ok(Object.isFrozen(emitted[0].pair));
  assert.ok(Object.isFrozen(emitted[0].signals));
});

test('T9: a malformed candidate is refused rather than skipped, so no pair is silently dropped', () => {
  assert.throws(
    () => reviewCoupling([candidate(side('t1', 'lib/a.js'), { id: 't2', fileScope: 'lib/b.js' })]),
    /fileScope must be an array of non-empty strings/,
  );
  assert.throws(
    () => reviewCoupling([candidate(side('t1', 'lib/a.js'), { id: '', fileScope: ['lib/b.js'] })]),
    /must be a non-empty string/,
  );
  assert.throws(
    () => reviewCoupling([candidate(side('t1', 'lib/a.js'), side('t1', 'lib/b.js'))]),
    /names the same task on both sides/,
  );
  assert.throws(
    () => reviewCoupling([
      candidate(side('t1', 'lib/a.js'), side('t2', 'lib/b.js')),
      candidate(side('t2', 'lib/b.js'), side('t1', 'lib/a.js')),
    ]),
    /repeats the candidate/,
  );
});

const CLI = fileURLToPath(new URL('../coupling-review.mjs', import.meta.url));

test('T16: the CLI prints the emission as JSON on stdout and exits 0', () => {
  const dir = scratch('coupling-cli-ok-');
  const candidates = join(dir, 'candidates.json');
  writeFileSync(candidates, JSON.stringify({
    pairs: [{ a: { id: 't1', fileScope: ['srv/auth/a.ts'] }, b: { id: 't2', fileScope: ['web/auth/b.tsx'] } }],
  }));
  const stdout = execFileSync('node', [CLI, candidates], { cwd: dir, encoding: 'utf8' });
  assert.deepEqual(JSON.parse(stdout), [{ pair: ['t1', 't2'], signals: ['shared-risk-marker:auth'], default: 'serialize' }]);
});

test('T18: the CLI prints its usage to stderr and exits 2 when the candidates path is missing', () => {
  let failed = false;
  try {
    execFileSync('node', [CLI], { encoding: 'utf8', stdio: 'pipe' });
  } catch (err) {
    failed = true;
    assert.equal(err.status, 2, `expected the usage exit code 2, received ${err.status}`);
    assert.match(String(err.stderr), /usage: coupling-review\.mjs <candidates\.json>/);
  }
  assert.ok(failed, 'the CLI should exit non-zero with no arguments');
});
