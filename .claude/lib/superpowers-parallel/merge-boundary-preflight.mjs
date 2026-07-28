import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execGh, resolveGhBinary, MITOSIS_GIT_GH_MISSING_EXIT } from './mitosis-git.mjs';
import { validateRepoIdentity } from './merge-watch.mjs';
import { validateRefToken } from './checkpoint.mjs';

export const PREFLIGHT_PASS_EXIT = 0;
export const PREFLIGHT_HALT_EXIT = 30;
export const PREFLIGHT_CONFIG_EXIT = 31;
export const PREFLIGHT_GH_MISSING_EXIT = MITOSIS_GIT_GH_MISSING_EXIT;

export const PREFLIGHT_ENV_KEYS = Object.freeze({
  org: 'MITOSIS_BOUNDARY_ORG',
  repo: 'MITOSIS_BOUNDARY_REPO',
  baseBranch: 'MITOSIS_BOUNDARY_BASE_BRANCH',
  machineUser: 'MITOSIS_BOUNDARY_MACHINE_USER',
});

export const PREFLIGHT_PROBES = Object.freeze(['identity', 'repository', 'collaborator', 'branch-rules', 'rulesets']);

export const PREFLIGHT_CHECK_IDS = Object.freeze({
  configuration: 'deployment-configuration-is-present',
  identity: 'identity-is-the-machine-user',
  admin: 'machine-user-is-not-a-repository-admin',
  collaborator: 'collaborator-permission-does-not-report-admin',
  review: 'base-branch-requires-an-approving-review',
  ruleset: 'review-ruleset-is-repository-owned-and-active',
  bypass: 'bypass-list-is-empty',
});

const HANDLE_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

const MAX_PROBE_DETAIL_CHARS = 512;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function check(id, invariant, required, passed, detail) {
  return Object.freeze({ id, invariant, required, passed, detail });
}

function configRejection(error) {
  return Object.freeze({ ok: false, error, config: null });
}

function readEnvValue(env, key) {
  const value = env[key];
  if (typeof value !== 'string') return null;
  if (value !== value.trim() || value.length === 0) return null;
  return value;
}

export function readPreflightConfig(env) {
  if (!isPlainObject(env)) {
    return configRejection('merge-boundary preflight: expected an environment object carrying the deployment configuration; without one the boundary is unproven and the run HALTS');
  }
  const fields = Object.entries(PREFLIGHT_ENV_KEYS).map(([field, key]) => ({ field, key, value: readEnvValue(env, key) }));
  const unusable = fields.filter((entry) => entry.value === null).map((entry) => entry.key);
  if (unusable.length > 0) {
    return configRejection(`merge-boundary preflight: ${unusable.join(', ')} is unset, blank, or padded with whitespace; an unconfigured boundary HALTS the run and never reads as verified`);
  }
  const values = Object.fromEntries(fields.map((entry) => [entry.field, entry.value]));
  const slug = `${values.org}/${values.repo}`;
  if (!validateRepoIdentity(slug)) {
    return configRejection(`merge-boundary preflight: ${PREFLIGHT_ENV_KEYS.org} and ${PREFLIGHT_ENV_KEYS.repo} do not compose an owner/repo slug`);
  }
  if (!validateRefToken(values.baseBranch)) {
    return configRejection(`merge-boundary preflight: ${PREFLIGHT_ENV_KEYS.baseBranch} is not a conservative git ref token`);
  }
  if (!HANDLE_PATTERN.test(values.machineUser)) {
    return configRejection(`merge-boundary preflight: ${PREFLIGHT_ENV_KEYS.machineUser} is not a GitHub account handle`);
  }
  return Object.freeze({
    ok: true,
    error: null,
    config: Object.freeze({ slug, baseBranch: values.baseBranch, machineUser: values.machineUser }),
  });
}

export function isUsablePreflightConfig(config) {
  if (!isPlainObject(config)) return false;
  if (!validateRepoIdentity(config.slug)) return false;
  if (!validateRefToken(config.baseBranch)) return false;
  return typeof config.machineUser === 'string' && HANDLE_PATTERN.test(config.machineUser);
}

export function buildPreflightGhArgv(probe, config) {
  if (!PREFLIGHT_PROBES.includes(probe)) {
    throw new Error(`merge-boundary preflight: refusing to build a gh argv for the unknown probe ${JSON.stringify(probe === undefined ? null : probe)}`);
  }
  if (probe === 'identity') return ['api', 'user'];
  if (!isUsablePreflightConfig(config)) {
    throw new Error(`merge-boundary preflight: refusing to build the ${JSON.stringify(probe)} argv from an unusable deployment configuration`);
  }
  if (probe === 'repository') return ['api', `repos/${config.slug}`];
  if (probe === 'collaborator') return ['api', `repos/${config.slug}/collaborators/${config.machineUser}/permission`];
  if (probe === 'branch-rules') return ['api', `repos/${config.slug}/rules/branches/${encodeURIComponent(config.baseBranch)}`];
  return ['api', `repos/${config.slug}/rulesets?includes_parents=false`];
}

function readFailure(error) {
  return Object.freeze({ ok: false, error, value: null });
}

function boundedDetail(value) {
  const text = value === undefined || value === null ? '' : String(value);
  return JSON.stringify(text.trim().slice(0, MAX_PROBE_DETAIL_CHARS));
}

export function readPreflightProbe(read, probe, config) {
  let argv;
  try {
    argv = buildPreflightGhArgv(probe, config);
  } catch (err) {
    return readFailure(`the ${probe} probe argv could not be built (${err && err.message})`);
  }
  let result;
  try {
    result = read(argv);
  } catch (err) {
    return readFailure(`the ${probe} read threw (${err && err.message}) and proved nothing`);
  }
  if (!isPlainObject(result)) {
    return readFailure(`the ${probe} read returned no usable result object`);
  }
  if (result.refused === true) {
    return readFailure(`the ${probe} read was refused before execution: ${boundedDetail(result.reason)}`);
  }
  if (result.status !== 0) {
    return readFailure(`the ${probe} read exited ${JSON.stringify(result.status === undefined ? null : result.status)}: ${boundedDetail(result.stderr)}`);
  }
  const text = String(result.stdout || '').trim();
  if (text.length === 0) {
    return readFailure(`the ${probe} read printed nothing; an empty answer proves no invariant`);
  }
  try {
    return Object.freeze({ ok: true, error: null, value: JSON.parse(text) });
  } catch {
    return readFailure(`the ${probe} read printed unparseable JSON`);
  }
}

export function checkIdentityIsMachineUser(read, config) {
  const id = PREFLIGHT_CHECK_IDS.identity;
  const res = readPreflightProbe(read, 'identity', config);
  if (!res.ok) return check(id, 1, true, false, res.error);
  if (!isPlainObject(res.value)) return check(id, 1, true, false, 'the identity read returned no account object');
  const login = res.value.login;
  if (typeof login !== 'string' || login.length === 0) {
    return check(id, 1, true, false, 'the identity read carried no login string; an absent identity is not a proven match');
  }
  if (login !== config.machineUser) {
    return check(id, 1, true, false, `the authenticated identity is ${JSON.stringify(login)}, which is not the configured machine user`);
  }
  return check(id, 1, true, true, 'the credential THIS process resolved at this moment authenticates as exactly the configured machine user; every later agent resolves its own credential, which this read does not observe');
}

export function checkRepositoryDeniesAdmin(read, config) {
  const id = PREFLIGHT_CHECK_IDS.admin;
  const res = readPreflightProbe(read, 'repository', config);
  if (!res.ok) return check(id, 2, true, false, res.error);
  if (!isPlainObject(res.value)) return check(id, 2, true, false, 'the repository read returned no repository object');
  const permissions = res.value.permissions;
  if (!isPlainObject(permissions)) {
    return check(id, 2, true, false, 'the repository read carried no permissions capability map; an absent map is not a proven non-admin');
  }
  if (typeof permissions.admin !== 'boolean') {
    return check(id, 2, true, false, 'the permissions capability map carries no boolean admin key; this map spells write access as push and exposes no write key at all, and an absent key is not a proven false');
  }
  if (permissions.admin !== false) {
    return check(id, 2, true, false, 'the repository reports the authenticated identity as an admin, which could edit or delete the very ruleset this boundary rests on');
  }
  return check(id, 2, true, true, 'the repository reports the admin capability as exactly false');
}

export function checkCollaboratorDeniesAdmin(read, config) {
  const id = PREFLIGHT_CHECK_IDS.collaborator;
  const res = readPreflightProbe(read, 'collaborator', config);
  if (!res.ok) return check(id, 2, false, null, `${res.error}; this read corroborates the repository capability map and does not gate the run on its own`);
  if (!isPlainObject(res.value)) return check(id, 2, false, null, 'the collaborator read returned no permission object; corroborating only');
  const permission = res.value.permission;
  const roleName = res.value.role_name;
  if (typeof permission !== 'string' || permission.length === 0) {
    return check(id, 2, false, null, 'the collaborator read carried no permission string; corroborating only');
  }
  if (permission === 'admin') {
    return check(id, 2, false, false, 'the collaborator read positively reports admin, contradicting the repository capability map');
  }
  if (typeof roleName === 'string' && roleName.trim().toLowerCase() === 'admin') {
    return check(id, 2, false, false, `the collaborator read reports the permission ${JSON.stringify(permission)} while naming the admin role, so the two capability answers for this one account disagree and neither is read as a proven non-admin`);
  }
  return check(id, 2, false, true, `the collaborator read reports ${JSON.stringify(permission)}, which is not admin`);
}

function selectionFailure(detail) {
  return Object.freeze({ ok: false, detail, count: null, rulesetId: null, sourceType: null, lastPushApproval: null });
}

export function selectBaseBranchReviewRule(read, config) {
  const res = readPreflightProbe(read, 'branch-rules', config);
  if (!res.ok) return selectionFailure(res.error);
  if (!Array.isArray(res.value)) {
    return selectionFailure('the effective-rules read did not return the documented array of applicable rules');
  }
  const candidates = res.value.filter((rule) => isPlainObject(rule)
    && rule.type === 'pull_request'
    && isPlainObject(rule.parameters)
    && Number.isInteger(rule.parameters.required_approving_review_count));
  if (candidates.length === 0) {
    return selectionFailure('no applicable pull_request rule carries an integer required_approving_review_count; an absent rule is not a proven requirement');
  }
  const winner = candidates.reduce((best, rule) => (
    rule.parameters.required_approving_review_count > best.parameters.required_approving_review_count ? rule : best
  ));
  return Object.freeze({
    ok: true,
    detail: null,
    count: winner.parameters.required_approving_review_count,
    rulesetId: Number.isInteger(winner.ruleset_id) ? winner.ruleset_id : null,
    sourceType: typeof winner.ruleset_source_type === 'string' ? winner.ruleset_source_type : null,
    lastPushApproval: winner.parameters.require_last_push_approval,
  });
}

function unusableSelection(selection) {
  return !isPlainObject(selection) || selection.ok !== true;
}

export function checkBaseBranchRequiresReview(selection) {
  const id = PREFLIGHT_CHECK_IDS.review;
  if (unusableSelection(selection)) {
    const detail = isPlainObject(selection) && typeof selection.detail === 'string' ? selection.detail : 'no applicable pull_request rule could be read, so no review requirement is proven';
    return check(id, 3, true, false, detail);
  }
  if (selection.count < 1) {
    return check(id, 3, true, false, `the most restrictive applicable pull_request rule requires ${selection.count} approving reviews, so a pull request can land unreviewed`);
  }
  if (selection.lastPushApproval !== true) {
    return check(id, 3, true, false, `the pull_request rule requiring ${selection.count} approving review(s) does not set require_last_push_approval to exactly true, so an approval recorded against one commit survives every later push to the same pull request and never-reviewed commits can merge under it; an absent key is not a proven true`);
  }
  return check(id, 3, true, true, `the base branch requires a pull request carrying at least ${selection.count} approving review(s), and require_last_push_approval is exactly true, so the approval must cover the last pushed commit`);
}

export function checkRepositoryRulesetIsActive(read, config, selection) {
  const id = PREFLIGHT_CHECK_IDS.ruleset;
  if (unusableSelection(selection)) {
    return check(id, 3, true, false, 'no pull_request rule supplying a review requirement could be read, so no ruleset can be bound to one');
  }
  if (selection.sourceType !== 'Repository') {
    return check(id, 3, true, false, `the pull_request rule carrying the review requirement is sourced from ${JSON.stringify(selection.sourceType)} rather than this repository, so the boundary lives in a scope this repository does not own and this read cannot prove is bound to the base branch`);
  }
  if (!Number.isInteger(selection.rulesetId)) {
    return check(id, 3, true, false, 'the pull_request rule carrying the review requirement names no integer ruleset_id, so it cannot be bound to an actively enforcing repository ruleset');
  }
  const res = readPreflightProbe(read, 'rulesets', config);
  if (!res.ok) return check(id, 3, true, false, res.error);
  if (!Array.isArray(res.value)) {
    return check(id, 3, true, false, 'the rulesets read did not return the documented array of rulesets');
  }
  const own = res.value.filter((entry) => isPlainObject(entry) && entry.source_type === 'Repository');
  const bound = own.filter((entry) => entry.id === selection.rulesetId && entry.target === 'branch' && entry.enforcement === 'active');
  if (bound.length === 0) {
    const inherited = res.value.length - own.length;
    return check(id, 3, true, false, `ruleset ${selection.rulesetId}, which supplies the base-branch review requirement, is not among this repository's own actively enforcing branch rulesets; ${own.length} repository ruleset(s) were read and ${inherited} inherited from a parent scope were not counted as this repository's own`);
  }
  return check(id, 3, true, true, `the base-branch review requirement comes from ruleset ${selection.rulesetId}, which this repository owns and enforces as an active branch ruleset`);
}

export const PREFLIGHT_BYPASS_GAP = 'not machine-verifiable by this token: GitHub returns bypass_actors only to a caller holding write access to the ruleset, and granting that would let the engine edit its own boundary, so an omitted key is indistinguishable from an empty one and is never read as a pass; a human must confirm the bypass list is empty';

export function describeBypassListGap() {
  return check(PREFLIGHT_CHECK_IDS.bypass, null, false, null, PREFLIGHT_BYPASS_GAP);
}

function attestedString(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function preflightAttestation(config, invokedAs) {
  const usable = isUsablePreflightConfig(config);
  return Object.freeze({
    slug: usable ? config.slug : null,
    baseBranch: usable ? config.baseBranch : null,
    invokedAs: attestedString(invokedAs),
  });
}

export function buildPreflightReport(checks, attestation) {
  const frozen = Object.freeze(checks.map((entry) => Object.freeze({ ...entry })));
  const attested = isPlainObject(attestation) ? attestation : preflightAttestation(null, null);
  return Object.freeze({
    passed: frozen.length > 0 && frozen.every((entry) => (entry.required ? entry.passed === true : entry.passed !== false)),
    checks: frozen,
    halted: Object.freeze(frozen.filter((entry) => entry.passed === false).map((entry) => entry.id)),
    unverifiable: Object.freeze(frozen.filter((entry) => entry.passed === null).map((entry) => entry.id)),
    boundarySlug: attestedString(attested.slug),
    boundaryBaseBranch: attestedString(attested.baseBranch),
    invokedAs: attestedString(attested.invokedAs),
    bypassVerified: false,
    bypassGap: PREFLIGHT_BYPASS_GAP,
  });
}

export function renderPreflightVerdictLine(report) {
  const attested = isPlainObject(report) ? report : {};
  const base = {
    boundarySlug: attestedString(attested.boundarySlug),
    boundaryBaseBranch: attestedString(attested.boundaryBaseBranch),
    invokedAs: attestedString(attested.invokedAs),
    bypassVerified: false,
    bypassGap: PREFLIGHT_BYPASS_GAP,
  };
  if (!isPlainObject(report) || !Array.isArray(report.checks)) {
    return `${JSON.stringify({ passed: false, halted: [PREFLIGHT_CHECK_IDS.configuration], ...base })}\n`;
  }
  return `${JSON.stringify({
    passed: report.passed === true,
    halted: [...report.halted],
    ...base,
  })}\n`;
}

export function runMergeBoundaryPreflight(config, read, invokedAs) {
  const attestation = preflightAttestation(config, invokedAs);
  if (!isUsablePreflightConfig(config)) {
    return buildPreflightReport([check(PREFLIGHT_CHECK_IDS.configuration, null, true, false, 'the preflight received no usable deployment configuration and can prove no invariant')], attestation);
  }
  if (typeof read !== 'function') {
    return buildPreflightReport([check(PREFLIGHT_CHECK_IDS.configuration, null, true, false, 'the preflight received no read function and can prove no invariant')], attestation);
  }
  const identity = checkIdentityIsMachineUser(read, config);
  const admin = checkRepositoryDeniesAdmin(read, config);
  const collaborator = checkCollaboratorDeniesAdmin(read, config);
  const selection = selectBaseBranchReviewRule(read, config);
  return buildPreflightReport([
    identity,
    admin,
    collaborator,
    checkBaseBranchRequiresReview(selection),
    checkRepositoryRulesetIsActive(read, config, selection),
    describeBypassListGap(),
  ], attestation);
}

function verdictLabel(entry) {
  if (entry.passed === true) return 'PASS';
  if (entry.passed === null) return 'UNVERIFIABLE';
  return 'HALT';
}

export function renderPreflightReport(report) {
  if (!isPlainObject(report) || !Array.isArray(report.checks)) {
    return 'merge-boundary preflight: HALT - no report could be produced, so the boundary is unproven.\n';
  }
  const headline = report.passed === true
    ? 'merge-boundary preflight: PASS - every gated invariant was positively proven.'
    : `merge-boundary preflight: HALT - ${report.halted.length} invariant(s) could not be proven; the engine run must not start.`;
  const lines = report.checks.map((entry) => {
    const scope = entry.invariant === null ? 'advisory' : `invariant ${entry.invariant}`;
    return `${verdictLabel(entry)} [${scope}] ${entry.id}: ${entry.detail}`;
  });
  return `${[headline, ...lines].join('\n')}\n`;
}

export function runPreflightCli(env, out, deps = {}) {
  const resolveGh = typeof deps.resolveGh === 'function' ? deps.resolveGh : resolveGhBinary;
  const exec = typeof deps.exec === 'function' ? deps.exec : execGh;
  const invokedAs = attestedString(deps.invokedAs) || attestedString(process.argv[1]);
  const parsed = readPreflightConfig(env);
  if (!parsed.ok) {
    out.err(`${parsed.error}\n`);
    return PREFLIGHT_CONFIG_EXIT;
  }
  const ghBin = resolveGh({ pathValue: isPlainObject(env) ? env.PATH : '' });
  if (!ghBin) {
    out.err('merge-boundary preflight: could not locate a gh binary on PATH or any pinned fallback; the boundary is unproven and the run must not start.\n');
    return PREFLIGHT_GH_MISSING_EXIT;
  }
  const report = runMergeBoundaryPreflight(parsed.config, (argv) => exec(ghBin, argv), invokedAs);
  out.log(renderPreflightVerdictLine(report));
  const rendered = renderPreflightReport(report);
  if (report.passed === true) {
    out.log(rendered);
    return PREFLIGHT_PASS_EXIT;
  }
  out.err(rendered);
  return PREFLIGHT_HALT_EXIT;
}

export function mergeBoundaryPreflightMain() {
  const out = Object.freeze({
    log: (text) => process.stdout.write(text),
    err: (text) => process.stderr.write(text),
  });
  process.exitCode = runPreflightCli(process.env, out);
}

export function isDirectPreflightInvocation() {
  try {
    if (!process.argv[1]) return false;
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isDirectPreflightInvocation()) {
  mergeBoundaryPreflightMain();
}
