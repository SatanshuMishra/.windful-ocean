import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  WENT_BACK_SUBJECT,
  WENT_BACK_EVENT,
  WENT_BACK_DEFINITION,
  BRIEFING_TOOL,
  READ_TOOL,
  SEARCH_TOOLS,
  KIND_READ,
  KIND_SEARCH,
  SIGNATURE_MAX,
  toolUses,
  canonicalInput,
  occurrenceKey,
  wentBackOccurrences,
  buildWentBackRow,
} from '../observer/went-back.mjs';

const DEFINITION = "Going back means that, at or after the first mcp__plugin_logbook_ledger__resume_thread tool call in this session's main transcript, a Read names a file_path whose path.normalize form already appeared in an earlier Read in the same transcript, or a Grep or Glob repeats a signature - the tool name, a space, and JSON.stringify of its input object with its own keys sorted ascending - that already appeared in the same transcript; the first Read of a path and the first use of a signature are not going back, subagent transcripts are not read, and a re-read counts per path regardless of offset, limit or pages.";

const hookPath = fileURLToPath(new URL('../observer/session-observer.mjs', import.meta.url));
const RFC3339_MS_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const ROW_KEYS = ['cwd', 'event', 'session_id', 'subject', 'ts', 'went_back_kind', 'went_back_signature'];
const FIXED_TS = '2026-09-09T12:34:56.789Z';
const SESSION_ID = '9c4b1f20-0000-4000-8000-aaaaaaaaaaaa';
const CWD = '/Users/synthetic/DevLabs/example';
const SUBAGENT_ID = 'a1b2c3d4e5f60718';
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const ASTRAL_CHAR = '\u{1F600}';

function workspace(label) {
  return mkdtempSync(join(tmpdir(), `went-back-${label}-`));
}

function resumeUse() {
  return { name: BRIEFING_TOOL, input: { thread_id: '01M24FHCMWGH0SHARH12CARCZ1' } };
}

function readUse(filePath, rest = {}) {
  return { name: READ_TOOL, input: { file_path: filePath, ...rest } };
}

function grepUse(input) {
  return { name: 'Grep', input };
}

function transcript(uses) {
  const lines = uses.map((use, index) =>
    JSON.stringify({
      type: 'assistant',
      isSidechain: use.isSidechain === true,
      message: {
        role: 'assistant',
        content: [{ type: 'tool_use', id: `toolu_${index}`, name: use.name, input: use.input }],
      },
    }),
  );
  return `${lines.join('\n')}\n`;
}

function stopPayload(overrides = {}) {
  return {
    hook_event_name: 'SessionEnd',
    session_id: SESSION_ID,
    transcript_path: '/nonexistent/projects/slug/session.jsonl',
    cwd: CWD,
    ...overrides,
  };
}

function plantTranscript(dir, uses) {
  const file = join(dir, `${SESSION_ID}.jsonl`);
  writeFileSync(file, transcript(uses));
  return file;
}

function unpairedSurrogateFields(row) {
  return Object.entries(row)
    .filter(([, value]) => typeof value === 'string' && LONE_SURROGATE.test(value))
    .map(([key]) => key);
}

function astralBoundaryPath() {
  const head = `${READ_TOOL} /`;
  return `/${'q'.repeat(SIGNATURE_MAX - head.length - 1)}${ASTRAL_CHAR}tail.ts`;
}

function runHook(payload, observerDir) {
  assert.ok(existsSync(hookPath), `session observer entrypoint missing at ${hookPath}`);
  return spawnSync(process.execPath, [hookPath], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_OBSERVER_DIR: observerDir },
  });
}

function readRows(observerDir) {
  const eventsDir = join(observerDir, 'events');
  if (!existsSync(eventsDir)) return { files: [], lines: [], rows: [], malformed: [], unpaired: [] };
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
  const unpaired = rows.flatMap((row) => unpairedSurrogateFields(row));
  return { files, lines, rows, malformed, unpaired };
}

function assertRowShape(row) {
  assert.deepEqual(Object.keys(row).sort(), ROW_KEYS, 'the row key set must be exactly the seven declared fields');
  assert.match(row.ts, RFC3339_MS_UTC);
  assert.equal(row.subject, WENT_BACK_SUBJECT);
  assert.equal(row.event, WENT_BACK_EVENT);
  assert.equal(typeof row.session_id, 'string');
  assert.equal(typeof row.cwd, 'string');
  assert.equal(typeof row.went_back_signature, 'string');
  assert.ok(
    row.went_back_kind === KIND_READ || row.went_back_kind === KIND_SEARCH,
    `unclassified went_back_kind ${JSON.stringify(row.went_back_kind)}`,
  );
}

test('the exported vocabulary is the fixed surface and the definition cannot drift from the test', () => {
  assert.equal(
    WENT_BACK_DEFINITION,
    DEFINITION,
    'the module and this test must carry one definition of going back, character for character',
  );
  assert.equal(WENT_BACK_SUBJECT, 'session');
  assert.equal(WENT_BACK_EVENT, 'went_back');
  assert.equal(BRIEFING_TOOL, 'mcp__plugin_logbook_ledger__resume_thread');
  assert.equal(READ_TOOL, 'Read');
  assert.deepEqual([...SEARCH_TOOLS], ['Grep', 'Glob']);
  assert.ok(Object.isFrozen(SEARCH_TOOLS), 'SEARCH_TOOLS must be frozen so no caller can widen the search vocabulary');
  assert.equal(KIND_READ, 'repeat_read');
  assert.equal(KIND_SEARCH, 'repeat_search');
  assert.equal(SIGNATURE_MAX, 300);
});

test('a second Read of the same path after the briefing is one repeat_read occurrence', () => {
  const occurrences = wentBackOccurrences(transcript([resumeUse(), readUse('/a/x.ts'), readUse('/a/x.ts')]));

  assert.equal(occurrences.length, 1, DEFINITION);
  assert.equal(occurrences[0].kind, KIND_READ, DEFINITION);
  assert.ok(occurrences[0].key.includes('/a/x.ts'), DEFINITION);
  assert.ok(Object.isFrozen(occurrences), 'the occurrence list must be frozen so a reader cannot edit the count');
});

test('a Grep repeated with the same arguments in a different key order is one repeat_search occurrence', () => {
  const first = grepUse({ pattern: 'resume_thread', path: '/a', output_mode: 'content' });
  const second = grepUse({ output_mode: 'content', pattern: 'resume_thread', path: '/a' });
  const canonical = '{"output_mode":"content","path":"/a","pattern":"resume_thread"}';
  const occurrences = wentBackOccurrences(transcript([resumeUse(), first, second]));

  assert.equal(canonicalInput(first.input), canonical, DEFINITION);
  assert.equal(canonicalInput(second.input), canonical, DEFINITION);
  assert.equal(occurrences.length, 1, DEFINITION);
  assert.equal(occurrences[0].kind, KIND_SEARCH, DEFINITION);
  assert.equal(occurrences[0].key, `Grep ${canonical}`, DEFINITION);
});

test('three first reads and one first search after the briefing are not going back', () => {
  const occurrences = wentBackOccurrences(
    transcript([
      resumeUse(),
      readUse('/a/x.ts'),
      readUse('/a/y.ts'),
      readUse('/a/z.ts'),
      grepUse({ pattern: 'went_back', path: '/a' }),
    ]),
  );

  assert.deepEqual(occurrences, [], DEFINITION);
});

test('the briefing call is the gate, so the same re-read counts only when the repeat lands at or after it', () => {
  const beforeGate = transcript([readUse('/a/x.ts'), readUse('/a/x.ts'), resumeUse()]);
  const afterGate = transcript([readUse('/a/x.ts'), resumeUse(), readUse('/a/x.ts')]);
  const noGate = transcript([readUse('/a/x.ts'), readUse('/a/x.ts')]);

  assert.deepEqual(wentBackOccurrences(beforeGate), [], 'a repeat that precedes the briefing is not going back');
  assert.equal(wentBackOccurrences(afterGate).length, 1, 'the same two reads count once the briefing sits between them');
  assert.deepEqual(wentBackOccurrences(noGate), [], 'a session that never resumed a thread has no gate to cross');
});

test('a re-read counts per path regardless of offset, limit or pages', () => {
  const first = occurrenceKey(READ_TOOL, { file_path: '/a/x.ts', offset: 1, limit: 50 });
  const second = occurrenceKey(READ_TOOL, { file_path: '/a/./x.ts', offset: 900, limit: 20, pages: '2-5' });

  assert.equal(first.kind, KIND_READ);
  assert.equal(first.key, second.key);
  assert.ok(first.key.includes('/a/x.ts'));
  assert.ok(!first.key.includes('/./'), 'the key must hold the path.normalize form, not the raw argument');

  const occurrences = wentBackOccurrences(
    transcript([
      resumeUse(),
      readUse('/a/x.ts', { offset: 1, limit: 50 }),
      readUse('/a/x.ts', { offset: 900, limit: 20 }),
    ]),
  );
  assert.equal(occurrences.length, 1, 'a windowed re-read of one file is one repeat, not a new first read');
});

test('occurrenceKey classifies Read, Grep and Glob and returns null for every other tool', () => {
  assert.equal(occurrenceKey(READ_TOOL, { file_path: '/a/x.ts' }).kind, KIND_READ);
  assert.equal(occurrenceKey('Grep', { pattern: 'x' }).kind, KIND_SEARCH);
  assert.equal(occurrenceKey('Glob', { pattern: '**/*.ts' }).kind, KIND_SEARCH);
  assert.equal(occurrenceKey('Bash', { command: 'ls /a' }), null);
  assert.equal(occurrenceKey('Edit', { file_path: '/a/x.ts' }), null);
  assert.equal(occurrenceKey(BRIEFING_TOOL, { thread_id: '01M24FHCMWGH0SHARH12CARCZ1' }), null);
  assert.equal(occurrenceKey(READ_TOOL, {}), null);
});

test('two searches that differ in one argument value are not a repeat', () => {
  const occurrences = wentBackOccurrences(
    transcript([
      resumeUse(),
      grepUse({ pattern: 'resume_thread', path: '/a' }),
      grepUse({ pattern: 'resume_thread', path: '/b' }),
    ]),
  );

  assert.deepEqual(occurrences, [], 'a search of a different path is new ground, not going back');
});

test('a sidechain entry is skipped, so a subagent re-read is never charged to the session', () => {
  const text = transcript([resumeUse(), readUse('/a/x.ts'), { ...readUse('/a/x.ts'), isSidechain: true }]);
  const uses = toolUses(text);

  assert.deepEqual(uses.map((use) => use.name), [BRIEFING_TOOL, READ_TOOL]);
  assert.deepEqual(uses[1].input, { file_path: '/a/x.ts' });
  assert.ok(Object.isFrozen(uses), 'the tool use list must be frozen so a reader cannot edit the transcript view');
  assert.deepEqual(wentBackOccurrences(text), [], DEFINITION);
});

test('unparseable and empty transcript lines are skipped rather than throwing', () => {
  const body = transcript([resumeUse(), readUse('/a/x.ts'), readUse('/a/x.ts')]).trimEnd().split('\n');
  const text = ['', 'not json at all', body[0], '   ', '{"message":null}', body[1], '{"type":"assistant"}', body[2], '{', ''].join('\n');

  assert.equal(toolUses(text).length, 3);
  assert.equal(wentBackOccurrences(text).length, 1);
  assert.deepEqual(toolUses(''), []);
  assert.deepEqual(wentBackOccurrences(''), []);
  assert.deepEqual(wentBackOccurrences('\n\n'), []);
});

test('buildWentBackRow returns exactly the seven declared keys and nothing else', () => {
  const row = buildWentBackRow(stopPayload(), { kind: KIND_READ, key: '/a/x.ts' }, FIXED_TS);

  assertRowShape(row);
  assert.equal(row.ts, FIXED_TS);
  assert.equal(row.session_id, SESSION_ID);
  assert.equal(row.cwd, CWD);
  assert.equal(row.went_back_kind, KIND_READ);
  assert.equal(row.went_back_signature, '/a/x.ts');
});

test('the stored signature is sliced to SIGNATURE_MAX while the compared key stays whole', () => {
  const key = `Grep {"pattern":"${'q'.repeat(SIGNATURE_MAX + 60)}"}`;
  const occurrence = { kind: KIND_SEARCH, key };
  const row = buildWentBackRow(stopPayload(), occurrence, FIXED_TS);

  assert.equal(row.went_back_signature.length, SIGNATURE_MAX);
  assert.equal(row.went_back_signature, key.slice(0, SIGNATURE_MAX));
  assert.equal(occurrence.key.length, key.length, 'building a row must not shorten or mutate the occurrence it was given');

  const head = 'z'.repeat(SIGNATURE_MAX + 40);
  const occurrences = wentBackOccurrences(
    transcript([resumeUse(), grepUse({ pattern: `${head}alpha` }), grepUse({ pattern: `${head}omega` })]),
  );
  assert.deepEqual(occurrences, [], 'comparison must use the whole key, never the value sliced for storage');
});

test('end to end, the entrypoint appends one row per occurrence to the monthly corpus', () => {
  const sessionDir = workspace('e2e-transcript');
  const observerDir = workspace('e2e-corpus');
  const transcriptPath = plantTranscript(sessionDir, [
    resumeUse(),
    readUse('/a/x.ts'),
    readUse('/a/x.ts', { offset: 40 }),
    grepUse({ pattern: 'went_back', path: '/a' }),
    grepUse({ path: '/a', pattern: 'went_back' }),
  ]);

  const result = runHook(stopPayload({ transcript_path: transcriptPath }), observerDir);
  assert.equal(result.status, 0, `hook exited ${result.status}: ${result.stderr}`);

  const { files, lines, rows, malformed, unpaired } = readRows(observerDir);
  assert.deepEqual(malformed, [], 'every written line must parse as JSON');
  assert.deepEqual(
    unpaired,
    [],
    'a written value carrying a lone surrogate is JSON that Node parses and DuckDB refuses, and the corpus reader has no ignore_errors to step over it',
  );
  assert.equal(lines.length, 2, `expected one line per occurrence, got ${lines.length}`);
  assert.deepEqual(files, [`${rows[0].ts.slice(0, 7)}.jsonl`], 'the monthly file name must come from the row ts');

  for (const row of rows) {
    assertRowShape(row);
    assert.equal(row.session_id, SESSION_ID);
    assert.equal(row.cwd, CWD);
  }
  assert.deepEqual(rows.map((row) => row.went_back_kind), [KIND_READ, KIND_SEARCH], DEFINITION);
  assert.ok(rows[0].went_back_signature.includes('/a/x.ts'));
  assert.equal(rows[1].went_back_signature, 'Grep {"path":"/a","pattern":"went_back"}');
});

test('end to end, a signature cut at SIGNATURE_MAX never splits a surrogate pair', () => {
  const sessionDir = workspace('e2e-astral-transcript');
  const observerDir = workspace('e2e-astral-corpus');
  const filePath = astralBoundaryPath();
  const key = `${READ_TOOL} ${filePath}`;
  assert.ok(
    LONE_SURROGATE.test(key.slice(0, SIGNATURE_MAX)),
    'the fixture must straddle the SIGNATURE_MAX boundary with a surrogate pair, or it proves nothing',
  );

  const transcriptPath = plantTranscript(sessionDir, [resumeUse(), readUse(filePath), readUse(filePath)]);
  const result = runHook(stopPayload({ transcript_path: transcriptPath }), observerDir);
  assert.equal(result.status, 0, `hook exited ${result.status}: ${result.stderr}`);

  const { lines, rows, malformed, unpaired } = readRows(observerDir);
  assert.deepEqual(malformed, [], 'every written line must parse as JSON');
  assert.equal(lines.length, 1, `expected one line per occurrence, got ${lines.length}`);
  assert.deepEqual(
    unpaired,
    [],
    'half a surrogate pair still passes JSON.parse, so a green Node suite is not evidence the corpus reader can read the row',
  );
  assert.equal(rows[0].went_back_kind, KIND_READ);
  assert.equal([...rows[0].went_back_signature].length, SIGNATURE_MAX, 'the stored signature is cut by code point, not by code unit');
  assert.ok(
    rows[0].went_back_signature.endsWith(ASTRAL_CHAR),
    'a character that straddles the cut is stored whole or dropped, never halved',
  );
});

test('end to end, a payload carrying an agent id writes no rows at all', () => {
  const sessionDir = workspace('e2e-agent-transcript');
  const observerDir = workspace('e2e-agent-corpus');
  const transcriptPath = plantTranscript(sessionDir, [resumeUse(), readUse('/a/x.ts'), readUse('/a/x.ts')]);

  const result = runHook(
    stopPayload({ transcript_path: transcriptPath, agent_id: SUBAGENT_ID }),
    observerDir,
  );
  assert.equal(result.status, 0, `hook exited ${result.status}: ${result.stderr}`);

  const { files, lines } = readRows(observerDir);
  assert.deepEqual(files, [], 'a subagent stop must not create a monthly file');
  assert.equal(lines.length, 0, 'going back is a property of the main session, never of a subagent transcript');
});
