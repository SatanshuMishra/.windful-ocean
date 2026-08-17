import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LINT = fileURLToPath(new URL('../skill-router-lint.mjs', import.meta.url));
const SHIPPED_SKILL = fileURLToPath(new URL('../../../.claude/skills/platform-engineer', import.meta.url));
const SIDE_FILE = join('procedures', 'only.md');

const VALID_SKILL = [
  '---',
  'name: fixture-skill',
  'description: A fixture router used to prove this lint is able to fail.',
  '---',
  '',
  '# Fixture',
  '',
  'The receipt discipline is `receipts:gates`.',
  '',
  '| Duty | Procedure |',
  '|---|---|',
  `| Do the one thing | \`${SIDE_FILE.split('\\').join('/')}\` |`,
  '',
].join('\n');

const VALID_SIDE_FILE = ['# Only', '', 'The procedure body.', ''].join('\n');

const DEFAULTS = Object.freeze({
  dirName: 'fixture-skill',
  skill: VALID_SKILL,
  sideFile: VALID_SIDE_FILE,
  omitSideFile: false,
  extraFileName: null,
  extraFileText: '',
  sibling: null,
  skillIsDirectory: false,
});

function skillOfExactly(bytes) {
  const base = `${VALID_SKILL}\n`;
  return base + 'x'.repeat(bytes - Buffer.byteLength(base, 'utf8'));
}

function buildFixture(overrides) {
  const options = { ...DEFAULTS, ...overrides };
  const base = mkdtempSync(join(tmpdir(), 'skill-router-lint-'));
  const root = join(base, 'skills', options.dirName);
  mkdirSync(join(root, 'procedures'), { recursive: true });
  if (options.skillIsDirectory) mkdirSync(join(root, 'SKILL.md'), { recursive: true });
  else writeFileSync(join(root, 'SKILL.md'), options.skill);
  if (!options.omitSideFile) writeFileSync(join(root, SIDE_FILE), options.sideFile);
  if (options.extraFileName !== null) writeFileSync(join(root, options.extraFileName), options.extraFileText);
  if (options.sibling !== null) mkdirSync(join(base, 'skills', options.sibling), { recursive: true });
  return Object.freeze({ base, root });
}

function lint(root) {
  const result = spawnSync(process.execPath, [LINT, root], { encoding: 'utf8' });
  if (result.error) assert.fail(`the lint could not be spawned for ${root}: ${result.error.message}`);
  return Object.freeze({ status: result.status, stdout: result.stdout, stderr: result.stderr });
}

function lintFixture(t, overrides) {
  const fixture = buildFixture(overrides);
  t.after(() => rmSync(fixture.base, { recursive: true, force: true }));
  return lint(fixture.root);
}

function assertRed(result, code) {
  assert.equal(result.status, 1, `expected ${code} to be reported as a problem, got status ${result.status} with stderr ${result.stderr}`);
  assert.ok(result.stderr.includes(code), `expected stderr to name ${code}, got ${result.stderr}`);
}

test('the shipped platform-engineer skill passes every assertion', () => {
  const result = lint(SHIPPED_SKILL);
  assert.equal(result.status, 0, `the shipped skill failed the lint: ${result.stderr}`);
  assert.match(result.stdout, /^OK /);
  assert.match(result.stdout, /SKILL\.md \d+ bytes \(limit 4096\)/);
});

test('a valid fixture passes, so every red below is caused by its own mutation', (t) => {
  const result = lintFixture(t, {});
  assert.equal(result.status, 0, `the control fixture failed the lint: ${result.stderr}`);
});

test('an absent SKILL.md is reported rather than skipped', (t) => {
  const fixture = buildFixture({});
  t.after(() => rmSync(fixture.base, { recursive: true, force: true }));
  const result = lint(join(fixture.base, 'skills', 'no-such-skill'));
  assertRed(result, 'SKILL_MD_MISSING');
});

test('a SKILL.md of exactly 4096 bytes is at the limit and passes', (t) => {
  const skill = skillOfExactly(4096);
  assert.equal(Buffer.byteLength(skill, 'utf8'), 4096);
  const result = lintFixture(t, { skill });
  assert.equal(result.status, 0, `4096 bytes is at the limit and must pass: ${result.stderr}`);
  assert.ok(result.stdout.includes('4096 bytes'), `expected the measured size in ${result.stdout}`);
});

test('a SKILL.md of exactly 4097 bytes is over the limit and is reported with its measured size', (t) => {
  const skill = skillOfExactly(4097);
  assert.equal(Buffer.byteLength(skill, 'utf8'), 4097);
  const result = lintFixture(t, { skill });
  assertRed(result, 'SKILL_MD_OVERSIZE');
  assert.ok(result.stderr.includes('4097 bytes'), `expected the measured size in ${result.stderr}`);
});

test('a SKILL.md that is a directory rather than a regular file is reported, not crashed on', (t) => {
  assertRed(lintFixture(t, { skillIsDirectory: true }), 'SKILL_MD_MISSING');
});

test('a separator row with too few dashes is malformed rather than accepted', (t) => {
  assertRed(lintFixture(t, { skill: VALID_SKILL.replace('|---|---|', '|--|--|') }), 'ROUTING_TABLE_MALFORMED');
});

test('frontmatter that does not parse halts the census', (t) => {
  const broken = VALID_SKILL.replace('name: fixture-skill', 'this line is not a field');
  assertRed(lintFixture(t, { skill: broken }), 'FRONTMATTER_UNPARSEABLE');
});

test('a name that disagrees with the directory is reported', (t) => {
  assertRed(lintFixture(t, { dirName: 'other-name' }), 'SKILL_NAME_MISMATCH');
});

test('a routed side file that does not exist is named', (t) => {
  const result = lintFixture(t, { omitSideFile: true });
  assertRed(result, 'ROUTING_SIDE_FILE_MISSING');
  assert.ok(result.stderr.includes('procedures/only.md'), `expected the missing path to be named in ${result.stderr}`);
});

test('a routing table with no rows is reported rather than passing over nothing', (t) => {
  const empty = VALID_SKILL.split('\n').filter((line) => !line.includes(SIDE_FILE.split('\\').join('/'))).join('\n');
  assertRed(lintFixture(t, { skill: empty }), 'ROUTING_TABLE_EMPTY');
});

test('a routing row that names two paths is unclassifiable and halts', (t) => {
  const ambiguous = VALID_SKILL.replace('| `procedures/only.md` |', '| `procedures/only.md` and `procedures/other.md` |');
  assertRed(lintFixture(t, { skill: ambiguous }), 'ROUTING_ROW_UNCLASSIFIABLE');
});

test('a colon-joined reference that is not plugin:skill is reported', (t) => {
  assertRed(lintFixture(t, { sideFile: `${VALID_SIDE_FILE}\nSee \`Receipts:Gates\`.\n` }), 'SKILL_REFERENCE_NOT_QUALIFIED');
});

test('a bare plugin name is reported wherever it appears under the skill', (t) => {
  assertRed(lintFixture(t, { sideFile: `${VALID_SIDE_FILE}\nSee \`receipts\`.\n` }), 'SKILL_REFERENCE_BARE');
});

test('a bare sibling skill name is reported', (t) => {
  const result = lintFixture(t, { sibling: 'neighbour-skill', sideFile: `${VALID_SIDE_FILE}\nSee \`neighbour-skill\`.\n` });
  assertRed(result, 'SKILL_REFERENCE_BARE');
});

test('a skill carrying no qualified reference at all fails instead of passing vacuously', (t) => {
  const stripped = VALID_SKILL.replace('The receipt discipline is `receipts:gates`.', 'No reference here.');
  assertRed(lintFixture(t, { skill: stripped }), 'SKILL_REFERENCE_ABSENT');
});

test('a side file the routing table does not name is still censused for bare references', (t) => {
  const result = lintFixture(t, { extraFileName: 'unrouted.md', extraFileText: 'See `receipts`.\n' });
  assertRed(result, 'SKILL_REFERENCE_BARE');
  assert.ok(result.stderr.includes('unrouted.md'), `expected the unrouted file to be named in ${result.stderr}`);
});
