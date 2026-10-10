import { spawnSync } from 'node:child_process';
import { realpathSync, accessSync, statSync, constants } from 'node:fs';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSpawnAllowed } from './exec-policy.mjs';
import { classifyGhMerge, resolveRealGh, DEFAULT_FALLBACKS, MERGE_DENY_EXIT, REAL_GH_MISSING_EXIT } from './gh-merge-shim.mjs';
import { validateRefToken } from './ref-tokens.mjs';
import { validateRepoIdentity } from './merge-watch.mjs';
import {
  inertValue,
  renderPrCreateBody,
  checkPrFields,
  PR_TITLE_PATTERN,
  PR_TITLE_TYPES,
  PR_VALUE_CAP,
  PR_MULTI_LIMITS,
  PR_RENDER_FLAGS,
  PR_VALUE_REFUSALS,
} from './pr-format.mjs';

export { inertValue, renderPrCreateBody, PR_TITLE_PATTERN, PR_TITLE_TYPES };

export const PR_TOOL_USAGE_EXIT = 2;
export const PR_TOOL_TRIPWIRE_EXIT = MERGE_DENY_EXIT;
export const PR_TOOL_OBSERVE_EXIT = 20;
export const PR_TOOL_CONVERGE_EXIT = 21;
export const PR_TOOL_GH_MISSING_EXIT = REAL_GH_MISSING_EXIT;
export const PR_TOOL_VERBS = Object.freeze(['pr-render', 'pr-close', 'compare']);

const NO_INDIRECT_IO = Object.freeze({ readFile: () => null, readStdin: () => null });
const GH_BINARY = 'gh';
const isRepeatable = (flag) => Object.hasOwn(PR_MULTI_LIMITS, flag);

export const FLAG_SPEC = Object.freeze({
  'pr-render': Object.freeze({
    required: Object.freeze(['--title', '--why', '--what']),
    single: Object.freeze(PR_RENDER_FLAGS.filter((flag) => !isRepeatable(flag))),
    multiple: Object.freeze(PR_RENDER_FLAGS.filter(isRepeatable)),
  }),
  'pr-close': Object.freeze({
    required: Object.freeze(['--repo', '--pr']),
    single: Object.freeze(['--repo', '--pr', '--comment']),
    multiple: Object.freeze([]),
  }),
  compare: Object.freeze({
    required: Object.freeze(['--repo', '--base', '--head']),
    single: Object.freeze(['--repo', '--base', '--head']),
    multiple: Object.freeze([]),
  }),
});

const PR_RENDER_LISTS = Object.freeze([
  Object.freeze(['--why', 'why']),
  Object.freeze(['--what', 'what']),
  Object.freeze(['--verified', 'verified']),
  Object.freeze(['--not-verified', 'notVerified']),
  Object.freeze(['--link', 'links']),
]);

const PR_NUMBER_PATTERN = /^[1-9][0-9]{0,9}$/;

function rejection(error) {
  return Object.freeze({ ok: false, error, verb: null, opts: null });
}

function collectFlags(verb, argv) {
  const spec = FLAG_SPEC[verb];
  const single = new Map();
  const multiple = [];
  for (let i = 1; i < argv.length; i += 1) {
    const token = argv[i];
    if (typeof token !== 'string' || !token.startsWith('--') || token.length === 2 || token.includes('=')) {
      return { error: `pr-tool ${verb}: refusing the argument ${JSON.stringify(token === undefined ? null : token)}; only separated long-form flags from the allowlist are accepted` };
    }
    const known = spec.single.includes(token) || spec.multiple.includes(token);
    if (!known) {
      return { error: `pr-tool ${verb}: unknown flag ${JSON.stringify(token)}; the accepted flags are ${[...spec.single, ...spec.multiple].join(' ')}` };
    }
    const value = argv[i + 1];
    const swallowedFlag = typeof value === 'string' && (spec.single.includes(value) || spec.multiple.includes(value));
    if (typeof value !== 'string' || value.length === 0 || swallowedFlag) {
      return { error: `pr-tool ${verb}: flag ${token} requires one inline value and received ${JSON.stringify(value === undefined ? null : value)}` };
    }
    i += 1;
    if (spec.multiple.includes(token)) {
      multiple.push(Object.freeze({ flag: token, value }));
      continue;
    }
    if (single.has(token)) {
      return { error: `pr-tool ${verb}: flag ${token} was supplied more than once` };
    }
    single.set(token, value);
  }
  for (const flag of spec.required) {
    if (single.has(flag)) continue;
    if (multiple.some((entry) => entry.flag === flag)) continue;
    return { error: `pr-tool ${verb}: missing required flag ${flag}` };
  }
  return { single, multiple };
}

function parsePrRender(single, multiple) {
  const lists = PR_RENDER_LISTS.map(([flag, field]) => [field, multiple.filter((entry) => entry.flag === flag).map((entry) => entry.value)]);
  const checked = checkPrFields({
    title: single.get('--title'),
    ...Object.fromEntries(lists),
    risk: single.has('--risk') ? single.get('--risk') : null,
    supersedes: single.has('--supersedes') ? single.get('--supersedes') : null,
  });
  if (checked.fields === null) return rejection(checked.problems.map((problem) => `pr-tool pr-render: ${problem}`).join('\n'));
  return Object.freeze({ ok: true, error: null, verb: 'pr-render', opts: checked.fields });
}

function parsePrClose(single) {
  const repo = single.get('--repo');
  if (!validateRepoIdentity(repo)) return rejection(`pr-tool pr-close: --repo ${JSON.stringify(repo)} is not an owner/repo slug`);
  const pr = single.get('--pr');
  if (!PR_NUMBER_PATTERN.test(pr)) return rejection(`pr-tool pr-close: --pr ${JSON.stringify(pr)} is not a pull-request number`);
  let comment = null;
  if (single.has('--comment')) {
    comment = inertValue(single.get('--comment'), PR_VALUE_CAP);
    if (comment === null) return rejection(`pr-tool pr-close: a --comment value is empty, over the ${PR_VALUE_CAP}-character cap, or carries ${PR_VALUE_REFUSALS}`);
  }
  return Object.freeze({ ok: true, error: null, verb: 'pr-close', opts: Object.freeze({ repo, pr, comment }) });
}

function parseCompare(single) {
  const repo = single.get('--repo');
  if (!validateRepoIdentity(repo)) return rejection(`pr-tool compare: --repo ${JSON.stringify(repo)} is not an owner/repo slug`);
  const base = single.get('--base');
  if (!validateRefToken(base)) return rejection(`pr-tool compare: --base ${JSON.stringify(base)} is not a conservative git ref token`);
  const head = single.get('--head');
  if (!validateRefToken(head)) return rejection(`pr-tool compare: --head ${JSON.stringify(head)} is not a conservative git ref token`);
  return Object.freeze({ ok: true, error: null, verb: 'compare', opts: Object.freeze({ repo, base, head }) });
}

export function parsePrToolArgv(argv) {
  if (!Array.isArray(argv) || argv.length === 0) {
    return rejection(`pr-tool: expected a verb; the only verbs are ${PR_TOOL_VERBS.join(', ')}`);
  }
  const verb = argv[0];
  if (typeof verb !== 'string' || !PR_TOOL_VERBS.includes(verb)) {
    return rejection(`pr-tool: unknown verb ${JSON.stringify(verb === undefined ? null : verb)}; the only verbs are ${PR_TOOL_VERBS.join(', ')}`);
  }
  const collected = collectFlags(verb, argv);
  if (collected.error) return rejection(collected.error);
  if (verb === 'pr-render') return parsePrRender(collected.single, collected.multiple);
  if (verb === 'pr-close') return parsePrClose(collected.single);
  return parseCompare(collected.single);
}

export function buildGhArgv(verb, stage, opts) {
  if (verb === 'pr-close' && stage === 'observe') {
    return ['pr', 'view', '-R', opts.repo, opts.pr, '--json', 'state,url'];
  }
  if (verb === 'pr-close' && stage === 'converge') {
    const argv = ['pr', 'close', '-R', opts.repo, opts.pr];
    if (opts.comment) {
      argv.push('--comment', opts.comment);
    }
    return argv;
  }
  if (verb === 'compare' && stage === 'read') {
    return ['api', `repos/${opts.repo}/compare/${opts.base}...${opts.head}`];
  }
  throw new Error(`pr-tool: refusing to build a gh argv for the unknown verb/stage pair ${JSON.stringify(verb)}/${JSON.stringify(stage)}`);
}

export function ghExecTripwire(argv, classify) {
  if (!Array.isArray(argv) || argv.length === 0) {
    return Object.freeze({ allow: false, reason: 'pr-tool tripwire: refusing to execute a gh call whose argv is not a non-empty array (fail-closed).' });
  }
  let decision;
  try {
    decision = classify(argv, NO_INDIRECT_IO);
  } catch (err) {
    return Object.freeze({ allow: false, reason: `pr-tool tripwire: the deny classifier threw (${err && err.message}); refusing to execute (fail-closed).` });
  }
  if (decision === null || typeof decision !== 'object' || Array.isArray(decision)) {
    return Object.freeze({ allow: false, reason: 'pr-tool tripwire: the deny classifier returned no usable decision object; refusing to execute (fail-closed).' });
  }
  if (decision.refuse !== false) {
    const carried = typeof decision.reason === 'string' && decision.reason.length > 0 ? decision.reason : null;
    return Object.freeze({
      allow: false,
      reason: carried || 'pr-tool tripwire: the deny classifier returned a decision whose refuse field is not the strict boolean false; refusing to execute (fail-closed).',
    });
  }
  return Object.freeze({ allow: true, reason: '' });
}

function isExecutableFile(path) {
  try {
    if (!statSync(path).isFile()) return false;
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function resolveGhBinary({ pathValue, fallbacks = DEFAULT_FALLBACKS } = {}) {
  return resolveRealGh({
    selfPath: process.argv[1],
    pathValue,
    fallbacks,
    realpath: realpathSync,
    isExecutable: isExecutableFile,
  });
}

export function execGh(ghBin, argv) {
  const gate = ghExecTripwire(argv, classifyGhMerge);
  if (!gate.allow) {
    return Object.freeze({ refused: true, reason: gate.reason, status: null, stdout: '', stderr: '' });
  }
  const result = spawnAllowed(GH_BINARY, argv, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }, ghBin);
  if (result.error) {
    return Object.freeze({ refused: false, reason: '', status: null, stdout: '', stderr: `pr-tool: failed to execute gh (${result.error.message})\n` });
  }
  return Object.freeze({
    refused: false,
    reason: '',
    status: typeof result.status === 'number' ? result.status : null,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  });
}

export function spawnAllowed(binary, argv, options, executable) {
  assertSpawnAllowed(binary, argv, NO_INDIRECT_IO);
  if (typeof executable !== 'string' || !isAbsolute(executable)) {
    throw new Error(`pr-tool: refusing to spawn ${JSON.stringify(binary)} through ${JSON.stringify(executable)}; the resolved executable must be an absolute path so that no PATH lookup decides which file runs`);
  }
  return spawnSync(executable, argv, options);
}

function runPrClose(ghBin, opts, out) {
  const viewed = execGh(ghBin, buildGhArgv('pr-close', 'observe', opts));
  if (viewed.refused) {
    out.err(`${viewed.reason}\n`);
    return PR_TOOL_TRIPWIRE_EXIT;
  }
  if (viewed.status !== 0) {
    out.err(`pr-tool pr-close: the pull-request state probe exited ${viewed.status}; nothing was closed.\n${viewed.stderr}`);
    return PR_TOOL_OBSERVE_EXIT;
  }
  let view;
  try {
    view = JSON.parse(viewed.stdout.trim());
  } catch {
    out.err('pr-tool pr-close: the pull-request state probe printed unparseable JSON; nothing was closed.\n');
    return PR_TOOL_OBSERVE_EXIT;
  }
  if (view === null || typeof view !== 'object' || Array.isArray(view)) {
    out.err('pr-tool pr-close: the pull-request state probe returned no object; nothing was closed.\n');
    return PR_TOOL_OBSERVE_EXIT;
  }
  const state = typeof view.state === 'string' ? view.state : null;
  const url = typeof view.url === 'string' && view.url.length > 0 ? view.url : null;
  if (state === null || url === null) {
    out.err('pr-tool pr-close: the pull-request state probe carried no state or url; nothing was closed.\n');
    return PR_TOOL_OBSERVE_EXIT;
  }
  if (state === 'MERGED') {
    out.log(`${JSON.stringify({ action: 'already-merged', state, url })}\n`);
    return 0;
  }
  if (state === 'CLOSED') {
    out.log(`${JSON.stringify({ action: 'already-closed', state, url })}\n`);
    return 0;
  }
  if (state !== 'OPEN') {
    out.err(`pr-tool pr-close: the pull request reported the unrecognised state ${JSON.stringify(state)}; nothing was closed.\n`);
    return PR_TOOL_OBSERVE_EXIT;
  }
  const closed = execGh(ghBin, buildGhArgv('pr-close', 'converge', opts));
  if (closed.refused) {
    out.err(`${closed.reason}\n`);
    return PR_TOOL_TRIPWIRE_EXIT;
  }
  if (closed.status !== 0) {
    out.err(closed.stderr || `pr-tool pr-close: the close call exited ${closed.status}.\n`);
    return PR_TOOL_CONVERGE_EXIT;
  }
  out.log(`${JSON.stringify({ action: 'closed', state: 'CLOSED', url })}\n`);
  return 0;
}

function compareReadError(out, readError) {
  out.log(`${JSON.stringify({ readError })}\n`);
  return PR_TOOL_OBSERVE_EXIT;
}

function runCompare(ghBin, opts, out) {
  const res = execGh(ghBin, buildGhArgv('compare', 'read', opts));
  if (res.refused) {
    out.err(`${res.reason}\n`);
    return PR_TOOL_TRIPWIRE_EXIT;
  }
  if (res.status !== 0) {
    return compareReadError(out, `the containment read exited ${res.status}: ${res.stderr.trim()}`);
  }
  let body;
  try {
    body = JSON.parse(res.stdout.trim());
  } catch {
    return compareReadError(out, 'the containment read returned an unparseable body');
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return compareReadError(out, 'the containment read returned no object');
  }
  if (!Number.isInteger(body.ahead_by)) {
    return compareReadError(out, 'the containment read carried no integer ahead_by');
  }
  if (typeof body.status !== 'string' || body.status.length === 0) {
    return compareReadError(out, 'the containment read carried no status string');
  }
  out.log(`${JSON.stringify({ ahead_by: body.ahead_by, status: body.status })}\n`);
  return 0;
}

function runPrTool(argv, out) {
  const parsed = parsePrToolArgv(argv);
  if (!parsed.ok) {
    out.err(`${parsed.error}\n`);
    return PR_TOOL_USAGE_EXIT;
  }
  if (parsed.verb === 'pr-render') {
    out.log(`${JSON.stringify({ title: parsed.opts.title, body: renderPrCreateBody(parsed.opts) })}\n`);
    return 0;
  }
  const ghBin = resolveGhBinary({ pathValue: process.env.PATH });
  if (!ghBin) {
    out.err('pr-tool: could not locate a gh binary on PATH or any pinned fallback; nothing was executed.\n');
    return PR_TOOL_GH_MISSING_EXIT;
  }
  if (parsed.verb === 'pr-close') return runPrClose(ghBin, parsed.opts, out);
  return runCompare(ghBin, parsed.opts, out);
}

export function prToolMain() {
  const out = Object.freeze({
    log: (text) => process.stdout.write(text),
    err: (text) => process.stderr.write(text),
  });
  process.exitCode = runPrTool(process.argv.slice(2), out);
}

export function isDirectInvocation() {
  try {
    if (!process.argv[1]) return false;
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isDirectInvocation()) {
  prToolMain();
}
