import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_HOOK_COMMANDS,
  cleanup,
  collector,
  commitChange,
  git,
  makeHome,
  makeRepo,
  settingsFor,
  treeSnapshot,
  writeFile,
} from './_fixture.mjs';
import { converge, run } from '../converge.mjs';
import { liveSha, promote } from '../promote.mjs';
import { observeStaleness, stalenessReport } from '../staleness.mjs';

const NOW = '2026-08-07T12:00:00.000Z';
const TRACKING_REF = 'refs/remotes/origin/main';

function configureUpstream(repoRoot) {
  git(repoRoot, ['config', 'remote.origin.url', 'https://example.invalid/repo.git']);
  git(repoRoot, ['config', 'remote.origin.fetch', '+refs/heads/*:refs/remotes/origin/*']);
  git(repoRoot, ['config', 'branch.main.remote', 'origin']);
  git(repoRoot, ['config', 'branch.main.merge', 'refs/heads/main']);
}

function trackRemoteAt(repoRoot, sha) {
  configureUpstream(repoRoot);
  git(repoRoot, ['update-ref', TRACKING_REF, sha]);
}

function moveLocalMainTo(repoRoot, sha) {
  git(repoRoot, ['update-ref', 'refs/heads/main', sha]);
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

function sessionContext(result) {
  assert.equal(result.stderr, '', `a session start must not report on stderr: ${result.stderr}`);
  return JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
}

test('local main behind its upstream is reported without promoting, fetching, or moving any pointer', () => {
  const s = scenario();
  try {
    assert.equal(s.seedLive().status, 'promoted');
    const remoteSha = commitChange(s.repoRoot, (claude) => writeFile(join(claude, 'docs', 'merged.md'), 'merged\n'));
    moveLocalMainTo(s.repoRoot, s.sha);
    trackRemoteAt(s.repoRoot, remoteSha);
    const before = treeSnapshot(s.configRoot);

    const result = s.cli(['--event', 'SessionStart', '--config-root', s.configRoot]);

    assert.equal(result.code, 0);
    const context = sessionContext(result);
    assert.match(context, /behind/, context);
    assert.ok(context.includes(TRACKING_REF), `the report must name the ref it read: ${context}`);
    assert.ok(context.includes(remoteSha), `the report must name the sha the remote is on: ${context}`);
    assert.ok(context.includes(s.sha), `the report must name the sha local main is on: ${context}`);

    assert.equal(liveSha(s.configRoot), s.sha, 'a staleness report must never move the live pointer');
    assert.equal(
      git(s.repoRoot, ['rev-parse', 'refs/heads/main']),
      s.sha,
      'a staleness report must never advance local main',
    );
    assert.ok(
      !existsSync(join(s.configRoot, 'releases', remoteSha)),
      'a staleness report must never build the release it is reporting about',
    );
    assert.deepEqual(treeSnapshot(s.configRoot), before, 'a staleness report must write nothing at all');
  } finally {
    s.dispose();
  }
});

test('local main level with its upstream reports no staleness', () => {
  const s = scenario();
  try {
    assert.equal(s.seedLive().status, 'promoted');
    trackRemoteAt(s.repoRoot, s.sha);

    const result = s.cli(['--event', 'SessionStart', '--config-root', s.configRoot]);

    assert.equal(result.code, 0);
    assert.equal(result.stdout, '', 'a current local main must emit no staleness context');
    assert.equal(result.stderr, '');
    assert.equal(s.converge().staleness.status, 'current');
  } finally {
    s.dispose();
  }
});

test('a branch with no configured upstream is silent rather than warning every session', () => {
  const s = scenario();
  try {
    assert.equal(s.seedLive().status, 'promoted');

    const outcome = s.converge();

    assert.equal(outcome.status, 'converged');
    assert.equal(outcome.staleness.status, 'untracked');
    assert.equal(stalenessReport(outcome.staleness), null);
    assert.equal(s.cli(['--event', 'SessionStart', '--config-root', s.configRoot]).stdout, '');
  } finally {
    s.dispose();
  }
});

test('local main ahead of its upstream is not staleness and stays silent', () => {
  const s = scenario();
  try {
    assert.equal(s.seedLive().status, 'promoted');
    trackRemoteAt(s.repoRoot, s.sha);
    commitChange(s.repoRoot, (claude) => writeFile(join(claude, 'docs', 'unpushed.md'), 'unpushed\n'));

    const outcome = s.converge();

    assert.equal(outcome.staleness.status, 'ahead');
    assert.equal(outcome.staleness.ahead, 1);
    assert.equal(stalenessReport(outcome.staleness), null);
  } finally {
    s.dispose();
  }
});

test('a local main that has diverged from its upstream is reported with both counts', () => {
  const s = scenario();
  try {
    assert.equal(s.seedLive().status, 'promoted');
    const remoteSha = commitChange(s.repoRoot, (claude) => writeFile(join(claude, 'docs', 'theirs.md'), 'theirs\n'));
    moveLocalMainTo(s.repoRoot, s.sha);
    trackRemoteAt(s.repoRoot, remoteSha);
    commitChange(s.repoRoot, (claude) => writeFile(join(claude, 'docs', 'mine.md'), 'mine\n'));

    const outcome = s.converge();

    assert.equal(outcome.staleness.status, 'diverged');
    assert.equal(outcome.staleness.ahead, 1);
    assert.equal(outcome.staleness.behind, 1);
    assert.match(stalenessReport(outcome.staleness), /1 commit ahead/);
    assert.match(stalenessReport(outcome.staleness), /1 commit behind/);
  } finally {
    s.dispose();
  }
});

test('a staleness probe that cannot run fails open with a visible warning and never aborts the session', () => {
  const s = scenario();
  try {
    assert.equal(s.seedLive().status, 'promoted');
    git(s.repoRoot, ['config', 'branch.main.remote', 'origin']);
    git(s.repoRoot, ['config', 'branch.main.merge', 'refs/heads/main']);

    const outcome = s.converge();
    assert.equal(outcome.status, 'converged', 'a broken staleness probe must not fail convergence');
    assert.equal(outcome.staleness.status, 'unreadable');
    assert.ok(outcome.staleness.errors.length > 0, 'a skipped check must say why it was skipped');

    const result = s.cli(['--event', 'SessionStart', '--config-root', s.configRoot]);

    assert.equal(result.code, 0, 'a staleness fault must never fail the session it starts');
    const context = sessionContext(result);
    assert.match(context, /could not be checked/, context);
    assert.equal(liveSha(s.configRoot), s.sha);
  } finally {
    s.dispose();
  }
});

test('a stop event carries staleness into context on the exit path that keeps stderr', () => {
  const s = scenario();
  try {
    assert.equal(s.seedLive().status, 'promoted');
    const remoteSha = commitChange(s.repoRoot, (claude) => writeFile(join(claude, 'docs', 'merged.md'), 'merged\n'));
    moveLocalMainTo(s.repoRoot, s.sha);
    trackRemoteAt(s.repoRoot, remoteSha);

    const result = s.cli(['--event', 'Stop', '--config-root', s.configRoot]);

    assert.equal(result.code, 0);
    assert.equal(result.stderr, '', 'an exit-0 stop hook has its stderr discarded, so nothing may be reported there');
    assert.match(JSON.parse(result.stdout).hookSpecificOutput.additionalContext, /behind/);
  } finally {
    s.dispose();
  }
});

test('a ref the upstream probe cannot form a config key for is reported, never guessed at', () => {
  const s = scenario();
  try {
    const outcome = observeStaleness({ repoRoot: s.repoRoot, ref: '--upload-pack=touch /tmp/pwned' });

    assert.equal(outcome.status, 'unreadable');
    assert.ok(outcome.errors.length > 0);
  } finally {
    s.dispose();
  }
});
