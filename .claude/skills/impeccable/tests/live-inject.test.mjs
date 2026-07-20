import { test } from 'node:test';
import assert from 'node:assert/strict';

import { patchCspMeta, revertCspMeta } from '../scripts/live-inject.mjs';

const MARKER = 'data-impeccable-csp-original';

function metaWithMarker(markerValue) {
  return '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'"'
    + ` ${MARKER}="${markerValue}"`
    + ' data-keep="yes">';
}

test('patch then revert round-trips well-formed CSP meta tags byte-for-byte', () => {
  const cspValues = [
    "default-src 'self'",
    "default-src 'self'; script-src 'self' https://cdn.example.com",
    "default-src 'self'; script-src 'self' 'sha256-abc+def/ghi='",
    "default-src 'self'; connect-src 'self' wss://example.com; img-src 'self'",
  ];
  for (const csp of cspValues) {
    const original = `<html><head>\n<meta http-equiv="Content-Security-Policy" content="${csp}">\n</head></html>`;
    const patched = patchCspMeta(original, 4321);
    assert.notEqual(patched, original, `expected patch to change content for: ${csp}`);
    assert.equal(revertCspMeta(patched), original, `revert did not restore original for: ${csp}`);
  }
});

test('patch then revert round-trips a self-closing CSP meta tag', () => {
  const original = '<head>\n  <meta http-equiv="Content-Security-Policy" content="default-src \'self\'" />\n</head>';
  const patched = patchCspMeta(original, 4321);
  assert.notEqual(patched, original);
  assert.equal(revertCspMeta(patched), original);
});

test('revert tolerates an unbalanced paren in the marker attribute without throwing', () => {
  const content = metaWithMarker('((');
  const expected = '<meta http-equiv="Content-Security-Policy" content="" data-keep="yes">';

  const reverted = revertCspMeta(content);

  assert.equal(reverted, expected);
});

test('revert does not consume adjacent attributes when the marker attribute contains a wildcard', () => {
  const content = metaWithMarker('.*');
  const expected = '<meta http-equiv="Content-Security-Policy" content="" data-keep="yes">';

  const reverted = revertCspMeta(content);

  assert.ok(reverted.includes('data-keep="yes"'), `adjacent attribute was destroyed: ${reverted}`);
  assert.ok(!reverted.includes(MARKER), `marker attribute survived: ${reverted}`);
  assert.equal(reverted, expected);
});

const REPLACEMENT_TOKEN_ORIGINS = [
  'https://a$&b.example.com',
  "https://a$'b.example.com",
  'https://a$`b.example.com',
  'https://a$$b.example.com',
  'https://a$1b.example.com',
  'https://a$<name>b.example.com',
];

test('patch preserves CSP values containing regex replacement tokens verbatim', () => {
  for (const token of REPLACEMENT_TOKEN_ORIGINS) {
    const csp = `default-src 'self'; script-src 'self' ${token}`;
    const original = `<html><head>\n<meta http-equiv="Content-Security-Policy" content="${csp}">\n</head></html>`;

    const patched = patchCspMeta(original, 4321);

    assert.ok(
      patched.includes(token),
      `patched output lost or mangled ${token}: ${patched}`,
    );
  }
});

test('patch then revert round-trips CSP values containing regex replacement tokens', () => {
  for (const token of REPLACEMENT_TOKEN_ORIGINS) {
    const csp = `default-src 'self'; script-src 'self' ${token}`;
    const original = `<html><head>\n<meta http-equiv="Content-Security-Policy" content="${csp}">\n</head></html>`;

    const patched = patchCspMeta(original, 4321);

    assert.equal(revertCspMeta(patched), original, `revert did not restore original for: ${csp}`);
  }
});

test('revert restores a marker-encoded CSP value containing regex replacement tokens', () => {
  for (const token of REPLACEMENT_TOKEN_ORIGINS) {
    const originalCsp = `default-src 'self' ${token}`;
    const encoded = Buffer.from(originalCsp, 'utf-8').toString('base64');
    const content = '<meta http-equiv="Content-Security-Policy" content="default-src \'self\' http://localhost:4321"'
      + ` ${MARKER}="${encoded}" data-keep="yes">`;
    const expected = `<meta http-equiv="Content-Security-Policy" content="${originalCsp}" data-keep="yes">`;

    assert.equal(revertCspMeta(content), expected, `revert corrupted: ${originalCsp}`);
  }
});

test('revert strips the marker attribute and its leading whitespace', () => {
  const content = '<meta http-equiv="Content-Security-Policy" content="x"'
    + `   ${MARKER}="ZGVmYXVsdC1zcmMgJ3NlbGYn">`;

  assert.equal(
    revertCspMeta(content),
    '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'">',
  );
});
