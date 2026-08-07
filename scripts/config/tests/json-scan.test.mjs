import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanup, makeHome, writeFile } from './_fixture.mjs';
import { jsonParseFailures, validateCandidate } from '../validate.mjs';

const CANDIDATE_SHA = 'e'.repeat(40);
const SECRET = 'AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY\n';

function candidateIn(configRoot) {
  const dir = join(configRoot, 'releases', CANDIDATE_SHA);
  mkdirSync(dir, { recursive: true });
  return dir;
}

test('a symlinked directory leaving the candidate is refused, never scanned and never read', () => {
  const outside = mkdtempSync(join(tmpdir(), 'json-escape-'));
  const { home, configRoot } = makeHome();
  try {
    const candidateDir = candidateIn(configRoot);
    writeFile(join(outside, 'creds.json'), SECRET);
    mkdirSync(join(candidateDir, 'docs'), { recursive: true });
    symlinkSync(outside, join(candidateDir, 'docs', 'leak'));

    const verdict = validateCandidate({
      configRoot,
      candidateDir,
      settings: {},
      entries: [],
      bootstrapPaths: [],
      home,
    });

    const details = verdict.failures.map((failure) => failure.detail).join('\n');
    assert.doesNotMatch(details, /AWS_SECRET/, 'a file outside the release reached the drift report');
    assert.doesNotMatch(details, /creds\.json/, 'the scan walked out of the release');
    assert.deepEqual(
      verdict.failures.filter((failure) => failure.rule === 'json-parse'),
      [],
      'nothing outside the release may be parsed',
    );

    const contained = verdict.failures.filter((failure) => failure.rule === 'json-containment');
    assert.equal(contained.length, 1, JSON.stringify(verdict.failures, null, 2));
    assert.match(contained[0].detail, /leak/);
    assert.equal(verdict.ok, false);
  } finally {
    cleanup(home, outside);
  }
});

test('a symlink loop inside the candidate neither amplifies the scan nor re-reads a file', () => {
  const { home, configRoot } = makeHome();
  try {
    const candidateDir = candidateIn(configRoot);
    writeFile(join(candidateDir, 'docs', 'broken.json'), '{ "bindings": [ }\n');
    symlinkSync('..', join(candidateDir, 'docs', 'loop'));

    const failures = jsonParseFailures(candidateDir);

    assert.equal(failures.length, 1, JSON.stringify(failures, null, 2));
    assert.match(failures[0].detail, /broken\.json/);
  } finally {
    cleanup(home);
  }
});

test('an unparsable json file is reported by name and error class, never by its content', () => {
  const { home, configRoot } = makeHome();
  try {
    const candidateDir = candidateIn(configRoot);
    writeFile(join(candidateDir, 'keybindings.json'), SECRET);

    const failures = jsonParseFailures(candidateDir);

    assert.equal(failures.length, 1, JSON.stringify(failures, null, 2));
    assert.match(failures[0].detail, /keybindings\.json/);
    assert.match(failures[0].detail, /SyntaxError/);
    assert.doesNotMatch(failures[0].detail, /AWS_SECRET/, 'the parse error carried file content into the report');
  } finally {
    cleanup(home);
  }
});

test('a parse error that knows where it failed carries the position, and nothing else', () => {
  const { home, configRoot } = makeHome();
  try {
    const candidateDir = candidateIn(configRoot);
    writeFile(join(candidateDir, 'settings.json'), `{"token": "${SECRET.trim()}", "list": [1 2]}\n`);

    const failures = jsonParseFailures(candidateDir);

    assert.equal(failures.length, 1, JSON.stringify(failures, null, 2));
    assert.match(failures[0].detail, /at position \d+/);
    assert.doesNotMatch(failures[0].detail, /AWS_SECRET/);
  } finally {
    cleanup(home);
  }
});

test('a json file that cannot be read is reported by its error code, not by a raw message', () => {
  const { home, configRoot } = makeHome();
  try {
    const candidateDir = candidateIn(configRoot);
    writeFile(join(candidateDir, 'sealed.json'), '{}\n', 0o000);

    const failures = jsonParseFailures(candidateDir);

    assert.equal(failures.length, 1, JSON.stringify(failures, null, 2));
    assert.match(failures[0].detail, /sealed\.json/);
    assert.match(failures[0].detail, /EACCES/);
  } finally {
    cleanup(home);
  }
});
