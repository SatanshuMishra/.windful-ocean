import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  CLAUDE_BEHAVIOURS,
  DONE_ORACLE_ARGV,
  claudeArgvs,
  claudeArgvsFor,
  ghArgvs,
  ghArgvsMatching,
  planRun,
  runMitosisCli,
  runStubClaude,
  sandboxPath,
  withSandbox,
} from './e2e-substrate.mjs';

function attemptDirectory(sandbox, summary) {
  return join(sandbox.repo, '.mitosis', 'runs', summary.runKey, `attempt-${summary.attempt}`);
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

test('a second attempt records into its own directory and leaves the first attempt intact', () => {
  withSandbox({}, (sandbox) => {
    planRun(sandbox, [
      { id: 'alpha', behaviour: CLAUDE_BEHAVIOURS.succeed },
      { id: 'beta', behaviour: CLAUDE_BEHAVIOURS.succeed },
    ]);

    const first = runMitosisCli(sandbox);
    const second = runMitosisCli(sandbox);

    assert.equal(first.status, 0, first.stderr);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(first.summary.attempt, 1);
    assert.equal(second.summary.attempt, 2);

    const firstDir = attemptDirectory(sandbox, first.summary);
    const secondDir = attemptDirectory(sandbox, second.summary);

    assert.deepEqual(unitRecordNames(firstDir), ['alpha.out', 'beta.out']);
    assert.deepEqual(unitRecordNames(secondDir), ['alpha.out', 'beta.out']);
    assert.equal(unitRecord(firstDir, 'alpha').attempt, 1);
    assert.equal(unitRecord(secondDir, 'alpha').attempt, 2);
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
