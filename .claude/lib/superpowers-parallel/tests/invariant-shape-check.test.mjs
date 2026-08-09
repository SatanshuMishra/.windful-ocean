import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unclassifiedCandidates } from '../../../../scripts/invariant-census.mjs';

const CHECK = fileURLToPath(new URL('../../../../scripts/invariant-shape-check.mjs', import.meta.url));

const REGISTRY_RELPATH = join('docs', 'invariants', 'registry.json');
const PRODUCTION_RELPATH = 'scripts/policy.mjs';
const LIB_RELPATH = '.claude/lib/superpowers-parallel/policy.mjs';
const PROBE_RELPATH = '.claude/lib/superpowers-parallel/tests/policy-probe.test.mjs';

function cleanEnv() {
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
  };
}

function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', env: cleanEnv() });
  assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout;
}

function writeAt(root, relpath, body) {
  const absolute = join(root, ...relpath.split('/'));
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, body);
}

function makeRoot(prefix, files, invariants) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  writeAt(root, REGISTRY_RELPATH.split('/').join('/'), `${JSON.stringify({ invariants }, null, 2)}\n`);
  for (const [relpath, body] of Object.entries(files)) writeAt(root, relpath, body);
  git(root, ['init', '-q', '-b', 'main']);
  git(root, ['add', '-A']);
  return root;
}

function run(root) {
  return spawnSync(process.execPath, [CHECK, '--root', root], { encoding: 'utf8', env: cleanEnv() });
}

const QUANTIFIED_SOURCE = [
  "export const STAGES = Object.freeze(['observe', 'converge']);",
  '',
  'export function isStage(candidate) {',
  '  return STAGES.includes(candidate);',
  '}',
  '',
  'export function stageNames() {',
  '  return [...STAGES];',
  '}',
  '',
].join('\n');

const stagesDomain = (overrides = {}) => ({
  id: 'F1',
  statement: 'F1 fixture statement',
  source: 'fixture-plan.md',
  domain: { path: PRODUCTION_RELPATH, line: 1, constant: 'STAGES', ...overrides },
});

test('a domain over an exported closed set that nothing enlarges passes both checks', () => {
  const root = makeRoot('shape-green-', { [PRODUCTION_RELPATH]: QUANTIFIED_SOURCE }, [stagesDomain()]);

  const result = run(root);

  assert.equal(result.status, 0, `expected a pass, got ${result.status}: ${result.stderr}`);
  assert.match(result.stdout, /1 candidate domain\(s\)/);
});

test('a domain naming a constant the cited file never declares halts and names it', () => {
  const root = makeRoot('shape-absent-', { [PRODUCTION_RELPATH]: QUANTIFIED_SOURCE }, [stagesDomain({ constant: 'PHASES' })]);

  const result = run(root);

  assert.notEqual(result.status, 0, 'expected a non-zero exit for a domain constant that does not exist in code');
  assert.match(result.stderr, /PHASES/);
  assert.match(result.stderr, /does not declare at module scope/);
});

test('a domain citing a line the constant is not declared at halts and names both lines', () => {
  const root = makeRoot('shape-line-', { [PRODUCTION_RELPATH]: QUANTIFIED_SOURCE }, [stagesDomain({ line: 9 })]);

  const result = run(root);

  assert.notEqual(result.status, 0, 'expected a non-zero exit for a stale path:line citation');
  assert.match(result.stderr, /policy\.mjs:9/);
  assert.match(result.stderr, /policy\.mjs:1/);
});

test('a module-private domain constant halts because no other module can iterate it', () => {
  const source = QUANTIFIED_SOURCE.replace('export const STAGES', 'const STAGES');
  const root = makeRoot('shape-private-', { [PRODUCTION_RELPATH]: source }, [stagesDomain()]);

  const result = run(root);

  assert.notEqual(result.status, 0, 'expected a non-zero exit for a module-private domain constant');
  assert.match(result.stderr, /module-private/);
  assert.match(result.stderr, /STAGES/);
});

test('a hand-listed domain that is a proper subset of a larger closed set halts and names what it leaves out', () => {
  const source = [
    "export const STAGES = Object.freeze(['observe', 'converge']);",
    '',
    "export const ALL_STAGES = Object.freeze(['observe', 'converge', 'read', 'ship']);",
    '',
    'export function isStage(candidate) {',
    '  return ALL_STAGES.includes(candidate);',
    '}',
    '',
  ].join('\n');
  const root = makeRoot('shape-subset-', { [PRODUCTION_RELPATH]: source }, [
    stagesDomain({ constant: 'ALL_STAGES', line: 3, members: ['observe', 'converge', 'read'] }),
  ]);

  const result = run(root);

  assert.notEqual(result.status, 0, 'expected a non-zero exit for a domain that hand-lists a proper subset of a closed set the code already declares');
  assert.match(result.stderr, /proper subset of ALL_STAGES/);
  assert.match(result.stderr, /left unquantified: ship/);
});

test('a production closed set iterated in production code with no quantifying invariant halts and names it', () => {
  const root = makeRoot('shape-census-', { [PRODUCTION_RELPATH]: QUANTIFIED_SOURCE }, [
    { id: 'F1', statement: 'F1 fixture statement', source: 'fixture-plan.md' },
  ]);

  const result = run(root);

  assert.notEqual(result.status, 0, 'expected a non-zero exit for an unquantified candidate domain');
  assert.match(result.stderr, /scripts\/policy\.mjs#STAGES/);
  assert.match(result.stderr, /no registry invariant quantifies over it/);
});

test('a frozen options bag merely handed to a production call is not a candidate domain', () => {
  const source = [
    QUANTIFIED_SOURCE,
    "const PROBE_OPTS = Object.freeze({ repo: 'acme/widgets', head: 'feat/probe', base: 'main' });",
    '',
    'export function probe() {',
    '  return isStage(PROBE_OPTS);',
    '}',
    '',
  ].join('\n');
  const root = makeRoot('shape-optsbag-', { [PRODUCTION_RELPATH]: source }, [stagesDomain()]);

  const result = run(root);

  assert.equal(result.status, 0, `expected the options bag to stay out of the census: ${result.stderr}`);
  assert.doesNotMatch(result.stdout, /PROBE_OPTS/);
});

test('a test-local deny-case corpus fed to a production call as input is not a candidate domain', () => {
  const probe = [
    "import { test } from 'node:test';",
    "import { isStage } from '../policy.mjs';",
    '',
    "const REJECTED_STAGES = Object.freeze(['', ' ', 'MERGE']);",
    '',
    "test('every rejected stage is refused', () => {",
    '  for (const stage of REJECTED_STAGES) {',
    '    isStage(stage);',
    '  }',
    '});',
    '',
  ].join('\n');
  const root = makeRoot('shape-denycase-', {
    [LIB_RELPATH]: QUANTIFIED_SOURCE,
    [PROBE_RELPATH]: probe,
  }, [stagesDomain({ path: LIB_RELPATH })]);

  const result = run(root);

  assert.equal(result.status, 0, `expected a deny-case corpus to stay out of the census: ${result.stderr}`);
  assert.doesNotMatch(result.stdout, /REJECTED_STAGES/);
});

test('a test-local hand-list standing as an axis inside a production enumeration halts and names it', () => {
  const probe = [
    "import { test } from 'node:test';",
    "import { STAGES, isStage } from '../policy.mjs';",
    '',
    "const LOCAL_MODES = Object.freeze(['fast', 'slow']);",
    '',
    "test('every stage and mode pair is safe', () => {",
    '  for (const stage of STAGES) {',
    '    for (const mode of LOCAL_MODES) {',
    '      isStage(`${stage}/${mode}`);',
    '    }',
    '  }',
    '});',
    '',
  ].join('\n');
  const root = makeRoot('shape-coaxis-', {
    [LIB_RELPATH]: QUANTIFIED_SOURCE,
    [PROBE_RELPATH]: probe,
  }, [stagesDomain({ path: LIB_RELPATH })]);

  const result = run(root);

  assert.notEqual(result.status, 0, 'expected a hand-listed axis nested in a production enumeration to be flagged');
  assert.match(result.stderr, /LOCAL_MODES/);
  assert.match(result.stderr, /nested inside the production enumeration STAGES/);
});

test('a test-local corpus membership-tested against a production-derived collection halts and names it', () => {
  const probe = [
    "import { test } from 'node:test';",
    "import { stageNames } from '../policy.mjs';",
    '',
    "const REQUIRED_STAGES = Object.freeze(['observe', 'converge']);",
    '',
    "test('every required stage is present', () => {",
    '  const present = stageNames();',
    '  for (const stage of REQUIRED_STAGES) {',
    '    present.includes(stage);',
    '  }',
    '});',
    '',
  ].join('\n');
  const root = makeRoot('shape-membership-', {
    [LIB_RELPATH]: QUANTIFIED_SOURCE,
    [PROBE_RELPATH]: probe,
  }, [stagesDomain({ path: LIB_RELPATH })]);

  const result = run(root);

  assert.notEqual(result.status, 0, 'expected a corpus compared against a production surface to be flagged');
  assert.match(result.stderr, /REQUIRED_STAGES/);
  assert.match(result.stderr, /membership-tested member by member/);
});

test('a tracked source outside the declared census globs halts rather than being sampled away', () => {
  const root = makeRoot('shape-glob-', {
    [PRODUCTION_RELPATH]: QUANTIFIED_SOURCE,
    'tools/extra.mjs': "export const EXTRA = Object.freeze(['a']);\n",
  }, [stagesDomain()]);

  const result = run(root);

  assert.notEqual(result.status, 0, 'expected a tracked source outside CENSUS_GLOBS to halt the census');
  assert.match(result.stderr, /tools\/extra\.mjs/);
  assert.match(result.stderr, /sample rather than a closed set/);
});

test('a waiver carrying a stated reason exempts its candidate and an unwaived one survives', () => {
  const candidates = [
    { key: 'scripts/policy.mjs#STAGES', members: ['observe'] },
    { key: 'scripts/policy.mjs#MODES', members: ['fast'] },
  ];
  const waived = unclassifiedCandidates(candidates, new Set(), { 'scripts/policy.mjs#STAGES': 'the sandbox owns this vocabulary' });

  assert.deepEqual(waived.map((candidate) => candidate.key), ['scripts/policy.mjs#MODES']);

  const empty = unclassifiedCandidates(candidates, new Set(), { 'scripts/policy.mjs#STAGES': '   ' });

  assert.deepEqual(empty.map((candidate) => candidate.key), ['scripts/policy.mjs#STAGES', 'scripts/policy.mjs#MODES']);
});
