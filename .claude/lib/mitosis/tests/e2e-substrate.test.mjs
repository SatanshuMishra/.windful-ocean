import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  CLAUDE_BEHAVIOURS,
  DONE_ORACLE_ARGV,
  FIXED_AT,
  FIXED_RUN_ID,
  REPO_SLUG,
  claudeArgvs,
  claudeArgvsFor,
  composedKindsFor,
  ghArgvs,
  ghArgvsMatching,
  implementArgvsFor,
  planArtifactPathOf,
  planRun,
  readJournal,
  runMitosisCli,
  runStubClaude,
  sandboxPath,
  unitIdOfArgv,
  withSandbox,
} from './e2e-substrate.mjs';

const NEEDS_HUMAN_REASON = 'fixture needs a human for unit beta';

const SHIPPED_CLAIM_MANIFEST = Object.freeze({
  logicalRunId: FIXED_RUN_ID,
  clusters: [],
  baseBranch: 'main',
  sourcePrefix: 'mitosis',
  msps: [{ id: 'alpha', title: 'unit alpha', dependsOn: [], status: 'shipped' }],
});

function ghPlanReporting(mergedPRs) {
  return {
    steps: [
      { argvPrefix: ['pr', 'list'], stdout: `${JSON.stringify(mergedPRs)}\n`, exitCode: 0 },
      {
        argvPrefix: ['pr', 'view'],
        stdout: `${JSON.stringify({ state: 'OPEN', mergedAt: null, url: `https://github.com/${REPO_SLUG}/pull/1` })}\n`,
        exitCode: 0,
      },
    ],
  };
}

function attemptDirectory(sandbox, summary) {
  return join(sandbox.repo, '.mitosis', 'runs', summary.runKey, `attempt-${summary.attempt}`);
}

function dispatchedSince(sandbox, count) {
  return claudeArgvs(sandbox).slice(count).map(unitIdOfArgv);
}

function tearDownMidFlight(sandbox, attemptDir, unitId) {
  const survived = readJournal(sandbox)
    .filter((record, index) => index === 0 || (record.kind === 'built' && record.unitId !== unitId));
  writeFileSync(sandbox.journalPath, survived.map((record) => `${JSON.stringify(record)}\n`).join(''));
  writeFileSync(
    join(attemptDir, 'items', `${unitId}.out`),
    `${JSON.stringify({ at: FIXED_AT, state: 'running', sequence: null, unitId, attempt: 1 })}\n`,
  );
  return survived;
}

function unitRecordNames(attemptDir) {
  return readdirSync(join(attemptDir, 'items')).sort();
}

function unitRecord(attemptDir, unitId) {
  return JSON.parse(readFileSync(join(attemptDir, 'items', `${unitId}.out`), 'utf8'));
}

function committedState(attemptDir) {
  return JSON.parse(readFileSync(join(attemptDir, 'state.json'), 'utf8'));
}

test('a real cli.mjs child drives a two-unit fixture to done through the sandbox PATH', () => {
  withSandbox({}, (sandbox) => {
    planRun(sandbox, [
      { id: 'alpha', behaviour: CLAUDE_BEHAVIOURS.succeed },
      { id: 'beta', behaviour: CLAUDE_BEHAVIOURS.succeed },
    ]);

    const run = runMitosisCli(sandbox);

    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(run.summary.units, [
      { id: 'alpha', state: 'done' },
      { id: 'beta', state: 'done' },
    ]);
    assert.equal(claudeArgvs(sandbox).length, 2);
    assert.deepEqual(ghArgvs(sandbox)[0], DONE_ORACLE_ARGV, 'the engine probes the done oracle when it reaches quiescence, before Ship walks anything');
    assert.equal(ghArgvsMatching(sandbox, ['pr', 'create']).length, 2, 'one invocation carries both units from build to an open pull request, so the recorder holds one create per unit');
  });
});

test('a planned run composes plan then plan-review, and one bounded replan for the unit whose plan is revised', () => {
  withSandbox({}, (sandbox) => {
    planRun(sandbox, [
      { id: 'alpha', behaviour: CLAUDE_BEHAVIOURS.succeed, planning: { reviews: ['approve'] } },
      { id: 'beta', behaviour: CLAUDE_BEHAVIOURS.succeed, planning: { reviews: ['needs-changes', 'approve'] } },
    ]);

    const run = runMitosisCli(sandbox);

    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(run.summary.units, [
      { id: 'alpha', state: 'done' },
      { id: 'beta', state: 'done' },
    ]);
    assert.deepEqual(composedKindsFor(sandbox, 'alpha'), ['plan', 'plan-review']);
    assert.deepEqual(composedKindsFor(sandbox, 'beta'), ['plan', 'plan-review', 'replan', 'plan-review']);
    assert.equal(implementArgvsFor(sandbox, 'alpha').length, 1);
    assert.equal(implementArgvsFor(sandbox, 'beta').length, 1);
    assert.equal(claudeArgvs(sandbox).length, 8);
    assert.equal(existsSync(planArtifactPathOf(sandbox, 'beta')), true);
  });
});

test('a unit whose plan is still unapproved after its one replan parks with no implement dispatch', () => {
  withSandbox({}, (sandbox) => {
    planRun(sandbox, [
      { id: 'alpha', behaviour: CLAUDE_BEHAVIOURS.succeed, planning: { reviews: ['approve'] } },
      { id: 'gamma', behaviour: CLAUDE_BEHAVIOURS.succeed, planning: { reviews: ['needs-changes', 'needs-changes'] } },
    ]);

    const run = runMitosisCli(sandbox);

    assert.equal(run.status, 3, run.stderr);
    assert.deepEqual(run.summary.units, [
      { id: 'alpha', state: 'done' },
      { id: 'gamma', state: 'parked' },
    ]);
    assert.deepEqual(composedKindsFor(sandbox, 'gamma'), ['plan', 'plan-review', 'replan', 'plan-review']);
    assert.equal(implementArgvsFor(sandbox, 'gamma').length, 0);
    assert.equal(claudeArgvsFor(sandbox, 'gamma').length, 4);
    assert.equal(readJournal(sandbox).filter((record) => record.kind === 'park').length, 1);
  });
});

test('the sandbox PATH makes the real claude and the real gh unreachable', () => {
  withSandbox({}, (sandbox) => {
    const probe = spawnSync('/bin/sh', ['-c', 'command -v claude; command -v gh; command -v git; command -v node'], {
      env: { PATH: sandboxPath(sandbox) },
      encoding: 'utf8',
    });

    assert.deepEqual(probe.stdout.split('\n').filter(Boolean), [
      `${sandbox.fakeBin}/claude`,
      `${sandbox.fakeBin}/gh`,
      `${sandbox.fakeBin}/git`,
      `${sandbox.fakeBin}/node`,
    ]);
  });
});

test('a unit the plan fails is diagnosed, redispatched exactly once, and parks on the second failure without a fourth dispatch', () => {
  withSandbox({}, (sandbox) => {
    planRun(sandbox, [
      { id: 'alpha', behaviour: CLAUDE_BEHAVIOURS.succeed },
      { id: 'beta', behaviour: CLAUDE_BEHAVIOURS.fail },
    ]);

    const run = runMitosisCli(sandbox);

    assert.equal(run.status, 3, run.stderr);
    assert.deepEqual(run.summary.units, [
      { id: 'alpha', state: 'done' },
      { id: 'beta', state: 'parked' },
    ]);
    assert.deepEqual(composedKindsFor(sandbox, 'beta'), ['diagnose', 'redispatch']);
    assert.equal(claudeArgvsFor(sandbox, 'beta').length, 3);
    assert.equal(claudeArgvsFor(sandbox, 'alpha').length, 1);
    assert.equal(claudeArgvs(sandbox).length, 4);
    assert.equal(readJournal(sandbox).filter((record) => record.kind === 'park').length, 1);
    assert.equal(ghArgvsMatching(sandbox, ['pr', 'view']).length, 1);
  });
});

test('a unit whose first attempt fails and whose second succeeds is rediagnosed once and reaches done on three dispatches', () => {
  withSandbox({}, (sandbox) => {
    planRun(sandbox, [{ id: 'alpha', behaviour: CLAUDE_BEHAVIOURS.failThenSucceed }]);

    const run = runMitosisCli(sandbox);

    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(run.summary.units, [{ id: 'alpha', state: 'done' }]);
    assert.deepEqual(composedKindsFor(sandbox, 'alpha'), ['diagnose', 'redispatch']);
    assert.equal(claudeArgvsFor(sandbox, 'alpha').length, 3);
    assert.equal(readJournal(sandbox).filter((record) => record.kind === 'park').length, 0);
    assert.equal(readJournal(sandbox).filter((record) => record.kind === 'built').length, 1);
  });
});

test('a needs-human verdict parks its unit and its transitive dependents, names the cause, and leaves the independent unit done', () => {
  withSandbox({}, (sandbox) => {
    planRun(sandbox, [
      { id: 'beta', behaviour: CLAUDE_BEHAVIOURS.needsHuman, reason: NEEDS_HUMAN_REASON },
      { id: 'gamma', behaviour: CLAUDE_BEHAVIOURS.succeed, prereqs: ['beta'] },
      { id: 'delta', behaviour: CLAUDE_BEHAVIOURS.succeed },
    ]);

    const run = runMitosisCli(sandbox);
    const parks = readJournal(sandbox).filter((record) => record.kind === 'park');

    assert.equal(run.status, 3, run.stderr);
    assert.equal(parks.length, 2);
    assert.deepEqual(parks.map((record) => record.unitId), ['beta', 'gamma']);
    assert.equal(parks[1].blockedBy, 'beta');
    assert.equal(parks[1].diagnosis, 'blocked-by-parked-prerequisite');
    assert.equal(parks[1].request, null);
    assert.equal(Object.hasOwn(parks[0], 'blockedBy'), false);
    assert.equal(parks[0].diagnosis, 'NeedsHuman');
    assert.deepEqual(parks[0].request, {
      kind: 'unit',
      what: 'the unit reported that only a human can settle it',
      detail: NEEDS_HUMAN_REASON,
    });
    assert.deepEqual(run.summary.units, [
      { id: 'beta', state: 'parked' },
      { id: 'gamma', state: 'parked' },
      { id: 'delta', state: 'done' },
    ]);
    assert.equal(claudeArgvsFor(sandbox, 'beta').length, 1);
    assert.equal(claudeArgvsFor(sandbox, 'gamma').length, 0);
    assert.equal(claudeArgvsFor(sandbox, 'delta').length, 1);
  });
});

test('a scope-fence unit reaches done with no structured output and no commit of its own', () => {
  withSandbox({}, (sandbox) => {
    planRun(sandbox, [
      { id: 'alpha', behaviour: CLAUDE_BEHAVIOURS.succeedWithoutStructuredOutput, isolation: 'scope-fence' },
    ]);

    const run = runMitosisCli(sandbox);

    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(run.summary.units, [{ id: 'alpha', state: 'done' }]);
    assert.equal(claudeArgvs(sandbox).length, 1);
  });
});

test('the fail-then-succeed behaviour fails the first invocation and succeeds the second', () => {
  withSandbox({}, (sandbox) => {
    const planned = planRun(sandbox, [{ id: 'alpha', behaviour: CLAUDE_BEHAVIOURS.failThenSucceed }]);

    const first = runStubClaude(sandbox, 'alpha');
    const second = runStubClaude(sandbox, 'alpha');

    assert.equal(first.status, 9);
    assert.equal(second.status, 0);
    assert.deepEqual(JSON.parse(second.stdout).structured_output, { sha: planned.shaOf.alpha });
    assert.equal(claudeArgvsFor(sandbox, 'alpha').length, 2);
  });
});

test('a real two-unit run leaves one durable start record per unit and a committed state', () => {
  withSandbox({}, (sandbox) => {
    planRun(sandbox, [
      { id: 'alpha', behaviour: CLAUDE_BEHAVIOURS.succeed },
      { id: 'beta', behaviour: CLAUDE_BEHAVIOURS.succeed },
    ]);

    const run = runMitosisCli(sandbox);

    assert.equal(run.status, 0, run.stderr);
    const attemptDir = attemptDirectory(sandbox, run.summary);
    const startRecords = unitRecordNames(attemptDir);

    assert.equal(startRecords.length, 2);
    assert.deepEqual(startRecords, ['alpha.out', 'beta.out']);
    assert.equal(existsSync(join(attemptDir, 'state.json')), true);
    assert.deepEqual(committedState(attemptDir).units, { alpha: 'ok', beta: 'ok' });
    assert.equal(unitRecord(attemptDir, 'alpha').unitId, 'alpha');
    assert.equal(unitRecord(attemptDir, 'alpha').attempt, 1);
  });
});

const MERGED_ALPHA = Object.freeze([Object.freeze({
  headRefName: 'mitosis/alpha-integration',
  url: `https://github.com/${REPO_SLUG}/pull/7`,
  mergedAt: '2026-01-01T00:00:00Z',
})]);

test('a second attempt resumes the unit the first left parked and leaves the first attempt intact', () => {
  withSandbox({ ghPlan: ghPlanReporting(MERGED_ALPHA) }, (sandbox) => {
    planRun(sandbox, [
      { id: 'alpha', behaviour: CLAUDE_BEHAVIOURS.succeed },
      { id: 'beta', behaviour: CLAUDE_BEHAVIOURS.fail },
    ]);

    const first = runMitosisCli(sandbox);
    const beforeSecond = claudeArgvs(sandbox).length;
    const second = runMitosisCli(sandbox);
    const dispatched = dispatchedSince(sandbox, beforeSecond);

    assert.equal(first.status, 3, first.stderr);
    assert.equal(second.status, 3, second.stderr);
    assert.equal(first.summary.attempt, 1);
    assert.equal(second.summary.attempt, 2);
    assert.equal(
      dispatched.length,
      3,
      `the second run dispatched ${dispatched.length} children (${dispatched.join(', ')}); a run that restarted from the spec would drive alpha as well, and only a run that read the first run's journal drives the parked unit alone across its attempt, its diagnosis and its corrected re-attempt`,
    );
    assert.deepEqual(
      dispatched,
      ['beta', 'beta', 'beta'],
      'the one unit the second run drives must be the parked beta by name, three times under the redispatch budget - one attempt, one diagnosis and one corrected re-attempt - or a restart that happened to dispatch three children would pass this test',
    );
    assert.deepEqual(composedKindsFor(sandbox, 'beta'), ['diagnose', 'redispatch', 'diagnose', 'redispatch']);
    assert.deepEqual(second.summary.units, [{ id: 'beta', state: 'parked' }]);
    assert.equal(second.summary.resume.restarted, false);
    assert.deepEqual(second.summary.resume.pending, ['beta']);
    assert.deepEqual(second.summary.resume.shipped, ['alpha'], 'the first invocation opened the pull request for alpha and the forge reports it merged, so the second invocation owes it no work at all');

    const firstDir = attemptDirectory(sandbox, first.summary);
    const secondDir = attemptDirectory(sandbox, second.summary);

    assert.deepEqual(
      unitRecordNames(firstDir),
      ['alpha.out', 'beta.out'],
      'resume reduces the next attempt rather than rewriting the last one, so the first attempt keeps both of its records',
    );
    assert.deepEqual(unitRecordNames(secondDir), ['beta.out']);
    assert.equal(unitRecord(firstDir, 'alpha').attempt, 1);
    assert.equal(unitRecord(secondDir, 'beta').attempt, 2);
  });
});

test('a unit whose durable record still says running is re-driven after a mid-run teardown', () => {
  withSandbox({}, (sandbox) => {
    planRun(sandbox, [
      { id: 'alpha', behaviour: CLAUDE_BEHAVIOURS.succeed },
      { id: 'beta', behaviour: CLAUDE_BEHAVIOURS.succeed, prereqs: ['alpha'] },
    ]);

    const first = runMitosisCli(sandbox);
    assert.equal(first.status, 0, first.stderr);

    const firstDir = attemptDirectory(sandbox, first.summary);
    const survived = tearDownMidFlight(sandbox, firstDir, 'beta');

    assert.equal(survived.length, 2, 'the constructed crash state is a journal carrying its genesis manifest and the one built record alpha settled before the teardown');
    assert.equal(unitRecord(firstDir, 'beta').state, 'running', 'the premise of this test is a durable record left mid-flight, so it is asserted rather than assumed');

    const beforeSecond = claudeArgvs(sandbox).length;
    const second = runMitosisCli(sandbox);
    const dispatched = dispatchedSince(sandbox, beforeSecond);

    assert.equal(second.status, 0, second.stderr);
    assert.deepEqual(
      dispatched,
      ['beta'],
      'a unit the journal never settled was in flight when the run died, so the next run re-drives exactly it; alpha settled and is not driven again',
    );
    assert.deepEqual(unitRecordNames(attemptDirectory(sandbox, second.summary)), ['beta.out']);
    assert.deepEqual(second.summary.units, [{ id: 'beta', state: 'done' }]);
    assert.equal(second.summary.resume.restarted, false);
  });
});

test('a manifest claiming a unit shipped is overruled when the forge reports no merged pull request', () => {
  withSandbox({ ghPlan: ghPlanReporting([]) }, (sandbox) => {
    planRun(sandbox, [{ id: 'alpha', behaviour: CLAUDE_BEHAVIOURS.succeed }], { manifest: SHIPPED_CLAIM_MANIFEST });

    const run = runMitosisCli(sandbox);
    const dispatched = claudeArgvs(sandbox).map(unitIdOfArgv);

    assert.equal(run.status, 0, run.stderr);
    assert.equal(
      dispatched.length,
      1,
      `the run dispatched ${dispatched.length} units; a manifest claiming alpha shipped is a local claim, and only the merged set observed from the forge can retire the work`,
    );
    assert.deepEqual(dispatched, ['alpha']);
    assert.deepEqual(run.summary.resume.shipped, []);
    assert.deepEqual(run.summary.resume.pending, ['alpha']);
    assert.equal(
      ghArgvsMatching(sandbox, ['pr', 'list']).length,
      1,
      'the reconcile probe must appear in the sandbox recorder; an empty recorder means the shim reached a real gh through its hardcoded fallback paths rather than the fake on PATH',
    );
  });
});

test('a unit the forge reports merged is retired without being dispatched again', () => {
  const merged = [{
    headRefName: 'mitosis/alpha-integration',
    url: `https://github.com/${REPO_SLUG}/pull/7`,
    mergedAt: '2026-01-01T00:00:00Z',
  }];
  withSandbox({ ghPlan: ghPlanReporting(merged) }, (sandbox) => {
    planRun(sandbox, [{ id: 'alpha', behaviour: CLAUDE_BEHAVIOURS.succeed }], { manifest: SHIPPED_CLAIM_MANIFEST });

    const run = runMitosisCli(sandbox);

    assert.equal(run.status, 0, run.stderr);
    assert.equal(
      claudeArgvs(sandbox).length,
      0,
      'the reconciled set is read rather than ignored, so a merged pull request retires its unit and no child is dispatched',
    );
    assert.deepEqual(run.summary.resume.shipped, ['alpha']);
    assert.deepEqual(run.summary.resume.pending, []);
    assert.deepEqual(run.summary.units, []);
    assert.equal(ghArgvsMatching(sandbox, ['pr', 'list']).length, 1);
  });
});

test('two runs of the same fixture produce identical summaries', () => {
  const summaryOf = () => withSandbox({}, (sandbox) => {
    planRun(sandbox, [
      { id: 'alpha', behaviour: CLAUDE_BEHAVIOURS.succeed },
      { id: 'beta', behaviour: CLAUDE_BEHAVIOURS.succeed },
    ]);
    const run = runMitosisCli(sandbox);
    return { units: run.summary.units, ticks: run.summary.ticks, quiescent: run.summary.quiescent };
  });

  assert.deepEqual(summaryOf(), summaryOf());
});
