import assert from 'node:assert/strict';
import test from 'node:test';
import { composePrompt } from '../prompt-registry.mjs';
import {
  JUDGMENT_KINDS,
  JUDGMENT_VERDICT_SCHEMA,
  composeJudgmentPrompt,
  judgmentKindsFor,
  judgmentRequest,
  readJudgment,
  readJudgmentVerdict,
  runJudgment,
} from '../unit-judgment.mjs';
import {
  CLAUDE_BEHAVIOURS,
  claudeArgvs,
  claudeArgvsFor,
  planRun,
  readJournal,
  runMitosisCli,
  withSandbox,
} from './e2e-substrate.mjs';

const PROMPT_EXCERPT_CHARS = 200;

const TWO_UNITS = Object.freeze([
  Object.freeze({
    id: 'alpha',
    behaviour: CLAUDE_BEHAVIOURS.succeed,
    judgment: Object.freeze({ securityReviewRequired: false }),
  }),
  Object.freeze({
    id: 'beta',
    behaviour: CLAUDE_BEHAVIOURS.succeed,
    judgment: Object.freeze({ securityReviewRequired: true }),
  }),
]);

function composableKinds(document) {
  const byPrompt = new Map();
  for (const spec of document.specs) {
    byPrompt.set(spec.request.prompt, 'implement');
    if (spec.judgment === undefined) continue;
    const input = { ...spec.judgment, launchCommit: null };
    byPrompt.set(composePrompt('review', input), 'review');
    if (spec.judgment.securityReviewRequired) byPrompt.set(composePrompt('security', input), 'security');
  }
  return byPrompt;
}

function classify(argvs, document) {
  const byPrompt = composableKinds(document);
  return argvs.map((argv) => {
    const prompt = argv[argv.length - 1];
    const kind = byPrompt.get(prompt);
    if (kind === undefined) {
      throw new Error(`judgment-dispatch: a dispatch carried a prompt that no declared kind composes from this document, so the census cannot classify it rather than guessing: ${JSON.stringify(String(prompt).slice(0, PROMPT_EXCERPT_CHARS))}`);
    }
    return kind;
  });
}

function countKinds(kinds) {
  const counts = {};
  for (const kind of kinds) counts[kind] = (counts[kind] === undefined ? 0 : counts[kind]) + 1;
  return counts;
}

test('a real run judges every unit with a review composed at dispatch and adds the security lens only where the unit declares it', () => {
  withSandbox({}, (sandbox) => {
    const plan = planRun(sandbox, TWO_UNITS);
    const run = runMitosisCli(sandbox);
    assert.equal(run.status, 0, run.stderr);
    const kinds = classify(claudeArgvs(sandbox), plan.document);
    assert.equal(kinds.length, 5);
    assert.deepEqual(countKinds(kinds), { implement: 2, review: 2, security: 1 });
    assert.deepEqual(kinds.filter((kind) => kind !== 'implement').sort(), ['review', 'review', 'security']);
    assert.deepEqual(run.summary.units, [{ id: 'alpha', state: 'done' }, { id: 'beta', state: 'done' }]);
  });
});

test('the judged unit runs implement, then review, then security, in that order', () => {
  withSandbox({}, (sandbox) => {
    const plan = planRun(sandbox, TWO_UNITS);
    const run = runMitosisCli(sandbox);
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(classify(claudeArgvsFor(sandbox, 'beta'), plan.document), ['implement', 'review', 'security']);
    assert.deepEqual(classify(claudeArgvsFor(sandbox, 'alpha'), plan.document), ['implement', 'review']);
  });
});

test('a failing review parks the unit and the security lens it declared never runs', () => {
  withSandbox({}, (sandbox) => {
    const plan = planRun(sandbox, [{
      id: 'alpha',
      behaviour: CLAUDE_BEHAVIOURS.succeed,
      judgment: { securityReviewRequired: true, reviewVerdict: 'fail' },
    }]);
    const run = runMitosisCli(sandbox);
    assert.equal(run.status, 3, run.stderr);
    assert.deepEqual(run.summary.units, [{ id: 'alpha', state: 'parked' }]);
    assert.deepEqual(classify(claudeArgvsFor(sandbox, 'alpha'), plan.document), ['implement', 'review']);
    const parks = readJournal(sandbox).filter((record) => record.kind === 'park');
    assert.equal(parks.length, 1);
    assert.deepEqual(
      { what: parks[0].request.what, issues: parks[0].request.issues, triedSet: parks[0].triedSet },
      { what: 'review-failed', issues: ['fixture review issue for unit alpha'], triedSet: [] },
    );
  });
});

test('a failing security lens parks the unit the review had already passed', () => {
  withSandbox({}, (sandbox) => {
    const plan = planRun(sandbox, [{
      id: 'alpha',
      behaviour: CLAUDE_BEHAVIOURS.succeed,
      judgment: { securityReviewRequired: true, securityVerdict: 'fail' },
    }]);
    const run = runMitosisCli(sandbox);
    assert.equal(run.status, 3, run.stderr);
    assert.deepEqual(run.summary.units, [{ id: 'alpha', state: 'parked' }]);
    assert.deepEqual(classify(claudeArgvsFor(sandbox, 'alpha'), plan.document), ['implement', 'review', 'security']);
  });
});

test('a unit that declares no judgment is dispatched once and faces no judgment stage', () => {
  withSandbox({}, (sandbox) => {
    const plan = planRun(sandbox, [{ id: 'alpha', behaviour: CLAUDE_BEHAVIOURS.succeed }]);
    const run = runMitosisCli(sandbox);
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(classify(claudeArgvs(sandbox), plan.document), ['implement']);
  });
});

const JUDGMENT_FACTS = Object.freeze({
  specReviewerPreamble: 'spec reviewer preamble',
  qualityReviewerPreamble: 'quality reviewer preamble',
  repoRoot: '/repo',
  baseBranch: 'main',
  branch: 'mitosis/alpha',
  taskId: 'alpha',
  taskTitle: 'unit alpha',
  taskFullText: 'build the thing',
  isolation: 'worktree',
  fileScope: Object.freeze({ edit: Object.freeze(['alpha.txt']), read: Object.freeze([]), truncated: null }),
  securityReviewRequired: false,
});

function factsWith(overrides) {
  return Object.freeze({ ...JUDGMENT_FACTS, ...overrides });
}

test('the declared kinds are exactly review, and exactly review then security when the unit requires the lens', () => {
  assert.deepEqual(JUDGMENT_KINDS, ['review', 'security']);
  assert.deepEqual(judgmentKindsFor(JUDGMENT_FACTS), ['review']);
  assert.deepEqual(judgmentKindsFor(factsWith({ securityReviewRequired: true })), ['review', 'security']);
});

test('a judgment record that does not say whether the security lens is required is refused rather than defaulted', () => {
  assert.equal(readJudgment('alpha', undefined), null);
  assert.equal(readJudgment('alpha', null), null);
  assert.throws(() => readJudgment('alpha', { ...JUDGMENT_FACTS, securityReviewRequired: undefined }), /securityReviewRequired/);
  assert.throws(() => readJudgment('alpha', { ...JUDGMENT_FACTS, securityReviewRequired: 'yes' }), /securityReviewRequired/);
  assert.throws(() => readJudgment('alpha', ['not', 'a', 'record']), TypeError);
});

function refusalOf(value) {
  try {
    readJudgment('alpha', value);
  } catch (error) {
    return error.message;
  }
  throw new Error(`judgment-dispatch: reading ${JSON.stringify(value)} was expected to refuse and returned instead, so the refusal wording this test pins would never be reached`);
}

test('the refusal names the unreadable value by its own kind, so a number, an array and a null are never reported as each other', () => {
  assert.equal(refusalOf(5).includes('declares a judgment record that is number rather than an object'), true);
  assert.equal(refusalOf(['not', 'a', 'record']).includes('declares a judgment record that is an array rather than an object'), true);
  assert.equal(refusalOf({ ...JUDGMENT_FACTS, securityReviewRequired: null }).includes('securityReviewRequired boolean, received null;'), true);
  assert.equal(refusalOf({ ...JUDGMENT_FACTS, securityReviewRequired: undefined }).includes('securityReviewRequired boolean, received undefined;'), true);
});

test('the judgment prompt is the registry composition for its kind, and a scope-fence unit is refused rather than composed against no launch commit', () => {
  assert.equal(
    composeJudgmentPrompt('review', JUDGMENT_FACTS),
    composePrompt('review', { ...JUDGMENT_FACTS, launchCommit: null }),
  );
  assert.equal(
    composeJudgmentPrompt('security', factsWith({ securityReviewRequired: true })),
    composePrompt('security', { ...JUDGMENT_FACTS, securityReviewRequired: true, launchCommit: null }),
  );
  assert.throws(() => composeJudgmentPrompt('review', factsWith({ isolation: 'scope-fence' })), /launch commit/);
});

test('a judgment request carries the composed prompt, the verdict schema and the unit timeout, and nothing else', () => {
  const request = judgmentRequest('review', JUDGMENT_FACTS, { prompt: 'implement', timeoutMs: 1234 });
  assert.deepEqual(Object.keys(request).sort(), ['prompt', 'schema', 'timeoutMs']);
  assert.equal(request.prompt, composePrompt('review', { ...JUDGMENT_FACTS, launchCommit: null }));
  assert.equal(request.timeoutMs, 1234);
  assert.deepEqual(request.schema.required, ['verdict']);
  assert.deepEqual(request.schema.properties.verdict.enum, ['pass', 'fail']);
  assert.equal(request.schema, JUDGMENT_VERDICT_SCHEMA);
  assert.equal(JUDGMENT_VERDICT_SCHEMA.additionalProperties, false);
  assert.deepEqual(Object.keys(JUDGMENT_VERDICT_SCHEMA).sort(), ['additionalProperties', 'properties', 'required', 'type']);
  assert.deepEqual(Object.keys(judgmentRequest('review', JUDGMENT_FACTS, { prompt: 'implement' })).sort(), ['prompt', 'schema']);
});

const VERDICT_CASES = Object.freeze([
  Object.freeze({ id: 'pass', verdict: { ok: true, structured: { verdict: 'pass' } }, ok: true, what: null, issues: [] }),
  Object.freeze({ id: 'fail', verdict: { ok: true, structured: { verdict: 'fail', issues: ['a.txt:1 wrong', ' '] } }, ok: false, what: 'review-failed', issues: ['a.txt:1 wrong'] }),
  Object.freeze({ id: 'unreadable', verdict: { ok: true, structured: { verdict: 'maybe' } }, ok: false, what: 'review-verdict-unreadable', issues: [] }),
  Object.freeze({ id: 'missing', verdict: { ok: true, structured: null }, ok: false, what: 'review-verdict-missing', issues: [] }),
  Object.freeze({ id: 'dispatch-failed', verdict: { ok: false, outcome: 'timeout', error: 'the child outran its budget' }, ok: false, what: 'review-dispatch-failed', issues: [] }),
  Object.freeze({ id: 'no-verdict', verdict: null, ok: false, what: 'review-dispatch-failed', issues: [] }),
]);

for (const testCase of VERDICT_CASES) {
  test(`a ${testCase.id} review verdict reads as ${testCase.ok ? 'a pass' : testCase.what}`, () => {
    const read = readJudgmentVerdict('review', testCase.verdict);
    assert.equal(read.ok, testCase.ok);
    assert.equal(read.what, testCase.what);
    assert.deepEqual([...read.issues], testCase.issues);
  });
}

test('the first refused lens stops the sequence, so a failed review dispatches no security lens', async () => {
  const kinds = [];
  const judged = await runJudgment(
    factsWith({ securityReviewRequired: true }),
    (request) => {
      kinds.push(request.prompt.includes(composePrompt('security', { ...JUDGMENT_FACTS, securityReviewRequired: true, launchCommit: null })) ? 'security' : 'review');
      return { ok: true, structured: { verdict: 'fail', issues: ['a.txt:1 wrong'] } };
    },
    { prompt: 'implement' },
  );
  assert.deepEqual(kinds, ['review']);
  assert.equal(judged.ok, false);
  assert.equal(judged.kind, 'review');
  assert.deepEqual([...judged.issues], ['a.txt:1 wrong']);
});

test('both lenses run and report a pass when neither refuses', async () => {
  const prompts = [];
  const judged = await runJudgment(
    factsWith({ securityReviewRequired: true }),
    (request) => {
      prompts.push(request.prompt);
      return { ok: true, structured: { verdict: 'pass' } };
    },
    { prompt: 'implement' },
  );
  assert.deepEqual(prompts, [
    composePrompt('review', { ...JUDGMENT_FACTS, securityReviewRequired: true, launchCommit: null }),
    composePrompt('security', { ...JUDGMENT_FACTS, securityReviewRequired: true, launchCommit: null }),
  ]);
  assert.equal(judged.ok, true);
  assert.deepEqual([...judged.issues], []);
});
