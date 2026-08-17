import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const hookPath = fileURLToPath(new URL('../observer/subagent-observer.mjs', import.meta.url));
const replayPath = fileURLToPath(new URL('../observer/capability-replay.mjs', import.meta.url));

const MARKER = 'CAPABILITY-' + 'BLOCKED:';

const STOP_FIELDS = {
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

const CAPABILITY_FIELDS = {
  ...STOP_FIELDS,
  needed: 'string',
  task: 'nullable-string',
  detected_from: 'string',
};

const DETECTED_FROM = new Set(['last_assistant_message', 'agent_transcript_path']);

function workspace(label) {
  return mkdtempSync(join(tmpdir(), `capability-${label}-`));
}

function assertShape(row, table, label) {
  assert.deepEqual(Object.keys(row).sort(), Object.keys(table).sort(), `${label} key set`);
  for (const [field, kind] of Object.entries(table)) {
    const value = row[field];
    if (kind === 'string') {
      assert.equal(typeof value, 'string', `${label}.${field} must be a string, got ${JSON.stringify(value)}`);
    } else if (kind === 'nullable-string') {
      assert.ok(
        value === null || typeof value === 'string',
        `${label}.${field} must be a string or null, got ${JSON.stringify(value)}`,
      );
    } else if (kind === 'nullable-integer') {
      assert.ok(
        value === null || Number.isInteger(value),
        `${label}.${field} must be an integer or null, got ${JSON.stringify(value)}`,
      );
    } else {
      assert.fail(`unclassified declared field ${label}.${field}`);
    }
  }
}

function readRows(observerDir) {
  const eventsDir = join(observerDir, 'events');
  if (!existsSync(eventsDir)) return [];
  const rows = [];
  for (const file of readdirSync(eventsDir).filter((f) => f.endsWith('.jsonl')).sort()) {
    const raw = readFileSync(join(eventsDir, file), 'utf8');
    assert.ok(!raw || raw.endsWith('\n'), `${file} ends mid-line`);
    for (const line of raw.split('\n')) if (line.length) rows.push(JSON.parse(line));
  }
  return rows;
}

function runHook(payload) {
  assert.ok(existsSync(hookPath), `observer hook entrypoint missing at ${hookPath}`);
  const observerDir = workspace('run');
  const result = spawnSync(process.execPath, [hookPath], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_OBSERVER_DIR: observerDir },
  });
  const rows = readRows(observerDir);
  return {
    result,
    rows,
    blocked: rows.filter((r) => r.event === 'capability_blocked'),
    stops: rows.filter((r) => r.event === 'SubagentStop'),
  };
}

function assistantLine(text) {
  return JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } });
}

function userLine(text) {
  return JSON.stringify({ type: 'user', message: { role: 'user', content: text } });
}

function toolResultLine(text) {
  return JSON.stringify({
    type: 'user',
    message: { role: 'user', content: [{ type: 'tool_result', content: [{ type: 'text', text }] }] },
  });
}

function writeLines(dir, name, lines) {
  const file = join(dir, name);
  writeFileSync(file, lines.join('\n') + '\n');
  return file;
}

function stopPayload(dir, { finalText, includeLastAssistantMessage = true, parentLines = null } = {}) {
  const agentFile = writeLines(dir, 'agent-a1b2c3d4e5f60718.jsonl', [
    userLine('do the task'),
    assistantLine(finalText),
  ]);
  const payload = {
    hook_event_name: 'SubagentStop',
    session_id: '7f2c1d4e-0000-4000-8000-aaaaaaaaaaaa',
    cwd: '/Users/synthetic/DevLabs/example',
    agent_id: 'a1b2c3d4e5f60718',
    agent_type: 'implementer',
    transcript_path: parentLines
      ? writeLines(dir, 'parent-session.jsonl', parentLines)
      : '/nonexistent/projects/slug/parent-session.jsonl',
    agent_transcript_path: agentFile,
  };
  if (includeLastAssistantMessage) payload.last_assistant_message = finalText;
  return payload;
}

test('a genuine emission writes one thirteen-field row paired to a still-ten-field stop row', () => {
  const dir = workspace('genuine');
  const finalText = `Summary of work.\n\n${MARKER} needed=Bash task=run the migration script`;
  const { result, rows, blocked, stops } = runHook(stopPayload(dir, { finalText }));

  assert.equal(result.status, 0, `hook exited ${result.status}: ${result.stderr}`);
  assert.equal(rows.length, 2, `expected exactly two rows, got ${JSON.stringify(rows)}`);
  assert.equal(blocked.length, 1);
  assert.equal(stops.length, 1);

  assertShape(stops[0], STOP_FIELDS, 'stop row');
  assertShape(blocked[0], CAPABILITY_FIELDS, 'capability row');

  assert.equal(blocked[0].ts, stops[0].ts, 'the pair must share one timestamp');
  assert.equal(blocked[0].subject, 'agent');
  assert.equal(blocked[0].session_id, stops[0].session_id);
  assert.equal(blocked[0].agent_id, stops[0].agent_id);
  assert.equal(blocked[0].agent_type, 'implementer');
  assert.equal(blocked[0].needed, 'Bash');
  assert.equal(blocked[0].task, 'run the migration script');
  assert.equal(blocked[0].detected_from, 'last_assistant_message');
  assert.ok(DETECTED_FROM.has(blocked[0].detected_from));
});

test('multi-word and parenthesised capability descriptions are captured whole', () => {
  const cases = [
    ['Bash (or another script-execution tool)', 'execute the probe'],
    ['network egress + read access to ~/.config/gh', 'query the api'],
    ['filesystem-delete (or `git rm`)', 'remove the stale worktree'],
  ];
  for (const [needed, task] of cases) {
    const dir = workspace('multiword');
    const finalText = `Done.\n\n${MARKER} needed=${needed} task=${task}`;
    const { blocked } = runHook(stopPayload(dir, { finalText }));
    assert.equal(blocked.length, 1, `expected one row for needed=${needed}`);
    assert.equal(blocked[0].needed, needed);
    assert.equal(blocked[0].task, task);
  }
});

test('needed stops at the first task= even when the description contains a later task=', () => {
  const dir = workspace('lazy');
  const finalText = `${MARKER} needed=Edit permission task=update task=graph fixtures`;
  const { blocked } = runHook(stopPayload(dir, { finalText }));
  assert.equal(blocked.length, 1);
  assert.equal(blocked[0].needed, 'Edit permission');
  assert.equal(blocked[0].task, 'update task=graph fixtures');
});

test('a marker relayed into the parent transcript is never read', () => {
  const relayed = `${MARKER} needed=Write task=create the migration file`;

  const unblocked = workspace('relay-only');
  const quiet = runHook(
    stopPayload(unblocked, {
      finalText: 'I completed the task with no blockers.',
      parentLines: [
        assistantLine('dispatching'),
        userLine(relayed),
        toolResultLine(relayed),
        assistantLine(relayed),
      ],
    }),
  );
  assert.equal(quiet.blocked.length, 0, 'the parent transcript must never be a detection source');
  assert.equal(quiet.stops.length, 1);

  const blockedDir = workspace('relay-plus');
  const both = runHook(
    stopPayload(blockedDir, {
      finalText: relayed,
      parentLines: [assistantLine('dispatching'), userLine(relayed), toolResultLine(relayed)],
    }),
  );
  assert.equal(both.blocked.length, 1, 'a relay must not add a second row');
  assert.equal(both.stops.length, 1);
});

test('an unblocked run records the stop row and nothing else', () => {
  const dir = workspace('unblocked');
  const { rows, blocked, stops } = runHook(stopPayload(dir, { finalText: 'All done, no blockers.' }));
  assert.equal(blocked.length, 0);
  assert.equal(stops.length, 1);
  assert.equal(rows.length, 1);
});

test('the bounded transcript tail is used when last_assistant_message is absent', () => {
  const dir = workspace('fallback');
  const finalText = `${MARKER} needed=serena activate_project task=index the repository`;
  const { blocked } = runHook(stopPayload(dir, { finalText, includeLastAssistantMessage: false }));
  assert.equal(blocked.length, 1);
  assert.equal(blocked[0].needed, 'serena activate_project');
  assert.equal(blocked[0].task, 'index the repository');
  assert.equal(blocked[0].detected_from, 'agent_transcript_path');
});

const TAIL_BYTES = 1024 * 1024;

function tailProbe(label, distanceFromEnd) {
  const dir = workspace(label);
  const lead = userLine('s'.repeat(4096));
  const marker = assistantLine('P'.repeat(2000) + ` ${MARKER} needed=Bash task=run the probe`);
  const overhead = Buffer.byteLength(userLine(''));
  const padBytes = distanceFromEnd - Buffer.byteLength(marker) - 3;
  assert.ok(padBytes > overhead, `distance ${distanceFromEnd} too small to pad`);
  const trail = userLine('u'.repeat(padBytes - overhead));

  const file = join(dir, 'agent-a1b2c3d4e5f60718.jsonl');
  const body = `${lead}\n${marker}\n${trail}\n`;
  writeFileSync(file, body);

  const size = Buffer.byteLength(body);
  assert.equal(
    size - Buffer.byteLength(lead),
    distanceFromEnd,
    'fixture must place the marker line exactly the requested distance from end of file',
  );

  return runHook({
    hook_event_name: 'SubagentStop',
    session_id: 's',
    cwd: '/repo',
    agent_id: 'a1b2c3d4e5f60718',
    transcript_path: '/nonexistent/projects/slug/parent.jsonl',
    agent_transcript_path: file,
  });
}

test('the tail window is exactly one mebibyte, measured at both of its edges', () => {
  const inside = tailProbe('tail-inside', TAIL_BYTES);
  assert.equal(inside.blocked.length, 1, 'a marker line ending exactly at the window edge must be found');
  assert.equal(inside.blocked[0].detected_from, 'agent_transcript_path');
  assert.equal(inside.blocked[0].needed, 'Bash');

  const outside = tailProbe('tail-outside', TAIL_BYTES + 512);
  assert.equal(outside.blocked.length, 0, 'a marker line 512 bytes past the window edge must not be found');
  assert.equal(outside.stops.length, 1, 'the stop row is still written');
});

test('a marker far beyond the tail window is not found', () => {
  const dir = workspace('beyond-tail');
  const farFile = writeLines(dir, 'agent-a1b2c3d4e5f60718.jsonl', [
    userLine('start'),
    assistantLine(`${MARKER} needed=Bash task=run the probe`),
    userLine('x'.repeat(1536 * 1024)),
  ]);
  const bounded = runHook({
    hook_event_name: 'SubagentStop',
    session_id: 's',
    cwd: '/repo',
    agent_id: 'a1b2c3d4e5f60718',
    transcript_path: '/nonexistent/projects/slug/parent.jsonl',
    agent_transcript_path: farFile,
  });
  assert.equal(bounded.blocked.length, 0, 'a marker pushed past the tail window must not be found');
  assert.equal(bounded.stops.length, 1, 'the stop row is still written');
});

test('needed and task are truncated to exactly three hundred characters', () => {
  const dir = workspace('truncation');
  const finalText = `${MARKER} needed=${'N'.repeat(400)} task=${'T'.repeat(400)}`;
  const { blocked } = runHook(stopPayload(dir, { finalText }));
  assert.equal(blocked.length, 1);
  assert.equal(blocked[0].needed.length, 300, 'needed must be capped at exactly 300 characters');
  assert.equal(blocked[0].task.length, 300, 'task must be capped at exactly 300 characters');
  assert.equal(blocked[0].needed, 'N'.repeat(300));
  assert.equal(blocked[0].task, 'T'.repeat(300));
});

test('quoting the marker convention verbatim records nothing', () => {
  const dir = workspace('convention');
  const finalText = `The rule reads \`${MARKER} needed=<tool-or-capability> task=<short description>\`.`;
  const { blocked, stops } = runHook(stopPayload(dir, { finalText }));
  assert.equal(blocked.length, 0);
  assert.equal(stops.length, 1);
});

test('a SubagentStart payload carrying a marker produces no capability row', () => {
  const dir = workspace('start-event');
  const payload = stopPayload(dir, { finalText: `${MARKER} needed=Bash task=run the probe` });
  payload.hook_event_name = 'SubagentStart';
  const { result, rows, blocked } = runHook(payload);
  assert.equal(result.status, 0);
  assert.equal(blocked.length, 0, 'detection is gated to SubagentStop');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].event, 'SubagentStart');
});

test('malformed, missing and directory-shaped inputs never throw and record no capability row', () => {
  const dir = workspace('malformed');
  const broken = join(dir, 'broken.jsonl');
  writeFileSync(broken, 'not json\n{"message":{"content":42}}\n{"message":null}\n');
  const nested = join(dir, 'subagents');
  mkdirSync(nested, { recursive: true });

  const cases = [
    { hook_event_name: 'SubagentStop', agent_transcript_path: join(dir, 'absent.jsonl') },
    { hook_event_name: 'SubagentStop', agent_transcript_path: broken },
    { hook_event_name: 'SubagentStop', agent_transcript_path: nested },
    { hook_event_name: 'SubagentStop', last_assistant_message: 12345, agent_transcript_path: broken },
    { hook_event_name: 'SubagentStop', agent_transcript_path: { not: 'a path' } },
    { hook_event_name: 'SubagentStop' },
    {},
  ];
  for (const payload of cases) {
    const { result, rows, blocked } = runHook(payload);
    assert.equal(result.status, 0, `payload crashed: ${JSON.stringify(payload)}`);
    assert.equal(result.stderr, '', `payload wrote stderr: ${JSON.stringify(payload)}`);
    assert.equal(blocked.length, 0, `payload emitted a row: ${JSON.stringify(payload)}`);
    assert.equal(rows.length, 1, `payload lost its stop row: ${JSON.stringify(payload)}`);
    assert.equal(
      rows[0].event,
      typeof payload.hook_event_name === 'string' ? payload.hook_event_name : '',
      `payload mislabelled its surviving row: ${JSON.stringify(payload)}`,
    );
  }
});

test('the replay script agrees with the hook detector over a directory of transcripts', async () => {
  assert.ok(existsSync(replayPath), `replay script missing at ${replayPath}`);
  const { replay } = await import(pathToFileURL(replayPath).href);

  const corpus = workspace('replay');
  const genuine = `${MARKER} needed=Bash task=run the migration script`;
  writeLines(corpus, 'genuine.jsonl', [userLine('go'), assistantLine(genuine)]);
  writeLines(corpus, 'convention.jsonl', [
    userLine('go'),
    assistantLine(`The rule reads \`${MARKER} needed=<tool-or-capability> task=<short description>\`.`),
  ]);
  writeLines(corpus, 'relay-outside-assistant.jsonl', [userLine(genuine), assistantLine('all done')]);
  writeLines(corpus, 'clean.jsonl', [userLine('go'), assistantLine('all done')]);
  writeFileSync(join(corpus, 'notes.txt'), `${MARKER} needed=Bash task=not a transcript\n`);
  mkdirSync(join(corpus, 'subagents'), { recursive: true });
  writeLines(join(corpus, 'subagents'), 'nested-genuine.jsonl', [
    userLine('go'),
    assistantLine(`${MARKER} needed=Write task=create the file`),
  ]);

  const { scanned, detected } = replay(corpus);
  assert.ok(scanned > 0, 'a replay over zero transcripts proves nothing');
  assert.equal(scanned, 5, `only .jsonl transcripts count; expected five scanned, got ${scanned}`);
  assert.equal(detected.length, 2, `expected two genuine markers, got ${JSON.stringify(detected)}`);

  const byNeeded = detected.map((d) => d.needed).sort();
  assert.deepEqual(byNeeded, ['Bash', 'Write']);
  for (const hit of detected) assert.equal(hit.detected_from, 'agent_transcript_path');

  for (const hit of detected) {
    const viaHook = runHook({
      hook_event_name: 'SubagentStop',
      session_id: 's',
      cwd: '/repo',
      agent_id: 'a1b2c3d4e5f60718',
      transcript_path: '/nonexistent/projects/slug/parent.jsonl',
      agent_transcript_path: hit.file,
    });
    assert.equal(viaHook.blocked.length, 1, `hook disagreed with replay on ${hit.file}`);
    assert.equal(viaHook.blocked[0].needed, hit.needed, `hook and replay disagree on needed for ${hit.file}`);
    assert.equal(viaHook.blocked[0].task, hit.task, `hook and replay disagree on task for ${hit.file}`);
  }
});

test('the replay script rejects a missing directory argument with a usage exit code', () => {
  assert.ok(existsSync(replayPath), `replay script missing at ${replayPath}`);
  const bare = spawnSync(process.execPath, [replayPath], { encoding: 'utf8' });
  assert.equal(bare.status, 2, `expected usage exit code 2, got ${bare.status}`);
  assert.match(bare.stderr, /usage: capability-replay\.mjs/);
  assert.equal(bare.stdout, '', 'a usage rejection must not emit a result document');

  const ok = spawnSync(process.execPath, [replayPath, workspace('cli-empty')], { encoding: 'utf8' });
  assert.equal(ok.status, 0, `expected exit code 0 on a real directory, got ${ok.status}`);
  assert.deepEqual(JSON.parse(ok.stdout), { scanned: 0, detected: [] });
});
