import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, symlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  GOOD_SH,
  assertLiveUntouched,
  assertRejected,
  cleanup,
  hookSettings,
  makeHome,
  promoteScenario,
  writeFile,
} from './_fixture.mjs';
import { validateCandidate } from '../validate.mjs';

const CANDIDATE_SHA = 'c'.repeat(40);

test('a registered hook that symlinks out of the candidate release is rejected, never validated through the link', () => {
  const outside = mkdtempSync(join(tmpdir(), 'escape-target-'));
  const target = join(outside, 'escape.sh');
  writeFile(target, GOOD_SH, 0o755);
  const s = promoteScenario({
    commands: ['$HOME/.claude/hooks/escape.sh'],
    mutate: (claude) => {
      mkdirSync(join(claude, 'hooks'), { recursive: true });
      symlinkSync(target, join(claude, 'hooks', 'escape.sh'));
    },
  });
  try {
    const [failure] = assertRejected(s.run(), 'hook-containment');

    assert.match(failure.detail, /escape\.sh/);
    assert.match(failure.detail, /outside/);
    assertLiveUntouched(s.configRoot);
  } finally {
    s.dispose();
    cleanup(outside);
  }
});

test('a registered hook under local/ that symlinks out of local/ is rejected too', () => {
  const outside = mkdtempSync(join(tmpdir(), 'escape-target-'));
  const target = join(outside, 'overlay.sh');
  const s = promoteScenario({ commands: ['$HOME/.claude/local/overlay.sh'] });
  try {
    writeFile(target, GOOD_SH, 0o755);
    mkdirSync(join(s.configRoot, 'local'), { recursive: true });
    symlinkSync(target, join(s.configRoot, 'local', 'overlay.sh'));

    assertRejected(s.run(), 'hook-containment');

    assertLiveUntouched(s.configRoot);
  } finally {
    s.dispose();
    cleanup(outside);
  }
});

test('a registered hook that is a named pipe is rejected without validation ever opening it', () => {
  const { home, configRoot } = makeHome();
  const candidateDir = join(configRoot, 'releases', CANDIDATE_SHA);
  try {
    mkdirSync(join(candidateDir, 'hooks'), { recursive: true });
    const pipe = join(candidateDir, 'hooks', 'pipe.sh');
    const made = spawnSync('mkfifo', [pipe], { encoding: 'utf8' });
    assert.equal(made.status, 0, `mkfifo failed: ${made.stderr ?? made.error?.message}`);

    const verdict = validateCandidate({
      configRoot,
      candidateDir,
      settings: hookSettings(['$HOME/.claude/hooks/pipe.sh']),
      entries: [],
      bootstrapPaths: [],
      home,
    });

    assert.equal(verdict.ok, false);
    const shape = verdict.failures.filter((failure) => failure.rule === 'hook-shape');
    assert.equal(shape.length, 1, JSON.stringify(verdict.failures, null, 2));
    assert.match(shape[0].detail, /pipe\.sh/);
    assert.match(shape[0].detail, /not a regular file/);
  } finally {
    cleanup(home);
  }
});

test('a registered hook that is a directory is rejected as the wrong shape, not read as a file', () => {
  const { home, configRoot } = makeHome();
  const candidateDir = join(configRoot, 'releases', CANDIDATE_SHA);
  try {
    mkdirSync(join(candidateDir, 'hooks', 'bundle.sh'), { recursive: true });

    const verdict = validateCandidate({
      configRoot,
      candidateDir,
      settings: hookSettings(['$HOME/.claude/hooks/bundle.sh']),
      entries: [],
      bootstrapPaths: [],
      home,
    });

    assert.equal(verdict.ok, false);
    const shape = verdict.failures.filter((failure) => failure.rule === 'hook-shape');
    assert.equal(shape.length, 1, JSON.stringify(verdict.failures, null, 2));
    assert.match(shape[0].detail, /not a regular file/);
  } finally {
    cleanup(home);
  }
});

test('a symlink that stays inside the candidate release still validates', () => {
  const s = promoteScenario({
    commands: ['$HOME/.claude/hooks/alias.sh'],
    mutate: (claude) => symlinkSync('good.sh', join(claude, 'hooks', 'alias.sh')),
  });
  try {
    const result = s.run();
    assert.equal(result.status, 'promoted', JSON.stringify(result.failures ?? result.errors ?? {}, null, 2));
  } finally {
    s.dispose();
  }
});
