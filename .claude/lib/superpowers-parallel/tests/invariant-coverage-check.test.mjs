import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHECK = fileURLToPath(new URL('../../../../scripts/invariant-coverage-check.mjs', import.meta.url));

const REGISTRY_RELPATH = join('docs', 'invariants', 'registry.json');
const COVERAGE_RELPATH = join('docs', 'invariants', 'coverage');

const FIXTURE_IDS = ['X1', 'X2', 'X3'];

function makeRoot(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(root, COVERAGE_RELPATH), { recursive: true });
  return root;
}

function writeRegistry(root, ids) {
  const invariants = ids.map((id) => ({
    id,
    statement: `${id} fixture statement`,
    source: 'fixture-plan.md',
  }));
  writeFileSync(join(root, REGISTRY_RELPATH), `${JSON.stringify({ invariants }, null, 2)}\n`);
}

function rowsFor(ids) {
  return ids.map((id) => ({ id, verdict: 'not-threatened', check: `fixture check for ${id}` }));
}

function writeCoverage(root, name, rows) {
  const body = typeof rows === 'string' ? rows : `${JSON.stringify({ rows }, null, 2)}\n`;
  writeFileSync(join(root, COVERAGE_RELPATH, name), body);
}

function cleanEnv(overrides = {}) {
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
    ...overrides,
  };
}

function run(root, extra = []) {
  return spawnSync(process.execPath, [CHECK, '--root', root, ...extra], {
    encoding: 'utf8',
    env: cleanEnv(),
  });
}

function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', env: cleanEnv() });
  assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout;
}

function makeGitRoot(prefix) {
  const root = makeRoot(prefix);
  git(root, ['init', '-q', '-b', 'main']);
  git(root, ['config', 'user.email', 'fixture@example.invalid']);
  git(root, ['config', 'user.name', 'invariant fixture']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  return root;
}

function commit(root, paths, message) {
  git(root, ['add', '--', ...paths]);
  git(root, ['commit', '-q', '--no-verify', '-m', message]);
}

test('a coverage entry whose rows are set-equal to the registry passes', () => {
  const root = makeRoot('inv-happy-');
  writeRegistry(root, FIXTURE_IDS);
  writeCoverage(root, 'entry.json', rowsFor(FIXTURE_IDS));

  const result = run(root);

  assert.equal(result.status, 0, `expected a pass, got ${result.status}: ${result.stderr}`);
});

test('a registry id absent from the entry fails and names that id', () => {
  const root = makeRoot('inv-missing-');
  writeRegistry(root, FIXTURE_IDS);
  writeCoverage(root, 'entry.json', rowsFor(['X1', 'X3']));

  const result = run(root);

  assert.notEqual(result.status, 0, 'expected a non-zero exit for a missing invariant id');
  assert.match(result.stderr, /X2/);
  assert.match(result.stderr, /entry\.json/);
});

test('an id absent from the registry fails and names that id', () => {
  const root = makeRoot('inv-unknown-');
  writeRegistry(root, FIXTURE_IDS);
  writeCoverage(root, 'entry.json', rowsFor([...FIXTURE_IDS, 'Z9']));

  const result = run(root);

  assert.notEqual(result.status, 0, 'expected a non-zero exit for an unknown invariant id');
  assert.match(result.stderr, /Z9/);
});

test('a repeated id fails and names it rather than collapsing into the id set', () => {
  const root = makeRoot('inv-duplicate-');
  writeRegistry(root, FIXTURE_IDS);
  writeCoverage(root, 'entry.json', rowsFor([...FIXTURE_IDS, 'X2']));

  const result = run(root);

  assert.notEqual(result.status, 0, 'expected a non-zero exit for a duplicated invariant id');
  assert.match(result.stderr, /X2/);
});

test('an unparseable coverage entry halts red instead of being skipped', () => {
  const root = makeRoot('inv-malformed-');
  writeRegistry(root, FIXTURE_IDS);
  writeCoverage(root, 'entry.json', '{ this is not json');

  const result = run(root);

  assert.notEqual(result.status, 0, 'expected a non-zero exit for an unparseable coverage entry');
  assert.match(result.stderr, /entry\.json/);
});

test('a coverage entry that is well-formed json but not an entry shape halts red', () => {
  const root = makeRoot('inv-shape-');
  writeRegistry(root, FIXTURE_IDS);
  writeCoverage(root, 'entry.json', '[]');

  const result = run(root);

  assert.notEqual(result.status, 0, 'expected a non-zero exit for a coverage entry with no rows array');
  assert.match(result.stderr, /entry\.json/);
});

test('a row with a verdict outside the two allowed values halts red and names the id', () => {
  const root = makeRoot('inv-verdict-');
  writeRegistry(root, FIXTURE_IDS);
  const rows = rowsFor(FIXTURE_IDS);
  writeCoverage(root, 'entry.json', [...rows.slice(0, 2), { ...rows[2], verdict: 'probably-fine' }]);

  const result = run(root);

  assert.notEqual(result.status, 0, 'expected a non-zero exit for an out-of-domain verdict');
  assert.match(result.stderr, /X3/);
  assert.match(result.stderr, /probably-fine/);
});

test('a row with an empty check halts red and names the id', () => {
  const root = makeRoot('inv-check-');
  writeRegistry(root, FIXTURE_IDS);
  const rows = rowsFor(FIXTURE_IDS);
  writeCoverage(root, 'entry.json', [...rows.slice(0, 2), { ...rows[2], check: '   ' }]);

  const result = run(root);

  assert.notEqual(result.status, 0, 'expected a non-zero exit for a row with no named check');
  assert.match(result.stderr, /X3/);
});

test('a non-json file under the coverage directory halts red rather than being ignored', () => {
  const root = makeRoot('inv-stray-');
  writeRegistry(root, FIXTURE_IDS);
  writeCoverage(root, 'entry.json', rowsFor(FIXTURE_IDS));
  writeFileSync(join(root, COVERAGE_RELPATH, 'entry.jsno'), 'rows: none\n');

  const result = run(root);

  assert.notEqual(result.status, 0, 'expected a non-zero exit for an unclassifiable file in the coverage directory');
  assert.match(result.stderr, /entry\.jsno/);
});

test('a missing registry halts red rather than passing an empty id universe', () => {
  const root = makeRoot('inv-noregistry-');
  writeCoverage(root, 'entry.json', rowsFor(FIXTURE_IDS));

  const result = run(root);

  assert.notEqual(result.status, 0, 'expected a non-zero exit when the registry is absent');
  assert.match(result.stderr, /registry\.json/);
});

test('a coverage directory with no entries halts red rather than passing vacuously', () => {
  const root = makeRoot('inv-empty-');
  writeRegistry(root, FIXTURE_IDS);

  const result = run(root);

  assert.notEqual(result.status, 0, 'expected a non-zero exit when no coverage entry exists at all');
  assert.match(result.stderr, /docs\/invariants\/coverage/);
});

test('adding an id to the registry while every entry stays unchanged turns the check red', () => {
  const root = makeRoot('inv-falsifier-');
  writeRegistry(root, FIXTURE_IDS);
  writeCoverage(root, 'entry.json', rowsFor(FIXTURE_IDS));

  const before = run(root);
  assert.equal(before.status, 0, `expected the unchanged pair to pass first: ${before.stderr}`);

  writeRegistry(root, [...FIXTURE_IDS, 'X4']);
  const after = run(root);

  assert.notEqual(after.status, 0, 'expected a non-zero exit after the registry grew an unanswered id');
  assert.match(after.stderr, /X4/);
});

test('pull request mode fails when the diff adds or modifies no coverage entry', () => {
  const root = makeGitRoot('inv-pr-untouched-');
  writeRegistry(root, FIXTURE_IDS);
  writeCoverage(root, 'entry.json', rowsFor(FIXTURE_IDS));
  commit(root, ['docs'], 'base');

  git(root, ['switch', '-q', '-c', 'feature']);
  writeFileSync(join(root, 'unrelated.txt'), 'a change that answers nothing\n');
  commit(root, ['unrelated.txt'], 'unrelated change');

  const result = run(root, ['--event', 'pull_request', '--base-ref', 'main']);

  assert.notEqual(result.status, 0, 'expected a non-zero exit for a pull request that answers no invariant');
  assert.match(result.stderr, /docs\/invariants\/coverage/);
});

test('pull request mode passes when the diff adds a total coverage entry', () => {
  const root = makeGitRoot('inv-pr-answered-');
  writeRegistry(root, FIXTURE_IDS);
  writeCoverage(root, 'entry.json', rowsFor(FIXTURE_IDS));
  commit(root, ['docs'], 'base');

  git(root, ['switch', '-q', '-c', 'feature']);
  writeFileSync(join(root, 'unrelated.txt'), 'a change that is answered\n');
  writeCoverage(root, 'feature.json', rowsFor(FIXTURE_IDS));
  commit(root, ['unrelated.txt', 'docs'], 'change plus its coverage entry');

  const result = run(root, ['--event', 'pull_request', '--base-ref', 'main']);

  assert.equal(result.status, 0, `expected a pass for an answered pull request: ${result.stderr}`);
});

test('pull request mode with an unresolvable base ref halts red rather than degrading to push mode', () => {
  const root = makeGitRoot('inv-pr-nobase-');
  writeRegistry(root, FIXTURE_IDS);
  writeCoverage(root, 'entry.json', rowsFor(FIXTURE_IDS));
  commit(root, ['docs'], 'base');

  const result = run(root, ['--event', 'pull_request', '--base-ref', 'no-such-branch']);

  assert.notEqual(result.status, 0, 'expected a non-zero exit when the base ref cannot be resolved');
  assert.match(result.stderr, /no-such-branch/);
});
