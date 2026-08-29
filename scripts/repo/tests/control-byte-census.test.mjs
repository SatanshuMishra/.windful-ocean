import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../../..', import.meta.url));
const C0_CEILING = 0x20;
const ALLOWED_CONTROL_BYTES = new Set([0x09, 0x0a, 0x0d]);
const BINARY_EXTENSIONS = new Set(['.mp3']);

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
    `git ${args.join(' ')} exited ${result.status} in ${cwd}, so the control-byte census cannot be taken: ${result.stderr.trim()}`,
  );
  return result.stdout;
}

function nulRecords(stdout) {
  return stdout.split('\0').filter((record) => record !== '');
}

function extensionOf(path) {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot).toLowerCase() : '';
}

function isDeclaredBinary(path) {
  return BINARY_EXTENSIONS.has(extensionOf(path));
}

function scanBytes(bytes) {
  const findings = [];
  let line = 1;
  let allowed = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index];
    if (byte >= C0_CEILING) continue;
    if (ALLOWED_CONTROL_BYTES.has(byte)) {
      allowed += 1;
      if (byte === 0x0a) line += 1;
      continue;
    }
    findings.push({ byte, offset: index, line });
  }
  return { findings, allowed };
}

function readTracked(cwd, path) {
  try {
    return readFileSync(join(cwd, path));
  } catch (error) {
    assert.fail(`${path} is listed by git ls-files but could not be read from the working tree at ${cwd}, so the control-byte census cannot classify it: ${error.message}`);
  }
}

function assertScanIsNonVacuous(fileCount, allowedSightings) {
  assert.ok(
    fileCount > 0,
    'the control-byte census matched zero tracked files; git ls-files must never come back empty against this repository',
  );
  assert.ok(
    allowedSightings > 0,
    `none of the ${fileCount} scanned files contained a single tab, newline, or carriage return; the byte inspection is silently matching nothing and cannot be trusted`,
  );
}

function census(cwd) {
  const scanned = [];
  const excluded = [];
  let allowedSightings = 0;
  for (const path of nulRecords(gitOutput(cwd, ['ls-files', '-z'])).sort()) {
    const { findings, allowed } = scanBytes(readTracked(cwd, path));
    if (isDeclaredBinary(path)) {
      excluded.push({ path, findings });
      continue;
    }
    allowedSightings += allowed;
    scanned.push({ path, findings });
  }
  assertScanIsNonVacuous(scanned.length, allowedSightings);
  return { scanned, excluded };
}

function describeRow(row) {
  return row.findings
    .map((finding) => `${row.path}:${finding.line} carries byte 0x${finding.byte.toString(16).padStart(2, '0').toUpperCase()} at offset ${finding.offset}`)
    .join('\n');
}

test('no tracked file outside the declared binary extensions carries a raw C0 control byte other than tab, newline, or carriage return', () => {
  const violations = census(REPO).scanned.filter((row) => row.findings.length > 0);
  assert.deepEqual(
    violations.map((row) => row.path),
    [],
    `these tracked files carry a raw C0 control byte, so git and every text tool classify them as binary, their diffs show no lines and grep reports no hits:\n${violations.map(describeRow).join('\n')}\nRe-express each byte as a source escape (\\u0000 for NUL, \\u0007 for BEL) so the character survives with identical runtime semantics while the file stays text.`,
  );
});

test('every path excluded as a declared binary asset is genuinely binary, so the exclusion set can never shield a text file', () => {
  const { excluded } = census(REPO);
  const textual = excluded.filter((row) => row.findings.length === 0).map((row) => row.path);
  assert.deepEqual(
    textual,
    [],
    `these paths are excluded by BINARY_EXTENSIONS but carry no control byte at all, so the exclusion is unjustified and hides a text file from the census: ${textual.join(', ')}`,
  );
  const unexercised = [...BINARY_EXTENSIONS].filter((extension) => !excluded.some((row) => extensionOf(row.path) === extension));
  assert.deepEqual(
    unexercised,
    [],
    `these declared binary extensions match no tracked file, so they are dead entries that will silently swallow a future text file: ${unexercised.join(', ')}`,
  );
});

test('a tracked path that cannot be read halts the census rather than being skipped', () => {
  assert.throws(() => readTracked(REPO, 'no/such/tracked/file.mjs'), /could not be read from the working tree/);
});

test('classification is closed: only a declared binary extension is excluded, and every other extension including an unknown one is scanned', () => {
  assert.equal(isDeclaredBinary('.claude/sounds/OptionA.mp3'), true);
  assert.equal(isDeclaredBinary('.claude/lib/git/pr.mjs'), false);
  assert.equal(isDeclaredBinary('vendor/blob.wasm'), false);
  assert.equal(isDeclaredBinary('.zshrc'), false);
  assert.equal(isDeclaredBinary('scripts/run'), false);
});

test('a C0 byte in a file whose extension is unknown to the binary set is a finding, never a skip', () => {
  assert.equal(isDeclaredBinary('vendor/blob.wasm'), false);
  assert.deepEqual(scanBytes(Buffer.from('a\u0000b', 'utf8')).findings, [{ byte: 0x00, offset: 1, line: 1 }]);
});

test('tab, newline, and carriage return are allowed control bytes and produce no finding', () => {
  const { findings, allowed } = scanBytes(Buffer.from('a\tb\r\nc\n', 'utf8'));
  assert.deepEqual(findings, []);
  assert.equal(allowed, 4);
});

test('NUL, BEL, and ESC are findings reported with byte value, offset, and 1-based line', () => {
  assert.deepEqual(scanBytes(Buffer.from('one\ntwo\u0000\nthree\u0007\u001b', 'utf8')).findings, [
    { byte: 0x00, offset: 7, line: 2 },
    { byte: 0x07, offset: 14, line: 3 },
    { byte: 0x1b, offset: 15, line: 3 },
  ]);
});

test('a multi-byte UTF-8 character produces no finding, because no continuation byte falls below 0x20', () => {
  assert.deepEqual(scanBytes(Buffer.from('src/caf\u00e9.txt', 'utf8')).findings, []);
});

test('a zero-file scan set trips the vacuity guard', () => {
  assert.throws(() => assertScanIsNonVacuous(0, 0), /matched zero tracked files/);
});

test('a scan set where no allowed control byte was ever seen trips the vacuity guard', () => {
  assert.throws(() => assertScanIsNonVacuous(5, 0), /silently matching nothing/);
});
