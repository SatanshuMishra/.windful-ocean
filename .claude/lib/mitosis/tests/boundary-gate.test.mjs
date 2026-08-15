import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import {
  BOUNDARY_TOOLS,
  NORMALIZATION_STEPS,
  REAL_BOUNDARY_IO,
  censusTscLines,
  collectBase,
  compareCensuses,
  evaluate,
  parseEslintReport,
  structuralIdentity,
  toolExpectation,
} from '../boundary-gate.mjs';

const ROOT = '/repo';
const BASE = '/tmp/base-wt';

function tscLine(file, line, col, code, message) {
  return `${file}(${line},${col}): error ${code}: ${message}`;
}

function eslintReport(entries) {
  return JSON.stringify(entries.map(([filePath, messages]) => ({
    filePath,
    messages: messages.map(([ruleId, message, line, column]) => ({ ruleId, message, line, column, severity: 2 })),
  })));
}

function fixtureIo(overrides) {
  const spawned = [];
  const removed = [];
  const base = {
    spawned,
    removed,
    run: (binary, argv) => {
      spawned.push(`${binary} ${argv.join(' ')}`);
      return { outcome: 'completed', status: 0, stdout: '', stderr: '', binary, argv };
    },
    exists: () => true,
    readFile: () => '{}',
    makeDir: () => {},
    symlink: () => {},
    removePath: (path) => { removed.push(path); },
    resolveTool: (name, root) => `${root}/node_modules/${name}/bin/${name}.js`,
    resolvePackageManager: () => ({ ok: true, entry: '/pm/npm-cli.js' }),
  };
  const merged = { ...base, ...overrides, spawned, removed };
  const inner = merged.run;
  merged.run = (binary, argv, options) => {
    spawned.push(`${binary} ${argv.join(' ')}`);
    return inner(binary, argv, options);
  };
  return merged;
}

function collectibleEslintIo() {
  return fixtureIo({
    exists: (path) => String(path).includes('eslint.config') || String(path).includes('package.json'),
    readFile: () => JSON.stringify({ devDependencies: { eslint: '9.0.0' } }),
    run: (binary, argv) => (argv.some((value) => String(value).includes('eslint'))
      ? { outcome: 'completed', status: 0, stdout: eslintReport([['a.ts', []]]), stderr: '' }
      : { outcome: 'completed', status: 0, stdout: '', stderr: '' }),
  });
}

test('a pure line shift does not change the structural identity', () => {
  const a = structuralIdentity({ file: 'src/a.ts', code: 'TS2345', message: 'Argument at 12:4 is wrong' });
  const b = structuralIdentity({ file: 'src/a.ts', code: 'TS2345', message: 'Argument at 90:7 is wrong' });
  assert.equal(a, b);
});

test('two distinct TS codes with the same message do not collapse to one identity', () => {
  const a = structuralIdentity({ file: 'src/a.ts', code: 'TS2345', message: 'Type is wrong' });
  const b = structuralIdentity({ file: 'src/a.ts', code: 'TS2339', message: 'Type is wrong' });
  assert.notEqual(a, b);
});

test('the normalization steps are a declared ordered list, not a blanket digit strip', () => {
  assert.ok(NORMALIZATION_STEPS.length >= 3);
  for (const step of NORMALIZATION_STEPS) {
    assert.equal(typeof step.name, 'string');
    assert.equal(typeof step.apply, 'function');
  }
  assert.equal(structuralIdentity({ file: 'a.ts', code: 'TS1', message: 'x' }).includes('TS1'), true);
});

test('a second instance of an error class already present at base blocks', () => {
  const base = { eslint: { 'a::no-eq::x': 1 } };
  const head = { eslint: { 'a::no-eq::x': 2 } };
  const verdict = compareCensuses(base, head);
  assert.equal(verdict.pass, false);
  assert.equal(verdict.blocking.length, 1);
  assert.equal(verdict.blocking[0].surplus, 1);
});

test('an unchanged pre-existing error does not block', () => {
  const verdict = compareCensuses({ eslint: { 'a::no-eq::x': 2 } }, { eslint: { 'a::no-eq::x': 2 } });
  assert.equal(verdict.pass, true);
  assert.deepEqual(verdict.blocking, []);
});

test('a fixed pre-existing error does not block and the count does not underflow', () => {
  const verdict = compareCensuses({ eslint: { 'a::no-eq::x': 3 } }, { eslint: {} });
  assert.equal(verdict.pass, true);
  assert.deepEqual(verdict.blocking, []);
});

test('a partly fixed pre-existing error still present at a lower count does not block', () => {
  const verdict = compareCensuses({ eslint: { 'a::no-eq::x': 3 } }, { eslint: { 'a::no-eq::x': 1 } });
  assert.equal(verdict.pass, true);
  assert.deepEqual(verdict.blocking, []);
});

test('the tsc line census classifies the declared diagnostic form and halts on anything else', () => {
  const clean = censusTscLines([tscLine('src/a.ts', 3, 9, 'TS2345', 'Argument bad'), '', 'error TS5083: Cannot read file'].join('\n'));
  assert.equal(clean.ok, true, clean.error);
  assert.equal(clean.diagnostics.length, 2);
  const halted = censusTscLines(['Found 3 errors in 2 files.'].join('\n'));
  assert.equal(halted.ok, false);
  assert.match(halted.error, /Found 3 errors in 2 files\./);
});

test('an eslint report that is not an array of file entries fails closed', () => {
  assert.equal(parseEslintReport('{}').ok, false);
  assert.equal(parseEslintReport('not json').ok, false);
  assert.equal(parseEslintReport(JSON.stringify([{ filePath: 'a.ts' }])).ok, false);
  assert.equal(parseEslintReport(eslintReport([['a.ts', []]])).ok, true);
});

test('an eslint run that scanned zero files fails closed rather than reading as clean', () => {
  const parsed = parseEslintReport('[]');
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /zero files/i);
});

test('a tsc run that type-checked zero files fails closed rather than reading as clean', () => {
  const io = fixtureIo({
    readFile: () => JSON.stringify({ devDependencies: { typescript: '5.0.0' } }),
    exists: (path) => String(path).includes('tsconfig.json') || String(path).endsWith('package.json'),
    run: () => ({ outcome: 'completed', status: 0, stdout: '', stderr: '' }),
  });
  const verdict = evaluate({ repoRoot: ROOT, gateBase: 'abc123', basePath: BASE, cachedBaseCensus: null }, io);
  assert.equal(verdict.pass, false);
  assert.match(verdict.output, /type-checked zero files/);
});

test('NOT-EXPECTED requires positive observation of both sides', () => {
  const observed = (config, dependency) => ({ configPresent: config, dependencyDeclared: dependency, observed: true });
  assert.equal(toolExpectation(observed(false, false), observed(false, false)).expected, false);
  assert.equal(toolExpectation(observed(true, false), observed(false, false)).expected, true);
  assert.equal(toolExpectation(observed(false, false), observed(true, false)).expected, true);
});

test('a side that cannot be positively observed is never NOT-EXPECTED', () => {
  const unobserved = { configPresent: false, dependencyDeclared: false, observed: false, reason: 'the config resolved outside the worktree root' };
  const expectation = toolExpectation(unobserved, { configPresent: false, dependencyDeclared: false, observed: true });
  assert.equal(expectation.expected, true);
  assert.equal(expectation.unobservable, true);
});

test('a config removed at HEAD for a tool expected at base stays expected', () => {
  const expectation = toolExpectation(
    { configPresent: true, dependencyDeclared: false, observed: true },
    { configPresent: false, dependencyDeclared: false, observed: true },
  );
  assert.equal(expectation.expected, true);
});

test('every tool NOT-EXPECTED yields a pass, because the lint and type dimension is legitimately empty', () => {
  const io = fixtureIo({ exists: () => false, readFile: () => JSON.stringify({}) });
  const verdict = evaluate({ repoRoot: ROOT, gateBase: 'abc123', basePath: BASE, cachedBaseCensus: null }, io);
  assert.equal(verdict.pass, true, verdict.output);
  assert.deepEqual([...verdict.notExpected].sort(), [...BOUNDARY_TOOLS].map((tool) => tool.name).sort());
});

test('the base worktree is torn down on the throw path, not only on success', () => {
  const io = fixtureIo({
    resolveTool: () => { throw new Error('the tool could not be resolved'); },
    readFile: () => JSON.stringify({ devDependencies: { typescript: '5.0.0' } }),
  });
  const verdict = evaluate({ repoRoot: ROOT, gateBase: 'abc123', basePath: BASE, cachedBaseCensus: null }, io);
  assert.equal(verdict.pass, false);
  assert.ok(io.spawned.some((command) => command.includes('worktree remove')), `teardown never ran: ${JSON.stringify(io.spawned)}`);
});

test('a base worktree that fails to materialize fails closed', () => {
  const io = fixtureIo({
    run: (binary, argv) => (argv.includes('add')
      ? { outcome: 'completed', status: 128, stdout: '', stderr: 'fatal: invalid reference' }
      : { outcome: 'completed', status: 0, stdout: '', stderr: '' }),
    readFile: () => JSON.stringify({ devDependencies: { typescript: '5.0.0' } }),
  });
  const verdict = evaluate({ repoRoot: ROOT, gateBase: 'abc123', basePath: BASE, cachedBaseCensus: null }, io);
  assert.equal(verdict.pass, false);
  assert.match(verdict.output, /base worktree/i);
});

test('an unclean collection fails closed rather than reporting a clean side', () => {
  const io = fixtureIo({
    run: (binary, argv) => (argv.includes('--noEmit')
      ? { outcome: 'spawn-failed', status: null, stdout: '', stderr: 'tsc not found' }
      : { outcome: 'completed', status: 0, stdout: '', stderr: '' }),
    readFile: () => JSON.stringify({ devDependencies: { typescript: '5.0.0' } }),
  });
  const verdict = evaluate({ repoRoot: ROOT, gateBase: 'abc123', basePath: BASE, cachedBaseCensus: null }, io);
  assert.equal(verdict.pass, false);
  assert.match(verdict.output, /collect/i);
});

test('the program never requests a binary outside the allowlist', () => {
  const io = fixtureIo({ readFile: () => JSON.stringify({ devDependencies: { typescript: '5.0.0', eslint: '9.0.0' } }) });
  evaluate({ repoRoot: ROOT, gateBase: 'abc123', basePath: BASE, cachedBaseCensus: null }, io);
  for (const command of io.spawned) {
    const binary = command.split(' ')[0];
    assert.ok(['git', 'node'].includes(binary), `the program requested ${JSON.stringify(binary)}, which is outside what the spawn policy allows`);
  }
});

test('the exec seam the program ships with refuses an unlisted binary rather than spawning it', () => {
  assert.throws(
    () => REAL_BOUNDARY_IO.run('npx', ['--version'], {}),
    /"npx" is not spawnable/,
    'the shipped seam admitted an unlisted binary, so it no longer routes through the shared chokepoint',
  );
});

test('first pass and recheck produce identical verdicts when the supplied census is the one collection would produce', () => {
  const withErrors = (count) => JSON.stringify(Array.from({ length: count }, (_, index) => ({
    filePath: `src/a${index}.ts`,
    messages: [{ ruleId: 'no-eq', message: 'bad', line: 1, column: 1, severity: 2 }],
  })));
  const build = () => fixtureIo({
    readFile: () => JSON.stringify({ devDependencies: { eslint: '9.0.0' } }),
    exists: (path) => String(path).includes('eslint.config') || String(path).includes('package.json'),
    run: (binary, argv) => {
      if (argv.some((value) => value.includes('eslint'))) {
        const side = argv.some((value) => String(value).startsWith(BASE)) ? 1 : 2;
        return { outcome: 'completed', status: 1, stdout: withErrors(side), stderr: '' };
      }
      return { outcome: 'completed', status: 0, stdout: '', stderr: '' };
    },
  });
  const request = { repoRoot: ROOT, gateBase: 'abc123', basePath: BASE, cachedBaseCensus: null };
  const firstPass = evaluate(request, build());
  const collected = collectBase(request, build());
  assert.equal(collected.ok, true, collected.error);
  const recheck = evaluate({ ...request, cachedBaseCensus: collected.census }, build());
  assert.equal(recheck.pass, firstPass.pass);
  assert.deepEqual(recheck.blocking, firstPass.blocking);
});

test('an absent cached census collects the base rather than comparing against nothing', () => {
  const io = fixtureIo({ readFile: () => JSON.stringify({ devDependencies: { typescript: '5.0.0' } }) });
  const verdict = evaluate({ repoRoot: ROOT, gateBase: 'abc123', basePath: BASE, cachedBaseCensus: null }, io);
  assert.equal(verdict.usedCachedCensus, false);
  assert.ok(
    io.spawned.some((command) => command.includes('worktree add')),
    `an absent cached census did not trigger a fresh base collection: ${JSON.stringify(io.spawned)}`,
  );
});

test('a malformed cached census falls back to collecting the base rather than trusting it', () => {
  const io = fixtureIo({ readFile: () => JSON.stringify({ devDependencies: { typescript: '5.0.0' } }) });
  const verdict = evaluate({ repoRoot: ROOT, gateBase: 'abc123', basePath: BASE, cachedBaseCensus: { nonsense: true } }, io);
  assert.ok(io.spawned.some((command) => command.includes('worktree add')), 'the fallback did not materialize the base');
  assert.equal(verdict.usedCachedCensus, false);
});

test('a cached census keyed to another base is refused and the base is re-collected rather than the census reused', () => {
  const collected = collectBase({ repoRoot: ROOT, gateBase: 'abc123', basePath: BASE }, collectibleEslintIo());
  assert.equal(collected.ok, true, collected.error);
  const foreignCensus = { ...collected.census, gateBase: `${collected.census.gateBase}-foreign` };
  const io = collectibleEslintIo();
  const verdict = evaluate({ repoRoot: ROOT, gateBase: 'abc123', basePath: BASE, cachedBaseCensus: foreignCensus }, io);
  assert.equal(verdict.usedCachedCensus, false);
  assert.ok(
    io.spawned.some((command) => command.includes('worktree add')),
    `a well-formed census keyed to a foreign base was reused rather than triggering a fresh collection: ${JSON.stringify(io.spawned)}`,
  );
});

test('identical input yields identical output across runs', () => {
  const request = { repoRoot: ROOT, gateBase: 'abc123', basePath: BASE, cachedBaseCensus: null };
  const one = evaluate(request, fixtureIo({ readFile: () => JSON.stringify({ devDependencies: { typescript: '5.0.0' } }) }));
  const two = evaluate(request, fixtureIo({ readFile: () => JSON.stringify({ devDependencies: { typescript: '5.0.0' } }) }));
  assert.deepEqual(one, two);
});

test('the shipped resolvePackageManager seam resolves a real npm JS entry, not the node binary', () => {
  const resolved = REAL_BOUNDARY_IO.resolvePackageManager('npm');
  assert.equal(resolved.ok, true, `resolvePackageManager('npm') did not resolve: ${JSON.stringify(resolved)}`);
  assert.notEqual(resolved.entry, process.execPath);
  assert.ok(resolved.entry.endsWith('.js'), `the resolved entry ${resolved.entry} does not end in .js`);
  assert.ok(existsSync(resolved.entry), `the resolved entry ${resolved.entry} does not exist on disk`);
});

test('a divergent yarn.lock refuses the gate before any install child spawns, naming yarn.lock and yarn', () => {
  const io = fixtureIo({
    exists: (path) => String(path).endsWith('yarn.lock'),
    readFile: (path) => (String(path).startsWith(BASE) ? 'base-yarn-bytes' : 'head-yarn-bytes'),
  });
  const verdict = evaluate({ repoRoot: ROOT, gateBase: 'abc123', basePath: BASE, cachedBaseCensus: null }, io);
  assert.equal(verdict.pass, false, verdict.output);
  assert.match(verdict.output, /yarn\.lock/);
  assert.match(verdict.output, /yarn/);
  assert.ok(
    !io.spawned.some((command) => /^node .*install/.test(command)),
    `an install child was spawned for an unserviceable lockfile: ${JSON.stringify(io.spawned)}`,
  );
});

test('a divergent package-lock.json composes the install argv from the resolved entry and the declared install flags', () => {
  const io = fixtureIo({
    exists: (path) => String(path).endsWith('package-lock.json'),
    readFile: (path) => (String(path).startsWith(BASE) ? 'base-lock-bytes' : 'head-lock-bytes'),
  });
  const verdict = evaluate({ repoRoot: ROOT, gateBase: 'abc123', basePath: BASE, cachedBaseCensus: null }, io);
  assert.ok(
    io.spawned.includes('node /pm/npm-cli.js install --no-audit --no-fund'),
    `the install argv was not composed from the resolved entry and declared flags: ${JSON.stringify(io.spawned)}; verdict=${JSON.stringify(verdict)}`,
  );
});
