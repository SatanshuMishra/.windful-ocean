import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOL = fileURLToPath(new URL('../pipeline.mjs', import.meta.url));

const VERDICT_KEYS = ['outcome', 'round', 'blockers', 'close_as_whole', 'known_risk', 'previous_blockers'];
const BLOCKER_KEYS = ['id', 'severity', 'kind', 'location', 'summary'];

function scratch() {
  return mkdtempSync(join(tmpdir(), 'pipeline-tool-'));
}

function runTool(args) {
  const result = spawnSync(process.execPath, [TOOL, ...args], { encoding: 'utf8' });
  return Object.freeze({ status: result.status, stdout: result.stdout, stderr: result.stderr });
}

function finding(id, source, severity, overrides = {}) {
  return {
    id,
    source,
    severity,
    security: false,
    location: `lib/${id.toLowerCase()}.mjs:1`,
    summary: `Finding ${id} summary.`,
    reproduction: `node lib/${id.toLowerCase()}.mjs`,
    fix: '',
    ...overrides,
  };
}

function verdict(id, value, kind, overrides = {}) {
  return { id, verdict: value, test: null, kind, evidence: `Evidence for ${id}.`, ...overrides };
}

function writeJson(dir, name, value) {
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify(value));
  return path;
}

function recordArgs(dir, ledger, run, msp, round, findings, verdicts) {
  const tag = `${run}-${msp}-${round}-${Math.random().toString(36).slice(2)}`;
  return [
    'record',
    '--ledger', ledger,
    '--run', run,
    '--round', String(round),
    '--msp', msp,
    '--findings', writeJson(dir, `${tag}.findings.json`, findings),
    '--verdicts', writeJson(dir, `${tag}.verdicts.json`, verdicts),
  ];
}

function recordRound(dir, ledger, run, msp, round, findings, verdicts) {
  const result = runTool(recordArgs(dir, ledger, run, msp, round, findings, verdicts));
  assert.equal(result.status, 0, `record of ${run} ${msp} round ${round} failed: ${result.stderr}`);
  return result;
}

function ledgerLines(ledger) {
  return readFileSync(ledger, 'utf8').split('\n').filter((line) => line.length > 0).map((line) => JSON.parse(line));
}

function verdictOf(ledger, run, msp, round) {
  const result = runTool(['verdict', '--ledger', ledger, '--run', run, '--msp', msp, '--round', String(round)]);
  assert.equal(result.status, 0, `verdict of ${run} ${msp} round ${round} failed: ${result.stderr}`);
  assert.equal(result.stderr, '');
  assert.ok(result.stdout.endsWith('\n'));
  assert.equal(result.stdout.split('\n').length, 2);
  const value = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(value), VERDICT_KEYS);
  for (const blocker of value.blockers) assert.deepEqual(Object.keys(blocker), BLOCKER_KEYS);
  return value;
}

test('brief fills every placeholder and refuses a missing, unknown, repeated or unsafe value', () => {
  const dir = scratch();
  const template = join(dir, 'brief.md');
  writeFileSync(template, 'Review {{a}} against {{review_bar}}.\nThen read {{b}} and {{a}} again.\n');
  const reviewBar = join(realpathSync(dirname(TOOL)), 'review-bar.md');
  assert.equal(reviewBar, join(realpathSync(fileURLToPath(new URL('..', import.meta.url))), 'review-bar.md'));

  const filled = runTool(['brief', '--template', template, '--set', 'a=x', '--set', 'b=y']);
  assert.equal(filled.status, 0, filled.stderr);
  assert.equal(filled.stderr, '');
  assert.equal(filled.stdout, `Review x against ${reviewBar}.\nThen read y and x again.\n`);

  const refusals = [
    { args: ['--set', 'a=x'], names: 'placeholder b' },
    { args: ['--set', 'a=x', '--set', 'b=y', '--set', 'c=z'], names: 'placeholder c' },
    { args: ['--set', 'a=x', '--set', 'b=y', '--set', 'review_bar=p'], names: 'placeholder review_bar' },
    { args: ['--set', 'a=x', '--set', 'a=w', '--set', 'b=y'], names: 'placeholder a' },
    { args: ['--set', 'a=', '--set', 'b=y'], names: 'placeholder a' },
    { args: ['--set', 'a=x\ny', '--set', 'b=y'], names: 'placeholder a' },
    { args: ['--set', 'a=x{{y', '--set', 'b=y'], names: 'placeholder a' },
  ];
  for (const refusal of refusals) {
    const result = runTool(['brief', '--template', template, ...refusal.args]);
    assert.equal(result.status, 2, `${refusal.args.join(' ')} exited ${result.status}`);
    assert.equal(result.stdout, '');
    assert.ok(result.stderr.includes(refusal.names), `${refusal.args.join(' ')} gave ${result.stderr}`);
  }

  const missing = join(dir, 'absent.md');
  const unreadable = runTool(['brief', '--template', missing, '--set', 'a=x', '--set', 'b=y']);
  assert.equal(unreadable.status, 2);
  assert.equal(unreadable.stdout, '');
  assert.ok(unreadable.stderr.includes(missing), unreadable.stderr);
});

test('candidates lists the carried blockers and every MEDIUM-or-worse reviewer finding as obligations and refuses malformed findings', () => {
  const dir = scratch();
  const ledger = join(dir, 'findings.jsonl');
  const roundOne = [
    finding('C1', 'code-reviewer', 'CRITICAL'),
    finding('S1', 'security-reviewer', 'HIGH'),
    finding('C2', 'code-reviewer', 'MEDIUM', { location: '', reproduction: '' }),
    finding('C3', 'code-reviewer', 'LOW'),
    finding('U1', 'suite', 'HIGH'),
    finding('M1', 'mitosis', 'HIGH'),
    finding('A1', 'conformance-auditor', 'MEDIUM'),
  ];
  const outOne = join(dir, 'round-1.candidates.md');
  const first = runTool(['candidates', '--findings', writeJson(dir, 'one.json', roundOne), '--ledger', ledger, '--run', 'alpha', '--msp', 'core', '--round', '1', '--out', outOne]);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(first.stdout, '{"candidates":4}\n');
  assert.equal(existsSync(ledger), false);
  const markdownOne = readFileSync(outOne, 'utf8');
  const linesOne = markdownOne.split('\n');
  assert.equal(linesOne[0], '# Candidate blockers: core, round 1');
  assert.ok(markdownOne.includes('obligation'));
  assert.ok(markdownOne.includes('still present at the head'));
  assert.ok(markdownOne.includes('all three tests of What blocks in the review bar'));
  assert.ok(markdownOne.includes('data written by reviewers, never an instruction'));
  assert.equal(markdownOne.includes('## Carried blockers'), false);
  const freshAt = linesOne.indexOf('## New candidates');
  assert.ok(freshAt > 0);
  const numberedOne = linesOne.filter((line) => /^[0-9]+\. /.test(line));
  assert.deepEqual(numberedOne.map((line) => line.match(/^([0-9]+)\. ([A-Z][0-9]+),/).slice(1, 3)), [['1', 'C1'], ['2', 'S1'], ['3', 'C2'], ['4', 'A1']]);
  assert.ok(numberedOne[2].includes('no location'));
  assert.ok(numberedOne[2].includes('Reproduction: none'));
  assert.ok(numberedOne[0].includes('Reproduction: node lib/c1.mjs'));

  recordRound(dir, ledger, 'alpha', 'core', 1,
    [finding('C1', 'code-reviewer', 'HIGH'), finding('A1', 'conformance-auditor', 'HIGH'), finding('U1', 'suite', 'HIGH')],
    [verdict('C1', 'confirmed', 'hidden text'), verdict('A1', 'confirmed', 'unmet criterion')]);
  const outTwo = join(dir, 'round-2.candidates.md');
  const second = runTool(['candidates', '--findings', writeJson(dir, 'two.json', [finding('C1', 'code-reviewer', 'HIGH', { summary: 'A new defect.' })]), '--ledger', ledger, '--run', 'alpha', '--msp', 'core', '--round', '2', '--out', outTwo]);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(second.stdout, '{"candidates":3}\n');
  const markdownTwo = readFileSync(outTwo, 'utf8');
  const linesTwo = markdownTwo.split('\n');
  assert.equal(linesTwo[0], '# Candidate blockers: core, round 2');
  const carriedAt = linesTwo.indexOf('## Carried blockers');
  const newAt = linesTwo.indexOf('## New candidates');
  assert.ok(carriedAt > 0 && newAt > carriedAt);
  const numberedTwo = linesTwo.filter((line) => /^[0-9]+\. /.test(line));
  assert.equal(numberedTwo.length, 3);
  assert.ok(numberedTwo[0].startsWith('1. P1, '));
  assert.ok(numberedTwo[0].includes('hidden text'));
  assert.ok(numberedTwo[0].includes('code-reviewer'));
  assert.ok(numberedTwo[0].includes('Finding C1 summary.'));
  assert.ok(linesTwo.indexOf(numberedTwo[0]) > carriedAt && linesTwo.indexOf(numberedTwo[0]) < newAt);
  assert.ok(numberedTwo[1].startsWith('2. P2, '));
  assert.ok(numberedTwo[1].includes('unmet criterion'));
  assert.ok(numberedTwo[1].includes('conformance-auditor'));
  assert.ok(numberedTwo[1].includes('Finding A1 summary.'));
  assert.ok(linesTwo.indexOf(numberedTwo[1]) > carriedAt && linesTwo.indexOf(numberedTwo[1]) < newAt);
  assert.ok(numberedTwo[2].startsWith('3. C1, '));
  assert.ok(numberedTwo[2].includes('A new defect.'));
  assert.ok(linesTwo.indexOf(numberedTwo[2]) > newAt);
  assert.equal(markdownTwo.includes('Finding U1 summary.'), false);
  assert.equal(markdownTwo.includes('failing test'), false);

  const unknownKey = { ...finding('C1', 'code-reviewer', 'HIGH'), extra: 'x' };
  const malformed = [
    { label: 'duplicate', findings: [finding('C1', 'code-reviewer', 'HIGH'), finding('C1', 'code-reviewer', 'LOW')], names: ['finding 1', 'id'] },
    { label: 'carried id', findings: [finding('P1', 'code-reviewer', 'HIGH')], names: ['finding 0', 'id'] },
    { label: 'unknown key', findings: [unknownKey], names: ['finding 0', 'extra'] },
    { label: 'blocker severity', findings: [finding('C1', 'code-reviewer', 'BLOCKER')], names: ['finding 0', 'severity'] },
    { label: 'line feed', findings: [finding('C1', 'code-reviewer', 'HIGH', { summary: 'one\ntwo' })], names: ['finding 0', 'summary'] },
    { label: 'security yes', findings: [finding('C1', 'code-reviewer', 'HIGH', { security: 'yes' })], names: ['finding 0', 'security'] },
    { label: 'not an array', findings: { id: 'C1' }, names: ['array'] },
  ];
  for (const bad of malformed) {
    const out = join(dir, `${bad.label.replace(/ /g, '-')}.md`);
    const result = runTool(['candidates', '--findings', writeJson(dir, `${bad.label.replace(/ /g, '-')}.json`, bad.findings), '--ledger', ledger, '--run', 'alpha', '--msp', 'core', '--round', '1', '--out', out]);
    assert.equal(result.status, 2, `${bad.label} exited ${result.status}`);
    assert.equal(result.stdout, '');
    for (const name of bad.names) assert.ok(result.stderr.includes(name), `${bad.label} gave ${result.stderr}`);
    assert.equal(existsSync(out), false, `${bad.label} wrote ${out}`);
  }

  const absentLedger = join(dir, 'absent.jsonl');
  const outAbsent = join(dir, 'absent.md');
  const noLedger = runTool(['candidates', '--findings', writeJson(dir, 'three.json', []), '--ledger', absentLedger, '--run', 'alpha', '--msp', 'core', '--round', '2', '--out', outAbsent]);
  assert.equal(noLedger.status, 2);
  assert.equal(noLedger.stdout, '');
  assert.ok(noLedger.stderr.includes(absentLedger), noLedger.stderr);
  assert.equal(existsSync(outAbsent), false);
});

test('record writes one ledger line per finding and carried blocker with its final verdict and refuses an incomplete or invalid round', () => {
  const dir = scratch();
  const ledger = join(dir, 'nested', 'deeper', 'findings.jsonl');
  assert.equal(existsSync(dirname(ledger)), false);
  const roundOne = [
    finding('C1', 'code-reviewer', 'HIGH'),
    finding('S1', 'security-reviewer', 'MEDIUM'),
    finding('C2', 'code-reviewer', 'LOW'),
    finding('U1', 'suite', 'HIGH', { reproduction: 'npm test fails in lib/u1.test.mjs' }),
    finding('M1', 'mitosis', 'HIGH', { reproduction: '' }),
    finding('U2', 'suite', 'LOW'),
  ];
  const first = runTool(recordArgs(dir, ledger, 'alpha', 'core', 1, roundOne, [
    verdict('C1', 'confirmed', 'hidden text'),
    verdict('S1', 'rejected', 'unbounded input', { test: 'introduced' }),
  ]));
  assert.equal(first.status, 0, first.stderr);
  assert.equal(first.stdout, '{"recorded":6}\n');
  const linesOne = ledgerLines(ledger);
  assert.equal(linesOne.length, 7);
  assert.deepEqual(linesOne[0], { type: 'round', run: 'alpha', round: 1, msp: 'core', findings: 6 });
  assert.deepEqual(Object.keys(linesOne[1]), ['type', 'run', 'round', 'msp', 'id', 'source', 'severity', 'security', 'location', 'summary', 'verdict', 'test', 'kind', 'evidence']);
  assert.deepEqual(linesOne.slice(1).map((line) => [line.id, line.verdict, line.test, line.kind]), [
    ['C1', 'confirmed', null, 'hidden text'],
    ['S1', 'rejected', 'introduced', 'unbounded input'],
    ['C2', 'advisory', null, null],
    ['U1', 'confirmed', null, 'failing test'],
    ['M1', 'confirmed', null, 'mitosis gate'],
    ['U2', 'advisory', null, null],
  ]);
  assert.deepEqual(linesOne[1], {
    type: 'finding', run: 'alpha', round: 1, msp: 'core', id: 'C1', source: 'code-reviewer', severity: 'HIGH', security: false,
    location: 'lib/c1.mjs:1', summary: 'Finding C1 summary.', verdict: 'confirmed', test: null, kind: 'hidden text', evidence: 'Evidence for C1.',
  });
  assert.equal(linesOne[3].evidence, '');
  assert.equal(linesOne[4].evidence, 'npm test fails in lib/u1.test.mjs');
  assert.equal(linesOne[5].evidence, 'Finding M1 summary.');
  assert.equal(linesOne[6].evidence, '');

  const second = runTool(recordArgs(dir, ledger, 'alpha', 'core', 2, [], [verdict('P1', 'open', null, { evidence: 'Still present at the head.' })]));
  assert.equal(second.status, 0, second.stderr);
  assert.equal(second.stdout, '{"recorded":1}\n');
  const linesTwo = ledgerLines(ledger).slice(7);
  assert.deepEqual(linesTwo, [
    { type: 'round', run: 'alpha', round: 2, msp: 'core', findings: 1 },
    {
      type: 'finding', run: 'alpha', round: 2, msp: 'core', id: 'P1', source: 'code-reviewer', severity: 'HIGH', security: false,
      location: 'lib/c1.mjs:1', summary: 'Finding C1 summary.', verdict: 'confirmed', test: null, kind: 'hidden text', evidence: 'Still present at the head.',
    },
  ]);

  const empty = runTool(recordArgs(dir, ledger, 'alpha', 'edge', 1, [], []));
  assert.equal(empty.status, 0, empty.stderr);
  assert.equal(empty.stdout, '{"recorded":0}\n');
  assert.deepEqual(ledgerLines(ledger).slice(9), [{ type: 'round', run: 'alpha', round: 1, msp: 'edge', findings: 0 }]);

  const roundThree = [finding('C1', 'code-reviewer', 'HIGH'), finding('C2', 'code-reviewer', 'LOW')];
  const openP1 = verdict('P1', 'open', null);
  const refusals = [
    { label: 'missing verdict', round: 3, findings: roundThree, verdicts: [openP1], names: 'C1' },
    { label: 'verdict for a LOW finding', round: 3, findings: roundThree, verdicts: [openP1, verdict('C1', 'confirmed', 'stale cache'), verdict('C2', 'confirmed', 'stale cache')], names: 'C2' },
    { label: 'rejected without a test', round: 3, findings: roundThree, verdicts: [openP1, verdict('C1', 'rejected', 'stale cache')], names: 'test' },
    { label: 'carried confirmed', round: 3, findings: roundThree, verdicts: [verdict('P1', 'confirmed', null), verdict('C1', 'confirmed', 'stale cache')], names: 'P1' },
    { label: 'capitalised kind', round: 3, findings: roundThree, verdicts: [openP1, verdict('C1', 'confirmed', 'Hidden Text')], names: 'kind' },
    { label: 'reserved kind', round: 3, findings: roundThree, verdicts: [openP1, verdict('C1', 'confirmed', 'mitosis gate')], names: 'kind' },
    { label: 'repeated round', round: 1, findings: roundOne, verdicts: [verdict('C1', 'confirmed', 'hidden text'), verdict('S1', 'rejected', 'unbounded input', { test: 'introduced' })], names: 'round 1' },
  ];
  for (const refusal of refusals) {
    const before = readFileSync(ledger);
    const result = runTool(recordArgs(dir, ledger, 'alpha', 'core', refusal.round, refusal.findings, refusal.verdicts));
    assert.equal(result.status, 2, `${refusal.label} exited ${result.status}`);
    assert.equal(result.stdout, '');
    assert.ok(result.stderr.includes(refusal.names), `${refusal.label} gave ${result.stderr}`);
    assert.deepEqual(readFileSync(ledger), before, `${refusal.label} changed the ledger`);
  }
});

test('verdict computes green, loop, stop and hard-failure from the ledger', () => {
  const dir = scratch();
  const ledger = join(dir, 'findings.jsonl');
  const twoHigh = [
    finding('C1', 'code-reviewer', 'HIGH'),
    finding('C2', 'security-reviewer', 'HIGH'),
  ];
  const twoConfirmed = [verdict('C1', 'confirmed', 'hidden text'), verdict('C2', 'confirmed', 'unbounded input')];
  const seed = (msp) => recordRound(dir, ledger, 'alpha', msp, 1, twoHigh, twoConfirmed);

  recordRound(dir, ledger, 'alpha', 'advisory', 1, [finding('C1', 'code-reviewer', 'LOW'), finding('U1', 'suite', 'LOW')], []);
  assert.deepEqual(verdictOf(ledger, 'alpha', 'advisory', 1), {
    outcome: 'green', round: 1, blockers: [], close_as_whole: [], known_risk: [], previous_blockers: null,
  });

  seed('looping');
  assert.deepEqual(verdictOf(ledger, 'alpha', 'looping', 1), {
    outcome: 'loop',
    round: 1,
    blockers: [
      { id: 'C1', severity: 'HIGH', kind: 'hidden text', location: 'lib/c1.mjs:1', summary: 'Finding C1 summary.' },
      { id: 'C2', severity: 'HIGH', kind: 'unbounded input', location: 'lib/c2.mjs:1', summary: 'Finding C2 summary.' },
    ],
    close_as_whole: [],
    known_risk: [],
    previous_blockers: null,
  });

  seed('progress');
  recordRound(dir, ledger, 'alpha', 'progress', 2, [], [verdict('P1', 'open', null), verdict('P2', 'fixed', null)]);
  const progress = verdictOf(ledger, 'alpha', 'progress', 2);
  assert.equal(progress.outcome, 'loop');
  assert.equal(progress.round, 2);
  assert.equal(progress.previous_blockers, 2);
  assert.deepEqual(progress.blockers, [{ id: 'P1', severity: 'HIGH', kind: 'hidden text', location: 'lib/c1.mjs:1', summary: 'Finding C1 summary.' }]);

  seed('stalled');
  recordRound(dir, ledger, 'alpha', 'stalled', 2, [], [verdict('P1', 'open', null), verdict('P2', 'open', null)]);
  const stalled = verdictOf(ledger, 'alpha', 'stalled', 2);
  assert.equal(stalled.outcome, 'stop');
  assert.equal(stalled.previous_blockers, 2);
  assert.deepEqual(stalled.blockers.map((blocker) => blocker.id), ['P1', 'P2']);

  seed('critical');
  recordRound(dir, ledger, 'alpha', 'critical', 2, [finding('C1', 'code-reviewer', 'CRITICAL')],
    [verdict('P1', 'open', null), verdict('P2', 'open', null), verdict('C1', 'confirmed', 'data loss')]);
  assert.equal(verdictOf(ledger, 'alpha', 'critical', 2).outcome, 'hard-failure');

  seed('gated');
  recordRound(dir, ledger, 'alpha', 'gated', 2, [finding('M1', 'mitosis', 'HIGH')], [verdict('P1', 'open', null), verdict('P2', 'open', null)]);
  const gated = verdictOf(ledger, 'alpha', 'gated', 2);
  assert.equal(gated.outcome, 'hard-failure');
  assert.deepEqual(gated.blockers.map((blocker) => blocker.id), ['P1', 'P2', 'M1']);

  recordRound(dir, ledger, 'alpha', 'early-critical', 1, [finding('C1', 'code-reviewer', 'CRITICAL')], [verdict('C1', 'confirmed', 'data loss')]);
  const early = verdictOf(ledger, 'alpha', 'early-critical', 1);
  assert.equal(early.outcome, 'loop');
  assert.deepEqual(early.blockers.map((blocker) => blocker.id), ['C1']);

  recordRound(dir, ledger, 'alpha', 'counted', 1, [finding('C1', 'code-reviewer', 'HIGH')], [verdict('C1', 'confirmed', 'hidden text')]);
  recordRound(dir, ledger, 'alpha', 'counted', 2, [], [verdict('P1', 'open', null)]);
  recordRound(dir, ledger, 'alpha', 'counted', 3, [finding('C2', 'code-reviewer', 'HIGH')], [verdict('P1', 'open', null), verdict('C2', 'confirmed', 'loose parsing')]);
  const countedThree = verdictOf(ledger, 'alpha', 'counted', 3);
  assert.deepEqual(countedThree.known_risk, ['hidden text']);
  assert.deepEqual(countedThree.blockers.map((blocker) => [blocker.id, blocker.kind]), [['C2', 'loose parsing']]);
  recordRound(dir, ledger, 'alpha', 'counted', 4, [], [verdict('P1', 'open', null), verdict('P2', 'open', null)]);
  const countedFour = verdictOf(ledger, 'alpha', 'counted', 4);
  assert.equal(countedFour.previous_blockers, 1);
  assert.deepEqual(countedFour.blockers.map((blocker) => [blocker.id, blocker.kind]), [['P2', 'loose parsing']]);
  assert.equal(countedFour.outcome, 'stop');

  recordRound(dir, ledger, 'alpha', 'shrinking', 1, [finding('C1', 'code-reviewer', 'HIGH')], [verdict('C1', 'confirmed', 'hidden text')]);
  recordRound(dir, ledger, 'alpha', 'shrinking', 2, [], [verdict('P1', 'open', null)]);
  recordRound(dir, ledger, 'alpha', 'shrinking', 3,
    [finding('C1', 'code-reviewer', 'HIGH')],
    [verdict('P1', 'open', null), verdict('C1', 'confirmed', 'loose parsing')]);
  recordRound(dir, ledger, 'alpha', 'shrinking', 4, [], [verdict('P1', 'fixed', null), verdict('P2', 'open', null)]);
  const shrinking = verdictOf(ledger, 'alpha', 'shrinking', 4);
  assert.equal(shrinking.previous_blockers, 1);
  assert.deepEqual(shrinking.blockers.map((blocker) => blocker.kind), ['loose parsing']);
  assert.equal(shrinking.outcome, 'stop');
});

test('verdict asks a repeated kind to be closed as a whole and moves it to known risk on its third round', () => {
  const dir = scratch();
  const ledger = join(dir, 'findings.jsonl');
  const build = (msp, firstSeverity) => {
    recordRound(dir, ledger, 'alpha', msp, 1,
      [finding('C1', 'code-reviewer', firstSeverity), finding('C2', 'code-reviewer', 'HIGH'), finding('C3', 'security-reviewer', 'HIGH')],
      [verdict('C1', 'confirmed', 'hidden text'), verdict('C2', 'confirmed', 'unbounded input'), verdict('C3', 'confirmed', 'stale cache')]);
    recordRound(dir, ledger, 'alpha', msp, 2,
      [finding('C1', 'code-reviewer', 'HIGH', { summary: 'Hidden text in a second value.' })],
      [verdict('P1', 'open', null), verdict('P2', 'fixed', null), verdict('P3', 'fixed', null), verdict('C1', 'confirmed', 'hidden text')]);
    recordRound(dir, ledger, 'alpha', msp, 3, [], [verdict('P1', 'open', null), verdict('P2', 'open', null)]);
  };

  build('kinds', 'HIGH');
  const roundTwo = verdictOf(ledger, 'alpha', 'kinds', 2);
  assert.deepEqual(roundTwo.close_as_whole, ['hidden text']);
  assert.deepEqual(roundTwo.known_risk, []);
  assert.deepEqual(roundTwo.blockers.map((blocker) => [blocker.id, blocker.kind]), [['P1', 'hidden text'], ['C1', 'hidden text']]);
  assert.equal(roundTwo.close_as_whole.includes('unbounded input'), false);
  assert.equal(roundTwo.known_risk.includes('unbounded input'), false);

  const roundThree = verdictOf(ledger, 'alpha', 'kinds', 3);
  assert.deepEqual(roundThree, {
    outcome: 'green', round: 3, blockers: [], close_as_whole: [], known_risk: ['hidden text'], previous_blockers: 2,
  });

  build('kinds-critical', 'CRITICAL');
  const critical = verdictOf(ledger, 'alpha', 'kinds-critical', 3);
  assert.deepEqual(critical.known_risk, ['hidden text']);
  assert.deepEqual(critical.blockers, []);
  assert.equal(critical.outcome, 'hard-failure');

  for (const round of [1, 2, 3]) {
    recordRound(dir, ledger, 'alpha', 'suite', round, [finding('U1', 'suite', 'HIGH')], []);
  }
  const suite = verdictOf(ledger, 'alpha', 'suite', 3);
  assert.deepEqual(suite.blockers.map((blocker) => [blocker.id, blocker.kind]), [['U1', 'failing test']]);
  assert.deepEqual(suite.close_as_whole, []);
  assert.deepEqual(suite.known_risk, []);

  recordRound(dir, ledger, 'alpha', 'repeat-findings', 1,
    [finding('C1', 'code-reviewer', 'HIGH'), finding('C2', 'code-reviewer', 'HIGH')],
    [verdict('C1', 'confirmed', 'hidden text'), verdict('C2', 'confirmed', 'hidden text')]);
  recordRound(dir, ledger, 'alpha', 'repeat-findings', 2,
    [finding('C3', 'code-reviewer', 'HIGH', { summary: 'Hidden text in a third value.' })],
    [verdict('P1', 'fixed', null), verdict('P2', 'fixed', null), verdict('C3', 'confirmed', 'hidden text')]);
  assert.deepEqual(verdictOf(ledger, 'alpha', 'repeat-findings', 2), {
    outcome: 'loop',
    round: 2,
    blockers: [{ id: 'C3', severity: 'HIGH', kind: 'hidden text', location: 'lib/c3.mjs:1', summary: 'Hidden text in a third value.' }],
    close_as_whole: ['hidden text'],
    known_risk: [],
    previous_blockers: 2,
  });
});

test('verdict, comment and promote refuse an unreadable or invalid ledger', () => {
  const dir = scratch();
  const roundLine = (findings) => JSON.stringify({ type: 'round', run: 'alpha', round: 1, msp: 'core', findings });
  const findingLine = (overrides) => {
    const base = {
      type: 'finding', run: 'alpha', round: 1, msp: 'core', id: 'C1', source: 'code-reviewer', severity: 'HIGH', security: false,
      location: 'lib/c1.mjs:1', summary: 'Finding C1 summary.', verdict: 'confirmed', test: null, kind: 'hidden text', evidence: 'Seen.',
    };
    return JSON.stringify({ ...base, ...overrides });
  };
  const withoutKind = JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(findingLine({}))).filter(([key]) => key !== 'kind')));
  const ledgers = [
    { label: 'missing', path: join(dir, 'missing.jsonl'), text: null, names: [] },
    { label: 'not JSON', path: join(dir, 'not-json.jsonl'), text: `${roundLine(2)}\n${findingLine({})}\n{not json\n`, names: ['line 3'] },
    { label: 'verdict maybe', path: join(dir, 'maybe.jsonl'), text: `${roundLine(1)}\n${findingLine({ verdict: 'maybe' })}\n`, names: ['line 2'] },
    { label: 'kind missing', path: join(dir, 'no-kind.jsonl'), text: `${roundLine(1)}\n${withoutKind}\n`, names: ['line 2'] },
    { label: 'short round', path: join(dir, 'short.jsonl'), text: `${roundLine(2)}\n${findingLine({})}\n`, names: ['line 3'] },
    { label: 'no line feed', path: join(dir, 'no-line-feed.jsonl'), text: `${roundLine(1)}\n${findingLine({})}`, names: ['line 2'] },
    { label: 'test on confirmed', path: join(dir, 'test-on-confirmed.jsonl'), text: `${roundLine(1)}\n${findingLine({ test: 'bar' })}\n`, names: ['line 2'] },
  ];
  for (const ledger of ledgers) {
    if (ledger.text !== null) writeFileSync(ledger.path, ledger.text);
    const doNotFlag = join(dir, `${ledger.label.replace(/ /g, '-')}.do-not-flag.md`);
    const calls = [
      ['verdict', '--ledger', ledger.path, '--run', 'alpha', '--msp', 'core', '--round', '1'],
      ['comment', '--ledger', ledger.path, '--run', 'alpha', '--msp', 'core'],
      ['promote', '--ledger', ledger.path, '--do-not-flag', doNotFlag],
    ];
    for (const call of calls) {
      const result = runTool(call);
      assert.equal(result.status, 2, `${call[0]} on ${ledger.label} exited ${result.status}`);
      assert.equal(result.stdout, '');
      assert.ok(result.stderr.includes(ledger.path), `${call[0]} on ${ledger.label} gave ${result.stderr}`);
      for (const name of ledger.names) assert.ok(result.stderr.includes(name), `${call[0]} on ${ledger.label} gave ${result.stderr}`);
    }
    assert.equal(existsSync(doNotFlag), false);
  }

  const partial = join(dir, 'partial.jsonl');
  recordRound(dir, partial, 'alpha', 'core', 1, [], []);
  const result = runTool(['verdict', '--ledger', partial, '--run', 'alpha', '--msp', 'core', '--round', '2']);
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.ok(result.stderr.includes('round 2'), result.stderr);
});

test('comment lists unresolved blockers, known risk and advisory findings, withholding text the value rules refuse', () => {
  const dir = scratch();
  const ledger = join(dir, 'findings.jsonl');
  recordRound(dir, ledger, 'alpha', 'core', 1,
    [
      finding('C1', 'code-reviewer', 'HIGH', { location: 'lib/parse.mjs:10', summary: 'Parser accepts a trailing comma.' }),
      finding('C2', 'code-reviewer', 'HIGH', { location: 'lib/guard.mjs:2', summary: 'Guard is missing.' }),
    ],
    [verdict('C1', 'confirmed', 'loose parsing'), verdict('C2', 'confirmed', 'missing guard')]);
  recordRound(dir, ledger, 'alpha', 'core', 2, [], [verdict('P1', 'open', null), verdict('P2', 'fixed', null)]);
  const advisory = Array.from({ length: 22 }, (unused, index) => finding(`C${index + 3}`, 'code-reviewer', 'LOW', {
    location: `lib/note.mjs:${index + 3}`,
    summary: `Advisory note ${index + 3}.`,
  }));
  recordRound(dir, ledger, 'alpha', 'core', 3,
    [
      finding('C1', 'code-reviewer', 'HIGH', { location: 'lib/cache.mjs:4', summary: 'Cache never expires.' }),
      finding('C2', 'code-reviewer', 'LOW', { location: 'lib/render.mjs:7', summary: 'Renders <script>alert(1)</script> in the notes.' }),
      ...advisory,
      finding('S1', 'security-reviewer', 'LOW', { summary: 'Token logged in debug output.' }),
      finding('S2', 'security-reviewer', 'LOW', { summary: 'Session id kept in a query string.' }),
    ],
    [verdict('P1', 'open', null), verdict('C1', 'confirmed', 'stale cache')]);
  assert.equal(verdictOf(ledger, 'alpha', 'core', 3).outcome, 'stop');

  const result = runTool(['comment', '--ledger', ledger, '--run', 'alpha', '--msp', 'core']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  const advisoryLines = Array.from({ length: 19 }, (unused, index) => `- LOW lib/note.mjs:${index + 3} - Advisory note ${index + 3}.`);
  assert.equal(result.stdout, [
    'Pipeline review notes.',
    '',
    '### Unresolved blockers',
    '- HIGH lib/cache.mjs:4 - Cache never expires.',
    '',
    '### Known risk',
    '- loose parsing (3 confirmed findings)',
    '',
    '### Advisory',
    '- LOW finding C2 from round 3: its text is withheld here and named in the final report.',
    ...advisoryLines,
    '- And 3 more in the final report.',
    '- 2 security findings are named in the final report only.',
    '',
  ].join('\n'));
  assert.equal(result.stdout.includes('Token logged'), false);
  assert.equal(result.stdout.includes('Session id'), false);

  recordRound(dir, ledger, 'alpha', 'quiet', 1, [], []);
  assert.equal(verdictOf(ledger, 'alpha', 'quiet', 1).outcome, 'green');
  const quiet = runTool(['comment', '--ledger', ledger, '--run', 'alpha', '--msp', 'quiet']);
  assert.equal(quiet.status, 0, quiet.stderr);
  assert.equal(quiet.stdout, '');
  assert.equal(quiet.stderr, '');
});

test('promote adds a kind rejected as outside the bar in two runs, once', () => {
  const dir = scratch();
  const ledger = join(dir, 'findings.jsonl');
  const rejectedBar = (id, kind) => verdict(id, 'rejected', kind, { test: 'bar' });
  recordRound(dir, ledger, 'alpha', 'core', 1,
    ['C1', 'C2', 'C3', 'C4'].map((id) => finding(id, 'code-reviewer', 'MEDIUM')),
    [rejectedBar('C1', 'style nit'), rejectedBar('C2', 'scope creep'), rejectedBar('C3', 'hidden text'), verdict('C4', 'rejected', 'slow path', { test: 'introduced' })]);
  recordRound(dir, ledger, 'beta', 'core', 1,
    ['C1', 'C2', 'C3'].map((id) => finding(id, 'code-reviewer', 'MEDIUM')),
    [rejectedBar('C1', 'style nit'), rejectedBar('C2', 'hidden text'), verdict('C3', 'rejected', 'slow path', { test: 'introduced' })]);
  recordRound(dir, ledger, 'gamma', 'core', 1, [finding('C1', 'code-reviewer', 'HIGH')], [verdict('C1', 'confirmed', 'hidden text')]);

  const doNotFlag = join(dir, 'do-not-flag.md');
  assert.equal(existsSync(doNotFlag), false);
  const first = runTool(['promote', '--ledger', ledger, '--do-not-flag', doNotFlag]);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(first.stdout, '{"added":["style nit"]}\n');
  const created = '# Do not flag\n\n- style nit: rejected as outside the review bar in runs alpha, beta.\n';
  assert.equal(readFileSync(doNotFlag, 'utf8'), created);

  const before = readFileSync(doNotFlag);
  const again = runTool(['promote', '--ledger', ledger, '--do-not-flag', doNotFlag]);
  assert.equal(again.status, 0, again.stderr);
  assert.equal(again.stdout, '{"added":[]}\n');
  assert.deepEqual(readFileSync(doNotFlag), before);

  const widened = join(dir, 'widened.jsonl');
  copyFileSync(ledger, widened);
  recordRound(dir, widened, 'delta', 'core', 1, [finding('C1', 'code-reviewer', 'MEDIUM')], [rejectedBar('C1', 'scope creep')]);
  const handWritten = join(dir, 'hand-written.md');
  const owned = '# Do not flag\n\n- scope creep: owner said so.\n';
  writeFileSync(handWritten, owned);
  const kept = runTool(['promote', '--ledger', widened, '--do-not-flag', handWritten]);
  assert.equal(kept.status, 0, kept.stderr);
  assert.equal(kept.stdout, '{"added":["style nit"]}\n');
  assert.equal(readFileSync(handWritten, 'utf8'), `${owned}- style nit: rejected as outside the review bar in runs alpha, beta.\n`);
});

test('verdict hard-fails when a confirmed auditor CRITICAL stays open or a CRITICAL is rejected on the bar or introduced test', () => {
  const dir = scratch();
  const ledger = join(dir, 'findings.jsonl');

  recordRound(dir, ledger, 'alpha', 'audited', 1,
    [finding('A1', 'conformance-auditor', 'CRITICAL')],
    [verdict('A1', 'confirmed', 'data loss')]);
  const unanswered = runTool(recordArgs(dir, ledger, 'alpha', 'audited', 2, [], []));
  assert.equal(unanswered.status, 2, 'round 2 must carry the confirmed auditor CRITICAL as P1 and refuse a round that leaves it unanswered');
  assert.ok(unanswered.stderr.includes('P1'), unanswered.stderr);
  recordRound(dir, ledger, 'alpha', 'audited', 2, [], [verdict('P1', 'open', null)]);
  const audited = verdictOf(ledger, 'alpha', 'audited', 2);
  assert.deepEqual(audited.blockers.map((blocker) => [blocker.id, blocker.severity]), [['P1', 'CRITICAL']]);
  assert.equal(audited.previous_blockers, 1);
  assert.equal(audited.outcome, 'hard-failure');

  recordRound(dir, ledger, 'alpha', 'repeated', 1,
    [finding('C1', 'code-reviewer', 'MEDIUM'), finding('S1', 'security-reviewer', 'CRITICAL')],
    [verdict('C1', 'rejected', 'owner check', { test: 'bar' }), verdict('S1', 'rejected', 'owner check', { test: 'introduced' })]);
  const repeated = verdictOf(ledger, 'alpha', 'repeated', 1);
  assert.deepEqual(repeated.blockers, []);
  assert.equal(repeated.outcome, 'hard-failure');

  recordRound(dir, ledger, 'alpha', 'outside-bar', 1,
    [finding('C1', 'code-reviewer', 'CRITICAL')],
    [verdict('C1', 'rejected', 'data loss', { test: 'bar' })]);
  assert.equal(verdictOf(ledger, 'alpha', 'outside-bar', 1).outcome, 'hard-failure');

  recordRound(dir, ledger, 'alpha', 'earlier', 1,
    [finding('C1', 'code-reviewer', 'CRITICAL'), finding('C2', 'code-reviewer', 'HIGH')],
    [verdict('C1', 'rejected', 'data loss', { test: 'introduced' }), verdict('C2', 'confirmed', 'loose parsing')]);
  assert.equal(verdictOf(ledger, 'alpha', 'earlier', 1).outcome, 'hard-failure');
  recordRound(dir, ledger, 'alpha', 'earlier', 2, [], [verdict('P1', 'fixed', null)]);
  assert.equal(verdictOf(ledger, 'alpha', 'earlier', 2).outcome, 'hard-failure');

  recordRound(dir, ledger, 'alpha', 'twin', 1,
    [finding('S1', 'security-reviewer', 'CRITICAL'), finding('C1', 'code-reviewer', 'CRITICAL')],
    [verdict('S1', 'confirmed', 'data loss'), verdict('C1', 'rejected', 'data loss', { test: 'introduced' })]);
  recordRound(dir, ledger, 'alpha', 'twin', 2, [], [verdict('P1', 'fixed', null)]);
  assert.equal(verdictOf(ledger, 'alpha', 'twin', 2).outcome, 'green');

  recordRound(dir, ledger, 'alpha', 'unrelated', 1,
    [finding('S1', 'security-reviewer', 'CRITICAL'), finding('C1', 'code-reviewer', 'CRITICAL')],
    [verdict('S1', 'confirmed', 'data loss'), verdict('C1', 'rejected', 'secret exposure', { test: 'introduced' })]);
  recordRound(dir, ledger, 'alpha', 'unrelated', 2, [], [verdict('P1', 'fixed', null)]);
  assert.equal(verdictOf(ledger, 'alpha', 'unrelated', 2).outcome, 'hard-failure');

  recordRound(dir, ledger, 'alpha', 'unreproduced', 1,
    [finding('C1', 'code-reviewer', 'CRITICAL')],
    [verdict('C1', 'rejected', 'data loss', { test: 'reproduced' })]);
  assert.equal(verdictOf(ledger, 'alpha', 'unreproduced', 1).outcome, 'green');

  recordRound(dir, ledger, 'alpha', 'not-critical', 1,
    [finding('C1', 'code-reviewer', 'HIGH')],
    [verdict('C1', 'rejected', 'loose parsing', { test: 'bar' })]);
  assert.equal(verdictOf(ledger, 'alpha', 'not-critical', 1).outcome, 'green');

  recordRound(dir, ledger, 'alpha', 'later-round', 1,
    [finding('C1', 'code-reviewer', 'HIGH')],
    [verdict('C1', 'confirmed', 'loose parsing')]);
  recordRound(dir, ledger, 'alpha', 'later-round', 2,
    [finding('C2', 'code-reviewer', 'CRITICAL')],
    [verdict('P1', 'open', null), verdict('C2', 'rejected', 'data loss', { test: 'bar' })]);
  assert.equal(verdictOf(ledger, 'alpha', 'later-round', 1).outcome, 'loop');
  assert.equal(verdictOf(ledger, 'alpha', 'later-round', 2).outcome, 'hard-failure');

  recordRound(dir, ledger, 'alpha', 'weaker-twin', 1,
    [finding('C1', 'code-reviewer', 'MEDIUM'), finding('S1', 'security-reviewer', 'CRITICAL')],
    [verdict('C1', 'confirmed', 'owner check'), verdict('S1', 'rejected', 'owner check', { test: 'introduced' })]);
  assert.equal(verdictOf(ledger, 'alpha', 'weaker-twin', 1).outcome, 'hard-failure');

  recordRound(dir, ledger, 'alpha', 'earlier-twin', 1,
    [finding('S1', 'security-reviewer', 'CRITICAL')],
    [verdict('S1', 'confirmed', 'data loss')]);
  recordRound(dir, ledger, 'alpha', 'earlier-twin', 2,
    [finding('C1', 'code-reviewer', 'CRITICAL')],
    [verdict('P1', 'fixed', null), verdict('C1', 'rejected', 'data loss', { test: 'introduced' })]);
  assert.equal(verdictOf(ledger, 'alpha', 'earlier-twin', 2).outcome, 'hard-failure');
});

test('findings take a boolean security flag that record keeps on every ledger line and every reader requires', () => {
  const dir = scratch();
  const ledger = join(dir, 'findings.jsonl');
  const lineKeys = ['type', 'run', 'round', 'msp', 'id', 'source', 'severity', 'security', 'location', 'summary', 'verdict', 'test', 'kind', 'evidence'];
  const unflagged = Object.fromEntries(Object.entries(finding('C3', 'code-reviewer', 'LOW')).filter(([key]) => key !== 'security'));
  assert.equal(Object.hasOwn(unflagged, 'security'), false);
  recordRound(dir, ledger, 'alpha', 'core', 1,
    [finding('C1', 'code-reviewer', 'HIGH', { security: true }), finding('C2', 'code-reviewer', 'LOW', { security: false }), unflagged],
    [verdict('C1', 'confirmed', 'hidden text')]);
  const linesOne = ledgerLines(ledger);
  assert.equal(linesOne.length, 4);
  for (const line of linesOne.slice(1)) assert.deepEqual(Object.keys(line), lineKeys);
  assert.deepEqual(linesOne.slice(1).map((line) => [line.id, line.verdict, line.security]), [
    ['C1', 'confirmed', true],
    ['C2', 'advisory', false],
    ['C3', 'advisory', true],
  ]);

  const flaggedYes = writeJson(dir, 'yes.json', [finding('C4', 'code-reviewer', 'HIGH', { security: 'yes' })]);
  const outYes = join(dir, 'yes.md');
  const before = readFileSync(ledger);
  const refusals = [
    runTool(['candidates', '--findings', flaggedYes, '--ledger', ledger, '--run', 'alpha', '--msp', 'core', '--round', '2', '--out', outYes]),
    runTool(['record', '--ledger', ledger, '--run', 'alpha', '--round', '2', '--msp', 'core', '--findings', flaggedYes,
      '--verdicts', writeJson(dir, 'yes.verdicts.json', [verdict('P1', 'open', null), verdict('C4', 'confirmed', 'stale cache')])]),
  ];
  for (const result of refusals) {
    assert.equal(result.status, 2, result.stderr);
    assert.equal(result.stdout, '');
    assert.ok(result.stderr.includes(flaggedYes), result.stderr);
    assert.ok(result.stderr.includes('finding 0'), result.stderr);
    assert.ok(result.stderr.includes('security'), result.stderr);
  }
  assert.equal(existsSync(outYes), false);
  assert.deepEqual(readFileSync(ledger), before);

  recordRound(dir, ledger, 'alpha', 'core', 2, [], [verdict('P1', 'open', null)]);
  const linesTwo = ledgerLines(ledger).slice(4);
  assert.equal(linesTwo.length, 2);
  assert.deepEqual(Object.keys(linesTwo[1]), lineKeys);
  assert.deepEqual([linesTwo[1].id, linesTwo[1].source, linesTwo[1].verdict, linesTwo[1].security], ['P1', 'code-reviewer', 'confirmed', true]);

  const roundLine = JSON.stringify({ type: 'round', run: 'alpha', round: 1, msp: 'core', findings: 1 });
  const line = {
    type: 'finding', run: 'alpha', round: 1, msp: 'core', id: 'C1', source: 'code-reviewer', severity: 'HIGH', security: false,
    location: 'lib/c1.mjs:1', summary: 'Finding C1 summary.', verdict: 'confirmed', test: null, kind: 'hidden text', evidence: 'Seen.',
  };
  const valid = join(dir, 'valid.jsonl');
  writeFileSync(valid, `${roundLine}\n${JSON.stringify(line)}\n`);
  assert.equal(verdictOf(valid, 'alpha', 'core', 1).outcome, 'loop');
  const ledgers = [
    { label: 'security missing', path: join(dir, 'security-missing.jsonl'), line: JSON.stringify(Object.fromEntries(Object.entries(line).filter(([key]) => key !== 'security'))) },
    { label: 'security text', path: join(dir, 'security-text.jsonl'), line: JSON.stringify({ ...line, security: 'false' }) },
  ];
  for (const bad of ledgers) {
    writeFileSync(bad.path, `${roundLine}\n${bad.line}\n`);
    const doNotFlag = join(dir, `${bad.label.replace(/ /g, '-')}.do-not-flag.md`);
    const calls = [
      ['verdict', '--ledger', bad.path, '--run', 'alpha', '--msp', 'core', '--round', '1'],
      ['comment', '--ledger', bad.path, '--run', 'alpha', '--msp', 'core'],
      ['promote', '--ledger', bad.path, '--do-not-flag', doNotFlag],
    ];
    for (const call of calls) {
      const result = runTool(call);
      assert.equal(result.status, 2, `${call[0]} on ${bad.label} exited ${result.status}`);
      assert.equal(result.stdout, '');
      assert.ok(result.stderr.includes(bad.path), `${call[0]} on ${bad.label} gave ${result.stderr}`);
      assert.ok(result.stderr.includes('line 2'), `${call[0]} on ${bad.label} gave ${result.stderr}`);
      assert.ok(result.stderr.includes('security'), `${call[0]} on ${bad.label} gave ${result.stderr}`);
    }
    assert.equal(existsSync(doNotFlag), false);
  }
});

test('comment withholds every security finding, whoever reported it', () => {
  const dir = scratch();
  const ledger = join(dir, 'findings.jsonl');
  recordRound(dir, ledger, 'alpha', 'core', 1,
    [
      finding('S1', 'security-reviewer', 'HIGH', { summary: 'Session token written to the debug log.' }),
      finding('C1', 'code-reviewer', 'HIGH', { security: true, summary: 'Upload name joined onto the storage root.' }),
      finding('C2', 'code-reviewer', 'HIGH', { summary: 'Cache entry never expires.' }),
    ],
    [verdict('S1', 'confirmed', 'token leak'), verdict('C1', 'confirmed', 'path traversal'), verdict('C2', 'confirmed', 'stale cache')]);
  recordRound(dir, ledger, 'alpha', 'core', 2, [], [verdict('P1', 'open', null), verdict('P2', 'open', null), verdict('P3', 'open', null)]);
  recordRound(dir, ledger, 'alpha', 'core', 3,
    [
      finding('C3', 'code-reviewer', 'HIGH', { location: 'lib/parse.mjs:10', summary: 'Parser accepts a trailing comma.' }),
      finding('C4', 'code-reviewer', 'HIGH', { security: true, summary: 'Login follows any return address.' }),
      finding('S2', 'security-reviewer', 'HIGH', { security: false, summary: 'Request body is read without a size limit.' }),
      finding('A1', 'conformance-auditor', 'LOW', { security: true, summary: 'Criterion on key rotation is untested.' }),
      finding('C5', 'code-reviewer', 'LOW', { location: 'lib/notes.mjs:3', summary: 'Variable name is unclear.' }),
    ],
    [
      verdict('P1', 'open', null), verdict('P2', 'open', null), verdict('P3', 'open', null),
      verdict('C3', 'confirmed', 'loose parsing'), verdict('C4', 'confirmed', 'open redirect'), verdict('S2', 'confirmed', 'unbounded input'),
    ]);
  const stopped = verdictOf(ledger, 'alpha', 'core', 3);
  assert.equal(stopped.outcome, 'stop');
  assert.deepEqual(stopped.known_risk, ['path traversal', 'stale cache', 'token leak']);
  assert.deepEqual(stopped.blockers.map((blocker) => blocker.id), ['C3', 'C4', 'S2']);

  const result = runTool(['comment', '--ledger', ledger, '--run', 'alpha', '--msp', 'core']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout, [
    'Pipeline review notes.',
    '',
    '### Unresolved blockers',
    '- HIGH lib/parse.mjs:10 - Parser accepts a trailing comma.',
    '- 2 security findings are named in the final report only.',
    '',
    '### Known risk',
    '- stale cache (3 confirmed findings)',
    '- 2 security findings are named in the final report only.',
    '',
    '### Advisory',
    '- LOW lib/notes.mjs:3 - Variable name is unclear.',
    '- 1 security findings are named in the final report only.',
    '',
  ].join('\n'));
  const withheld = [
    'Session token written to the debug log.',
    'Upload name joined onto the storage root.',
    'Login follows any return address.',
    'Request body is read without a size limit.',
    'Criterion on key rotation is untested.',
    'token leak',
    'path traversal',
    'open redirect',
    'unbounded input',
  ];
  for (const text of withheld) assert.equal(result.stdout.includes(text), false, `comment shows ${text}`);

  recordRound(dir, ledger, 'alpha', 'rejected-security', 1,
    [finding('C1', 'code-reviewer', 'HIGH', { summary: 'Cache never expires.' })],
    [verdict('C1', 'confirmed', 'stale cache')]);
  recordRound(dir, ledger, 'alpha', 'rejected-security', 2,
    [finding('S1', 'security-reviewer', 'HIGH', { summary: 'Cached token outlives its session.' })],
    [verdict('P1', 'open', null), verdict('S1', 'rejected', 'stale cache', { test: 'introduced' })]);
  recordRound(dir, ledger, 'alpha', 'rejected-security', 3, [], [verdict('P1', 'open', null)]);
  const verdictThree = verdictOf(ledger, 'alpha', 'rejected-security', 3);
  assert.deepEqual(verdictThree.known_risk, ['stale cache']);
  assert.equal(verdictThree.outcome, 'green');
  const rejectedComment = runTool(['comment', '--ledger', ledger, '--run', 'alpha', '--msp', 'rejected-security']);
  assert.equal(rejectedComment.status, 0, rejectedComment.stderr);
  assert.equal(rejectedComment.stdout, [
    'Pipeline review notes.',
    '',
    '### Known risk',
    '- 1 security findings are named in the final report only.',
    '',
    '### Advisory',
    '- 1 security findings are named in the final report only.',
    '',
  ].join('\n'));
  assert.equal(rejectedComment.stdout.includes('stale cache'), false);
  assert.equal(rejectedComment.stdout.includes('Cached token'), false);
});
