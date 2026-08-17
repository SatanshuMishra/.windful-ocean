import { normalizePath, scopeCovers } from './coarse-scope-lint.mjs';
import { sensitiveScope } from './run-engine.mjs';
import { isRepoRelativePath } from './recovery.mjs';

export const CI_ATTEMPT_CAP = 3;
export const CI_PUBLISHED_TOKEN = 'ci-published:pr';
export const CI_PROBE_TOKEN = 'ci-probe:rerun';
export const CI_FIX_PREFIX = 'ci-fix:';
export const CI_SHA_PATTERN = /^[0-9a-f]{7,64}$/i;
export const CI_REASON_LIST_CAP = 240;
export const CI_TERMINAL_CONCLUSIONS = Object.freeze(['failure', 'cancelled', 'timed_out', 'action_required', 'stale', 'startup_failure', 'neutral', 'skipped', 'timeout-expired']);
export const CI_ENFORCER_CHECK_TOKENS = Object.freeze(['receipts', 'd6', 'cluster-boundary', 'pr-title-lint', 'invariant-coverage', 'determinism', 'exec-allowlist', 'dispatchable-agent-schema-capable', 'phase-parity']);
export const CI_SECURITY_CHECK_TOKENS = Object.freeze(['security', 'codeql', 'secret-scan', 'secret scanning', 'dependency-review', 'sast', 'trivy', 'snyk', 'audit', 'scan', 'gitleaks', 'semgrep', 'osv', 'grype', 'bandit', 'trufflehog', 'vuln', 'cve', 'licence', 'license']);
export const CI_ORDINARY_CHECK_TOKENS = Object.freeze(['test', 'spec', 'unit', 'integration', 'e2e', 'build', 'compile', 'typecheck', 'tsc', 'lint', 'format', 'fmt', 'coverage', 'suite', 'jest', 'vitest', 'mocha', 'pytest', 'cargo', 'gradle']);

function ciStringList(value) {
  return Array.isArray(value) && value.every((v) => typeof v === 'string' && v.length > 0);
}

function ciNonEmptyStringList(value) {
  return ciStringList(value) && value.length > 0;
}

function ciSortedStrings(value) {
  return Array.isArray(value) ? value.filter((v) => typeof v === 'string').slice().sort() : [];
}

function ciCheckNameMatches(names, census) {
  return names.some((name) => {
    const lowered = name.toLowerCase();
    return census.some((token) => lowered.includes(token));
  });
}

function ciUnclassifiableChecks(names) {
  return names.filter((name) => {
    const lowered = name.toLowerCase();
    const known = [...CI_ORDINARY_CHECK_TOKENS, ...CI_ENFORCER_CHECK_TOKENS, ...CI_SECURITY_CHECK_TOKENS];
    return !known.some((token) => lowered.includes(token));
  });
}

function ciCanonicalPaths(paths) {
  if (!Array.isArray(paths)) return null;
  const canonical = [];
  for (const path of paths) {
    if (typeof path !== 'string' || path.length === 0) return null;
    const normalized = normalizePath(path);
    if (normalized.length === 0 || !isRepoRelativePath(normalized)) return null;
    canonical.push(normalized);
  }
  return canonical;
}

export function ciCleanList(values) {
  const joined = (Array.isArray(values) ? values : []).map((v) => String(v)).join(', ');
  const capped = joined.length > CI_REASON_LIST_CAP ? `${joined.slice(0, CI_REASON_LIST_CAP)} ...` : joined;
  return JSON.stringify(capped).replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ');
}

function ciPathsOutsideScope(declaredScope, paths) {
  return paths.filter((path) => !declaredScope.some((entry) => scopeCovers(entry, path)));
}

export function ciScopeViolations(declaredScope, paths) {
  if (!ciNonEmptyStringList(declaredScope)) return { readable: false, foreign: [] };
  const canonical = ciCanonicalPaths(paths);
  if (canonical === null || canonical.length === 0) return { readable: false, foreign: [] };
  try {
    return { readable: true, foreign: ciPathsOutsideScope(declaredScope, canonical) };
  } catch {
    return { readable: false, foreign: [] };
  }
}

export function ciFailureFingerprint(report) {
  const r = report && typeof report === 'object' && !Array.isArray(report) ? report : {};
  const canonical = JSON.stringify([
    typeof r.ciConclusion === 'string' ? r.ciConclusion : '',
    ciSortedStrings(r.failedChecks),
    ciSortedStrings(r.implicatedPaths),
    ciSortedStrings(r.failingAssertionFiles),
    ciSortedStrings(r.conflictPaths),
    r.receiptsPass === true,
    r.d6Pass === true,
  ]);
  let h = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i += 1) {
    h = (h ^ canonical.charCodeAt(i)) >>> 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${CI_FIX_PREFIX}${h.toString(16).padStart(8, '0')}`;
}

export function ciAttemptsSpent(triedSet) {
  if (!Array.isArray(triedSet)) return 0;
  return triedSet.filter((t) => typeof t === 'string' && (t === CI_PROBE_TOKEN || t.startsWith(CI_FIX_PREFIX))).length;
}

export function ciHeadPublished(triedSet) {
  return Array.isArray(triedSet) && triedSet.includes(CI_PUBLISHED_TOKEN);
}

export function ciProbeConsumed(triedSet) {
  return Array.isArray(triedSet) && triedSet.includes(CI_PROBE_TOKEN);
}

export function classifyCiReport(report, declaredScope) {
  const escalate = (cls, reason) => ({ escalate: true, class: cls, reason });
  if (!report || typeof report !== 'object' || Array.isArray(report)) return escalate(0, 'the ci report is not a readable object');
  if (!ciNonEmptyStringList(declaredScope)) return escalate(0, 'the msp declares no usable fileScope, so path containment cannot be confirmed');
  if (typeof report.ciConclusion !== 'string' || !CI_TERMINAL_CONCLUSIONS.includes(report.ciConclusion)) return escalate(0, 'the reported ci conclusion is outside the closed set of terminal conclusions this loop can classify');
  if (!ciStringList(report.failedChecks)) return escalate(0, 'failedChecks is absent or is not a list of check names');
  if (!ciNonEmptyStringList(report.implicatedPaths)) return escalate(0, 'implicatedPaths is empty or unreadable, so scope containment cannot be confirmed');
  if (!ciNonEmptyStringList(report.failingAssertionFiles)) return escalate(0, 'failingAssertionFiles is empty or unreadable, so the assertion guard cannot be run at all');
  if (!ciStringList(report.conflictPaths)) return escalate(0, 'conflictPaths is not a readable list of paths');
  if (typeof report.publishedHeadSha !== 'string' || !CI_SHA_PATTERN.test(report.publishedHeadSha)) return escalate(0, 'publishedHeadSha is absent or malformed, so the diff verifier has no engine-held left endpoint to check against');
  if (typeof report.receiptsPass !== 'boolean' || typeof report.d6Pass !== 'boolean') return escalate(0, 'receiptsPass and d6Pass are not both booleans');
  const implicatedPaths = ciCanonicalPaths(report.implicatedPaths);
  if (implicatedPaths === null) return escalate(0, `implicatedPaths carries an entry that is not a repo-relative path (${ciCleanList(report.implicatedPaths)}), so scope containment would be decided on a spelling git never emits`);
  const failingAssertionFiles = ciCanonicalPaths(report.failingAssertionFiles);
  if (failingAssertionFiles === null) return escalate(0, `failingAssertionFiles carries an entry that is not a repo-relative path (${ciCleanList(report.failingAssertionFiles)}), so the assertion guard would compare two different spellings of one file and admit an assertion edit`);
  const conflictPaths = ciCanonicalPaths(report.conflictPaths);
  if (conflictPaths === null) return escalate(0, `conflictPaths carries an entry that is not a repo-relative path (${ciCleanList(report.conflictPaths)}), so conflict containment cannot be confirmed`);
  const unclassifiable = ciUnclassifiableChecks(report.failedChecks);
  if (unclassifiable.length > 0) return escalate(0, `failing check(s) ${ciCleanList(unclassifiable)} match no ordinary test or build check this loop can classify; an unclassifiable check may be security-classed, so the census halts rather than attempt a fix against it`);
  try {
    const foreignPaths = ciPathsOutsideScope(declaredScope, implicatedPaths);
    if (foreignPaths.length > 0) return escalate(1, `implicated path(s) outside this msp declared fileScope: ${ciCleanList(foreignPaths)}`);
    if (report.ciConclusion !== 'failure') return escalate(2, `ci reached the terminal conclusion ${report.ciConclusion}, which is a ci infrastructure outcome rather than a test failure a fix could address`);
    if (report.receiptsPass === false || report.d6Pass === false || ciCheckNameMatches(report.failedChecks, CI_ENFORCER_CHECK_TOKENS)) return escalate(3, 'the receipts / D6 enforcer is red, which is enforcer configuration rather than a defect inside this msp');
    if (ciCheckNameMatches(report.failedChecks, CI_SECURITY_CHECK_TOKENS) || sensitiveScope(declaredScope)) return escalate(4, 'a security-classed check failed, or this msp declared fileScope is security sensitive');
    const foreignConflicts = ciPathsOutsideScope(declaredScope, conflictPaths);
    if (foreignConflicts.length > 0) return escalate(5, `merge conflict touches path(s) outside this msp declared fileScope: ${ciCleanList(foreignConflicts)}`);
  } catch {
    return escalate(0, 'a declared fileScope entry could not be evaluated as a path pattern, so containment cannot be confirmed');
  }
  return { escalate: false };
}

export function assertionGuardBlocks(changedPaths, failingAssertionFiles) {
  const failing = ciCanonicalPaths(failingAssertionFiles);
  if (failing === null || failing.length === 0) return true;
  const changed = ciCanonicalPaths(changedPaths);
  if (changed === null || changed.length === 0) return true;
  const failingSet = new Set(failing);
  return changed.some((p) => failingSet.has(p));
}

export function sensitivePathsTouched(paths) {
  const canonical = ciCanonicalPaths(paths);
  if (canonical === null) return true;
  return canonical.some((p) => sensitiveScope([p]));
}
