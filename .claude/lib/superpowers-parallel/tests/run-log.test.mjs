import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foldRunManifest, shipDelta, builtDelta, parkDelta, quiescentExitDelta, isIsoInstant } from '../run-log.mjs';
import { buildInitialManifest } from '../recovery.mjs';
import { park } from '../parking.mjs';

const SPEC_CONTENT_HASH = 'a'.repeat(64);

function genesisManifest(msps) {
  return buildInitialManifest({
    logicalRunId: 'a1b2c3d4',
    harnessRunId: null,
    spec: '/spec.md',
    repoRoot: '/repo',
    baseBranch: 'main',
    sourcePrefix: 'mit',
    clusters: [msps.map((m) => m.id)],
    msps,
    specContentHash: SPEC_CONTENT_HASH,
  });
}

const TWO = [
  { id: 'a', title: 'Alpha', rationale: 'alpha rationale', changeType: 'feat', scope: 'alpha', dependsOn: [], fileScope: ['a/**'] },
  { id: 'b', title: 'Bravo', rationale: 'bravo rationale', changeType: 'fix', scope: 'bravo', dependsOn: ['a'], fileScope: ['b/**'] },
];

test('foldRunManifest accepts a legacy pretty single-object manifest verbatim (backward compatible)', () => {
  const manifest = genesisManifest(TWO);
  const pretty = JSON.stringify(manifest, null, 2);
  const folded = foldRunManifest(pretty);
  assert.deepEqual(folded, manifest, 'a pre-existing single-object run.json still folds to itself');
});

test('foldRunManifest accepts a compact genesis-only log (single line, no deltas)', () => {
  const manifest = genesisManifest(TWO);
  const folded = foldRunManifest(JSON.stringify(manifest));
  assert.equal(folded.logicalRunId, 'a1b2c3d4');
  assert.deepEqual(folded.msps.map((m) => m.id), ['a', 'b']);
  assert.ok(folded.msps.every((m) => m.status === 'planned'));
});

test('foldRunManifest folds a compact genesis followed by a ship delta into a shipped entry', () => {
  const manifest = genesisManifest(TWO);
  const log = [
    JSON.stringify(manifest),
    JSON.stringify(shipDelta({ mspId: 'a', prUrl: 'https://x/pr/a', mergedAt: '2026-07-15T00:00:00Z', title: 'Alpha', rationale: 'alpha rationale' })),
  ].join('\n');
  const folded = foldRunManifest(log);
  const a = folded.msps.find((m) => m.id === 'a');
  assert.equal(a.status, 'shipped');
  assert.equal(a.prUrl, 'https://x/pr/a');
  assert.equal(a.mergedAt, '2026-07-15T00:00:00Z');
  const b = folded.msps.find((m) => m.id === 'b');
  assert.equal(b.status, 'planned', 'an unaffected sibling keeps its genesis status');
});

test('foldRunManifest folds a park delta and preserves the persisted triedSet for resume', () => {
  const manifest = genesisManifest(TWO);
  const delta = parkDelta({
    unitId: 'a',
    stage: 'plan',
    diagnosis: 'plan failed',
    request: { kind: 'approve-decision', what: 'plan failed previously' },
    remediation: null,
    resumePoint: { branch: null, ref: 'main', stage: 'plan' },
    triedSet: ['worktree:reset-one', 'worktree:reset-clean'],
  });
  const folded = foldRunManifest([JSON.stringify(manifest), JSON.stringify(delta)].join('\n'));
  const a = folded.msps.find((m) => m.id === 'a');
  assert.equal(a.status, 'parked');
  assert.deepEqual(a.triedSet, ['worktree:reset-one', 'worktree:reset-clean']);
  assert.equal(a.resumePoint.stage, 'plan');
});

test('foldRunManifest is fail-safe: a malformed delta line is skipped, well-formed later deltas still apply', () => {
  const manifest = genesisManifest(TWO);
  const log = [
    JSON.stringify(manifest),
    '{not valid json',
    JSON.stringify(shipDelta({ mspId: 'b', prUrl: 'https://x/pr/b', mergedAt: '2026-07-15T00:00:00Z', title: 'Bravo', rationale: 'bravo rationale' })),
  ].join('\n');
  const folded = foldRunManifest(log);
  assert.equal(folded.msps.find((m) => m.id === 'b').status, 'shipped', 'the well-formed delta after a corrupt line still folds');
});

test('foldRunManifest folds sequential deltas so a later ship never clobbers an earlier one', () => {
  const manifest = genesisManifest(TWO);
  const log = [
    JSON.stringify(manifest),
    JSON.stringify(shipDelta({ mspId: 'a', prUrl: 'https://x/pr/a', mergedAt: '2026-07-15T00:00:00Z', title: 'Alpha', rationale: 'alpha rationale' })),
    JSON.stringify(shipDelta({ mspId: 'b', prUrl: 'https://x/pr/b', mergedAt: '2026-07-15T01:00:00Z', title: 'Bravo', rationale: 'bravo rationale' })),
  ].join('\n');
  const folded = foldRunManifest(log);
  assert.equal(folded.msps.find((m) => m.id === 'a').status, 'shipped', 'the earlier ship survives the later ship');
  assert.equal(folded.msps.find((m) => m.id === 'b').status, 'shipped');
});

test('foldRunManifest degrades to null on a malformed or absent genesis (fresh decompose fallback)', () => {
  assert.equal(foldRunManifest('{not valid json'), null);
  assert.equal(foldRunManifest(''), null);
  assert.equal(foldRunManifest(null), null);
  assert.equal(foldRunManifest('{"just":"an object"}\n{"kind":"ship","mspId":"a"}'), null, 'a leading line that is not a valid manifest degrades to null');
});

test('the delta constructors emit discriminated, single-unit records with no whole-manifest payload', () => {
  assert.deepEqual(
    shipDelta({ mspId: 'a', prUrl: 'u', mergedAt: 't', title: 'T', rationale: 'R' }),
    { kind: 'ship', mspId: 'a', prUrl: 'u', mergedAt: 't', title: 'T', rationale: 'R' },
  );
  assert.deepEqual(
    builtDelta({ unitId: 'a', checkpointRef: 'refs/mitosis/a1b2c3d4/a', sha: null }),
    { kind: 'built', unitId: 'a', checkpointRef: 'refs/mitosis/a1b2c3d4/a', sha: null, green: false, builtAgainst: {} },
  );
  assert.deepEqual(
    builtDelta({ unitId: 'a', checkpointRef: 'r', sha: 'deadbee', green: true, builtAgainst: { p: '1234abc' } }),
    { kind: 'built', unitId: 'a', checkpointRef: 'r', sha: 'deadbee', green: true, builtAgainst: { p: '1234abc' } },
  );
  const pd = parkDelta({ unitId: 'a', stage: 'plan', diagnosis: 'd', request: null, remediation: null, resumePoint: null, triedSet: undefined });
  assert.equal(pd.kind, 'park');
  assert.equal(pd.unitId, 'a');
  assert.deepEqual(pd.triedSet, []);
});

test('foldRunManifest round-trips an engine-produced park delta identically to a live park() call', () => {
  const manifest = genesisManifest(TWO);
  const args = {
    unitId: 'a',
    stage: 'plan',
    diagnosis: 'plan failed',
    request: { kind: 'approve-decision', what: 'x' },
    remediation: null,
    resumePoint: { branch: null, ref: 'main', stage: 'plan' },
    triedSet: ['worktree:reset-one'],
  };
  const live = park(manifest, args);
  const folded = foldRunManifest([JSON.stringify(manifest), JSON.stringify(parkDelta(args))].join('\n'));
  assert.deepEqual(
    folded.msps.find((m) => m.id === 'a'),
    live.msps.find((m) => m.id === 'a'),
    'replaying the persisted park delta reconstructs the same parked entry the live engine held in memory',
  );
});

test('foldRunManifest carries green + builtAgainst from a built delta onto the msp', () => {
  const manifest = genesisManifest(TWO);
  const folded = foldRunManifest([
    JSON.stringify(manifest),
    JSON.stringify(builtDelta({ unitId: 'a', checkpointRef: 'refs/mitosis/a1b2c3d4/a', sha: 'abc1234', green: true, builtAgainst: { seed: 'f00ba12' } })),
  ].join('\n'));
  const a = folded.msps.find((m) => m.id === 'a');
  assert.equal(a.status, 'built');
  assert.equal(a.green, true);
  assert.deepEqual(a.builtAgainst, { seed: 'f00ba12' });
});

test('foldRunManifest treats a legacy window record as inert: it folds no window key and never derails the records after it', () => {
  const manifest = genesisManifest(TWO);
  const folded = foldRunManifest([
    JSON.stringify(manifest),
    JSON.stringify({ kind: 'window', size: 5 }),
    JSON.stringify(quiescentExitDelta({ at: '2026-07-31T10:00:00Z' })),
  ].join('\n'));
  assert.equal(Object.prototype.hasOwnProperty.call(folded, 'window'), false, 'a journal written before the fixed cap still folds, but its window record contributes nothing');
  assert.equal(folded.quiescentExitAt, '2026-07-31T10:00:00Z', 'the unknown record is skipped rather than aborting the fold, so every later record still applies');
  assert.deepEqual(folded.msps.map((m) => m.id), TWO.map((m) => m.id));
});

test('foldRunManifest applies a quiescent-exit delta carrying a real instant, so a later advance can measure the gap', () => {
  const manifest = genesisManifest(TWO);
  const folded = foldRunManifest([JSON.stringify(manifest), JSON.stringify(quiescentExitDelta({ at: '2026-07-31T10:00:00Z' }))].join('\n'));
  assert.equal(folded.quiescentExitAt, '2026-07-31T10:00:00Z');
});

test('foldRunManifest carries whether the recorded exit had work outstanding, so a later advance cannot report post-completion idle time as a human wait', () => {
  const manifest = genesisManifest(TWO);
  const fold = (outstanding) => foldRunManifest([JSON.stringify(manifest), JSON.stringify(quiescentExitDelta({ at: '2026-07-31T10:00:00Z', outstanding }))].join('\n'));
  assert.equal(fold(true).quiescentExitOutstanding, true, 'an exit that stopped with an MSP awaiting a human merge is the case section 3.6 describes, and only that case may be attributed to it');
  assert.equal(fold(false).quiescentExitOutstanding, false, 'an exit with nothing outstanding waited on no human; recording it as outstanding would inflate the number section 3.6 is falsified against');
  assert.equal(fold(undefined).quiescentExitOutstanding, false, 'an omitted flag is read as "nothing outstanding" — absence of evidence must not be promoted to a claimed human wait');
});

test('foldRunManifest REFUSES a quiescent-exit delta whose at is not an ISO-8601 instant, so an unsubstituted prompt placeholder never becomes a durable recorded instant', () => {
  const manifest = genesisManifest(TWO);
  const good = JSON.stringify(quiescentExitDelta({ at: '2026-07-31T10:00:00Z' }));
  for (const rejected of ['<REPLACE-WITH-CURRENT-UTC-ISO-8601-INSTANT>', 'not a date at all', '2026-13-45T99:99:99Z', 'yesterday', '', null]) {
    const folded = foldRunManifest([JSON.stringify(manifest), JSON.stringify(quiescentExitDelta({ at: rejected }))].join('\n'));
    assert.equal(
      Object.prototype.hasOwnProperty.call(folded, 'quiescentExitAt'),
      false,
      `at=${JSON.stringify(rejected)} must leave the manifest with no recorded exit at all — writing it through would let a later advance report it back as the instant a human was waited on`,
    );
    const afterGood = foldRunManifest([JSON.stringify(manifest), good, JSON.stringify(quiescentExitDelta({ at: rejected }))].join('\n'));
    assert.equal(afterGood.quiescentExitAt, '2026-07-31T10:00:00Z', `at=${JSON.stringify(rejected)} must not clobber an instant that WAS recorded: an unreadable line is not evidence the prior exit never happened`);
  }
});

test('isIsoInstant admits the instant forms an agent may legitimately report and rejects everything else', () => {
  for (const ok of ['2026-08-01T12:34:56Z', '2026-08-01T12:34:56.123Z', '2026-08-01T12:34:56+05:30', '2026-08-01T00:00:00-08:00']) {
    assert.equal(isIsoInstant(ok), true, `${ok} is a legitimate ISO-8601 instant`);
  }
  for (const bad of ['2026-08-01', '2026-08-01T12:34Z', '2026-00-01T00:00:00Z', '2026-08-32T00:00:00Z', '2026-08-01T24:00:00Z', ' 2026-08-01T12:34:56Z', 42, null, undefined]) {
    assert.equal(isIsoInstant(bad), false, `${JSON.stringify(bad)} is not an instant the engine may report back as a recorded exit`);
  }
});
