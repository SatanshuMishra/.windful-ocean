import { MANIFEST_REF_PREFIX } from './checkpoint.mjs';

export const MANIFEST_REF_NAMESPACE = `${MANIFEST_REF_PREFIX}/`;

const GIT_BINARY = 'git';
const PUSH_SUBCOMMAND = 'push';
const PLUS_FORCE = '+refspec';
const EMPTY_SOURCE = ':refspec';
const REF_QUALIFIER = 'refs/';

const FORCE_FLAGS = Object.freeze(new Set(['-f', '--force', '--force-with-lease', '--force-if-includes']));
const FORCE_VALUED_PREFIXES = Object.freeze(['--force-with-lease=', '--force-if-includes=']);
const DELETE_FLAGS = Object.freeze(new Set(['-d', '--delete']));
const NAMESPACE_WIDE_FLAGS = Object.freeze(new Set(['--mirror']));
const PRUNE_FLAGS = Object.freeze(new Set(['--prune']));
const VALUE_FLAGS = Object.freeze(new Set(['--repo', '--receive-pack', '--exec', '-o', '--push-option', '--server-option']));
const VALUE_SHORTS = Object.freeze(new Set(['o', 'c']));
const GIT_GLOBAL_VALUE_FLAGS = Object.freeze(new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--config-env']));
const CONFIG_FLAGS = Object.freeze(new Set(['-c', '--config-env']));
const CONFIG_ENV_FLAG = '--config-env';
const REFSPEC_CONFIG_KEY = /^remote\.[^.]+\.push$/;
const PUSH_CONFIG_KEYS = Object.freeze(['push.default', 'push.pushOption', 'push.recurseSubmodules']);

const POLICY = 'the published-manifest ref is write once and forward only: it is never rewritten, never amended, never replaced. The adjacent checkpoint-push and ship stages DO permit one force retry onto their own refs, so this refusal is scoped to the manifest namespace rather than banning force or deletion outright.';

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

function splitAtPush(argv) {
  const expanded = expandArgv(argv);
  for (let index = 0; index < expanded.length; index += 1) {
    const token = expanded[index];
    if (token === PUSH_SUBCOMMAND) {
      return { global: expanded.slice(0, index), push: expanded.slice(index + 1) };
    }
    if (GIT_GLOBAL_VALUE_FLAGS.has(token)) { index += 1; continue; }
    if (token.startsWith('-')) continue;
    return null;
  }
  return null;
}

function configEntries(globalArgv) {
  const entries = [];
  for (let index = 0; index < globalArgv.length; index += 1) {
    const token = globalArgv[index];
    const attached = token.match(/^(--config-env)=(.*)$/);
    if (attached !== null) {
      entries.push({ flag: attached[1], raw: attached[2] });
      continue;
    }
    if (!CONFIG_FLAGS.has(token)) continue;
    const value = globalArgv[index + 1];
    entries.push({ flag: token, raw: value === undefined ? null : value });
    index += 1;
  }
  return entries;
}

function readConfig(entries) {
  const refspecs = [];
  const unreadable = [];
  for (const entry of entries) {
    if (typeof entry.raw !== 'string' || !entry.raw.includes('=')) {
      unreadable.push(`${entry.flag} ${JSON.stringify(entry.raw)} is not a key=value setting, so this policy cannot tell whether it carries a push refspec`);
      continue;
    }
    const cut = entry.raw.indexOf('=');
    const key = entry.raw.slice(0, cut);
    const value = entry.raw.slice(cut + 1);
    const carriesRefspec = REFSPEC_CONFIG_KEY.test(key);
    if (!carriesRefspec && !PUSH_CONFIG_KEYS.includes(key)) continue;
    if (entry.flag === CONFIG_ENV_FLAG) {
      unreadable.push(`${CONFIG_ENV_FLAG} sets ${key} from the environment variable ${JSON.stringify(value)}, whose value this policy cannot read`);
      continue;
    }
    if (!carriesRefspec) continue;
    for (const spec of value.split(/\s+/).filter((part) => part.length > 0)) refspecs.push(spec);
  }
  return { refspecs, unreadable };
}

function isForceToken(token) {
  return FORCE_FLAGS.has(token) || FORCE_VALUED_PREFIXES.some((prefix) => token.startsWith(prefix));
}

function partition(pushArgv) {
  const forceSpellings = [];
  const flagSpellings = [];
  const positionals = [];
  let endOfFlags = false;
  for (let index = 0; index < pushArgv.length; index += 1) {
    const token = pushArgv[index];
    if (!endOfFlags && token === '--') { endOfFlags = true; continue; }
    if (!endOfFlags && token.startsWith('-') && token.length > 1) {
      if (isForceToken(token)) forceSpellings.push(token);
      if (DELETE_FLAGS.has(token) || PRUNE_FLAGS.has(token) || NAMESPACE_WIDE_FLAGS.has(token)) flagSpellings.push(token);
      if (VALUE_FLAGS.has(token)) index += 1;
      continue;
    }
    positionals.push(token);
  }
  return { forceSpellings, flagSpellings, positionals };
}

function sourceOf(refspec) {
  const bare = refspec.startsWith('+') ? refspec.slice(1) : refspec;
  const cut = bare.lastIndexOf(':');
  return cut === -1 ? bare : bare.slice(0, cut);
}

function destinationOf(refspec) {
  const bare = refspec.startsWith('+') ? refspec.slice(1) : refspec;
  const cut = bare.lastIndexOf(':');
  return cut === -1 ? bare : bare.slice(cut + 1);
}

function coversNamespace(candidate) {
  const star = candidate.indexOf('*');
  if (star === -1) return candidate.startsWith(MANIFEST_REF_NAMESPACE);
  const literal = candidate.slice(0, star);
  return MANIFEST_REF_NAMESPACE.startsWith(literal) || literal.startsWith(MANIFEST_REF_NAMESPACE);
}

function resolutionCandidates(destination) {
  const bare = destination.replace(/^\/+/, '');
  if (bare.length === 0) return [];
  if (bare.startsWith(REF_QUALIFIER)) return [bare];
  return [bare, `${REF_QUALIFIER}${bare}`];
}

function targetsManifest(refspec) {
  return resolutionCandidates(destinationOf(refspec)).some(coversNamespace);
}

const INERT = Object.freeze({
  refuse: false,
  reason: '',
  forceSpellings: Object.freeze([]),
  destructiveSpellings: Object.freeze([]),
  manifestDestinations: Object.freeze([]),
  unreadable: Object.freeze([]),
});

export function classifyManifestRefPush(binary, argv) {
  if (!Array.isArray(argv)) {
    throw new TypeError(`manifest-ref-policy: the argument vector must be an array, not ${JSON.stringify(argv)}; a command string would have to be split before this policy could read its refspecs`);
  }
  if (argv.some((entry) => typeof entry !== 'string')) {
    throw new TypeError('manifest-ref-policy: every argument vector element must be a string; a value the caller never spelled out cannot be read as a refspec');
  }
  if (binary !== GIT_BINARY) return INERT;
  const split = splitAtPush(argv);
  if (split === null) return INERT;

  const config = readConfig(configEntries(split.global));
  const { forceSpellings, flagSpellings, positionals } = partition(split.push);
  const refspecs = [...positionals, ...config.refspecs];
  const manifestRefspecs = refspecs.filter(targetsManifest);
  const manifestDestinations = Object.freeze(manifestRefspecs.map(destinationOf));
  const namespaceWide = flagSpellings.filter((flag) => NAMESPACE_WIDE_FLAGS.has(flag));

  if (config.unreadable.length > 0) {
    return Object.freeze({
      refuse: true,
      reason: `this push carries configuration that could not be read, so it cannot be cleared of a refspec into the published-manifest namespace ${MANIFEST_REF_NAMESPACE} (fail-closed): ${config.unreadable.join('; ')}. ${POLICY}`,
      forceSpellings: Object.freeze([...forceSpellings]),
      destructiveSpellings: Object.freeze([...flagSpellings]),
      manifestDestinations,
      unreadable: Object.freeze([...config.unreadable]),
    });
  }

  if (namespaceWide.length > 0) {
    return Object.freeze({
      refuse: true,
      reason: `a push carrying ${namespaceWide.join(', ')} replaces every ref under refs/, which necessarily includes the published-manifest namespace ${MANIFEST_REF_NAMESPACE}, and it names no refspec this policy could scope the refusal to. ${POLICY}`,
      forceSpellings: Object.freeze([...forceSpellings]),
      destructiveSpellings: Object.freeze([...flagSpellings]),
      manifestDestinations,
      unreadable: INERT.unreadable,
    });
  }

  if (manifestRefspecs.length === 0) {
    return Object.freeze({ ...INERT, forceSpellings: Object.freeze([...forceSpellings]) });
  }

  const plusForced = manifestRefspecs.some((refspec) => refspec.startsWith('+'));
  const emptySourced = manifestRefspecs.some((refspec) => sourceOf(refspec).length === 0);
  const forced = Object.freeze([...forceSpellings, ...(plusForced ? [PLUS_FORCE] : [])]);
  const destructive = Object.freeze([
    ...flagSpellings.filter((flag) => DELETE_FLAGS.has(flag) || PRUNE_FLAGS.has(flag)),
    ...(emptySourced ? [EMPTY_SOURCE] : []),
  ]);
  if (forced.length === 0 && destructive.length === 0) {
    return Object.freeze({ ...INERT, manifestDestinations });
  }
  const spellings = [...forced, ...destructive];
  return Object.freeze({
    refuse: true,
    reason: `a push spelled with ${spellings.join(', ')} targets ${manifestDestinations.join(', ')} in the published-manifest namespace ${MANIFEST_REF_NAMESPACE}; ${POLICY}`,
    forceSpellings: forced,
    destructiveSpellings: destructive,
    manifestDestinations,
    unreadable: INERT.unreadable,
  });
}

export function assertManifestRefPushAllowed(binary, argv) {
  const verdict = classifyManifestRefPush(binary, argv);
  if (verdict.refuse) {
    throw new Error(`manifest-ref-policy: refused in-process before any child started - ${verdict.reason}`);
  }
  return verdict;
}

const MANIFEST_REF_SPECIMEN = `${MANIFEST_REF_NAMESPACE}aaaa1111/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef`;
const UNQUALIFIED_SPECIMEN = MANIFEST_REF_SPECIMEN.slice(REF_QUALIFIER.length);
const CHECKPOINT_REF_SPECIMEN = 'refs/mitosis/aaaa1111/msp';

export const MANIFEST_REF_PROBES = Object.freeze([
  Object.freeze({ name: 'force onto the manifest ref', expected: 'refused', argv: Object.freeze(['push', '--force', 'origin', `integration:${MANIFEST_REF_SPECIMEN}`]) }),
  Object.freeze({ name: 'force-with-lease onto the manifest ref', expected: 'refused', argv: Object.freeze(['push', '--force-with-lease', 'origin', `${MANIFEST_REF_SPECIMEN}:${MANIFEST_REF_SPECIMEN}`]) }),
  Object.freeze({ name: 'plus-prefixed manifest refspec', expected: 'refused', argv: Object.freeze(['push', 'origin', `+integration:${MANIFEST_REF_SPECIMEN}`]) }),
  Object.freeze({ name: 'clustered short force onto the manifest ref', expected: 'refused', argv: Object.freeze(['push', '-fu', 'origin', `integration:${MANIFEST_REF_SPECIMEN}`]) }),
  Object.freeze({ name: 'force onto the unqualified destination git resolves into the namespace', expected: 'refused', argv: Object.freeze(['push', '--force', 'origin', `HEAD:${UNQUALIFIED_SPECIMEN}`]) }),
  Object.freeze({ name: 'force onto a wildcard destination covering the namespace', expected: 'refused', argv: Object.freeze(['push', '--force', 'origin', '+refs/*:refs/*']) }),
  Object.freeze({ name: 'delete of the manifest ref', expected: 'refused', argv: Object.freeze(['push', '--delete', 'origin', MANIFEST_REF_SPECIMEN]) }),
  Object.freeze({ name: 'empty-source delete refspec onto the manifest ref', expected: 'refused', argv: Object.freeze(['push', 'origin', `:${MANIFEST_REF_SPECIMEN}`]) }),
  Object.freeze({ name: 'mirror push covering every namespace', expected: 'refused', argv: Object.freeze(['push', '--mirror', 'origin']) }),
  Object.freeze({ name: 'manifest refspec smuggled through -c config', expected: 'refused', argv: Object.freeze(['-c', `remote.origin.push=+HEAD:${MANIFEST_REF_SPECIMEN}`, 'push', 'origin']) }),
  Object.freeze({ name: 'push refspec config read from an unreadable environment variable', expected: 'refused', argv: Object.freeze(['--config-env=remote.origin.push=SNEAKY', 'push', 'origin']) }),
  Object.freeze({ name: 'unforced publish of the manifest ref', expected: 'permitted', argv: Object.freeze(['push', 'origin', `${MANIFEST_REF_SPECIMEN}:${MANIFEST_REF_SPECIMEN}`]) }),
  Object.freeze({ name: 'checkpoint-push force-with-lease retry', expected: 'permitted', argv: Object.freeze(['push', '--force-with-lease', 'origin', `integration:${CHECKPOINT_REF_SPECIMEN}`]) }),
  Object.freeze({ name: 'ship force-with-lease onto its own branch', expected: 'permitted', argv: Object.freeze(['push', '--force-with-lease', '-u', 'origin', 'mitosis/msp']) }),
  Object.freeze({ name: 'manifest ref read as a push source', expected: 'permitted', argv: Object.freeze(['push', '--force', 'origin', `${MANIFEST_REF_SPECIMEN}:refs/heads/scratch`]) }),
  Object.freeze({ name: 'delete of an ordinary branch', expected: 'permitted', argv: Object.freeze(['push', '--delete', 'origin', 'refs/heads/scratch']) }),
  Object.freeze({ name: 'the identity config manifest-publish itself passes', expected: 'permitted', argv: Object.freeze(['-c', 'user.name=mitosis', '-c', 'user.email=mitosis@localhost', 'push', 'origin', `${MANIFEST_REF_SPECIMEN}:${MANIFEST_REF_SPECIMEN}`]) }),
  Object.freeze({ name: 'force onto a wildcard destination that cannot reach the namespace', expected: 'permitted', argv: Object.freeze(['push', '--force', 'origin', 'refs/heads/*:refs/heads/*']) }),
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
  'that a push refspec the argument vector never spells is seen: this policy reads the argument vector, so a remote.*.push refspec already written into the repository or user git configuration reaches the namespace unexamined',
  'that a destination this policy reads as unqualified resolves the way git would resolve it: git consults the refs that already exist on the remote, and this policy instead treats every unqualified destination as if it could resolve under refs/, which refuses a wider set than git would actually rewrite',
  'that the engine reaches git only through this policy: exec-run consults it on every spawn, but the spawn sites that call node:child_process directly assert only the exec policy and never reach this one',
]);
