import { createHash } from 'node:crypto';
import { BOUNDARY_TOOLS, BOUNDARY_TOOL_NAMES, expectationsFor } from './boundary-collect.mjs';
import { TSCONFIG_STRICTNESS_FLAGS, severityOf } from './boundary-evasion.mjs';

export const CENSUS_IDENTITY_ALGORITHM = 'sha256';
export const CENSUS_IDENTITY_HEX_LENGTH = 64;
export const CENSUS_IDENTITY_FIELDS = Object.freeze(['gateBase', 'tools', 'notExpected', 'surface']);

const HEX = /^[0-9a-f]+$/;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function isPathList(value) {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

function isCount(value) {
  return Number.isInteger(value) && value >= 0;
}

function isJsonValue(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (isPlainObject(value)) return Object.values(value).every(isJsonValue);
  return false;
}

function isCompilerOption(flag, value) {
  if (!isJsonValue(value)) return false;
  return Object.hasOwn(TSCONFIG_STRICTNESS_FLAGS, flag) ? typeof value === 'boolean' : true;
}

function everyEntry(value, accepts) {
  return isPlainObject(value) && Object.entries(value).every(([key, entry]) => isNonEmptyString(key) && accepts(entry, key));
}

export const CACHED_SURFACE_FIELDS = Object.freeze([
  Object.freeze({
    name: 'root',
    accepts: isNonEmptyString,
    requirement: 'the base root it was collected under',
  }),
  Object.freeze({
    name: 'checkedFiles',
    accepts: isPathList,
    requirement: 'a list of non-empty checked-file paths',
  }),
  Object.freeze({
    name: 'checkedByTool',
    accepts: (value) => everyEntry(value, isPathList),
    requirement: 'a map of tool name to that tool\'s list of non-empty checked-file paths',
  }),
  Object.freeze({
    name: 'suppressions',
    accepts: (value) => everyEntry(value, isCount),
    requirement: 'a map of suppression key to a whole count of zero or more, which is what the surplus comparison subtracts',
  }),
  Object.freeze({
    name: 'tsconfigOptions',
    accepts: (value) => everyEntry(value, (entry, flag) => isCompilerOption(flag, entry)),
    requirement: 'a map of compiler option to a JSON value, with every option the strictness table names carrying a boolean, which is what the safe-value comparison reads',
  }),
  Object.freeze({
    name: 'eslintConfigByFile',
    accepts: (value) => everyEntry(value, (entry) => isPlainObject(entry) && everyEntry(entry.rules, (severity) => severityOf(severity) !== null)),
    requirement: 'a map of file to its resolved rule map, with every rule carrying one of the severities eslint resolves to, which is what the downgrade comparison orders',
  }),
  Object.freeze({
    name: 'eslintConfigFiles',
    accepts: isPathList,
    requirement: 'the list of non-empty file paths the resolved config was collected for',
  }),
]);

function canonicalText(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalText).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalText(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

function identityInput(census) {
  return Object.fromEntries(CENSUS_IDENTITY_FIELDS.map((field) => [field, census[field] ?? null]));
}

export function censusIdentity(census) {
  return createHash(CENSUS_IDENTITY_ALGORITHM).update(canonicalText(identityInput(census))).digest('hex');
}

function toolCountProblems(cached) {
  const problems = [];
  for (const [name, entry] of Object.entries(cached.tools)) {
    if (!isPlainObject(entry) || !isPlainObject(entry.identities)) {
      problems.push(`the ${name} entry carries ${JSON.stringify(entry)} rather than the identity counts the surplus comparison subtracts`);
      continue;
    }
    const unusable = Object.entries(entry.identities).filter(([, count]) => !isCount(count));
    if (unusable.length > 0) {
      problems.push(`the ${name} identity counts carry ${unusable.map(([identity, count]) => `${JSON.stringify(identity)}: ${JSON.stringify(count)}`).join(', ')} rather than whole counts of zero or more`);
    }
  }
  return problems;
}

function shapeProblems(cached, gateBase) {
  if (!isPlainObject(cached)) return [`it is ${JSON.stringify(cached === undefined ? null : cached)} rather than a census object`];
  const problems = [];
  if (cached.gateBase !== gateBase) {
    problems.push(`it is keyed to ${JSON.stringify(cached.gateBase === undefined ? null : cached.gateBase)} rather than to the base ${JSON.stringify(gateBase)} this pass compares against`);
  }
  if (!isPlainObject(cached.tools)) problems.push(`it carries ${JSON.stringify(cached.tools === undefined ? null : cached.tools)} rather than a per-tool census`);
  if (!Array.isArray(cached.notExpected)) problems.push(`it carries ${JSON.stringify(cached.notExpected === undefined ? null : cached.notExpected)} rather than the list of tools it reports NOT-EXPECTED`);
  if (!isPlainObject(cached.surface)) problems.push(`it carries ${JSON.stringify(cached.surface === undefined ? null : cached.surface)} rather than the surface the evasion scans read`);
  if (problems.length > 0) return problems;
  for (const field of CACHED_SURFACE_FIELDS) {
    if (!field.accepts(cached.surface[field.name])) {
      problems.push(`its surface carries ${JSON.stringify(cached.surface[field.name] === undefined ? null : cached.surface[field.name])} as ${field.name} rather than ${field.requirement}`);
    }
  }
  const named = [...Object.keys(cached.tools), ...cached.notExpected].sort();
  if (JSON.stringify(named) !== JSON.stringify([...BOUNDARY_TOOL_NAMES].sort())) {
    problems.push(`it names ${named.join(', ') || 'no tool'} rather than every declared tool (${[...BOUNDARY_TOOL_NAMES].sort().join(', ')})`);
  }
  return [...problems, ...toolCountProblems(cached)];
}

function identityProblems(cached) {
  if (typeof cached.identity !== 'string' || cached.identity.length !== CENSUS_IDENTITY_HEX_LENGTH || !HEX.test(cached.identity)) {
    return [`it carries ${JSON.stringify(cached.identity === undefined ? null : cached.identity)} rather than the ${CENSUS_IDENTITY_HEX_LENGTH}-character ${CENSUS_IDENTITY_ALGORITHM} identity a collected census is published with, so nothing binds it to the tree it claims to describe`];
  }
  if (cached.identity !== censusIdentity(cached)) {
    return [`its contents fingerprint to ${censusIdentity(cached)} rather than to the ${cached.identity} it carries, so what it counts is not what was collected under ${JSON.stringify(cached.gateBase)}`];
  }
  return [];
}

export function cachedCensusProblems(cached, gateBase) {
  const problems = shapeProblems(cached, gateBase);
  if (problems.length > 0) return Object.freeze(problems);
  return Object.freeze(identityProblems(cached));
}

export function cachedCensusAgreement(cached, expectations) {
  const disagreeing = BOUNDARY_TOOLS
    .filter((tool) => expectations[tool.name].expected === cached.notExpected.includes(tool.name))
    .map((tool) => `${tool.name} is ${expectations[tool.name].expected ? 'expected' : 'NOT-EXPECTED'} over the trees and ${cached.notExpected.includes(tool.name) ? 'NOT-EXPECTED' : 'expected'} in the supplied census`);
  return Object.freeze({ agrees: disagreeing.length === 0, disagreeing: Object.freeze(disagreeing) });
}

export function usableCachedBase(request, io) {
  const cached = request.cachedBaseCensus ?? null;
  if (cached === null) return { ok: false, refusal: null };
  const problems = cachedCensusProblems(cached, request.gateBase);
  if (problems.length > 0) {
    return {
      ok: false,
      refusal: `the supplied base census was refused and the base re-collected: ${problems.join('; ')}; every field the comparison reads is validated for the values it reads rather than for its container alone`,
    };
  }
  const recomputed = expectationsFor(request.repoRoot, request.basePath, io);
  if (!recomputed.ok) return { ok: false, refusal: recomputed.error };
  const agreement = cachedCensusAgreement(cached, recomputed.byTool);
  if (!agreement.agrees) {
    return {
      ok: false,
      refusal: `the supplied base census was refused and the base re-collected: ${agreement.disagreeing.join('; ')}; what a tool is expected to report is recomputed from the trees rather than read from the census being compared against`,
    };
  }
  return { ok: true, census: cached, expectations: recomputed.byTool, refusal: null };
}
