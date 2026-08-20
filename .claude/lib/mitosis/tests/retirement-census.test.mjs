import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  GATE_CLEAN_EXIT,
  GATE_READ_EXIT,
  GATE_UNRESOLVABLE_EXIT,
  GATE_USAGE_EXIT,
  GATE_VIOLATION_EXIT,
  MITOSIS_GATE_VERBS,
  parseMitosisGateArgv,
  runMitosisGate,
  runRetirementCensusGate,
} from '../mitosis-gate-core.mjs';
import { censusRetirement, realRetirementIo, retirementScope, scanSourceForNames } from '../retirement-census.mjs';
import { readMarkdownReferences } from '../name-integrity-census.mjs';

const VERB = 'retirement-census';
const RETAINED = Object.freeze(['keeper-one', 'keeper-two']);
const RETIRING = Object.freeze(['old-alpha', 'old-beta', 'old-gamma']);
const readSource = (path) => readFileSync(path, 'utf8');

function retiredRosterSource(retiring) {
  return JSON.stringify({ retired: retiring });
}

const FIXTURE_ROSTER = '---\nname: old-alpha\n---\n';

const RED_TREE = Object.freeze({
  'rules/common/routing.md': [
    'routing rules',
    'dispatch the `old-alpha` agent for lookup',
    'use **old-beta** for rote edits',
    'evaluative agents (keeper-one, old-gamma) consume lookup',
    'a line naming keeper-two only',
  ].join('\n'),
  'rules/common/clean.md': 'this line names keeper-one and nothing retiring\n',
  'rules/tests/excluded.md': 'dispatch the `old-alpha` agent\n',
  'skills/reporting/SKILL.md': [
    'description: orchestrates old-beta content',
    '',
    'It dispatches `keeper-one` and then old-beta.',
  ].join('\n'),
  'skills/reporting/prompt-snapshots/excluded.md': 'old-gamma is named here\n',
  'skills/reporting/asset.html': '<p>old-alpha</p>\n',
  'lib/observer/fixtures/roster/old-alpha.md': FIXTURE_ROSTER,
  'lib/mitosis/engine.mjs': "const DECOMPOSER_AGENT = 'old-alpha';\nexport const KEEP = 'keeper-two';\n",
});

const GREEN_TREE = Object.freeze({
  'rules/common/routing.md': [
    'routing rules',
    'dispatch the `keeper-one` agent for lookup',
    'use **keeper-two** for rote edits',
    'evaluative agents (keeper-one, keeper-two) consume lookup',
    'a line naming keeper-two only',
  ].join('\n'),
  'rules/common/clean.md': 'this line names keeper-one and nothing retiring\n',
  'rules/tests/excluded.md': 'dispatch the `old-alpha` agent\n',
  'skills/reporting/SKILL.md': [
    'description: orchestrates keeper-two content',
    '',
    'It dispatches `keeper-one` and then keeper-two.',
  ].join('\n'),
  'skills/reporting/prompt-snapshots/excluded.md': 'old-gamma is named here\n',
  'skills/reporting/asset.html': '<p>old-alpha</p>\n',
  'lib/observer/fixtures/roster/old-alpha.md': FIXTURE_ROSTER,
  'lib/mitosis/engine.mjs': "const DECOMPOSER_AGENT = 'keeper-one';\nexport const KEEP = 'keeper-two';\n",
});

const roots = [];

function writeInto(root, relative, content) {
  const path = join(root, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
  return path;
}

function buildTree(files, options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'retirement-census-'));
  roots.push(root);
  const retained = options.retained ?? RETAINED;
  const retiring = options.retiring ?? RETIRING;
  const onDisk = options.onDisk ?? [...retained, ...retiring];
  writeInto(root, 'retired-roster.json', retiredRosterSource(retiring));
  for (const name of onDisk) writeInto(root, join('agents', `${name}.md`), `---\nname: ${name}\n---\n`);
  for (const name of retained) writeInto(root, join('agent-specs', `${name}.spec.json`), '');
  for (const [relative, content] of Object.entries(files)) writeInto(root, relative, content);
  for (const tree of options.emptyTrees ?? []) mkdirSync(join(root, tree), { recursive: true });
  return Object.freeze({
    root,
    scope: Object.freeze({
      dirs: Object.freeze({
        agents: join(root, 'agents'),
        rules: join(root, 'rules'),
        skills: join(root, 'skills'),
        lib: join(root, 'lib'),
      }),
      retiredRosterPath: join(root, 'retired-roster.json'),
      agentSpecDir: join(root, 'agent-specs'),
    }),
  });
}

function capture() {
  const log = [];
  const err = [];
  return { out: Object.freeze({ log: (text) => log.push(text), err: (text) => err.push(text) }), log, err };
}

function runOver(scope, io) {
  const sink = capture();
  const exit = runRetirementCensusGate(null, sink.out, readSource, () => Object.freeze({ ok: true, scope }), io);
  return Object.freeze({ exit, stdout: sink.log.join(''), stderr: sink.err.join('') });
}

function siteKeys(result) {
  return result.sites.map((site) => `${site.path}:${site.line} ${site.name}`);
}

function substitute(path, from, to) {
  const before = readFileSync(path, 'utf8');
  const after = before.split(from).join(to);
  assert.notEqual(after, before, `the substitution of ${JSON.stringify(from)} in ${path} changed nothing, so the mutation proves nothing`);
  writeFileSync(path, after, 'utf8');
  return Object.freeze({ before, after });
}

after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('the verb is registered and takes no --target', () => {
  assert.ok(MITOSIS_GATE_VERBS.includes(VERB));
  const parsed = parseMitosisGateArgv([VERB]);
  assert.deepEqual({ ok: parsed.ok, verb: parsed.verb, target: parsed.target }, { ok: true, verb: VERB, target: null });
  const sink = capture();
  assert.equal(runMitosisGate([VERB, '--target', '/somewhere'], sink.out, readSource), GATE_USAGE_EXIT);
  assert.match(sink.err.join(''), /takes no --target/);
});

test('a tree still naming a retiring agent is red and names every occurrence with its file and line', () => {
  const fixture = buildTree(RED_TREE);
  const result = censusRetirement(fixture.scope, realRetirementIo);
  assert.equal(result.kind, undefined, result.error);
  assert.equal(result.ok, false);
  assert.deepEqual(siteKeys(result).sort(), [
    `${join(fixture.root, 'lib/mitosis/engine.mjs')}:1 old-alpha`,
    `${join(fixture.root, 'rules/common/routing.md')}:2 old-alpha`,
    `${join(fixture.root, 'rules/common/routing.md')}:3 old-beta`,
    `${join(fixture.root, 'rules/common/routing.md')}:4 old-gamma`,
    `${join(fixture.root, 'skills/reporting/SKILL.md')}:1 old-beta`,
    `${join(fixture.root, 'skills/reporting/SKILL.md')}:3 old-beta`,
  ].sort());
  for (const site of result.sites) assert.ok(site.text.includes(site.name), 'a reported site must carry the line text that carries the name');
  const run = runOver(fixture.scope);
  assert.equal(run.exit, GATE_VIOLATION_EXIT);
  assert.match(run.stderr, /routing\.md:2 still names retiring agent "old-alpha"/);
  assert.match(run.stderr, /engine\.mjs:1 still names retiring agent "old-alpha"/);
});

test('a directory named tests, prompt-snapshots or fixtures is out of scope at any depth', () => {
  const fixture = buildTree(RED_TREE);
  const result = censusRetirement(fixture.scope, realRetirementIo);
  assert.deepEqual([...result.excludedDirectoryNames], ['fixtures', 'prompt-snapshots', 'tests']);
  assert.equal(result.sites.some((site) => site.path.includes('excluded.md')), false);
  assert.equal(result.sites.some((site) => site.path.includes('/fixtures/')), false);
  assert.deepEqual(result.excludedDirectories.map((path) => path.slice(fixture.root.length + 1)), [
    'rules/tests',
    'skills/reporting/prompt-snapshots',
    'lib/observer/fixtures',
  ]);
  assert.equal(result.unreadCount, 1);
});

test('the same synthetic roster file is skipped inside a fixtures directory and counted outside one', () => {
  const inside = buildTree(GREEN_TREE);
  const outside = buildTree({ ...GREEN_TREE, 'lib/observer/roster/old-alpha.md': FIXTURE_ROSTER });
  const skipped = censusRetirement(inside.scope, realRetirementIo);
  const counted = censusRetirement(outside.scope, realRetirementIo);
  assert.equal(skipped.kind, undefined, skipped.error);
  assert.equal(counted.kind, undefined, counted.error);
  assert.equal(readFileSync(join(inside.root, 'lib/observer/fixtures/roster/old-alpha.md'), 'utf8'), FIXTURE_ROSTER);
  assert.equal(readFileSync(join(outside.root, 'lib/observer/roster/old-alpha.md'), 'utf8'), FIXTURE_ROSTER);
  assert.equal(skipped.ok, true);
  assert.deepEqual(skipped.sites, []);
  assert.equal(counted.ok, false);
  assert.deepEqual(siteKeys(counted), [`${join(outside.root, 'lib/observer/roster/old-alpha.md')}:2 old-alpha`]);
  assert.equal(counted.fileCount, skipped.fileCount + 1);
  assert.equal(runOver(inside.scope).exit, GATE_CLEAN_EXIT);
  assert.equal(runOver(outside.scope).exit, GATE_VIOLATION_EXIT);
});

test('a fully repointed tree is clean and still reports every retiring name at zero', () => {
  const fixture = buildTree(GREEN_TREE);
  const result = censusRetirement(fixture.scope, realRetirementIo);
  assert.equal(result.kind, undefined, result.error);
  assert.equal(result.ok, true);
  assert.deepEqual(result.sites, []);
  assert.deepEqual(result.perName, { 'old-alpha': 0, 'old-beta': 0, 'old-gamma': 0 });
  const run = runOver(fixture.scope);
  assert.equal(run.exit, GATE_CLEAN_EXIT);
  const report = JSON.parse(run.stdout);
  assert.deepEqual(report.perName, { 'old-alpha': 0, 'old-beta': 0, 'old-gamma': 0 });
  assert.equal(report.ok, true);
});

test('the live configuration is retired end to end and discloses the lost corroboration', () => {
  const scope = retirementScope();
  assert.equal(scope.ok, true, scope.error);
  const result = censusRetirement(scope.scope, realRetirementIo);
  assert.equal(result.kind, undefined, result.error);
  assert.equal(result.derivation.shape, 'retired', 'the nine retiring definitions are still on disk, so the live roster has not reached the sanctioned post-deletion shape');
  assert.deepEqual(result.derivation.derivationA, []);
  assert.deepEqual(result.derivation.derivationB, [
    'codebase-analyst',
    'data-engineer',
    'debugger',
    'devops-engineer',
    'mechanical-editor',
    'performance-engineer',
    'report-writer',
    'solution-architect',
    'verification-strategist',
  ]);
  assert.ok(
    result.notAttested.some((entry) => /derivation A still corroborates derivation B/.test(entry)),
    'the retired shape did not disclose that corroboration between derivation A and derivation B is now impossible by construction',
  );
  assert.ok(result.fileCount > 0, 'the live scan opened no file, so its verdict measured nothing');
  assert.equal(result.ok, result.sites.length === 0);
  assert.equal(result.sites.length, 0, 'the live configuration still names a retiring agent after U6.2 repointed every reference and U7.1 deleted the definitions');
  for (const name of result.derivation.derivationB) {
    assert.equal(typeof result.perName[name], 'number', `${name} is missing from the per-name report`);
  }
  const sink = capture();
  assert.equal(runMitosisGate([VERB], sink.out, readSource), GATE_CLEAN_EXIT);
  assert.equal(sink.err.join(''), '');
  const report = JSON.parse(sink.log.join(''));
  assert.equal(report.ok, true);
  assert.deepEqual(report.perName, result.perName);
});

test('restoring one repointed reference in a clean tree turns it red at that exact file and line', () => {
  const fixture = buildTree(GREEN_TREE);
  assert.equal(censusRetirement(fixture.scope, realRetirementIo).ok, true);
  const path = join(fixture.root, 'skills/reporting/SKILL.md');
  substitute(path, 'It dispatches `keeper-one` and then keeper-two.', 'It dispatches `keeper-one` and then old-beta.');
  const result = censusRetirement(fixture.scope, realRetirementIo);
  assert.equal(result.ok, false);
  assert.deepEqual(siteKeys(result), [`${path}:3 old-beta`]);
  assert.equal(runOver(fixture.scope).exit, GATE_VIOLATION_EXIT);
});

test('dropping one name from derivation A input halts naming the symmetric difference rather than passing', () => {
  const fixture = buildTree(GREEN_TREE);
  assert.equal(censusRetirement(fixture.scope, realRetirementIo).ok, true);
  rmSync(join(fixture.scope.agentSpecDir, 'keeper-two.spec.json'));
  const result = censusRetirement(fixture.scope, realRetirementIo);
  assert.equal(result.ok, false);
  assert.equal(result.kind, 'halt');
  assert.match(result.error, /disagree on keeper-two/);
  assert.match(result.error, /never proceeds on one alone/);
  assert.equal(runOver(fixture.scope).exit, GATE_UNRESOLVABLE_EXIT);
});

test('deleting one retiring definition while the rest remain halts rather than shrinking the set silently', () => {
  const fixture = buildTree(GREEN_TREE, { onDisk: ['keeper-one', 'keeper-two', 'old-alpha', 'old-beta'] });
  const result = censusRetirement(fixture.scope, realRetirementIo);
  assert.equal(result.kind, 'halt');
  assert.match(result.error, /disagree on old-gamma/);
  assert.equal(runOver(fixture.scope).exit, GATE_UNRESOLVABLE_EXIT);
});

test('a roster whose retiring definitions are all gone still censuses the retiring set and discloses the lost corroboration', () => {
  const fixture = buildTree(GREEN_TREE, { onDisk: [...RETAINED] });
  const result = censusRetirement(fixture.scope, realRetirementIo);
  assert.equal(result.kind, undefined, result.error);
  assert.equal(result.ok, true);
  assert.equal(result.derivation.shape, 'retired');
  assert.deepEqual(result.names, [...RETIRING]);
  assert.deepEqual(result.perName, { 'old-alpha': 0, 'old-beta': 0, 'old-gamma': 0 });
  assert.ok(result.notAttested.some((entry) => /derivation A still corroborates derivation B/.test(entry)));
  assert.equal(runOver(fixture.scope).exit, GATE_CLEAN_EXIT);
});

test('a retired roster that still names a retiring agent is red, so the post-deletion shape is not a free pass', () => {
  const fixture = buildTree(RED_TREE, { onDisk: [...RETAINED] });
  const result = censusRetirement(fixture.scope, realRetirementIo);
  assert.equal(result.derivation.shape, 'retired');
  assert.equal(result.ok, false);
  assert.equal(runOver(fixture.scope).exit, GATE_VIOLATION_EXIT);
});

test('a scan tree holding no scannable file halts rather than reporting an absence it never measured', () => {
  const scannable = Object.fromEntries(Object.entries(GREEN_TREE).filter(([relative]) => !relative.startsWith('rules/')));
  const fixture = buildTree(scannable, { emptyTrees: ['rules'] });
  const result = censusRetirement(fixture.scope, realRetirementIo);
  assert.equal(result.ok, false);
  assert.equal(result.kind, 'halt');
  assert.match(result.error, /yielded no \.md or \.mjs file at all/);
  assert.equal(runOver(fixture.scope).exit, GATE_UNRESOLVABLE_EXIT);
});

test('the sibling code-span grammar sees strictly fewer sites than the raw literal scan over the same tree', () => {
  const fixture = buildTree(RED_TREE);
  const markdown = ['rules/common/routing.md', 'skills/reporting/SKILL.md'];
  const retiring = new Set(RETIRING);
  let raw = 0;
  let codeSpan = 0;
  for (const relative of markdown) {
    const path = join(fixture.root, relative);
    const source = readFileSync(path, 'utf8');
    raw += scanSourceForNames(path, source, [...RETIRING]).length;
    const read = readMarkdownReferences(path, source);
    assert.equal(read.ok, true, read.error);
    codeSpan += read.references.filter((reference) => retiring.has(reference.token)).length;
  }
  assert.ok(raw > 0, 'the raw scan found nothing, so the comparison measures nothing');
  assert.ok(codeSpan < raw, `the code-span grammar saw ${codeSpan} of ${raw} sites, so this census inherited the blindness it was written to remove`);
});

test('an agent on disk in neither declared set halts naming it', () => {
  const fixture = buildTree(GREEN_TREE, { onDisk: [...RETAINED, ...RETIRING, 'ghost-agent'] });
  const result = censusRetirement(fixture.scope, realRetirementIo);
  assert.equal(result.ok, false);
  assert.equal(result.kind, 'halt');
  assert.match(result.error, /ghost-agent on disk belongs to neither/);
  assert.equal(runOver(fixture.scope).exit, GATE_UNRESOLVABLE_EXIT);
});

test('an agent declared both retained and retiring halts naming it', () => {
  const fixture = buildTree(GREEN_TREE, { retiring: [...RETIRING, 'keeper-one'], onDisk: [...RETAINED, ...RETIRING] });
  const result = censusRetirement(fixture.scope, realRetirementIo);
  assert.equal(result.kind, 'halt');
  assert.match(result.error, /keeper-one is declared both retained and retiring/);
});

test('a retired roster that is not parseable JSON halts', () => {
  const fixture = buildTree(GREEN_TREE);
  writeFileSync(fixture.scope.retiredRosterPath, 'not json at all\n');
  const result = censusRetirement(fixture.scope, realRetirementIo);
  assert.equal(result.kind, 'halt');
  assert.match(result.error, /could not be parsed as JSON/);
  assert.equal(runOver(fixture.scope).exit, GATE_UNRESOLVABLE_EXIT);
});

test('an empty "retired" array halts rather than reporting a retirement it never measured', () => {
  const fixture = buildTree(GREEN_TREE);
  writeFileSync(fixture.scope.retiredRosterPath, JSON.stringify({ retired: [] }));
  const result = censusRetirement(fixture.scope, realRetirementIo);
  assert.equal(result.kind, 'halt');
  assert.match(result.error, /declares an empty "retired" array/);
  assert.equal(runOver(fixture.scope).exit, GATE_UNRESOLVABLE_EXIT);
});

test('a duplicate name inside the "retired" array halts', () => {
  const fixture = buildTree(GREEN_TREE);
  writeFileSync(fixture.scope.retiredRosterPath, JSON.stringify({ retired: ['old-alpha', 'old-alpha', 'old-beta', 'old-gamma'] }));
  const result = censusRetirement(fixture.scope, realRetirementIo);
  assert.equal(result.kind, 'halt');
  assert.match(result.error, /names "old-alpha" twice/);
  assert.equal(runOver(fixture.scope).exit, GATE_UNRESOLVABLE_EXIT);
});

test('a "retired" entry failing the agent-name pattern halts', () => {
  const fixture = buildTree(GREEN_TREE);
  writeFileSync(fixture.scope.retiredRosterPath, JSON.stringify({ retired: ['Old_Alpha', 'old-beta', 'old-gamma'] }));
  const result = censusRetirement(fixture.scope, realRetirementIo);
  assert.equal(result.kind, 'halt');
  assert.match(result.error, /names retired agent "Old_Alpha"/);
  assert.equal(runOver(fixture.scope).exit, GATE_UNRESOLVABLE_EXIT);
});

test('a file that cannot be read is a read failure, never a clean verdict', () => {
  const fixture = buildTree(GREEN_TREE);
  const unreadable = join(fixture.root, 'rules/common/clean.md');
  const io = {
    ...realRetirementIo,
    readSource: (path) => {
      if (path === unreadable) throw new Error('EACCES permission denied');
      return readFileSync(path, 'utf8');
    },
  };
  const result = censusRetirement(fixture.scope, io);
  assert.equal(result.kind, 'read');
  assert.match(result.error, /clean\.md could not be read/);
  assert.equal(runOver(fixture.scope, io).exit, GATE_READ_EXIT);
});
