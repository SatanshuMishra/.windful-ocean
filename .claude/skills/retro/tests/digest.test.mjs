import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../digest.mjs', import.meta.url));
const SESSION = '11111111-2222-3333-4444-555555555555';
const BARE_SESSION = '66666666-7777-8888-9999-000000000000';

function assistant(...uses) {
  return { type: 'assistant', message: { content: uses.map(([id, name, input]) => ({ type: 'tool_use', id, name, input })) } };
}

function result(id, content, fields = {}, isError = true) {
  return { type: 'user', ...fields, message: { content: [{ type: 'tool_result', tool_use_id: id, is_error: isError, content }] } };
}

function said(text) {
  return { type: 'user', message: { content: text } };
}

function jsonl(entries) {
  return `${entries.map((entry) => (typeof entry === 'string' ? entry : JSON.stringify(entry))).join('\n')}\n`;
}

const HOOK_REJECT = { toolDenialKind: 'permission-rule', permissionDecision: { decision: 'reject', source: 'hook', reasonType: 'hook' } };
const CONFIG_REJECT = { toolDenialKind: 'user-rejected', permissionDecision: { decision: 'reject', source: 'config' } };

const CASES = [
  ['PreToolUse:Bash hook error: merging a PR is human-gated', HOOK_REJECT, 'hook_block'],
  ['Pipeline run gate: this session holds no logbook thread', { permissionDecision: { decision: 'reject', source: 'hook' } }, 'hook_block'],
  ['PreToolUse:Skill hook error: Pipeline interphase gate', {}, 'hook_block'],
  ['This command requires approval', { toolDenialKind: 'user-rejected' }, 'permission_denied'],
  ['Claude requested permissions to write to /x, but you have not granted it yet.', CONFIG_REJECT, 'permission_denied'],
  ['Hold loops are denied. A subagent result is delivered to you automatically.', { toolDenialKind: 'permission-rule' }, 'permission_denied'],
  ['Permission for this action was denied by the Claude Code auto mode classifier.', {}, 'permission_denied'],
  ["The user doesn't want to proceed with this tool use. The tool use was rejected.", {}, 'permission_denied'],
  ['This Bash command contains multiple operations. The following part requires approval: gh repo view', {}, 'permission_denied'],
  ["A variable in this command can't be checked before it runs", {}, 'permission_denied'],
  ["ls in '/Users/x/VMLab' was blocked. For security, Claude Code may only list files in allowed directories.", {}, 'permission_denied'],
  ['Write to /x has been denied by your settings.', {}, 'permission_denied'],
  ['Exit code 1\nopen: EACCES: permission denied', {}, 'tool_error'],
];

function fixtureHome(t) {
  const home = mkdtempSync(join(tmpdir(), 'retro-digest-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const project = join(home, '.claude', 'projects', '-repo');
  mkdirSync(join(project, SESSION, 'subagents'), { recursive: true });
  writeFileSync(join(project, `${SESSION}.jsonl`), jsonl([
    said('fix the login bug'),
    ...CASES.flatMap(([text, fields], index) => [assistant([`c${index}`, 'Bash', { command: `step ${index}` }]), result(`c${index}`, text, fields)]),
    assistant(['t4', 'Read', { file_path: '/repo/a.ts' }]),
    result('t4', 'x'.repeat(25000), {}, false),
    assistant(['t5', 'Read', { file_path: '/repo/a.ts' }]),
    result('t5', 'short', {}, false),
    assistant(['t6', 'Agent', { subagent_type: 'general-purpose', description: 'search the repo' }], ['t7', 'Agent', { subagent_type: 'code-reviewer', description: 'review' }], ['t8', 'Task', { description: 'legacy dispatch' }]),
    '{"type":"user","message":',
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
  writeFileSync(join(project, `${BARE_SESSION}.jsonl`), jsonl([said('hello')]));
  return { home, project, transcript: join(project, `${SESSION}.jsonl`) };
}

function run(args, env, script = SCRIPT) {
  const outcome = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
  return { status: outcome.status, stderr: outcome.stderr, digest: outcome.status === 0 ? JSON.parse(outcome.stdout) : null };
}

test('every live form of hook block, permission denial and tool error is classified by what it is', (t) => {
  const { home } = fixtureHome(t);
  const { status, digest } = run([SESSION], { HOME: home });
  assert.equal(status, 0);
  const errors = digest.friction.filter(({ source, kind }) => source === 'main' && !['hook_feedback', 'interrupt'].includes(kind));
  assert.deepEqual(errors.map(({ kind, excerpt }) => [excerpt.slice(0, 40), kind]), CASES.map(([text, , kind]) => [text.replace(/\s+/g, ' ').slice(0, 40), kind]));
});

test('stop-hook feedback, interrupts and subagent errors are reported with their source', (t) => {
  const { home, transcript, project } = fixtureHome(t);
  const { digest } = run([SESSION], { HOME: home });
  assert.deepEqual(
    digest.friction.filter(({ kind, source }) => ['hook_feedback', 'interrupt'].includes(kind) || source !== 'main').map(({ kind, source, tool }) => [kind, source, tool]),
    [['hook_feedback', 'main', 'Stop'], ['interrupt', 'main', null], ['tool_error', 'agent-a1', 'Grep']],
  );
  assert.deepEqual(digest.files, { main: transcript, 'agent-a1': join(project, SESSION, 'subagents', 'agent-a1.jsonl') });
});

test('human messages come from the main transcript only, without automated or meta entries', (t) => {
  const { home } = fixtureHome(t);
  const { digest } = run([SESSION], { HOME: home });
  assert.deepEqual(digest.humanMessages.map(({ excerpt }) => excerpt), ['fix the login bug', 'use the reviewer next time']);
});

test('the digest reports repeated calls, large results, fallback dispatches, tool counts and unreadable lines', (t) => {
  const { home } = fixtureHome(t);
  const { digest } = run([SESSION], { HOME: home });
  assert.deepEqual(digest.repeatedCalls.map(({ tool, count }) => [tool, count]), [['Read', 2]]);
  assert.equal(digest.largeResultCount, 1);
  assert.deepEqual(digest.largeResults.map(({ tool, chars }) => [tool, chars]), [['Read', 25000]]);
  assert.deepEqual(
    digest.fallbackDispatches.map(({ subagent_type, description }) => [subagent_type, description]),
    [['general-purpose', 'search the repo'], ['general-purpose', 'legacy dispatch']],
  );
  assert.deepEqual(digest.toolCalls, { Bash: CASES.length, Read: 2, Agent: 2, Task: 1, Grep: 1 });
  assert.equal(digest.skippedLines.length, 1);
  assert.equal(digest.skippedLines[0].source, 'main');
});

test('a session without subagents digests its main transcript alone', (t) => {
  const { home, project } = fixtureHome(t);
  const { status, digest } = run([BARE_SESSION], { HOME: home });
  assert.equal(status, 0);
  assert.deepEqual(digest.files, { main: join(project, `${BARE_SESSION}.jsonl`) });
  assert.deepEqual(digest.humanMessages.map(({ excerpt }) => excerpt), ['hello']);
});

test('the transcript resolves from a path, a session id or the current session', (t) => {
  const { home, transcript } = fixtureHome(t);
  assert.equal(run([transcript], { HOME: home }).digest.transcript, transcript);
  assert.equal(run([SESSION], { HOME: home }).digest.transcript, transcript);
  assert.equal(run([], { HOME: home, CLAUDE_CODE_SESSION_ID: SESSION }).digest.transcript, transcript);
});

test('an unresolvable transcript exits 2 and names what is missing', (t) => {
  const { home, project } = fixtureHome(t);
  const missingPath = run([join(home, 'gone.jsonl')], { HOME: home });
  assert.equal(missingPath.status, 2);
  assert.match(missingPath.stderr, /no transcript file at .*gone\.jsonl/);
  const directory = run([project], { HOME: home });
  assert.equal(directory.status, 2);
  assert.match(directory.stderr, /no transcript file at /);
  const unknownId = run(['nope'], { HOME: home });
  assert.equal(unknownId.status, 2);
  assert.match(unknownId.stderr, /no transcript named nope\.jsonl/);
  const noSession = run([], { HOME: home, CLAUDE_CODE_SESSION_ID: '' });
  assert.equal(noSession.status, 2);
  assert.match(noSession.stderr, /CLAUDE_CODE_SESSION_ID is unset/);
});

test('the digest runs when invoked through a symlinked skills directory', (t) => {
  const { home, transcript } = fixtureHome(t);
  const linked = join(home, 'skills');
  symlinkSync(dirname(dirname(SCRIPT)), linked);
  const outcome = run([SESSION], { HOME: home }, join(linked, 'retro', 'digest.mjs'));
  assert.equal(outcome.status, 0);
  assert.equal(outcome.digest?.transcript, transcript);
});
