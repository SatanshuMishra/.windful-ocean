import { applyShipTransition, applyBuiltTransition } from './recovery.mjs';
import { checkpointRef } from './checkpoint.mjs';

export const VETO_PARKED = 'parked';
export const VETO_CONDEMNED = 'condemned';
export const ADVANCE_VETOES = Object.freeze([VETO_PARKED, VETO_CONDEMNED]);

export function advanceVeto({ status, resumePoint, condemned } = {}) {
  if (condemned === true) return VETO_CONDEMNED;
  if (status === 'parked' && resumePoint && resumePoint.stage === 'plan') return VETO_PARKED;
  return null;
}

export function vetoLogLine(unitId, veto, heldAdvance) {
  if (!ADVANCE_VETOES.includes(veto)) {
    throw new Error(`vetoLogLine: ${JSON.stringify(veto)} is not an advance veto; exactly ${ADVANCE_VETOES.length} vetoes may hold a forward advance (${ADVANCE_VETOES.join(', ')})`);
  }
  return `mitosis[${unitId}]: reconcile — ${veto.toUpperCase()} VETO holds the forward advance to ${heldAdvance}; the derived status is unchanged`;
}

export function foldObservedStatus(priorManifest, { mergedIds, shippedMeta, manifestUnitIds, builtUnits, builtShas, logicalRunId, log }) {
  const emit = typeof log === 'function' ? log : () => {};
  const shippedFoldedManifest = mergedIds.reduce((mani, mspId) => {
    const meta = shippedMeta.get(mspId) || null;
    return applyShipTransition(mani, { mspId, prUrl: meta ? meta.prUrl : null, mergedAt: meta ? meta.mergedAt : null, title: null, rationale: null });
  }, priorManifest);
  return builtUnits
    .filter((unitId) => manifestUnitIds.has(unitId))
    .reduce((mani, unitId) => {
      const existing = mani.msps.find((m) => m.id === unitId);
      const veto = existing ? advanceVeto({ status: existing.status, resumePoint: existing.resumePoint, condemned: false }) : null;
      if (veto !== null) {
        emit(vetoLogLine(unitId, veto, 'built'));
        return mani;
      }
      return applyBuiltTransition(mani, {
        unitId,
        checkpointRef: checkpointRef(logicalRunId, unitId),
        sha: builtShas[unitId] ?? (existing && typeof existing.builtSha === 'string' ? existing.builtSha : null),
        green: existing ? existing.green : undefined,
        builtAgainst: existing ? existing.builtAgainst : undefined,
      });
    }, shippedFoldedManifest);
}
