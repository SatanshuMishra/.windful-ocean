import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, globSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { composeAgentBody, validateAgentSpec } from '../agent-body-compose.mjs';
import { checkBodyDrift, enumerateGeneratedBodies, firstDifference } from '../agent-body-drift.mjs';
import { parseSkillReference, resolveSkillPointer } from '../agent-skill-pointers.mjs';
import { renderFragment } from '../agent-body-fragments.mjs';
import { FIXTURE_BODY_PATH, FIXTURE_DIR, FIXTURE_OPTIONS, FIXTURE_SPEC } from './fixtures/agent-bodies/fixture-agent.spec.mjs';

function scratch(t) {
  const dir = mkdtempSync(join(tmpdir(), 'agent-body-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function installPluginTree(home, { marketplace, plugin, version, skill, atRoot = false }) {
  const installPath = join(home, '.claude', 'plugins', 'cache', marketplace, plugin, version);
  const skillPath = atRoot ? join(installPath, 'SKILL.md') : join(installPath, 'skills', skill, 'SKILL.md');
  mkdirSync(join(skillPath, '..'), { recursive: true });
  writeFileSync(skillPath, `# ${plugin}:${skill} ${version}\n`);
  return { installPath, skillPath };
}

function writeManifest(home, plugins) {
  const manifestPath = join(home, '.claude', 'plugins', 'installed_plugins.json');
  mkdirSync(join(manifestPath, '..'), { recursive: true });
  writeFileSync(manifestPath, JSON.stringify({ version: 2, plugins }, null, 2));
  return manifestPath;
}

function pointerSpec(name) {
  return Object.freeze({
    name,
    description: 'A synthetic agent used to prove the pointer travels into the generated body.',
    tools: Object.freeze(['Read', 'StructuredOutput']),
    model: 'sonnet',
    procedures: Object.freeze(['superpowers:writing-plans']),
    fragments: Object.freeze(['delegation-boundary']),
    summary: 'Synthetic subject.',
    sections: Object.freeze([Object.freeze({ heading: 'Lane', body: 'Synthetic.' })]),
  });
}

test('check 1: the generator composes the committed fixture byte for byte', () => {
  const composed = composeAgentBody(FIXTURE_SPEC, FIXTURE_OPTIONS);
  const committed = readFileSync(FIXTURE_BODY_PATH, 'utf8');
  assert.equal(firstDifference(composed, committed), null);
  assert.equal(composed, committed);
});

test('check 1: composing twice yields identical bytes', () => {
  assert.equal(composeAgentBody(FIXTURE_SPEC, FIXTURE_OPTIONS), composeAgentBody(FIXTURE_SPEC, FIXTURE_OPTIONS));
});

test('check 1: the drift check is green on the committed fixture', () => {
  const result = checkBodyDrift({ root: FIXTURE_DIR, specs: [FIXTURE_SPEC], ...FIXTURE_OPTIONS });
  assert.equal(result.ok, true, JSON.stringify(result.findings));
  assert.equal(result.checked, 1);
});

test('check 1: the drift check is red on a hand edit and green again once regenerated', (t) => {
  const root = scratch(t);
  cpSync(FIXTURE_DIR, root, { recursive: true });
  const body = join(root, `${FIXTURE_SPEC.name}.md`);

  const edited = readFileSync(body, 'utf8').replace('- Spawn other subagents.', '- Spawn other subagents whenever convenient.');
  assert.notEqual(edited, readFileSync(body, 'utf8'));
  writeFileSync(body, edited);

  const red = checkBodyDrift({ root, specs: [FIXTURE_SPEC], ...FIXTURE_OPTIONS });
  assert.equal(red.ok, false);
  assert.equal(red.findings.length, 1);
  assert.equal(red.findings[0].kind, 'drift');
  assert.equal(red.findings[0].path, body);
  assert.match(red.findings[0].detail, /diverges from its source at line \d+ column \d+/);

  writeFileSync(body, composeAgentBody(FIXTURE_SPEC, FIXTURE_OPTIONS));
  const green = checkBodyDrift({ root, specs: [FIXTURE_SPEC], ...FIXTURE_OPTIONS });
  assert.equal(green.ok, true, JSON.stringify(green.findings));
});

test('check 2: a generated pointer resolves to a file that exists on disk', (t) => {
  const home = scratch(t);
  const nested = installPluginTree(home, { marketplace: 'claude-plugins-official', plugin: 'superpowers', version: '6.3.0', skill: 'writing-plans' });
  const root = installPluginTree(home, { marketplace: 'visual-explainer-marketplace', plugin: 'visual-explainer', version: '0.8.1', skill: 'visual-explainer', atRoot: true });
  writeManifest(home, {
    'superpowers@claude-plugins-official': [{ scope: 'user', installPath: nested.installPath, version: '6.3.0' }],
    'visual-explainer@visual-explainer-marketplace': [{ scope: 'user', installPath: root.installPath, version: '0.8.1' }],
  });

  for (const [reference, expected] of [['superpowers:writing-plans', nested.skillPath], ['visual-explainer:visual-explainer', root.skillPath]]) {
    const pointer = resolveSkillPointer({ reference, homeDir: home });
    assert.equal(isAbsolute(pointer.path), true);
    assert.equal(existsSync(pointer.path), true, `${reference} resolved to ${pointer.path}, which is not on disk`);
    assert.equal(pointer.path, expected);
  }
});

test('check 2: the pointer the generator writes into the body is the one that exists on disk', (t) => {
  const home = scratch(t);
  const nested = installPluginTree(home, { marketplace: 'claude-plugins-official', plugin: 'superpowers', version: '6.3.0', skill: 'writing-plans' });
  writeManifest(home, { 'superpowers@claude-plugins-official': [{ scope: 'user', installPath: nested.installPath, version: '6.3.0' }] });

  const body = composeAgentBody(pointerSpec('pointer-subject'), { homeDir: home });
  const emitted = /^- `superpowers:writing-plans` — (.+)$/m.exec(body);
  assert.notEqual(emitted, null, body);
  assert.equal(existsSync(emitted[1]), true, `the body names ${emitted[1]}, which is not on disk`);
});

test('check 3: a manifest naming a different plugin version turns the drift check red', (t) => {
  const before = scratch(t);
  const after = scratch(t);
  const bodies = scratch(t);
  const spec = pointerSpec('plugin-drift-subject');

  const old = installPluginTree(before, { marketplace: 'claude-plugins-official', plugin: 'superpowers', version: '6.3.0', skill: 'writing-plans' });
  writeManifest(before, { 'superpowers@claude-plugins-official': [{ scope: 'user', installPath: old.installPath, version: '6.3.0' }] });

  const generated = composeAgentBody(spec, { homeDir: before });
  writeFileSync(join(bodies, `${spec.name}.md`), generated);
  assert.equal(checkBodyDrift({ root: bodies, specs: [spec], homeDir: before }).ok, true);

  const upgraded = installPluginTree(after, { marketplace: 'claude-plugins-official', plugin: 'superpowers', version: '6.4.0', skill: 'writing-plans' });
  writeManifest(after, { 'superpowers@claude-plugins-official': [{ scope: 'user', installPath: upgraded.installPath, version: '6.4.0' }] });

  const result = checkBodyDrift({ root: bodies, specs: [spec], homeDir: after });
  assert.equal(result.ok, false, 'a plugin upgrade must fail the drift check rather than break silently');
  assert.equal(result.findings[0].kind, 'drift');
  assert.equal(generated.includes('6.3.0'), true);
  assert.equal(composeAgentBody(spec, { homeDir: after }).includes('6.4.0'), true);
});

test('the drift census halts on a generated body that no spec claims', (t) => {
  const root = scratch(t);
  cpSync(FIXTURE_DIR, root, { recursive: true });
  writeFileSync(join(root, 'unclaimed.md'), 'hand written\n');
  const result = checkBodyDrift({ root, specs: [FIXTURE_SPEC], ...FIXTURE_OPTIONS });
  assert.equal(result.ok, false);
  assert.equal(result.findings.some((item) => item.kind === 'orphan' && item.path.endsWith('unclaimed.md')), true);
});

test('the drift census halts on a spec whose generated body is absent', (t) => {
  const root = scratch(t);
  const result = checkBodyDrift({ root, specs: [FIXTURE_SPEC], ...FIXTURE_OPTIONS });
  assert.equal(result.ok, false);
  assert.equal(result.findings[0].kind, 'missing');
  assert.match(result.findings[0].detail, /fixture-composition-agent/);
});

test('enumeration reaches bodies inside a dot-directory that a recursive glob skips', (t) => {
  const root = scratch(t);
  const hidden = join(root, '.claude', 'agents');
  mkdirSync(hidden, { recursive: true });
  writeFileSync(join(hidden, 'hidden-agent.md'), 'body\n');

  assert.deepEqual(enumerateGeneratedBodies(root), [join(hidden, 'hidden-agent.md')]);
  assert.deepEqual(globSync('**/*.md', { cwd: root }), []);
});

test('enumeration refuses a root that is not an explicit directory', () => {
  assert.throws(() => enumerateGeneratedBodies(''), /explicit root directory/);
});

test('a bare skill name is rejected rather than resolved against a guessed plugin', () => {
  assert.throws(() => parseSkillReference('writing-plans'), /not fully qualified as plugin:skill/);
  assert.deepEqual(parseSkillReference('superpowers:writing-plans'), { plugin: 'superpowers', skill: 'writing-plans' });
});

test('an unresolvable skill reference names the plugin and the manifest instead of falling back', (t) => {
  const home = scratch(t);
  writeManifest(home, { 'superpowers@claude-plugins-official': [{ scope: 'user', installPath: join(home, 'gone'), version: '1.0.0' }] });
  assert.throws(() => resolveSkillPointer({ reference: 'receipts:gates', homeDir: home }), /no plugin named receipts is installed/);
  assert.throws(() => resolveSkillPointer({ reference: 'superpowers:writing-plans', homeDir: home }), /resolved to no readable SKILL.md/);
});

test('equal-precedence manifest entries that disagree halt rather than picking the first', (t) => {
  const home = scratch(t);
  const one = installPluginTree(home, { marketplace: 'claude-plugins-official', plugin: 'superpowers', version: '6.3.0', skill: 'writing-plans' });
  const two = installPluginTree(home, { marketplace: 'claude-plugins-official', plugin: 'superpowers', version: '6.4.0', skill: 'writing-plans' });
  writeManifest(home, {
    'superpowers@claude-plugins-official': [
      { scope: 'project', projectPath: '/a', installPath: one.installPath, version: '6.3.0' },
      { scope: 'project', projectPath: '/b', installPath: two.installPath, version: '6.4.0' },
    ],
  });
  assert.throws(
    () => resolveSkillPointer({ reference: 'superpowers:writing-plans', homeDir: home, projectPath: '/unknown' }),
    /install paths of equal precedence/,
  );
});

test('an unknown fragment name names the declared fragments rather than composing an empty section', () => {
  assert.throws(() => renderFragment('does-not-exist'), /does not exist; the declared fragments are/);
  assert.match(renderFragment('delegation-boundary'), /^## Do NOT\n\n- Spawn other subagents\.\n/);
});

test('spec validation rejects a body that would ship without a per-agent section or a tool allowlist', () => {
  assert.throws(() => validateAgentSpec({ ...pointerSpec('x'), sections: [] }), /sections must be a non-empty array/);
  assert.throws(() => validateAgentSpec({ ...pointerSpec('x'), tools: [] }), /at least one tool/);
  assert.throws(() => validateAgentSpec({ ...pointerSpec('Bad Name') }), /must match/);
});
