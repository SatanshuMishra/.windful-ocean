import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

function buildClone() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dotfiles-check-hook-')));
  const clone = path.join(root, 'clone');
  const home = path.join(root, 'home');
  fs.mkdirSync(path.join(clone, '.claude', 'hooks'), { recursive: true });
  fs.mkdirSync(path.join(clone, 'scripts', 'dotfiles'), { recursive: true });
  fs.mkdirSync(home);
  fs.copyFileSync(
    path.join(repoRoot, '.claude', 'hooks', 'dotfiles-check.mjs'),
    path.join(clone, '.claude', 'hooks', 'dotfiles-check.mjs'),
  );
  for (const name of ['manifest.mjs', 'check.mjs']) {
    fs.copyFileSync(
      path.join(repoRoot, 'scripts', 'dotfiles', name),
      path.join(clone, 'scripts', 'dotfiles', name),
    );
  }
  fs.writeFileSync(
    path.join(clone, 'scripts', 'dotfiles', 'links.json'),
    JSON.stringify({ links: [{ source: '.zshrc', target: '.zshrc' }] }),
  );
  fs.writeFileSync(path.join(clone, '.zshrc'), 'export A=1\n');
  return { root, clone, home };
}

function runHook({ clone, home }) {
  const env = { ...process.env, HOME: home };
  delete env.CLAUDE_CODE_SESSION_ID;
  delete env.SHIP;
  return spawnSync(process.execPath, [path.join(clone, '.claude', 'hooks', 'dotfiles-check.mjs')], {
    input: JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup' }),
    encoding: 'utf8',
    env,
  });
}

test('the dotfiles check hook prints nothing when check passes', () => {
  const fixture = buildClone();
  try {
    fs.symlinkSync(path.join(fixture.clone, '.zshrc'), path.join(fixture.home, '.zshrc'));
    const result = runHook(fixture);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, '');
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("the dotfiles check hook prints check's problems", () => {
  const fixture = buildClone();
  try {
    const result = runHook(fixture);
    assert.equal(result.status, 0);
    assert.equal(
      result.stdout,
      'dotfiles check found problems:\ncheck: ~/.zshrc is missing; run install\n',
    );
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('the dotfiles check hook reports a check that throws', () => {
  const fixture = buildClone();
  try {
    fs.rmSync(path.join(fixture.clone, 'scripts', 'dotfiles', 'links.json'));
    const result = runHook(fixture);
    assert.equal(result.status, 0);
    const lines = result.stdout.split('\n').filter((line) => line !== '');
    assert.equal(lines.length, 1);
    assert.ok(lines[0].startsWith('dotfiles check could not run: '));
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});
