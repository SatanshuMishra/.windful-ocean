import { isAbsolute, resolve as pathResolve } from 'node:path';
import { censusIdentity, usableCachedBase } from './boundary-census-cache.mjs';
import {
  BOUNDARY_TOOLS,
  HEAD_SIDE,
  REAL_BOUNDARY_IO,
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

const EMPTY_CONTEXT = Object.freeze({ leaked: null, cacheRefusal: null });

const REQUEST_FIELDS = Object.freeze([
  Object.freeze({
    name: 'repoRoot',
    accepts: (value) => isAbsolute(value),
    requirement: 'an absolute path',
  }),
  Object.freeze({
    name: 'gateBase',
    accepts: (value) => GATE_BASE_SHAPE.test(value) && !value.includes('..'),
    requirement: 'a ref or sha shape that cannot be read as an option or as a revision range',
  }),
  Object.freeze({
    name: 'basePath',
    accepts: (value) => isAbsolute(value),
    requirement: 'an absolute path',
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
  if (problems.length > 0) return problems;
  if (pathResolve(request.basePath) === pathResolve(request.repoRoot)) {
    problems.push(`basePath ${JSON.stringify(request.basePath)} names the same tree as repoRoot, so the base would be the tree under test and every finding would be compared against itself`);
  }
  return problems;
}

export function compareCensuses(baseIdentitiesByTool, headIdentitiesByTool) {
  const blocking = [];
  for (const tool of Object.keys(headIdentitiesByTool).sort()) {
    const baseCounts = baseIdentitiesByTool[tool] ?? {};
    const headCounts = headIdentitiesByTool[tool];
    for (const identity of Object.keys(headCounts).sort()) {
      const headCount = headCounts[identity];
      const baseCount = baseCounts[identity] ?? 0;
      if (headCount > baseCount) {
        blocking.push(Object.freeze({ tool, identity, baseCount, headCount, surplus: headCount - baseCount }));
      }
    }
  }
  return Object.freeze({ pass: blocking.length === 0, blocking: Object.freeze(blocking) });
}

function withNotes(output, notes) {
  return [output, ...notes.filter((note) => typeof note === 'string' && note.length > 0)].join('; ');
}

function refused(output, context) {
  const detail = withNotes(output, [context.cacheRefusal, context.leaked]);
  return Object.freeze({
    pass: false,
    output: detail,
    blocking: Object.freeze([Object.freeze({ classifier: REFUSAL_CLASSIFIER, detail })]),
    notExpected: Object.freeze([]),
    usedCachedCensus: false,
    baseCensus: null,
    leaked: context.leaked,
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
    root: request.repoRoot,
    side: HEAD_SIDE,
    gateBase: request.gateBase,
    expectations,
    scope,
    excludedSubtrees: excludedSubtreesFor(request.repoRoot, request.basePath),
  }), io);
  if (!collected.ok) return collected;
  return scannedSide(request.repoRoot, collected.census, io, HEAD_SIDE);
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

function verdictOf(sides, evasion) {
  const verdict = compareCensuses(identitiesByTool(sides.baseCensus), identitiesByTool(sides.headCensus));
  const notExpected = Object.freeze(BOUNDARY_TOOLS.filter((tool) => !sides.expectations[tool.name].expected).map((tool) => tool.name));
  return Object.freeze({
    pass: verdict.pass && evasion.pass,
    output: withNotes(`${findingsText(verdict, notExpected, sides.headCensus)}; ${evasionOutput(evasion)}`, [sides.cacheRefusal, sides.leaked]),
    blocking: Object.freeze([
      ...verdict.blocking.map((entry) => Object.freeze({ classifier: NEW_FINDING_CLASSIFIER, ...entry })),
      ...evasionBlocking(evasion),
    ]),
    notExpected,
    usedCachedCensus: sides.usedCachedCensus,
    baseCensus: published(sides.baseCensus),
    leaked: sides.leaked,
  });
}

export function evaluate(request, io = REAL_BOUNDARY_IO) {
  if (request === null || typeof request !== 'object') {
    throw new TypeError('boundary-gate: evaluate expects a request object carrying repoRoot, gateBase and basePath');
  }
  const problems = requestProblems(request);
  if (problems.length > 0) {
    throw new TypeError(`boundary-gate: evaluate refuses this request: ${problems.join('; ')}`);
  }
  let sides = EMPTY_CONTEXT;
  let evasion;
  try {
    sides = sidesFor(request, io);
    if (!sides.ok) return refused(sides.error, sides);
    const common = commonTreeFiles(sides.baseCensus.surface, sides.headCensus.surface, io);
    if (!common.ok) return refused(common.error, sides);
    evasion = evasionVerdict(sides.baseCensus.surface, Object.freeze({ ...sides.headCensus.surface, commonFiles: common.files }));
  } catch (error) {
    return refused(`the boundary gate could not complete: ${failureText(error, 'unknown failure')}`, sides);
  }
  return verdictOf(sides, evasion);
}
