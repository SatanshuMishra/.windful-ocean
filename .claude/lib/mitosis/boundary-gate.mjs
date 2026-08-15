import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, join as pathJoin } from 'node:path';
import { run as execRun } from './exec-run.mjs';

export const IDENTITY_SEPARATOR = '\u0000';
export const NODE_MODULES = 'node_modules';

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

export const BOUNDARY_TOOLS = Object.freeze([
  Object.freeze({
    name: 'eslint',
    dependencies: Object.freeze(['eslint']),
    configNames: Object.freeze(['eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', '.eslintrc.json', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.yml']),
    binary: 'eslint',
    argv: (root, bin) => [bin, root, '-f', 'json'],
  }),
  Object.freeze({
    name: 'tsc',
    dependencies: Object.freeze(['typescript']),
    configNames: Object.freeze(['tsconfig.json']),
    binary: 'typescript',
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
  resolveTool: (dependency, root) => `${root}/${NODE_MODULES}/.bin/${dependency}`,
  resolvePackageManager: (managerName) => resolvePackageManagerEntry(managerName),
});

function join(root, name) {
  return `${root}/${name}`;
}

export function structuralIdentity(diagnostic) {
  const joined = [diagnostic.file ?? '', diagnostic.code ?? '', diagnostic.message ?? ''].join(IDENTITY_SEPARATOR);
  return NORMALIZATION_STEPS.reduce((text, step) => step.apply(text), joined);
}

export function censusTscLines(stdout) {
  if (typeof stdout !== 'string') {
    return { ok: false, error: `the tsc output was ${JSON.stringify(stdout)} rather than text, so no line could be classified` };
  }
  const diagnostics = [];
  const lines = stdout.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].replace(/\r$/, '');
    if (line.trim().length === 0) continue;
    const form = TSC_DIAGNOSTIC_FORMS.find((candidate) => candidate.pattern.test(line));
    if (form === undefined) {
      return {
        ok: false,
        error: `tsc line ${index + 1} is neither blank nor one of the ${TSC_DIAGNOSTIC_FORMS.length} declared diagnostic forms (${TSC_DIAGNOSTIC_FORMS.map((candidate) => candidate.name).join(', ')}): ${JSON.stringify(line)}; refusing to classify it rather than skipping it into a bucket`,
      };
    }
    const matched = form.pattern.exec(line).groups;
    diagnostics.push(Object.freeze({
      file: matched.file === undefined ? '' : matched.file,
      code: matched.code,
      severity: matched.severity,
      message: matched.message,
    }));
  }
  return { ok: true, diagnostics: Object.freeze(diagnostics) };
}

export function parseEslintReport(stdout) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    return { ok: false, error: `the eslint report could not be collected cleanly: it is not JSON (${error && error.message ? error.message : 'unknown parse failure'})` };
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
  return { ok: true, diagnostics: Object.freeze(diagnostics), fileCount: parsed.length };
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
    reason = `the package manifest at ${manifest} could not be read as JSON: ${error && error.message ? error.message : 'unknown read failure'}`;
  }
  const present = tool.configNames.filter((name) => {
    const path = join(root, name);
    if (!path.startsWith(`${root}/`)) {
      observed = false;
      reason = `the ${tool.name} config ${name} resolves to ${path}, which is outside the worktree root ${root}, so this side cannot be positively observed`;
      return false;
    }
    return io.exists(path);
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
  return result !== null && typeof result === 'object' && result.outcome === 'completed' && typeof result.status === 'number';
}

function collectTool(root, tool, io) {
  const bin = io.resolveTool(tool.binary, root);
  let result;
  try {
    result = io.run('node', tool.argv(root, bin), { cwd: root });
  } catch (error) {
    return { ok: false, error: `${tool.name} could not be collected on ${root}: ${error && error.message ? error.message : 'unknown spawn failure'}` };
  }
  if (!cleanlyRan(result)) {
    return { ok: false, error: `${tool.name} could not be collected cleanly on ${root}: the run reported ${JSON.stringify(result === null || result === undefined ? null : result.outcome)}` };
  }
  if (tool.name === 'eslint') {
    const parsed = parseEslintReport(result.stdout);
    if (!parsed.ok) return { ok: false, error: `${tool.name} on ${root}: ${parsed.error}` };
    return { ok: true, diagnostics: parsed.diagnostics, fileCount: parsed.fileCount };
  }
  const census = censusTscLines(result.stdout);
  if (!census.ok) return { ok: false, error: `${tool.name} on ${root}: ${census.error}` };
  let listed;
  try {
    listed = io.run('node', tool.listArgv(root, bin), { cwd: root });
  } catch (error) {
    return { ok: false, error: `${tool.name} could not be collected on ${root}: the type-checked file list failed (${error && error.message ? error.message : 'unknown spawn failure'})` };
  }
  if (!cleanlyRan(listed)) {
    return { ok: false, error: `${tool.name} could not be collected cleanly on ${root}: the type-checked file list reported ${JSON.stringify(listed === null || listed === undefined ? null : listed.outcome)}` };
  }
  const fileCount = listed.stdout.split('\n').filter((line) => line.trim().length > 0 && !TSC_DIAGNOSTIC_FORMS.some((form) => form.pattern.test(line))).length;
  if (fileCount === 0) {
    return { ok: false, error: `${tool.name} on ${root} type-checked zero files, so the run is refused rather than read as a clean result` };
  }
  return { ok: true, diagnostics: census.diagnostics, fileCount };
}

function identitiesOf(diagnostics) {
  const counts = {};
  for (const diagnostic of diagnostics) {
    const identity = structuralIdentity(diagnostic);
    counts[identity] = (counts[identity] ?? 0) + 1;
  }
  return counts;
}

export function collectCensus(root, expectations, io, gateBase) {
  const tools = {};
  const notExpected = [];
  for (const tool of BOUNDARY_TOOLS) {
    const expectation = expectations[tool.name];
    if (!expectation.expected) {
      notExpected.push(tool.name);
      continue;
    }
    const collected = collectTool(root, tool, io);
    if (!collected.ok) return { ok: false, error: collected.error };
    tools[tool.name] = Object.freeze({ identities: identitiesOf(collected.diagnostics), fileCount: collected.fileCount });
  }
  return { ok: true, census: Object.freeze({ gateBase, tools: Object.freeze(tools), notExpected: Object.freeze(notExpected), surface: Object.freeze({ root }) }) };
}

function lockfileDivergence(headRoot, baseRoot, io) {
  for (const name of LOCKFILE_NAMES) {
    const headPath = join(headRoot, name);
    const basePath = join(baseRoot, name);
    if (!io.exists(headPath) || !io.exists(basePath)) continue;
    let matches;
    try {
      matches = io.readFile(headPath) === io.readFile(basePath);
    } catch {
      matches = false;
    }
    if (!matches) return { diverged: true, lockfile: name };
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
      return { ok: false, error: `the shared ${NODE_MODULES} link could not be made at ${baseModules}: ${error && error.message ? error.message : 'unknown link failure'}` };
    }
    return { ok: true, strategy: 'symlink' };
  }
  const descriptor = LOCKFILE_MANAGERS[divergence.lockfile];
  if (descriptor.installArgv === null) {
    return { ok: false, error: `${divergence.lockfile} diverged between ${headRoot} and ${baseRoot}, and the program cannot service its package manager (${descriptor.name}): no install support is declared for it` };
  }
  const resolved = io.resolvePackageManager(descriptor.name);
  if (!resolved.ok) return resolved;
  try {
    io.removePath(baseModules);
    io.makeDir(baseModules);
  } catch (error) {
    return { ok: false, error: `the base ${NODE_MODULES} directory could not be prepared at ${baseModules}: ${error && error.message ? error.message : 'unknown filesystem failure'}` };
  }
  let installed;
  try {
    installed = io.run('node', [resolved.entry, ...descriptor.installArgv], { cwd: baseRoot });
  } catch (error) {
    return { ok: false, error: `the base install could not run: ${error && error.message ? error.message : 'unknown spawn failure'}` };
  }
  if (!cleanlyRan(installed) || installed.status !== 0) {
    return { ok: false, error: `the base install failed on ${baseRoot}: ${JSON.stringify(installed === null || installed === undefined ? null : installed.stderr)}` };
  }
  return { ok: true, strategy: 'install' };
}

export function collectBase(request, io) {
  const { repoRoot, gateBase, basePath } = request;
  let added;
  try {
    added = io.run('git', ['worktree', 'add', '--detach', basePath, gateBase], { cwd: repoRoot });
  } catch (error) {
    return { ok: false, error: `the base worktree could not be materialized at ${basePath}: ${error && error.message ? error.message : 'unknown spawn failure'}` };
  }
  if (!cleanlyRan(added) || added.status !== 0) {
    return { ok: false, error: `the base worktree could not be materialized at ${basePath}: git reported ${JSON.stringify(added === null || added === undefined ? null : added.stderr)}` };
  }
  try {
    const provisioned = provisionModules(repoRoot, basePath, io);
    if (!provisioned.ok) return { ok: false, error: provisioned.error };
    const expectations = expectationsFor(repoRoot, basePath, io);
    if (!expectations.ok) return { ok: false, error: expectations.error };
    const collected = collectCensus(basePath, expectations.byTool, io, gateBase);
    if (!collected.ok) return { ok: false, error: collected.error };
    return { ok: true, census: collected.census, strategy: provisioned.strategy };
  } finally {
    teardown(repoRoot, basePath, io);
  }
}

function teardown(repoRoot, basePath, io) {
  try {
    io.run('git', ['worktree', 'remove', '--force', basePath], { cwd: repoRoot });
  } catch {
    try {
      io.removePath(basePath);
    } catch {
      return;
    }
  }
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

export function isUsableCachedCensus(cached, gateBase) {
  if (cached === null || typeof cached !== 'object' || Array.isArray(cached)) return false;
  if (cached.gateBase !== gateBase) return false;
  if (cached.tools === null || typeof cached.tools !== 'object' || Array.isArray(cached.tools)) return false;
  if (!Array.isArray(cached.notExpected)) return false;
  if (cached.surface === null || typeof cached.surface !== 'object') return false;
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

function refused(output) {
  return Object.freeze({ pass: false, output, blocking: Object.freeze([]), notExpected: Object.freeze([]), usedCachedCensus: false, baseCensus: null });
}

export function evaluate(request, io = REAL_BOUNDARY_IO) {
  if (request === null || typeof request !== 'object') {
    throw new TypeError('boundary-gate: evaluate expects a request object carrying repoRoot, gateBase and basePath');
  }
  for (const field of ['repoRoot', 'gateBase', 'basePath']) {
    if (typeof request[field] !== 'string' || request[field].length === 0) {
      throw new TypeError(`boundary-gate: evaluate expects ${field} to be a non-empty string, not ${JSON.stringify(request[field])}`);
    }
  }
  const usable = isUsableCachedCensus(request.cachedBaseCensus ?? null, request.gateBase);
  let baseCensus;
  let head;
  try {
    if (usable) {
      baseCensus = request.cachedBaseCensus;
    } else {
      const collected = collectBase(request, io);
      if (!collected.ok) return refused(collected.error);
      baseCensus = collected.census;
    }
    const expectations = {};
    for (const tool of BOUNDARY_TOOLS) {
      expectations[tool.name] = Object.freeze({ expected: !baseCensus.notExpected.includes(tool.name), unobservable: false, reason: null });
    }
    head = collectCensus(request.repoRoot, expectations, io, request.gateBase);
  } catch (error) {
    return refused(`the boundary gate could not complete: ${error && error.message ? error.message : 'unknown failure'}`);
  }
  if (!head.ok) return refused(head.error);
  const verdict = compareCensuses(
    Object.fromEntries(Object.entries(baseCensus.tools).map(([name, entry]) => [name, entry.identities])),
    Object.fromEntries(Object.entries(head.census.tools).map(([name, entry]) => [name, entry.identities])),
  );
  return Object.freeze({
    pass: verdict.pass,
    output: verdict.pass
      ? `no new finding: ${baseCensus.notExpected.length === BOUNDARY_TOOLS.length ? 'every tool is NOT-EXPECTED, so the lint and type dimension is legitimately empty' : `${Object.keys(head.census.tools).sort().join(', ')} collected cleanly on both sides`}`
      : `${verdict.blocking.length} new finding(s) this MSP introduced: ${verdict.blocking.map((entry) => `${entry.tool} ${JSON.stringify(entry.identity)} base ${entry.baseCount} head ${entry.headCount}`).join('; ')}`,
    blocking: verdict.blocking,
    notExpected: baseCensus.notExpected,
    usedCachedCensus: usable,
    baseCensus,
  });
}
