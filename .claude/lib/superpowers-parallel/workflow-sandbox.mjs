import { compileFunction, createContext } from 'node:vm';

export const SANDBOX_VIOLATION = Symbol.for('mitosis.workflow-sandbox.violation');

export class SandboxViolationError extends Error {
  constructor(deniedName, operation) {
    super(`workflow sandbox violation: ${operation} of "${deniedName}" — the Workflow runtime does not provide it`);
    this.name = 'SandboxViolationError';
    this.deniedName = deniedName;
    this.operation = operation;
    this[SANDBOX_VIOLATION] = true;
  }
}

export const ALLOWED_GLOBALS = Object.freeze([
  'Array', 'Object', 'JSON', 'Set', 'Error', 'Number', 'Map', 'Math',
  'String', 'Boolean', 'Promise', 'TypeError', 'RangeError', 'RegExp', 'Symbol',
]);

export const HOOK_NAMES = Object.freeze(['args', 'agent', 'parallel', 'pipeline', 'log', 'phase', 'workflow']);

const GUARDED_INTRINSICS = Object.freeze({ Math: Object.freeze(['random']) });

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

const DYNAMIC_IMPORT_CODE = 'ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING';

function derivedDenyList() {
  const exempt = new Set([...ALLOWED_GLOBALS, ...HOOK_NAMES]);
  return Object.freeze(
    Object.getOwnPropertyNames(globalThis)
      .filter((name) => IDENTIFIER.test(name) && !exempt.has(name))
      .sort(),
  );
}

function denyBinding(name) {
  const raise = (operation) => { throw new SandboxViolationError(name, operation); };
  return new Proxy(function denied() {}, {
    get: (_target, property) => raise(`read of .${String(property)}`),
    set: (_target, property) => raise(`assignment to .${String(property)}`),
    deleteProperty: (_target, property) => raise(`deletion of .${String(property)}`),
    has: () => raise('membership test'),
    apply: () => raise('call'),
    construct: () => raise('construction'),
  });
}

function guardedBinding(name, deniedMembers) {
  const denied = new Set(deniedMembers);
  return new Proxy(globalThis[name], {
    get: (target, property, receiver) => {
      if (denied.has(property)) throw new SandboxViolationError(`${name}.${String(property)}`, 'read');
      return Reflect.get(target, property, receiver);
    },
    set: (_target, property) => { throw new SandboxViolationError(`${name}.${String(property)}`, 'assignment to'); },
  });
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

function bindings(hooks) {
  const guarded = Object.keys(GUARDED_INTRINSICS);
  const denied = derivedDenyList();
  const names = [...HOOK_NAMES, ...guarded, ...denied];
  const afterArgs = [
    ...HOOK_NAMES.slice(1).map((name) => hooks[name]),
    ...guarded.map((name) => guardedBinding(name, GUARDED_INTRINSICS[name])),
    ...denied.map((name) => denyBinding(name)),
  ];
  return { names, afterArgs, denied };
}

export function compileWorkflow(source, hooks = {}) {
  validateSource(source);
  const { names, afterArgs } = bindings(validateHooks(hooks));
  let compiled;
  try {
    compiled = compileFunction(`return (async () => {\n${source}\n})();`, names, {
      filename: 'workflow-sandbox-compiled.js',
      parsingContext: createContext({}),
    });
  } catch (error) {
    throw new Error(`workflow source failed to compile in the sandbox: ${error.message}`, { cause: error });
  }
  return async function invokeWorkflow(args) {
    try {
      return await compiled(args, ...afterArgs);
    } catch (error) {
      if (error && error.code === DYNAMIC_IMPORT_CODE) {
        throw new SandboxViolationError('import', 'dynamic import()');
      }
      throw error;
    }
  };
}
