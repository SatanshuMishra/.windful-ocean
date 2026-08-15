import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SPEC_HASH_ALGORITHM,
  SPEC_HASH_FIXTURES,
  SPEC_HASH_HEX_LENGTH,
  readSpecContentHash,
  specContentHash,
  specHashProbes,
} from '../spec-hash.mjs';
import { EXEC_ALLOWLIST } from '../exec-policy.mjs';

const TRANSCRIBED_SPEC_BYTES = Buffer.from('mitosis spec fixture\nfor the reconcile content fingerprint\n', 'utf8');
const TRANSCRIBED_SPEC_DIGEST = '3295bb9e0b1fa6a1e422b62b1ee6a53b973082ddf74843f53a05888be778a7f8';
const TRANSCRIBED_EMPTY_DIGEST = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const TRANSCRIBED_NON_ASCII_BYTES = Buffer.from([
  0x63, 0x61, 0x66, 0xc3, 0xa9, 0x20, 0xe2, 0x86, 0x92, 0x20,
  0x6e, 0x6f, 0x6e, 0x2d, 0x61, 0x73, 0x63, 0x69, 0x69, 0x20,
  0x62, 0x79, 0x74, 0x65, 0x73, 0x0a,
]);
const TRANSCRIBED_NON_ASCII_DIGEST = '175a1a9768ba4f9c6596b69804cfc279a5c6213455e162bdea844ace9d8a2db4';

test('the digest matches the one the incumbent shasum -a 256 printed for the same bytes', () => {
  const read = specContentHash(TRANSCRIBED_SPEC_BYTES);
  assert.equal(read.ok, true, `the fingerprint refused bytes it should read: ${JSON.stringify(read)}`);
  assert.equal(read.specContentHash, TRANSCRIBED_SPEC_DIGEST);
  assert.equal(read.specContentHash.length, SPEC_HASH_HEX_LENGTH);
});

test('an empty spec and a spec carrying bytes outside ascii both match the incumbent digest', () => {
  assert.equal(specContentHash(Buffer.alloc(0)).specContentHash, TRANSCRIBED_EMPTY_DIGEST);
  assert.equal(specContentHash(TRANSCRIBED_NON_ASCII_BYTES).specContentHash, TRANSCRIBED_NON_ASCII_DIGEST);
});

test('every transcribed fixture is pinned to the digest the incumbent binary printed', () => {
  assert.ok(SPEC_HASH_FIXTURES.length >= 3, 'fewer transcribed digests than the three the incumbent was run against');
  for (const fixture of SPEC_HASH_FIXTURES) {
    const read = specContentHash(Buffer.from(fixture.bytes));
    assert.equal(read.ok, true, `${fixture.name} was refused`);
    assert.equal(read.specContentHash, fixture.digest, `${fixture.name} no longer produces the digest transcribed from ${fixture.transcribedFrom}`);
  }
});

test('the algorithm named is the one the incumbent command named', () => {
  assert.equal(SPEC_HASH_ALGORITHM, 'sha256');
});

test('a spec that cannot be read reports no hash rather than a hash of nothing', () => {
  const io = Object.freeze({
    readFileBytes: () => { throw new Error('ENOENT: no such file'); },
  });
  const read = readSpecContentHash('/repo/SPEC.md', io);
  assert.equal(read.ok, false);
  assert.equal(read.specContentHash, null);
  assert.match(read.error, /ENOENT/);
});

test('a reader that returns something other than bytes is refused rather than coerced', () => {
  for (const returned of [null, undefined, 'not bytes', 7, {}]) {
    const read = readSpecContentHash('/repo/SPEC.md', Object.freeze({ readFileBytes: () => returned }));
    assert.equal(read.ok, false, `${JSON.stringify(returned)} was accepted as spec bytes`);
    assert.equal(read.specContentHash, null);
  }
});

test('the fingerprint refuses a value that is not bytes at all', () => {
  for (const value of [null, undefined, 'a string', 7, []]) {
    const read = specContentHash(value);
    assert.equal(read.ok, false, `${JSON.stringify(value)} was hashed as if it were bytes`);
    assert.equal(read.specContentHash, null);
  }
});

test('the probes the verb runs read every transcribed fixture and fail closed on an unreadable spec', () => {
  const probes = specHashProbes();
  assert.ok(probes.length >= SPEC_HASH_FIXTURES.length + 1, 'the probe set is narrower than the fixtures it is meant to cover');
  for (const probe of probes) {
    assert.equal(probe.ok, true, `${probe.name}: ${probe.detail}`);
  }
  assert.ok(probes.some((probe) => probe.name.includes('unreadable')), 'no probe exercises the unreadable spec the incumbent reports as null');
});

test('the shasum binary this replaces is still outside the spawn allowlist', () => {
  assert.ok(!EXEC_ALLOWLIST.includes('shasum'), 'shasum became spawnable, so the reason this site is computed in process no longer holds and it should be transcribed as a spawn');
});
