import { test } from 'node:test';
import assert from 'node:assert/strict';
import { constants, createContext, runInContext } from 'node:vm';
import { SANDBOX_VIOLATION, compileWorkflow } from '../workflow-sandbox.mjs';

const TRAP_UNIVERSE = Object.freeze(
  Object.getOwnPropertyNames(Reflect).filter((name) => typeof Reflect[name] === 'function').sort(),
);

const TRAP_OPERATIONS = Object.freeze({
  apply: Object.freeze(['SUBJECT()']),
  construct: Object.freeze(['new SUBJECT()']),
  defineProperty: Object.freeze(['Object.defineProperty(SUBJECT, "MEMBER", { value: 1 })']),
  deleteProperty: Object.freeze(['delete SUBJECT.MEMBER']),
  get: Object.freeze(['SUBJECT.MEMBER']),
  getOwnPropertyDescriptor: Object.freeze(['Object.getOwnPropertyDescriptor(SUBJECT, "MEMBER")']),
  getPrototypeOf: Object.freeze(['Object.getPrototypeOf(SUBJECT)']),
  has: Object.freeze(['"MEMBER" in SUBJECT']),
  isExtensible: Object.freeze(['Object.isExtensible(SUBJECT)']),
  ownKeys: Object.freeze(['Object.getOwnPropertyNames(SUBJECT)', 'Object.keys(SUBJECT)', '({ ...SUBJECT })']),
  preventExtensions: Object.freeze(['Object.preventExtensions(SUBJECT)', 'Object.freeze(SUBJECT)', 'Object.seal(SUBJECT)']),
  set: Object.freeze(['SUBJECT.MEMBER = 1']),
  setPrototypeOf: Object.freeze(['Object.setPrototypeOf(SUBJECT, null)']),
});

const BINDINGS = Object.freeze([
  Object.freeze({ label: 'guarded Math, permitted member', subject: 'Math', member: 'ceil', kind: 'guarded' }),
  Object.freeze({ label: 'guarded Math, denied member', subject: 'Math', member: 'random', kind: 'guarded-denied' }),
  Object.freeze({ label: 'denied Date binding', subject: 'Date', member: 'now', kind: 'denied' }),
  Object.freeze({ label: 'denied globalThis binding', subject: 'globalThis', member: 'Math', kind: 'denied' }),
]);

const DECLARED_DENIED_MEMBERS = Object.freeze(['random']);

const expand = (template, binding) => template.split('SUBJECT').join(binding.subject).split('MEMBER').join(binding.member);

const bodyFor = (expression) => `void (${expression}); return "ok";`;

async function sandboxOutcome(body) {
  try {
    await compileWorkflow(body)({});
    return { threw: false, tagged: false, name: null };
  } catch (error) {
    return {
      threw: true,
      tagged: Boolean(error) && error[SANDBOX_VIOLATION] === true,
      name: (error && error.name) || null,
    };
  }
}

function controlOutcome(body) {
  const context = createContext(constants.DONT_CONTEXTIFY);
  try {
    runInContext(`(() => { ${body} })();`, context);
    return { threw: false, name: null };
  } catch (error) {
    return { threw: true, name: (error && error.name) || null };
  }
}

function classify(sandbox, control) {
  if (!sandbox.threw) return 'permitted';
  if (sandbox.tagged) return 'denied-tagged';
  if (sandbox.name === null) return 'unclassifiable-throw';
  if (control.threw && control.name === sandbox.name) return 'language';
  return `untagged-sandbox-error(${sandbox.name})`;
}

async function trapCensus() {
  const rows = [];
  for (const binding of BINDINGS) {
    for (const trap of Object.keys(TRAP_OPERATIONS)) {
      for (const template of TRAP_OPERATIONS[trap]) {
        const expression = expand(template, binding);
        const body = bodyFor(expression);
        const sandbox = await sandboxOutcome(body);
        const verdict = classify(sandbox, controlOutcome(body));
        rows.push({ binding, trap, template, expression, verdict });
      }
    }
  }
  return rows;
}

const census = await trapCensus();

test('B2 universe: the censused operations are exactly the Reflect-derived proxy-trap set', () => {
  assert.ok(TRAP_UNIVERSE.length > 0, 'the proxy-trap universe derived from Reflect is empty');
  assert.deepEqual(Object.keys(TRAP_OPERATIONS).sort(), [...TRAP_UNIVERSE]);
  const empty = Object.keys(TRAP_OPERATIONS).filter((trap) => TRAP_OPERATIONS[trap].length === 0);
  assert.deepEqual(empty, [], `these traps carry no driving operation: ${empty.join(', ')}`);
});

test('B2 census coverage: every trap is exercised against every guarded and denied binding', () => {
  const expected = BINDINGS.flatMap((binding) => TRAP_UNIVERSE.map((trap) => `${binding.label} :: ${trap}`)).sort();
  const covered = [...new Set(census.map((row) => `${row.binding.label} :: ${row.trap}`))].sort();
  assert.deepEqual(covered, expected);
});

test('B2: no sandbox binding raises an untagged host error under any proxy trap', () => {
  const breaches = census
    .filter((row) => row.verdict.startsWith('untagged-sandbox-error') || row.verdict === 'unclassifiable-throw')
    .map((row) => `${row.binding.label} :: ${row.trap} :: ${row.expression} -> ${row.verdict}`);
  assert.deepEqual(breaches, [], `sandbox mechanisms raising errors a workflow cannot tell from its own:\n${breaches.join('\n')}`);
});

test('B2 handler census: every trap on a denied binding is refused, by the sandbox or by the language', () => {
  const permitted = census
    .filter((row) => row.binding.kind === 'denied' && row.verdict === 'permitted')
    .map((row) => `${row.binding.label} :: ${row.trap} :: ${row.expression}`);
  assert.deepEqual(permitted, [], `denied bindings permitting an operation, so the trap is missing or misnamed:\n${permitted.join('\n')}`);
});

test('B2/B3 interaction: every member-bearing trap on a denied member stays a tagged violation', () => {
  const memberTraps = Object.keys(TRAP_OPERATIONS).filter((trap) => TRAP_OPERATIONS[trap].some((template) => template.includes('MEMBER')));
  assert.ok(memberTraps.length > 0, 'no trap template references a member, so the interaction row is vacuous');
  const untagged = census
    .filter((row) => row.binding.kind === 'guarded-denied' && memberTraps.includes(row.trap) && row.verdict !== 'denied-tagged')
    .map((row) => `${row.trap} :: ${row.expression} -> ${row.verdict}`);
  assert.deepEqual(untagged, [], `denied-member operations that stopped being tagged violations:\n${untagged.join('\n')}`);
});

const WELL_KNOWN_SYMBOLS = Object.getOwnPropertyNames(Symbol).filter((name) => typeof Symbol[name] === 'symbol');

function keyExpression(key) {
  if (typeof key === 'string') return JSON.stringify(key);
  const wellKnown = WELL_KNOWN_SYMBOLS.find((name) => Symbol[name] === key);
  return wellKnown ? `Symbol.${wellKnown}` : null;
}

const MATH_KEYS = Reflect.ownKeys(Math);
const COMPLEMENT_KEYS = MATH_KEYS.filter((key) => !DECLARED_DENIED_MEMBERS.includes(key));

const MEMBER_OPERATIONS = Object.freeze({
  get: 'void Math[key];',
  set: 'Math[key] = 1;',
  delete: 'delete Math[key];',
  defineProperty: 'Object.defineProperty(Math, key, { value: 1 });',
});

async function taggedMembersFor(operation, keys) {
  const expressions = keys.map(keyExpression);
  const body = `
    const tag = Symbol.for("mitosis.workflow-sandbox.violation");
    const keys = [${expressions.join(', ')}];
    let tagged = [];
    for (const key of keys) {
      try { ${MEMBER_OPERATIONS[operation]} } catch (error) {
        if (error && error[tag] === true) tagged = [...tagged, String(key)];
      }
    }
    return JSON.stringify(tagged);
  `;
  return JSON.parse(await compileWorkflow(body)({}));
}

test('B3 universe: the guarded intrinsic partitions into declared denied members and their complement', () => {
  assert.ok(MATH_KEYS.length > 0, 'the guarded-intrinsic key universe is empty');
  const unexpressible = MATH_KEYS.filter((key) => keyExpression(key) === null).map(String);
  assert.deepEqual(unexpressible, [], `guarded-intrinsic keys with no sandbox-expressible form: ${unexpressible.join(', ')}`);
  const missingDenied = DECLARED_DENIED_MEMBERS.filter((key) => !MATH_KEYS.includes(key));
  assert.deepEqual(missingDenied, [], `declared denied members absent from the intrinsic: ${missingDenied.join(', ')}`);
  assert.deepEqual(
    [...COMPLEMENT_KEYS, ...DECLARED_DENIED_MEMBERS].map(String).sort(),
    MATH_KEYS.map(String).sort(),
  );
  const realm = createContext(constants.DONT_CONTEXTIFY);
  assert.deepEqual(
    [...runInContext('Object.getOwnPropertyNames(Math)', realm)].sort(),
    MATH_KEYS.filter((key) => typeof key === 'string').sort(),
  );
});

for (const operation of Object.keys(MEMBER_OPERATIONS)) {
  test(`B3 complement census: ${operation} raises no tagged violation on any non-denied member of the guarded intrinsic`, async () => {
    const tagged = await taggedMembersFor(operation, COMPLEMENT_KEYS);
    assert.deepEqual(tagged, [], `non-denied members denied by the sandbox under ${operation}: ${tagged.join(', ')}`);
  });

  test(`B3 denied row: ${operation} stays a tagged violation on every declared denied member`, async () => {
    const tagged = await taggedMembersFor(operation, DECLARED_DENIED_MEMBERS);
    assert.deepEqual(tagged, [...DECLARED_DENIED_MEMBERS].map(String));
  });
}
