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

const unbound = (name) => (error) => {
  assert.equal(error && error.name, 'ReferenceError', `expected a ReferenceError, got ${error && error.name}: ${error && error.message}`);
  assert.equal(isViolation(error), false, `"${name}" must be absent from the sandbox realm, not shadowed by a throwing binding`);
  assert.match(error.message, new RegExp(`${name} is not defined`));
  return true;
};

test('deny falsifier: Date.now() rejects with a tagged sandbox violation instead of resolving to an epoch integer', async () => {
  await assert.rejects(run('return Date.now();'), violation('Date'));
});

test('permit falsifier: the allowed intrinsics still execute and return their real value', async () => {
  assert.equal(await run('return JSON.stringify([...new Set([1,1,2])]);'), '[1,2]');
});

for (const [label, body, deniedName] of [
  ['dynamic import', 'return await import("node:fs");', 'import'],
  ['Math.random', 'return Math.random();', 'Math.random'],
  ['argless new Date', 'return new Date();', 'Date'],
  ['new Date with an argument', 'return new Date(0).getTime();', 'Date'],
  ['globalThis', 'return globalThis.process.pid;', 'globalThis'],
  ['globalThis membership test', 'return "process" in globalThis;', 'globalThis'],
  ['binding globalThis then reading through it', 'const g = globalThis; return g.Math;', 'globalThis'],
  ['assignment through globalThis', 'globalThis.leak = 1; return 1;', 'globalThis'],
  ['Math.random assignment', 'Math.random = () => 0.5; return 1;', 'Math.random'],
]) {
  test(`deny matrix: ${label} rejects with a tagged sandbox violation`, async () => {
    await assert.rejects(run(body), violation(deniedName));
  });
}

for (const [label, body, name] of [
  ['process', 'return process.pid;', 'process'],
  ['fetch', 'return fetch("https://example.invalid");', 'fetch'],
  ['setTimeout', 'return setTimeout(() => 1, 0);', 'setTimeout'],
  ['Buffer', 'return Buffer.from("x");', 'Buffer'],
  ['require', 'return require("node:fs");', 'require'],
  ['console', 'console.log("x"); return 1;', 'console'],
  ['eval', 'return eval("1 + 1");', 'eval'],
  ['assignment to a denied global', 'process.env = {}; return 1;', 'process'],
  ['binding a denied global then using it', 'const p = process; return p.pid;', 'process'],
]) {
  test(`absence matrix: ${label} is unbound in the sandbox realm exactly as it is in production`, async () => {
    await assert.rejects(run(body), unbound(name));
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

for (const [label, body, expected] of [
  ['void 0 compares equal to undefined', 'const x = void 0; return x === undefined;', true],
  ['an absent property compares equal to undefined', 'return ({}).missing === undefined;', true],
  ['undefined takes the undefined branch', 'const x = void 0; return x !== undefined ? "took-defined-branch" : "took-undefined-branch";', 'took-undefined-branch'],
  ['typeof undefined is the primitive name', 'return typeof undefined;', 'undefined'],
  ['overflow compares equal to Infinity', 'return 1e999 === Infinity;', true],
  ['negative overflow compares equal to -Infinity', 'return -1e999 === -Infinity;', true],
  ['Infinity is a number', 'return typeof Infinity;', 'number'],
  ['NaN is never equal to itself', 'return NaN === NaN;', false],
  ['NaN is recognised by Number.isNaN', 'return Number.isNaN(NaN) && Number.isNaN(0 / 0);', true],
  ['NaN is a number', 'return typeof NaN;', 'number'],
]) {
  test(`value globals keep production semantics: ${label}`, async () => {
    assert.deepEqual(await run(body), expected);
  });
}

for (const [label, body, expected] of [
  ['fetch', 'return typeof fetch;', 'undefined'],
  ['process', 'return typeof process;', 'undefined'],
  ['setTimeout', 'return typeof setTimeout;', 'undefined'],
  ['require', 'return typeof require;', 'undefined'],
  ['Buffer', 'return typeof Buffer;', 'undefined'],
  ['console', 'return typeof console;', 'undefined'],
]) {
  test(`typeof reports a denied capability as absent: ${label}`, async () => {
    assert.equal(await run(body), expected);
  });
}

for (const [label, body, expected] of [
  ['typeof-guarded fetch', 'return typeof fetch !== "undefined" ? "cap" : "fallback";', 'fallback'],
  ['typeof-guarded process', 'return typeof process === "undefined" ? "no-process" : "has-process";', 'no-process'],
  ['truthiness-guarded setTimeout', 'return typeof setTimeout !== "undefined" && Boolean(setTimeout) ? "truthy" : "falsy";', 'falsy'],
  ['typeof-guarded require', 'return typeof require === "function" ? "cjs" : "esm";', 'esm'],
]) {
  test(`guarded feature detection takes the production branch: ${label}`, async () => {
    assert.equal(await run(body), expected);
  });
}

for (const [label, body, expected] of [
  [
    'the models-knob shape returns ok for an unsupplied value',
    'const validate = (models) => { if (models === undefined || models === null) return { ok: true, reason: null }; return { ok: false, reason: "rejected" }; }; return JSON.stringify(validate());',
    '{"ok":true,"reason":null}',
  ],
  [
    'the settle shape reports done when no fault is supplied',
    'const settle = (value, fault) => { if (fault === undefined || fault === null) return "Done:" + value; return "Fault:" + fault; }; return settle("payload");',
    'Done:payload',
  ],
  [
    'the shadowed-row shape skips rows whose field is undefined',
    'const rows = [{ id: 1 }, { id: 2, shadowed: "real" }]; let kept = []; for (const row of rows) { if (row.shadowed === undefined) continue; kept = [...kept, row.shadowed]; } return JSON.stringify(kept);',
    '["real"]',
  ],
]) {
  test(`engine control flow lifted from mitosis.js matches production: ${label}`, async () => {
    assert.equal(await run(body), expected);
  });
}

for (const [label, body] of [
  ['descriptor read', 'return typeof Object.getOwnPropertyDescriptor(Math, "random").value();'],
  ['descriptor read then a detached call', 'const d = Object.getOwnPropertyDescriptor(Math, "random"); return typeof d.value.call(null);'],
  ['sloppy-mode this then the guarded member', 'const g = (function(){return this})(); return typeof g.Math.random();'],
  ['destructuring', 'const { random } = Math; return typeof random();'],
  ['generic indexed read', 'const read = (o, k) => o[k]; return typeof read(Math, "random")();'],
  ['dynamically compiled function', 'return typeof [].constructor.constructor("return Math.random()")();'],
]) {
  test(`the guarded Math binding is not bypassed by ${label}`, async () => {
    await assert.rejects(run(body), violation('Math.random'));
  });
}

test('the guarded Math binding hides random from key enumeration without breaking the enumerable surface', async () => {
  assert.equal(await run('return JSON.stringify(Object.getOwnPropertyNames(Math).includes("random"));'), 'false');
  assert.equal(await run('return JSON.stringify(Object.entries(Math));'), '[]');
  assert.equal(await run('return JSON.stringify({ ...Math });'), '{}');
  assert.equal(await run('return typeof Object.getOwnPropertyDescriptor(Math, "ceil").value;'), 'function');
});

for (const [label, body, expected] of [
  ['Date', 'const g = (function(){return this})(); return typeof g.Date;', 'function'],
  ['eval', 'const g = (function(){return this})(); return typeof g.eval;', 'undefined'],
  ['process', 'const g = (function(){return this})(); return typeof g.process;', 'undefined'],
  ['console', 'const g = (function(){return this})(); return typeof g.console;', 'undefined'],
  ['a dynamically compiled realm probe', 'return [].constructor.constructor("return typeof process")();', 'undefined'],
]) {
  test(`the sloppy-mode this escape reaches a pruned realm: ${label}`, async () => {
    assert.equal(await run(body), expected);
  });
}

test('the sloppy-mode this escape still hits the tagged denials', async () => {
  await assert.rejects(run('const g = (function(){return this})(); return g.Date.now();'), violation('Date'));
  await assert.rejects(run('return [].constructor.constructor("return new Date()")();'), violation('Date'));
});

test('the wholesale Date denial reports itself as determinism policy rather than a sandbox defect', async () => {
  await assert.rejects(run('return new Date("2026-07-30T00:00:00Z").getTime();'), (error) => {
    assert.ok(violation('Date')(error));
    assert.match(error.reason, /policy, not a sandbox defect/);
    assert.match(error.reason, /new Date\(isoString\)/);
    return true;
  });
  await assert.rejects(run('return Math.random();'), (error) => {
    assert.match(error.reason, /policy, not a sandbox defect/);
    return true;
  });
  assert.equal(await run('return typeof Date;'), 'function');
});

test('args reaches the workflow body as an injected global', async () => {
  assert.equal(await run('return args.n * 2;', {}, { n: 21 }), 42);
});

test('log and phase accumulate in call order and are readable through records()', async () => {
  const stubs = createHookStubs();
  await run('phase("one"); log("a"); log("b"); phase("two"); return 1;', stubs.hooks);
  assert.deepEqual(stubs.records().log, ['a', 'b']);
  assert.deepEqual(stubs.records().phases, ['one', 'two']);
});

test('a partial hook set still exposes the stub records it did not override', async () => {
  const compiled = compileWorkflow('phase("start"); log("kept"); return agent("plan");', { agent: async () => 'ok' });
  assert.equal(await compiled({}), 'ok');
  assert.deepEqual(compiled.records().log, ['kept']);
  assert.deepEqual(compiled.records().phases, ['start']);
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

test('an error raised by the sandbox realm carries that realm identity, not the host realm one', async () => {
  await assert.rejects(run('return process.pid;'), (error) => {
    assert.equal(error.name, 'ReferenceError');
    assert.equal(error instanceof ReferenceError, false);
    return true;
  });
  assert.equal(await run('try { process.pid; return "no-throw"; } catch (error) { return error instanceof Error && error.name; }'), 'ReferenceError');
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
  assert.throws(() => compileWorkflow('return 1;', null), /workflow hooks must be an object, received null/);
  assert.throws(() => compileWorkflow('return 1;', { nope: () => {} }), /unknown hook "nope"/);
  assert.throws(() => compileWorkflow('return 1;', { log: 'not-a-function' }), /hook "log" to be a function/);
  assert.throws(() => compileWorkflow('return ((;'), /failed to compile in the sandbox/);
});

test('createHookStubs applies the same override validation as compileWorkflow', () => {
  assert.throws(() => createHookStubs(null), /workflow hooks must be an object, received null/);
  assert.throws(() => createHookStubs('nope'), /workflow hooks must be an object, received string/);
  assert.throws(() => createHookStubs({ log: 'not-a-function' }), /hook "log" to be a function, received string/);
  assert.throws(() => createHookStubs({ args: () => {} }), /unknown hook "args"/);
  assert.throws(() => createHookStubs({ nope: () => {} }), /unknown hook "nope"/);
});
