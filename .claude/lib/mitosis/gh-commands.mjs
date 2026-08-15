import { validateRefToken } from './checkpoint.mjs';
import { resolveSpawn } from './exec-policy.mjs';

export const GH_COMMAND_BINARY = 'gh';
export const GH_END_OF_OPTIONS = '--';

const MODULE = 'gh-commands';
const NUL = String.fromCharCode(0);
const OPTION_LEAD = '-';
const SLUG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
const RUN_ID_PATTERN = /^[1-9][0-9]*$/;
const MERGED_PR_FIELDS = 'headRefName,url,mergedAt,mergeCommit';
const OPEN_PR_FIELDS = 'headRefName,reviewDecision,url,isCrossRepository,headRepositoryOwner,headRepository';
const PR_STATE_FIELDS = 'state,mergedAt,url';
const REPO_IDENTITY_FIELDS = 'nameWithOwner,url';
const PR_LIST_LIMIT = '200';
const RUN_LIST_LIMIT = '1';
const RUN_ID_FIELD = 'databaseId';
const RUN_ID_QUERY = '.[0].databaseId';
const STATUS_FIELD = 'status';
const STATUS_QUERY = '.status';
const CONCLUSION_FIELD = 'conclusion';
const CONCLUSION_QUERY = '.conclusion';

function refuse(where, message) {
  throw new TypeError(`${MODULE}: ${where} ${message}`);
}

function textIn(where, field, value) {
  if (typeof value !== 'string' || value.length === 0) {
    refuse(where, `needs ${field} as a non-empty string, received ${value === null ? 'null' : JSON.stringify(value)}; a value the caller never spelled out would be coerced into the command`);
  }
  if (value.includes(NUL)) {
    refuse(where, `was handed a ${field} carrying a NUL byte, which no argument vector element can carry: ${JSON.stringify(value)}`);
  }
  if (value.startsWith(OPTION_LEAD)) {
    refuse(where, `was handed a ${field} beginning with ${JSON.stringify(OPTION_LEAD)}: ${JSON.stringify(value)}; gh parses its own flags out of the argument vector, so a leading dash makes a caller value an option rather than the value it was passed as`);
  }
  return value;
}

function refIn(where, field, value) {
  const text = textIn(where, field, value);
  if (!validateRefToken(text)) {
    refuse(where, `was handed a ${field} that is not a well-formed ref token: ${JSON.stringify(text)}; this bound is applied here rather than assumed of the caller, because a ref-shaped value carrying a metacharacter reaches gh as something other than the ref it was passed as`);
  }
  return text;
}

function slugIn(where, field, value) {
  const text = textIn(where, field, value);
  if (!SLUG_PATTERN.test(text)) {
    refuse(where, `was handed a ${field} that is not a literal owner/repo slug: ${JSON.stringify(text)}; every gh read in a run is pinned to that literal, so an unparseable slug would silently read the wrong repository or fall back to the ambient one`);
  }
  return text;
}

function runIdIn(where, field, value) {
  const text = textIn(where, field, value);
  if (!RUN_ID_PATTERN.test(text)) {
    refuse(where, `was handed a ${field} that is not a run id: ${JSON.stringify(text)}; the incumbent carries this value in a shell variable, and a spelling that is not digits would reach gh as the variable text rather than as the run the engine resolved`);
  }
  return text;
}

const RECONCILE = Object.freeze({
  'repo-identity': () => ['repo', 'view', '--json', REPO_IDENTITY_FIELDS],
  'merged-prs': (v, t) => [
    'pr', 'list', '-R', t.slug('ownerRepo', v.ownerRepo),
    '--state', 'merged', '--base', t.ref('baseBranch', v.baseBranch),
    '--limit', PR_LIST_LIMIT, '--json', MERGED_PR_FIELDS,
  ],
  'open-prs': (v, t) => [
    'pr', 'list', '-R', t.slug('ownerRepo', v.ownerRepo),
    '--state', 'open', '--base', t.ref('baseBranch', v.baseBranch),
    '--limit', PR_LIST_LIMIT, '--json', OPEN_PR_FIELDS,
  ],
});

const SHIP_VERIFY = Object.freeze({
  'pr-state': (v, t) => ['pr', 'view', '-R', t.slug('repoSlug', v.repoSlug), t.ref('integrationBranch', v.integrationBranch), '--json', PR_STATE_FIELDS],
  compare: (v, t) => [
    'api', GH_END_OF_OPTIONS,
    `repos/${t.slug('repoSlug', v.repoSlug)}/compare/${t.ref('baseBranch', v.baseBranch)}...${t.ref('integrationBranch', v.integrationBranch)}`,
  ],
});

const RESOLVE_RUN = (v, t) => [
  'run', 'list', '-R', t.slug('repoSlug', v.repoSlug),
  '--branch', t.ref('integrationBranch', v.integrationBranch),
  '--limit', RUN_LIST_LIMIT, '--json', RUN_ID_FIELD, '-q', RUN_ID_QUERY,
];

const WATCH_STATUS = (v, t) => ['run', 'view', t.runId('runId', v.runId), '-R', t.slug('repoSlug', v.repoSlug), '--json', STATUS_FIELD, '-q', STATUS_QUERY];

const READ_CONCLUSION = (v, t) => ['run', 'view', t.runId('runId', v.runId), '-R', t.slug('repoSlug', v.repoSlug), '--json', CONCLUSION_FIELD, '-q', CONCLUSION_QUERY];

const CI_PROBE = Object.freeze({
  'resolve-run': RESOLVE_RUN,
  rerun: (v, t) => ['run', 'rerun', t.runId('runId', v.runId), '-R', t.slug('repoSlug', v.repoSlug), '--failed'],
  'watch-status': WATCH_STATUS,
  'read-conclusion': READ_CONCLUSION,
});

const CI_PUBLISH = Object.freeze({
  'resolve-run': RESOLVE_RUN,
  'watch-status': WATCH_STATUS,
  'read-conclusion': READ_CONCLUSION,
});

const SHIP = Object.freeze({
  'done-oracle': (v, t) => ['pr', 'view', '-R', t.slug('repoSlug', v.repoSlug), t.ref('integrationBranch', v.integrationBranch), '--json', PR_STATE_FIELDS],
  'resolve-run': RESOLVE_RUN,
  'watch-status': WATCH_STATUS,
  'read-conclusion': READ_CONCLUSION,
});

export const GH_SITE_COMMANDS = Object.freeze({
  reconcile: RECONCILE,
  'ship-verify': SHIP_VERIFY,
  'ci-probe': CI_PROBE,
  'ci-publish': CI_PUBLISH,
  ship: SHIP,
});

export const GH_SITES = Object.freeze(Object.keys(GH_SITE_COMMANDS));

export function buildGhCommand(site, step, values) {
  const steps = GH_SITE_COMMANDS[site];
  if (steps === undefined) {
    refuse(`the site ${JSON.stringify(site)}`, `is not one this module transcribes; the transcribed sites are ${GH_SITES.join(', ')}`);
  }
  const build = steps[step];
  if (typeof build !== 'function') {
    refuse(`the step ${JSON.stringify(step)} of ${site}`, `is not one this module transcribes; its steps are ${Object.keys(steps).join(', ')}`);
  }
  if (values === null || typeof values !== 'object' || Array.isArray(values)) {
    refuse(`${site}/${step}`, `needs its values as an object, received ${JSON.stringify(values)}`);
  }
  const where = `${site}/${step}`;
  const validator = Object.freeze({
    text: (field, value) => textIn(where, field, value),
    ref: (field, value) => refIn(where, field, value),
    slug: (field, value) => slugIn(where, field, value),
    runId: (field, value) => runIdIn(where, field, value),
  });
  return Object.freeze(build(values, validator));
}

export function ghSpawnRequest(site, step, values, io, argvOverride) {
  const argv = argvOverride === undefined ? buildGhCommand(site, step, values) : argvOverride;
  return io === undefined
    ? resolveSpawn(GH_COMMAND_BINARY, [...argv])
    : resolveSpawn(GH_COMMAND_BINARY, [...argv], io);
}
