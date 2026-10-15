import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url)).replace(/\/$/, '');

const EXTRA_FILES = Object.freeze([
  '.claude/hooks/block-destructive-bash.sh',
]);

const BANNED = Object.freeze([
  'provenance',
  'agent=',
  'model=',
  '--origin',
  'opened by an automated agent',
  'opened at human direction',
]);

const EXEMPTIONS = Object.freeze([]);

function firstOccurrenceLine(lowerContent, lowerToken) {
  const index = lowerContent.indexOf(lowerToken);
  if (index === -1) return null;
  return lowerContent.slice(0, index).split('\n').length;
}

export function bannedTokenViolations(root, relativeFiles) {
  return relativeFiles.flatMap((relativeFile) => {
    const lower = readFileSync(join(root, relativeFile), 'utf8').toLowerCase();
    return BANNED.flatMap((token) => {
      const line = firstOccurrenceLine(lower, token.toLowerCase());
      if (line === null) return [];
      const exempted = EXEMPTIONS.some((entry) => entry.file === relativeFile && entry.token === token);
      return exempted ? [] : [`${relativeFile}:${line} contains the banned token ${JSON.stringify(token)}`];
    });
  });
}

test('no census file carries a banned attribution token', () => {
  assert.deepEqual(bannedTokenViolations(REPO_ROOT, EXTRA_FILES), []);
  const scratch = mkdtempSync(join(tmpdir(), 'attribution-census-'));
  try {
    writeFileSync(join(scratch, 'probe.md'), 'This pull request was opened by an automated agent.\n');
    const violations = bannedTokenViolations(scratch, ['probe.md']);
    assert.equal(violations.length, 1, violations.join('\n'));
    assert.ok(violations[0].includes('"opened by an automated agent"'), violations[0]);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
