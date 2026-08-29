import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolvePluginInstallPath, semverCompare, SUPERPOWERS_PLUGIN_KEY } from '../plugin-resolver.mjs';

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

test('resolvePluginInstallPath reads the install path from the manifest', () => {
  const install = '/cache/claude-plugins-official/superpowers/6.3.0';
  const result = resolvePluginInstallPath({
    manifestPath: '/m.json',
    cacheGlobBase: '/cache/claude-plugins-official/superpowers',
    deps: manifestDeps({
      manifest: { plugins: { [SUPERPOWERS_PLUGIN_KEY]: [{ scope: 'project', installPath: install }] } },
      present: ['/m.json'],
    }),
  });
  assert.deepEqual(result, { installPath: install, version: '6.3.0', source: 'manifest' });
});

test('resolvePluginInstallPath accepts a bare object entry as well as an array entry', () => {
  const install = '/cache/claude-plugins-official/superpowers/6.3.0';
  const result = resolvePluginInstallPath({
    manifestPath: '/m.json',
    cacheGlobBase: '/nowhere',
    deps: manifestDeps({
      manifest: { plugins: { [SUPERPOWERS_PLUGIN_KEY]: { installPath: install } } },
      present: ['/m.json'],
    }),
  });
  assert.equal(result.installPath, install);
  assert.equal(result.source, 'manifest');
});

test('resolvePluginInstallPath falls back to the highest cached version when the manifest is absent', () => {
  const base = '/cache/claude-plugins-official/superpowers';
  const result = resolvePluginInstallPath({
    manifestPath: '/missing.json',
    cacheGlobBase: base,
    deps: manifestDeps({
      manifest: {},
      present: [base, `${base}/6.3.0`, `${base}/6.10.0`, `${base}/6.9.0`],
    }),
  });
  assert.deepEqual(result, { installPath: `${base}/6.10.0`, version: '6.10.0', source: 'cache-glob' });
});

test('resolvePluginInstallPath falls back to the cache when the manifest path is rejected by accept', () => {
  const base = '/cache/claude-plugins-official/superpowers';
  const result = resolvePluginInstallPath({
    manifestPath: '/m.json',
    cacheGlobBase: base,
    accept: (installPath) => installPath !== '/gone/superpowers/9.9.9',
    deps: manifestDeps({
      manifest: { plugins: { [SUPERPOWERS_PLUGIN_KEY]: [{ installPath: '/gone/superpowers/9.9.9' }] } },
      present: ['/m.json', base, `${base}/6.3.0`],
    }),
  });
  assert.deepEqual(result, { installPath: `${base}/6.3.0`, version: '6.3.0', source: 'cache-glob' });
});

test('resolvePluginInstallPath returns null when neither the manifest nor the cache resolves', () => {
  const result = resolvePluginInstallPath({
    manifestPath: '/missing.json',
    cacheGlobBase: '/missing-cache',
    deps: manifestDeps({ manifest: {}, present: [] }),
  });
  assert.equal(result, null);
});

test('resolvePluginInstallPath reads a real manifest off disk without injected dependencies', (t) => {
  const home = mkdtempSync(join(tmpdir(), 'plugin-resolver-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const installPath = join(home, 'cache', 'claude-plugins-official', 'superpowers', '6.3.0');
  mkdirSync(installPath, { recursive: true });
  const manifestPath = join(home, 'installed_plugins.json');
  writeFileSync(manifestPath, JSON.stringify({ version: 2, plugins: { [SUPERPOWERS_PLUGIN_KEY]: [{ scope: 'user', installPath }] } }));

  const result = resolvePluginInstallPath({ manifestPath, cacheGlobBase: join(home, 'no-cache') });
  assert.deepEqual(result, { installPath, version: '6.3.0', source: 'manifest' });
});
