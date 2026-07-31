import { compileFunction, constants, createContext, runInContext } from 'node:vm';

export const SANDBOX_VIOLATION = Symbol.for('mitosis.workflow-sandbox.violation');

const RUNTIME_ABSENT = 'the Workflow runtime does not provide it';

export class SandboxViolationError extends Error {
  constructor(deniedName, operation, reason = RUNTIME_ABSENT) {
    super(`workflow sandbox violation: ${operation} on "${deniedName}" — ${reason}`);
    this.name = 'SandboxViolationError';
    this.deniedName = deniedName;
    this.operation = operation;
    this.reason = reason;
    this[SANDBOX_VIOLATION] = true;
  }
}

export const ALLOWED_GLOBALS = Object.freeze([
  'Array', 'Object', 'JSON', 'Set', 'Error', 'Number', 'Map', 'Math',
  'String', 'Boolean', 'Promise', 'TypeError', 'RangeError', 'RegExp', 'Symbol',
]);

export const VALUE_GLOBALS = Object.freeze(['undefined', 'NaN', 'Infinity']);

export const ALWAYS_DENIED = Object.freeze([
  'require', 'module', 'exports', '__dirname', '__filename', 'process', 'console', 'eval', 'Function',
  'AggregateError', 'ArrayBuffer', 'AsyncDisposableStack', 'Atomics', 'BigInt', 'BigInt64Array',
  'BigUint64Array', 'DataView', 'DisposableStack', 'EvalError', 'FinalizationRegistry', 'Float16Array',
  'Float32Array', 'Float64Array', 'Int16Array', 'Int32Array', 'Int8Array', 'Intl', 'Iterator', 'Proxy',
  'ReferenceError', 'Reflect', 'SharedArrayBuffer', 'SuppressedError', 'SyntaxError', 'Temporal', 'URIError',
  'Uint16Array', 'Uint32Array', 'Uint8Array', 'Uint8ClampedArray', 'WeakMap', 'WeakRef', 'WeakSet',
  'WebAssembly', 'decodeURI', 'decodeURIComponent', 'encodeURI', 'encodeURIComponent', 'escape', 'isFinite',
  'isNaN', 'parseFloat', 'parseInt', 'unescape',
]);

export const HOOK_NAMES = Object.freeze(['args', 'agent', 'parallel', 'pipeline', 'log', 'phase', 'workflow']);

export const DETERMINISM_POLICY = Object.freeze({
  Date: 'policy, not a sandbox defect: the determinism contract bans every wall-clock and timezone read, and the engine is Date-free, so the whole constructor is denied — including new Date(isoString)',
  'Math.random': 'policy, not a sandbox defect: the determinism contract requires identical output for identical input',
});

const GUARDED_INTRINSICS = Object.freeze({ Math: Object.freeze(['random']) });

const BOUND_DENIALS = Object.freeze({
  Date: Object.freeze({ callable: true, reason: DETERMINISM_POLICY.Date }),
  globalThis: Object.freeze({
    callable: false,
    reason: 'the global object is a capability gateway; reach a capability through an injected hook instead',
  }),
});

const DYNAMIC_IMPORT_CODE = 'ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING';

const CONTEXT_INSTALLER = `(pruned, bindings) => {
  const globals = globalThis;
  const describe = Object.getOwnPropertyDescriptor;
  const define = Object.defineProperty;
  let survived = [];
  for (let i = 0; i < pruned.length; i += 1) {
    delete globals[pruned[i]];
    if (describe(globals, pruned[i])) survived = [...survived, pruned[i]];
  }
  for (let i = 0; i < bindings.length; i += 1) {
    define(globals, bindings[i][0], { value: bindings[i][1], writable: false, enumerable: false, configurable: false });
  }
  return survived.join(', ');
}`;

const POLICY_LISTS = 'ALLOWED_GLOBALS, VALUE_GLOBALS, ALWAYS_DENIED or BOUND_DENIALS';

function policyFailure(problem, names) {
  return new Error(`workflow sandbox policy: ${problem}: ${names.join(', ')}`);
}

function retainedNames() {
  return [...ALLOWED_GLOBALS, ...VALUE_GLOBALS];
}

function boundNames() {
  return Object.keys(BOUND_DENIALS);
}

function assertPolicyListsAgree() {
  const denied = new Set(ALWAYS_DENIED);
  const bound = new Set(boundNames());
  const claimedTwice = [
    ...retainedNames().filter((name) => denied.has(name) || bound.has(name)),
    ...boundNames().filter((name) => denied.has(name)),
  ];
  if (claimedTwice.length > 0) {
    throw policyFailure('names claimed by more than one policy list', [...new Set(claimedTwice)]);
  }
  const retained = new Set(retainedNames());
  const unretainedGuards = Object.keys(GUARDED_INTRINSICS).filter((name) => !retained.has(name));
  if (unretainedGuards.length > 0) {
    throw policyFailure('guarded intrinsics missing from the retained lists', unretainedGuards);
  }
}

function prunePlan(realmNames) {
  assertPolicyListsAgree();
  const present = new Set(realmNames);
  const declared = [...retainedNames(), ...boundNames()];
  const absent = declared.filter((name) => !present.has(name));
  if (absent.length > 0) {
    throw policyFailure('retained and bound names the realm global does not carry', absent);
  }
  const retained = new Set(retainedNames());
  const bound = new Set(boundNames());
  const denied = new Set(ALWAYS_DENIED);
  const unclassified = realmNames.filter((name) => !retained.has(name) && !bound.has(name) && !denied.has(name));
  if (unclassified.length > 0) {
    throw policyFailure(`the realm global carries names no policy list classifies, so classify each in ${POLICY_LISTS}`, unclassified);
  }
  return realmNames.filter((name) => denied.has(name) || bound.has(name));
}

function denyBinding(name, { callable, reason }) {
  const raise = (operation) => { throw new SandboxViolationError(name, operation, reason); };
  return new Proxy(callable ? function denied() {} : {}, {
    get: (_target, property) => raise(`read of .${String(property)}`),
    set: (_target, property) => raise(`assignment to .${String(property)}`),
    deleteProperty: (_target, property) => raise(`deletion of .${String(property)}`),
    defineProperty: (_target, property) => raise(`definition of .${String(property)}`),
    getOwnPropertyDescriptor: (_target, property) => raise(`descriptor read of .${String(property)}`),
    has: () => raise('membership test'),
    ownKeys: () => raise('key enumeration'),
    getPrototypeOf: () => raise('prototype read'),
    setPrototypeOf: () => raise('prototype assignment'),
    isExtensible: () => raise('extensibility probe'),
    preventExtensions: () => raise('extension lock'),
    apply: () => raise('call'),
    construct: () => raise('construction'),
  });
}

const INTEGRITY_LOCK_REASON = 'the sandbox hides denied members from key enumeration, which an integrity lock cannot preserve';

function guardedBinding(name, target, deniedMembers) {
  const denied = new Set(deniedMembers);
  const guard = (property, operation) => {
    if (!denied.has(property)) return;
    const member = `${name}.${String(property)}`;
    throw new SandboxViolationError(member, operation, DETERMINISM_POLICY[member] ?? RUNTIME_ABSENT);
  };
  return new Proxy(target, {
    get: (subject, property, receiver) => { guard(property, 'read'); return Reflect.get(subject, property, receiver); },
    has: (subject, property) => { guard(property, 'membership test'); return Reflect.has(subject, property); },
    getOwnPropertyDescriptor: (subject, property) => {
      guard(property, 'descriptor read');
      return Reflect.getOwnPropertyDescriptor(subject, property);
    },
    ownKeys: (subject) => Reflect.ownKeys(subject).filter((key) => !denied.has(key)),
    set: (subject, property, value, receiver) => {
      guard(property, 'assignment to');
      return Reflect.set(subject, property, value, receiver);
    },
    defineProperty: (subject, property, descriptor) => {
      guard(property, 'definition of');
      return Reflect.defineProperty(subject, property, descriptor);
    },
    deleteProperty: (subject, property) => {
      guard(property, 'deletion of');
      return Reflect.deleteProperty(subject, property);
    },
    preventExtensions: () => {
      throw new SandboxViolationError(name, 'extension lock', INTEGRITY_LOCK_REASON);
    },
  });
}

function createSandboxContext() {
  const context = createContext(constants.DONT_CONTEXTIFY);
  const install = runInContext(CONTEXT_INSTALLER, context);
  const pruned = prunePlan([...runInContext('Object.getOwnPropertyNames(globalThis)', context)]);
  const guarded = Object.keys(GUARDED_INTRINSICS)
    .map((name) => [name, guardedBinding(name, runInContext(name, context), GUARDED_INTRINSICS[name])]);
  const denied = boundNames().map((name) => [name, denyBinding(name, BOUND_DENIALS[name])]);
  const survived = install(pruned, [...guarded, ...denied]);
  if (survived !== '') throw policyFailure('denied names that survived the prune', survived.split(', '));
  return context;
}

function notStubbed(hookName) {
  return () => {
    throw new Error(`workflow hook "${hookName}()" is not stubbed for this test`);
  };
}

function runParallel(record) {
  return async (thunks) => {
    if (!Array.isArray(thunks)) {
      throw new TypeError(`parallel() expects an array of thunks, received ${typeof thunks}`);
    }
    const invalid = thunks.findIndex((thunk) => typeof thunk !== 'function');
    if (invalid >= 0) {
      throw new TypeError(`parallel() expects every entry to be a function, entry ${invalid} is ${typeof thunks[invalid]}`);
    }
    record(thunks.length);
    return Promise.all(thunks.map((thunk) => thunk()));
  };
}

function validateHookMap(candidate) {
  if (candidate === null || typeof candidate !== 'object') {
    throw new TypeError(`workflow hooks must be an object, received ${candidate === null ? 'null' : typeof candidate}`);
  }
  const injectable = HOOK_NAMES.filter((name) => name !== 'args');
  for (const name of Object.keys(candidate)) {
    if (!injectable.includes(name)) {
      throw new TypeError(`workflow hooks received an unknown hook "${name}"; known hooks are ${injectable.join(', ')}`);
    }
    if (typeof candidate[name] !== 'function') {
      throw new TypeError(`workflow hooks expect hook "${name}" to be a function, received ${typeof candidate[name]}`);
    }
  }
  return candidate;
}

export function createHookStubs(overrides = {}) {
  validateHookMap(overrides);
  let log = [];
  let phases = [];
  let parallelBatches = [];
  const defaults = {
    agent: notStubbed('agent'),
    pipeline: notStubbed('pipeline'),
    workflow: notStubbed('workflow'),
    parallel: runParallel((size) => { parallelBatches = [...parallelBatches, size]; }),
    log: (line) => { log = [...log, String(line)]; },
    phase: (name) => { phases = [...phases, String(name)]; },
  };
  const hooks = Object.freeze({ ...defaults, ...overrides });
  const records = () => Object.freeze({ log: [...log], phases: [...phases], parallelBatches: [...parallelBatches] });
  return Object.freeze({ hooks, records });
}

function validateSource(source) {
  if (typeof source !== 'string') {
    throw new TypeError(`compileWorkflow expects the workflow source as a string, received ${source === null ? 'null' : typeof source}`);
  }
  if (source.trim() === '') {
    throw new TypeError('compileWorkflow expects a non-empty workflow source');
  }
}

function compileInSandbox(source) {
  const parsingContext = createSandboxContext();
  try {
    return compileFunction(`return (async () => {\n${source}\n})();`, [...HOOK_NAMES], {
      filename: 'workflow-sandbox-compiled.js',
      parsingContext,
    });
  } catch (error) {
    throw new Error(`workflow source failed to compile in the sandbox: ${error.message}`, { cause: error });
  }
}

export function compileWorkflow(source, hooks = {}) {
  validateSource(source);
  const stubs = createHookStubs(hooks);
  const compiled = compileInSandbox(source);
  const bound = HOOK_NAMES.slice(1).map((name) => stubs.hooks[name]);
  const invokeWorkflow = async (args) => {
    try {
      return await compiled(args, ...bound);
    } catch (error) {
      if (error && error.code === DYNAMIC_IMPORT_CODE) throw new SandboxViolationError('import', 'dynamic import()');
      throw error;
    }
  };
  invokeWorkflow.records = stubs.records;
  return Object.freeze(invokeWorkflow);
}
