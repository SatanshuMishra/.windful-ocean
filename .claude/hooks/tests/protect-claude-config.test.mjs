import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HOOK = new URL('../protect-claude-config.sh', import.meta.url).pathname;
const REPO_CLAUDE = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const HOME_CLAUDE = join(homedir(), '.claude');

function decide(filePath) {
  const out = execFileSync(HOOK, {
    input: JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: filePath } }),
    encoding: 'utf8',
  });
  if (out.trim() === '') return null;
  return JSON.parse(out).hookSpecificOutput.permissionDecision;
}

const GUARDED = [
  ['the pull-request tool in the repo lib tree', join(REPO_CLAUDE, 'lib/superpowers-parallel/mitosis-git.mjs')],
  ['the same file addressed through the symlinked home lib path', join(HOME_CLAUDE, 'lib/superpowers-parallel/mitosis-git.mjs')],
  ['the mitosis engine in the repo workflows tree', join(REPO_CLAUDE, 'workflows/mitosis.js')],
  ['the same engine addressed through the symlinked home workflows path', join(HOME_CLAUDE, 'workflows/mitosis.js')],
  ['the bash gate that denies raw pull-request creation', join(HOME_CLAUDE, 'hooks/block-destructive-bash.sh')],
  ['a rules file', join(HOME_CLAUDE, 'rules/common/git/pull-requests.md')],
  ['settings.json itself', join(HOME_CLAUDE, 'settings.json')],
];

for (const [label, path] of GUARDED) {
  test(`a write to ${label} is held for human confirmation`, () => {
    assert.equal(decide(path), 'ask', `${path} is a guardrail surface and must not be editable without a human seeing it`);
  });
}

test('a file outside the guarded prefixes is not held, so the guard stays a perimeter and not a blanket', () => {
  assert.equal(decide(join(REPO_CLAUDE, 'skills/mitosis/templates/receipts.yml')), null);
});

test('a payload carrying no file path is ignored rather than guessed at', () => {
  const out = execFileSync(HOOK, { input: JSON.stringify({ tool_input: {} }), encoding: 'utf8' });
  assert.equal(out.trim(), '');
});
