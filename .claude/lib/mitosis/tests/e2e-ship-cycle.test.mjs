import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BASE_BRANCH,
  CLAUDE_BEHAVIOURS,
  DECOMPOSE_MARKER,
  FIXED_RUN_ID,
  JUDGMENT_MARKERS,
  OPENED_PR_URL,
  claudeArgvs,
  decompositionMsp,
  ghArgvsMatching,
  integrationBranchOf,
  planDecomposition,
  planRun,
  readJournal,
  readRunDocument,
  runDecomposeEmit,
  runMitosisCli,
  unitTokenOf,
  withSandbox,
} from './e2e-substrate.mjs';

const PR_CREATE_PREFIX = Object.freeze(['pr', 'create']);

const TWO_UNITS = Object.freeze([
  Object.freeze({ id: 'alpha', behaviour: CLAUDE_BEHAVIOURS.succeed }),
  Object.freeze({ id: 'beta', behaviour: CLAUDE_BEHAVIOURS.succeed }),
]);

const TWO_MSPS = Object.freeze([
  decompositionMsp('alpha', { securityReviewRequired: true }),
  decompositionMsp('beta', { securityReviewRequired: false }),
]);

function flagValue(argv, flag) {
  const index = argv.indexOf(flag);
  return index === -1 || index + 1 >= argv.length ? null : argv[index + 1];
}

function promptOf(argv) {
  return Array.isArray(argv) && argv.length > 0 && typeof argv[argv.length - 1] === 'string' ? argv[argv.length - 1] : '';
}

function kindOfArgv(argv) {
  const prompt = promptOf(argv);
  if (prompt.includes(DECOMPOSE_MARKER)) return 'decompose';
  if (prompt.includes(JUDGMENT_MARKERS.security)) return 'security';
  if (prompt.includes(JUDGMENT_MARKERS.review)) return 'review';
  return 'implement';
}

function dispatchCensus(sandbox) {
  const census = { decompose: 0, implement: 0, review: 0, security: 0 };
  for (const argv of claudeArgvs(sandbox)) census[kindOfArgv(argv)] += 1;
  return census;
}

function unitsDispatchedFor(sandbox, kind) {
  return claudeArgvs(sandbox)
    .filter((argv) => kindOfArgv(argv) === kind)
    .map((argv) => TWO_MSPS.map((msp) => msp.id).find((id) => promptOf(argv).includes(unitTokenOf(id))))
    .sort();
}

function decomposeArgvs(sandbox) {
  return claudeArgvs(sandbox).filter((argv) => Array.isArray(argv)
    && argv.some((value) => typeof value === 'string' && value.includes(DECOMPOSE_MARKER)));
}

function shipRecords(sandbox) {
  return readJournal(sandbox).filter((record) => record !== null && typeof record === 'object' && record.kind === 'ship');
}

test('one cycle carries a spec from the real decomposer through execute and integrate to the pull requests the centralized tool opens', () => {
  withSandbox({ boundaryToolchain: true }, (sandbox) => {
    planRun(sandbox, TWO_UNITS);
    planDecomposition(sandbox, TWO_MSPS);

    const emitted = runDecomposeEmit(sandbox);
    assert.equal(emitted.status, 0, `the decompose child must compose a run document before anything downstream runs: ${emitted.stderr}`);
    assert.deepEqual(emitted.summary.units, ['alpha', 'beta']);
    assert.equal(decomposeArgvs(sandbox).length, 1, 'exactly one decompose child ran, and the recorder proves it was the stub rather than a real claude');

    const document = readRunDocument(sandbox);
    assert.deepEqual(document.specs.map((unit) => unit.id), ['alpha', 'beta'], 'the spec the engine runs is the emitter output, not a document the test hand-wrote');
    assert.deepEqual(
      document.specs.map((unit) => unit.judgment.securityReviewRequired),
      [true, false],
      'the emitter carries each MSP declared security answer into the judgment record the dispatch reads',
    );
    assert.equal(document.manifest.logicalRunId, FIXED_RUN_ID);
    assert.deepEqual(document.manifest.msps.map((msp) => msp.integrationBranch), [integrationBranchOf('alpha'), integrationBranchOf('beta')]);

    const build = runMitosisCli(sandbox);
    assert.equal(build.status, 0, `the build run must reach a clean exit on the emitted document: ${build.stderr}`);
    assert.deepEqual(build.summary.units, [{ id: 'alpha', state: 'done' }, { id: 'beta', state: 'done' }]);
    assert.equal(claudeArgvs(sandbox).length, 6, 'one decompose child, one implement and one review child per unit, and one security child for the only unit that declares the lens required');
    assert.deepEqual(dispatchCensus(sandbox), { decompose: 1, implement: 2, review: 2, security: 1 });
    assert.deepEqual(unitsDispatchedFor(sandbox, 'review'), ['alpha', 'beta'], 'every unit from the real emitter gets its review lens');
    assert.deepEqual(unitsDispatchedFor(sandbox, 'security'), ['alpha'], 'the security lens runs over exactly the unit whose MSP declared it required');

    const ship = runMitosisCli(sandbox);
    assert.equal(ship.summary === null, false, `the ship run printed no summary to read: ${ship.stderr}`);
    assert.deepEqual(ship.summary.integrate.integrated, ['alpha', 'beta']);

    const created = ghArgvsMatching(sandbox, PR_CREATE_PREFIX);
    assert.equal(created.length, 2, 'one pull request per msp reaches the centralized tool; an empty recorder would mean the real gh binary ran instead');
    assert.deepEqual(created.map((argv) => flagValue(argv, '--head')), [integrationBranchOf('alpha'), integrationBranchOf('beta')]);
    assert.deepEqual(created.map((argv) => flagValue(argv, '--base')), [BASE_BRANCH, BASE_BRANCH]);
    assert.deepEqual(created.map((argv) => flagValue(argv, '--title')), ['feat(alpha): unit alpha', 'feat(beta): unit beta']);

    assert.equal(ship.summary.ship.status, 'all-shipped');
    assert.deepEqual(ship.summary.ship.opened, ['alpha', 'beta']);
    assert.deepEqual(ship.summary.ship.parked, []);
    assert.deepEqual(ship.summary.ship.outcomes, [
      { id: 'alpha', state: 'shipped', action: 'created' },
      { id: 'beta', state: 'shipped', action: 'created' },
    ]);
    assert.deepEqual(shipRecords(sandbox).map((record) => [record.mspId, record.prUrl]), [
      ['alpha', OPENED_PR_URL],
      ['beta', OPENED_PR_URL],
    ]);
  });
});
