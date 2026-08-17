import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../../..', import.meta.url));
const PROXIMITY_WINDOW = 120;
const SELF = 'scripts/repo/tests/confirmation-claim-census.test.mjs';

const DESTRUCTIVE_OP =
  /\b(?:destructive|force[-\s]?push(?:e[sd]|ing)?|history[-\s]rewrite|branch deletion|file removal|worktree remove|rm\s+-[a-z]*[rf][a-z]*|git\s+clean\s+-[a-z]*f|git\s+branch\s+-D|git\s+reset\s+--hard|overwrit(?:e|es|ing|ten))\b/gi;

const CONFIRMATION_REQUIRED =
  /\bconfirmation-class\b|\b(?:requires?|required|needs?|needed|must\s+(?:be\s+)?(?:have|get|obtain|receive|await)|gated\s+on|contingent\s+on|conditional\s+on|subject\s+to)\b[^\n]{0,40}?\b(?:confirmation|approval|sign-?off)\b|\b(?:confirmation|approval|sign-?off)\b[^\n]{0,40}?\b(?:is|are|was|were|remains?|stays?)\s+(?:required|needed|mandatory)\b/gi;

const SENTENCE_BREAK = /[.!?]["')\]]?\s/;
const FENCE = /^\s{0,3}(?:```|~~~)/;

function runGit(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.error) {
    assert.fail(`git ${args.join(' ')} could not be spawned in ${cwd}: ${result.error.message}`);
  }
  assert.equal(
    result.status,
    0,
    `git ${args.join(' ')} exited ${result.status} in ${cwd}, so the confirmation-claim census cannot be taken: ${result.stderr.trim()}`,
  );
  return result.stdout;
}

function trackedPaths(cwd) {
  return runGit(cwd, ['ls-files', '-z'])
    .split('\0')
    .filter((record) => record !== '')
    .sort();
}

function readTracked(cwd, path) {
  try {
    return readFileSync(join(cwd, path));
  } catch (error) {
    assert.fail(
      `${path} is listed by git ls-files but could not be read from the working tree at ${cwd}, so the confirmation-claim census cannot classify it: ${error.message}`,
    );
  }
}

function isBinary(bytes) {
  return bytes.includes(0x00);
}

function matchesOf(pattern, line) {
  const scanner = new RegExp(pattern.source, pattern.flags);
  const found = [];
  let match = scanner.exec(line);
  while (match !== null) {
    found.push({ text: match[0], start: match.index, end: match.index + match[0].length });
    if (match.index === scanner.lastIndex) scanner.lastIndex += 1;
    match = scanner.exec(line);
  }
  return found;
}

function scanLine(line) {
  const destructive = matchesOf(DESTRUCTIVE_OP, line);
  const confirmation = matchesOf(CONFIRMATION_REQUIRED, line);
  const claims = [];
  for (const operation of destructive) {
    for (const requirement of confirmation) {
      const from = Math.min(operation.end, requirement.end);
      const to = Math.max(operation.start, requirement.start);
      const gap = to - from;
      if (gap > PROXIMITY_WINDOW) continue;
      if (gap > 0 && SENTENCE_BREAK.test(line.slice(from, to))) continue;
      claims.push({ operation: operation.text, requirement: requirement.text });
    }
  }
  return { destructive: destructive.length, confirmation: confirmation.length, claims };
}

function assertScanIsNonVacuous(fileCount, destructiveSightings, confirmationSightings) {
  assert.ok(
    fileCount > 0,
    'the confirmation-claim census matched zero tracked text files; git ls-files must never come back empty against this repository',
  );
  assert.ok(
    destructiveSightings > 0,
    `none of the ${fileCount} scanned files mentioned a destructive operation at all; the destructive half of the conjunction is silently matching nothing and a zero result proves nothing`,
  );
  assert.ok(
    confirmationSightings > 0,
    `none of the ${fileCount} scanned files carried a confirmation requirement at all; the confirmation half of the conjunction is silently matching nothing and a zero result proves nothing`,
  );
}

function isMarkdown(path) {
  return path.toLowerCase().endsWith('.md');
}

function scanFile(path, text) {
  const tracksFences = isMarkdown(path);
  const lines = text.split('\n');
  const findings = [];
  let destructive = 0;
  let confirmation = 0;
  let quoted = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (tracksFences && FENCE.test(line)) {
      quoted = !quoted;
      continue;
    }
    if (quoted) continue;
    const result = scanLine(line);
    destructive += result.destructive;
    confirmation += result.confirmation;
    for (const claim of result.claims) {
      findings.push({ path, line: index + 1, text: line.trim(), ...claim });
    }
  }
  return { findings, destructive, confirmation };
}

function census(cwd) {
  const findings = [];
  let fileCount = 0;
  let destructiveSightings = 0;
  let confirmationSightings = 0;
  for (const path of trackedPaths(cwd)) {
    if (path === SELF) continue;
    const bytes = readTracked(cwd, path);
    if (isBinary(bytes)) continue;
    fileCount += 1;
    const result = scanFile(path, bytes.toString('utf8'));
    destructiveSightings += result.destructive;
    confirmationSightings += result.confirmation;
    findings.push(...result.findings);
  }
  assertScanIsNonVacuous(fileCount, destructiveSightings, confirmationSightings);
  return findings;
}

test('no tracked file asserts that a destructive operation requires confirmation, a control this environment does not have', () => {
  const findings = census(REPO);
  assert.deepEqual(
    findings.map((finding) => `${finding.path}:${finding.line}`),
    [],
    `these lines assert a confirmation control over a destructive operation. The bash gate emits only deny or no-opinion; its ask verdict was deleted in dc8bfb60 and b4371098, so nothing stops a destructive command that the deny list does not name. Delete the assertion rather than softening it:\n${findings
      .map((finding) => `${finding.path}:${finding.line} pairs "${finding.operation}" with "${finding.requirement}"\n  ${finding.text}`)
      .join('\n')}`,
  );
});

test('every claim shape deleted by this change is classified as a violation, so the census cannot pass by failing to match them', () => {
  const deleted = [
    '- Destructive shell/git operations require explicit confirmation.',
    'Commits and pushes are autonomous: commit frequently and atomically as work lands, never waiting to be asked. Destructive git operations require explicit confirmation.',
    '- **Autonomous cadence.** Commit and push without waiting to be asked. Destructive git operations still require explicit confirmation.',
    '- Destructive branch operations (force-push, branch deletion, history rewrite) require explicit user confirmation.',
    'The file removal is confirmation-class in this environment and requires explicit human confirmation before running.',
  ];
  for (const line of deleted) {
    assert.ok(scanLine(line).claims.length > 0, `the census failed to classify a deleted claim as a violation: ${line}`);
  }
});

test('a rewording that keeps the claim is still a violation, so the deletion cannot be undone by paraphrase', () => {
  const paraphrases = [
    'A force push needs explicit user approval.',
    'History rewrite is gated on human sign-off.',
    'rm -rf must obtain confirmation from the operator.',
    'Explicit approval is required before any destructive command runs.',
  ];
  for (const line of paraphrases) {
    assert.ok(scanLine(line).claims.length > 0, `the census failed to classify a paraphrased claim as a violation: ${line}`);
  }
});

test('a legitimate description is not a violation, so the census does not force the deletion of true statements', () => {
  const legitimate = [
    'The gate now reaches only two verdicts, deny and no-opinion; the ask token was removed from the source entirely.',
    'Never silently overwrite an existing file. Always confirm first.',
    'Nothing is deleted without explicit batch approval.',
    'Destructive command (possible credential or guardrail-file exfiltration) - confirm before running.',
    'The ruleset forces every change through a pull request with a required approval.',
    'Merge stays separately human-gated; force push is denied outright by the hook.',
  ];
  for (const line of legitimate) {
    assert.deepEqual(scanLine(line).claims, [], `the census misclassified a legitimate description as a violation: ${line}`);
  }
});

test('a sentence boundary between the two halves defeats the conjunction, and its absence does not', () => {
  assert.deepEqual(scanLine('A force push happened. Approval is required for the release.').claims, []);
  assert.ok(scanLine('A force push, per policy, requires approval.').claims.length > 0);
});

test('distance beyond the proximity window defeats the conjunction', () => {
  const filler = 'x'.repeat(PROXIMITY_WINDOW + 1);
  assert.deepEqual(scanLine(`force push ${filler} requires approval`).claims, []);
  assert.ok(scanLine('force push requires approval').claims.length > 0);
});

test('a markdown fence marks quoted material, so a claim reproduced inside a code block is not read as an assertion', () => {
  const claim = 'Destructive git operations require explicit confirmation.';
  const fenced = ['# Plan', '', '```markdown', claim, '```', '', 'Body text.'].join('\n');
  assert.deepEqual(scanFile('docs/plan.md', fenced).findings, []);
  const unfenced = ['# Plan', '', claim, '', 'Body text.'].join('\n');
  assert.deepEqual(
    scanFile('docs/plan.md', unfenced).findings.map((finding) => finding.line),
    [3],
  );
});

test('fence tracking applies to markdown only, so a backtick line in another format never blinds the census', () => {
  const claim = 'Destructive git operations require explicit confirmation.';
  const text = ['```', claim, '```'].join('\n');
  assert.deepEqual(scanFile('docs/page.html', text).findings.map((finding) => finding.line), [2]);
  assert.deepEqual(scanFile('docs/page.md', text).findings, []);
  assert.equal(isMarkdown('docs/page.MD'), true);
  assert.equal(isMarkdown('docs/page.html'), false);
  assert.equal(isMarkdown('scripts/run'), false);
});

test('a tracked path that cannot be read halts the census rather than being skipped', () => {
  assert.throws(() => readTracked(REPO, 'no/such/tracked/file.md'), /could not be read from the working tree/);
});

test('a binary file is identified by a NUL byte, never by its extension', () => {
  assert.equal(isBinary(Buffer.from('plain text', 'utf8')), false);
  assert.equal(isBinary(Buffer.from([0x61, 0x00, 0x62])), true);
});

test('the census excludes exactly one path, its own source, and that exclusion is load-bearing rather than dead weight', () => {
  const tracked = trackedPaths(REPO);
  assert.ok(tracked.includes(SELF), `${SELF} is excluded from the census but is not a tracked path, so the exclusion shields nothing and hides a stale name`);
  const flagged = readTracked(REPO, SELF)
    .toString('utf8')
    .split('\n')
    .filter((line) => scanLine(line).claims.length > 0);
  assert.ok(
    flagged.length > 0,
    `${SELF} is excluded from the census but carries no claim the classifier would flag, so the exclusion is unjustified and can silently shield a real assertion added to this file later`,
  );
});

test('a zero-file scan set trips the vacuity guard', () => {
  assert.throws(() => assertScanIsNonVacuous(0, 1, 1), /matched zero tracked text files/);
});

test('a scan set where the destructive matcher never fired trips the vacuity guard', () => {
  assert.throws(() => assertScanIsNonVacuous(5, 0, 1), /destructive half of the conjunction is silently matching nothing/);
});

test('a scan set where the confirmation matcher never fired trips the vacuity guard', () => {
  assert.throws(() => assertScanIsNonVacuous(5, 1, 0), /confirmation half of the conjunction is silently matching nothing/);
});
