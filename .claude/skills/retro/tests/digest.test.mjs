import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../digest.mjs', import.meta.url));
const SESSION = '11111111-2222-3333-4444-555555555555';

function assistant(...uses) {
  return { type: 'assistant', message: { content: uses.map(([id, name, input]) => ({ type: 'tool_use', id, name, input })) } };
}

function result(id, content, isError = true) {
  return { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, is_error: isError, content }] } };
}

function said(text) {
  return { type: 'user', message: { content: text } };
}

function jsonl(entries) {
  return `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`;
}

function fixtureHome() {
  const home = mkdtempSync(join(tmpdir(), 'retro-digest-'));
  const project = join(home, '.claude', 'projects', '-repo');
  mkdirSync(join(project, SESSION, 'subagents'), { recursive: true });
  writeFileSync(join(project, `${SESSION}.jsonl`), jsonl([
    said('fix the login bug'),
    assistant(['t1', 'Bash', { command: 'gh pr merge 4' }]),
    result('t1', 'PreToolUse:Bash hook error: merging a PR is human-gated'),
    assistant(['t2', 'Bash', { command: 'rm -rf build' }]),
    result('t2', 'Permission for this action was denied by the Claude Code auto mode classifier.'),
    assistant(['t3', 'Bash', { command: 'cat lock' }]),
    result('t3', 'Exit code 1\nopen: EACCES: permission denied'),
    assistant(['t4', 'Read', { file_path: '/repo/a.ts' }]),
    result('t4', 'x'.repeat(25000), false),
    assistant(['t5', 'Read', { file_path: '/repo/a.ts' }]),
    result('t5', 'short', false),
    assistant(['t6', 'Agent', { subagent_type: 'general-purpose', description: 'search the repo' }], ['t7', 'Agent', { subagent_type: 'code-reviewer', description: 'review' }]),
    said('<task-notification>done</task-notification>'),
    said('Stop hook feedback: tests were not run'),
    said('[Request interrupted by user]'),
    said('use the reviewer next time'),
    { type: 'user', isMeta: true, message: { content: 'meta reminder' } },
  ]));
  writeFileSync(join(project, SESSION, 'subagents', 'agent-a1.jsonl'), jsonl([
    said('You review the diff in /repo'),
    assistant(['s1', 'Grep', { pattern: 'x' }]),
    result('s1', 'Exit code 2\nugrep: error'),
  ]));
  return { home, transcript: join(project, `${SESSION}.jsonl`) };
}

function run(args, env, script = SCRIPT) {
  const outcome = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
  return { status: outcome.status, stderr: outcome.stderr, digest: outcome.status === 0 ? JSON.parse(outcome.stdout) : null };
}

test('the digest classifies every kind of friction in the session and its subagents', () => {
  const { home } = fixtureHome();
  const { status, digest } = run([SESSION], { HOME: home });
  assert.equal(status, 0);
  assert.deepEqual(
    digest.friction.map(({ kind, source, tool }) => [kind, source, tool]),
    [
      ['hook_block', 'main', 'Bash'],
      ['permission_denied', 'main', 'Bash'],
      ['tool_error', 'main', 'Bash'],
      ['hook_feedback', 'main', 'Stop'],
      ['interrupt', 'main', null],
      ['tool_error', 'agent-a1', 'Grep'],
    ],
  );
});

test('human messages come from the main transcript only, without automated or meta entries', () => {
  const { home } = fixtureHome();
  const { digest } = run([SESSION], { HOME: home });
  assert.deepEqual(digest.humanMessages.map(({ excerpt }) => excerpt), ['fix the login bug', 'use the reviewer next time']);
});

test('the digest reports repeated calls, large results, fallback dispatches and tool counts', () => {
  const { home } = fixtureHome();
  const { digest } = run([SESSION], { HOME: home });
  assert.deepEqual(digest.repeatedCalls.map(({ tool, count }) => [tool, count]), [['Read', 2]]);
  assert.equal(digest.largeResultCount, 1);
  assert.deepEqual(digest.largeResults.map(({ tool, chars }) => [tool, chars]), [['Read', 25000]]);
  assert.deepEqual(digest.fallbackDispatches.map(({ subagent_type, description }) => [subagent_type, description]), [['general-purpose', 'search the repo']]);
  assert.deepEqual(digest.toolCalls, { Bash: 3, Read: 2, Agent: 2, Grep: 1 });
});

test('the transcript resolves from a path, a session id or the current session', () => {
  const { home, transcript } = fixtureHome();
  assert.equal(run([transcript], { HOME: home }).digest.transcript, transcript);
  assert.equal(run([SESSION], { HOME: home }).digest.transcript, transcript);
  assert.equal(run([], { HOME: home, CLAUDE_CODE_SESSION_ID: SESSION }).digest.transcript, transcript);
});

test('an unresolvable transcript exits 2 and names what is missing', () => {
  const { home } = fixtureHome();
  const missingPath = run([join(home, 'gone.jsonl')], { HOME: home });
  assert.equal(missingPath.status, 2);
  assert.match(missingPath.stderr, /no transcript at .*gone\.jsonl/);
  const unknownId = run(['nope'], { HOME: home });
  assert.equal(unknownId.status, 2);
  assert.match(unknownId.stderr, /no transcript named nope\.jsonl/);
  const noSession = run([], { HOME: home, CLAUDE_CODE_SESSION_ID: '' });
  assert.equal(noSession.status, 2);
  assert.match(noSession.stderr, /CLAUDE_CODE_SESSION_ID is unset/);
});

test('the digest runs when invoked through a symlinked skills directory', () => {
  const { home, transcript } = fixtureHome();
  const linked = join(home, 'skills');
  symlinkSync(dirname(dirname(SCRIPT)), linked);
  const outcome = run([SESSION], { HOME: home }, join(linked, 'retro', 'digest.mjs'));
  assert.equal(outcome.status, 0);
  assert.equal(outcome.digest?.transcript, transcript);
});
