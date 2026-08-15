import test from 'node:test';
import assert from 'node:assert/strict';
import { PROMPT_INPUT_SPECS } from '../prompt-contract.mjs';
import { composePrompt } from '../prompt-registry.mjs';
import { PROMPT_FIXTURE_CASES } from './prompt-fixtures.mjs';
import { requirePromptArgv, shellQuote } from '../prompt-values.mjs';

const CLASSED_TYPES = Object.freeze(['path', 'ref', 'glob', 'slug']);

function classedFields(kind) {
  return PROMPT_INPUT_SPECS[kind].filter((field) => CLASSED_TYPES.includes(field.type));
}

function backtickSpans(text) {
  return [...text.matchAll(/`([^`\n]+)`/g)].map((match) => match[1]);
}

function unquotedText(span) {
  return span.split("'").filter((part, index) => index % 2 === 0).join(' ');
}

function declaresScopedCheckCmd(fixture) {
  return PROMPT_INPUT_SPECS[fixture.kind].some((entry) => entry.name === 'scopedCheckCmd');
}

test('every classed value a composed prompt renders inside a backtick span is single-quoted there', () => {
  const offenders = [];
  for (const fixture of PROMPT_FIXTURE_CASES) {
    let composed;
    try {
      composed = composePrompt(fixture.kind, fixture.input);
    } catch {
      continue;
    }
    for (const field of classedFields(fixture.kind)) {
      const value = fixture.input[field.name];
      if (typeof value !== 'string' || value.length === 0) continue;
      for (const span of backtickSpans(composed)) {
        if (!span.includes(value)) continue;
        if (unquotedText(span).includes(value)) {
          offenders.push(`${fixture.id} :: ${field.name} :: ${span}`);
        }
      }
    }
  }
  assert.ok(PROMPT_FIXTURE_CASES.length > 0, 'no pinned fixture exists, so this census measures nothing');
  assert.deepEqual(
    offenders,
    [],
    `these composed backtick spans interpolate a classed value without shell quoting, so correctness depends on the character class the contract admits rather than on quoting:\n${offenders.join('\n')}`,
  );
});

test('composeReviewPrompt renders the edit pathspec list in exactly one spelling', () => {
  const reviewCases = PROMPT_FIXTURE_CASES.filter((fixture) => fixture.kind === 'review');
  assert.ok(reviewCases.length > 0, 'no pinned review fixture exists, so the two spellings cannot be compared');
  for (const fixture of reviewCases) {
    const edit = [...fixture.input.fileScope.edit];
    const composed = composePrompt('review', fixture.input);
    assert.equal(
      composed.includes(JSON.stringify(edit)),
      false,
      'the review prompt still carries the JSON spelling of the edit list beside a shell spelling of the same list',
    );
    assert.ok(
      composed.includes(edit.map((path) => "'" + path + "'").join(' ')),
      'the review prompt does not render the edit list in the single shell-quoted spelling',
    );
  }
});

test('scopedCheckCmd arrives as an argv array and every element is rendered quoted', () => {
  const ARGV = Object.freeze(['npm', 'run', 'fx check']);
  const argvCases = PROMPT_FIXTURE_CASES.filter(declaresScopedCheckCmd);
  assert.ok(argvCases.length > 0, 'no pinned fixture declares scopedCheckCmd, so the argv form is asserted over nothing');
  for (const fixture of argvCases) {
    const composed = composePrompt(fixture.kind, { ...fixture.input, scopedCheckCmd: ARGV });
    assert.ok(composed.includes("'npm' 'run' 'fx check'"), 'the argv form is not rendered as quoted elements');
    assert.equal(
      composed.includes('npm run fx check'),
      false,
      'an argv array is still being pasted as an unquoted command string',
    );
  }
});

test('a bare scopedCheckCmd string is refused rather than pasted into the prompt verbatim', () => {
  const argvCases = PROMPT_FIXTURE_CASES.filter(declaresScopedCheckCmd);
  assert.ok(argvCases.length > 0, 'no pinned fixture declares scopedCheckCmd, so the argv form is asserted over nothing');
  for (const fixture of argvCases) {
    assert.throws(
      () => composePrompt(fixture.kind, { ...fixture.input, scopedCheckCmd: 'npm run fx-check' }),
      TypeError,
      'a shell command string is still accepted where an argv array is required',
    );
  }
});

test('an empty declared file scope renders an explicit sentinel rather than nothing', () => {
  const scopedCases = PROMPT_FIXTURE_CASES.filter((fixture) => PROMPT_INPUT_SPECS[fixture.kind].some((entry) => entry.type === 'fileScope'));
  assert.ok(scopedCases.length > 0, 'no pinned fixture declares a fileScope, so this census measures nothing');
  let asserted = 0;
  for (const fixture of scopedCases) {
    const edit = [...fixture.input.fileScope.edit];
    if (edit.length === 0) continue;
    const declared = composePrompt(fixture.kind, fixture.input);
    if (!declared.includes(edit.map((path) => "'" + path + "'").join(' '))) continue;
    const emptied = composePrompt(fixture.kind, { ...fixture.input, fileScope: { edit: [], read: [], truncated: null } });
    assert.ok(emptied.includes('(none declared)'), `${fixture.id} declares its edit fence when the list is non-empty but renders empty text when it is empty, so the receiving model reads an unconstrained fence instead of an explicit empty set`);
    asserted += 1;
  }
  assert.ok(asserted > 0, 'no pinned fixture both declares its edit list and could be emptied, so the sentinel is asserted over nothing');
});

test('shellQuote refuses a value it cannot render as one prompt line', () => {
  assert.equal(shellQuote("a'b"), "'a'\\''b'");
  assert.equal(shellQuote('plain'), "'plain'");
  assert.throws(() => shellQuote('a\nb'), TypeError);
  assert.throws(() => shellQuote('a\rb'), TypeError);
  assert.throws(() => shellQuote(`a${String.fromCharCode(0)}b`), TypeError);
  assert.throws(() => shellQuote(42), TypeError);
});

test('requirePromptArgv validates every index, including an array hole', () => {
  assert.throws(() => requirePromptArgv(new Array(3), 'scopedCheckCmd'), TypeError);
  assert.throws(() => requirePromptArgv([], 'scopedCheckCmd'), TypeError);
  assert.deepEqual([...requirePromptArgv(['npm', 'test'], 'scopedCheckCmd')], ['npm', 'test']);
});

test('the writing-plans glob pattern is rendered unquoted and outside any backtick span', () => {
  const planCases = PROMPT_FIXTURE_CASES.filter((fixture) => fixture.kind === 'plan');
  assert.ok(planCases.length > 0, 'no pinned plan fixture exists, so the glob rendering is asserted over nothing');
  for (const fixture of planCases) {
    const glob = fixture.input.writingPlansGlob;
    const composed = composePrompt('plan', fixture.input);
    assert.ok(composed.includes(glob), 'the writing-plans glob pattern is not rendered at all');
    assert.equal(
      backtickSpans(composed).some((span) => span.includes(glob)),
      false,
      'the writing-plans glob pattern sits inside a backtick span, where quoting it would defeat the matching this line exists to perform',
    );
    assert.equal(
      composed.includes(`'${glob}'`),
      false,
      'the writing-plans glob pattern is shell-quoted, which makes it match nothing',
    );
  }
});
