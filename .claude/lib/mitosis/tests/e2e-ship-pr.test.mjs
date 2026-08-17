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

test('Ship opens a pull request for every msp the merge gate clears, and parks the dependent whose prerequisite is not merged', () => {
  withSandbox({ boundaryToolchain: true }, (sandbox) => {
    const ship = buildThenShip(sandbox, THREE_UNITS);

    assert.deepEqual(ship.summary.integrate.integrated, ['alpha', 'gamma', 'beta'], 'all three units must reach integrated or Ship has nothing to walk');
    const created = ghArgvsMatching(sandbox, PR_CREATE_PREFIX);
    assert.equal(created.length, 2, 'alpha and gamma clear the gate and beta does not; an empty recorder would mean the real gh binary ran instead');
    assert.deepEqual(created.map((argv) => flagValue(argv, '--base')), [BASE_BRANCH, BASE_BRANCH]);
    assert.deepEqual(created.map((argv) => flagValue(argv, '--head')), [integrationBranchOf('alpha'), integrationBranchOf('gamma')]);
    assert.deepEqual(created.map((argv) => flagValue(argv, '--title')), ['feat(alpha): unit alpha', 'feat(gamma): unit gamma']);
    assert.deepEqual(created.map((argv) => flagValue(argv, '--changed-lines')), [null, null], 'the integration branches this fixture never pushes cannot be measured, and a size nobody measured is left out rather than estimated');
    assert.equal(ship.summary.ship.status, 'awaiting-approval');
    assert.deepEqual(ship.summary.ship.opened, ['alpha', 'gamma']);
    assert.deepEqual(ship.summary.ship.parked, ['beta']);
    assert.deepEqual(ship.summary.ship.blocked, [{ id: 'beta', kind: 'blocked-pending-approval', held: ['alpha'], dependents: [] }]);
    assert.deepEqual(ship.summary.ship.awaiting, [{ id: 'beta', prUrl: OPENED_PR_URL }]);
    assert.deepEqual(ship.summary.ship.outcomes, [
      { id: 'alpha', state: 'shipped', action: 'created' },
      { id: 'gamma', state: 'shipped', action: 'created' },
      { id: 'beta', state: 'parked', action: null },
    ]);
    assert.deepEqual(shipRecords(sandbox).map((record) => [record.mspId, record.prUrl, record.mergedAt]), [
      ['alpha', OPENED_PR_URL, null],
      ['gamma', OPENED_PR_URL, null],
    ]);
  });
});

test('the dependent ships in the same walk once the merged-pull-request probe reports its prerequisite merged', () => {
  withSandbox({ boundaryToolchain: true, ghPlan: { steps: ghPlanSteps({ mergedPullRequests: MERGED_ALPHA }) } }, (sandbox) => {
    const ship = buildThenShip(sandbox, THREE_UNITS);

    const created = ghArgvsMatching(sandbox, PR_CREATE_PREFIX);
    assert.equal(created.length, 3, 'a merged prerequisite clears the gate, so the dependent joins the two units that never needed it');
    assert.deepEqual(created.map((argv) => flagValue(argv, '--head')), [integrationBranchOf('alpha'), integrationBranchOf('gamma'), integrationBranchOf('beta')]);
    assert.equal(ship.summary.ship.status, 'all-shipped');
    assert.deepEqual(ship.summary.ship.opened, ['alpha', 'gamma', 'beta']);
    assert.deepEqual(ship.summary.ship.parked, []);
    assert.deepEqual(ship.summary.ship.blocked, []);
    assert.deepEqual(ship.summary.ship.awaiting, []);
  });
});

test('every opened pull request declares the receipts enforcer unverified, and claims it verified nowhere', () => {
  withSandbox({ boundaryToolchain: true }, (sandbox) => {
    buildThenShip(sandbox, THREE_UNITS);

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
  assert.equal(changedLinesOf(' 9 files changed, 9999999 insertions(+), 1 deletions(-)\n'), null, 'a total the tool would reject as more than seven digits is left out rather than sent to a usage rejection');
});

const SHIP_PORTS = Object.freeze({ openPullRequest: () => ({ status: 0, stdout: '' }), appendJournal: () => {}, diffStat: () => ({ status: 1, stdout: '' }) });
const SHIP_CONFIG = Object.freeze({ integrated: [], manifest: {}, repoRoot: '/repo', repoSlug: 'acme/widgets', journalPath: '.mitosis/run.jsonl' });

const BETA_MSP = Object.freeze({
  id: 'beta',
  title: 'unit beta',
  rationale: 'fixture rationale for unit beta',
  changeType: 'feat',
  scope: 'beta',
  integrationBranch: 'mitosis/beta-integration',
  green: true,
  dependsOn: ['alpha'],
});

const CREATED_LINE = `${JSON.stringify({ action: 'created', url: 'https://github.com/acme/widgets/pull/5', number: 5 })}\n`;

function shippingConfig(extra = {}) {
  return {
    ...SHIP_CONFIG,
    integrated: [{ unitId: 'beta', state: 'integrated', resumePoint: { branch: null, ref: null, stage: 'ship' } }],
    manifest: { baseBranch: 'main', msps: [BETA_MSP] },
    ...extra,
  };
}

function shippingPorts(extra = {}) {
  const spawned = [];
  const written = [];
  return {
    spawned,
    written,
    ports: {
      openPullRequest: (request) => { spawned.push(request.argv); return { status: 0, stdout: CREATED_LINE, stderr: '' }; },
      appendJournal: (request) => { written.push(JSON.parse(request.line)); },
      diffStat: () => ({ status: 1, stdout: '', stderr: 'no such ref' }),
      ...extra,
    },
  };
}

test('a shortstat the diff read answers becomes the changed-line flag, and its absence removes the flag', async () => {
  const measured = shippingPorts({ diffStat: () => ({ status: 0, stdout: ' 2 files changed, 5 insertions(+), 3 deletions(-)\n' }) });
  await shipIntegrated(shippingConfig(), measured.ports);
  assert.equal(measured.spawned[0][measured.spawned[0].indexOf('--changed-lines') + 1], '8');

  const unmeasured = shippingPorts();
  await shipIntegrated(shippingConfig(), unmeasured.ports);
  assert.equal(unmeasured.spawned[0].includes('--changed-lines'), false);

  const shapeless = shippingPorts({ diffStat: () => null });
  const plan = await shipIntegrated(shippingConfig(), shapeless.ports);
  assert.equal(shapeless.spawned[0].includes('--changed-lines'), false, 'a diff read that answers with no result at all leaves the size unstated rather than throwing');
  assert.deepEqual(plan.opened.map((entry) => entry.unitId), ['beta']);
});

test('the diff read is skipped entirely when the branches it would compare are not both known', async () => {
  const probed = [];
  const ports = shippingPorts({ diffStat: (request) => { probed.push(request); return { status: 1, stdout: '' }; } });
  const plan = await shipIntegrated(shippingConfig({ manifest: { msps: [BETA_MSP] } }), ports.ports);
  assert.deepEqual(probed, [], 'a shortstat between a base nobody declared and a head is a comparison against an arbitrary tree');
  assert.deepEqual(plan.parked.map((entry) => entry.unitId), ['beta']);
  assert.deepEqual(ports.spawned, []);
});

test('the head is the resume point branch when the resume plan carried one, and the msp integration branch otherwise', async () => {
  const resumed = shippingPorts();
  await shipIntegrated(shippingConfig({ integrated: [{ unitId: 'beta', state: 'integrated', resumePoint: { branch: 'mitosis/beta-resumed', ref: null, stage: 'ship' } }] }), resumed.ports);
  assert.equal(resumed.spawned[0][resumed.spawned[0].indexOf('--head') + 1], 'mitosis/beta-resumed');

  const planned = shippingPorts();
  await shipIntegrated(shippingConfig(), planned.ports);
  assert.equal(planned.spawned[0][planned.spawned[0].indexOf('--head') + 1], 'mitosis/beta-integration');
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
  });
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
  assert.equal(composePrCreateArgv({ ...BETA_FACTS, title: null }, null).ok, false, 'one unusable field is enough to refuse the whole argv');
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
    { opened: [], parked: [], outcomes: [] },
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
  for (const missing of ['openPullRequest', 'appendJournal', 'diffStat']) {
    await assert.rejects(
      () => shipIntegrated(SHIP_CONFIG, { ...SHIP_PORTS, [missing]: null }),
      new RegExp(`need a ${missing} function.*received null$`),
    );
  }
  await assert.rejects(() => shipIntegrated(SHIP_CONFIG, null), /ship ports must be a non-null, non-array object, received null$/);
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
