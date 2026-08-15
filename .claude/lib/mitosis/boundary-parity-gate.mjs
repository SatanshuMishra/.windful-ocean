import {
  BOUNDARY_C7_OBLIGATIONS,
  BOUNDARY_DECLARATIONS,
  BOUNDARY_DISPATCH_NAMES,
  boundaryCensus,
  censusBoundarySources,
} from './boundary-census.mjs';
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
} from './boundary-evasion.mjs';
import { run as execRun } from './exec-run.mjs';

const PROBE_ROOT = '/probe/head';
const PROBE_BASE = '/probe/base';
const PROBE_GATE_BASE = 'probebase';
const UNLISTED_PROBE_BINARY = 'npx';

export const BOUNDARY_PARITY_ATTESTS = Object.freeze([
  'every boundary label spelled in either declared engine tree is resolved to exactly one declared name, and a label none of them covers halts with its site named rather than being absorbed by a name it merely extends',
  'both mechanical dispatch sites and the judgment site are named in each engine tree, and the copies outside the conversion target are named as twins, so the live-path divergence is measured rather than assumed',
  'every source spelling a boundary label is either a declared dispatch source or a declared non-dispatch source carrying a reason, in both directions, so a source that appeared and a source that vanished from the scan both halt rather than letting a site go uncounted',
  'a declared non-dispatch source that starts dispatching a boundary label halts rather than staying inert on a reason written when it did not, and that halt is exercised here on a synthetic source every time this verb runs',
  'the structural identity keeps the diagnostic code verbatim while ignoring line and column pairs, so a pure line shift does not block and two distinct codes carrying the same message do not collapse to one identity; both are measured here on every invocation rather than assumed of the transform list',
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
]);

export const BOUNDARY_PARITY_NOT_ATTESTED = Object.freeze([
  'that either mechanical dispatch has been converted: both still dispatch a language model in both engine trees until C7 ports them onto this substrate, and this verb measures the conversion list rather than the conversion',
  'that this program produces the verdict the incumbent prose produced: the prose is executed by a model and no probe here runs both and compares them, so the two are pinned by their declared parts rather than by an end-to-end equivalence',
  'that the collection commands behave as declared against a real repository: every probe here injects its own exec and filesystem seams, so what a real eslint or a real tsc prints for a large tree, a symbolic link, or a config resolved from a parent directory is untested until C7 supplies those seams',
  'that the base install reaches a real package manager: the install step invokes the package manager JS entry through bare node, and no probe here runs it, so a lockfile-divergent base is exercised only through the injected seam',
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
    resolveTool: (name, root) => `${root}/node_modules/.bin/${name}`,
    resolvePackageManager: () => '/probe/pm.js',
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
      if (!argv.some((value) => String(value).includes('eslint'))) {
        return { outcome: 'completed', status: 0, stdout: '', stderr: '' };
      }
      const onBase = argv.some((value) => String(value).startsWith(PROBE_BASE));
      return { outcome: 'completed', status: 1, stdout: eslintStdout(onBase ? baseFiles : headFiles), stderr: '' };
    },
  });
}

function identityProbe() {
  const shifted = structuralIdentity({ file: 'src/a.ts', code: 'TS2345', message: 'Argument at 12:4 is wrong' })
    === structuralIdentity({ file: 'src/a.ts', code: 'TS2345', message: 'Argument at 90:7 is wrong' });
  const codesDistinct = structuralIdentity({ file: 'src/a.ts', code: 'TS2345', message: 'Type is wrong' })
    !== structuralIdentity({ file: 'src/a.ts', code: 'TS2339', message: 'Type is wrong' });
  const codeKept = structuralIdentity({ file: 'src/a.ts', code: 'TS2345', message: 'Type is wrong' }).includes('TS2345');
  return Object.freeze({ lineShiftIgnored: shifted, codesDistinct, codeKept, stepCount: NORMALIZATION_STEPS.length });
}

function comparatorProbe() {
  const unchanged = compareCensuses({ eslint: { a: 2 } }, { eslint: { a: 2 } });
  const fixed = compareCensuses({ eslint: { a: 3 } }, { eslint: {} });
  const second = compareCensuses({ eslint: { a: 1 } }, { eslint: { a: 2 } });
  return Object.freeze({
    unchangedPasses: unchanged.pass === true,
    fixedPasses: fixed.pass === true,
    surplusBlocks: second.pass === false && second.blocking.length === 1 && second.blocking[0].surplus === 1,
  });
}

function failClosedProbe() {
  const malformed = censusTscLines('Found 3 errors in 2 files.');
  const wellFormed = censusTscLines('src/a.ts(3,9): error TS2345: Argument bad');
  const emptyReport = parseEslintReport('[]');
  const notAnArray = parseEslintReport('{}');
  const notJson = parseEslintReport('not json');
  return Object.freeze({
    malformedTscLineHalts: malformed.ok === false && malformed.error.includes('Found 3 errors in 2 files.'),
    wellFormedTscLineParses: wellFormed.ok === true && wellFormed.diagnostics.length === 1,
    zeroFilesRefused: emptyReport.ok === false && /zero files/i.test(emptyReport.error),
    shapeRefused: notAnArray.ok === false && notJson.ok === false,
  });
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

function teardownProbe() {
  const io = probeIo({ resolveTool: () => { throw new Error('the tool could not be resolved'); } });
  const verdict = evaluate({ repoRoot: PROBE_ROOT, gateBase: PROBE_GATE_BASE, basePath: PROBE_BASE, cachedBaseCensus: null }, io);
  return Object.freeze({
    tornDownOnThrow: io.spawned.some((command) => command.includes('worktree remove')),
    failedClosed: verdict.pass === false,
  });
}

function materializationProbe() {
  const io = probeIo({
    run: (binary, argv) => (argv.includes('add')
      ? { outcome: 'completed', status: 128, stdout: '', stderr: 'fatal: invalid reference' }
      : { outcome: 'completed', status: 0, stdout: '', stderr: '' }),
  });
  const verdict = evaluate({ repoRoot: PROBE_ROOT, gateBase: PROBE_GATE_BASE, basePath: PROBE_BASE, cachedBaseCensus: null }, io);
  return Object.freeze({ failedClosed: verdict.pass === false && /base worktree/i.test(verdict.output) });
}

function equivalenceProbe() {
  const request = { repoRoot: PROBE_ROOT, gateBase: PROBE_GATE_BASE, basePath: PROBE_BASE, cachedBaseCensus: null };
  const firstPass = evaluate(request, eslintOnlyIo(1, 2));
  const collected = collectBase(request, eslintOnlyIo(1, 2));
  if (!collected.ok) {
    return Object.freeze({ agree: false, collected: false, blocked: false, fallbackCollects: false, detail: collected.error });
  }
  const recheck = evaluate({ ...request, cachedBaseCensus: collected.census }, eslintOnlyIo(1, 2));
  const malformedIo = eslintOnlyIo(1, 2);
  const fallback = evaluate({ ...request, cachedBaseCensus: { nonsense: true } }, malformedIo);
  const foreignIo = eslintOnlyIo(1, 2);
  const foreign = evaluate({ ...request, cachedBaseCensus: { gateBase: 'another', tools: {}, notExpected: [], surface: {} } }, foreignIo);
  return Object.freeze({
    agree: firstPass.pass === recheck.pass && JSON.stringify(firstPass.blocking) === JSON.stringify(recheck.blocking),
    collected: true,
    blocked: firstPass.pass === false,
    reusedCache: recheck.usedCachedCensus === true,
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
  evaluate({ repoRoot: PROBE_ROOT, gateBase: PROBE_GATE_BASE, basePath: PROBE_BASE, cachedBaseCensus: null }, declaredIo);
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

function evasionProbe() {
  const counted = countSuppressions(SUPPRESSION_PROBE_FILES);
  const inherited = compareSuppressions({ '@ts-ignore': 3 }, { '@ts-ignore': 3 });
  const added = compareSuppressions({ '@ts-ignore': 1 }, { '@ts-ignore': 2 });
  const removed = compareSuppressions({ '@ts-ignore': 3 }, {});
  const downgrade = compareRuleSeverity({ rules: { 'no-eq': 2 } }, { rules: { 'no-eq': 1 } });
  const vanished = compareRuleSeverity({ rules: { 'no-eq': 2 } }, { rules: {} });
  const raise = compareRuleSeverity({ rules: { 'no-eq': 1 } }, { rules: { 'no-eq': 2 } });
  const loosened = compareTsconfigFlags({ strict: true }, { strict: false });
  const tightened = compareTsconfigFlags({ strict: false }, { strict: true });
  const unnamed = compareTsconfigFlags({ jsx: 'react' }, { jsx: 'preserve' });
  const unchangedUnnamed = compareTsconfigFlags({ jsx: 'react' }, { jsx: 'react' });
  const narrowed = compareCheckedFiles(['a.ts', 'b.ts'], ['a.ts'], ['a.ts', 'b.ts']);
  const deleted = compareCheckedFiles(['a.ts', 'b.ts'], ['a.ts'], ['a.ts']);
  const surface = { eslintConfig: { rules: { r: 2 } }, tsconfigOptions: { strict: true }, checkedFiles: ['a.ts'], commonFiles: ['a.ts'], suppressions: { '@ts-ignore': 1 } };
  const aggregated = evasionVerdict(surface, surface);
  return Object.freeze({
    longestSpellingWins: counted['eslint-disable-next-line'] === 1 && counted['eslint-disable'] === 1 && counted['@ts-expect-error'] === 1,
    directiveCount: SUPPRESSION_DIRECTIVES.length,
    inheritedPasses: inherited.pass === true,
    addedBlocks: added.pass === false && added.blocking.length === 1 && added.blocking[0].surplus === 1,
    removedPasses: removed.pass === true,
    downgradeBlocks: downgrade.pass === false,
    vanishedRuleBlocks: vanished.pass === false,
    raisePasses: raise.pass === true,
    loosenedFlagBlocks: loosened.pass === false,
    tightenedFlagPasses: tightened.pass === true,
    unnamedOptionHalts: unnamed.halted === true && unnamed.error.includes('jsx'),
    unchangedUnnamedOptionPasses: unchangedUnnamed.halted === false && unchangedUnnamed.pass === true,
    narrowingBlocks: narrowed.pass === false,
    deletionPasses: deleted.pass === true,
    aggregatePasses: aggregated.pass === true && aggregated.halted === false,
    flagCount: Object.keys(TSCONFIG_STRICTNESS_FLAGS).length,
  });
}

export function probeBoundarySubstrate() {
  return Object.freeze({
    evasion: evasionProbe(),
    census: boundaryCensus(),
    controls: censusControlProbes(),
    identity: identityProbe(),
    comparator: comparatorProbe(),
    failClosed: failClosedProbe(),
    expectation: expectationProbe(),
    teardown: teardownProbe(),
    materialization: materializationProbe(),
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
  const comparator = substrate.comparator;
  if (!comparator.unchangedPasses) {
    failures.push('an unchanged pre-existing finding now blocks, so the comparison has stopped being a surplus rule; the gate blocks what this MSP introduced, not what it inherited');
  }
  if (!comparator.fixedPasses) {
    failures.push('a fixed pre-existing finding now blocks, so the comparison reads any change as suspicious rather than counting the surplus');
  }
  if (!comparator.surplusBlocks) {
    failures.push('a second instance of a class already present at base no longer blocks, so the comparison has collapsed from a multiset to a set');
  }
  const failClosed = substrate.failClosed;
  if (!failClosed.malformedTscLineHalts) {
    failures.push('a tsc line that matches no declared diagnostic form is now accepted rather than halting with the line quoted, so an unrecognised line would be skipped into a bucket and the run would report clean');
  }
  if (!failClosed.wellFormedTscLineParses) {
    failures.push('a well-formed tsc diagnostic no longer parses, so the census halts on everything and measures nothing');
  }
  if (!failClosed.zeroFilesRefused) {
    failures.push('a run that scanned zero files now reads as a clean result, which is the silent wrong success the fail-closed rule exists to prevent');
  }
  if (!failClosed.shapeRefused) {
    failures.push('an eslint report that is not an array of file entries is now accepted, so an unparseable collection would be read as no findings');
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
  if (!substrate.materialization.failedClosed) {
    failures.push('a base worktree that fails to materialize no longer fails closed, so the gate would compare HEAD against a base it never collected');
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
  if (!equivalence.fallbackCollects) {
    failures.push('a cached census that is malformed or keyed to another base is no longer refused and re-collected, so the recheck would treat an unvalidated base as authoritative');
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
  if (!evasion.inheritedPasses || !evasion.removedPasses) {
    failures.push('a suppression this MSP inherited now blocks, so the scan has become a presence rule rather than a surplus rule; the gate blocks what this MSP added, not what the tree already carried');
  }
  if (!evasion.addedBlocks) {
    failures.push('an added suppression no longer blocks, so the gate could be passed by suppressing a finding rather than by fixing it, which is the whole evasion the scan exists to catch');
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
  if (!evasion.aggregatePasses) {
    failures.push('the aggregated evasion verdict no longer passes on two identical surfaces, so it reports an evasion where nothing changed');
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
