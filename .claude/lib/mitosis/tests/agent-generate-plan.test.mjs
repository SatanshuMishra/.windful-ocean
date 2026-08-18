import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareGeneratedBodies } from '../agent-generate-plan.mjs';

function bodyEntry(source, path, content) {
  return Object.freeze({ name: 'boundary-agent', source, path, content });
}

test('compareGeneratedBodies: a divergence on the first line pins the exact first-line content on both sides', () => {
  const source = '/synthetic/spec/boundary-agent.spec.json';
  const path = '/synthetic/agents/boundary-agent.md';
  const bodies = [bodyEntry(source, path, 'EXPECTED_FIRST\nshared tail\n')];
  const readBody = () => 'ACTUAL_FIRST\nshared tail\n';

  const result = compareGeneratedBodies(bodies, readBody);

  assert.equal(result.ok, false);
  assert.equal(result.divergences.length, 1);
  assert.deepEqual(result.divergences[0], {
    kind: 'drift',
    path,
    line: 1,
    detail: `the generated body diverges from ${source} at line 1 column 1\n  expected: "EXPECTED_FIRST"\n  on disk:  "ACTUAL_FIRST"`,
  });
});

test('compareGeneratedBodies: a divergence on the final line pins the exact final-line content on both sides', () => {
  const source = '/synthetic/spec/boundary-agent.spec.json';
  const path = '/synthetic/agents/boundary-agent.md';
  const bodies = [bodyEntry(source, path, 'shared head\nEXPECTED_LAST')];
  const readBody = () => 'shared head\nACTUAL_LAST';

  const result = compareGeneratedBodies(bodies, readBody);

  assert.equal(result.ok, false);
  assert.equal(result.divergences.length, 1);
  assert.deepEqual(result.divergences[0], {
    kind: 'drift',
    path,
    line: 2,
    detail: `the generated body diverges from ${source} at line 2 column 1\n  expected: "EXPECTED_LAST"\n  on disk:  "ACTUAL_LAST"`,
  });
});
