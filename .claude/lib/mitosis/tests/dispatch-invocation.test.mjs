import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { dispatch } from '../dispatch.mjs';
import {
  ARGV_ECHO_BODY,
  createScratch,
  envelopeText,
  fakeChild,
  stubEnv,
} from './dispatch-fixtures.mjs';

const { makeScratchDir: scratch, cleanup } = createScratch();

test('argv carries the base flags, every requested option, and the prompt as one shielded positional', async () => {
  const env = stubEnv(ARGV_ECHO_BODY, scratch);
  const schema = { type: 'object', properties: { status: { type: 'string' } } };
  const result = await dispatch({
    prompt: 'do the thing',
    agentType: 'implementer',
    model: 'opus',
    effort: 'high',
    schema,
    worktree: 'wt-a1',
  }, { env });
  const expected = [
    '-p', '--output-format', 'json',
    '--agent', 'implementer',
    '--model', 'opus',
    '--effort', 'high',
    '--json-schema', JSON.stringify(schema),
    '-w', 'wt-a1',
    '--', 'do the thing',
  ];
  assert.deepEqual(result.structured.argv, expected, 'the child must receive exactly the argv the adapter built');
});

test('argv omits every flag whose request field is absent', async () => {
  const env = stubEnv(ARGV_ECHO_BODY, scratch);
  const result = await dispatch({ prompt: 'bare run' }, { env });
  assert.deepEqual(result.structured.argv, ['-p', '--output-format', 'json', '--', 'bare run']);
});

test('a dash-leading prompt is shielded by -- and reaches the CLI as the positional prompt', async () => {
  const env = stubEnv(ARGV_ECHO_BODY, scratch);
  const prompt = '--dangerously-skip-permissions';
  const result = await dispatch({ prompt }, { env });
  const argv = result.structured.argv;
  const separator = argv.lastIndexOf('--');
  assert.notEqual(separator, -1, 'the adapter must emit an option terminator before the prompt');
  assert.equal(separator, argv.length - 2, 'the terminator must sit immediately before the positional prompt');
  assert.equal(argv.at(-1), prompt, 'the prompt must be the single trailing positional');
});

test('a prompt full of shell metacharacters arrives as ONE intact argument with no shell interpretation', async () => {
  const env = stubEnv(ARGV_ECHO_BODY, scratch);
  const probe = scratch();
  const redirected = join(probe, 'redirected.txt');
  const touched = join(probe, 'touched.txt');
  const prompt = `fix "it"; \`whoami\` $(id) > ${redirected}; touch ${touched}`;
  const result = await dispatch({ prompt }, { env });
  const argv = result.structured.argv;
  assert.deepEqual(argv, ['-p', '--output-format', 'json', '--', prompt]);
  assert.equal(argv.filter((token) => token === prompt).length, 1, 'the prompt must survive as exactly one argv token');
  assert.equal(argv.at(-1), prompt);
  assert.equal(existsSync(redirected), false, 'a shell redirection inside the prompt must never have been evaluated');
  assert.equal(existsSync(touched), false, 'a shell command inside the prompt must never have been evaluated');
});

test('the adapter never asks for a shell and never passes a command string', async () => {
  const calls = [];
  const spawnSpy = (command, args, options) => {
    calls.push({ command, args, options });
    const child = fakeChild(undefined);
    setImmediate(() => {
      child.stdout.end(envelopeText({ structured_output: { status: 'done' } }));
      child.stderr.end();
      child.emit('exit', 0, null);
    });
    return child;
  };
  const result = await dispatch({ prompt: 'rm -rf /tmp/nothing; echo hi' }, { spawn: spawnSpy, schema: undefined });
  assert.equal(result.ok, true, `expected ok, got ${result.outcome}: ${result.error}`);
  assert.equal(calls.length, 1);
  assert.notEqual(calls[0].options.shell, true, 'shell: true would let a prompt break out of its argv slot');
  assert.equal(Array.isArray(calls[0].args), true, 'a command string instead of an argv array would re-enable shell parsing');
  assert.equal(calls[0].command, 'claude');
});

test('the child runs in the requested cwd', async () => {
  const env = stubEnv(ARGV_ECHO_BODY, scratch);
  const where = scratch();
  const result = await dispatch({ prompt: 'where am i', cwd: where }, { env });
  assert.equal(result.structured.cwd, realpathSync(where));
});

test('a claude binary missing from PATH is a spawn failure, never a success', async () => {
  const result = await dispatch({ prompt: 'x' }, { env: { ...process.env, PATH: scratch() } });
  assert.equal(result.ok, false);
  assert.equal(result.outcome, 'spawn-failed');
  assert.match(result.error, /ENOENT/);
});

test('a spawn function that throws is reported as a spawn failure rather than escaping to the caller', async () => {
  const result = await dispatch({ prompt: 'x' }, {
    spawn: () => {
      throw new Error('EMFILE: too many open files');
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.outcome, 'spawn-failed');
  assert.match(result.error, /EMFILE/);
});

test('the reported argv is redacted and carries neither the prompt nor the schema text', async () => {
  const env = stubEnv(ARGV_ECHO_BODY, scratch);
  const schema = { type: 'object', properties: { secretField: { type: 'string' } } };
  const prompt = 'SENSITIVE-REPO-CONTENT and prior model output';
  const result = await dispatch({ prompt, agentType: 'implementer', schema }, { env });
  assert.deepEqual(result.argv, [
    '-p', '--output-format', 'json',
    '--agent', 'implementer',
    '--json-schema', `<schema:${JSON.stringify(schema).length} chars>`,
    '--', `<prompt:${prompt.length} chars>`,
  ]);
  const joined = result.argv.join(' ');
  assert.equal(joined.includes('SENSITIVE-REPO-CONTENT'), false, 'a logged argv must never carry the prompt');
  assert.equal(joined.includes('secretField'), false, 'a logged argv must never carry the schema text');
  assert.deepEqual(result.structured.argv.at(-1), prompt, 'the child still receives the real prompt');
});

test('deps.exposeArgv is the explicit opt-in that returns the exact argv for replay', async () => {
  const env = stubEnv(ARGV_ECHO_BODY, scratch);
  const result = await dispatch({ prompt: 'replay me' }, { env, exposeArgv: true });
  assert.deepEqual(result.argv, ['-p', '--output-format', 'json', '--', 'replay me']);
  assert.deepEqual(result.argv, result.structured.argv);
});

after(cleanup);
