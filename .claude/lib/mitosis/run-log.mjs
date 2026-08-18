import { park } from './parking.mjs';
import { parseRunManifest, applyShipTransition, applyBuiltTransition } from './recovery.mjs';
import { isValidFingerprint } from './remediation.mjs';
import { legacyStatusOf, legacyParkedDisposition, startingProgressOf } from './unit-state.mjs';

export function shipDelta({ mspId, prUrl, mergedAt, title, rationale }) {
  return { kind: 'ship', mspId, prUrl: prUrl ?? null, mergedAt: mergedAt ?? null, title: title ?? null, rationale: rationale ?? null };
}

export function builtDelta({ unitId, checkpointRef, sha, green, builtAgainst }) {
  return { kind: 'built', unitId, checkpointRef: checkpointRef ?? null, sha: sha ?? null, green: green ?? false, builtAgainst: builtAgainst ?? {} };
}

export function parkDelta({ unitId, stage, diagnosis, request, remediation, resumePoint, triedSet, blockedBy, class: dispositionClass }) {
  return {
    kind: 'park',
    unitId,
    stage: stage ?? null,
    diagnosis: diagnosis ?? null,
    request: request ?? null,
    remediation: remediation ?? null,
    resumePoint: resumePoint ?? null,
    triedSet: Array.isArray(triedSet) ? [...triedSet] : [],
    ...(typeof blockedBy === 'string' && blockedBy.length > 0 ? { blockedBy } : {}),
    ...(typeof dispositionClass === 'string' ? { class: dispositionClass } : {}),
  };
}

export function ciAttemptDelta({ unitId, fingerprint }) {
  return { kind: 'ci-attempt', unitId, fingerprint: fingerprint ?? null };
}

export function quiescentExitDelta({ at, outstanding }) {
  return { kind: 'quiescent-exit', at: at ?? null, outstanding: outstanding === true };
}

const ISO_INSTANT_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

export function isIsoInstant(value) {
  return typeof value === 'string' && ISO_INSTANT_PATTERN.test(value);
}

function applyRunDelta(manifest, record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return { manifest, refusal: null };
  if (record.kind === 'ship') return { manifest: applyShipTransition(manifest, record), refusal: null };
  if (record.kind === 'built') return { manifest: applyBuiltTransition(manifest, record), refusal: null };
  if (record.kind === 'park') {
    try {
      return { manifest: park(manifest, record), refusal: null };
    } catch (err) {
      return { manifest, refusal: err instanceof Error ? err.message : String(err) };
    }
  }
  if (record.kind === 'ci-attempt') return { manifest: applyCiAttemptTransition(manifest, record), refusal: null };
  if (record.kind === 'quiescent-exit') {
    return {
      manifest: isIsoInstant(record.at) ? { ...manifest, quiescentExitAt: record.at, quiescentExitOutstanding: record.outstanding === true } : manifest,
      refusal: null,
    };
  }
  return { manifest, refusal: null };
}

function applyCiAttemptTransition(manifest, record) {
  if (!isValidFingerprint(record.fingerprint)) return manifest;
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.msps)) return manifest;
  if (!manifest.msps.some((m) => m && m.id === record.unitId)) return manifest;
  return {
    ...manifest,
    msps: manifest.msps.map((m) => {
      if (!m || m.id !== record.unitId) return m;
      const priorTried = Array.isArray(m.triedSet) ? m.triedSet : [];
      const priorAttempts = Array.isArray(m.ciAttempts) ? m.ciAttempts : [];
      return {
        ...m,
        triedSet: priorTried.includes(record.fingerprint) ? [...priorTried] : [...priorTried, record.fingerprint],
        ciAttempts: priorAttempts.includes(record.fingerprint) ? [...priorAttempts] : [...priorAttempts, record.fingerprint],
      };
    }),
  };
}

function hasOwnDisposition(msp) {
  return msp && Object.prototype.hasOwnProperty.call(msp, 'disposition') && msp.disposition !== null && msp.disposition !== undefined;
}

function normalizeBaseProgress(base) {
  return {
    ...base,
    msps: base.msps.map((msp) => {
      const progress = startingProgressOf(msp);
      const status = legacyStatusOf(progress);
      if (msp.status === 'parked' && !hasOwnDisposition(msp)) {
        return { ...msp, progress, status, disposition: legacyParkedDisposition(msp) };
      }
      return { ...msp, progress, status };
    }),
  };
}

function withFoldRefusals(manifest, refusals) {
  return { ...manifest, foldRefusals: Object.freeze([...refusals]) };
}

export function foldRunManifest(raw) {
  const whole = parseRunManifest(raw);
  if (whole) return withFoldRefusals(whole, []);
  if (typeof raw !== 'string' || raw.length === 0) return null;
  const lines = raw.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
  const rawBase = lines.length > 0 ? parseRunManifest(lines[0]) : null;
  if (!rawBase) return null;
  let manifest;
  try {
    manifest = normalizeBaseProgress(rawBase);
  } catch {
    return null;
  }
  const refusals = [];
  for (let i = 1; i < lines.length; i += 1) {
    let record;
    try {
      record = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    const { manifest: nextManifest, refusal } = applyRunDelta(manifest, record);
    manifest = nextManifest;
    if (refusal !== null) refusals.push({ line: i + 1, reason: refusal });
  }
  return withFoldRefusals(manifest, refusals);
}
