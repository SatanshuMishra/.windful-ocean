import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const hookPath = fileURLToPath(new URL('../deny-task-output-read.sh', import.meta.url));

const TASK_OUTPUT = '/private/tmp/claude-501/project/session/tasks/b1a2c3.output';
const ATTENDED_ENV = Object.freeze({ PATH: process.env.PATH });
const UNATTENDED_ENV = Object.freeze({ PATH: process.env.PATH, HARNESS_UNATTENDED: '1' });

function runHook(filePath, env) {
  const input = JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: filePath } });
  const result = spawnSync('bash', [hookPath], { input, encoding: 'utf8', env });
  assert.equal(result.status, 0);
  return result.stdout;
}

function denialReason(stdout) {
  const output = JSON.parse(stdout).hookSpecificOutput;
  assert.equal(output.hookEventName, 'PreToolUse');
  assert.equal(output.permissionDecision, 'deny');
  return output.permissionDecisionReason;
}

test('an attended session is told to wait for the completion notice', () => {
  const reason = denialReason(runHook(TASK_OUTPUT, ATTENDED_ENV));
  assert.match(reason, /^Task output files are not read directly\./);
  assert.match(reason, /Wait for the completion notice instead\.$/);
});

test('an unattended session is told to run the command in the foreground and never to end its turn', () => {
  const reason = denialReason(runHook(TASK_OUTPUT, UNATTENDED_ENV));
  assert.match(reason, /^Task output files are not read directly\./);
  assert.match(reason, /in the foreground with a long timeout/);
  assert.match(reason, /Do not end your turn/);
  assert.doesNotMatch(reason, /Wait for the completion notice/);
});

test('only the value 1 marks a session unattended', () => {
  for (const marker of ['', '0', 'true']) {
    const reason = denialReason(runHook(TASK_OUTPUT, { ...ATTENDED_ENV, HARNESS_UNATTENDED: marker }));
    assert.match(reason, /Wait for the completion notice instead\.$/);
  }
});

test('a file that is not a task output is left alone in both kinds of session', () => {
  for (const env of [ATTENDED_ENV, UNATTENDED_ENV]) {
    assert.equal(runHook('/Users/tester/project/src/app.py', env), '');
    assert.equal(runHook('/Users/tester/project/tasks/notes.md', env), '');
  }
});
