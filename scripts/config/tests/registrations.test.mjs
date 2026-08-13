import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONVERGE_ENTRY } from '../paths.mjs';
import {
  HOOK_EVENTS,
  executableRegistrations,
  isExecutableCommand,
  isHookEvent,
  namesModule,
} from '../registrations.mjs';
import { hookRegistrations } from '../validate.mjs';

const SHAPES = Object.freeze([
  ['a registration with no command at all', { SessionStart: [{ matcher: '*', hooks: [{}] }] }, 0],
  ['a null registration', { SessionStart: [{ matcher: '*', hooks: [null] }] }, 0],
  [
    'a registration whose command is empty',
    { SessionStart: [{ matcher: '*', hooks: [{ type: 'command', command: '' }] }] },
    0,
  ],
  [
    'a registration whose command is only whitespace',
    { SessionStart: [{ matcher: '*', hooks: [{ type: 'command', command: '   ' }] }] },
    0,
  ],
  ['a registration under a bogus event name', { S: [{ hooks: [{ command: 'true' }] }] }, 1],
  ['an empty hooks object', {}, 0],
  ['an event holding no matchers', { SessionStart: [] }, 0],
  ['a matcher holding no commands', { SessionStart: [{ matcher: '*', hooks: [] }] }, 0],
  ['a matcher whose hooks is not an array', { SessionStart: [{ matcher: '*', hooks: {} }] }, 0],
  ['an event whose value is not an array', { SessionStart: { matcher: '*' } }, 0],
  [
    'one executable registration beside three inert ones',
    {
      SessionStart: [
        { matcher: '*', hooks: [{}, null, { type: 'command', command: '' }] },
        { matcher: '*', hooks: [{ type: 'command', command: '$HOME/.claude/hooks/real.sh' }] },
      ],
    },
    1,
  ],
]);

test('the shared counter counts only registrations carrying a non-blank command', () => {
  for (const [label, hooks, expected] of SHAPES) {
    assert.equal(executableRegistrations(hooks).length, expected, `${label} must count ${expected}`);
  }
});

test('the shared counter agrees with the validator on every shape, so no gate can disagree about a registration', () => {
  for (const [label, hooks] of SHAPES) {
    assert.equal(
      executableRegistrations(hooks).length,
      hookRegistrations({ hooks }).length,
      `${label} must count the same for the manifest and the syntax gate`,
    );
  }
});

test('the counter reports the event each surviving registration belongs to', () => {
  const hooks = {
    PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: '$HOME/.claude/hooks/gate.sh' }] }],
    Stop: [{ matcher: '*', hooks: [{ type: 'command', command: 'node $HOME/.claude/local/converge.mjs --event Stop' }] }],
  };
  assert.deepEqual(
    executableRegistrations(hooks).map((registration) => registration.event).sort(),
    ['PreToolUse', 'Stop'],
  );
});

test('a hooks value that is not an object registers nothing rather than throwing', () => {
  for (const value of [null, undefined, [], 'hooks', 7]) {
    assert.deepEqual(executableRegistrations(value), [], `${JSON.stringify(value) ?? 'undefined'} registers nothing`);
  }
});

test('the event census names every event the tracked configuration uses and refuses an invented one', () => {
  for (const event of ['PreToolUse', 'PostToolUse', 'SessionStart', 'Stop', 'SubagentStop', 'Notification', 'UserPromptSubmit', 'PermissionDenied']) {
    assert.equal(isHookEvent(event), true, `${event} is fired by Claude Code and must be accepted`);
  }
  for (const event of ['S', 'sessionstart', 'PreToolUseX', '']) {
    assert.equal(isHookEvent(event), false, `${JSON.stringify(event)} is not an event and must not be accepted`);
  }
  assert.equal(HOOK_EVENTS.length, new Set(HOOK_EVENTS).size, 'the census must not name an event twice');
});

test('a command is executable only when it is a non-blank string', () => {
  for (const command of ['true', ' node x.mjs ']) assert.equal(isExecutableCommand(command), true);
  for (const command of ['', '   ', null, undefined, 7, {}, []]) {
    assert.equal(isExecutableCommand(command), false, `${JSON.stringify(command) ?? 'undefined'} is not a command`);
  }
});

test('module identity reads the invoked path, not the whole command string', () => {
  assert.equal(namesModule('node $HOME/.claude/local/converge.mjs --event Stop', CONVERGE_ENTRY), true);
  assert.equal(namesModule('node ~/.claude/local/converge.mjs', CONVERGE_ENTRY), true);
  assert.equal(namesModule('$HOME/.claude/local/converge.mjs', CONVERGE_ENTRY), true);
  assert.equal(namesModule('echo converge.mjs is not run here', CONVERGE_ENTRY), false);
  assert.equal(namesModule('node $HOME/.claude/local/promote.mjs', CONVERGE_ENTRY), false);
  assert.equal(namesModule('', CONVERGE_ENTRY), false);
});
