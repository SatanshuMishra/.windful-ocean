import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

const WITNESS_RELPATH = 'fixtures/witness.mjs';
const WITNESS_ENTRY = 'holds';
const WITNESS_TITLE = 'the fixture witness iterates its domain';
const FIXTURE_WITNESS = `${WITNESS_RELPATH}#${WITNESS_ENTRY}`;

function writeWitnessModule(root) {
  writeFileAt(root, WITNESS_RELPATH, [
    "import { test } from 'node:test';",
    '',
    `export function ${WITNESS_ENTRY}() {`,
    '  return true;',
    '}',
    '',
    `test('${WITNESS_TITLE}', () => {`,
    `  ${WITNESS_ENTRY}();`,
    '});',
    '',
  ].join('\n'));
}

function writeRegistry(root, ids, inertWhen = {}, witnesses = {}) {
  writeWitnessModule(root);
  const invariants = ids.map((id) => {
    const witness = witnesses[id] === undefined ? FIXTURE_WITNESS : witnesses[id];
    return {
      id,
      statement: `${id} fixture statement`,
      source: 'fixture-plan.md',
      ...(witness === null ? {} : { witness }),
      ...(inertWhen[id] === undefined ? {} : { inert_when: inertWhen[id] }),
    };
  });
  writeFileSync(join(root, REGISTRY_RELPATH), `${JSON.stringify({ invariants }, null, 2)}\n`);
}

function rowsFor(ids) {
  return ids.map((id) => ({ id, verdict: 'not-threatened', check: `fixture check for ${id}` }));
}

function inertRow(id, overrides = {}) {
  return {
    id,
    verdict: 'not-threatened',
    basis: 'inert',
    check: `placeholder awaiting the machine-written proof for ${id}`,
    ...overrides,
  };
}

function writeCoverage(root, name, rows) {
  const body = typeof rows === 'string' ? rows : `${JSON.stringify({ rows }, null, 2)}\n`;
  writeFileSync(join(root, COVERAGE_RELPATH, name), body);
}

function readCoverage(root, name) {
  return readFileSync(join(root, COVERAGE_RELPATH, name), 'utf8');
}

function writeFileAt(root, relpath, body) {
  mkdirSync(join(root, ...relpath.split('/').slice(0, -1)), { recursive: true });
  writeFileSync(join(root, ...relpath.split('/')), body);
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
  const root = makeGitRoot('inv-missing-');
  writeRegistry(root, FIXTURE_IDS);
  writeCoverage(root, 'entry.json', rowsFor(FIXTURE_IDS));
  commit(root, ['docs'], 'base');

  git(root, ['switch', '-q', '-c', 'feature']);
  writeCoverage(root, 'entry.json', rowsFor(['X1', 'X3']));
  commit(root, ['docs'], 'an entry that drops an id');

  const result = run(root, ['--event', 'pull_request', '--base-ref', 'main']);

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

test('adding an id to the registry turns the check red for the entry the change touches', () => {
  const root = makeGitRoot('inv-falsifier-');
  writeRegistry(root, FIXTURE_IDS);
  writeCoverage(root, 'entry.json', rowsFor(FIXTURE_IDS));
  commit(root, ['docs'], 'base');

  git(root, ['switch', '-q', '-c', 'feature']);
  writeCoverage(root, 'feature.json', rowsFor(FIXTURE_IDS));
  commit(root, ['docs'], 'a change plus its coverage entry');

  const before = run(root, ['--event', 'pull_request', '--base-ref', 'main']);
  assert.equal(before.status, 0, `expected the answered pair to pass first: ${before.stderr}`);

  writeRegistry(root, [...FIXTURE_IDS, 'X4']);
  commit(root, ['docs'], 'the registry grows an id nothing answers');
  const after = run(root, ['--event', 'pull_request', '--base-ref', 'main']);

  assert.notEqual(after.status, 0, 'expected a non-zero exit after the registry grew an unanswered id');
  assert.match(after.stderr, /X4/);
  assert.match(after.stderr, /feature\.json/);
});

test('a registry id added alongside a new entry fails that entry without failing an untouched historical one', () => {
  const root = makeGitRoot('inv-scoped-');
  writeRegistry(root, FIXTURE_IDS);
  writeCoverage(root, 'historical.json', rowsFor(FIXTURE_IDS));
  commit(root, ['docs'], 'base');

  git(root, ['switch', '-q', '-c', 'feature']);
  writeRegistry(root, [...FIXTURE_IDS, 'X4']);
  writeCoverage(root, 'feature.json', rowsFor(FIXTURE_IDS));
  commit(root, ['docs'], 'a new entry that does not answer the new id');

  const unanswered = run(root, ['--event', 'pull_request', '--base-ref', 'main']);

  assert.notEqual(unanswered.status, 0, 'expected a non-zero exit for the entry this change adds');
  assert.match(unanswered.stderr, /feature\.json: missing invariant id\(s\): X4/);
  assert.doesNotMatch(unanswered.stderr, /historical\.json/);

  writeCoverage(root, 'feature.json', rowsFor([...FIXTURE_IDS, 'X4']));
  commit(root, ['docs'], 'the new entry answers the new id');

  const answered = run(root, ['--event', 'pull_request', '--base-ref', 'main']);

  assert.equal(answered.status, 0, `expected the untouched historical entry to stay out of completeness scope: ${answered.stderr}`);
});

test('push mode reports the base it scoped completeness to and leaves an untouched stale entry alone', () => {
  const root = makeGitRoot('inv-push-scoped-');
  writeRegistry(root, FIXTURE_IDS);
  writeCoverage(root, 'historical.json', rowsFor(FIXTURE_IDS));
  commit(root, ['docs'], 'base');

  git(root, ['switch', '-q', '-c', 'feature']);
  writeRegistry(root, [...FIXTURE_IDS, 'X4']);
  writeCoverage(root, 'feature.json', rowsFor([...FIXTURE_IDS, 'X4']));
  commit(root, ['docs'], 'a new entry that answers the new id');

  const result = run(root);

  assert.equal(result.status, 0, `expected a scoped push run to pass: ${result.stderr}`);
  assert.match(result.stdout, /completeness: scoped to 1 entry changed since main/);
});

test('push mode with no resolvable base passes but states that completeness was not scoped', () => {
  const root = makeGitRoot('inv-push-nobase-');
  writeRegistry(root, FIXTURE_IDS);
  writeCoverage(root, 'entry.json', rowsFor(FIXTURE_IDS));

  const result = run(root);

  assert.equal(result.status, 0, `expected a pass when no base commit exists to scope against: ${result.stderr}`);
  assert.match(result.stdout, /completeness: not scoped/);
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

test('a barred id carrying inert_when halts the registry read and names that id', () => {
  const root = makeRoot('inv-inert-barred-');
  writeRegistry(root, ['X1', 'M3'], { M3: { paths: ['docs/**'] } });
  writeCoverage(root, 'entry.json', rowsFor(['X1', 'M3']));

  const result = run(root);

  assert.notEqual(result.status, 0, 'expected a non-zero exit for an inert_when on a structurally barred id');
  assert.match(result.stderr, /M3/);
  assert.match(result.stderr, /inert_when/);
});

test('an inert_when carrying a key other than paths halts and names that key', () => {
  const root = makeRoot('inv-inert-key-');
  writeRegistry(root, FIXTURE_IDS, { X1: { paths: ['docs/**'], since: '2026-08-06' } });
  writeCoverage(root, 'entry.json', rowsFor(FIXTURE_IDS));

  const result = run(root);

  assert.notEqual(result.status, 0, 'expected a non-zero exit for an inert_when with an unknown key');
  assert.match(result.stderr, /since/);
  assert.match(result.stderr, /X1/);
});

test('an inert_when glob using unsupported syntax halts and names that glob', () => {
  const root = makeRoot('inv-inert-syntax-');
  writeRegistry(root, FIXTURE_IDS, { X1: { paths: ['docs/{a,b}/**'] } });
  writeCoverage(root, 'entry.json', rowsFor(FIXTURE_IDS));

  const result = run(root);

  assert.notEqual(result.status, 0, 'expected a non-zero exit for a glob outside the supported subset');
  assert.match(result.stderr, /docs\/\{a,b\}\/\*\*/);
});

test('a ** placed beside other characters in a segment halts and names that glob', () => {
  const root = makeRoot('inv-inert-adjacent-');
  writeRegistry(root, FIXTURE_IDS, { X1: { paths: ['docs/a**b'] } });
  writeCoverage(root, 'entry.json', rowsFor(FIXTURE_IDS));

  const result = run(root);

  assert.notEqual(result.status, 0, 'expected a non-zero exit for a ** that is not a whole path segment');
  assert.match(result.stderr, /docs\/a\*\*b/);
});

test('a changed path outside every declared glob falsifies the basis and names that path', () => {
  const root = makeGitRoot('inv-inert-unmatched-');
  writeRegistry(root, FIXTURE_IDS, { X1: { paths: ['docs/**'] } });
  writeCoverage(root, 'entry.json', rowsFor(FIXTURE_IDS));
  commit(root, ['docs'], 'base');

  git(root, ['switch', '-q', '-c', 'feature']);
  writeCoverage(root, 'feature.json', [...rowsFor(['X2', 'X3']), inertRow('X1')]);
  writeFileAt(root, 'src/engine.mjs', 'export const engine = () => null;\n');
  commit(root, ['docs', 'src'], 'a change that reaches outside the declared paths');
  const before = readCoverage(root, 'feature.json');

  const result = run(root, ['--event', 'pull_request', '--base-ref', 'main']);

  assert.notEqual(result.status, 0, 'expected a non-zero exit for a changed path no declared glob absorbs');
  assert.match(result.stderr, /X1/);
  assert.match(result.stderr, /src\/engine\.mjs/);

  const written = run(root, ['--event', 'pull_request', '--base-ref', 'main', '--write']);

  assert.notEqual(written.status, 0, 'expected --write to refuse an unproven basis');
  assert.match(written.stderr, /src\/engine\.mjs/);
  assert.equal(readCoverage(root, 'feature.json'), before, 'expected --write to leave the entry untouched when the basis is falsified');
});

test('a deleted path outside every declared glob falsifies the basis', () => {
  const root = makeGitRoot('inv-inert-deleted-');
  writeRegistry(root, FIXTURE_IDS, { X1: { paths: ['docs/**'] } });
  writeCoverage(root, 'entry.json', rowsFor(FIXTURE_IDS));
  writeFileAt(root, 'legacy/guard.mjs', 'export const guard = () => true;\n');
  commit(root, ['docs', 'legacy'], 'base');

  git(root, ['switch', '-q', '-c', 'feature']);
  writeCoverage(root, 'feature.json', [...rowsFor(['X2', 'X3']), inertRow('X1')]);
  git(root, ['rm', '-q', '--', 'legacy/guard.mjs']);
  commit(root, ['docs'], 'a change that deletes a guard outside the declared paths');

  const result = run(root, ['--event', 'pull_request', '--base-ref', 'main']);

  assert.notEqual(result.status, 0, 'expected a non-zero exit for a deletion no declared glob absorbs');
  assert.match(result.stderr, /legacy\/guard\.mjs/);
});

test('an inert row whose id declares no inert_when halts and names the id', () => {
  const root = makeGitRoot('inv-inert-undeclared-');
  writeRegistry(root, FIXTURE_IDS);
  writeCoverage(root, 'entry.json', rowsFor(FIXTURE_IDS));
  commit(root, ['docs'], 'base');

  git(root, ['switch', '-q', '-c', 'feature']);
  writeCoverage(root, 'feature.json', [...rowsFor(['X2', 'X3']), inertRow('X1')]);
  commit(root, ['docs'], 'an inert row the registry never authorized');

  const result = run(root, ['--event', 'pull_request', '--base-ref', 'main']);

  assert.notEqual(result.status, 0, 'expected a non-zero exit for an inert row with no registry declaration');
  assert.match(result.stderr, /X1/);
  assert.match(result.stderr, /inert_when/);
});

test('an inert row carrying the threatened verdict halts and names the id', () => {
  const root = makeGitRoot('inv-inert-threatened-');
  writeRegistry(root, FIXTURE_IDS, { X1: { paths: ['docs/**'] } });
  writeCoverage(root, 'entry.json', rowsFor(FIXTURE_IDS));
  commit(root, ['docs'], 'base');

  git(root, ['switch', '-q', '-c', 'feature']);
  writeCoverage(root, 'feature.json', [...rowsFor(['X2', 'X3']), inertRow('X1', { verdict: 'threatened' })]);
  commit(root, ['docs'], 'an inert row that also claims to be threatened');

  const result = run(root, ['--event', 'pull_request', '--base-ref', 'main']);

  assert.notEqual(result.status, 0, 'expected a non-zero exit for an inert basis paired with a threatened verdict');
  assert.match(result.stderr, /X1/);
  assert.match(result.stderr, /threatened/);
});

test('a basis outside the one allowed value halts and names that value', () => {
  const root = makeRoot('inv-inert-basis-value-');
  writeRegistry(root, FIXTURE_IDS, { X1: { paths: ['docs/**'] } });
  writeCoverage(root, 'entry.json', [...rowsFor(['X2', 'X3']), inertRow('X1', { basis: 'obviously-fine' })]);

  const result = run(root);

  assert.notEqual(result.status, 0, 'expected a non-zero exit for a basis outside the allowed value');
  assert.match(result.stderr, /X1/);
  assert.match(result.stderr, /obviously-fine/);
});

test('a hand-edited inert check text halts red and names the entry', () => {
  const root = makeGitRoot('inv-inert-handedited-');
  writeRegistry(root, FIXTURE_IDS, { X1: { paths: ['docs/**'] } });
  writeCoverage(root, 'entry.json', rowsFor(FIXTURE_IDS));
  commit(root, ['docs'], 'base');

  git(root, ['switch', '-q', '-c', 'feature']);
  writeCoverage(root, 'feature.json', [...rowsFor(['X2', 'X3']), inertRow('X1')]);
  commit(root, ['docs'], 'a change plus its coverage entry');

  const proved = run(root, ['--event', 'pull_request', '--base-ref', 'main', '--write']);
  assert.equal(proved.status, 0, `expected --write to prove the basis first: ${proved.stderr}`);

  const rows = JSON.parse(readCoverage(root, 'feature.json')).rows;
  writeCoverage(root, 'feature.json', rows.map((row) => (
    row.id === 'X1' ? { ...row, check: 'INERT: nothing in this diff could possibly matter' } : row
  )));

  const result = run(root, ['--event', 'pull_request', '--base-ref', 'main']);

  assert.notEqual(result.status, 0, 'expected a non-zero exit for an inert check this checker did not derive');
  assert.match(result.stderr, /X1/);
  assert.match(result.stderr, /feature\.json/);
});

test('--write proves the basis into the entry and a second --write is byte-identical', () => {
  const root = makeGitRoot('inv-inert-write-');
  writeRegistry(root, FIXTURE_IDS, { X1: { paths: ['docs/**', 'src/**'] } });
  writeCoverage(root, 'entry.json', rowsFor(FIXTURE_IDS));
  commit(root, ['docs'], 'base');

  git(root, ['switch', '-q', '-c', 'feature']);
  writeCoverage(root, 'feature.json', [...rowsFor(['X2', 'X3']), inertRow('X1')]);
  writeFileAt(root, 'src/engine.mjs', 'export const engine = () => null;\n');
  commit(root, ['docs', 'src'], 'a change plus its coverage entry');

  const first = run(root, ['--event', 'pull_request', '--base-ref', 'main', '--write']);
  assert.equal(first.status, 0, `expected --write to prove the basis: ${first.stderr}`);

  const written = readCoverage(root, 'feature.json');
  assert.match(written, /INERT: no changed path can reach X1\./);
  assert.match(written, /docs\/invariants\/coverage\/feature\.json/);
  assert.match(written, /src\/engine\.mjs/);
  assert.match(written, /Machine-written/);

  const verified = run(root, ['--event', 'pull_request', '--base-ref', 'main']);
  assert.equal(verified.status, 0, `expected the written text to pass a plain run: ${verified.stderr}`);

  const second = run(root, ['--event', 'pull_request', '--base-ref', 'main', '--write']);
  assert.equal(second.status, 0, `expected a second --write to stay green: ${second.stderr}`);
  assert.equal(readCoverage(root, 'feature.json'), written, 'expected --write to be idempotent');
});

test('an unscoped historical inert row is not re-derived while a scoped one is proved', () => {
  const root = makeGitRoot('inv-inert-historical-');
  writeRegistry(root, FIXTURE_IDS, { X1: { paths: ['docs/**'] } });
  writeCoverage(root, 'historical.json', [
    ...rowsFor(['X2', 'X3']),
    inertRow('X1', { check: 'INERT: proved against this entry\'s own diff, months ago' }),
  ]);
  commit(root, ['docs'], 'base');
  const historical = readCoverage(root, 'historical.json');

  git(root, ['switch', '-q', '-c', 'feature']);
  writeCoverage(root, 'feature.json', [...rowsFor(['X2', 'X3']), inertRow('X1')]);
  commit(root, ['docs'], 'a change plus its coverage entry');

  const proved = run(root, ['--event', 'pull_request', '--base-ref', 'main', '--write']);

  assert.equal(proved.status, 0, `expected the scoped entry to be proved: ${proved.stderr}`);
  assert.equal(readCoverage(root, 'historical.json'), historical, 'expected the untouched historical entry to be left alone');
  assert.match(readCoverage(root, 'feature.json'), /INERT: no changed path can reach X1\./);

  const result = run(root, ['--event', 'pull_request', '--base-ref', 'main']);

  assert.equal(result.status, 0, `expected the historical inert row to stay out of the proof scope: ${result.stderr}`);
});

test('no resolvable base with an inert row anywhere fails loudly and names the entry', () => {
  const root = makeGitRoot('inv-inert-nobase-');
  writeRegistry(root, FIXTURE_IDS, { X1: { paths: ['docs/**'] } });
  writeCoverage(root, 'entry.json', [...rowsFor(['X2', 'X3']), inertRow('X1')]);

  const result = run(root);

  assert.notEqual(result.status, 0, 'expected a non-zero exit for an inert basis with no diff to prove it against');
  assert.match(result.stderr, /entry\.json/);
  assert.match(result.stderr, /inert/);

  const written = run(root, ['--write']);

  assert.notEqual(written.status, 0, 'expected --write to refuse when no scope is established');

  writeCoverage(root, 'entry.json', rowsFor(FIXTURE_IDS));
  const prose = run(root);

  assert.equal(prose.status, 0, `expected an entry with no inert row to keep passing unscoped: ${prose.stderr}`);
  assert.match(prose.stdout, /completeness: not scoped/);
});

test('an unwaived invariant carrying no witness halts and names the waiver constant', () => {
  const root = makeRoot('inv-witness-absent-');
  writeRegistry(root, FIXTURE_IDS, {}, { X2: null });
  writeCoverage(root, 'entry.json', rowsFor(FIXTURE_IDS));

  const result = run(root);

  assert.notEqual(result.status, 0, 'expected a non-zero exit for an invariant with neither a witness nor a waiver');
  assert.match(result.stderr, /"witness"/);
  assert.match(result.stderr, /UNWITNESSED_IDS/);
});

test('a waived invariant needs no witness and is refused one while the waiver stands', () => {
  const waived = ['M1', 'X2', 'X3'];
  const clean = makeRoot('inv-witness-waived-');
  writeRegistry(clean, waived, {}, { M1: null });
  writeCoverage(clean, 'entry.json', rowsFor(waived));

  const passing = run(clean);

  assert.equal(passing.status, 0, `expected a waived id to pass without a witness: ${passing.stderr}`);

  const root = makeRoot('inv-witness-waived-carrying-');
  writeRegistry(root, waived);
  writeCoverage(root, 'entry.json', rowsFor(waived));

  const result = run(root);

  assert.notEqual(result.status, 0, 'expected a non-zero exit for a waived id that already carries a witness');
  assert.match(result.stderr, /M1/);
  assert.match(result.stderr, /UNWITNESSED_IDS/);
});

test('a witness written as prose halts and names the accepted shape', () => {
  const root = makeRoot('inv-witness-prose-');
  writeRegistry(root, FIXTURE_IDS, {}, { X1: 'the policy suite covers this thoroughly' });
  writeCoverage(root, 'entry.json', rowsFor(FIXTURE_IDS));

  const result = run(root);

  assert.notEqual(result.status, 0, 'expected a non-zero exit for a witness that is prose rather than an entry point');
  assert.match(result.stderr, /X1/);
  assert.match(result.stderr, /exportedIdentifier/);
});

test('a witness naming a file that does not exist halts and names that path', () => {
  const root = makeRoot('inv-witness-missing-file-');
  writeRegistry(root, FIXTURE_IDS, {}, { X1: 'fixtures/absent.mjs#holds' });
  writeCoverage(root, 'entry.json', rowsFor(FIXTURE_IDS));

  const result = run(root);

  assert.notEqual(result.status, 0, 'expected a non-zero exit for a witness naming an absent file');
  assert.match(result.stderr, /fixtures\/absent\.mjs/);
});

test('a witness escaping the root with a parent segment halts and names the path', () => {
  const root = makeRoot('inv-witness-escape-');
  writeRegistry(root, FIXTURE_IDS, {}, { X1: '../elsewhere/witness.mjs#holds' });
  writeCoverage(root, 'entry.json', rowsFor(FIXTURE_IDS));

  const result = run(root);

  assert.notEqual(result.status, 0, 'expected a non-zero exit for a witness path that escapes the repository root');
  assert.match(result.stderr, /elsewhere\/witness\.mjs/);
});

test('a witness naming an identifier the file never exports halts and names the entry point', () => {
  const root = makeRoot('inv-witness-unexported-');
  writeRegistry(root, FIXTURE_IDS, {}, { X1: `${WITNESS_RELPATH}#neverExported` });
  writeCoverage(root, 'entry.json', rowsFor(FIXTURE_IDS));

  const result = run(root);

  assert.notEqual(result.status, 0, 'expected a non-zero exit for a witness naming an unexported identifier');
  assert.match(result.stderr, /neverExported/);
  assert.match(result.stderr, /does not export/);
});

test('a witness naming a declared test title passes while a title only present as prose halts', () => {
  const root = makeRoot('inv-witness-title-');
  writeRegistry(root, FIXTURE_IDS, {}, { X1: `${WITNESS_RELPATH}#test:${WITNESS_TITLE}` });
  writeCoverage(root, 'entry.json', rowsFor(FIXTURE_IDS));

  const passing = run(root);

  assert.equal(passing.status, 0, `expected a witness naming a declared test title to pass: ${passing.stderr}`);

  const masked = makeRoot('inv-witness-title-masked-');
  writeFileAt(masked, 'fixtures/prose.mjs', `export const note = 'a census that halts on the unclassifiable';\n`);
  writeRegistry(masked, FIXTURE_IDS, {}, { X1: 'fixtures/prose.mjs#test:a census that halts on the unclassifiable' });
  writeCoverage(masked, 'entry.json', rowsFor(FIXTURE_IDS));

  const result = run(masked);

  assert.notEqual(result.status, 0, 'expected a title found only inside a string literal to be refused as a witness');
  assert.match(result.stderr, /declares no test\(/);
});
