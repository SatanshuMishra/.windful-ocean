import { createHash } from 'node:crypto';

const MODULE = 'spec-hash';

export const SPEC_HASH_ALGORITHM = 'sha256';
export const SPEC_HASH_HEX_LENGTH = 64;
export const SPEC_HASH_INCUMBENT_COMMAND = 'shasum -a 256';
export const SPEC_HASH_TRANSCRIBED_FROM = `${SPEC_HASH_INCUMBENT_COMMAND} run against the fixture bytes on this machine, read once and frozen as a literal`;

const HEX = /^[0-9a-f]+$/;

function refused(error) {
  return Object.freeze({ ok: false, specContentHash: null, error: `${MODULE}: ${error}` });
}

export function specContentHash(bytes) {
  if (!Buffer.isBuffer(bytes) && !ArrayBuffer.isView(bytes)) {
    return refused(`the spec fingerprint was handed ${JSON.stringify(bytes === undefined ? null : bytes)} rather than the bytes of the spec; a value coerced into bytes would fingerprint its own spelling rather than the file the run was launched from`);
  }
  const digest = createHash(SPEC_HASH_ALGORITHM).update(bytes).digest('hex');
  if (digest.length !== SPEC_HASH_HEX_LENGTH || !HEX.test(digest)) {
    return refused(`the ${SPEC_HASH_ALGORITHM} digest printed ${JSON.stringify(digest)} rather than ${SPEC_HASH_HEX_LENGTH} hex characters; the incumbent reports the leading 64-character hex field and a shorter one would be recorded as if it were that field`);
  }
  return Object.freeze({ ok: true, specContentHash: digest });
}

export function readSpecContentHash(specPath, io) {
  if (io === null || typeof io !== 'object' || typeof io.readFileBytes !== 'function') {
    return refused('no reader was injected, so the spec bytes would have to be read by engine source rather than at the process boundary');
  }
  let bytes;
  try {
    bytes = io.readFileBytes(specPath);
  } catch (error) {
    return refused(`the spec at ${JSON.stringify(specPath)} could not be read (${error && error.message ? error.message : 'unknown failure'}); the incumbent reports specContentHash=null for a spec it could not read, and a fingerprint of nothing would be compared against the manifest as if the spec were unchanged`);
  }
  return specContentHash(bytes);
}

function transcribed(name, bytes, digest) {
  return Object.freeze({
    name,
    bytes: Object.freeze([...bytes]),
    digest,
    transcribedFrom: SPEC_HASH_TRANSCRIBED_FROM,
  });
}

export const SPEC_HASH_FIXTURES = Object.freeze([
  transcribed(
    'a spec carrying two lines of ascii',
    Buffer.from('mitosis spec fixture\nfor the reconcile content fingerprint\n', 'utf8'),
    '3295bb9e0b1fa6a1e422b62b1ee6a53b973082ddf74843f53a05888be778a7f8',
  ),
  transcribed('an empty spec', Buffer.alloc(0), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'),
  transcribed(
    'a spec carrying bytes outside ascii',
    Buffer.from([
      0x63, 0x61, 0x66, 0xc3, 0xa9, 0x20, 0xe2, 0x86, 0x92, 0x20,
      0x6e, 0x6f, 0x6e, 0x2d, 0x61, 0x73, 0x63, 0x69, 0x69, 0x20,
      0x62, 0x79, 0x74, 0x65, 0x73, 0x0a,
    ]),
    '175a1a9768ba4f9c6596b69804cfc279a5c6213455e162bdea844ace9d8a2db4',
  ),
]);

const UNREADABLE_SPEC = '/repo/SPEC-that-was-never-written.md';

export function specHashProbes() {
  const digests = SPEC_HASH_FIXTURES.map((fixture) => {
    const read = specContentHash(Buffer.from(fixture.bytes));
    const matched = read.ok === true && read.specContentHash === fixture.digest;
    return Object.freeze({
      name: `${SPEC_HASH_ALGORITHM} of ${fixture.name}`,
      ok: matched,
      detail: matched
        ? `matches the digest transcribed from ${fixture.transcribedFrom}`
        : `produced ${JSON.stringify(read.specContentHash)} rather than the transcribed ${fixture.digest}`,
    });
  });
  const unreadable = readSpecContentHash(UNREADABLE_SPEC, Object.freeze({
    readFileBytes: () => { throw new Error(`ENOENT: no such file, open ${UNREADABLE_SPEC}`); },
  }));
  const coerced = specContentHash('the spec as text rather than as bytes');
  return Object.freeze([
    ...digests,
    Object.freeze({
      name: 'an unreadable spec reports no fingerprint',
      ok: unreadable.ok === false && unreadable.specContentHash === null,
      detail: unreadable.ok === false ? unreadable.error : 'an unreadable spec produced a fingerprint',
    }),
    Object.freeze({
      name: 'a spec handed as text rather than bytes is refused',
      ok: coerced.ok === false && coerced.specContentHash === null,
      detail: coerced.ok === false ? coerced.error : 'text was fingerprinted as if it were the file bytes',
    }),
  ]);
}
