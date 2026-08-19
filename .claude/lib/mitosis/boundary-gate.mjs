import { isAbsolute, resolve as pathResolve } from 'node:path';
import { censusIdentity, usableCachedBase } from './boundary-census-cache.mjs';
import {
  BOUNDARY_TOOLS,
  HEAD_SIDE,
  REAL_BOUNDARY_IO,
  cleanlyRan,
  collectCensus,
  collectSides,
  excludedSubtreesFor,
  failureText,
  scannedSide,
} from './boundary-collect.mjs';
import { fixedScope } from './boundary-config-surface.mjs';
import { evasionVerdict } from './boundary-evasion.mjs';
import { commonTreeFiles } from './boundary-scan-scope.mjs';

export const GATE_BASE_SHAPE = /^[0-9A-Za-z][0-9A-Za-z._/-]*$/;
export const REFUSAL_CLASSIFIER = 'collection-refused';
export const EVASION_HALT_CLASSIFIER = 'evasion-halted';
export const NEW_FINDING_CLASSIFIER = 'new-finding';
export const NOT_COMPARABLE_CLASSIFIER = 'not-comparable';

const EMPTY_CONTEXT = Object.freeze({ leaked: null, cacheRefusal: null });
const TREE_PROBE_DEADLINE_MS = 10000;
const RESOLVED_TREE_SHAPE = /^[0-9a-f]{7,64}$/;
const WORKTREE_STATUS_ARGV = Object.freeze(['status', '--porcelain']);
const REF_SHAPE_REQUIREMENT = 'a ref or sha shape that cannot be read as an option or as a revision range';

const refShaped = (value) => GATE_BASE_SHAPE.test(value) && !value.includes('..');

const REQUEST_FIELDS = Object.freeze([
  Object.freeze({ name: 'repoRoot', accepts: isAbsolute, requirement: 'an absolute path' }),
  Object.freeze({ name: 'gateBase', accepts: refShaped, requirement: REF_SHAPE_REQUIREMENT }),
  Object.freeze({ name: 'basePath', accepts: isAbsolute, requirement: 'an absolute path' }),
  Object.freeze({ name: 'headRef', accepts: refShaped, requirement: REF_SHAPE_REQUIREMENT }),
  Object.freeze({ name: 'headPath', accepts: isAbsolute, requirement: 'an absolute path' }),
]);

const DISTINCT_TREES = Object.freeze([
  Object.freeze({
    left: 'basePath',
    right: 'repoRoot',
    consequence: 'the base would be the tree under test and every finding would be compared against itself',
  }),
  Object.freeze({
    left: 'headPath',
    right: 'repoRoot',
    consequence: 'the head census would read the operator checkout, which never carries the diff of the unit under test',
  }),
  Object.freeze({
    left: 'headPath',
    right: 'basePath',
    consequence: 'the head and the base would be one tree and no finding could be attributed to the unit under test',
  }),
]);

function requestProblems(request) {
  const problems = [];
  for (const field of REQUEST_FIELDS) {
    const value = request[field.name];
    if (typeof value !== 'string' || value.length === 0) {
      problems.push(`${field.name} must be a non-empty string, not ${JSON.stringify(value)}`);
      continue;
    }
    if (!field.accepts(value)) {
      problems.push(`${field.name} must be ${field.requirement}, not ${JSON.stringify(value)}`);
    }
  }
  if (Object.hasOwn(request, 'declaredNoOp') && typeof request.declaredNoOp !== 'boolean') {
    problems.push(`declaredNoOp must be a boolean when it is present, not ${JSON.stringify(request.declaredNoOp)}`);
  }
  if (problems.length > 0) return problems;
  for (const pair of DISTINCT_TREES) {
    if (pathResolve(request[pair.left]) !== pathResolve(request[pair.right])) continue;
    problems.push(`${pair.left} ${JSON.stringify(request[pair.left])} names the same tree as ${pair.right}, so ${pair.consequence}`);
  }
  return problems;
}

export function compareCensuses(baseIdentitiesByTool, headIdentitiesByTool) {
  const blocking = [];
  let comparedIdentities = 0;
  for (const tool of Object.keys(headIdentitiesByTool).sort()) {
    const baseCounts = baseIdentitiesByTool[tool] ?? {};
    const headCounts = headIdentitiesByTool[tool];
    for (const identity of Object.keys(headCounts).sort()) {
      const headCount = headCounts[identity];
      const baseCount = baseCounts[identity] ?? 0;
      comparedIdentities += 1;
      if (headCount > baseCount) {
        blocking.push(Object.freeze({ tool, identity, baseCount, headCount, surplus: headCount - baseCount }));
      }
    }
  }
  return Object.freeze({
    pass: blocking.length === 0,
    blocking: Object.freeze(blocking),
    comparedIdentities,
    notComparable: comparedIdentities === 0,
  });
}

function probeReading(revision, child) {
  if (child === null || typeof child !== 'object') {
    return Object.freeze({ sha: null, reason: `the probe for ${revision} returned no child result at all` });
  }
  if (child.status !== 0) {
    return Object.freeze({ sha: null, reason: `the probe for ${revision} reported outcome ${JSON.stringify(child.outcome ?? null)} and status ${JSON.stringify(child.status ?? null)}` });
  }
  const sha = typeof child.stdout === 'string' ? child.stdout.trim() : '';
  if (!RESOLVED_TREE_SHAPE.test(sha)) {
    return Object.freeze({ sha: null, reason: `the probe for ${revision} printed ${JSON.stringify(sha)}, which is not the shape of a tree hash` });
  }
  return Object.freeze({ sha, reason: null });
}

function probedRevision(request, revision, io) {
  return probeReading(revision, io.run('git', ['rev-parse', '--verify', revision], { cwd: request.repoRoot, deadlineMs: TREE_PROBE_DEADLINE_MS }));
}

function headWorktreeState(request, io) {
  if (!io.exists(request.headPath)) return Object.freeze({ state: 'clean', reason: null });
  const child = io.run('git', [...WORKTREE_STATUS_ARGV], { cwd: request.headPath, deadlineMs: TREE_PROBE_DEADLINE_MS });
  if (!cleanlyRan(child) || child.status !== 0) {
    return Object.freeze({
      state: 'unknown',
      reason: `the head worktree at ${JSON.stringify(request.headPath)} could not be asked whether it carries uncommitted work, so its comparability to ${JSON.stringify(request.headRef)} could not be established`,
    });
  }
  return Object.freeze({ state: child.stdout.trim().length > 0 ? 'dirty' : 'clean', reason: null });
}

function treeProbe(request, io) {
  const base = probedRevision(request, `${request.gateBase}^{tree}`, io);
  const head = probedRevision(request, `${request.headRef}^{tree}`, io);
  const worktree = headWorktreeState(request, io);
  const reasons = [base.reason, head.reason].filter((reason) => typeof reason === 'string' && reason.length > 0);
  const unresolved = reasons.length === 0
    ? null
    : `the same-tree check reached no decision because a side stayed unresolved: ${reasons.join('; ')}`;
  const notes = [unresolved, worktree.reason].filter((note) => typeof note === 'string' && note.length > 0);
  return Object.freeze({ base, head, worktree, note: notes.length === 0 ? null : notes.join('; ') });
}

function sameTreeRefusal(request, probe) {
  if (Object.hasOwn(request, 'declaredNoOp') && request.declaredNoOp === true) return null;
  if (probe.worktree.state !== 'clean') return null;
  if (probe.base.sha === null || probe.head.sha === null) return null;
  if (probe.base.sha !== probe.head.sha) return null;
  const detail = `gateBase ${JSON.stringify(request.gateBase)} and headRef ${JSON.stringify(request.headRef)} both resolve to tree ${probe.base.sha}, and the head worktree at ${JSON.stringify(request.headPath)} carries no uncommitted work, so the base is the tree under test and no finding could be compared against anything`;
  return Object.freeze({
    pass: false,
    output: detail,
    blocking: Object.freeze([Object.freeze({ classifier: NOT_COMPARABLE_CLASSIFIER, detail })]),
    notExpected: Object.freeze([]),
    usedCachedCensus: false,
    baseCensus: null,
    leaked: null,
    comparedIdentities: 0,
    notComparable: true,
  });
}

function withNotes(output, notes) {
  return [output, ...notes.filter((note) => typeof note === 'string' && note.length > 0)].join('; ');
}

function refused(output, context, unresolvedProbe) {
  const detail = withNotes(output, [context.cacheRefusal, context.leaked, unresolvedProbe]);
  return Object.freeze({
    pass: false,
    output: detail,
    blocking: Object.freeze([Object.freeze({ classifier: REFUSAL_CLASSIFIER, detail })]),
    notExpected: Object.freeze([]),
    usedCachedCensus: false,
    baseCensus: null,
    leaked: context.leaked,
    comparedIdentities: 0,
    notComparable: true,
  });
}

function evasionOutput(evasion) {
  if (evasion.halted) return `the evasion scan halted: ${evasion.error}`;
  if (evasion.pass) return 'no evasion detected';
  return `${evasion.blocking.length} evasion finding(s): ${evasion.blocking.map((entry) => `${entry.classifier}: ${entry.detail}`).join('; ')}`;
}

function evasionBlocking(evasion) {
  if (!evasion.halted) return evasion.blocking;
  return Object.freeze([Object.freeze({ classifier: EVASION_HALT_CLASSIFIER, detail: evasion.error })]);
}

function headSideFor(request, expectations, scope, io) {
  const collected = collectCensus(Object.freeze({
    root: request.headPath,
    side: HEAD_SIDE,
    gateBase: request.gateBase,
    expectations,
    scope,
    excludedSubtrees: excludedSubtreesFor(request.headPath, request.basePath),
  }), io);
  if (!collected.ok) return collected;
  return scannedSide(request.headPath, collected.census, io, HEAD_SIDE);
}

function sidesFor(request, io) {
  const cached = usableCachedBase(request, io);
  if (!cached.ok) {
    const collected = collectSides(request, io);
    return Object.freeze({ ...collected, cacheRefusal: cached.refusal, usedCachedCensus: false });
  }
  const head = headSideFor(request, cached.expectations, fixedScope(cached.census.surface.eslintConfigFiles), io);
  if (!head.ok) {
    return Object.freeze({ ok: false, error: head.error, leaked: null, cacheRefusal: cached.refusal, usedCachedCensus: false });
  }
  return Object.freeze({
    ok: true,
    baseCensus: cached.census,
    headCensus: head.census,
    expectations: cached.expectations,
    leaked: null,
    cacheRefusal: cached.refusal,
    usedCachedCensus: true,
  });
}

function identitiesByTool(census) {
  return Object.fromEntries(Object.entries(census.tools).map(([name, entry]) => [name, entry.identities]));
}

function findingsText(verdict, notExpected, headCensus) {
  if (!verdict.pass) {
    return `${verdict.blocking.length} new finding(s) this MSP introduced: ${verdict.blocking.map((entry) => `${entry.tool} ${JSON.stringify(entry.identity)} base ${entry.baseCount} head ${entry.headCount}`).join('; ')}`;
  }
  if (notExpected.length === BOUNDARY_TOOLS.length) {
    return 'no new finding: every tool is NOT-EXPECTED, so the lint and type dimension is legitimately empty';
  }
  return `no new finding: ${Object.keys(headCensus.tools).sort().join(', ')} collected cleanly on both sides`;
}

function published(census) {
  return Object.freeze({ ...census, identity: censusIdentity(census) });
}

function verdictOf(sides, evasion, unresolvedProbe) {
  const verdict = compareCensuses(identitiesByTool(sides.baseCensus), identitiesByTool(sides.headCensus));
  const notExpected = Object.freeze(BOUNDARY_TOOLS.filter((tool) => !sides.expectations[tool.name].expected).map((tool) => tool.name));
  return Object.freeze({
    pass: verdict.pass && evasion.pass,
    output: withNotes(`${findingsText(verdict, notExpected, sides.headCensus)}; ${evasionOutput(evasion)}`, [sides.cacheRefusal, sides.leaked, unresolvedProbe]),
    blocking: Object.freeze([
      ...verdict.blocking.map((entry) => Object.freeze({ classifier: NEW_FINDING_CLASSIFIER, ...entry })),
      ...evasionBlocking(evasion),
    ]),
    notExpected,
    usedCachedCensus: sides.usedCachedCensus,
    baseCensus: published(sides.baseCensus),
    leaked: sides.leaked,
    comparedIdentities: verdict.comparedIdentities,
    notComparable: verdict.notComparable,
  });
}

export function evaluate(request, io = REAL_BOUNDARY_IO) {
  if (request === null || typeof request !== 'object') {
    throw new TypeError('boundary-gate: evaluate expects a request object carrying repoRoot, gateBase, basePath, headRef and headPath');
  }
  const problems = requestProblems(request);
  if (problems.length > 0) {
    throw new TypeError(`boundary-gate: evaluate refuses this request: ${problems.join('; ')}`);
  }
  let sides = EMPTY_CONTEXT;
  let evasion;
  let unresolvedProbe = null;
  try {
    const probe = treeProbe(request, io);
    unresolvedProbe = probe.note;
    if (probe.worktree.state === 'unknown') {
      return refused('the boundary gate could not complete: the head worktree state could not be observed', sides, unresolvedProbe);
    }
    const notComparable = sameTreeRefusal(request, probe);
    if (notComparable !== null) return notComparable;
    sides = sidesFor(request, io);
    if (!sides.ok) return refused(sides.error, sides, unresolvedProbe);
    const common = commonTreeFiles(sides.baseCensus.surface, sides.headCensus.surface, io);
    if (!common.ok) return refused(common.error, sides, unresolvedProbe);
    evasion = evasionVerdict(sides.baseCensus.surface, Object.freeze({ ...sides.headCensus.surface, commonFiles: common.files }));
  } catch (error) {
    return refused(`the boundary gate could not complete: ${failureText(error, 'unknown failure')}`, sides, unresolvedProbe);
  }
  return verdictOf(sides, evasion, unresolvedProbe);
}
