import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Done,
  Transient,
  ApproachFixable,
  NeedsHuman,
  AwaitingApproval,
  Built,
  Unknown,
  classify,
  assertNever,
  runStage,
  EngineFault,
} from '../boundary.mjs';

const CLOSED_TAGS = new Set(['Done', 'Transient', 'ApproachFixable', 'NeedsHuman', 'Unknown']);

test('Outcome constructors produce immutable tagged objects with their named payload field', () => {
  const done = Done({ ok: true });
  assert.deepEqual(done, { tag: 'Done', value: { ok: true } });
  assert.ok(Object.isFrozen(done));

  const transient = Transient({ signal: 'rate-limit', detail: 'x', attemptNo: 2 });
  assert.deepEqual(transient, { tag: 'Transient', evidence: { signal: 'rate-limit', detail: 'x', attemptNo: 2 } });
  assert.ok(Object.isFrozen(transient));

  const approach = ApproachFixable({ mechanism: 'acquisition:raw-http', diagnosis: 'd', evidence: 1 });
  assert.deepEqual(approach, { tag: 'ApproachFixable', cause: { mechanism: 'acquisition:raw-http', diagnosis: 'd', evidence: 1 } });
  assert.ok(Object.isFrozen(approach));

  const human = NeedsHuman({ kind: 'grant', what: 'creds', remediation: null, resumePoint: null });
  assert.deepEqual(human, { tag: 'NeedsHuman', request: { kind: 'grant', what: 'creds', remediation: null, resumePoint: null } });
  assert.ok(Object.isFrozen(human));

  const unknown = Unknown({ raw: null });
  assert.deepEqual(unknown, { tag: 'Unknown', raw: { raw: null } });
  assert.ok(Object.isFrozen(unknown));

  const awaiting = AwaitingApproval({ mspId: 'm1', prUrl: 'https://pr' });
  assert.deepEqual(awaiting, { tag: 'AwaitingApproval', value: { mspId: 'm1', prUrl: 'https://pr' } });
  assert.ok(Object.isFrozen(awaiting));

  const built = Built({ checkpointRef: 'refs/mitosis/x/a', sha: 'abc1234' });
  assert.deepEqual(built, { tag: 'Built', value: { checkpointRef: 'refs/mitosis/x/a', sha: 'abc1234' } });
  assert.ok(Object.isFrozen(built));
});

test('classify: structured with no fault field maps to Done and preserves the value verbatim', () => {
  const value = { files: ['a.mjs'], schemaVersion: 1 };
  const out = classify({ raw: 'structured', value }, { attemptNo: 0 });
  assert.equal(out.tag, 'Done');
  assert.equal(out.value, value);
});

test('classify: structured self-reported transient maps to Transient with the rate-limit signal and ctx attemptNo', () => {
  const value = { fault: { kind: 'transient', diagnosis: 'model 529' } };
  const out = classify({ raw: 'structured', value }, { attemptNo: 3 });
  assert.equal(out.tag, 'Transient');
  assert.equal(out.evidence.signal, 'rate-limit');
  assert.equal(out.evidence.detail, 'model 529');
  assert.equal(out.evidence.attemptNo, 3);
});

test('classify: structured self-reported approach-fixable maps to ApproachFixable carrying the mechanism fingerprint and grounding evidence', () => {
  const value = { fault: { kind: 'approach-fixable', mechanism: 'import-path:relative', diagnosis: 'wrong import root' } };
  const out = classify({ raw: 'structured', value }, {});
  assert.equal(out.tag, 'ApproachFixable');
  assert.equal(out.cause.mechanism, 'import-path:relative');
  assert.equal(out.cause.diagnosis, 'wrong import root');
  assert.equal(out.cause.evidence, value);
});

test('classify: structured self-reported needs-human maps to NeedsHuman with the request kind and what', () => {
  const value = { fault: { kind: 'needs-human', request: { kind: 'install', what: 'docker daemon' } } };
  const out = classify({ raw: 'structured', value }, {});
  assert.equal(out.tag, 'NeedsHuman');
  assert.equal(out.request.kind, 'install');
  assert.equal(out.request.what, 'docker daemon');
});

test('classify: structured with an unrecognized fault.kind is untrusted input and maps to Unknown, never a throw', () => {
  const value = { fault: { kind: 'not-a-real-kind' } };
  const out = classify({ raw: 'structured', value }, {});
  assert.equal(out.tag, 'Unknown');
  assert.equal(out.raw.raw, value);
});

test('FLAGSHIP REGRESSION: classify maps null to Unknown, NOT Transient (the retry.mjs:2 null->transient bug is dead)', () => {
  const out = classify({ raw: 'null' }, { attemptNo: 0 });
  assert.equal(out.tag, 'Unknown');
  assert.equal(out.raw.raw, null);
  assert.notEqual(out.tag, 'Transient');
});

test('classify: a thrown recognized EngineFault surfaces its declared class (transient -> Transient with throw-io signal)', () => {
  const error = new EngineFault({ kind: 'transient', diagnosis: 'socket hang up' });
  const out = classify({ raw: 'throw', error }, { attemptNo: 1 });
  assert.equal(out.tag, 'Transient');
  assert.equal(out.evidence.signal, 'throw-io');
  assert.equal(out.evidence.detail, 'socket hang up');
  assert.equal(out.evidence.attemptNo, 1);
});

test('classify: a thrown EngineFault of kind approach-fixable surfaces ApproachFixable', () => {
  const error = new EngineFault({ kind: 'approach-fixable', mechanism: 'test-double:real-network', diagnosis: 'hit live api' });
  const out = classify({ raw: 'throw', error }, {});
  assert.equal(out.tag, 'ApproachFixable');
  assert.equal(out.cause.mechanism, 'test-double:real-network');
});

test('classify: a thrown EngineFault of kind needs-human surfaces NeedsHuman', () => {
  const error = new EngineFault({ kind: 'needs-human', request: { kind: 'grant', what: 'sudo' } });
  const out = classify({ raw: 'throw', error }, {});
  assert.equal(out.tag, 'NeedsHuman');
  assert.equal(out.request.kind, 'grant');
});

test('classify: a thrown ordinary Error maps to Unknown carrying the raw error, never a throw', () => {
  const error = new Error('boom');
  const out = classify({ raw: 'throw', error }, {});
  assert.equal(out.tag, 'Unknown');
  assert.equal(out.raw.raw, error);
});

test('classify: a thrown non-Error value (string or number) maps to Unknown', () => {
  const strOut = classify({ raw: 'throw', error: 'plain string boom' }, {});
  assert.equal(strOut.tag, 'Unknown');
  assert.equal(strOut.raw.raw, 'plain string boom');

  const numOut = classify({ raw: 'throw', error: 42 }, {});
  assert.equal(numOut.tag, 'Unknown');
  assert.equal(numOut.raw.raw, 42);

  const zeroOut = classify({ raw: 'throw', error: 0 }, {});
  assert.equal(zeroOut.tag, 'Unknown');
});

test('classify defaults attemptNo to 0 when ctx is absent or lacks attemptNo', () => {
  const value = { fault: { kind: 'transient', diagnosis: 'd' } };
  assert.equal(classify({ raw: 'structured', value }, undefined).evidence.attemptNo, 0);
  assert.equal(classify({ raw: 'structured', value }, {}).evidence.attemptNo, 0);
});

test('OBLIGATION 1 (totality): classify over every raw-signal shape returns a valid closed Outcome and never returns nothing or throws', () => {
  const rawSignals = [
    { raw: 'structured', value: { ok: 1 } },
    { raw: 'structured', value: { fault: { kind: 'transient', diagnosis: 'd' } } },
    { raw: 'structured', value: { fault: { kind: 'approach-fixable', mechanism: 'a:b', diagnosis: 'd' } } },
    { raw: 'structured', value: { fault: { kind: 'needs-human', request: { kind: 'install', what: 'w' } } } },
    { raw: 'structured', value: { fault: { kind: 'garbage' } } },
    { raw: 'structured', value: 'a-bare-primitive' },
    { raw: 'null' },
    { raw: 'throw', error: new Error('e') },
    { raw: 'throw', error: 'string-throw' },
    { raw: 'throw', error: new EngineFault({ kind: 'transient', diagnosis: 'd' }) },
    { raw: 'throw', error: new EngineFault({ kind: 'approach-fixable', mechanism: 'a:b', diagnosis: 'd' }) },
    { raw: 'throw', error: new EngineFault({ kind: 'needs-human', request: { kind: 'grant', what: 'w' } }) },
  ];
  for (const raw of rawSignals) {
    let out;
    assert.doesNotThrow(() => { out = classify(raw, { attemptNo: 0 }); }, `classify threw on ${JSON.stringify(raw && raw.raw)}`);
    assert.ok(out !== undefined && out !== null, `classify returned nothing on ${JSON.stringify(raw && raw.raw)}`);
    assert.ok(CLOSED_TAGS.has(out.tag), `classify produced non-closed tag ${out && out.tag}`);
  }
});

test('assertNever throws on the impossible default (lintable exhaustiveness guard)', () => {
  assert.throws(() => assertNever('impossible'), /assertNever/);
});

test('classify routes an unrecognized raw descriptor tag through the assertNever guard rather than silently returning nothing', () => {
  assert.throws(() => classify({ raw: 'not-a-raw-signal' }, {}), /assertNever/);
  assert.throws(() => classify(undefined, {}), /assertNever/);
});

test('runStage: a structured non-null return classifies as Done', async () => {
  const out = await runStage(async () => ({ ok: true }), { attemptNo: 0 });
  assert.equal(out.tag, 'Done');
  assert.deepEqual(out.value, { ok: true });
});

test('runStage: a null return classifies as Unknown, NOT Transient', async () => {
  const out = await runStage(async () => null, { attemptNo: 0 });
  assert.equal(out.tag, 'Unknown');
  assert.equal(out.raw.raw, null);
  assert.notEqual(out.tag, 'Transient');
});

test('runStage: an undefined return classifies as Unknown (undefined subsumed by null)', async () => {
  const out = await runStage(async () => undefined, {});
  assert.equal(out.tag, 'Unknown');
  assert.equal(out.raw.raw, null);
});

test('runStage: a thrown ordinary Error is caught and classified as Unknown, never escaping runStage', async () => {
  const out = await runStage(async () => { throw new Error('kaboom'); }, {});
  assert.equal(out.tag, 'Unknown');
  assert.ok(out.raw.raw instanceof Error);
});

test('runStage: a thrown recognized EngineFault surfaces its declared class', async () => {
  const out = await runStage(async () => { throw new EngineFault({ kind: 'needs-human', request: { kind: 'grant', what: 'token' } }); }, {});
  assert.equal(out.tag, 'NeedsHuman');
  assert.equal(out.request.kind, 'grant');
  assert.equal(out.request.what, 'token');
});

test('runStage: a self-reported approach-fixable structured return surfaces ApproachFixable', async () => {
  const out = await runStage(async () => ({ fault: { kind: 'approach-fixable', mechanism: 'acquisition:package-manager', diagnosis: 'd' } }), {});
  assert.equal(out.tag, 'ApproachFixable');
  assert.equal(out.cause.mechanism, 'acquisition:package-manager');
});

test('runStage awaits the dispatch thunk exactly once', async () => {
  let calls = 0;
  await runStage(async () => { calls += 1; return { ok: true }; }, {});
  assert.equal(calls, 1);
});
