export const CHECKPOINT_REF_PREFIX = 'refs/mitosis';

const RUN_ID_PATTERN = /^[a-f0-9]{8}$/;
const UNIT_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const REF_TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;
const MAX_REF_TOKEN_LEN = 255;

export function validateRefToken(token) {
  if (typeof token !== 'string') return false;
  if (token.length === 0 || token.length > MAX_REF_TOKEN_LEN) return false;
  if (!REF_TOKEN_PATTERN.test(token)) return false;
  if (token.startsWith('-')) return false;
  if (token.includes('..')) return false;
  return token.split('/').every((part) => !part.endsWith('.lock') && !part.endsWith('.'));
}

export function checkpointRef(runId, unitId) {
  if (typeof runId !== 'string' || !RUN_ID_PATTERN.test(runId)) {
    throw new Error(`checkpoint: refuses to build a ref from an unsafe runId: ${JSON.stringify(runId)}`);
  }
  if (typeof unitId !== 'string' || !UNIT_ID_PATTERN.test(unitId)) {
    throw new Error(`checkpoint: refuses to build a ref from an unsafe unitId: ${JSON.stringify(unitId)}`);
  }
  return `${CHECKPOINT_REF_PREFIX}/${runId}/${unitId}`;
}

export function parseCheckpointRef(ref, runId) {
  if (typeof ref !== 'string' || typeof runId !== 'string' || !RUN_ID_PATTERN.test(runId)) return null;
  const prefix = `${CHECKPOINT_REF_PREFIX}/${runId}/`;
  if (!ref.startsWith(prefix)) return null;
  const unitId = ref.slice(prefix.length);
  if (!UNIT_ID_PATTERN.test(unitId)) return null;
  return unitId;
}

export function parentCheckpointRefs(runId, parentIds) {
  if (!Array.isArray(parentIds)) return [];
  return parentIds.map((unitId) => ({ unitId, ref: checkpointRef(runId, unitId) }));
}

export const MANIFEST_REF_PREFIX = 'refs/mitosis-manifest';

const SPEC_CONTENT_HASH_PATTERN = /^[a-f0-9]{64}$/;

export function publishedManifestRefPrefix(runId) {
  if (typeof runId !== 'string' || !RUN_ID_PATTERN.test(runId)) {
    throw new Error(`checkpoint: refuses to build a manifest ref from an unsafe runId: ${JSON.stringify(runId)}`);
  }
  return `${MANIFEST_REF_PREFIX}/${runId}/`;
}

export function publishedManifestRef(runId, specContentHash) {
  const prefix = publishedManifestRefPrefix(runId);
  if (typeof specContentHash !== 'string' || !SPEC_CONTENT_HASH_PATTERN.test(specContentHash)) {
    throw new Error(`checkpoint: refuses to build a manifest ref from an unsafe specContentHash: ${JSON.stringify(specContentHash)}`);
  }
  return `${prefix}${specContentHash}`;
}
