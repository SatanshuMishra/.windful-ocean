import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_HOOK_COMMANDS,
  cleanup,
  commitChange,
  git,
  makeHome,
  makeRepo,
  settingsFor,
  writeFile,
} from './_fixture.mjs';
import { converge, run } from '../converge.mjs';
import { liveSha, promote } from '../promote.mjs';
import { hookRegistrations } from '../validate.mjs';

const NOW = '2026-08-07T12:00:00.000Z';
const CONVERGE_CLI = fileURLToPath(new URL('../converge.mjs', import.meta.url));
const REPO_SETTINGS = fileURLToPath(new URL('../../../.claude/settings.json', import.meta.url));

function registeredConvergeCommands() {
  const settings = JSON.parse(readFileSync(REPO_SETTINGS, 'utf8'));
  return hookRegistrations(settings)
    .filter((registration) => registration.rawPath.endsWith('converge.mjs'))
    .map((registration) => registration.command);
}

function collector() {
  const chunks = [];
  return { chunks, write: (chunk) => chunks.push(chunk), text: () => chunks.join('') };
}

function scenario() {
  const { repoRoot, sha } = makeRepo();
  const { home, configRoot } = makeHome();
  const settingsPath = settingsFor(configRoot, DEFAULT_HOOK_COMMANDS);
  return {
    repoRoot,
    sha,
    home,
    configRoot,
    settingsPath,
    seedLive: () => promote({ configRoot, repoRoot, ref: 'main', now: NOW, settingsPath, home }),
    converge: (overrides = {}) => converge({
      configRoot,
      repoRoot,
      ref: 'main',
      now: NOW,
      settingsPath,
      home,
      ...overrides,
    }),
    cli: (argv) => {
      const stdout = collector();
      const stderr = collector();
      const code = run({ argv, env: { HOME: home }, stdout, stderr, now: NOW });
      return { code, stdout: stdout.text(), stderr: stderr.text() };
    },
    dispose: () => cleanup(repoRoot, home),
  };
}

test('a session start with live behind main surfaces the divergence into session context', () => {
  const s = scenario();
  try {
    assert.equal(s.seedLive().status, 'promoted');
    const nextSha = commitChange(s.repoRoot, (claude) => writeFile(join(claude, 'docs', 'moved.md'), 'moved\n'));

    const hook = spawnSync('node', [CONVERGE_CLI, '--event', 'SessionStart', '--config-root', s.configRoot], {
      encoding: 'utf8',
      env: { ...process.env, HOME: s.home, CLAUDE_CONFIG_DIR: s.configRoot },
    });

    assert.equal(hook.status, 0, hook.stderr);
    const emitted = JSON.parse(hook.stdout);
    assert.equal(emitted.hookSpecificOutput.hookEventName, 'SessionStart');
    const context = emitted.hookSpecificOutput.additionalContext;
    assert.match(context, /live differed from main/);
    assert.ok(context.includes(s.sha), `drift report must name the sha live was on: ${context}`);
    assert.ok(context.includes(nextSha), `drift report must name the sha main is on: ${context}`);
    assert.equal(liveSha(s.configRoot), nextSha);
  } finally {
    s.dispose();
  }
});

test('converge refuses a ref that is not main and builds nothing for it', () => {
  const s = scenario();
  try {
    assert.equal(s.seedLive().status, 'promoted');
    git(s.repoRoot, ['checkout', '-q', '-b', 'feat/staging']);
    const stagingSha = commitChange(s.repoRoot, (claude) => writeFile(join(claude, 'docs', 'staging.md'), 'staging\n'));
    git(s.repoRoot, ['checkout', '-q', 'main']);

    const outcome = s.converge({ ref: 'feat/staging' });

    assert.equal(outcome.status, 'refused');
    assert.match(outcome.errors[0], /must never reach a running agent/);
    assert.ok(
      !existsSync(join(s.configRoot, 'releases', stagingSha)),
      'a refused ref must never be built into a release',
    );
    assert.equal(liveSha(s.configRoot), s.sha);
  } finally {
    s.dispose();
  }
});

test('the stop registration reports a refusal on stderr and fails, never into session context', () => {
  const s = scenario();
  try {
    s.seedLive();

    const result = s.cli(['--event', 'Stop', '--ref', 'feat/staging', '--config-root', s.configRoot]);

    assert.equal(result.code, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /refuses "feat\/staging"/);
  } finally {
    s.dispose();
  }
});

test('a stop with live behind main converges and reports on stderr only', () => {
  const s = scenario();
  try {
    s.seedLive();
    const nextSha = commitChange(s.repoRoot, (claude) => writeFile(join(claude, 'docs', 'later.md'), 'later\n'));

    const result = s.cli(['--event', 'Stop', '--config-root', s.configRoot]);

    assert.equal(result.code, 0);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /live differed from main/);
    assert.equal(liveSha(s.configRoot), nextSha);
  } finally {
    s.dispose();
  }
});

test('a candidate that fails validation is refused loudly and live stays where it was', () => {
  const s = scenario();
  try {
    assert.equal(s.seedLive().status, 'promoted');
    settingsFor(s.configRoot, [...DEFAULT_HOOK_COMMANDS, '$HOME/.claude/hooks/absent.sh']);
    commitChange(s.repoRoot, (claude) => writeFile(join(claude, 'docs', 'unreachable.md'), 'unreachable\n'));

    const result = s.cli(['--event', 'Stop', '--config-root', s.configRoot]);

    assert.equal(result.code, 1);
    assert.match(result.stderr, /FAILED validation/);
    assert.match(result.stderr, /hook-resolution/);
    assert.equal(liveSha(s.configRoot), s.sha);
  } finally {
    s.dispose();
  }
});

test('a session start with live already on main emits nothing at all', () => {
  const s = scenario();
  try {
    s.seedLive();

    const result = s.cli(['--event', 'SessionStart', '--config-root', s.configRoot]);

    assert.equal(result.code, 0);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
    assert.equal(s.converge().status, 'converged');
  } finally {
    s.dispose();
  }
});

test('converge is a no-op before cutover, when no LIVE receipt exists', () => {
  const s = scenario();
  try {
    const result = s.cli(['--event', 'SessionStart', '--config-root', s.configRoot]);

    assert.equal(result.code, 0);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
    assert.equal(s.converge().status, 'uninitialized');
    assert.equal(liveSha(s.configRoot), null);
  } finally {
    s.dispose();
  }
});

test('a malformed LIVE receipt is reported rather than treated as an absent one', () => {
  const s = scenario();
  try {
    s.seedLive();
    rmSync(join(s.configRoot, 'LIVE'));
    writeFile(join(s.configRoot, 'LIVE'), '{"sha":"nope"}\n');

    const outcome = s.converge();

    assert.equal(outcome.status, 'error');
    assert.ok(outcome.errors.length > 0);
    const result = s.cli(['--event', 'Stop', '--config-root', s.configRoot]);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /FAILED/);
  } finally {
    s.dispose();
  }
});

test('the registered converge commands validate only once the bootstrap sits outside every release', () => {
  const { repoRoot, sha } = makeRepo();
  const { home, configRoot } = makeHome();
  try {
    const commands = registeredConvergeCommands();
    assert.equal(commands.length, 2, `expected a SessionStart and a Stop registration, got ${commands.length}`);
    assert.deepEqual(
      [...new Set(commands.map((command) => command.split(/\s+/)[1]))],
      ['$HOME/.claude/local/converge.mjs'],
      'both registrations must address the bootstrap outside releases/, under local/',
    );
    const settingsPath = settingsFor(configRoot, [...DEFAULT_HOOK_COMMANDS, ...commands]);

    const uninstalled = promote({ configRoot, repoRoot, ref: 'main', now: NOW, settingsPath, home });
    assert.equal(uninstalled.status, 'rejected');
    assert.ok(
      uninstalled.failures.some((failure) => failure.rule === 'hook-resolution'),
      JSON.stringify(uninstalled.failures),
    );
    assert.equal(liveSha(configRoot), null);

    writeFile(join(configRoot, 'local', 'converge.mjs'), "export const bootstrap = 'converge';\n");
    const installed = promote({ configRoot, repoRoot, ref: 'main', now: NOW, settingsPath, home });

    assert.equal(installed.status, 'promoted', JSON.stringify(installed.failures ?? installed.errors ?? {}));
    assert.equal(liveSha(configRoot), sha);
  } finally {
    cleanup(repoRoot, home);
  }
});

test('an unusable config root is reported through the hook contract instead of crashing it', () => {
  const s = scenario();
  try {
    assert.equal(s.seedLive().status, 'promoted');
    rmSync(join(s.configRoot, 'releases'), { recursive: true, force: true });
    writeFile(join(s.configRoot, 'releases'), 'not a directory\n');

    const stop = s.cli(['--event', 'Stop', '--config-root', s.configRoot]);

    assert.equal(stop.code, 1);
    assert.equal(stop.stdout, '');
    assert.match(stop.stderr, /Global config convergence: FAILED/);

    const start = s.cli(['--event', 'SessionStart', '--config-root', s.configRoot]);

    assert.equal(start.code, 0, 'a convergence fault must never fail the session it starts');
    assert.equal(start.stderr, '');
    const emitted = JSON.parse(start.stdout);
    assert.equal(emitted.hookSpecificOutput.hookEventName, 'SessionStart');
    assert.match(emitted.hookSpecificOutput.additionalContext, /Global config convergence: FAILED/);
  } finally {
    s.dispose();
  }
});

test('an unregistered hook event is a usage rejection, not a silent pass', () => {
  const s = scenario();
  try {
    const result = s.cli(['--event', 'PreToolUse', '--config-root', s.configRoot]);

    assert.equal(result.code, 2);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /--event must be one of SessionStart, Stop/);
  } finally {
    s.dispose();
  }
});
