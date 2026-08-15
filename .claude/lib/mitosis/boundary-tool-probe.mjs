import { REFUSAL_CLASSIFIER, evaluate } from './boundary-gate.mjs';

const PROBE_ROOT = '/probe/tool/head';
const PROBE_BASE = '/probe/tool/base';
const PROBE_GATE_BASE = 'toolprobebase';
const PROBE_FILE = 'a.ts';
const CLEAN_CHILD = Object.freeze({ outcome: 'completed', status: 0, stdout: '', stderr: '' });
const CLEAN_SOURCE = 'export const a = 1;\n';

const DECLARED_BY_CONFIG = 'its declared config name alone';
const DECLARED_BY_DEPENDENCY = 'its declared package dependency alone';

export const TOOL_COLLECTION_SPECIMENS = Object.freeze([
  Object.freeze({ tool: 'eslint', configName: 'eslint.config.js', dependency: 'eslint', executable: 'eslint', declaredBy: DECLARED_BY_CONFIG }),
  Object.freeze({ tool: 'eslint', configName: 'eslint.config.js', dependency: 'eslint', executable: 'eslint', declaredBy: DECLARED_BY_DEPENDENCY }),
  Object.freeze({ tool: 'tsc', configName: 'tsconfig.json', dependency: 'typescript', executable: 'tsc', declaredBy: DECLARED_BY_CONFIG }),
  Object.freeze({ tool: 'tsc', configName: 'tsconfig.json', dependency: 'typescript', executable: 'tsc', declaredBy: DECLARED_BY_DEPENDENCY }),
]);

function manifestFor(specimen) {
  return JSON.stringify(specimen.declaredBy === DECLARED_BY_DEPENDENCY
    ? { devDependencies: { [specimen.dependency]: '1.0.0' } }
    : { devDependencies: {} });
}

function rootOf(path) {
  return String(path).startsWith(PROBE_BASE) ? PROBE_BASE : PROBE_ROOT;
}

function probeIo(specimen) {
  const spawned = [];
  const io = {
    spawned,
    exists: (path) => {
      const text = String(path);
      if (text.endsWith(`/${specimen.configName}`)) return specimen.declaredBy === DECLARED_BY_CONFIG;
      return text.endsWith('/package.json') || text.endsWith(`/${PROBE_FILE}`);
    },
    readFile: (path) => (String(path).endsWith('package.json') ? manifestFor(specimen) : CLEAN_SOURCE),
    describePath: (path) => Object.freeze({
      ok: true,
      path: String(path),
      kind: 'a regular file',
      regular: true,
      size: Buffer.byteLength(CLEAN_SOURCE, 'utf8'),
    }),
    makeDir: () => {},
    symlink: () => {},
    removePath: () => {},
    resolveTool: (name, root) => ({ ok: true, path: `${root}/node_modules/.bin/${name}` }),
    resolvePackageManager: () => ({ ok: true, entry: '/probe/pm.js' }),
    run: (binary, argv) => {
      spawned.push(`${binary} ${argv.join(' ')}`);
      if (argv.includes('--print-config')) return { outcome: 'completed', status: 0, stdout: JSON.stringify({ rules: {} }), stderr: '' };
      if (argv.includes('--showConfig')) return { outcome: 'completed', status: 0, stdout: JSON.stringify({ compilerOptions: { strict: true } }), stderr: '' };
      if (argv.includes('--listFiles')) {
        const root = argv[argv.length - 1];
        return { outcome: 'completed', status: 0, stdout: `${root}/${PROBE_FILE}\n`, stderr: '' };
      }
      if (argv.includes('-f')) {
        const root = String(argv[1]);
        return {
          outcome: 'completed',
          status: 0,
          stdout: JSON.stringify([{ filePath: `${root}/${PROBE_FILE}`, messages: [] }]),
          stderr: '',
        };
      }
      return CLEAN_CHILD;
    },
  };
  return io;
}

function spawnedRootsFor(specimen, spawned) {
  const suffix = `/node_modules/.bin/${specimen.executable}`;
  return Object.freeze([...new Set(spawned
    .filter((command) => command.split(' ').some((word) => word.endsWith(suffix)))
    .map((command) => rootOf(command.split(' ').find((word) => word.endsWith(suffix)))))].sort());
}

export function toolCollectionProbes() {
  return Object.freeze(TOOL_COLLECTION_SPECIMENS.map((specimen) => {
    const io = probeIo(specimen);
    const verdict = evaluate({ repoRoot: PROBE_ROOT, gateBase: PROBE_GATE_BASE, basePath: PROBE_BASE, cachedBaseCensus: null }, io);
    const spawnedRoots = spawnedRootsFor(specimen, io.spawned);
    return Object.freeze({
      tool: specimen.tool,
      declaredBy: specimen.declaredBy,
      collected: !verdict.blocking.some((entry) => entry.classifier === REFUSAL_CLASSIFIER),
      expected: !verdict.notExpected.includes(specimen.tool),
      executableSpawnedOnBothSides: spawnedRoots.length === 2,
      spawnedRoots,
      detail: verdict.output,
    });
  }));
}
