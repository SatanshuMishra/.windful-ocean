import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const hookPath = fileURLToPath(new URL('../deny-hold-loop.sh', import.meta.url));

const HOLD_LOOP = 'until test -f done.txt; do sleep 5; done';
const ATTENDED_ENV = Object.freeze({ PATH: process.env.PATH });
const UNATTENDED_ENV = Object.freeze({ PATH: process.env.PATH, HARNESS_UNATTENDED: '1' });

function runHook(command, env) {
  const input = JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } });
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

test('an attended session is told to end its turn instead of holding it open', () => {
  const reason = denialReason(runHook(HOLD_LOOP, ATTENDED_ENV));
  assert.match(reason, /^Hold loops are denied\./);
  assert.match(reason, /End your turn instead of holding it open\.$/);
});

test('an unattended session is told to run the command in the foreground and never to end its turn', () => {
  const reason = denialReason(runHook(HOLD_LOOP, UNATTENDED_ENV));
  assert.match(reason, /^Hold loops are denied\./);
  assert.match(reason, /in the foreground with a long timeout/);
  assert.match(reason, /Do not end your turn/);
  assert.doesNotMatch(reason, /End your turn instead/);
});

test('only the value 1 marks a session unattended', () => {
  for (const marker of ['', '0', 'true']) {
    const reason = denialReason(runHook(HOLD_LOOP, { ...ATTENDED_ENV, HARNESS_UNATTENDED: marker }));
    assert.match(reason, /End your turn instead of holding it open\.$/);
  }
});

test('a command that holds no loop is left alone in both kinds of session', () => {
  for (const env of [ATTENDED_ENV, UNATTENDED_ENV]) {
    assert.equal(runHook('npm test', env), '');
    assert.equal(runHook('sleep 2', env), '');
  }
});
