import { fileURLToPath } from 'node:url';
import { INTEGRATED } from './integrate-plan.mjs';
import { composeJournalLine } from './journal-store.mjs';
import { LEGAL_STAGES } from './parking.mjs';
import { inertValue, PR_PROVENANCE_PATTERN, PR_TITLE_PATTERN, PR_VALUE_CAP } from '../git/pr-format.mjs';

const MODULE = 'ship-plan';

export const SHIPPED = 'shipped';
export const PARKED = 'parked';
export const SHIP_STATES = Object.freeze([SHIPPED, PARKED]);
export const SHIP_PARK_STAGE = 'ship';

export const PR_TOOL_PATH = fileURLToPath(new URL('../git/pr.mjs', import.meta.url));
export const PR_CREATE_VERB = 'pr-create';
export const PR_ORIGIN = 'machine';
export const PR_AGENT_LABEL = 'mitosis-engine';
export const PR_MODEL_UNSPECIFIED = 'unspecified';

export const RECEIPTS_NOT_VERIFIED = 'receipts enforcer - not run';
export const GREEN_VERIFIED = 'unit verdict - green';
export const BOUNDARY_VERIFIED = 'boundary gate - clean';

export const PR_ACTION_CREATED = 'created';
export const PR_ACTION_REUSED = 'reused';
export const PR_ACTION_REUSED_UNVERIFIED = 'reused-unverified';
export const PR_ACTIONS = Object.freeze([PR_ACTION_CREATED, PR_ACTION_REUSED, PR_ACTION_REUSED_UNVERIFIED]);

const REQUIRED_PORTS = Object.freeze(['openPullRequest', 'appendJournal', 'diffStat']);
const SHIP_KIND = 'ship';
const EMPTY = Object.freeze([]);
const NO_RESUME_POINT = Object.freeze({ branch: null, ref: null, stage: null });
const INSERTIONS = /(\d+) insertions?\(\+\)/;
const DELETIONS = /(\d+) deletions?\(-\)/;
const MAX_CHANGED_LINES = 9999999;

function describe(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
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

function outcome(entry, state, action, prUrl, diagnosis) {
  return Object.freeze({
    unitId: entry.unitId,
    state,
    action,
    prUrl,
    diagnosis,
    stage: state === PARKED ? parkStage() : null,
    resumePoint: entry.resumePoint,
  });
}

export function changedLinesOf(text) {
  if (typeof text !== 'string') return null;
  const insertions = INSERTIONS.exec(text);
  const deletions = DELETIONS.exec(text);
  if (insertions === null && deletions === null) return null;
  const total = (insertions === null ? 0 : Number(insertions[1])) + (deletions === null ? 0 : Number(deletions[1]));
  if (!Number.isSafeInteger(total) || total < 0 || total > MAX_CHANGED_LINES) return null;
  return total;
}

export function readPrAction(stdout) {
  if (typeof stdout !== 'string') return null;
  const lines = stdout.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    let parsed = null;
    try {
      parsed = JSON.parse(lines[index]);
    } catch {
      parsed = null;
    }
    if (!isRecord(parsed) || !PR_ACTIONS.includes(parsed.action)) continue;
    if (nonEmptyText(parsed.url) === null) continue;
    return Object.freeze({ action: parsed.action, url: parsed.url });
  }
  return null;
}

export function prTitleOf(msp) {
  const changeType = nonEmptyText(msp.changeType);
  const scope = nonEmptyText(msp.scope);
  const summary = nonEmptyText(msp.title);
  if (changeType === null || scope === null || summary === null) return null;
  const composed = `${changeType}(${scope}): ${summary}`;
  return PR_TITLE_PATTERN.test(composed) ? composed : null;
}

export function provenanceOf(declared) {
  const model = nonEmptyText(declared) ?? PR_MODEL_UNSPECIFIED;
  const composed = `agent=${PR_AGENT_LABEL} model=${model}`;
  return PR_PROVENANCE_PATTERN.test(composed) ? composed : null;
}

function verifiedLines(facts) {
  return [
    ...(facts.green === true ? [GREEN_VERIFIED] : []),
    ...(facts.boundaryClean === true ? [BOUNDARY_VERIFIED] : []),
  ];
}

export function unusableFields(facts) {
  const unusable = [];
  if (nonEmptyText(facts.repo) === null) unusable.push('--repo from the run repo slug');
  if (nonEmptyText(facts.base) === null) unusable.push('--base from the manifest base branch');
  if (nonEmptyText(facts.head) === null) unusable.push('--head from the msp integration branch');
  if (nonEmptyText(facts.title) === null) unusable.push('--title from the msp change type, scope and title');
  if (nonEmptyText(facts.provenance) === null) unusable.push('--provenance from the dispatch model');
  if (inertValue(facts.why, PR_VALUE_CAP) === null) unusable.push('--why from the msp rationale');
  if (inertValue(facts.what, PR_VALUE_CAP) === null) unusable.push('--what from the msp title');
  return unusable;
}

function dependsValue(facts) {
  const ids = Array.isArray(facts.depends) ? facts.depends.filter((id) => nonEmptyText(id) !== null) : [];
  return ids.length === 0 ? null : ids.join(',');
}

export function prCreateArgv(facts, changedLines) {
  const depends = dependsValue(facts);
  return [
    PR_CREATE_VERB,
    '--repo', facts.repo,
    '--head', facts.head,
    '--base', facts.base,
    '--title', facts.title,
    '--origin', PR_ORIGIN,
    '--provenance', facts.provenance,
    '--why', facts.why,
    '--what', facts.what,
    ...verifiedLines(facts).flatMap((value) => ['--verified', value]),
    '--not-verified', RECEIPTS_NOT_VERIFIED,
    ...(depends === null ? [] : ['--depends', depends]),
    ...(Number.isInteger(changedLines) ? ['--changed-lines', String(changedLines)] : []),
  ];
}

export function composePrCreateArgv(facts, changedLines) {
  if (!isRecord(facts)) {
    throw new TypeError(`${MODULE}: the pull-request facts must be a non-null, non-array object, received ${describe(facts)}`);
  }
  const unusable = unusableFields(facts);
  if (unusable.length > 0) {
    return Object.freeze({ ok: false, unusable: Object.freeze(unusable), argv: null });
  }
  return Object.freeze({ ok: true, unusable: EMPTY, argv: Object.freeze(prCreateArgv(facts, changedLines)) });
}

function mspOf(manifest, unitId) {
  const msps = Array.isArray(manifest.msps) ? manifest.msps.filter(isRecord) : [];
  return msps.find((msp) => msp.id === unitId) ?? null;
}

function factsOf(entry, msp, settings) {
  return Object.freeze({
    repo: settings.repoSlug,
    base: nonEmptyText(settings.manifest.baseBranch),
    head: nonEmptyText(entry.resumePoint.branch) ?? nonEmptyText(msp.integrationBranch),
    title: prTitleOf(msp),
    provenance: provenanceOf(settings.modelById.get(entry.unitId)),
    why: msp.rationale,
    what: msp.title,
    depends: Array.isArray(msp.dependsOn) ? msp.dependsOn : EMPTY,
    green: msp.green === true,
    boundaryClean: entry.state === INTEGRATED,
  });
}

async function measureDiff(facts, settings, ports) {
  if (nonEmptyText(facts.base) === null || nonEmptyText(facts.head) === null) return null;
  const measured = await ports.diffStat({ repoRoot: settings.repoRoot, base: facts.base, head: facts.head });
  if (!isRecord(measured) || measured.status !== 0) return null;
  return changedLinesOf(measured.stdout);
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

function spawnFailure(spawned) {
  if (!isRecord(spawned)) return `the pull-request tool returned ${describe(spawned)} rather than a spawn result`;
  const stderr = nonEmptyText(spawned.stderr);
  return `the pull-request tool exited ${JSON.stringify(spawned.status)}: ${stderr === null ? 'it wrote nothing to stderr' : stderr.split('\n')[0]}`;
}

async function shipUnit(entry, settings, ports) {
  const msp = mspOf(settings.manifest, entry.unitId);
  if (msp === null) {
    return outcome(entry, PARKED, null, null, 'the run manifest carries no msp record for this integrated unit, so every pull-request field but the repository slug is unknown and none of them may be guessed');
  }
  const facts = factsOf(entry, msp, settings);
  const composed = composePrCreateArgv(facts, await measureDiff(facts, settings, ports));
  if (!composed.ok) {
    return outcome(entry, PARKED, null, null, `the mandated pull-request fields ${composed.unusable.join('; ')} could not be read from this run, and a placeholder in a pull-request body is a claim nobody made`);
  }
  const spawned = await ports.openPullRequest({ argv: [PR_TOOL_PATH, ...composed.argv], cwd: settings.repoRoot });
  if (!isRecord(spawned) || spawned.status !== 0) {
    return outcome(entry, PARKED, null, null, spawnFailure(spawned));
  }
  const read = readPrAction(spawned.stdout);
  if (read === null) {
    return outcome(entry, PARKED, null, null, `the pull-request tool exited cleanly but printed no line naming one of the actions ${PR_ACTIONS.join(', ')} and a pull-request url, so whether a pull request exists is unknown`);
  }
  return await settleShip(entry, msp, read, settings, ports);
}

async function settleShip(entry, msp, read, settings, ports) {
  try {
    await recordShip(entry, msp, read, settings, ports);
  } catch (error) {
    return outcome(entry, PARKED, read.action, read.url, `the pull request at ${read.url} was opened but the ship record that would let a later run find it was not written: ${error && error.message ? error.message : String(error)}`);
  }
  if (read.action === PR_ACTION_REUSED_UNVERIFIED) {
    return outcome(entry, PARKED, read.action, read.url, `the pull request already open on this head (${read.url}) was composed by something other than the centralized tool, so its title and body are unasserted and this run does not report it as a clean ship`);
  }
  return outcome(entry, SHIPPED, read.action, read.url, null);
}

function produced(outcomes) {
  const ordered = Object.freeze(outcomes);
  const withState = (state) => Object.freeze(ordered.filter((entry) => entry.state === state));
  return Object.freeze({
    opened: withState(SHIPPED),
    parked: withState(PARKED),
    outcomes: ordered,
  });
}

export async function shipIntegrated(config, ports) {
  const settings = requireConfig(config);
  const wired = requirePorts(ports);
  const outcomes = [];
  for (const entry of settings.integrated) {
    outcomes.push(await shipUnit(entry, settings, wired));
  }
  return produced(outcomes);
}

export function shipSummary(plan) {
  return {
    opened: plan.opened.map((entry) => entry.unitId),
    parked: plan.parked.map((entry) => entry.unitId),
    prUrls: Object.fromEntries(plan.outcomes.filter((entry) => entry.prUrl !== null).map((entry) => [entry.unitId, entry.prUrl])),
    outcomes: plan.outcomes.map((entry) => ({ id: entry.unitId, state: entry.state, action: entry.action })),
  };
}
