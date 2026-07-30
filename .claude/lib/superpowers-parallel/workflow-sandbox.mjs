import { compileFunction, createContext, runInContext } from 'node:vm';

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

export const HOOK_NAMES = Object.freeze(['args', 'agent', 'parallel', 'pipeline', 'log', 'phase', 'workflow']);

const GUARDED_INTRINSICS = Object.freeze({ Math: Object.freeze(['random']) });

const BOUND_DENIALS = Object.freeze({
  Date: Object.freeze({ callable: true }),
  globalThis: Object.freeze({ callable: false }),
});

const DYNAMIC_IMPORT_CODE = 'ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING';

const CONTEXT_INSTALLER = `(retained, bindings) => {
  const globals = globalThis;
  const own = Object.getOwnPropertyNames;
  const describe = Object.getOwnPropertyDescriptor;
  const define = Object.defineProperty;
  const names = own(globals);
  for (let i = 0; i < names.length; i += 1) {
    const name = names[i];
    if (retained.indexOf(name) >= 0) continue;
    const descriptor = describe(globals, name);
    if (descriptor && descriptor.configurable) delete globals[name];
  }
  for (let i = 0; i < bindings.length; i += 1) {
    define(globals, bindings[i][0], { value: bindings[i][1], writable: false, enumerable: false, configurable: false });
  }
}`;

function retainedNames() {
  return [...ALLOWED_GLOBALS, ...VALUE_GLOBALS];
}

function denyBinding(name) {
  const raise = (operation) => { throw new SandboxViolationError(name, operation); };
  return new Proxy(BOUND_DENIALS[name].callable ? function denied() {} : {}, {
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

function guardedBinding(name, target, deniedMembers) {
  const denied = new Set(deniedMembers);
  const guard = (property, operation) => {
    if (!denied.has(property)) return;
    throw new SandboxViolationError(`${name}.${String(property)}`, operation);
  };
  const reject = (property, operation) => {
    throw new SandboxViolationError(`${name}.${String(property)}`, operation, 'the sandbox binds it read-only');
  };
  return new Proxy(target, {
    get: (subject, property, receiver) => { guard(property, 'read'); return Reflect.get(subject, property, receiver); },
    has: (subject, property) => { guard(property, 'membership test'); return Reflect.has(subject, property); },
    getOwnPropertyDescriptor: (subject, property) => {
      guard(property, 'descriptor read');
      return Reflect.getOwnPropertyDescriptor(subject, property);
    },
    ownKeys: (subject) => Reflect.ownKeys(subject).filter((key) => !denied.has(key)),
    set: (_subject, property) => reject(property, 'assignment to'),
    defineProperty: (_subject, property) => reject(property, 'definition of'),
    deleteProperty: (_subject, property) => reject(property, 'deletion of'),
  });
}

function createSandboxContext() {
  const context = createContext({});
  const install = runInContext(CONTEXT_INSTALLER, context);
  const retained = retainedNames();
  const guarded = Object.keys(GUARDED_INTRINSICS)
    .filter((name) => retained.includes(name))
    .map((name) => [name, guardedBinding(name, runInContext(name, context), GUARDED_INTRINSICS[name])]);
  const denied = Object.keys(BOUND_DENIALS).map((name) => [name, denyBinding(name)]);
  install(retained, [...guarded, ...denied]);
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

export function createHookStubs(overrides = {}) {
  if (overrides === null || typeof overrides !== 'object') {
    throw new TypeError(`createHookStubs expects an object of overrides, received ${overrides === null ? 'null' : typeof overrides}`);
  }
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

function validateHooks(hooks) {
  if (hooks === null || typeof hooks !== 'object') {
    throw new TypeError(`compileWorkflow expects a hooks object, received ${hooks === null ? 'null' : typeof hooks}`);
  }
  const injectable = new Set(HOOK_NAMES.filter((name) => name !== 'args'));
  for (const name of Object.keys(hooks)) {
    if (!injectable.has(name)) {
      throw new TypeError(`compileWorkflow received an unknown hook "${name}"; known hooks are ${[...injectable].join(', ')}`);
    }
    if (typeof hooks[name] !== 'function') {
      throw new TypeError(`compileWorkflow expects hook "${name}" to be a function, received ${typeof hooks[name]}`);
    }
  }
  return { ...createHookStubs().hooks, ...hooks };
}

function compileInSandbox(source) {
  try {
    return compileFunction(`return (async () => {\n${source}\n})();`, [...HOOK_NAMES], {
      filename: 'workflow-sandbox-compiled.js',
      parsingContext: createSandboxContext(),
    });
  } catch (error) {
    throw new Error(`workflow source failed to compile in the sandbox: ${error.message}`, { cause: error });
  }
}

export function compileWorkflow(source, hooks = {}) {
  validateSource(source);
  const resolved = validateHooks(hooks);
  const compiled = compileInSandbox(source);
  const bound = HOOK_NAMES.slice(1).map((name) => resolved[name]);
  return async function invokeWorkflow(args) {
    try {
      return await compiled(args, ...bound);
    } catch (error) {
      if (error && error.code === DYNAMIC_IMPORT_CODE) throw new SandboxViolationError('import', 'dynamic import()');
      throw error;
    }
  };
}
