import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const libPath = fileURLToPath(new URL('../graphify-common.sh', import.meta.url));
const refreshPath = fileURLToPath(new URL('../graphify-refresh.sh', import.meta.url));
const provisionPath = fileURLToPath(new URL('../graphify-provision.sh', import.meta.url));

const BUILT_AT = 1_700_000_000;
const BEFORE_THE_GRAPH = BUILT_AT - 60;
const AFTER_THE_GRAPH = BUILT_AT + 60;

const RECORDS_ITS_RUN = '#!/usr/bin/env bash\nprintf "%s\\n" "$2" >> "$REBUILDS"\n';
const HANGS_SILENTLY_WITH_A_CHILD = '#!/usr/bin/env bash\nsleep 300 &\nprintf "%s %s\\n" "$$" "$!" > "$STARTED"\nsleep 300\n';
const HANGS_AND_IGNORES_A_REQUEST_TO_STOP = '#!/usr/bin/env bash\ntrap "" TERM\nprintf "%s\\n" "$$" > "$STARTED"\nsleep 100000\n';
const LONGEST_LAUNCH_MS = 30_000;
const PRINTS_PAST_THE_LIMIT = '#!/usr/bin/env bash\nfor step in 1 2 3 4 5 6 7 8 9 10 11 12 13 14; do echo "step $step"; sleep 0.25; done\nprintf done > "$FINISHED"\n';

function git(repo, args) {
  const result = spawnSync('git', ['-C', repo, ...args], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      HOME: dirname(repo),
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_NAME: 'tester',
      GIT_AUTHOR_EMAIL: 'tester@example.invalid',
      GIT_COMMITTER_NAME: 'tester',
      GIT_COMMITTER_EMAIL: 'tester@example.invalid',
    },
  });
  assert.equal(result.status, 0, `git ${args.join(' ')} exited ${result.status}: ${result.stderr}`);
  return result.stdout.trim();
}

function writeAt(path, seconds, text = 'content\n') {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  utimesSync(path, seconds, seconds);
}

function project(t, files) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'graphify-refresh-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const home = join(dir, 'home');
  const repo = join(dir, 'project');
  const bin = join(dir, 'bin');
  for (const made of [home, repo, bin]) mkdirSync(made, { recursive: true });
  git(repo, ['init', '-q']);
  for (const [relative, text] of Object.entries(files)) writeAt(join(repo, relative), BEFORE_THE_GRAPH, text);
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-q', '-m', 'start']);
  for (const relative of Object.keys(files)) utimesSync(join(repo, relative), BEFORE_THE_GRAPH, BEFORE_THE_GRAPH);
  writeAt(join(repo, 'graphify-out', 'graph.json'), BUILT_AT, '{"nodes": [{"id": "a"}]}\n');
  const rebuilds = join(dir, 'rebuilds');
  const env = {
    PATH: `${bin}:${process.env.PATH}`,
    HOME: home,
    TMPDIR: `${dir}/`,
    CLAUDE_PROJECT_DIR: repo,
    GRAPHIFY_DENY_ROOTS: '',
    REBUILDS: rebuilds,
  };
  const standIn = (script) => writeFileSync(join(bin, 'graphify'), script, { mode: 0o755 });
  standIn(RECORDS_ITS_RUN);
  return { dir, repo, out: join(repo, 'graphify-out'), env, rebuilds, standIn };
}

function runHook(hookPath, env) {
  const result = spawnSync('bash', ['-c', 'trap wait EXIT\n. "$1"', 'graphify-hook-under-test', hookPath], { encoding: 'utf8', env });
  assert.equal(result.status, 0, `the hook exited ${result.status}: ${result.stderr}`);
  return result;
}

function rebuildsAfterRefresh(made) {
  runHook(refreshPath, made.env);
  return existsSync(made.rebuilds) ? readFileSync(made.rebuilds, 'utf8').trim().split('\n') : [];
}

function launch(made, extraEnv = {}) {
  const body = `graphify_launch ${JSON.stringify(made.repo)} ${JSON.stringify(join(made.dir, 'launch.log'))} ${JSON.stringify(made.out)}\nwait`;
  const result = spawnSync('bash', ['-c', `set -euo pipefail\n. "$1"\n${body}\n`, 'graphify-lib-under-test', libPath], {
    encoding: 'utf8',
    env: { ...made.env, ...extraEnv },
    timeout: LONGEST_LAUNCH_MS,
    killSignal: 'SIGKILL',
  });
  assert.equal(result.status, 0, `bash exited ${result.status} (${result.signal ?? 'no signal'}): ${result.stderr}`);
}

function health(made) {
  return JSON.parse(readFileSync(join(made.out, '.graphify_health.json'), 'utf8'));
}

function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

test('a tracked file changed after the graph was built starts a rebuild of the repository', (t) => {
  const made = project(t, { 'src/app.py': 'print(1)\n' });
  utimesSync(join(made.repo, 'src/app.py'), AFTER_THE_GRAPH, AFTER_THE_GRAPH);
  assert.deepEqual(rebuildsAfterRefresh(made), [made.repo]);
});

test('a new file git does not ignore starts a rebuild', (t) => {
  const made = project(t, { 'src/app.py': 'print(1)\n' });
  writeAt(join(made.repo, 'src/added.py'), AFTER_THE_GRAPH);
  assert.deepEqual(rebuildsAfterRefresh(made), [made.repo]);
});

test('a repository with nothing newer than its graph starts no rebuild', (t) => {
  const made = project(t, { 'src/app.py': 'print(1)\n' });
  assert.deepEqual(rebuildsAfterRefresh(made), []);
});

test('files git ignores start no rebuild, because the graph never holds them', (t) => {
  const made = project(t, { 'src/app.py': 'print(1)\n', '.gitignore': 'logs/\nnode_modules/\n' });
  writeAt(join(made.repo, 'logs/run.log'), AFTER_THE_GRAPH);
  writeAt(join(made.repo, 'node_modules/left-pad/index.js'), AFTER_THE_GRAPH);
  assert.deepEqual(rebuildsAfterRefresh(made), []);
});

test('tracked files under folders the graph never indexes start no rebuild', (t) => {
  const never = ['dist/bundle.js', 'packages/web/build/main.js', 'vendor/node_modules/pad/index.js', '.venv/lib/site.py'];
  const made = project(t, { 'src/app.py': 'print(1)\n', ...Object.fromEntries(never.map((relative) => [relative, 'made\n'])) });
  for (const relative of never) writeAt(join(made.repo, relative), AFTER_THE_GRAPH);
  assert.deepEqual(rebuildsAfterRefresh(made), []);
});

test('a tracked file that only shares its name with such a folder still starts a rebuild', (t) => {
  const made = project(t, { 'scripts/build': 'make all\n' });
  writeAt(join(made.repo, 'scripts/build'), AFTER_THE_GRAPH);
  assert.deepEqual(rebuildsAfterRefresh(made), [made.repo]);
});

test('a new file whose name the hook cannot print still starts a rebuild', (t) => {
  const made = project(t, { 'src/app.py': 'print(1)\n' });
  writeAt(join(made.repo, 'src/caf\u00e9.py'), AFTER_THE_GRAPH);
  assert.deepEqual(rebuildsAfterRefresh({ ...made, env: { ...made.env, PYTHONIOENCODING: 'ascii' } }), [made.repo]);
});

test('files under an output folder start no rebuild even where git does not ignore the folder', (t) => {
  const made = project(t, { 'src/app.py': 'print(1)\n' });
  writeAt(join(made.out, 'graph.html'), AFTER_THE_GRAPH);
  writeAt(join(made.repo, 'packages/api/graphify-out/graph.json'), AFTER_THE_GRAPH);
  assert.deepEqual(rebuildsAfterRefresh(made), []);
});

test('files under an output folder named by GRAPHIFY_OUT start no rebuild', (t) => {
  const made = project(t, { 'src/app.py': 'print(1)\n' });
  writeAt(join(made.repo, 'kept-graph', 'graph.json'), BUILT_AT, '{"nodes": [{"id": "a"}]}\n');
  writeAt(join(made.repo, 'kept-graph', 'graph.html'), AFTER_THE_GRAPH);
  assert.deepEqual(rebuildsAfterRefresh({ ...made, env: { ...made.env, GRAPHIFY_OUT: 'kept-graph' } }), []);
});

test('a rebuild that prints nothing for the stall limit is ended with every process it started, and its health records the stall', (t) => {
  const made = project(t, { 'src/app.py': 'print(1)\n' });
  const started = join(made.dir, 'started');
  made.standIn(HANGS_SILENTLY_WITH_A_CHILD);
  launch(made, { GRAPHIFY_STALL_SECONDS: '1', STARTED: started });
  const pids = readFileSync(started, 'utf8').trim().split(' ').map(Number);
  t.after(() => pids.filter(isRunning).forEach((pid) => process.kill(pid, 'SIGKILL')));
  assert.equal(pids.length, 2);
  assert.deepEqual(pids.filter(isRunning), []);
  assert.equal(health(made).status, 'stalled');
  assert.equal(health(made).stalled_at_commit, git(made.repo, ['rev-parse', 'HEAD']));
  assert.equal(existsSync(join(made.out, '.hook.lock')), false);
});

test('a silent rebuild that ignores the request to stop is ended all the same', (t) => {
  const made = project(t, { 'src/app.py': 'print(1)\n' });
  const started = join(made.dir, 'started');
  made.standIn(HANGS_AND_IGNORES_A_REQUEST_TO_STOP);
  const startedPid = () => Number(readFileSync(started, 'utf8').trim());
  t.after(() => existsSync(started) && isRunning(startedPid()) && process.kill(-startedPid(), 'SIGKILL'));
  launch(made, { GRAPHIFY_STALL_SECONDS: '1', STARTED: started });
  assert.equal(isRunning(startedPid()), false, 'the rebuild outlived its stall limit');
  assert.equal(health(made).status, 'stalled');
});

test('a rebuild that keeps printing runs past the stall limit to its end', (t) => {
  const made = project(t, { 'src/app.py': 'print(1)\n' });
  const finished = join(made.dir, 'finished');
  made.standIn(PRINTS_PAST_THE_LIMIT);
  launch(made, { GRAPHIFY_STALL_SECONDS: '2', FINISHED: finished });
  assert.equal(existsSync(finished), true, 'the rebuild was ended while it was still printing');
  assert.equal(health(made).status, 'ok');
  assert.match(readFileSync(join(made.dir, 'launch.log'), 'utf8'), /step 14/);
});

test('after a stall no rebuild starts until the repository moves to another commit', (t) => {
  const made = project(t, { 'src/app.py': 'print(1)\n' });
  made.standIn(HANGS_SILENTLY_WITH_A_CHILD);
  launch(made, { GRAPHIFY_STALL_SECONDS: '1', STARTED: join(made.dir, 'started') });
  made.standIn(RECORDS_ITS_RUN);
  launch(made);
  assert.equal(existsSync(made.rebuilds), false, 'a rebuild started at the commit that stalled');
  writeFileSync(join(made.repo, 'src/app.py'), 'print(2)\n');
  git(made.repo, ['commit', '-q', '-am', 'move']);
  launch(made);
  assert.deepEqual(readFileSync(made.rebuilds, 'utf8').trim().split('\n'), [made.repo]);
  assert.equal(health(made).status, 'ok');
});

test('the session-start summary says the graph is stale after a stalled rebuild', (t) => {
  const made = project(t, { 'src/app.py': 'print(1)\n' });
  made.standIn(HANGS_SILENTLY_WITH_A_CHILD);
  launch(made, { GRAPHIFY_STALL_SECONDS: '1', STARTED: join(made.dir, 'started') });
  const printed = JSON.parse(runHook(provisionPath, made.env).stdout);
  assert.match(printed.hookSpecificOutput.additionalContext, /WARNING: the last rebuild was stopped after it printed nothing/);
});

test('the session-start hook says so when the first build stalled and left no graph', (t) => {
  const made = project(t, { 'src/app.py': 'print(1)\n' });
  rmSync(join(made.out, 'graph.json'));
  made.standIn(HANGS_SILENTLY_WITH_A_CHILD);
  const stalling = { ...made.env, GRAPHIFY_STALL_SECONDS: '1', STARTED: join(made.dir, 'started') };
  assert.equal(runHook(provisionPath, stalling).stdout, '');
  assert.equal(health(made).status, 'stalled');
  made.standIn(RECORDS_ITS_RUN);
  const printed = JSON.parse(runHook(provisionPath, made.env).stdout);
  assert.match(printed.hookSpecificOutput.additionalContext, /WARNING: this repository has no knowledge graph, because its build was stopped/);
  assert.equal(existsSync(made.rebuilds), false, 'a build started at the commit that stalled');
});

const UNATTENDED = Object.freeze({ HARNESS_UNATTENDED: '1' });

function projectWithoutAGraph(t) {
  const made = project(t, { 'src/app.py': 'print(1)\n' });
  rmSync(made.out, { recursive: true });
  return made;
}

test('an unattended session with no graph starts no build and writes nothing under graphify-out', (t) => {
  const made = projectWithoutAGraph(t);
  assert.equal(runHook(provisionPath, { ...made.env, ...UNATTENDED }).stdout, '');
  assert.equal(existsSync(made.rebuilds), false, 'a build started in an unattended session');
  assert.equal(existsSync(made.out), false, 'the unattended session wrote under graphify-out');
});

test('a session not marked unattended still builds the graph its repository lacks', (t) => {
  for (const marker of [undefined, '', '0', 'true']) {
    const made = projectWithoutAGraph(t);
    runHook(provisionPath, marker === undefined ? made.env : { ...made.env, HARNESS_UNATTENDED: marker });
    assert.deepEqual(readFileSync(made.rebuilds, 'utf8').trim().split('\n'), [made.repo]);
  }
});

test('an unattended session is still told about a graph that already exists', (t) => {
  const made = project(t, { 'src/app.py': 'print(1)\n' });
  const printed = JSON.parse(runHook(provisionPath, { ...made.env, ...UNATTENDED }).stdout);
  assert.match(printed.hookSpecificOutput.additionalContext, /^Graphify: knowledge graph at .*graph\.json, 1 nodes/);
});

test('an unattended session rebuilds no graph, however stale, and leaves graphify-out as it was', (t) => {
  const made = project(t, { 'src/app.py': 'print(1)\n' });
  utimesSync(join(made.repo, 'src/app.py'), AFTER_THE_GRAPH, AFTER_THE_GRAPH);
  runHook(refreshPath, { ...made.env, ...UNATTENDED });
  assert.equal(existsSync(made.rebuilds), false, 'a rebuild started in an unattended session');
  assert.deepEqual(readdirSync(made.out), ['graph.json']);
});
