import { engineSourceFiles } from './determinism-lint.mjs';
import { extractUsedPhases } from './phase-scan.mjs';

function censusFailure(kind, error) {
  return Object.freeze({ ok: false, kind, error });
}

export function censusEnginePhaseUse(roots, io) {
  const listed = engineSourceFiles(roots, io);
  if (!listed.ok) return censusFailure(listed.kind, listed.error);
  const called = [];
  const assigned = [];
  for (const path of listed.files) {
    let source;
    try {
      source = io.readSource(path);
    } catch (error) {
      return censusFailure('read', `${path} could not be read: ${error && error.message ? error.message : 'unknown read failure'}`);
    }
    if (typeof source !== 'string') {
      return censusFailure('read', `${path} carried no readable source, so its phase surface is unmeasured rather than empty`);
    }
    const used = extractUsedPhases(source);
    if (!used.ok) return censusFailure('halt', `${path}: ${used.error}`);
    called.push(...used.called);
    assigned.push(...used.assigned);
  }
  return Object.freeze({
    ok: true,
    files: Object.freeze([...listed.files]),
    called: Object.freeze(called),
    assigned: Object.freeze(assigned),
  });
}
