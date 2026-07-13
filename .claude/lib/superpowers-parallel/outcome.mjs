export function shippedOutcome(mspId, extra = {}) {
  return { kind: 'shipped', mspId, prUrl: extra.prUrl, receiptsPass: extra.receiptsPass, d6Pass: extra.d6Pass };
}

export function haltedOutcome(mspId, stage, reason) {
  return { kind: 'halted', mspId, stage, reason };
}

export function crashedOutcome(mspId, stage, error) {
  return { kind: 'crashed', mspId, stage, error };
}

export function quarantinedOutcome(mspId, stage, error, retries, redrive) {
  const outcome = { kind: 'quarantined', mspId, stage, error, retries };
  if (redrive) outcome.redrive = redrive;
  return outcome;
}

export function computeOverallStatus({ shipped, crashed, quarantined, total }) {
  if (total > 0 && shipped.length === total && crashed.length === 0 && quarantined.length === 0) {
    return 'all-shipped';
  }
  if (shipped.length === 0) return 'failed';
  return 'partial';
}

export function partitionOutcomes(outcomes, total = outcomes.length) {
  const shipped = [];
  const halted = [];
  const crashed = [];
  const quarantined = [];
  for (const o of outcomes) {
    if (o.kind === 'shipped') shipped.push(o);
    else if (o.kind === 'halted') halted.push(o);
    else if (o.kind === 'crashed') crashed.push(o);
    else if (o.kind === 'quarantined') quarantined.push(o);
    else throw new Error(`partitionOutcomes: unknown outcome kind: ${o && o.kind}`);
  }
  const overallStatus = computeOverallStatus({ shipped, crashed, quarantined, total });
  return { shipped, halted, crashed, quarantined, overallStatus };
}

export function assembleRunReport({ clusters, chainResults, shipped, mspCount }) {
  const shippedIds = new Set(shipped.map((s) => s.mspId));
  const outcomes = shipped.map((s) => shippedOutcome(s.mspId, s));
  clusters.forEach((clusterIds, i) => {
    const r = chainResults[i];
    if (r === null || r === undefined) {
      const blamed = clusterIds.find((id) => !shippedIds.has(id)) || clusterIds[0];
      outcomes.push(crashedOutcome(blamed, 'cluster', `cluster chain returned ${r} (thunk crashed or was killed); cluster ids: ${clusterIds.join(', ')}`));
      return;
    }
    if (r.halted && r.quarantined) {
      const blamed = r.mspId || clusterIds.find((id) => !shippedIds.has(id)) || clusterIds[0];
      outcomes.push(quarantinedOutcome(blamed, r.stage || 'unknown', r.error || r.detail || 'quarantined', r.retries, r.redrive));
      return;
    }
    if (r.halted && r.crashed) {
      const blamed = r.mspId || clusterIds.find((id) => !shippedIds.has(id)) || clusterIds[0];
      outcomes.push(crashedOutcome(blamed, r.stage || 'unknown', r.error || r.detail || 'crashed'));
      return;
    }
    if (r.halted) {
      const blamed = r.mspId || clusterIds.find((id) => !shippedIds.has(id)) || clusterIds[0];
      const reason = r.detail || (r.haltReason && (r.haltReason.detail || JSON.stringify(r.haltReason))) || 'halted';
      outcomes.push(haltedOutcome(blamed, r.stage || 'unknown', reason));
    }
  });
  const partition = partitionOutcomes(outcomes, mspCount);
  const report = { ...partition, mspCount };
  if (partition.overallStatus !== 'all-shipped') {
    const firstProblem = partition.crashed[0] || partition.halted[0] || partition.quarantined[0];
    if (firstProblem) {
      report.stage = firstProblem.stage;
      report.mspId = firstProblem.mspId;
      report.detail = firstProblem.error || firstProblem.reason;
    }
  }
  return report;
}

export function fatalReport(stage, detail, mspCount, opts = {}) {
  const crashed = opts.crashed ? [crashedOutcome(null, stage, detail)] : [];
  return { shipped: [], halted: [], awaitingApproval: [], crashed, quarantined: [], overallStatus: 'failed', stage, detail, mspCount };
}
