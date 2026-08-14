import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { lineOf, scanJsStructure } from './js-scan.mjs';
import { MERGE_REFUSAL_SPECIMENS } from './gh-merge-shim.mjs';

const REASON_BUILDER = 'reason';
const DECLARATION_KEYWORD = 'function';
const IDENTIFIER_CHARACTER = /[\w$]/;
const QUOTES = Object.freeze(['\'', '"']);

const SHIM_PATH = fileURLToPath(new URL('./gh-merge-shim.mjs', import.meta.url));

function halt(error) {
  return Object.freeze({ ok: false, error });
}

export function readMergeShimSource() {
  return readFileSync(SHIM_PATH, 'utf8');
}

function wordBefore(masked, index) {
  let end = index - 1;
  while (end >= 0 && /\s/.test(masked[end])) end -= 1;
  if (end < 0 || !IDENTIFIER_CHARACTER.test(masked[end])) return '';
  let start = end;
  while (start >= 0 && IDENTIFIER_CHARACTER.test(masked[start])) start -= 1;
  return masked.slice(start + 1, end + 1);
}

function callSites(masked) {
  const sites = [];
  const token = `${REASON_BUILDER}(`;
  let index = masked.indexOf(token);
  while (index !== -1) {
    const boundedLeft = index === 0 || !IDENTIFIER_CHARACTER.test(masked[index - 1]);
    if (boundedLeft && wordBefore(masked, index) !== DECLARATION_KEYWORD) {
      sites.push(index + token.length);
    }
    index = masked.indexOf(token, index + 1);
  }
  return sites;
}

function literalAt(raw, masked, from) {
  let index = from;
  while (index < raw.length && /\s/.test(raw[index])) index += 1;
  const quote = raw[index];
  if (!QUOTES.includes(quote)) {
    let end = index;
    while (end < masked.length && IDENTIFIER_CHARACTER.test(masked[end])) end += 1;
    return { error: `${raw.slice(index, Math.max(end, index + 1))} is not a literal` };
  }
  const close = raw.indexOf(quote, index + 1);
  if (close === -1) return { error: 'an unterminated literal' };
  return { value: raw.slice(index + 1, close) };
}

export function shimRefusalKinds(source) {
  if (typeof source !== 'string' || source.length === 0) {
    return halt('merge-specimen-census: the shim source is empty, so the refusal reasons it can emit could not be read');
  }
  const scan = scanJsStructure(source);
  if (!scan.ok) {
    return halt(`merge-specimen-census: the shim source could not be scanned, so the refusal reasons it can emit could not be read: ${scan.error}`);
  }
  const kinds = [];
  for (const site of callSites(scan.masked)) {
    const literal = literalAt(source, scan.masked, site);
    if (literal.error !== undefined) {
      return halt(`merge-specimen-census: the refusal built at line ${lineOf(source, site)} names its kind as ${literal.error}; a reason kind this census cannot read is a refusal it could never require a specimen for`);
    }
    if (!kinds.includes(literal.value)) kinds.push(literal.value);
  }
  return Object.freeze({ ok: true, kinds: Object.freeze(kinds.sort()) });
}

export function censusMergeSpecimens(specimens = MERGE_REFUSAL_SPECIMENS, source = readMergeShimSource()) {
  const measured = shimRefusalKinds(source);
  if (!measured.ok) return measured;
  if (measured.kinds.length === 0) {
    return halt('merge-specimen-census: the shim source yielded no refusal reason at all; an extractor that matches nothing would report every reason covered by any specimen set, including an empty one');
  }
  if (!Array.isArray(specimens) || specimens.length === 0) {
    return halt('merge-specimen-census: the specimen set is empty, so no merge argv is probed and the refusal it guards is unmeasured');
  }
  const malformed = specimens.filter((specimen) => specimen === null
    || typeof specimen !== 'object'
    || typeof specimen.kind !== 'string'
    || typeof specimen.label !== 'string'
    || !Array.isArray(specimen.argv));
  if (malformed.length > 0) {
    return halt(`merge-specimen-census: ${malformed.length} specimen(s) carry no label, kind and argv, so what they probe cannot be read`);
  }
  const specimenKinds = [...new Set(specimens.map((specimen) => specimen.kind))].sort();
  const uncoveredKinds = measured.kinds.filter((kind) => !specimenKinds.includes(kind));
  const undeclaredKinds = specimenKinds.filter((kind) => !measured.kinds.includes(kind));
  if (uncoveredKinds.length > 0) {
    return halt(`merge-specimen-census: these refusal reasons the classifier can emit have no specimen and are therefore uncovered: ${uncoveredKinds.join(', ')}; the verb asserts each probe is refused, so a specimen set narrower than the reason set leaves a merge spelling nothing exercises`);
  }
  if (undeclaredKinds.length > 0) {
    return halt(`merge-specimen-census: these specimens declare a refusal reason the classifier can never emit: ${undeclaredKinds.join(', ')}; such a specimen either passes by accident or pins a reason that was renamed`);
  }
  return Object.freeze({
    ok: true,
    reasonKinds: measured.kinds,
    specimenKinds: Object.freeze(specimenKinds),
    reasonKindCount: measured.kinds.length,
    specimenKindCount: specimenKinds.length,
    specimenCount: specimens.length,
    uncoveredKinds: Object.freeze(uncoveredKinds),
    undeclaredKinds: Object.freeze(undeclaredKinds),
  });
}
