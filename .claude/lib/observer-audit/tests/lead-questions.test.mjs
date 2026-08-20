import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXIT } from '../contract.mjs';

const LIB_DIR = fileURLToPath(new URL('..', import.meta.url));

function scratch(label) {
  return mkdtempSync(join(tmpdir(), `lead-questions-${label}-`));
}

function writeRoster(dir, names) {
  const rosterDir = join(dir, 'roster');
  mkdirSync(rosterDir, { recursive: true });
  for (const name of names) writeFileSync(join(rosterDir, `${name}.md`), `---\nname: ${name}\n---\nsynthetic fixture\n`);
  return rosterDir;
}

function writeRetiredRoster(dir, { retiring = ['debugger'] } = {}) {
  const retiredRosterPath = join(dir, 'retired-roster.json');
  writeFileSync(retiredRosterPath, JSON.stringify({ retired: retiring }));
  return retiredRosterPath;
}

function row({ ts, event, sessionId, agentId, agentType, depth = 1 }) {
  return JSON.stringify({
    ts,
    subject: 'agent',
    event,
    session_id: sessionId,
    cwd: '/w',
    agent_id: agentId,
    agent_type: agentType,
    agent_transcript_path: event === 'SubagentStop' ? `/t/${agentId}.jsonl` : null,
    parent_agent_id: null,
    depth,
  });
}

function pairRows(sessionId, agentId, agentType, startTs, stopTs, depth = 1) {
  return [
    row({ ts: startTs, event: 'SubagentStart', sessionId, agentId, agentType, depth }),
    row({ ts: stopTs, event: 'SubagentStop', sessionId, agentId, agentType, depth }),
  ];
}

function writeEvents(dir, rows) {
  mkdirSync(join(dir, 'events'), { recursive: true });
  writeFileSync(join(dir, 'events', '2026-10.jsonl'), `${rows.join('\n')}\n`);
}

function ask(id, dir, options = {}) {
  const args = [join(LIB_DIR, 'run.mjs'), id, '--log-root', dir];
  if (options.roster !== undefined) args.push('--roster', options.roster);
  if (options.barPct !== undefined) args.push('--bar-pct', String(options.barPct));
  if (options.minN !== undefined) args.push('--min-n', String(options.minN));
  if (options.retiredRoster !== undefined) args.push('--retired-roster', options.retiredRoster);
  const result = spawnSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const parsed = (() => {
    try {
      return JSON.parse(result.stdout);
    } catch {
      return null;
    }
  })();
  return { code: result.status, stdout: result.stdout, stderr: result.stderr, json: parsed };
}

function cleanFixtureDir() {
  const dir = scratch('clean');
  const roster = writeRoster(dir, ['implementer', 'code-reviewer']);
  const retiredRoster = writeRetiredRoster(dir);
  writeEvents(dir, [
    ...pairRows('s1', 'a-lead', 'architect', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:05.000Z'),
    ...pairRows('s1', 'a-roster', 'implementer', '2026-10-01T00:01:00.000Z', '2026-10-01T00:01:05.000Z'),
    ...pairRows('s1', 'a-fallback', 'general-purpose', '2026-10-01T00:02:00.000Z', '2026-10-01T00:02:05.000Z'),
    ...pairRows('s1', 'a-retired', 'debugger', '2026-10-01T00:03:00.000Z', '2026-10-01T00:03:05.000Z'),
  ]);
  return { dir, roster, retiredRoster };
}

test('agent-type-census answers cleanly when every observed agent_type classifies', () => {
  const { dir, roster, retiredRoster } = cleanFixtureDir();
  const got = ask('agent-type-census', dir, { roster, retiredRoster });
  assert.equal(got.code, EXIT.OK, got.stderr);
  assert.ok(got.json, 'expected a JSON answer');
  assert.equal(got.json.rows.length, 4);
  const byType = new Map(got.json.rows.map((r) => [r.agent_type, r]));
  assert.deepEqual(byType.get('architect'), { agent_type: 'architect', category: 'lead', lead: true, dispatch_groups: 1 });
  assert.deepEqual(byType.get('implementer'), { agent_type: 'implementer', category: 'roster-non-lead', lead: false, dispatch_groups: 1 });
  assert.deepEqual(byType.get('general-purpose'), { agent_type: 'general-purpose', category: 'declared-fallback', lead: false, dispatch_groups: 1 });
  assert.deepEqual(byType.get('debugger'), { agent_type: 'debugger', category: 'retired-roster', lead: false, dispatch_groups: 1 });
  rmSync(dir, { recursive: true, force: true });
});

test('agent-type-census USAGE: exit 2 when --retired-roster is missing, with no default silently substituted', () => {
  const dir = scratch('no-retired-spec');
  const roster = writeRoster(dir, ['implementer']);
  writeEvents(dir, pairRows('s1', 'a-lead', 'architect', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:05.000Z'));
  const got = ask('agent-type-census', dir, { roster });
  assert.equal(got.code, EXIT.USAGE, got.stdout);
  assert.match(got.stderr, /--retired-roster is required and has no default/);
  rmSync(dir, { recursive: true, force: true });
});

test('agent-type-census USAGE: exit 2 when --retired-roster names a file the JSON reader cannot parse', () => {
  const dir = scratch('bad-retired-roster');
  const roster = writeRoster(dir, ['implementer']);
  const badRetiredRoster = join(dir, 'bad-retired-roster.json');
  writeFileSync(badRetiredRoster, 'this is not JSON at all\n');
  writeEvents(dir, pairRows('s1', 'a-lead', 'architect', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:05.000Z'));
  const got = ask('agent-type-census', dir, { roster, retiredRoster: badRetiredRoster });
  assert.equal(got.code, EXIT.USAGE, got.stdout);
  assert.match(got.stderr, /--retired-roster names .* which could not be parsed/);
  rmSync(dir, { recursive: true, force: true });
});

test('HALT trigger 1: agent-type-census hard-halts on a value reaching none of C1-C4, naming it verbatim, no stdout, exit 6', () => {
  const dir = scratch('unclassifiable');
  const roster = writeRoster(dir, ['implementer']);
  const retiredRoster = writeRetiredRoster(dir);
  writeEvents(dir, pairRows('s1', 'a-mystery', 'totally-unknown-agent', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:05.000Z'));
  const got = ask('agent-type-census', dir, { roster, retiredRoster });
  assert.equal(got.code, EXIT.CENSUS_HALT, got.stdout);
  assert.equal(got.stdout, '', 'a halt must never emit stdout, even partial JSON');
  assert.match(got.stderr, /^AGENT-TYPE CENSUS HALT/);
  assert.ok(got.stderr.includes('totally-unknown-agent'), got.stderr);
  rmSync(dir, { recursive: true, force: true });
});

test('HALT trigger 2: agent-type-census hard-halts on a NULL agent_type, distinguished from the literal sentinel string', () => {
  const dir = scratch('null-type');
  const roster = writeRoster(dir, ['implementer']);
  const retiredRoster = writeRetiredRoster(dir);
  writeEvents(dir, pairRows('s1', 'a-null', null, '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:05.000Z'));
  const got = ask('agent-type-census', dir, { roster, retiredRoster });
  assert.equal(got.code, EXIT.CENSUS_HALT, got.stdout);
  assert.equal(got.stdout, '');
  assert.match(got.stderr, /^AGENT-TYPE CENSUS HALT/);
  assert.match(got.stderr, /NULL agent_type/);
  rmSync(dir, { recursive: true, force: true });
});

test('HALT trigger 3: agent-type-census hard-halts on a group whose rows disagree on agent_type, naming its session_id and agent_id', () => {
  const dir = scratch('mixed-type');
  const roster = writeRoster(dir, ['implementer', 'code-reviewer']);
  const retiredRoster = writeRetiredRoster(dir);
  writeEvents(dir, [
    row({ ts: '2026-10-01T00:00:00.000Z', event: 'SubagentStart', sessionId: 's1', agentId: 'a-mixed', agentType: 'implementer' }),
    row({ ts: '2026-10-01T00:00:05.000Z', event: 'SubagentStop', sessionId: 's1', agentId: 'a-mixed', agentType: 'code-reviewer' }),
  ]);
  const got = ask('agent-type-census', dir, { roster, retiredRoster });
  assert.equal(got.code, EXIT.CENSUS_HALT, got.stdout);
  assert.equal(got.stdout, '');
  assert.match(got.stderr, /^AGENT-TYPE CENSUS HALT/);
  assert.ok(got.stderr.includes('session_id=s1'), got.stderr);
  assert.ok(got.stderr.includes('agent_id=a-mixed'), got.stderr);
  rmSync(dir, { recursive: true, force: true });
});

test('the agent-type census halt message opens with a phrase distinct from the key-shape census', () => {
  const dir = scratch('distinct-phrase');
  const roster = writeRoster(dir, ['implementer']);
  const retiredRoster = writeRetiredRoster(dir);
  writeEvents(dir, pairRows('s1', 'a-mystery', 'totally-unknown-agent', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:05.000Z'));
  const got = ask('agent-type-census', dir, { roster, retiredRoster });
  assert.equal(got.code, EXIT.CENSUS_HALT);
  assert.doesNotMatch(got.stderr, /the key census halts on an event shape/, 'the agent-type census must never be mistaken for the key-shape census');
  const keyCensusGot = ask('blocked', dir, { roster });
  assert.equal(keyCensusGot.code, EXIT.OK, 'the same corpus must not also break the key-shape census, or the test cannot tell which one fired');
  rmSync(dir, { recursive: true, force: true });
});

function straddleFixtureDir() {
  const dir = scratch('straddle');
  const roster = writeRoster(dir, ['implementer']);
  const retiredRoster = writeRetiredRoster(dir);
  writeEvents(dir, [
    ...pairRows('s1', 'a-lead-1', 'architect', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:05.000Z'),
    ...pairRows('s1', 'a-lead-2', 'investigator', '2026-10-01T00:01:00.000Z', '2026-10-01T00:01:05.000Z'),
    ...pairRows('s1', 'a-roster', 'implementer', '2026-10-01T00:02:00.000Z', '2026-10-01T00:02:05.000Z'),
    ...pairRows('s1', 'a-mystery', 'totally-unknown-agent', '2026-10-01T00:03:00.000Z', '2026-10-01T00:03:05.000Z'),
  ]);
  return { dir, roster, retiredRoster };
}

test('lead-share PASS: exit 0 when both bounds fall at or above the bar, and the unclassifiable set is enumerated by name', () => {
  const { dir, roster, retiredRoster } = straddleFixtureDir();
  const got = ask('lead-share', dir, { roster, retiredRoster, barPct: 40, minN: 1 });
  assert.equal(got.code, EXIT.OK, got.stderr);
  assert.equal(got.json.n, 4);
  assert.equal(got.json.lead_dispatch_groups, 2);
  assert.equal(got.json.min_share_pct, 50);
  assert.equal(got.json.max_share_pct, 75);
  assert.equal(got.json.decision, 'at-or-above-bar');
  assert.deepEqual(got.json.unclassifiable, ['"totally-unknown-agent" carried by 1 dispatch group(s)']);
  rmSync(dir, { recursive: true, force: true });
});

test('lead-share decides below the bar (also exit 0) when both bounds fall under it', () => {
  const { dir, roster, retiredRoster } = straddleFixtureDir();
  const got = ask('lead-share', dir, { roster, retiredRoster, barPct: 80, minN: 1 });
  assert.equal(got.code, EXIT.OK, got.stderr);
  assert.equal(got.json.decision, 'below-bar');
  rmSync(dir, { recursive: true, force: true });
});

test('lead-share REFUSE: exit 6 naming the values to classify when the bar sits inside the band', () => {
  const { dir, roster, retiredRoster } = straddleFixtureDir();
  const got = ask('lead-share', dir, { roster, retiredRoster, barPct: 60, minN: 1 });
  assert.equal(got.code, EXIT.CENSUS_HALT, got.stdout);
  assert.equal(got.stdout, '');
  assert.match(got.stderr, /LEAD-SHARE REFUSAL/);
  assert.match(got.stderr, /\[50\.00%, 75\.00%\]/);
  assert.ok(got.stderr.includes('totally-unknown-agent'), got.stderr);
  rmSync(dir, { recursive: true, force: true });
});

test('lead-share REFUSE: exit 6 when n falls under the declared --min-n floor', () => {
  const { dir, roster, retiredRoster } = straddleFixtureDir();
  const got = ask('lead-share', dir, { roster, retiredRoster, barPct: 40, minN: 1000 });
  assert.equal(got.code, EXIT.CENSUS_HALT, got.stdout);
  assert.match(got.stderr, /LEAD-SHARE REFUSAL/);
  assert.match(got.stderr, /under the declared floor --min-n 1000/);
  rmSync(dir, { recursive: true, force: true });
});

test('lead-share USAGE: exit 2 when --bar-pct is missing, with no default silently substituted', () => {
  const { dir, roster, retiredRoster } = straddleFixtureDir();
  const got = ask('lead-share', dir, { roster, retiredRoster, minN: 1 });
  assert.equal(got.code, EXIT.USAGE, got.stderr);
  assert.match(got.stderr, /--bar-pct is required and has no default/);
  rmSync(dir, { recursive: true, force: true });
});

test('lead-share USAGE: exit 2 when --min-n is unparseable', () => {
  const { dir, roster, retiredRoster } = straddleFixtureDir();
  const got = ask('lead-share', dir, { roster, retiredRoster, barPct: 40, minN: 'not-a-number' });
  assert.equal(got.code, EXIT.USAGE, got.stderr);
  assert.match(got.stderr, /--min-n must be a finite number/);
  rmSync(dir, { recursive: true, force: true });
});

test('dispatchGroupAgentTypesSql denominator: sum(dispatch_groups) equals the true number of dispatch groups', async () => {
  const { dispatchGroupAgentTypesSql } = await import('../lead-questions.mjs');
  const { query, requireBinary } = await import('../duckdb.mjs');
  const { dir } = cleanFixtureDir();
  const binary = requireBinary();
  const rows = query(binary, dispatchGroupAgentTypesSql(dir));
  const n = rows.reduce((sum, row) => sum + Number(row.dispatch_groups), 0);
  assert.equal(n, 4, 'the fixture carries four distinct (session_id, agent_id) dispatch groups');
  rmSync(dir, { recursive: true, force: true });
});

test('lead-share USAGE: exit 2 when --bar-pct is an empty string, never coerced to 0 and never a silent PASS', () => {
  const { dir, roster, retiredRoster } = straddleFixtureDir();
  const got = ask('lead-share', dir, { roster, retiredRoster, barPct: '', minN: 1 });
  assert.equal(got.code, EXIT.USAGE, got.stdout);
  assert.equal(got.stdout, '', 'a usage rejection must never emit a JSON answer, blank or otherwise');
  assert.match(got.stderr, /--bar-pct is required and has no default/);
  rmSync(dir, { recursive: true, force: true });
});

test('lead-share USAGE: exit 2 when --bar-pct is whitespace only', () => {
  const { dir, roster, retiredRoster } = straddleFixtureDir();
  const got = ask('lead-share', dir, { roster, retiredRoster, barPct: '   ', minN: 1 });
  assert.equal(got.code, EXIT.USAGE, got.stdout);
  assert.match(got.stderr, /--bar-pct is required and has no default/);
  rmSync(dir, { recursive: true, force: true });
});

test('lead-share USAGE: exit 2 when --bar-pct is above 100', () => {
  const { dir, roster, retiredRoster } = straddleFixtureDir();
  const got = ask('lead-share', dir, { roster, retiredRoster, barPct: 1000, minN: 1 });
  assert.equal(got.code, EXIT.USAGE, got.stdout);
  assert.match(got.stderr, /--bar-pct must be between 0 and 100 inclusive, got "1000"/);
  rmSync(dir, { recursive: true, force: true });
});

test('lead-share USAGE: exit 2 when --bar-pct is negative', () => {
  const { dir, roster, retiredRoster } = straddleFixtureDir();
  const got = ask('lead-share', dir, { roster, retiredRoster, barPct: -10, minN: 1 });
  assert.equal(got.code, EXIT.USAGE, got.stdout);
  assert.match(got.stderr, /--bar-pct must be between 0 and 100 inclusive, got "-10"/);
  rmSync(dir, { recursive: true, force: true });
});

test('lead-share USAGE: exit 2 when --min-n is 0', () => {
  const { dir, roster, retiredRoster } = straddleFixtureDir();
  const got = ask('lead-share', dir, { roster, retiredRoster, barPct: 40, minN: 0 });
  assert.equal(got.code, EXIT.USAGE, got.stdout);
  assert.match(got.stderr, /--min-n must be an integer of at least 1, got "0"/);
  rmSync(dir, { recursive: true, force: true });
});

test('lead-share USAGE: exit 2 when --min-n is not an integer', () => {
  const { dir, roster, retiredRoster } = straddleFixtureDir();
  const got = ask('lead-share', dir, { roster, retiredRoster, barPct: 40, minN: 1.5 });
  assert.equal(got.code, EXIT.USAGE, got.stdout);
  assert.match(got.stderr, /--min-n must be an integer of at least 1, got "1.5"/);
  rmSync(dir, { recursive: true, force: true });
});

function stopOnlyMixedFixtureDir() {
  const dir = scratch('stop-only-mixed');
  const roster = writeRoster(dir, ['implementer']);
  const retiredRoster = writeRetiredRoster(dir);
  writeEvents(dir, [
    ...pairRows('s1', 'a-lead', 'architect', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:05.000Z'),
    ...pairRows('s1', 'a-roster', 'implementer', '2026-10-01T00:01:00.000Z', '2026-10-01T00:01:05.000Z'),
    row({ ts: '2026-10-01T00:02:05.000Z', event: 'SubagentStop', sessionId: 's1', agentId: 'a-stop-only', agentType: 'implementer' }),
  ]);
  return { dir, roster, retiredRoster };
}

test('lead-share REFUSAL: exit 6 naming zero dispatch groups, never NaN, when every dispatch-population group is stop-only', () => {
  const dir = scratch('n-zero');
  const roster = writeRoster(dir, ['implementer']);
  const retiredRoster = writeRetiredRoster(dir);
  writeEvents(dir, [row({ ts: '2026-10-01T00:00:05.000Z', event: 'SubagentStop', sessionId: 's1', agentId: 'a-stop-only', agentType: 'implementer' })]);
  const got = ask('lead-share', dir, { roster, retiredRoster, barPct: 40, minN: 1 });
  assert.equal(got.code, EXIT.CENSUS_HALT, got.stdout);
  assert.equal(got.stdout, '');
  assert.match(got.stderr, /LEAD-SHARE REFUSAL/);
  assert.match(got.stderr, /n=0 dispatch groups/);
  assert.doesNotMatch(got.stderr, /NaN/, 'a zero-n refusal must name the cause, never let NaN leak into the message');
  rmSync(dir, { recursive: true, force: true });
});

test('agent-type-census reports a stop-only group as its own coverage fact, never folded into the classified population', () => {
  const { dir, roster, retiredRoster } = stopOnlyMixedFixtureDir();
  const got = ask('agent-type-census', dir, { roster, retiredRoster });
  assert.equal(got.code, EXIT.OK, got.stderr);
  assert.equal(got.json.stop_only_groups, 1);
  const totalClassified = got.json.rows.reduce((sum, r) => sum + r.dispatch_groups, 0);
  assert.equal(totalClassified, 2, 'the stop-only group must not be silently dropped into the classified count');
  rmSync(dir, { recursive: true, force: true });
});

test('lead-share n resolves to the START-bearing grain: a stop-only group is excluded from n and reported separately', () => {
  const { dir, roster, retiredRoster } = stopOnlyMixedFixtureDir();
  const got = ask('lead-share', dir, { roster, retiredRoster, barPct: 40, minN: 1 });
  assert.equal(got.code, EXIT.OK, got.stderr);
  assert.equal(got.json.n, 2, 'n must count only the two start-bearing groups, not the stop-only third group');
  assert.equal(got.json.stop_only_groups, 1);
  rmSync(dir, { recursive: true, force: true });
});

function agreementFixtureDir() {
  const dir = scratch('agreement');
  const roster = writeRoster(dir, ['implementer']);
  const retiredRoster = writeRetiredRoster(dir);
  writeEvents(dir, [
    ...pairRows('s1', 'a-lead-1', 'architect', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:05.000Z'),
    ...pairRows('s1', 'a-lead-2', 'investigator', '2026-10-01T00:01:00.000Z', '2026-10-01T00:01:05.000Z'),
    ...pairRows('s1', 'a-roster', 'implementer', '2026-10-01T00:02:00.000Z', '2026-10-01T00:02:05.000Z'),
    row({ ts: '2026-10-01T00:03:05.000Z', event: 'SubagentStop', sessionId: 's1', agentId: 'a-stop-only', agentType: 'implementer' }),
  ]);
  return { dir, roster, retiredRoster };
}

test('AGREEMENT INVARIANT: lead-share n equals the sum of ran-and-duration dispatches over the dispatch population, on a shared fixture', () => {
  const { dir, roster, retiredRoster } = agreementFixtureDir();
  const leadShare = ask('lead-share', dir, { roster, retiredRoster, barPct: 40, minN: 1 });
  assert.equal(leadShare.code, EXIT.OK, leadShare.stderr);
  const ranAndDuration = ask('ran-and-duration', dir, {});
  assert.equal(ranAndDuration.code, EXIT.OK, ranAndDuration.stderr);
  const summedDispatches = ranAndDuration.json.rows
    .filter((r) => r.population === 'dispatch')
    .reduce((sum, r) => sum + Number(r.dispatches), 0);
  assert.equal(
    leadShare.json.n,
    summedDispatches,
    'lead-share and ran-and-duration must define "dispatch" identically at the population denominator: one Start-bearing (session_id, agent_id) group',
  );
  assert.equal(leadShare.json.n, 3, 'three of the four groups in this fixture carry a Start; the fourth is stop-only and excluded from both');
  rmSync(dir, { recursive: true, force: true });
});
