import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const hookPath = fileURLToPath(new URL('../plugin-update-check.sh', import.meta.url));

const PENDING_UPDATE = Object.freeze({ kind: 'marketplace', name: 'example', source: 'marketplace:example' });
const CHECKED_JUST_NOW = Math.floor(Date.now() / 1000);
const NEVER_CHECKED = 0;

function homeWithPendingUpdate(t, lastCheck) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'plugin-update-check-')));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const cache = join(home, '.claude', 'cache');
  mkdirSync(cache, { recursive: true });
  writeFileSync(join(cache, 'plugin-update-check.json'), JSON.stringify({ last_check: lastCheck, updates: [PENDING_UPDATE] }));
  return { home, cache };
}

function runHook(home, unattended) {
  const env = { PATH: process.env.PATH, HOME: home };
  if (unattended !== undefined) env.HARNESS_UNATTENDED = unattended;
  const result = spawnSync('bash', [hookPath], { input: JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup' }), encoding: 'utf8', env });
  assert.equal(result.status, 0);
  return result.stdout;
}

test('an attended session is told which third-party updates wait for the owner', (t) => {
  const { home } = homeWithPendingUpdate(t, CHECKED_JUST_NOW);
  const context = JSON.parse(runHook(home)).hookSpecificOutput.additionalContext;
  assert.match(context, /^1 Claude Code third-party update\(s\) available/);
  assert.match(context, /marketplace example is behind upstream/);
});

test('an unattended session gets no update notice', (t) => {
  const { home } = homeWithPendingUpdate(t, CHECKED_JUST_NOW);
  assert.equal(runHook(home, '1'), '');
});

test('an unattended session starts no background refresh, even when the last check is old', (t) => {
  const { home, cache } = homeWithPendingUpdate(t, NEVER_CHECKED);
  assert.equal(runHook(home, '1'), '');
  assert.equal(existsSync(join(cache, 'plugin-update-check.log')), false);
  assert.equal(existsSync(join(cache, 'plugin-update-check.lock')), false);
});

test('only the value 1 marks a session unattended', (t) => {
  const { home } = homeWithPendingUpdate(t, CHECKED_JUST_NOW);
  for (const marker of ['', '0', 'true']) {
    assert.match(runHook(home, marker), /third-party update\(s\) available/);
  }
});
