import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { assertRejected, cleanup, hookSettings, makeHome, promoteScenario, writeFile } from './_fixture.mjs';
import { driftReport, validateCandidate } from '../validate.mjs';

const CANDIDATE_SHA = 'd'.repeat(40);
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/;
const CONTROL_EXCEPT_NEWLINE = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/;
const MARKER = 'A'.repeat(200);
const HOSTILE_HOOK = `\u001b[31m${MARKER}-broken.sh`;

const occurrences = (haystack, needle) => haystack.split(needle).length - 1;

test('an unreadable python hook is reported by its error, never by a bare traceback header', () => {
  const { home, configRoot } = makeHome();
  const candidateDir = join(configRoot, 'releases', CANDIDATE_SHA);
  try {
    writeFile(join(candidateDir, 'hooks', 'sealed.py'), 'print("ok")\n', 0o000);

    const verdict = validateCandidate({
      configRoot,
      candidateDir,
      settings: hookSettings(['python3 $HOME/.claude/hooks/sealed.py']),
      entries: [],
      bootstrapPaths: [],
      home,
    });

    assert.equal(verdict.ok, false);
    const syntax = verdict.failures.filter((failure) => failure.rule === 'hook-syntax');
    assert.equal(syntax.length, 1, JSON.stringify(verdict.failures, null, 2));
    assert.doesNotMatch(syntax[0].detail, /Traceback/);
    assert.match(syntax[0].detail, /sealed\.py/);
    assert.match(syntax[0].detail, /Permission denied|Errno 13/);
  } finally {
    cleanup(home);
  }
});

test('a hostile hook name reaches the drift report inert, capped and unable to forge a row', () => {
  const s = promoteScenario({
    commands: [`$HOME/.claude/hooks/${HOSTILE_HOOK}`],
    mutate: (claude) => writeFile(join(claude, 'hooks', HOSTILE_HOOK), '#!/usr/bin/env bash\nif then fi\n', 0o755),
  });
  try {
    const failures = assertRejected(s.run(), 'hook-syntax');
    const detail = failures[0].detail;
    const report = driftReport(failures);

    assert.doesNotMatch(detail, CONTROL_CHARACTERS);
    assert.doesNotMatch(report, CONTROL_EXCEPT_NEWLINE);
    assert.equal(
      occurrences(detail, MARKER),
      2,
      `the checker reason repeated the hook path verbatim instead of being capped: ${detail.length} characters`,
    );
    assert.equal(report.split('\n').length, 2 + failures.length, report);
  } finally {
    s.dispose();
  }
});
