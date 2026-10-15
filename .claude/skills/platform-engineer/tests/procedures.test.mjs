import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL_DIR = fileURLToPath(new URL('..', import.meta.url));
const DOCKER_PROOF = fileURLToPath(new URL('./reader-role.docker.mjs', import.meta.url));

function read(relativePath) {
  return readFileSync(join(SKILL_DIR, relativePath), 'utf8');
}

const OLD_BOUNDARY = ['read only', 'its structure'].join(' ');

const SQL_STANDARD_HEADINGS = Object.freeze([
  'Naming and types',
  'Constraints and keys',
  'Indexes',
  'Queries',
  'Security and privileges',
  'Safe migrations',
  'Proof on the destination',
]);

test('the skill routes to sql standards with every section', () => {
  const skill = read('SKILL.md');
  const routingRows = skill.split('\n').filter((line) => line.trim().startsWith('|'));
  assert.ok(
    routingRows.some((line) => line.includes('`procedures/sql-standards.md`')),
    'SKILL.md has no routing row naming procedures/sql-standards.md',
  );
  assert.ok(!skill.includes(OLD_BOUNDARY), 'SKILL.md still carries the old structure-only boundary');
  const standards = read('procedures/sql-standards.md');
  const headings = standards.split('\n').filter((line) => line.startsWith('## ')).map((line) => line.slice(3).trim());
  const missing = SQL_STANDARD_HEADINGS.filter((heading) => !headings.includes(heading));
  assert.deepEqual(missing, [], `procedures/sql-standards.md lacks the headings ${missing.join(', ')}`);
});

test('migration and hand-back procedures describe approval', () => {
  const migration = read('procedures/schema-migration.md');
  const handback = read('procedures/handback.md');
  for (const [name, text] of [['schema-migration.md', migration], ['handback.md', handback]]) {
    assert.ok(text.includes('plain English'), `${name} does not ask for a plain English explanation`);
    assert.ok(text.includes('approval'), `${name} does not describe approval`);
  }
  const withheld = handback.split('\n').find((line) => line.includes('approval') && line.includes('withheld'));
  assert.ok(withheld, 'handback.md does not say what to hand over when approval is withheld');
  for (const part of ['run order', 'pre-check read', 'backup step', 'verification read', 'rollback']) {
    assert.ok(withheld.includes(part), `handback.md's withheld-approval steps omit ${part}: ${withheld}`);
  }
});

test('reader role proof fails without docker', (t) => {
  const emptyPath = mkdtempSync(join(tmpdir(), 'reader-role-no-docker-'));
  t.after(() => rmSync(emptyPath, { recursive: true, force: true }));
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !['NODE_TEST_CONTEXT', 'NODE_OPTIONS', 'PATH'].includes(key)),
  );
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', DOCKER_PROOF], {
    encoding: 'utf8',
    env: { ...env, PATH: emptyPath },
  });
  const output = `${result.stdout}${result.stderr}`;
  assert.notEqual(result.status, 0, `the Docker proof passed with no docker on PATH: ${output}`);
  assert.match(output, /Docker/, `the failure does not name Docker: ${output}`);
  assert.match(output, /^# skipped 0$/m, `the Docker proof reported a skipped test: ${output}`);
  assert.doesNotMatch(output, /# SKIP/, `the Docker proof marked a test skipped: ${output}`);
  assert.match(output, /^# fail [1-9]/m, `the Docker proof reported no failing test: ${output}`);
});
