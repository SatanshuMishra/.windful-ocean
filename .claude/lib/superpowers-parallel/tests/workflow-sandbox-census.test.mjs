import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ALLOWED_GLOBALS, HOOK_NAMES, SANDBOX_VIOLATION, VALUE_GLOBALS, compileWorkflow } from '../workflow-sandbox.mjs';

const SANDBOX_MODULE_PATH = new URL('../workflow-sandbox.mjs', import.meta.url);
const ENGINE_SOURCE_PATH = new URL('../../../workflows/mitosis.js', import.meta.url);

const RESERVED_WORDS = new Set([
  'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete',
  'do', 'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'import',
  'in', 'instanceof', 'new', 'null', 'return', 'super', 'switch', 'this', 'throw', 'true', 'try',
  'typeof', 'var', 'void', 'while', 'with', 'yield', 'let', 'static', 'async', 'get', 'set', 'of', 'as', 'from',
]);

const REGEX_PRECEDING_PUNCTUATION = new Set([
  '', '=', '(', ',', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '^', '~', '<', '>',
]);

const REGEX_PRECEDING_WORDS = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'do', 'else', 'yield', 'await', 'case',
]);

const IDENTIFIER_START = /[A-Za-z_$]/;
const IDENTIFIER_PART = /[A-Za-z0-9_$]/;

const blank = (character) => (character === '\n' ? '\n' : ' ');

function maskLiterals(source) {
  if (typeof source !== 'string') {
    throw new TypeError(`maskLiterals expects a source string, received ${source === null ? 'null' : typeof source}`);
  }
  const out = [];
  const stack = [{ template: false, braces: 0 }];
  let index = 0;
  let previousToken = '';
  const emit = (text) => { out.push(text); };
  while (index < source.length) {
    const top = stack[stack.length - 1];
    const character = source[index];
    const following = source[index + 1];
    if (top.template) {
      if (character === '\\') {
        emit(' '); index += 1;
        if (index < source.length) { emit(blank(source[index])); index += 1; }
        continue;
      }
      if (character === '`') { emit(' '); index += 1; stack.pop(); previousToken = 'x'; continue; }
      if (character === '$' && following === '{') {
        emit('  '); index += 2;
        stack.push({ template: false, braces: 0 });
        previousToken = '';
        continue;
      }
      emit(blank(character)); index += 1;
      continue;
    }
    if (character === '/' && following === '/') {
      while (index < source.length && source[index] !== '\n') { emit(blank(source[index])); index += 1; }
      continue;
    }
    if (character === '/' && following === '*') {
      emit('  '); index += 2;
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) { emit(blank(source[index])); index += 1; }
      if (index < source.length) { emit('  '); index += 2; }
      previousToken = ';';
      continue;
    }
    if (character === '"' || character === "'") {
      emit(' '); index += 1;
      while (index < source.length && source[index] !== character) {
        if (source[index] === '\\') {
          emit(' '); index += 1;
          if (index < source.length) { emit(blank(source[index])); index += 1; }
          continue;
        }
        emit(blank(source[index])); index += 1;
      }
      if (index < source.length) { emit(' '); index += 1; }
      previousToken = 'x';
      continue;
    }
    if (character === '`') {
      emit(' '); index += 1;
      stack.push({ template: true, braces: 0 });
      continue;
    }
    if (character === '/' && (REGEX_PRECEDING_PUNCTUATION.has(previousToken) || REGEX_PRECEDING_WORDS.has(previousToken))) {
      emit(' '); index += 1;
      let inClass = false;
      while (index < source.length) {
        const current = source[index];
        if (current === '\n') break;
        if (current === '\\') {
          emit(' '); index += 1;
          if (index < source.length) { emit(blank(source[index])); index += 1; }
          continue;
        }
        if (current === '[') inClass = true;
        else if (current === ']') inClass = false;
        else if (current === '/' && !inClass) break;
        emit(' '); index += 1;
      }
      if (index < source.length && source[index] === '/') { emit(' '); index += 1; }
      while (index < source.length && /[a-z]/.test(source[index])) { emit(' '); index += 1; }
      previousToken = 'x';
      continue;
    }
    if (IDENTIFIER_START.test(character)) {
      let word = '';
      while (index < source.length && IDENTIFIER_PART.test(source[index])) { word += source[index]; emit(source[index]); index += 1; }
      previousToken = word;
      continue;
    }
    if (/[0-9]/.test(character)) {
      while (index < source.length && IDENTIFIER_PART.test(source[index])) { emit(source[index]); index += 1; }
      previousToken = 'x';
      continue;
    }
    if (character === '{') top.braces += 1;
    if (character === '}') {
      if (top.braces === 0 && stack.length > 1) { emit(' '); index += 1; stack.pop(); previousToken = 'x'; continue; }
      top.braces -= 1;
    }
    emit(character);
    if (!/\s/.test(character)) previousToken = character;
    index += 1;
  }
  return out.join('');
}

function identifierTokens(masked) {
  const tokens = new Set();
  const pattern = /(\.\s*)?\b([A-Za-z_$][A-Za-z0-9_$]*)\b/g;
  let match = pattern.exec(masked);
  while (match !== null) {
    if (!match[1] && !RESERVED_WORDS.has(match[2])) tokens.add(match[2]);
    match = pattern.exec(masked);
  }
  return [...tokens].sort();
}

const HOST_SURFACE = [...new Set([
  ...Object.getOwnPropertyNames(globalThis),
  ...Object.getOwnPropertyNames(Object.prototype),
  ...Object.getOwnPropertyNames(Function.prototype),
])].sort();

const ACCEPTED_REALM_VERDICTS = new Set(['absent', 'denied-tagged', 'primitive', 'realm-local']);

const realmProbe = (name) => `
  const $root = Object.prototype;
  const $readPrototype = Object.getPrototypeOf;
  const $value = ${name};
  if ($value === null) return "primitive";
  if (typeof $value !== "object" && typeof $value !== "function") return "primitive";
  if ($value === $root) return "realm-local";
  let $cursor = $value;
  let $last = null;
  while ($cursor !== null) { $last = $cursor; $cursor = $readPrototype($cursor); }
  if ($last === $root) return "realm-local";
  if ($last === $value) return "foreign-root";
  return "host-realm";
`;

async function realmVerdict(name) {
  try {
    return await compileWorkflow(realmProbe(name))({});
  } catch (error) {
    if (error && error[SANDBOX_VIOLATION] === true) return 'denied-tagged';
    if (error && error.name === 'ReferenceError') return 'absent';
    return `unclassifiable:${error && error.name}:${error && error.message}`;
  }
}

async function derivedEngineIdentifiers() {
  const tokens = identifierTokens(maskLiterals(readFileSync(ENGINE_SOURCE_PATH, 'utf8')));
  const probe = tokens.map((name) => `try { ${name}; log("${name}"); } catch {}`).join('\n');
  const compiled = compileWorkflow(`${probe}\nreturn 1;`);
  await compiled({});
  return { tokens, resolving: [...compiled.records().log].sort() };
}

const ENGINE_IDENTIFIER_CLASSES = Object.freeze({
  Array: 'allow',
  Boolean: 'allow',
  Error: 'allow',
  JSON: 'allow',
  Map: 'allow',
  Math: 'allow',
  Number: 'allow',
  Object: 'allow',
  Promise: 'allow',
  RangeError: 'allow',
  RegExp: 'allow',
  Set: 'allow',
  String: 'allow',
  Symbol: 'allow',
  TypeError: 'allow',
  undefined: 'value',
  agent: 'hook',
  args: 'hook',
  log: 'hook',
  parallel: 'hook',
  phase: 'hook',
  constructor: 'realm-intrinsic',
});

test('the literal masker blanks strings, comments, template text and regexes while preserving source offsets', () => {
  assert.equal(maskLiterals('const a = "process";').includes('process'), false);
  assert.equal(maskLiterals("const a = 'process';").includes('process'), false);
  assert.equal(maskLiterals('// process\nconst a = 1;').includes('process'), false);
  assert.equal(maskLiterals('/* process */ const a = 1;').includes('process'), false);
  assert.equal(maskLiterals('const a = `process`;').includes('process'), false);
  assert.equal(maskLiterals('const a = /process/g;').includes('process'), false);
  assert.equal(maskLiterals('const a = `x${ process }y`;').includes('process'), true);
  assert.equal(maskLiterals('const a = `x${ JSON.stringify({ b: 1 }) }y${ process }z`;').includes('process'), true);
  const source = readFileSync(ENGINE_SOURCE_PATH, 'utf8');
  assert.equal(maskLiterals(source).length, source.length);
});

test('the identifier tokeniser keeps bare references and drops property positions and reserved words', () => {
  assert.deepEqual(identifierTokens('foo.bar + baz'), ['baz', 'foo']);
  assert.deepEqual(identifierTokens('a?.b'), ['a']);
  assert.deepEqual(identifierTokens('return typeof x;'), ['x']);
});

test('B1 host-reachability census: every own-property name of the host global, Object.prototype and Function.prototype is denied or realm-local', async () => {
  assert.ok(HOST_SURFACE.length > 0, 'the host-surface census derived an empty domain');
  assert.deepEqual(HOST_SURFACE.filter((name) => name.startsWith('$')), [], 'a censused name collides with the realm probe locals');
  const breaches = [];
  for (const name of HOST_SURFACE) {
    const verdict = await realmVerdict(name);
    if (!ACCEPTED_REALM_VERDICTS.has(verdict)) breaches.push(`${name} -> ${verdict}`);
  }
  assert.deepEqual(breaches, [], `bare identifiers resolving outside the sandbox realm: ${breaches.join(' | ')}`);
});

for (const [label, body] of [
  ['constructor', 'return constructor.constructor("return process.cwd()")();'],
  ['__proto__', 'return __proto__.constructor.constructor("return process.cwd()")();'],
]) {
  test(`B1 anchored probe: the Function constructor reached through bare ${label} cannot read host process state`, async () => {
    await assert.rejects(compileWorkflow(body)({}), (error) => {
      assert.equal(error.name, 'ReferenceError', `expected the host bridge to be closed, got ${error && error.name}`);
      assert.match(error.message, /process is not defined/);
      return true;
    });
  });
}

test('B1 static rule: the sandbox realm is created with DONT_CONTEXTIFY, never a host-realm backing object', () => {
  const masked = maskLiterals(readFileSync(SANDBOX_MODULE_PATH, 'utf8'));
  assert.match(masked, /createContext\(\s*constants\.DONT_CONTEXTIFY\s*\)/);
  assert.doesNotMatch(masked, /createContext\(\s*\{\s*\}\s*\)/);
});

test('B5 identifier census: the engine identifiers resolving in the workflow body are exactly the classified set', async () => {
  const { tokens, resolving } = await derivedEngineIdentifiers();
  assert.ok(tokens.length > 0, 'the engine identifier census derived an empty token set');
  const unclassified = resolving.filter((name) => !Object.hasOwn(ENGINE_IDENTIFIER_CLASSES, name));
  const stale = Object.keys(ENGINE_IDENTIFIER_CLASSES).sort().filter((name) => !resolving.includes(name));
  assert.deepEqual(unclassified, [], `engine identifiers resolving in the sandbox with no classification row: ${unclassified.join(', ')}`);
  assert.deepEqual(stale, [], `classification rows for identifiers that no longer resolve: ${stale.join(', ')}`);
});

for (const [name, membership] of Object.entries(ENGINE_IDENTIFIER_CLASSES)) {
  test(`B5 classification row: bare ${name} satisfies its "${membership}" class`, async () => {
    if (membership === 'allow') {
      assert.equal(await realmVerdict(name), 'realm-local');
      assert.ok(ALLOWED_GLOBALS.includes(name), `${name} is classified allow but is absent from ALLOWED_GLOBALS`);
      return;
    }
    if (membership === 'value') {
      assert.equal(await realmVerdict(name), 'primitive');
      assert.ok(VALUE_GLOBALS.includes(name), `${name} is classified value but is absent from VALUE_GLOBALS`);
      return;
    }
    if (membership === 'hook') {
      assert.ok(HOOK_NAMES.includes(name), `${name} is classified hook but is absent from HOOK_NAMES`);
      assert.equal(await compileWorkflow(`return [].constructor.constructor("return typeof ${name}")();`)({}), 'undefined');
      return;
    }
    if (membership === 'realm-intrinsic') {
      assert.equal(await realmVerdict(name), 'realm-local');
      await assert.rejects(compileWorkflow(`return ${name}.constructor("return process.cwd()")();`)({}), (error) => {
        assert.equal(error.name, 'ReferenceError', `bare ${name} still bridges to the host realm`);
        return true;
      });
      return;
    }
    if (membership === 'deny') {
      await assert.rejects(compileWorkflow(`return ${name}.anything;`)({}), (error) => {
        assert.equal(error[SANDBOX_VIOLATION], true, `${name} is classified deny but does not raise a tagged violation`);
        return true;
      });
      return;
    }
    assert.fail(`${name} carries the unknown classification "${membership}"`);
  });
}
