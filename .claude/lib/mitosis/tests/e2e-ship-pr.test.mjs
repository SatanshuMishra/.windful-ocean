import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXEC_ALLOWLIST, resolveSpawn } from '../exec-policy.mjs';
import {
  BOUNDARY_VERIFIED,
  PR_TOOL_PATH,
  RECEIPTS_NOT_VERIFIED,
  composePrCreateArgv,
  prTitleOf,
  readPrAction,
  shipIntegrated,
  shipSummary,
} from '../ship-plan.mjs';
import {
  BASE_BRANCH,
  CLAUDE_BEHAVIOURS,
  OPENED_PR_URL,
  REPO_SLUG,
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
const EMPTY_CI = Object.freeze([]);
const UNMEASURED_UNIT_VERDICT = 'unit verdict - green';

const THREE_UNITS = Object.freeze([
  Object.freeze({ id: 'alpha', behaviour: CLAUDE_BEHAVIOURS.succeed }),
  Object.freeze({ id: 'beta', behaviour: CLAUDE_BEHAVIOURS.succeed, prereqs: ['alpha'] }),
  Object.freeze({ id: 'gamma', behaviour: CLAUDE_BEHAVIOURS.succeed }),
]);

const MERGED_ALPHA = Object.freeze([Object.freeze({
  headRefName: integrationBranchOf('alpha'),
  url: `https://github.com/${REPO_SLUG}/pull/3`,
  mergedAt: '2026-01-02T00:00:00Z',
})]);

const ONE_UNIT = Object.freeze([
  Object.freeze({ id: 'alpha', behaviour: CLAUDE_BEHAVIOURS.succeed }),
]);

const BETA_FACTS = Object.freeze({
  repo: 'acme/widgets',
  base: 'main',
  head: 'mitosis/beta-integration',
  title: 'feat(beta): unit beta',
  why: 'fixture rationale for unit beta',
  what: 'unit beta',
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

function buildAndShip(sandbox, unitPlans) {
  planRun(sandbox, unitPlans);
  const ship = runMitosisCli(sandbox);
  assert.equal(ship.summary === null, false, `the run printed no summary to read: ${ship.stderr}`);
  assert.equal(claudeArgvs(sandbox).length, unitPlans.length, 'the run dispatches exactly one implement child per unit, and a clean gate composes no boundary fix');
  assert.deepEqual(ship.summary.resume.built, [], 'nothing was built when this invocation planned, so everything Ship walks was built by the Execute it just ran');
  return ship;
}

test('Ship opens a pull request for every msp it published, stacking the dependent on the prerequisite head this walk published', () => {
  withSandbox({ boundaryToolchain: true }, (sandbox) => {
    const ship = buildAndShip(sandbox, THREE_UNITS);

    assert.deepEqual(ship.summary.integrate.integrated, ['alpha', 'gamma', 'beta'], 'all three units must reach integrated or Ship has nothing to walk');
    const created = ghArgvsMatching(sandbox, PR_CREATE_PREFIX);
    assert.equal(created.length, 3, 'a prerequisite published in this walk carries the work its dependent was built on, so the dependent stacks on it rather than waiting for a merge');
    assert.deepEqual(created.map((argv) => flagValue(argv, '--base')), [BASE_BRANCH, BASE_BRANCH, integrationBranchOf('alpha')]);
    assert.deepEqual(created.map((argv) => flagValue(argv, '--head')), [integrationBranchOf('alpha'), integrationBranchOf('gamma'), integrationBranchOf('beta')]);
    assert.deepEqual(created.map((argv) => flagValue(argv, '--title')), ['feat(alpha): unit alpha', 'feat(gamma): unit gamma', 'feat(beta): unit beta']);
    assert.equal(ship.summary.ship.status, 'all-integrated-opened');
    assert.deepEqual(ship.summary.ship.opened, ['alpha', 'gamma', 'beta']);
    assert.deepEqual(ship.summary.ship.parked, []);
    assert.deepEqual(ship.summary.ship.blocked, []);
    assert.deepEqual(ship.summary.ship.awaiting, []);
    assert.deepEqual(ship.summary.ship.mergeOrder.map((entry) => [entry.position, entry.unitId, entry.base, entry.deleteAfterMerge]), [
      [1, 'alpha', BASE_BRANCH, true],
      [2, 'gamma', BASE_BRANCH, false],
      [3, 'beta', integrationBranchOf('alpha'), false],
    ], 'the operator is handed the order the merges have to happen in, and told which branch must be deleted before the child retargets');
    assert.deepEqual(ship.summary.ship.outcomes, [
      { id: 'alpha', state: 'shipped', action: 'created' },
      { id: 'gamma', state: 'shipped', action: 'created' },
      { id: 'beta', state: 'shipped', action: 'created' },
    ]);
    assert.deepEqual(shipRecords(sandbox).map((record) => [record.mspId, record.prUrl, record.mergedAt]), [
      ['alpha', OPENED_PR_URL, null],
      ['gamma', OPENED_PR_URL, null],
      ['beta', OPENED_PR_URL, null],
    ]);
  });
});

test('the dependent ships in the same walk once the merged-pull-request probe reports its prerequisite merged', () => {
  withSandbox({ boundaryToolchain: true, ghPlan: { steps: ghPlanSteps({ mergedPullRequests: MERGED_ALPHA }) } }, (sandbox) => {
    const ship = buildAndShip(sandbox, THREE_UNITS);

    const created = ghArgvsMatching(sandbox, PR_CREATE_PREFIX);
    assert.equal(created.length, 3, 'a merged prerequisite clears the gate, so the dependent joins the two units that never needed it');
    assert.deepEqual(created.map((argv) => flagValue(argv, '--head')), [integrationBranchOf('alpha'), integrationBranchOf('gamma'), integrationBranchOf('beta')]);
    assert.equal(ship.summary.ship.status, 'all-integrated-opened');
    assert.deepEqual(ship.summary.ship.opened, ['alpha', 'gamma', 'beta']);
    assert.deepEqual(ship.summary.ship.parked, []);
    assert.deepEqual(ship.summary.ship.blocked, []);
    assert.deepEqual(ship.summary.ship.awaiting, []);
  });
});

test('every opened pull request claims the boundary gate clean, claims no unit verdict at all, and declares the receipts enforcer unverified', () => {
  withSandbox({ boundaryToolchain: true }, (sandbox) => {
    buildAndShip(sandbox, THREE_UNITS);

    const bodies = ghArgvsMatching(sandbox, PR_CREATE_PREFIX).map((argv) => flagValue(argv, '--body'));
    assert.equal(bodies.length, 3);
    for (const body of bodies) {
      assert.equal(String(body).includes(`Not verified: ${RECEIPTS_NOT_VERIFIED}`), true, 'the enforcer runs only after the pull request exists and the body is immutable, so it is always declared not run');
      assert.equal(String(body).includes(UNMEASURED_UNIT_VERDICT), false, 'no host-side code ever runs the unit check, so a body claiming the unit verdict green claims a check nobody ran');
      assert.deepEqual(verifiedLinesOf(body), [`Verified: ${BOUNDARY_VERIFIED}`]);
    }
  });
});

test('a pull request the centralized tool did not compose parks the msp, and is still recorded once', () => {
  const openPullRequests = [{ url: 'https://github.com/acme/widgets/pull/4', number: 4, body: 'opened by hand, carrying no tool trailer' }];
  withSandbox({ boundaryToolchain: true, ghPlan: { steps: ghPlanSteps({ openPullRequests }) } }, (sandbox) => {
    const ship = buildAndShip(sandbox, ONE_UNIT);

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
  assert.deepEqual([...composePrCreateArgv(BETA_FACTS).argv], [
    '--', PR_TOOL_PATH, 'pr-create',
    '--repo', 'acme/widgets',
    '--head', 'mitosis/beta-integration',
    '--base', 'main',
    '--title', 'feat(beta): unit beta',
    '--why', 'fixture rationale for unit beta',
    '--what', 'Unit beta.',
    '--verified', 'boundary gate - clean',
    '--not-verified', 'receipts enforcer - not run',
  ]);
});

test('the composed --what value is the msp title capitalised and full-stopped, and a colon inside it is never truncated', () => {
  const withColon = composePrCreateArgv({ ...BETA_FACTS, what: 'Test the colon: it survives.' }).argv;
  assert.equal(withColon[withColon.indexOf('--what') + 1], 'Test the colon: it survives.');
});

test('a gate that was not clean drops its verified line, and the receipts one still reaches a tool that refuses an empty verification section', () => {
  const ungated = composePrCreateArgv({ ...BETA_FACTS, boundaryClean: false }).argv;
  assert.deepEqual([...ungated].slice(ungated.indexOf('--what')), [
    '--what', 'Unit beta.',
    '--not-verified', 'receipts enforcer - not run',
  ]);

  const claimedGreen = composePrCreateArgv({ ...BETA_FACTS, green: true }).argv;
  assert.deepEqual([...claimedGreen].slice(claimedGreen.indexOf('--what')), [
    '--what', 'Unit beta.',
    '--verified', 'boundary gate - clean',
    '--not-verified', 'receipts enforcer - not run',
  ], 'nothing measures a unit verdict, so a fact asserting one is ignored rather than rendered as a verified line');
});

const NO_CI_WATCH = Object.freeze({ outcomes: EMPTY_CI, green: EMPTY_CI, unwatched: EMPTY_CI, exhausted: EMPTY_CI });

function publishedOutcome(request, extra = {}) {
  return Object.freeze({
    alreadyMerged: false,
    prUrl: null,
    published: true,
    action: 'published',
    head: request.integrationBranch,
    base: request.baseBranch,
    tip: `tip-of-${request.integrationBranch}`,
    changedLines: null,
    conflictPaths: EMPTY_CI,
    detail: 'the stub publish left the head standing on the remote',
    ...extra,
  });
}

const SHIP_PORTS = Object.freeze({
  openPullRequest: () => ({ status: 0, stdout: '' }),
  appendJournal: () => {},
  publishHead: (request) => publishedOutcome(request),
  reconcile: () => [],
  mergedIntoBase: () => false,
  retireHead: () => false,
  watchCi: () => NO_CI_WATCH,
});
const SHIP_CONFIG = Object.freeze({ integrated: [], manifest: {}, repoRoot: '/repo', repoSlug: 'acme/widgets', journalPath: '.mitosis/run.jsonl' });

const MERGED_ALPHA_PR = Object.freeze([Object.freeze({
  headRefName: 'mitosis/alpha-integration',
  url: 'https://github.com/acme/widgets/pull/2',
  mergedAt: '2026-01-01T00:00:00Z',
})]);

const BETA_MSP = Object.freeze({
  id: 'beta',
  title: 'unit beta',
  rationale: 'fixture rationale for unit beta',
  changeType: 'feat',
  scope: 'beta',
  integrationBranch: 'mitosis/beta-integration',
  builtSha: '1122334455667788990011223344556677889900',
  green: true,
  dependsOn: ['alpha'],
});

const CREATED_LINE = `${JSON.stringify({ action: 'created', url: 'https://github.com/acme/widgets/pull/5', number: 5 })}\n`;

function shippingConfig(extra = {}) {
  return {
    ...SHIP_CONFIG,
    integrated: [{ unitId: 'beta', state: 'integrated', resumePoint: { branch: null, ref: null, stage: 'ship' } }],
    manifest: { baseBranch: 'main', sourcePrefix: 'mitosis', msps: [BETA_MSP] },
    ...extra,
  };
}

function shippingPorts(extra = {}) {
  const spawned = [];
  const written = [];
  const probed = [];
  const watched = [];
  const requested = [];
  return {
    spawned,
    written,
    probed,
    watched,
    requested,
    ports: {
      openPullRequest: (request) => { spawned.push(request.argv); return { status: 0, stdout: CREATED_LINE, stderr: '' }; },
      appendJournal: (request) => { written.push(JSON.parse(request.line)); },
      publishHead: (request) => { requested.push(request); return publishedOutcome(request); },
      reconcile: (values) => { probed.push(values); return MERGED_ALPHA_PR; },
      mergedIntoBase: () => false,
      retireHead: () => false,
      watchCi: (request) => { watched.push(request); return NO_CI_WATCH; },
      ...extra,
    },
  };
}

test('a head the publish did not leave standing on the remote reaches no pull-request tool at all', async () => {
  const parked = shippingPorts({
    publishHead: (request) => publishedOutcome(request, { published: false, action: 'parked', tip: null, detail: 'the remote carries nothing at this head' }),
  });
  const plan = await shipIntegrated(shippingConfig(), parked.ports);
  assert.deepEqual(parked.spawned, [], 'a pull request was composed on a head the publish never confirmed');
  assert.deepEqual(parked.written, []);
  assert.deepEqual(plan.parked.map((entry) => entry.unitId), ['beta']);
  assert.match(plan.parked[0].diagnosis, /does not stand on the remote/);

  const shapeless = shippingPorts({ publishHead: () => null });
  const onShapeless = await shipIntegrated(shippingConfig(), shapeless.ports);
  assert.deepEqual(shapeless.spawned, []);
  assert.match(onShapeless.parked[0].diagnosis, /answered with null/);
});

test('the publish is asked for the head the resume plan carried when it carried one, and the msp integration branch otherwise', async () => {
  const resumed = shippingPorts();
  await shipIntegrated(shippingConfig({ integrated: [{ unitId: 'beta', state: 'integrated', resumePoint: { branch: 'mitosis/beta-resumed', ref: null, stage: 'ship' } }] }), resumed.ports);
  assert.equal(resumed.requested[0].integrationBranch, 'mitosis/beta-resumed');
  assert.equal(resumed.spawned[0][resumed.spawned[0].indexOf('--head') + 1], 'mitosis/beta-resumed');

  const planned = shippingPorts();
  await shipIntegrated(shippingConfig(), planned.ports);
  assert.equal(planned.requested[0].integrationBranch, 'mitosis/beta-integration');
  assert.equal(planned.spawned[0][planned.spawned[0].indexOf('--head') + 1], 'mitosis/beta-integration');
});

test('the publish is handed the prerequisite heads this unit stacks on, in the order they precede one another', async () => {
  const chained = shippingPorts({
    reconcile: () => [
      ...MERGED_ALPHA_PR,
      { headRefName: 'mitosis/zeta-integration', url: 'https://github.com/acme/widgets/pull/3', mergedAt: '2026-01-01T00:00:00Z', mergeCommit: null },
    ],
  });
  await shipIntegrated(shippingConfig({
    manifest: {
      baseBranch: 'main',
      sourcePrefix: 'mitosis',
      msps: [
        { ...BETA_MSP, dependsOn: ['alpha', 'zeta'] },
        { id: 'alpha', integrationBranch: 'mitosis/alpha-integration', dependsOn: [] },
        { id: 'zeta', integrationBranch: 'mitosis/zeta-integration', dependsOn: ['alpha'] },
      ],
    },
    integrated: [{ unitId: 'beta', state: 'integrated', resumePoint: { branch: null, ref: null, stage: 'ship' } }],
  }), chained.ports);

  assert.deepEqual(chained.requested.map((request) => request.prerequisites), [[
    { id: 'alpha', integrationBranch: 'mitosis/alpha-integration', merged: true, precededBy: [] },
    { id: 'zeta', integrationBranch: 'mitosis/zeta-integration', merged: true, precededBy: ['alpha'] },
  ]], 'the base is the one prerequisite every other one precedes, and the engine states that order rather than leaving it to iteration');
});

test('a pull-request tool that fails, answers nothing readable, or names no msp parks the unit and records nothing', async () => {
  const failed = shippingPorts({ openPullRequest: () => ({ status: 21, stdout: '', stderr: 'the create call exited 1\nsecond line' }) });
  const onFailure = await shipIntegrated(shippingConfig(), failed.ports);
  assert.deepEqual(onFailure.outcomes.map((entry) => [entry.unitId, entry.state, entry.action]), [['beta', 'parked', null]]);
  assert.equal(onFailure.outcomes[0].diagnosis, 'the pull-request tool exited 21: the create call exited 1');
  assert.deepEqual(failed.written, []);

  const mute = shippingPorts({ openPullRequest: () => ({ status: 0, stdout: '{"action":"invented","url":"https://github.com/acme/widgets/pull/5"}\n', stderr: '' }) });
  const onSilence = await shipIntegrated(shippingConfig(), mute.ports);
  assert.deepEqual(onSilence.parked.map((entry) => entry.unitId), ['beta']);
  assert.deepEqual(mute.written, []);

  const unnamed = shippingPorts();
  const onUnknown = await shipIntegrated(shippingConfig({ manifest: { baseBranch: 'main', msps: [] } }), unnamed.ports);
  assert.deepEqual(onUnknown.outcomes.map((entry) => [entry.unitId, entry.state, entry.stage]), [['beta', 'parked', 'ship']]);
  assert.deepEqual(unnamed.spawned, []);

  const shapeless = shippingPorts({ openPullRequest: () => null });
  const onShapeless = await shipIntegrated(shippingConfig(), shapeless.ports);
  assert.equal(onShapeless.outcomes[0].diagnosis, 'the pull-request tool returned null rather than a spawn result');
});

test('a pull request the tool reused is a clean ship, and a ship record that will not write parks the unit it names', async () => {
  const reused = shippingPorts({ openPullRequest: () => ({ status: 0, stdout: `${JSON.stringify({ action: 'reused', url: 'https://github.com/acme/widgets/pull/6' })}\n`, stderr: '' }) });
  const onReuse = await shipIntegrated(shippingConfig(), reused.ports);
  assert.deepEqual(onReuse.opened.map((entry) => [entry.unitId, entry.action, entry.prUrl]), [['beta', 'reused', 'https://github.com/acme/widgets/pull/6']]);
  assert.deepEqual(reused.written.map((record) => [record.kind, record.mspId, record.title, record.rationale]), [['ship', 'beta', 'unit beta', 'fixture rationale for unit beta']]);

  const unwritable = shippingPorts({ appendJournal: () => { throw new Error('the journal is read only'); } });
  const onFailedWrite = await shipIntegrated(shippingConfig(), unwritable.ports);
  assert.deepEqual(onFailedWrite.parked.map((entry) => [entry.unitId, entry.action]), [['beta', 'created']]);
  assert.equal(
    onFailedWrite.outcomes[0].diagnosis,
    'the pull request at https://github.com/acme/widgets/pull/5 was opened but the ship record that would let a later run find it was not written: the journal is read only',
  );

  const threwNothing = shippingPorts({ appendJournal: () => { throw null; } });
  const onNothing = await shipIntegrated(shippingConfig(), threwNothing.ports);
  assert.equal(
    onNothing.outcomes[0].diagnosis,
    'the pull request at https://github.com/acme/widgets/pull/5 was opened but the ship record that would let a later run find it was not written: null',
  );
});

test('the ship summary names the units, their actions and the pull requests they reached', async () => {
  const ports = shippingPorts();
  const plan = await shipIntegrated(shippingConfig(), ports.ports);
  assert.deepEqual(shipSummary(plan), {
    opened: ['beta'],
    parked: [],
    prUrls: { beta: 'https://github.com/acme/widgets/pull/5' },
    outcomes: [{ id: 'beta', state: 'shipped', action: 'created' }],
    status: 'all-integrated-opened',
    ci: [],
    mergeOrder: [{
      position: 1,
      unitId: 'beta',
      prUrl: 'https://github.com/acme/widgets/pull/5',
      head: 'mitosis/beta-integration',
      base: 'main',
      deleteAfterMerge: false,
    }],
    retired: [],
    awaiting: [],
    blocked: [],
  });
  assert.deepEqual(ports.probed, [{ ownerRepo: 'acme/widgets', baseBranch: 'main', sourcePrefix: 'mitosis', repoHost: null }]);
  assert.deepEqual(ports.watched, [{
    opened: [{ unitId: 'beta', head: 'mitosis/beta-integration', prUrl: 'https://github.com/acme/widgets/pull/5', declaredScope: [] }],
    repoRoot: '/repo',
    repoSlug: 'acme/widgets',
  }], 'the loop is handed exactly the heads this walk opened a pull request on, never one it parked');
});

const GAMMA_MSP = Object.freeze({
  id: 'gamma',
  title: 'unit gamma',
  rationale: 'fixture rationale for unit gamma',
  changeType: 'feat',
  scope: 'gamma',
  integrationBranch: 'mitosis/gamma-integration',
  builtSha: '0099887766554433221100998877665544332211',
  green: true,
  dependsOn: ['beta'],
});

function chainConfig(extra = {}) {
  return shippingConfig({
    integrated: [
      { unitId: 'beta', state: 'integrated', resumePoint: { branch: null, ref: null, stage: 'ship' } },
      { unitId: 'gamma', state: 'integrated', resumePoint: { branch: null, ref: null, stage: 'ship' } },
    ],
    manifest: { baseBranch: 'main', sourcePrefix: 'mitosis', msps: [BETA_MSP, GAMMA_MSP] },
    ...extra,
  });
}

test('a prerequisite the merged set does not name parks its dependent under the awaiting-upstream kind, and opens no pull request for it', async () => {
  const ports = shippingPorts({ reconcile: () => [] });
  const plan = await shipIntegrated(shippingConfig(), ports.ports);

  assert.deepEqual(ports.spawned, [], 'a dependent whose prerequisite is unmerged never reaches the pull-request tool');
  assert.deepEqual(ports.written, [], 'nothing shipped, so no ship record claims one did');
  assert.equal(plan.status, 'awaiting-approval');
  assert.deepEqual(plan.outcomes.map((entry) => [entry.unitId, entry.state, entry.action, entry.stage, entry.diagnosis]), [
    ['beta', 'parked', null, 'ship', 'approve + merge the prerequisite PR, then relaunch mitosis to continue'],
  ]);
  assert.deepEqual([...plan.awaiting], [{ kind: 'awaiting-approval', mspId: 'beta', prUrl: null, receiptsPass: null, d6Pass: null }]);
  assert.equal(plan.blocked.length, 1);
  assert.deepEqual(plan.blocked[0].record.request, { kind: 'blocked-pending-approval', what: 'alpha', detail: null });
  assert.deepEqual(plan.blocked[0].record.resumePoint, { branch: null, ref: null, stage: 'ship' });
  assert.deepEqual([...plan.blocked[0].held], ['alpha']);
});

test('one park covers the whole downstream chain, and the unit it already parked is never parked a second time', async () => {
  const ports = shippingPorts({ reconcile: () => [] });
  const plan = await shipIntegrated(chainConfig(), ports.ports);

  assert.deepEqual(ports.spawned, []);
  assert.deepEqual(plan.outcomes.map((entry) => [entry.unitId, entry.state]), [['beta', 'parked'], ['gamma', 'parked']]);
  assert.equal(plan.blocked.length, 1, 'the park that names beta already carries gamma as a dependent, so a second record would double-count the same block');
  assert.deepEqual([...plan.blocked[0].record.dependents], ['gamma']);
  assert.deepEqual(plan.awaiting.map((entry) => entry.mspId), ['beta']);
  assert.equal(plan.status, 'awaiting-approval');
});

test('a prerequisite this walk published is what its dependent stacks on, rather than a merge the walk waits for', async () => {
  const ports = shippingPorts({ reconcile: () => [] });
  const plan = await shipIntegrated(chainConfig({
    manifest: { baseBranch: 'main', sourcePrefix: 'mitosis', msps: [{ ...BETA_MSP, dependsOn: [] }, GAMMA_MSP] },
  }), ports.ports);

  assert.deepEqual(plan.opened.map((entry) => entry.unitId), ['beta', 'gamma']);
  assert.deepEqual(ports.requested.map((request) => [request.integrationBranch, request.prerequisites.map((entry) => entry.integrationBranch)]), [
    ['mitosis/beta-integration', []],
    ['mitosis/gamma-integration', ['mitosis/beta-integration']],
  ]);
  assert.deepEqual([...plan.awaiting], []);
  assert.equal(plan.status, 'all-integrated-opened');
});

test('the pull request this run just opened for a prerequisite is what the awaiting record names as the one to merge', async () => {
  const ports = shippingPorts({ reconcile: () => [], appendJournal: () => { throw new Error('the journal is read only'); } });
  const plan = await shipIntegrated(chainConfig({
    manifest: { baseBranch: 'main', sourcePrefix: 'mitosis', msps: [{ ...BETA_MSP, dependsOn: [] }, GAMMA_MSP] },
  }), ports.ports);

  assert.deepEqual(plan.opened.map((entry) => entry.unitId), [], 'a pull request whose ship record never landed is not a clean ship, so nothing downstream stacks on it');
  assert.deepEqual(plan.outcomes.map((entry) => [entry.unitId, entry.state, entry.prUrl]), [
    ['beta', 'parked', 'https://github.com/acme/widgets/pull/5'],
    ['gamma', 'parked', null],
  ]);
  assert.deepEqual([...plan.awaiting], [{
    kind: 'awaiting-approval',
    mspId: 'gamma',
    prUrl: 'https://github.com/acme/widgets/pull/5',
    receiptsPass: null,
    d6Pass: null,
  }]);
  assert.equal(plan.status, 'blocked', 'one unit parked on a record nobody wrote and one held behind it is not a run awaiting only a human approval');
});

test('the merged-pull-request probe is skipped when no integrated unit declares a prerequisite at all', async () => {
  const ports = shippingPorts();
  const plan = await shipIntegrated(shippingConfig({ manifest: { baseBranch: 'main', sourcePrefix: 'mitosis', msps: [{ ...BETA_MSP, dependsOn: [] }] } }), ports.ports);
  assert.deepEqual(ports.probed, [], 'a run with nothing to serialize behind spends no forge read');
  assert.deepEqual(plan.opened.map((entry) => entry.unitId), ['beta']);
});

test('a merged set the run cannot read holds the dependent back rather than shipping it on an unchecked prerequisite', async () => {
  const unprefixed = shippingPorts();
  const onHalfNamedManifest = await shipIntegrated(shippingConfig({ manifest: { baseBranch: 'main', msps: [BETA_MSP] } }), unprefixed.ports);
  assert.deepEqual(unprefixed.probed, [], 'a manifest naming no source prefix cannot be turned into a branch-to-unit mapping, so no probe is spawned rather than one that would be read wrongly');
  assert.deepEqual(onHalfNamedManifest.parked.map((entry) => entry.unitId), ['beta']);
  assert.equal(onHalfNamedManifest.status, 'awaiting-approval');

  const shapeless = shippingPorts({ reconcile: () => null });
  const onShapelessReply = await shipIntegrated(shippingConfig(), shapeless.ports);
  assert.deepEqual(shapeless.spawned, []);
  assert.deepEqual(onShapelessReply.awaiting.map((entry) => entry.mspId), ['beta']);
});

test('only the last action line the tool prints is read, and a line naming no action is passed over', () => {
  assert.deepEqual(readPrAction(`noise\n{"action":"reused","url":"https://github.com/acme/widgets/pull/1"}\n${CREATED_LINE}`), { action: 'created', url: 'https://github.com/acme/widgets/pull/5' });
  assert.equal(readPrAction('{"action":"created"}\n'), null);
  assert.equal(readPrAction('{"action":"merged","url":"https://github.com/acme/widgets/pull/5"}\n'), null);
  assert.equal(readPrAction(''), null);
});

test('a title the msp cannot compose is refused field by field, never mangled into the pattern', () => {
  for (const missing of ['changeType', 'scope', 'title']) {
    assert.equal(prTitleOf({ ...BETA_MSP, [missing]: null }), null, `${missing} is mandatory and is never invented`);
  }
  assert.equal(prTitleOf(BETA_MSP), 'feat(beta): unit beta');
  assert.equal(prTitleOf({ ...BETA_MSP, changeType: 'sneak' }), null, 'a type outside the conventional-commits list would be rejected by the tool, so it is refused here');
  assert.equal(composePrCreateArgv({ ...BETA_FACTS, title: null }).ok, false, 'one unusable field is enough to refuse the whole argv');
});

function refusal(config, ports) {
  return assert.rejects(() => shipIntegrated(config, ports), (error) => error instanceof TypeError);
}

test('the ship config is refused at the boundary, and the refusal names what arrived instead', async () => {
  await assert.rejects(() => shipIntegrated(null, SHIP_PORTS), /ship config must be a non-null, non-array object, received null$/);
  await assert.rejects(() => shipIntegrated([], SHIP_PORTS), /ship config must be a non-null, non-array object, received an array$/);
  await assert.rejects(() => shipIntegrated({ ...SHIP_CONFIG, integrated: 'alpha' }, SHIP_PORTS), /integrated array Integrate froze.*received string$/);
  await assert.rejects(() => shipIntegrated({ ...SHIP_CONFIG, manifest: [] }, SHIP_PORTS), /needs the run manifest.*received an array$/);
  await assert.rejects(() => shipIntegrated({ ...SHIP_CONFIG, repoRoot: '' }, SHIP_PORTS), /non-empty repoRoot.*received string$/);
  await assert.rejects(() => shipIntegrated({ ...SHIP_CONFIG, journalPath: undefined }, SHIP_PORTS), /non-empty journalPath.*received undefined$/);
  assert.deepEqual(
    await shipIntegrated({ ...SHIP_CONFIG, journalPath: 'j' }, SHIP_PORTS),
    { opened: [], parked: [], outcomes: [], awaiting: [], blocked: [], retired: [], ci: NO_CI_WATCH, status: 'nothing-pending' },
    'a one-character path is a path; the boundary refuses what is empty, never what is short',
  );
});

test('an integrated entry with no unit id is refused rather than shipped under a name nobody wrote', async () => {
  await refusal({ ...SHIP_CONFIG, integrated: [{ unitId: '', state: 'integrated' }] }, SHIP_PORTS);
  await assert.rejects(
    () => shipIntegrated({ ...SHIP_CONFIG, integrated: [null] }, SHIP_PORTS),
    /integrated entry 0 must be an object carrying a unitId and the state Integrate settled it at, received null$/,
  );
});

test('a ship port that is not a function is refused before any pull request is opened', async () => {
  for (const missing of ['openPullRequest', 'appendJournal', 'publishHead', 'reconcile', 'watchCi', 'mergedIntoBase', 'retireHead']) {
    await assert.rejects(
      () => shipIntegrated(SHIP_CONFIG, { ...SHIP_PORTS, [missing]: null }),
      new RegExp(`need a ${missing} function.*received null$`),
    );
  }
  await assert.rejects(() => shipIntegrated(SHIP_CONFIG, null), /ship ports must be a non-null, non-array object, received null$/);
});

test('a msp whose mandated pull-request fields cannot be read composes no argv rather than a placeholder', () => {
  const composed = composePrCreateArgv({ ...BETA_FACTS, base: null, title: null });
  assert.equal(composed.ok, false);
  assert.equal(composed.argv, null);
  assert.deepEqual([...composed.unusable], [
    '--base from the manifest base branch',
    '--title from the msp change type, scope and title',
  ]);
});
