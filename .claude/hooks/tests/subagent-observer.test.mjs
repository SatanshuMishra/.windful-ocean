import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

const modulePath = fileURLToPath(new URL('../observer/_observer.mjs', import.meta.url));
const hookPath = fileURLToPath(new URL('../observer/subagent-observer.mjs', import.meta.url));

const FIELD_TYPES = {
  ts: 'string',
  subject: 'string',
  event: 'string',
  session_id: 'string',
  cwd: 'string',
  agent_id: 'string',
  agent_type: 'nullable-string',
  agent_transcript_path: 'nullable-string',
  parent_agent_id: 'nullable-string',
  depth: 'nullable-integer',
};

const RFC3339_MS_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

let cachedModule = null;

async function loadObserver() {
  assert.ok(existsSync(modulePath), `observer module missing at ${modulePath}`);
  if (!cachedModule) cachedModule = await import(pathToFileURL(modulePath).href);
  return cachedModule;
}

function requireHook() {
  assert.ok(existsSync(hookPath), `observer hook entrypoint missing at ${hookPath}`);
}

function workspace(label) {
  return mkdtempSync(join(tmpdir(), `observer-${label}-`));
}

function readRows(observerDir) {
  const eventsDir = join(observerDir, 'events');
  if (!existsSync(eventsDir)) return { files: [], lines: [], rows: [], malformed: [] };
  const files = readdirSync(eventsDir).filter((f) => f.endsWith('.jsonl')).sort();
  const lines = [];
  for (const f of files) {
    const raw = readFileSync(join(eventsDir, f), 'utf8');
    if (raw && !raw.endsWith('\n')) lines.push('__UNTERMINATED__');
    for (const line of raw.split('\n')) if (line.length) lines.push(line);
  }
  const rows = [];
  const malformed = [];
  for (const line of lines) {
    try {
      rows.push(JSON.parse(line));
    } catch {
      malformed.push(line.slice(0, 120));
    }
  }
  return { files, lines, rows, malformed };
}

function runHook(payload, observerDir) {
  requireHook();
  return spawnSync(process.execPath, [hookPath], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_OBSERVER_DIR: observerDir },
  });
}

function assertFieldTypes(row) {
  const declared = Object.keys(FIELD_TYPES).sort();
  const present = Object.keys(row).sort();
  assert.deepEqual(present, declared, 'row key set must be exactly the ten declared fields');
  for (const [field, kind] of Object.entries(FIELD_TYPES)) {
    const value = row[field];
    if (kind === 'string') {
      assert.equal(typeof value, 'string', `${field} must be a string, got ${JSON.stringify(value)}`);
    } else if (kind === 'nullable-string') {
      assert.ok(
        value === null || typeof value === 'string',
        `${field} must be a string or null, got ${JSON.stringify(value)}`,
      );
    } else if (kind === 'nullable-integer') {
      assert.ok(
        value === null || Number.isInteger(value),
        `${field} must be an integer or null, got ${JSON.stringify(value)}`,
      );
    } else {
      assert.fail(`unclassified declared field ${field}`);
    }
  }
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

function plantSidecar(dir, sessionId, agentId, meta) {
  const transcriptPath = join(dir, `${sessionId}.jsonl`);
  writeFileSync(transcriptPath, '');
  const sidecar = join(dir, sessionId, 'subagents', `agent-${agentId}.meta.json`);
  mkdirSync(dirname(sidecar), { recursive: true });
  writeFileSync(sidecar, JSON.stringify(meta));
  return transcriptPath;
}

test('a synthetic payload produces exactly one line carrying every declared field at its declared type', async () => {
  await loadObserver();
  const observerDir = workspace('one-line');
  const payload = stopPayload({});
  const result = runHook(payload, observerDir);

  assert.equal(result.status, 0, `hook exited ${result.status}: ${result.stderr}`);

  const { files, lines, rows, malformed } = readRows(observerDir);
  assert.deepEqual(malformed, [], 'every written line must parse as JSON');
  assert.equal(lines.length, 1, `expected exactly one line, got ${lines.length}`);
  assert.equal(files.length, 1, `expected exactly one monthly file, got ${files.join(',')}`);

  const row = rows[0];
  assertFieldTypes(row);
  assert.match(row.ts, RFC3339_MS_UTC);
  assert.equal(files[0], `${row.ts.slice(0, 7)}.jsonl`, 'file name must be YYYY-MM derived from the row ts');
  assert.equal(row.subject, 'agent');
  assert.equal(row.event, 'SubagentStop');
  assert.equal(row.session_id, payload.session_id);
  assert.equal(row.cwd, payload.cwd);
  assert.equal(row.agent_id, payload.agent_id);
  assert.equal(row.agent_transcript_path, payload.agent_transcript_path);
});

test('an absent value is an explicit null, never an omitted key', async () => {
  await loadObserver();
  const observerDir = workspace('nulls');
  const payload = stopPayload({});
  delete payload.agent_type;
  delete payload.agent_transcript_path;

  const result = runHook(payload, observerDir);
  assert.equal(result.status, 0, `hook exited ${result.status}: ${result.stderr}`);

  const { lines, rows } = readRows(observerDir);
  assert.equal(lines.length, 1);
  const raw = lines[0];
  assertFieldTypes(rows[0]);
  for (const field of Object.keys(FIELD_TYPES)) {
    assert.ok(raw.includes(`"${field}":`), `${field} must be present in the serialized line`);
  }
  assert.equal(rows[0].agent_type, null);
  assert.equal(rows[0].agent_transcript_path, null);
  assert.equal(rows[0].parent_agent_id, null);
  assert.equal(rows[0].depth, null);
});

test('the sidecar supplies agent type, parent and depth, and outranks the payload agent type', async () => {
  const { buildRow, sidecarPath } = await loadObserver();
  const dir = workspace('sidecar');
  const sessionId = '7f2c1d4e-0000-4000-8000-bbbbbbbbbbbb';
  const agentId = 'c0ffee0123456789';
  const transcriptPath = plantSidecar(dir, sessionId, agentId, {
    agentType: 'researcher',
    description: 'nested dispatch',
    parentAgentId: 'deadbeef01234567',
    spawnDepth: 2,
  });

  assert.equal(
    sidecarPath(transcriptPath, agentId),
    join(dir, sessionId, 'subagents', `agent-${agentId}.meta.json`),
  );

  const row = buildRow(stopPayload({ transcript_path: transcriptPath, agent_id: agentId, agent_type: 'unknown' }));
  assertFieldTypes(row);
  assert.equal(row.agent_type, 'researcher');
  assert.equal(row.parent_agent_id, 'deadbeef01234567');
  assert.equal(row.depth, 2);
});

test('a main-thread dispatch has a null parent and the payload agent type survives a missing sidecar', async () => {
  const { buildRow } = await loadObserver();
  const dir = workspace('main-thread');
  const sessionId = '7f2c1d4e-0000-4000-8000-cccccccccccc';
  const agentId = 'ab12cd34ef567890';
  const transcriptPath = plantSidecar(dir, sessionId, agentId, { agentType: 'implementer', spawnDepth: 1 });

  const attributed = buildRow(stopPayload({ transcript_path: transcriptPath, agent_id: agentId }));
  assertFieldTypes(attributed);
  assert.equal(attributed.parent_agent_id, null);
  assert.equal(attributed.depth, 1);
  assert.equal(attributed.agent_type, 'implementer');

  const orphan = buildRow(
    stopPayload({ transcript_path: join(dir, 'absent.jsonl'), agent_id: agentId, agent_type: 'debugger' }),
  );
  assertFieldTypes(orphan);
  assert.equal(orphan.agent_type, 'debugger');
  assert.equal(orphan.parent_agent_id, null);
  assert.equal(orphan.depth, null);
});

test('neither half of the sidecar path may be traversal-shaped', async () => {
  const { sidecarPath } = await loadObserver();
  assert.equal(sidecarPath('/tmp/session.jsonl', 'ok_id-1'), '/tmp/session/subagents/agent-ok_id-1.meta.json');
  assert.equal(sidecarPath('/tmp/session.jsonl', '../../../../etc/passwd'), null);
  assert.equal(sidecarPath('/tmp/a/../../../etc/session.jsonl', 'ok_id-1'), null);
  assert.equal(sidecarPath('/tmp/./session.jsonl', 'ok_id-1'), null);
  assert.equal(sidecarPath('relative/session.jsonl', 'ok_id-1'), null);
  assert.equal(sidecarPath('/tmp/session.txt', 'ok_id-1'), null);
});

test('the events file rotates monthly from the row ts in UTC', async () => {
  const { eventsFile, root } = await loadObserver();
  assert.equal(eventsFile('2026-08-17T15:41:03.217Z'), join(root(), 'events', '2026-08.jsonl'));
  assert.equal(eventsFile('2026-12-31T23:59:59.999Z'), join(root(), 'events', '2026-12.jsonl'));
  assert.throws(() => eventsFile('2026-08-17'), TypeError);
});

test('two concurrent writers produce two intact, non-interleaved sets of lines', async () => {
  await loadObserver();
  const observerDir = workspace('concurrency');
  const perWriter = 60;
  const padding = 16000;

  const driver = join(observerDir, 'driver.mjs');
  writeFileSync(
    driver,
    [
      `import { buildRow, appendRow } from ${JSON.stringify(pathToFileURL(modulePath).href)};`,
      'const [session, count, pad] = process.argv.slice(2);',
      "const cwd = '/tmp/observer/' + 'd'.repeat(Number(pad));",
      'for (let i = 0; i < Number(count); i++) {',
      '  appendRow(buildRow({',
      "    hook_event_name: 'SubagentStop',",
      '    session_id: session,',
      '    cwd,',
      "    agent_id: session.replace(/-/g, '') + i,",
      "    transcript_path: '',",
      '  }));',
      '}',
    ].join('\n'),
  );

  function launch(session) {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [driver, session, String(perWriter), String(padding)], {
        env: { ...process.env, CLAUDE_OBSERVER_DIR: observerDir },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stderr = '';
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
      });
      child.on('error', reject);
      child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${session} exited ${code}: ${stderr}`))));
    });
  }

  await Promise.all([launch('writer-alpha'), launch('writer-bravo')]);

  const { lines, rows, malformed } = readRows(observerDir);
  assert.deepEqual(malformed, [], 'no line may be torn or interleaved');
  assert.equal(lines.length, perWriter * 2, `expected ${perWriter * 2} intact lines, got ${lines.length}`);

  const byWriter = new Map();
  for (const row of rows) {
    assertFieldTypes(row);
    byWriter.set(row.session_id, (byWriter.get(row.session_id) || 0) + 1);
  }
  assert.equal(byWriter.get('writer-alpha'), perWriter, 'writer-alpha lost lines');
  assert.equal(byWriter.get('writer-bravo'), perWriter, 'writer-bravo lost lines');
});
