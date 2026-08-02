import { park } from './parking.mjs';
import { parseRunManifest, applyShipTransition, applyBuiltTransition } from './recovery.mjs';

export function shipDelta({ mspId, prUrl, mergedAt, title, rationale }) {
  return { kind: 'ship', mspId, prUrl: prUrl ?? null, mergedAt: mergedAt ?? null, title: title ?? null, rationale: rationale ?? null };
}

export function builtDelta({ unitId, checkpointRef, sha, green, builtAgainst }) {
  return { kind: 'built', unitId, checkpointRef: checkpointRef ?? null, sha: sha ?? null, green: green ?? false, builtAgainst: builtAgainst ?? {} };
}

export function parkDelta({ unitId, stage, diagnosis, request, remediation, resumePoint, triedSet }) {
  return {
    kind: 'park',
    unitId,
    stage: stage ?? null,
    diagnosis: diagnosis ?? null,
    request: request ?? null,
    remediation: remediation ?? null,
    resumePoint: resumePoint ?? null,
    triedSet: Array.isArray(triedSet) ? [...triedSet] : [],
  };
}

export function quiescentExitDelta({ at, outstanding }) {
  return { kind: 'quiescent-exit', at: at ?? null, outstanding: outstanding === true };
}

const ISO_INSTANT_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

export function isIsoInstant(value) {
  return typeof value === 'string' && ISO_INSTANT_PATTERN.test(value);
}

function applyRunDelta(manifest, record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return manifest;
  if (record.kind === 'ship') return applyShipTransition(manifest, record);
  if (record.kind === 'built') return applyBuiltTransition(manifest, record);
  if (record.kind === 'park') {
    try {
      return park(manifest, record);
    } catch {
      return manifest;
    }
  }
  if (record.kind === 'window') return { ...manifest, window: record.size };
  if (record.kind === 'quiescent-exit') return isIsoInstant(record.at) ? { ...manifest, quiescentExitAt: record.at, quiescentExitOutstanding: record.outstanding === true } : manifest;
  return manifest;
}

export function foldRunManifest(raw) {
  const whole = parseRunManifest(raw);
  if (whole) return whole;
  if (typeof raw !== 'string' || raw.length === 0) return null;
  const lines = raw.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
  const base = lines.length > 0 ? parseRunManifest(lines[0]) : null;
  if (!base) return null;
  let manifest = base;
  for (let i = 1; i < lines.length; i += 1) {
    let record;
    try {
      record = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    manifest = applyRunDelta(manifest, record);
  }
  return manifest;
}
