import { spawnSync } from 'node:child_process';
import { realpathSync, accessSync, statSync, constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { classifyGhMerge, resolveRealGh, DEFAULT_FALLBACKS, MERGE_DENY_EXIT, REAL_GH_MISSING_EXIT } from './gh-merge-shim.mjs';
import { validateRefToken } from './checkpoint.mjs';
import { validateRepoIdentity, parsePrRef } from './merge-watch.mjs';

export const MITOSIS_GIT_USAGE_EXIT = 2;
export const MITOSIS_GIT_TRIPWIRE_EXIT = MERGE_DENY_EXIT;
export const MITOSIS_GIT_OBSERVE_EXIT = 20;
export const MITOSIS_GIT_CONVERGE_EXIT = 21;
export const MITOSIS_GIT_GH_MISSING_EXIT = REAL_GH_MISSING_EXIT;
export const MITOSIS_GIT_VERBS = Object.freeze(['pr-create', 'pr-close', 'compare']);

const NO_INDIRECT_IO = Object.freeze({ readFile: () => null, readStdin: () => null });

const FLAG_SPEC = Object.freeze({
  'pr-create': Object.freeze({
    required: Object.freeze(['--repo', '--head', '--base', '--title']),
    single: Object.freeze(['--repo', '--head', '--base', '--title', '--supersedes', '--depends']),
    multiple: Object.freeze(['--body-line']),
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

const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;
const TITLE_CAP = 256;
const LINE_CAP = 512;
const PR_NUMBER_PATTERN = /^[1-9][0-9]{0,9}$/;
const DEPENDS_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const DEPENDS_CAP = 64;
const BODY_TRAILER = 'Opened by the mitosis engine. HUMAN-GATED: a human reviews and lands this pull request.';

function rejection(error) {
  return Object.freeze({ ok: false, error, verb: null, opts: null });
}

function inertText(value, cap) {
  if (typeof value !== 'string') return null;
  const stripped = value.replace(CONTROL_CHARS, '').trim();
  if (stripped.length === 0) return null;
  if (stripped.length > cap) return null;
  if (stripped.startsWith('@')) return null;
  return stripped;
}

function parseDependsList(value) {
  const parts = String(value).split(',').map((part) => part.trim());
  if (parts.length === 0 || parts.length > DEPENDS_CAP) return null;
  if (!parts.every((part) => DEPENDS_ID_PATTERN.test(part))) return null;
  return parts;
}

function collectFlags(verb, argv) {
  const spec = FLAG_SPEC[verb];
  const single = new Map();
  const multiple = [];
  for (let i = 1; i < argv.length; i += 1) {
    const token = argv[i];
    if (typeof token !== 'string' || !token.startsWith('--') || token.length === 2 || token.includes('=')) {
      return { error: `mitosis-git ${verb}: refusing the argument ${JSON.stringify(token === undefined ? null : token)}; only separated long-form flags from the allowlist are accepted` };
    }
    const known = spec.single.includes(token) || spec.multiple.includes(token);
    if (!known) {
      return { error: `mitosis-git ${verb}: unknown flag ${JSON.stringify(token)}; the accepted flags are ${[...spec.single, ...spec.multiple].join(' ')}` };
    }
    const value = argv[i + 1];
    if (typeof value !== 'string' || value.length === 0 || value.startsWith('-')) {
      return { error: `mitosis-git ${verb}: flag ${token} requires one inline value and received ${JSON.stringify(value === undefined ? null : value)}` };
    }
    i += 1;
    if (spec.multiple.includes(token)) {
      multiple.push(value);
      continue;
    }
    if (single.has(token)) {
      return { error: `mitosis-git ${verb}: flag ${token} was supplied more than once` };
    }
    single.set(token, value);
  }
  for (const flag of spec.required) {
    if (!single.has(flag)) {
      return { error: `mitosis-git ${verb}: missing required flag ${flag}` };
    }
  }
  return { single, multiple };
}

function parsePrCreate(single, multiple) {
  const repo = single.get('--repo');
  if (!validateRepoIdentity(repo)) return rejection(`mitosis-git pr-create: --repo ${JSON.stringify(repo)} is not an owner/repo slug`);
  const head = single.get('--head');
  if (!validateRefToken(head)) return rejection(`mitosis-git pr-create: --head ${JSON.stringify(head)} is not a conservative git ref token`);
  const base = single.get('--base');
  if (!validateRefToken(base)) return rejection(`mitosis-git pr-create: --base ${JSON.stringify(base)} is not a conservative git ref token`);
  const title = inertText(single.get('--title'), TITLE_CAP);
  if (title === null) return rejection(`mitosis-git pr-create: --title is empty, over the ${TITLE_CAP}-character cap, or begins with the field-indirection sigil`);
  const bodyLines = [];
  for (const raw of multiple) {
    const line = inertText(raw, LINE_CAP);
    if (line === null) return rejection(`mitosis-git pr-create: a --body-line is empty, over the ${LINE_CAP}-character cap, or begins with the field-indirection sigil`);
    bodyLines.push(line);
  }
  let supersedes = null;
  if (single.has('--supersedes')) {
    const candidate = single.get('--supersedes');
    if (parsePrRef(candidate) === null) return rejection(`mitosis-git pr-create: --supersedes ${JSON.stringify(candidate)} is not a github pull-request url`);
    supersedes = candidate;
  }
  let depends = [];
  if (single.has('--depends')) {
    const ids = parseDependsList(single.get('--depends'));
    if (ids === null) return rejection(`mitosis-git pr-create: --depends ${JSON.stringify(single.get('--depends'))} is not a comma-separated list of MSP ids`);
    depends = ids;
  }
  return Object.freeze({
    ok: true,
    error: null,
    verb: 'pr-create',
    opts: Object.freeze({ repo, head, base, title, bodyLines: Object.freeze(bodyLines), supersedes, depends: Object.freeze(depends) }),
  });
}

function parsePrClose(single) {
  const repo = single.get('--repo');
  if (!validateRepoIdentity(repo)) return rejection(`mitosis-git pr-close: --repo ${JSON.stringify(repo)} is not an owner/repo slug`);
  const pr = single.get('--pr');
  if (!PR_NUMBER_PATTERN.test(pr)) return rejection(`mitosis-git pr-close: --pr ${JSON.stringify(pr)} is not a pull-request number`);
  let comment = null;
  if (single.has('--comment')) {
    comment = inertText(single.get('--comment'), LINE_CAP);
    if (comment === null) return rejection(`mitosis-git pr-close: --comment is empty, over the ${LINE_CAP}-character cap, or begins with the field-indirection sigil`);
  }
  return Object.freeze({ ok: true, error: null, verb: 'pr-close', opts: Object.freeze({ repo, pr, comment }) });
}

function parseCompare(single) {
  const repo = single.get('--repo');
  if (!validateRepoIdentity(repo)) return rejection(`mitosis-git compare: --repo ${JSON.stringify(repo)} is not an owner/repo slug`);
  const base = single.get('--base');
  if (!validateRefToken(base)) return rejection(`mitosis-git compare: --base ${JSON.stringify(base)} is not a conservative git ref token`);
  const head = single.get('--head');
  if (!validateRefToken(head)) return rejection(`mitosis-git compare: --head ${JSON.stringify(head)} is not a conservative git ref token`);
  return Object.freeze({ ok: true, error: null, verb: 'compare', opts: Object.freeze({ repo, base, head }) });
}

export function parseMitosisGitArgv(argv) {
  if (!Array.isArray(argv) || argv.length === 0) {
    return rejection(`mitosis-git: expected a verb; the only verbs are ${MITOSIS_GIT_VERBS.join(', ')}`);
  }
  const verb = argv[0];
  if (typeof verb !== 'string' || !MITOSIS_GIT_VERBS.includes(verb)) {
    return rejection(`mitosis-git: unknown verb ${JSON.stringify(verb === undefined ? null : verb)}; the only verbs are ${MITOSIS_GIT_VERBS.join(', ')}`);
  }
  const collected = collectFlags(verb, argv);
  if (collected.error) return rejection(collected.error);
  if (verb === 'pr-create') return parsePrCreate(collected.single, collected.multiple);
  if (verb === 'pr-close') return parsePrClose(collected.single);
  return parseCompare(collected.single);
}

export function renderPrCreateBody(opts) {
  const lines = [];
  for (const line of opts.bodyLines || []) lines.push(line);
  if (opts.supersedes) lines.push(`SUPERSEDES ${opts.supersedes}`);
  if (opts.depends && opts.depends.length > 0) lines.push(`DEPENDS-ON ${opts.depends.join(', ')}`);
  lines.push(BODY_TRAILER);
  return lines.join('\n');
}

export function buildGhArgv(verb, stage, opts) {
  if (verb === 'pr-create' && stage === 'observe') {
    return ['pr', 'list', '-R', opts.repo, '--head', opts.head, '--base', opts.base, '--state', 'open', '--json', 'url,number'];
  }
  if (verb === 'pr-create' && stage === 'converge') {
    return ['pr', 'create', '-R', opts.repo, '--head', opts.head, '--base', opts.base, '--title', opts.title, '--body', renderPrCreateBody(opts)];
  }
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
  throw new Error(`mitosis-git: refusing to build a gh argv for the unknown verb/stage pair ${JSON.stringify(verb)}/${JSON.stringify(stage)}`);
}

export function ghExecTripwire(argv, classify) {
  if (!Array.isArray(argv) || argv.length === 0) {
    return Object.freeze({ allow: false, reason: 'mitosis-git tripwire: refusing to execute a gh call whose argv is not a non-empty array (fail-closed).' });
  }
  let decision;
  try {
    decision = classify(argv, NO_INDIRECT_IO);
  } catch (err) {
    return Object.freeze({ allow: false, reason: `mitosis-git tripwire: the deny classifier threw (${err && err.message}); refusing to execute (fail-closed).` });
  }
  if (decision === null || typeof decision !== 'object' || Array.isArray(decision)) {
    return Object.freeze({ allow: false, reason: 'mitosis-git tripwire: the deny classifier returned no usable decision object; refusing to execute (fail-closed).' });
  }
  if (decision.refuse !== false) {
    const carried = typeof decision.reason === 'string' && decision.reason.length > 0 ? decision.reason : null;
    return Object.freeze({
      allow: false,
      reason: carried || 'mitosis-git tripwire: the deny classifier returned a decision whose refuse field is not the strict boolean false; refusing to execute (fail-closed).',
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

function execGh(ghBin, argv) {
  const gate = ghExecTripwire(argv, classifyGhMerge);
  if (!gate.allow) {
    return Object.freeze({ refused: true, reason: gate.reason, status: null, stdout: '', stderr: '' });
  }
  const result = spawnSync(ghBin, argv, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.error) {
    return Object.freeze({ refused: false, reason: '', status: null, stdout: '', stderr: `mitosis-git: failed to execute gh (${result.error.message})\n` });
  }
  return Object.freeze({
    refused: false,
    reason: '',
    status: typeof result.status === 'number' ? result.status : null,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  });
}

function readPrEntry(entry, repo) {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return null;
  if (typeof entry.url !== 'string') return null;
  const ref = parsePrRef(entry.url);
  if (ref === null) return null;
  if (ref.ownerRepo.toLowerCase() !== repo.toLowerCase()) return null;
  const number = Number.isInteger(entry.number) ? entry.number : Number(ref.prNumber);
  if (!Number.isInteger(number)) return null;
  return Object.freeze({ url: entry.url.trim(), number });
}

function readPrUrl(text, repo) {
  for (const line of String(text).split('\n')) {
    const candidate = line.trim();
    if (candidate.length === 0) continue;
    const ref = parsePrRef(candidate);
    if (ref === null) continue;
    if (ref.ownerRepo.toLowerCase() !== repo.toLowerCase()) continue;
    return Object.freeze({ url: candidate, number: Number(ref.prNumber) });
  }
  return null;
}

function observeOpenPr(ghBin, opts) {
  const res = execGh(ghBin, buildGhArgv('pr-create', 'observe', opts));
  if (res.refused) return { refused: true, reason: res.reason };
  if (res.status !== 0) return { failed: `the open-pull-request probe exited ${res.status}`, stderr: res.stderr };
  const text = res.stdout.trim();
  if (text.length === 0) return { failed: 'the open-pull-request probe printed nothing' };
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return { failed: 'the open-pull-request probe printed unparseable JSON' };
  }
  if (!Array.isArray(payload)) return { failed: 'the open-pull-request probe did not return a JSON array' };
  return { list: payload };
}

function runPrCreate(ghBin, opts, out) {
  const observed = observeOpenPr(ghBin, opts);
  if (observed.refused) {
    out.err(`${observed.reason}\n`);
    return MITOSIS_GIT_TRIPWIRE_EXIT;
  }
  if (observed.failed) {
    out.err(`mitosis-git pr-create: ${observed.failed}; nothing was created.\n${observed.stderr || ''}`);
    return MITOSIS_GIT_OBSERVE_EXIT;
  }
  if (observed.list.length > 0) {
    const existing = readPrEntry(observed.list[0], opts.repo);
    if (existing === null) {
      out.err('mitosis-git pr-create: an open pull request already exists on this head but its url could not be read; refusing to open a second one.\n');
      return MITOSIS_GIT_OBSERVE_EXIT;
    }
    out.log(`${JSON.stringify({ action: 'reused', url: existing.url, number: existing.number })}\n`);
    return 0;
  }
  const created = execGh(ghBin, buildGhArgv('pr-create', 'converge', opts));
  if (created.refused) {
    out.err(`${created.reason}\n`);
    return MITOSIS_GIT_TRIPWIRE_EXIT;
  }
  if (created.status !== 0) {
    out.err(created.stderr || `mitosis-git pr-create: the create call exited ${created.status}.\n`);
    return MITOSIS_GIT_CONVERGE_EXIT;
  }
  const printed = readPrUrl(created.stdout, opts.repo);
  if (printed !== null) {
    out.log(`${JSON.stringify({ action: 'created', url: printed.url, number: printed.number })}\n`);
    return 0;
  }
  const recovered = observeOpenPr(ghBin, opts);
  if (!recovered.refused && !recovered.failed && recovered.list.length > 0) {
    const entry = readPrEntry(recovered.list[0], opts.repo);
    if (entry !== null) {
      out.log(`${JSON.stringify({ action: 'created', url: entry.url, number: entry.number })}\n`);
      return 0;
    }
  }
  out.err('mitosis-git pr-create: the create call reported success but no pull-request url for this repository could be resolved from its output or from the recovery probe; a pull request MAY exist, so read the repository before retrying.\n');
  return MITOSIS_GIT_CONVERGE_EXIT;
}

function runPrClose(ghBin, opts, out) {
  const viewed = execGh(ghBin, buildGhArgv('pr-close', 'observe', opts));
  if (viewed.refused) {
    out.err(`${viewed.reason}\n`);
    return MITOSIS_GIT_TRIPWIRE_EXIT;
  }
  if (viewed.status !== 0) {
    out.err(`mitosis-git pr-close: the pull-request state probe exited ${viewed.status}; nothing was closed.\n${viewed.stderr}`);
    return MITOSIS_GIT_OBSERVE_EXIT;
  }
  let view;
  try {
    view = JSON.parse(viewed.stdout.trim());
  } catch {
    out.err('mitosis-git pr-close: the pull-request state probe printed unparseable JSON; nothing was closed.\n');
    return MITOSIS_GIT_OBSERVE_EXIT;
  }
  if (view === null || typeof view !== 'object' || Array.isArray(view)) {
    out.err('mitosis-git pr-close: the pull-request state probe returned no object; nothing was closed.\n');
    return MITOSIS_GIT_OBSERVE_EXIT;
  }
  const state = typeof view.state === 'string' ? view.state : null;
  const url = typeof view.url === 'string' && view.url.length > 0 ? view.url : null;
  if (state === null || url === null) {
    out.err('mitosis-git pr-close: the pull-request state probe carried no state or url; nothing was closed.\n');
    return MITOSIS_GIT_OBSERVE_EXIT;
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
    out.err(`mitosis-git pr-close: the pull request reported the unrecognised state ${JSON.stringify(state)}; nothing was closed.\n`);
    return MITOSIS_GIT_OBSERVE_EXIT;
  }
  const closed = execGh(ghBin, buildGhArgv('pr-close', 'converge', opts));
  if (closed.refused) {
    out.err(`${closed.reason}\n`);
    return MITOSIS_GIT_TRIPWIRE_EXIT;
  }
  if (closed.status !== 0) {
    out.err(closed.stderr || `mitosis-git pr-close: the close call exited ${closed.status}.\n`);
    return MITOSIS_GIT_CONVERGE_EXIT;
  }
  out.log(`${JSON.stringify({ action: 'closed', state: 'CLOSED', url })}\n`);
  return 0;
}

function compareReadError(out, readError) {
  out.log(`${JSON.stringify({ readError })}\n`);
  return MITOSIS_GIT_OBSERVE_EXIT;
}

function runCompare(ghBin, opts, out) {
  const res = execGh(ghBin, buildGhArgv('compare', 'read', opts));
  if (res.refused) {
    out.err(`${res.reason}\n`);
    return MITOSIS_GIT_TRIPWIRE_EXIT;
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

function runMitosisGit(argv, out) {
  const parsed = parseMitosisGitArgv(argv);
  if (!parsed.ok) {
    out.err(`${parsed.error}\n`);
    return MITOSIS_GIT_USAGE_EXIT;
  }
  const ghBin = resolveGhBinary({ pathValue: process.env.PATH });
  if (!ghBin) {
    out.err('mitosis-git: could not locate a gh binary on PATH or any pinned fallback; nothing was executed.\n');
    return MITOSIS_GIT_GH_MISSING_EXIT;
  }
  if (parsed.verb === 'pr-create') return runPrCreate(ghBin, parsed.opts, out);
  if (parsed.verb === 'pr-close') return runPrClose(ghBin, parsed.opts, out);
  return runCompare(ghBin, parsed.opts, out);
}

export function mitosisGitMain() {
  const out = Object.freeze({
    log: (text) => process.stdout.write(text),
    err: (text) => process.stderr.write(text),
  });
  process.exit(runMitosisGit(process.argv.slice(2), out));
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
  mitosisGitMain();
}
