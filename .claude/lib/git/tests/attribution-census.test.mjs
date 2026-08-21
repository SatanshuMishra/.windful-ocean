import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url)).replace(/\/$/, '');

const ROOTS = Object.freeze([
  '.claude/lib/git',
  '.claude/lib/mitosis',
]);

const EXTRA_FILES = Object.freeze([
  '.claude/hooks/block-destructive-bash.sh',
  '.claude/skills/pr/SKILL.md',
  '.claude/rules/common/git/pull-requests.md',
]);

const BANNED = Object.freeze([
  'provenance',
  'agent=',
  'model=',
  '--origin',
  'opened by an automated agent',
  'opened at human direction',
]);

const EXCLUDED_SEGMENTS = Object.freeze(['/tests/', '/worktrees/']);

const EXEMPTIONS = Object.freeze([
  Object.freeze({
    file: '.claude/lib/mitosis/cassette.mjs',
    token: 'provenance',
    reason: 'cassette record field name mandated verbatim by the frozen cassette-format SPEC ("provenance": "recorded" | "authored"); not an attribution flag',
  }),
]);

function walkMjsFiles(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      walkMjsFiles(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.mjs')) {
      out.push(full);
    }
  }
  return out;
}

function censusFiles() {
  const globbed = ROOTS.flatMap((root) => walkMjsFiles(`${REPO_ROOT}/${root}`, [])).filter(
    (path) => !EXCLUDED_SEGMENTS.some((segment) => path.includes(segment)),
  );
  const extra = EXTRA_FILES.map((relativePath) => `${REPO_ROOT}/${relativePath}`);
  return [...globbed, ...extra];
}

function firstOccurrenceLine(lowerContent, lowerToken) {
  const index = lowerContent.indexOf(lowerToken);
  if (index === -1) return null;
  return lowerContent.slice(0, index).split('\n').length;
}

test('no census file carries a banned attribution token', () => {
  const files = censusFiles();
  const violations = [];
  for (const file of files) {
    const raw = readFileSync(file, 'utf8');
    const lower = raw.toLowerCase();
    const relativeFile = file.slice(REPO_ROOT.length + 1);
    for (const token of BANNED) {
      const lowerToken = token.toLowerCase();
      const line = firstOccurrenceLine(lower, lowerToken);
      if (line === null) continue;
      const exempted = EXEMPTIONS.some(
        (entry) => entry.file === relativeFile && entry.token === token,
      );
      if (exempted) continue;
      violations.push(`${file}:${line} contains the banned token ${JSON.stringify(token)}`);
    }
  }
  assert.deepEqual(violations, []);
});
