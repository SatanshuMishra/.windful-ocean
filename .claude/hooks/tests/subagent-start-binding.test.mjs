import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

const settingsPath = fileURLToPath(new URL('../../settings.json', import.meta.url));
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

const TEN_FIELDS = [
  'agent_id',
  'agent_transcript_path',
  'agent_type',
  'cwd',
  'depth',
  'event',
  'parent_agent_id',
  'session_id',
  'subject',
  'ts',
];

function readSettings() {
  return JSON.parse(readFileSync(settingsPath, 'utf8'));
}

function resolveBoundHook() {
  const blocks = readSettings().hooks.SubagentStart;
  assert.ok(Array.isArray(blocks), 'SubagentStart must be bound to exactly one hook block');
  assert.equal(blocks.length, 1, 'SubagentStart must be bound to exactly one hook block');
  const commands = blocks.flatMap((b) => b.hooks).map((h) => h.command);
  assert.equal(commands.length, 1);
  const parts = commands[0].split(/\s+/);
  assert.equal(parts.length, 2);
  assert.equal(parts[0], 'node');
  const marker = '.claude/hooks/';
  const idx = parts[1].indexOf(marker);
  assert.notEqual(idx, -1, 'the bound command must name a path under .claude/hooks/');
  const local = join(repoRoot, parts[1].slice(idx));
  assert.ok(existsSync(local), `the bound command names a missing entrypoint: ${local}`);
  return local;
}

function workspace(label) {
  return mkdtempSync(join(tmpdir(), 'observer-start-' + label + '-'));
}

function readRows(observerDir) {
  const eventsDir = join(observerDir, 'events');
  if (!existsSync(eventsDir)) return { lines: [], rows: [] };
  const files = readdirSync(eventsDir).filter((f) => f.endsWith('.jsonl')).sort();
  const lines = [];
  for (const f of files) {
    const raw = readFileSync(join(eventsDir, f), 'utf8');
    for (const line of raw.split('\n')) if (line.length) lines.push(line);
  }
  const rows = lines.map((line) => JSON.parse(line));
  return { lines, rows };
}

function plantSidecar(dir, sessionId, agentId, meta) {
  const transcriptPath = join(dir, sessionId + '.jsonl');
  writeFileSync(transcriptPath, '');
  const sidecar = join(dir, sessionId, 'subagents', 'agent-' + agentId + '.meta.json');
  mkdirSync(dirname(sidecar), { recursive: true });
  writeFileSync(sidecar, JSON.stringify(meta));
  return transcriptPath;
}

function startPayload(overrides) {
  return {
    hook_event_name: 'SubagentStart',
    session_id: '7f2c1d4e-0000-4000-8000-aaaaaaaaaaaa',
    transcript_path: '/nonexistent/projects/slug/7f2c1d4e-0000-4000-8000-aaaaaaaaaaaa.jsonl',
    cwd: '/Users/synthetic/DevLabs/example',
    agent_id: 'a1b2c3d4e5f60718',
    agent_type: 'unknown',
    ...overrides,
  };
}

function stopPayload(overrides) {
  return {
    hook_event_name: 'SubagentStop',
    session_id: '7f2c1d4e-0000-4000-8000-aaaaaaaaaaaa',
    transcript_path: '/nonexistent/projects/slug/7f2c1d4e-0000-4000-8000-aaaaaaaaaaaa.jsonl',
    cwd: '/Users/synthetic/DevLabs/example',
    agent_id: 'a1b2c3d4e5f60718',
    agent_type: 'unknown',
    agent_transcript_path:
      '/nonexistent/projects/slug/7f2c1d4e-0000-4000-8000-aaaaaaaaaaaa/subagents/agent-a1b2c3d4e5f60718.jsonl',
    ...overrides,
  };
}

function runHook(payload, observerDir) {
  const result = spawnSync(process.execPath, [resolveBoundHook()], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_OBSERVER_DIR: observerDir },
  });
  assert.equal(result.status, 0, `hook exited ${result.status}: ${result.stderr}`);
  return result;
}

test('the SubagentStart event is bound to the observer entrypoint for every subagent, asynchronously', () => {
  const blocks = readSettings().hooks.SubagentStart;
  assert.ok(Array.isArray(blocks));
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].matcher, '');
  assert.equal(blocks[0].hooks.length, 1);
  const hook = blocks[0].hooks[0];
  assert.equal(hook.type, 'command');
  assert.equal(hook.async, true);
  assert.ok(hook.command.startsWith('node '));
  assert.ok(hook.command.endsWith('.claude/hooks/observer/subagent-observer.mjs'));
  assert.ok(existsSync(resolveBoundHook()));
});

test('one dispatch through the bound entrypoint yields one start row and one stop row sharing an agent id, start at or before stop', () => {
  const observerDir = workspace('pairing');
  const dir = workspace('pairing-transcripts');
  const sessionId = '7f2c1d4e-0000-4000-8000-dddddddddddd';
  const agentId = 'a1b2c3d4e5f60718';
  const transcriptPath = plantSidecar(dir, sessionId, agentId, { agentType: 'implementer', spawnDepth: 1 });

  runHook(startPayload({ session_id: sessionId, transcript_path: transcriptPath, agent_id: agentId }), observerDir);
  runHook(
    stopPayload({
      session_id: sessionId,
      transcript_path: transcriptPath,
      agent_id: agentId,
      agent_transcript_path: join(dir, sessionId, 'subagents', 'agent-' + agentId + '.jsonl'),
    }),
    observerDir,
  );

  const { rows } = readRows(observerDir);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.event), ['SubagentStart', 'SubagentStop']);
  assert.equal(rows[0].agent_id, agentId);
  assert.equal(rows[1].agent_id, agentId);

  const startMs = Date.parse(rows[0].ts);
  const stopMs = Date.parse(rows[1].ts);
  assert.ok(Number.isFinite(startMs));
  assert.ok(Number.isFinite(stopMs));
  assert.ok(startMs <= stopMs);

  const durationMs = stopMs - startMs;
  assert.ok(Number.isInteger(durationMs));
  assert.ok(durationMs >= 0);
});

test('a nested dispatch is attributed to its dispatcher at depth 2 while a main-thread dispatch is null at depth 1', () => {
  const observerDir = workspace('nesting');
  const dir = workspace('nesting-transcripts');
  const sessionId = '7f2c1d4e-0000-4000-8000-eeeeeeeeeeee';
  const parentId = 'aec88dac27ef025fc';
  const childId = 'ae8dc8046cd337f52';
  const transcriptPath = plantSidecar(dir, sessionId, parentId, { agentType: 'delivery-lead', spawnDepth: 1 });
  plantSidecar(dir, sessionId, childId, { agentType: 'implementer', parentAgentId: parentId, spawnDepth: 2 });

  runHook(startPayload({ session_id: sessionId, transcript_path: transcriptPath, agent_id: parentId }), observerDir);
  runHook(startPayload({ session_id: sessionId, transcript_path: transcriptPath, agent_id: childId }), observerDir);

  const { rows } = readRows(observerDir);
  assert.equal(rows.length, 2);
  const [parentRow, childRow] = rows;
  assert.equal(parentRow.parent_agent_id, null);
  assert.equal(parentRow.depth, 1);
  assert.equal(parentRow.agent_type, 'delivery-lead');
  assert.equal(childRow.parent_agent_id, parentId);
  assert.equal(childRow.depth, 2);
  assert.equal(childRow.agent_type, 'implementer');
});

test('a start row carries every one of the ten fields with an explicitly null agent transcript path', () => {
  const observerDir = workspace('shape');
  const dir = workspace('shape-transcripts');
  const sessionId = '7f2c1d4e-0000-4000-8000-ffffffffffff';
  const agentId = 'c0ffee0123456789';
  const transcriptPath = plantSidecar(dir, sessionId, agentId, { agentType: 'test-engineer', spawnDepth: 1 });

  runHook(startPayload({ session_id: sessionId, transcript_path: transcriptPath, agent_id: agentId }), observerDir);

  const { lines, rows } = readRows(observerDir);
  assert.equal(lines.length, 1);
  assert.deepEqual(Object.keys(rows[0]).sort(), TEN_FIELDS);
  assert.ok(lines[0].includes('"agent_transcript_path":null'));
  assert.equal(rows[0].agent_transcript_path, null);
  assert.equal(rows[0].event, 'SubagentStart');
  assert.equal(rows[0].subject, 'agent');
});

test('the retiring analyzer keeps its SubagentStop registration and is not bound to SubagentStart', () => {
  const hooks = readSettings().hooks;
  const stopCommands = hooks.SubagentStop.flatMap((b) => b.hooks).map((h) => h.command);
  assert.ok(stopCommands.some((c) => c.endsWith('agent-ledger/agent-run-analyzer.mjs')));
  assert.ok(stopCommands.some((c) => c.endsWith('observer/subagent-observer.mjs')));
  const startCommands = hooks.SubagentStart.flatMap((b) => b.hooks).map((h) => h.command);
  assert.ok(startCommands.every((c) => !c.includes('agent-run-analyzer')));
});
