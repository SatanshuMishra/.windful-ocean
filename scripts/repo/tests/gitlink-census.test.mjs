import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../../..', import.meta.url));
const GITLINK_MODE = '160000';
const GITMODULES = '.gitmodules';
const SUBMODULE_FIELD = /^submodule\.(.+)\.(path|url)$/;

const FIXTURE_ENV = Object.freeze({
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_AUTHOR_NAME: 'gitlink census fixture',
  GIT_AUTHOR_EMAIL: 'fixture@invalid',
  GIT_COMMITTER_NAME: 'gitlink census fixture',
  GIT_COMMITTER_EMAIL: 'fixture@invalid',
});

function runGit(cwd, args, env) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env });
  if (result.error) {
    assert.fail(`git ${args.join(' ')} could not be spawned in ${cwd}: ${result.error.message}`);
  }
  return result;
}

function gitOutput(cwd, args, env) {
  const result = runGit(cwd, args, env);
  assert.equal(
    result.status,
    0,
    `git ${args.join(' ')} exited ${result.status} in ${cwd}, so the gitlink census cannot be taken: ${result.stderr.trim()}`,
  );
  return result.stdout;
}

function nulRecords(stdout) {
  return stdout.split('\0').filter((record) => record !== '');
}

function treeEntries(cwd, rev, env) {
  return nulRecords(gitOutput(cwd, ['ls-tree', '-r', '-z', rev], env)).map((record) => {
    const tab = record.indexOf('\t');
    assert.ok(tab > 0, `git ls-tree emitted a record with no path separator, so it cannot be classified: ${JSON.stringify(record)}`);
    return { mode: record.slice(0, tab).split(' ')[0], path: record.slice(tab + 1) };
  });
}

function gitlinkPaths(entries) {
  return entries.filter((entry) => entry.mode === GITLINK_MODE).map((entry) => entry.path).sort();
}

function submoduleSections(cwd, rev, entries, env) {
  const sections = new Map();
  if (!entries.some((entry) => entry.path === GITMODULES)) return sections;
  for (const record of nulRecords(gitOutput(cwd, ['config', `--blob=${rev}:${GITMODULES}`, '--list', '-z'], env))) {
    const newline = record.indexOf('\n');
    const field = (newline < 0 ? record : record.slice(0, newline)).match(SUBMODULE_FIELD);
    if (!field) continue;
    const previous = sections.get(field[1]) ?? {};
    sections.set(field[1], { ...previous, [field[2]]: newline < 0 ? '' : record.slice(newline + 1) });
  }
  return sections;
}

function censusFailures(gitlinks, sections) {
  const rows = [...sections.entries()];
  const malformed = rows
    .filter(([, fields]) => !fields.path || !fields.url)
    .map(([name, fields]) => `submodule.${name} (path=${fields.path || 'absent'}, url=${fields.url || 'absent'})`)
    .sort();
  const registered = rows.filter(([, fields]) => fields.path && fields.url).map(([, fields]) => fields.path);
  const unregistered = gitlinks.filter((path) => !registered.includes(path));
  const stale = registered.filter((path) => !gitlinks.includes(path)).sort();
  const failures = [];
  if (unregistered.length > 0) {
    failures.push(
      `these mode-${GITLINK_MODE} gitlinks have no ${GITMODULES} section supplying both a path and a url, so git submodule foreach --recursive aborts on them and actions/checkout fails its auth steps: ${unregistered.join(', ')} — untrack each with git rm --cached if it is not a submodule, or register it in ${GITMODULES}.`,
    );
  }
  if (stale.length > 0) {
    failures.push(
      `these ${GITMODULES} sections are stale, registering paths the tree no longer carries as a mode-${GITLINK_MODE} gitlink: ${stale.join(', ')} — delete the section, or restore the gitlink it describes.`,
    );
  }
  if (malformed.length > 0) {
    failures.push(
      `these ${GITMODULES} sections cannot be matched to a gitlink because a required field is absent: ${malformed.join(', ')} — supply both path and url, or delete the section.`,
    );
  }
  return failures;
}

function fixtureRepo(t) {
  const dir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), 'gitlink-census-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  gitOutput(dir, ['init', '-q'], FIXTURE_ENV);
  writeFileSync(join(dir, 'tracked.txt'), 'tracked\n');
  gitOutput(dir, ['add', 'tracked.txt'], FIXTURE_ENV);
  gitOutput(dir, ['commit', '-q', '-m', 'base'], FIXTURE_ENV);
  const sha = gitOutput(dir, ['rev-parse', 'HEAD'], FIXTURE_ENV).trim();
  gitOutput(dir, ['update-index', '--add', '--cacheinfo', `${GITLINK_MODE},${sha},plugin`], FIXTURE_ENV);
  gitOutput(dir, ['commit', '-q', '-m', 'gitlink'], FIXTURE_ENV);
  return dir;
}

function repoCensusFailures() {
  const entries = treeEntries(REPO, 'HEAD');
  return censusFailures(gitlinkPaths(entries), submoduleSections(REPO, 'HEAD', entries));
}

test('git submodule foreach --recursive succeeds in this checkout, as actions/checkout requires', () => {
  const result = runGit(REPO, ['submodule', 'foreach', '--recursive', 'true']);
  assert.equal(
    result.status,
    0,
    `git submodule foreach --recursive exited ${result.status}; actions/checkout runs this command while installing and removing its auth header, and a non-zero exit fails the checkout step: ${result.stderr.trim()}`,
  );
});

test('every gitlink in the committed tree is registered in .gitmodules', () => {
  const failures = repoCensusFailures();
  assert.deepEqual(failures, [], failures.join('\n'));
});

test('an unregistered gitlink aborts git submodule foreach and the census names it', (t) => {
  const dir = fixtureRepo(t);
  const foreach = runGit(dir, ['submodule', 'foreach', '--recursive', 'true'], FIXTURE_ENV);
  assert.notEqual(foreach.status, 0, 'the fixture did not reproduce the checkout abort, so the census has nothing to track');
  assert.match(foreach.stderr, /No url found for submodule path 'plugin'/);
  const entries = treeEntries(dir, 'HEAD', FIXTURE_ENV);
  assert.deepEqual(gitlinkPaths(entries), ['plugin']);
  const failures = censusFailures(gitlinkPaths(entries), submoduleSections(dir, 'HEAD', entries, FIXTURE_ENV));
  assert.equal(failures.length, 1, failures.join('\n'));
  assert.match(failures[0], /gitlinks have no \.gitmodules section supplying both a path and a url/);
  assert.match(failures[0], /auth steps: plugin —/);
});

test('registering the gitlink url clears both the foreach abort and the census', (t) => {
  const dir = fixtureRepo(t);
  writeFileSync(join(dir, GITMODULES), '[submodule "plugin"]\n\tpath = plugin\n\turl = ./plugin\n');
  gitOutput(dir, ['add', GITMODULES], FIXTURE_ENV);
  gitOutput(dir, ['commit', '-q', '-m', 'register'], FIXTURE_ENV);
  const foreach = runGit(dir, ['submodule', 'foreach', '--recursive', 'true'], FIXTURE_ENV);
  assert.equal(foreach.status, 0, foreach.stderr.trim());
  const entries = treeEntries(dir, 'HEAD', FIXTURE_ENV);
  assert.deepEqual(gitlinkPaths(entries), ['plugin']);
  assert.deepEqual(censusFailures(gitlinkPaths(entries), submoduleSections(dir, 'HEAD', entries, FIXTURE_ENV)), []);
});

test('untracking the gitlink clears both the foreach abort and the census', (t) => {
  const dir = fixtureRepo(t);
  gitOutput(dir, ['rm', '--cached', '-q', 'plugin'], FIXTURE_ENV);
  gitOutput(dir, ['commit', '-q', '-m', 'untrack'], FIXTURE_ENV);
  const foreach = runGit(dir, ['submodule', 'foreach', '--recursive', 'true'], FIXTURE_ENV);
  assert.equal(foreach.status, 0, foreach.stderr.trim());
  const entries = treeEntries(dir, 'HEAD', FIXTURE_ENV);
  assert.deepEqual(gitlinkPaths(entries), []);
  assert.deepEqual(censusFailures(gitlinkPaths(entries), submoduleSections(dir, 'HEAD', entries, FIXTURE_ENV)), []);
});

test('a .gitmodules section for a path the tree no longer carries as a gitlink is reported stale', () => {
  const failures = censusFailures([], new Map([['plugin', { path: 'plugin', url: './plugin' }]]));
  assert.equal(failures.length, 1, failures.join('\n'));
  assert.match(failures[0], /stale, registering paths the tree no longer carries.*: plugin/);
});

test('a .gitmodules section missing its url leaves the gitlink unregistered and the section malformed', () => {
  const failures = censusFailures(['plugin'], new Map([['plugin', { path: 'plugin' }]]));
  assert.equal(failures.length, 2, failures.join('\n'));
  assert.match(failures[0], /auth steps: plugin —/);
  assert.match(failures[1], /submodule\.plugin \(path=plugin, url=absent\)/);
});
