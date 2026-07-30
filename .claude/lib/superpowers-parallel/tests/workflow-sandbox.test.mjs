import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileWorkflow, createHookStubs, SANDBOX_VIOLATION, SandboxViolationError } from '../workflow-sandbox.mjs';

const run = (body, hooks, args) => compileWorkflow(body, hooks)(args);

const isViolation = (error) => Boolean(error) && error[SANDBOX_VIOLATION] === true;

const violation = (deniedName) => (error) => {
  assert.ok(error instanceof SandboxViolationError, `expected a SandboxViolationError, got ${error && error.name}: ${error && error.message}`);
  assert.ok(isViolation(error));
  assert.equal(error.deniedName, deniedName);
  return true;
};

test('deny falsifier: Date.now() rejects with a tagged sandbox violation instead of resolving to an epoch integer', async () => {
  await assert.rejects(run('return Date.now();'), violation('Date'));
});

test('permit falsifier: the allowed intrinsics still execute and return their real value', async () => {
  assert.equal(await run('return JSON.stringify([...new Set([1,1,2])]);'), '[1,2]');
});

for (const [label, body, deniedName] of [
  ['process', 'return process.pid;', 'process'],
  ['fetch', 'return fetch("https://example.invalid");', 'fetch'],
  ['dynamic import', 'return await import("node:fs");', 'import'],
  ['Math.random', 'return Math.random();', 'Math.random'],
  ['argless new Date', 'return new Date();', 'Date'],
  ['new Date with an argument', 'return new Date(0).getTime();', 'Date'],
  ['globalThis', 'return globalThis.process.pid;', 'globalThis'],
  ['setTimeout', 'return setTimeout(() => 1, 0);', 'setTimeout'],
  ['Buffer', 'return Buffer.from("x");', 'Buffer'],
  ['assignment to a denied global', 'process.env = {}; return 1;', 'process'],
  ['binding a denied global then using it', 'const p = process; return p.pid;', 'process'],
]) {
  test(`deny matrix: ${label} rejects with a tagged sandbox violation`, async () => {
    await assert.rejects(run(body), violation(deniedName));
  });
}

for (const [label, body, expected] of [
  ['Math members the engine uses', 'return Math.ceil(1.2) + Math.imul(3, 4) + Math.max(1, 2) + Math.min(1, 2);', 17],
  ['Map and Set', 'return new Map([["a", 1]]).get("a") + new Set([2]).size;', 2],
  ['Array and String', 'return [1, 2, 3].map(String).join("|");', '1|2|3'],
  ['Object and Number and Boolean', 'return Object.keys({ a: 1 }).length + Number("2") + (Boolean(0) ? 9 : 0);', 3],
  ['RegExp', 'return /a(b)/.exec("ab")[1];', 'b'],
  ['Symbol', 'return typeof Symbol("s");', 'symbol'],
  ['Promise', 'return await Promise.resolve("ok");', 'ok'],
  ['Error subclasses', 'return new TypeError("x") instanceof Error && new RangeError("y") instanceof Error;', true],
]) {
  test(`permit matrix: ${label}`, async () => {
    assert.deepEqual(await run(body), expected);
  });
}

test('args reaches the workflow body as an injected global', async () => {
  assert.equal(await run('return args.n * 2;', {}, { n: 21 }), 42);
});

test('log and phase accumulate in call order and are readable through records()', async () => {
  const stubs = createHookStubs();
  await run('phase("one"); log("a"); log("b"); phase("two"); return 1;', stubs.hooks);
  assert.deepEqual(stubs.records().log, ['a', 'b']);
  assert.deepEqual(stubs.records().phases, ['one', 'two']);
});

test('parallel resolves thunks in argument order, not completion order', async () => {
  const stubs = createHookStubs();
  const body = `
    const slow = () => Promise.resolve().then(() => Promise.resolve()).then(() => "first-arg");
    const fast = () => "second-arg";
    const settled = await parallel([slow, fast]);
    return settled.join(",");
  `;
  assert.equal(await run(body, stubs.hooks), 'first-arg,second-arg');
  assert.deepEqual(stubs.records().parallelBatches, [2]);
});

test('pipeline and workflow are functions in the sandbox, not objects', async () => {
  assert.equal(await run('return typeof pipeline + "/" + typeof workflow;'), 'function/function');
});

for (const hookName of ['pipeline', 'workflow', 'agent']) {
  test(`${hookName} throws a clear not-stubbed error rather than a sandbox violation when unsupplied`, async () => {
    await assert.rejects(run(`return ${hookName}({});`), (error) => {
      assert.equal(isViolation(error), false);
      assert.match(error.message, new RegExp(`"${hookName}\\(\\)" is not stubbed for this test`));
      return true;
    });
  });
}

test('a supplied hook overrides its stub and receives the workflow call', async () => {
  const seen = [];
  const agent = async (prompt) => { seen.push(prompt); return `handled:${prompt}`; };
  assert.equal(await run('return agent("plan");', { agent }), 'handled:plan');
  assert.deepEqual(seen, ['plan']);
});

test('errors thrown inside the workflow body propagate unchanged', async () => {
  await assert.rejects(run('throw new RangeError("boom");'), (error) => {
    assert.equal(isViolation(error), false);
    assert.equal(error.message, 'boom');
    return true;
  });
});

test('compileWorkflow validates its inputs at the boundary', () => {
  assert.throws(() => compileWorkflow(null), /source as a string, received null/);
  assert.throws(() => compileWorkflow('   '), /non-empty workflow source/);
  assert.throws(() => compileWorkflow('return 1;', { nope: () => {} }), /unknown hook "nope"/);
  assert.throws(() => compileWorkflow('return 1;', { log: 'not-a-function' }), /hook "log" to be a function/);
  assert.throws(() => compileWorkflow('return ((;'), /failed to compile in the sandbox/);
});
