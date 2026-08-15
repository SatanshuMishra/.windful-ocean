import { evaluate } from './boundary-gate.mjs';

const PROBE_ROOT = '/probe/evasion-wiring/head';
const PROBE_BASE = '/probe/evasion-wiring/base';
const PROBE_GATE_BASE = 'evasionwiringbase';
const CLEAN_CHILD = Object.freeze({ outcome: 'completed', status: 0, stdout: '', stderr: '' });

function probeIo(overrides) {
  const spawned = [];
  const base = {
    run: () => CLEAN_CHILD,
    exists: (path) => String(path).endsWith('tsconfig.json') || String(path).endsWith('package.json'),
    readFile: () => JSON.stringify({ devDependencies: { typescript: '5.0.0' } }),
    makeDir: () => {},
    symlink: () => {},
    removePath: () => {},
    resolveTool: (name, root) => ({ ok: true, path: `${root}/node_modules/.bin/${name}` }),
    resolvePackageManager: () => ({ ok: true, entry: '/probe/pm.js' }),
  };
  const merged = { ...base, ...overrides };
  const inner = merged.run;
  return Object.freeze({
    ...merged,
    spawned,
    run: (binary, argv, options) => {
      spawned.push(`${binary} ${argv.join(' ')}`);
      return inner(binary, argv, options);
    },
  });
}

function tscEvasionIo({ baseSuppressed, headSuppressed, baseStrict, headStrict }) {
  return probeIo({
    readFile: (path) => {
      const text = String(path);
      if (text.endsWith('package.json')) return JSON.stringify({ devDependencies: { typescript: '5.0.0' } });
      if (text.endsWith('a.ts')) {
        const suppressed = text.startsWith(PROBE_BASE) ? baseSuppressed : headSuppressed;
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
        const strict = root === PROBE_BASE ? baseStrict : headStrict;
        return { outcome: 'completed', status: 0, stdout: JSON.stringify({ compilerOptions: { strict } }), stderr: '' };
      }
      return CLEAN_CHILD;
    },
  });
}

function probeEvaluate(io) {
  return evaluate({ repoRoot: PROBE_ROOT, gateBase: PROBE_GATE_BASE, basePath: PROBE_BASE, cachedBaseCensus: null }, io);
}

export function evasionWiringProbe() {
  const addedSuppression = probeEvaluate(tscEvasionIo({ baseSuppressed: false, headSuppressed: true, baseStrict: true, headStrict: true }));
  const inheritedSuppression = probeEvaluate(tscEvasionIo({ baseSuppressed: true, headSuppressed: true, baseStrict: true, headStrict: true }));
  const strictnessDowngrade = probeEvaluate(tscEvasionIo({ baseSuppressed: false, headSuppressed: false, baseStrict: true, headStrict: false }));
  const unchangedConfig = probeEvaluate(tscEvasionIo({ baseSuppressed: false, headSuppressed: false, baseStrict: true, headStrict: true }));
  return Object.freeze({
    addedSuppressionBlocks: addedSuppression.pass === false && addedSuppression.blocking.some((entry) => entry.classifier === 'added-suppression'),
    inheritedSuppressionPasses: inheritedSuppression.pass === true,
    strictnessDowngradeBlocks: strictnessDowngrade.pass === false && strictnessDowngrade.blocking.some((entry) => entry.classifier === 'tsconfig-strictness'),
    unchangedConfigPasses: unchangedConfig.pass === true,
  });
}
