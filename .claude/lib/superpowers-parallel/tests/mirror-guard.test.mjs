import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const LIB = new URL('..', import.meta.url).pathname;
const MITOSIS_PATH = process.env.MITOSIS_PATH || new URL('../../../workflows/mitosis.js', import.meta.url).pathname;

function normalize(src) {
  return src
    .split('\n')
    .map((line) => line.replace(/^export /, ''))
    .filter((line) => !/^import .* from '\.\/[^']*\.mjs';?\s*$/.test(line))
    .join('\n')
    .trim();
}

const mitosis = normalize(readFileSync(MITOSIS_PATH, 'utf8'));

for (const twin of ['outcome.mjs', 'run-engine.mjs', 'retry.mjs', 'prepare-guard.mjs', 'recovery.mjs', 'derive-clusters.mjs', 'boundary.mjs', 'supervisor.mjs', 'remediation.mjs', 'leases.mjs', 'parking.mjs', 'saga.mjs', 'merge-policy.mjs', 'prepare-plan.mjs', 'handoff.mjs', 'checkpoint.mjs', 'reconcile.mjs']) {
  test(`${twin} is byte-identical (minus export/import) to its inline copy in mitosis.js`, () => {
    const body = normalize(readFileSync(`${LIB}${twin}`, 'utf8'));
    assert.ok(
      mitosis.includes(body),
      `${twin} has drifted from its inline mitosis.js twin — update BOTH copies. First 200 chars of the normalized twin:\n${body.slice(0, 200)}`,
    );
  });
}
