import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertVerdictsCoverPairs, reviewCoupling } from '../coupling-review.mjs';

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

test('T2b: a risk marker matches at a path-segment start only, case-insensitively, and never as a pattern', () => {
  const atStart = reviewCoupling([candidate(side('t1', 'auth/login.ts'), side('t2', 'auth.config.ts'))]);
  assert.deepEqual(
    atStart[0].signals,
    ['shared-risk-marker:auth'],
    'a marker opening the path must fire, not only one that follows a slash',
  );

  const midSegment = reviewCoupling([candidate(side('t1', 'srv/oauth/login.ts'), side('t2', 'web/oauth/form.tsx'))]);
  assert.deepEqual(midSegment, [], 'a marker buried inside a segment must not fire');

  const mixedCase = reviewCoupling([candidate(side('t1', 'SRV/Auth/Login.ts'), side('t2', 'web/AUTH/form.tsx'))]);
  assert.deepEqual(mixedCase[0].signals, ['shared-risk-marker:auth'], 'marker matching ignores case on both sides');

  const literal = reviewCoupling(
    [candidate(side('t1', 'a.b/x.ts'), side('t2', 'pkg/a.b/y.ts'))],
    { riskMarkers: ['a.b'] },
  );
  assert.deepEqual(literal[0].signals, ['shared-risk-marker:a.b'], 'a marker matches its own characters literally');

  const notAWildcard = reviewCoupling(
    [candidate(side('t1', 'axb/x.ts'), side('t2', 'pkg/axb/y.ts'))],
    { riskMarkers: ['a.b'] },
  );
  assert.deepEqual(notAWildcard, [], 'marker punctuation must never be read as a pattern metacharacter');

  const multiSegment = reviewCoupling(
    [candidate(side('t1', 'src/auth/a.ts'), side('t2', 'pkg/src/auth/b.ts'))],
    { riskMarkers: ['src/auth'] },
  );
  assert.deepEqual(
    multiSegment[0].signals,
    ['shared-risk-marker:src/auth'],
    'a marker spanning a slash matches across the segment it names',
  );
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

function emissionOf(...records) {
  return records.map(([pair, signals, fallback]) => ({ pair, signals, default: fallback }));
}

test('T10: an emitted pair with no verdict is a hard stop naming that pair', () => {
  const emitted = emissionOf(
    [['t1', 't2'], ['shared-risk-marker:auth'], 'serialize'],
    [['t3', 't4'], ['import-adjacent'], 'parallel'],
  );
  assert.throws(
    () => assertVerdictsCoverPairs(emitted, [{ pair: ['t1', 't2'], decision: 'serialize', rationale: null }]),
    (error) => {
      assert.match(error.message, /t3\/t4 was emitted for review and no verdict answers it/);
      assert.match(error.message, /hard stop/);
      return true;
    },
  );
});

test('T11: a verdict naming a pair that was never emitted is a hard stop', () => {
  const emitted = emissionOf([['t1', 't2'], ['shared-risk-marker:auth'], 'serialize']);
  assert.throws(
    () => assertVerdictsCoverPairs(emitted, [
      { pair: ['t1', 't2'], decision: 'serialize', rationale: null },
      { pair: ['t9', 't8'], decision: 'parallel', rationale: 'unrelated' },
    ]),
    /t8\/t9 carries a verdict but was never emitted for review/,
  );
});

test('T12: two verdicts on one emitted pair is a hard stop, so a pair sits in exactly one bucket', () => {
  const emitted = emissionOf([['t1', 't2'], ['shared-risk-marker:auth'], 'serialize']);
  assert.throws(
    () => assertVerdictsCoverPairs(emitted, [
      { pair: ['t1', 't2'], decision: 'serialize', rationale: null },
      { pair: ['t2', 't1'], decision: 'parallel', rationale: 'second opinion' },
    ]),
    /t1\/t2 carries 2 verdicts; every emitted pair belongs in exactly one verdict bucket/,
  );
});

test('T13: overriding a serialize default to parallel with no rationale is a hard stop', () => {
  const emitted = emissionOf([['t1', 't2'], ['shared-risk-marker:auth'], 'serialize']);
  for (const rationale of [null, undefined, '', '   ']) {
    assert.throws(
      () => assertVerdictsCoverPairs(emitted, [{ pair: ['t1', 't2'], decision: 'parallel', rationale }]),
      /defaults to serialize and is overridden to parallel with no rationale/,
      `a rationale of ${JSON.stringify(rationale)} must not satisfy the skeptical default`,
    );
  }
});

test('T14: a serialize default overridden to parallel WITH a rationale is accepted', () => {
  const emitted = emissionOf([['t1', 't2'], ['shared-risk-marker:auth'], 'serialize']);
  assert.doesNotThrow(() => assertVerdictsCoverPairs(emitted, [
    { pair: ['t1', 't2'], decision: 'parallel', rationale: 'the two auth files sit on opposite sides of the boundary and share no symbol' },
  ]));
  assert.doesNotThrow(() => assertVerdictsCoverPairs(emitted, [
    { pair: ['t1', 't2'], decision: 'serialize', rationale: null },
  ]));
});

test('T15: a verdict written with the pair reversed answers the same emitted pair', () => {
  const emitted = emissionOf([['t1', 't2'], ['import-adjacent'], 'parallel']);
  assert.doesNotThrow(() => assertVerdictsCoverPairs(emitted, [{ pair: ['t2', 't1'], decision: 'parallel', rationale: null }]));
});

test('T9b: a malformed emission record or verdict is refused rather than skipped', () => {
  assert.throws(
    () => assertVerdictsCoverPairs([{ pair: ['t1'], signals: [], default: 'serialize' }], []),
    /must carry a two-element pair array/,
  );
  assert.throws(
    () => assertVerdictsCoverPairs(emissionOf([['t1', 't2'], [], 'maybe']), []),
    /default must be one of parallel, serialize/,
  );
  assert.throws(
    () => assertVerdictsCoverPairs(emissionOf([['t1', 't2'], [], 'serialize']), [{ pair: ['t1', 't2'], decision: 'later', rationale: null }]),
    /decision must be one of parallel, serialize/,
  );
});

test('T17: the CLI exits 1 and prints coupling-review error when a verdict is missing', () => {
  const dir = scratch('coupling-cli-gap-');
  const candidates = join(dir, 'candidates.json');
  const verdicts = join(dir, 'verdicts.json');
  writeFileSync(candidates, JSON.stringify({
    pairs: [
      { a: { id: 't1', fileScope: ['srv/auth/a.ts'] }, b: { id: 't2', fileScope: ['web/auth/b.tsx'] } },
      { a: { id: 't3', fileScope: ['srv/crypto/c.ts'] }, b: { id: 't4', fileScope: ['web/crypto/d.tsx'] } },
    ],
  }));
  writeFileSync(verdicts, JSON.stringify([{ pair: ['t1', 't2'], decision: 'serialize', rationale: null }]));
  let failed = false;
  try {
    execFileSync('node', [CLI, candidates, '--verdicts', verdicts], { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
  } catch (err) {
    failed = true;
    assert.equal(err.status, 1, `expected the validation exit code 1, received ${err.status}`);
    assert.match(String(err.stderr), /coupling-review error: [\s\S]*t3\/t4 was emitted for review and no verdict answers it/);
  }
  assert.ok(failed, 'the CLI should exit non-zero when the plan does not cover every emitted pair');
});

test('T17b: the CLI exits 0 when every emitted pair carries a verdict', () => {
  const dir = scratch('coupling-cli-covered-');
  const candidates = join(dir, 'candidates.json');
  const verdicts = join(dir, 'verdicts.json');
  writeFileSync(candidates, JSON.stringify({
    pairs: [{ a: { id: 't1', fileScope: ['srv/auth/a.ts'] }, b: { id: 't2', fileScope: ['web/auth/b.tsx'] } }],
  }));
  writeFileSync(verdicts, JSON.stringify([{ pair: ['t1', 't2'], decision: 'serialize', rationale: null }]));
  const stdout = execFileSync('node', [CLI, candidates, '--verdicts', verdicts], { cwd: dir, encoding: 'utf8' });
  assert.deepEqual(JSON.parse(stdout)[0].pair, ['t1', 't2']);
});

test('T24: an emission repeating one pair is refused, so a duplicate cannot absorb the coverage check', () => {
  assert.throws(
    () => assertVerdictsCoverPairs(
      emissionOf(
        [['t1', 't2'], ['shared-risk-marker:auth'], 'serialize'],
        [['t2', 't1'], ['import-adjacent'], 'parallel'],
      ),
      [{ pair: ['t1', 't2'], decision: 'parallel', rationale: null }],
    ),
    /repeats the emitted pair t1\/t2/,
  );
});

test('T25: an emission record carrying no signals array is refused rather than read as reviewed', () => {
  assert.throws(
    () => assertVerdictsCoverPairs([{ pair: ['t1', 't2'], default: 'serialize' }], [{ pair: ['t1', 't2'], decision: 'serialize' }]),
    /emitted\[0\]\.signals must be an array of non-empty strings/,
  );
  assert.throws(
    () => assertVerdictsCoverPairs([{ pair: ['t1', 't2'], signals: ['ok', ''], default: 'serialize' }], []),
    /emitted\[0\]\.signals\[1\] must be a non-empty string/,
  );
});

test('T26: the emission orders pairs by code unit, so a mixed-case graph does not depend on the host locale', () => {
  const emitted = reviewCoupling([
    candidate(side('B1', 'srv/auth/a.ts'), side('zz', 'web/auth/b.tsx')),
    candidate(side('a1', 'srv/crypto/c.ts'), side('yy', 'web/crypto/d.tsx')),
  ]);
  assert.deepEqual(
    emitted.map((e) => e.pair),
    [['B1', 'zz'], ['a1', 'yy']],
    'uppercase sorts before lowercase by code unit, matching canonicalPair and the dependsOn ordering derive-edges writes',
  );
});

test('T27: the CLI refuses a repeated --verdicts flag rather than validating against the last one', () => {
  const dir = scratch('coupling-cli-doubleverdict-');
  const candidates = join(dir, 'candidates.json');
  const first = join(dir, 'first.json');
  const second = join(dir, 'second.json');
  writeFileSync(candidates, JSON.stringify({
    pairs: [{ a: { id: 't1', fileScope: ['srv/auth/a.ts'] }, b: { id: 't2', fileScope: ['web/auth/b.tsx'] } }],
  }));
  writeFileSync(first, JSON.stringify([]));
  writeFileSync(second, JSON.stringify([{ pair: ['t1', 't2'], decision: 'serialize', rationale: null }]));
  let failed = false;
  try {
    execFileSync('node', [CLI, candidates, '--verdicts', first, '--verdicts', second], { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
  } catch (err) {
    failed = true;
    assert.equal(err.status, 2, `expected the usage exit code 2, received ${err.status}`);
    assert.match(String(err.stderr), /--verdicts was supplied twice/);
    assert.match(String(err.stderr), /first\.json/);
  }
  assert.ok(failed, 'a second --verdicts must not silently discard the first path');
});

test('T18b: the CLI rejects a --verdicts flag with no path and exits 2', () => {
  const dir = scratch('coupling-cli-noverdict-');
  const candidates = join(dir, 'candidates.json');
  writeFileSync(candidates, JSON.stringify({ pairs: [] }));
  let failed = false;
  try {
    execFileSync('node', [CLI, candidates, '--verdicts'], { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
  } catch (err) {
    failed = true;
    assert.equal(err.status, 2, `expected the usage exit code 2, received ${err.status}`);
    assert.match(String(err.stderr), /--verdicts needs a path/);
  }
  assert.ok(failed, 'a --verdicts flag with no path must not fall through to an unvalidated run');
});
