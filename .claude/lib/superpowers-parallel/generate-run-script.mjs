import { readFileSync, writeFileSync, mkdtempSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, basename, relative, resolve } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { planWaves } from './wave-planner.mjs';
import { resolveAll } from './resolve-superpowers.mjs';
import { resolveBranch } from './branch-contract.mjs';

const ENGINE_PATH = join(homedir(), '.claude/workflows/parallel-plan-execution.js');
const ARG_LINE = /^const (\w+) = args\.\w+.*;$/;

export const ENGINE_ARG_NAMES = [
  'tasks', 'waves', 'branchPrefix', 'baseBranch', 'worktreeRoot', 'repoRoot',
  'scopedCheckCmd', 'fullValidationCmd', 'prompts', 'fixLoopMax', 'isolation',
  'launchCommit', 'runArtifacts', 'models',
];

export function buildRunScript(engineSource, values) {
  const replaced = new Set();
  const out = engineSource.split('\n').map((line) => {
    const m = line.match(ARG_LINE);
    if (!m) return line;
    const name = m[1];
    if (!(name in values)) throw new Error(`engine arg ${name} has no generated value`);
    replaced.add(name);
    return `const ${name} = ${JSON.stringify(values[name])};`;
  });
  const missing = Object.keys(values).filter((k) => !replaced.has(k));
  if (missing.length > 0) throw new Error(`generated values with no engine arg line: ${missing.join(', ')}`);
  return out.join('\n');
}

export function buildEngineTasks(tasks) {
  if (!Array.isArray(tasks)) throw new Error('graph.tasks must be an array');
  return Object.fromEntries(tasks.map((t) => [t.id, {
    id: t.id,
    title: t.title,
    fullText: t.fullText,
    fileScope: t.fileScope,
    risk: t.risk,
    agentType: t.agentType || 'implementer',
    validation: t.validation,
    dependentCount: t.dependentCount,
    edgeReasons: t.edgeReasons,
  }]));
}

export function validateGraph(graph) {
  if (!graph || !Array.isArray(graph.tasks) || graph.tasks.length === 0) throw new Error('graph.tasks must be a non-empty array');
  for (const t of graph.tasks) {
    if (!t.id) throw new Error('task missing id');
    if (!t.title) throw new Error(`task ${t.id} missing title`);
    if (!t.fullText) throw new Error(`task ${t.id} missing fullText`);
    if (!Array.isArray(t.fileScope) || t.fileScope.length === 0) throw new Error(`task ${t.id} missing or empty fileScope`);
    if (t.risk !== 'low' && t.risk !== 'high') throw new Error(`task ${t.id} risk must be 'low' or 'high'`);
  }
  return planWaves(graph);
}

function parseArgs(argv) {
  const [graphPath, ...rest] = argv;
  if (!graphPath) throw new Error('usage: generate-run-script.mjs <plan>.graph.json --base-branch <b> --scoped-check <cmd> --full-validation <cmd> [--isolation worktree|scope-fence] [--fix-loop-max 3] [--models <json>]');
  const BOOLEAN_FLAGS = new Set(['allow-platform-default']);
  const flags = {};
  for (let i = 0; i < rest.length;) {
    const key = rest[i];
    if (!key || !key.startsWith('--')) throw new Error(`malformed flag pair at: ${key}`);
    const name = key.slice(2);
    if (BOOLEAN_FLAGS.has(name)) {
      flags[name] = true;
      i += 1;
      continue;
    }
    const val = rest[i + 1];
    if (val === undefined || val.startsWith('--')) throw new Error(`malformed flag pair at: ${key}`);
    flags[name] = val;
    i += 2;
  }
  return { graphPath, flags };
}

function git(cmdArgs) {
  return execFileSync('git', cmdArgs, { encoding: 'utf8', timeout: 10000 }).trim();
}

function gitIn(cwd, cmdArgs) {
  try { return execFileSync('git', cmdArgs, { encoding: 'utf8', timeout: 10000, cwd }).trim(); } catch { return null; }
}

function run() {
  const { graphPath, flags } = parseArgs(process.argv.slice(2));
  for (const req of ['scoped-check', 'full-validation'])
    if (!flags[req]) throw new Error(`missing required flag --${req}`);
  const declaredBranches = flags['branch-config'] ? JSON.parse(readFileSync(flags['branch-config'], 'utf8')) : {};
  const baseBranch = resolveBranch('base', {
    passed: flags['base-branch'],
    declared: declaredBranches.base,
    allowPlatformDefault: Boolean(flags['allow-platform-default']),
  });
  const isolation = flags.isolation || 'worktree';
  if (isolation !== 'worktree' && isolation !== 'scope-fence') throw new Error('--isolation must be worktree or scope-fence');
  const fixLoopMax = flags['fix-loop-max'] === undefined ? 3 : Number(flags['fix-loop-max']);
  if (!Number.isInteger(fixLoopMax) || fixLoopMax < 0) throw new Error('--fix-loop-max must be a non-negative integer');
  const models = flags.models ? JSON.parse(flags.models) : {};
  const badModelKeys = Object.keys(models).filter((k) => k !== 'reviewer' && k !== 'fixer');
  if (badModelKeys.length > 0) throw new Error(`--models keys must be reviewer or fixer; got: ${badModelKeys.join(', ')}`);
  const outPath = graphPath.replace(/\.graph\.json$/, '.run.js');
  if (outPath === graphPath) throw new Error('graph path must end in .graph.json');

  const graph = JSON.parse(readFileSync(graphPath, 'utf8'));
  const { waves, diagnostics } = validateGraph(graph);
  if (isolation === 'scope-fence' && waves.length > 1) throw new Error('scope-fence isolation requires a single-wave graph');

  const repoRoot = git(['rev-parse', '--show-toplevel']);
  const graphRepoRoot = gitIn(dirname(resolve(graphPath)), ['rev-parse', '--show-toplevel']);
  if (graphRepoRoot && graphRepoRoot !== repoRoot) throw new Error(`graph lives in repository ${graphRepoRoot} but the current directory binds to ${repoRoot}; cd into the graph's repository first`);
  const launchCommit = git(['rev-parse', 'HEAD']);
  const planPath = graphPath.replace(/\.graph\.json$/, '');
  const realRepoRoot = realpathSync(repoRoot);
  const toRepoRel = (p) => relative(realRepoRoot, join(realpathSync(dirname(resolve(p))), basename(p)));
  const runArtifacts = [planPath, graphPath, outPath].map(toRepoRel).filter((p) => p !== '' && !p.startsWith('..'));
  if (isolation === 'scope-fence') {
    const dirty = git(['status', '--porcelain=v1', '-uall']).split('\n').filter(Boolean)
      .map((line) => line.slice(3))
      .filter((p) => !runArtifacts.includes(p));
    if (dirty.length > 0) throw new Error(`scope-fence isolation requires a clean working tree at launch; dirty: ${dirty.join(', ')}`);
  }

  const resolved = resolveAll();
  for (const w of resolved.warnings) process.stderr.write(`warning: ${w}\n`);

  const values = {
    tasks: buildEngineTasks(graph.tasks),
    waves,
    branchPrefix: `wf-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`,
    baseBranch,
    worktreeRoot: mkdtempSync(join(tmpdir(), 'sp-wt-')),
    repoRoot,
    scopedCheckCmd: flags['scoped-check'],
    fullValidationCmd: flags['full-validation'],
    prompts: Object.fromEntries(Object.entries(resolved.prompts).map(([k, v]) => [k, v.text])),
    fixLoopMax,
    isolation,
    launchCommit,
    runArtifacts,
    models,
  };

  const script = buildRunScript(readFileSync(ENGINE_PATH, 'utf8'), values);
  writeFileSync(outPath, script);
  process.stdout.write(JSON.stringify({ outPath, diagnostics, isolation, repoRoot, agentEstimate: Math.round(2.6 * graph.tasks.length + 2) }, null, 2) + '\n');
}

function main() {
  try {
    run();
  } catch (e) {
    process.stderr.write('generate-run-script error: ' + e.message + '\n');
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) main();
