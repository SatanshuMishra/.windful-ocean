import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCassette, scriptFor, CASSETTE_SCHEMA } from '../cassette.mjs';

function scratch(t) {
  const dir = mkdtempSync(join(tmpdir(), 'cassette-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function writeCassette(t, body) {
  const path = join(scratch(t), 'cassette.json');
  writeFileSync(path, JSON.stringify(body), 'utf8');
  return path;
}

const VALID_CASSETTE = Object.freeze({
  name: 'plan-review-rejects-twice-then-approves',
  recordedAt: '2026-08-21T06:24:25+00:00',
  provenance: 'authored',
  sourceRun: null,
  script: {
    'plan-review': [
      { ok: true, outcome: 'success', structured: { verdict: 'needs-changes', findings: [] } },
      { ok: true, outcome: 'success', structured: { verdict: 'needs-changes', findings: [] } },
      { ok: true, outcome: 'success', structured: { verdict: 'approve' } },
    ],
  },
});

test('loadCassette accepts a valid authored cassette and scriptFor preserves script order', (t) => {
  const path = writeCassette(t, VALID_CASSETTE);
  const cassette = loadCassette(path);
  assert.equal(cassette.name, VALID_CASSETTE.name);
  assert.equal(cassette.provenance, 'authored');
  assert.equal(cassette.sourceRun, null);
  assert.ok(Array.isArray(CASSETTE_SCHEMA.required));
  const responses = scriptFor(cassette, 'plan-review');
  assert.equal(responses.length, 3);
  assert.equal(responses[0].structured.verdict, 'needs-changes');
  assert.equal(responses[2].structured.verdict, 'approve');
});

test('loadCassette rejects an unknown kind key in script, naming the key and listing the legal kinds', (t) => {
  const path = writeCassette(t, {
    ...VALID_CASSETTE,
    script: { 'not-a-real-dispatch-kind': [{ ok: true, outcome: 'success', structured: {} }] },
  });
  assert.throws(() => loadCassette(path), (error) => {
    assert.match(error.message, /not-a-real-dispatch-kind/);
    assert.match(error.message, /decompose/);
    assert.match(error.message, /ci-fact-extract/);
    return true;
  });
});

test('loadCassette rejects an ok:false response whose outcome is outside the 13-value dispatch-outcome set', (t) => {
  const path = writeCassette(t, {
    ...VALID_CASSETTE,
    script: {
      'plan-review': [{ ok: false, outcome: 'not-a-real-outcome', error: 'the child fell over' }],
    },
  });
  assert.throws(() => loadCassette(path), (error) => {
    assert.match(error.message, /not-a-real-outcome/);
    return true;
  });
});

test('loadCassette rejects a plan-review response whose structured.verdict is outside approve or needs-changes', (t) => {
  const path = writeCassette(t, {
    ...VALID_CASSETTE,
    script: {
      'plan-review': [{ ok: true, outcome: 'success', structured: { verdict: 'maybe' } }],
    },
  });
  assert.throws(() => loadCassette(path), (error) => {
    assert.match(error.message, /maybe/);
    return true;
  });
});

test('loadCassette rejects a judgment response whose structured.verdict is outside pass or fail', (t) => {
  const path = writeCassette(t, {
    ...VALID_CASSETTE,
    script: {
      review: [{ ok: true, outcome: 'success', structured: { verdict: 'undecided' } }],
    },
  });
  assert.throws(() => loadCassette(path), (error) => {
    assert.match(error.message, /undecided/);
    return true;
  });
});

test('loadCassette rejects provenance recorded with a null sourceRun', (t) => {
  const path = writeCassette(t, {
    ...VALID_CASSETTE,
    provenance: 'recorded',
    sourceRun: null,
  });
  assert.throws(() => loadCassette(path), (error) => {
    assert.match(error.message, /recorded/);
    assert.match(error.message, /sourceRun/);
    return true;
  });
});
