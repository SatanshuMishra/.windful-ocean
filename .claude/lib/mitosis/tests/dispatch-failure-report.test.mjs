import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pack } from './file-scope-fixtures.mjs';
import { realPorts, runCli } from '../cli.mjs';
import { NeedsHuman } from '../boundary.mjs';

const EXIT_INCOMPLETE = 3;

function tempRoot(t) {
  const root = mkdtempSync(join(tmpdir(), 'mitosis-dispatch-report-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function fullArgv(root) {
  return [
    '--spec', '/spec.json',
    '--run-id', '0a1b2c3d',
    '--at', '2026-08-15T12:00:00Z',
    '--repo-root', root,
    '--journal', join(root, '.mitosis', 'run.jsonl'),
    '--repo-slug', 'acme/widgets',
    '--integration-branch', 'integration',
  ];
}

function specWithUnit(unit) {
  return {
    manifest: { logicalRunId: 'r1', clusters: [], msps: [{ id: 'm1' }] },
    specs: [{ id: 'alpha', fileScope: pack(['alpha.mjs']), ...unit }],
  };
}

function stubIo(spec) {
  const out = [];
  const errOut = [];
  return {
    out,
    errOut,
    log: (text) => { out.push(text); },
    err: (text) => { errOut.push(text); },
    readSpec: () => spec,
  };
}

function inertDeps() {
  return {
    writeGenesis: async () => {},
    appendJournalLine: async () => {},
    execAllowed: () => '',
    run: () => ({ state: 'OPEN' }),
  };
}

function parkingPorts() {
  return {
    runUnit: async () => NeedsHuman({ kind: 'ask' }, []),
    writeGenesis: async () => {},
    appendJournal: async () => {},
    writeRef: async () => {},
    gh: async () => ({ state: 'OPEN' }),
  };
}

async function runWithRealPorts(root, spec) {
  const io = stubIo(spec);
  const code = await runCli(fullArgv(root), io, (config) => realPorts(config, inertDeps()));
  return { code, stderr: io.errOut.join(''), stdout: io.out.join('') };
}

test('UNDISPATCHABLE UNIT: a spec unit carrying no request reports its cause on stderr instead of parking silently', async (t) => {
  const result = await runWithRealPorts(tempRoot(t), specWithUnit({}));
  assert.notEqual(result.stderr, '');
  assert.match(result.stderr, /alpha/);
  assert.match(result.stderr, /request/i);
  assert.equal(result.code, EXIT_INCOMPLETE);
});

test('UNDISPATCHABLE UNIT: a request that is not an object reports its cause on stderr', async (t) => {
  const root = tempRoot(t);
  for (const request of ['a string', 42, null, ['an', 'array']]) {
    const result = await runWithRealPorts(root, specWithUnit({ request }));
    assert.notEqual(result.stderr, '', `a request of ${JSON.stringify(request)} left stderr empty`);
    assert.match(result.stderr, /alpha/);
    assert.equal(result.code, EXIT_INCOMPLETE);
  }
});

test('HUMAN ESCALATION STAYS QUIET: a unit that parks for a human writes nothing to stderr', async (t) => {
  const io = stubIo(specWithUnit({ request: { prompt: 'do alpha' } }));
  const code = await runCli(fullArgv(tempRoot(t)), io, () => parkingPorts());
  assert.equal(io.errOut.join(''), '');
  assert.match(io.out.join(''), /"state": "parked"/);
  assert.equal(code, EXIT_INCOMPLETE);
});

test('MALFORMED REQUEST FIELDS: every dispatch validation failure names the unit and the field on stderr', async (t) => {
  const root = tempRoot(t);
  const malformed = [
    ['prompt', { prompt: 42 }],
    ['model', { prompt: 'do alpha', model: '--sneaky' }],
    ['cwd', { prompt: 'do alpha', cwd: 'relative/path' }],
    ['timeoutMs', { prompt: 'do alpha', timeoutMs: 0 }],
  ];
  for (const [field, request] of malformed) {
    const result = await runWithRealPorts(root, specWithUnit({ request }));
    assert.notEqual(result.stderr, '', `a malformed ${field} left stderr empty`);
    assert.match(result.stderr, /alpha/);
    assert.match(result.stderr, new RegExp(field));
    assert.equal(result.code, EXIT_INCOMPLETE);
  }
});
