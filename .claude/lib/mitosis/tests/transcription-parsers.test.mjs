import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXEC_COMPLETED, EXEC_SPAWN_FAILED, EXEC_TIMEOUT_EXPIRED } from '../exec-run.mjs';
import {
  classifyPlanArtifact,
  parseAncestry,
  parseBytes,
  parseLsRemote,
  parseMerge,
  parseNameOnlyPaths,
  parsePresence,
  parseSha,
  parseStatusPaths,
} from '../transcription-parsers.mjs';

function completed(status, stdout = '', stderr = '') {
  return Object.freeze({ outcome: EXEC_COMPLETED, status, stdout, stderr, signal: null, error: null });
}

const EVERY_PARSER = Object.freeze([
  ['parseStatusPaths', parseStatusPaths],
  ['parseNameOnlyPaths', parseNameOnlyPaths],
  ['parsePresence', parsePresence],
  ['parseSha', parseSha],
  ['parseLsRemote', parseLsRemote],
  ['parseAncestry', parseAncestry],
  ['parseMerge', parseMerge],
  ['parseBytes', parseBytes],
]);

test('no parser reads a fact out of a run that did not complete', () => {
  for (const [name, parse] of EVERY_PARSER) {
    for (const outcome of [EXEC_TIMEOUT_EXPIRED, EXEC_SPAWN_FAILED]) {
      const measured = parse(Object.freeze({ outcome, status: 0, stdout: 'refs/heads/main', stderr: '', signal: null, error: 'x' }));
      assert.equal(measured.ok, false, `${name} read a fact from a ${outcome} run, so a command that never ran would answer for one that did`);
      assert.match(measured.error, new RegExp(outcome));
    }
  }
});

test('no parser reads a fact out of a result that is not the shape a run returns', () => {
  for (const [name, parse] of EVERY_PARSER) {
    for (const bad of [null, undefined, 'completed', 7, []]) {
      const measured = parse(bad);
      assert.equal(measured.ok, false, `${name} accepted ${JSON.stringify(bad)} as a completed run`);
    }
  }
});

test('the fence parse reports every path the porcelain reports, both sides of a rename', () => {
  const measured = parseStatusPaths(completed(0, ' M src/a.ts\n?? build/out.js\nR  src/old.ts -> src/new.ts\n'));
  assert.equal(measured.ok, true, measured.error);
  assert.deepEqual([...measured.paths], ['src/a.ts', 'build/out.js', 'src/old.ts', 'src/new.ts']);
});

test('the fence parse unquotes a path the porcelain had to quote', () => {
  const measured = parseStatusPaths(completed(0, ' M "src/a b.ts"\nR  "src/o\\tld.ts" -> "src/n ew.ts"\n'));
  assert.equal(measured.ok, true, measured.error);
  assert.deepEqual([...measured.paths], ['src/a b.ts', 'src/o\tld.ts', 'src/n ew.ts']);
});

test('the fence parse refuses a porcelain line too short to carry a path', () => {
  const measured = parseStatusPaths(completed(0, 'M\n'));
  assert.equal(measured.ok, false);
  assert.match(measured.error, /porcelain/);
});

test('the fence parse refuses a non-zero status rather than reporting an empty tree', () => {
  const measured = parseStatusPaths(completed(128, '', 'not a git repository'));
  assert.equal(measured.ok, false);
  assert.match(measured.error, /not a git repository/);
});

test('the name-only parse returns one path per line and drops no blank-terminated last line', () => {
  const measured = parseNameOnlyPaths(completed(0, 'src/a.ts\nsrc/b.ts\n'));
  assert.equal(measured.ok, true, measured.error);
  assert.deepEqual([...measured.paths], ['src/a.ts', 'src/b.ts']);
  assert.deepEqual([...parseNameOnlyPaths(completed(0, '')).paths], []);
});

test('the presence parse reads exit zero as present and exit one as absent, and nothing else as either', () => {
  assert.deepEqual(
    [parsePresence(completed(0)).present, parsePresence(completed(1)).present],
    [true, false],
  );
  const confused = parsePresence(completed(128, '', 'fatal: not a valid object name'));
  assert.equal(confused.ok, false, 'a fatal error was read as an absence, which is the silent-wrong-success this probe exists to prevent');
});

test('the sha parse accepts only a resolved object name', () => {
  const measured = parseSha(completed(0, '0123456789abcdef0123456789abcdef01234567\n'));
  assert.equal(measured.ok, true, measured.error);
  assert.equal(measured.sha, '0123456789abcdef0123456789abcdef01234567');
  for (const bad of ['', 'HEAD\n', 'not-a-sha\n', 'zzzz111\n']) {
    assert.equal(parseSha(completed(0, bad)).ok, false, `${JSON.stringify(bad)} was accepted as a resolved sha`);
  }
});

test('the ls-remote parse reports an absent ref as absent and a present one with its sha', () => {
  const absent = parseLsRemote(completed(0, ''));
  assert.deepEqual([absent.ok, absent.present, absent.sha], [true, false, null]);
  const present = parseLsRemote(completed(0, '0123456789abcdef0123456789abcdef01234567\trefs/mitosis/a/b\n'));
  assert.deepEqual([present.ok, present.present, present.sha], [true, true, '0123456789abcdef0123456789abcdef01234567']);
});

test('the ls-remote parse refuses a line it cannot split into a sha and a ref', () => {
  assert.equal(parseLsRemote(completed(0, 'garbage\n')).ok, false);
  assert.equal(parseLsRemote(completed(2, '', 'fatal: could not read from remote')).ok, false);
});

test('the ancestry parse reads exit zero and exit one, and refuses anything else', () => {
  assert.deepEqual(
    [parseAncestry(completed(0)).ancestor, parseAncestry(completed(1)).ancestor],
    [true, false],
  );
  assert.equal(parseAncestry(completed(128, '', 'fatal: Not a valid object name')).ok, false);
});

test('the merge parse separates a clean merge from a conflicted one and names the conflicting paths', () => {
  const clean = parseMerge(completed(0, 'Merge made by the ort strategy.\n'));
  assert.deepEqual([clean.ok, clean.merged, clean.conflict], [true, true, false]);
  const clashed = parseMerge(completed(1, 'Auto-merging src/a.ts\nCONFLICT (content): Merge conflict in src/a.ts\nCONFLICT (add/add): Merge conflict in src/b.ts\nAutomatic merge failed\n'));
  assert.deepEqual([clashed.ok, clashed.merged, clashed.conflict], [true, false, true]);
  assert.deepEqual([...clashed.conflictPaths], ['src/a.ts', 'src/b.ts']);
});

test('a merge that failed for a reason that is not a conflict is refused rather than reported as a conflict', () => {
  const broken = parseMerge(completed(128, '', 'fatal: not something we can merge'));
  assert.equal(broken.ok, false);
  assert.equal(broken.conflict, undefined);
});

test('the bytes parse returns stdout verbatim and never repairs it', () => {
  const raw = '{"a":1}\n  trailing  ';
  const measured = parseBytes(completed(0, raw));
  assert.equal(measured.ok, true, measured.error);
  assert.equal(measured.bytes, raw);
  assert.equal(parseBytes(completed(1, '', 'fatal: path does not exist')).ok, false);
});

test('the plan artifact probe demands a regular file that holds bytes, matching the two tests it replaces', () => {
  assert.equal(classifyPlanArtifact({ exists: true, isFile: true, size: 12 }).planFound, true);
  assert.equal(classifyPlanArtifact({ exists: true, isFile: true, size: 0 }).planFound, false);
  assert.equal(classifyPlanArtifact({ exists: true, isFile: false, size: 4096 }).planFound, false);
  assert.equal(classifyPlanArtifact({ exists: false, isFile: false, size: 0 }).planFound, false);
  assert.equal(classifyPlanArtifact(null).planFound, false);
  for (const absent of [{ exists: true, isFile: true, size: 0 }, null]) {
    assert.ok(classifyPlanArtifact(absent).detail.length > 0, 'an absent artifact reports no reason');
  }
});

test('the fence parse reads what real git actually prints, not what this test imagines it prints', () => {
  const root = mkdtempSync(join(tmpdir(), 'mitosis-c4b-'));
  try {
    const git = (...argv) => execFileSync('git', ['-C', root, '-c', 'user.name=mitosis', '-c', 'user.email=mitosis@localhost', ...argv], { encoding: 'utf8' });
    git('init', '-q', '-b', 'main');
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src', 'old.ts'), 'export const a = 1;\n');
    writeFileSync(join(root, 'src', 'keep.ts'), 'export const b = 2;\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'seed');
    git('mv', 'src/old.ts', 'src/new.ts');
    writeFileSync(join(root, 'src', 'keep.ts'), 'export const b = 3;\n');
    writeFileSync(join(root, 'untracked.txt'), 'loose\n');
    const stdout = git('status', '--porcelain=v1', '-uall');
    const measured = parseStatusPaths(completed(0, stdout));
    assert.equal(measured.ok, true, `${measured.error} for real porcelain ${JSON.stringify(stdout)}`);
    for (const expected of ['src/old.ts', 'src/new.ts', 'src/keep.ts', 'untracked.txt']) {
      assert.ok(measured.paths.includes(expected), `real porcelain ${JSON.stringify(stdout)} carries ${expected} but the parse returned ${JSON.stringify([...measured.paths])}`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the sha and ancestry parses read what real git actually returns', () => {
  const root = mkdtempSync(join(tmpdir(), 'mitosis-c4b-'));
  try {
    const git = (...argv) => execFileSync('git', ['-C', root, '-c', 'user.name=mitosis', '-c', 'user.email=mitosis@localhost', ...argv], { encoding: 'utf8' });
    git('init', '-q', '-b', 'main');
    writeFileSync(join(root, 'a.txt'), 'one\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'first');
    const first = parseSha(completed(0, git('rev-parse', 'HEAD')));
    assert.equal(first.ok, true, first.error);
    writeFileSync(join(root, 'a.txt'), 'two\n');
    git('commit', '-q', '-a', '-m', 'second');
    const second = parseSha(completed(0, git('rev-parse', 'HEAD')));
    assert.notEqual(first.sha, second.sha);
    const ancestor = execFileSync('git', ['-C', root, 'merge-base', '--is-ancestor', first.sha, second.sha], { encoding: 'utf8' });
    assert.equal(parseAncestry(completed(0, ancestor)).ancestor, true);
    const changed = parseNameOnlyPaths(completed(0, git('diff', '--name-only', '--end-of-options', first.sha, second.sha)));
    assert.deepEqual([...changed.paths], ['a.txt']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
