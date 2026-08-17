import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { resolveSkillsDir, semverCompare } from '../superpowers-prompts.mjs';

const SUPERPOWERS_KEY = 'superpowers@claude-plugins-official';

function manifestDeps({ manifest, present }) {
  const seen = new Set(present);
  return {
    exists: (p) => seen.has(p),
    readJson: () => manifest,
    listDirs: (base) => (present
      .filter((p) => p.startsWith(`${base}/`))
      .map((p) => p.slice(base.length + 1).split('/')[0])
      .filter((v, i, all) => all.indexOf(v) === i)),
  };
}

test('semverCompare orders by numeric component, not lexically', () => {
  assert.equal(semverCompare('6.10.0', '6.9.0') > 0, true);
  assert.equal(semverCompare('1.2.3', '1.2.3'), 0);
  assert.equal(semverCompare('0.8.1', '0.9.0') < 0, true);
});

test('resolveSkillsDir reads the superpowers install path from the manifest', () => {
  const install = '/cache/claude-plugins-official/superpowers/6.3.0';
  const result = resolveSkillsDir({
    manifestPath: '/m.json',
    cacheGlobBase: '/cache/claude-plugins-official/superpowers',
    deps: manifestDeps({
      manifest: { plugins: { [SUPERPOWERS_KEY]: [{ scope: 'project', installPath: install }] } },
      present: ['/m.json', `${install}/skills`],
    }),
  });
  assert.deepEqual(result, { skillsDir: `${install}/skills`, version: '6.3.0', source: 'manifest' });
});

test('resolveSkillsDir accepts a bare object entry as well as an array entry', () => {
  const install = '/cache/claude-plugins-official/superpowers/6.3.0';
  const result = resolveSkillsDir({
    manifestPath: '/m.json',
    cacheGlobBase: '/nowhere',
    deps: manifestDeps({
      manifest: { plugins: { [SUPERPOWERS_KEY]: { installPath: install } } },
      present: ['/m.json', `${install}/skills`],
    }),
  });
  assert.equal(result.skillsDir, `${install}/skills`);
  assert.equal(result.source, 'manifest');
});

test('resolveSkillsDir falls back to the highest cached version when the manifest is absent', () => {
  const base = '/cache/claude-plugins-official/superpowers';
  const result = resolveSkillsDir({
    manifestPath: '/missing.json',
    cacheGlobBase: base,
    deps: manifestDeps({
      manifest: {},
      present: [base, `${base}/6.3.0/skills`, `${base}/6.10.0/skills`, `${base}/6.9.0/skills`],
    }),
  });
  assert.deepEqual(result, { skillsDir: `${base}/6.10.0/skills`, version: '6.10.0', source: 'cache-glob' });
});

test('resolveSkillsDir falls back to the cache when the manifest names an uninstalled path', () => {
  const base = '/cache/claude-plugins-official/superpowers';
  const result = resolveSkillsDir({
    manifestPath: '/m.json',
    cacheGlobBase: base,
    deps: manifestDeps({
      manifest: { plugins: { [SUPERPOWERS_KEY]: [{ installPath: '/gone/superpowers/9.9.9' }] } },
      present: ['/m.json', base, `${base}/6.3.0/skills`],
    }),
  });
  assert.deepEqual(result, { skillsDir: `${base}/6.3.0/skills`, version: '6.3.0', source: 'cache-glob' });
});

test('resolveSkillsDir returns null when neither the manifest nor the cache resolves', () => {
  const result = resolveSkillsDir({
    manifestPath: '/missing.json',
    cacheGlobBase: '/missing-cache',
    deps: manifestDeps({ manifest: {}, present: [] }),
  });
  assert.equal(result, null);
});

test('resolveSkillsDir resolves the live superpowers skills directory on this machine', () => {
  const home = homedir();
  const result = resolveSkillsDir({
    manifestPath: `${home}/.claude/plugins/installed_plugins.json`,
    cacheGlobBase: `${home}/.claude/plugins/cache/claude-plugins-official/superpowers`,
  });
  assert.notEqual(result, null);
  assert.match(result.skillsDir, /\/superpowers\/[0-9]+\.[0-9]+\.[0-9]+\/skills$/);
});
