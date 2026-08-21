import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workTypeLineFor } from '../pr-work-type.mjs';

const LINE_TYPES = Object.freeze({ feat: 'feature', refactor: 'refactor', chore: 'chore' });
const NO_LINE_TYPES = Object.freeze(['fix', 'docs', 'test', 'perf', 'ci']);

test('a change type the table maps to one emits that exact work-type line', () => {
  for (const [changeType, workType] of Object.entries(LINE_TYPES)) {
    assert.equal(workTypeLineFor(changeType), `work-type: ${workType}`, `${changeType} did not compose the mapped line`);
  }
});

test('a change type the table maps to none emits no line at all, never undefined and never an empty string', () => {
  for (const changeType of NO_LINE_TYPES) {
    assert.equal(workTypeLineFor(changeType), null, `${changeType} was expected to emit no line`);
  }
});

test('a change type outside the declared eight-type table refuses loudly rather than silently omitting the line', () => {
  for (const bad of ['sneak', 'Feat', 'FEAT', '', 'feature', undefined, null, 7]) {
    assert.throws(() => workTypeLineFor(bad), /pr-work-type.*declared conventional-commit types/s, `${JSON.stringify(bad)} was accepted rather than refused`);
  }
});
