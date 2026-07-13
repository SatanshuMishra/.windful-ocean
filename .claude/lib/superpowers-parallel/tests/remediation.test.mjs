import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runRemediationLoop, fingerprintOf, isValidFingerprint } from '../remediation.mjs';
import { makeSupervisorState } from '../supervisor.mjs';
import { Done, Transient, ApproachFixable, NeedsHuman, Unknown } from '../boundary.mjs';

function counter() {
  return { n: 0, bump() { this.n += 1; return this.n; } };
}

function fixedDiagnostician(proposal) {
  const calls = counter();
  const fn = async () => { calls.bump(); return proposal; };
  fn.calls = calls;
  return fn;
}

function sequenceDiagnostician(proposals) {
  const calls = counter();
  const fn = async () => { const i = calls.bump() - 1; return proposals[Math.min(i, proposals.length - 1)]; };
  fn.calls = calls;
  return fn;
}

function distinctMechanismDiagnostician() {
  const calls = counter();
  const fn = async () => {
    const i = calls.bump();
    return { verdict: 'remediable', mechanism: `cat:mech-${i}`, correctedTask: `task-${i}`, diagnosis: `d-${i}` };
  };
  fn.calls = calls;
  return fn;
}

function countingRedispatch(producer) {
  const calls = counter();
  const fn = async () => { const i = calls.bump(); return producer(i); };
  fn.calls = calls;
  return fn;
}

const STAGE = { task: 'original task', stage: 'execute' };

test('fingerprintOf reads the causal mechanism token from ApproachFixable and a namespaced token from the other classes', () => {
  assert.equal(fingerprintOf(ApproachFixable({ mechanism: 'acquisition:raw-http', diagnosis: 'd', evidence: 1 })), 'acquisition:raw-http');
  assert.equal(fingerprintOf(Transient({ signal: 'rate-limit', detail: 'd', attemptNo: 0 })), 'transient:rate-limit');
  assert.equal(fingerprintOf(Unknown({ raw: null })), 'unknown:null');
  assert.equal(fingerprintOf(Done({ ok: true })), 'Done');
});

test('isValidFingerprint accepts a single <category>:<mechanism> token and rejects malformed tokens (OD-7 validated shape)', () => {
  assert.ok(isValidFingerprint('acquisition:raw-http'));
  assert.ok(isValidFingerprint('import-path:relative'));
  assert.ok(!isValidFingerprint('nocolon'));
  assert.ok(!isValidFingerprint('a:b:c'));
  assert.ok(!isValidFingerprint(''));
  assert.ok(!isValidFingerprint(null));
  assert.ok(!isValidFingerprint(42));
});

test('(i) a diagnostician stuck proposing ONE mechanism is zero-cost rejected and reaches Exhausted within budget', async () => {
  const mech = 'acquisition:raw-http';
  const diagnose = fixedDiagnostician({ verdict: 'remediable', mechanism: mech, correctedTask: 't', diagnosis: 'd' });
  const redispatch = countingRedispatch(() => ApproachFixable({ mechanism: mech, diagnosis: 'd', evidence: 1 }));
  const state0 = makeSupervisorState({ unitId: 'u1', stage: 'execute', budgetRemaining: 4 });
  const trigger = ApproachFixable({ mechanism: mech, diagnosis: 'd', evidence: 1 });

  const result = await runRemediationLoop({ trigger, ...STAGE }, { diagnose, redispatch }, state0);

  assert.equal(result.tag, 'Exhausted');
  assert.equal(redispatch.calls.n, 1);
  assert.ok(result.state.triedSet.has(mech));
  assert.ok(result.state.budget.remaining < 4);
});

test('(ii) a recurring identical failure spends an EXTRA decrement and reaches Exhausted FASTER than a converging one', async () => {
  const identicalDiag = distinctMechanismDiagnostician();
  const identicalRedispatch = countingRedispatch(() => ApproachFixable({ mechanism: 'stuck:same', diagnosis: 'd', evidence: 1 }));
  const identicalState = makeSupervisorState({ unitId: 'u1', stage: 'execute', budgetRemaining: 4 });
  const identicalTrigger = ApproachFixable({ mechanism: 'stuck:same', diagnosis: 'd', evidence: 1 });
  const identical = await runRemediationLoop({ trigger: identicalTrigger, ...STAGE }, { diagnose: identicalDiag, redispatch: identicalRedispatch }, identicalState);

  const convergeDiag = distinctMechanismDiagnostician();
  const convergeRedispatch = countingRedispatch((i) => ApproachFixable({ mechanism: `moving:fp-${i}`, diagnosis: 'd', evidence: 1 }));
  const convergeState = makeSupervisorState({ unitId: 'u2', stage: 'execute', budgetRemaining: 4 });
  const convergeTrigger = ApproachFixable({ mechanism: 'seed:cause', diagnosis: 'd', evidence: 1 });
  const converging = await runRemediationLoop({ trigger: convergeTrigger, ...STAGE }, { diagnose: convergeDiag, redispatch: convergeRedispatch }, convergeState);

  assert.equal(identical.tag, 'Exhausted');
  assert.equal(converging.tag, 'Exhausted');
  assert.ok(identicalRedispatch.calls.n < convergeRedispatch.calls.n, `identical(${identicalRedispatch.calls.n}) should exhaust faster than converging(${convergeRedispatch.calls.n})`);
  assert.equal(identicalRedispatch.calls.n, 2);
  assert.equal(convergeRedispatch.calls.n, 4);
});

test('(iii) the tried-set never shrinks: every dispatched mechanism remains, size equals dispatch count', async () => {
  const diagnose = distinctMechanismDiagnostician();
  const redispatch = countingRedispatch((i) => ApproachFixable({ mechanism: `moving:fp-${i}`, diagnosis: 'd', evidence: 1 }));
  const state0 = makeSupervisorState({ unitId: 'u1', stage: 'execute', budgetRemaining: 4 });
  const trigger = ApproachFixable({ mechanism: 'seed:cause', diagnosis: 'd', evidence: 1 });

  const result = await runRemediationLoop({ trigger, ...STAGE }, { diagnose, redispatch }, state0);

  assert.equal(result.state.triedSet.size, redispatch.calls.n);
  for (let i = 1; i <= redispatch.calls.n; i += 1) {
    assert.ok(result.state.triedSet.has(`cat:mech-${i}`), `tried-set dropped cat:mech-${i}`);
  }
  assert.equal(state0.triedSet.size, 0);
});

test('(iv) the bail to Exhausted is decided by code, never by a diagnostician verdict', async () => {
  const proposals = [];
  const diagnose = distinctMechanismDiagnostician();
  const wrapped = async (input) => { const p = await diagnose(input); proposals.push(p); return p; };
  wrapped.calls = diagnose.calls;
  const redispatch = countingRedispatch(() => ApproachFixable({ mechanism: 'stuck:same', diagnosis: 'd', evidence: 1 }));
  const state0 = makeSupervisorState({ unitId: 'u1', stage: 'execute', budgetRemaining: 4 });
  const trigger = ApproachFixable({ mechanism: 'stuck:same', diagnosis: 'd', evidence: 1 });

  const result = await runRemediationLoop({ trigger, ...STAGE }, { diagnose: wrapped, redispatch }, state0);

  assert.equal(result.tag, 'Exhausted');
  assert.ok(['budget', 'no-untried-mechanism'].includes(result.reason));
  for (const p of proposals) assert.equal(p.verdict, 'remediable');
});

test('(v) run-away is structurally impossible: total dispatches <= budget for ANY diagnostician', async () => {
  const producer = (i) => {
    const r = i % 3;
    if (r === 0) return ApproachFixable({ mechanism: `c:m-${i}`, diagnosis: 'd', evidence: 1 });
    if (r === 1) return Transient({ signal: 'rate-limit', detail: 'd', attemptNo: 0 });
    return Unknown({ raw: null });
  };
  for (const budget of [2, 4, 7]) {
    const lcg = { s: budget * 7 + 3, next() { this.s = (this.s * 1103515245 + 12345) & 0x7fffffff; return this.s; } };
    const diagnose = async () => ({ verdict: 'remediable', mechanism: `k${lcg.next() % 4}:v${lcg.next() % 11}`, correctedTask: 't', diagnosis: 'd' });
    const redispatch = countingRedispatch(producer);
    const state0 = makeSupervisorState({ unitId: 'u1', stage: 'execute', budgetRemaining: budget });
    const trigger = ApproachFixable({ mechanism: 'seed:cause', diagnosis: 'd', evidence: 1 });

    const result = await runRemediationLoop({ trigger, ...STAGE }, { diagnose, redispatch }, state0);

    assert.ok(redispatch.calls.n <= budget, `budget ${budget}: dispatched ${redispatch.calls.n} > budget`);
    assert.ok(['Done', 'Exhausted', 'NeedsHuman'].includes(result.tag));
  }
});

test('a proposal already in the tried-set is rejected at ZERO budget cost (no dispatch, no budget spend)', async () => {
  const diagnose = sequenceDiagnostician([
    { verdict: 'remediable', mechanism: 'acquisition:raw-http', correctedTask: 't1', diagnosis: 'd1' },
    { verdict: 'remediable', mechanism: 'acquisition:raw-http', correctedTask: 't2', diagnosis: 'd2' },
  ]);
  const redispatch = countingRedispatch(() => ApproachFixable({ mechanism: 'other:distinct', diagnosis: 'd', evidence: 1 }));
  const state0 = makeSupervisorState({ unitId: 'u1', stage: 'execute', budgetRemaining: 4 });
  const trigger = ApproachFixable({ mechanism: 'seed:cause', diagnosis: 'd', evidence: 1 });

  const result = await runRemediationLoop({ trigger, ...STAGE }, { diagnose, redispatch }, state0);

  assert.equal(result.tag, 'Exhausted');
  assert.equal(redispatch.calls.n, 1);
  assert.equal(result.state.budget.remaining, 3);
});

test('a diagnostician needs-human verdict escalates without spending a dispatch', async () => {
  const diagnose = fixedDiagnostician({ verdict: 'needs-human', request: { kind: 'install', what: 'docker daemon' } });
  const redispatch = countingRedispatch(() => Done({ ok: true }));
  const state0 = makeSupervisorState({ unitId: 'u1', stage: 'execute', budgetRemaining: 4 });
  const trigger = ApproachFixable({ mechanism: 'seed:cause', diagnosis: 'd', evidence: 1 });

  const result = await runRemediationLoop({ trigger, ...STAGE }, { diagnose, redispatch }, state0);

  assert.equal(result.tag, 'NeedsHuman');
  assert.deepEqual(result.request, { kind: 'install', what: 'docker daemon' });
  assert.equal(redispatch.calls.n, 0);
});

test('a corrected dispatch that returns Done terminates the loop with Done and records the mechanism', async () => {
  const diagnose = fixedDiagnostician({ verdict: 'remediable', mechanism: 'import-path:alias', correctedTask: 't', diagnosis: 'fix root' });
  const redispatch = countingRedispatch(() => Done({ patched: true }));
  const state0 = makeSupervisorState({ unitId: 'u1', stage: 'execute', budgetRemaining: 4 });
  const trigger = ApproachFixable({ mechanism: 'import-path:relative', diagnosis: 'd', evidence: 1 });

  const result = await runRemediationLoop({ trigger, ...STAGE }, { diagnose, redispatch }, state0);

  assert.equal(result.tag, 'Done');
  assert.deepEqual(result.value, { patched: true });
  assert.equal(result.state.status, 'done');
  assert.ok(result.state.triedSet.has('import-path:alias'));
  assert.equal(redispatch.calls.n, 1);
  assert.equal(result.state.ledger[result.state.ledger.length - 1].outcomeKind, 'Done');
});

test('a corrected dispatch that returns NeedsHuman escalates the loop to Tier 2', async () => {
  const diagnose = fixedDiagnostician({ verdict: 'remediable', mechanism: 'grant:token', correctedTask: 't', diagnosis: 'd' });
  const redispatch = countingRedispatch(() => NeedsHuman({ kind: 'grant', what: 'api token', remediation: null, resumePoint: null }));
  const state0 = makeSupervisorState({ unitId: 'u1', stage: 'execute', budgetRemaining: 4 });
  const trigger = ApproachFixable({ mechanism: 'seed:cause', diagnosis: 'd', evidence: 1 });

  const result = await runRemediationLoop({ trigger, ...STAGE }, { diagnose, redispatch }, state0);

  assert.equal(result.tag, 'NeedsHuman');
  assert.equal(result.request.kind, 'grant');
  assert.equal(result.state.status, 'parked');
});

test('the injected compensation hook runs before each corrected re-dispatch (per-attempt clean state)', async () => {
  const order = [];
  const diagnose = distinctMechanismDiagnostician();
  const redispatch = countingRedispatch((i) => (i >= 2 ? Done({ ok: true }) : ApproachFixable({ mechanism: `moving:fp-${i}`, diagnosis: 'd', evidence: 1 })));
  const wrappedRedispatch = async (arg) => { order.push('dispatch'); return redispatch(arg); };
  wrappedRedispatch.calls = redispatch.calls;
  const compensate = async () => { order.push('compensate'); };
  const state0 = makeSupervisorState({ unitId: 'u1', stage: 'execute', budgetRemaining: 4 });
  const trigger = ApproachFixable({ mechanism: 'seed:cause', diagnosis: 'd', evidence: 1 });

  const result = await runRemediationLoop({ trigger, ...STAGE }, { diagnose, redispatch: wrappedRedispatch, compensate }, state0);

  assert.equal(result.tag, 'Done');
  assert.deepEqual(order, ['compensate', 'dispatch', 'compensate', 'dispatch']);
});

test('runRemediationLoop never mutates the input state', async () => {
  const diagnose = distinctMechanismDiagnostician();
  const redispatch = countingRedispatch((i) => ApproachFixable({ mechanism: `moving:fp-${i}`, diagnosis: 'd', evidence: 1 }));
  const state0 = makeSupervisorState({ unitId: 'u1', stage: 'execute', budgetRemaining: 4 });
  const trigger = ApproachFixable({ mechanism: 'seed:cause', diagnosis: 'd', evidence: 1 });

  await runRemediationLoop({ trigger, ...STAGE }, { diagnose, redispatch }, state0);

  assert.equal(state0.budget.remaining, 4);
  assert.equal(state0.triedSet.size, 0);
  assert.equal(state0.ledger.length, 0);
  assert.equal(state0.status, 'ready');
});
