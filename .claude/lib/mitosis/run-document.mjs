import { requireFileScopePack } from './msp-file-scope.mjs';
import { composePrompt } from './prompt-registry.mjs';
import { buildInitialManifest } from './recovery.mjs';

const MODULE = 'run-document';
const IMPLEMENT_KIND = 'implement';
const WORKTREE_ISOLATION = 'worktree';
const NUL = String.fromCharCode(0);
const NO_DEPENDENCIES = '(none)';
const UNIT_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const REQUEST_OPTIONAL_KEYS = Object.freeze(['agentType', 'model', 'effort', 'schema', 'timeoutMs']);
const RUN_TEXT_KEYS = Object.freeze(['logicalRunId', 'spec', 'repoRoot', 'baseBranch', 'sourcePrefix']);
const PROMPT_TEXT_KEYS = Object.freeze([
  'implementerPreamble',
  'specReviewerPreamble',
  'qualityReviewerPreamble',
  'isolation',
  'branchPrefix',
  'worktreeRoot',
]);

export class RunDocumentError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RunDocumentError';
  }
}

function refuse(message) {
  throw new RunDocumentError(`${MODULE}: ${message}`);
}

function refuseUnit(id, message) {
  throw new RunDocumentError(`${MODULE}: unit ${JSON.stringify(id)} ${message}`);
}

function reasonOf(error) {
  return error !== null && error !== undefined && typeof error.message === 'string' && error.message.length > 0
    ? error.message
    : 'unknown failure';
}

function requireRecord(value, field) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    refuse(`${field} must be a non-null, non-array object, received ${value === null ? 'null' : typeof value}`);
  }
  return value;
}

function requireText(value, field) {
  if (typeof value !== 'string' || value.length === 0) {
    refuse(`${field} must be a non-empty string, received ${JSON.stringify(value)}`);
  }
  return value;
}

function requireRun(value) {
  const run = requireRecord(value, 'run');
  for (const key of RUN_TEXT_KEYS) requireText(run[key], `run.${key}`);
  if (!Array.isArray(run.clusters)) {
    refuse('run.clusters must be an array; parseRunManifest refuses a manifest whose clusters is not an array, and the cluster grouping is a caller input this composer never derives');
  }
  return run;
}

function requirePromptFacts(value) {
  const prompt = requireRecord(value, 'prompt');
  for (const key of PROMPT_TEXT_KEYS) requireText(prompt[key], `prompt.${key}`);
  if (!Array.isArray(prompt.scopedCheckCmd) || prompt.scopedCheckCmd.length === 0) {
    refuse('prompt.scopedCheckCmd must be a non-empty argv array naming the scoped check every implementer runs; an empty one composes a prompt that tells the child to verify with nothing');
  }
  return prompt;
}

function requireDispatchDefaults(value) {
  const defaults = value === undefined ? {} : requireRecord(value, 'dispatch');
  for (const key of Object.keys(defaults)) {
    if (REQUEST_OPTIONAL_KEYS.includes(key)) continue;
    refuse(`dispatch declares ${JSON.stringify(key)}, which is not one of the request fields this composer emits (${REQUEST_OPTIONAL_KEYS.join(', ')}); a silently dropped default would dispatch every unit against a configuration the caller did not write, and the abort signal is injected by the entry point rather than carried in the document`);
  }
  return defaults;
}

function requireComposer(deps) {
  const source = requireRecord(deps, 'deps');
  if (source.composePrompt === undefined) return composePrompt;
  if (typeof source.composePrompt !== 'function') {
    refuse(`deps.composePrompt must be a function this composer calls once per unit, received ${typeof source.composePrompt}`);
  }
  return source.composePrompt;
}

function requireMspList(value) {
  if (!Array.isArray(value) || value.length === 0) {
    refuse(`decomposition.msps must be a non-empty array of MSPs, because parseRunManifest refuses a manifest with no msps and a document naming no unit schedules nothing, received ${Array.isArray(value) ? 'an empty array' : typeof value}`);
  }
  return value;
}

function requireUnitIds(msps) {
  const ids = new Set();
  for (const msp of msps) {
    requireRecord(msp, 'every decomposition.msps entry');
    if (typeof msp.id !== 'string' || !UNIT_ID_PATTERN.test(msp.id)) {
      refuseUnit(msp.id, `declares an id that does not match ${UNIT_ID_PATTERN.source}, the pattern pool.mjs enforces on every graph node so an id can travel into a ref, a path and a record without escaping`);
    }
    if (ids.has(msp.id)) {
      refuseUnit(msp.id, 'is declared twice, and buildUnitTable refuses a duplicate unit id because a prereq naming it would be ambiguous and one of the two would silently never run');
    }
    ids.add(msp.id);
  }
  return ids;
}

function requirePrereqs(msp, ids) {
  const declared = msp.dependsOn === undefined || msp.dependsOn === null ? [] : msp.dependsOn;
  if (!Array.isArray(declared)) {
    refuseUnit(msp.id, `declares dependsOn as ${typeof declared} rather than an array of unit ids, and a dependency the table cannot read is an edge the caller believes it declared and does not have`);
  }
  for (const prereq of declared) {
    if (ids.has(prereq)) continue;
    refuseUnit(msp.id, `names the prereq ${JSON.stringify(prereq)}, which no emitted unit declares, so buildUnitTable would refuse the whole table rather than run the unit unordered`);
  }
  return Object.freeze([...declared]);
}

function requireUnitFileScope(msp) {
  try {
    return requireFileScopePack(msp.fileScope, `unit ${msp.id} fileScope`);
  } catch (error) {
    throw new RunDocumentError(`${MODULE}: unit ${JSON.stringify(msp.id)} declares a fileScope the pack validator refuses: ${reasonOf(error)}`);
  }
}

function requireUnitPrompt(text, id) {
  if (typeof text !== 'string' || text.length === 0) {
    refuseUnit(id, `composed no prompt text (received ${JSON.stringify(text)}); dispatch refuses a request carrying no non-empty prompt, so the unit would settle as a dispatch failure without a child ever having run`);
  }
  if (text.includes(NUL)) {
    refuseUnit(id, 'composed a prompt carrying a NUL byte, which no argv value can carry');
  }
  return text;
}

function composeUnitPrompt(compose, id, input) {
  let text;
  try {
    text = compose(IMPLEMENT_KIND, input);
  } catch (error) {
    throw new RunDocumentError(`${MODULE}: unit ${JSON.stringify(id)} could not be composed into an ${IMPLEMENT_KIND} prompt: ${reasonOf(error)}`);
  }
  return requireUnitPrompt(text, id);
}

function requireSecurityReviewRequired(msp) {
  if (typeof msp.securityReviewRequired !== 'boolean') {
    refuseUnit(msp.id, `declares securityReviewRequired as ${JSON.stringify(msp.securityReviewRequired)} rather than a boolean; the judgment record this composer emits carries that answer to the dispatch that decides whether the security lens runs, and a record that does not say would settle the question by a default nobody wrote — the default that silently skips a security review is the one no reader would find`);
  }
  return msp.securityReviewRequired;
}

function branchFor(msp, prompt) {
  return `${prompt.branchPrefix}/${msp.id}`;
}

function judgmentFor(msp, fileScope, run, prompt) {
  const securityReviewRequired = requireSecurityReviewRequired(msp);
  if (prompt.isolation !== WORKTREE_ISOLATION) return null;
  return Object.freeze({
    securityReviewRequired,
    specReviewerPreamble: prompt.specReviewerPreamble,
    qualityReviewerPreamble: prompt.qualityReviewerPreamble,
    repoRoot: run.repoRoot,
    baseBranch: run.baseBranch,
    branch: branchFor(msp, prompt),
    taskId: msp.id,
    taskTitle: msp.title,
    taskFullText: msp.rationale,
    isolation: prompt.isolation,
    fileScope,
  });
}

function dependsListFor(prereqs) {
  return prereqs.length === 0 ? NO_DEPENDENCIES : prereqs.join(', ');
}

function prepFor(msp, prereqs, fileScope, run) {
  return Object.freeze({
    title: msp.title,
    rationale: msp.rationale,
    dependsList: dependsListFor(prereqs),
    specPath: run.spec,
    fileScope,
  });
}

function promptInputFor(msp, fileScope, run, prompt) {
  return {
    implementerPreamble: prompt.implementerPreamble,
    repoRoot: run.repoRoot,
    branch: branchFor(msp, prompt),
    worktree: `${prompt.worktreeRoot}/${msp.id}`,
    baseBranch: run.baseBranch,
    scopedCheckCmd: prompt.scopedCheckCmd,
    taskTitle: msp.title,
    taskFullText: msp.rationale,
    priorIssues: null,
    isolation: prompt.isolation,
    fileScope,
  };
}

function buildRequest(promptText, defaults) {
  const request = { prompt: promptText };
  for (const key of REQUEST_OPTIONAL_KEYS) {
    if (defaults[key] === undefined) continue;
    request[key] = defaults[key];
  }
  return Object.freeze(request);
}

function buildUnitSpec({ msp, prereqs, fileScope, run, prompt, defaults, compose }) {
  const promptText = composeUnitPrompt(compose, msp.id, promptInputFor(msp, fileScope, run, prompt));
  const judgment = judgmentFor(msp, fileScope, run, prompt);
  return Object.freeze({
    id: msp.id,
    prereqs,
    fileScope,
    task: msp.rationale,
    isolation: prompt.isolation,
    prep: prepFor(msp, prereqs, fileScope, run),
    ...(judgment === null ? {} : { judgment }),
    request: buildRequest(promptText, defaults),
  });
}

function buildManifest(run, msps) {
  return {
    ...buildInitialManifest({
      logicalRunId: run.logicalRunId,
      harnessRunId: run.harnessRunId,
      spec: run.spec,
      repoRoot: run.repoRoot,
      baseBranch: run.baseBranch,
      sourcePrefix: run.sourcePrefix,
      clusters: run.clusters,
      msps,
      specContentHash: run.specContentHash,
    }),
    parked: [],
  };
}

export function buildRunDocument(input, deps = {}) {
  const source = requireRecord(input, 'the run document input');
  const decomposition = requireRecord(source.decomposition, 'decomposition');
  const run = requireRun(source.run);
  const prompt = requirePromptFacts(source.prompt);
  const defaults = requireDispatchDefaults(source.dispatch);
  const compose = requireComposer(deps);
  const msps = requireMspList(decomposition.msps);
  const ids = requireUnitIds(msps);
  const prereqs = new Map(msps.map((msp) => [msp.id, requirePrereqs(msp, ids)]));
  const scopes = new Map(msps.map((msp) => [msp.id, requireUnitFileScope(msp)]));
  const specs = msps.map((msp) => buildUnitSpec({
    msp,
    prereqs: prereqs.get(msp.id),
    fileScope: scopes.get(msp.id),
    run,
    prompt,
    defaults,
    compose,
  }));
  const normalized = msps.map((msp) => ({ ...msp, dependsOn: prereqs.get(msp.id), fileScope: scopes.get(msp.id) }));
  return Object.freeze({ specs: Object.freeze(specs), manifest: buildManifest(run, normalized) });
}
