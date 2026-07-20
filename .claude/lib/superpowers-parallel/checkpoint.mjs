export const CHECKPOINT_REF_PREFIX = 'refs/mitosis';

const RUN_ID_PATTERN = /^[a-f0-9]{8}$/;
const UNIT_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

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
