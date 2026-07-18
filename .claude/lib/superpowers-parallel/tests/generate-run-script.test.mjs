import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildRunScript, validateGraph, ENGINE_ARG_NAMES } from '../generate-run-script.mjs';

const FAKE_ENGINE = [
  'export const meta = { name: "x" };',
  'const a = args.a;',
  'const b = args.b || 3;',
  'const c = a + b;',
  'return c;',
].join('\n');

const SCRIPT = fileURLToPath(new URL('../generate-run-script.mjs', import.meta.url));

const CLEAN_ENV = { ...process.env };
for (const k of ['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY', 'GIT_PREFIX', 'GIT_AUTHOR_DATE', 'GIT_COMMITTER_DATE', 'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL']) delete CLEAN_ENV[k];

test('buildRunScript inlines values and keeps the body verbatim', () => {
  const out = buildRunScript(FAKE_ENGINE, { a: [1], b: 2 });
  const lines = out.split('\n');
  assert.equal(lines[0], 'export const meta = { name: "x" };');
  assert.equal(lines[1], 'const a = [1];');
  assert.equal(lines[2], 'const b = 2;');
  assert.equal(lines[3], 'const c = a + b;');
  assert.equal(lines[4], 'return c;');
});

test('buildRunScript throws when an engine arg has no generated value', () => {
  assert.throws(() => buildRunScript(FAKE_ENGINE, { a: 1 }), /no generated value/);
});

test('buildRunScript throws on generated values with no engine arg line', () => {
  assert.throws(() => buildRunScript(FAKE_ENGINE, { a: 1, b: 2, z: 9 }), /no engine arg line/);
});

const VALID_GRAPH = {
  tasks: [
    { id: 't1', title: 'one', fullText: 'body1', dependsOn: [], fileScope: ['lib/one.js'], risk: 'low', validation: 'scoped' },
    { id: 't2', title: 'two', fullText: 'body2', dependsOn: [], fileScope: ['lib/two.js'], risk: 'high', validation: 'scoped' },
  ],
};

test('validateGraph accepts a valid graph and passes risk through wave-planner untouched', () => {
  const { waves, diagnostics } = validateGraph(VALID_GRAPH);
  assert.deepEqual(waves, [['t1', 't2']]);
  assert.equal(diagnostics.taskCount, 2);
});

test('validateGraph rejects a task with missing or invalid risk', () => {
  const g = JSON.parse(JSON.stringify(VALID_GRAPH));
  delete g.tasks[0].risk;
  assert.throws(() => validateGraph(g), /risk/);
  g.tasks[0].risk = 'medium';
  assert.throws(() => validateGraph(g), /risk/);
});

test('validateGraph rejects missing fullText and empty fileScope', () => {
  const g = JSON.parse(JSON.stringify(VALID_GRAPH));
  delete g.tasks[1].fullText;
  assert.throws(() => validateGraph(g), /fullText/);
  const g2 = JSON.parse(JSON.stringify(VALID_GRAPH));
  g2.tasks[0].fileScope = [];
  assert.throws(() => validateGraph(g2), /fileScope/);
});

test('validateGraph propagates wave-planner cycle errors', () => {
  const g = JSON.parse(JSON.stringify(VALID_GRAPH));
  g.tasks[0].dependsOn = ['t2'];
  g.tasks[1].dependsOn = ['t1'];
  assert.throws(() => validateGraph(g), /cycle/);
});

test('the real engine has exactly the expected arg lines and they all replace', () => {
  const enginePath = join(homedir(), '.claude/workflows/parallel-plan-execution.js');
  const engine = readFileSync(enginePath, 'utf8');
  const values = Object.fromEntries(ENGINE_ARG_NAMES.map((n) => [n, `v-${n}`]));
  const out = buildRunScript(engine, values);
  assert.equal(out.match(/\bargs\./g), null);
  assert.equal(out.split('\n').length, engine.split('\n').length);
});

test('CLI fails loudly with no run script on a malformed invocation', () => {
  const r1 = (() => { try { execFileSync('node', [SCRIPT], { encoding: 'utf8', env: CLEAN_ENV }); return 0; } catch (e) { return e.status; } })();
  assert.notEqual(r1, 0);
  const r2 = (() => { try { execFileSync('node', [SCRIPT, '/tmp/does-not-exist.graph.json', '--base-branch', 'x', '--scoped-check', 'y', '--full-validation', 'z'], { encoding: 'utf8', env: CLEAN_ENV }); return 0; } catch (e) { return e.status; } })();
  assert.notEqual(r2, 0);
});

function cliFails(cliArgs) {
  try { execFileSync('node', [SCRIPT, ...cliArgs], { encoding: 'utf8', env: CLEAN_ENV }); return null; }
  catch (e) { return { status: e.status, stderr: String(e.stderr) }; }
}

test('CLI rejects a flag pair whose value was omitted', () => {
  const r = cliFails(['x.graph.json', '--base-branch', '--scoped-check', 'y', '--full-validation', 'z']);
  assert.notEqual(r, null);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /malformed flag pair/);
});

test('CLI rejects a non-integer fix-loop-max loudly', () => {
  const r = cliFails(['x.graph.json', '--base-branch', 'b', '--scoped-check', 'y', '--full-validation', 'z', '--fix-loop-max', 'abc']);
  assert.notEqual(r, null);
  assert.match(r.stderr, /fix-loop-max/);
});

test('CLI rejects models keys other than reviewer and fixer', () => {
  const r = cliFails(['x.graph.json', '--base-branch', 'b', '--scoped-check', 'y', '--full-validation', 'z', '--models', '{"implementer":"haiku"}']);
  assert.notEqual(r, null);
  assert.match(r.stderr, /models keys/);
});

function makeGitDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const sh = (cmd, cmdArgs) => execFileSync(cmd, cmdArgs, { cwd: dir, encoding: 'utf8', env: CLEAN_ENV });
  sh('git', ['init', '-q', '-b', 'main']);
  writeFileSync(join(dir, 'README.md'), 'x\n');
  sh('git', ['add', '-A']);
  sh('git', ['commit', '-qm', 'init']);
  return { dir, sh };
}

test('agentType is preserved when set on a task', () => {
  const { dir, sh } = makeGitDir('gen-at-set-');
  const graph = {
    tasks: [
      { id: 't1', title: 'one', fullText: 'body1', dependsOn: [], fileScope: ['lib/one.js'], risk: 'low', agentType: 'test-engineer', validation: 'scoped' },
    ],
  };
  writeFileSync(join(dir, 'p.graph.json'), JSON.stringify(graph));
  sh('node', [SCRIPT, 'p.graph.json', '--base-branch', 'integration', '--scoped-check', 'x', '--full-validation', 'y', '--isolation', 'scope-fence']);
  const run = readFileSync(join(dir, 'p.run.js'), 'utf8');
  assert.match(run, /"agentType":"test-engineer"/);
});

test('agentType defaults to implementer when absent from a task', () => {
  const { dir, sh } = makeGitDir('gen-at-default-');
  const graph = {
    tasks: [
      { id: 't1', title: 'one', fullText: 'body1', dependsOn: [], fileScope: ['lib/one.js'], risk: 'low', validation: 'scoped' },
    ],
  };
  writeFileSync(join(dir, 'p.graph.json'), JSON.stringify(graph));
  sh('node', [SCRIPT, 'p.graph.json', '--base-branch', 'integration', '--scoped-check', 'x', '--full-validation', 'y', '--isolation', 'scope-fence']);
  const run = readFileSync(join(dir, 'p.run.js'), 'utf8');
  assert.match(run, /"agentType":"implementer"/);
});

test('scope-fence generation exempts its own artifacts and still rejects stray files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gen-fence-'));
  const sh = (cmd, cmdArgs) => execFileSync(cmd, cmdArgs, { cwd: dir, encoding: 'utf8', env: CLEAN_ENV });
  sh('git', ['init', '-q', '-b', 'main']);
  writeFileSync(join(dir, 'README.md'), 'x\n');
  sh('git', ['add', '-A']);
  sh('git', ['commit', '-qm', 'init']);
  writeFileSync(join(dir, 'p.graph.json'), JSON.stringify(VALID_GRAPH));
  const cliArgs = [SCRIPT, 'p.graph.json', '--base-branch', 'integration', '--scoped-check', 'x', '--full-validation', 'y', '--isolation', 'scope-fence'];
  const out = sh('node', cliArgs);
  assert.match(out, /"isolation": "scope-fence"/);
  const run = readFileSync(join(dir, 'p.run.js'), 'utf8');
  assert.match(run, /const runArtifacts = \["p","p\.graph\.json","p\.run\.js"\];/);
  writeFileSync(join(dir, 'stray.txt'), 'x\n');
  assert.throws(() => sh('node', cliArgs), /clean working tree/);
});

const GEN_CLI = fileURLToPath(new URL('../generate-run-script.mjs', import.meta.url));

function writeValidGraph(dir) {
  const p = join(dir, 'plan.graph.json');
  writeFileSync(p, JSON.stringify({
    tasks: [{ id: 't1', title: 'one', fullText: 'b', dependsOn: [], fileScope: ['lib/one.js'], risk: 'low', validation: 'scoped' }],
  }));
  return p;
}

test('generate-run-script refuses to target the platform default branch', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bc-gen-main-'));
  const graph = writeValidGraph(dir);
  let failed = false;
  try {
    execFileSync('node', [GEN_CLI, graph, '--base-branch', 'main', '--scoped-check', 'true', '--full-validation', 'true'],
      { cwd: dir, encoding: 'utf8', stdio: 'pipe', env: CLEAN_ENV });
  } catch (err) {
    failed = true;
    assert.match(String(err.stderr) + String(err.stdout), /platform default/);
  }
  assert.ok(failed, 'should refuse main without --allow-platform-default');
});

test('generate-run-script STOPs and ASKs when no base branch is passed or declared', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bc-gen-none-'));
  const graph = writeValidGraph(dir);
  let failed = false;
  try {
    execFileSync('node', [GEN_CLI, graph, '--scoped-check', 'true', '--full-validation', 'true'],
      { cwd: dir, encoding: 'utf8', stdio: 'pipe', env: CLEAN_ENV });
  } catch (err) {
    failed = true;
    assert.match(String(err.stderr) + String(err.stdout), /not declared/);
  }
  assert.ok(failed, 'should STOP-AND-ASK when base is neither passed nor declared');
});
