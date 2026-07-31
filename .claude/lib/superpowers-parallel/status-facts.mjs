import { applyShipTransition, applyBuiltTransition } from './recovery.mjs';
import { checkpointRef } from './checkpoint.mjs';

export function foldObservedStatus(priorManifest, { mergedIds, shippedMeta, manifestUnitIds, builtUnits, builtShas, logicalRunId }) {
  const shippedFoldedManifest = mergedIds.reduce((mani, mspId) => {
    const meta = shippedMeta.get(mspId) || null;
    return applyShipTransition(mani, { mspId, prUrl: meta ? meta.prUrl : null, mergedAt: meta ? meta.mergedAt : null, title: null, rationale: null });
  }, priorManifest);
  return builtUnits
    .filter((unitId) => manifestUnitIds.has(unitId))
    .reduce((mani, unitId) => {
      const existing = mani.msps.find((m) => m.id === unitId);
      if (existing && existing.status === 'parked' && existing.resumePoint && existing.resumePoint.stage === 'plan') return mani;
      return applyBuiltTransition(mani, {
        unitId,
        checkpointRef: checkpointRef(logicalRunId, unitId),
        sha: builtShas[unitId] ?? (existing && typeof existing.builtSha === 'string' ? existing.builtSha : null),
        green: existing ? existing.green : undefined,
        builtAgainst: existing ? existing.builtAgainst : undefined,
      });
    }, shippedFoldedManifest);
}
