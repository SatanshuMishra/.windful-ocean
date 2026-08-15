import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, isAbsolute, join as pathJoin } from 'node:path';
import { choosingAnchor, collectEslintConfig, collectTsconfigOptions, fixedAnchor } from './boundary-config-surface.mjs';
import { evasionVerdict } from './boundary-evasion.mjs';
import {
  NODE_MODULES,
  checkedFileUniverse,
  collectSuppressionSurface,
  commonTreeFiles,
  sideRelativeFile,
  within,
} from './boundary-scan-scope.mjs';
import { run as execRun } from './exec-run.mjs';

export const IDENTITY_SEPARATOR = '\u0000';
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

function failureText(error, fallback) {
  return error && error.message ? error.message : fallback;
}

function resolveManagerEntry(descriptor) {
  if (descriptor.entryCandidates.length === 0) {
    return { ok: false, error: `the program cannot service the ${descriptor.name} package manager: no entry-resolution candidate is declared for it` };
  }
  const tried = [];
  for (const candidate of descriptor.entryCandidates) {
    const raw = candidate(process.execPath);
    tried.push(raw);
    if (!existsSync(raw)) continue;
    let real;
    try {
      real = realpathSync(raw);
    } catch {
      continue;
    }
    if (real.endsWith('.js')) return { ok: true, entry: real };
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

export const TSC_DIAGNOSTIC_FORMS = Object.freeze([
  Object.freeze({
    name: 'file-qualified diagnostic',
    pattern: /^(?<file>[^(]+)\((?<line>\d+),(?<column>\d+)\): (?<severity>error|warning) (?<code>TS\d+): (?<message>.*)$/,
  }),
  Object.freeze({
    name: 'global diagnostic',
    pattern: /^(?<severity>error|warning) (?<code>TS\d+): (?<message>.*)$/,
  }),
]);

export const TSC_CONTINUATION_FORM = Object.freeze({
  name: 'chained message continuation',
  pattern: /^\s+\S/,
});

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

export const REAL_BOUNDARY_IO = Object.freeze({
  run: (binary, argv, options) => execRun(binary, argv, options),
  exists: (path) => existsSync(path),
  readFile: (path) => readFileSync(path, 'utf8'),
  makeDir: (path) => mkdirSync(path, { recursive: true }),
  symlink: (target, path) => symlinkSync(target, path, 'dir'),
  removePath: (path) => rmSync(path, { recursive: true, force: true }),
  resolveTool: (executable, root) => resolveToolPath(executable, root),
  resolvePackageManager: (managerName) => resolvePackageManagerEntry(managerName),
});

function join(root, name) {
  return pathJoin(root, name);
}

export function structuralIdentity(diagnostic, root) {
  return IDENTITY_COMPONENTS
    .map((component) => component.steps.reduce((text, step) => step.apply(text, root), diagnostic[component.field] ?? ''))
    .join(IDENTITY_SEPARATOR);
}

export function censusTscLines(stdout) {
  if (typeof stdout !== 'string') {
    return { ok: false, error: `the tsc output was ${JSON.stringify(stdout)} rather than text, so no line could be classified` };
  }
  const collected = [];
  const lines = stdout.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].replace(/\r$/, '');
    if (line.trim().length === 0) continue;
    const form = TSC_DIAGNOSTIC_FORMS.find((candidate) => candidate.pattern.test(line));
    if (form !== undefined) {
      const matched = form.pattern.exec(line).groups;
      collected.push(Object.freeze({
        file: matched.file === undefined ? '' : matched.file,
        code: matched.code,
        severity: matched.severity,
        message: matched.message,
        continuations: Object.freeze([]),
      }));
      continue;
    }
    if (TSC_CONTINUATION_FORM.pattern.test(line) && collected.length > 0) {
      const previous = collected[collected.length - 1];
      collected[collected.length - 1] = Object.freeze({ ...previous, continuations: Object.freeze([...previous.continuations, line]) });
      continue;
    }
    return {
      ok: false,
      error: `tsc line ${index + 1} is neither blank, one of the ${TSC_DIAGNOSTIC_FORMS.length} declared diagnostic forms (${TSC_DIAGNOSTIC_FORMS.map((candidate) => candidate.name).join(', ')}), nor an indented ${TSC_CONTINUATION_FORM.name} of a diagnostic already named: ${JSON.stringify(line)}; refusing to classify it rather than skipping it into a bucket`,
    };
  }
  const diagnostics = collected.map((entry) => Object.freeze({
    file: entry.file,
    code: entry.code,
    severity: entry.severity,
    message: [entry.message, ...entry.continuations].join('\n'),
  }));
  return { ok: true, diagnostics: Object.freeze(diagnostics) };
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

function cleanlyRan(result) {
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

function listedFiles(stdout) {
  return stdout
    .split('\n')
    .map((line) => line.replace(/\r$/, ''))
    .filter((line) => line.trim().length > 0
      && !TSC_DIAGNOSTIC_FORMS.some((form) => form.pattern.test(line))
      && !TSC_CONTINUATION_FORM.pattern.test(line));
}

function listedFileCount(stdout) {
  return listedFiles(stdout).length;
}

function collectTool(root, tool, io, side, anchor) {
  const binary = toolBinary(root, tool, io);
  if (!binary.ok) return binary;
  const bin = binary.path;
  let result;
  try {
    result = io.run('node', tool.argv(root, bin), { cwd: root });
  } catch (error) {
    return { ok: false, error: `${tool.name} could not be collected on ${root}: ${failureText(error, 'unknown spawn failure')}` };
  }
  const accepted = acceptedRun(tool, result, root, 'the diagnostic run');
  if (!accepted.ok) return accepted;
  if (tool.name === 'eslint') {
    const parsed = parseEslintReport(result.stdout);
    if (!parsed.ok) return { ok: false, error: `${tool.name} on ${root}: ${parsed.error}` };
    const config = collectEslintConfig(root, bin, io, parsed.files, side, anchor);
    if (!config.ok) return { ok: false, error: `${tool.name} on ${root}: ${config.error}` };
    return {
      ok: true,
      diagnostics: parsed.diagnostics,
      fileCount: parsed.fileCount,
      files: parsed.files,
      eslintConfig: config.eslintConfig,
      eslintConfigFile: config.eslintConfigFile,
    };
  }
  const census = censusTscLines(result.stdout);
  if (!census.ok) return { ok: false, error: `${tool.name} on ${root}: ${census.error}` };
  let listed;
  try {
    listed = io.run('node', tool.listArgv(root, bin), { cwd: root });
  } catch (error) {
    return { ok: false, error: `${tool.name} could not be collected on ${root}: the type-checked file list failed (${failureText(error, 'unknown spawn failure')})` };
  }
  const acceptedList = acceptedRun(tool, listed, root, 'the type-checked file list');
  if (!acceptedList.ok) return acceptedList;
  const fileCount = listedFileCount(listed.stdout);
  if (fileCount === 0) {
    return { ok: false, error: `${tool.name} on ${root} type-checked zero files, so the run is refused rather than read as a clean result` };
  }
  const files = Object.freeze([...listedFiles(listed.stdout)].sort());
  const config = collectTsconfigOptions(root, bin, io, side);
  if (!config.ok) return { ok: false, error: `${tool.name} on ${root}: ${config.error}` };
  return { ok: true, diagnostics: census.diagnostics, fileCount, files, tsconfigOptions: config.tsconfigOptions };
}

function identitiesOf(diagnostics, root) {
  const counts = {};
  for (const diagnostic of diagnostics) {
    const identity = structuralIdentity(diagnostic, root);
    counts[identity] = (counts[identity] ?? 0) + 1;
  }
  return counts;
}

const NEUTRAL_ESLINT_CONFIG = Object.freeze({ rules: Object.freeze({}) });

export function collectCensus(root, expectations, io, gateBase, side = 'a side', anchor = null) {
  const tools = {};
  const notExpected = [];
  const listsByTool = {};
  let tsconfigOptions = Object.freeze({});
  let eslintConfig = NEUTRAL_ESLINT_CONFIG;
  let eslintConfigFile = null;
  for (const tool of BOUNDARY_TOOLS) {
    const expectation = expectations[tool.name];
    if (!expectation.expected) {
      notExpected.push(tool.name);
      continue;
    }
    const collected = collectTool(root, tool, io, side, anchor);
    if (!collected.ok) return { ok: false, error: collected.error };
    tools[tool.name] = Object.freeze({ identities: identitiesOf(collected.diagnostics, root), fileCount: collected.fileCount });
    listsByTool[tool.name] = collected.files;
    if (tool.name === 'tsc') {
      tsconfigOptions = Object.freeze({ ...collected.tsconfigOptions });
    } else {
      eslintConfig = collected.eslintConfig;
      eslintConfigFile = collected.eslintConfigFile;
    }
  }
  const universe = checkedFileUniverse(root, listsByTool);
  if (!universe.ok) return { ok: false, error: universe.error };
  const collectedTools = Object.keys(listsByTool).sort();
  if (collectedTools.length > 0 && universe.files.length === 0) {
    return {
      ok: false,
      error: `${side} (${root}) carries no repository source among the files ${collectedTools.join(', ')} reported, so the suppression and checked-scope scans would read nothing; a scanned universe of zero files is refused rather than read as a clean result`,
    };
  }
  const surface = Object.freeze({ root, checkedFiles: universe.files, tsconfigOptions, eslintConfig, eslintConfigFile });
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
    } catch {
      matches = false;
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
    installed = io.run('node', [resolved.entry, ...descriptor.installArgv], { cwd: baseRoot });
  } catch (error) {
    return { ok: false, error: `the base install could not run: ${failureText(error, 'unknown spawn failure')}` };
  }
  if (!cleanlyRan(installed) || installed.status !== 0) {
    return { ok: false, error: `the base install failed on ${baseRoot}: ${JSON.stringify(installed === null || installed === undefined ? null : installed.stderr)}` };
  }
  return { ok: true, strategy: 'install' };
}

export const GATE_BASE_SHAPE = /^[0-9A-Za-z][0-9A-Za-z._/-]*$/;

const REQUEST_FIELDS = Object.freeze([
  Object.freeze({
    name: 'repoRoot',
    accepts: (value) => isAbsolute(value),
    requirement: 'an absolute path',
  }),
  Object.freeze({
    name: 'gateBase',
    accepts: (value) => GATE_BASE_SHAPE.test(value) && !value.includes('..'),
    requirement: 'a ref or sha shape that cannot be read as an option or as a revision range',
  }),
  Object.freeze({
    name: 'basePath',
    accepts: (value) => isAbsolute(value),
    requirement: 'an absolute path',
  }),
]);

function requestProblems(request) {
  const problems = [];
  for (const field of REQUEST_FIELDS) {
    const value = request[field.name];
    if (typeof value !== 'string' || value.length === 0) {
      problems.push(`${field.name} must be a non-empty string, not ${JSON.stringify(value)}`);
      continue;
    }
    if (!field.accepts(value)) {
      problems.push(`${field.name} must be ${field.requirement}, not ${JSON.stringify(value)}`);
    }
  }
  return problems;
}

function expectationsFor(headRoot, baseRoot, io) {
  const byTool = {};
  for (const tool of BOUNDARY_TOOLS) {
    const baseObservation = observeSide(baseRoot, tool, io);
    const headObservation = observeSide(headRoot, tool, io);
    byTool[tool.name] = toolExpectation(baseObservation, headObservation);
  }
  return { ok: true, byTool: Object.freeze(byTool) };
}

function teardown(repoRoot, basePath, io) {
  let removed = null;
  let thrown = null;
  try {
    removed = io.run('git', ['worktree', 'remove', '--force', '--', basePath], { cwd: repoRoot });
  } catch (error) {
    thrown = failureText(error, 'unknown spawn failure');
  }
  if (thrown === null && cleanlyRan(removed) && removed.status === 0) return null;
  const reported = thrown === null
    ? `git reported ${JSON.stringify(removed === null || removed === undefined ? null : removed.stderr)}`
    : `the removal could not be spawned (${thrown})`;
  try {
    io.removePath(basePath);
    return null;
  } catch (error) {
    return `the base worktree at ${basePath} was left behind: ${reported}, and the fallback removal failed (${failureText(error, 'unknown filesystem failure')})`;
  }
}

function withSuppressions(census, suppressions) {
  return Object.freeze({ ...census, surface: Object.freeze({ ...census.surface, suppressions }) });
}

function scannedSide(root, census, io, side) {
  const suppressions = collectSuppressionSurface(root, census.surface.checkedFiles, io, side);
  if (!suppressions.ok) return { ok: false, error: suppressions.error };
  return { ok: true, census: withSuppressions(census, suppressions.suppressions) };
}

function gatherSides(repoRoot, basePath, gateBase, io) {
  const provisioned = provisionModules(repoRoot, basePath, io);
  if (!provisioned.ok) return { ok: false, error: provisioned.error };
  const expectations = expectationsFor(repoRoot, basePath, io);
  if (!expectations.ok) return { ok: false, error: expectations.error };
  const head = collectCensus(repoRoot, expectations.byTool, io, gateBase, 'HEAD', choosingAnchor(basePath));
  if (!head.ok) return { ok: false, error: head.error };
  const base = collectCensus(basePath, expectations.byTool, io, gateBase, 'base', fixedAnchor(head.census.surface.eslintConfigFile));
  if (!base.ok) return { ok: false, error: base.error };
  const scannedHead = scannedSide(repoRoot, head.census, io, 'HEAD');
  if (!scannedHead.ok) return scannedHead;
  const scannedBase = scannedSide(basePath, base.census, io, 'base');
  if (!scannedBase.ok) return scannedBase;
  return {
    ok: true,
    headCensus: scannedHead.census,
    baseCensus: scannedBase.census,
    strategy: provisioned.strategy,
    expectations: expectations.byTool,
  };
}

function collectSides(request, io) {
  const { repoRoot, gateBase, basePath } = request;
  let added;
  try {
    added = io.run('git', ['worktree', 'add', '--detach', '--', basePath, gateBase], { cwd: repoRoot });
  } catch (error) {
    return Object.freeze({ ok: false, error: `the base worktree could not be materialized at ${basePath}: ${failureText(error, 'unknown spawn failure')}`, leaked: null });
  }
  if (!cleanlyRan(added) || added.status !== 0) {
    return Object.freeze({ ok: false, error: `the base worktree could not be materialized at ${basePath}: git reported ${JSON.stringify(added === null || added === undefined ? null : added.stderr)}`, leaked: null });
  }
  let gathered;
  try {
    gathered = gatherSides(repoRoot, basePath, gateBase, io);
  } catch (error) {
    gathered = { ok: false, error: `the base could not be collected at ${basePath}: ${failureText(error, 'unknown failure')}` };
  }
  return Object.freeze({ ...gathered, leaked: teardown(repoRoot, basePath, io) });
}

export function collectBase(request, io) {
  const problems = requestProblems(request);
  if (problems.length > 0) {
    return Object.freeze({ ok: false, error: `the base worktree could not be materialized: ${problems.join('; ')}`, leaked: null });
  }
  const collected = collectSides(request, io);
  if (!collected.ok) return Object.freeze({ ok: false, error: collected.error, leaked: collected.leaked });
  return Object.freeze({
    ok: true,
    census: collected.baseCensus,
    strategy: collected.strategy,
    expectations: collected.expectations,
    leaked: collected.leaked,
  });
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export const CACHED_SURFACE_FIELDS = Object.freeze([
  Object.freeze({ name: 'root', accepts: (value) => typeof value === 'string' && value.length > 0 }),
  Object.freeze({ name: 'checkedFiles', accepts: (value) => Array.isArray(value) }),
  Object.freeze({ name: 'suppressions', accepts: isPlainObject }),
  Object.freeze({ name: 'tsconfigOptions', accepts: isPlainObject }),
  Object.freeze({ name: 'eslintConfig', accepts: (value) => isPlainObject(value) && isPlainObject(value.rules) }),
]);

export function isUsableCachedCensus(cached, gateBase) {
  if (cached === null || typeof cached !== 'object' || Array.isArray(cached)) return false;
  if (cached.gateBase !== gateBase) return false;
  if (cached.tools === null || typeof cached.tools !== 'object' || Array.isArray(cached.tools)) return false;
  if (!Array.isArray(cached.notExpected)) return false;
  if (!isPlainObject(cached.surface)) return false;
  if (CACHED_SURFACE_FIELDS.some((field) => !field.accepts(cached.surface[field.name]))) return false;
  const named = [...Object.keys(cached.tools), ...cached.notExpected].sort();
  if (JSON.stringify(named) !== JSON.stringify(BOUNDARY_TOOLS.map((tool) => tool.name).sort())) return false;
  for (const entry of Object.values(cached.tools)) {
    if (entry === null || typeof entry !== 'object') return false;
    if (entry.identities === null || typeof entry.identities !== 'object' || Array.isArray(entry.identities)) return false;
    for (const count of Object.values(entry.identities)) {
      if (!Number.isInteger(count) || count < 0) return false;
    }
  }
  return true;
}

function cachedCensusAgreement(cached, expectations) {
  const disagreeing = BOUNDARY_TOOLS
    .filter((tool) => expectations[tool.name].expected === cached.notExpected.includes(tool.name))
    .map((tool) => `${tool.name} is ${expectations[tool.name].expected ? 'expected' : 'NOT-EXPECTED'} over the trees and ${cached.notExpected.includes(tool.name) ? 'NOT-EXPECTED' : 'expected'} in the supplied census`);
  return Object.freeze({ agrees: disagreeing.length === 0, disagreeing: Object.freeze(disagreeing) });
}

function usableCachedBase(request, io) {
  const cached = request.cachedBaseCensus ?? null;
  if (!isUsableCachedCensus(cached, request.gateBase)) return { ok: false, refusal: null };
  const recomputed = expectationsFor(request.repoRoot, request.basePath, io);
  if (!recomputed.ok) return { ok: false, refusal: recomputed.error };
  const agreement = cachedCensusAgreement(cached, recomputed.byTool);
  if (!agreement.agrees) {
    return {
      ok: false,
      refusal: `the supplied base census was refused and the base re-collected: ${agreement.disagreeing.join('; ')}; what a tool is expected to report is recomputed from the trees rather than read from the census being compared against`,
    };
  }
  return { ok: true, census: cached, expectations: recomputed.byTool, refusal: null };
}

export function compareCensuses(baseIdentitiesByTool, headIdentitiesByTool) {
  const blocking = [];
  for (const tool of Object.keys(headIdentitiesByTool).sort()) {
    const baseCounts = baseIdentitiesByTool[tool] ?? {};
    const headCounts = headIdentitiesByTool[tool];
    for (const identity of Object.keys(headCounts).sort()) {
      const headCount = headCounts[identity];
      const baseCount = baseCounts[identity] ?? 0;
      if (headCount > baseCount) {
        blocking.push(Object.freeze({ tool, identity, baseCount, headCount, surplus: headCount - baseCount }));
      }
    }
  }
  return Object.freeze({ pass: blocking.length === 0, blocking: Object.freeze(blocking) });
}

function withNotes(output, notes) {
  return [output, ...notes.filter((note) => typeof note === 'string' && note.length > 0)].join('; ');
}

export const REFUSAL_CLASSIFIER = 'collection-refused';
export const EVASION_HALT_CLASSIFIER = 'evasion-halted';

function refused(output, context) {
  const detail = withNotes(output, [context.cacheRefusal, context.leaked]);
  return Object.freeze({
    pass: false,
    output: detail,
    blocking: Object.freeze([Object.freeze({ classifier: REFUSAL_CLASSIFIER, detail })]),
    notExpected: Object.freeze([]),
    usedCachedCensus: false,
    baseCensus: null,
    leaked: context.leaked,
  });
}

function evasionOutput(evasion) {
  if (evasion.halted) return `the evasion scan halted: ${evasion.error}`;
  if (evasion.pass) return 'no evasion detected';
  return `${evasion.blocking.length} evasion finding(s): ${evasion.blocking.map((entry) => `${entry.classifier}: ${entry.detail}`).join('; ')}`;
}

function evasionBlocking(evasion) {
  if (!evasion.halted) return evasion.blocking;
  return Object.freeze([Object.freeze({ classifier: EVASION_HALT_CLASSIFIER, detail: evasion.error })]);
}

export function evaluate(request, io = REAL_BOUNDARY_IO) {
  if (request === null || typeof request !== 'object') {
    throw new TypeError('boundary-gate: evaluate expects a request object carrying repoRoot, gateBase and basePath');
  }
  const problems = requestProblems(request);
  if (problems.length > 0) {
    throw new TypeError(`boundary-gate: evaluate refuses this request: ${problems.join('; ')}`);
  }
  let baseCensus;
  let headCensus;
  let expectations;
  let usedCachedCensus = false;
  let context = { leaked: null, cacheRefusal: null };
  let evasion;
  try {
    const cached = usableCachedBase(request, io);
    context = { ...context, cacheRefusal: cached.refusal };
    if (cached.ok) {
      const head = collectCensus(request.repoRoot, cached.expectations, io, request.gateBase, 'HEAD', fixedAnchor(cached.census.surface.eslintConfigFile));
      if (!head.ok) return refused(head.error, context);
      const scanned = scannedSide(request.repoRoot, head.census, io, 'HEAD');
      if (!scanned.ok) return refused(scanned.error, context);
      baseCensus = cached.census;
      headCensus = scanned.census;
      expectations = cached.expectations;
      usedCachedCensus = true;
    } else {
      const collected = collectSides(request, io);
      context = { ...context, leaked: collected.leaked };
      if (!collected.ok) return refused(collected.error, context);
      baseCensus = collected.baseCensus;
      headCensus = collected.headCensus;
      expectations = collected.expectations;
    }
    const commonFiles = commonTreeFiles(baseCensus.surface, headCensus.surface, io);
    evasion = evasionVerdict(baseCensus.surface, Object.freeze({ ...headCensus.surface, commonFiles }));
  } catch (error) {
    return refused(`the boundary gate could not complete: ${failureText(error, 'unknown failure')}`, context);
  }
  const verdict = compareCensuses(
    Object.fromEntries(Object.entries(baseCensus.tools).map(([name, entry]) => [name, entry.identities])),
    Object.fromEntries(Object.entries(headCensus.tools).map(([name, entry]) => [name, entry.identities])),
  );
  const notExpected = Object.freeze(BOUNDARY_TOOLS.filter((tool) => !expectations[tool.name].expected).map((tool) => tool.name));
  const blocking = Object.freeze([
    ...verdict.blocking.map((entry) => Object.freeze({ classifier: 'new-finding', ...entry })),
    ...evasionBlocking(evasion),
  ]);
  const findingsText = verdict.pass
    ? `no new finding: ${notExpected.length === BOUNDARY_TOOLS.length ? 'every tool is NOT-EXPECTED, so the lint and type dimension is legitimately empty' : `${Object.keys(headCensus.tools).sort().join(', ')} collected cleanly on both sides`}`
    : `${verdict.blocking.length} new finding(s) this MSP introduced: ${verdict.blocking.map((entry) => `${entry.tool} ${JSON.stringify(entry.identity)} base ${entry.baseCount} head ${entry.headCount}`).join('; ')}`;
  return Object.freeze({
    pass: verdict.pass && evasion.pass,
    output: withNotes(`${findingsText}; ${evasionOutput(evasion)}`, [context.cacheRefusal, context.leaked]),
    blocking,
    notExpected,
    usedCachedCensus,
    baseCensus,
    leaked: context.leaked,
  });
}
