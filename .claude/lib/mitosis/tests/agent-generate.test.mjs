import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fragmentNames, renderFragment } from '../agent-body-fragments.mjs';
import { validateAgentSpec } from '../agent-body-compose.mjs';

const DRIVER = fileURLToPath(new URL('../agent-generate.mjs', import.meta.url));
const SHIPPED_STORE = fileURLToPath(new URL('../agent-specs/', import.meta.url));

const REQUIRED_FRAGMENTS = Object.freeze([
  'answer-format',
  'honesty-ladder',
  'work-order-contract',
  'receipt-contract',
  'no-comments',
  'never-touch-a-live-system',
]);

function scratch(t) {
  const dir = mkdtempSync(join(tmpdir(), 'agent-generate-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function store(t) {
  const dir = join(scratch(t), 'agent-specs');
  mkdirSync(dir, { recursive: true });
  return dir;
}

function agents(t) {
  const dir = join(scratch(t), 'agents');
  mkdirSync(dir, { recursive: true });
  return dir;
}

function specSource(name, overrides = {}) {
  const spec = {
    name,
    description: `Synthetic store member ${name} used to prove the generator reads the store by scanning it.`,
    tools: ['Read', 'StructuredOutput'],
    model: 'sonnet',
    fragments: ['answer-format', 'honesty-ladder'],
    summary: `You are ${name}, a synthetic subject that is never dispatched.`,
    sections: [{ heading: 'Lane', body: 'You exist to prove the generator writes and compares a body.' }],
    ...overrides,
  };
  return `${JSON.stringify(spec, null, 2)}\n`;
}

function writeSpec(dir, name, overrides) {
  const path = join(dir, `${name}.spec.json`);
  writeFileSync(path, specSource(name, overrides));
  return path;
}

function run(args) {
  const result = spawnSync(process.execPath, [DRIVER, ...args], { encoding: 'utf8' });
  if (result.error) throw result.error;
  return Object.freeze({ code: result.status, output: `${result.stdout}${result.stderr}` });
}

test('round trip: a store spec composes, writes a body, and --check reports it clean', (t) => {
  const specDir = store(t);
  const agentDir = agents(t);
  writeSpec(specDir, 'round-trip-agent');

  const written = run(['--store', specDir, '--agents', agentDir]);
  assert.equal(written.code, 0, written.output);

  const body = join(agentDir, 'round-trip-agent.md');
  assert.deepEqual(readdirSync(agentDir), ['round-trip-agent.md']);
  assert.match(readFileSync(body, 'utf8'), /^---\nname: round-trip-agent\n/);

  const checked = run(['--check', '--store', specDir, '--agents', agentDir]);
  assert.equal(checked.code, 0, checked.output);
  assert.match(checked.output, /1 agent spec found and all .* matching their source/);
});

test('drift: a hand edit makes --check exit non-zero naming the file and the first differing line', (t) => {
  const specDir = store(t);
  const agentDir = agents(t);
  writeSpec(specDir, 'drift-agent');
  assert.equal(run(['--store', specDir, '--agents', agentDir]).code, 0);

  const body = join(agentDir, 'drift-agent.md');
  const original = readFileSync(body, 'utf8');
  const edited = original.replace('model: sonnet', 'model: opus');
  assert.notEqual(edited, original);
  writeFileSync(body, edited);

  const expectedLine = original.split('\n').findIndex((line) => line === 'model: sonnet') + 1;
  assert.ok(expectedLine > 0);

  const result = run(['--check', '--store', specDir, '--agents', agentDir]);
  assert.notEqual(result.code, 0);
  assert.match(result.output, /drift-agent\.md/);
  assert.match(result.output, new RegExp(`line ${expectedLine}\\b`));
  assert.match(result.output, /model: opus/);
  assert.match(result.output, /model: sonnet/);
});

test('drift: --check writes nothing, so the hand edit survives the failing run', (t) => {
  const specDir = store(t);
  const agentDir = agents(t);
  writeSpec(specDir, 'read-only-agent');
  assert.equal(run(['--store', specDir, '--agents', agentDir]).code, 0);

  const body = join(agentDir, 'read-only-agent.md');
  writeFileSync(body, 'hand written\n');
  assert.notEqual(run(['--check', '--store', specDir, '--agents', agentDir]).code, 0);
  assert.equal(readFileSync(body, 'utf8'), 'hand written\n');
});

test('drift: a spec whose body is absent is a divergence naming the missing file', (t) => {
  const specDir = store(t);
  const agentDir = agents(t);
  writeSpec(specDir, 'absent-body-agent');

  const result = run(['--check', '--store', specDir, '--agents', agentDir]);
  assert.notEqual(result.code, 0);
  assert.match(result.output, /absent-body-agent\.md/);
  assert.match(result.output, /absent/);
});

test('empty store: --check exits 0 and says zero specs rather than reporting a match', (t) => {
  const specDir = store(t);
  const agentDir = agents(t);

  const result = run(['--check', '--store', specDir, '--agents', agentDir]);
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /zero agent specs/);
  assert.doesNotMatch(result.output, /matching their source/);
});

test('empty store: the shipped store is empty today and --check is clean over it', (t) => {
  const agentDir = agents(t);
  const result = run(['--check', '--store', SHIPPED_STORE, '--agents', agentDir]);
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /zero agent specs/);
});

test('unreadable store: an absent store directory exits non-zero rather than green', (t) => {
  const agentDir = agents(t);
  const missing = join(scratch(t), 'no-such-store');

  const result = run(['--check', '--store', missing, '--agents', agentDir]);
  assert.notEqual(result.code, 0);
  assert.match(result.output, /no-such-store/);
  assert.doesNotMatch(result.output, /zero agent specs/);
});

test('unreadable store: a store directory that cannot be listed exits non-zero rather than green', (t) => {
  const agentDir = agents(t);
  const specDir = store(t);
  writeSpec(specDir, 'hidden-agent');
  chmodSync(specDir, 0o000);
  const result = run(['--check', '--store', specDir, '--agents', agentDir]);
  chmodSync(specDir, 0o700);

  assert.notEqual(result.code, 0);
  assert.match(result.output, /could not be listed/);
  assert.doesNotMatch(result.output, /zero agent specs/);
});

test('invalid spec: the run halts naming the offending file instead of skipping it', (t) => {
  const specDir = store(t);
  const agentDir = agents(t);
  writeSpec(specDir, 'aaa-valid-agent');
  writeSpec(specDir, 'zzz-broken-agent', { sections: [] });

  const result = run(['--check', '--store', specDir, '--agents', agentDir]);
  assert.notEqual(result.code, 0);
  assert.match(result.output, /zzz-broken-agent\.spec\.json/);
  assert.match(result.output, /sections must be a non-empty array/);
});

test('invalid spec: a file that does not parse as JSON halts naming the file and the parse failure', (t) => {
  const specDir = store(t);
  const agentDir = agents(t);
  writeFileSync(join(specDir, 'unparseable-agent.spec.json'), '{ "name": "unparseable-agent",\n');

  const result = run(['--check', '--store', specDir, '--agents', agentDir]);
  assert.notEqual(result.code, 0);
  assert.match(result.output, /unparseable-agent\.spec\.json/);
  assert.match(result.output, /does not parse as JSON/);
  assert.doesNotMatch(result.output, /zero agent specs/);
});

test('unreadable spec: a spec file that cannot be read halts rather than skipping it', (t) => {
  const specDir = store(t);
  const agentDir = agents(t);
  const path = writeSpec(specDir, 'unreadable-agent');
  chmodSync(path, 0o000);
  const result = run(['--check', '--store', specDir, '--agents', agentDir]);
  chmodSync(path, 0o600);

  assert.notEqual(result.code, 0);
  assert.match(result.output, /unreadable-agent\.spec\.json/);
  assert.match(result.output, /could not be read/);
  assert.doesNotMatch(result.output, /zero agent specs/);
});

test('invalid spec: a filename that disagrees with the spec name halts rather than guessing', (t) => {
  const specDir = store(t);
  const agentDir = agents(t);
  writeFileSync(join(specDir, 'filename-agent.spec.json'), specSource('other-name-agent'));

  const result = run(['--check', '--store', specDir, '--agents', agentDir]);
  assert.notEqual(result.code, 0);
  assert.match(result.output, /filename-agent\.spec\.json/);
  assert.match(result.output, /other-name-agent/);
});

test('invalid spec: the write run halts before writing any body', (t) => {
  const specDir = store(t);
  const agentDir = agents(t);
  writeSpec(specDir, 'aaa-valid-agent');
  writeSpec(specDir, 'zzz-broken-agent', { tools: [] });

  const result = run(['--store', specDir, '--agents', agentDir]);
  assert.notEqual(result.code, 0);
  assert.match(result.output, /zzz-broken-agent\.spec\.json/);
  assert.match(result.output, /at least one tool/);
  assert.deepEqual(readdirSync(agentDir), []);
});

test('enumeration inertness: a second spec file is picked up with no code change', (t) => {
  const specDir = store(t);
  const agentDir = agents(t);
  writeSpec(specDir, 'first-agent');

  const one = run(['--store', specDir, '--agents', agentDir]);
  assert.equal(one.code, 0, one.output);
  assert.deepEqual(readdirSync(agentDir).sort(), ['first-agent.md']);
  assert.match(one.output, /1 agent spec/);

  writeSpec(specDir, 'second-agent');

  const two = run(['--store', specDir, '--agents', agentDir]);
  assert.equal(two.code, 0, two.output);
  assert.deepEqual(readdirSync(agentDir).sort(), ['first-agent.md', 'second-agent.md']);
  assert.match(two.output, /2 agent specs/);

  const checked = run(['--check', '--store', specDir, '--agents', agentDir]);
  assert.equal(checked.code, 0, checked.output);
  assert.match(checked.output, /2 agent specs/);
});

test('enumeration inertness: a file that is not a spec file is not enumerated', (t) => {
  const specDir = store(t);
  const agentDir = agents(t);
  writeSpec(specDir, 'only-agent');
  writeFileSync(join(specDir, '.gitkeep'), '');
  writeFileSync(join(specDir, 'README.md'), 'not a spec\n');
  writeFileSync(join(specDir, 'helper.mjs'), 'export const helper = 1;\n');
  writeFileSync(join(specDir, 'notes.json'), '{}\n');

  const result = run(['--check', '--store', specDir, '--agents', agentDir]);
  assert.match(result.output, /1 agent spec/);
});

test('every declared fragment renders non-empty and is reachable by key', () => {
  const names = fragmentNames();
  for (const name of REQUIRED_FRAGMENTS) {
    assert.ok(names.includes(name), `fragment ${name} is not declared`);
  }
  for (const name of names) {
    const rendered = renderFragment(name);
    assert.match(rendered, /^## .+\n\n/);
    assert.ok(rendered.trim().split('\n').length >= 2, `fragment ${name} renders a heading with no content`);
  }
});

test('a spec naming an unknown fragment key is rejected by validateAgentSpec', () => {
  const spec = JSON.parse(specSource('key-agent'));
  assert.doesNotThrow(() => validateAgentSpec(spec));
  assert.throws(
    () => validateAgentSpec({ ...spec, fragments: ['answer-format', 'does-not-exist'] }),
    /does-not-exist/,
  );
});

test('an unknown flag is refused rather than silently ignored', (t) => {
  const specDir = store(t);
  const result = run(['--check', '--store', specDir, '--unknown-flag']);
  assert.notEqual(result.code, 0);
  assert.match(result.output, /--unknown-flag/);
});
