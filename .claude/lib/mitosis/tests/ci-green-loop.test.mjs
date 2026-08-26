import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CI_GREEN,
  CI_RED_EXHAUSTED,
  CI_UNWATCHED,
  CI_WATCH_INTERVAL_MS,
  CI_WATCH_MAX_ATTEMPTS,
  READ_CONCLUSION_STEP,
  READ_JOBS_STEP,
  RESOLVE_RUN_STEP,
  WATCH_STATUS_STEP,
  ciSummary,
  driveCiToGreen,
} from '../ci-green-loop.mjs';
import { EXEC_COMPLETED } from '../exec-run.mjs';
import { driverPorts } from '../cli.mjs';
import { openRun } from '../run-store.mjs';
import { cleanupScratch, openArgs } from './run-store-fixtures.mjs';

const RUN_ID = '4242';
const UNIT_ID = 'alpha';
const REPO_SLUG = 'acme/widgets';
const HEAD = 'mitosis/alpha';

function configFor() {
  return Object.freeze({
    opened: [Object.freeze({
      unitId: UNIT_ID,
      head: HEAD,
      prUrl: 'https://github.com/acme/widgets/pull/9',
      declaredScope: [],
    })],
    repoRoot: '/repo',
    repoSlug: REPO_SLUG,
  });
}

function refusingPort(label) {
  return async () => {
    throw new Error(`${label} must not be called on this path`);
  };
}

function stubbedWatch({ conclusion, settleAfterAttempts }) {
  const waits = [];
  let watchCalls = 0;
  let settled = false;
  const ciRead = async (read) => {
    if (read.step === RESOLVE_RUN_STEP) {
      return { outcome: EXEC_COMPLETED, status: 0, stdout: `${RUN_ID}\n`, stderr: '' };
    }
    if (read.step === WATCH_STATUS_STEP) {
      watchCalls += 1;
      if (watchCalls >= settleAfterAttempts) settled = true;
      return { outcome: EXEC_COMPLETED, status: 0, stdout: `${settled ? 'completed' : 'in_progress'}\n`, stderr: '' };
    }
    if (read.step === READ_CONCLUSION_STEP) {
      return { outcome: EXEC_COMPLETED, status: 0, stdout: settled ? `${conclusion}\n` : '\n', stderr: '' };
    }
    if (read.step === READ_JOBS_STEP) {
      return { outcome: EXEC_COMPLETED, status: 0, stdout: JSON.stringify({ jobs: [{ name: 'unit', conclusion: 'failure' }] }), stderr: '' };
    }
    throw new Error(`unplanned ci read step ${JSON.stringify(read.step)}`);
  };
  return {
    waits,
    ciRead,
    wait: async (ms) => { waits.push(ms); },
  };
}

test('a run still in progress on the first watch and settled on the second reports the settled conclusion as green', async () => {
  const stub = stubbedWatch({ conclusion: 'success', settleAfterAttempts: 2 });
  const ports = Object.freeze({
    ciRead: stub.ciRead,
    wait: stub.wait,
    dispatchPrompt: refusingPort('dispatchPrompt'),
    switchBranch: refusingPort('switchBranch'),
    recordFix: refusingPort('recordFix'),
    pushFix: refusingPort('pushFix'),
  });

  const produced = await driveCiToGreen(configFor(), ports);

  assert.deepEqual(ciSummary(produced), [{ id: UNIT_ID, state: CI_GREEN, fixes: 0 }]);
  assert.deepEqual(produced.unwatched, []);
  assert.equal(stub.waits.length, 1, 'the loop must pause exactly once between the in-progress read and the settled read');
  assert.equal(stub.waits[0], 15000, 'the loop must pause for exactly the declared watch interval, not a value derived from it');
});

test('a settled red conclusion is read as red and drives the existing one-fix-attempt pipeline to ci-red-exhausted', async () => {
  const stub = stubbedWatch({ conclusion: 'failure', settleAfterAttempts: 2 });
  const ports = Object.freeze({
    ciRead: stub.ciRead,
    wait: stub.wait,
    dispatchPrompt: async () => Object.freeze({
      ok: true,
      structured: { implicatedPaths: [`${UNIT_ID}.txt`], failingAssertionFiles: [`${UNIT_ID}.test.txt`] },
    }),
    switchBranch: async () => ({ status: 0 }),
    recordFix: async () => ({ status: 0 }),
    pushFix: async () => ({ status: 0 }),
  });

  const produced = await driveCiToGreen(configFor(), ports);

  assert.deepEqual(ciSummary(produced), [{ id: UNIT_ID, state: CI_RED_EXHAUSTED, fixes: 1 }]);
  assert.deepEqual(produced.green, []);
});

test('a run that never settles terminates at the watch budget and reports ci-unwatched with the timeout named', async () => {
  const stub = stubbedWatch({ conclusion: 'success', settleAfterAttempts: Number.POSITIVE_INFINITY });
  const ports = Object.freeze({
    ciRead: stub.ciRead,
    wait: stub.wait,
    dispatchPrompt: refusingPort('dispatchPrompt'),
    switchBranch: refusingPort('switchBranch'),
    recordFix: refusingPort('recordFix'),
    pushFix: refusingPort('pushFix'),
  });

  const produced = await driveCiToGreen(configFor(), ports);

  assert.equal(produced.outcomes.length, 1);
  const [entry] = produced.outcomes;
  assert.equal(entry.state, CI_UNWATCHED);
  assert.ok(
    entry.diagnosis.includes('did not settle within 40 watch attempt(s)'),
    `the diagnosis must name the exact watch budget rather than a generic refusal, got: ${entry.diagnosis}`,
  );
  assert.deepEqual(ciSummary(produced), [{ id: UNIT_ID, state: CI_UNWATCHED, fixes: 0 }]);
  assert.equal(stub.waits.length, 39, 'the loop pauses between every one of exactly 40 attempts but not after the last exhausted one');
  assert.ok(stub.waits.every((ms) => ms === 15000), 'every pause between watch attempts must use exactly the declared watch interval');
});

test('the watch budget constants are pinned to the exact values the loop and its diagnosis rely on', () => {
  assert.equal(CI_WATCH_MAX_ATTEMPTS, 40);
  assert.equal(CI_WATCH_INTERVAL_MS, 15000);
});

test('a settled red conclusion dispatches ci-fact-extract then ci-fix, and cli.mjs records both under their own kind rather than folding them into implement and redispatch', async (t) => {
  t.after(cleanupScratch);
  const stub = stubbedWatch({ conclusion: 'failure', settleAfterAttempts: 2 });
  const handle = openRun(openArgs({ unitIds: [UNIT_ID] }));
  const driven = driverPorts(
    { log: () => {}, err: () => {}, readSpec: () => ({}) },
    () => ({}),
    {
      dispatch: async (request) => {
        if (request.kind === 'ci-fact-extract') {
          return {
            ok: true,
            outcome: 'success',
            structured: { implicatedPaths: [`${UNIT_ID}.txt`], failingAssertionFiles: [`${UNIT_ID}.test.txt`] },
          };
        }
        return { ok: true, outcome: 'success', structured: null };
      },
    },
    '/tmp/does-not-matter',
  );
  driven.makeObserver({ handle, at: '2026-08-23T00:00:00Z' });
  const ports = Object.freeze({
    ciRead: stub.ciRead,
    wait: stub.wait,
    dispatchPrompt: driven.dispatchPrompt,
    switchBranch: async () => ({ status: 0 }),
    recordFix: async () => ({ status: 0 }),
    pushFix: async () => ({ status: 0 }),
  });

  const produced = await driveCiToGreen(configFor(), ports);
  handle.release();

  assert.deepEqual(ciSummary(produced), [{ id: UNIT_ID, state: CI_RED_EXHAUSTED, fixes: 1 }]);

  const dispatchesPath = join(handle.dir, 'dispatches.jsonl');
  const lines = existsSync(dispatchesPath)
    ? readFileSync(dispatchesPath, 'utf8').trim().split('\n').filter((line) => line.length > 0).map((line) => JSON.parse(line))
    : [];
  const kinds = lines.filter((line) => line.unitId === UNIT_ID).map((line) => line.kind);
  assert.deepEqual(
    kinds,
    ['ci-fact-extract', 'ci-fix'],
    `expected the ci-red pipeline for unit ${JSON.stringify(UNIT_ID)} to record ci-fact-extract then ci-fix in order, recorded ${JSON.stringify(kinds)}`,
  );
});
