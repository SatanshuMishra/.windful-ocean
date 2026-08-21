import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join as pathJoin, relative as pathRelative, resolve as pathResolve, sep } from 'node:path';
import { choosingScope, collectEslintConfig, collectTsconfigOptions } from './boundary-config-surface.mjs';
import {
  NODE_MODULES,
  checkedFileUniverse,
  collectSuppressionSurface,
  nestedSubtree,
  ownedFiles,
  sideRelativeFile,
  within,
} from './boundary-scan-scope.mjs';
import { censusListedFiles, censusTscLines } from './boundary-tsc-lines.mjs';
import { NO_RECLAIM, reclaimedWorktree } from './boundary-worktree-reclaim.mjs';
import { run as execRun } from './exec-run.mjs';

export const IDENTITY_SEPARATOR = '\u0000';
export const TOOL_RUN_DEADLINE_MS = 900000;
export const INSTALL_DEADLINE_MS = 900000;
export const WORKTREE_DEADLINE_MS = 300000;
export const HEAD_SIDE = 'HEAD';
export const BASE_SIDE = 'base';

const NPM_ENTRY_CANDIDATES = Object.freeze([
  (execPath) => pathJoin(dirname(execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  (execPath) => pathJoin(dirname(execPath), 'npm'),
]);

const NPM_INSTALL_ARGV = Object.freeze(['install', '--no-audit', '--no-fund']);

function unserviceableManager(name) {
  return Object.freeze({ name, entryCandidates: Object.freeze([]), installArgv: null });
}

const NPM_MANAGER = Object.freeze({ name: 'npm', entryCandidates: NPM_ENTRY_CANDIDATES, installArgv: NPM_INSTALL_ARGV });
const YARN_MANAGER = unserviceableManager('yarn');
const PNPM_MANAGER = unserviceableManager('pnpm');

export const LOCKFILE_MANAGERS = Object.freeze({
  'package-lock.json': NPM_MANAGER,
  'npm-shrinkwrap.json': NPM_MANAGER,
  'yarn.lock': YARN_MANAGER,
  'pnpm-lock.yaml': PNPM_MANAGER,
});

export const LOCKFILE_NAMES = Object.freeze(Object.keys(LOCKFILE_MANAGERS));

const MANAGERS_BY_NAME = Object.freeze({ npm: NPM_MANAGER, yarn: YARN_MANAGER, pnpm: PNPM_MANAGER });

export function failureText(error, fallback) {
  return error && error.message ? error.message : fallback;
}

function resolveManagerEntry(descriptor) {
  if (descriptor.entryCandidates.length === 0) {
    return { ok: false, error: `the program cannot service the ${descriptor.name} package manager: no entry-resolution candidate is declared for it` };
  }
  const tried = [];
  for (const candidate of descriptor.entryCandidates) {
    const raw = candidate(process.execPath);
    if (!existsSync(raw)) {
      tried.push(`${raw} (nothing exists there)`);
      continue;
    }
    let real;
    try {
      real = realpathSync(raw);
    } catch (error) {
      tried.push(`${raw} (its real path could not be resolved: ${failureText(error, 'unknown path failure')})`);
      continue;
    }
    if (real.endsWith('.js')) return { ok: true, entry: real };
    tried.push(`${raw} (it resolves to ${real}, which is not a JS entry node can run)`);
  }
  return { ok: false, error: `no ${descriptor.name} entry could be resolved from any declared candidate: ${tried.join(', ')}` };
}

function resolvePackageManagerEntry(managerName) {
  const descriptor = MANAGERS_BY_NAME[managerName];
  if (descriptor === undefined) {
    return { ok: false, error: `the program cannot service the ${managerName} package manager: it is not one of the declared managers (${Object.keys(MANAGERS_BY_NAME).join(', ')})` };
  }
  return resolveManagerEntry(descriptor);
}

function resolveToolPath(executable, root) {
  const path = pathJoin(root, NODE_MODULES, '.bin', executable);
  if (!existsSync(path)) {
    return { ok: false, error: `the ${executable} executable could not be resolved: nothing exists at ${path}, and a path no package installed would fail as a module-not-found rather than as a refusal` };
  }
  return { ok: true, path };
}

const PATH_KINDS = Object.freeze([
  Object.freeze({ name: 'a directory', of: (stats) => stats.isDirectory() }),
  Object.freeze({ name: 'a named pipe', of: (stats) => stats.isFIFO() }),
  Object.freeze({ name: 'a socket', of: (stats) => stats.isSocket() }),
  Object.freeze({ name: 'a block device', of: (stats) => stats.isBlockDevice() }),
  Object.freeze({ name: 'a character device', of: (stats) => stats.isCharacterDevice() }),
]);

function pathKind(stats) {
  const named = PATH_KINDS.find((kind) => kind.of(stats));
  return named === undefined ? 'an entry of no kind this program classifies' : named.name;
}

function describeRealPath(path) {
  let real;
  try {
    real = realpathSync(path);
  } catch (error) {
    return { ok: false, error: failureText(error, 'unknown real-path failure') };
  }
  let stats;
  try {
    stats = statSync(real);
  } catch (error) {
    return { ok: false, error: `${real} could not be described: ${failureText(error, 'unknown stat failure')}` };
  }
  if (stats.isFile()) return { ok: true, path: real, kind: 'a regular file', regular: true, size: stats.size };
  return { ok: true, path: real, kind: pathKind(stats), regular: false, size: 0 };
}

function describeLink(path) {
  let stats;
  try {
    stats = lstatSync(path);
  } catch (error) {
    return { ok: false, error: failureText(error, 'unknown link-stat failure') };
  }
  return { ok: true, symbolicLink: stats.isSymbolicLink(), directory: stats.isDirectory() };
}

export const REAL_BOUNDARY_IO = Object.freeze({
  run: (binary, argv, options) => execRun(binary, argv, options),
  exists: (path) => existsSync(path),
  readFile: (path) => readFileSync(path, 'utf8'),
  writeFile: (path, content) => writeFileSync(path, content, 'utf8'),
  describePath: (path) => describeRealPath(path),
  linkKind: (path) => describeLink(path),
  makeDir: (path) => mkdirSync(path, { recursive: true }),
  symlink: (target, path) => symlinkSync(target, path, 'dir'),
  removePath: (path) => rmSync(path, { recursive: true, force: true }),
  resolveTool: (executable, root) => resolveToolPath(executable, root),
  resolvePackageManager: (managerName) => resolvePackageManagerEntry(managerName),
});

function join(root, name) {
  return pathJoin(root, name);
}

export const NORMALIZATION_STEPS = Object.freeze([
  Object.freeze({
    name: 'strip code frames',
    apply: (text) => text
      .split('\n')
      .filter((line) => !/^\s*[~^|]+\s*$/.test(line) && !/^\s*\d+\s*\|/.test(line))
      .join('\n'),
  }),
  Object.freeze({
    name: 'strip absolute paths',
    apply: (text) => text.replace(/(^|[\s('"])\/[^\s'")]*\/(?=[^\s'")]+)/g, '$1'),
  }),
  Object.freeze({
    name: 'strip line and column pairs',
    apply: (text) => text.replace(/(?<![\w.])\d+:\d+(?![\w])/g, '<pos>'),
  }),
]);

const FILE_NORMALIZATION_STEPS = Object.freeze([
  Object.freeze({ name: 'relative to the side root', apply: (text, root) => sideRelativeFile(text, root) }),
]);

export const IDENTITY_COMPONENTS = Object.freeze([
  Object.freeze({ name: 'file', field: 'file', steps: FILE_NORMALIZATION_STEPS }),
  Object.freeze({ name: 'code', field: 'code', steps: Object.freeze([]) }),
  Object.freeze({ name: 'message', field: 'message', steps: NORMALIZATION_STEPS }),
]);

export const BOUNDARY_TOOLS = Object.freeze([
  Object.freeze({
    name: 'eslint',
    dependencies: Object.freeze(['eslint']),
    configNames: Object.freeze(['eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', '.eslintrc.json', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.yml']),
    executable: 'eslint',
    okStatuses: Object.freeze([0, 1]),
    argv: (root, bin) => [bin, root, '-f', 'json'],
  }),
  Object.freeze({
    name: 'tsc',
    dependencies: Object.freeze(['typescript']),
    configNames: Object.freeze(['tsconfig.json']),
    executable: 'tsc',
    okStatuses: Object.freeze([0, 2]),
    argv: (root, bin) => [bin, '--noEmit', '--pretty', 'false', '--project', root],
    listArgv: (root, bin) => [bin, '--noEmit', '--listFiles', '--pretty', 'false', '--project', root],
  }),
]);

export const BOUNDARY_TOOL_NAMES = Object.freeze(BOUNDARY_TOOLS.map((tool) => tool.name));

export function structuralIdentity(diagnostic, root) {
  return IDENTITY_COMPONENTS
    .map((component) => component.steps.reduce((text, step) => step.apply(text, root), diagnostic[component.field] ?? ''))
    .join(IDENTITY_SEPARATOR);
}

export function parseEslintReport(stdout) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    return { ok: false, error: `the eslint report could not be collected cleanly: it is not JSON (${failureText(error, 'unknown parse failure')})` };
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, error: `the eslint report could not be collected cleanly: its top level is ${JSON.stringify(typeof parsed)} rather than the array of file entries the json formatter emits` };
  }
  if (parsed.length === 0) {
    return { ok: false, error: 'the eslint report names zero files, so the run linted zero files; an empty report is refused rather than read as a clean result' };
  }
  const diagnostics = [];
  for (const entry of parsed) {
    if (entry === null || typeof entry !== 'object' || typeof entry.filePath !== 'string' || !Array.isArray(entry.messages)) {
      return { ok: false, error: `the eslint report could not be collected cleanly: ${JSON.stringify(entry)} is not a file entry carrying a filePath and a messages array` };
    }
    for (const message of entry.messages) {
      if (message === null || typeof message !== 'object') {
        return { ok: false, error: `the eslint report could not be collected cleanly: ${JSON.stringify(message)} is not a message object` };
      }
      diagnostics.push(Object.freeze({
        file: entry.filePath,
        code: typeof message.ruleId === 'string' ? message.ruleId : 'no-rule',
        message: typeof message.message === 'string' ? message.message : '',
      }));
    }
  }
  const files = Object.freeze([...new Set(parsed.map((entry) => entry.filePath))].sort());
  return { ok: true, diagnostics: Object.freeze(diagnostics), fileCount: parsed.length, files };
}

export function observeSide(root, tool, io) {
  let dependencyDeclared = false;
  let observed = true;
  let reason = null;
  const manifest = join(root, 'package.json');
  try {
    if (io.exists(manifest)) {
      const parsed = JSON.parse(io.readFile(manifest));
      dependencyDeclared = tool.dependencies.some((name) => ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']
        .some((field) => parsed !== null && typeof parsed === 'object' && parsed[field] !== null && typeof parsed[field] === 'object' && Object.hasOwn(parsed[field], name)));
    }
  } catch (error) {
    observed = false;
    reason = `the package manifest at ${manifest} could not be read as JSON: ${failureText(error, 'unknown read failure')}`;
  }
  const present = tool.configNames.filter((name) => {
    const resolved = within(root, name);
    if (resolved.escapes) {
      observed = false;
      reason = `the ${tool.name} config ${name} resolves to ${resolved.path}, which is outside the worktree root ${root}, so this side cannot be positively observed`;
      return false;
    }
    return io.exists(resolved.path);
  });
  return Object.freeze({ configPresent: present.length > 0, dependencyDeclared, observed, reason, configNames: Object.freeze(present) });
}

export function toolExpectation(baseObservation, headObservation) {
  const unobservable = !baseObservation.observed || !headObservation.observed;
  const declaredOnEitherSide = baseObservation.configPresent || baseObservation.dependencyDeclared
    || headObservation.configPresent || headObservation.dependencyDeclared;
  return Object.freeze({
    expected: unobservable || declaredOnEitherSide,
    unobservable,
    reason: unobservable
      ? (baseObservation.reason ?? headObservation.reason ?? 'a side could not be positively observed')
      : null,
  });
}

export function expectationsFor(headRoot, baseRoot, io) {
  const byTool = {};
  for (const tool of BOUNDARY_TOOLS) {
    const baseObservation = observeSide(baseRoot, tool, io);
    const headObservation = observeSide(headRoot, tool, io);
    byTool[tool.name] = toolExpectation(baseObservation, headObservation);
  }
  return { ok: true, byTool: Object.freeze(byTool) };
}

export function cleanlyRan(result) {
  return result !== null && typeof result === 'object'
    && result.outcome === 'completed'
    && typeof result.status === 'number'
    && typeof result.stdout === 'string'
    && typeof result.stderr === 'string';
}

function acceptedRun(tool, result, root, label) {
  if (!cleanlyRan(result)) {
    return { ok: false, error: `${tool.name} could not be collected cleanly on ${root}: ${label} reported ${JSON.stringify(result === null || result === undefined ? null : result.outcome)}` };
  }
  if (!tool.okStatuses.includes(result.status)) {
    return {
      ok: false,
      error: `${tool.name} could not be collected cleanly on ${root}: ${label} exited ${result.status}, which is outside the statuses it exits with when it ran (${tool.okStatuses.join(', ')}); its stderr was ${JSON.stringify(result.stderr)}`,
    };
  }
  if (result.stdout.trim().length === 0 && result.stderr.trim().length > 0) {
    return {
      ok: false,
      error: `${tool.name} could not be collected cleanly on ${root}: ${label} printed nothing on stdout and ${JSON.stringify(result.stderr)} on stderr, so there is no report to census rather than an empty one`,
    };
  }
  return { ok: true };
}

function toolBinary(root, tool, io) {
  const resolved = io.resolveTool(tool.executable, root);
  if (resolved === null || typeof resolved !== 'object' || typeof resolved.ok !== 'boolean') {
    return { ok: false, error: `${tool.name} could not be collected on ${root}: the tool resolver returned ${JSON.stringify(resolved)} rather than a result naming either the resolved path or the reason it refused` };
  }
  if (!resolved.ok) return { ok: false, error: `${tool.name} could not be collected on ${root}: ${resolved.error}` };
  if (typeof resolved.path !== 'string' || resolved.path.length === 0) {
    return { ok: false, error: `${tool.name} could not be collected on ${root}: the tool resolver reported success without naming a path` };
  }
  return { ok: true, path: resolved.path };
}

function collectEslintTool(root, tool, io, plan, stdout, bin) {
  const parsed = parseEslintReport(stdout);
  if (!parsed.ok) return { ok: false, error: `${tool.name} on ${root}: ${parsed.error}` };
  const owned = ownedFiles(root, parsed.files, plan.excludedSubtrees);
  if (owned.length === 0) {
    return {
      ok: false,
      error: `${tool.name} on ${root} named no file this side owns among the ${parsed.files.length} it reported: every one is under ${NODE_MODULES} or inside an excluded subtree (${plan.excludedSubtrees.join(', ') || 'none'}), so the resolved config would be sampled outside the tree under test`,
    };
  }
  const config = collectEslintConfig(root, bin, io, owned, plan.side, plan.scope);
  if (!config.ok) return { ok: false, error: `${tool.name} on ${root}: ${config.error}` };
  return {
    ok: true,
    diagnostics: parsed.diagnostics,
    fileCount: parsed.fileCount,
    files: parsed.files,
    eslintConfigByFile: config.eslintConfigByFile,
    eslintConfigFiles: config.eslintConfigFiles,
  };
}

function collectTscTool(root, tool, io, plan, stdout, bin) {
  const census = censusTscLines(stdout);
  if (!census.ok) return { ok: false, error: `${tool.name} on ${root}: ${census.error}` };
  let listed;
  try {
    listed = io.run('node', tool.listArgv(root, bin), { cwd: root, deadlineMs: TOOL_RUN_DEADLINE_MS });
  } catch (error) {
    return { ok: false, error: `${tool.name} could not be collected on ${root}: the type-checked file list failed (${failureText(error, 'unknown spawn failure')})` };
  }
  const acceptedList = acceptedRun(tool, listed, root, 'the type-checked file list');
  if (!acceptedList.ok) return acceptedList;
  const listedCensus = censusListedFiles(listed.stdout);
  if (!listedCensus.ok) return { ok: false, error: `${tool.name} on ${root}: ${listedCensus.error}` };
  const fileCount = listedCensus.files.length;
  if (fileCount === 0) {
    return { ok: false, error: `${tool.name} on ${root} type-checked zero files, so the run is refused rather than read as a clean result` };
  }
  const files = Object.freeze([...listedCensus.files].sort());
  const config = collectTsconfigOptions(root, bin, io, plan.side);
  if (!config.ok) return { ok: false, error: `${tool.name} on ${root}: ${config.error}` };
  return { ok: true, diagnostics: census.diagnostics, fileCount, files, tsconfigOptions: config.tsconfigOptions };
}

function collectTool(root, tool, io, plan) {
  const binary = toolBinary(root, tool, io);
  if (!binary.ok) return binary;
  const bin = binary.path;
  let result;
  try {
    result = io.run('node', tool.argv(root, bin), { cwd: root, deadlineMs: TOOL_RUN_DEADLINE_MS });
  } catch (error) {
    return { ok: false, error: `${tool.name} could not be collected on ${root}: ${failureText(error, 'unknown spawn failure')}` };
  }
  const accepted = acceptedRun(tool, result, root, 'the diagnostic run');
  if (!accepted.ok) return accepted;
  if (tool.name === 'eslint') return collectEslintTool(root, tool, io, plan, result.stdout, bin);
  return collectTscTool(root, tool, io, plan, result.stdout, bin);
}

function identitiesOf(diagnostics, root) {
  const counts = {};
  for (const diagnostic of diagnostics) {
    const identity = structuralIdentity(diagnostic, root);
    counts[identity] = (counts[identity] ?? 0) + 1;
  }
  return counts;
}

const NEUTRAL_ESLINT_CONFIGS = Object.freeze({});

const CENSUS_PLAN_FIELDS = Object.freeze([
  Object.freeze({ name: 'root', accepts: (value) => typeof value === 'string' && value.length > 0, requirement: 'the worktree root it collects' }),
  Object.freeze({ name: 'side', accepts: (value) => typeof value === 'string' && value.length > 0, requirement: 'the name of the side it collects, which every refusal it writes names' }),
  Object.freeze({ name: 'gateBase', accepts: (value) => typeof value === 'string' && value.length > 0, requirement: 'the base ref the census is keyed to' }),
  Object.freeze({ name: 'expectations', accepts: (value) => value !== null && typeof value === 'object' && !Array.isArray(value) && BOUNDARY_TOOL_NAMES.every((name) => value[name] !== null && typeof value[name] === 'object' && typeof value[name].expected === 'boolean'), requirement: `an expectation carrying an expected flag for each of ${BOUNDARY_TOOL_NAMES.join(', ')}` }),
  Object.freeze({ name: 'scope', accepts: (value) => value !== null && typeof value === 'object' && !Array.isArray(value), requirement: 'the policy naming which files the resolved config is collected for' }),
  Object.freeze({ name: 'excludedSubtrees', accepts: (value) => Array.isArray(value) && value.every((entry) => typeof entry === 'string' && entry.length > 0), requirement: 'the list of root-relative subtrees this side does not own' }),
]);

function censusPlanProblems(plan) {
  if (plan === null || typeof plan !== 'object' || Array.isArray(plan)) {
    return [`the collection plan is ${JSON.stringify(plan)} rather than an object naming the root, the side, the base ref, the expectations, the config scope and the excluded subtrees`];
  }
  return CENSUS_PLAN_FIELDS
    .filter((field) => !field.accepts(plan[field.name]))
    .map((field) => `${field.name} must be ${field.requirement}, not ${JSON.stringify(plan[field.name] === undefined ? null : plan[field.name])}`);
}

export function collectCensus(plan, io) {
  const problems = censusPlanProblems(plan);
  if (problems.length > 0) {
    return { ok: false, error: `a census could not be collected: ${problems.join('; ')}` };
  }
  const { root, side, gateBase, expectations, excludedSubtrees } = plan;
  const tools = {};
  const notExpected = [];
  const listsByTool = {};
  let tsconfigOptions = Object.freeze({});
  let eslintConfigByFile = NEUTRAL_ESLINT_CONFIGS;
  let eslintConfigFiles = Object.freeze([]);
  for (const tool of BOUNDARY_TOOLS) {
    if (!expectations[tool.name].expected) {
      notExpected.push(tool.name);
      continue;
    }
    const collected = collectTool(root, tool, io, plan);
    if (!collected.ok) return { ok: false, error: collected.error };
    tools[tool.name] = Object.freeze({ identities: identitiesOf(collected.diagnostics, root), fileCount: collected.fileCount });
    listsByTool[tool.name] = collected.files;
    if (tool.name === 'tsc') {
      tsconfigOptions = Object.freeze({ ...collected.tsconfigOptions });
    } else {
      eslintConfigByFile = collected.eslintConfigByFile;
      eslintConfigFiles = collected.eslintConfigFiles;
    }
  }
  const universe = checkedFileUniverse(root, listsByTool, excludedSubtrees);
  if (!universe.ok) return { ok: false, error: universe.error };
  const collectedTools = Object.keys(listsByTool).sort();
  if (collectedTools.length > 0 && universe.files.length === 0) {
    return {
      ok: false,
      error: `${side} (${root}) carries no repository source among the files ${collectedTools.join(', ')} reported, so the suppression and checked-scope scans would read nothing; a scanned universe of zero files is refused rather than read as a clean result`,
    };
  }
  const surface = Object.freeze({
    root,
    checkedFiles: universe.files,
    checkedByTool: universe.byTool,
    tsconfigOptions,
    eslintConfigByFile,
    eslintConfigFiles,
  });
  return { ok: true, census: Object.freeze({ gateBase, tools: Object.freeze(tools), notExpected: Object.freeze(notExpected), surface }) };
}

function lockfileDivergence(headRoot, baseRoot, io) {
  for (const name of LOCKFILE_NAMES) {
    const headPath = join(headRoot, name);
    const basePath = join(baseRoot, name);
    const onHead = io.exists(headPath);
    const onBase = io.exists(basePath);
    if (!onHead && !onBase) continue;
    if (onHead !== onBase) {
      return { diverged: true, lockfile: name, reason: `${name} is present at ${onHead ? headRoot : baseRoot} and absent at ${onHead ? baseRoot : headRoot}` };
    }
    let matches;
    try {
      matches = io.readFile(headPath) === io.readFile(basePath);
    } catch (error) {
      return {
        diverged: true,
        lockfile: name,
        reason: `${name} could not be compared between ${headRoot} and ${baseRoot} (${failureText(error, 'unknown read failure')}), so the two trees are treated as divergent rather than as sharing one dependency set`,
      };
    }
    if (!matches) return { diverged: true, lockfile: name, reason: `${name} differs between ${headRoot} and ${baseRoot}` };
  }
  return { diverged: false };
}

function provisionModules(headRoot, baseRoot, io) {
  const baseModules = join(baseRoot, NODE_MODULES);
  const divergence = lockfileDivergence(headRoot, baseRoot, io);
  if (!divergence.diverged) {
    try {
      io.symlink(join(headRoot, NODE_MODULES), baseModules);
    } catch (error) {
      return { ok: false, error: `the shared ${NODE_MODULES} link could not be made at ${baseModules}: ${failureText(error, 'unknown link failure')}` };
    }
    return { ok: true, strategy: 'symlink' };
  }
  const descriptor = LOCKFILE_MANAGERS[divergence.lockfile];
  if (descriptor.installArgv === null) {
    return { ok: false, error: `${divergence.reason}, and the program cannot service its package manager (${descriptor.name}): no install support is declared for it` };
  }
  const resolved = io.resolvePackageManager(descriptor.name);
  if (!resolved.ok) return resolved;
  try {
    io.removePath(baseModules);
    io.makeDir(baseModules);
  } catch (error) {
    return { ok: false, error: `the base ${NODE_MODULES} directory could not be prepared at ${baseModules}: ${failureText(error, 'unknown filesystem failure')}` };
  }
  let installed;
  try {
    installed = io.run('node', [resolved.entry, ...descriptor.installArgv], { cwd: baseRoot, deadlineMs: INSTALL_DEADLINE_MS });
  } catch (error) {
    return { ok: false, error: `the base install could not run: ${failureText(error, 'unknown spawn failure')}` };
  }
  if (!cleanlyRan(installed) || installed.status !== 0) {
    return { ok: false, error: `the base install failed on ${baseRoot}: ${JSON.stringify(installed === null || installed === undefined ? null : installed.stderr)}` };
  }
  return { ok: true, strategy: 'install' };
}

function attemptedRemoval(repoRoot, path, io) {
  let removed = null;
  try {
    removed = io.run('git', ['worktree', 'remove', '--force', '--', path], { cwd: repoRoot, deadlineMs: WORKTREE_DEADLINE_MS });
  } catch (error) {
    return `the removal could not be spawned (${failureText(error, 'unknown spawn failure')})`;
  }
  if (cleanlyRan(removed) && removed.status === 0) return null;
  return `git reported ${JSON.stringify(removed === null || removed === undefined ? null : removed.stderr)}`;
}

function teardown(repoRoot, path, io, label = 'base') {
  const reported = attemptedRemoval(repoRoot, path, io);
  if (reported === null) return null;
  try {
    io.removePath(path);
    return null;
  } catch (error) {
    return `the ${label} worktree at ${path} was left behind: ${reported}, and the fallback removal failed (${failureText(error, 'unknown filesystem failure')})`;
  }
}

function reclaimTeardown(repoRoot, path, io) {
  const reported = attemptedRemoval(repoRoot, path, io);
  if (reported === null) return null;
  return `git declined to remove the leaked worktree at ${path}, and a reclaim never substitutes a recursive delete for a removal git declined: ${reported}`;
}

function withSuppressions(census, suppressions) {
  return Object.freeze({ ...census, surface: Object.freeze({ ...census.surface, suppressions }) });
}

export function scannedSide(root, census, io, side) {
  const suppressions = collectSuppressionSurface(root, census.surface.checkedFiles, io, side);
  if (!suppressions.ok) return { ok: false, error: suppressions.error };
  return { ok: true, census: withSuppressions(census, suppressions.suppressions) };
}

export function excludedSubtreesFor(root, otherRoot) {
  const nested = nestedSubtree(root, otherRoot);
  return Object.freeze(nested === null ? [] : [nested]);
}

export const GATHER_SIDES_FIELDS = Object.freeze(['headPath', 'basePath', 'gateBase']);

function gatherPlanProblems(plan) {
  if (plan === null || typeof plan !== 'object' || Array.isArray(plan)) {
    return [`the gather plan must be a non-null, non-array object, received ${JSON.stringify(plan)}`];
  }
  const problems = Object.keys(plan)
    .filter((field) => !GATHER_SIDES_FIELDS.includes(field))
    .map((field) => `the gather plan carries the field ${JSON.stringify(field)}, which is outside the declared surface ${GATHER_SIDES_FIELDS.join(', ')}; a root that reached the head census through an undeclared field would census a tree the unit never committed`);
  for (const field of GATHER_SIDES_FIELDS) {
    if (typeof plan[field] !== 'string' || plan[field].length === 0) {
      problems.push(`the gather plan needs a non-empty ${field}, received ${JSON.stringify(plan[field])}`);
    }
  }
  return problems;
}

export function gatherSides(plan, io) {
  const problems = gatherPlanProblems(plan);
  if (problems.length > 0) return { ok: false, error: `the two sides could not be gathered: ${problems.join('; ')}` };
  const { headPath, basePath, gateBase } = plan;
  const provisioned = provisionModules(headPath, basePath, io);
  if (!provisioned.ok) return { ok: false, error: provisioned.error };
  const expectations = expectationsFor(headPath, basePath, io);
  if (!expectations.ok) return { ok: false, error: expectations.error };
  const head = collectCensus(Object.freeze({
    root: headPath,
    side: HEAD_SIDE,
    gateBase,
    expectations: expectations.byTool,
    scope: choosingScope(basePath),
    excludedSubtrees: excludedSubtreesFor(headPath, basePath),
  }), io);
  if (!head.ok) return { ok: false, error: head.error };
  const base = collectCensus(Object.freeze({
    root: basePath,
    side: BASE_SIDE,
    gateBase,
    expectations: expectations.byTool,
    scope: choosingScope(headPath),
    excludedSubtrees: excludedSubtreesFor(basePath, headPath),
  }), io);
  if (!base.ok) return { ok: false, error: base.error };
  const scannedHead = scannedSide(headPath, head.census, io, HEAD_SIDE);
  if (!scannedHead.ok) return scannedHead;
  const scannedBase = scannedSide(basePath, base.census, io, BASE_SIDE);
  if (!scannedBase.ok) return scannedBase;
  return {
    ok: true,
    headCensus: scannedHead.census,
    baseCensus: scannedBase.census,
    strategy: provisioned.strategy,
    expectations: expectations.byTool,
  };
}

function excludePathFor(path, io) {
  let resolved;
  try {
    resolved = io.run('git', ['rev-parse', '--path-format=absolute', '--git-path', 'info/exclude'], { cwd: path, deadlineMs: WORKTREE_DEADLINE_MS });
  } catch (error) {
    return { ok: false, error: `the exclude file for the worktree at ${path} could not be located: ${failureText(error, 'unknown spawn failure')}` };
  }
  if (!cleanlyRan(resolved) || resolved.status !== 0) {
    return { ok: false, error: `git rev-parse --git-path info/exclude in ${path} reported ${JSON.stringify(resolved === null || resolved === undefined ? null : resolved.stderr)}` };
  }
  const excludePath = resolved.stdout.trim();
  if (excludePath.length === 0) {
    return { ok: false, error: `git rev-parse --git-path info/exclude in ${path} printed an empty path` };
  }
  return { ok: true, excludePath };
}

function excludedFromCommits(path, entry, io) {
  const located = excludePathFor(path, io);
  if (!located.ok) return located;
  const { excludePath } = located;
  let existing = '';
  if (io.exists(excludePath)) {
    try {
      existing = io.readFile(excludePath);
    } catch (error) {
      return { ok: false, error: `the exclude file at ${excludePath} could not be read: ${failureText(error, 'unknown read failure')}` };
    }
  }
  if (existing.split('\n').some((line) => line.trim() === entry)) return { ok: true };
  const next = existing.length === 0 || existing.endsWith('\n') ? `${existing}${entry}\n` : `${existing}\n${entry}\n`;
  try {
    io.writeFile(excludePath, next);
  } catch (error) {
    return { ok: false, error: `the exclude file at ${excludePath} could not be written: ${failureText(error, 'unknown write failure')}` };
  }
  return { ok: true };
}

export { BOUNDARY_NAMESPACE_SEGMENTS } from './boundary-worktree-reclaim.mjs';

function materializedWorktree(repoRoot, path, revision, label, io) {
  let added;
  try {
    added = io.run('git', ['worktree', 'add', '--detach', '--', path, revision], { cwd: repoRoot, deadlineMs: WORKTREE_DEADLINE_MS });
  } catch (error) {
    return { ok: false, error: `the ${label} worktree could not be materialized at ${path}: ${failureText(error, 'unknown spawn failure')}` };
  }
  if (cleanlyRan(added) && added.status === 0) return { ok: true };
  return { ok: false, error: `the ${label} worktree could not be materialized at ${path}: git reported ${JSON.stringify(added === null || added === undefined ? null : added.stderr)}` };
}

function excludedWorktree(path, label, io, reclaim) {
  const excluded = excludedFromCommits(path, NODE_MODULES, io);
  if (excluded.ok) return Object.freeze({ ok: true, reclaim });
  return Object.freeze({
    ok: false,
    error: `the ${label} worktree at ${path} was materialized but ${NODE_MODULES} could not be kept out of its commits: ${excluded.error}`,
    reclaim,
  });
}

function refusedText(first, reclaim) {
  if (reclaim.reason === null) return first.error;
  if (!reclaim.destroyed) return `${first.error}; the leaked worktree could not be reclaimed: ${reclaim.reason}`;
  return `${first.error}; the worktree at ${reclaim.path} was removed and the reclaim still failed: ${reclaim.reason}`;
}

function retriedText(first, second, reclaim) {
  return `${second.error}; this followed the removal of the leaked worktree at ${reclaim.path}, whose original refusal was: ${first.error}`;
}

export function addedWorktree(repoRoot, path, revision, label, io) {
  const first = materializedWorktree(repoRoot, path, revision, label, io);
  if (first.ok) return excludedWorktree(path, label, io, NO_RECLAIM);
  const reclaim = reclaimedWorktree(repoRoot, path, io, Object.freeze({
    deadlineMs: WORKTREE_DEADLINE_MS,
    removeWorktree: (resolved) => reclaimTeardown(repoRoot, resolved, io),
  }));
  if (!reclaim.reclaimed) return Object.freeze({ ok: false, error: refusedText(first, reclaim), reclaim });
  const second = materializedWorktree(repoRoot, path, revision, label, io);
  if (!second.ok) return Object.freeze({ ok: false, error: retriedText(first, second, reclaim), reclaim });
  return excludedWorktree(path, label, io, reclaim);
}

function linkedModules(sourceRoot, targetRoot, io) {
  const target = join(targetRoot, NODE_MODULES);
  if (io.exists(target)) return { ok: true };
  const source = join(sourceRoot, NODE_MODULES);
  if (!io.exists(source)) return { ok: true };
  try {
    io.symlink(source, target);
  } catch (error) {
    return { ok: false, error: `the ${NODE_MODULES} link the head census needs could not be made at ${target}: ${failureText(error, 'unknown link failure')}` };
  }
  return { ok: true };
}

const COMMIT_SHA_SHAPE = /^[0-9a-f]{7,64}$/;

function resolvedCommit(root, revision, io) {
  let result;
  try {
    result = io.run('git', ['rev-parse', '--verify', revision], { cwd: root, deadlineMs: WORKTREE_DEADLINE_MS });
  } catch (error) {
    return { ok: false, error: failureText(error, 'unknown spawn failure') };
  }
  if (!cleanlyRan(result) || result.status !== 0) {
    return { ok: false, error: `git rev-parse --verify ${revision} in ${root} reported ${JSON.stringify(result === null || result === undefined ? null : result.stderr)}` };
  }
  const sha = result.stdout.trim();
  if (!COMMIT_SHA_SHAPE.test(sha)) {
    return { ok: false, error: `git rev-parse --verify ${revision} in ${root} printed ${JSON.stringify(sha)}, which is not the shape of a commit hash` };
  }
  return { ok: true, sha };
}

function staleHeadWorktree(repoRoot, headPath, headRef, io) {
  const requested = resolvedCommit(repoRoot, `${headRef}^{commit}`, io);
  if (!requested.ok) return { stale: false };
  const actual = resolvedCommit(headPath, 'HEAD', io);
  if (!actual.ok) return { stale: false };
  return { stale: requested.sha !== actual.sha, requestedSha: requested.sha, actualSha: actual.sha };
}

function collectedAgainstHead(request, io) {
  const { repoRoot, gateBase, basePath, headPath, headRef } = request;
  if (io.exists(headPath)) {
    const state = staleHeadWorktree(repoRoot, headPath, headRef, io);
    if (state.stale) {
      const cleared = teardown(repoRoot, headPath, io, 'stale head');
      if (cleared !== null) {
        return {
          ok: false,
          error: `the head worktree at ${headPath} sits at ${state.actualSha}, not the requested ${headRef} (${state.requestedSha}), and could not be cleared to re-materialize: ${cleared}`,
        };
      }
      const materialized = addedWorktree(repoRoot, headPath, headRef, 'head', io);
      if (!materialized.ok) return materialized;
    }
  } else {
    const materialized = addedWorktree(repoRoot, headPath, headRef, 'head', io);
    if (!materialized.ok) return materialized;
  }
  const linked = linkedModules(repoRoot, headPath, io);
  if (!linked.ok) return linked;
  return gatherSides(Object.freeze({ headPath, basePath, gateBase }), io);
}

export function removeHeadWorktree(request, io = REAL_BOUNDARY_IO) {
  return teardown(request.repoRoot, request.headPath, io, 'head');
}

export function collectSides(request, io) {
  const { repoRoot, gateBase, basePath } = request;
  const base = addedWorktree(repoRoot, basePath, gateBase, 'base', io);
  if (!base.ok) return Object.freeze({ ...base, leaked: null });
  let gathered;
  try {
    gathered = collectedAgainstHead(request, io);
  } catch (error) {
    gathered = { ok: false, error: `the base could not be collected at ${basePath}: ${failureText(error, 'unknown failure')}` };
  }
  return Object.freeze({ ...gathered, leaked: teardown(repoRoot, basePath, io) });
}
