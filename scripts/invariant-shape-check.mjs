#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { declarationOf } from './invariant-closed-sets.mjs';
import { candidatesIn, unclassifiedCandidates, CANDIDATE_SEPARATOR } from './invariant-census.mjs';

const REGISTRY_RELPATH = 'docs/invariants/registry.json';
const CHECKER_RELPATH = 'scripts/invariant-shape-check.mjs';
const DOMAIN_FIELD = 'domain';
const DOMAIN_REQUIRED_KEYS = Object.freeze(['path', 'line', 'constant']);
const DOMAIN_KEYS = Object.freeze([...DOMAIN_REQUIRED_KEYS, 'members']);
const CENSUS_GLOBS = Object.freeze([
  'scripts/**/*.mjs',
  '.claude/lib/**/*.mjs',
  '.claude/hooks/**/*.mjs',
  '.claude/workflows/**/*.js',
  '.claude/skills/**/*.mjs',
  '.claude/skills/**/*.js',
]);
const CENSUS_WAIVERS = Object.freeze({});
const CENSUS_EXTENSIONS = Object.freeze(['.mjs', '.js']);
const VALUE_FLAGS = Object.freeze(['--root']);
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const GLOB_SEGMENTS = '**';
const EXIT_OK = 0;
const EXIT_FAIL = 1;
const EXIT_USAGE = 2;

const isNonEmptyString = (value) => typeof value === 'string' && value.trim() !== '';

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const isPositiveInteger = (value) => Number.isInteger(value) && value > 0;

const report = (lines, stream) => stream.write(`${lines.join('\n')}\n`);

const escapeLiteral = (character) => character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const segmentSource = (segment) => [...segment]
  .map((character) => (character === '*' ? '[^/]*' : escapeLiteral(character)))
  .join('');

const globPattern = (glob) => new RegExp(`^${glob.split('/')
  .map((segment, index, segments) => {
    const separator = index === segments.length - 1 ? '' : '/';
    if (segment !== GLOB_SEGMENTS) return `${segmentSource(segment)}${separator}`;
    return separator === '' ? '(?:[^/]+(?:/[^/]+)*)?' : '(?:[^/]+/)*';
  })
  .join('')}$`);

const CENSUS_PATTERNS = Object.freeze(CENSUS_GLOBS.map((glob) => ({ glob, pattern: globPattern(glob) })));

function parseArgs(argv) {
  if (argv.length === 0) return { ok: true, options: {} };
  const [flag, value, ...rest] = argv;
  if (!VALUE_FLAGS.includes(flag)) {
    return { ok: false, error: `unknown argument ${JSON.stringify(flag)}; accepted: ${VALUE_FLAGS.join(', ')}` };
  }
  if (value === undefined || VALUE_FLAGS.includes(value)) {
    return { ok: false, error: `${flag} requires a value` };
  }
  const tail = parseArgs(rest);
  if (!tail.ok) return tail;
  return { ok: true, options: { [flag]: value, ...tail.options } };
}

function readRegistry(root) {
  const path = join(root, REGISTRY_RELPATH);
  if (!existsSync(path)) {
    return { ok: false, errors: [`${REGISTRY_RELPATH}: invariant registry not found; no domain can be anchored`] };
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    return { ok: false, errors: [`${REGISTRY_RELPATH}: could not be parsed as JSON: ${error.message}`] };
  }
  if (!isPlainObject(parsed) || !Array.isArray(parsed.invariants)) {
    return { ok: false, errors: [`${REGISTRY_RELPATH}: expected an object carrying an "invariants" array`] };
  }
  return { ok: true, invariants: parsed.invariants.filter(isPlainObject) };
}

function domainShapeErrors(domain, named) {
  if (!isPlainObject(domain)) return [`${named} has a ${JSON.stringify(DOMAIN_FIELD)} that is not an object`];
  const unknown = Object.keys(domain).filter((key) => !DOMAIN_KEYS.includes(key));
  const missing = DOMAIN_REQUIRED_KEYS.filter((key) => domain[key] === undefined);
  return [
    ...unknown.map((key) => `${named} has the unknown ${JSON.stringify(DOMAIN_FIELD)} key ${JSON.stringify(key)}; accepted: ${DOMAIN_KEYS.join(', ')}`),
    ...missing.map((key) => `${named} has a ${JSON.stringify(DOMAIN_FIELD)} with no ${JSON.stringify(key)}`),
    ...(missing.length === 0 && !isNonEmptyString(domain.path) ? [`${named} has a ${JSON.stringify(DOMAIN_FIELD)} whose "path" is not a non-empty string`] : []),
    ...(missing.length === 0 && !isPositiveInteger(domain.line) ? [`${named} has a ${JSON.stringify(DOMAIN_FIELD)} whose "line" is not a positive integer`] : []),
    ...(missing.length === 0 && !IDENTIFIER.test(String(domain.constant)) ? [`${named} has a ${JSON.stringify(DOMAIN_FIELD)} whose "constant" ${JSON.stringify(domain.constant)} is not a JavaScript identifier`] : []),
    ...(domain.members !== undefined && (!Array.isArray(domain.members) || domain.members.length === 0 || !domain.members.every(isNonEmptyString))
      ? [`${named} has a ${JSON.stringify(DOMAIN_FIELD)} whose "members" is not a non-empty array of non-empty strings`]
      : []),
  ];
}

function subsetErrors(effective, declaration, domain, named) {
  const quantified = new Set(effective);
  return declaration.sets
    .filter((set) => set.members.length > quantified.size && effective.every((member) => set.members.includes(member)))
    .map((set) => {
      const unquantified = set.members.filter((member) => !quantified.has(member));
      const source = domain.members === undefined ? `the ${effective.length} member(s) of ${domain.constant}` : `a hand-list of ${effective.length} member(s)`;
      return `${named} quantifies over ${source}, which is a proper subset of ${set.name} at ${domain.path}:${set.line}; ${set.name} already closes over ${set.members.length} member(s) and these are left unquantified: ${unquantified.join(', ')}`;
    });
}

function domainErrors(entry, root) {
  const domain = entry[DOMAIN_FIELD];
  if (domain === undefined) return [];
  const named = `${REGISTRY_RELPATH}: ${entry.id}`;
  const shape = domainShapeErrors(domain, named);
  if (shape.length > 0) return shape;
  const absolute = join(root, domain.path);
  if (!existsSync(absolute)) {
    return [`${named} cites ${domain.path}, which does not exist under the repository root`];
  }
  let source;
  try {
    source = readFileSync(absolute, 'utf8');
  } catch (error) {
    return [`${named} cites ${domain.path}, which could not be read: ${error.message}`];
  }
  const declaration = declarationOf(source, domain.constant);
  if (!declaration.ok) {
    return [`${named} cites ${domain.path}, which could not be scanned as JavaScript: ${declaration.error}`];
  }
  if (!declaration.found) {
    return [`${named} names the domain constant ${domain.constant}, which ${domain.path} does not declare at module scope; a domain is a constant that already exists in code`];
  }
  const effective = domain.members ?? declaration.members;
  return [
    ...(declaration.line === domain.line
      ? []
      : [`${named} cites ${domain.path}:${domain.line} for ${domain.constant}, which is declared at ${domain.path}:${declaration.line}`]),
    ...(declaration.exported
      ? []
      : [`${named} names ${domain.constant} at ${domain.path}:${declaration.line}, which is module-private; a witness in another module cannot iterate a domain the module does not export`]),
    ...(effective === undefined
      ? [`${named} names ${domain.constant} at ${domain.path}:${declaration.line}, which is not a closed set this checker can list; declare "members" or bind the constant to a frozen list`]
      : subsetErrors(effective, declaration, domain, named)),
  ];
}

function trackedSources(root) {
  const result = spawnSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' });
  if (result.error !== undefined || result.status !== 0) {
    const detail = result.error === undefined ? (result.stderr ?? '').trim() : result.error.message;
    return { ok: false, error: `git ls-files failed in ${root}: ${detail || 'unknown failure'}` };
  }
  return {
    ok: true,
    paths: result.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => CENSUS_EXTENSIONS.some((extension) => line.endsWith(extension))),
  };
}

function quantifiedKeys(invariants) {
  return new Set(invariants
    .filter((entry) => isPlainObject(entry[DOMAIN_FIELD]) && isNonEmptyString(entry[DOMAIN_FIELD].path) && isNonEmptyString(entry[DOMAIN_FIELD].constant))
    .map((entry) => `${entry[DOMAIN_FIELD].path}${CANDIDATE_SEPARATOR}${entry[DOMAIN_FIELD].constant}`));
}

function waiverErrors() {
  return Object.entries(CENSUS_WAIVERS)
    .filter(([, reason]) => !isNonEmptyString(reason))
    .map(([key]) => `${CHECKER_RELPATH}: CENSUS_WAIVERS waives ${key} with no stated reason`);
}

function censusErrors(root, invariants) {
  const tracked = trackedSources(root);
  if (!tracked.ok) return { errors: [tracked.error], counted: 0 };
  const uncovered = tracked.paths.filter((path) => !CENSUS_PATTERNS.some(({ pattern }) => pattern.test(path)));
  if (uncovered.length > 0) {
    return {
      errors: [`${CHECKER_RELPATH}: CENSUS_GLOBS does not cover ${uncovered.length} tracked source file(s), so the census would be a sample rather than a closed set: ${uncovered.join(', ')}`],
      counted: 0,
    };
  }
  const quantified = quantifiedKeys(invariants);
  const scanned = tracked.paths.map((path) => {
    let source;
    try {
      source = readFileSync(join(root, path), 'utf8');
    } catch (error) {
      return { path, error: `${path}: could not be read for the vocabulary census: ${error.message}` };
    }
    const result = candidatesIn(path, source);
    return result.ok
      ? { path, candidates: result.candidates }
      : { path, error: `${path}: could not be scanned for the vocabulary census: ${result.error}` };
  });
  const candidates = scanned.flatMap((entry) => entry.candidates ?? []);
  const unclassified = unclassifiedCandidates(candidates, quantified, CENSUS_WAIVERS);
  return {
    counted: candidates.length,
    files: tracked.paths.length,
    errors: [
      ...scanned.flatMap((entry) => (entry.error === undefined ? [] : [entry.error])),
      ...waiverErrors(),
      ...unclassified.map((candidate) => `${candidate.key}: ${candidate.origin} closing over ${candidate.members.length} member(s) (${candidate.members.join(', ')}) is ${candidate.reasons.join(' and ')}, but no registry invariant quantifies over it and CENSUS_WAIVERS states no reason to exempt it`),
    ],
  };
}

function main(argv, stdout, stderr) {
  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    report([`invariant-shape-check: ${parsed.error}`], stderr);
    return EXIT_USAGE;
  }
  const root = parsed.options['--root'] ?? dirname(dirname(fileURLToPath(import.meta.url)));
  const registry = readRegistry(root);
  if (!registry.ok) {
    report(['invariant-shape-check: FAILED', ...registry.errors.map((line) => `  ${line}`)], stderr);
    return EXIT_FAIL;
  }
  const anchoring = registry.invariants.flatMap((entry) => domainErrors(entry, root));
  const census = censusErrors(root, registry.invariants);
  const errors = [...anchoring, ...census.errors];
  if (errors.length > 0) {
    report([
      'invariant-shape-check: FAILED',
      `  domain anchoring: ${anchoring.length} finding(s) over ${registry.invariants.filter((entry) => entry[DOMAIN_FIELD] !== undefined).length} declared domain(s)`,
      `  vocabulary census: ${census.errors.length} finding(s) over ${census.counted} candidate domain(s) in ${census.files ?? 0} tracked source file(s)`,
      ...errors.map((line) => `  ${line}`),
    ], stderr);
    return EXIT_FAIL;
  }
  report([
    'invariant-shape-check: ok',
    `  registry: ${REGISTRY_RELPATH} (${registry.invariants.length} invariant(s), ${registry.invariants.filter((entry) => entry[DOMAIN_FIELD] !== undefined).length} with a declared domain)`,
    `  census: ${census.counted} candidate domain(s) in ${census.files} tracked source file(s) under ${CENSUS_GLOBS.join(', ')}`,
  ], stdout);
  return EXIT_OK;
}

process.exitCode = main(process.argv.slice(2), process.stdout, process.stderr);
