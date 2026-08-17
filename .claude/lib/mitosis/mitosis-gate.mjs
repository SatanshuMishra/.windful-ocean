import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const GATE_MODULE = './mitosis-gate-core.mjs';
const GATE_LOAD_EXIT = 42;

export function isDirectInvocation() {
  try {
    if (!process.argv[1]) return false;
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

function unloadedModule(error) {
  const named = error && typeof error.url === 'string' && error.url.startsWith('file:');
  return fileURLToPath(named ? error.url : new URL(GATE_MODULE, import.meta.url));
}

function loadFailure(error) {
  const message = error && typeof error.message === 'string' && error.message.length > 0 ? error.message : 'unknown load failure';
  const requested = process.argv[2];
  const attempt = typeof requested === 'string' && requested.length > 0 ? `the ${JSON.stringify(requested)} verb never ran` : 'no verb ran';
  return `mitosis-gate: ${unloadedModule(error)} did not load, so ${attempt}: ${message.split('\n')[0]}\n`;
}

function loadGate() {
  try {
    return createRequire(import.meta.url)(GATE_MODULE);
  } catch (error) {
    if (!isDirectInvocation()) throw error;
    process.stderr.write(loadFailure(error));
    process.exit(GATE_LOAD_EXIT);
  }
}

const gate = loadGate();

export const {
  GATE_CLEAN_EXIT,
  GATE_USAGE_EXIT,
  GATE_VIOLATION_EXIT,
  GATE_UNRESOLVABLE_EXIT,
  GATE_READ_EXIT,
  GATE_COMPILE_EXIT,
  MITOSIS_GATE_VERBS,
  DEFAULT_PHASE_PARITY_TARGET,
  DEFAULT_DETERMINISM_TARGET,
  DEFAULT_AGENT_TREE_TARGET,
  extractAuthorityTitles,
  extractDeclaredPhases,
  extractCalledPhases,
  extractAssignedPhases,
  extractPhaseSurfaces,
  checkPhaseParity,
  checkPhaseUse,
  checkPhaseAuthority,
  parseMitosisGateArgv,
  execAllowlistFailures,
  probeExecPolicy,
  runMitosisGate,
} = gate;

export function mitosisGateMain() {
  const out = Object.freeze({
    log: (text) => process.stdout.write(text),
    err: (text) => process.stderr.write(text),
  });
  process.exitCode = runMitosisGate(process.argv.slice(2), out, (path) => readFileSync(path, 'utf8'));
}

if (isDirectInvocation()) {
  mitosisGateMain();
}
