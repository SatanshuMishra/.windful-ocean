import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const hooksRoot = join(repoRoot, '.claude', 'hooks');
const settingsPath = join(repoRoot, '.claude', 'settings.json');
const retiredWriter = 'agent-ledger/agent-run-analyzer.mjs';
const COMMAND_SHAPE = /^node \$HOME\/\.claude\/hooks\/([A-Za-z0-9._\-/]+\.mjs)$/;
const SUBAGENT_EVENTS = ['SubagentStart', 'SubagentStop'];

const REAL_SESSION_ID = '13844808-040d-4017-be3a-96a7b1261251';
const REAL_AGENT_ID = 'abd2f8d303e38490a';
const REAL_PARENT_AGENT_ID = 'abbbe67bbe54b43b9';
const REAL_AGENT_TYPE = 'general-purpose';

function readSettings() {
  return JSON.parse(readFileSync(settingsPath, 'utf8'));
}

function registeredCommands(hooks, event) {
  return (hooks[event] ?? []).flatMap((block) => block.hooks ?? []).map((entry) => entry.command);
}

function allRegisteredCommands(hooks) {
  return Object.keys(hooks).flatMap((event) => registeredCommands(hooks, event).map((command) => ({ event, command })));
}

function resolveHookCommand(event, command) {
  const matched = COMMAND_SHAPE.exec(command);
  assert.ok(
    matched,
    `${event} registers a command this census cannot classify, so it cannot prove what that command writes: ${command}`,
  );
  return join(hooksRoot, matched[1]);
}

function workspace(label) {
  return mkdtempSync(join(tmpdir(), `sole-writer-${label}-`));
}

function plantRealTranscripts(dir) {
  const projects = join(dir, 'projects', '-Users-synthetic-DevLabs-example');
  const sessionDir = join(projects, REAL_SESSION_ID);
  const sidecarDir = join(sessionDir, 'subagents');
  mkdirSync(sidecarDir, { recursive: true });

  const parentTranscript = join(projects, `${REAL_SESSION_ID}.jsonl`);
  writeFileSync(
    parentTranscript,
    JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'dispatching' }] } }) + '\n',
  );

  const agentTranscript = join(sidecarDir, `agent-${REAL_AGENT_ID}.jsonl`);
  writeFileSync(
    agentTranscript,
    JSON.stringify({ type: 'user', message: { role: 'user', content: 'compare the two case lists' } }) + '\n' +
      JSON.stringify({
        type: 'assistant',
        message: { role: 'assistant', content: [{ type: 'text', text: 'OLD=11 COVERED=6 PARTIAL=3 NOT-COVERED=2' }] },
      }) + '\n',
  );

  writeFileSync(
    join(sidecarDir, `agent-${REAL_AGENT_ID}.meta.json`),
    JSON.stringify({ agentType: REAL_AGENT_TYPE, parentAgentId: REAL_PARENT_AGENT_ID, spawnDepth: 2 }),
  );

  return { parentTranscript, agentTranscript };
}

function realPayload(event, dir) {
  const { parentTranscript, agentTranscript } = plantRealTranscripts(dir);
  const payload = {
    hook_event_name: event,
    session_id: REAL_SESSION_ID,
    cwd: dirname(dir),
    agent_id: REAL_AGENT_ID,
    agent_type: REAL_AGENT_TYPE,
    transcript_path: parentTranscript,
  };
  if (event !== 'SubagentStop') return payload;
  return {
    ...payload,
    agent_transcript_path: agentTranscript,
    last_assistant_message: 'OLD=11 COVERED=6 PARTIAL=3 NOT-COVERED=2',
  };
}

function observerRows(observerDir) {
  const eventsDir = join(observerDir, 'events');
  if (!existsSync(eventsDir)) return [];
  return readdirSync(eventsDir)
    .filter((name) => name.endsWith('.jsonl'))
    .sort()
    .flatMap((name) => {
      const raw = readFileSync(join(eventsDir, name), 'utf8');
      assert.ok(!raw || raw.endsWith('\n'), `${name} ends mid-line`);
      return raw.split('\n').filter((line) => line.length).map((line) => JSON.parse(line));
    });
}

function fireEvent(event) {
  const hooks = readSettings().hooks;
  const commands = registeredCommands(hooks, event);
  assert.ok(commands.length > 0, `${event} has no registered hook, so subagent observation would have no writer at all`);

  const dir = workspace(event.toLowerCase());
  const observerDir = workspace(`${event.toLowerCase()}-observer`);
  const ledgerDir = workspace(`${event.toLowerCase()}-ledger`);
  const payload = realPayload(event, dir);

  const ran = commands.map((command) => {
    const script = resolveHookCommand(event, command);
    assert.ok(existsSync(script), `${event} registers ${command} but ${script} does not exist in this checkout`);
    const result = spawnSync(process.execPath, [script], {
      input: JSON.stringify(payload),
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_OBSERVER_DIR: observerDir, AGENT_LEDGER_DIR: ledgerDir },
    });
    assert.equal(result.status, 0, `${command} exited ${result.status}: ${result.stderr}`);
    return command;
  });

  return { ran, payload, rows: observerRows(observerDir), ledgerEntries: readdirSync(ledgerDir) };
}

test('every registered subagent hook command is classifiable and present in this checkout', () => {
  const hooks = readSettings().hooks;
  for (const event of SUBAGENT_EVENTS) {
    const commands = registeredCommands(hooks, event);
    assert.ok(commands.length > 0, `${event} registers no hook`);
    for (const command of commands) {
      const script = resolveHookCommand(event, command);
      assert.ok(existsSync(script), `${event} registers ${command} but ${script} is missing`);
    }
  }
});

test('the retired analyzer is named by no hook registration and is absent from the checkout', () => {
  const naming = allRegisteredCommands(readSettings().hooks).filter((entry) => entry.command.includes(retiredWriter));
  assert.deepEqual(
    naming,
    [],
    `the retired writer is still registered on ${naming.map((entry) => entry.event).join(', ')}`,
  );
  assert.equal(
    existsSync(join(hooksRoot, retiredWriter)),
    false,
    `the retired writer still exists at ${join(hooksRoot, retiredWriter)}`,
  );
});

test('a real stop payload reaches the new log and leaves the retired ledger root empty', () => {
  const { rows, ledgerEntries, payload } = fireEvent('SubagentStop');

  const mine = rows.filter((row) => row.agent_id === payload.agent_id && row.event === 'SubagentStop');
  assert.equal(mine.length, 1, 'the new observer log must receive exactly one stop row for the dispatch');
  assert.equal(mine[0].agent_type, REAL_AGENT_TYPE);
  assert.equal(mine[0].parent_agent_id, REAL_PARENT_AGENT_ID);
  assert.equal(mine[0].depth, 2);

  assert.deepEqual(
    ledgerEntries,
    [],
    `the retired ledger root received ${ledgerEntries.join(', ')}, so the new observer is not the sole writer`,
  );
});

test('a real start payload reaches the new log and leaves the retired ledger root empty', () => {
  const { rows, ledgerEntries, payload } = fireEvent('SubagentStart');

  const mine = rows.filter((row) => row.agent_id === payload.agent_id && row.event === 'SubagentStart');
  assert.equal(mine.length, 1, 'the new observer log must receive exactly one start row for the dispatch');
  assert.equal(mine[0].agent_transcript_path, null);

  assert.deepEqual(
    ledgerEntries,
    [],
    `the retired ledger root received ${ledgerEntries.join(', ')}, so the new observer is not the sole writer`,
  );
});
