import {
  BOUNDARY_C7_OBLIGATIONS,
  BOUNDARY_DECLARATIONS,
  BOUNDARY_DISPATCH_NAMES,
  boundaryCensus,
} from './boundary-census.mjs';
import {
  BOUNDARY_TOOLS,
  IDENTITY_COMPONENTS,
  NORMALIZATION_STEPS,
  REAL_BOUNDARY_IO,
  structuralIdentity,
  toolExpectation,
} from './boundary-collect.mjs';
import { censusIdentity } from './boundary-census-cache.mjs';
import { collectBase, compareCensuses, evaluate } from './boundary-gate.mjs';
import { EVASION_CLASSIFIER_NAMES, SUPPRESSION_MECHANISMS } from './boundary-evasion.mjs';
import { censusControlProbes } from './boundary-census-control-probe.mjs';
import {
  failClosedProbe,
  materializationProbe,
  packageManagerProbe,
  scanBoundsProbe,
  teardownProbe,
  toolResolutionProbe,
} from './boundary-collection-failure-probe.mjs';
import { evasionProbe } from './boundary-evasion-probe.mjs';
import { evasionWiringProbe } from './boundary-evasion-wiring-probe.mjs';
import { boundaryVocabularyAnchors, boundaryVocabularyCensuses } from './boundary-vocabulary-census.mjs';
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
  'the structural identity is normalized per field rather than over the joined tuple: the file component becomes a path relative to its own side root, so two findings differing only in their directory stay distinct while one file observed under the two worktree roots is one identity, and both are measured here on every invocation',
  'a chained tsc diagnostic folds its indented continuation lines into the diagnostic above it and the folded text joins the identity, so a base commit carrying a chained type error does not halt the gate and two chains sharing a head with different tails stay distinct; an indented line with no diagnostic above it still halts with the line quoted, and all three are measured here on every invocation',
  'the tool executable is resolved separately from the package that installs it, and a resolved path that does not exist refuses naming the path tried rather than being handed back to a spawn that fails as a module-not-found; the type-check leg is measured here on every invocation to name the executable npm installs under node_modules/.bin',
  'what each tool is expected to report is recomputed from the trees on every pass, and a supplied base census whose NOT-EXPECTED set disagrees with that recomputation is refused and the base re-collected, so a cached census carries base identity counts and never decides whether a tool runs at all; measured here on every invocation with a census naming every tool NOT-EXPECTED',
  'the base worktree teardown checks the result of the removal rather than only catching a throw, falls back to removing the path when the removal exits non-zero, and names the leaked path in the verdict when even that fails; all three are measured here on every invocation',
  'the added-suppression scan keys its counts by file and directive, so a suppression removed in one file cannot pay for one added in another, and a count key naming no file halts rather than being compared; both are measured here on every invocation',
  'each declared strictness flag carries both its safe value and the compiler default an absent value takes, and EVERY one of them is exercised here on every invocation by a specimen that moves that flag alone away from its safe value and must block naming it, so inverting a declared safe value or a declared compiler default reddens this verb rather than leaving a flag that blocks nothing',
  'the checked-scope comparison halts rather than defaulting when a file list, a common-file list or the two side roots are absent, and halts when the two lists share no file at all rather than reporting a clean narrowing; every one of those refusals is measured here on every invocation',
  'the comparison is a multiset surplus rather than a difference or a presence test: an unchanged pre-existing finding and a fixed pre-existing finding each pass, and a second instance of a class already present at base blocks, each measured here on every invocation',
  'a tsc line that is neither blank nor one of the declared diagnostic forms halts with the line quoted rather than being skipped, and that halt is exercised here on a synthetic line every time this verb runs',
  'the type-checked file list is a closed census too: a line matching neither a declared diagnostic form, an indented continuation, nor the declared absolute-file-path form HALTS with the line quoted rather than being read as a checked file path and handed to the file reader; a well-formed list carrying the diagnostics tsc prints beside it still parses, and both are measured here on every invocation',
  'a run that scanned zero files is refused on both tools rather than read as a clean result, and an eslint report that is not an array of file entries is refused, each measured here on every invocation',
  'NOT-EXPECTED requires positive observation of BOTH sides: a config present on either side alone still expects the tool, and a side that cannot be positively observed is never reported NOT-EXPECTED, both measured here on every invocation',
  'the base worktree teardown runs on the throw path and not only on success, measured here on every invocation against an injected seam that throws mid-collection',
  'the first pass and the recheck produce identical verdicts when the supplied census is the one collection would have produced, measured here on every invocation by collecting the base and then replaying it as a cached census through the same entry point',
  'a cached base census that is absent, malformed, or keyed to another base is refused and the base is collected instead, so the fallback is a call to the collector rather than prose that re-describes it and cannot lose the node_modules strategy or the teardown the way the incumbent recheck does',
  'the program reaches processes only through the shared chokepoint and requests only allowlisted binaries: an unlisted binary is refused before any child starts, measured here on every invocation with the spawn seam counting the children it was asked to start',
  'the added-suppression scan counts HEAD source against base source per declared mechanism and blocks the surplus alone, so a suppression this MSP added blocks and one it inherited does not; both are measured here on every invocation, the longest directive spelling is counted over the prefix it contains, and EVERY declared mechanism is exercised here by a specimen that must count as exactly that mechanism, so dropping one from the declared list reddens this verb',
  'the suppression census covers every in-file mechanism eslint honors, including the rule CONFIGURATION comment form that carries a rule-to-severity mapping and that no --print-config reports, counted once per rule it lowers below error and not at all for a rule it raises; an eslint block-comment directive it cannot classify HALTS with the directive and its file quoted rather than being dropped from the count, and both are measured here on every invocation',
  'a rule severity downgrade blocks against the resolved rule map rather than the written config, so resolution through extends and shared presets is done by eslint; a rule that vanished from the resolved map is read as a downgrade to off rather than as absent, and a raise does not block',
  'a declared tsconfig strictness flag moved away from its safe value blocks, and a changed compiler option the declared table does not name HALTS with the key named rather than being bucketed as not strictness-relevant; that halt is exercised here on an unnamed option every time this verb runs',
  'the checked-scope comparison is made PER TOOL against the same tool file list on the other side rather than over one union of every tool, so a file eslint stopped linting blocks even while tsc still checks it, and a tool that reported a list on one side and none on the other HALTS rather than being read as a narrowed or a clean scope; a narrowed include or a widened ignore blocks while a legitimately added or deleted source file does not, and all of it is measured here on every invocation',
  'the package-manager resolver yields a real, existing JS entry distinct from the node binary rather than a bare path that cannot execute, and a lockfile whose declared manager carries no install support refuses before any install child spawns, both measured here on every invocation',
  'an added suppression and a resolved-config strictness downgrade each reach the gate verdict end to end through evaluate itself, carrying the added-suppression or tsconfig-strictness classifier in its blocking array, and an inherited suppression or an unchanged resolved config still passes; all four are measured here on every invocation by driving evaluate rather than the classifier functions alone',
  'the HEAD suppression scan reads HEAD OWN whole checked universe rather than the base-HEAD intersection, so a suppression in a file this MSP ADDS blocks while an added file carrying none still passes; both are measured here on every invocation by driving evaluate over a file present only at HEAD',
  'the scanned universe is the union of every EXPECTED tool file list rather than the type-checked list alone, so a suppression added in a repository where tsc is NOT-EXPECTED blocks and an eslint-only repository that added none still passes; both are measured here on every invocation, and a universe empty of repository sources while a tool was collected is refused',
  'the common-file list the checked-scope comparison restricts to is decided on the HEAD side by MEMBERSHIP OF THE HEAD TREE rather than by HEAD checked list, which is what keeps the dropped set from being identically empty the way a list derived from the two checked lists would be; its base side is the base CHECKED list, because the base worktree is torn down before the comparison runs and no membership can be read from it, and the list asks nothing of the base root at all; a surface it cannot read that list from REFUSES rather than yielding an empty common set, and a file present in both trees and checked only at base blocks while a file deleted at HEAD passes, all measured here on every invocation through evaluate',
  'each side prints the resolved eslint config PER FILE for every file it lints that is present in the other tree, and the severity comparison covers exactly the files BOTH sides resolved, so a per-glob downgrade that leaves the first-sorting file untouched blocks and a file that only one side lints neither hides a downgrade nor fabricates one; two sides that resolved no file in common HALT, and a side that cannot print a file config refuses naming that file. A file only one side lints is covered by the per-tool checked-scope comparison rather than here, and nothing beyond the files both sides lint is claimed',
  'the strictness comparison is fed a REAL captured tsc --showConfig payload in which strict:true is already expanded into its whole strict family, so a family member the declared table fails to name halts here rather than in production; the payload and the declared family are censused against each other on every invocation, so a family flag the payload does not name and a payload key the declared family does not carry each redden this verb rather than being counted against a threshold',
  'a verdict that does not pass always names at least one blocking entry, whether it blocked, halted mid-scan, or refused the collection, so a consumer rendering the cause from the blocking array never reports an empty reason; measured here on every invocation across every failing verdict the wiring probe drives',
  'the scanned universe carries repository sources alone: a path under node_modules is dropped so a dependency or compiler bump cannot surface as an added suppression, the base worktree materialized inside the repository is excluded from the HEAD scan while a base worktree outside it excludes no subtree at all, and a side whose tools report only dependency paths is refused rather than scanned as an empty universe; all of it is measured here on every invocation against injected seams',
  'a supplied base census is refused unless its surface carries every field the comparison reads, and EVERY one of those declared fields is exercised here on every invocation by a supplied census whose value for that field alone is unusable, so dropping a field from the validated list reddens this verb; a well-formed census of the same shape is still accepted, which is what keeps the refusal from being one that refuses every input',
  'a scanned source is bounded BEFORE it is consumed: the per-file byte cap, the file-count budget and the aggregate byte budget are each decided from the described size before any file is read, and a source inside every budget is still read and counted; all four are measured here on every invocation against an injected path describer that never reads',
  'a checked path is resolved to its REAL path before it is read, and one whose real path leaves the worktree root or that is not a regular file is refused unread, so a committed link out of the tree is never read through and a pipe or a device is never opened; both refusals and the evidence that neither was read are measured here on every invocation',
  'every child this program starts under these probes carries a positive deadline, so no collection command can leave the run with neither a verdict nor a timeout; measured here on every invocation by the spawn seam recording the options each child was started with, over a run that starts children rather than one that starts none',
  'every declared vocabulary this verb CLASSIFIES against is a closed census in BOTH directions: each declared entry is exercised by a specimen that classifies to it, and each specimen classifies to a declared entry, so an entry dropped from a declared list and an entry no specimen exercises each redden this verb rather than being counted; the suppression mechanisms, the tsconfig strictness flags, the identity components and the normalization steps they apply, the boundary tools, the cached-census surface fields, the census refusal kinds, the evasion classifiers, the binaries the collection requests and the captured strict family are each censused here on every invocation',
  'the census refusal kinds are censused against BOTH the negative controls and the census source: every declared kind is reached by a control that halts as that kind, and every refusal site the census source spells names a declared kind, so a halt added without a control and a control that no longer reaches its halt each redden this verb',
]);

export const BOUNDARY_PARITY_NOT_ATTESTED = Object.freeze([
  'that the evasion classifiers behave as declared against a real eslint or a real tsc: every probe here injects its own exec and filesystem seams, and the only real capture replayed is one tsc 5.8.3 --showConfig payload for strict:true, so what a real eslint prints for a large resolved config, and what a real tsc prints for a config reached through extends or under another version, remains untested until a probe runs them against a real repository',
  'that the byte cap and the node_modules exclusion carry the right thresholds for a real tree: both are measured here against injected seams, so the cap is exercised but never against a real generated source, and the measured size of a real node_modules and lib.d.ts universe is not re-measured on each run',
  'that either mechanical dispatch has been converted: both still dispatch a language model in both engine trees until C7 ports them onto this substrate, and this verb measures the conversion list rather than the conversion',
  'that this program produces the verdict the incumbent prose produced: the prose is executed by a model and no probe here runs both and compares them, so the two are pinned by their declared parts rather than by an end-to-end equivalence',
  'that the collection commands behave as declared against a real repository: every probe here injects its own exec and filesystem seams, so what a real eslint or a real tsc prints for a large tree, a symbolic link, or a config resolved from a parent directory is untested until C7 supplies those seams',
  'that a real npm install SUCCEEDS end to end: the resolver is measured here to yield a real, existing JS entry and an unserviceable lockfile is measured here to refuse, but no probe spawns the install child to completion, so its exit code and its effect on node_modules remain unmeasured',
  'that a boundary dispatch outside the two declared engine trees would be seen: the census reads .claude/lib/mitosis and .claude/workflows, so one added under .claude/hooks, or anywhere else in the repository, is unscanned',
  'that a boundary label composed rather than spelled would be seen: the census classifies a plain string literal at a label key, so a label built by interpolation or read from configuration is outside what it measures',
  'that the added-suppression scan reads the same domain the incumbent prose reads: the first pass scans the source diff and the recheck scans HEAD source against a cached surface, and this program narrows both to HEAD-vs-base source counts, which is well defined without a diff and is what lets the two passes share one code path',
  'that a suppression spelled other than as a declared mechanism would be counted: an eslint block-comment directive the census cannot classify HALTS, but a directive another tool honors under a name the declared list does not carry, one written in a line comment eslint itself ignores, or one composed at run time, is outside what it measures',
  'that the declared eslint comment-directive vocabulary is the one the installed eslint honors: the suppression, inert and rule-configuration forms are declared from the published eslint directive documentation rather than read from a running eslint, so a form a later version adds is met by the halt that refuses to classify it rather than by a rule that counts it',
  'that a spawn site no invocation reaches carries a deadline: this verb measures the children its probes actually start, and the census over every declared spawn site in the program source, including the legs one run never reaches, runs in the tests rather than here',
  'that the prose lists this verb renders are censused the way its vocabularies are: the C7 obligations, these attests and these gaps are sentences a reader judges, not tokens a specimen classifies, so they carry no closed census and a stale one is caught by review rather than by this verb',
  'what resolving the eslint config per file costs on a real repository: covering the surface takes one --print-config child per linted file per side, and every probe here injects its exec seam, so the wall-clock cost of that on a tree of thousands of files is unmeasured until C7 runs it against a real repository',
]);

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
  if (typeof merged.describePath !== 'function') merged.describePath = describedBy(merged.readFile);
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
    exists: (path) => String(path).includes('eslint.config') || String(path).endsWith('package.json') || /\/src\/a\d+\.ts$/.test(String(path)),
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
  const disagreeingShape = {
    gateBase: PROBE_GATE_BASE,
    tools: {},
    notExpected: BOUNDARY_TOOLS.map((tool) => tool.name),
    surface: {
      root: PROBE_BASE,
      checkedFiles: [],
      checkedByTool: {},
      suppressions: {},
      tsconfigOptions: {},
      eslintConfigByFile: {},
      eslintConfigFiles: [],
    },
  };
  const disagreeingCensus = { ...disagreeingShape, identity: censusIdentity(disagreeingShape) };
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

export function probeBoundarySubstrate() {
  const controls = censusControlProbes();
  const evasionWiring = evasionWiringProbe();
  const exec = execProbe();
  return Object.freeze({
    evasion: evasionProbe(),
    evasionWiring,
    census: boundaryCensus(),
    controls,
    identity: identityProbe(),
    comparator: comparatorProbe(),
    failClosed: failClosedProbe(),
    expectation: expectationProbe(),
    teardown: teardownProbe(),
    materialization: materializationProbe(),
    packageManager: packageManagerProbe(),
    toolResolution: toolResolutionProbe(),
    bounds: scanBoundsProbe(),
    equivalence: equivalenceProbe(),
    exec,
    anchors: boundaryVocabularyAnchors(),
    vocabularies: boundaryVocabularyCensuses(Object.freeze({
      controls,
      classifiers: evasionWiring.observedClassifiers,
      requestedBinaries: exec.requestedBinaries,
      capturedStrictOptions: evasionWiring.capturedStrictOptions,
    })),
  });
}

export function boundaryParityFailures(substrate) {
  const failures = [];
  const inert = substrate.controls.filter((control) => !(control.anchorPresent && control.halted && control.named));
  if (inert.length > 0) {
    failures.push(`these census controls no longer halt on the thing they name, so the census would classify it silently: ${inert.map((control) => `${control.name} (${control.detail})`).join('; ')}`);
  }
  for (const vocabulary of substrate.vocabularies) {
    if (vocabulary.declared.length === 0) {
      failures.push(`${vocabulary.name} is an empty declaration, so its census classifies nothing and reports a clean vocabulary for every input`);
    }
    if (vocabulary.unexercised.length > 0) {
      failures.push(`these declared entries of ${vocabulary.name} reach no specimen, so dropping or inverting one would leave this verb green: ${vocabulary.unexercised.join('; ')}`);
    }
    if (vocabulary.undeclared.length > 0) {
      failures.push(`these specimens of ${vocabulary.name} match no declared entry, so the census would classify them nowhere: ${vocabulary.undeclared.join('; ')}`);
    }
    if (vocabulary.failing.length > 0) {
      failures.push(`these declared entries of ${vocabulary.name} no longer behave as their specimen measures them: ${vocabulary.failing.join('; ')}`);
    }
  }
  if (!substrate.census.ok) {
    failures.push(`the boundary dispatch census over the real engine trees halted rather than resolving: ${substrate.census.error}`);
  }
  if (substrate.census.ok) {
    const target = BOUNDARY_DECLARATIONS.conversionTarget;
    const misnamed = substrate.census.sites.filter((site) => site.twin !== (site.path !== target));
    if (misnamed.length > 0) {
      failures.push(`these dispatch sites are no longer classified by the tree they sit in: ${misnamed.map((site) => `${site.name} at ${site.path}:${site.line} is reported ${site.twin ? 'a twin' : 'the conversion target'}`).join('; ')}; every site outside ${target} is a twin, and the live-path divergence this verb reports is exactly that split`);
    }
    const misfiled = substrate.census.twinSites.filter((site) => site.twin !== true || site.path === target);
    if (misfiled.length > 0) {
      failures.push(`the twin list this verb renders carries these sites that are not twins of ${target}: ${misfiled.map((site) => `${site.name} at ${site.path}:${site.line}`).join('; ')}`);
    }
    if (substrate.census.twinSiteCount !== substrate.census.twinSites.length
      || substrate.census.twinSiteCount + substrate.census.conversionTargetSiteCount !== substrate.census.siteCount) {
      failures.push('the twin and conversion-target site counts no longer add up to the sites the census resolved, so the split the payload reports is not the split the census measured');
    }
  }
  const anchors = substrate.anchors;
  if (!anchors.unclassifiableSuppressionHalts) {
    failures.push('an eslint comment directive the suppression census cannot classify is now dropped from the count rather than halting with the directive and its file quoted, so a branch author silences a finding with one comment the census never counted');
  }
  if (!anchors.wellFormedCachedCensusPasses) {
    failures.push('a well-formed supplied base census is now refused too, so the per-field validation refuses every input rather than the corrupted field the comparison reads');
  }
  if (!anchors.reportedStepsAreCensused) {
    failures.push('the normalization steps this verb reports are no longer the steps a declared identity component applies, so the payload names a transform no specimen exercises');
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
  if (!failClosed.unclassifiableListedLineHalts) {
    failures.push('a --listFiles line matching no declared diagnostic, continuation or absolute-file-path form is now read as a checked file path and handed to the file reader rather than halting with the line quoted; that is the catch-all bucket the sibling diagnostic census refuses by name, and it drives real file reads');
  }
  if (!failClosed.wellFormedListedFileParses) {
    failures.push('a well-formed file list carrying the diagnostics tsc prints beside it no longer parses to the paths it names, so the file-list census refuses every input rather than classifying it');
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
  const bounds = substrate.bounds;
  if (!bounds.overCapRefusedUnread || !bounds.overTotalRefusedUnread || !bounds.overCountRefusedUnread) {
    failures.push('a scanned source above the per-file byte cap, a file list above the file-count budget, or a universe above the aggregate byte budget is no longer refused before any of it is read, so the bytes are materialized first and the bound is decided on what was already consumed');
  }
  if (!bounds.withinBudgetScanned) {
    failures.push('a source inside every declared budget is no longer scanned at all, so the bounds refuse every input rather than the ones above them and the suppression counts would be empty for every tree');
  }
  if (!bounds.escapingRealPathRefusedUnread || !bounds.irregularPathRefusedUnread) {
    failures.push('a checked path whose REAL path leaves the worktree root, or one that is not a regular file, is no longer refused before it is read; containment decided on the path as written reads a link out of the tree, and opening a pipe or a device blocks the run or yields bytes no source carries');
  }
  if (!bounds.nestedBaseExcluded || !bounds.separateBaseExcludesNothing) {
    failures.push('the HEAD scan no longer excludes the base worktree materialized inside the repository and the paths under node_modules, or it excludes a subtree when the base worktree sits outside the repository entirely; HEAD would scan the throwaway base tree as its own source and block the MSP on the base commit');
  }
  if (!bounds.dependencyOnlyUniverseRefused) {
    failures.push('a side whose tools report only paths under node_modules is no longer refused, so the scanned universe would be empty of repository sources while a tool was collected and every evasion scan would read nothing');
  }
  if (bounds.childrenStarted === 0 || bounds.undeadlinedChildren.length > 0) {
    failures.push(`the gate started ${bounds.childrenStarted} child process(es) and ${bounds.undeadlinedChildren.length} of them carried no positive deadline (${bounds.undeadlinedChildren.join('; ') || 'none named'}); a collection child that never exits leaves the run with no verdict and no timeout`);
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
    failures.push('a surface missing its suppression counts, its per-tool checked-file map or its per-file resolved eslint configs now defaults to empty rather than halting, and an empty default reports no evasion for every input');
  }
  if (!evasion.perToolNarrowingBlocks) {
    failures.push('a file that left ONE tool file list while another tool still covers it no longer blocks, so the comparison folded the per-tool lists back into a union; a union compares only what left EVERY tool, which masks every widened ignore in a repository where a second tool covers the same file');
  }
  if (!evasion.perToolUnchangedPasses) {
    failures.push('two identical per-tool checked-file maps now block, so the per-tool comparison has become a presence rule rather than a narrowing rule and no MSP could pass');
  }
  if (!evasion.perToolShapeChangeHalts) {
    failures.push('a tool that reported a checked-file list on one side and none on the other, an empty per-tool map, or a bare union list handed in place of the map, is now compared rather than halting; each of those is a shape change that reads as a clean scope for every input');
  }
  if (!evasion.perFileDowngradeBlocks) {
    failures.push('a severity downgrade resolved for one file no longer blocks when another compared file kept its severity, so the comparison is back to one sampled anchor and every per-glob downgrade behind that anchor passes');
  }
  if (!evasion.perFileUnchangedPasses) {
    failures.push('two identical per-file resolved configs now block, so the per-file comparison reports a downgrade where the config never changed');
  }
  if (!evasion.perFileVacuousHalts) {
    failures.push('two sides that resolved the eslint config for no file in common, a side handed no per-file map at all, or a single resolved config handed in place of the map, now compare vacuously rather than halting; each reports no downgrade for every input');
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
  if (!evasionWiring.headOnlyFileSuppressionBlocks) {
    failures.push('a suppression in a file present only at HEAD no longer makes evaluate block, so the HEAD scan reads the base-HEAD intersection rather than HEADs own checked universe and a suppression in a file this MSP ADDS is never read at all');
  }
  if (!evasionWiring.headOnlyFileWithoutSuppressionPasses) {
    failures.push('a file this MSP adds that carries no suppression now blocks, so scanning HEADs whole checked universe has become a presence rule over added files rather than a surplus rule over directives');
  }
  if (!evasionWiring.eslintOnlyRepositorySuppressionBlocks) {
    failures.push('a suppression added in a repository where tsc is NOT-EXPECTED no longer blocks, so the scanned universe is the type-checked file list alone and every eslint-only repository, and every .js file eslint lints that tsc does not, is unscanned');
  }
  if (!evasionWiring.eslintOnlyRepositoryCleanPasses) {
    failures.push('an eslint-only repository that added no suppression now blocks, so the widened scanned universe reports an evasion where the sources never changed');
  }
  if (!evasionWiring.narrowedCheckedScopeBlocks) {
    failures.push('a file present in both trees and checked only at base no longer makes evaluate block with classifier checked-scope; the common-file list must come from tree membership, because deriving it from the two checked lists makes both restricted sets equal it and the dropped set identically empty');
  }
  if (!evasionWiring.deletedFilePasses) {
    failures.push('a file legitimately deleted at HEAD now reads as a narrowed checked scope through evaluate, so the common-file list is no longer restricted to files present in both trees');
  }
  if (!evasionWiring.widenedIgnoreBlocksPerTool) {
    failures.push('an eslint ignore widened at HEAD no longer makes evaluate block with classifier checked-scope naming eslint while tsc still checks the file, so the per-tool lists are folded into a union before the comparison and every ignore widening in a repository both tools cover is masked');
  }
  if (!evasionWiring.unchangedToolScopesPass) {
    failures.push('a repository whose tools check the same files on both sides now blocks through evaluate, so the per-tool comparison reports a narrowing where no scope changed');
  }
  if (!evasionWiring.perGlobDowngradeBlocks) {
    failures.push('a per-glob rule downgrade that leaves the first-sorting file untouched no longer makes evaluate block with classifier rule-severity naming the file, so the resolved config is sampled at one anchor again and the anchor is trivially targetable');
  }
  if (!evasionWiring.everyComparedFileResolved) {
    failures.push('the sides no longer print the resolved eslint config for every file they lint that the other tree carries, so the compared surface is narrower than the attest claims');
  }
  if (!evasionWiring.unprintableFileConfigRefuses) {
    failures.push('a side that cannot print the resolved eslint config for one of its linted files no longer refuses naming that file, so the file drops out of the compared surface and a downgrade resolved behind it passes');
  }
  if (!evasionWiring.collectionRefusalNamesACause || !evasionWiring.evasionHaltNamesACause) {
    failures.push('a verdict that refused the collection, or one that halted mid-scan on an option the declared table does not name, no longer carries the classifier that produced it, so the three shapes a failing verdict takes are no longer distinguishable from its blocking array');
  }
  if (!evasionWiring.everyFailingVerdictNamesACause) {
    failures.push('a failing verdict now carries an empty blocking array, or fewer than the blocked, halted and refused shapes are driven at all, so a consumer rendering the cause from blocking reports no reason at all; pass false must always imply at least one named blocking entry');
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
    suppressionMechanisms: [...SUPPRESSION_MECHANISMS],
    evasionClassifiers: [...EVASION_CLASSIFIER_NAMES],
    vocabularies: substrate.vocabularies.map((vocabulary) => `${vocabulary.name}: ${vocabulary.declared.length} declared, each exercised by a specimen and no specimen unclassified`),
    censusControls: substrate.controls.map((control) => `${control.name}: ${control.anchorPresent && control.halted && control.named ? `halted and named as ${control.refusal}` : 'INERT'}`),
    requestedBinaries: [...substrate.exec.requestedBinaries],
    modelInvocationsRemaining: census.siteCount,
    attests: [...BOUNDARY_PARITY_ATTESTS],
    notAttested: [...BOUNDARY_PARITY_NOT_ATTESTED],
    c7Obligations: [...BOUNDARY_C7_OBLIGATIONS],
  });
}
