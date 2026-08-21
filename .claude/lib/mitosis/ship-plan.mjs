import { parseCheckpointRef } from './checkpoint.mjs';
import { ciSummary } from './ci-green-loop.mjs';
import { SHA_HEX_PATTERN } from './divergence.mjs';
import { INTEGRATED } from './integrate-plan.mjs';
import { composeJournalLine } from './journal-store.mjs';
import {
  AWAITING_UPSTREAM_KIND,
  BLOCKED_PENDING_APPROVAL_DIAGNOSIS,
  awaitingApprovalOutcome,
  computeMergePolicyStatus,
} from './merge-policy.mjs';
import { PR_TOOL_DIRECTORY, buildNodeCommand } from './node-commands.mjs';
import { LEGAL_STAGES, park } from './parking.mjs';
import { workTypeLineFor } from './pr-work-type.mjs';
import { withOverlapDependsOn } from './overlap-order.mjs';
import { branchToMspId, reconcileShippedSet } from './recovery.mjs';
import { SHIP_PUBLISH_ACTIONS } from './ship-publish.mjs';
import { inertValue, PR_TITLE_PATTERN, PR_VALUE_CAP } from '../git/pr-format.mjs';

const MODULE = 'ship-plan';

export { PR_TOOL_PATH } from './node-commands.mjs';

export const SHIPPED = 'shipped';
export const PARKED = 'parked';
export const SHIP_STATES = Object.freeze([SHIPPED, PARKED]);
export const SHIP_PARK_STAGE = 'ship';

export const RECEIPTS_NOT_VERIFIED = 'receipts enforcer - not run';
export const BOUNDARY_VERIFIED = 'boundary gate - clean';

export const PR_ACTION_CREATED = 'created';
export const PR_ACTION_REUSED = 'reused';
export const PR_ACTION_REUSED_UNVERIFIED = 'reused-unverified';
export const PR_ACTIONS = Object.freeze([PR_ACTION_CREATED, PR_ACTION_REUSED, PR_ACTION_REUSED_UNVERIFIED]);
export const PR_ACTION_ALREADY_MERGED = 'already-merged';

export const HEAD_STANDS_ACTIONS = Object.freeze(['published', 'republished', 'already-published']);

const REQUIRED_PORTS = Object.freeze(['openPullRequest', 'appendJournal', 'publishHead', 'reconcile', 'watchCi', 'mergedIntoBase', 'retireHead']);
const SHIP_KIND = 'ship';
const PR_OPEN_STEP = 'open-pr';
const INTEGRATION_SUFFIX = '-integration';
const EMPTY = Object.freeze([]);
const NO_RESUME_POINT = Object.freeze({ branch: null, ref: null, stage: null });

function describe(value) {
  if (value === null) return 'null';
  return Array.isArray(value) ? 'an array' : typeof value;
}

function isRecord(value) {
  return value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyText(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function requirePorts(ports) {
  if (!isRecord(ports)) {
    throw new TypeError(`${MODULE}: the ship ports must be a non-null, non-array object, received ${describe(ports)}`);
  }
  for (const name of REQUIRED_PORTS) {
    if (typeof ports[name] !== 'function') {
      throw new TypeError(`${MODULE}: the ship ports need a ${name} function, because this module spawns no child and writes no file of its own, received ${describe(ports[name])}`);
    }
  }
  const unknown = HEAD_STANDS_ACTIONS.filter((action) => !SHIP_PUBLISH_ACTIONS.includes(action));
  if (unknown.length > 0) {
    throw new TypeError(`${MODULE}: this module reads ${unknown.join(', ')} as the publish having left the head standing on the remote, and the publish stage reports no such action (${SHIP_PUBLISH_ACTIONS.join(', ')}); a renamed action would silently stop matching and every head would read as unpublished`);
  }
  return ports;
}

function requireIntegratedEntry(entry, index) {
  if (!isRecord(entry)) {
    throw new TypeError(`${MODULE}: integrated entry ${index} must be an object carrying a unitId and the state Integrate settled it at, received ${describe(entry)}`);
  }
  if (nonEmptyText(entry.unitId) === null) {
    throw new TypeError(`${MODULE}: integrated entry ${index} names the unit ${JSON.stringify(entry.unitId)}, and a pull request opened for a unit nobody named could never be matched back to the msp it ships`);
  }
  return Object.freeze({
    unitId: entry.unitId,
    state: entry.state,
    resumePoint: isRecord(entry.resumePoint) ? Object.freeze({ ...NO_RESUME_POINT, ...entry.resumePoint }) : NO_RESUME_POINT,
  });
}

function requireConfig(config) {
  if (!isRecord(config)) {
    throw new TypeError(`${MODULE}: the ship config must be a non-null, non-array object, received ${describe(config)}`);
  }
  if (!Array.isArray(config.integrated)) {
    throw new TypeError(`${MODULE}: the ship config needs the integrated array Integrate froze, because that array is the complete set of units this phase may open a pull request for, received ${describe(config.integrated)}`);
  }
  if (!isRecord(config.manifest)) {
    throw new TypeError(`${MODULE}: the ship config needs the run manifest, because every pull-request field but the head branch is read from the msp record it holds, received ${describe(config.manifest)}`);
  }
  for (const field of ['repoRoot', 'repoSlug', 'journalPath']) {
    if (nonEmptyText(config[field]) === null) {
      throw new TypeError(`${MODULE}: the ship config needs a non-empty ${field}, because the pull request is opened against it and a blank one would target something the caller never wrote, received ${describe(config[field])}`);
    }
  }
  return Object.freeze({
    integrated: Object.freeze(config.integrated.map(requireIntegratedEntry)),
    manifest: config.manifest,
    repoRoot: config.repoRoot,
    repoSlug: config.repoSlug,
    journalPath: config.journalPath,
    modelById: config.modelById instanceof Map ? config.modelById : new Map(),
  });
}

function parkStage() {
  if (!LEGAL_STAGES.includes(SHIP_PARK_STAGE)) {
    throw new TypeError(`${MODULE}: ${JSON.stringify(SHIP_PARK_STAGE)} is not one of the legal park stages ${LEGAL_STAGES.join(', ')}, and a park recorded at a stage no resume path reads would strand the unit`);
  }
  return SHIP_PARK_STAGE;
}

function outcome(entry, state, action, prUrl, diagnosis, msp = null, published = null) {
  const publishedHead = isRecord(published) ? nonEmptyText(published.head) : null;
  return Object.freeze({
    unitId: entry.unitId,
    state,
    action,
    prUrl,
    diagnosis,
    head: publishedHead === null ? (msp === null ? null : headBranch(entry, msp)) : publishedHead,
    base: isRecord(published) ? nonEmptyText(published.base) : null,
    declaredScope: msp === null ? EMPTY : scopeOf(msp),
    stage: state === PARKED ? parkStage() : null,
    resumePoint: entry.resumePoint,
  });
}

export function headStands(published) {
  return isRecord(published)
    && HEAD_STANDS_ACTIONS.includes(published.action)
    && nonEmptyText(published.tip) !== null
    && nonEmptyText(published.head) !== null
    && nonEmptyText(published.base) !== null;
}

export function readPrAction(stdout) {
  if (typeof stdout !== 'string') return null;
  let read = null;
  for (const line of stdout.split('\n')) {
    let parsed = null;
    try {
      parsed = JSON.parse(line.trim());
    } catch {
      continue;
    }
    if (!isRecord(parsed)) continue;
    if (!PR_ACTIONS.includes(parsed.action)) continue;
    if (nonEmptyText(parsed.url) === null) continue;
    read = Object.freeze({ action: parsed.action, url: parsed.url });
  }
  return read;
}

export function prTitleOf(msp) {
  const changeType = nonEmptyText(msp.changeType);
  const scope = nonEmptyText(msp.scope);
  const summary = nonEmptyText(msp.title);
  if (changeType === null || scope === null || summary === null) return null;
  const composed = `${changeType}(${scope}): ${summary}`;
  return PR_TITLE_PATTERN.test(composed) ? composed : null;
}

function verifiedLines(facts) {
  return facts.boundaryClean === true ? [BOUNDARY_VERIFIED] : [];
}

export function unusableFields(facts) {
  const unusable = [];
  if (nonEmptyText(facts.repo) === null) unusable.push('--repo from the run repo slug');
  if (nonEmptyText(facts.base) === null) unusable.push('--base from the manifest base branch');
  if (nonEmptyText(facts.head) === null) unusable.push('--head from the msp integration branch');
  if (nonEmptyText(facts.title) === null) unusable.push('--title from the msp change type, scope and title');
  if (inertValue(facts.why, PR_VALUE_CAP) === null) unusable.push('--why from the msp rationale');
  if (inertValue(facts.what, PR_VALUE_CAP) === null) unusable.push('--what from the msp title');
  return unusable;
}

function whatSentenceFrom(value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${MODULE}: the pull-request what value must be a non-empty string, received ${describe(value)}`);
  }
  const capitalised = value.charAt(0).toUpperCase() + value.slice(1);
  const last = capitalised.charAt(capitalised.length - 1);
  return '.?!'.includes(last) ? capitalised : `${capitalised}.`;
}

function prCreateValues(facts) {
  return {
    gitLibDir: PR_TOOL_DIRECTORY,
    repoSlug: facts.repo,
    integrationBranch: facts.head,
    baseBranch: facts.base,
    title: facts.title,
    why: whatSentenceFrom(facts.why),
    workType: workTypeLineFor(facts.changeType),
    what: whatSentenceFrom(facts.what),
    verified: verifiedLines(facts)[0] ?? null,
    notVerified: RECEIPTS_NOT_VERIFIED,
  };
}

export function composePrCreateArgv(facts) {
  if (!isRecord(facts)) {
    throw new TypeError(`${MODULE}: the pull-request facts must be a non-null, non-array object, received ${describe(facts)}`);
  }
  const unusable = unusableFields(facts);
  if (unusable.length > 0) {
    return Object.freeze({ ok: false, unusable: Object.freeze(unusable), argv: null, refusal: null });
  }
  try {
    return Object.freeze({
      ok: true,
      unusable: EMPTY,
      argv: Object.freeze([...buildNodeCommand(SHIP_KIND, PR_OPEN_STEP, prCreateValues(facts))]),
      refusal: null,
    });
  } catch (error) {
    return Object.freeze({ ok: false, unusable: EMPTY, argv: null, refusal: messageOf(error) });
  }
}

function mspsOf(manifest) {
  return Array.isArray(manifest.msps) ? manifest.msps.filter(isRecord) : [];
}

function mspOf(manifest, unitId) {
  const found = mspsOf(manifest).find((msp) => msp.id === unitId);
  return found === undefined ? null : found;
}

function effectiveManifestOf(manifest) {
  return { ...manifest, msps: withOverlapDependsOn(mspsOf(manifest)) };
}

function headBranch(entry, msp) {
  const resumed = nonEmptyText(entry.resumePoint.branch);
  return resumed === null ? nonEmptyText(msp.integrationBranch) : resumed;
}

function factsOf(entry, msp, settings, published) {
  return Object.freeze({
    repo: settings.repoSlug,
    base: nonEmptyText(published.base),
    head: nonEmptyText(published.head),
    title: prTitleOf(msp),
    why: msp.rationale,
    what: msp.title,
    changeType: nonEmptyText(msp.changeType),
    boundaryClean: entry.state === INTEGRATED,
  });
}

function builtShaOf(msp) {
  const named = nonEmptyText(msp.builtSha);
  return named !== null && SHA_HEX_PATTERN.test(named) ? named : null;
}

function runNamespacedRef(manifest, unitId, ref) {
  const named = nonEmptyText(ref);
  const runId = nonEmptyText(manifest.logicalRunId);
  if (named === null || runId === null) return null;
  return parseCheckpointRef(named, runId) === unitId ? named : null;
}

function builtRefOf(entry, msp, manifest) {
  const recorded = [
    builtShaOf(msp),
    runNamespacedRef(manifest, entry.unitId, msp.checkpointRef),
    runNamespacedRef(manifest, entry.unitId, entry.resumePoint.ref),
  ];
  return recorded.find((named) => named !== null) ?? null;
}

function transitivePrereqs(manifest, unitId, seen = new Set()) {
  for (const id of declaredPrereqs(manifest, unitId)) {
    if (seen.has(id)) continue;
    seen.add(id);
    transitivePrereqs(manifest, id, seen);
  }
  return seen;
}

function precededWithin(manifest, unitId, siblings) {
  const ancestors = transitivePrereqs(manifest, unitId);
  return siblings.filter((id) => id !== unitId && ancestors.has(id));
}

function prerequisiteRecords(settings, unitId, mergedIds) {
  const manifest = effectiveManifestOf(settings.manifest);
  const declared = declaredPrereqs(manifest, unitId);
  const records = [];
  for (const id of declared) {
    const parent = mspOf(manifest, id);
    const branch = parent === null ? null : nonEmptyText(parent.integrationBranch);
    if (branch === null && mergedIds.has(id)) continue;
    if (branch === null) {
      return { error: `the prerequisite ${id} of this unit names no integration branch in the run manifest and is not confirmed merged, so the head this unit would be stacked on cannot be spelled and no base may be guessed for it` };
    }
    records.push({ id, integrationBranch: branch, merged: mergedIds.has(id) });
  }
  const named = records.map((record) => record.id);
  return {
    value: records.map((record) => ({ ...record, precededBy: precededWithin(manifest, record.id, named) })),
  };
}

function publishRequestOf(entry, msp, settings, mergedIds) {
  const head = headBranch(entry, msp);
  const builtRef = builtRefOf(entry, msp, settings.manifest);
  const baseBranch = nonEmptyText(settings.manifest.baseBranch);
  if (head === null || builtRef === null || baseBranch === null) {
    const missing = [
      head === null ? 'the integration branch this unit publishes as' : null,
      builtRef === null ? 'a built sha this run recorded as an object name, or a checkpoint ref under this run own namespace, for the head to be composed from' : null,
      baseBranch === null ? 'the trunk the run was decomposed against' : null,
    ].filter((named) => named !== null);
    return { error: `this run names ${missing.join(' and ')} nowhere, and a head composed from a value nobody recorded would publish something other than what this unit built` };
  }
  const prerequisites = prerequisiteRecords(settings, entry.unitId, mergedIds);
  if (prerequisites.error !== undefined) return { error: prerequisites.error };
  return {
    value: {
      repoRoot: settings.repoRoot,
      repoSlug: settings.repoSlug,
      integrationBranch: head,
      builtRef,
      baseBranch,
      prerequisites: prerequisites.value,
    },
  };
}

async function recordShip(entry, msp, read, settings, ports) {
  await ports.appendJournal({
    repoRoot: settings.repoRoot,
    path: settings.journalPath,
    line: composeJournalLine(SHIP_KIND, {
      mspId: entry.unitId,
      prUrl: read.url,
      mergedAt: null,
      title: msp.title,
      rationale: msp.rationale,
    }),
  });
}

function messageOf(error) {
  const carried = error === null || error === undefined ? null : nonEmptyText(error.message);
  return carried === null ? String(error) : carried;
}

function spawnFailure(spawned) {
  if (!isRecord(spawned)) return `the pull-request tool returned ${describe(spawned)} rather than a spawn result`;
  const stderr = nonEmptyText(spawned.stderr);
  const reason = stderr === null ? 'it wrote nothing to stderr' : stderr.split('\n')[0];
  return `the pull-request tool exited ${JSON.stringify(spawned.status)}: ${reason}`;
}

function refusedComposition(composed) {
  return composed.refusal === null
    ? `the mandated pull-request fields ${composed.unusable.join('; ')} could not be read from this run, and a placeholder in a pull-request body is a claim nobody made`
    : `the pull-request tool would refuse the values this run composed, so nothing was spawned: ${composed.refusal}`;
}

async function shipUnit(entry, settings, mergedIds, ports) {
  const msp = mspOf(settings.manifest, entry.unitId);
  if (msp === null) {
    return outcome(entry, PARKED, null, null, 'the run manifest carries no msp record for this integrated unit, so every pull-request field but the repository slug is unknown and none of them may be guessed');
  }
  const request = publishRequestOf(entry, msp, settings, mergedIds);
  if (request.error !== undefined) return outcome(entry, PARKED, null, null, request.error);
  const published = await ports.publishHead(request.value);
  if (!isRecord(published)) {
    return outcome(entry, PARKED, null, null, `the publish stage answered with ${describe(published)} rather than an outcome naming the head it left on the remote, so whether anything was published is unknown`);
  }
  if (published.alreadyMerged === true) {
    return await settleAlreadyMerged(entry, msp, settings, published, ports);
  }
  if (!headStands(published)) {
    return outcome(entry, PARKED, null, null, `no pull request was opened, because the head this unit would be opened on does not stand on the remote: ${nonEmptyText(published.detail) ?? 'the publish stage stated no reason'}`, msp, published);
  }
  const composed = composePrCreateArgv(factsOf(entry, msp, settings, published));
  if (!composed.ok) {
    return outcome(entry, PARKED, null, null, refusedComposition(composed), msp, published);
  }
  const spawned = await ports.openPullRequest({ argv: [...composed.argv], cwd: settings.repoRoot });
  if (!isRecord(spawned) || spawned.status !== 0) {
    return outcome(entry, PARKED, null, null, spawnFailure(spawned), msp, published);
  }
  const read = readPrAction(spawned.stdout);
  if (read === null) {
    return outcome(entry, PARKED, null, null, `the pull-request tool exited cleanly but printed no line naming one of the actions ${PR_ACTIONS.join(', ')} and a pull-request url, so whether a pull request exists is unknown`, msp, published);
  }
  return await settleShip(entry, msp, read, settings, published, ports);
}

async function settleAlreadyMerged(entry, msp, settings, published, ports) {
  const url = nonEmptyText(published.prUrl);
  const at = url === null ? 'a pull request the done oracle named no url for' : url;
  const builtRef = builtRefOf(entry, msp, settings.manifest);
  const baseBranch = nonEmptyText(settings.manifest.baseBranch);
  if (builtRef === null || baseBranch === null) {
    return outcome(entry, PARKED, PR_ACTION_ALREADY_MERGED, url, `the done oracle reports ${at} merged, and this run names ${builtRef === null ? 'nothing it built for this unit' : 'no trunk to measure against'}, so whether the work this run built is the work that merged cannot be asked and a merged status is never read as the content having landed`, msp, published);
  }
  const contained = await ports.mergedIntoBase({ repoRoot: settings.repoRoot, baseBranch, sha: builtRef });
  if (contained !== true) {
    return outcome(entry, PARKED, PR_ACTION_ALREADY_MERGED, url, `the done oracle reports ${at} merged, and ${baseBranch} was not shown to contain ${builtRef}, the content this run built for this unit; a merged status is never read as the content having landed, and the built work stands only in this run own checkpoint`, msp, published);
  }
  return outcome(entry, SHIPPED, PR_ACTION_ALREADY_MERGED, url, null, msp, published);
}

async function settleShip(entry, msp, read, settings, published, ports) {
  try {
    await recordShip(entry, msp, read, settings, ports);
  } catch (error) {
    return outcome(entry, PARKED, read.action, read.url, `the pull request at ${read.url} was opened but the ship record that would let a later run find it was not written: ${messageOf(error)}`, msp, published);
  }
  if (read.action === PR_ACTION_REUSED_UNVERIFIED) {
    return outcome(entry, PARKED, read.action, read.url, `the pull request already open on this head (${read.url}) was composed by something other than the centralized tool, so its title and body are unasserted and this run does not report it as a clean ship`, msp, published);
  }
  return outcome(entry, SHIPPED, read.action, read.url, null, msp, published);
}

export function declaredPrereqs(manifest, unitId) {
  const msp = mspOf(manifest, unitId);
  if (msp === null || !Array.isArray(msp.dependsOn)) return EMPTY;
  return msp.dependsOn.filter((id) => nonEmptyText(id) !== null);
}

function probeValues(settings) {
  const baseBranch = nonEmptyText(settings.manifest.baseBranch);
  const sourcePrefix = nonEmptyText(settings.manifest.sourcePrefix);
  if (baseBranch === null || sourcePrefix === null) return null;
  return Object.freeze({
    ownerRepo: settings.repoSlug,
    baseBranch,
    sourcePrefix,
    repoHost: nonEmptyText(settings.manifest.repoHost),
  });
}

async function mergedPrerequisites(settings, ports) {
  const gated = settings.integrated.some((entry) => declaredPrereqs(settings.manifest, entry.unitId).length > 0);
  if (!gated) return new Map();
  const probe = probeValues(settings);
  if (probe === null) return new Map();
  const merged = await ports.reconcile(probe);
  if (!Array.isArray(merged)) return new Map();
  return reconcileShippedSet(merged, probe.sourcePrefix, probe.ownerRepo, probe.repoHost);
}

function heldPrereqs(manifest, unitId, satisfied) {
  return declaredPrereqs(manifest, unitId).filter((id) => !satisfied.has(id));
}

function plannedHeadOf(manifest, unitId) {
  const prefix = nonEmptyText(manifest.sourcePrefix);
  const msp = mspOf(manifest, unitId);
  if (prefix === null || msp === null) return null;
  const branch = nonEmptyText(msp.integrationBranch);
  if (branch === null || branch !== `${prefix}/${unitId}${INTEGRATION_SUFFIX}`) return null;
  return branchToMspId(branch, prefix) === unitId ? branch : null;
}

function retirableHead(settings, unitId, record) {
  if (!isRecord(record) || nonEmptyText(record.mergedAt) === null) return null;
  const mergeCommit = nonEmptyText(record.mergeCommit);
  if (mergeCommit === null || !SHA_HEX_PATTERN.test(mergeCommit)) return null;
  const branch = plannedHeadOf(settings.manifest, unitId);
  return branch === null ? null : Object.freeze({ branch, mergeCommit });
}

function retirementRecord(unitId, candidate, answered) {
  const spoken = isRecord(answered) ? answered : null;
  const deleted = spoken !== null && spoken.deleted === true;
  const stated = spoken === null ? null : nonEmptyText(spoken.reason);
  const unstated = spoken === null
    ? `the retire port answered with ${describe(answered)} rather than an outcome naming whether the head was deleted and why`
    : 'the retire port refused the delete and stated no reason';
  return Object.freeze({
    unitId,
    branch: candidate.branch,
    mergeCommit: candidate.mergeCommit,
    tip: spoken === null ? null : nonEmptyText(spoken.tip),
    deleted,
    reason: deleted ? null : (stated ?? unstated),
  });
}

async function retireMergedHeads(settings, merged, ports) {
  const baseBranch = nonEmptyText(settings.manifest.baseBranch);
  if (baseBranch === null) return EMPTY;
  const retired = [];
  for (const [unitId, record] of merged) {
    const candidate = retirableHead(settings, unitId, record);
    if (candidate === null) continue;
    const contained = await ports.mergedIntoBase({ repoRoot: settings.repoRoot, baseBranch, sha: candidate.mergeCommit });
    if (contained !== true) continue;
    const answered = await ports.retireHead({
      repoRoot: settings.repoRoot,
      repoSlug: settings.repoSlug,
      branch: candidate.branch,
      baseBranch,
    });
    retired.push(retirementRecord(unitId, candidate, answered));
  }
  return Object.freeze(retired);
}

function parkBlocked(manifest, entry, held) {
  const parked = park(manifest, {
    unitId: entry.unitId,
    stage: parkStage(),
    diagnosis: BLOCKED_PENDING_APPROVAL_DIAGNOSIS,
    request: { kind: AWAITING_UPSTREAM_KIND, what: held.join(', ') },
    resumePoint: entry.resumePoint,
  });
  return Object.freeze({
    manifest: parked,
    blocked: Object.freeze({ record: parked.parked[parked.parked.length - 1], held: Object.freeze([...held]) }),
  });
}

function blockedOutcome(entry) {
  return outcome(entry, PARKED, null, null, BLOCKED_PENDING_APPROVAL_DIAGNOSIS);
}

function scopeOf(msp) {
  const declared = isRecord(msp.fileScope) && Array.isArray(msp.fileScope.edit) ? msp.fileScope.edit : EMPTY;
  return Object.freeze(declared.filter((pathspec) => nonEmptyText(pathspec) !== null));
}

function watchRequest(settled, settings, urlById) {
  const opened = settled
    .filter((entry) => entry.state === SHIPPED)
    .map((entry) => Object.freeze({
      unitId: entry.unitId,
      head: entry.head,
      prUrl: urlById.get(entry.unitId) ?? null,
      declaredScope: entry.declaredScope,
    }))
    .filter((entry) => nonEmptyText(entry.head) !== null);
  return Object.freeze({ opened: Object.freeze(opened), repoRoot: settings.repoRoot, repoSlug: settings.repoSlug });
}

function requireWatched(watched) {
  if (!isRecord(watched) || !Array.isArray(watched.outcomes) || !Array.isArray(watched.exhausted)) {
    throw new TypeError(`${MODULE}: the ci watch returned ${describe(watched)} rather than a plan carrying the outcomes it read and the ones it exhausted; a watch nobody can read would report every published check as green`);
  }
  return watched;
}

function declaredUnitTotal(manifest, orderedLength) {
  if (orderedLength === 0) return orderedLength;
  const declared = Array.isArray(manifest.msps) ? manifest.msps.length : orderedLength;
  return Math.max(declared, orderedLength);
}

function produced(outcomes, awaiting, blocked, retired, watched, manifest) {
  const ordered = Object.freeze(outcomes);
  const withState = (state) => Object.freeze(ordered.filter((entry) => entry.state === state));
  const opened = withState(SHIPPED);
  const parked = withState(PARKED);
  const awaitingApproval = parked.filter((entry) => entry.diagnosis === BLOCKED_PENDING_APPROVAL_DIAGNOSIS);
  const total = declaredUnitTotal(manifest, ordered.length);
  const parkedBeforeShip = total - ordered.length;
  return Object.freeze({
    opened,
    parked,
    outcomes: ordered,
    awaiting: Object.freeze(awaiting),
    blocked: Object.freeze(blocked),
    retired: Object.freeze(retired),
    ci: watched,
    status: computeMergePolicyStatus({
      shippedCount: opened.length,
      awaitingApprovalCount: awaiting.length,
      blockedPendingApprovalCount: awaitingApproval.length - awaiting.length,
      genuineParkedCount: parked.length - awaitingApproval.length + parkedBeforeShip,
      ciRedExhaustedCount: watched.exhausted.length,
      total,
    }),
  });
}

export async function shipIntegrated(config, ports) {
  const settings = requireConfig(config);
  const wired = requirePorts(ports);
  const merged = await mergedPrerequisites(settings, wired);
  const retired = await retireMergedHeads(settings, merged, wired);
  const mergedIds = new Set(merged.keys());
  const satisfied = new Set(merged.keys());
  const blockedIds = new Set();
  const urlById = new Map();
  const blocked = [];
  const awaiting = [];
  const outcomes = [];
  let manifest = settings.manifest;
  for (const entry of settings.integrated) {
    if (blockedIds.has(entry.unitId)) {
      outcomes.push(blockedOutcome(entry));
      continue;
    }
    const held = heldPrereqs(manifest, entry.unitId, satisfied);
    if (held.length > 0) {
      const parked = parkBlocked(manifest, entry, held);
      manifest = parked.manifest;
      blocked.push(parked.blocked);
      blockedIds.add(entry.unitId);
      for (const id of parked.blocked.record.dependents) blockedIds.add(id);
      awaiting.push(awaitingApprovalOutcome(entry.unitId, { prUrl: urlById.get(held[0]) ?? null, receiptsPass: null, d6Pass: null }));
      outcomes.push(blockedOutcome(entry));
      continue;
    }
    const settled = await shipUnit(entry, { ...settings, manifest }, mergedIds, wired);
    if (settled.prUrl !== null) urlById.set(entry.unitId, settled.prUrl);
    if (settled.state === SHIPPED) satisfied.add(entry.unitId);
    if (settled.state === SHIPPED && settled.action === PR_ACTION_ALREADY_MERGED) mergedIds.add(entry.unitId);
    outcomes.push(settled);
  }
  const watched = requireWatched(await wired.watchCi(watchRequest(outcomes, settings, urlById)));
  return produced(outcomes, awaiting, blocked, retired, watched, settings.manifest);
}

function retargetOf(baseByHead, base) {
  const visited = new Set();
  let current = base;
  while (baseByHead.has(current) && !visited.has(current)) {
    visited.add(current);
    current = baseByHead.get(current);
  }
  return current;
}

export function mergeOrderOf(plan) {
  const stacked = plan.opened.filter((entry) => nonEmptyText(entry.head) !== null && nonEmptyText(entry.base) !== null);
  const baseByHead = new Map(stacked.map((entry) => [entry.head, entry.base]));
  return stacked.map((entry, index) => {
    const children = stacked.filter((other) => other.base === entry.head);
    return Object.freeze({
      position: index + 1,
      unitId: entry.unitId,
      prUrl: entry.prUrl,
      head: entry.head,
      base: entry.base,
      deleteAfterMerge: children.length > 0,
      retargetBeforeDelete: Object.freeze(children.map((child) => Object.freeze({
        unitId: child.unitId,
        prUrl: child.prUrl,
        from: entry.head,
        to: retargetOf(baseByHead, entry.base),
      }))),
    });
  });
}

export function shipSummary(plan) {
  return {
    opened: plan.opened.map((entry) => entry.unitId),
    parked: plan.parked.map((entry) => entry.unitId),
    prUrls: Object.fromEntries(plan.outcomes.filter((entry) => entry.prUrl !== null).map((entry) => [entry.unitId, entry.prUrl])),
    outcomes: plan.outcomes.map((entry) => ({ id: entry.unitId, state: entry.state, action: entry.action })),
    status: plan.status,
    ci: ciSummary(plan.ci),
    mergeOrder: mergeOrderOf(plan),
    retired: plan.retired.map((entry) => ({ id: entry.unitId, branch: entry.branch, deleted: entry.deleted, reason: entry.reason })),
    awaiting: plan.awaiting.map((entry) => ({ id: entry.mspId, prUrl: entry.prUrl })),
    blocked: plan.blocked.map((entry) => ({
      id: entry.record.unitId,
      kind: entry.record.request.kind,
      held: [...entry.held],
      dependents: [...entry.record.dependents],
    })),
  };
}
