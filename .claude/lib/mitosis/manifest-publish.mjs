import { join } from 'node:path';
import { validateRefToken } from './checkpoint.mjs';
import { MANIFEST_REF_NAMESPACE } from './manifest-ref-policy.mjs';
import { GIT_COMMAND_BINARY, buildGitCommand } from './git-commands.mjs';
import { run } from './exec-run.mjs';
import { OWNER_ONLY_MODE, createDirectoryChain, replaceFileAtomically, requireConfinedPath } from './fs-writer.mjs';
import { parseBytes, parseLsRemote, parseSha } from './transcription-parsers.mjs';

const MODULE = 'manifest-publish';
const SITE = 'manifest-publish';

export const MANIFEST_PAYLOAD_DIRECTORY = '.mitosis';
export const MANIFEST_PAYLOAD_FILE = 'published-manifest.json';
export const MANIFEST_TREE_ENTRY = 'manifest.json';
export const MANIFEST_TREE_MODE = '100644';

const REQUIRED_FIELDS = Object.freeze(['repoRoot', 'manifestRef', 'logicalRunId', 'payload']);

const DEFAULT_IO = Object.freeze({ createDirectoryChain, replaceFileAtomically });

export function composeTreeEntry(blob) {
  return `${MANIFEST_TREE_MODE} blob ${blob}\t${MANIFEST_TREE_ENTRY}\n`;
}

function outcome(published, alreadyPresent, detail, extra = {}) {
  return Object.freeze({
    published,
    alreadyPresent,
    ref: null,
    commit: null,
    readBack: null,
    detail,
    ...extra,
  });
}

function requestOf(request) {
  if (request === null || typeof request !== 'object' || Array.isArray(request)) {
    return { error: `${MODULE}: the publish request must be an object naming ${REQUIRED_FIELDS.join(', ')}` };
  }
  const missing = REQUIRED_FIELDS.filter((field) => typeof request[field] !== 'string' || request[field].length === 0);
  if (missing.length > 0) {
    return { error: `${MODULE}: the publish request carries no ${missing.join(', ')}; a run identity composed from a value the caller never supplied would publish under a name nothing can recover it by` };
  }
  if (!request.manifestRef.startsWith(MANIFEST_REF_NAMESPACE)) {
    return { error: `${MODULE}: ${JSON.stringify(request.manifestRef)} does not sit under the published-manifest namespace ${MANIFEST_REF_NAMESPACE}; this stage pushes the ref it is handed to origin, so a ref named anywhere else would create that ref on the remote from caller-chosen bytes, and a pushed refs/heads/ ref alone can trigger branch-push CI or a branch-based deploy` };
  }
  if (!validateRefToken(request.manifestRef)) {
    return { error: `${MODULE}: ${JSON.stringify(request.manifestRef)} is not a well-formed ref token; the namespace prefix alone does not make the rest of the name one git would resolve to the identity this run published` };
  }
  return { value: Object.freeze({ ...request }) };
}

function execIo(io) {
  return io !== null && typeof io === 'object' && typeof io.spawn === 'function' ? io : undefined;
}

function spawnStep(step, values, options, io) {
  const argv = buildGitCommand(SITE, step, values);
  return run(GIT_COMMAND_BINARY, [...argv], Object.freeze({ cwd: values.repoRoot, ...options }), execIo(io));
}

function writePayload(repoRoot, payload, io) {
  const target = join(repoRoot, MANIFEST_PAYLOAD_DIRECTORY, MANIFEST_PAYLOAD_FILE);
  const confined = requireConfinedPath(MODULE, 'the manifest payload path', repoRoot, target, 'the file this run identity is composed from');
  const write = typeof io.replaceFileAtomically === 'function' ? io.replaceFileAtomically : replaceFileAtomically;
  const chain = typeof io.createDirectoryChain === 'function' ? io.createDirectoryChain : createDirectoryChain;
  chain(MODULE, repoRoot, confined.below.slice(0, -1));
  write(MODULE, confined.value, payload, OWNER_ONLY_MODE);
  return confined.value;
}

export function publishManifest(request, io = DEFAULT_IO) {
  const read = requestOf(request);
  if (read.error !== undefined) return outcome(false, false, read.error);
  const { repoRoot, manifestRef, logicalRunId, payload } = read.value;
  const values = { repoRoot, manifestRef, logicalRunId };

  try {
    const gitDir = spawnStep('git-dir', values, undefined, io);
    if (gitDir.outcome !== 'completed' || gitDir.status !== 0) {
      return outcome(false, false, `${MODULE}: ${repoRoot} is not a git repository this run can publish from: ${(gitDir.stderr || gitDir.stdout || gitDir.outcome).trim()}`);
    }

    const before = parseLsRemote(spawnStep('read-remote', values, undefined, io));
    if (!before.ok) return outcome(false, false, `${MODULE}: the published identity could not be observed, so publishing now could replace one that is already there: ${before.error}`);
    if (before.present) {
      return outcome(false, true, `${MODULE}: the run identity is already published at ${manifestRef} as ${before.sha}; the identity ref is write once and forward only, so nothing was written and nothing was pushed`);
    }

    const written = writePayload(repoRoot, payload, io);

    const blob = parseSha(spawnStep('hash-object', values, Object.freeze({ stdin: payload }), io));
    if (!blob.ok) return outcome(false, false, `${MODULE}: the payload at ${written} could not be hashed into the object store: ${blob.error}`);

    const tree = parseSha(spawnStep('mktree', values, Object.freeze({ stdin: composeTreeEntry(blob.sha) }), io));
    if (!tree.ok) return outcome(false, false, `${MODULE}: the one-entry tree could not be built: ${tree.error}`);

    const commit = parseSha(spawnStep('commit-tree', { ...values, tree: tree.sha }, undefined, io));
    if (!commit.ok) return outcome(false, false, `${MODULE}: the identity commit could not be composed: ${commit.error}`);

    const updated = spawnStep('update-ref', { ...values, commit: commit.sha }, undefined, io);
    if (updated.outcome !== 'completed' || updated.status !== 0) {
      return outcome(false, false, `${MODULE}: the local ref ${manifestRef} could not be pointed at ${commit.sha}: ${(updated.stderr || updated.stdout || updated.outcome).trim()}`);
    }

    const pushed = spawnStep('push', values, undefined, io);
    if (pushed.outcome !== 'completed' || pushed.status !== 0) {
      return outcome(false, false, `${MODULE}: publishing ${manifestRef} was refused, and this stage never retries an identity push with force: ${(pushed.stderr || pushed.stdout || pushed.outcome).trim()}`);
    }

    const landed = parseLsRemote(spawnStep('verify-remote', values, undefined, io));
    if (!landed.ok) return outcome(false, false, `${MODULE}: the remote could not be re-read after the push, so nothing confirms what landed: ${landed.error}`);
    if (!landed.present || landed.sha !== commit.sha) {
      return outcome(false, false, `${MODULE}: the remote carries ${landed.present ? landed.sha : 'nothing'} at ${manifestRef} rather than the ${commit.sha} this stage composed, so the identity a later run would recover is not the one published here`);
    }

    const readBack = parseBytes(spawnStep('read-back', values, undefined, io));
    if (!readBack.ok) return outcome(false, false, `${MODULE}: the published payload could not be read back: ${readBack.error}`);
    if (readBack.bytes !== payload) {
      return outcome(false, false, `${MODULE}: the published payload did not round-trip: ${readBack.bytes.length} byte(s) came back where ${payload.length} went out, so what a later run would recover is not what this run composed`);
    }

    return Object.freeze({
      published: true,
      alreadyPresent: false,
      ref: manifestRef,
      commit: commit.sha,
      readBack: readBack.bytes,
      detail: `${MODULE}: published ${manifestRef} as ${commit.sha} and read the payload back unchanged`,
    });
  } catch (error) {
    return outcome(false, false, `${MODULE}: the publish stopped rather than continuing past a step it could not complete: ${error && error.message ? error.message : 'unknown failure'}`);
  }
}

const PROBE_REPO = '/probe-repo';
const PROBE_REF = 'refs/mitosis-manifest/aaaa1111/0123456789abcdef';
const PROBE_RUN = 'aaaa1111';
const PROBE_PAYLOAD = '{"msps":[{"id":"probe"}]}';
const PROBE_BLOB = '1111111111111111111111111111111111111111';
const PROBE_TREE = '2222222222222222222222222222222222222222';
const PROBE_COMMIT = '3333333333333333333333333333333333333333';
const FORCE_SPELLINGS = Object.freeze(['-f', '--force', '--force-with-lease', '--force-if-includes']);

function recordingIo(responses) {
  const spawns = [];
  const writes = [];
  let turn = 0;
  return {
    spawns,
    writes,
    spawn: (command, args, options) => {
      spawns.push(Object.freeze({ args: Object.freeze([...args]), stdin: options && options.input !== undefined ? options.input : null }));
      const next = responses[Math.min(turn, responses.length - 1)];
      turn += 1;
      return { status: next.status, stdout: Buffer.from(next.stdout || ''), stderr: Buffer.from(next.stderr || ''), error: null };
    },
    createDirectoryChain: (moduleName, base, below) => join(base, ...below),
    replaceFileAtomically: (moduleName, path, text) => { writes.push(Object.freeze({ path, text })); return path; },
  };
}

const CLEAN_RESPONSES = Object.freeze([
  { status: 0, stdout: '.git\n' },
  { status: 0, stdout: '' },
  { status: 0, stdout: `${PROBE_BLOB}\n` },
  { status: 0, stdout: `${PROBE_TREE}\n` },
  { status: 0, stdout: `${PROBE_COMMIT}\n` },
  { status: 0, stdout: '' },
  { status: 0, stdout: '' },
  { status: 0, stdout: `${PROBE_COMMIT}\t${PROBE_REF}\n` },
  { status: 0, stdout: PROBE_PAYLOAD },
]);

const PRESENT_RESPONSES = Object.freeze([
  { status: 0, stdout: '.git\n' },
  { status: 0, stdout: `${PROBE_COMMIT}\t${PROBE_REF}\n` },
]);

const UNCONFINED_REFS = Object.freeze([
  'refs/heads/brandnew',
  'refs/tags/v1',
  'refs/mitosis-manifestation/aaaa1111/0123456789abcdef',
  `${MANIFEST_REF_NAMESPACE}../heads/main`,
  `${MANIFEST_REF_NAMESPACE}-upload-pack`,
  'mitosis-manifest/aaaa1111/0123456789abcdef',
]);

function confinementProbes() {
  return Object.freeze(UNCONFINED_REFS.map((manifestRef) => {
    const io = recordingIo(CLEAN_RESPONSES);
    const attempted = publishManifest({ repoRoot: PROBE_REPO, manifestRef, logicalRunId: PROBE_RUN, payload: PROBE_PAYLOAD }, io);
    return Object.freeze({
      name: manifestRef,
      refused: attempted.published === false && attempted.alreadyPresent === false && io.spawns.length === 0 && io.writes.length === 0,
      detail: `${attempted.detail} (${io.spawns.length} spawn(s), ${io.writes.length} write(s))`,
    });
  }));
}

export function manifestPublishProbe() {
  const clean = recordingIo(CLEAN_RESPONSES);
  const published = publishManifest({ repoRoot: PROBE_REPO, manifestRef: PROBE_REF, logicalRunId: PROBE_RUN, payload: PROBE_PAYLOAD }, clean);
  const replayed = recordingIo(PRESENT_RESPONSES);
  const skipped = publishManifest({ repoRoot: PROBE_REPO, manifestRef: PROBE_REF, logicalRunId: PROBE_RUN, payload: PROBE_PAYLOAD }, replayed);
  const pushes = clean.spawns.filter((entry) => entry.args.includes('push'));
  const hashed = clean.spawns.find((entry) => entry.args.includes('hash-object'));
  const treed = clean.spawns.find((entry) => entry.args.includes('mktree'));
  return Object.freeze({
    published: published.published === true,
    detail: published.detail,
    spawnCount: clean.spawns.length,
    writeCount: clean.writes.length,
    payloadOnlyOnStdin: clean.spawns.every((entry) => !entry.args.includes(PROBE_PAYLOAD))
      && hashed !== undefined && hashed.stdin === PROBE_PAYLOAD,
    treeComposedOnStdin: treed !== undefined && treed.stdin === composeTreeEntry(PROBE_BLOB),
    unforced: pushes.length > 0 && pushes.every((entry) => FORCE_SPELLINGS.every((flag) => !entry.args.includes(flag))),
    replayAlreadyPresent: skipped.alreadyPresent === true && skipped.published === false,
    replaySpawnCount: replayed.spawns.length,
    replayWriteCount: replayed.writes.length,
    confinement: confinementProbes(),
  });
}
