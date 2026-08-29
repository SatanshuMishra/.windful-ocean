import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const libPath = fileURLToPath(new URL('../graphify-common.sh', import.meta.url));

function scratch(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'graphify-out-path-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function makeDir(...parts) {
  const path = join(...parts);
  mkdirSync(path, { recursive: true });
  return path;
}

function runLib(body, env) {
  const script = `set -euo pipefail\n. "$1"\nshift\n${body}\n`;
  const result = spawnSync('bash', ['-c', script, 'graphify-lib-under-test', libPath], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, ...env },
  });
  assert.equal(result.status, 0, `bash exited ${result.status}: ${result.stderr}`);
  return result;
}

function outFor(root, env) {
  return runLib(`graphify_out ${JSON.stringify(root)}`, env).stdout.trim();
}

function configuredHome(t) {
  const dir = scratch(t);
  const home = makeDir(dir, 'home');
  const config = makeDir(dir, 'config');
  return { dir, home, config, env: { HOME: home, CLAUDE_CONFIG_DIR: config } };
}

test('a project outside the config dir keeps its own output dir', (t) => {
  const { dir, env } = configuredHome(t);
  const project = makeDir(dir, 'project');
  assert.equal(outFor(project, env), join(project, 'graphify-out'));
});

test('the config dir itself resolves to its depth-1 output dir', (t) => {
  const { config, env } = configuredHome(t);
  assert.equal(outFor(config, env), join(config, 'graphify-out'));
});

test('a config subtree writes to the depth-1 dir, never inside the subtree', (t) => {
  const { config, env } = configuredHome(t);
  const hooks = makeDir(config, 'hooks');
  const rules = makeDir(config, 'rules');
  assert.equal(outFor(hooks, env), join(config, 'graphify-out'));
  assert.equal(outFor(rules, env), join(config, 'graphify-out'));
  assert.notEqual(outFor(hooks, env), join(hooks, 'graphify-out'));
  assert.notEqual(outFor(rules, env), join(rules, 'graphify-out'));
});

test('a nested config subtree also resolves to the depth-1 dir', (t) => {
  const { config, env } = configuredHome(t);
  const nested = makeDir(config, 'skills', 'example', 'templates');
  assert.equal(outFor(nested, env), join(config, 'graphify-out'));
});

test('a sibling sharing the config dir prefix is not treated as inside it', (t) => {
  const { dir, env } = configuredHome(t);
  const sibling = makeDir(dir, 'config-backup');
  assert.equal(outFor(sibling, env), join(sibling, 'graphify-out'));
});

test('the config dir falls back to HOME when no config-dir env var is set', (t) => {
  const { home, env } = configuredHome(t);
  const homeConfig = makeDir(home, '.claude');
  const homeRules = makeDir(homeConfig, 'rules');
  const withoutOverride = { HOME: env.HOME };
  assert.equal(outFor(homeRules, withoutOverride), join(homeConfig, 'graphify-out'));
  assert.equal(outFor(homeConfig, withoutOverride), join(homeConfig, 'graphify-out'));
});

test('a project keeps its own output dir when the config dir does not exist', (t) => {
  const { dir, env } = configuredHome(t);
  const project = makeDir(dir, 'project');
  const missing = { ...env, CLAUDE_CONFIG_DIR: join(dir, 'no-such-config') };
  assert.equal(outFor(project, missing), join(project, 'graphify-out'));
});

test('an absolute GRAPHIFY_OUT override wins over both roots', (t) => {
  const { dir, config, env } = configuredHome(t);
  const shared = join(dir, 'shared-out');
  const project = makeDir(dir, 'project');
  const overridden = { ...env, GRAPHIFY_OUT: shared };
  assert.equal(outFor(project, overridden), shared);
  assert.equal(outFor(config, overridden), shared);
});

test('a relative GRAPHIFY_OUT override resolves under the scan root', (t) => {
  const { dir, env } = configuredHome(t);
  const project = makeDir(dir, 'project');
  const overridden = { ...env, GRAPHIFY_OUT: 'graphify-out-feature' };
  assert.equal(outFor(project, overridden), join(project, 'graphify-out-feature'));
});

test('graphify_out rejects an empty scan root', (t) => {
  const { env } = configuredHome(t);
  const result = spawnSync('bash', ['-c', `. "$1"\ngraphify_out ""\n`, '_', libPath], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, ...env },
  });
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
});

test('the launched build receives the resolved output dir in its environment', (t) => {
  const { dir, config, env } = configuredHome(t);
  const hooks = makeDir(config, 'hooks');
  const bin = makeDir(dir, 'bin');
  const record = join(dir, 'recorded-out');
  writeFileSync(
    join(bin, 'graphify'),
    '#!/usr/bin/env bash\nprintf %s "${GRAPHIFY_OUT:-unset}" > "$GRAPHIFY_OUT_RECORD"\n',
    { mode: 0o755 },
  );
  const out = join(config, 'graphify-out');
  const log = join(dir, 'launch.log');
  runLib(`graphify_launch ${JSON.stringify(hooks)} ${JSON.stringify(log)} "$(graphify_out ${JSON.stringify(hooks)})"\nwait`, {
    ...env,
    PATH: `${bin}:${process.env.PATH}`,
    GRAPHIFY_OUT_RECORD: record,
  });
  assert.equal(readFileSync(record, 'utf8'), out);
  assert.equal(existsSync(out), true);
  assert.equal(existsSync(join(hooks, 'graphify-out')), false);
  assert.equal(existsSync(join(out, '.hook.lock')), false);
});
