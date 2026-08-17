import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROMPT_INPUT_SPECS, REVIEW_KINDS, TRUNCATED_EDIT } from '../prompt-contract.mjs';
import { composePrompt } from '../prompt-registry.mjs';
import { PROMPT_FIXTURE_CASES } from './prompt-fixtures.mjs';

function declaresFileScope(kind) {
  return PROMPT_INPUT_SPECS[kind].some((entry) => entry.type === 'fileScope');
}

function withEditTruncation(input) {
  return {
    ...input,
    fileScope: {
      edit: [...input.fileScope.edit],
      read: [...input.fileScope.read],
      truncated: { dropped: 2, reason: 'cp review truncation probe', list: TRUNCATED_EDIT },
    },
  };
}

const SCOPED_CASES = PROMPT_FIXTURE_CASES.filter((fixture) => declaresFileScope(fixture.kind));

test('the review authority classifies every fileScope-declaring kind, so neither side of the halt is asserted over nothing', () => {
  assert.ok(SCOPED_CASES.length > 0, 'no pinned fixture declares a fileScope so the census below measures nothing');
  const kinds = [...new Set(SCOPED_CASES.map((fixture) => fixture.kind))];
  assert.deepEqual(
    REVIEW_KINDS.filter((kind) => !kinds.includes(kind)),
    [],
    'a review kind composes no pinned fixture, so the refusal is asserted over nothing',
  );
  assert.notDeepEqual(
    kinds.filter((kind) => !REVIEW_KINDS.includes(kind)),
    [],
    "with no non-review scoped kind the halt's scoping is asserted only in one direction",
  );
});

for (const fixture of SCOPED_CASES) {
  if (!REVIEW_KINDS.includes(fixture.kind)) continue;
  test(`${fixture.id} refuses an edit-list truncation rather than reviewing a knowingly-partial target`, () => {
    const input = withEditTruncation(fixture.input);
    assert.throws(() => composePrompt(fixture.kind, input), TypeError);
    assert.throws(() => composePrompt(fixture.kind, input), /strict subset of what was written/);
  });
}

for (const fixture of SCOPED_CASES) {
  if (REVIEW_KINDS.includes(fixture.kind)) continue;
  test(`${fixture.id} still composes under an edit-list truncation, so the refusal is scoped to the review path alone`, () => {
    const composed = composePrompt(fixture.kind, withEditTruncation(fixture.input));
    assert.equal(typeof composed, 'string');
    assert.ok(composed.length > 0, `${fixture.id} composed an empty prompt`);
  });
}
