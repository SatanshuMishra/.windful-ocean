import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const analyzerPath = fileURLToPath(new URL('../agent-ledger/agent-run-analyzer.mjs', import.meta.url));

const MARKER = 'CAPABILITY-' + 'BLOCKED:';

function workspace() {
  return mkdtempSync(join(tmpdir(), 'agent-run-analyzer-'));
}

function writeTranscript(dir, name, messages) {
  const file = join(dir, name);
  writeFileSync(file, messages.map((m) => JSON.stringify(m)).join('\n') + '\n');
  return file;
}

function assistantText(text) {
  return { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } };
}

function assistantToolUse(name, input, usage) {
  const message = { role: 'assistant', content: [{ type: 'tool_use', name, input }] };
  if (usage) message.usage = usage;
  return { type: 'assistant', message };
}

function relayAsString(text) {
  return { type: 'user', message: { role: 'user', content: text } };
}

function relayAsToolResult(text) {
  return {
    type: 'user',
    message: { role: 'user', content: [{ type: 'tool_result', content: [{ type: 'text', text }] }] },
  };
}

function runAnalyzer(payload) {
  const ledgerDir = mkdtempSync(join(tmpdir(), 'agent-ledger-'));
  const result = spawnSync(process.execPath, [analyzerPath], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, AGENT_LEDGER_DIR: ledgerDir, AGENT_LEDGER_SUPPRESS: '' },
  });
  const day = new Date().toISOString().slice(0, 10);
  const file = join(ledgerDir, 'events', day + '.jsonl');
  const events = existsSync(file)
    ? readFileSync(file, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l))
    : [];
  return { result, events };
}

function blockedEvents(events) {
  return events.filter((e) => e.type === 'capability_blocked');
}

function runEvents(events) {
  return events.filter((e) => e.type === 'agent_run');
}

function subagentStop(dir, { finalText, parentMessages = [], includeLastAssistantMessage = true }) {
  const agentFile = writeTranscript(dir, 'agent-a1b2c3d4e5f60718a.jsonl', [
    { type: 'user', message: { role: 'user', content: 'do the task' } },
    assistantToolUse('Read', { file_path: '/x.txt' }, { input_tokens: 10, output_tokens: 5 }),
    assistantText(finalText),
  ]);
  const parentFile = writeTranscript(dir, 'parent-session.jsonl', parentMessages);
  const payload = {
    hook_event_name: 'SubagentStop',
    session_id: 's-1',
    cwd: '/repo',
    agent_id: 'a1b2c3d4e5f60718a',
    agent_type: 'implementer',
    transcript_path: parentFile,
    agent_transcript_path: agentFile,
  };
  if (includeLastAssistantMessage) payload.last_assistant_message = finalText;
  return payload;
}

test('genuine emission in the subagent final output records exactly one capability_blocked', () => {
  const dir = workspace();
  const finalText = `Summary of work.\n\n${MARKER} needed=Bash task=run the migration script`;
  const { result, events } = runAnalyzer(subagentStop(dir, { finalText }));

  assert.equal(result.status, 0);
  const blocked = blockedEvents(events);
  assert.equal(blocked.length, 1);
  assert.equal(blocked[0].needed, 'Bash');
  assert.equal(blocked[0].task_excerpt, 'run the migration script');
  assert.equal(blocked[0].agent_type, 'implementer');
});

test('multi-word and parenthesised capability descriptions are captured whole', () => {
  const cases = [
    ['Bash (or another script-execution tool)', 'execute the probe'],
    ['network egress + read access to ~/.config/gh', 'query the api'],
    ['filesystem-delete (or `git rm`)', 'remove the stale worktree'],
  ];
  for (const [needed, task] of cases) {
    const dir = workspace();
    const finalText = `Done.\n\n${MARKER} needed=${needed} task=${task}`;
    const { events } = runAnalyzer(subagentStop(dir, { finalText }));
    const blocked = blockedEvents(events);
    assert.equal(blocked.length, 1, `expected one event for needed=${needed}`);
    assert.equal(blocked[0].needed, needed);
    assert.equal(blocked[0].task_excerpt, task);
  }
});

test('needed stops at the first task= even when the description contains a later task=', () => {
  const dir = workspace();
  const finalText = `${MARKER} needed=Edit permission task=update task=graph fixtures`;
  const { events } = runAnalyzer(subagentStop(dir, { finalText }));
  const blocked = blockedEvents(events);
  assert.equal(blocked.length, 1);
  assert.equal(blocked[0].needed, 'Edit permission');
  assert.equal(blocked[0].task_excerpt, 'update task=graph fixtures');
});

test('a marker relayed into the parent transcript as a string does not add a second event', () => {
  const dir = workspace();
  const finalText = `${MARKER} needed=Write task=create the migration file`;
  const payload = subagentStop(dir, {
    finalText,
    parentMessages: [assistantText('dispatching'), relayAsString(finalText)],
  });
  const { events } = runAnalyzer(payload);
  assert.equal(blockedEvents(events).length, 1);
});

test('a marker relayed into the parent transcript as a tool_result does not add a second event', () => {
  const dir = workspace();
  const finalText = `${MARKER} needed=Write task=create the migration file`;
  const payload = subagentStop(dir, {
    finalText,
    parentMessages: [assistantText('dispatching'), relayAsToolResult(finalText)],
  });
  const { events } = runAnalyzer(payload);
  assert.equal(blockedEvents(events).length, 1);
});

test('an unblocked run records nothing even when earlier runs left markers in the parent transcript', () => {
  const dir = workspace();
  const earlier = `${MARKER} needed=Bash task=an earlier agent was blocked`;
  const payload = subagentStop(dir, {
    finalText: 'I completed the task with no blockers.',
    parentMessages: [
      assistantText(earlier),
      relayAsToolResult(earlier),
      relayAsString(earlier),
    ],
  });
  const { events } = runAnalyzer(payload);
  assert.equal(blockedEvents(events).length, 0);
  assert.equal(runEvents(events).length, 1);
});

test('the subagent transcript is used when last_assistant_message is absent', () => {
  const dir = workspace();
  const finalText = `${MARKER} needed=serena activate_project task=index the repository`;
  const payload = subagentStop(dir, { finalText, includeLastAssistantMessage: false });
  const { events } = runAnalyzer(payload);
  const blocked = blockedEvents(events);
  assert.equal(blocked.length, 1);
  assert.equal(blocked[0].needed, 'serena activate_project');
});

test('quoting the marker convention verbatim records nothing', () => {
  const dir = workspace();
  const finalText = `The rule reads \`${MARKER} needed=<tool-or-capability> task=<short description>\`.`;
  const { events } = runAnalyzer(subagentStop(dir, { finalText }));
  assert.equal(blockedEvents(events).length, 0);
});

test('agent_run statistics are still derived from the parent transcript', () => {
  const dir = workspace();
  const parentMessages = [
    assistantToolUse('Read', { file_path: '/a.txt' }, { input_tokens: 10, output_tokens: 5 }),
    assistantToolUse('Read', { file_path: '/a.txt' }),
  ];
  const payload = subagentStop(dir, { finalText: 'all done', parentMessages });
  const { events } = runAnalyzer(payload);
  const runs = runEvents(events);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].tool_calls_total, 2);
  assert.equal(runs[0].duplicate_tool_calls, 1);
  assert.equal(runs[0].redundant_reads, 1);
  assert.equal(runs[0].tokens, 15);
  assert.equal(runs[0].transcript_ptr, payload.transcript_path);
});

test('malformed and missing inputs record an agent_run and never throw', () => {
  const dir = workspace();
  const badFile = join(dir, 'broken.jsonl');
  writeFileSync(badFile, 'not json\n{"message":{"content":42}}\n{"message":null}\n');
  const cases = [
    { session_id: 's', cwd: '/r', transcript_path: badFile, agent_transcript_path: join(dir, 'nope.jsonl') },
    { session_id: 's', cwd: '/r', transcript_path: join(dir, 'missing.jsonl') },
    { session_id: 's', cwd: '/r', transcript_path: badFile, last_assistant_message: 12345 },
    { session_id: 's', cwd: '/r', transcript_path: badFile, agent_transcript_path: dir },
    {},
  ];
  for (const payload of cases) {
    const { result, events } = runAnalyzer(payload);
    assert.equal(result.status, 0, `payload crashed: ${JSON.stringify(payload)}`);
    assert.equal(result.stderr, '');
    assert.equal(runEvents(events).length, 1);
    assert.equal(blockedEvents(events).length, 0);
  }
});

test('a directory-shaped subagent transcript path degrades to recording nothing', () => {
  const dir = workspace();
  const nested = join(dir, 'subagents');
  mkdirSync(nested, { recursive: true });
  const payload = subagentStop(dir, { finalText: 'done', includeLastAssistantMessage: false });
  payload.agent_transcript_path = nested;
  const { result, events } = runAnalyzer(payload);
  assert.equal(result.status, 0);
  assert.equal(blockedEvents(events).length, 0);
  assert.equal(runEvents(events).length, 1);
});
