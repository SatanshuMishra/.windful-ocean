import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url)).replace(/\/$/, '');
const RULE_PATH = '.claude/rules/common/database-access.md';
const RETIRED_PATH = '.claude/rules/common/no-direct-db-access.md';
const RETIRED_NAME = 'no-direct-db-access';
const CLAUDE_MD_PATH = '.claude/CLAUDE.md';
const CLAUDE_MD_DATABASE_LINE = 7;
const MAX_RULE_WORDS = 462;
const MAX_LINE_WORDS = 32;
const REQUIRED_PHRASES = Object.freeze(['-reader', 'PII', 'plain English', 'approve', 'run order', '.pgpass']);
const MIGRATION_TOOLS = Object.freeze(['prisma', 'drizzle-kit', 'alembic', 'flyway', 'liquibase', 'sqitch', 'dbmate', 'knex']);
const WALKED_ROOTS = Object.freeze(['.claude', 'docs/security']);
const SKIPPED_DIRS = Object.freeze(['node_modules']);

function repoPath(relativePath) {
  return join(REPO_ROOT, relativePath);
}

function read(relativePath) {
  return readFileSync(repoPath(relativePath), 'utf8');
}

function wordCount(text) {
  return text.split(/\s+/).filter((word) => word.length > 0).length;
}

function walk(relativeDir) {
  return readdirSync(repoPath(relativeDir), { withFileTypes: true }).flatMap((entry) => {
    const relativePath = join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      return SKIPPED_DIRS.includes(entry.name) ? [] : walk(relativePath);
    }
    return entry.isFile() ? [relativePath] : [];
  });
}

test('the database rule is short and complete', () => {
  assert.ok(existsSync(repoPath(RULE_PATH)), `${RULE_PATH} must exist`);
  const rule = read(RULE_PATH);
  const ruleWords = wordCount(rule);
  assert.ok(ruleWords <= MAX_RULE_WORDS, `${RULE_PATH} has ${ruleWords} words, limit ${MAX_RULE_WORDS}`);
  const missing = REQUIRED_PHRASES.filter((phrase) => !rule.includes(phrase));
  assert.deepEqual(missing, [], `${RULE_PATH} is missing phrases`);
  const lowered = rule.toLowerCase();
  const named = MIGRATION_TOOLS.filter((tool) => lowered.includes(tool));
  assert.deepEqual(named, [], `${RULE_PATH} names migration tools`);

  const line = read(CLAUDE_MD_PATH).split('\n')[CLAUDE_MD_DATABASE_LINE - 1] ?? '';
  const lineWords = wordCount(line);
  assert.ok(lineWords > 0, `${CLAUDE_MD_PATH} line ${CLAUDE_MD_DATABASE_LINE} is empty`);
  assert.ok(lineWords <= MAX_LINE_WORDS, `${CLAUDE_MD_PATH} line ${CLAUDE_MD_DATABASE_LINE} has ${lineWords} words, limit ${MAX_LINE_WORDS}`);
  assert.ok(line.includes('rules/common/database-access.md'), `${CLAUDE_MD_PATH} line ${CLAUDE_MD_DATABASE_LINE} must cite the rule`);
});

test('nothing cites the retired rule', () => {
  assert.equal(existsSync(repoPath(RETIRED_PATH)), false, `${RETIRED_PATH} must be deleted`);
  const files = WALKED_ROOTS.flatMap((root) => walk(root));
  assert.ok(files.length > 0, 'the walk found no files');
  const citing = files.filter((file) => read(file).includes(RETIRED_NAME));
  assert.deepEqual(citing, [], `files still cite ${RETIRED_NAME}`);
});
