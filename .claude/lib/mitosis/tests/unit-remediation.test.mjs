import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DIAGNOSIS_SCHEMA,
  IMPLEMENT_STAGE,
  diagnoseRequest,
  planRemediatedAttempt,
  readDiagnosis,
  redispatchRequest,
  remediationDeps,
  requireRemediationInput,
} from '../unit-remediation.mjs';

const INPUT = Object.freeze({
  unitId: 'beta',
  stage: IMPLEMENT_STAGE,
  task: 'add the ship phase',
  evidence: Object.freeze({ outcome: 'exit-nonzero', error: 'child exited 7' }),
  attempt: 1,
});

const BASE = Object.freeze({
  prompt: 'the implement prompt',
  schema: Object.freeze({ type: 'object', required: Object.freeze(['sha']) }),
  timeoutMs: 1800000,
  agentType: 'implementer',
  model: 'claude-opus-5',
  effort: 'high',
});

test('DIAGNOSE REQUEST: the diagnosis schema the child is handed is exactly the closed verdict object', () => {
  assert.deepStrictEqual(diagnoseRequest(INPUT, BASE).schema, {
    type: 'object',
    required: ['verdict'],
    additionalProperties: false,
    properties: {
      verdict: { type: 'string', enum: ['remediable', 'needs-human'] },
      mechanism: { type: 'string' },
      correctedTask: { type: 'string' },
      diagnosis: { type: 'string' },
    },
  });
  assert.deepStrictEqual(diagnoseRequest(INPUT, BASE).schema, DIAGNOSIS_SCHEMA);
});

test('DIAGNOSE REQUEST: the request carries the composed prompt, the diagnosis schema and exactly the four inherited dispatch fields', () => {
  const request = diagnoseRequest(INPUT, BASE);
  assert.deepStrictEqual(Object.keys(request).sort(), ['agentType', 'effort', 'model', 'prompt', 'schema', 'timeoutMs']);
  assert.equal(request.timeoutMs, 1800000);
  assert.equal(request.agentType, 'implementer');
  assert.equal(request.model, 'claude-opus-5');
  assert.equal(request.effort, 'high');
  assert.notEqual(request.prompt, BASE.prompt);
  assert.equal(request.prompt.includes('Original objective for this stage: add the ship phase'), true);
  assert.equal(request.prompt.includes('Mechanisms already tried and excluded (do NOT repeat any of these): (none)'), true);
  assert.deepStrictEqual(Object.keys(diagnoseRequest(INPUT, undefined)).sort(), ['prompt', 'schema']);
});

test('DIAGNOSE REQUEST: the tried set the caller supplies reaches the prompt, and only real fingerprints reach it', () => {
  const supplied = diagnoseRequest({ ...INPUT, triedSet: ['worktree:reset-clean', 'dependency:pin'] }, undefined);
  assert.equal(
    supplied.prompt.includes('Mechanisms already tried and excluded (do NOT repeat any of these): worktree:reset-clean, dependency:pin'),
    true,
    'the diagnostician excludes only what it is told was spent, so a request that pins the tried set empty asks it to re-propose the mechanism that just failed',
  );
  assert.equal(
    diagnoseRequest({ ...INPUT, triedSet: new Set(['worktree:reset-clean']) }, undefined).prompt.includes('Mechanisms already tried and excluded (do NOT repeat any of these): worktree:reset-clean'),
    true,
    'the supervisor carries its tried set as a Set, and it must render the same as the array form rather than as no exclusions at all',
  );
  assert.equal(
    diagnoseRequest({ ...INPUT, triedSet: ['worktree:reset-clean', '', 7] }, undefined).prompt.includes('Mechanisms already tried and excluded (do NOT repeat any of these): worktree:reset-clean'),
    true,
  );
  assert.equal(diagnoseRequest({ ...INPUT, triedSet: 'worktree:reset-clean' }, undefined).prompt.includes('(do NOT repeat any of these): (none)'), true);
  assert.equal(
    diagnoseRequest({ ...INPUT, triedSet: ['worktree:reset-clean'], rejectedMechanism: 'dependency:pin' }, undefined).prompt.includes('Mechanisms already tried and excluded (do NOT repeat any of these): worktree:reset-clean, dependency:pin'),
    true,
    'a mechanism the diagnostician proposed and had rejected within this cycle is excluded alongside the recorded set, or it is proposed a second time',
  );
});

test('DIAGNOSE REQUEST: a non-record evidence value reaches the prompt named by what it is rather than dropped', () => {
  assert.equal(diagnoseRequest({ ...INPUT, evidence: null }, undefined).prompt.includes('Failure evidence: {"detail":"null"}'), true);
  assert.equal(diagnoseRequest({ ...INPUT, evidence: undefined }, undefined).prompt.includes('Failure evidence: {"detail":"undefined"}'), true);
  assert.equal(diagnoseRequest({ ...INPUT, evidence: [1] }, undefined).prompt.includes('Failure evidence: {"detail":"an array"}'), true);
  assert.equal(diagnoseRequest({ ...INPUT, evidence: 7 }, undefined).prompt.includes('Failure evidence: {"detail":"number"}'), true);
});

test('REMEDIATION INPUT: a non-record input and an unusable task are each refused by the exact value received', () => {
  assert.throws(() => requireRemediationInput(null), {
    name: 'TypeError',
    message: 'unit-remediation: the remediation input must be a non-null, non-array object, received null',
  });
  assert.throws(() => requireRemediationInput(undefined), {
    name: 'TypeError',
    message: 'unit-remediation: the remediation input must be a non-null, non-array object, received undefined',
  });
  assert.throws(() => requireRemediationInput([INPUT]), {
    name: 'TypeError',
    message: 'unit-remediation: the remediation input must be a non-null, non-array object, received an array',
  });
  assert.throws(() => requireRemediationInput(9), {
    name: 'TypeError',
    message: 'unit-remediation: the remediation input must be a non-null, non-array object, received number',
  });
  assert.throws(() => requireRemediationInput({ unitId: 'beta', task: 42 }), {
    name: 'TypeError',
    message: 'unit-remediation: unit "beta" carries no task text to remediate against, received number; the diagnosis prompt names the objective the failed attempt was pursuing, and an empty one asks the diagnostician to correct an approach to nothing',
  });
  assert.throws(() => requireRemediationInput({ unitId: 'beta', task: '   ' }), {
    name: 'TypeError',
    message: 'unit-remediation: unit "beta" carries no task text to remediate against, received string; the diagnosis prompt names the objective the failed attempt was pursuing, and an empty one asks the diagnostician to correct an approach to nothing',
  });
  assert.equal(requireRemediationInput(INPUT), INPUT);
});

test('READ DIAGNOSIS: a remediable verdict yields the mechanism, the corrected task and the envelope', () => {
  assert.deepStrictEqual(
    readDiagnosis({
      ok: true,
      envelope: { totalCostUsd: 2 },
      structured: { verdict: 'remediable', mechanism: 'worktree:reset-clean', correctedTask: 'reset first' },
    }),
    { ok: true, mechanism: 'worktree:reset-clean', correctedTask: 'reset first', envelope: { totalCostUsd: 2 } },
  );
});

test('READ DIAGNOSIS: a blank or absent corrected task falls back to null rather than an empty directive', () => {
  const withBlank = readDiagnosis({ ok: true, structured: { verdict: 'remediable', mechanism: 'a:b', correctedTask: '  ' } });
  assert.equal(withBlank.correctedTask, null);
  const withNone = readDiagnosis({ ok: true, structured: { verdict: 'remediable', mechanism: 'a:b' } });
  assert.equal(withNone.correctedTask, null);
  assert.equal(withNone.envelope, null);
});

test('READ DIAGNOSIS: every unusable verdict refuses under its own name and carries the envelope through', () => {
  const whatOf = (verdict) => {
    const refusal = readDiagnosis(verdict);
    assert.equal(refusal.ok, false);
    assert.equal(refusal.kind, 'diagnose');
    return refusal.what;
  };
  assert.equal(whatOf(null), 'diagnose-dispatch-failed');
  assert.equal(whatOf({ ok: false, outcome: 'exit-nonzero', error: 'boom' }), 'diagnose-dispatch-failed');
  assert.equal(whatOf({ ok: true, structured: null }), 'diagnosis-missing');
  assert.equal(whatOf({ ok: true, structured: { verdict: 'needs-human' } }), 'diagnosis-needs-human');
  assert.equal(whatOf({ ok: true, structured: { verdict: 'maybe' } }), 'diagnosis-unreadable');
  assert.equal(whatOf({ ok: true, structured: { verdict: 'remediable', mechanism: 'no-colon' } }), 'diagnosis-mechanism-unreadable');
  assert.deepStrictEqual(readDiagnosis({ ok: true, envelope: { totalCostUsd: 3 }, structured: null }).envelope, { totalCostUsd: 3 });
  assert.equal(readDiagnosis({ ok: false }).envelope, null);
  assert.equal(readDiagnosis(null).envelope, null);
  assert.equal(
    readDiagnosis(null).detail,
    'the diagnose child returned no verdict at all: no verdict',
  );
  assert.equal(
    readDiagnosis({ ok: false, outcome: 'exit-nonzero', error: 'boom' }).detail,
    'the diagnose child returned "exit-nonzero": boom',
  );
});

test('READ DIAGNOSIS: a dispatch failure carrying the child\'s own words and an HTTP status appends both to the composed detail, on top of the existing wording', () => {
  const refusal = readDiagnosis({
    ok: false,
    outcome: 'exit-nonzero',
    error: 'boom',
    result: 'billing hit its monthly spend cap',
    envelope: { api_error_status: 429 },
  });
  assert.equal(refusal.what, 'diagnose-dispatch-failed');
  assert.equal(refusal.detail.startsWith('the diagnose child returned "exit-nonzero": boom'), true);
  assert.equal(refusal.detail.includes('HTTP 429'), true);
  assert.equal(refusal.detail.includes('billing hit its monthly spend cap'), true);
  assert.deepStrictEqual(refusal.envelope, { api_error_status: 429 });
});

test('REDISPATCH REQUEST: the corrected re-attempt inherits the base schema and names the backoff for its attempt', () => {
  const request = redispatchRequest(INPUT, { mechanism: 'worktree:reset-clean', correctedTask: 'reset first' }, BASE);
  assert.deepStrictEqual(Object.keys(request).sort(), ['agentType', 'effort', 'model', 'prompt', 'schema', 'timeoutMs']);
  assert.deepStrictEqual(request.schema, { type: 'object', required: ['sha'] });
  assert.equal(request.prompt.includes('correction attempt 1'), true);
  assert.equal(request.prompt.includes('Diagnosed mechanism fingerprint: worktree:reset-clean'), true);
  assert.equal(request.prompt.includes('sleep 5'), true);
  assert.equal(request.prompt.includes('reset first'), true);

  const second = redispatchRequest({ ...INPUT, attempt: 2 }, { mechanism: 'a:b', correctedTask: null }, BASE);
  assert.equal(second.prompt.includes('sleep 10'), true);
  assert.equal(second.prompt.includes('correction attempt 2'), true);

  const withoutSchema = redispatchRequest(INPUT, { mechanism: 'a:b', correctedTask: null }, { timeoutMs: 5 });
  assert.deepStrictEqual(Object.keys(withoutSchema).sort(), ['prompt', 'timeoutMs']);
});

test('PLAN REMEDIATED ATTEMPT: a remediable diagnosis produces the corrected request, and a refusal is returned unchanged', async () => {
  const seen = [];
  const dispatch = async (request) => {
    seen.push(request.schema);
    return { ok: true, envelope: { totalCostUsd: 1 }, structured: { verdict: 'remediable', mechanism: 'worktree:reset-clean', correctedTask: 'reset first' } };
  };
  const planned = await planRemediatedAttempt(INPUT, BASE, dispatch);
  assert.equal(planned.ok, true);
  assert.equal(seen.length, 1);
  assert.deepStrictEqual(seen[0], DIAGNOSIS_SCHEMA);
  assert.deepStrictEqual(planned.envelope, { totalCostUsd: 1 });
  assert.equal(planned.request.prompt.includes('Diagnosed mechanism fingerprint: worktree:reset-clean'), true);

  const refused = await planRemediatedAttempt(INPUT, BASE, async () => ({ ok: true, structured: { verdict: 'needs-human' } }));
  assert.equal(refused.ok, false);
  assert.equal(refused.what, 'diagnosis-needs-human');
  assert.equal(refused.kind, 'diagnose');

  await assert.rejects(planRemediatedAttempt({ ...INPUT, task: '' }, BASE, dispatch), {
    name: 'TypeError',
    message: 'unit-remediation: unit "beta" carries no task text to remediate against, received string; the diagnosis prompt names the objective the failed attempt was pursuing, and an empty one asks the diagnostician to correct an approach to nothing',
  });
});

test('REMEDIATION DEPS: the diagnosis carries the tried set the loop probed with, and an unreadable verdict escalates rather than proposing nothing', async () => {
  const seen = [];
  const deps = remediationDeps(INPUT, BASE, async (request) => {
    seen.push(request.prompt);
    return { ok: true, structured: { verdict: 'remediable', mechanism: 'worktree:reset-clean', correctedTask: 'reset first' } };
  });
  assert.deepStrictEqual(
    await deps.diagnose({ evidence: { cause: { mechanism: null, diagnosis: 'died dirty' } }, triedSet: ['dependency:pin'], task: INPUT.task, stage: INPUT.stage }),
    { mechanism: 'worktree:reset-clean', correctedTask: 'reset first' },
  );
  assert.equal(seen.length, 1);
  assert.equal(seen[0].includes('Mechanisms already tried and excluded (do NOT repeat any of these): dependency:pin'), true);
  assert.equal(seen[0].includes('Failure evidence: {"mechanism":null,"diagnosis":"died dirty"}'), true);

  const refusing = remediationDeps(INPUT, BASE, async () => ({ ok: true, structured: null }));
  const escalated = await refusing.diagnose({ evidence: {}, triedSet: [], task: INPUT.task, stage: INPUT.stage });
  assert.equal(escalated.verdict, 'needs-human', 'a diagnosis the loop cannot read is escalated, never returned as a proposal carrying no mechanism');
  assert.equal(escalated.request.kind, 'diagnose');
  assert.equal(escalated.request.what, 'diagnosis-missing');
});

test('REMEDIATION DEPS: each corrected re-attempt is numbered and its answer is classified as a boundary outcome', async () => {
  const seen = [];
  const answers = [{ fault: { kind: 'approach-fixable', mechanism: 'a:b', diagnosis: 'still dirty' } }, { sha: 'abc' }];
  const deps = remediationDeps(INPUT, BASE, async (request) => {
    seen.push(request.prompt);
    return answers[seen.length - 1];
  });
  assert.deepStrictEqual(await deps.redispatch({ mechanism: 'worktree:reset-clean', correctedTask: 'reset first' }), {
    tag: 'ApproachFixable',
    cause: { mechanism: 'a:b', diagnosis: 'still dirty', evidence: answers[0] },
  });
  assert.deepStrictEqual(await deps.redispatch({ mechanism: 'dependency:pin', correctedTask: null }), { tag: 'Done', value: answers[1] });
  assert.equal(seen[0].includes('correction attempt 1'), true);
  assert.equal(seen[0].includes('sleep 5'), true);
  assert.equal(seen[1].includes('correction attempt 2'), true);
  assert.equal(seen[1].includes('sleep 10'), true, 'the backoff grows with the attempt, so a re-attempt numbered from a counter that never advances would retry a rate limit immediately');
});

test('REMEDIATION DEPS: an adapter with no dispatch function and an input with no task are each refused by what they were handed', () => {
  assert.throws(() => remediationDeps(INPUT, BASE, null), {
    name: 'TypeError',
    message: 'unit-remediation: the remediation adapter needs a dispatchPrompt function, because every diagnosis and every corrected re-attempt is a child this module composes and never runs itself, received null',
  });
  assert.throws(() => remediationDeps({ ...INPUT, task: '' }, BASE, async () => ({})), {
    name: 'TypeError',
    message: 'unit-remediation: unit "beta" carries no task text to remediate against, received string; the diagnosis prompt names the objective the failed attempt was pursuing, and an empty one asks the diagnostician to correct an approach to nothing',
  });
});
