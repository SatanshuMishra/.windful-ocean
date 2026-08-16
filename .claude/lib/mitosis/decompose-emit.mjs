import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { lintCoarseScope } from './coarse-scope-lint.mjs';
import { DECOMPOSE_CHANGE_TYPES, DECOMPOSE_SCHEMA, validateDecomposition } from './decompose-schema.mjs';
import { deriveClusters } from './derive-clusters.mjs';
import { dispatch } from './dispatch.mjs';
import { OWNER_ONLY_MODE, replaceFileAtomically, requireGuardedPath } from './fs-writer.mjs';
import { ISOLATION_MODES } from './prompt-contract.mjs';
import { composePrompt } from './prompt-registry.mjs';
import { requirePromptArgv, requirePromptPath, requirePromptRef, requirePromptSlug } from './prompt-values.mjs';
import { RunDocumentError, buildRunDocument } from './run-document.mjs';
import { createSpecReader, readSpecContentHash } from './spec-hash.mjs';
import { resolveAll } from './superpowers-prompts.mjs';

const MODULE = 'decompose-emit';
const DECOMPOSER_AGENT = 'codebase-analyst';
const DEFAULT_DECOMPOSER_MODEL = 'opus';
const IDENTIFIER_MAX_CHARS = 64;

export const EXIT_CLEAN = 0;
export const EXIT_UNCLASSIFIED = 1;
export const EXIT_USAGE = 2;
export const EXIT_INPUTS = 3;
export const EXIT_DECOMPOSE = 4;
export const EXIT_COMPOSE = 5;
export const EXIT_WRITE = 6;

const AGENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@+/-]*$/;
const POSITIVE_INTEGER_PATTERN = /^[1-9][0-9]{0,8}$/;

function reasonOf(error) {
  return error !== null && error !== undefined && typeof error.message === 'string' && error.message.length > 0
    ? error.message
    : 'unknown failure';
}

function absolutePathValue(raw, flag) {
  requireGuardedPath(MODULE, flag, raw, 'an absolute path');
  return raw;
}

function absolutePromptPathValue(raw, flag) {
  return requirePromptPath(absolutePathValue(raw, flag), flag);
}

function refValue(raw, flag) {
  return requirePromptRef(raw, flag);
}

function identifierValue(raw, flag) {
  const text = requirePromptSlug(raw, flag);
  if (text.length > IDENTIFIER_MAX_CHARS) {
    throw new TypeError(`${flag} must be at most ${IDENTIFIER_MAX_CHARS} characters, received ${text.length}`);
  }
  return text;
}

function patternValue(pattern, shape) {
  return (raw, flag) => {
    if (!pattern.test(raw)) {
      throw new TypeError(`${flag} must be ${shape}, received ${JSON.stringify(raw)}`);
    }
    return raw;
  };
}

function positiveIntegerValue(raw, flag) {
  if (!POSITIVE_INTEGER_PATTERN.test(raw)) {
    throw new TypeError(`${flag} must be a positive integer of at most 9 digits, received ${JSON.stringify(raw)}`);
  }
  return Number(raw);
}

function isolationValue(raw, flag) {
  if (!ISOLATION_MODES.includes(raw)) {
    throw new TypeError(`${flag} must be one of ${ISOLATION_MODES.join(', ')}, received ${JSON.stringify(raw)}`);
  }
  return raw;
}

function argvValue(raw, flag) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new TypeError(`${flag} must be a JSON array of argv strings, and this value is not JSON: ${reasonOf(error)}`);
  }
  return [...requirePromptArgv(parsed, flag)];
}

const FLAG_TABLE = Object.freeze([
  Object.freeze({ flag: '--spec', field: 'spec', required: true, shape: absolutePromptPathValue }),
  Object.freeze({ flag: '--repo-root', field: 'repoRoot', required: true, shape: absolutePromptPathValue }),
  Object.freeze({ flag: '--base-branch', field: 'baseBranch', required: true, shape: refValue }),
  Object.freeze({ flag: '--source-prefix', field: 'sourcePrefix', required: true, shape: refValue }),
  Object.freeze({ flag: '--branch-prefix', field: 'branchPrefix', required: true, shape: refValue }),
  Object.freeze({ flag: '--worktree-root', field: 'worktreeRoot', required: true, shape: absolutePromptPathValue }),
  Object.freeze({ flag: '--scoped-check', field: 'scopedCheckCmd', required: true, shape: argvValue }),
  Object.freeze({ flag: '--isolation', field: 'isolation', required: true, shape: isolationValue }),
  Object.freeze({ flag: '--run-id', field: 'logicalRunId', required: true, shape: identifierValue }),
  Object.freeze({ flag: '--out', field: 'out', required: true, shape: absolutePathValue }),
  Object.freeze({ flag: '--harness-run-id', field: 'harnessRunId', required: false, shape: identifierValue }),
  Object.freeze({ flag: '--decomposer-model', field: 'decomposerModel', required: false, shape: patternValue(TOKEN_PATTERN, 'a model token of letters, digits and . _ : @ + / -') }),
  Object.freeze({ flag: '--decomposer-timeout-ms', field: 'decomposerTimeoutMs', required: false, shape: positiveIntegerValue }),
  Object.freeze({ flag: '--unit-agent-type', field: 'unitAgentType', required: false, shape: patternValue(AGENT_PATTERN, 'an agent name of letters, digits and . _ -') }),
  Object.freeze({ flag: '--unit-model', field: 'unitModel', required: false, shape: patternValue(TOKEN_PATTERN, 'a model token of letters, digits and . _ : @ + / -') }),
  Object.freeze({ flag: '--unit-effort', field: 'unitEffort', required: false, shape: patternValue(TOKEN_PATTERN, 'an effort token of letters, digits and . _ : @ + / -') }),
  Object.freeze({ flag: '--unit-timeout-ms', field: 'unitTimeoutMs', required: false, shape: positiveIntegerValue }),
]);

const FLAG_SPECS = Object.freeze(Object.fromEntries(FLAG_TABLE.map((entry) => [entry.flag, entry])));

const UNIT_DEFAULT_FIELDS = Object.freeze([
  Object.freeze({ field: 'unitAgentType', key: 'agentType' }),
  Object.freeze({ field: 'unitModel', key: 'model' }),
  Object.freeze({ field: 'unitEffort', key: 'effort' }),
  Object.freeze({ field: 'unitTimeoutMs', key: 'timeoutMs' }),
]);

function flagList(required) {
  return FLAG_TABLE.filter((entry) => entry.required === required).map((entry) => entry.flag);
}

export const DECOMPOSE_EMIT_USAGE = [
  `usage: decompose-emit.mjs ${flagList(true).map((flag) => `${flag} <value>`).join(' ')}`,
  `       ${flagList(false).map((flag) => `[${flag} <value>]`).join(' ')}`,
  `exit codes: ${EXIT_CLEAN} the run document was written; ${EXIT_UNCLASSIFIED} an unclassified throw; ${EXIT_USAGE} the arguments were rejected and nothing ran; ${EXIT_INPUTS} an input could not be resolved; ${EXIT_DECOMPOSE} the decompose child returned no conforming decomposition; ${EXIT_COMPOSE} the decomposition composed no run document; ${EXIT_WRITE} the run document could not be written`,
].join('\n');

function usageFailure(error) {
  return Object.freeze({ ok: false, error: `${MODULE}: ${error}` });
}

function shapedValue(spec, raw) {
  try {
    return { ok: true, value: spec.shape(raw, spec.flag) };
  } catch (error) {
    return { ok: false, error: `${spec.flag} was given a malformed value: ${reasonOf(error)}` };
  }
}

export function parseDecomposeArgv(argv) {
  if (!Array.isArray(argv)) return usageFailure('the argument vector must be an array of strings');
  const seen = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (typeof flag !== 'string' || !Object.hasOwn(FLAG_SPECS, flag)) {
      return usageFailure(`${JSON.stringify(flag === undefined ? null : flag)} is not a flag this emitter reads`);
    }
    if (seen.has(flag)) {
      return usageFailure(`${flag} was given twice, and a silently discarded value would emit a run document the caller did not write`);
    }
    index += 1;
    const raw = argv[index];
    if (typeof raw !== 'string' || raw.length === 0 || raw.startsWith('--')) {
      return usageFailure(`${flag} needs one non-empty value that is not itself a flag, received ${JSON.stringify(raw === undefined ? null : raw)}`);
    }
    const shaped = shapedValue(FLAG_SPECS[flag], raw);
    if (!shaped.ok) return usageFailure(shaped.error);
    seen.set(flag, shaped.value);
  }
  const missing = flagList(true).filter((flag) => !seen.has(flag));
  if (missing.length > 0) {
    return usageFailure(`${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} required, and an emitter that guessed one would write a document naming a target nobody chose`);
  }
  const fields = [...seen].map(([flag, value]) => [FLAG_SPECS[flag].field, value]);
  return Object.freeze({ ok: true, value: Object.freeze(Object.fromEntries(fields)) });
}

function failure(exitCode, error) {
  return Object.freeze({ ok: false, exitCode, error: `${MODULE}: ${error}`, outPath: null, document: null });
}

function defaultImplementerPreamble() {
  const resolved = resolveAll();
  const entry = resolved.prompts.implementer;
  const text = entry === undefined || entry === null ? null : entry.text;
  if (typeof text !== 'string' || text.trim() === '') {
    throw new Error('the resolved superpowers prompt set carries no implementer text');
  }
  return text;
}

function resolveInputs(args, deps) {
  const load = deps.loadImplementerPreamble === undefined ? defaultImplementerPreamble : deps.loadImplementerPreamble;
  let implementerPreamble;
  try {
    implementerPreamble = load();
  } catch (error) {
    return failure(EXIT_INPUTS, `the implementer preamble could not be resolved (${reasonOf(error)}); every emitted unit prompt opens with it, so a document composed without it would dispatch children with no working agreement`);
  }
  let hash;
  try {
    hash = readSpecContentHash(args.spec, createSpecReader({ containmentRoot: args.repoRoot }));
  } catch (error) {
    return failure(EXIT_INPUTS, `the spec at ${args.spec} could not be fingerprinted: ${reasonOf(error)}`);
  }
  if (hash.ok !== true) return failure(EXIT_INPUTS, hash.error);
  return Object.freeze({ ok: true, implementerPreamble, specContentHash: hash.specContentHash });
}

function decomposeRequest(args) {
  const prompt = composePrompt('decompose', {
    specPath: args.spec,
    repoRoot: args.repoRoot,
    changeTypes: [...DECOMPOSE_CHANGE_TYPES],
  });
  const request = {
    prompt,
    agentType: DECOMPOSER_AGENT,
    model: args.decomposerModel === undefined ? DEFAULT_DECOMPOSER_MODEL : args.decomposerModel,
    schema: DECOMPOSE_SCHEMA,
  };
  if (args.decomposerTimeoutMs !== undefined) request.timeoutMs = args.decomposerTimeoutMs;
  return request;
}

async function runDecomposer(args, deps) {
  let request;
  try {
    request = decomposeRequest(args);
  } catch (error) {
    return failure(EXIT_INPUTS, `the decompose request could not be composed: ${reasonOf(error)}`);
  }
  const verdict = await dispatch(request, deps.spawn === undefined ? {} : { spawn: deps.spawn });
  if (verdict.ok !== true) {
    return failure(EXIT_DECOMPOSE, `the decompose child returned no usable result (${verdict.outcome}): ${verdict.error}`);
  }
  const validated = validateDecomposition(verdict.structured);
  if (validated.ok !== true) {
    return failure(EXIT_DECOMPOSE, `the decompose child returned a decomposition the schema refuses: ${validated.failures.join('; ')}`);
  }
  return Object.freeze({ ok: true, msps: validated.decomposition.msps });
}

function coarseScopeFlagLine(unitId, flag) {
  const covered = Array.isArray(flag.covered) && flag.covered.length > 0
    ? ` covering ${flag.covered.map((path) => JSON.stringify(path)).join(', ')}`
    : '';
  return `${MODULE}: unit ${JSON.stringify(unitId)} declares the coarse edit scope ${JSON.stringify(flag.scope)} [${flag.reason}]${covered}; narrow it to the files the unit actually writes, or confirm the unit genuinely owns the whole slice. This is a warning and does not halt the run.`;
}

export function coarseScopeWarnings(msps) {
  if (!Array.isArray(msps)) {
    throw new TypeError(`${MODULE}: coarseScopeWarnings expects the validated msp array; a non-array carries no unit to lint and would report a clean sweep it never measured`);
  }
  const lines = [];
  for (const msp of msps) {
    let verdict;
    try {
      verdict = lintCoarseScope(msp);
    } catch (error) {
      lines.push(`${MODULE}: the coarse-scope lint could not classify unit ${JSON.stringify(msp && msp.id ? msp.id : null)}: ${reasonOf(error)}. Its scope is unreviewed rather than clean.`);
      continue;
    }
    const unitId = verdict.id === null ? (msp && msp.id ? msp.id : null) : verdict.id;
    for (const flag of verdict.flags) lines.push(coarseScopeFlagLine(unitId, flag));
  }
  return Object.freeze(lines);
}

function reportCoarseScope(msps, write) {
  let lines;
  try {
    lines = coarseScopeWarnings(msps);
  } catch (error) {
    write(`${MODULE}: the coarse-scope lint did not run: ${reasonOf(error)}\n`);
    return;
  }
  for (const line of lines) write(`${line}\n`);
}

function unitDefaults(args) {
  const defaults = {};
  for (const entry of UNIT_DEFAULT_FIELDS) {
    if (args[entry.field] === undefined) continue;
    defaults[entry.key] = args[entry.field];
  }
  return defaults;
}

function documentInput(args, inputs, msps, clusters) {
  return {
    decomposition: { msps },
    run: {
      logicalRunId: args.logicalRunId,
      harnessRunId: args.harnessRunId === undefined ? null : args.harnessRunId,
      spec: args.spec,
      repoRoot: args.repoRoot,
      baseBranch: args.baseBranch,
      sourcePrefix: args.sourcePrefix,
      clusters,
      specContentHash: inputs.specContentHash,
    },
    prompt: {
      implementerPreamble: inputs.implementerPreamble,
      scopedCheckCmd: args.scopedCheckCmd,
      isolation: args.isolation,
      branchPrefix: args.branchPrefix,
      worktreeRoot: args.worktreeRoot,
    },
    dispatch: unitDefaults(args),
  };
}

function composeDocument(args, inputs, msps) {
  let clusters;
  try {
    clusters = deriveClusters(msps.map((msp) => ({ id: msp.id, dependsOn: msp.dependsOn, fileScope: msp.fileScope })), []).clusters;
  } catch (error) {
    return failure(EXIT_COMPOSE, `the decomposition derives no clusters: ${reasonOf(error)}`);
  }
  try {
    return Object.freeze({ ok: true, document: buildRunDocument(documentInput(args, inputs, msps, clusters)) });
  } catch (error) {
    if (error instanceof RunDocumentError) return failure(EXIT_COMPOSE, error.message);
    return failure(EXIT_COMPOSE, `the run document could not be composed: ${reasonOf(error)}`);
  }
}

export function serializeRunDocument(document) {
  return JSON.stringify(document, null, 2);
}

function writeRunDocument(outPath, document) {
  try {
    replaceFileAtomically(MODULE, outPath, serializeRunDocument(document), OWNER_ONLY_MODE);
  } catch (error) {
    return failure(EXIT_WRITE, `the run document could not be written to ${outPath}: ${reasonOf(error)}`);
  }
  return Object.freeze({ ok: true, exitCode: EXIT_CLEAN, error: null, outPath, document });
}

function warnWriterOf(deps) {
  if (deps.warn === undefined) return (text) => process.stderr.write(text);
  if (typeof deps.warn !== 'function') {
    throw new TypeError(`${MODULE}: deps.warn must be a function that receives one warning line, so a caller cannot silence the coarse-scope lint by passing a value that swallows it`);
  }
  return deps.warn;
}

export async function emitRunDocument(args, deps = {}) {
  const warn = warnWriterOf(deps);
  const inputs = resolveInputs(args, deps);
  if (inputs.ok !== true) return inputs;
  const decomposed = await runDecomposer(args, deps);
  if (decomposed.ok !== true) return decomposed;
  reportCoarseScope(decomposed.msps, warn);
  const composed = composeDocument(args, inputs, decomposed.msps);
  if (composed.ok !== true) return composed;
  return writeRunDocument(args.out, composed.document);
}

function summaryOf(result) {
  return {
    outPath: result.outPath,
    units: result.document.specs.map((unit) => unit.id),
    clusters: result.document.manifest.clusters,
  };
}

async function main() {
  const parsed = parseDecomposeArgv(process.argv.slice(2));
  if (!parsed.ok) {
    process.stderr.write(`${parsed.error}\n${DECOMPOSE_EMIT_USAGE}\n`);
    process.exitCode = EXIT_USAGE;
    return;
  }
  try {
    const result = await emitRunDocument(parsed.value);
    if (result.ok !== true) {
      process.stderr.write(`${result.error}\n`);
      process.exitCode = result.exitCode;
      return;
    }
    process.stdout.write(`${JSON.stringify(summaryOf(result), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${MODULE}: ${reasonOf(error)}\n`);
    process.exitCode = EXIT_UNCLASSIFIED;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) main();
