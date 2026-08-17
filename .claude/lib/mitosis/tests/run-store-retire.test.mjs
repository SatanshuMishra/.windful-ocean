import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkpointRef } from '../checkpoint.mjs';
import { openRun, retire } from '../run-store.mjs';
import { VALID_KEY, cleanupScratch, failCli, listRefs, openArgs, runCli, sampleSpec, scratch, seedRepo } from './run-store-fixtures.mjs';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

function stubGit(answer) {
  const issued = [];
  const exec = (argv, cwd) => {
    issued.push(argv);
    if (argv[0] === 'rev-parse') return `${cwd}\n`;
    return answer(argv, cwd);
  };
  return { issued, exec };
}

test('retire removes only the run directory it targets', () => {
  const args = openArgs();
  const keep = 'c'.repeat(64);
  openRun(args).release();
  openRun(openArgs({ root: args.root, runKey: keep })).release();
  const runsDir = join(args.root, '.mitosis', 'runs');
  writeFileSync(join(args.root, 'sentinel'), 'must survive\n');
  const report = retire({ root: args.root, runKey: VALID_KEY });
  assert.equal(report.runDir.removed, true);
  assert.equal(report.runDir.path, join(runsDir, VALID_KEY));
  assert.equal(existsSync(join(runsDir, VALID_KEY)), false);
  assert.equal(existsSync(join(runsDir, keep, 'attempt-1', 'plan.json')), true);
  assert.deepEqual(readdirSync(runsDir), [keep]);
  assert.equal(readFileSync(join(args.root, 'sentinel'), 'utf8'), 'must survive\n');
  assert.equal(Object.isFrozen(report), true);
});

test('retire does not follow a symlink planted inside the run directory', () => {
  const args = openArgs();
  const outside = scratch('run-store-outside-');
  writeFileSync(join(outside, 'sentinel'), 'must survive\n');
  const handle = openRun(args);
  handle.release();
  symlinkSync(outside, join(handle.dir, 'escape'));
  retire({ root: args.root, runKey: VALID_KEY });
  assert.equal(existsSync(join(args.root, '.mitosis', 'runs', VALID_KEY)), false);
  assert.equal(readFileSync(join(outside, 'sentinel'), 'utf8'), 'must survive\n');
});

test('retire refuses a run directory whose lock is still held, and names the holder', () => {
  const args = openArgs();
  const handle = openRun(args);
  handle.recordStart('a3-run-store', { phase: 'dispatched' });
  assert.throws(() => retire({ root: args.root, runKey: VALID_KEY }), (error) => {
    assert.match(error.message, /lock/i);
    assert.match(error.message, /4242/);
    assert.match(error.message, /2026-08-12T09:00:00Z/);
    return true;
  });
  assert.equal(readFileSync(join(handle.itemsDir, 'a3-run-store.out'), 'utf8').includes('dispatched'), true);
  const forced = retire({ root: args.root, runKey: VALID_KEY, force: true });
  assert.equal(forced.runDir.removed, true);
  assert.equal(forced.runDir.lockWasHeld, true);
  assert.equal(existsSync(join(args.root, '.mitosis', 'runs', VALID_KEY)), false);
});

test('retire reports that no lock was held when the run had released it', () => {
  const args = openArgs();
  openRun(args).release();
  const report = retire({ root: args.root, runKey: VALID_KEY });
  assert.equal(report.runDir.removed, true);
  assert.equal(report.runDir.lockWasHeld, false);
  for (const bad of ['yes', 1, null]) {
    assert.throws(() => retire({ root: args.root, runKey: VALID_KEY, force: bad }), /force/);
  }
});

test('retire refuses to delete a run through a symbolic link planted on its path', () => {
  const root = scratch('run-store-retire-link-');
  const shared = scratch('run-store-retire-shared-');
  mkdirSync(join(shared, 'runs', VALID_KEY), { recursive: true });
  writeFileSync(join(shared, 'runs', VALID_KEY, 'sentinel'), 'must survive\n');
  symlinkSync(shared, join(root, '.mitosis'));
  assert.throws(() => retire({ root, runKey: VALID_KEY }), /symbolic link/i);
  assert.equal(readFileSync(join(shared, 'runs', VALID_KEY, 'sentinel'), 'utf8'), 'must survive\n');
});

test('retire validates the whole target before it destroys any part of it', () => {
  const args = openArgs();
  openRun(args).release();
  const runDir = join(args.root, '.mitosis', 'runs', VALID_KEY);
  assert.throws(() => retire({ root: args.root, runKey: VALID_KEY, repoRoot: '/tmp' }), /runId/);
  assert.equal(existsSync(runDir), true, 'a missing runId must be refused before the directory is removed');
  assert.throws(() => retire({ root: args.root, runKey: VALID_KEY, repoRoot: 'relative', runId: 'aaaaaaaa' }), /repoRoot/);
  assert.equal(existsSync(runDir), true, 'a malformed repoRoot must be refused before the directory is removed');
  assert.throws(() => retire({ root: args.root, runKey: VALID_KEY, repoRoot: '/tmp', runId: 'aaaaaaaa', exec: 'not a function' }), /exec/);
  assert.equal(existsSync(runDir), true, 'a malformed exec must be refused before the directory is removed');
});

test('a ref deletion failure reports the run directory it had already removed', () => {
  const args = openArgs();
  openRun(args).release();
  const { exec } = stubGit((argv) => {
    if (argv[0] === 'for-each-ref') return 'cafebabe refs/mitosis/aaaaaaaa/unit-one\n';
    throw new Error('the ref moved under us');
  });
  const runDir = join(args.root, '.mitosis', 'runs', VALID_KEY);
  assert.throws(
    () => retire({ root: args.root, runKey: VALID_KEY, repoRoot: '/tmp', runId: 'aaaaaaaa', exec }),
    (error) => {
      assert.match(error.message, new RegExp(runDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      assert.equal(error.runDir.removed, true);
      assert.equal(error.runDir.path, runDir);
      return true;
    },
  );
  assert.equal(existsSync(runDir), false);
});

test('retire reports a run directory that was already gone rather than throwing', () => {
  const root = scratch('run-store-retire-absent-');
  const report = retire({ root, runKey: VALID_KEY });
  assert.equal(report.runDir.removed, false);
  assert.deepEqual([...report.deletedRefs], []);
});

test('retire deletes only the ref namespaces of the run id it targets', () => {
  const target = 'aaaaaaaa';
  const other = 'bbbbbbbb';
  const doomed = [
    `refs/mitosis/${target}/unit-one`,
    `refs/mitosis/${target}/unit-two`,
    `refs/mitosis-manifest/${target}/${HASH_A}`,
  ];
  const extending = `${target}b`;
  const neighbouring = [
    `refs/mitosis/${other}/unit-one`,
    `refs/mitosis-manifest/${other}/${HASH_B}`,
    `refs/mitosis/${extending}/unit-one`,
    `refs/mitosis-manifest/${extending}/${HASH_B}`,
  ];
  const survivors = [
    ...neighbouring,
    'refs/heads/main',
    `refs/mitosisx/${target}/decoy`,
    `refs/mitosis-manifestx/${target}/decoy`,
  ];
  const repo = seedRepo([...doomed, ...survivors]);
  const report = retire({ repoRoot: repo, runId: target });
  assert.deepEqual([...report.deletedRefs], [...doomed].sort());
  assert.deepEqual(listRefs(repo), [...survivors].sort());
  assert.equal(report.runDir, null);
});

test('retire and checkpointRef agree on which run ids exist', () => {
  const repo = seedRepo(['refs/mitosis/aaaaaaaa/unit-one']);
  const candidates = ['aaaaaaaa', '0123abcd', 'AAAAAAAA', 'aaaaaaa', 'aaaaaaaaa', 'aaaa/aaaa', '..', '-aaaaaaa', ''];
  for (const candidate of candidates) {
    let mintable = true;
    try {
      checkpointRef(candidate, 'unit-one');
    } catch {
      mintable = false;
    }
    let retirable = true;
    try {
      retire({ repoRoot: repo, runId: candidate });
    } catch (error) {
      if (!/runId/.test(error.message)) throw error;
      retirable = false;
    }
    assert.equal(retirable, mintable, `checkpointRef and retire disagree about run id ${JSON.stringify(candidate)}`);
  }
});

test('retire refuses a ref name git could read as an option', () => {
  const { issued, exec } = stubGit((argv) => (
    argv[0] === 'for-each-ref' ? 'deadbeef refs/mitosis/aaaaaaaa/-evil\ndeadbeef refs/mitosis/aaaaaaaa/unit-one\n' : ''
  ));
  assert.throws(() => retire({ repoRoot: '/tmp', runId: 'aaaaaaaa', exec }), /-evil/);
  assert.deepEqual(issued.filter((argv) => argv[0] === 'update-ref'), []);
});

test('retire reports a failed ref deletion instead of dropping it', () => {
  const { exec } = stubGit((argv) => {
    if (argv[0] === 'for-each-ref') return 'deadbeef refs/mitosis/aaaaaaaa/unit-one\ndeadbeef refs/mitosis/aaaaaaaa/unit-two\n';
    if (argv[2] === 'refs/mitosis/aaaaaaaa/unit-two') throw new Error('the ref moved under us');
    return '';
  });
  assert.throws(() => retire({ repoRoot: '/tmp', runId: 'aaaaaaaa', exec }), (error) => {
    assert.match(error.message, /refs\/mitosis\/aaaaaaaa\/unit-two/);
    assert.match(error.message, /refs\/mitosis\/aaaaaaaa\/unit-one/);
    return true;
  });
});

test('retire deletes each ref against the object it enumerated', () => {
  const { issued, exec } = stubGit((argv) => (argv[0] === 'for-each-ref' ? 'cafebabe refs/mitosis/aaaaaaaa/unit-one\n' : ''));
  retire({ repoRoot: '/tmp', runId: 'aaaaaaaa', exec });
  assert.deepEqual(
    issued.filter((argv) => argv[0] === 'update-ref'),
    [['update-ref', '-d', 'refs/mitosis/aaaaaaaa/unit-one', 'cafebabe']],
  );
});

test('retire deletes refs in the repository it names, not the one the environment points at', () => {
  const target = seedRepo(['refs/mitosis/aaaaaaaa/unit-one', 'refs/heads/main']);
  const ambient = seedRepo(['refs/mitosis/aaaaaaaa/unit-one', 'refs/heads/main']);
  runCli(['retire', '--repo', target, '--run-id', 'aaaaaaaa'], { env: { ...process.env, GIT_DIR: join(ambient, '.git') } });
  assert.deepEqual(listRefs(target), ['refs/heads/main']);
  assert.deepEqual(listRefs(ambient), ['refs/heads/main', 'refs/mitosis/aaaaaaaa/unit-one']);
});

test('retire refuses a repoRoot that is not the root of the repository it would delete from', () => {
  const repo = seedRepo(['refs/mitosis/aaaaaaaa/unit-one', 'refs/heads/main']);
  const nested = join(repo, 'deep', 'nested');
  mkdirSync(nested, { recursive: true });
  assert.throws(() => retire({ repoRoot: nested, runId: 'aaaaaaaa' }), /repository root/i);
  assert.deepEqual(listRefs(repo), ['refs/heads/main', 'refs/mitosis/aaaaaaaa/unit-one']);
});

test('retire asks git only for the refs of the run it targets', () => {
  const { issued, exec } = stubGit((argv) => (argv[0] === 'for-each-ref' ? 'cafebabe refs/mitosis/aaaaaaaa/unit-one\n' : ''));
  retire({ repoRoot: '/tmp', runId: 'aaaaaaaa', exec });
  const query = issued.find((argv) => argv[0] === 'for-each-ref');
  assert.deepEqual(query.slice(2), ['refs/mitosis/aaaaaaaa', 'refs/mitosis-manifest/aaaaaaaa']);
});

test('retire halts on a listed ref it cannot account for rather than skipping it', () => {
  const { issued, exec } = stubGit((argv) => (
    argv[0] === 'for-each-ref' ? 'cafebabe refs/mitosis/aaaaaaaa/unit-one\ncafebabe refs/mitosis/bbbbbbbb/unit-one\n' : ''
  ));
  assert.throws(() => retire({ repoRoot: '/tmp', runId: 'aaaaaaaa', exec }), /refs\/mitosis\/bbbbbbbb\/unit-one/);
  assert.deepEqual(issued.filter((argv) => argv[0] === 'update-ref'), []);
});

test('retire requires at least one target', () => {
  for (const target of [{}, { exec: () => '' }]) {
    assert.throws(() => retire(target), /run-store/, `expected ${JSON.stringify(Object.keys(target))} to be refused`);
  }
  for (const bad of [null, undefined, [], 'x']) assert.throws(() => retire(bad), /run-store/);
  for (const partial of [{ root: '/tmp' }, { repoRoot: '/tmp' }, { runKey: VALID_KEY }, { runId: 'aaaaaaaa' }]) {
    assert.throws(() => retire(partial), /run-store/, `expected the half-named target ${JSON.stringify(Object.keys(partial))} to be refused`);
  }
});

test('retire refuses a runKey containing a path traversal', () => {
  const root = scratch('run-store-retire-traversal-');
  mkdirSync(join(root, '.mitosis', 'runs'), { recursive: true });
  writeFileSync(join(root, 'sentinel'), 'must survive\n');
  for (const bad of ['../../..', `../../${VALID_KEY}`, 'A'.repeat(64)]) {
    assert.throws(() => retire({ root, runKey: bad }), /runKey/);
  }
  assert.equal(readFileSync(join(root, 'sentinel'), 'utf8'), 'must survive\n');
  assert.equal(existsSync(join(root, '.mitosis', 'runs')), true);
});

test('CLI retire verb removes the targeted run directory and prints its report', () => {
  const args = openArgs();
  openRun(args).release();
  const stdout = runCli(['retire', '--root', args.root, '--run-key', VALID_KEY]);
  assert.equal(JSON.parse(stdout).runDir.removed, true);
  assert.equal(existsSync(join(args.root, '.mitosis', 'runs', VALID_KEY)), false);
});

test('CLI retire verb exits 2 when it is given no target or only half of one', () => {
  const dir = scratch('run-store-cli-half-');
  for (const args of [
    ['retire'],
    ['retire', '--root', dir],
    ['retire', '--run-key', VALID_KEY],
    ['retire', '--repo', dir],
    ['retire', '--run-id', 'aaaaaaaa'],
    ['retire', '--root', dir, '--run-key', VALID_KEY, '--repo', dir],
  ]) {
    const failed = failCli(args);
    assert.equal(failed.status, 2, `expected exit 2 for ${JSON.stringify(args)}`);
    assert.match(failed.stderr, /usage:/);
  }
});

test('CLI retire verb refuses a held lock until --force is given', () => {
  const dir = scratch('run-store-cli-force-');
  const root = scratch('run-store-cli-force-root-');
  const specPath = join(dir, 'spec.json');
  const spec = sampleSpec();
  writeFileSync(specPath, JSON.stringify(spec));
  const opened = JSON.parse(runCli(['open', specPath, '--root', root, '--started-at', '2026-08-12T09:00:00Z', '--unit', 'a3-run-store']));
  const failed = failCli(['retire', '--root', root, '--run-key', opened.runKey]);
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /^run-store error: .*lock/mi);
  const report = JSON.parse(runCli(['retire', '--root', root, '--run-key', opened.runKey, '--force']));
  assert.equal(report.runDir.removed, true);
  assert.equal(report.runDir.lockWasHeld, true);
});

after(cleanupScratch);
