import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../../..', import.meta.url));
const TEST_PATH = /(\.test\.|\.spec\.|_test\.|(^|\/)test_|(^|\/)tests?\/|\/__tests__\/|_spec\.)/i;
const SNAPSHOT_PATH = /(\.snap$|(^|\/)__snapshots__\/|\.ambr$|(^|\/)__image_snapshots__\/)/i;
const STRING_DELIMITERS = new Set(['"', "'", '`']);
const DANGEROUS_BACKSLASH_THRESHOLD = 20;

function runGit(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.error) {
    assert.fail(`git ${args.join(' ')} could not be spawned in ${cwd}: ${result.error.message}`);
  }
  return result;
}

function gitOutput(cwd, args) {
  const result = runGit(cwd, args);
  assert.equal(
    result.status,
    0,
    `git ${args.join(' ')} exited ${result.status} in ${cwd}, so the string-delimiter census cannot be taken: ${result.stderr.trim()}`,
  );
  return result.stdout;
}

function nulRecords(stdout) {
  return stdout.split('\0').filter((record) => record !== '');
}

function isScannable(path) {
  return TEST_PATH.test(path) && !SNAPSHOT_PATH.test(path);
}

function scanSet(cwd) {
  return nulRecords(gitOutput(cwd, ['ls-files', '-z'])).filter(isScannable).sort();
}

function lineAt(text, index) {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (text[i] === '\n') line += 1;
  }
  return line;
}

function unterminatedDelimiters(text) {
  const findings = [];
  const length = text.length;
  let delimiterCount = 0;
  let cursor = 0;
  while (cursor < length) {
    const char = text[cursor];
    if (!STRING_DELIMITERS.has(char)) {
      cursor += 1;
      continue;
    }
    delimiterCount += 1;
    let closeCursor = cursor + 1;
    let closed = false;
    while (closeCursor < length) {
      const candidate = text[closeCursor];
      if (candidate === '\\') {
        closeCursor += 2;
        continue;
      }
      if (candidate === char) {
        closed = true;
        break;
      }
      closeCursor += 1;
    }
    if (closed) {
      cursor = closeCursor + 1;
      continue;
    }
    const tail = text.slice(cursor + 1);
    const backslashes = tail.split('\\').length - 1;
    findings.push({ index: cursor, delimiter: char, backslashes });
    cursor += 1;
  }
  return { findings, delimiterCount };
}

function isDangerous(finding) {
  return finding.backslashes >= DANGEROUS_BACKSLASH_THRESHOLD;
}

function assertScanIsNonVacuous(fileCount, delimiterSightingCount) {
  assert.ok(
    fileCount > 0,
    'the string-delimiter census matched zero files; the scan-set filter mirrors the receipts enforcer g11.js TEST_PATH/SNAPSHOT_PATH and must never come back empty against a repository that ships test files',
  );
  assert.ok(
    delimiterSightingCount > 0,
    `none of the ${fileCount} scanned files contained a single quote, double quote, or backtick character; the delimiter scan is silently matching nothing and cannot be trusted`,
  );
}

function readTracked(cwd, path) {
  try {
    return readFileSync(join(cwd, path), 'utf8');
  } catch (error) {
    assert.fail(`${path} is listed by git ls-files but could not be read from the working tree at ${cwd}, so the string-delimiter census cannot classify it: ${error.message}`);
  }
}

function dangerousFindings(cwd) {
  const files = scanSet(cwd);
  let delimiterSightingCount = 0;
  const dangerous = [];
  for (const path of files) {
    const text = readTracked(cwd, path);
    const { findings, delimiterCount } = unterminatedDelimiters(text);
    delimiterSightingCount += delimiterCount;
    for (const finding of findings) {
      if (isDangerous(finding)) {
        dangerous.push({ path, line: lineAt(text, finding.index), delimiter: finding.delimiter, backslashes: finding.backslashes });
      }
    }
  }
  assertScanIsNonVacuous(files.length, delimiterSightingCount);
  return dangerous;
}

test('no test-path file carries an unterminated string/template delimiter with a backslash-dense tail, the shape that hangs the receipts enforcer stripStrings', () => {
  const dangerous = dangerousFindings(REPO);
  const detail = dangerous
    .map((f) => `${f.path}:${f.line} unterminated ${f.delimiter} with ${f.backslashes} backslashes in its tail (threshold ${DANGEROUS_BACKSLASH_THRESHOLD})`)
    .join('\n');
  assert.deepEqual(
    dangerous,
    [],
    `these files carry an unterminated string/template delimiter whose tail is backslash-dense enough to hang the receipts enforcer's stripStrings via catastrophic backtracking (measured growth is roughly 2x runtime per added backslash: 20 backslashes measured at 17ms, 28 at 3.5s, 39 at 15+ minutes):\n${detail}\nClose the delimiter, or escape it (for example \\x22 in place of a stray double quote) so it stops opening an unterminated run.`,
  );
});

test('a well-paired double quote, apostrophe, and backtick on one line produce no unterminated finding', () => {
  const { findings } = unterminatedDelimiters(`const a = "x"; const b = 'y'; const c = \`z\`;`);
  assert.deepEqual(findings, []);
});

test('a backslash-escaped delimiter does not close the string early; the real closer further along does', () => {
  const { findings } = unterminatedDelimiters(`const s = "a\\"b";`);
  assert.deepEqual(findings, []);
});

test('quote characters embedded inside a well-paired backtick are inert, not independent delimiters', () => {
  const { findings } = unterminatedDelimiters(`const s = \`{"a":"b"}\`;`);
  assert.deepEqual(findings, []);
});

test('a tail one backslash short of the threshold is not dangerous; the threshold itself is', () => {
  const short = unterminatedDelimiters(`x = "${'\\'.repeat(DANGEROUS_BACKSLASH_THRESHOLD - 1)}`).findings[0];
  const atThreshold = unterminatedDelimiters(`x = "${'\\'.repeat(DANGEROUS_BACKSLASH_THRESHOLD)}`).findings[0];
  assert.equal(short.backslashes, DANGEROUS_BACKSLASH_THRESHOLD - 1);
  assert.equal(isDangerous(short), false);
  assert.equal(atThreshold.backslashes, DANGEROUS_BACKSLASH_THRESHOLD);
  assert.equal(isDangerous(atThreshold), true);
});

test('text with no quote, apostrophe, or backtick characters reports a zero delimiter count', () => {
  const { findings, delimiterCount } = unterminatedDelimiters(`no delimiters in this line at all`);
  assert.deepEqual(findings, []);
  assert.equal(delimiterCount, 0);
});

test('the scan-set filter mirrors g11.js: test-path files are included, snapshots and production files are not', () => {
  assert.equal(isScannable('.claude/lib/mitosis/tests/dispatch-payload.test.mjs'), true);
  assert.equal(isScannable('scripts/repo/tests/gitlink-census.test.mjs'), true);
  assert.equal(isScannable('src/components/Button.jsx'), false);
  assert.equal(isScannable('src/__snapshots__/App.test.tsx.snap'), false);
});

test('lineAt counts newlines before the index to report a 1-based line number', () => {
  const text = `first\nsecond\nthird`;
  assert.equal(lineAt(text, 0), 1);
  assert.equal(lineAt(text, 6), 2);
  assert.equal(lineAt(text, 13), 3);
});

test('a zero-length scan set trips the vacuity guard', () => {
  assert.throws(() => assertScanIsNonVacuous(0, 0), /matched zero files/);
});

test('a scan set where no file contains a delimiter character trips the vacuity guard', () => {
  assert.throws(() => assertScanIsNonVacuous(5, 0), /silently matching nothing/);
});

test('a healthy scan set with delimiter sightings does not trip the vacuity guard', () => {
  assertScanIsNonVacuous(5, 12);
});
