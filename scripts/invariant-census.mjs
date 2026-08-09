import { closedSetsIn, importedNames, DISCRIMINANT_KEYS } from './invariant-closed-sets.mjs';

export const CANDIDATE_SEPARATOR = '#';
export const TEST_PATH_MARKERS = Object.freeze(['/tests/', '.test.mjs']);

const CLASSIFIER_METHODS = Object.freeze(['includes', 'has', 'indexOf']);
const COLLECTION_CONSTRUCTORS = Object.freeze(['Set', 'Map']);
const BUILTIN_SPECIFIER_PREFIX = 'node:';
const EMISSION_PRECEDERS = Object.freeze(['return', '=>', '(', ',', '[', ':', '?']);

export const isTestPath = (path) => TEST_PATH_MARKERS.some((marker) => path.includes(marker));

const escaped = (name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const forOfPattern = (name) => new RegExp(`\\bfor\\s*\\(\\s*(?:const|let|var)\\s+([A-Za-z_$][A-Za-z0-9_$]*)\\s+of\\s+${escaped(name)}\\b`, 'g');

const classifierPattern = (name) => new RegExp(`\\b${escaped(name)}\\s*\\.\\s*(?:${CLASSIFIER_METHODS.join('|')})\\s*\\(`);

const setBindingPattern = (name) => new RegExp(`\\b(?:const|let)\\s+([A-Za-z_$][A-Za-z0-9_$]*)\\s*=\\s*new\\s+(?:${COLLECTION_CONSTRUCTORS.join('|')})\\s*\\(\\s*(?:\\.\\.\\.)?${escaped(name)}\\b`, 'g');

const boundClassifierPattern = (binding) => new RegExp(`\\b${escaped(binding)}\\s*\\.\\s*(?:has|get)\\s*\\(`);

const membershipPattern = (variable) => new RegExp(`\\.\\s*(?:${CLASSIFIER_METHODS.join('|')})\\s*\\(\\s*${escaped(variable)}\\s*\\)`);

function matchingParen(masked, from) {
  const open = masked.indexOf('(', from);
  if (open < 0) return -1;
  let depth = 0;
  for (let index = open; index < masked.length; index += 1) {
    if (masked[index] === '(') depth += 1;
    else if (masked[index] === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

export function forOfSites(scan, name) {
  const sites = [];
  for (const match of scan.masked.matchAll(forOfPattern(name))) {
    const headerClose = matchingParen(scan.masked, match.index);
    if (headerClose < 0) continue;
    const bodyOpen = scan.masked.indexOf('{', headerClose);
    const bodyClose = bodyOpen < 0 ? undefined : scan.braceByOpen.get(bodyOpen);
    sites.push({
      index: match.index,
      variable: match[1],
      bodyOpen,
      bodyClose: bodyClose ?? -1,
    });
  }
  return sites;
}

function comparisonReasons(scan, name) {
  const masked = scan.masked;
  const memberwise = forOfSites(scan, name).filter((site) => {
    const body = site.bodyClose > site.bodyOpen ? masked.slice(site.bodyOpen, site.bodyClose) : '';
    return membershipPattern(site.variable).test(body);
  });
  const bound = [...masked.matchAll(setBindingPattern(name))]
    .filter((match) => boundClassifierPattern(match[1]).test(masked));
  return [
    ...(classifierPattern(name).test(masked) ? ['used as a classifier of another value'] : []),
    ...(memberwise.length > 0 ? ['membership-tested member by member against another collection'] : []),
    ...(bound.length > 0 ? ['bound into a lookup that classifies another value'] : []),
  ];
}

export function productionUseReasons(scan, name) {
  return [...new Set(comparisonReasons(scan, name))];
}

function productionNamesImported(source, scan) {
  return [...new Set(importedNames(source, scan)
    .filter((entry) => !entry.specifier.startsWith(BUILTIN_SPECIFIER_PREFIX) && !isTestPath(entry.specifier))
    .flatMap((entry) => entry.names))];
}

export function testUseReasons(source, scan, name) {
  const productionLoops = productionNamesImported(source, scan)
    .flatMap((imported) => forOfSites(scan, imported).map((site) => ({ ...site, name: imported })));
  const nested = forOfSites(scan, name)
    .map((site) => productionLoops.find((loop) => loop.bodyOpen < site.index && site.index < loop.bodyClose))
    .filter((enclosing) => enclosing !== undefined)
    .map((enclosing) => `a hand-listed axis nested inside the production enumeration ${enclosing.name}`);
  return [...new Set([...comparisonReasons(scan, name), ...nested])];
}

function innermostPair(scan, index) {
  return scan.bracePairs
    .filter(({ open, close }) => open < index && index < close)
    .reduce((innermost, candidate) => (innermost === undefined || candidate.open > innermost.open ? candidate : innermost), undefined);
}

function isEmissionSite(scan, index) {
  const pair = innermostPair(scan, index);
  if (pair === undefined) return false;
  let cursor = pair.open - 1;
  while (cursor >= 0 && /\s/.test(scan.masked[cursor])) cursor -= 1;
  if (cursor < 0) return false;
  const tail = scan.masked.slice(Math.max(0, cursor - 5), cursor + 1);
  return EMISSION_PRECEDERS.some((preceder) => tail.endsWith(preceder));
}

function emittedDiscriminants(source, scan) {
  const emitted = new Map();
  for (const key of DISCRIMINANT_KEYS) {
    const pattern = new RegExp(`\\b${escaped(key)}\\s*:\\s*`, 'g');
    const values = [...scan.masked.matchAll(pattern)]
      .filter((match) => isEmissionSite(scan, match.index))
      .map((match) => match.index + match[0].length)
      .filter((index) => scan.stringSpans.has(index))
      .map((index) => source.slice(index + 1, scan.stringSpans.get(index)))
      .filter((literal) => literal !== '');
    const distinct = [...new Set(values)];
    if (distinct.length > 0) emitted.set(key, Object.freeze(distinct));
  }
  return emitted;
}

export function candidatesIn(path, source) {
  const scanned = closedSetsIn(source);
  if (!scanned.ok) return { ok: false, error: scanned.error };
  const test = isTestPath(path);
  const sets = scanned.sets
    .map((set) => ({
      key: `${path}${CANDIDATE_SEPARATOR}${set.name}`,
      path,
      name: set.name,
      members: set.members,
      reasons: test ? testUseReasons(source, scanned.scan, set.name) : productionUseReasons(scanned.scan, set.name),
      origin: test ? 'a test-local constant' : 'a production constant',
    }))
    .filter((candidate) => candidate.reasons.length > 0);
  const discriminants = test ? [] : [...emittedDiscriminants(source, scanned.scan)]
    .map(([key, values]) => ({
      key: `${path}${CANDIDATE_SEPARATOR}${key}`,
      path,
      name: key,
      members: Object.freeze(values),
      reasons: [`emitted as a ${key} discriminant field`],
      origin: 'an emitted discriminant',
    }));
  return { ok: true, candidates: Object.freeze([...sets, ...discriminants]) };
}

export function unclassifiedCandidates(candidates, quantified, waivers) {
  return candidates.filter((candidate) => !quantified.has(candidate.key)
    && !(typeof waivers[candidate.key] === 'string' && waivers[candidate.key].trim() !== ''));
}

export { DISCRIMINANT_KEYS };
