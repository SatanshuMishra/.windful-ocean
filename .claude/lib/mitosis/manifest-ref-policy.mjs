import { MANIFEST_REF_PREFIX } from './checkpoint.mjs';

export const MANIFEST_REF_NAMESPACE = `${MANIFEST_REF_PREFIX}/`;

const GIT_BINARY = 'git';
const PUSH_SUBCOMMAND = 'push';
const PLUS_FORCE = '+refspec';

const FORCE_FLAGS = Object.freeze(new Set(['-f', '--force', '--force-with-lease', '--force-if-includes']));
const FORCE_VALUED_PREFIXES = Object.freeze(['--force-with-lease=', '--force-if-includes=']);
const VALUE_FLAGS = Object.freeze(new Set(['--repo', '--receive-pack', '--exec', '-o', '--push-option', '--server-option']));
const VALUE_SHORTS = Object.freeze(new Set(['o']));
const GIT_GLOBAL_VALUE_FLAGS = Object.freeze(new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path']));

const POLICY = 'the published-manifest ref is write once and forward only: it is never rewritten, never amended, never replaced. The adjacent checkpoint-push and ship stages DO permit one force retry, so this refusal is scoped to the manifest namespace rather than banning force outright.';

function expandShortCluster(token) {
  if (token.length < 2 || !token.startsWith('-') || token.startsWith('--')) return [token];
  const characters = token.slice(1);
  const out = [];
  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index];
    out.push(`-${character}`);
    if (!VALUE_SHORTS.has(character)) continue;
    const rest = characters.slice(index + 1).replace(/^=/, '');
    if (rest.length > 0) out.push(rest);
    return out;
  }
  return out;
}

function expandArgv(argv) {
  const out = [];
  let endOfFlags = false;
  for (const token of argv) {
    if (endOfFlags) { out.push(token); continue; }
    if (token === '--') { endOfFlags = true; out.push(token); continue; }
    if (token.startsWith('--') || !token.startsWith('-') || token === '-') { out.push(token); continue; }
    out.push(...expandShortCluster(token));
  }
  return out;
}

function pushArgvOf(argv) {
  const expanded = expandArgv(argv);
  for (let index = 0; index < expanded.length; index += 1) {
    const token = expanded[index];
    if (token === PUSH_SUBCOMMAND) return expanded.slice(index + 1);
    if (GIT_GLOBAL_VALUE_FLAGS.has(token)) { index += 1; continue; }
    if (token.startsWith('-')) continue;
    return null;
  }
  return null;
}

function isForceToken(token) {
  return FORCE_FLAGS.has(token) || FORCE_VALUED_PREFIXES.some((prefix) => token.startsWith(prefix));
}

function partition(pushArgv) {
  const forceSpellings = [];
  const positionals = [];
  let endOfFlags = false;
  for (let index = 0; index < pushArgv.length; index += 1) {
    const token = pushArgv[index];
    if (!endOfFlags && token === '--') { endOfFlags = true; continue; }
    if (!endOfFlags && token.startsWith('-') && token.length > 1) {
      if (isForceToken(token)) forceSpellings.push(token);
      if (VALUE_FLAGS.has(token)) index += 1;
      continue;
    }
    positionals.push(token);
  }
  return { forceSpellings, positionals };
}

function destinationOf(refspec) {
  const bare = refspec.startsWith('+') ? refspec.slice(1) : refspec;
  const cut = bare.lastIndexOf(':');
  return cut === -1 ? bare : bare.slice(cut + 1);
}

function targetsManifest(refspec) {
  return destinationOf(refspec).startsWith(MANIFEST_REF_NAMESPACE);
}

export function classifyManifestRefPush(binary, argv) {
  if (!Array.isArray(argv)) {
    throw new TypeError(`manifest-ref-policy: the argument vector must be an array, not ${JSON.stringify(argv)}; a command string would have to be split before this policy could read its refspecs`);
  }
  if (argv.some((entry) => typeof entry !== 'string')) {
    throw new TypeError('manifest-ref-policy: every argument vector element must be a string; a value the caller never spelled out cannot be read as a refspec');
  }
  const inert = Object.freeze({
    refuse: false,
    reason: '',
    forceSpellings: Object.freeze([]),
    manifestDestinations: Object.freeze([]),
  });
  if (binary !== GIT_BINARY) return inert;
  const pushArgv = pushArgvOf(argv);
  if (pushArgv === null) return inert;

  const { forceSpellings, positionals } = partition(pushArgv);
  const manifestRefspecs = positionals.filter(targetsManifest);
  const manifestDestinations = Object.freeze(manifestRefspecs.map(destinationOf));
  if (manifestRefspecs.length === 0) {
    return Object.freeze({ ...inert, forceSpellings: Object.freeze([...forceSpellings]) });
  }

  const plusForced = manifestRefspecs.filter((refspec) => refspec.startsWith('+'));
  const spellings = Object.freeze([...forceSpellings, ...(plusForced.length > 0 ? [PLUS_FORCE] : [])]);
  if (spellings.length === 0) {
    return Object.freeze({ refuse: false, reason: '', forceSpellings: spellings, manifestDestinations });
  }
  return Object.freeze({
    refuse: true,
    reason: `a push forced by ${spellings.join(', ')} targets ${manifestDestinations.join(', ')} in the published-manifest namespace ${MANIFEST_REF_NAMESPACE}; ${POLICY}`,
    forceSpellings: spellings,
    manifestDestinations,
  });
}

export function assertManifestRefPushAllowed(binary, argv) {
  const verdict = classifyManifestRefPush(binary, argv);
  if (verdict.refuse) {
    throw new Error(`manifest-ref-policy: refused in-process before any child started — ${verdict.reason}`);
  }
  return verdict;
}

const MANIFEST_REF_SPECIMEN = `${MANIFEST_REF_NAMESPACE}aaaa1111/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef`;
const CHECKPOINT_REF_SPECIMEN = 'refs/mitosis/aaaa1111/msp';

export const MANIFEST_REF_PROBES = Object.freeze([
  Object.freeze({ name: 'force onto the manifest ref', expected: 'refused', argv: Object.freeze(['push', '--force', 'origin', `integration:${MANIFEST_REF_SPECIMEN}`]) }),
  Object.freeze({ name: 'force-with-lease onto the manifest ref', expected: 'refused', argv: Object.freeze(['push', '--force-with-lease', 'origin', `${MANIFEST_REF_SPECIMEN}:${MANIFEST_REF_SPECIMEN}`]) }),
  Object.freeze({ name: 'plus-prefixed manifest refspec', expected: 'refused', argv: Object.freeze(['push', 'origin', `+integration:${MANIFEST_REF_SPECIMEN}`]) }),
  Object.freeze({ name: 'clustered short force onto the manifest ref', expected: 'refused', argv: Object.freeze(['push', '-fu', 'origin', `integration:${MANIFEST_REF_SPECIMEN}`]) }),
  Object.freeze({ name: 'unforced publish of the manifest ref', expected: 'permitted', argv: Object.freeze(['push', 'origin', `${MANIFEST_REF_SPECIMEN}:${MANIFEST_REF_SPECIMEN}`]) }),
  Object.freeze({ name: 'checkpoint-push force-with-lease retry', expected: 'permitted', argv: Object.freeze(['push', '--force-with-lease', 'origin', `integration:${CHECKPOINT_REF_SPECIMEN}`]) }),
  Object.freeze({ name: 'ship force-with-lease onto its own branch', expected: 'permitted', argv: Object.freeze(['push', '--force-with-lease', '-u', 'origin', 'mitosis/msp']) }),
  Object.freeze({ name: 'manifest ref read as a push source', expected: 'permitted', argv: Object.freeze(['push', '--force', 'origin', `${MANIFEST_REF_SPECIMEN}:refs/heads/scratch`]) }),
]);

export function manifestRefPolicyProbes() {
  return Object.freeze(MANIFEST_REF_PROBES.map((probe) => {
    let observed;
    try {
      assertManifestRefPushAllowed(GIT_BINARY, [...probe.argv]);
      observed = 'permitted';
    } catch {
      observed = 'refused';
    }
    return Object.freeze({ name: probe.name, expected: probe.expected, observed });
  }));
}

export const MANIFEST_REF_NOT_ATTESTED = Object.freeze([
  'that every destructive spelling that could reach the manifest ref is refused: this policy reads force flags and the plus-prefixed refspec, so a --mirror push, a --delete, or an empty-source delete refspec targeting the namespace passes it unexamined',
  'that the engine reaches git only through this policy: it classifies an argument vector it is handed, and no verb censuses the call sites that build one',
]);
