import { REAL_BOUNDARY_IO, excludedSubtreesFor, parseEslintReport, structuralIdentity } from './boundary-collect.mjs';
import { evaluate } from './boundary-gate.mjs';
import {
  MAX_SCANNED_FILES,
  MAX_SCANNED_FILE_BYTES,
  MAX_SCANNED_TOTAL_BYTES,
  NODE_MODULES,
  collectSuppressionSurface,
  ownedFiles,
} from './boundary-scan-scope.mjs';
import { censusListedFiles, censusTscLines } from './boundary-tsc-lines.mjs';

const PROBE_ROOT = '/probe/collection/head';
const PROBE_BASE = '/probe/collection/base';
const PROBE_ABSENT_ROOT = '/probe/collection/no-such-root';
const PROBE_GATE_BASE = 'collectionprobebase';
const CLEAN_CHILD = Object.freeze({ outcome: 'completed', status: 0, stdout: '', stderr: '' });
const CHAIN_HEAD = "src/index.ts(5,9): error TS2322: Type 'X' is not assignable to type 'Y'.";
const CHAIN_TAIL = "  Types of parameters 's' and 'n' are incompatible.";
const OTHER_CHAIN_TAIL = "  Types of parameters 'a' and 'b' are incompatible.";

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

function probeIo(overrides) {
  const spawned = [];
  const started = [];
  const base = {
    spawned,
    started,
    run: (binary, argv) => ({ outcome: 'completed', status: 0, stdout: '', stderr: '', binary, argv }),
    exists: () => true,
    readFile: () => JSON.stringify({ devDependencies: { eslint: '9.0.0' } }),
    makeDir: () => {},
    symlink: () => {},
    removePath: () => {},
    resolveTool: (name, root) => ({ ok: true, path: `${root}/node_modules/.bin/${name}` }),
    resolvePackageManager: () => ({ ok: true, entry: '/probe/pm.js' }),
  };
  const merged = { ...base, ...overrides, spawned, started };
  const inner = merged.run;
  merged.run = (binary, argv, options) => {
    spawned.push(`${binary} ${argv.join(' ')}`);
    started.push(Object.freeze({ binary, argv: Object.freeze([...argv]), options }));
    return inner(binary, argv, options);
  };
  if (typeof merged.describePath !== 'function') merged.describePath = describedBy(merged.readFile);
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

function listedFileStdout(argv) {
  return { outcome: 'completed', status: 0, stdout: `${argv[argv.length - 1]}/src/a.ts\n`, stderr: '' };
}

function crashedRunIo() {
  return typescriptDeclaredIo({
    run: (binary, argv) => {
      if (argv.includes('--listFiles')) return listedFileStdout(argv);
      if (argv.includes('--noEmit')) return { outcome: 'completed', status: 3, stdout: '', stderr: 'Debug Failure. False expression.' };
      return CLEAN_CHILD;
    },
  });
}

export function toolResolutionProbe() {
  const absent = REAL_BOUNDARY_IO.resolveTool('typescript', PROBE_ABSENT_ROOT);
  const declaredIo = typescriptDeclaredIo({
    run: (binary, argv) => (argv.includes('--listFiles') ? listedFileStdout(argv) : CLEAN_CHILD),
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
  const unclassifiableListed = censusListedFiles([`${PROBE_ROOT}/src/a.ts`, 'Version 5.8.3'].join('\n'));
  const relativeListed = censusListedFiles('src/a.ts');
  const wellFormedListed = censusListedFiles([`${PROBE_ROOT}/src/a.ts`, CHAIN_HEAD, CHAIN_TAIL, ''].join('\n'));
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
    unclassifiableListedLineHalts: unclassifiableListed.ok === false
      && unclassifiableListed.error.includes('Version 5.8.3')
      && relativeListed.ok === false
      && relativeListed.error.includes('src/a.ts'),
    wellFormedListedFileParses: wellFormedListed.ok === true
      && wellFormedListed.files.length === 1
      && wellFormedListed.files[0] === `${PROBE_ROOT}/src/a.ts`,
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

const PROBE_SOURCE = 'export const a = 1;\n';
const PROBE_SOURCE_BYTES = Buffer.byteLength(PROBE_SOURCE, 'utf8');
const NESTED_BASE = `${PROBE_ROOT}/.claude/worktrees/msp`;
const OUTSIDE_BASE = '/probe/collection/elsewhere';

function scanIo(describeFile) {
  const read = [];
  return Object.freeze({
    read,
    readFile: (path) => {
      read.push(String(path));
      return PROBE_SOURCE;
    },
    describePath: (path) => (String(path) === PROBE_ROOT
      ? Object.freeze({ ok: true, path: PROBE_ROOT, kind: 'a directory', regular: false, size: 0 })
      : describeFile(String(path))),
  });
}

function regularFile(path, size) {
  return Object.freeze({ ok: true, path, kind: 'a regular file', regular: true, size });
}

function scannedWith(files, describeFile) {
  const io = scanIo(describeFile);
  return Object.freeze({ verdict: collectSuppressionSurface(PROBE_ROOT, files, io, 'HEAD'), read: io.read });
}

function refusedUnread(files, describeFile, phrase) {
  const scanned = scannedWith(files, describeFile);
  return scanned.verdict.ok === false && scanned.verdict.error.includes(phrase) && scanned.read.length === 0;
}

export function scanBoundsProbe() {
  const one = [`${PROBE_ROOT}/a.ts`];
  const within = scannedWith(one, (path) => regularFile(path, PROBE_SOURCE_BYTES));
  const overCap = refusedUnread(one, (path) => regularFile(path, MAX_SCANNED_FILE_BYTES + 1), `above the ${MAX_SCANNED_FILE_BYTES}-byte cap`);
  const overTotal = refusedUnread(
    Array.from({ length: 200 }, (unused, index) => `${PROBE_ROOT}/src/a${index}.ts`),
    (path) => regularFile(path, 1000000),
    `above the ${MAX_SCANNED_TOTAL_BYTES}-byte budget`,
  );
  const overCount = refusedUnread(
    Array.from({ length: MAX_SCANNED_FILES + 1 }, (unused, index) => `${PROBE_ROOT}/src/a${index}.ts`),
    (path) => regularFile(path, PROBE_SOURCE_BYTES),
    `above the ${MAX_SCANNED_FILES}-file budget`,
  );
  const escaping = refusedUnread(one, () => regularFile('/etc/hosts', 12), 'outside the worktree root');
  const irregular = refusedUnread(one, (path) => Object.freeze({ ok: true, path, kind: 'a named pipe', regular: false, size: 0 }), 'rather than a regular file');
  const nested = excludedSubtreesFor(PROBE_ROOT, NESTED_BASE);
  const owned = ownedFiles(PROBE_ROOT, [
    `${PROBE_ROOT}/a.ts`,
    `${NESTED_BASE}/a.ts`,
    `${PROBE_ROOT}/node_modules/pkg/a.ts`,
  ], nested);
  const deadlineIo = typescriptDeclaredIo({
    run: (binary, argv) => (argv.includes('--listFiles') ? listedFileStdout(argv) : CLEAN_CHILD),
  });
  probeEvaluate(deadlineIo);
  const dependencyOnly = probeEvaluate(typescriptDeclaredIo({
    run: (binary, argv) => {
      if (argv.includes('--listFiles')) {
        return { outcome: 'completed', status: 0, stdout: `${argv[argv.length - 1]}/${NODE_MODULES}/typescript/lib/lib.d.ts\n`, stderr: '' };
      }
      if (argv.includes('--showConfig')) return { outcome: 'completed', status: 0, stdout: JSON.stringify({ compilerOptions: { strict: true } }), stderr: '' };
      return CLEAN_CHILD;
    },
  }));
  return Object.freeze({
    dependencyOnlyUniverseRefused: dependencyOnly.pass === false && /carries no repository source/.test(dependencyOnly.output),
    withinBudgetScanned: within.verdict.ok === true && within.read.includes(`${PROBE_ROOT}/a.ts`),
    overCapRefusedUnread: overCap,
    overTotalRefusedUnread: overTotal,
    overCountRefusedUnread: overCount,
    escapingRealPathRefusedUnread: escaping,
    irregularPathRefusedUnread: irregular,
    nestedBaseExcluded: nested.length === 1
      && nested[0] === '.claude/worktrees/msp'
      && owned.length === 1
      && owned[0] === `${PROBE_ROOT}/a.ts`,
    separateBaseExcludesNothing: excludedSubtreesFor(PROBE_ROOT, OUTSIDE_BASE).length === 0,
    childrenStarted: deadlineIo.started.length,
    undeadlinedChildren: Object.freeze(deadlineIo.started
      .filter((child) => !Number.isInteger(child.options?.deadlineMs) || child.options.deadlineMs <= 0)
      .map((child) => `${child.binary} ${child.argv.join(' ')}`)),
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
