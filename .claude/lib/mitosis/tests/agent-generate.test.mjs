import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fragmentNames, renderFragment } from '../agent-body-fragments.mjs';
import { validateAgentSpec } from '../agent-body-compose.mjs';

const DRIVER = fileURLToPath(new URL('../agent-generate.mjs', import.meta.url));
const SHIPPED_STORE = fileURLToPath(new URL('../agent-specs/', import.meta.url));
const FIXTURE_PLUGINS = fileURLToPath(new URL('./fixtures/agent-generate-home/', import.meta.url));
const FIXTURE_PROCEDURE = 'fixture-plugin:fixture-procedure';

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

function fixtureHome(t) {
  const home = scratch(t);
  const plugins = join(home, '.claude', 'plugins');
  mkdirSync(plugins, { recursive: true });
  cpSync(join(FIXTURE_PLUGINS, 'installed_plugins.json'), join(plugins, 'installed_plugins.json'));
  cpSync(join(FIXTURE_PLUGINS, 'plugin-cache'), join(plugins, 'cache'), { recursive: true });
  return home;
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

function run(args, home) {
  const env = home === undefined ? process.env : { ...process.env, HOME: home };
  const result = spawnSync(process.execPath, [DRIVER, ...args], { encoding: 'utf8', env });
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

test('shipped store: every spec it holds round trips clean and its count matches the directory', (t) => {
  const agentDir = agents(t);
  const shipped = readdirSync(SHIPPED_STORE).filter((name) => name.endsWith('.spec.json')).sort();

  const written = run(['--store', SHIPPED_STORE, '--agents', agentDir]);
  assert.equal(written.code, 0, written.output);

  const checked = run(['--check', '--store', SHIPPED_STORE, '--agents', agentDir]);
  assert.equal(checked.code, 0, checked.output);

  if (shipped.length === 0) {
    assert.match(checked.output, /zero agent specs/);
    assert.deepEqual(readdirSync(agentDir), []);
    return;
  }

  assert.doesNotMatch(checked.output, /zero agent specs/);
  for (const output of [written.output, checked.output]) {
    const reported = /(\d+) agent specs? found/.exec(output);
    assert.notEqual(reported, null, output);
    assert.equal(
      Number(reported[1]),
      shipped.length,
      `the generator reported ${reported[1]} specs over a store holding ${shipped.length}: ${shipped.join(', ')}`,
    );
  }
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

test('pointer resolution: a procedure-carrying spec resolves against the committed fixture manifest and round trips clean', (t) => {
  const specDir = store(t);
  const agentDir = agents(t);
  const home = fixtureHome(t);
  writeSpec(specDir, 'fixture-pointer-agent', { procedures: [FIXTURE_PROCEDURE] });

  const written = run(['--store', specDir, '--agents', agentDir], home);
  assert.equal(written.code, 0, written.output);

  const body = readFileSync(join(agentDir, 'fixture-pointer-agent.md'), 'utf8');
  const emitted = new RegExp(`^- \`${FIXTURE_PROCEDURE}\` — (.+)$`, 'm').exec(body);
  assert.notEqual(emitted, null, body);
  assert.equal(isAbsolute(emitted[1]), true, emitted[1]);
  assert.equal(existsSync(emitted[1]), true, `the body names ${emitted[1]}, which is not on disk`);

  const checked = run(['--check', '--store', specDir, '--agents', agentDir], home);
  assert.equal(checked.code, 0, checked.output);
  assert.match(checked.output, /1 agent spec found and all .* matching their source/);
  assert.doesNotMatch(checked.output, /UNVERIFIED/);
});

test('pointer resolution: a reference the fixture manifest does not carry halts rather than being deferred', (t) => {
  const specDir = store(t);
  const agentDir = agents(t);
  writeSpec(specDir, 'absent-plugin-agent', { procedures: ['no-such-plugin:no-such-skill'] });

  const result = run(['--check', '--store', specDir, '--agents', agentDir], fixtureHome(t));
  assert.notEqual(result.code, 0);
  assert.match(result.output, /no plugin named no-such-plugin is installed/);
  assert.doesNotMatch(result.output, /UNVERIFIED/);
});

test('pointer resolution: a bare skill name halts rather than being deferred', (t) => {
  const specDir = store(t);
  const agentDir = agents(t);
  writeSpec(specDir, 'bare-reference-agent', { procedures: ['fixture-procedure'] });

  const result = run(['--check', '--store', specDir, '--agents', agentDir], fixtureHome(t));
  assert.notEqual(result.code, 0);
  assert.match(result.output, /not fully qualified as plugin:skill/);
  assert.doesNotMatch(result.output, /UNVERIFIED/);
});

test('missing manifest: a procedure-carrying spec is named as unverified while every other spec is still compared', (t) => {
  const specDir = store(t);
  const agentDir = agents(t);
  const home = scratch(t);
  writeSpec(specDir, 'plain-agent');
  writeSpec(specDir, 'pointer-agent', { procedures: [FIXTURE_PROCEDURE] });

  const written = run(['--store', specDir, '--agents', agentDir], home);
  assert.equal(written.code, 0, written.output);
  assert.deepEqual(readdirSync(agentDir), ['plain-agent.md']);

  const checked = run(['--check', '--store', specDir, '--agents', agentDir], home);
  assert.equal(checked.code, 0, checked.output);
  assert.match(checked.output, /UNVERIFIED/);
  assert.match(checked.output, /pointer-agent/);
  assert.match(checked.output, new RegExp(FIXTURE_PROCEDURE));
  assert.match(checked.output, new RegExp(join(home, '.claude', 'plugins', 'installed_plugins.json')));
  assert.match(checked.output, /2 agent specs found/);
  assert.doesNotMatch(checked.output, /zero agent specs/);
});

test('missing manifest: drift in a spec that needs no pointer is still red', (t) => {
  const specDir = store(t);
  const agentDir = agents(t);
  const home = scratch(t);
  writeSpec(specDir, 'plain-agent');
  writeSpec(specDir, 'pointer-agent', { procedures: [FIXTURE_PROCEDURE] });
  assert.equal(run(['--store', specDir, '--agents', agentDir], home).code, 0);

  const body = join(agentDir, 'plain-agent.md');
  writeFileSync(body, readFileSync(body, 'utf8').replace('model: sonnet', 'model: opus'));

  const result = run(['--check', '--store', specDir, '--agents', agentDir], home);
  assert.notEqual(result.code, 0);
  assert.match(result.output, /plain-agent\.md/);
  assert.match(result.output, /model: opus/);
});
