import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CI_FACT_EXTRACT_DERIVED_FIELDS,
  CI_FACT_EXTRACT_KIND,
  CI_FACT_EXTRACT_REPORTED_FIELDS,
  composeCiFactExtractPrompt,
} from '../prompt-ci-facts.mjs';
import { CI_FACT_FIELDS, CI_MODEL_FIELDS } from '../ci-facts.mjs';
import { PROMPT_KINDS } from '../prompt-contract.mjs';
import { PROMPT_COMPOSERS } from '../prompt-registry.mjs';
import { classifyCiReport } from '../ci-escalation.mjs';

const SCOPE = Object.freeze(['src/**']);
const SHA = '4444444444444444444444444444444444444444';

const INPUT = Object.freeze({
  unitId: 'unit-a',
  repoRoot: '/repo',
  integrationBranch: 'mitosis/unit-a',
  ciConclusion: 'failure',
  failedChecks: Object.freeze(['unit']),
  declaredScope: SCOPE,
  logExcerpt: 'FAIL src/a.test.ts > adds two numbers',
});

function report(overrides) {
  return {
    ciConclusion: 'failure',
    failedChecks: ['unit'],
    conflictPaths: [],
    publishedHeadSha: SHA,
    implicatedPaths: ['src/a.ts'],
    failingAssertionFiles: ['src/a.test.ts'],
    receiptsPass: true,
    d6Pass: true,
    ...overrides,
  };
}

test('the kind is registered with the prompt authority and its composer table', () => {
  assert.ok(PROMPT_KINDS.includes(CI_FACT_EXTRACT_KIND), 'the authority does not name the kind, so no dispatch could compose it');
  assert.equal(PROMPT_COMPOSERS[CI_FACT_EXTRACT_KIND], composeCiFactExtractPrompt);
});

test('the two lists this body asks for are exactly the two the engine does not derive', () => {
  assert.deepEqual([...CI_FACT_EXTRACT_REPORTED_FIELDS], [...CI_MODEL_FIELDS]);
  assert.deepEqual([...CI_FACT_EXTRACT_DERIVED_FIELDS], [...CI_FACT_FIELDS]);
});

test('the composed body asks for only the two model-read fields and never for a derived one', () => {
  const composed = composeCiFactExtractPrompt(INPUT);
  const returnLine = composed.slice(composed.lastIndexOf('Return ONLY:'));
  for (const field of CI_MODEL_FIELDS) {
    assert.ok(returnLine.includes(field), `the return contract does not ask for ${field}`);
  }
  for (const field of CI_FACT_FIELDS) {
    assert.ok(!returnLine.includes(field), `the return contract asks for ${field}, which the engine derives; a second unverified spelling would sit beside a fact the engine already holds`);
  }
});

test('a well-formed extraction completes a report the escalation classifier accepts', () => {
  const verdict = classifyCiReport(report({}), SCOPE);
  assert.equal(verdict.escalate, false, JSON.stringify(verdict));
});

test('an empty extraction escalates rather than being read as nothing to fix', () => {
  for (const field of CI_MODEL_FIELDS) {
    const verdict = classifyCiReport(report({ [field]: [] }), SCOPE);
    assert.equal(verdict.escalate, true, `an empty ${field} did not escalate`);
    assert.equal(verdict.class, 0);
  }
});

test('substituting the changed-file list for an empty extraction is not what this body instructs', () => {
  const composed = composeCiFactExtractPrompt(INPUT);
  assert.match(composed, /return both empty/, 'the body no longer instructs an empty return, so an extraction that found nothing would be filled with something');
  assert.match(composed, /escalate/, 'the body no longer states that an empty extraction escalates, so the fail-safe direction is unstated');
  assert.ok(
    !/changed[- ]file/i.test(composed) && !/paths you changed/i.test(composed),
    'the body offers a changed-file list as a substitute for an extraction that found nothing; a proxy accepted here reaches an autonomous fix at a file the failure never named',
  );
});

test('the body is refused rather than composed when an input field is missing or malformed', () => {
  for (const field of Object.keys(INPUT)) {
    const { [field]: dropped, ...rest } = INPUT;
    assert.throws(() => composeCiFactExtractPrompt(rest), TypeError, `${field} was accepted as absent`);
  }
  assert.throws(() => composeCiFactExtractPrompt({ ...INPUT, failedChecks: 'unit' }), TypeError);
  assert.throws(() => composeCiFactExtractPrompt({ ...INPUT, integrationBranch: '--upload-pack=touch /tmp/pwn' }), TypeError);
});

test('a scope the classifier cannot confirm containment against escalates rather than composing a fix', () => {
  const verdict = classifyCiReport(report({}), []);
  assert.equal(verdict.escalate, true, 'an empty declared scope was accepted, so an extraction could not be held inside anything');
  assert.equal(verdict.class, 0);
});

test('two compositions from one frozen input produce the same bytes', () => {
  assert.equal(composeCiFactExtractPrompt(INPUT), composeCiFactExtractPrompt(INPUT));
});
