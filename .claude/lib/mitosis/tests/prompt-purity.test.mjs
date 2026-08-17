import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import {
  IDENT_PART,
  lineOf,
  nextCodeIndex,
  previousCodeIndex,
  scanJsStructure,
  wordEndingAt,
} from '../js-scan.mjs';

const LIB_DIR = fileURLToPath(new URL('../', import.meta.url));
const REGISTRY_MODULE_PREFIX = 'prompt-';
const REGISTRY_MODULE_SUFFIX = '.mjs';
const ALLOWED_IMPORT = /^\.\/prompt-[a-z-]+\.mjs$/;
const IMPORT_KEYWORD = 'import';

function registryModuleNames() {
  return readdirSync(LIB_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile()
      && entry.name.startsWith(REGISTRY_MODULE_PREFIX)
      && entry.name.endsWith(REGISTRY_MODULE_SUFFIX))
    .map((entry) => entry.name)
    .sort();
}

function keywordOccurrences(masked, word) {
  const found = [];
  let from = 0;
  for (;;) {
    const start = masked.indexOf(word, from);
    if (start === -1) return found;
    from = start + word.length;
    if (start > 0 && IDENT_PART.test(masked[start - 1])) continue;
    if (from < masked.length && IDENT_PART.test(masked[from])) continue;
    found.push(start);
  }
}

function moduleSpecifiers(label, source) {
  const scan = scanJsStructure(source);
  assert.equal(scan.ok, true, `${label} could not be scanned, so its module specifiers cannot be located: ${scan.error}`);
  const { masked, stringSpans } = scan;
  const found = new Map();
  const record = (open) => {
    const close = stringSpans.get(open);
    assert.ok(close !== undefined, `${label}: the module specifier at line ${lineOf(source, open)} is not a string literal; refusing to guess what it loads`);
    found.set(open, source.slice(open + 1, close));
  };
  for (const open of stringSpans.keys()) {
    if (wordEndingAt(masked, previousCodeIndex(masked, open - 1)) === 'from') record(open);
  }
  for (const start of keywordOccurrences(masked, IMPORT_KEYWORD)) {
    const after = nextCodeIndex(masked, start + IMPORT_KEYWORD.length);
    if (masked[after] === '.') continue;
    if (masked[after] === '(') {
      record(nextCodeIndex(masked, after + 1));
      continue;
    }
    if (stringSpans.has(after)) {
      record(after);
      continue;
    }
    const end = masked.indexOf(';', start);
    const bounded = [...found.keys()].some((open) => open > start && (end === -1 || open < end));
    assert.ok(bounded, `${label}: the import statement at line ${lineOf(source, start)} carries no locatable module specifier, so this census cannot tell what it loads`);
  }
  return [...found.entries()].sort((a, b) => a[0] - b[0]).map(([open, text]) => ({ line: lineOf(source, open), text }));
}

test('the specifier census reads every import form, including a double-quoted, bare or dynamic one', () => {
  const source = [
    "import { a } from './prompt-alpha.mjs';",
    'import { execSync } from "node:child_process";',
    "import 'node:fs';",
    "import def from 'node:net';",
    "import * as ns from 'node:os';",
    "export { b } from './prompt-beta.mjs';",
    "export const notASpecifier = 'node:crypto';",
    "const dyn = await import('node:vm');",
    "const meta = import.meta.url;",
    '',
  ].join('\n');
  const specifiers = moduleSpecifiers('the specifier fixture', source).map((entry) => entry.text);
  assert.deepEqual(specifiers, [
    './prompt-alpha.mjs',
    'node:child_process',
    'node:fs',
    'node:net',
    'node:os',
    './prompt-beta.mjs',
    'node:vm',
  ]);
  assert.equal(specifiers.includes('node:crypto'), false, 'a plain string constant is not a module specifier and must not be counted as one');
});

test('the registry modules import only their own siblings, so nothing reaches disk, a process or a socket', () => {
  const names = registryModuleNames();
  assert.ok(names.length >= 5, `expected the registry modules to be scanned by directory read, found ${names.join(', ')}`);
  const foreign = [];
  for (const name of names) {
    const source = readFileSync(join(LIB_DIR, name), 'utf8');
    for (const specifier of moduleSpecifiers(name, source)) {
      if (!ALLOWED_IMPORT.test(specifier.text)) foreign.push(`${name}:${specifier.line} imports ${JSON.stringify(specifier.text)}`);
    }
  }
  assert.deepEqual(
    foreign,
    [],
    `a registry module may import only a sibling prompt module; these reach further:\n${foreign.join('\n')}\nexternally-sourced preambles are inputs, never disk reads the registry makes`,
  );
});

test('no registry module reads process, so it cannot take entropy or configuration from the environment', () => {
  const readers = [];
  for (const name of registryModuleNames()) {
    const source = readFileSync(join(LIB_DIR, name), 'utf8');
    const scan = scanJsStructure(source);
    assert.equal(scan.ok, true, `${name} could not be scanned, so its code spans cannot be censused: ${scan.error}`);
    if (/(?<![A-Za-z0-9_$])process(?![A-Za-z0-9_$])/.test(scan.masked)) readers.push(name);
  }
  assert.deepEqual(readers, [], `these registry modules read process: ${readers.join(', ')}`);
});
