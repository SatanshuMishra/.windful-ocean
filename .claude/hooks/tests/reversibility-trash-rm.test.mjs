import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, statSync, existsSync, rmSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rewriteRm } from '../../lib/reversibility/rm-rewrite.mjs';
import { loadConfig } from '../../lib/reversibility/config.mjs';

const hookPath = fileURLToPath(new URL('../trash-rm.mjs', import.meta.url));
const scratch = [];

function disposable(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratch.push(dir);
  return dir;
}

process.on('exit', () => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

const config = loadConfig(process.env);

function rewrite(command) {
  return rewriteRm(command, config);
}

test('a plain rm is rewritten to the trash binary', () => {
  const result = rewrite('rm /tmp/example.txt');
  assert.equal(result.rewritten, '/usr/bin/trash /tmp/example.txt');
});

test('rm flags are stripped, since the trash binary does not accept them', () => {
  assert.equal(rewrite('rm -rf /tmp/dir').rewritten, '/usr/bin/trash /tmp/dir');
  assert.equal(rewrite('rm -f /tmp/a').rewritten, '/usr/bin/trash /tmp/a');
  assert.equal(rewrite('rm --recursive --force /tmp/dir').rewritten, '/usr/bin/trash /tmp/dir');
});

test('operand text is preserved verbatim, quoting and globs included', () => {
  assert.equal(rewrite("rm '/tmp/a b.txt'").rewritten, "/usr/bin/trash '/tmp/a b.txt'");
  assert.equal(rewrite('rm "/tmp/a b.txt"').rewritten, '/usr/bin/trash "/tmp/a b.txt"');
  assert.equal(rewrite('rm -rf /tmp/logs/*.log').rewritten, '/usr/bin/trash /tmp/logs/*.log');
});

test('multiple operands are all preserved', () => {
  assert.equal(rewrite('rm -f a.txt b.txt c.txt').rewritten, '/usr/bin/trash a.txt b.txt c.txt');
});

test('an absolute rm path is rewritten too', () => {
  assert.equal(rewrite('/bin/rm -rf /tmp/dir').rewritten, '/usr/bin/trash /tmp/dir');
});

test('commands that are not a single rm invocation are left alone', () => {
  const untouched = [
    'ls -la',
    'rm -rf /tmp/a && echo done',
    'rm -rf /tmp/a; echo done',
    'echo hi | rm -rf /tmp/a',
    'sudo rm -rf /tmp/a',
    'rm -rf $(cat targets.txt)',
    'rm -rf `cat targets.txt`',
    'git rm --cached file.txt',
    'rm',
    'rm -rf',
    'rm --unknown-flag /tmp/a',
    'rm -- -weird-name',
    'rm -rf /tmp/a > /dev/null',
  ];
  for (const command of untouched) {
    assert.equal(rewrite(command).rewritten, null, `expected no rewrite for: ${command}`);
  }
});

function runHook(payload) {
  return spawnSync(process.execPath, [hookPath], { input: JSON.stringify(payload), encoding: 'utf8' });
}

function bashPayload(command) {
  return { hook_event_name: 'PreToolUse', tool_name: 'Bash', cwd: tmpdir(), tool_input: { command } };
}

test('the hook emits updatedInput without a permission decision, so it never bypasses the permission pipeline', () => {
  const result = runHook(bashPayload('rm -rf /tmp/example'));
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(output.hookSpecificOutput.updatedInput.command, '/usr/bin/trash /tmp/example');
  assert.equal(output.hookSpecificOutput.permissionDecision, undefined);
});

test('the hook stays silent for commands it does not rewrite', () => {
  const result = runHook(bashPayload('ls -la'));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '');
});

test('the hook does not block the tool call on an unparseable payload', () => {
  const result = spawnSync(process.execPath, [hookPath], { input: 'not-json', encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '');
});

test('the hook preserves every other field of the tool input', () => {
  const payload = bashPayload('rm /tmp/example');
  payload.tool_input.description = 'remove the example';
  payload.tool_input.timeout = 5000;
  const output = JSON.parse(runHook(payload).stdout);
  assert.equal(output.hookSpecificOutput.updatedInput.description, 'remove the example');
  assert.equal(output.hookSpecificOutput.updatedInput.timeout, 5000);
});

test('the rewritten command recovers the file into the Trash, verified by stat on the exact path', () => {
  const dir = disposable('reversibility-trash-');
  const name = `reversibility-recoverable-${process.pid}-${Date.now()}.txt`;
  const source = join(dir, name);
  writeFileSync(source, 'recoverable payload\n');

  const output = JSON.parse(runHook(bashPayload(`rm -f ${source}`)).stdout);
  const rewritten = output.hookSpecificOutput.updatedInput.command;
  assert.equal(rewritten, `/usr/bin/trash ${source}`);

  const run = spawnSync('/bin/sh', ['-c', rewritten], { encoding: 'utf8' });
  if (run.status !== 0) {
    assert.equal(existsSync(source), true, 'a trash the sandbox denies must leave the file in place, never destroy it');
    return;
  }
  assert.equal(existsSync(source), false);

  const recovered = join(homedir(), '.Trash', name);
  const stats = statSync(recovered);
  assert.equal(stats.isFile(), true);
  assert.equal(stats.size, 'recoverable payload\n'.length);
});

test('the rewritten command recovers a directory the same way', () => {
  const dir = disposable('reversibility-trash-dir-');
  const name = `reversibility-recoverable-dir-${process.pid}-${Date.now()}`;
  const target = join(dir, name);
  mkdirSync(target);
  writeFileSync(join(target, 'inside.txt'), 'inside\n');

  const output = JSON.parse(runHook(bashPayload(`rm -rf ${target}`)).stdout);
  const run = spawnSync('/bin/sh', ['-c', output.hookSpecificOutput.updatedInput.command], { encoding: 'utf8' });
  if (run.status !== 0) {
    assert.equal(existsSync(join(target, 'inside.txt')), true, 'a trash the sandbox denies must leave the directory in place');
    return;
  }
  assert.equal(existsSync(target), false);

  const recovered = join(homedir(), '.Trash', name, 'inside.txt');
  assert.equal(statSync(recovered).isFile(), true);
});
