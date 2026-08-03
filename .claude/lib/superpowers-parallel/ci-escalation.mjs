import { normalizePath, scopeCovers, sensitiveScope } from './run-engine.mjs';

export const CI_ATTEMPT_CAP = 3;
export const CI_PUBLISHED_TOKEN = 'ci-published:pr';
export const CI_PROBE_TOKEN = 'ci-probe:rerun';
export const CI_FIX_PREFIX = 'ci-fix:';
export const CI_SHA_PATTERN = /^[0-9a-f]{7,64}$/i;
export const CI_TERMINAL_CONCLUSIONS = Object.freeze(['failure', 'cancelled', 'timed_out', 'action_required', 'stale', 'startup_failure', 'neutral', 'skipped', 'timeout-expired']);
export const CI_ENFORCER_CHECK_TOKENS = Object.freeze(['receipts', 'd6', 'cluster-boundary', 'pr-title-lint', 'invariant-coverage']);
export const CI_SECURITY_CHECK_TOKENS = Object.freeze(['security', 'codeql', 'secret-scan', 'secret scanning', 'dependency-review', 'sast', 'trivy', 'snyk', 'audit']);

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

function ciPathsOutsideScope(declaredScope, paths) {
  return paths.filter((path) => !declaredScope.some((entry) => scopeCovers(entry, path)));
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
  try {
    const foreignPaths = ciPathsOutsideScope(declaredScope, report.implicatedPaths);
    if (foreignPaths.length > 0) return escalate(1, `implicated path(s) outside this msp declared fileScope: ${foreignPaths.join(', ')}`);
    if (report.ciConclusion !== 'failure') return escalate(2, `ci reached the terminal conclusion ${report.ciConclusion}, which is a ci infrastructure outcome rather than a test failure a fix could address`);
    if (report.receiptsPass === false || report.d6Pass === false || ciCheckNameMatches(report.failedChecks, CI_ENFORCER_CHECK_TOKENS)) return escalate(3, 'the receipts / D6 enforcer is red, which is enforcer configuration rather than a defect inside this msp');
    if (ciCheckNameMatches(report.failedChecks, CI_SECURITY_CHECK_TOKENS) || sensitiveScope(declaredScope)) return escalate(4, 'a security-classed check failed, or this msp declared fileScope is security sensitive');
    const foreignConflicts = ciPathsOutsideScope(declaredScope, report.conflictPaths);
    if (foreignConflicts.length > 0) return escalate(5, `merge conflict touches path(s) outside this msp declared fileScope: ${foreignConflicts.join(', ')}`);
  } catch {
    return escalate(0, 'a declared fileScope entry could not be evaluated as a path pattern, so containment cannot be confirmed');
  }
  return { escalate: false };
}

export function assertionGuardBlocks(changedPaths, failingAssertionFiles) {
  if (!Array.isArray(failingAssertionFiles) || failingAssertionFiles.length === 0) return true;
  if (!Array.isArray(changedPaths) || changedPaths.length === 0) return true;
  const failing = new Set(failingAssertionFiles.filter((p) => typeof p === 'string').map((p) => normalizePath(p)));
  if (failing.size === 0) return true;
  return changedPaths.some((p) => typeof p !== 'string' || failing.has(normalizePath(p)));
}
