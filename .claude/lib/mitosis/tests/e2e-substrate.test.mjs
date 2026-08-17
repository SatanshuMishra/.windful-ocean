import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  CLAUDE_BEHAVIOURS,
  DONE_ORACLE_ARGV,
  FIXED_AT,
  claudeArgvs,
  claudeArgvsFor,
  ghArgvs,
  ghArgvsMatching,
  planRun,
  readJournal,
  runMitosisCli,
  runStubClaude,
  sandboxPath,
  unitIdOfArgv,
  withSandbox,
} from './e2e-substrate.mjs';

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
    assert.equal(ghArgvs(sandbox).length, 1);
    assert.deepEqual(ghArgvs(sandbox)[0], DONE_ORACLE_ARGV);
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

test('a unit the plan fails parks the run and never reaches the done oracle', () => {
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
    assert.equal(claudeArgvs(sandbox).length, 2);
    assert.equal(ghArgvsMatching(sandbox, ['pr', 'view']).length, 1);
  });
});

test('a needs-human verdict parks its unit and leaves the other done', () => {
  withSandbox({}, (sandbox) => {
    planRun(sandbox, [
      { id: 'alpha', behaviour: CLAUDE_BEHAVIOURS.needsHuman },
      { id: 'beta', behaviour: CLAUDE_BEHAVIOURS.succeed },
    ]);

    const run = runMitosisCli(sandbox);

    assert.equal(run.status, 3, run.stderr);
    assert.deepEqual(run.summary.units, [
      { id: 'alpha', state: 'parked' },
      { id: 'beta', state: 'done' },
    ]);
    assert.equal(claudeArgvsFor(sandbox, 'alpha').length, 1);
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

test('a second attempt resumes the unit the first left parked and leaves the first attempt intact', () => {
  withSandbox({}, (sandbox) => {
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
      1,
      `the second run dispatched ${dispatched.length} units (${dispatched.join(', ')}); a run that restarted from the spec would dispatch both, and only a run that read the first run's journal dispatches one`,
    );
    assert.deepEqual(
      dispatched,
      ['beta'],
      'the one unit the second run drives must be the parked beta by name, or a restart that happened to dispatch a single unit would pass this test',
    );
    assert.deepEqual(second.summary.units, [{ id: 'beta', state: 'parked' }]);
    assert.equal(second.summary.resume.restarted, false);
    assert.deepEqual(second.summary.resume.pending, ['beta']);
    assert.deepEqual(second.summary.resume.built, ['alpha']);

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
