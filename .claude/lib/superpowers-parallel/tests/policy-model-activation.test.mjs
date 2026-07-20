import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveEdges } from '../derive-edges.mjs';
import { buildEngineTasks } from '../generate-run-script.mjs';
import {
  policyModelFor,
  guardModelDecision,
  routingTelemetry,
  authorTaskModels,
  BLAST_RADIUS_K,
} from '../run-engine.mjs';

const GREEN = (where) => `GREEN: implement the behavior in ${where} and cover it with a scoped unit test.`;

function activationGraph() {
  return {
    tasks: [
      { id: 'clear', title: 'add slugify helper', fullText: GREEN('src/slugify.mjs'), fileScope: ['src/slugify.mjs'], risk: 'low' },
      { id: 'api', title: 'reshape response envelope', fullText: GREEN('src/api/envelope.mjs'), fileScope: ['src/api/envelope.mjs'], risk: 'low' },
      { id: 'apiConsumer', title: 'consume the new envelope', fullText: GREEN('src/client.mjs'), fileScope: ['src/client.mjs'], risk: 'low' },
      { id: 'hub', title: 'shared formatter', fullText: GREEN('src/format.mjs'), fileScope: ['src/format.mjs'], risk: 'low' },
      { id: 'd1', title: 'consumer one', fullText: GREEN('src/one.mjs'), fileScope: ['src/one.mjs'], risk: 'low', dependsOn: ['hub'] },
      { id: 'd2', title: 'consumer two', fullText: GREEN('src/two.mjs'), fileScope: ['src/two.mjs'], risk: 'low', dependsOn: ['hub'] },
      { id: 'd3', title: 'consumer three', fullText: GREEN('src/three.mjs'), fileScope: ['src/three.mjs'], risk: 'low', dependsOn: ['hub'] },
    ],
  };
}

function activationTasks() {
  const { graph } = deriveEdges(activationGraph(), [
    { from: 'apiConsumer', to: 'api', reason: 'public-api-contract' },
  ]);
  return buildEngineTasks(graph.tasks);
}

test('activation receipt: a clear low-risk implementer pipes real derive-edges -> builder -> policyModelFor as sonnet', () => {
  const built = activationTasks();
  assert.equal(policyModelFor(built.clear), 'sonnet');
});

test('activation receipt: a contract-breaking task resolves opus through the real seam', () => {
  const built = activationTasks();
  assert.equal(built.api.edgeReasons.some((r) => /contract|api|schema/i.test(r)), true);
  assert.equal(policyModelFor(built.api), 'opus');
  assert.equal(policyModelFor(built.apiConsumer), 'opus');
});

test('activation receipt: a high-blast hub resolves opus through the real seam', () => {
  const built = activationTasks();
  assert.ok(built.hub.dependentCount >= BLAST_RADIUS_K);
  assert.equal(policyModelFor(built.hub), 'opus');
});

test('activation receipt: partial state (dependentCount present, edgeReasons missing) fails closed to opus', () => {
  const built = activationTasks();
  const { edgeReasons, ...tornClear } = built.clear;
  assert.equal(Number.isInteger(tornClear.dependentCount), true);
  assert.equal(tornClear.edgeReasons, undefined);
  assert.equal(policyModelFor(tornClear), 'opus');
});

test('activation receipt: partial state (edgeReasons present, dependentCount missing) fails closed to opus', () => {
  const built = activationTasks();
  const { dependentCount, ...tornClear } = built.clear;
  assert.equal(Array.isArray(tornClear.edgeReasons), true);
  assert.equal(tornClear.dependentCount, undefined);
  assert.equal(policyModelFor(tornClear), 'opus');
});

test('floor: every kind:engine dispatch site stays Opus after the kind:fix split', () => {
  const built = activationTasks();
  for (const engineTask of [null, built.clear]) {
    assert.deepEqual(guardModelDecision('engine', engineTask, undefined), { ok: true, model: 'opus', reason: null });
  }
  assert.deepEqual(guardModelDecision('review', built.clear, undefined), { ok: true, model: 'opus', reason: null });
  assert.deepEqual(guardModelDecision('escalation', built.clear, undefined, { layer3Sonnet: true }), { ok: true, model: 'opus', reason: null });
});

test('floor: the review-fix loop kind:fix is Sonnet when the tier is enabled and Opus when disabled', () => {
  const built = activationTasks();
  assert.deepEqual(guardModelDecision('fix', built.clear, undefined, { layer3Sonnet: true }), { ok: true, model: 'sonnet', reason: null });
  assert.deepEqual(guardModelDecision('fix', built.clear, undefined, { layer3Sonnet: false }), { ok: true, model: 'opus', reason: null });
});

test('telemetry: a mixed run emits the routing line with opus/sonnet/ambiguous counts', () => {
  const built = activationTasks();
  const telemetry = routingTelemetry(authorTaskModels(built), { layer3Sonnet: true });
  assert.equal(telemetry.line, `model routing: opus=${telemetry.opus} sonnet=${telemetry.sonnet} ambiguous(reason)=${telemetry.ambiguous}`);
  assert.ok(telemetry.sonnet >= 1);
  assert.ok(telemetry.opus >= 1);
  assert.equal(telemetry.warning, null);
});

test('telemetry: a 100%-ambiguous run fires the loud fail-closed warning', () => {
  const tornTasks = {
    a: { id: 'a', title: 'a', fullText: 'GREEN: a', fileScope: ['src/a.mjs'], risk: 'low', agentType: 'implementer' },
    b: { id: 'b', title: 'b', fullText: 'GREEN: b', fileScope: ['src/b.mjs'], risk: 'low', agentType: 'implementer' },
  };
  const telemetry = routingTelemetry(tornTasks, { layer3Sonnet: true });
  assert.equal(telemetry.ambiguous, 2);
  assert.equal(telemetry.opus, 2);
  assert.equal(telemetry.sonnet, 0);
  assert.match(telemetry.warning, /100% ambiguous/);
});
