import { spawnSync } from 'node:child_process';
import { realpathSync, accessSync, statSync, constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { classifyGhMerge, resolveRealGh, DEFAULT_FALLBACKS, MERGE_DENY_EXIT, REAL_GH_MISSING_EXIT } from '../superpowers-parallel/gh-merge-shim.mjs';
import { validateRefToken } from '../superpowers-parallel/checkpoint.mjs';
import { validateRepoIdentity, parsePrRef } from '../superpowers-parallel/merge-watch.mjs';
import {
  inertValue,
  carriesToolTrailer,
  renderPrCreateBody,
  PR_TITLE_PATTERN,
  PR_TITLE_TYPES,
  PR_TITLE_CAP,
  PR_VALUE_CAP,
  PR_ORIGINS,
  PR_PROVENANCE_PATTERN,
  PR_CHANGED_LINES_PATTERN,
  PR_MULTI_LIMITS,
  SUPERSEDES_PREFIX,
  DEPENDS_PREFIX,
} from './pr-format.mjs';

export { inertValue, renderPrCreateBody, PR_TITLE_PATTERN, PR_TITLE_TYPES };

export const MITOSIS_GIT_USAGE_EXIT = 2;
export const MITOSIS_GIT_TRIPWIRE_EXIT = MERGE_DENY_EXIT;
export const MITOSIS_GIT_OBSERVE_EXIT = 20;
export const MITOSIS_GIT_CONVERGE_EXIT = 21;
export const MITOSIS_GIT_GH_MISSING_EXIT = REAL_GH_MISSING_EXIT;
export const MITOSIS_GIT_VERBS = Object.freeze(['pr-create', 'pr-close', 'compare']);

const NO_INDIRECT_IO = Object.freeze({ readFile: () => null, readStdin: () => null });

export const FLAG_SPEC = Object.freeze({
  'pr-create': Object.freeze({
    required: Object.freeze(['--repo', '--head', '--base', '--title', '--origin', '--why', '--what']),
    single: Object.freeze(['--repo', '--head', '--base', '--title', '--origin', '--provenance', '--risk', '--supersedes', '--depends', '--changed-lines']),
    multiple: Object.freeze(['--why', '--what', '--verified', '--not-verified', '--link']),
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

const PR_NARRATIVE_FIELDS = Object.freeze([
  Object.freeze(['--why', 'why']),
  Object.freeze(['--what', 'what']),
  Object.freeze(['--verified', 'verified']),
  Object.freeze(['--not-verified', 'notVerified']),
  Object.freeze(['--link', 'links']),
]);

const PR_NUMBER_PATTERN = /^[1-9][0-9]{0,9}$/;
const DEPENDS_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const DEPENDS_CAP = 64;
const DEPENDS_ID_CAP = 64;

function rejection(error) {
  return Object.freeze({ ok: false, error, verb: null, opts: null });
}

function valueRejection(verb, flag, cap) {
  return `mitosis-git ${verb}: a ${flag} value is empty, over the ${cap}-character cap, or carries something a pull-request document may not carry: a leading field-indirection sigil, a non-ascii character, an html tag opener, a leading markdown block opener, or a setext underline`;
}

function parseDependsList(value) {
  const parts = String(value).split(',').map((part) => part.trim());
  if (parts.length === 0 || parts.length > DEPENDS_CAP) return null;
  if (!parts.every((part) => part.length <= DEPENDS_ID_CAP && DEPENDS_ID_PATTERN.test(part))) return null;
  if (inertValue(parts.join(', '), PR_VALUE_CAP - DEPENDS_PREFIX.length) === null) return null;
  return parts;
}

function canonicalPrUrl(candidate) {
  const ref = parsePrRef(candidate);
  if (ref === null || !validateRepoIdentity(ref.ownerRepo)) return null;
  const canonical = `https://github.com/${ref.ownerRepo}/pull/${ref.prNumber}`;
  if (inertValue(canonical, PR_VALUE_CAP - SUPERSEDES_PREFIX.length) === null) return null;
  return canonical;
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
    const swallowedFlag = typeof value === 'string' && (spec.single.includes(value) || spec.multiple.includes(value));
    if (typeof value !== 'string' || value.length === 0 || swallowedFlag) {
      return { error: `mitosis-git ${verb}: flag ${token} requires one inline value and received ${JSON.stringify(value === undefined ? null : value)}` };
    }
    i += 1;
    if (spec.multiple.includes(token)) {
      multiple.push(Object.freeze({ flag: token, value }));
      continue;
    }
    if (single.has(token)) {
      return { error: `mitosis-git ${verb}: flag ${token} was supplied more than once` };
    }
    single.set(token, value);
  }
  for (const flag of spec.required) {
    if (single.has(flag)) continue;
    if (multiple.some((entry) => entry.flag === flag)) continue;
    return { error: `mitosis-git ${verb}: missing required flag ${flag}` };
  }
  return { single, multiple };
}

function collectInertList(multiple, flag) {
  const raws = multiple.filter((entry) => entry.flag === flag).map((entry) => entry.value);
  const ceiling = PR_MULTI_LIMITS[flag];
  if (!Number.isInteger(ceiling)) {
    return { error: `mitosis-git pr-create: ${flag} carries no value ceiling; refusing to compose an unbounded body` };
  }
  if (raws.length > ceiling) {
    return { error: `mitosis-git pr-create: ${raws.length} ${flag} values exceed the ${ceiling}-value ceiling` };
  }
  const values = [];
  for (const raw of raws) {
    const value = inertValue(raw, PR_VALUE_CAP);
    if (value === null) return { error: valueRejection('pr-create', flag, PR_VALUE_CAP) };
    values.push(value);
  }
  return { values: Object.freeze(values) };
}

function readPrCreateTarget(single) {
  const repo = single.get('--repo');
  if (!validateRepoIdentity(repo)) return { error: `mitosis-git pr-create: --repo ${JSON.stringify(repo)} is not an owner/repo slug` };
  const head = single.get('--head');
  if (!validateRefToken(head)) return { error: `mitosis-git pr-create: --head ${JSON.stringify(head)} is not a conservative git ref token` };
  const base = single.get('--base');
  if (!validateRefToken(base)) return { error: `mitosis-git pr-create: --base ${JSON.stringify(base)} is not a conservative git ref token` };
  const title = inertValue(single.get('--title'), PR_TITLE_CAP);
  if (title === null) return { error: valueRejection('pr-create', '--title', PR_TITLE_CAP) };
  if (!PR_TITLE_PATTERN.test(title)) {
    return { error: `mitosis-git pr-create: --title ${JSON.stringify(title)} is not a conventional-commits title of the form <type>(<scope>): <lowercase imperative summary>; the types are ${PR_TITLE_TYPES.join(' ')}, the scope is at most 16 lowercase characters, and the whole title is at most ${PR_TITLE_CAP} characters with no trailing period` };
  }
  const origin = single.get('--origin');
  if (!PR_ORIGINS.includes(origin)) {
    return { error: `mitosis-git pr-create: --origin ${JSON.stringify(origin)} is not one of ${PR_ORIGINS.join(' ')}` };
  }
  return { target: Object.freeze({ repo, head, base, title, origin }) };
}

function readPrCreateNarrative(multiple) {
  const narrative = {};
  for (const [flag, field] of PR_NARRATIVE_FIELDS) {
    const collected = collectInertList(multiple, flag);
    if (collected.error) return { error: collected.error };
    narrative[field] = collected.values;
  }
  if (narrative.verified.length + narrative.notVerified.length === 0) {
    return { error: 'mitosis-git pr-create: the verification section needs at least one --verified or --not-verified value; a check that was not run is stated as --not-verified "<thing> - not run", never left out' };
  }
  return { narrative: Object.freeze(narrative) };
}

function readPrCreateAttribution(single, origin) {
  let provenance = null;
  if (single.has('--provenance')) {
    if (origin === 'human') {
      return { error: 'mitosis-git pr-create: --provenance belongs only to --origin machine; a human-directed pull request asserts no agent and no model' };
    }
    provenance = inertValue(single.get('--provenance'), PR_VALUE_CAP);
    if (provenance === null) return { error: valueRejection('pr-create', '--provenance', PR_VALUE_CAP) };
    if (!PR_PROVENANCE_PATTERN.test(provenance)) {
      return { error: `mitosis-git pr-create: --provenance ${JSON.stringify(provenance)} is not of the form agent=<label> model=<model>` };
    }
  } else if (origin === 'machine') {
    return { error: 'mitosis-git pr-create: --origin machine requires --provenance agent=<label> model=<model>; write model=unspecified when the calling site sets no model' };
  }
  let risk = null;
  if (single.has('--risk')) {
    risk = inertValue(single.get('--risk'), PR_VALUE_CAP);
    if (risk === null) return { error: valueRejection('pr-create', '--risk', PR_VALUE_CAP) };
  }
  return { attribution: Object.freeze({ provenance, risk }) };
}

function readPrCreateReferences(single) {
  let supersedes = null;
  if (single.has('--supersedes')) {
    const candidate = single.get('--supersedes');
    supersedes = canonicalPrUrl(candidate);
    if (supersedes === null) return { error: `mitosis-git pr-create: --supersedes ${JSON.stringify(candidate)} is not a github pull-request url that composes an inert link line within the ${PR_VALUE_CAP}-character cap` };
  }
  let depends = [];
  if (single.has('--depends')) {
    const ids = parseDependsList(single.get('--depends'));
    if (ids === null) return { error: `mitosis-git pr-create: --depends ${JSON.stringify(single.get('--depends'))} is not a comma-separated list of MSP ids composing a link line within the ${PR_VALUE_CAP}-character value cap` };
    depends = ids;
  }
  let changedLines = null;
  if (single.has('--changed-lines')) {
    const raw = single.get('--changed-lines');
    if (!PR_CHANGED_LINES_PATTERN.test(raw)) {
      return { error: `mitosis-git pr-create: --changed-lines ${JSON.stringify(raw)} is not a plain integer of at most seven digits; read it from git diff --shortstat or leave the flag out entirely, never estimate it` };
    }
    changedLines = Number(raw);
  }
  return { references: Object.freeze({ supersedes, depends: Object.freeze(depends), changedLines }) };
}

function parsePrCreate(single, multiple) {
  const target = readPrCreateTarget(single);
  if (target.error) return rejection(target.error);
  const narrative = readPrCreateNarrative(multiple);
  if (narrative.error) return rejection(narrative.error);
  const attribution = readPrCreateAttribution(single, target.target.origin);
  if (attribution.error) return rejection(attribution.error);
  const references = readPrCreateReferences(single);
  if (references.error) return rejection(references.error);
  return Object.freeze({
    ok: true,
    error: null,
    verb: 'pr-create',
    opts: Object.freeze({ ...target.target, ...narrative.narrative, ...attribution.attribution, ...references.references }),
  });
}

function parsePrClose(single) {
  const repo = single.get('--repo');
  if (!validateRepoIdentity(repo)) return rejection(`mitosis-git pr-close: --repo ${JSON.stringify(repo)} is not an owner/repo slug`);
  const pr = single.get('--pr');
  if (!PR_NUMBER_PATTERN.test(pr)) return rejection(`mitosis-git pr-close: --pr ${JSON.stringify(pr)} is not a pull-request number`);
  let comment = null;
  if (single.has('--comment')) {
    comment = inertValue(single.get('--comment'), PR_VALUE_CAP);
    if (comment === null) return rejection(valueRejection('pr-close', '--comment', PR_VALUE_CAP));
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

export function buildGhArgv(verb, stage, opts) {
  if (verb === 'pr-create' && stage === 'observe') {
    return ['pr', 'list', '-R', opts.repo, '--head', opts.head, '--base', opts.base, '--state', 'open', '--json', 'url,number,body'];
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

export function execGh(ghBin, argv) {
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
  return Object.freeze({ url: entry.url.trim(), number, toolComposed: carriesToolTrailer(entry.body) });
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
    if (!existing.toolComposed) {
      out.err(`mitosis-git pr-create: the open pull request already on this head (${existing.url}) does not end with a pr-create trailer, so this tool composed neither its title nor its body; reporting it as reused-unverified rather than asserting the mandated format. A human closes it and reopens it through this tool, or confirms it as it stands.\n`);
      out.log(`${JSON.stringify({ action: 'reused-unverified', url: existing.url, number: existing.number })}\n`);
      return 0;
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
  process.exitCode = runMitosisGit(process.argv.slice(2), out);
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
