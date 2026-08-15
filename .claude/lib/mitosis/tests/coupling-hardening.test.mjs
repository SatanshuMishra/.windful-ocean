import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COUPLING_PARALLEL,
  COUPLING_RATIONALE_CAP,
  COUPLING_SERIALIZE,
  assertVerdictsCoverPairs,
  couplingContextFacts,
  resolveCoupling,
  reviewCoupling,
} from '../coupling-review.mjs';
import { DERIVED_EDGE_REASONS, couplingResolutionCounts, couplingSerializeAssertions, deriveEdges } from '../derive-edges.mjs';
import { pack } from './file-scope-fixtures.mjs';

const CLI = fileURLToPath(new URL('../derive-edges.mjs', import.meta.url));
const CLI_AT = '2026-01-01T00:00:00.000Z';
const MITOSIS_SOURCE = fileURLToPath(new URL('../../../workflows/mitosis.js', import.meta.url));
const DERIVE_EDGES_SOURCE = fileURLToPath(new URL('../derive-edges.mjs', import.meta.url));
const RUN_ENGINE_SOURCE = fileURLToPath(new URL('../run-engine.mjs', import.meta.url));

function scratch(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

function taskOf(id, files, extra) {
  return { id, title: id, fullText: id.toUpperCase(), fileScope: pack(files), dependsOn: [], risk: 'low', validation: 'scoped', ...extra };
}

function graphOf(...tasks) {
  return { tasks };
}

function runCli(args, cwd) {
  return execFileSync('node', [CLI, ...args, '--at', CLI_AT], { cwd, encoding: 'utf8' });
}

function migrationPair() {
  return graphOf(
    taskOf('t1', ['db/migrations/001_accounts.sql']),
    taskOf('t2', ['db/migrations/002_ledger.sql']),
  );
}

function serializeEmission() {
  return reviewCoupling([
    { a: { id: 't1', fileScope: pack(['srv/auth/a.ts']) }, b: { id: 't2', fileScope: pack(['web/auth/b.tsx']) } },
  ]);
}

test('I1: re-running the CLI over the graph it rewrote in place keeps the coupling record it already made', () => {
  const dir = scratch('coupling-idempotence-');
  const declared = join(dir, 'plan.graph.json');
  const audit = join(dir, 'plan.edges-audit.json');
  writeFileSync(declared, JSON.stringify(migrationPair()));
  const args = [declared, '--out', declared, '--audit', audit];

  const first = JSON.parse(runCli(args, dir));
  const firstGraph = JSON.parse(readFileSync(declared, 'utf8'));
  const second = JSON.parse(runCli(args, dir));
  const secondGraph = JSON.parse(readFileSync(declared, 'utf8'));

  assert.equal(first.serializedPairCount, 1);
  assert.equal(
    second.serializedPairCount,
    1,
    'the second run reported no serialized pair while its own serializing edge still stands; the pass fed its output back into its candidate filter and erased the record of the decision',
  );
  assert.deepEqual(secondGraph.coupling, firstGraph.coupling, 'the emission must not self-erase across re-runs');
  assert.deepEqual(secondGraph.couplingResolution, firstGraph.couplingResolution, 'a coupling decision, once made, is durable across re-runs');
  assert.deepEqual(secondGraph.tasks.find((t) => t.id === 't2').dependsOn, ['t1']);
});

test('I1b: the relaxation path stays reachable on the second run rather than erroring "never emitted"', () => {
  const dir = scratch('coupling-relax-rerun-');
  const declared = join(dir, 'plan.graph.json');
  const audit = join(dir, 'plan.edges-audit.json');
  const verdicts = join(dir, 'verdicts.json');
  writeFileSync(declared, JSON.stringify(migrationPair()));
  writeFileSync(verdicts, JSON.stringify([{ pair: ['t1', 't2'], decision: 'parallel', rationale: 'the two migrations touch disjoint tables' }]));
  const args = [declared, '--out', declared, '--audit', audit];

  runCli(args, dir);
  const relaxed = JSON.parse(runCli([...args, '--verdicts', verdicts], dir));
  assert.equal(relaxed.couplingPairCount, 1, 'the pair must still be emitted on the second run, or no verdict can ever answer it again');
  assert.equal(relaxed.serializedPairCount, 0);
});

test('I1c: a pair the operator already ordered is still emitted, and coupling adds no second edge for it', () => {
  const { graph, added, coupling } = deriveEdges(graphOf(
    taskOf('t1', ['srv/auth/a.ts']),
    taskOf('t2', ['web/auth/b.tsx'], { dependsOn: ['t1'] }),
  ), []);
  assert.deepEqual(coupling.map((c) => c.pair), [['t1', 't2']], 'an already-ordered pair is still a coupled pair, and a record that omits it under-reports the graph');
  assert.deepEqual(added, [], 'the pair is already ordered, so coupling owes it no edge and must not manufacture a back-edge');
  assert.deepEqual(graph.tasks.find((t) => t.id === 't2').dependsOn, ['t1']);
});

test('I1d: a transitively ordered pair takes no coupling edge, so a chain declared against declaration order is not closed into a cycle', () => {
  const { added, coupling } = deriveEdges(graphOf(
    taskOf('t1', ['srv/auth/a.ts'], { dependsOn: ['t2'] }),
    taskOf('t2', ['srv/auth/b.ts'], { dependsOn: ['t3'] }),
    taskOf('t3', ['srv/auth/c.ts']),
  ), []);
  assert.deepEqual(coupling.map((c) => c.pair), [['t1', 't2'], ['t1', 't3'], ['t2', 't3']]);
  assert.deepEqual(
    added,
    [],
    't1 already reaches t3 through t2; adding the declaration-order edge t3 -> t1 on top of that closes a cycle out of a graph the operator declared acyclic',
  );
});

test('I2: a coupling-serialized edge names coupling as its cause in edgeReasons', () => {
  const { graph } = deriveEdges(migrationPair(), []);
  const byId = Object.fromEntries(graph.tasks.map((t) => [t.id, t]));
  assert.deepEqual(byId.t2.edgeReasons, ['coupling-serialize'], 'an edge with no reason is indistinguishable from one the planner declared');
  assert.deepEqual(byId.t1.edgeReasons, ['coupling-serialize']);
});

test('I2b: every edge-adding rule in derive-edges contributes a registered reason token', () => {
  const source = readFileSync(DERIVE_EDGES_SOURCE, 'utf8');
  const literals = new Set([
    ...[...source.matchAll(/_REASON\s*=\s*'([^']+)'/g)].map((m) => m[1]),
    ...[...source.matchAll(/reason:\s*'([^']+)'/g)].map((m) => m[1]),
  ]);
  assert.deepEqual(
    [...literals].sort(),
    [...DERIVED_EDGE_REASONS].sort(),
    'every reason literal this module can attach must be registered in DERIVED_EDGE_REASONS; an unregistered token escapes the escalation census below',
  );
});

test('I2c: no reason token derive-edges attaches matches the live opus-escalation regex in mitosis.js', () => {
  const source = readFileSync(MITOSIS_SOURCE, 'utf8');
  const declaration = source.match(/const CONTRACT_EDGE_RE = (\/.+\/[a-z]*);/);
  assert.ok(declaration, 'CONTRACT_EDGE_RE could not be located in mitosis.js, so this census cannot measure the live escalation rule');
  const body = declaration[1].slice(1, declaration[1].lastIndexOf('/'));
  const flags = declaration[1].slice(declaration[1].lastIndexOf('/') + 1);
  const escalation = new RegExp(body, flags);
  assert.ok(escalation.test('public-api-contract'), 'the reconstructed regex does not match a known escalating reason, so a green result here would prove nothing');
  const escalating = DERIVED_EDGE_REASONS.filter((reason) => escalation.test(reason));
  assert.deepEqual(escalating, [], 'a derived reason token that matches the escalation regex silently forces every task carrying it onto the opus tier');
});

test('I3: an unclassified decision halts the edge pass rather than falling through as co-schedulable', () => {
  const resolution = [{ pair: ['t1', 't2'], signals: [], default: COUPLING_SERIALIZE, decision: 'advisory', source: 'default', rationale: null }];
  assert.throws(
    () => couplingSerializeAssertions(resolution, new Map([['t1', 0], ['t2', 1]])),
    /decision "advisory"/,
    'a third decision token must halt this pass; skipping it ships the pair co-scheduled under a name nobody reads as parallel',
  );
});

test('I3b: an unclassified resolution source halts the count census rather than vanishing from every bucket', () => {
  const resolution = [{ pair: ['t1', 't2'], signals: [], default: COUPLING_SERIALIZE, decision: COUPLING_SERIALIZE, source: 'inferred', rationale: null }];
  assert.throws(
    () => couplingResolutionCounts(resolution),
    /source "inferred"/,
    'a record whose source matches no bucket is silently dropped from the counts, so the audit under-reports the resolution it summarises',
  );
});

test('I3c: the resolution counts account for every record, so no decision can be summarised away', () => {
  const { audit } = deriveEdges(migrationPair(), []);
  const decisionTotal = Object.values(audit.couplingDecisionCounts).reduce((sum, n) => sum + n, 0);
  const sourceTotal = Object.values(audit.couplingResolutionSourceCounts).reduce((sum, n) => sum + n, 0);
  assert.equal(decisionTotal, audit.couplingResolution.length);
  assert.equal(sourceTotal, audit.couplingResolution.length);
  assert.equal(audit.serializedPairCount, audit.couplingDecisionCounts[COUPLING_SERIALIZE]);
});

test('I4: the coupling edge and the fileScope-overlap edge take the same direction on ids that sort against their declaration order', () => {
  const coupled = deriveEdges(graphOf(
    taskOf('t3', ['db/migrations/001_accounts.sql']),
    taskOf('t20', ['db/migrations/002_ledger.sql']),
  ), []);
  assert.deepEqual(
    coupled.added,
    [{ from: 't20', to: 't3', reason: 'coupling-serialize' }],
    't20 is declared after t3 but sorts before it; a lexicographic direction rule inverts the migration order here while a wave-count assertion stays green',
  );
  assert.deepEqual(coupled.graph.tasks.find((t) => t.id === 't20').dependsOn, ['t3']);

  const overlapping = deriveEdges(graphOf(
    taskOf('t3', ['db/migrations/001_accounts.sql']),
    taskOf('t20', ['db/migrations/001_accounts.sql']),
  ), []);
  assert.deepEqual(
    overlapping.added.map((e) => [e.from, e.to]),
    coupled.added.map((e) => [e.from, e.to]),
    'the two edge-adding rules must share one canonical direction; on these ids they previously produced opposite edges and no fixture could tell them apart',
  );
});

test('I5: two distinct pairs whose ids contain the separator do not collide on one key', () => {
  const emitted = reviewCoupling([
    { a: { id: 'a', fileScope: pack(['srv/auth/a.ts']) }, b: { id: 'b c', fileScope: pack(['web/auth/b.tsx']) } },
  ]);
  assert.deepEqual(emitted.map((e) => e.pair), [['a', 'b c']]);
  assert.throws(
    () => resolveCoupling(emitted, [{ pair: ['a b', 'c'], decision: 'parallel', rationale: null }]),
    /a b|never emitted/,
    'a verdict naming two ids that exist nowhere in the graph relaxed a real pair by colliding on its key',
  );
});

test('I5b: a verdict naming an id absent from the emission is refused even when its key matches', () => {
  const emitted = serializeEmission();
  assert.throws(
    () => resolveCoupling(emitted, [{ pair: ['t1', 'ghost'], decision: COUPLING_SERIALIZE, rationale: null }]),
    /ghost/,
    'the coverage check must read the two ids, not a joined key; trusting the key is what the collision defeats',
  );
});

test('I6: a supplied riskMarkers list EXTENDS the default set rather than replacing it', () => {
  const facts = couplingContextFacts({ riskMarkers: ['ledger'] });
  const defaults = couplingContextFacts(undefined).riskMarkers;
  for (const marker of defaults) {
    assert.ok(facts.riskMarkers.includes(marker), `supplying one marker dropped the default marker ${marker}; a caller-supplied list must tighten a safety control, never widen it`);
  }
  assert.ok(facts.riskMarkers.includes('ledger'));
  assert.equal(facts.riskMarkersOverridden, true);
  assert.equal(couplingContextFacts(undefined).riskMarkersOverridden, false);
});

test('I6b: an empty riskMarkers list cannot silence the coupling pass', () => {
  const silenced = deriveEdges({ ...migrationPair(), couplingContext: { riskMarkers: [] } }, []);
  const plain = deriveEdges(migrationPair(), []);
  assert.deepEqual(
    silenced.added,
    plain.added,
    'a graph carrying "riskMarkers": [] produced an audit byte-indistinguishable from a graph with genuinely no coupling',
  );
  assert.equal(silenced.audit.serializedPairCount, plain.audit.serializedPairCount);
});

test('I6c: the audit records the effective marker set and whether the caller overrode it', () => {
  const { audit } = deriveEdges({ ...migrationPair(), couplingContext: { riskMarkers: ['ledger'] } }, []);
  assert.equal(audit.couplingContext.riskMarkersOverridden, true);
  assert.ok(audit.couplingContext.riskMarkers.includes('ledger'));
  assert.ok(audit.couplingContext.riskMarkers.includes('migrations'), 'the audit must show the markers actually in force, or a narrowing reads as "no coupling here"');
  assert.equal(deriveEdges(migrationPair(), []).audit.couplingContext.riskMarkersOverridden, false);
});

test('I6d: a risk marker carrying invisible characters is refused rather than silently matching nothing', () => {
  assert.throws(
    () => couplingContextFacts({ riskMarkers: ['aut\u200Bh'] }),
    /riskMarkers/,
    'a marker whose rendered form reads as a real marker but matches no path is a narrowing disguised as a widening',
  );
});

test('I7: a rationale longer than the free-text cap is refused rather than stored whole', () => {
  const emitted = serializeEmission();
  const long = 'x'.repeat(COUPLING_RATIONALE_CAP + 1);
  assert.throws(
    () => resolveCoupling(emitted, [{ pair: ['t1', 't2'], decision: COUPLING_PARALLEL, rationale: long }]),
    /rationale/,
    'an unbounded rationale is written verbatim into two artifacts the flow and its agents read back',
  );
});

test('I7b: a rationale made only of invisible characters does not buy the relaxation', () => {
  const emitted = serializeEmission();
  for (const blank of [' ', '\u0000', '\u001B', '\u200B', '\u200D', '\u2060', '\u00AD']) {
    assert.throws(
      () => resolveCoupling(emitted, [{ pair: ['t1', 't2'], decision: COUPLING_PARALLEL, rationale: blank }]),
      /no rationale/,
      `a rationale of ${JSON.stringify(blank)} bought the relaxation and renders as an empty string in every log; a reviewer cannot tell it from the case the gate refuses`,
    );
  }
});

test('I7c: the persisted rationale carries no control or default-ignorable code point', () => {
  const dir = scratch('coupling-rationale-inert-');
  const declared = join(dir, 'plan.graph.json');
  const verdicts = join(dir, 'verdicts.json');
  writeFileSync(declared, JSON.stringify(migrationPair()));
  writeFileSync(verdicts, JSON.stringify([{
    pair: ['t1', 't2'],
    decision: 'parallel',
    rationale: 'disjoint \u0000 tables and\u200B no shared\nsymbol',
  }]));
  runCli([declared, '--verdicts', verdicts], dir);
  const stored = JSON.parse(readFileSync(join(dir, 'plan.hardened.graph.json'), 'utf8')).couplingResolution[0].rationale;
  assert.equal(/[\u0000-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u2060-\u2064\uFEFF]/.test(stored), false, `the artifact stored ${JSON.stringify(stored)}; a control character survives into every log and PR body that renders it`);
  assert.equal(stored, 'disjoint tables and no shared symbol');
});

test('I7d: an error message quotes a bounded prefix of the verdicts document rather than the whole of it', () => {
  const emitted = serializeEmission();
  const bulky = { pair: ['t1', 't2'], decision: 'parallel', rationale: null, note: 'y'.repeat(5000) };
  try {
    resolveCoupling(emitted, bulky);
    assert.fail('a non-array verdicts document must be refused');
  } catch (err) {
    assert.ok(err.message.length < 1000, `the error message carried ${err.message.length} characters of the document it rejected`);
  }
});

test('I8: an explicitly supplied empty verdicts list is a hard stop through BOTH entrypoints', () => {
  const emitted = serializeEmission();
  assert.throws(() => assertVerdictsCoverPairs(emitted, []), /no verdict answers it/);
  assert.throws(
    () => resolveCoupling(emitted, []),
    /no verdict answers it/,
    'the library entrypoint accepted an empty verdicts document and resolved from the defaults while the CLI entrypoint refused it; the library path is the one C5b and D1 call',
  );
});

test('I8b: absent verdicts is distinct from an empty verdicts document and still resolves the defaults', () => {
  const emitted = serializeEmission();
  assert.equal(resolveCoupling(emitted, null).length, 1);
  assert.equal(resolveCoupling(emitted, undefined)[0].decision, COUPLING_SERIALIZE);
});

test('I8c: the cycle halt names coupling as the cause when a coupling edge closed the cycle', () => {
  assert.throws(
    () => deriveEdges(graphOf(
      taskOf('a', ['srv/auth/a.ts'], { dependsOn: ['c'] }),
      taskOf('b', ['srv/auth/b.ts']),
      taskOf('c', ['srv/auth/c.ts']),
    ), []),
    /dependency cycle detected among: a, b, c[\s\S]*coupling/,
    'attributing the cycle to the operator-declared graph sends the reader to edges they did not write',
  );
});

test('I8d: a cycle in the declared graph alone is not attributed to coupling', () => {
  assert.throws(
    () => deriveEdges(graphOf(
      taskOf('a', ['lib/a.ts'], { dependsOn: ['b'] }),
      taskOf('b', ['lib/b.ts'], { dependsOn: ['a'] }),
    ), []),
    (err) => /dependency cycle detected among: a, b/.test(err.message) && !/coupling/.test(err.message),
    'naming coupling in a cycle it did not cause is the same misdirection in the other direction',
  );
});

test('the coupling marker set and the engine model-routing keyword set are one vocabulary', () => {
  const source = readFileSync(RUN_ENGINE_SOURCE, 'utf8');
  const declaration = source.match(/const SENSITIVE_SCOPE_KEYWORDS = \[([^\]]*)\];/);
  assert.ok(declaration, 'SENSITIVE_SCOPE_KEYWORDS could not be located in run-engine.mjs, so this census cannot measure the live routing vocabulary');
  const routing = declaration[1].split(',').map((entry) => entry.trim().replace(/^'|'$/g, '')).filter((entry) => entry.length > 0);
  assert.deepEqual(
    [...couplingContextFacts(undefined).riskMarkers].sort(),
    [...routing].sort(),
    'one list decides the wave plan and the other decides model routing; nothing else pins them together, so a marker added to one silently diverges from the other',
  );
});
