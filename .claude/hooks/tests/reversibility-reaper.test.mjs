import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  expiredCheckpointRefs,
  parseCheckpointRefs,
  expiredSnapshots,
  parseSnapshotNames,
  reapCheckpointRefs,
  reapSnapshots,
  agentInvocationRefusal,
} from '../../lib/reversibility/reaper.mjs';
import { loadConfig } from '../../lib/reversibility/config.mjs';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const reaperPath = fileURLToPath(new URL('../../lib/reversibility/reaper.mjs', import.meta.url));
const scratch = [];

function disposable(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratch.push(dir);
  return dir;
}

process.on('exit', () => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

const HOUR = 3600 * 1000;
const config = loadConfig({ ...process.env, REVERSIBILITY_WINDOW_HOURS: '48' });

function git(args, cwd, env = {}) {
  return spawnSync('git', ['-c', 'core.hooksPath=/nonexistent-hooks', ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

function repoWithCheckpoints(now) {
  const dir = disposable('reversibility-reaper-repo-');
  git(['init', '-b', 'main'], dir);
  git(['config', 'user.email', 'test@example.invalid'], dir);
  git(['config', 'user.name', 'Reversibility Test'], dir);
  writeFileSync(join(dir, 'file.txt'), 'content\n');
  git(['add', 'file.txt'], dir);
  git(['commit', '-m', 'initial'], dir);

  const commitAt = (ageHours, message) => {
    const iso = new Date(now - ageHours * HOUR).toISOString();
    const stamped = { GIT_COMMITTER_DATE: iso, GIT_AUTHOR_DATE: iso };
    const tree = git(['rev-parse', 'HEAD^{tree}'], dir).stdout.trim();
    return git(['commit-tree', tree, '-m', message], dir, stamped).stdout.trim();
  };

  git(['update-ref', `${config.refPrefix}/stale`, commitAt(72, 'stale checkpoint')], dir);
  git(['update-ref', `${config.refPrefix}/fresh`, commitAt(1, 'fresh checkpoint')], dir);
  git(['update-ref', 'refs/checkpoint-experiment/old', commitAt(9000, 'prior experiment')], dir);
  git(['update-ref', 'refs/heads/ancient', commitAt(9000, 'ancient branch')], dir);
  return dir;
}

function refExists(repo, ref) {
  return git(['rev-parse', '--verify', '--quiet', ref], repo).status === 0;
}

test('expiredCheckpointRefs selects only refs older than the window', () => {
  const now = Date.parse('2026-08-13T12:00:00Z');
  const entries = [
    { ref: `${config.refPrefix}/a`, committedAtMs: now - 72 * HOUR },
    { ref: `${config.refPrefix}/b`, committedAtMs: now - 1 * HOUR },
    { ref: `${config.refPrefix}/c`, committedAtMs: now - 48 * HOUR - 1 },
  ];
  assert.deepEqual(expiredCheckpointRefs(entries, { now, config }), [`${config.refPrefix}/a`, `${config.refPrefix}/c`]);
});

test('expiredCheckpointRefs never selects a ref outside the checkpoint namespace', () => {
  const now = Date.parse('2026-08-13T12:00:00Z');
  const entries = [
    { ref: 'refs/checkpoint-experiment/old', committedAtMs: 0 },
    { ref: 'refs/heads/main', committedAtMs: 0 },
    { ref: 'refs/tags/v1', committedAtMs: 0 },
    { ref: `${config.refPrefix}-lookalike/x`, committedAtMs: 0 },
  ];
  assert.deepEqual(expiredCheckpointRefs(entries, { now, config }), []);
});

test('parseCheckpointRefs reads for-each-ref output into ref and timestamp pairs', () => {
  const parsed = parseCheckpointRefs('refs/reversibility/checkpoint/a 1755000000\nrefs/reversibility/checkpoint/b 1755003600\n');
  assert.deepEqual(parsed, [
    { ref: 'refs/reversibility/checkpoint/a', committedAtMs: 1755000000000 },
    { ref: 'refs/reversibility/checkpoint/b', committedAtMs: 1755003600000 },
  ]);
});

test('reapCheckpointRefs deletes expired checkpoints and leaves newer ones and foreign refs intact', () => {
  const now = Date.now();
  const repo = repoWithCheckpoints(now);

  const summary = reapCheckpointRefs({ repo, config, now });

  assert.deepEqual(summary.deleted, [`${config.refPrefix}/stale`]);
  assert.equal(refExists(repo, `${config.refPrefix}/stale`), false);
  assert.equal(refExists(repo, `${config.refPrefix}/fresh`), true);
  assert.equal(refExists(repo, 'refs/checkpoint-experiment/old'), true);
  assert.equal(refExists(repo, 'refs/heads/ancient'), true);
});

test('parseSnapshotNames keeps Time Machine local snapshots and drops OS update snapshots', () => {
  const listing = [
    'Snapshots for volume group containing disk /:',
    'com.apple.TimeMachine.2026-08-13-121831.local',
    'com.apple.os.update-8756407473526DD4A4C2DF8CE490E569',
    'com.apple.TimeMachine.2026-08-10-030000.local',
    '',
  ].join('\n');
  assert.deepEqual(parseSnapshotNames(listing), [
    'com.apple.TimeMachine.2026-08-13-121831.local',
    'com.apple.TimeMachine.2026-08-10-030000.local',
  ]);
});

test('expiredSnapshots selects only snapshots older than the window', () => {
  const now = Date.parse('2026-08-13T12:00:00');
  const names = [
    'com.apple.TimeMachine.2026-08-13-113000.local',
    'com.apple.TimeMachine.2026-08-10-030000.local',
    'com.apple.os.update-ABC',
  ];
  assert.deepEqual(expiredSnapshots(names, { now, config }), [
    { name: 'com.apple.TimeMachine.2026-08-10-030000.local', date: '2026-08-10-030000' },
  ]);
});

test('reapSnapshots deletes expired snapshots by date and never issues a volume-wide delete', () => {
  const now = Date.parse('2026-08-13T12:00:00');
  const calls = [];
  const exec = (command, args) => {
    calls.push([command, ...args]);
    if (args[0] === 'listlocalsnapshots') {
      return {
        status: 0,
        stdout: [
          'Snapshots for volume group containing disk /:',
          'com.apple.TimeMachine.2026-08-13-113000.local',
          'com.apple.TimeMachine.2026-08-01-030000.local',
          'com.apple.os.update-ABC',
        ].join('\n'),
        stderr: '',
      };
    }
    return { status: 0, stdout: '', stderr: '' };
  };

  const summary = reapSnapshots({ config, now, exec });

  assert.deepEqual(summary.deleted, ['com.apple.TimeMachine.2026-08-01-030000.local']);
  assert.deepEqual(calls, [
    ['/usr/bin/tmutil', 'listlocalsnapshots', '/'],
    ['/usr/bin/tmutil', 'deletelocalsnapshots', '2026-08-01-030000'],
  ]);
  assert.ok(!calls.some((call) => call.includes('thinlocalsnapshots')));
});

test('the reaper refuses to run inside a Claude Code process', () => {
  assert.match(agentInvocationRefusal({ CLAUDECODE: '1' }), /scheduler/i);
  assert.match(agentInvocationRefusal({ CLAUDE_CODE_ENTRYPOINT: 'cli' }), /scheduler/i);
  assert.equal(agentInvocationRefusal({ PATH: '/usr/bin' }), null);
});

test('the reaper exits non-zero without reaping when invoked from a Claude Code process', () => {
  const repo = repoWithCheckpoints(Date.now());
  const result = spawnSync(process.execPath, [reaperPath, '--repo', repo], {
    encoding: 'utf8',
    env: { ...process.env, CLAUDECODE: '1', REVERSIBILITY_WINDOW_HOURS: '48' },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /scheduler/i);
  assert.equal(refExists(repo, `${config.refPrefix}/stale`), true);
});

function hookCommands() {
  const settings = JSON.parse(readFileSync(join(repoRoot, '.claude', 'settings.json'), 'utf8'));
  return Object.values(settings.hooks ?? {})
    .filter(Array.isArray)
    .flatMap((matchers) => matchers.flatMap((matcher) => (Array.isArray(matcher.hooks) ? matcher.hooks : [])))
    .map((hook) => String(hook.command ?? ''))
    .filter((command) => command.trim() !== '');
}

function hookScriptPaths() {
  return hookCommands()
    .flatMap((command) => command.split(/\s+/))
    .filter((token) => token.includes('/'))
    .map((token) => token.replace('$HOME/.claude', join(repoRoot, '.claude')))
    .filter((path) => path.startsWith(repoRoot) && existsSync(path));
}

function staticImports(file) {
  const source = readFileSync(file, 'utf8');
  const specifiers = [...source.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((match) => match[1]);
  return specifiers
    .filter((specifier) => specifier.startsWith('.'))
    .map((specifier) => resolvePath(dirname(file), specifier));
}

function reachableFrom(entries) {
  const seen = new Set();
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.pop();
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    if (!/\.(mjs|cjs|js)$/.test(file)) continue;
    for (const imported of staticImports(file)) queue.push(imported);
  }
  return seen;
}

test('no registered hook command names the reaper', () => {
  const offenders = hookCommands().filter((command) => command.includes('reaper'));
  assert.deepEqual(offenders, []);
});

test('the reaper is not reachable from any registered hook entrypoint', () => {
  const entrypoints = hookScriptPaths();
  assert.ok(entrypoints.length > 0, 'expected registered hook scripts to resolve inside the repository');
  const reachable = reachableFrom(entrypoints);
  assert.equal(reachable.has(reaperPath), false);
});

test('the reaper is not referenced by any script in the hooks directory', () => {
  const hooksDir = join(repoRoot, '.claude', 'hooks');
  const listing = spawnSync('grep', ['-rl', 'reversibility/reaper', hooksDir, '--exclude-dir=tests'], { encoding: 'utf8' });
  assert.equal(listing.stdout.trim(), '');
});
