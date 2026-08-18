import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BOUNDARY_TOOLS,
  NORMALIZATION_STEPS,
  REAL_BOUNDARY_IO,
  observeSide,
  parseEslintReport,
  structuralIdentity,
  toolExpectation,
} from '../boundary-collect.mjs';
import { censusIdentity } from '../boundary-census-cache.mjs';
import { compareCensuses, evaluate } from '../boundary-gate.mjs';
import { censusTscLines } from '../boundary-tsc-lines.mjs';

const ROOT = '/repo';
const BASE = '/tmp/base-wt';
const ABSENT_ROOT = '/no-such-root-for-the-boundary-gate-probe';

function refingerprinted(census) {
  return { ...census, identity: censusIdentity(census) };
}

function tscLine(file, line, col, code, message) {
  return `${file}(${line},${col}): error ${code}: ${message}`;
}

function eslintReport(entries) {
  return JSON.stringify(entries.map(([filePath, messages]) => ({
    filePath,
    messages: messages.map(([ruleId, message, line, column]) => ({ ruleId, message, line, column, severity: 2 })),
  })));
}

function describedBy(readFile) {
  return (path) => {
    const source = readFile(path);
    return Object.freeze({
      ok: true,
      path: String(path),
      kind: 'a regular file',
      regular: true,
      size: typeof source === 'string' ? Buffer.byteLength(source, 'utf8') : 0,
    });
  };
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
    resolveTool: (name, root) => ({ ok: true, path: `${root}/node_modules/.bin/${name}` }),
    resolvePackageManager: () => ({ ok: true, entry: '/pm/npm-cli.js' }),
  };
  const merged = { ...base, ...overrides, spawned, removed };
  const inner = merged.run;
  merged.run = (binary, argv, options) => {
    spawned.push(`${binary} ${argv.join(' ')}`);
    return inner(binary, argv, options);
  };
  if (typeof merged.describePath !== 'function') merged.describePath = describedBy(merged.readFile);
  return merged;
}

function collectibleEslintIo() {
  return fixtureIo({
    exists: (path) => String(path).includes('eslint.config') || String(path).includes('package.json') || String(path).endsWith('/a.ts'),
    readFile: () => JSON.stringify({ devDependencies: { eslint: '9.0.0' } }),
    run: (binary, argv) => {
      if (argv.includes('--print-config')) return { outcome: 'completed', status: 0, stdout: JSON.stringify({ rules: {} }), stderr: '' };
      return argv.some((value) => String(value).includes('eslint'))
        ? { outcome: 'completed', status: 0, stdout: eslintReport([['a.ts', []]]), stderr: '' }
        : { outcome: 'completed', status: 0, stdout: '', stderr: '' };
    },
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

test('two findings that differ only in their directory do not collapse to one identity', () => {
  const inSource = structuralIdentity({ file: `${ROOT}/src/a.ts`, code: 'no-eq', message: 'bad' }, ROOT);
  const inLib = structuralIdentity({ file: `${ROOT}/lib/a.ts`, code: 'no-eq', message: 'bad' }, ROOT);
  assert.notEqual(inSource, inLib, 'the file component collapsed to its basename, so a finding moved between directories reads as the same finding');
});

test('one finding observed under two worktree roots normalizes to one identity', () => {
  const head = structuralIdentity({ file: `${ROOT}/src/a.ts`, code: 'no-eq', message: 'bad' }, ROOT);
  const base = structuralIdentity({ file: '/tmp/base wt/src/a.ts', code: 'no-eq', message: 'bad' }, '/tmp/base wt');
  assert.equal(head, base, 'the same file under two roots normalized differently, so every finding would read as new');
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
    exists: (path) => String(path).includes('eslint.config') || String(path).includes('package.json') || /\/src\/a\d+\.ts$/.test(String(path)),
    run: (binary, argv) => {
      if (argv.includes('--print-config')) return { outcome: 'completed', status: 0, stdout: JSON.stringify({ rules: {} }), stderr: '' };
      if (argv.some((value) => value.includes('eslint'))) {
        const side = argv.some((value) => String(value).startsWith(BASE)) ? 1 : 2;
        return { outcome: 'completed', status: 1, stdout: withErrors(side), stderr: '' };
      }
      return { outcome: 'completed', status: 0, stdout: '', stderr: '' };
    },
  });
  const request = { repoRoot: ROOT, gateBase: 'abc123', basePath: BASE, cachedBaseCensus: null };
  const firstPass = evaluate(request, build());
  assert.ok(firstPass.baseCensus, `the base census the recheck reuses could not be collected: ${firstPass.output}`);
  const recheck = evaluate({ ...request, cachedBaseCensus: firstPass.baseCensus }, build());
  assert.equal(recheck.pass, firstPass.pass);
  assert.deepEqual(recheck.blocking, firstPass.blocking);
});

test('the base census a first pass publishes is reused by the recheck without the caller restamping it', () => {
  const build = () => fixtureIo({
    readFile: () => JSON.stringify({ devDependencies: { eslint: '9.0.0' } }),
    exists: (path) => String(path).includes('eslint.config') || String(path).includes('package.json') || String(path).endsWith('/a.ts'),
    run: (binary, argv) => {
      if (argv.includes('--print-config')) return { outcome: 'completed', status: 0, stdout: JSON.stringify({ rules: {} }), stderr: '' };
      if (argv.some((value) => String(value).includes('eslint'))) {
        return { outcome: 'completed', status: 0, stdout: eslintReport([['a.ts', []]]), stderr: '' };
      }
      return { outcome: 'completed', status: 0, stdout: '', stderr: '' };
    },
  });
  const request = { repoRoot: ROOT, gateBase: 'abc123', basePath: BASE, cachedBaseCensus: null };
  const firstPass = evaluate(request, build());
  assert.ok(firstPass.baseCensus, `the first pass published no base census: ${firstPass.output}`);
  const io = build();
  const recheck = evaluate({ ...request, cachedBaseCensus: firstPass.baseCensus }, io);
  assert.equal(
    recheck.usedCachedCensus,
    true,
    `the recheck refused the census the first pass published, so the base side is only ever reusable from a producer outside this program: ${recheck.output}`,
  );
  assert.ok(
    !io.spawned.some((command) => command.includes('worktree add')),
    `the recheck re-materialized the base instead of reusing the published census: ${JSON.stringify(io.spawned)}`,
  );
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
  const baseline = evaluate({ repoRoot: ROOT, gateBase: 'abc123', basePath: BASE, cachedBaseCensus: null }, collectibleEslintIo());
  assert.ok(baseline.baseCensus, `the base census this test keys to a foreign base could not be collected: ${baseline.output}`);
  const collectedCensus = refingerprinted(baseline.baseCensus);
  const foreignCensus = { ...collectedCensus, gateBase: `${collectedCensus.gateBase}-foreign` };
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

test('the shipped resolveTool refuses a path that does not exist, naming the path it tried', () => {
  const refused = REAL_BOUNDARY_IO.resolveTool('typescript', ABSENT_ROOT);
  assert.equal(refused.ok, false, `the resolver handed back ${JSON.stringify(refused)} for a path nothing installs, so the spawn would fail as a module-not-found rather than as a refusal`);
  assert.match(refused.error, /node_modules\/\.bin\/typescript/);
});

test('the shipped resolveTool resolves an executable a package really installed under .bin', () => {
  const root = mkdtempSync(join(tmpdir(), 'boundary-resolve-tool-'));
  try {
    mkdirSync(join(root, 'node_modules', '.bin'), { recursive: true });
    writeFileSync(join(root, 'node_modules', '.bin', 'tsc'), '');
    const resolved = REAL_BOUNDARY_IO.resolveTool('tsc', root);
    assert.equal(resolved.ok, true, `the resolver refused an executable that exists: ${JSON.stringify(resolved)}`);
    assert.equal(resolved.path, join(root, 'node_modules', '.bin', 'tsc'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the tsc leg spawns the executable the typescript package installs, not the package name', () => {
  const io = fixtureIo({
    exists: (path) => String(path).includes('tsconfig.json') || String(path).endsWith('package.json'),
    readFile: () => JSON.stringify({ devDependencies: { typescript: '5.0.0' } }),
    run: (binary, argv) => {
      if (argv.includes('--listFiles')) return { outcome: 'completed', status: 0, stdout: `${argv[argv.length - 1]}/src/a.ts\n`, stderr: '' };
      if (argv.includes('--showConfig')) return { outcome: 'completed', status: 0, stdout: JSON.stringify({ compilerOptions: {} }), stderr: '' };
      return { outcome: 'completed', status: 0, stdout: '', stderr: '' };
    },
  });
  evaluate({ repoRoot: ROOT, gateBase: 'abc123', basePath: BASE, cachedBaseCensus: null }, io);
  const typeRuns = io.spawned.filter((command) => command.includes('--noEmit'));
  assert.ok(typeRuns.length > 0, `no type-check child was requested at all: ${JSON.stringify(io.spawned)}`);
  for (const command of typeRuns) {
    const requested = command.split(' ')[1];
    assert.equal(requested.split('/').pop(), 'tsc', `the program named ${JSON.stringify(requested)}, and npm installs no executable under that name`);
  }
});

test('a tool whose executable cannot be resolved refuses naming the path tried rather than spawning it', () => {
  const io = fixtureIo({
    exists: (path) => String(path).includes('tsconfig.json') || String(path).endsWith('package.json'),
    readFile: () => JSON.stringify({ devDependencies: { typescript: '5.0.0' } }),
    resolveTool: (name, root) => ({ ok: false, error: `no executable exists at ${root}/node_modules/.bin/${name}` }),
  });
  const verdict = evaluate({ repoRoot: ROOT, gateBase: 'abc123', basePath: BASE, cachedBaseCensus: null }, io);
  assert.equal(verdict.pass, false);
  assert.match(verdict.output, /node_modules\/\.bin\/tsc/);
});

test('a finding fixed in one directory and reintroduced in another blocks rather than netting out', () => {
  const io = fixtureIo({
    exists: (path) => String(path).includes('eslint.config') || String(path).endsWith('package.json') || String(path).endsWith('/a.ts'),
    readFile: () => JSON.stringify({ devDependencies: { eslint: '9.0.0' } }),
    run: (binary, argv) => {
      if (argv.includes('--print-config')) return { outcome: 'completed', status: 0, stdout: JSON.stringify({ rules: {} }), stderr: '' };
      if (!argv.some((value) => String(value).includes('eslint'))) return { outcome: 'completed', status: 0, stdout: '', stderr: '' };
      const root = argv.some((value) => String(value).startsWith(BASE)) ? BASE : ROOT;
      const findings = root === BASE ? [['no-eq', 'bad', 1, 1]] : [];
      return {
        outcome: 'completed',
        status: 1,
        stdout: eslintReport([[`${root}/src/a.ts`, findings], [`${root}/lib/a.ts`, root === BASE ? [] : [['no-eq', 'bad', 1, 1]]]]),
        stderr: '',
      };
    },
  });
  const verdict = evaluate({ repoRoot: ROOT, gateBase: 'abc123', basePath: BASE, cachedBaseCensus: null }, io);
  assert.equal(verdict.pass, false, `an error introduced in a second directory did not block: ${verdict.output}`);
  assert.match(verdict.blocking[0].identity, /lib\/a\.ts/);
});

test('a chained tsc diagnostic folds its continuation lines into the message rather than halting the census', () => {
  const census = censusTscLines([
    "src/index.ts(5,9): error TS2322: Type 'X' is not assignable to type 'Y'.",
    "  Types of parameters 's' and 'n' are incompatible.",
    "    Type 'string' is not assignable to type 'number'.",
  ].join('\n'));
  assert.equal(census.ok, true, census.error);
  assert.equal(census.diagnostics.length, 1);
  assert.match(census.diagnostics[0].message, /Types of parameters/);
  assert.match(census.diagnostics[0].message, /not assignable to type 'number'/);
});

test('two chains sharing a head and differing in the tail do not collapse to one identity', () => {
  const head = "src/index.ts(5,9): error TS2322: Type 'X' is not assignable to type 'Y'.";
  const one = censusTscLines([head, "  Types of parameters 's' and 'n' are incompatible."].join('\n'));
  const two = censusTscLines([head, "  Types of parameters 'a' and 'b' are incompatible."].join('\n'));
  assert.equal(one.ok, true, one.error);
  assert.equal(two.ok, true, two.error);
  assert.notEqual(
    structuralIdentity(one.diagnostics[0], ROOT),
    structuralIdentity(two.diagnostics[0], ROOT),
    'the folded chain never reached the identity, so two different errors share one',
  );
});

test('an indented line with no preceding diagnostic halts with the line quoted rather than folding into nothing', () => {
  const halted = censusTscLines("  Types of parameters 's' and 'n' are incompatible.");
  assert.equal(halted.ok, false);
  assert.match(halted.error, /Types of parameters/);
});

test('an unclassifiable line that follows a diagnostic halts rather than being absorbed as its continuation', () => {
  const halted = censusTscLines([
    "src/index.ts(5,9): error TS2322: Type 'X' is not assignable to type 'Y'.",
    'Found 3 errors in 2 files.',
  ].join('\n'));
  assert.equal(halted.ok, false);
  assert.match(halted.error, /Found 3 errors in 2 files\./);
});

test('the base worktree argv terminates its options before the positionals', () => {
  const io = fixtureIo({ readFile: () => JSON.stringify({ devDependencies: { typescript: '5.0.0' } }) });
  evaluate({ repoRoot: ROOT, gateBase: 'abc123', basePath: BASE, cachedBaseCensus: null }, io);
  const added = io.spawned.find((command) => command.includes('worktree add'));
  assert.ok(added !== undefined, `no worktree add was requested: ${JSON.stringify(io.spawned)}`);
  assert.match(added, /worktree add --detach -- /, 'the positionals are not terminated, so a gateBase spelled like an option would be parsed as one');
});

test('a gateBase that is not a ref or sha shape is refused rather than silently detaching at HEAD', () => {
  const io = fixtureIo({ readFile: () => JSON.stringify({ devDependencies: { typescript: '5.0.0' } }) });
  assert.throws(
    () => evaluate({ repoRoot: ROOT, gateBase: '--force', basePath: BASE, cachedBaseCensus: null }, io),
    /gateBase/,
    'a gateBase spelled like an option was accepted, and git would detach at HEAD and report a passing verdict',
  );
});

test('a basePath that is not absolute is refused rather than resolved against an unknown working directory', () => {
  const io = fixtureIo({ readFile: () => JSON.stringify({ devDependencies: { typescript: '5.0.0' } }) });
  assert.throws(
    () => evaluate({ repoRoot: ROOT, gateBase: 'abc123', basePath: 'relative/base', cachedBaseCensus: null }, io),
    /basePath/,
  );
});

test('a cached census whose NOT-EXPECTED disagrees with the trees is refused and the base re-collected', () => {
  const io = collectibleEslintIo();
  const shape = {
    gateBase: 'abc123',
    tools: {},
    notExpected: ['eslint', 'tsc'],
    surface: {
      root: BASE,
      checkedFiles: [],
      checkedByTool: {},
      suppressions: {},
      tsconfigOptions: {},
      eslintConfigByFile: {},
      eslintConfigFiles: [],
    },
  };
  const cached = { ...shape, identity: censusIdentity(shape) };
  const verdict = evaluate({ repoRoot: ROOT, gateBase: 'abc123', basePath: BASE, cachedBaseCensus: cached }, io);
  assert.equal(verdict.usedCachedCensus, false, 'a supplied census decided that every tool was NOT-EXPECTED, which disables the gate with no child spawned');
  assert.ok(
    io.spawned.some((command) => command.includes('worktree add')),
    `the base was not re-collected against the real trees: ${JSON.stringify(io.spawned)}`,
  );
});

test('a worktree remove that exits non-zero falls back to removing the base path', () => {
  const io = fixtureIo({
    readFile: () => JSON.stringify({ devDependencies: { typescript: '5.0.0' } }),
    run: (binary, argv) => (argv.includes('remove')
      ? { outcome: 'completed', status: 1, stdout: '', stderr: 'fatal: is not a working tree' }
      : { outcome: 'completed', status: 0, stdout: '', stderr: '' }),
  });
  evaluate({ repoRoot: ROOT, gateBase: 'abc123', basePath: BASE, cachedBaseCensus: null }, io);
  assert.ok(io.removed.includes(BASE), `a failed worktree remove never reached the fallback removal: ${JSON.stringify(io.removed)}`);
});

test('a base worktree that could not be removed at all names the leaked path in the verdict', () => {
  const io = fixtureIo({
    readFile: () => JSON.stringify({ devDependencies: { typescript: '5.0.0' } }),
    run: (binary, argv) => (argv.includes('remove')
      ? { outcome: 'completed', status: 1, stdout: '', stderr: 'fatal: is not a working tree' }
      : { outcome: 'completed', status: 0, stdout: '', stderr: '' }),
    removePath: () => { throw new Error('EACCES: permission denied'); },
  });
  const verdict = evaluate({ repoRoot: ROOT, gateBase: 'abc123', basePath: BASE, cachedBaseCensus: null }, io);
  assert.match(verdict.output, /left behind/, `a leaked base worktree was not surfaced: ${verdict.output}`);
  assert.match(verdict.output, /base-wt/);
});

test('a config name that escapes the worktree root is not positively observed', () => {
  const observation = observeSide(
    ROOT,
    Object.freeze({ name: 'probe', dependencies: Object.freeze([]), configNames: Object.freeze(['../outside/eslint.config.js']) }),
    { exists: () => true, readFile: () => '{}' },
  );
  assert.equal(observation.observed, false, 'a config path that resolves outside the root was read as a positive observation of the side');
  assert.match(observation.reason, /outside the worktree root/);
});

test('a tsc diagnostic run that crashed with empty stdout is refused rather than read as no findings', () => {
  const io = fixtureIo({
    exists: (path) => String(path).includes('tsconfig.json') || String(path).endsWith('package.json'),
    readFile: () => JSON.stringify({ devDependencies: { typescript: '5.0.0' } }),
    run: (binary, argv) => {
      if (argv.includes('--listFiles')) return { outcome: 'completed', status: 0, stdout: `${argv[argv.length - 1]}/src/a.ts\n`, stderr: '' };
      if (argv.includes('--noEmit')) return { outcome: 'completed', status: 3, stdout: '', stderr: 'Debug Failure. False expression.' };
      return { outcome: 'completed', status: 0, stdout: '', stderr: '' };
    },
  });
  const verdict = evaluate({ repoRoot: ROOT, gateBase: 'abc123', basePath: BASE, cachedBaseCensus: null }, io);
  assert.equal(verdict.pass, false, 'a crashed type-check run was read as a side carrying no findings');
  assert.match(verdict.output, /exited 3/);
});

test('an eslint run that exits outside the statuses it exits with when it ran is refused naming the status', () => {
  const io = fixtureIo({
    exists: (path) => String(path).includes('eslint.config') || String(path).endsWith('package.json'),
    readFile: () => JSON.stringify({ devDependencies: { eslint: '9.0.0' } }),
    run: (binary, argv) => (argv.some((value) => String(value).includes('eslint'))
      ? { outcome: 'completed', status: 2, stdout: '', stderr: 'Cannot read config file: eslint.config.js' }
      : { outcome: 'completed', status: 0, stdout: '', stderr: '' }),
  });
  const verdict = evaluate({ repoRoot: ROOT, gateBase: 'abc123', basePath: BASE, cachedBaseCensus: null }, io);
  assert.equal(verdict.pass, false);
  assert.match(verdict.output, /exited 2/);
});

test('a lockfile present on one side only is a divergence rather than a shared node_modules link', () => {
  const io = fixtureIo({
    exists: (path) => String(path) !== `${BASE}/package-lock.json`,
    readFile: () => '{}',
  });
  const verdict = evaluate({ repoRoot: ROOT, gateBase: 'abc123', basePath: BASE, cachedBaseCensus: null }, io);
  assert.ok(
    io.spawned.includes('node /pm/npm-cli.js install --no-audit --no-fund'),
    `a lockfile present on one side only took the shared-link path: ${JSON.stringify(io.spawned)}; verdict=${verdict.output}`,
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

function tscSuppressionIo({ baseSuppressed, headSuppressed, baseStrict = true, headStrict = true }) {
  return fixtureIo({
    exists: (path) => String(path).endsWith('tsconfig.json') || String(path).endsWith('package.json') || String(path).endsWith('/a.ts'),
    readFile: (path) => {
      const text = String(path);
      if (text.endsWith('package.json')) return JSON.stringify({ devDependencies: { typescript: '5.0.0' } });
      if (text.endsWith('a.ts')) {
        const suppressed = text.startsWith(BASE) ? baseSuppressed : headSuppressed;
        return `${suppressed ? '// @ts-ignore\n' : ''}export const a = 1;\n`;
      }
      return '{}';
    },
    run: (binary, argv) => {
      if (argv.includes('--listFiles')) {
        const root = argv[argv.length - 1];
        return { outcome: 'completed', status: 0, stdout: `${root}/a.ts\n`, stderr: '' };
      }
      if (argv.includes('--showConfig')) {
        const root = argv[argv.length - 1];
        const strict = root === BASE ? baseStrict : headStrict;
        return { outcome: 'completed', status: 0, stdout: JSON.stringify({ compilerOptions: { strict } }), stderr: '' };
      }
      return { outcome: 'completed', status: 0, stdout: '', stderr: '' };
    },
  });
}

test('a suppression added at HEAD and absent at base makes evaluate block with classifier added-suppression', () => {
  const io = tscSuppressionIo({ baseSuppressed: false, headSuppressed: true });
  const verdict = evaluate({ repoRoot: ROOT, gateBase: 'abc123', basePath: BASE, cachedBaseCensus: null }, io);
  assert.equal(verdict.pass, false, verdict.output);
  const blocked = verdict.blocking.find((entry) => entry.classifier === 'added-suppression');
  assert.ok(blocked, `no added-suppression entry in blocking: ${JSON.stringify(verdict.blocking)}`);
  assert.equal(blocked.path, 'a.ts');
  assert.equal(blocked.directive, '@ts-ignore');
});

test('an inherited suppression present on both sides does not block', () => {
  const io = tscSuppressionIo({ baseSuppressed: true, headSuppressed: true });
  const verdict = evaluate({ repoRoot: ROOT, gateBase: 'abc123', basePath: BASE, cachedBaseCensus: null }, io);
  assert.equal(verdict.pass, true, verdict.output);
  assert.deepEqual([...verdict.blocking], []);
});

test('a strictness downgrade in resolved tsconfig makes evaluate block with classifier tsconfig-strictness', () => {
  const io = tscSuppressionIo({ baseSuppressed: false, headSuppressed: false, baseStrict: true, headStrict: false });
  const verdict = evaluate({ repoRoot: ROOT, gateBase: 'abc123', basePath: BASE, cachedBaseCensus: null }, io);
  assert.equal(verdict.pass, false, verdict.output);
  const blocked = verdict.blocking.find((entry) => entry.classifier === 'tsconfig-strictness');
  assert.ok(blocked, `no tsconfig-strictness entry in blocking: ${JSON.stringify(verdict.blocking)}`);
  assert.equal(blocked.flag, 'strict');
});

test('an unchanged resolved tsconfig does not block', () => {
  const io = tscSuppressionIo({ baseSuppressed: false, headSuppressed: false, baseStrict: true, headStrict: true });
  const verdict = evaluate({ repoRoot: ROOT, gateBase: 'abc123', basePath: BASE, cachedBaseCensus: null }, io);
  assert.equal(verdict.pass, true, verdict.output);
  assert.deepEqual([...verdict.blocking], []);
});

const NO_OP_GATE_BASE = 'abc123';
const TREE_PROBE_PREFIX = 'git rev-parse --verify ';
const BASE_SIDE_REVISION = `${NO_OP_GATE_BASE}^{tree}`;
const HEAD_SIDE_REVISION = 'HEAD^{tree}';

function shaAnsweringIo({ baseSha, headSha, status = 0 }) {
  const shaFor = (argv) => {
    const revision = argv[argv.length - 1];
    if (revision === BASE_SIDE_REVISION) return baseSha;
    if (revision === HEAD_SIDE_REVISION) return headSha;
    return null;
  };
  return fixtureIo({
    exists: () => false,
    readFile: () => JSON.stringify({}),
    run: (binary, argv) => {
      if (binary === 'git' && argv[0] === 'rev-parse' && argv[1] === '--verify') {
        const sha = shaFor(argv);
        if (sha === null) return { outcome: 'completed', status: 128, stdout: '', stderr: 'fatal: Needed a single revision' };
        return { outcome: 'completed', status, stdout: `${sha}\n`, stderr: '' };
      }
      return { outcome: 'completed', status: 0, stdout: '', stderr: '' };
    },
  });
}

const SAME_SHA = '3f7a1c9d2b4e6a8c0d1f2e3a4b5c6d7e8f901234';
const OTHER_SHA = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';

function noOpRequest(extra) {
  return { repoRoot: ROOT, gateBase: NO_OP_GATE_BASE, basePath: BASE, cachedBaseCensus: null, ...extra };
}

function assertBothSidesProbed(io) {
  const probes = io.spawned.filter((command) => command.startsWith(TREE_PROBE_PREFIX));
  assert.equal(
    probes.length,
    2,
    `the tree probe did not interrogate both sides, so a verdict carrying no refusal says nothing about what the probe decided: ${JSON.stringify(io.spawned)}`,
  );
  assert.equal(
    probes.filter((command) => command === `${TREE_PROBE_PREFIX}${BASE_SIDE_REVISION}`).length,
    1,
    `the base side was never resolved from the declared gateBase revision: ${JSON.stringify(probes)}`,
  );
  assert.equal(
    probes.filter((command) => command === `${TREE_PROBE_PREFIX}${HEAD_SIDE_REVISION}`).length,
    1,
    `the head side was never resolved from HEAD: ${JSON.stringify(probes)}`,
  );
}

test('the comparison reports how many head identities it actually examined', () => {
  const census = { eslint: { 'a::no-eq::x': 1 }, tsc: { 'b::TS2345::y': 3 } };
  const verdict = compareCensuses(census, census);
  assert.equal(verdict.comparedIdentities, 2, 'the comparison did not report exactly the two (tool, identity) pairs it examined');
  assert.equal(verdict.notComparable, false);
});

test('a comparison over an empty head census reports that it examined nothing while still passing', () => {
  const verdict = compareCensuses({ eslint: { 'a::no-eq::x': 1 } }, {});
  assert.equal(verdict.comparedIdentities, 0);
  assert.equal(verdict.notComparable, true);
  assert.equal(verdict.pass, true, 'pass was gated on comparedIdentities, and the declared narrowing keeps it meaning blocking.length === 0');
  assert.deepEqual([...verdict.blocking], []);
});

test('a base and a head at different trees are never refused as not comparable', () => {
  const io = shaAnsweringIo({ baseSha: SAME_SHA, headSha: OTHER_SHA });
  const verdict = evaluate(noOpRequest(), io);
  assert.equal(verdict.pass, true, verdict.output);
  assert.deepEqual(
    verdict.blocking.filter((entry) => entry.classifier === 'not-comparable'),
    [],
    'two distinct trees were refused as the same tree, so the gate over-refuses every ordinary MSP',
  );
  assertBothSidesProbed(io);
});

test('a tree that cannot be resolved on either side is never refused as not comparable', () => {
  const unresolvable = [
    shaAnsweringIo({ baseSha: SAME_SHA, headSha: SAME_SHA, status: 1 }),
    shaAnsweringIo({ baseSha: '', headSha: '' }),
  ];
  for (const io of unresolvable) {
    const verdict = evaluate(noOpRequest(), io);
    assert.equal(verdict.pass, true, verdict.output);
    assert.deepEqual(
      verdict.blocking.filter((entry) => entry.classifier === 'not-comparable'),
      [],
      'an unresolved tree was treated as a resolved one, so a side git could not report on reads as the same tree',
    );
    assertBothSidesProbed(io);
  }
});
