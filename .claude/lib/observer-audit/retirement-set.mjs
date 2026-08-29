import { halt } from './js-scan.mjs';

const AGENT_NAME = /^[a-z0-9][a-z0-9-]*$/;

function failure(kind, error) {
  return Object.freeze({ ok: false, kind, error });
}

export function readRetiredRoster(path, source) {
  if (typeof source !== 'string' || source.length === 0) {
    return halt(`${path} carried no readable source, so the retired roster cannot be derived from it`);
  }
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    return halt(`${path} could not be parsed as JSON: ${error.message}; the retired roster cannot be derived from it`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return halt(`${path} must hold a JSON object carrying a "retired" array, not a bare array, so a later field can be added without breaking the format; refusing to guess`);
  }
  const { retired } = parsed;
  if (!Array.isArray(retired)) {
    return halt(`${path} carries no "retired" array, so the retired roster cannot be derived from it`);
  }
  if (retired.length === 0) {
    return halt(`${path} declares an empty "retired" array, so a zero-occurrence verdict would report a retirement it never measured; refusing to guess`);
  }
  const names = [];
  for (const name of retired) {
    if (typeof name !== 'string' || !AGENT_NAME.test(name)) {
      return halt(`${path} names retired agent ${JSON.stringify(name ?? null)} in its "retired" array, which no agent definition file can be called; refusing to guess`);
    }
    if (names.includes(name)) {
      return halt(`${path} names ${JSON.stringify(name)} twice in its "retired" array; refusing to derive a roster that cannot be read as a set`);
    }
    names.push(name);
  }
  return Object.freeze({ ok: true, names: Object.freeze(names) });
}

export function reconcileRetirementSet(retained, retiring, onDisk) {
  const retainedSet = new Set(retained);
  const retiringSet = new Set(retiring);
  const present = retiring.filter((name) => onDisk.has(name));
  const derivationA = [...onDisk].filter((name) => !retainedSet.has(name)).sort();
  const derivationB = [...retiring].sort();
  const symmetric = [...new Set([
    ...derivationA.filter((name) => !retiringSet.has(name)),
    ...derivationB.filter((name) => !derivationA.includes(name)),
  ])].sort();
  const retired = derivationA.length === 0 && present.length === 0;
  const faults = [];
  if (retained.length === 0) {
    faults.push('the agent-spec store names no retained agent, so derivation A has nothing to subtract');
  }
  if (retiring.length === 0) {
    faults.push('retired-roster.json names no retiring agent, so a zero-occurrence verdict would report an absence it never measured');
  }
  if (onDisk.size === 0) {
    faults.push('the canonical agent directory holds no agent definition at all, so derivation A has no input');
  }
  const both = derivationB.filter((name) => retainedSet.has(name));
  if (both.length > 0) {
    faults.push(`${both.join(', ')} is declared both retained and retiring — retained by the agent-spec store, retiring by retired-roster.json — so no derivation can classify it`);
  }
  const unclassified = [...onDisk].filter((name) => !retainedSet.has(name) && !retiringSet.has(name)).sort();
  if (unclassified.length > 0) {
    faults.push(`${unclassified.join(', ')} on disk belongs to neither the agent-spec store's retained names nor retired-roster.json's retiring names, so the classification is not closed`);
  }
  if (symmetric.length > 0 && !retired) {
    faults.push(`the two derivations of the retiring set disagree on ${symmetric.join(', ')}; derivation A yields ${derivationA.join(', ') || 'nothing'} and derivation B yields ${derivationB.join(', ')}, and this census never proceeds on one alone`);
  }
  if (faults.length > 0) return failure('halt', faults.join('; '));
  return Object.freeze({
    ok: true,
    names: derivationB,
    derivation: Object.freeze({
      shape: retired ? 'retired' : 'present-on-disk',
      retained: Object.freeze([...retained].sort()),
      derivationA: Object.freeze(derivationA),
      derivationB: Object.freeze(derivationB),
      onDisk: Object.freeze([...onDisk].sort()),
    }),
  });
}
