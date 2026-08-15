import { evaluate } from './boundary-gate.mjs';

const PROBE_ROOT = '/probe/evasion-wiring/head';
const PROBE_BASE = '/probe/evasion-wiring/base';
const PROBE_GATE_BASE = 'evasionwiringbase';
const CLEAN_CHILD = Object.freeze({ outcome: 'completed', status: 0, stdout: '', stderr: '' });
const CLEAN_SOURCE = 'export const a = 1;\n';
const TYPESCRIPT_MANIFEST = JSON.stringify({ devDependencies: { typescript: '5.8.3' } });
const ESLINT_MANIFEST = JSON.stringify({ devDependencies: { eslint: '9.0.0' } });

export const CAPTURED_TSC_STRICT_SHOWCONFIG = Object.freeze({
  strict: true,
  noImplicitAny: true,
  noImplicitThis: true,
  strictNullChecks: true,
  strictFunctionTypes: true,
  strictBindCallApply: true,
  strictPropertyInitialization: true,
  strictBuiltinIteratorReturn: true,
  alwaysStrict: true,
  useUnknownInCatchVariables: true,
});

export const CAPTURED_TSC_LOOSE_SHOWCONFIG = Object.freeze({ strict: false });

function sideOf(path) {
  return String(path).startsWith(PROBE_BASE) ? 'base' : 'head';
}

function rootOf(side) {
  return side === 'base' ? PROBE_BASE : PROBE_ROOT;
}

function relativeOf(path) {
  const text = String(path);
  return text.slice(rootOf(sideOf(text)).length + 1);
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

function probeIo(overrides) {
  const spawned = [];
  const base = {
    run: () => CLEAN_CHILD,
    exists: (path) => String(path).endsWith('tsconfig.json') || String(path).endsWith('package.json'),
    readFile: () => TYPESCRIPT_MANIFEST,
    makeDir: () => {},
    symlink: () => {},
    removePath: () => {},
    resolveTool: (name, root) => ({ ok: true, path: `${root}/node_modules/.bin/${name}` }),
    resolvePackageManager: () => ({ ok: true, entry: '/probe/pm.js' }),
  };
  const merged = { ...base, ...overrides };
  const inner = merged.run;
  return Object.freeze({
    describePath: describedBy(merged.readFile),
    ...merged,
    spawned,
    run: (binary, argv, options) => {
      spawned.push(`${binary} ${argv.join(' ')}`);
      return inner(binary, argv, options);
    },
  });
}

function sidedPlan(plan) {
  return Object.freeze({
    tree: { base: plan.baseTree ?? plan.baseChecked, head: plan.headTree ?? plan.headChecked },
    checked: { base: plan.baseChecked, head: plan.headChecked },
    sources: { base: plan.baseSources ?? {}, head: plan.headSources ?? {} },
  });
}

function tscEvasionIo(plan) {
  const { tree, checked, sources } = sidedPlan(plan);
  const options = {
    base: plan.baseOptions ?? CAPTURED_TSC_STRICT_SHOWCONFIG,
    head: plan.headOptions ?? CAPTURED_TSC_STRICT_SHOWCONFIG,
  };
  return probeIo({
    exists: (path) => {
      const text = String(path);
      if (text.endsWith('tsconfig.json') || text.endsWith('package.json')) return true;
      return tree[sideOf(text)].includes(relativeOf(text));
    },
    readFile: (path) => {
      const text = String(path);
      if (text.endsWith('package.json')) return TYPESCRIPT_MANIFEST;
      return sources[sideOf(text)][relativeOf(text)] ?? CLEAN_SOURCE;
    },
    run: (binary, argv) => {
      if (argv.includes('--listFiles')) {
        const root = argv[argv.length - 1];
        return { outcome: 'completed', status: 0, stdout: `${checked[sideOf(root)].map((file) => `${root}/${file}`).join('\n')}\n`, stderr: '' };
      }
      if (argv.includes('--showConfig')) {
        const root = argv[argv.length - 1];
        return { outcome: 'completed', status: 0, stdout: JSON.stringify({ compilerOptions: options[sideOf(root)] }), stderr: '' };
      }
      return CLEAN_CHILD;
    },
  });
}

function eslintEvasionIo(plan) {
  const { tree, checked, sources } = sidedPlan(plan);
  return probeIo({
    exists: (path) => {
      const text = String(path);
      if (text.includes('eslint.config') || text.endsWith('package.json')) return true;
      return tree[sideOf(text)].includes(relativeOf(text));
    },
    readFile: (path) => {
      const text = String(path);
      if (text.endsWith('package.json')) return ESLINT_MANIFEST;
      return sources[sideOf(text)][relativeOf(text)] ?? CLEAN_SOURCE;
    },
    run: (binary, argv) => {
      if (argv.includes('--print-config')) return { outcome: 'completed', status: 0, stdout: JSON.stringify({ rules: {} }), stderr: '' };
      if (!argv.some((value) => String(value).includes('eslint'))) return CLEAN_CHILD;
      const root = String(argv[1]).startsWith(PROBE_BASE) ? PROBE_BASE : PROBE_ROOT;
      return {
        outcome: 'completed',
        status: 0,
        stdout: JSON.stringify(checked[sideOf(root)].map((file) => ({ filePath: `${root}/${file}`, messages: [] }))),
        stderr: '',
      };
    },
  });
}

const BOTH_TOOLS_MANIFEST = JSON.stringify({ devDependencies: { typescript: '5.8.3', eslint: '9.0.0' } });

function bothToolsEvasionIo(plan) {
  const tree = { base: plan.baseTree ?? plan.baseTypeChecked, head: plan.headTree ?? plan.headTypeChecked };
  const typeChecked = { base: plan.baseTypeChecked, head: plan.headTypeChecked };
  const linted = { base: plan.baseLinted, head: plan.headLinted };
  const rules = plan.rulesFor ?? (() => ({ 'no-eq': 2 }));
  return probeIo({
    exists: (path) => {
      const text = String(path);
      if (text.endsWith('tsconfig.json') || text.endsWith('package.json') || text.includes('eslint.config')) return true;
      return tree[sideOf(text)].includes(relativeOf(text));
    },
    readFile: (path) => (String(path).endsWith('package.json') ? BOTH_TOOLS_MANIFEST : CLEAN_SOURCE),
    run: (binary, argv) => {
      if (argv.includes('--print-config')) {
        const printed = argv[argv.length - 1];
        return { outcome: 'completed', status: 0, stdout: JSON.stringify({ rules: rules(sideOf(printed), relativeOf(printed)) }), stderr: '' };
      }
      if (argv.includes('--listFiles')) {
        const root = argv[argv.length - 1];
        return { outcome: 'completed', status: 0, stdout: `${typeChecked[sideOf(root)].map((file) => `${root}/${file}`).join('\n')}\n`, stderr: '' };
      }
      if (argv.includes('--showConfig')) {
        const root = argv[argv.length - 1];
        return { outcome: 'completed', status: 0, stdout: JSON.stringify({ compilerOptions: CAPTURED_TSC_STRICT_SHOWCONFIG }), stderr: '' };
      }
      if (String(argv[0]).endsWith('/eslint')) {
        const root = String(argv[1]);
        return {
          outcome: 'completed',
          status: 0,
          stdout: JSON.stringify(linted[sideOf(root)].map((file) => ({ filePath: `${root}/${file}`, messages: [] }))),
          stderr: '',
        };
      }
      return CLEAN_CHILD;
    },
  });
}

function probeEvaluate(io) {
  return evaluate({ repoRoot: PROBE_ROOT, gateBase: PROBE_GATE_BASE, basePath: PROBE_BASE, cachedBaseCensus: null }, io);
}

function blocksWith(verdict, classifier) {
  return verdict.pass === false && verdict.blocking.some((entry) => entry.classifier === classifier);
}

const SUPPRESSED_SOURCE = `// @ts-ignore\n${CLEAN_SOURCE}`;
const ONE_FILE = Object.freeze(['a.ts']);
const TWO_FILES = Object.freeze(['a.ts', 'b.ts']);

export function evasionWiringProbe() {
  const addedSuppression = probeEvaluate(tscEvasionIo({ baseChecked: ONE_FILE, headChecked: ONE_FILE, headSources: { 'a.ts': SUPPRESSED_SOURCE } }));
  const inheritedSuppression = probeEvaluate(tscEvasionIo({
    baseChecked: ONE_FILE,
    headChecked: ONE_FILE,
    baseSources: { 'a.ts': SUPPRESSED_SOURCE },
    headSources: { 'a.ts': SUPPRESSED_SOURCE },
  }));
  const headOnlySuppression = probeEvaluate(tscEvasionIo({
    baseChecked: ONE_FILE,
    headChecked: TWO_FILES,
    headSources: { 'b.ts': SUPPRESSED_SOURCE },
  }));
  const headOnlyClean = probeEvaluate(tscEvasionIo({ baseChecked: ONE_FILE, headChecked: TWO_FILES }));
  const eslintOnlySuppression = probeEvaluate(eslintEvasionIo({
    baseChecked: ONE_FILE,
    headChecked: ONE_FILE,
    headSources: { 'a.ts': `// eslint-disable-next-line no-eq\n${CLEAN_SOURCE}` },
  }));
  const eslintOnlyClean = probeEvaluate(eslintEvasionIo({ baseChecked: ONE_FILE, headChecked: ONE_FILE }));
  const narrowedScope = probeEvaluate(tscEvasionIo({ baseChecked: TWO_FILES, headChecked: ONE_FILE, headTree: TWO_FILES }));
  const deletedFile = probeEvaluate(tscEvasionIo({ baseChecked: TWO_FILES, headChecked: ONE_FILE, headTree: ONE_FILE }));
  const strictnessDowngrade = probeEvaluate(tscEvasionIo({
    baseChecked: ONE_FILE,
    headChecked: ONE_FILE,
    headOptions: CAPTURED_TSC_LOOSE_SHOWCONFIG,
  }));
  const unchangedConfig = probeEvaluate(tscEvasionIo({ baseChecked: ONE_FILE, headChecked: ONE_FILE }));
  const widenedIgnore = probeEvaluate(bothToolsEvasionIo({
    baseTypeChecked: TWO_FILES,
    headTypeChecked: TWO_FILES,
    baseLinted: TWO_FILES,
    headLinted: ONE_FILE,
  }));
  const unchangedToolScopes = probeEvaluate(bothToolsEvasionIo({
    baseTypeChecked: TWO_FILES,
    headTypeChecked: TWO_FILES,
    baseLinted: TWO_FILES,
    headLinted: TWO_FILES,
  }));
  const perGlobDowngrade = probeEvaluate(bothToolsEvasionIo({
    baseTypeChecked: TWO_FILES,
    headTypeChecked: TWO_FILES,
    baseLinted: TWO_FILES,
    headLinted: TWO_FILES,
    rulesFor: (side, file) => (side === 'head' && file === 'b.ts' ? { 'no-eq': 0 } : { 'no-eq': 2 }),
  }));
  const perFileConfigIo = bothToolsEvasionIo({
    baseTypeChecked: TWO_FILES,
    headTypeChecked: TWO_FILES,
    baseLinted: TWO_FILES,
    headLinted: TWO_FILES,
  });
  probeEvaluate(perFileConfigIo);
  const configPrints = perFileConfigIo.spawned.filter((command) => command.includes('--print-config'));
  return Object.freeze({
    addedSuppressionBlocks: blocksWith(addedSuppression, 'added-suppression'),
    inheritedSuppressionPasses: inheritedSuppression.pass === true,
    headOnlyFileSuppressionBlocks: blocksWith(headOnlySuppression, 'added-suppression')
      && headOnlySuppression.blocking.some((entry) => entry.path === 'b.ts'),
    headOnlyFileWithoutSuppressionPasses: headOnlyClean.pass === true,
    eslintOnlyRepositorySuppressionBlocks: blocksWith(eslintOnlySuppression, 'added-suppression')
      && eslintOnlySuppression.blocking.some((entry) => entry.directive === 'eslint-disable-next-line'),
    eslintOnlyRepositoryCleanPasses: eslintOnlyClean.pass === true,
    narrowedCheckedScopeBlocks: blocksWith(narrowedScope, 'checked-scope')
      && narrowedScope.blocking.some((entry) => Array.isArray(entry.droppedFiles) && entry.droppedFiles.includes('b.ts')),
    deletedFilePasses: deletedFile.pass === true,
    strictnessDowngradeBlocks: blocksWith(strictnessDowngrade, 'tsconfig-strictness')
      && strictnessDowngrade.blocking.some((entry) => entry.flag === 'strictBuiltinIteratorReturn'),
    unchangedConfigPasses: unchangedConfig.pass === true,
    widenedIgnoreBlocksPerTool: blocksWith(widenedIgnore, 'checked-scope')
      && widenedIgnore.blocking.some((entry) => entry.tool === 'eslint' && Array.isArray(entry.droppedFiles) && entry.droppedFiles.includes('b.ts')),
    unchangedToolScopesPass: unchangedToolScopes.pass === true,
    perGlobDowngradeBlocks: blocksWith(perGlobDowngrade, 'rule-severity')
      && perGlobDowngrade.blocking.some((entry) => entry.file === 'b.ts' && entry.rule === 'no-eq'),
    everyComparedFileResolved: TWO_FILES.every((file) => [PROBE_ROOT, PROBE_BASE]
      .every((root) => configPrints.some((command) => command.endsWith(`--print-config ${root}/${file}`)))),
    expandedStrictFlagCount: Object.keys(CAPTURED_TSC_STRICT_SHOWCONFIG).length,
    everyFailingVerdictNamesACause: [
      addedSuppression,
      headOnlySuppression,
      eslintOnlySuppression,
      narrowedScope,
      strictnessDowngrade,
      widenedIgnore,
      perGlobDowngrade,
    ].every((verdict) => verdict.pass === false && verdict.blocking.length > 0),
  });
}
