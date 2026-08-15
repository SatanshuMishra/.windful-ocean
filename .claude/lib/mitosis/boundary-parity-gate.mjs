import {
  BOUNDARY_C7_OBLIGATIONS,
  BOUNDARY_DECLARATIONS,
  BOUNDARY_DISPATCH_NAMES,
  boundaryCensus,
  censusBoundarySources,
} from './boundary-census.mjs';
import {
  BOUNDARY_TOOLS,
  IDENTITY_COMPONENTS,
  NORMALIZATION_STEPS,
  REAL_BOUNDARY_IO,
  collectBase,
  compareCensuses,
  evaluate,
  structuralIdentity,
  toolExpectation,
} from './boundary-gate.mjs';
import {
  SUPPRESSION_DIRECTIVES,
  TSCONFIG_STRICTNESS_FLAGS,
  compareCheckedFiles,
  compareRuleSeverity,
  compareSuppressions,
  compareTsconfigFlags,
  countSuppressions,
  evasionVerdict,
  suppressionKey,
} from './boundary-evasion.mjs';
import {
  failClosedProbe,
  materializationProbe,
  packageManagerProbe,
  teardownProbe,
  toolResolutionProbe,
} from './boundary-collection-failure-probe.mjs';
import { evasionWiringProbe } from './boundary-evasion-wiring-probe.mjs';
import { run as execRun } from './exec-run.mjs';

const PROBE_ROOT = '/probe/head';
const PROBE_BASE = '/probe/base';
const PROBE_GATE_BASE = 'probebase';
const UNLISTED_PROBE_BINARY = 'npx';
const PROBE_SCOPE_ROOTS = Object.freeze({ base: PROBE_BASE, head: PROBE_ROOT });

export const BOUNDARY_PARITY_ATTESTS = Object.freeze([
  'every boundary label spelled in either declared engine tree is resolved to exactly one declared name, and a label none of them covers halts with its site named rather than being absorbed by a name it merely extends',
  'both mechanical dispatch sites and the judgment site are named in each engine tree, and the copies outside the conversion target are named as twins, so the live-path divergence is measured rather than assumed',
  'every source spelling a boundary label is either a declared dispatch source or a declared non-dispatch source carrying a reason, in both directions, so a source that appeared and a source that vanished from the scan both halt rather than letting a site go uncounted',
  'a declared non-dispatch source that starts dispatching a boundary label halts rather than staying inert on a reason written when it did not, and that halt is exercised here on a synthetic source every time this verb runs',
  'the structural identity keeps the diagnostic code verbatim while ignoring line and column pairs, so a pure line shift does not block and two distinct codes carrying the same message do not collapse to one identity; both are measured here on every invocation rather than assumed of the transform list',
  'the structural identity is normalized per field rather than over the joined tuple: the file component becomes a path relative to its own side root, so two findings differing only in their directory stay distinct while one file observed under the two worktree roots is one identity, and both are measured here on every invocation',
  'a chained tsc diagnostic folds its indented continuation lines into the diagnostic above it and the folded text joins the identity, so a base commit carrying a chained type error does not halt the gate and two chains sharing a head with different tails stay distinct; an indented line with no diagnostic above it still halts with the line quoted, and all three are measured here on every invocation',
  'the tool executable is resolved separately from the package that installs it, and a resolved path that does not exist refuses naming the path tried rather than being handed back to a spawn that fails as a module-not-found; the type-check leg is measured here on every invocation to name the executable npm installs under node_modules/.bin',
  'what each tool is expected to report is recomputed from the trees on every pass, and a supplied base census whose NOT-EXPECTED set disagrees with that recomputation is refused and the base re-collected, so a cached census carries base identity counts and never decides whether a tool runs at all; measured here on every invocation with a census naming every tool NOT-EXPECTED',
  'the base worktree teardown checks the result of the removal rather than only catching a throw, falls back to removing the path when the removal exits non-zero, and names the leaked path in the verdict when even that fails; all three are measured here on every invocation',
  'the added-suppression scan keys its counts by file and directive, so a suppression removed in one file cannot pay for one added in another, and a count key naming no file halts rather than being compared; both are measured here on every invocation',
  'each declared strictness flag carries both its safe value and the compiler default an absent value takes, so a flag absent at base and written to its unsafe value at HEAD blocks and a strict-family flag switched off under strict blocks; both are measured here on every invocation',
  'the checked-scope comparison halts rather than defaulting when a file list, a common-file list or the two side roots are absent, and halts when the two lists share no file at all rather than reporting a clean narrowing; every one of those refusals is measured here on every invocation',
  'the comparison is a multiset surplus rather than a difference or a presence test: an unchanged pre-existing finding and a fixed pre-existing finding each pass, and a second instance of a class already present at base blocks, each measured here on every invocation',
  'a tsc line that is neither blank nor one of the declared diagnostic forms halts with the line quoted rather than being skipped, and that halt is exercised here on a synthetic line every time this verb runs',
  'a run that scanned zero files is refused on both tools rather than read as a clean result, and an eslint report that is not an array of file entries is refused, each measured here on every invocation',
  'NOT-EXPECTED requires positive observation of BOTH sides: a config present on either side alone still expects the tool, and a side that cannot be positively observed is never reported NOT-EXPECTED, both measured here on every invocation',
  'the base worktree teardown runs on the throw path and not only on success, measured here on every invocation against an injected seam that throws mid-collection',
  'the first pass and the recheck produce identical verdicts when the supplied census is the one collection would have produced, measured here on every invocation by collecting the base and then replaying it as a cached census through the same entry point',
  'a cached base census that is absent, malformed, or keyed to another base is refused and the base is collected instead, so the fallback is a call to the collector rather than prose that re-describes it and cannot lose the node_modules strategy or the teardown the way the incumbent recheck does',
  'the program reaches processes only through the shared chokepoint and requests only allowlisted binaries: an unlisted binary is refused before any child starts, measured here on every invocation with the spawn seam counting the children it was asked to start',
  'the added-suppression scan counts HEAD source against base source per declared directive and blocks the surplus alone, so a suppression this MSP added blocks and one it inherited does not; both are measured here on every invocation, and the longest directive spelling is counted over the prefix it contains',
  'a rule severity downgrade blocks against the resolved rule map rather than the written config, so resolution through extends and shared presets is done by eslint; a rule that vanished from the resolved map is read as a downgrade to off rather than as absent, and a raise does not block',
  'a declared tsconfig strictness flag moved away from its safe value blocks, and a changed compiler option the declared table does not name HALTS with the key named rather than being bucketed as not strictness-relevant; that halt is exercised here on an unnamed option every time this verb runs',
  'the checked-scope comparison compares resolved file lists restricted to files present on both sides rather than glob semantics, so a narrowed include or a widened ignore blocks while a legitimately added or deleted source file does not; all three are measured here on every invocation',
  'the package-manager resolver yields a real, existing JS entry distinct from the node binary rather than a bare path that cannot execute, and a lockfile whose declared manager carries no install support refuses before any install child spawns, both measured here on every invocation',
  'an added suppression and a resolved-config strictness downgrade each reach the gate verdict end to end through evaluate itself, carrying the added-suppression or tsconfig-strictness classifier in its blocking array, and an inherited suppression or an unchanged resolved config still passes; all four are measured here on every invocation by driving evaluate rather than the classifier functions alone',
]);

export const BOUNDARY_PARITY_NOT_ATTESTED = Object.freeze([
  'that the evasion classifiers behave as declared against a real eslint or a real tsc: every probe here injects its own exec and filesystem seams for --print-config, --showConfig and the suppression source reads, so what a real eslint prints for a large resolved config, or what a real tsc prints for --showConfig against a config reached through extends, remains untested until a probe runs them against a real repository',
  'that either mechanical dispatch has been converted: both still dispatch a language model in both engine trees until C7 ports them onto this substrate, and this verb measures the conversion list rather than the conversion',
  'that this program produces the verdict the incumbent prose produced: the prose is executed by a model and no probe here runs both and compares them, so the two are pinned by their declared parts rather than by an end-to-end equivalence',
  'that the collection commands behave as declared against a real repository: every probe here injects its own exec and filesystem seams, so what a real eslint or a real tsc prints for a large tree, a symbolic link, or a config resolved from a parent directory is untested until C7 supplies those seams',
  'that a real npm install SUCCEEDS end to end: the resolver is measured here to yield a real, existing JS entry and an unserviceable lockfile is measured here to refuse, but no probe spawns the install child to completion, so its exit code and its effect on node_modules remain unmeasured',
  'that a boundary dispatch outside the two declared engine trees would be seen: the census reads .claude/lib/mitosis and .claude/workflows, so one added under .claude/hooks, or anywhere else in the repository, is unscanned',
  'that a boundary label composed rather than spelled would be seen: the census classifies a plain string literal at a label key, so a label built by interpolation or read from configuration is outside what it measures',
  'that the added-suppression scan reads the same domain the incumbent prose reads: the first pass scans the source diff and the recheck scans HEAD source against a cached surface, and this program narrows both to HEAD-vs-base source counts, which is well defined without a diff and is what lets the two passes share one code path',
  'that a suppression spelled other than as one of the declared directives would be counted: the scan counts declared spellings in source text, so a directive introduced by a plugin under another name, or one composed at run time, is outside what it measures',
]);

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

function eslintStdout(fileCount) {
  return JSON.stringify(Array.from({ length: fileCount }, (_, index) => ({
    filePath: `src/a${index}.ts`,
    messages: [{ ruleId: 'no-eq', message: 'bad', line: 1, column: 1, severity: 2 }],
  })));
}

function eslintOnlyIo(baseFiles, headFiles) {
  return probeIo({
    exists: (path) => String(path).includes('eslint.config') || String(path).endsWith('package.json'),
    run: (binary, argv) => {
      if (argv.includes('--print-config')) return { outcome: 'completed', status: 0, stdout: JSON.stringify({ rules: {} }), stderr: '' };
      if (!argv.some((value) => String(value).includes('eslint'))) return CLEAN_CHILD;
      const onBase = argv.some((value) => String(value).startsWith(PROBE_BASE));
      return { outcome: 'completed', status: 1, stdout: eslintStdout(onBase ? baseFiles : headFiles), stderr: '' };
    },
  });
}

function identityProbe() {
  const shifted = structuralIdentity({ file: 'src/a.ts', code: 'TS2345', message: 'Argument at 12:4 is wrong' }, PROBE_ROOT)
    === structuralIdentity({ file: 'src/a.ts', code: 'TS2345', message: 'Argument at 90:7 is wrong' }, PROBE_ROOT);
  const codesDistinct = structuralIdentity({ file: 'src/a.ts', code: 'TS2345', message: 'Type is wrong' }, PROBE_ROOT)
    !== structuralIdentity({ file: 'src/a.ts', code: 'TS2339', message: 'Type is wrong' }, PROBE_ROOT);
  const codeKept = structuralIdentity({ file: 'src/a.ts', code: 'TS2345', message: 'Type is wrong' }, PROBE_ROOT).includes('TS2345');
  const directoriesDistinct = structuralIdentity({ file: `${PROBE_ROOT}/src/a.ts`, code: 'no-eq', message: 'bad' }, PROBE_ROOT)
    !== structuralIdentity({ file: `${PROBE_ROOT}/lib/a.ts`, code: 'no-eq', message: 'bad' }, PROBE_ROOT);
  const rootsAgree = structuralIdentity({ file: `${PROBE_ROOT}/src/a.ts`, code: 'no-eq', message: 'bad' }, PROBE_ROOT)
    === structuralIdentity({ file: `${PROBE_BASE}/src/a.ts`, code: 'no-eq', message: 'bad' }, PROBE_BASE);
  return Object.freeze({
    lineShiftIgnored: shifted,
    codesDistinct,
    codeKept,
    directoriesDistinct,
    rootsAgree,
    stepCount: NORMALIZATION_STEPS.length,
  });
}

function comparatorProbe() {
  const unchanged = compareCensuses({ eslint: { a: 2 } }, { eslint: { a: 2 } });
  const fixed = compareCensuses({ eslint: { a: 3 } }, { eslint: {} });
  const partlyFixed = compareCensuses({ eslint: { a: 3 } }, { eslint: { a: 1 } });
  const second = compareCensuses({ eslint: { a: 1 } }, { eslint: { a: 2 } });
  return Object.freeze({
    unchangedPasses: unchanged.pass === true,
    fixedPasses: fixed.pass === true,
    partlyFixedPasses: partlyFixed.pass === true,
    surplusBlocks: second.pass === false && second.blocking.length === 1 && second.blocking[0].surplus === 1,
  });
}

const CLEAN_CHILD = Object.freeze({ outcome: 'completed', status: 0, stdout: '', stderr: '' });

function probeEvaluate(io, cachedBaseCensus = null) {
  return evaluate({ repoRoot: PROBE_ROOT, gateBase: PROBE_GATE_BASE, basePath: PROBE_BASE, cachedBaseCensus }, io);
}

function expectationProbe() {
  const seen = (configPresent, dependencyDeclared) => ({ configPresent, dependencyDeclared, observed: true, reason: null });
  const unseen = { configPresent: false, dependencyDeclared: false, observed: false, reason: 'the config resolved outside the worktree root' };
  return Object.freeze({
    bothSidesBareIsNotExpected: toolExpectation(seen(false, false), seen(false, false)).expected === false,
    baseOnlyStaysExpected: toolExpectation(seen(true, false), seen(false, false)).expected === true,
    headOnlyStaysExpected: toolExpectation(seen(false, false), seen(true, false)).expected === true,
    unobservableIsNeverNotExpected: toolExpectation(unseen, seen(false, false)).expected === true,
  });
}

function equivalenceProbe() {
  const request = { repoRoot: PROBE_ROOT, gateBase: PROBE_GATE_BASE, basePath: PROBE_BASE, cachedBaseCensus: null };
  const firstPassIo = eslintOnlyIo(1, 2);
  const firstPass = evaluate(request, firstPassIo);
  const collected = collectBase(request, eslintOnlyIo(1, 2));
  if (!collected.ok) {
    return Object.freeze({ agree: false, collected: false, blocked: false, absentCollects: false, fallbackCollects: false, disagreeingCacheRecollects: false, detail: collected.error });
  }
  const recheck = evaluate({ ...request, cachedBaseCensus: collected.census }, eslintOnlyIo(1, 2));
  const malformedIo = eslintOnlyIo(1, 2);
  const fallback = evaluate({ ...request, cachedBaseCensus: { nonsense: true } }, malformedIo);
  const foreignIo = eslintOnlyIo(1, 2);
  const foreignCensus = { ...collected.census, gateBase: `${collected.census.gateBase}-foreign` };
  const foreign = evaluate({ ...request, cachedBaseCensus: foreignCensus }, foreignIo);
  const disagreeingIo = eslintOnlyIo(1, 2);
  const disagreeingCensus = { gateBase: PROBE_GATE_BASE, tools: {}, notExpected: BOUNDARY_TOOLS.map((tool) => tool.name), surface: { root: PROBE_BASE } };
  const disagreeing = evaluate({ ...request, cachedBaseCensus: disagreeingCensus }, disagreeingIo);
  return Object.freeze({
    disagreeingCacheRecollects: disagreeing.usedCachedCensus === false
      && disagreeingIo.spawned.some((command) => command.includes('worktree add')),
    agree: firstPass.pass === recheck.pass && JSON.stringify(firstPass.blocking) === JSON.stringify(recheck.blocking),
    collected: true,
    blocked: firstPass.pass === false,
    reusedCache: recheck.usedCachedCensus === true,
    absentCollects: firstPass.usedCachedCensus === false && firstPassIo.spawned.some((command) => command.includes('worktree add')),
    fallbackCollects: fallback.usedCachedCensus === false
      && malformedIo.spawned.some((command) => command.includes('worktree add'))
      && foreign.usedCachedCensus === false
      && foreignIo.spawned.some((command) => command.includes('worktree add')),
    detail: `first pass pass=${firstPass.pass} recheck pass=${recheck.pass}`,
  });
}

function execProbe() {
  let started = 0;
  const io = Object.freeze({ spawn: () => { started += 1; return { status: 0, stdout: '', stderr: '' }; } });
  let refusedUnlisted = false;
  try {
    execRun(UNLISTED_PROBE_BINARY, ['eslint', '.'], {}, io);
  } catch {
    refusedUnlisted = true;
  }
  let allowedNode = false;
  try {
    execRun('node', ['/probe/tool.js', '--noEmit'], {}, io);
    allowedNode = true;
  } catch {
    allowedNode = false;
  }
  let realIoRefusesUnlisted = false;
  try {
    REAL_BOUNDARY_IO.run(UNLISTED_PROBE_BINARY, ['--version'], {});
  } catch {
    realIoRefusesUnlisted = true;
  }
  const declaredIo = probeIo({});
  probeEvaluate(declaredIo);
  const requested = [...new Set(declaredIo.spawned.map((command) => command.split(' ')[0]))].sort();
  return Object.freeze({
    refusedUnlisted,
    realIoRefusesUnlisted,
    childrenStarted: refusedUnlisted ? started - (allowedNode ? 1 : 0) : started,
    allowedNode,
    requestedBinaries: Object.freeze(requested),
  });
}

const SYNTHETIC_TARGET = BOUNDARY_DECLARATIONS.conversionTarget;
const SYNTHETIC_TWIN = 'lib/mitosis/run-engine.mjs';
const SYNTHETIC_INERT = 'lib/mitosis/prompt-registry.mjs';
const LABEL_KEY = 'label';
const QUOTE = "'";

function syntheticDispatch(name) {
  return `  { ${LABEL_KEY}: ${QUOTE}${name}${QUOTE}, phase: ${QUOTE}Integrate${QUOTE} },\n`;
}

function syntheticSource(path, body) {
  return Object.freeze({ path: `/repo/.claude/${path}`, source: body });
}

function syntheticTree(path) {
  return syntheticSource(path, Object.keys(BOUNDARY_DISPATCH_NAMES).map(syntheticDispatch).join(''));
}

const SYNTHETIC_INERT_SOURCE = syntheticSource(SYNTHETIC_INERT, `export const KIND = ${QUOTE}boundary-fix${QUOTE};\n`);

const SYNTHETIC_DECLARATIONS = Object.freeze({
  names: BOUNDARY_DISPATCH_NAMES,
  inertKeys: BOUNDARY_DECLARATIONS.inertKeys,
  dispatchSources: Object.freeze({
    [SYNTHETIC_TARGET]: 'the synthetic conversion target this control builds so the census halt is exercised on every invocation',
    [SYNTHETIC_TWIN]: 'the synthetic twin this control builds so the twin naming halt is exercised on every invocation',
  }),
  nonDispatchSources: Object.freeze({
    [SYNTHETIC_INERT]: 'the synthetic inert source this control builds so the started-dispatching halt is exercised on every invocation',
  }),
  conversionTarget: SYNTHETIC_TARGET,
});

const CENSUS_CONTROLS = Object.freeze([
  Object.freeze({
    name: 'a dispatch label no declared name covers',
    expect: 'no declared name covers',
    sources: () => [syntheticSource(SYNTHETIC_TARGET, syntheticDispatch('boundary-verify')), syntheticTree(SYNTHETIC_TWIN), SYNTHETIC_INERT_SOURCE],
  }),
  Object.freeze({
    name: 'a declared dispatch source dropped from the scanned trees',
    expect: 'spell no boundary label in the scanned trees',
    sources: () => [syntheticTree(SYNTHETIC_TARGET), SYNTHETIC_INERT_SOURCE],
  }),
  Object.freeze({
    name: 'a declared non-dispatch source that started dispatching',
    expect: 'now dispatches',
    sources: () => [syntheticTree(SYNTHETIC_TARGET), syntheticTree(SYNTHETIC_TWIN), syntheticSource(SYNTHETIC_INERT, syntheticDispatch('boundary'))],
  }),
  Object.freeze({
    name: 'a boundary label in a source no declaration covers',
    expect: 'no declaration covers that source',
    sources: () => [syntheticTree(SYNTHETIC_TARGET), syntheticTree(SYNTHETIC_TWIN), SYNTHETIC_INERT_SOURCE, syntheticSource('lib/mitosis/newcomer.mjs', `export const kind = ${QUOTE}boundary-recheck${QUOTE};\n`)],
  }),
  Object.freeze({
    name: 'a declared name that reaches no dispatch site',
    expect: 'reach no dispatch site',
    sources: () => [syntheticSource(SYNTHETIC_TARGET, syntheticDispatch('boundary')), syntheticSource(SYNTHETIC_TWIN, syntheticDispatch('boundary')), SYNTHETIC_INERT_SOURCE],
  }),
  Object.freeze({
    name: 'a boundary literal at neither a label key nor a declared inert form',
    expect: 'refusing to guess',
    sources: () => [
      syntheticSource(SYNTHETIC_TARGET, `${syntheticTree(SYNTHETIC_TARGET).source}const chosen = pick(${QUOTE}boundary${QUOTE});\n`),
      syntheticTree(SYNTHETIC_TWIN),
      SYNTHETIC_INERT_SOURCE,
    ],
  }),
  Object.freeze({
    name: 'a declared name the conversion target dispatches but a sibling engine tree does not',
    expect: 'dispatches no site for these declared names',
    sources: () => [
      syntheticTree(SYNTHETIC_TARGET),
      syntheticSource(SYNTHETIC_TWIN, Object.keys(BOUNDARY_DISPATCH_NAMES).slice(0, -1).map(syntheticDispatch).join('')),
      SYNTHETIC_INERT_SOURCE,
    ],
  }),
]);

function censusControlProbes() {
  const clean = censusBoundarySources([syntheticTree(SYNTHETIC_TARGET), syntheticTree(SYNTHETIC_TWIN), SYNTHETIC_INERT_SOURCE], SYNTHETIC_DECLARATIONS);
  return Object.freeze(CENSUS_CONTROLS.map((control) => {
    if (clean.ok !== true) {
      return Object.freeze({ name: control.name, anchorPresent: false, halted: false, named: false, detail: `the unmutated synthetic tree already halts: ${clean.error}` });
    }
    const measured = censusBoundarySources(control.sources(), SYNTHETIC_DECLARATIONS);
    return Object.freeze({
      name: control.name,
      anchorPresent: true,
      halted: measured.ok === false,
      named: measured.ok === false && measured.error.includes(control.expect),
      detail: measured.ok === true ? 'the census accepted it' : measured.error,
    });
  }));
}

const SUPPRESSION_PROBE_FILES = Object.freeze([
  Object.freeze({ path: 'probe/a.ts', source: '// eslint-disable-next-line no-eq\n// eslint-disable no-eq\n' }),
  Object.freeze({ path: 'probe/b.ts', source: '// @ts-expect-error\n' }),
]);

function ignoredIn(path, count) {
  return countSuppressions([Object.freeze({ path, source: '// @ts-ignore\n'.repeat(count) })]);
}

function probeSurface(root) {
  return {
    root,
    eslintConfig: { rules: { r: 2 } },
    tsconfigOptions: { strict: true },
    checkedFiles: [`${root}/a.ts`],
    commonFiles: ['a.ts'],
    suppressions: ignoredIn('a.ts', 1),
  };
}

function evasionProbe() {
  const counted = countSuppressions(SUPPRESSION_PROBE_FILES);
  const inherited = compareSuppressions(ignoredIn('a.ts', 3), ignoredIn('a.ts', 3));
  const added = compareSuppressions(ignoredIn('a.ts', 1), ignoredIn('a.ts', 2));
  const removed = compareSuppressions(ignoredIn('a.ts', 3), countSuppressions([]));
  const partlyRemoved = compareSuppressions(ignoredIn('a.ts', 3), ignoredIn('a.ts', 1));
  const moved = compareSuppressions(ignoredIn('old.ts', 1), ignoredIn('new.ts', 1));
  const unkeyed = compareSuppressions({}, { '@ts-ignore': 1 });
  const downgrade = compareRuleSeverity({ rules: { 'no-eq': 2 } }, { rules: { 'no-eq': 1 } });
  const vanished = compareRuleSeverity({ rules: { 'no-eq': 2 } }, { rules: {} });
  const raise = compareRuleSeverity({ rules: { 'no-eq': 1 } }, { rules: { 'no-eq': 2 } });
  const loosened = compareTsconfigFlags({ strict: true }, { strict: false });
  const tightened = compareTsconfigFlags({ strict: false }, { strict: true });
  const writtenUnsafe = compareTsconfigFlags({}, { skipLibCheck: true });
  const strictFamilyOff = compareTsconfigFlags({ strict: true }, { strict: true, noImplicitAny: false });
  const unnamed = compareTsconfigFlags({ jsx: 'react' }, { jsx: 'preserve' });
  const unchangedUnnamed = compareTsconfigFlags({ jsx: 'react' }, { jsx: 'react' });
  const narrowed = compareCheckedFiles(['a.ts', 'b.ts'], ['a.ts'], ['a.ts', 'b.ts'], PROBE_SCOPE_ROOTS);
  const deleted = compareCheckedFiles(['a.ts', 'b.ts'], ['a.ts'], ['a.ts'], PROBE_SCOPE_ROOTS);
  const addedFile = compareCheckedFiles(['a.ts'], ['a.ts', 'b.ts'], ['a.ts', 'b.ts'], PROBE_SCOPE_ROOTS);
  const acrossRoots = compareCheckedFiles(
    [`${PROBE_BASE}/a.ts`, `${PROBE_BASE}/b.ts`],
    [`${PROBE_ROOT}/a.ts`],
    [`${PROBE_ROOT}/a.ts`, `${PROBE_ROOT}/b.ts`],
    PROBE_SCOPE_ROOTS,
  );
  const disjoint = compareCheckedFiles(['/elsewhere/a.ts'], [`${PROBE_ROOT}/a.ts`], [`${PROBE_ROOT}/a.ts`], PROBE_SCOPE_ROOTS);
  const rootless = compareCheckedFiles(['a.ts'], ['a.ts'], ['a.ts'], null);
  const baseSurface = probeSurface(PROBE_BASE);
  const headSurface = probeSurface(PROBE_ROOT);
  const aggregated = evasionVerdict(baseSurface, headSurface);
  const withoutSuppressions = evasionVerdict({ ...baseSurface, suppressions: undefined }, { ...headSurface, suppressions: undefined });
  const withoutCheckedFiles = evasionVerdict({ ...baseSurface, checkedFiles: undefined }, { ...headSurface, checkedFiles: undefined });
  return Object.freeze({
    longestSpellingWins: counted[suppressionKey('probe/a.ts', 'eslint-disable-next-line')] === 1
      && counted[suppressionKey('probe/a.ts', 'eslint-disable')] === 1
      && counted[suppressionKey('probe/b.ts', '@ts-expect-error')] === 1,
    directiveCount: SUPPRESSION_DIRECTIVES.length,
    inheritedPasses: inherited.pass === true,
    partlyRemovedPasses: partlyRemoved.pass === true,
    addedBlocks: added.pass === false && added.blocking.length === 1 && added.blocking[0].surplus === 1,
    removedPasses: removed.pass === true,
    movedSuppressionBlocks: moved.pass === false && moved.blocking.length === 1 && moved.blocking[0].path === 'new.ts',
    unkeyedCountHalts: unkeyed.halted === true && unkeyed.error.includes('@ts-ignore'),
    downgradeBlocks: downgrade.pass === false,
    vanishedRuleBlocks: vanished.pass === false,
    raisePasses: raise.pass === true,
    loosenedFlagBlocks: loosened.pass === false,
    tightenedFlagPasses: tightened.pass === true,
    absentThenUnsafeBlocks: writtenUnsafe.pass === false && strictFamilyOff.pass === false,
    unnamedOptionHalts: unnamed.halted === true && unnamed.error.includes('jsx'),
    unchangedUnnamedOptionPasses: unchangedUnnamed.halted === false && unchangedUnnamed.pass === true,
    narrowingBlocks: narrowed.pass === false && acrossRoots.pass === false,
    deletionPasses: deleted.pass === true,
    additionPasses: addedFile.pass === true,
    vacuousScopeHalts: disjoint.halted === true && rootless.halted === true,
    absentSurfaceHalts: withoutSuppressions.halted === true && withoutCheckedFiles.halted === true,
    aggregatePasses: aggregated.pass === true && aggregated.halted === false,
    flagCount: Object.keys(TSCONFIG_STRICTNESS_FLAGS).length,
  });
}

export function probeBoundarySubstrate() {
  return Object.freeze({
    evasion: evasionProbe(),
    evasionWiring: evasionWiringProbe(),
    census: boundaryCensus(),
    controls: censusControlProbes(),
    identity: identityProbe(),
    comparator: comparatorProbe(),
    failClosed: failClosedProbe(),
    expectation: expectationProbe(),
    teardown: teardownProbe(),
    materialization: materializationProbe(),
    packageManager: packageManagerProbe(),
    toolResolution: toolResolutionProbe(),
    equivalence: equivalenceProbe(),
    exec: execProbe(),
  });
}

export function boundaryParityFailures(substrate) {
  const failures = [];
  const inert = substrate.controls.filter((control) => !(control.anchorPresent && control.halted && control.named));
  if (inert.length > 0) {
    failures.push(`these census controls no longer halt on the thing they name, so the census would classify it silently: ${inert.map((control) => `${control.name} (${control.detail})`).join('; ')}`);
  }
  if (substrate.controls.length === 0) {
    failures.push('the census ran no negative control at all, so nothing here would notice it going inert');
  }
  const identity = substrate.identity;
  if (!identity.lineShiftIgnored) {
    failures.push('a pure line shift now changes the structural identity, so moving a line would be reported as a new finding; the identity exists to ignore line and column pairs');
  }
  if (!identity.codesDistinct || !identity.codeKept) {
    failures.push('two distinct diagnostic codes carrying the same message now collapse to one identity, so a new error class hidden behind an existing message would not block; the normalization must keep the code verbatim rather than stripping every digit');
  }
  if (!identity.directoriesDistinct) {
    failures.push('two findings that differ only in their directory now collapse to one identity, so a finding fixed in one directory pays for the identical finding introduced in another and a real new error ships; the file component is normalized per field to a path relative to its side root rather than reduced to a basename');
  }
  if (!identity.rootsAgree) {
    failures.push('one file observed under the two worktree roots no longer normalizes to one identity, so every finding on the head side reads as new and the gate blocks whatever this MSP touched');
  }
  const comparator = substrate.comparator;
  if (!comparator.unchangedPasses) {
    failures.push('an unchanged pre-existing finding now blocks, so the comparison has stopped being a surplus rule; the gate blocks what this MSP introduced, not what it inherited');
  }
  if (!comparator.fixedPasses) {
    failures.push('a fixed pre-existing finding now blocks, so the comparison reads any change as suspicious rather than counting the surplus');
  }
  if (!comparator.partlyFixedPasses) {
    failures.push('a pre-existing finding still present at a LOWER count now blocks, so the comparison has become a difference rather than a surplus; a finding that vanished entirely is never visited by the comparison, so only a count that decreased while staying present can tell the two apart');
  }
  if (!comparator.surplusBlocks) {
    failures.push('a second instance of a class already present at base no longer blocks, so the comparison has collapsed from a multiset to a set');
  }
  const failClosed = substrate.failClosed;
  if (!failClosed.malformedTscLineHalts || !failClosed.trailingUnclassifiableLineHalts) {
    failures.push('a tsc line that matches no declared diagnostic form is now accepted rather than halting with the line quoted, whether it is the first line seen or one that follows a diagnostic already collected, so an unrecognised line would be skipped into a bucket, or folded silently into the diagnostic above it, and the run would report clean');
  }
  if (!failClosed.wellFormedTscLineParses) {
    failures.push('a well-formed tsc diagnostic no longer parses, so the census halts on everything and measures nothing');
  }
  if (!failClosed.zeroFilesRefused) {
    failures.push('a run that scanned zero files now reads as a clean result, which is the silent wrong success the fail-closed rule exists to prevent');
  }
  if (!failClosed.zeroTypeCheckedFilesRefused) {
    failures.push('a tsc run that type-checked zero files now reads as a clean result, so the type dimension could be emptied without the gate noticing; the zero-file refusal covers both collected tools rather than eslint alone');
  }
  if (!failClosed.shapeRefused) {
    failures.push('an eslint report that is not an array of file entries is now accepted, so an unparseable collection would be read as no findings');
  }
  if (!failClosed.chainFolded) {
    failures.push('a chained tsc diagnostic no longer folds its indented continuation into the diagnostic above it, so any base commit carrying one chained type error halts the census and the gate can never pass');
  }
  if (!failClosed.chainTailsDistinct) {
    failures.push('two chains sharing a head and differing in the tail now collapse to one identity, so the folded text never reached the identity and a second, different error hides behind the first');
  }
  if (!failClosed.orphanContinuationHalts) {
    failures.push('an indented line with no diagnostic above it is now folded into nothing rather than halting with the line quoted, which is the catch-all bucket the census exists to refuse');
  }
  if (!failClosed.crashedRunRefused) {
    failures.push('a collection child that exited outside the statuses its tool exits with when it ran is now read as a side carrying no findings, so a crashed type-check would pass as clean');
  }
  const expectation = substrate.expectation;
  if (!expectation.bothSidesBareIsNotExpected) {
    failures.push('a tool absent from both sides is no longer reported NOT-EXPECTED, so the legitimately empty lint and type dimension would block');
  }
  if (!expectation.baseOnlyStaysExpected || !expectation.headOnlyStaysExpected) {
    failures.push('a tool declared on one side alone is no longer expected, so removing the config at HEAD would make the tool not applicable and pass; NOT-EXPECTED requires positive observation of BOTH sides');
  }
  if (!expectation.unobservableIsNeverNotExpected) {
    failures.push('a side that cannot be positively observed is now reported NOT-EXPECTED rather than expected, so an unresolvable config would pass instead of failing closed');
  }
  if (!substrate.teardown.tornDownOnThrow) {
    failures.push('the base worktree teardown no longer runs on the throw path, so a throw mid-collection leaves the base worktree behind; the teardown belongs on every exit path rather than on the success path alone');
  }
  if (!substrate.teardown.failedClosed) {
    failures.push('a throw mid-collection no longer fails closed, so a collection that never completed would be reported as a verdict');
  }
  if (!substrate.teardown.failedRemovalFallsBack) {
    failures.push('a worktree remove that exited non-zero no longer reaches the fallback path removal; the removal returns a result on a non-zero exit rather than throwing, so a teardown that only catches a throw leaves the base worktree behind');
  }
  if (!substrate.teardown.leakSurfaced) {
    failures.push('a base worktree that could not be removed at all is no longer named in the verdict, so the leak is swallowed by the teardown rather than reported to the reader of the receipt');
  }
  const toolResolution = substrate.toolResolution;
  if (!toolResolution.absentToolRefused) {
    failures.push('the tool resolver no longer refuses a path that does not exist, so it hands back an unexecutable path and the spawn fails as a module-not-found whose empty output is read as a clean side');
  }
  if (!toolResolution.executablesNamed) {
    failures.push('the type-check leg no longer names the executable its package installs under node_modules/.bin, so the child would be spawned on a path npm never creates');
  }
  if (!toolResolution.unresolvableRefused) {
    failures.push('a tool the resolver refused is no longer surfaced as a refusal naming the path tried, so the run is blamed on the repository config rather than on the missing executable');
  }
  if (!substrate.materialization.failedClosed) {
    failures.push('a base worktree that fails to materialize no longer fails closed, so the gate would compare HEAD against a base it never collected');
  }
  const packageManager = substrate.packageManager;
  if (!packageManager.npmEntryResolved || !packageManager.unserviceableLockfileRefused || !packageManager.noInstallSpawned) {
    failures.push('the package-manager resolver no longer yields a real, existing JS entry distinct from the node binary, or a lockfile whose manager declares no install support no longer refuses before any install child spawns; the base install would compose an argv that cannot run');
  }
  const equivalence = substrate.equivalence;
  if (!equivalence.collected) {
    failures.push(`the base could not be collected at all, so the first pass and recheck equivalence measures nothing: ${equivalence.detail}`);
  } else if (!equivalence.agree) {
    failures.push(`the first pass and the recheck no longer produce identical verdicts on identical trees (${equivalence.detail}); the recheck is meant to be the same code path with the base side supplied rather than a second body`);
  }
  if (equivalence.collected && !equivalence.blocked) {
    failures.push('the equivalence probe compared two passing verdicts, so it would agree even if the comparison had stopped blocking; the probe must exercise a blocking tree');
  }
  if (equivalence.collected && !equivalence.reusedCache) {
    failures.push('the recheck no longer reuses the census it was handed, so the equivalence it reports is two collections agreeing rather than a supplied census reproducing a collected one');
  }
  if (equivalence.collected && !equivalence.absentCollects) {
    failures.push('a first pass handed no cached census at all no longer collects the base to compare against, so an absent cache would leave HEAD compared against nothing rather than a freshly gathered base');
  }
  if (!equivalence.fallbackCollects) {
    failures.push('a cached census that is malformed or keyed to another base is no longer refused and re-collected, so the recheck would treat an unvalidated base as authoritative');
  }
  if (!equivalence.disagreeingCacheRecollects) {
    failures.push('a well-formed cached census that names every tool NOT-EXPECTED is no longer refused against the trees, so a supplied census decides what is expected and the whole gate passes having spawned no child at all');
  }
  const exec = substrate.exec;
  if (!exec.refusedUnlisted) {
    failures.push(`${JSON.stringify(UNLISTED_PROBE_BINARY)} is not on the spawn allowlist yet the chokepoint let it through; every collection command this program names must be reached through an allowlisted binary`);
  }
  if (exec.childrenStarted !== 0) {
    failures.push(`the chokepoint started ${exec.childrenStarted} child process(es) while refusing an unlisted binary; the guarantee is that the policy runs BEFORE the spawn, which a refusal thrown afterwards does not give`);
  }
  if (!exec.realIoRefusesUnlisted) {
    failures.push(`the exec seam this program ships with admitted ${JSON.stringify(UNLISTED_PROBE_BINARY)}, so it no longer routes through the shared chokepoint; a second spawn layer inherits none of the refusals the chokepoint enforces`);
  }
  if (!exec.allowedNode) {
    failures.push('the chokepoint refused bare node, which is how this program reaches eslint and tsc without widening the allowlist; a guard that refuses it is over-broad');
  }
  const evasion = substrate.evasion;
  if (!evasion.longestSpellingWins) {
    failures.push('the suppression scan no longer counts the longest declared directive over the prefix it contains, so an eslint-disable-next-line would be counted as an eslint-disable and the two would be indistinguishable');
  }
  if (!evasion.partlyRemovedPasses) {
    failures.push('a suppression still present at a LOWER count now blocks, so the suppression scan has become a difference rather than a surplus; a directive removed entirely is never visited, so only a count that decreased while staying present can tell the two apart');
  }
  if (!evasion.inheritedPasses || !evasion.removedPasses) {
    failures.push('a suppression this MSP inherited now blocks, so the scan has become a presence rule rather than a surplus rule; the gate blocks what this MSP added, not what the tree already carried');
  }
  if (!evasion.addedBlocks) {
    failures.push('an added suppression no longer blocks, so the gate could be passed by suppressing a finding rather than by fixing it, which is the whole evasion the scan exists to catch');
  }
  if (!evasion.movedSuppressionBlocks) {
    failures.push('a suppression removed in one file and added in another no longer blocks, so the counts are kept per directive across every file and a removal pays for an addition that silences a brand-new finding');
  }
  if (!evasion.unkeyedCountHalts) {
    failures.push('a suppression count key that names no file is now compared rather than halting, so a per-directive total slips back in through the comparison the per-file keying exists to prevent');
  }
  if (!evasion.absentThenUnsafeBlocks) {
    failures.push('a strictness flag absent at base and written to its unsafe value at HEAD no longer blocks, so the common real shape of the evasion passes; an absent value takes the compiler default the declared table names rather than the negation of the safe value');
  }
  if (!evasion.vacuousScopeHalts) {
    failures.push('a checked-scope comparison whose two file lists share nothing, or which was given no roots to normalize against, now passes rather than halting; that is the permanently vacuous pass the real wiring produces, since each side lists its own absolute paths');
  }
  if (!evasion.absentSurfaceHalts) {
    failures.push('a surface missing its suppression counts or its checked-file list now defaults to empty rather than halting, and an empty default reports no evasion for every input');
  }
  if (!evasion.downgradeBlocks || !evasion.vanishedRuleBlocks) {
    failures.push('a rule severity downgrade in the resolved rule map no longer blocks, so the gate could be passed by lowering a rule to warn or off, or by dropping it from the resolved config entirely');
  }
  if (!evasion.raisePasses) {
    failures.push('raising a rule severity now blocks, so the comparison reads any severity change as an evasion rather than a decrease in the total order');
  }
  if (!evasion.loosenedFlagBlocks) {
    failures.push('a declared tsconfig strictness flag moved away from its safe value no longer blocks, so the gate could be passed by loosening the type checker');
  }
  if (!evasion.tightenedFlagPasses) {
    failures.push('tightening a declared strictness flag now blocks, so the comparison reads any flag change as a loosening rather than a move away from the declared safe value');
  }
  if (!evasion.unnamedOptionHalts) {
    failures.push('a changed compiler option the declared strictness table does not name is now accepted rather than halting with the key named; that is the catch-all-by-another-name failure, and a strictness-reducing option outside the table would pass silently');
  }
  if (!evasion.unchangedUnnamedOptionPasses) {
    failures.push('an unchanged compiler option outside the declared table now halts, so the refusal fires on config that did not change and the gate could never pass');
  }
  if (!evasion.narrowingBlocks) {
    failures.push('a narrowed checked-file set no longer blocks, so the gate could be passed by excluding or ignoring the files that carry the findings');
  }
  if (!evasion.deletionPasses) {
    failures.push('a legitimately deleted source file is now read as a narrowed scope, so deleting a file would block; the comparison is restricted to files present on both sides precisely to avoid that');
  }
  if (!evasion.additionPasses) {
    failures.push('a legitimately added source file is now read as a narrowed scope, so adding a file would block; the comparison names the files checked at base and not at HEAD rather than every difference between the two sets');
  }
  if (!evasion.aggregatePasses) {
    failures.push('the aggregated evasion verdict no longer passes on two identical surfaces, so it reports an evasion where nothing changed');
  }
  const evasionWiring = substrate.evasionWiring;
  if (!evasionWiring.addedSuppressionBlocks) {
    failures.push('a suppression added at HEAD and absent at base no longer makes evaluate itself block with classifier added-suppression, so the evasion scan is declared but not reached from the gate verdict');
  }
  if (!evasionWiring.inheritedSuppressionPasses) {
    failures.push('a suppression present on both sides now makes evaluate block, so the end-to-end wiring has become a presence rule rather than a surplus rule');
  }
  if (!evasionWiring.strictnessDowngradeBlocks) {
    failures.push('a strictness downgrade in resolved tsconfig no longer makes evaluate itself block with classifier tsconfig-strictness, so the resolved-config comparison is declared but not reached from the gate verdict');
  }
  if (!evasionWiring.unchangedConfigPasses) {
    failures.push('an unchanged resolved tsconfig now makes evaluate block, so the end-to-end wiring reports an evasion where the config never changed');
  }
  const outside = exec.requestedBinaries.filter((binary) => binary !== 'git' && binary !== 'node');
  if (outside.length > 0) {
    failures.push(`the program requested these binaries beyond git and node: ${outside.join(', ')}; the collection commands the incumbent prose names are reached as node with a resolved path in argv rather than by widening the allowlist`);
  }
  return failures;
}

export function boundaryParityVerdict() {
  let substrate;
  let failures;
  try {
    substrate = probeBoundarySubstrate();
    failures = boundaryParityFailures(substrate);
  } catch (error) {
    return Object.freeze({ kind: 'halt', error: `could not probe the boundary substrate: ${error && error.message ? error.message : 'unknown failure'}` });
  }
  if (!substrate.census.ok) {
    return Object.freeze({ kind: 'halt', error: `halted on the boundary dispatch census: ${substrate.census.error}` });
  }
  if (failures.length > 0) return Object.freeze({ kind: 'violation', failures: Object.freeze(failures) });
  return Object.freeze({ kind: 'clean', payload: boundaryPayload(substrate) });
}

function boundaryPayload(substrate) {
  const census = substrate.census;
  return Object.freeze({
    verb: 'boundary-parity',
    ok: true,
    siteCount: census.siteCount,
    mechanicalSiteCount: census.mechanicalSiteCount,
    judgmentSiteCount: census.judgmentSiteCount,
    twinSiteCount: census.twinSiteCount,
    conversionTargetSiteCount: census.conversionTargetSiteCount,
    sourceCount: census.sourceCount,
    inertLiteralCount: census.inertLiteralCount,
    sites: census.sites.map((site) => `${site.name} ${site.kind} ${site.path}:${site.line}`),
    twinSites: census.twinSites.map((site) => `${site.name} ${site.path}:${site.line}`),
    scannedSources: [...census.scannedSources],
    declaredNames: Object.keys(BOUNDARY_DISPATCH_NAMES).sort(),
    toolCount: BOUNDARY_TOOLS.length,
    tools: BOUNDARY_TOOLS.map((tool) => tool.name),
    normalizationSteps: NORMALIZATION_STEPS.map((step) => step.name),
    identityComponents: IDENTITY_COMPONENTS.map((component) => `${component.name}: ${component.steps.length === 0 ? 'verbatim' : component.steps.map((step) => step.name).join(', ')}`),
    suppressionDirectives: [...SUPPRESSION_DIRECTIVES],
    strictnessFlagCount: substrate.evasion.flagCount,
    evasionClassifiers: ['added-suppression', 'rule-severity', 'tsconfig-strictness', 'checked-scope'],
    censusControls: substrate.controls.map((control) => `${control.name}: ${control.anchorPresent && control.halted && control.named ? 'halted and named' : 'INERT'}`),
    requestedBinaries: [...substrate.exec.requestedBinaries],
    modelInvocationsRemaining: census.siteCount,
    attests: [...BOUNDARY_PARITY_ATTESTS],
    notAttested: [...BOUNDARY_PARITY_NOT_ATTESTED],
    c7Obligations: [...BOUNDARY_C7_OBLIGATIONS],
  });
}
