import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXEC_ALLOWLIST, resolveSpawn } from '../exec-policy.mjs';
import {
  BOUNDARY_VERIFIED,
  GREEN_VERIFIED,
  PR_TOOL_PATH,
  RECEIPTS_NOT_VERIFIED,
  changedLinesOf,
  composePrCreateArgv,
} from '../ship-plan.mjs';
import {
  BASE_BRANCH,
  CLAUDE_BEHAVIOURS,
  OPENED_PR_URL,
  claudeArgvs,
  ghArgvsMatching,
  ghPlanSteps,
  integrationBranchOf,
  planRun,
  readJournal,
  runMitosisCli,
  withSandbox,
} from './e2e-substrate.mjs';

const PR_CREATE_PREFIX = Object.freeze(['pr', 'create']);
const REFUSING_IO = Object.freeze({ readFile: () => null, readStdin: () => null });

const TWO_UNITS = Object.freeze([
  Object.freeze({ id: 'alpha', behaviour: CLAUDE_BEHAVIOURS.succeed }),
  Object.freeze({ id: 'beta', behaviour: CLAUDE_BEHAVIOURS.succeed, prereqs: ['alpha'] }),
]);

const ONE_UNIT = Object.freeze([
  Object.freeze({ id: 'alpha', behaviour: CLAUDE_BEHAVIOURS.succeed }),
]);

const BETA_FACTS = Object.freeze({
  repo: 'acme/widgets',
  base: 'main',
  head: 'mitosis/beta-integration',
  title: 'feat(beta): unit beta',
  provenance: 'agent=mitosis-engine model=unspecified',
  why: 'fixture rationale for unit beta',
  what: 'unit beta',
  depends: Object.freeze(['alpha']),
  green: true,
  boundaryClean: true,
});

function flagValue(argv, flag) {
  const index = argv.indexOf(flag);
  return index === -1 || index + 1 >= argv.length ? null : argv[index + 1];
}

function verifiedLinesOf(body) {
  return String(body).split('\n').filter((line) => line.startsWith('Verified: '));
}

function shipRecords(sandbox) {
  return readJournal(sandbox).filter((record) => record !== null && typeof record === 'object' && record.kind === 'ship');
}

function buildThenShip(sandbox, unitPlans) {
  planRun(sandbox, unitPlans);
  const build = runMitosisCli(sandbox);
  assert.equal(build.status, 0, `the build run must reach a clean exit before Ship has anything to open: ${build.stderr}`);
  assert.equal(claudeArgvs(sandbox).length, unitPlans.length, 'the build run dispatches exactly one implement child per unit');
  const ship = runMitosisCli(sandbox);
  assert.equal(ship.summary === null, false, `the ship run printed no summary to read: ${ship.stderr}`);
  return ship;
}

test('Ship opens one pull request per integrated msp through the centralized tool, against the manifest base branch', () => {
  withSandbox({ boundaryToolchain: true }, (sandbox) => {
    const ship = buildThenShip(sandbox, TWO_UNITS);

    assert.deepEqual(ship.summary.integrate.integrated, ['alpha', 'beta'], 'both units must reach integrated or Ship has nothing to walk');
    const created = ghArgvsMatching(sandbox, PR_CREATE_PREFIX);
    assert.equal(created.length, 2, 'the fake gh recorder holds one pr create per integrated msp; an empty recorder would mean the real gh binary ran instead');
    assert.deepEqual(created.map((argv) => flagValue(argv, '--base')), [BASE_BRANCH, BASE_BRANCH]);
    assert.deepEqual(created.map((argv) => flagValue(argv, '--head')), [integrationBranchOf('alpha'), integrationBranchOf('beta')]);
    assert.deepEqual(created.map((argv) => flagValue(argv, '--title')), ['feat(alpha): unit alpha', 'feat(beta): unit beta']);
    assert.deepEqual(created.map((argv) => flagValue(argv, '--changed-lines')), [null, null], 'the integration branches this fixture never pushes cannot be measured, and a size nobody measured is left out rather than estimated');
    assert.deepEqual(ship.summary.ship.opened, ['alpha', 'beta']);
    assert.deepEqual(ship.summary.ship.parked, []);
    assert.deepEqual(ship.summary.ship.outcomes, [
      { id: 'alpha', state: 'shipped', action: 'created' },
      { id: 'beta', state: 'shipped', action: 'created' },
    ]);
    assert.deepEqual(shipRecords(sandbox).map((record) => [record.mspId, record.prUrl, record.mergedAt]), [
      ['alpha', OPENED_PR_URL, null],
      ['beta', OPENED_PR_URL, null],
    ]);
  });
});

test('every opened pull request declares the receipts enforcer unverified, and claims it verified nowhere', () => {
  withSandbox({ boundaryToolchain: true }, (sandbox) => {
    buildThenShip(sandbox, TWO_UNITS);

    const bodies = ghArgvsMatching(sandbox, PR_CREATE_PREFIX).map((argv) => flagValue(argv, '--body'));
    assert.equal(bodies.length, 2);
    for (const body of bodies) {
      assert.equal(String(body).includes(`Not verified: ${RECEIPTS_NOT_VERIFIED}`), true, 'the enforcer runs only after the pull request exists and the body is immutable, so it is always declared not run');
      assert.deepEqual(verifiedLinesOf(body), [`Verified: ${GREEN_VERIFIED}`, `Verified: ${BOUNDARY_VERIFIED}`]);
    }
  });
});

test('a pull request the centralized tool did not compose parks the msp, and is still recorded once', () => {
  const openPullRequests = [{ url: 'https://github.com/acme/widgets/pull/4', number: 4, body: 'opened by hand, carrying no tool trailer' }];
  withSandbox({ boundaryToolchain: true, ghPlan: { steps: ghPlanSteps({ openPullRequests }) } }, (sandbox) => {
    const ship = buildThenShip(sandbox, ONE_UNIT);

    assert.deepEqual(ship.summary.integrate.integrated, ['alpha']);
    assert.equal(ghArgvsMatching(sandbox, PR_CREATE_PREFIX).length, 0, 'an open pull request on the head is reused rather than duplicated, so no create call is made');
    assert.deepEqual(ship.summary.ship.opened, []);
    assert.deepEqual(ship.summary.ship.parked, ['alpha']);
    assert.deepEqual(ship.summary.ship.outcomes, [{ id: 'alpha', state: 'parked', action: 'reused-unverified' }]);
    assert.deepEqual(shipRecords(sandbox).map((record) => [record.mspId, record.prUrl]), [['alpha', 'https://github.com/acme/widgets/pull/4']]);
  });
});

test('the pull-request tool is spawned as node, unshimmed, from the allowlist the policy already names', () => {
  assert.deepEqual([...EXEC_ALLOWLIST], ['claude', 'gh', 'git', 'graphify', 'node']);
  const resolved = resolveSpawn('node', [PR_TOOL_PATH, 'pr-create'], REFUSING_IO);
  assert.equal(resolved.command, 'node');
  assert.deepEqual([...resolved.args], [PR_TOOL_PATH, 'pr-create']);
  assert.match(PR_TOOL_PATH, /\.claude\/lib\/git\/pr\.mjs$/);
});

test('the composed argv carries every mandated field once, in the order the tool reads them', () => {
  assert.deepEqual([...composePrCreateArgv(BETA_FACTS, 12).argv], [
    'pr-create',
    '--repo', 'acme/widgets',
    '--head', 'mitosis/beta-integration',
    '--base', 'main',
    '--title', 'feat(beta): unit beta',
    '--origin', 'machine',
    '--provenance', 'agent=mitosis-engine model=unspecified',
    '--why', 'fixture rationale for unit beta',
    '--what', 'unit beta',
    '--verified', 'unit verdict - green',
    '--verified', 'boundary gate - clean',
    '--not-verified', 'receipts enforcer - not run',
    '--depends', 'alpha',
    '--changed-lines', '12',
  ]);
});

test('a verdict that was not green and a gate that was not clean each drop their own verified line, never the receipts one', () => {
  const ungreen = composePrCreateArgv({ ...BETA_FACTS, green: false, depends: [] }, null).argv;
  assert.deepEqual([...ungreen].slice(ungreen.indexOf('--what')), [
    '--what', 'unit beta',
    '--verified', 'boundary gate - clean',
    '--not-verified', 'receipts enforcer - not run',
  ]);
  const ungated = composePrCreateArgv({ ...BETA_FACTS, boundaryClean: false, depends: [] }, null).argv;
  assert.deepEqual([...ungated].slice(ungated.indexOf('--what')), [
    '--what', 'unit beta',
    '--verified', 'unit verdict - green',
    '--not-verified', 'receipts enforcer - not run',
  ]);
  const neither = composePrCreateArgv({ ...BETA_FACTS, green: false, boundaryClean: false, depends: [] }, null).argv;
  assert.deepEqual([...neither].slice(neither.indexOf('--what')), [
    '--what', 'unit beta',
    '--not-verified', 'receipts enforcer - not run',
  ]);
});

test('the changed-line count is read from a shortstat or left unstated, never inferred', () => {
  assert.equal(changedLinesOf(' 3 files changed, 41 insertions(+), 7 deletions(-)\n'), 48);
  assert.equal(changedLinesOf(' 1 file changed, 1 insertion(+)\n'), 1);
  assert.equal(changedLinesOf(' 1 file changed, 2 deletions(-)\n'), 2);
  assert.equal(changedLinesOf(''), null);
  assert.equal(changedLinesOf(' 2 files changed\n'), null);
});

test('a msp whose mandated pull-request fields cannot be read composes no argv rather than a placeholder', () => {
  const composed = composePrCreateArgv({ ...BETA_FACTS, base: null, title: null }, null);
  assert.equal(composed.ok, false);
  assert.equal(composed.argv, null);
  assert.deepEqual([...composed.unusable], [
    '--base from the manifest base branch',
    '--title from the msp change type, scope and title',
  ]);
});
