import { realpathSync, readFileSync, accessSync, statSync, constants } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MERGE_DENY_EXIT = 13;
export const REAL_GH_MISSING_EXIT = 127;

export const DEFAULT_FALLBACKS = Object.freeze([
  '/opt/homebrew/bin/gh',
  '/usr/local/bin/gh',
  '/usr/bin/gh',
  '/bin/gh',
]);

const POLICY = 'mitosis merge-deny policy — PR merges are human-gated; the mitosis workflow never merges a PR itself, a human merges after review';
const MERGE_MUTATION_RE = /mergePullRequest|enablePullRequestAutoMerge|enqueuePullRequest/i;
const MERGE_ENDPOINT_RE = /pulls\/[^/]+\/merge(?:[/?#]|$)/i;
const GRAPHQL_ENDPOINT = 'graphql';
const SCHEME_PREFIX_RE = /^[a-z][a-z0-9+.-]*:\/\/[^/]*/i;
const QUERY_FIELD_FLAGS = Object.freeze(['-f', '--field', '-F', '--raw-field']);

const GH_VALUE_FLAGS = Object.freeze(new Set([
  '-R', '--repo', '--hostname',
  '-H', '--header',
  '-X', '--method',
  '-f', '--field',
  '-F', '--raw-field',
  '--input',
  '-q', '--jq',
  '-t', '--template',
  '-p', '--preview',
  '--cache',
]));

const GH_VALUE_SHORTS = Object.freeze(new Set(['R', 'H', 'X', 'f', 'F', 'q', 't', 'p']));

const ALIAS_MERGE_RE = /\bpr\s+merge\b|pulls\/[^/]+\/merge|mergePullRequest|enablePullRequestAutoMerge/;

function reason(kind, detail) {
  return `gh merge-deny shim refusing ${detail}: ${POLICY} [${kind}].`;
}

function isDashFlag(token) {
  return token.length > 1 && token.startsWith('-') && token !== '--';
}

function isShortCluster(token) {
  return token.length > 1 && token.startsWith('-') && !token.startsWith('--');
}

export function expandShortClusters(argv) {
  const out = [];
  let endOfFlags = false;
  let carryValue = false;
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (carryValue) {
      out.push(token);
      carryValue = false;
      continue;
    }
    if (!endOfFlags && token === '--') {
      endOfFlags = true;
      out.push(token);
      continue;
    }
    if (endOfFlags || !isShortCluster(token)) {
      out.push(token);
      continue;
    }
    const chars = token.slice(1);
    for (let j = 0; j < chars.length; j += 1) {
      const ch = chars[j];
      out.push(`-${ch}`);
      if (GH_VALUE_SHORTS.has(ch)) {
        let rest = chars.slice(j + 1);
        if (rest.startsWith('=')) rest = rest.slice(1);
        if (rest.length > 0) out.push(rest);
        else carryValue = true;
        break;
      }
    }
  }
  return out;
}

export function resolvedPositionals(argv) {
  const out = [];
  let endOfFlags = false;
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!endOfFlags && token === '--') {
      endOfFlags = true;
      continue;
    }
    if (!endOfFlags && isDashFlag(token)) {
      if (GH_VALUE_FLAGS.has(token)) i += 1;
      continue;
    }
    out.push(token);
  }
  return out;
}

function hasMethodFlag(argv) {
  let endOfFlags = false;
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!endOfFlags && token === '--') {
      endOfFlags = true;
      continue;
    }
    if (endOfFlags) continue;
    if (token === '-X' || token === '--method' || /^--method=/.test(token)) {
      return true;
    }
    if (isDashFlag(token) && GH_VALUE_FLAGS.has(token)) {
      i += 1;
    }
  }
  return false;
}

const BODY_FLAGS = Object.freeze(new Set(['-f', '-F', '--field', '--raw-field', '--input']));
const BODY_FLAG_ATTACHED_RE = /^(?:--field|--raw-field|--input)=/;

function hasBodyFlag(argv) {
  return argv.some((token) => BODY_FLAGS.has(token) || BODY_FLAG_ATTACHED_RE.test(token));
}

function fieldValues(argv, key) {
  const out = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (QUERY_FIELD_FLAGS.includes(token)) {
      const pair = argv[i + 1];
      if (pair && pair.startsWith(`${key}=`)) out.push(pair.slice(key.length + 1));
      continue;
    }
    const inline = token.match(/^(?:-f|-F|--field|--raw-field)=?(.+)$/);
    if (inline && inline[1].startsWith(`${key}=`)) out.push(inline[1].slice(key.length + 1));
  }
  return out;
}

function inputSources(argv) {
  const out = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--input') {
      const value = argv[i + 1];
      if (value !== undefined) out.push(value);
      continue;
    }
    const eq = token.match(/^--input=(.*)$/);
    if (eq) out.push(eq[1]);
  }
  return out;
}

function classifyGraphql(argv, io) {
  const inline = argv.join('\n');
  if (MERGE_MUTATION_RE.test(inline)) {
    return { refuse: true, reason: reason('graphql-mutation', "'gh api graphql' carrying a merge mutation"), stdin: null };
  }

  const indirect = [];
  for (const value of fieldValues(argv, 'query')) {
    if (value.startsWith('@')) indirect.push({ kind: 'file', ref: value.slice(1) });
  }
  for (const value of inputSources(argv)) {
    indirect.push({ kind: value === '-' ? 'stdin' : 'file', ref: value });
  }

  let stdinBuffer = null;
  let unreadable = false;
  for (const source of indirect) {
    let content = null;
    if (source.kind === 'stdin' || source.ref === '-') {
      const buffer = io.readStdin();
      if (buffer == null) {
        unreadable = true;
        continue;
      }
      stdinBuffer = buffer;
      content = Buffer.isBuffer(buffer) ? buffer.toString('utf8') : String(buffer);
    } else {
      content = io.readFile(source.ref);
      if (content == null) {
        unreadable = true;
        continue;
      }
    }
    if (MERGE_MUTATION_RE.test(content)) {
      return { refuse: true, reason: reason('graphql-mutation-indirect', "'gh api graphql' whose referenced body carries a merge mutation"), stdin: null };
    }
  }

  if (unreadable) {
    return { refuse: true, reason: reason('graphql-fail-closed', "'gh api graphql' with an indirect query body it cannot read and therefore cannot clear of a merge mutation (fail-closed)"), stdin: null };
  }

  return { refuse: false, reason: '', stdin: stdinBuffer };
}

export const MERGE_REFUSAL_SPECIMENS = Object.freeze([
  Object.freeze({ label: 'pr merge', kind: 'pr-merge', argv: Object.freeze(['pr', 'merge', '7']) }),
  Object.freeze({ label: 'api graphql mergePullRequest', kind: 'graphql-mutation', argv: Object.freeze(['api', 'graphql', '-f', 'query=mutation { mergePullRequest(input: {pullRequestId: "PR_x"}) { clientMutationId } }']) }),
  Object.freeze({ label: 'api graphql enablePullRequestAutoMerge', kind: 'graphql-mutation', argv: Object.freeze(['api', 'graphql', '-f', 'query=mutation { enablePullRequestAutoMerge(input: {pullRequestId: "PR_x"}) { clientMutationId } }']) }),
  Object.freeze({ label: 'api graphql enqueuePullRequest', kind: 'graphql-mutation', argv: Object.freeze(['api', 'graphql', '-f', 'query=mutation { enqueuePullRequest(input: {pullRequestId: "PR_x"}) { clientMutationId } }']) }),
  Object.freeze({ label: 'api /graphql mergePullRequest', kind: 'graphql-mutation', argv: Object.freeze(['api', '/graphql', '-f', 'query=mutation { mergePullRequest(input: {pullRequestId: "PR_x"}) { clientMutationId } }']) }),
  Object.freeze({ label: 'api PUT pulls/N/merge', kind: 'api-merge-endpoint', argv: Object.freeze(['api', '-X', 'PUT', 'repos/acme/widgets/pulls/412/merge']) }),
  Object.freeze({ label: 'api graphql unreadable body', kind: 'graphql-fail-closed', argv: Object.freeze(['api', 'graphql', '--input', '-']) }),
  Object.freeze({ label: 'alias set defining a pr merge alias', kind: 'alias-merge', argv: Object.freeze(['alias', 'set', 'shipit', 'pr merge --squash']) }),
  Object.freeze({
    label: 'api graphql body read from a file',
    kind: 'graphql-mutation-indirect',
    argv: Object.freeze(['api', 'graphql', '--input', 'merge-body.graphql']),
    io: Object.freeze({
      readFile: () => 'mutation { mergePullRequest(input: {pullRequestId: "PR_x"}) { clientMutationId } }',
      readStdin: () => null,
    }),
  }),
  Object.freeze({ label: 'api merge mutation to an unrecognised endpoint', kind: 'api-merge-mutation', argv: Object.freeze(['api', 'repos/acme/widgets/merges', '-f', 'query=mutation { mergePullRequest(input: {pullRequestId: "PR_x"}) { clientMutationId } }']) }),
]);

export function isGraphqlEndpoint(token) {
  if (typeof token !== 'string') return false;
  let value = token.trim().replace(SCHEME_PREFIX_RE, '');
  const cut = value.search(/[?#]/);
  if (cut !== -1) value = value.slice(0, cut);
  value = value.replace(/^\/+/, '').replace(/\/+$/, '');
  return value.toLowerCase() === GRAPHQL_ENDPOINT;
}

function aliasBodyCarriesMerge(pos) {
  if (pos[0] !== 'alias') return false;
  if (pos[1] !== 'set' && pos[1] !== 'import') return false;
  for (let i = 2; i < pos.length; i += 1) {
    if (ALIAS_MERGE_RE.test(pos[i])) return true;
  }
  return false;
}

export function classifyGhMerge(argv, io) {
  const raw = Array.isArray(argv) ? argv : [];
  const args = expandShortClusters(raw);
  const pos = resolvedPositionals(args);

  if (aliasBodyCarriesMerge(pos)) {
    return { refuse: true, reason: reason('alias-merge', "'gh alias set/import' defining a PR-merge alias"), stdin: null };
  }

  if (pos[0] === 'pr' && pos[1] === 'merge') {
    return { refuse: true, reason: reason('pr-merge', "'gh pr merge'"), stdin: null };
  }

  if (pos[0] === 'api') {
    if (pos.some(isGraphqlEndpoint)) {
      return classifyGraphql(args, io);
    }
    if (args.some((token) => MERGE_ENDPOINT_RE.test(token))) {
      if (hasMethodFlag(args) || hasBodyFlag(args)) {
        return { refuse: true, reason: reason('api-merge-endpoint', "'gh api' to a pulls/*/merge REST endpoint that is not a bare GET read"), stdin: null };
      }
    }
    if (MERGE_MUTATION_RE.test(args.join('\n'))) {
      return { refuse: true, reason: reason('api-merge-mutation', "'gh api' carrying a merge mutation to an endpoint spelling this classifier does not recognise"), stdin: null };
    }
  }

  return { refuse: false, reason: '', stdin: null };
}

export function resolveRealGh({ selfPath, pathValue, fallbacks = DEFAULT_FALLBACKS, realpath, isExecutable }) {
  let selfReal;
  try {
    selfReal = realpath(selfPath);
  } catch {
    selfReal = selfPath;
  }

  const consider = (candidate) => {
    if (!isExecutable(candidate)) return null;
    let candReal;
    try {
      candReal = realpath(candidate);
    } catch {
      candReal = candidate;
    }
    if (candReal === selfReal) return null;
    return candReal;
  };

  const dirs = String(pathValue || '').split(':').filter(Boolean);
  for (const dir of dirs) {
    const found = consider(join(dir, 'gh'));
    if (found) return found;
  }
  for (const fallback of fallbacks) {
    const found = consider(fallback);
    if (found) return found;
  }
  return null;
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

function makeRuntimeIo() {
  let stdinCache;
  return {
    readFile(path) {
      try {
        return readFileSync(path, 'utf8');
      } catch {
        return null;
      }
    },
    readStdin() {
      if (stdinCache !== undefined) return stdinCache;
      if (process.stdin.isTTY) {
        stdinCache = null;
        return stdinCache;
      }
      try {
        stdinCache = readFileSync(0);
      } catch {
        stdinCache = null;
      }
      return stdinCache;
    },
  };
}

export function main() {
  const argv = process.argv.slice(2);
  const io = makeRuntimeIo();
  const decision = classifyGhMerge(argv, io);

  if (decision.refuse) {
    process.stderr.write(`${decision.reason}\n`);
    process.exit(MERGE_DENY_EXIT);
  }

  const realGh = resolveRealGh({
    selfPath: process.argv[1],
    pathValue: process.env.PATH,
    realpath: realpathSync,
    isExecutable: isExecutableFile,
  });

  if (!realGh) {
    process.stderr.write('gh merge-deny shim: could not locate the real gh binary on PATH or any pinned fallback; refusing to proceed rather than risk re-invoking the shim.\n');
    process.exit(REAL_GH_MISSING_EXIT);
  }

  const options = decision.stdin != null
    ? { input: decision.stdin, stdio: ['pipe', 'inherit', 'inherit'] }
    : { stdio: 'inherit' };
  const result = spawnSync(realGh, argv, options);

  if (result.error) {
    process.stderr.write(`gh merge-deny shim: failed to exec the real gh binary (${result.error.message}).\n`);
    process.exit(REAL_GH_MISSING_EXIT);
  }
  if (typeof result.status === 'number') {
    process.exit(result.status);
  }
  process.exit(result.signal ? 1 : 0);
}

export function isDirectEntry() {
  try {
    if (!process.argv[1]) return false;
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isDirectEntry()) {
  main();
}
