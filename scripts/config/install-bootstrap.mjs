#!/usr/bin/env node
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BOOTSTRAP_ENTRIES, isInside, localDir, releasesDir, resolveIntent } from './paths.mjs';

const EXIT_OK = 0;
const EXIT_FAIL = 1;
const EXIT_USAGE = 2;

const SOURCE_SEGMENTS = Object.freeze(['scripts', 'config']);
const TESTS_DIRNAME = 'tests';
const RELATIVE_SPECIFIER = /(?:\bfrom|\bimport)\s*\(?\s*['"](\.[^'"]*)['"]/g;
const MODE_MASK = 0o777;
const CLI_VERBS = Object.freeze(['install']);
const CLI_FLAGS = Object.freeze(['--config-root', '--repo-root']);
const CHANGED_ACTIONS = Object.freeze(['created', 'updated', 'replaced']);
const HEADLINE = 'bootstrap';

const indent = (line) => `  ${line}`;

export function sourceDirFor(repoRoot) {
  return join(repoRoot, ...SOURCE_SEGMENTS);
}

function readSource(path) {
  try {
    return { ok: true, source: readFileSync(path, 'utf8') };
  } catch (error) {
    return { ok: false, error: `${path} could not be read: ${error.message}` };
  }
}

function relativeSpecifiers(source) {
  return [...source.matchAll(RELATIVE_SPECIFIER)].map((match) => match[1]);
}

function edgeErrors({ sourceDir, importer, target }) {
  if (isInside(join(sourceDir, TESTS_DIRNAME), target)) {
    return [`${importer} imports ${target}; test sources are never part of the bootstrap`];
  }
  if (!isInside(sourceDir, target)) {
    return [`${importer} imports ${target}, outside ${sourceDir}; the bootstrap closure may not escape it`];
  }
  return [];
}

function walk({ sourceDir, pending, seen, errors }) {
  if (pending.length === 0) return { files: seen, errors };
  const [head, ...rest] = pending;
  if (seen.includes(head)) return walk({ sourceDir, pending: rest, seen, errors });
  const path = join(sourceDir, head);
  const read = readSource(path);
  if (!read.ok) return walk({ sourceDir, pending: rest, seen, errors: [...errors, read.error] });
  const importerDir = dirname(path);
  const edges = relativeSpecifiers(read.source).map((specifier) => {
    const target = resolve(importerDir, specifier);
    return { target, errors: edgeErrors({ sourceDir, importer: path, target }) };
  });
  return walk({
    sourceDir,
    pending: [...rest, ...edges.filter((edge) => edge.errors.length === 0).map((edge) => relative(sourceDir, edge.target))],
    seen: [...seen, head],
    errors: [...errors, ...edges.flatMap((edge) => edge.errors)],
  });
}

export function moduleClosure({ sourceDir, entries = BOOTSTRAP_ENTRIES }) {
  if (!existsSync(sourceDir)) {
    return { ok: false, errors: Object.freeze([`${sourceDir} does not exist; there is no bootstrap to install`]) };
  }
  const walked = walk({ sourceDir, pending: [...entries], seen: [], errors: [] });
  const missing = entries.filter((entry) => !walked.files.includes(entry));
  const errors = [
    ...walked.errors,
    ...missing.map((entry) => `${entry} is absent from the derived closure; the bootstrap would be incomplete`),
  ];
  if (errors.length > 0) return { ok: false, errors: Object.freeze(errors) };
  return { ok: true, files: Object.freeze([...walked.files].sort()) };
}

function targetState(path) {
  try {
    const stats = lstatSync(path);
    if (!stats.isFile()) return { present: true, plain: false };
    return { present: true, plain: true, contents: readFileSync(path), mode: stats.mode & MODE_MASK };
  } catch (error) {
    if (error.code === 'ENOENT') return { present: false, plain: false };
    throw error;
  }
}

function actionFor(state, desired) {
  if (!state.present) return 'created';
  if (!state.plain) return 'replaced';
  if (!state.contents.equals(desired.contents) || state.mode !== desired.mode) return 'updated';
  return 'unchanged';
}

export function planInstall({ sourceDir, targetDir, files }) {
  const actions = files.map((file) => {
    const source = join(sourceDir, file);
    const desired = { contents: readFileSync(source), mode: statSync(source).mode & MODE_MASK };
    const target = join(targetDir, file);
    return { file, source, target, desired, action: actionFor(targetState(target), desired) };
  });
  return Object.freeze({ actions: Object.freeze(actions) });
}

export function applyPlan(plan) {
  const applied = plan.actions.filter((action) => CHANGED_ACTIONS.includes(action.action));
  for (const action of applied) {
    mkdirSync(dirname(action.target), { recursive: true });
    rmSync(action.target, { force: true });
    writeFileSync(action.target, action.desired.contents);
    chmodSync(action.target, action.desired.mode);
  }
  return applied.length;
}

export function localContainmentError(configRoot) {
  const declared = localDir(configRoot);
  const releases = resolveIntent(releasesDir(configRoot));
  const local = resolveIntent(declared);
  if (!isInside(releases, local)) return null;
  return `${declared} resolves to ${local}, inside ${releases}; the bootstrap must live outside every release `
    + 'or a bad release breaks the machinery that would roll it back';
}

function rootErrors({ configRoot, repoRoot }) {
  return [
    ...(existsSync(configRoot) ? [] : [`config root ${configRoot} does not exist`]),
    ...(existsSync(repoRoot) ? [] : [`repo root ${repoRoot} does not exist`]),
  ];
}

export function installBootstrap({ configRoot, repoRoot, entries = BOOTSTRAP_ENTRIES }) {
  const invalid = rootErrors({ configRoot, repoRoot });
  if (invalid.length > 0) return { status: 'error', errors: Object.freeze(invalid) };

  const containment = localContainmentError(configRoot);
  if (containment !== null) return { status: 'refused', errors: Object.freeze([containment]) };

  const sourceDir = sourceDirFor(repoRoot);
  const closure = moduleClosure({ sourceDir, entries });
  if (!closure.ok) return { status: 'error', errors: closure.errors };

  const targetDir = localDir(configRoot);
  try {
    const plan = planInstall({ sourceDir, targetDir, files: closure.files });
    const changed = applyPlan(plan);
    return {
      status: changed === 0 ? 'current' : 'installed',
      dir: targetDir,
      files: closure.files,
      actions: plan.actions.map(({ file, action }) => Object.freeze({ file, action })),
    };
  } catch (error) {
    return { status: 'error', errors: Object.freeze([`installing into ${targetDir} failed: ${error.message}`]) };
  }
}

function reportFor(result) {
  if (result.status === 'current') {
    return `${HEADLINE} at ${result.dir} is already current (${result.files.length} files)`;
  }
  const changed = result.actions.filter((action) => CHANGED_ACTIONS.includes(action.action));
  return [
    `${HEADLINE} installed into ${result.dir} (${changed.length} of ${result.files.length} files written)`,
    ...changed.map((action) => indent(`${action.action} ${action.file}`)),
  ].join('\n');
}

function parseOptions(tokens) {
  if (tokens.length === 0) return { ok: true, options: {} };
  const [flag, value, ...rest] = tokens;
  if (!CLI_FLAGS.includes(flag)) {
    return { ok: false, error: `unknown argument ${JSON.stringify(flag)}; accepted: ${CLI_FLAGS.join(', ')}` };
  }
  if (value === undefined || CLI_FLAGS.includes(value)) return { ok: false, error: `${flag} requires a value` };
  const tail = parseOptions(rest);
  if (!tail.ok) return tail;
  return { ok: true, options: { [flag]: value, ...tail.options } };
}

export function parseArgs(argv) {
  const [verb, ...rest] = argv;
  if (!CLI_VERBS.includes(verb)) {
    return { ok: false, error: `usage: install-bootstrap.mjs <${CLI_VERBS.join('|')}> [${CLI_FLAGS.join('] [')}]` };
  }
  const parsed = parseOptions(rest);
  if (!parsed.ok) return parsed;
  return { ok: true, verb, options: parsed.options };
}

function defaultRepoRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
}

export function run({ argv, env, stdout, stderr }) {
  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    stderr.write(`${parsed.error}\n`);
    return EXIT_USAGE;
  }
  const home = env.HOME ?? homedir();
  const configRoot = parsed.options['--config-root'] ?? env.CLAUDE_CONFIG_DIR ?? join(home, '.claude');
  const repoRoot = parsed.options['--repo-root'] ?? defaultRepoRoot();
  const result = installBootstrap({ configRoot, repoRoot });
  if (result.status === 'refused' || result.status === 'error') {
    stderr.write(`${(result.errors ?? ['unknown failure']).join('\n')}\n`);
    return EXIT_FAIL;
  }
  stdout.write(`${reportFor(result)}\n`);
  return EXIT_OK;
}

function isMainModule() {
  if (!process.argv[1]) return false;
  if (import.meta.url === pathToFileURL(process.argv[1]).href) return true;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}

if (isMainModule()) {
  process.exitCode = run({
    argv: process.argv.slice(2),
    env: process.env,
    stdout: process.stdout,
    stderr: process.stderr,
  });
}
