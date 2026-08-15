import { REAL_BOUNDARY_IO, censusTscLines, evaluate, parseEslintReport, structuralIdentity } from './boundary-gate.mjs';

const PROBE_ROOT = '/probe/collection/head';
const PROBE_BASE = '/probe/collection/base';
const PROBE_ABSENT_ROOT = '/probe/collection/no-such-root';
const PROBE_GATE_BASE = 'collectionprobebase';
const CLEAN_CHILD = Object.freeze({ outcome: 'completed', status: 0, stdout: '', stderr: '' });
const CHAIN_HEAD = "src/index.ts(5,9): error TS2322: Type 'X' is not assignable to type 'Y'.";
const CHAIN_TAIL = "  Types of parameters 's' and 'n' are incompatible.";
const OTHER_CHAIN_TAIL = "  Types of parameters 'a' and 'b' are incompatible.";

function probeIo(overrides) {
  const spawned = [];
  const base = {
    spawned,
    run: (binary, argv) => ({ outcome: 'completed', status: 0, stdout: '', stderr: '', binary, argv }),
    exists: () => true,
    readFile: () => JSON.stringify({ devDependencies: { eslint: '9.0.0' } }),
    makeDir: () => {},
    symlink: () => {},
    removePath: () => {},
    resolveTool: (name, root) => ({ ok: true, path: `${root}/node_modules/.bin/${name}` }),
    resolvePackageManager: () => ({ ok: true, entry: '/probe/pm.js' }),
  };
  const merged = { ...base, ...overrides, spawned };
  const inner = merged.run;
  merged.run = (binary, argv, options) => {
    spawned.push(`${binary} ${argv.join(' ')}`);
    return inner(binary, argv, options);
  };
  return merged;
}

function probeEvaluate(io, cachedBaseCensus = null) {
  return evaluate({ repoRoot: PROBE_ROOT, gateBase: PROBE_GATE_BASE, basePath: PROBE_BASE, cachedBaseCensus }, io);
}

function typescriptDeclaredIo(overrides) {
  return probeIo({
    exists: (path) => String(path).includes('tsconfig.json') || String(path).endsWith('package.json'),
    readFile: () => JSON.stringify({ devDependencies: { typescript: '5.0.0' } }),
    ...overrides,
  });
}

function tscZeroFilesIo() {
  return typescriptDeclaredIo({ run: () => CLEAN_CHILD });
}

function crashedRunIo() {
  return typescriptDeclaredIo({
    run: (binary, argv) => {
      if (argv.includes('--listFiles')) return { outcome: 'completed', status: 0, stdout: 'src/a.ts\n', stderr: '' };
      if (argv.includes('--noEmit')) return { outcome: 'completed', status: 3, stdout: '', stderr: 'Debug Failure. False expression.' };
      return CLEAN_CHILD;
    },
  });
}

export function toolResolutionProbe() {
  const absent = REAL_BOUNDARY_IO.resolveTool('typescript', PROBE_ABSENT_ROOT);
  const declaredIo = typescriptDeclaredIo({
    run: (binary, argv) => (argv.includes('--listFiles') ? { outcome: 'completed', status: 0, stdout: 'src/a.ts\n', stderr: '' } : CLEAN_CHILD),
  });
  probeEvaluate(declaredIo);
  const typeRuns = declaredIo.spawned.filter((command) => command.includes('--noEmit'));
  const unresolvableIo = typescriptDeclaredIo({
    resolveTool: (name, root) => ({ ok: false, error: `no executable exists at ${root}/node_modules/.bin/${name}` }),
  });
  const unresolvable = probeEvaluate(unresolvableIo);
  return Object.freeze({
    absentToolRefused: absent.ok === false && absent.error.includes(`${PROBE_ABSENT_ROOT}/node_modules/.bin/typescript`),
    executablesNamed: typeRuns.length > 0 && typeRuns.every((command) => command.split(' ')[1].split('/').pop() === 'tsc'),
    unresolvableRefused: unresolvable.pass === false && /node_modules\/\.bin\/tsc/.test(unresolvable.output),
  });
}

export function failClosedProbe() {
  const malformed = censusTscLines('Found 3 errors in 2 files.');
  const wellFormed = censusTscLines('src/a.ts(3,9): error TS2345: Argument bad');
  const emptyReport = parseEslintReport('[]');
  const notAnArray = parseEslintReport('{}');
  const notJson = parseEslintReport('not json');
  const zeroTypeChecked = probeEvaluate(tscZeroFilesIo());
  const chained = censusTscLines([CHAIN_HEAD, CHAIN_TAIL].join('\n'));
  const otherChain = censusTscLines([CHAIN_HEAD, OTHER_CHAIN_TAIL].join('\n'));
  const orphan = censusTscLines(CHAIN_TAIL);
  const trailingSummary = censusTscLines([CHAIN_HEAD, 'Found 3 errors in 2 files.'].join('\n'));
  const crashed = probeEvaluate(crashedRunIo());
  return Object.freeze({
    malformedTscLineHalts: malformed.ok === false && malformed.error.includes('Found 3 errors in 2 files.'),
    wellFormedTscLineParses: wellFormed.ok === true && wellFormed.diagnostics.length === 1,
    zeroFilesRefused: emptyReport.ok === false && /zero files/i.test(emptyReport.error),
    zeroTypeCheckedFilesRefused: zeroTypeChecked.pass === false && /type-checked zero files/.test(zeroTypeChecked.output),
    shapeRefused: notAnArray.ok === false && notJson.ok === false,
    chainFolded: chained.ok === true && chained.diagnostics.length === 1 && chained.diagnostics[0].message.includes(CHAIN_TAIL.trim()),
    chainTailsDistinct: chained.ok === true && otherChain.ok === true && structuralIdentity(chained.diagnostics[0], PROBE_ROOT) !== structuralIdentity(otherChain.diagnostics[0], PROBE_ROOT),
    orphanContinuationHalts: orphan.ok === false && orphan.error.includes(CHAIN_TAIL),
    trailingUnclassifiableLineHalts: trailingSummary.ok === false && trailingSummary.error.includes('Found 3 errors in 2 files.'),
    crashedRunRefused: crashed.pass === false && /exited 3/.test(crashed.output),
  });
}

function failedRemovalIo(removePath) {
  return probeIo({
    run: (binary, argv) => (argv.includes('remove')
      ? { outcome: 'completed', status: 1, stdout: '', stderr: 'fatal: is not a working tree' }
      : CLEAN_CHILD),
    removePath,
  });
}

export function teardownProbe() {
  const io = probeIo({ resolveTool: () => { throw new Error('the tool could not be resolved'); } });
  const verdict = probeEvaluate(io);
  const removals = [];
  probeEvaluate(failedRemovalIo((path) => { removals.push(path); }));
  const leaked = probeEvaluate(failedRemovalIo(() => { throw new Error('EACCES: permission denied'); }));
  return Object.freeze({
    tornDownOnThrow: io.spawned.some((command) => command.includes('worktree remove')),
    failedClosed: verdict.pass === false,
    failedRemovalFallsBack: removals.includes(PROBE_BASE),
    leakSurfaced: /left behind/.test(leaked.output) && leaked.output.includes(PROBE_BASE),
  });
}

export function materializationProbe() {
  const io = probeIo({
    run: (binary, argv) => (argv.includes('add') ? { outcome: 'completed', status: 128, stdout: '', stderr: 'fatal: invalid reference' } : CLEAN_CHILD),
  });
  const verdict = probeEvaluate(io);
  return Object.freeze({ failedClosed: verdict.pass === false && /base worktree/i.test(verdict.output) });
}

function unserviceableLockfileIo() {
  return probeIo({
    exists: (path) => String(path).endsWith('yarn.lock'),
    readFile: (path) => (String(path).startsWith(PROBE_BASE) ? 'base-yarn-bytes' : 'head-yarn-bytes'),
  });
}

export function packageManagerProbe() {
  const resolved = REAL_BOUNDARY_IO.resolvePackageManager('npm');
  const npmEntryResolved = resolved.ok === true && resolved.entry !== process.execPath && resolved.entry.endsWith('.js');
  const io = unserviceableLockfileIo();
  const verdict = probeEvaluate(io);
  const unserviceableLockfileRefused = verdict.pass === false && /yarn\.lock/.test(verdict.output) && /yarn/.test(verdict.output);
  const noInstallSpawned = !io.spawned.some((command) => /^node .*install/.test(command));
  return Object.freeze({ npmEntryResolved, unserviceableLockfileRefused, noInstallSpawned });
}
