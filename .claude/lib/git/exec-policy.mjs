import { fileURLToPath } from 'node:url';
import { classifyGhMerge } from './gh-merge-shim.mjs';

export const EXEC_ALLOWLIST = Object.freeze(['claude', 'gh', 'git', 'graphify', 'node']);

const GH_BINARY = 'gh';
const NODE_BINARY = 'node';
const PATH_QUALIFIED = /[\\/]/;
const NO_INDIRECT_IO = Object.freeze({ readFile: () => null, readStdin: () => null });
const GH_SHIM_PATH = fileURLToPath(new URL('./gh-merge-shim.mjs', import.meta.url));
const POLICY = 'the supervisor never merges a pull request itself; a human does that after review';

export function assertSpawnAllowed(binary, argv, io = NO_INDIRECT_IO) {
  if (typeof binary !== 'string' || binary.length === 0) {
    throw new TypeError('exec-policy: refusing to spawn a binary that is not a non-empty string');
  }
  if (PATH_QUALIFIED.test(binary)) {
    throw new Error(`exec-policy: refusing to spawn ${JSON.stringify(binary)}; the allowlist names bare binaries, so a path-qualified spelling would walk straight past a basename comparison`);
  }
  if (!EXEC_ALLOWLIST.includes(binary)) {
    throw new Error(`exec-policy: ${JSON.stringify(binary)} is not spawnable; the policy is deny-by-default and the only spawnable binaries are ${EXEC_ALLOWLIST.join(', ')}`);
  }
  if (binary !== GH_BINARY) return;

  let decision;
  try {
    decision = classifyGhMerge(Array.isArray(argv) ? argv : [], io);
  } catch (error) {
    throw new Error(`exec-policy: the deny classifier threw (${error && error.message ? error.message : 'unknown failure'}); refusing to spawn (fail-closed). ${POLICY}`);
  }
  if (decision === null || typeof decision !== 'object' || Array.isArray(decision)) {
    throw new Error(`exec-policy: the deny classifier returned no usable decision; refusing to spawn (fail-closed). ${POLICY}`);
  }
  if (decision.refuse === true) {
    throw new Error(`exec-policy: refused in-process before any child started — ${decision.reason} ${POLICY}`);
  }
}

export function resolveSpawn(binary, argv, io = NO_INDIRECT_IO) {
  assertSpawnAllowed(binary, argv, io);
  const args = Array.isArray(argv) ? [...argv] : [];
  if (binary === GH_BINARY) {
    return Object.freeze({ command: NODE_BINARY, args: Object.freeze([GH_SHIM_PATH, ...args]) });
  }
  return Object.freeze({ command: binary, args: Object.freeze(args) });
}
