import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { foldRunManifest, shipDelta, builtDelta, parkDelta, quiescentExitDelta, isIsoInstant, ciAttemptDelta } from '../run-log.mjs';
import { buildInitialManifest } from '../recovery.mjs';
import { park, selectResumeUnits, selectResumeBuilt } from '../parking.mjs';
import * as unitState from '../unit-state.mjs';

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
  assert.deepEqual(folded, { ...manifest, foldRefusals: [] }, 'a pre-existing single-object run.json still folds to itself, plus an empty foldRefusals: no deltas ran, so nothing was refused');
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
  assert.notStrictEqual(a.disposition, null, 'the park still records a disposition');
  assert.strictEqual(a.status, unitState.legacyStatusOf(a.progress), 'the legacy status mirror stays exact');
  assert.deepEqual(a.triedSet, ['worktree:reset-one', 'worktree:reset-clean']);
  assert.equal(a.resumePoint.stage, 'plan');
});

test('foldRunManifest folds a ci-attempt delta onto triedSet WITHOUT parking the unit, so a run interrupted mid-CI-loop still carries what it already spent', () => {
  const manifest = genesisManifest(TWO);
  const log = [
    JSON.stringify(manifest),
    JSON.stringify(builtDelta({ unitId: 'a', checkpointRef: 'refs/mitosis/a1b2c3d4/a', sha: 'c'.repeat(40), green: true, builtAgainst: {} })),
    JSON.stringify(ciAttemptDelta({ unitId: 'a', fingerprint: 'ci-published:pr' })),
    JSON.stringify(ciAttemptDelta({ unitId: 'a', fingerprint: 'ci-probe:rerun' })),
    JSON.stringify(ciAttemptDelta({ unitId: 'a', fingerprint: 'ci-probe:rerun' })),
  ].join('\n');
  const folded = foldRunManifest(log);
  const a = folded.msps.find((m) => m.id === 'a');
  assert.equal(a.status, 'built', 'recording an attempt never parks the unit; only a park does that');
  assert.deepEqual(a.triedSet, ['ci-published:pr', 'ci-probe:rerun'], 'attempts accumulate and deduplicate');
  const b = folded.msps.find((m) => m.id === 'b');
  assert.equal(b.status, 'planned', 'an unaffected sibling is untouched');
});

test('foldRunManifest records every ci attempt in a park-immune field, so a LATER park that carries an empty triedSet cannot erase the published-head marker', () => {
  const manifest = genesisManifest(TWO);
  const log = [
    JSON.stringify(manifest),
    JSON.stringify(builtDelta({ unitId: 'b', checkpointRef: 'refs/mitosis/a1b2c3d4/b', sha: 'c'.repeat(40), green: true, builtAgainst: {} })),
    JSON.stringify(ciAttemptDelta({ unitId: 'b', fingerprint: 'ci-published:pr' })),
    JSON.stringify(ciAttemptDelta({ unitId: 'b', fingerprint: 'ci-fix:abcd1234' })),
    JSON.stringify(parkDelta({
      unitId: 'b',
      stage: 'plan',
      diagnosis: 'b was invalidated by a divergent parent merge',
      request: { kind: 'approve-decision', what: 'rebuild required' },
      remediation: null,
      resumePoint: { branch: 'mit/b-integration', ref: 'main', stage: 'plan' },
      triedSet: [],
      dependents: [],
    })),
  ].join('\n');
  const folded = foldRunManifest(log);
  const b = folded.msps.find((m) => m.id === 'b');
  assert.notStrictEqual(b.disposition, null, 'the divergent-invalidation park lands on the unit that already spent ci attempts, and it is still recorded as parked');
  assert.strictEqual(b.status, unitState.legacyStatusOf(b.progress), 'the legacy status mirror stays exact — the earlier built record is not clobbered by the later park');
  assert.deepEqual(b.triedSet, [], 'park owns triedSet and replaces it wholesale, which is why the marker cannot live there alone');
  assert.deepEqual(b.ciAttempts, ['ci-published:pr', 'ci-fix:abcd1234'],
    'the attempt record survives, so a relaunch still sees that this head was published and does not spend a fresh cap on it');
});

test('foldRunManifest ignores a ci-attempt delta that names an unknown unit or a malformed fingerprint, so a forged line cannot seed the resume set', () => {
  const manifest = genesisManifest(TWO);
  const folded = foldRunManifest([
    JSON.stringify(manifest),
    JSON.stringify(ciAttemptDelta({ unitId: 'a', fingerprint: 'no-colon-here' })),
    JSON.stringify(ciAttemptDelta({ unitId: 'a', fingerprint: 'ci-fix:has a space' })),
    JSON.stringify(ciAttemptDelta({ unitId: 'a', fingerprint: 'ci-fix:has/a/slash' })),
    JSON.stringify(ciAttemptDelta({ unitId: 'a', fingerprint: 42 })),
    JSON.stringify(ciAttemptDelta({ unitId: 'nonesuch', fingerprint: 'ci-probe:rerun' })),
    JSON.stringify(ciAttemptDelta({ unitId: 'a', fingerprint: 'ci-fix:abcd1234' })),
  ].join('\n'));
  const a = folded.msps.find((m) => m.id === 'a');
  assert.deepEqual(a.triedSet, ['ci-fix:abcd1234'], 'only the well-formed token survives the fold');
  assert.equal(folded.msps.length, 2, 'an unknown unit id adds no unit');
});

test('foldRunManifest ignores a delta line that parses to a non-object JSON value (null, a number, a string, a boolean, or an array), so a corrupt record can never mutate state or crash the fold', () => {
  const manifest = genesisManifest(TWO);
  const shipLine = JSON.stringify(shipDelta({ mspId: 'a', prUrl: 'https://x/pr/a', mergedAt: '2026-07-15T00:00:00Z', title: 'Alpha', rationale: 'alpha rationale' }));
  const cleanFold = foldRunManifest([JSON.stringify(manifest), shipLine].join('\n'));
  for (const malformed of [null, 42, 'not-a-record', true, ['ship']]) {
    const folded = foldRunManifest([JSON.stringify(manifest), JSON.stringify(malformed), shipLine].join('\n'));
    assert.deepEqual(folded, cleanFold, `a delta line of ${JSON.stringify(malformed)} must contribute nothing to the fold, and must not crash it`);
  }
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

test('parkDelta carries blockedBy only for a named blocker, so a blank or absent one never becomes a durable edge to nothing', () => {
  const base = { unitId: 'beta', stage: null, diagnosis: 'blocked-by-parked-prerequisite', request: null, remediation: null, resumePoint: null, triedSet: [] };
  const record = { kind: 'park', ...base };
  assert.deepStrictEqual(
    parkDelta({ ...base, blockedBy: 'a' }),
    { ...record, blockedBy: 'a' },
    'a one-character blocker id is a named blocker and is carried verbatim',
  );
  assert.deepStrictEqual(
    parkDelta({ ...base, blockedBy: 'alpha' }),
    { ...record, blockedBy: 'alpha' },
  );
  assert.deepStrictEqual(parkDelta({ ...base, blockedBy: '' }), record);
  assert.deepStrictEqual(parkDelta({ ...base, blockedBy: undefined }), record);
  assert.deepStrictEqual(Object.keys(parkDelta({ ...base, blockedBy: '' })), Object.keys(record));
});

test('foldRunManifest round-trips an engine-produced park delta identically to a live park() call, once the legacy-progress floor only the fold pipeline establishes is accounted for', () => {
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
  const liveA = live.msps.find((m) => m.id === 'a');
  const foldedA = folded.msps.find((m) => m.id === 'a');
  const { progress: liveProgress, ...liveRest } = liveA;
  const { progress: foldedProgress, ...foldedRest } = foldedA;
  assert.deepEqual(
    foldedRest,
    liveRest,
    'apart from the legacy-progress floor, replaying the persisted park delta reconstructs the same parked entry the live engine held in memory',
  );
  assert.strictEqual(liveProgress, undefined, 'a bare park() call on a raw genesis manifest never establishes a progress floor — park cannot write progress');
  assert.strictEqual(foldedProgress, 'planned', 'the fold pipeline derives the legacy-progress floor for a unit whose journal never carried one');
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

test('foldRunManifest: a unit shipped then parked keeps pr-open progress AND carries a disposition, so the park never destroys the ship record (the reported symptom)', () => {
  const manifest = genesisManifest(TWO);
  const log = [
    JSON.stringify(manifest),
    JSON.stringify(shipDelta({ mspId: 'a', prUrl: 'https://x/pr/a', mergedAt: null, title: 'Alpha', rationale: 'alpha rationale' })),
    JSON.stringify(parkDelta({ unitId: 'a', stage: 'ship', diagnosis: 'ci flaked after the pr was opened', request: null, remediation: null, resumePoint: null, triedSet: [] })),
  ].join('\n');
  const folded = foldRunManifest(log);
  const a = folded.msps.find((m) => m.id === 'a');
  assert.strictEqual(a.progress, 'pr-open', 'the earlier ship progress survives the later park');
  assert.notStrictEqual(a.disposition, null, 'the later park still records a disposition');
  assert.notStrictEqual(a.disposition, undefined, 'the later park still records a disposition');
});

test('foldRunManifest: parking then shipping the same unit reaches the identical settled state as shipping then parking (order independence)', () => {
  const manifest = genesisManifest(TWO);
  const shipLine = JSON.stringify(shipDelta({ mspId: 'a', prUrl: 'https://x/pr/a', mergedAt: null, title: 'Alpha', rationale: 'alpha rationale' }));
  const parkLine = JSON.stringify(parkDelta({ unitId: 'a', stage: 'ship', diagnosis: 'ci flaked after the pr was opened', request: null, remediation: null, resumePoint: null, triedSet: [] }));
  const shipThenPark = foldRunManifest([JSON.stringify(manifest), shipLine, parkLine].join('\n'));
  const parkThenShip = foldRunManifest([JSON.stringify(manifest), parkLine, shipLine].join('\n'));
  const a1 = shipThenPark.msps.find((m) => m.id === 'a');
  const a2 = parkThenShip.msps.find((m) => m.id === 'a');
  assert.strictEqual(a1.progress, 'pr-open', 'ship-then-park settles at pr-open');
  assert.strictEqual(a2.progress, 'pr-open', 'park-then-ship settles at the identical pr-open, regardless of delta order');
  assert.notStrictEqual(a1.disposition, null);
  assert.notStrictEqual(a2.disposition, null);
  assert.deepStrictEqual(a1, a2, 'the two delta orders must fold to the identical msp record');
});

test('foldRunManifest: after any fold, every msp status is exactly legacyStatusOf(progress) — the legacy mirror never goes stale', () => {
  const THREE = [
    { id: 'x', title: 'Xray', rationale: 'x rationale', changeType: 'feat', scope: 'x', dependsOn: [], fileScope: ['x/**'] },
    { id: 'y', title: 'Yankee', rationale: 'y rationale', changeType: 'feat', scope: 'y', dependsOn: [], fileScope: ['y/**'] },
    { id: 'z', title: 'Zulu', rationale: 'z rationale', changeType: 'feat', scope: 'z', dependsOn: [], fileScope: ['z/**'] },
  ];
  const manifest = genesisManifest(THREE);
  const log = [
    JSON.stringify(manifest),
    JSON.stringify(builtDelta({ unitId: 'x', checkpointRef: 'refs/mitosis/a1b2c3d4/x', sha: 'x'.repeat(7), green: true, builtAgainst: {} })),
    JSON.stringify(shipDelta({ mspId: 'y', prUrl: 'https://x/pr/y', mergedAt: '2026-07-15T00:00:00Z', title: 'Yankee', rationale: 'y rationale' })),
    JSON.stringify(parkDelta({ unitId: 'z', stage: 'plan', diagnosis: 'z stalled on a plan decision', request: null, remediation: null, resumePoint: null, triedSet: [] })),
  ].join('\n');
  const folded = foldRunManifest(log);
  assert.strictEqual(folded.msps.length, 3);
  for (const msp of folded.msps) {
    assert.strictEqual(msp.status, unitState.legacyStatusOf(msp.progress), `msp ${msp.id}: status must mirror legacyStatusOf(progress) exactly`);
  }
});

test('foldRunManifest: a park delta createDisposition rejects is recorded as a visible foldRefusal carrying the line and a reason, never silently dropped', () => {
  const manifest = genesisManifest(TWO);
  const badDelta = JSON.stringify({
    kind: 'park',
    unitId: 'a',
    class: 'NotARealDispositionClass',
    stage: 'plan',
    diagnosis: 'a bad-class refusal probe',
    request: null,
    remediation: null,
    resumePoint: null,
    triedSet: [],
  });
  const folded = foldRunManifest([JSON.stringify(manifest), badDelta].join('\n'));
  assert.strictEqual(folded.foldRefusals.length, 1);
  assert.strictEqual(folded.foldRefusals[0].line, 2);
  assert.match(folded.foldRefusals[0].reason, /NotARealDispositionClass/);
});

test('foldRunManifest: a fold with no refusals leaves foldRefusals present and empty, never absent', () => {
  const manifest = genesisManifest(TWO);
  const folded = foldRunManifest(JSON.stringify(manifest));
  assert.deepStrictEqual(folded.foldRefusals, []);
});

test('foldRunManifest: folding the risk-1 legacy journal with the new progress/disposition code settles to the identical resume sets the parent commit produced (the risk-1 falsifier, leg 6a)', () => {
  const raw = readFileSync(new URL('./legacy-journal-fixture.ndjson', import.meta.url), 'utf8');
  const snapshot = JSON.parse(readFileSync(new URL('./legacy-journal-fixture-snapshot.json', import.meta.url), 'utf8'));
  const folded = foldRunManifest(raw);
  const shippedSet = new Map();
  const builtUnits = null;
  const resumeUnits = selectResumeUnits(folded, shippedSet);
  const resumeBuilt = selectResumeBuilt(folded, shippedSet, builtUnits);
  assert.deepStrictEqual(resumeUnits, snapshot.resumeUnits, 'selectResumeUnits must settle to the exact set the parent commit produced — the redesign must not lose or gain a single resumable unit');
  assert.deepStrictEqual(resumeBuilt, snapshot.resumeBuilt, 'selectResumeBuilt must settle to the exact set the parent commit produced — the redesign must not lose or gain a single resumable unit');
});

test('foldRunManifest: folding the risk-1 legacy journal, the legacy status mirror changes EXACTLY where the single-axis clobber the parent commit committed is undone, and nowhere else (leg 6b)', () => {
  const raw = readFileSync(new URL('./legacy-journal-fixture.ndjson', import.meta.url), 'utf8');
  const snapshot = JSON.parse(readFileSync(new URL('./legacy-journal-fixture-snapshot.json', import.meta.url), 'utf8'));
  const folded = foldRunManifest(raw);
  const priorStatusById = new Map(snapshot.statusById.map((m) => [m.id, m.status]));
  const changed = folded.msps
    .map((m) => ({ id: m.id, from: priorStatusById.get(m.id), to: m.status }))
    .filter((entry) => entry.from !== entry.to)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  assert.deepStrictEqual(
    changed,
    [
      { id: 'a', from: 'parked', to: 'shipped' },
      { id: 'b', from: 'parked', to: 'built' },
      { id: 'c', from: 'parked', to: 'planned' },
      { id: 'd', from: 'parked', to: 'planned' },
    ],
    'only units the parent commit had clobbered to parked may change, and each must move to exactly what the phased rename recovers, never anywhere else',
  );
  for (const msp of folded.msps) {
    assert.strictEqual(msp.status, unitState.legacyStatusOf(msp.progress), `msp ${msp.id}: status must equal legacyStatusOf(progress) exactly`);
  }
});

test('foldRunManifest: a legacy genesis line carrying status "parked" is not clobbered to planned and dropped — it floors progress honestly and synthesizes an Unknown disposition so selectResumeUnits matches origin/main exactly (Task 1, the reported blocker)', () => {
  const base = {
    logicalRunId: 'a1b2c3d4',
    clusters: [['p']],
    msps: [{
      id: 'p',
      status: 'parked',
      triedSet: ['worktree:reset-clean'],
      resumePoint: { branch: 'mit/p-integration', ref: null, stage: 'execute' },
    }],
  };
  const nd = [JSON.stringify(base), JSON.stringify({ kind: 'quiescent-exit', at: '2026-07-15T00:00:00Z' })].join('\n');
  const folded = foldRunManifest(nd);
  const resumeUnits = selectResumeUnits(folded, new Map());
  assert.deepStrictEqual(
    resumeUnits,
    [{
      unitId: 'p',
      stage: 'execute',
      resumePoint: { branch: 'mit/p-integration', ref: null, stage: 'execute' },
      triedSet: ['worktree:reset-clean'],
    }],
    'selectResumeUnits must recover exactly the one unit origin/main produced for this legacy-parked genesis; the M2 rewrite must not silently drop it',
  );
  const p = folded.msps.find((m) => m.id === 'p');
  assert.strictEqual(p.progress, 'planned', 'a legacy parked token carries no progress information; the honest floor is planned');
  assert.notStrictEqual(p.disposition, null, 'parkedness must survive onto the disposition axis rather than being discarded with the overwritten status');
  assert.notStrictEqual(p.disposition, undefined, 'parkedness must survive onto the disposition axis rather than being discarded with the overwritten status');
  assert.strictEqual(p.disposition.class, 'Unknown', 'a legacy record does not say why it parked, so the class is the honest negative Unknown');
  assert.deepStrictEqual(p.disposition.triedSet, ['worktree:reset-clean']);
  assert.deepStrictEqual(p.disposition.resumePoint, { branch: 'mit/p-integration', ref: null, stage: 'execute' });
});

test('foldRunManifest: folding the legacy-2 fixture, whose genesis carries literal parked/built/shipped status tokens with no deltas at all, settles to the identical resume sets origin/main produced (the risk-1 falsifier, second fixture, closing the all-planned genesis gap)', () => {
  const raw = readFileSync(new URL('./legacy-journal-fixture-2.ndjson', import.meta.url), 'utf8');
  const snapshot = JSON.parse(readFileSync(new URL('./legacy-journal-fixture-2-snapshot.json', import.meta.url), 'utf8'));
  const folded = foldRunManifest(raw);
  const shippedSet = new Map();
  const builtUnits = null;
  const resumeUnits = selectResumeUnits(folded, shippedSet);
  const resumeBuilt = selectResumeBuilt(folded, shippedSet, builtUnits);
  assert.deepStrictEqual(resumeUnits, snapshot.resumeUnits, 'selectResumeUnits must settle to the exact set origin/main produced for a genesis whose parked units carry no disposition of their own');
  assert.deepStrictEqual(resumeBuilt, snapshot.resumeBuilt, 'selectResumeBuilt must settle to the exact set origin/main produced');
  for (const msp of folded.msps) {
    assert.strictEqual(msp.status, unitState.legacyStatusOf(msp.progress), `msp ${msp.id}: status must equal legacyStatusOf(progress) exactly`);
  }
});
