import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const hookPath = fileURLToPath(new URL('../session-config-drift-check.sh', import.meta.url));

function makeRepo() {
  const repoRoot = mkdtempSync(join(tmpdir(), 'scdc-repo-'));
  mkdirSync(join(repoRoot, '.claude', 'workflows'), { recursive: true });
  mkdirSync(join(repoRoot, '.claude', 'lib'), { recursive: true });
  mkdirSync(join(repoRoot, '.claude', 'hooks'), { recursive: true });
  writeFileSync(join(repoRoot, '.claude', 'workflows', 'mitosis.js'), 'repo workflow content\n');
  writeFileSync(join(repoRoot, '.claude', 'lib', 'lib.mjs'), 'repo lib content\n');
  writeFileSync(join(repoRoot, '.claude', 'hooks', 'sample-hook.sh'), '#!/usr/bin/env bash\necho sample\n');
  return repoRoot;
}

function makeIntactConfig(repoRoot) {
  const configDir = mkdtempSync(join(tmpdir(), 'scdc-config-'));
  symlinkSync(join(repoRoot, '.claude', 'workflows'), join(configDir, 'workflows'), 'dir');
  symlinkSync(join(repoRoot, '.claude', 'lib'), join(configDir, 'lib'), 'dir');
  mkdirSync(join(configDir, 'hooks'), { recursive: true });
  writeFileSync(join(configDir, 'hooks', 'sample-hook.sh'), '#!/usr/bin/env bash\necho sample\n');
  const settings = {
    hooks: {
      SessionStart: [
        {
          matcher: '',
          hooks: [{ type: 'command', command: '$HOME/.claude/hooks/sample-hook.sh', timeout: 10 }],
        },
      ],
    },
  };
  writeFileSync(join(configDir, 'settings.json'), JSON.stringify(settings, null, 2));
  return configDir;
}

function runHook(configDir, repoRoot, extraEnv = {}) {
  return spawnSync('/bin/bash', [hookPath], {
    input: '{}',
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_CONFIG_DIR: configDir, REPO_ROOT: repoRoot, ...extraEnv },
  });
}

function withFixture(fn) {
  const repoRoot = makeRepo();
  const configDir = makeIntactConfig(repoRoot);
  try {
    fn({ repoRoot, configDir });
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
    rmSync(configDir, { recursive: true, force: true });
  }
}

test('intact symlinks and byte-identical hooks: stays silent', () => {
  withFixture(({ repoRoot, configDir }) => {
    const r = runHook(configDir, repoRoot);
    assert.equal(r.status, 0);
    assert.equal(r.stderr, '');
    assert.equal(r.stdout.trim(), '');
  });
});

test('broken workflows symlink: flagged as drift', () => {
  withFixture(({ repoRoot, configDir }) => {
    rmSync(join(configDir, 'workflows'), { recursive: true, force: true });
    symlinkSync('/nonexistent/scdc-target', join(configDir, 'workflows'), 'dir');

    const r = runHook(configDir, repoRoot);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /"hookEventName":"SessionStart"/);
    assert.match(r.stdout, /workflows/);
  });
});

test('workflows symlink replaced by a stale real directory: flagged as drift', () => {
  withFixture(({ repoRoot, configDir }) => {
    rmSync(join(configDir, 'workflows'), { recursive: true, force: true });
    mkdirSync(join(configDir, 'workflows'), { recursive: true });
    writeFileSync(join(configDir, 'workflows', 'mitosis.js'), 'stale copy, not a symlink\n');

    const r = runHook(configDir, repoRoot);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /workflows/);
    assert.match(r.stdout, /not a symlink/);
  });
});

test('lib symlink pointing at the wrong directory: flagged as drift', () => {
  withFixture(({ repoRoot, configDir }) => {
    const decoyRoot = mkdtempSync(join(tmpdir(), 'scdc-decoy-'));
    mkdirSync(join(decoyRoot, 'lib'), { recursive: true });
    try {
      rmSync(join(configDir, 'lib'), { recursive: true, force: true });
      symlinkSync(join(decoyRoot, 'lib'), join(configDir, 'lib'), 'dir');

      const r = runHook(configDir, repoRoot);
      assert.equal(r.status, 0);
      assert.match(r.stdout, /lib/);
      assert.match(r.stdout, /resolves to/);
    } finally {
      rmSync(decoyRoot, { recursive: true, force: true });
    }
  });
});

test('byte-differing settings-invoked hook: flagged as drift', () => {
  withFixture(({ repoRoot, configDir }) => {
    writeFileSync(join(configDir, 'hooks', 'sample-hook.sh'), '#!/usr/bin/env bash\necho DIFFERENT\n');

    const r = runHook(configDir, repoRoot);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /sample-hook\.sh/);
    assert.match(r.stdout, /differs/);
  });
});

test('settings-invoked hook missing locally: flagged as drift', () => {
  withFixture(({ repoRoot, configDir }) => {
    rmSync(join(configDir, 'hooks', 'sample-hook.sh'), { force: true });

    const r = runHook(configDir, repoRoot);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /sample-hook\.sh/);
    assert.match(r.stdout, /missing/);
  });
});

test('a graphify-out entry does not trigger a drift warning', () => {
  withFixture(({ repoRoot, configDir }) => {
    mkdirSync(join(configDir, 'hooks', 'graphify-out'), { recursive: true });
    writeFileSync(join(configDir, 'hooks', 'graphify-out', 'nodes.json'), '{"generated":true}');
    mkdirSync(join(repoRoot, '.claude', 'workflows', 'graphify-out'), { recursive: true });
    writeFileSync(join(repoRoot, '.claude', 'workflows', 'graphify-out', 'nodes.json'), '{"different":true}');

    const r = runHook(configDir, repoRoot);
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), '');
  });
});

test('never exits non-zero, even when drift is present', () => {
  withFixture(({ repoRoot, configDir }) => {
    rmSync(join(configDir, 'workflows'), { recursive: true, force: true });
    const r = runHook(configDir, repoRoot);
    assert.equal(r.status, 0);
  });
});

test('neither jq nor python3 available: says the hook comparison did not run instead of staying silent', () => {
  withFixture(({ repoRoot, configDir }) => {
    const emptyBin = mkdtempSync(join(tmpdir(), 'scdc-emptybin-'));
    try {
      const r = runHook(configDir, repoRoot, { PATH: emptyBin });
      assert.equal(r.status, 0);
      assert.match(r.stdout + r.stderr, /hook comparison did not run/);
    } finally {
      rmSync(emptyBin, { recursive: true, force: true });
    }
  });
});
