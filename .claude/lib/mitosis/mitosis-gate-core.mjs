import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractAssignedPhases,
  extractAuthorityTitles,
  extractCalledPhases,
  extractDeclaredPhases,
  extractPhaseSurfaces,
} from './phase-scan.mjs';
import { censusEnginePhaseUse } from './phase-use-census.mjs';
import { censusEngineDeterminism, engineSourceRoots, realSourceIo } from './determinism-lint.mjs';
import { EXEC_ALLOWLIST, assertSpawnAllowed, resolveSpawn } from './exec-policy.mjs';
import { MERGE_REFUSAL_SPECIMENS } from './gh-merge-shim.mjs';
import { REQUIRED_TOOL, agentDefinitionDir, censusAgentSchemaCapability } from './agent-schema-lint.mjs';
import { CENSUS_NOT_ATTESTED, censusNameIntegrity, censusScope, realCensusIo } from './name-integrity-census.mjs';
import { censusRetirement, realRetirementIo, retirementScope } from './retirement-census.mjs';
import { PHASE_TITLES } from './phases.mjs';

export const GATE_CLEAN_EXIT = 0;
export const GATE_USAGE_EXIT = 40;
export const GATE_VIOLATION_EXIT = 41;
export const GATE_UNRESOLVABLE_EXIT = 42;
export const GATE_READ_EXIT = 43;
export const GATE_COMPILE_EXIT = 44;

export const MITOSIS_GATE_VERBS = Object.freeze(['determinism', 'dispatchable-agent-schema-capable', 'exec-allowlist', 'name-integrity', 'phase-parity', 'retirement-census']);

export const DEFAULT_PHASE_PARITY_TARGET = fileURLToPath(new URL('./phases.mjs', import.meta.url));
export const DEFAULT_DETERMINISM_TARGET = fileURLToPath(new URL('./', import.meta.url));
const PHASE_USE_ROOTS = Object.freeze([Object.freeze({ kind: 'directory', path: DEFAULT_DETERMINISM_TARGET })]);
const AGENT_TREE_DEFAULT = agentDefinitionDir();
export const DEFAULT_AGENT_TREE_TARGET = AGENT_TREE_DEFAULT.ok ? AGENT_TREE_DEFAULT.dir : null;

const SPAWNABLE_BINARIES = Object.freeze(['claude', 'gh', 'git', 'graphify', 'node']);
const UNLISTED_PROBE_BINARY = 'bash';
const ROUTED_PROBE_ARGV = Object.freeze(['pr', 'view', '7']);
const SHIM_BASENAME = 'gh-merge-shim.mjs';
const REFUSAL_KIND_RE = /\[([a-z-]+)\]/;

const EXEC_ALLOWLIST_ATTESTS = Object.freeze([
  'the spawn allowlist is exactly the five binaries the guarantee names',
  'an unlisted binary throws instead of spawning, so the policy is deny-by-default rather than deny-a-blocklist',
  'every merge argv the guarantee names is refused in-process by its own refusal reason before any child starts, whether an indirect GraphQL body is read and classified as graphql-mutation-indirect or is unreadable and refused fail-closed as graphql-fail-closed',
  'an ordinary gh argv resolves through the merge shim rather than straight to the real gh binary',
]);

const EXEC_ALLOWLIST_NOT_ATTESTED = Object.freeze([
  'that engine source reaches processes only through this policy: the caller-facing spawn sites assert it before any child starts and the merge shim re-reads the argv with filesystem access, but no verb of this gate censuses those call sites',
  'argv-level containment for claude, git, node and graphify: an allowlisted binary still reaches arbitrary work through its own argv, which no layer inspects',
  'that a gh alias defined before the run is refused: the classifier reads alias definitions, not the alias table already in effect',
]);

const TARGETLESS_VERB_REASONS = Object.freeze({
  'exec-allowlist': 'it probes the spawn policy module it imports and opens no path of its own',
  'name-integrity': 'it censuses the canonical configuration trees and opens no path of its own',
  'retirement-census': 'it censuses the canonical configuration trees and opens no path of its own',
});

const TARGETLESS_VERBS = Object.freeze(new Set(Object.keys(TARGETLESS_VERB_REASONS)));

const VERB_DEFAULT_TARGETS = Object.freeze({
  determinism: DEFAULT_DETERMINISM_TARGET,
  'dispatchable-agent-schema-capable': DEFAULT_AGENT_TREE_TARGET,
  'exec-allowlist': null,
  'name-integrity': null,
  'phase-parity': DEFAULT_PHASE_PARITY_TARGET,
  'retirement-census': null,
});

const PHASE_AUTHORITY_BY_TARGET = Object.freeze({ [DEFAULT_PHASE_PARITY_TARGET]: PHASE_TITLES });
const PHASE_AUTHORITY_TARGETS = Object.freeze(Object.keys(PHASE_AUTHORITY_BY_TARGET));

const PHASE_AUTHORITY_KEY = 'the phase authority';
const PHASE_PARITY_CALLER = 'checkPhaseParity';
const PHASE_USE_CALLER = 'checkPhaseUse';
const PHASE_AUTHORITY_CALLER = 'checkPhaseAuthority';

export { extractAssignedPhases, extractAuthorityTitles, extractCalledPhases, extractDeclaredPhases, extractPhaseSurfaces };

function requireTitleArray(value, key, caller) {
  if (!Array.isArray(value)) throw new TypeError(`${caller} expects ${key} to be an array of phase titles`);
  if (value.length === 0) throw new TypeError(`${caller} expects ${key} to carry at least one phase title`);
  for (const title of value) {
    if (typeof title !== 'string' || title.trim().length === 0) {
      throw new TypeError(`${caller} expects every ${key} entry to be a non-empty string`);
    }
  }
  return value;
}

function requireTitleList(surfaces, key) {
  if (surfaces === null || typeof surfaces !== 'object' || Array.isArray(surfaces)) {
    throw new TypeError(`${PHASE_PARITY_CALLER} expects an object carrying declared, called and assigned`);
  }
  return requireTitleArray(surfaces[key], key, PHASE_PARITY_CALLER);
}

function requireTitleSet(value, key, caller) {
  const named = new Set();
  for (const title of requireTitleArray(value, key, caller)) {
    if (named.has(title)) {
      throw new TypeError(`${caller} expects ${key} to name every phase title once, and ${JSON.stringify(title)} is named twice; a title list this census cannot read as a set is unclassifiable, so it halts rather than letting the duplicate take part in the comparison`);
    }
    named.add(title);
  }
  return named;
}

export function checkPhaseParity(surfaces) {
  const declaredSet = requireTitleSet(requireTitleList(surfaces, 'declared'), 'declared', PHASE_PARITY_CALLER);
  const called = requireTitleList(surfaces, 'called');
  const assigned = requireTitleList(surfaces, 'assigned');
  const calledSet = new Set(called);
  const usedSet = new Set([...called, ...assigned]);
  const declaredNeverCalled = [...declaredSet].filter((title) => !calledSet.has(title)).sort();
  const usedNeverDeclared = [...usedSet].filter((title) => !declaredSet.has(title)).sort();
  return Object.freeze({
    ok: declaredNeverCalled.length === 0 && usedNeverDeclared.length === 0,
    declaredNeverCalled: Object.freeze(declaredNeverCalled),
    usedNeverDeclared: Object.freeze(usedNeverDeclared),
    declared: Object.freeze([...declaredSet].sort()),
    called: Object.freeze([...calledSet].sort()),
    assigned: Object.freeze([...new Set(assigned)].sort()),
  });
}

export function checkPhaseUse(census, declared) {
  if (census === null || typeof census !== 'object' || !Array.isArray(census.called) || !Array.isArray(census.assigned)) {
    throw new TypeError(`${PHASE_USE_CALLER} expects a census carrying called and assigned title arrays; a malformed census carries no use surface and would report parity it never measured`);
  }
  const declaredSet = requireTitleSet(declared, 'declared', PHASE_USE_CALLER);
  const used = [...census.called, ...census.assigned];
  for (const title of used) {
    if (typeof title !== 'string' || title.trim().length === 0) {
      throw new TypeError(`${PHASE_USE_CALLER} expects every censused phase title to be a non-empty string, and one entry is ${JSON.stringify(title)}`);
    }
  }
  const usedSet = new Set(used);
  const usedNeverDeclared = [...usedSet].filter((title) => !declaredSet.has(title)).sort();
  return Object.freeze({
    ok: usedNeverDeclared.length === 0,
    usedNeverDeclared: Object.freeze(usedNeverDeclared),
    declared: Object.freeze([...declaredSet].sort()),
    used: Object.freeze([...usedSet].sort()),
    declaredNeverUsed: Object.freeze([...declaredSet].filter((title) => !usedSet.has(title)).sort()),
  });
}

export function checkPhaseAuthority(declared, authority) {
  const declaredSet = requireTitleSet(declared, 'declared', PHASE_AUTHORITY_CALLER);
  const authoritySet = requireTitleSet(authority, PHASE_AUTHORITY_KEY, PHASE_AUTHORITY_CALLER);
  const declaredNotInAuthority = [...declaredSet].filter((title) => !authoritySet.has(title)).sort();
  const authorityNotDeclared = [...authoritySet].filter((title) => !declaredSet.has(title)).sort();
  return Object.freeze({
    ok: declaredNotInAuthority.length === 0 && authorityNotDeclared.length === 0,
    declaredNotInAuthority: Object.freeze(declaredNotInAuthority),
    authorityNotDeclared: Object.freeze(authorityNotDeclared),
  });
}

export function parseMitosisGateArgv(argv) {
  if (!Array.isArray(argv)) return { ok: false, error: 'mitosis-gate: no argument vector was supplied' };
  const [verb, ...rest] = argv;
  if (verb === undefined) {
    return { ok: false, error: `mitosis-gate: expected a verb; the only verbs are ${MITOSIS_GATE_VERBS.join(', ')}` };
  }
  if (typeof verb !== 'string' || !MITOSIS_GATE_VERBS.includes(verb)) {
    return { ok: false, error: `mitosis-gate: unknown verb ${JSON.stringify(verb)}; the only verbs are ${MITOSIS_GATE_VERBS.join(', ')}` };
  }
  let target = null;
  for (let k = 0; k < rest.length; k += 1) {
    if (rest[k] !== '--target') {
      return { ok: false, error: `mitosis-gate: unknown flag ${JSON.stringify(rest[k])}; the only flag is --target` };
    }
    if (TARGETLESS_VERBS.has(verb)) {
      return { ok: false, error: `mitosis-gate: the ${verb} verb takes no --target; ${TARGETLESS_VERB_REASONS[verb]}` };
    }
    if (target !== null) {
      return { ok: false, error: 'mitosis-gate: --target was supplied more than once; pass it exactly once' };
    }
    const value = rest[k + 1];
    if (typeof value !== 'string' || value.length === 0 || value.startsWith('-')) {
      return { ok: false, error: 'mitosis-gate: --target requires a non-empty path that is not another flag' };
    }
    target = value;
    k += 1;
  }
  return { ok: true, verb, target: target === null ? VERB_DEFAULT_TARGETS[verb] : target };
}

function phaseAuthorityFor(target) {
  const resolved = resolve(target);
  return Object.hasOwn(PHASE_AUTHORITY_BY_TARGET, resolved) ? PHASE_AUTHORITY_BY_TARGET[resolved] : null;
}

function runPhaseParityGate(target, out, readSource) {
  const authority = phaseAuthorityFor(target);
  if (authority === null) {
    out.err(`mitosis-gate: phase-parity holds no phase authority for ${target}; the phase model is owned per target and the mapped target(s) are ${PHASE_AUTHORITY_TARGETS.join(', ')}, so an unmapped target halts rather than being judged against a model it never owned\n`);
    return GATE_UNRESOLVABLE_EXIT;
  }
  let source;
  try {
    source = readSource(target);
  } catch (err) {
    out.err(`mitosis-gate: could not read ${target}: ${err && err.message ? err.message : 'unknown read failure'}\n`);
    return GATE_READ_EXIT;
  }
  if (typeof source !== 'string' || source.length === 0) {
    out.err(`mitosis-gate: ${target} carried no readable source\n`);
    return GATE_READ_EXIT;
  }
  const declared = extractAuthorityTitles(source);
  if (!declared.ok) {
    out.err(`mitosis-gate: phase-parity halted on ${target}: ${declared.error}\n`);
    return GATE_UNRESOLVABLE_EXIT;
  }
  const census = censusEnginePhaseUse(PHASE_USE_ROOTS, { ...realSourceIo, readSource });
  if (!census.ok) {
    out.err(`mitosis-gate: phase-parity ${census.kind === 'read' ? 'could not read' : 'halted on'} its engine source: ${census.error}\n`);
    return census.kind === 'read' ? GATE_READ_EXIT : GATE_UNRESOLVABLE_EXIT;
  }
  let verdict;
  let agreement;
  try {
    verdict = checkPhaseUse(census, declared.phases);
    agreement = checkPhaseAuthority(declared.phases, authority);
  } catch (err) {
    out.err(`mitosis-gate: phase-parity could not evaluate ${target}: ${err && err.message ? err.message : 'unknown failure'}\n`);
    return GATE_UNRESOLVABLE_EXIT;
  }
  if (verdict.used.length === 0) {
    out.err(`mitosis-gate: phase-parity found no phase surface at all across ${census.files.length} engine source file(s); a parity verdict over an empty use set reports agreement it never measured, so it halts\n`);
    return GATE_UNRESOLVABLE_EXIT;
  }
  if (!verdict.ok || !agreement.ok) {
    if (verdict.usedNeverDeclared.length > 0) {
      out.err(`mitosis-gate: engine source enters phases ${target} never declares: ${verdict.usedNeverDeclared.join(', ')}\n`);
    }
    if (agreement.declaredNotInAuthority.length > 0) {
      out.err(`mitosis-gate: ${target} declares phases the phase authority does not name: ${agreement.declaredNotInAuthority.join(', ')}\n`);
    }
    if (agreement.authorityNotDeclared.length > 0) {
      out.err(`mitosis-gate: the phase authority names phases ${target} never declares: ${agreement.authorityNotDeclared.join(', ')}\n`);
    }
    return GATE_VIOLATION_EXIT;
  }
  out.log(`${JSON.stringify({
    verb: 'phase-parity',
    target,
    ok: true,
    phases: verdict.declared,
    used: verdict.used,
    declaredNeverEntered: verdict.declaredNeverUsed,
    counts: { files: census.files.length, called: census.called.length, assigned: census.assigned.length },
  })}\n`);
  return GATE_CLEAN_EXIT;
}

function runDeterminismGate(target, out, readSource) {
  const roots = [{ kind: 'directory', path: target }];
  const result = censusEngineDeterminism(roots, { ...realSourceIo, readSource });
  if (!result.ok) {
    out.err(`mitosis-gate: determinism ${result.kind === 'read' ? 'could not read' : 'halted on'} its engine source: ${result.error}\n`);
    return result.kind === 'read' ? GATE_READ_EXIT : GATE_UNRESOLVABLE_EXIT;
  }
  if (result.violations.length > 0) {
    for (const violation of result.violations) {
      out.err(`mitosis-gate: ${violation.path}:${violation.line} reads ${violation.identifier} as a ${violation.surface}; engine source takes entropy through args only\n`);
    }
    return GATE_VIOLATION_EXIT;
  }
  out.log(`${JSON.stringify({ verb: 'determinism', target, ok: true, fileCount: result.files.length })}\n`);
  return GATE_CLEAN_EXIT;
}

function refusesToSpawn(binary, argv) {
  try {
    assertSpawnAllowed(binary, argv);
  } catch {
    return true;
  }
  return false;
}

function refusalKind(binary, argv, io) {
  try {
    assertSpawnAllowed(binary, argv, io);
  } catch (error) {
    const message = error && error.message ? error.message : 'unknown failure';
    const matched = REFUSAL_KIND_RE.exec(message);
    return matched === null ? `untagged refusal (${message})` : matched[1];
  }
  return null;
}

export function execAllowlistFailures(policy) {
  const failures = [];
  const allowlist = policy.allowlist;
  if (!Array.isArray(allowlist) || allowlist.some((entry) => typeof entry !== 'string')) {
    failures.push(`the spawn allowlist is ${JSON.stringify(allowlist) ?? String(allowlist)}, which is not a readable list of binary names; the guarantee names exactly ${JSON.stringify([...SPAWNABLE_BINARIES])}`);
  } else if (JSON.stringify([...allowlist]) !== JSON.stringify([...SPAWNABLE_BINARIES])) {
    failures.push(`the spawn allowlist is ${JSON.stringify([...allowlist])} but the guarantee names exactly ${JSON.stringify([...SPAWNABLE_BINARIES])}; widening it takes two deliberate edits, never one`);
  }
  if (!policy.refusesUnlisted) {
    failures.push(`${JSON.stringify(UNLISTED_PROBE_BINARY)} is not on the allowlist yet the policy let it through; the policy is deny-by-default and an unlisted binary must throw`);
  }
  const refusals = policy.refusals !== null && typeof policy.refusals === 'object' ? policy.refusals : {};
  for (const probe of MERGE_REFUSAL_SPECIMENS) {
    const observed = refusals[probe.label];
    if (observed === probe.kind) continue;
    if (observed === null || observed === undefined) {
      failures.push(`the pre-spawn merge refusal is gone: 'gh ${probe.label}' was accepted instead of being refused in-process as ${probe.kind} before any child started`);
      continue;
    }
    failures.push(`'gh ${probe.label}' is refused as ${JSON.stringify(observed)} rather than ${JSON.stringify(probe.kind)}; the reason is the guarantee, and a refusal that lands by accident does not prove the merge classification survives`);
  }
  if (!policy.routesThroughShim) {
    failures.push(`an ordinary gh argv no longer resolves through ${SHIM_BASENAME}, so the shim's own refusals would be bypassed at run time`);
  }
  return failures;
}

export function probeExecPolicy() {
  let routed = null;
  try {
    routed = resolveSpawn('gh', [...ROUTED_PROBE_ARGV]);
  } catch {
    routed = null;
  }
  const refusals = {};
  for (const probe of MERGE_REFUSAL_SPECIMENS) {
    refusals[probe.label] = refusalKind('gh', [...probe.argv], probe.io);
  }
  return {
    allowlist: EXEC_ALLOWLIST,
    refusesUnlisted: refusesToSpawn(UNLISTED_PROBE_BINARY, []),
    refusals,
    routesThroughShim: routed !== null
      && EXEC_ALLOWLIST.includes(routed.command)
      && typeof routed.args[0] === 'string'
      && routed.args[0].endsWith(SHIM_BASENAME),
  };
}

function runExecAllowlistGate(_target, out) {
  let policy;
  let failures;
  try {
    policy = probeExecPolicy();
    failures = execAllowlistFailures(policy);
  } catch (err) {
    out.err(`mitosis-gate: exec-allowlist could not probe the spawn policy: ${err && err.message ? err.message : 'unknown failure'}\n`);
    return GATE_UNRESOLVABLE_EXIT;
  }
  if (failures.length > 0) {
    for (const failure of failures) out.err(`mitosis-gate: ${failure}\n`);
    return GATE_VIOLATION_EXIT;
  }
  out.log(`${JSON.stringify({
    verb: 'exec-allowlist',
    ok: true,
    allowlist: [...policy.allowlist],
    refusals: policy.refusals,
    attests: [...EXEC_ALLOWLIST_ATTESTS],
    notAttested: [...EXEC_ALLOWLIST_NOT_ATTESTED],
  })}\n`);
  return GATE_CLEAN_EXIT;
}

function runAgentSchemaGate(target, out, readSource) {
  if (target === null) {
    out.err(`mitosis-gate: dispatchable-agent-schema-capable holds no agent tree to census: ${AGENT_TREE_DEFAULT.error}\n`);
    return GATE_UNRESOLVABLE_EXIT;
  }
  const roots = engineSourceRoots();
  if (!roots.ok) {
    out.err(`mitosis-gate: dispatchable-agent-schema-capable holds no engine source to census: ${roots.error}\n`);
    return GATE_UNRESOLVABLE_EXIT;
  }
  const result = censusAgentSchemaCapability(roots.roots, target, { ...realSourceIo, readSource });
  if (!result.ok) {
    out.err(`mitosis-gate: dispatchable-agent-schema-capable ${result.kind === 'read' ? 'could not read' : 'halted on'} its census: ${result.error}\n`);
    return result.kind === 'read' ? GATE_READ_EXIT : GATE_UNRESOLVABLE_EXIT;
  }
  if (result.violations.length > 0) {
    for (const violation of result.violations) {
      out.err(`mitosis-gate: ${violation.path} is dispatched by engine source but omits ${REQUIRED_TOOL} from its tools: line, so a schema request to it degrades to prose without failing\n`);
    }
    return GATE_VIOLATION_EXIT;
  }
  out.log(`${JSON.stringify({ verb: 'dispatchable-agent-schema-capable', target, ok: true, dispatchable: [...result.dispatchable], definitionCount: result.definitionCount })}\n`);
  return GATE_CLEAN_EXIT;
}

function runNameIntegrityGate(_target, out, readSource) {
  const scope = censusScope();
  if (!scope.ok) {
    out.err(`mitosis-gate: name-integrity holds no configuration tree to census: ${scope.error}\n`);
    return GATE_UNRESOLVABLE_EXIT;
  }
  const result = censusNameIntegrity(scope.dirs, { ...realCensusIo, readSource });
  if (!result.ok && result.kind !== undefined) {
    out.err(`mitosis-gate: name-integrity ${result.kind === 'read' ? 'could not read' : 'halted on'} its census: ${result.error}\n`);
    return result.kind === 'read' ? GATE_READ_EXIT : GATE_UNRESOLVABLE_EXIT;
  }
  if (result.dangling.length > 0) {
    for (const violation of result.dangling) {
      out.err(`mitosis-gate: ${violation.path}:${violation.line} names ${violation.role} ${JSON.stringify(violation.token)} as a dispatch target but ${violation.reason}\n`);
    }
    return GATE_VIOLATION_EXIT;
  }
  out.log(`${JSON.stringify({
    verb: 'name-integrity',
    ok: true,
    counts: {
      files: result.fileCount,
      unreadFiles: result.unreadCount,
      resolved: result.resolved.length,
      foreign: result.foreign.length,
      dynamic: result.dynamic.length,
      pluginManifestAbsent: result.pluginManifestAbsent.length,
      agents: result.agentCount,
      skills: result.skillCount,
    },
    perTree: result.perTree,
    foreign: result.foreign.map((entry) => `${entry.path}:${entry.line} ${entry.token}`),
    dynamic: result.dynamic.map((entry) => `${entry.path}:${entry.line} ${entry.declarator}`),
    notAttested: [...CENSUS_NOT_ATTESTED],
  })}\n`);
  return GATE_CLEAN_EXIT;
}

function retirementReport(result) {
  return `${JSON.stringify({
    verb: 'retirement-census',
    ok: result.ok,
    perName: result.perName,
    sites: result.sites.map((site) => `${site.path}:${site.line} ${site.name} | ${site.text}`),
    counts: {
      files: result.fileCount,
      unreadFiles: result.unreadCount,
      excludedDirectories: result.excludedDirectories.length,
      sites: result.sites.length,
      retiring: result.names.length,
    },
    perTree: result.perTree,
    derivation: result.derivation,
    excludedDirectoryNames: result.excludedDirectoryNames,
    excludedDirectories: result.excludedDirectories,
    notAttested: result.notAttested,
  })}\n`;
}

export function runRetirementCensusGate(_target, out, readSource, resolveScope = retirementScope, io = null) {
  const scope = resolveScope();
  if (!scope.ok) {
    out.err(`mitosis-gate: retirement-census holds no configuration tree to census: ${scope.error}\n`);
    return scope.kind === 'read' ? GATE_READ_EXIT : GATE_UNRESOLVABLE_EXIT;
  }
  const result = censusRetirement(scope.scope, io === null ? { ...realRetirementIo, readSource } : io);
  if (!result.ok && result.kind !== undefined) {
    out.err(`mitosis-gate: retirement-census ${result.kind === 'read' ? 'could not read' : 'halted on'} its census: ${result.error}\n`);
    return result.kind === 'read' ? GATE_READ_EXIT : GATE_UNRESOLVABLE_EXIT;
  }
  out.log(retirementReport(result));
  if (result.sites.length === 0) return GATE_CLEAN_EXIT;
  for (const site of result.sites) {
    out.err(`mitosis-gate: ${site.path}:${site.line} still names retiring agent ${JSON.stringify(site.name)}: ${site.text}\n`);
  }
  return GATE_VIOLATION_EXIT;
}

const VERB_RUNNERS = Object.freeze({
  determinism: runDeterminismGate,
  'dispatchable-agent-schema-capable': runAgentSchemaGate,
  'exec-allowlist': runExecAllowlistGate,
  'name-integrity': runNameIntegrityGate,
  'phase-parity': runPhaseParityGate,
  'retirement-census': runRetirementCensusGate,
});

export function runMitosisGate(argv, out, readSource) {
  const parsed = parseMitosisGateArgv(argv);
  if (!parsed.ok) {
    out.err(`${parsed.error}\n`);
    return GATE_USAGE_EXIT;
  }
  return VERB_RUNNERS[parsed.verb](parsed.target, out, readSource);
}
