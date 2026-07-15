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

function knobRegion(src) {
  const start = src.indexOf('const KNOB_MODEL_WHITELIST');
  assert.ok(start >= 0, 'KNOB_MODEL_WHITELIST declaration not found');
  const endAnchor = 'return { ok: true, reason: null };\n}';
  const end = src.indexOf(endAnchor, start);
  assert.ok(end >= 0, 'validateModelsKnob end anchor not found');
  return src.slice(start, end + endAnchor.length).replace(/^export /gm, '');
}

test('the models-knob validation twin (KNOB_MODEL_WHITELIST + REVIEW_PINNED_KNOB_KEYS + validateModelsKnob) is byte-identical (minus export) between engine-args.mjs and mitosis.js', () => {
  const engineRegion = knobRegion(readFileSync(`${LIB}engine-args.mjs`, 'utf8'));
  const mitosisRegion = knobRegion(readFileSync(MITOSIS_PATH, 'utf8'));
  assert.equal(
    mitosisRegion,
    engineRegion,
    'the fail-closed models-knob validation drifted between engine-args.mjs and its inline mitosis.js copy — update BOTH copies identically',
  );
  assert.match(engineRegion, /REVIEW_PINNED_KNOB_KEYS/);
  assert.match(engineRegion, /function validateModelsKnob/);
});
