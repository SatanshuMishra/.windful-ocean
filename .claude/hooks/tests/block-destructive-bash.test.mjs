import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const hookPath = fileURLToPath(new URL('../block-destructive-bash.sh', import.meta.url));

function runHook(command) {
  const payload = JSON.stringify({ tool_input: { command } });
  return spawnSync('bash', [hookPath], { input: payload, encoding: 'utf8' });
}

const denyCommands = [
  'gh pr merge --squash 12',
  'gh pr merge --admin 12',
  'gh pr merge 12',
  'gh pr merge --rebase 3 --delete-branch',
  'gh pr merge -m x 5',
  'gh api --method PUT repos/o/r/pulls/1/merge',
  'gh api -X PUT repos/o/r/pulls/12/merge -f merge_method=squash',
  'gh api repos/o/r/pulls/1/merge',
];

for (const command of denyCommands) {
  test(`denies gh pr merge form: ${command}`, () => {
    const r = runHook(command);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /"permissionDecision":"deny"/);
  });
}

const allowCommands = [
  'gh pr create --head x --base y',
  'gh pr view 12',
  'gh pr edit 12 --add-label x',
  'gh pr list -R o/r',
  'gh api repos/o/r/compare/main...feature',
  'gh pr view -R x branch --json state,mergedAt,url',
  'git -C /repo status',
  'git -C /repo push --force-with-lease origin main',
  'git -C /repo branch -d feature',
];

for (const command of allowCommands) {
  test(`allows sibling gh verb without deny: ${command}`, () => {
    const r = runHook(command);
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  });
}

const askCommands = [
  'git push --force origin main',
  'rm -rf /tmp/x',
  'git -C /repo push --force origin main',
  'git -C /repo push -f',
  'git -C /repo reset --hard HEAD~1',
  'git -C /repo clean -fd',
  'git -c core.pager=cat -C /repo push --force',
  'git -C /repo branch -D feature',
];

for (const command of askCommands) {
  test(`still asks for existing destructive case: ${command}`, () => {
    const r = runHook(command);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /"permissionDecision":"ask"/);
  });
}
