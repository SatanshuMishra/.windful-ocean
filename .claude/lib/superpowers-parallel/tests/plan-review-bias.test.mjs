import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  concreteFindings,
  resolvePlanReview,
  planReviewModelFor,
  planGroundTruthSeed,
  guardModelDecision,
  BLAST_RADIUS_K,
} from '../run-engine.mjs';

const TRIVIAL_MSP = {
  id: 'm1',
  title: 'add slugify helper',
  rationale: 'introduce a pure slugify helper in one file',
  fileScope: ['src/slugify.mjs'],
  dependentCount: 0,
  risk: 'low',
};
const msp = (over) => ({ ...TRIVIAL_MSP, ...over });

const namedFinding = { axis: 'over-scope', severity: 'high', detail: 'plan edits src/auth outside declared scope' };

test('concreteFindings keeps only findings with a named axis AND a non-blank detail', () => {
  assert.deepEqual(concreteFindings({ findings: [namedFinding] }), [namedFinding]);
  assert.deepEqual(concreteFindings({ findings: [{ axis: 'necessity', severity: 'low', detail: '   ' }] }), []);
  assert.deepEqual(concreteFindings({ findings: [{ axis: '', severity: 'low', detail: 'x' }] }), []);
  assert.deepEqual(concreteFindings({ findings: [] }), []);
  assert.deepEqual(concreteFindings(null), []);
  assert.deepEqual(concreteFindings({}), []);
});

test('BIAS FLIP: a real named defect on a needs-changes verdict triggers replan and carries the concrete findings', () => {
  const r = resolvePlanReview({ verdict: 'needs-changes', findings: [namedFinding] }, { reReviewed: false });
  assert.equal(r.decision, 'replan');
  assert.deepEqual(r.findings, [namedFinding]);
});

test('STRUCTURAL PRECONDITION: needs-changes with NO concrete finding never replans and never silently approves on the first pass', () => {
  const first = resolvePlanReview({ verdict: 'needs-changes', findings: [] }, { reReviewed: false });
  assert.equal(first.decision, 're-review');
  assert.notEqual(first.decision, 'approve');
  assert.notEqual(first.decision, 'replan');
});

test('STRUCTURAL PRECONDITION: needs-changes whose only findings are blank-detail is treated as empty (re-review, not replan)', () => {
  const r = resolvePlanReview({ verdict: 'needs-changes', findings: [{ axis: 'necessity', severity: 'low', detail: '' }] }, { reReviewed: false });
  assert.equal(r.decision, 're-review');
});

test('FAIL-CLOSED: an empty-findings non-approval resolves approve-THEN-re-review-once (approve only after the re-review pass)', () => {
  assert.equal(resolvePlanReview({ verdict: 'needs-changes', findings: [] }, { reReviewed: false }).decision, 're-review');
  assert.equal(resolvePlanReview({ verdict: 'needs-changes', findings: [] }, { reReviewed: true }).decision, 'approve');
});

test('FAIL-CLOSED: an unparseable verdict is never a silent approve and never a replan — it re-reviews once, then approves', () => {
  for (const bad of [null, undefined, {}, { verdict: 'maybe' }, { verdict: 'needs-changes' }]) {
    const first = resolvePlanReview(bad, { reReviewed: false });
    assert.equal(first.decision, 're-review', `first pass on ${JSON.stringify(bad)}`);
    const second = resolvePlanReview(bad, { reReviewed: true });
    assert.equal(second.decision, 'approve', `re-review pass on ${JSON.stringify(bad)}`);
  }
});

test('an unparseable verdict that happens to carry findings still re-reviews (replan needs a real needs-changes verdict)', () => {
  const r = resolvePlanReview({ verdict: 'maybe', findings: [namedFinding] }, { reReviewed: false });
  assert.equal(r.decision, 're-review');
});

test('an explicit approve is honored immediately', () => {
  assert.equal(resolvePlanReview({ verdict: 'approve', findings: [] }, { reReviewed: false }).decision, 'approve');
});

test('RISK-SCALE: a trivial low-blast single-file non-sensitive MSP plan review runs on Sonnet', () => {
  assert.equal(planReviewModelFor(msp()), 'sonnet');
});

test('RISK-SCALE: a multi-file MSP escalates plan review to Opus', () => {
  assert.equal(planReviewModelFor(msp({ fileScope: ['src/a.mjs', 'src/b.mjs'] })), 'opus');
});

test('RISK-SCALE: a single-but-coarse directory-glob scope is not a trivial single file — it escalates to Opus', () => {
  assert.equal(planReviewModelFor(msp({ fileScope: ['src/widgets/**'] })), 'opus');
  assert.equal(planReviewModelFor(msp({ fileScope: ['src/widgets'] })), 'opus');
});

test('RISK-SCALE: a sensitive-scope single-file MSP escalates plan review to Opus', () => {
  assert.equal(planReviewModelFor(msp({ fileScope: ['src/auth/login.mjs'] })), 'opus');
  assert.equal(planReviewModelFor(msp({ fileScope: ['db/migrations/001.sql'] })), 'opus');
});

test('RISK-SCALE: a high-blast MSP (dependents at or above the blast threshold) escalates plan review to Opus', () => {
  assert.equal(planReviewModelFor(msp({ dependentCount: BLAST_RADIUS_K })), 'opus');
});

test('RISK-SCALE: fail-closed to Opus on unknown blast, high declared risk, or malformed scope', () => {
  assert.equal(planReviewModelFor(msp({ dependentCount: undefined })), 'opus');
  assert.equal(planReviewModelFor(msp({ risk: 'high' })), 'opus');
  assert.equal(planReviewModelFor(msp({ fileScope: [] })), 'opus');
  assert.equal(planReviewModelFor(msp({ fileScope: ['ok.mjs', 42] })), 'opus');
  assert.equal(planReviewModelFor(null), 'opus');
});

test('guardModelDecision plan-review kind resolves the risk-scaled model and rejects a drifting attempt', () => {
  const trivial = guardModelDecision('plan-review', msp(), null);
  assert.equal(trivial.ok, true);
  assert.equal(trivial.model, 'sonnet');

  const sensitive = guardModelDecision('plan-review', msp({ fileScope: ['src/auth/login.mjs'] }), null);
  assert.equal(sensitive.ok, true);
  assert.equal(sensitive.model, 'opus');

  const drift = guardModelDecision('plan-review', msp({ fileScope: ['src/auth/login.mjs'] }), 'sonnet');
  assert.equal(drift.ok, false);
});

test('GROUND TRUTH SEED: the planner seed carries the spec path, the MSP fileScope, the sibling fence, and re-decompose escape as a verify hint', () => {
  const seed = planGroundTruthSeed({ specPath: '/repo/docs/spec.md', fileScope: ['src/slugify.mjs', 'tests/slugify.test.mjs'], unitId: 'm1' });
  assert.match(seed, /\/repo\/docs\/spec\.md/);
  assert.match(seed, /src\/slugify\.mjs/);
  assert.match(seed, /tests\/slugify\.test\.mjs/);
  assert.match(seed, /hint/i);
  assert.match(seed, /verify/i);
  assert.match(seed, /trust boundary/i);
  assert.match(seed, /sibling|do NOT expand|outside/i);
  assert.match(seed, /re-decompos/i);
});
