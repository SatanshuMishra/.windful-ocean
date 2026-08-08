import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanup, writeFile } from './_fixture.mjs';
import { BOOTSTRAP_ENTRIES } from '../paths.mjs';
import { installBootstrap, run } from '../install-bootstrap.mjs';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SOURCE_DIR = join(REPO_ROOT, 'scripts', 'config');

function collector() {
  const chunks = [];
  return { chunks, write: (chunk) => chunks.push(chunk), text: () => chunks.join('') };
}

function makeConfigRoot() {
  const home = mkdtempSync(join(tmpdir(), 'install-bootstrap-'));
  const configRoot = join(home, '.claude');
  mkdirSync(configRoot, { recursive: true });
  return { home, configRoot };
}

function cli(argv, home) {
  const stdout = collector();
  const stderr = collector();
  const code = run({ argv, env: { HOME: home }, stdout, stderr });
  return { code, stdout: stdout.text(), stderr: stderr.text() };
}

function actionFor(result, file) {
  return result.actions.find((action) => action.file === file)?.action;
}

test('install lands the derived module closure as plain files', () => {
  const { home, configRoot } = makeConfigRoot();
  try {
    const result = installBootstrap({ configRoot, repoRoot: REPO_ROOT });
    assert.equal(result.status, 'installed');

    const localFiles = readdirSync(join(configRoot, 'local')).sort();
    assert.deepEqual(localFiles, [...result.files].sort());
    for (const entry of BOOTSTRAP_ENTRIES) {
      assert.ok(result.files.includes(entry), `${entry} must be in the closure`);
    }
    assert.ok(!localFiles.includes('tests'), 'tests/ must never be installed');

    for (const file of result.files) {
      const installed = join(configRoot, 'local', file);
      assert.ok(lstatSync(installed).isFile(), `${file} must be a plain file, not a symlink`);
      assert.equal(readFileSync(installed, 'utf8'), readFileSync(join(SOURCE_DIR, file), 'utf8'));
      assert.equal(actionFor(result, file), 'created');
    }
  } finally {
    cleanup(home);
  }
});

test('re-running is a no-op and reports every file as already current', () => {
  const { home, configRoot } = makeConfigRoot();
  try {
    const first = installBootstrap({ configRoot, repoRoot: REPO_ROOT });
    const second = installBootstrap({ configRoot, repoRoot: REPO_ROOT });

    assert.equal(second.status, 'current');
    assert.deepEqual([...second.files].sort(), [...first.files].sort());
    assert.deepEqual(
      second.actions.map((action) => action.action),
      second.actions.map(() => 'unchanged'),
    );
  } finally {
    cleanup(home);
  }
});

test('a drifted or symlinked copy is restored to the repo content as a plain file', () => {
  const { home, configRoot } = makeConfigRoot();
  try {
    installBootstrap({ configRoot, repoRoot: REPO_ROOT });
    const drifted = join(configRoot, 'local', 'converge.mjs');
    const linked = join(configRoot, 'local', 'promote.mjs');
    writeFileSync(drifted, 'process.exit(9)\n', 'utf8');
    cleanup(linked);
    symlinkSync(join(SOURCE_DIR, 'promote.mjs'), linked);

    const result = installBootstrap({ configRoot, repoRoot: REPO_ROOT });

    assert.equal(result.status, 'installed');
    assert.equal(actionFor(result, 'converge.mjs'), 'updated');
    assert.equal(actionFor(result, 'promote.mjs'), 'replaced');
    assert.ok(lstatSync(linked).isFile(), 'a symlink must be replaced by a plain file');
    assert.equal(readFileSync(drifted, 'utf8'), readFileSync(join(SOURCE_DIR, 'converge.mjs'), 'utf8'));
  } finally {
    cleanup(home);
  }
});

test('a local/ that resolves inside releases/ is refused and nothing is written', () => {
  const { home, configRoot } = makeConfigRoot();
  try {
    const nested = join(configRoot, 'releases', 'deadbeef', 'local');
    mkdirSync(nested, { recursive: true });
    symlinkSync(nested, join(configRoot, 'local'));

    const result = installBootstrap({ configRoot, repoRoot: REPO_ROOT });

    assert.equal(result.status, 'refused');
    assert.match(result.errors.join('\n'), /inside/);
    assert.deepEqual(readdirSync(nested), []);
    assert.equal(cli(['install', '--config-root', configRoot, '--repo-root', REPO_ROOT], home).code, 1);
  } finally {
    cleanup(home);
  }
});

test('the installed converge.mjs runs and stays silent with no LIVE receipt', () => {
  const { home, configRoot } = makeConfigRoot();
  try {
    const installed = cli(['install', '--config-root', configRoot, '--repo-root', REPO_ROOT], home);
    assert.equal(installed.code, 0, installed.stderr);

    const run = spawnSync('node', [join(configRoot, 'local', 'converge.mjs'), '--event', 'SessionStart'], {
      encoding: 'utf8',
      env: { ...process.env, HOME: home, CLAUDE_CONFIG_DIR: configRoot },
    });

    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout, '');
  } finally {
    cleanup(home);
  }
});

test('the CLI rejects an unknown verb and an unknown flag with exit 2', () => {
  const { home, configRoot } = makeConfigRoot();
  try {
    assert.equal(cli([], home).code, 2);
    assert.equal(cli(['promote', '--config-root', configRoot], home).code, 2);
    assert.equal(cli(['install', '--target', configRoot], home).code, 2);
    assert.ok(!existsSync(join(configRoot, 'local')), 'a usage rejection must write nothing');
  } finally {
    cleanup(home);
  }
});

test('install refuses a repo root that carries no config sources', () => {
  const { home, configRoot } = makeConfigRoot();
  const empty = mkdtempSync(join(tmpdir(), 'install-bootstrap-empty-'));
  try {
    writeFile(join(empty, 'README.md'), 'no scripts here\n');
    const result = installBootstrap({ configRoot, repoRoot: empty });
    assert.equal(result.status, 'error');
    assert.ok(result.errors.length > 0);
  } finally {
    cleanup(home, empty);
  }
});
