import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dispatch } from '../dispatch.mjs';
import { buildUnitTable } from '../leases.mjs';
import { requireFileScopePack } from '../msp-file-scope.mjs';
import { runGraph } from '../pool.mjs';
import { parseRunManifest } from '../recovery.mjs';
import { RunDocumentError, buildRunDocument } from '../run-document.mjs';
import { emitsEnvelope } from './dispatch-fixtures.mjs';

const MSPS = Object.freeze([
  {
    id: 'alpha-core',
    title: 'add the alpha core module',
    rationale: 'The alpha core module is the seam every later unit imports, so it lands before them.',
    changeType: 'feat',
    scope: 'alpha',
    securityReviewRequired: false,
    dependsOn: [],
    fileScope: { edit: ['src/alpha.mjs'], read: ['src/shared.mjs'], truncated: null },
  },
  {
    id: 'beta-wiring',
    title: 'wire beta onto the alpha core',
    rationale: 'Beta consumes the alpha core and cannot be written before that module exists.',
    changeType: 'feat',
    scope: 'beta',
    securityReviewRequired: true,
    dependsOn: ['alpha-core'],
    fileScope: {
      edit: ['src/beta.mjs'],
      read: ['src/alpha.mjs'],
      truncated: { dropped: 2, reason: 'read set capped by the decomposer' },
    },
  },
]);

const RUN = Object.freeze({
  logicalRunId: 'run-alpha-0001',
  harnessRunId: null,
  spec: 'docs/specs/alpha.md',
  repoRoot: '/repo/alpha',
  baseBranch: 'main',
  sourcePrefix: 'mitosis',
  clusters: [{ id: 'cluster-one', msps: ['alpha-core', 'beta-wiring'] }],
  specContentHash: 'deadbeef',
});

const PROMPT = Object.freeze({
  implementerPreamble: 'You own one unit end to end and return the commit sha you produced.',
  specReviewerPreamble: 'You review the unit against its spec and return a verdict.',
  qualityReviewerPreamble: 'You review the unit for code quality and return a verdict.',
  scopedCheckCmd: ['node', '--test', 'tests/alpha.test.mjs'],
  isolation: 'worktree',
  branchPrefix: 'mitosis',
  worktreeRoot: '/repo/alpha/.worktrees',
});

const DISPATCH = Object.freeze({
  agentType: 'implementer',
  model: 'opus',
  effort: 'high',
  timeoutMs: 900000,
  schema: { type: 'object', required: ['sha'], properties: { sha: { type: 'string' } } },
});

function inputWith(msps, overrides = {}) {
  return {
    decomposition: { msps },
    run: RUN,
    prompt: PROMPT,
    dispatch: DISPATCH,
    ...overrides,
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function build(msps = clone(MSPS), overrides = {}, deps = {}) {
  return buildRunDocument(inputWith(msps, overrides), deps);
}

function readyAfterOf(specs) {
  return Object.fromEntries(specs.map((unit) => [unit.id, [...unit.prereqs]]));
}

test('every emitted unit is accepted by the real buildUnitTable, which is the table the engine schedules', () => {
  const document = build();
  const units = buildUnitTable(document.specs);
  assert.deepEqual(units.map((unit) => unit.id), ['alpha-core', 'beta-wiring']);
  assert.deepEqual(units.map((unit) => [...unit.prereqs]), [[], ['alpha-core']]);
  assert.deepEqual(units.map((unit) => [...unit.fileScope.edit]), [['src/alpha.mjs'], ['src/beta.mjs']]);
});

test('every emitted fileScope is accepted by the real requireFileScopePack and is already canonical', () => {
  const document = build();
  for (const unit of document.specs) {
    const pack = requireFileScopePack(unit.fileScope, `unit ${unit.id} fileScope`);
    assert.deepEqual(clone(pack), clone(unit.fileScope));
  }
  assert.equal(document.specs[1].fileScope.truncated.dropped, 2);
});

test('every emitted id and prereq survives a real pool graph build and settles ok', async () => {
  const document = build();
  const seen = [];
  const outcome = await runGraph(
    { nodes: document.specs, readyAfter: readyAfterOf(document.specs) },
    (node) => {
      seen.push(node.id);
      return { ok: true, outcome: 'success' };
    },
  );
  assert.equal(outcome.ok, true, JSON.stringify(outcome.records));
  assert.deepEqual(outcome.records.map((record) => record.state), ['ok', 'ok']);
  assert.deepEqual(seen, ['alpha-core', 'beta-wiring']);
  assert.deepEqual(outcome.diagnostics.waves.map((wave) => [...wave]), [['alpha-core'], ['beta-wiring']]);
});

test('every emitted request is accepted by the real dispatch request validation', async () => {
  const document = build();
  for (const unit of document.specs) {
    const result = await dispatch(unit.request, { spawn: emitsEnvelope({ structured_output: { sha: 'c0ffee' } }) });
    assert.equal(result.ok, true, `unit ${unit.id}: ${result.outcome} ${result.error}`);
    assert.equal(result.structured.sha, 'c0ffee');
  }
});

test('the emitted request carries the caller dispatch defaults and never an abort signal', () => {
  const document = build();
  const request = document.specs[0].request;
  assert.deepEqual(Object.keys(request), ['prompt', 'agentType', 'model', 'effort', 'schema', 'timeoutMs']);
  assert.equal(request.agentType, 'implementer');
  assert.equal(request.timeoutMs, 900000);
  assert.equal(Object.hasOwn(request, 'signal'), false);
});

test('a dispatch default the composer does not emit is refused rather than silently dropped', () => {
  assert.throws(
    () => build(clone(MSPS), { dispatch: { ...DISPATCH, cwd: '/repo/alpha' } }),
    (error) => error instanceof RunDocumentError && /"cwd"/.test(error.message),
  );
});

test('a caller that omits every dispatch default gets a request carrying only the prompt', () => {
  const document = build(clone(MSPS), { dispatch: undefined });
  assert.deepEqual(Object.keys(document.specs[0].request), ['prompt']);
});

test('the emitted manifest is accepted by the real parseRunManifest', () => {
  const document = build();
  const parsed = parseRunManifest(JSON.stringify(document.manifest));
  assert.notEqual(parsed, null, 'parseRunManifest refused the manifest this composer emitted');
  assert.deepEqual(parsed, clone(document.manifest));
  assert.equal(parsed.logicalRunId, 'run-alpha-0001');
  assert.deepEqual(parsed.clusters, clone(RUN.clusters));
  assert.deepEqual(parsed.msps.map((msp) => msp.integrationBranch), ['mitosis/alpha-core-integration', 'mitosis/beta-wiring-integration']);
  assert.deepEqual(parsed.parked, []);
});

test('the dependsOn to prereqs rename is total: no emitted unit carries dependsOn and every prereq names an emitted unit', () => {
  const document = build();
  const ids = new Set(document.specs.map((unit) => unit.id));
  for (const unit of document.specs) {
    assert.equal(Object.hasOwn(unit, 'dependsOn'), false, `unit ${unit.id} still carries a dependsOn key`);
    assert.equal(Array.isArray(unit.prereqs), true, `unit ${unit.id} carries no prereqs array`);
    for (const prereq of unit.prereqs) {
      assert.equal(ids.has(prereq), true, `unit ${unit.id} names the prereq ${prereq}, which no emitted unit declares`);
    }
  }
  assert.deepEqual(document.specs[1].prereqs, ['alpha-core']);
});

test('a unit whose prompt composes to empty text is refused rather than emitted', () => {
  assert.throws(
    () => build(clone(MSPS), {}, { composePrompt: () => '' }),
    (error) => error instanceof RunDocumentError && /alpha-core/.test(error.message) && /prompt/.test(error.message),
  );
});

test('a unit whose id fails the pool node pattern is refused rather than emitted', () => {
  const msps = clone(MSPS);
  msps[0].id = 'Alpha_Core';
  msps[1].dependsOn = [];
  assert.throws(
    () => build(msps),
    (error) => error instanceof RunDocumentError && /Alpha_Core/.test(error.message),
  );
});

test('a duplicate unit id is refused rather than emitted', () => {
  const msps = clone(MSPS);
  msps[1].id = 'alpha-core';
  msps[1].dependsOn = [];
  assert.throws(
    () => build(msps),
    (error) => error instanceof RunDocumentError && /"alpha-core"/.test(error.message) && /twice/.test(error.message),
  );
});

test('a prereq naming no emitted unit is refused rather than emitted', () => {
  const msps = clone(MSPS);
  msps[1].dependsOn = ['gamma-missing'];
  assert.throws(
    () => build(msps),
    (error) => error instanceof RunDocumentError && /beta-wiring/.test(error.message) && /gamma-missing/.test(error.message),
  );
});

test('a fileScope pack missing any of edit, read or truncated is refused by the pack validator before any prompt is composed', () => {
  const composePrompt = () => 'a prompt the stub composer always produces';
  for (const key of ['edit', 'read', 'truncated']) {
    const msps = clone(MSPS);
    delete msps[1].fileScope[key];
    assert.throws(
      () => build(msps, {}, { composePrompt }),
      (error) => error instanceof RunDocumentError
        && /beta-wiring/.test(error.message)
        && new RegExp(`omits the required ${key} key`).test(error.message),
      `a fileScope missing ${key} was not refused by the pack validator`,
    );
  }
});

test('the same input yields a byte-identical document', () => {
  const first = JSON.stringify(build());
  const second = JSON.stringify(build());
  assert.equal(first, second);
  assert.equal(first.length > 0, true);
});

test('the composer never mutates the decomposition it was handed', () => {
  const msps = clone(MSPS);
  const before = JSON.stringify(msps);
  build(msps);
  assert.equal(JSON.stringify(msps), before);
});
