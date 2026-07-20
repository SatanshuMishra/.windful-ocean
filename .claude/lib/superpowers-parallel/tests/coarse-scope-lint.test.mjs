import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  lintCoarseScope,
  scopeIsBareTopLevelDir,
  scopeIsSpecificFile,
  namedFilesInText,
  COARSE_SCOPE_FILE_THRESHOLD,
} from '../run-engine.mjs';

test('COARSE_SCOPE_FILE_THRESHOLD is the documented conservative default (3)', () => {
  assert.equal(COARSE_SCOPE_FILE_THRESHOLD, 3);
});

test('a bare top-level-dir scope is flagged (the headline RED)', () => {
  const result = lintCoarseScope({ id: 'm0', title: 'tweak one helper', fileScope: ['src'] });
  assert.equal(result.id, 'm0');
  assert.equal(result.flags.length, 1);
  assert.equal(result.flags[0].scope, 'src');
  assert.equal(result.flags[0].reason, 'bare-top-level-dir');
});

test('a bare top-level dir expressed as a directory glob is still flagged', () => {
  for (const scope of ['src/**', 'src/*', 'lib/', './lib']) {
    assert.equal(scopeIsBareTopLevelDir(scope), true, `${scope} should read as a bare top-level dir`);
    const result = lintCoarseScope({ id: 'm', title: 't', fileScope: [scope] });
    assert.equal(result.flags.length, 1);
    assert.equal(result.flags[0].reason, 'bare-top-level-dir');
  }
});

test('a specific file path is NOT flagged', () => {
  for (const scope of ['lib/config.ts', 'src/auth/login.ts', 'README.md']) {
    assert.equal(scopeIsSpecificFile(scope), true, `${scope} should read as a specific file`);
    assert.equal(scopeIsBareTopLevelDir(scope), false);
    const result = lintCoarseScope({ id: 'm', title: 't', fileScope: [scope] });
    assert.equal(result.flags.length, 0, `${scope} must not be flagged`);
  }
});

test('a nested directory scope is NOT flagged when the task text names no specific files', () => {
  const result = lintCoarseScope({ id: 'm', title: 'own the auth module', fileScope: ['src/auth/**'] });
  assert.equal(scopeIsBareTopLevelDir('src/auth/**'), false);
  assert.equal(result.flags.length, 0);
});

test('a nested directory scope covering more than N named files while the text names them is flagged', () => {
  const task = {
    id: 'm7',
    title: 'edit the auth handlers',
    fullText: 'Touch src/auth/login.ts, src/auth/logout.ts, src/auth/refresh.ts and src/auth/verify.ts.',
    fileScope: ['src/auth/**'],
  };
  const result = lintCoarseScope(task);
  assert.equal(result.flags.length, 1);
  assert.equal(result.flags[0].reason, 'covers-named-files');
  assert.equal(result.flags[0].scope, 'src/auth/**');
  assert.deepEqual(
    [...result.flags[0].covered].sort(),
    ['src/auth/login.ts', 'src/auth/logout.ts', 'src/auth/refresh.ts', 'src/auth/verify.ts'],
  );
});

test('a nested directory scope covering N-or-fewer named files is NOT flagged (below the threshold)', () => {
  const task = {
    id: 'm8',
    title: 'edit two auth handlers',
    fullText: 'Touch src/auth/login.ts and src/auth/logout.ts.',
    fileScope: ['src/auth/**'],
  };
  assert.equal(lintCoarseScope(task).flags.length, 0);
});

test('the file threshold is overridable for calibration', () => {
  const task = {
    id: 'm9',
    fullText: 'src/auth/a.ts src/auth/b.ts',
    fileScope: ['src/auth/**'],
  };
  assert.equal(lintCoarseScope(task, { fileThreshold: 1 }).flags.length, 1);
  assert.equal(lintCoarseScope(task, { fileThreshold: 5 }).flags.length, 0);
});

test('namedFilesInText extracts concrete file paths and ignores prose abbreviations and versions', () => {
  const named = namedFilesInText('See wave-planner.mjs and lib/config.ts (e.g. not a file); Opus 4.8 is a model.');
  assert.deepEqual(named.sort(), ['lib/config.ts', 'wave-planner.mjs']);
});

test('lint is robust to malformed input: non-array fileScope and non-string entries yield no crash and no flags', () => {
  assert.deepEqual(lintCoarseScope({ id: 'x', fileScope: null }).flags, []);
  assert.deepEqual(lintCoarseScope({ id: 'y', fileScope: [42, null, {}] }).flags, []);
  assert.deepEqual(lintCoarseScope(null).flags, []);
  assert.equal(lintCoarseScope(undefined).id, null);
});

test('an empty-prefix extension glob is not treated as a bare top-level dir (avoids noise on legit extension scopes)', () => {
  assert.equal(scopeIsBareTopLevelDir('**/*.sql'), false);
  assert.equal(scopeIsBareTopLevelDir('*.sql'), false);
});
