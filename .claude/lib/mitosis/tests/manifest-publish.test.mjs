import { test } from 'node:test';
import { MANIFEST_REF_NAMESPACE } from '../manifest-ref-policy.mjs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MANIFEST_PAYLOAD_DIRECTORY, MANIFEST_PAYLOAD_FILE, MANIFEST_TREE_ENTRY, MANIFEST_TREE_MODE, composeTreeEntry, publishManifest } from '../manifest-publish.mjs';

const REPO = '/repo';
const REF = 'refs/mitosis-manifest/aaaa1111/0123456789abcdef';
const RUN = 'aaaa1111';
const PAYLOAD = '{"msps":[{"id":"c4b"}]}';
const BLOB = '1111111111111111111111111111111111111111';
const TREE = '2222222222222222222222222222222222222222';
const COMMIT = '3333333333333333333333333333333333333333';

function recorder(responses) {
  const spawns = [];
  const writes = [];
  const directories = [];
  let turn = 0;
  const io = {
    spawns,
    writes,
    directories,
    spawn: (command, args, options) => {
      spawns.push({ command, args: [...args], stdin: options && options.input !== undefined ? options.input : null });
      const next = responses[Math.min(turn, responses.length - 1)];
      turn += 1;
      return { status: next.status, stdout: Buffer.from(next.stdout || ''), stderr: Buffer.from(next.stderr || ''), error: null };
    },
    createDirectoryChain: (moduleName, base, below) => {
      directories.push(join(base, ...below));
      return join(base, ...below);
    },
    replaceFileAtomically: (moduleName, path, text) => {
      writes.push({ path, text });
      return path;
    },
  };
  return io;
}

const HAPPY = Object.freeze([
  { status: 0, stdout: '.git\n' },
  { status: 0, stdout: '' },
  { status: 0, stdout: `${BLOB}\n` },
  { status: 0, stdout: `${TREE}\n` },
  { status: 0, stdout: `${COMMIT}\n` },
  { status: 0, stdout: '' },
  { status: 0, stdout: '' },
  { status: 0, stdout: `${COMMIT}\t${REF}\n` },
  { status: 0, stdout: PAYLOAD },
]);

function request(overrides = {}) {
  return { repoRoot: REPO, manifestRef: REF, logicalRunId: RUN, payload: PAYLOAD, ...overrides };
}

test('a clean publish runs nine spawns, one filesystem write and no shell', () => {
  const io = recorder(HAPPY);
  const result = publishManifest(request(), io);
  assert.equal(result.published, true, result.detail);
  assert.equal(result.alreadyPresent, false);
  assert.equal(result.commit, COMMIT);
  assert.equal(result.ref, REF);
  assert.equal(result.readBack, PAYLOAD);
  assert.equal(io.spawns.length, 9, `expected nine spawns, saw ${io.spawns.map((entry) => entry.args.join(' ')).join(' | ')}`);
  assert.equal(io.writes.length, 1);
});

test('the payload reaches the object store as a filesystem write, never as a spawned argument', () => {
  const io = recorder(HAPPY);
  publishManifest(request(), io);
  assert.deepEqual(io.writes, [{ path: join(REPO, MANIFEST_PAYLOAD_DIRECTORY, MANIFEST_PAYLOAD_FILE), text: PAYLOAD }]);
  assert.deepEqual(io.directories, [join(REPO, MANIFEST_PAYLOAD_DIRECTORY)]);
  for (const spawned of io.spawns) {
    assert.ok(!spawned.args.includes(PAYLOAD), `the payload was passed as an argument to ${spawned.args.join(' ')}`);
    assert.ok(!spawned.args.some((token) => token.includes('<') || token.includes('|')), 'a redirect or a pipe reached the argument vector');
  }
});

test('the payload bytes reach hash-object on stdin, byte for byte', () => {
  const io = recorder(HAPPY);
  publishManifest(request(), io);
  const hashed = io.spawns.find((entry) => entry.args.includes('hash-object'));
  assert.ok(hashed, 'nothing hashed the payload');
  assert.equal(hashed.stdin, PAYLOAD);
  assert.ok(hashed.args.includes('--stdin'));
});

test('the one-entry tree is composed in process and handed to mktree on stdin', () => {
  const io = recorder(HAPPY);
  publishManifest(request(), io);
  const treed = io.spawns.find((entry) => entry.args.includes('mktree'));
  assert.ok(treed, 'nothing built the tree');
  assert.equal(treed.stdin, `${MANIFEST_TREE_MODE} blob ${BLOB}\t${MANIFEST_TREE_ENTRY}\n`);
  assert.equal(composeTreeEntry(BLOB), `${MANIFEST_TREE_MODE} blob ${BLOB}\t${MANIFEST_TREE_ENTRY}\n`);
});

test('the tree entry name is the one the read-back path resolves, not the on-disk payload name', () => {
  assert.equal(MANIFEST_TREE_ENTRY, 'manifest.json');
  assert.notEqual(MANIFEST_TREE_ENTRY, MANIFEST_PAYLOAD_FILE);
  const io = recorder(HAPPY);
  publishManifest(request(), io);
  const readBack = io.spawns.find((entry) => entry.args.includes('cat-file') && entry.args.includes('-p'));
  assert.ok(readBack.args.some((token) => token.endsWith(`:${MANIFEST_TREE_ENTRY}`)), `the read-back resolves ${readBack.args.join(' ')}, which is not the name the composed tree carries`);
});

test('the identity push carries no force spelling of any kind', () => {
  const io = recorder(HAPPY);
  publishManifest(request(), io);
  const pushed = io.spawns.find((entry) => entry.args.includes('push'));
  assert.ok(pushed, 'nothing published the ref');
  for (const forced of ['--force', '-f', '--force-with-lease', '--force-if-includes']) {
    assert.ok(!pushed.args.includes(forced), `the identity publish carries ${forced}`);
  }
  assert.ok(pushed.args.includes(`${REF}:${REF}`));
});

test('an already published identity stops before writing anything and before pushing anything', () => {
  const io = recorder([{ status: 0, stdout: '.git\n' }, { status: 0, stdout: `${COMMIT}\t${REF}\n` }]);
  const result = publishManifest(request(), io);
  assert.deepEqual([result.published, result.alreadyPresent], [false, true]);
  assert.equal(io.spawns.length, 2, 'the run continued past an identity that is already published');
  assert.equal(io.writes.length, 0, 'a published identity was overwritten on disk');
  assert.match(result.detail, new RegExp(COMMIT));
});

test('a tree that is not a git repository stops before observing the remote at all', () => {
  const io = recorder([{ status: 128, stdout: '', stderr: 'fatal: not a git repository' }]);
  const result = publishManifest(request(), io);
  assert.deepEqual([result.published, result.alreadyPresent], [false, false]);
  assert.equal(io.spawns.length, 1);
  assert.match(result.detail, /not a git repository/);
});

test('a push rejected as non-fast-forward is reported as unpublished rather than retried with force', () => {
  const io = recorder([
    { status: 0, stdout: '.git\n' },
    { status: 0, stdout: '' },
    { status: 0, stdout: `${BLOB}\n` },
    { status: 0, stdout: `${TREE}\n` },
    { status: 0, stdout: `${COMMIT}\n` },
    { status: 0, stdout: '' },
    { status: 1, stdout: '', stderr: '! [rejected] non-fast-forward' },
  ]);
  const result = publishManifest(request(), io);
  assert.equal(result.published, false);
  assert.equal(io.spawns.length, 7, 'the run retried a rejected identity push');
  assert.match(result.detail, /non-fast-forward/);
});

test('a remote that landed a different commit than the one composed is reported as a failed publish', () => {
  const io = recorder([...HAPPY.slice(0, 7), { status: 0, stdout: `9999999999999999999999999999999999999999\t${REF}\n` }, { status: 0, stdout: PAYLOAD }]);
  const result = publishManifest(request(), io);
  assert.equal(result.published, false);
  assert.match(result.detail, /9999999999999999999999999999999999999999/);
});

test('a payload that did not round-trip through the remote is reported as a failed publish', () => {
  const io = recorder([...HAPPY.slice(0, 8), { status: 0, stdout: '{"msps":[]}' }]);
  const result = publishManifest(request(), io);
  assert.equal(result.published, false);
  assert.match(result.detail, /round/);
});

test('a payload path that would land outside the repository is refused rather than written', () => {
  const io = recorder(HAPPY);
  const result = publishManifest(request({ repoRoot: 'relative/repo' }), io);
  assert.equal(result.published, false);
  assert.equal(io.writes.length, 0);
  assert.match(result.detail, /absolute/);
});

test('a request missing any field it needs is refused before any child starts', () => {
  for (const field of ['repoRoot', 'manifestRef', 'logicalRunId', 'payload']) {
    const io = recorder(HAPPY);
    const result = publishManifest(request({ [field]: '' }), io);
    assert.equal(result.published, false, `${field} was accepted as empty`);
    assert.equal(io.spawns.length, 0, `${field} was accepted and a child started`);
  }
});

test('a run identity outside the published-manifest namespace is refused before any child starts', () => {
  const outside = [
    'refs/heads/brandnew',
    'refs/tags/v1',
    'refs/mitosis-manifestation/aaaa1111/0123456789abcdef',
    'mitosis-manifest/aaaa1111/0123456789abcdef',
    `${MANIFEST_REF_NAMESPACE}../heads/main`,
    `${MANIFEST_REF_NAMESPACE}-upload-pack`,
  ];
  for (const manifestRef of outside) {
    const io = recorder(HAPPY);
    const result = publishManifest(request({ manifestRef }), io);
    assert.equal(result.published, false, `${manifestRef} was published`);
    assert.equal(result.alreadyPresent, false, `${manifestRef} was reported as an existing identity`);
    assert.equal(io.spawns.length, 0, `${manifestRef} started a child before it was refused`);
    assert.equal(io.writes.length, 0, `${manifestRef} wrote a payload before it was refused`);
  }
});

test('a run identity inside the namespace is still accepted, so the confinement is not wider than the namespace it names', () => {
  const io = recorder(HAPPY);
  const result = publishManifest(request({ manifestRef: `${MANIFEST_REF_NAMESPACE}bbbb2222/fedcba9876543210` }), io);
  assert.equal(result.published, true, result.detail);
});

test('the composed identity round-trips through real git, tree entry and all', () => {
  const root = mkdtempSync(join(tmpdir(), 'mitosis-c4b-mp-'));
  try {
    const work = join(root, 'work');
    const remote = join(root, 'remote.git');
    execFileSync('git', ['init', '-q', '--bare', remote]);
    execFileSync('git', ['init', '-q', '-b', 'main', work]);
    const git = (...argv) => execFileSync('git', ['-C', work, '-c', 'user.name=mitosis', '-c', 'user.email=mitosis@localhost', ...argv], { encoding: 'utf8' });
    git('remote', 'add', 'origin', remote);
    const result = publishManifest({ repoRoot: work, manifestRef: REF, logicalRunId: RUN, payload: PAYLOAD });
    assert.equal(result.published, true, result.detail);
    assert.equal(result.readBack, PAYLOAD);
    assert.equal(readFileSync(join(work, MANIFEST_PAYLOAD_DIRECTORY, MANIFEST_PAYLOAD_FILE), 'utf8'), PAYLOAD);
    assert.ok(statSync(join(work, MANIFEST_PAYLOAD_DIRECTORY)).isDirectory());
    const landed = execFileSync('git', ['-C', remote, 'cat-file', '-p', `${REF}:${MANIFEST_TREE_ENTRY}`], { encoding: 'utf8' });
    assert.equal(landed, PAYLOAD);
    const replayed = publishManifest({ repoRoot: work, manifestRef: REF, logicalRunId: RUN, payload: '{"msps":[]}' });
    assert.deepEqual([replayed.published, replayed.alreadyPresent], [false, true]);
    const unchanged = execFileSync('git', ['-C', remote, 'cat-file', '-p', `${REF}:${MANIFEST_TREE_ENTRY}`], { encoding: 'utf8' });
    assert.equal(unchanged, PAYLOAD, 'a replay rewrote a published run identity, which is exactly what write-once forbids');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
