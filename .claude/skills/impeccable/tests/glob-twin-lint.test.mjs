import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TWINS = [
  { label: 'live-inject.mjs', path: fileURLToPath(new URL('../scripts/live-inject.mjs', import.meta.url)) },
  { label: 'live.mjs', path: fileURLToPath(new URL('../scripts/live.mjs', import.meta.url)) },
];

const SYNCED_CONSTANTS = ['GLOB_MAX_LENGTH', 'GLOB_MAX_WILDCARDS'];

export function extractFunctionBody(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start === -1) return null;
  const end = src.indexOf('\n}\n', start);
  if (end === -1) return null;
  return src.slice(start, end + 2);
}

export function extractConstant(src, name) {
  const m = src.match(new RegExp(`^const ${name} = (.+);$`, 'm'));
  return m ? m[1] : null;
}

export function lineDiff(a, b, labelA, labelB) {
  const left = a.split('\n');
  const right = b.split('\n');
  const out = [];
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    if (left[i] === right[i]) continue;
    const show = (v) => (v === undefined ? '<missing>' : JSON.stringify(v));
    out.push(`  line ${i + 1}:`);
    out.push(`    ${labelA}: ${show(left[i])}`);
    out.push(`    ${labelB}: ${show(right[i])}`);
  }
  return out.join('\n');
}

test('extractFunctionBody pulls a whole top-level function', () => {
  const src = 'const x = 1;\nfunction f(a) {\n  return { a };\n}\nconst y = 2;\n';
  assert.equal(extractFunctionBody(src, 'f'), 'function f(a) {\n  return { a };\n}');
});

test('extractFunctionBody returns null when the function is absent', () => {
  assert.equal(extractFunctionBody('const x = 1;\n', 'f'), null);
});

test('extractConstant reads a top-level const initializer', () => {
  assert.equal(extractConstant('const CAP = 1024;\n', 'CAP'), '1024');
  assert.equal(extractConstant('const CAP = 1024;\n', 'MISSING'), null);
});

test('lineDiff is empty for identical text and reports every divergent line', () => {
  assert.equal(lineDiff('a\nb', 'a\nb', 'L', 'R'), '');

  const diff = lineDiff('a\nb\nc', 'a\nX', 'L', 'R');
  assert.match(diff, /line 2:/);
  assert.match(diff, /L: "b"/);
  assert.match(diff, /R: "X"/);
  assert.match(diff, /line 3:/);
  assert.match(diff, /R: <missing>/);
});

test('globToRegex is byte-identical across the sync-by-design twins', () => {
  const [a, b] = TWINS.map(({ label, path }) => {
    const body = extractFunctionBody(readFileSync(path, 'utf8'), 'globToRegex');
    assert.ok(body, `globToRegex not found in ${label} (${path}) — was it renamed or reshaped?`);
    return { label, body };
  });

  assert.equal(
    a.body,
    b.body,
    `globToRegex has drifted between the sync-by-design twins:\n${lineDiff(a.body, b.body, a.label, b.label)}\n`,
  );
});

test('the glob guard constants are identical across the sync-by-design twins', () => {
  for (const name of SYNCED_CONSTANTS) {
    const [a, b] = TWINS.map(({ label, path }) => {
      const value = extractConstant(readFileSync(path, 'utf8'), name);
      assert.ok(value, `${name} not found in ${label} (${path})`);
      return { label, value };
    });

    assert.equal(
      a.value,
      b.value,
      `${name} has drifted: ${a.label}=${a.value} vs ${b.label}=${b.value}`,
    );
  }
});
