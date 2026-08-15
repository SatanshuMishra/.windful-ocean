import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as dispatch from '../dispatch.mjs';
import * as generateRunScript from '../generate-run-script.mjs';
import * as runStore from '../run-store.mjs';
import * as pr from '../../git/pr.mjs';

const LIB_ROOT = fileURLToPath(new URL('../../', import.meta.url));

const CHILD_PROCESS_IMPORT = /^[ \t]*import\s[\s\S]*?from\s*['"]node:child_process['"]/m;
const CHILD_PROCESS_REQUIRE = /^[ \t]*(?:const|let|var)\s[\s\S]*?require\(\s*['"]node:child_process['"]\s*\)/m;
const CHILD_PROCESS_DYNAMIC = /[^\w'"`]import\(\s*['"]node:child_process['"]\s*\)/;
const POLICY_IMPORT = /^[ \t]*import\s[\s\S]*?from\s*['"][^'"]*exec-policy\.mjs['"]/m;
const POLICY_CALL = /\bassertSpawnAllowed\s*\(|\bresolveSpawn\s*\(/;

const HARNESS_SEGMENT = 'tests';

const SPAWN_EXCEPTIONS = Object.freeze({
  'mitosis/gh-merge-shim.mjs': 'the merge shim is the enforcement backstop exec-policy routes every gh call through: it re-reads the argv with real filesystem access and spawns the resolved real gh binary itself, so routing it back through the policy would make the second layer depend on the first one it exists to backstop',
});

const REFUSALS = Object.freeze([
  Object.freeze({
    label: 'an unlisted binary',
    binary: 'bash',
    message: 'exec-policy: "bash" is not spawnable; the policy is deny-by-default and the only spawnable binaries are claude, gh, git, graphify, node',
  }),
  Object.freeze({
    label: 'a path-qualified binary',
    binary: '/bin/sh',
    message: 'exec-policy: refusing to spawn "/bin/sh"; the allowlist names bare binaries, so a path-qualified spelling would walk straight past a basename comparison',
  }),
]);

function filesUnder(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...filesUnder(full));
      continue;
    }
    if (entry.isFile()) found.push(full);
  }
  return found;
}

function importsChildProcess(source) {
  return CHILD_PROCESS_IMPORT.test(source) || CHILD_PROCESS_REQUIRE.test(source) || CHILD_PROCESS_DYNAMIC.test(source);
}

function classOf(path, source) {
  if (path.split('/').includes(HARNESS_SEGMENT)) return 'harness';
  if (POLICY_IMPORT.test(source) && POLICY_CALL.test(source)) return 'routed';
  if (Object.hasOwn(SPAWN_EXCEPTIONS, path)) return 'exception';
  return null;
}

function census() {
  return filesUnder(LIB_ROOT)
    .map((full) => ({ path: relative(LIB_ROOT, full).split(sep).join('/'), source: readFileSync(full, 'utf8') }))
    .filter((entry) => importsChildProcess(entry.source))
    .map((entry) => Object.freeze({ path: entry.path, membership: classOf(entry.path, entry.source) }))
    .sort((left, right) => (left.path < right.path ? -1 : 1));
}

function scratchMarker(name) {
  return join(mkdtempSync(join(tmpdir(), 'spawn-chokepoint-')), name);
}

function shellArgv(marker) {
  return ['-c', `printf x > "${marker}"`];
}

function refusesExactly(call, expected, marker) {
  assert.throws(call, (error) => {
    assert.equal(error.message, expected);
    return true;
  });
  if (marker !== undefined) assert.equal(existsSync(marker), false, `a child started before the refusal and wrote ${marker}`);
}

test('the spawn-site census classifies every node:child_process import under .claude/lib and halts on one it cannot place', () => {
  const sites = census();
  assert.ok(sites.length > 0, 'the census found no child_process import at all, so it is reading the wrong tree');
  const unclassified = sites.filter((entry) => entry.membership === null).map((entry) => entry.path);
  assert.deepEqual(unclassified, [], `spawn sites that consult no spawn policy and carry no declared exception: ${unclassified.join(', ')}`);
  const stale = Object.keys(SPAWN_EXCEPTIONS).filter((path) => !sites.some((entry) => entry.path === path));
  assert.deepEqual(stale, [], `declared spawn exceptions naming a file that no longer imports node:child_process: ${stale.join(', ')}`);
  const unreasoned = Object.entries(SPAWN_EXCEPTIONS).filter(([, reason]) => typeof reason !== 'string' || reason.length === 0).map(([path]) => path);
  assert.deepEqual(unreasoned, [], `declared spawn exceptions carrying no reason: ${unreasoned.join(', ')}`);
});

test('the spawn-site census places the enforcement backstop as a reasoned exception rather than an unrouted site', () => {
  const shim = census().find((entry) => entry.path === 'mitosis/gh-merge-shim.mjs');
  assert.notEqual(shim, undefined, 'the merge shim no longer imports node:child_process, so its exception is stale');
  assert.equal(shim.membership, 'exception');
});

for (const probe of REFUSALS) {
  test(`run-store refuses ${probe.label} before any child starts`, () => {
    const guard = runStore.execAllowed;
    assert.equal(typeof guard, 'function', 'run-store exposes no guarded exec surface, so its git spawn consults no policy');
    const marker = scratchMarker('run-store');
    refusesExactly(() => guard(probe.binary, shellArgv(marker), undefined), probe.message, marker);
  });

  test(`generate-run-script refuses ${probe.label} before any child starts`, () => {
    const guard = generateRunScript.execAllowed;
    assert.equal(typeof guard, 'function', 'generate-run-script exposes no guarded exec surface, so its git spawns consult no policy');
    const marker = scratchMarker('generate-run-script');
    refusesExactly(() => guard(probe.binary, shellArgv(marker), undefined), probe.message, marker);
  });

  test(`dispatch refuses ${probe.label} before any child starts`, () => {
    const guard = dispatch.spawnAllowed;
    assert.equal(typeof guard, 'function', 'dispatch exposes no guarded spawn surface, so its cli spawn consults no policy');
    const started = [];
    const record = (binary, argv, options) => {
      started.push({ binary, argv, options });
      return {};
    };
    refusesExactly(() => guard(probe.binary, ['--print'], { shell: false }, record), probe.message);
    assert.deepEqual(started, [], 'the injected spawn was reached despite the refusal');
  });

  test(`mitosis-git refuses ${probe.label} before any child starts`, () => {
    const guard = pr.spawnAllowed;
    assert.equal(typeof guard, 'function', 'mitosis-git exposes no guarded spawn surface, so its gh spawn consults no policy');
    const marker = scratchMarker('mitosis-git');
    refusesExactly(() => guard(probe.binary, shellArgv(marker), { encoding: 'utf8' }, '/bin/sh'), probe.message, marker);
  });
}

test('mitosis-git refuses an executable that is not an absolute path, so no PATH lookup decides which file runs', () => {
  const guard = pr.spawnAllowed;
  assert.equal(typeof guard, 'function', 'mitosis-git exposes no guarded spawn surface, so its gh spawn consults no policy');
  const marker = scratchMarker('mitosis-git-relative');
  refusesExactly(
    () => guard('gh', shellArgv(marker), { encoding: 'utf8' }, 'sh'),
    'mitosis-git: refusing to spawn "gh" through "sh"; the resolved executable must be an absolute path so that no PATH lookup decides which file runs',
    marker,
  );
});

test('every guarded spawn surface still starts the binary the policy allows', () => {
  const started = [];
  const record = (binary, argv, options) => {
    started.push({ binary, argv, options });
    return { pid: 1 };
  };
  assert.equal(typeof dispatch.spawnAllowed, 'function', 'dispatch exposes no guarded spawn surface');
  dispatch.spawnAllowed('claude', ['--print'], { shell: false }, record);
  assert.deepEqual(started, [{ binary: 'claude', argv: ['--print'], options: { shell: false } }]);
  assert.equal(typeof runStore.execAllowed, 'function', 'run-store exposes no guarded exec surface');
  assert.match(runStore.execAllowed('git', ['--version'], undefined), /^git version /);
  assert.equal(typeof generateRunScript.execAllowed, 'function', 'generate-run-script exposes no guarded exec surface');
  assert.match(generateRunScript.execAllowed('git', ['--version'], undefined), /^git version /);
});
