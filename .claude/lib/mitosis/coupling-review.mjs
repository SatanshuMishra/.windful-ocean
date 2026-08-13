import { readFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const DEFAULT_RISK_MARKERS = Object.freeze(['auth', 'security', 'secret', 'payment', 'crypto', 'migrations', 'infra', 'deploy']);
const MIGRATION_SEGMENT = 'migrations/';
const ROOT_MIGRATION_DIR = '<root>';
const PAIR_KEY_SEPARATOR = ' ';
const USAGE = 'usage: coupling-review.mjs <candidates.json>';

function requireNonEmptyString(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`coupling-review: ${field} must be a non-empty string, because a blank identifier cannot be matched back to a task and its pair would vanish from the emission instead of being reviewed; received ${JSON.stringify(value)}`);
  }
  return value;
}

function requireStringArray(value, field) {
  if (!Array.isArray(value)) {
    throw new TypeError(`coupling-review: ${field} must be an array of non-empty strings, because a bare string would be iterated character by character and every signal would be scored against fragments rather than paths; received ${JSON.stringify(value)}`);
  }
  return value.map((entry, index) => requireNonEmptyString(entry, `${field}[${index}]`));
}

function normalizeFilePath(path) {
  return path.replace(/\\/g, '/');
}

function canonicalPair(a, b) {
  return [a, b].sort();
}

function pairKey(pair) {
  return pair.join(PAIR_KEY_SEPARATOR);
}

function requireSide(value, field) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`coupling-review: ${field} must be an object carrying { id, fileScope }, because every signal detector reads both and a missing side scores as a pair with no files, which reports real coupling as absent; received ${JSON.stringify(value)}`);
  }
  return Object.freeze({
    id: requireNonEmptyString(value.id, `${field}.id`),
    fileScope: Object.freeze(requireStringArray(value.fileScope, `${field}.fileScope`).map(normalizeFilePath)),
  });
}

function requireCandidates(pairs) {
  if (!Array.isArray(pairs)) {
    throw new TypeError(`coupling-review: pairs must be an array of { a, b } candidates, because anything else carries no pair to review and would return an empty emission that reads as "no coupling found"; received ${JSON.stringify(pairs)}`);
  }
  const seen = new Set();
  return pairs.map((entry, index) => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new TypeError(`coupling-review: pairs[${index}] must be an object carrying { a, b }, because a candidate with no sides cannot be scored and would drop out of the emission unreviewed; received ${JSON.stringify(entry)}`);
    }
    const a = requireSide(entry.a, `pairs[${index}].a`);
    const b = requireSide(entry.b, `pairs[${index}].b`);
    if (a.id === b.id) {
      throw new Error(`coupling-review: pairs[${index}] names the same task on both sides (${a.id}); a task cannot be coupled to itself, so the caller's pair enumeration is wrong and the emission it produces would not describe the graph`);
    }
    const key = pairKey(canonicalPair(a.id, b.id));
    if (seen.has(key)) {
      throw new Error(`coupling-review: pairs[${index}] repeats the candidate ${a.id}/${b.id}; two records for one pair make the verdict-coverage check ambiguous about which record a verdict answers, so one of them would ship unreviewed`);
    }
    seen.add(key);
    return { a, b };
  });
}

function requireAdjacency(value) {
  if (value === undefined || value === null) return Object.freeze({});
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`coupling-review: context.importAdjacency must be an object mapping a file path to its one-hop neighbours, because anything else silently scores every pair as unlinked and reports real import coupling as absent; received ${JSON.stringify(value)}`);
  }
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([file, neighbours]) => [
    normalizeFilePath(requireNonEmptyString(file, 'a context.importAdjacency key')),
    Object.freeze(requireStringArray(neighbours, `context.importAdjacency[${JSON.stringify(file)}]`).map(normalizeFilePath)),
  ])));
}

function requireRegressionKeys(value) {
  if (value === undefined || value === null) return Object.freeze([]);
  if (!Array.isArray(value)) {
    throw new TypeError(`coupling-review: context.regressions must be an array of { pair: [idA, idB] } records, because anything else cannot be matched to a candidate and would quietly stop every historically-broken pair defaulting to serialize; received ${JSON.stringify(value)}`);
  }
  return Object.freeze(value.map((entry, index) => {
    if (entry === null || typeof entry !== 'object' || !Array.isArray(entry.pair) || entry.pair.length !== 2) {
      throw new TypeError(`coupling-review: context.regressions[${index}].pair must be a two-element array of task ids, because a record naming anything else cannot be matched to a candidate and would quietly stop that pair defaulting to serialize; received ${JSON.stringify(entry)}`);
    }
    return pairKey(canonicalPair(
      requireNonEmptyString(entry.pair[0], `context.regressions[${index}].pair[0]`),
      requireNonEmptyString(entry.pair[1], `context.regressions[${index}].pair[1]`),
    ));
  }));
}

function requireContext(value) {
  if (value !== undefined && value !== null && (typeof value !== 'object' || Array.isArray(value))) {
    throw new TypeError(`coupling-review: context must be an object carrying { importAdjacency, riskMarkers, regressions }, because a malformed context disables detectors silently and every pair would then look signal-free; received ${JSON.stringify(value)}`);
  }
  const supplied = value === undefined || value === null ? {} : value;
  const markers = supplied.riskMarkers === undefined || supplied.riskMarkers === null
    ? DEFAULT_RISK_MARKERS
    : Object.freeze(requireStringArray(supplied.riskMarkers, 'context.riskMarkers'));
  return Object.freeze({
    importAdjacency: requireAdjacency(supplied.importAdjacency),
    riskMarkers: markers,
    regressionKeys: requireRegressionKeys(supplied.regressions),
  });
}

function markerMatcher(marker) {
  return new RegExp(`(^|/)${marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
}

function importAdjacentSignals(a, b, adjacency) {
  const neighbours = (file) => adjacency[file] || [];
  const linked = a.fileScope.some((fa) => b.fileScope.some((fb) => neighbours(fa).includes(fb) || neighbours(fb).includes(fa)));
  return linked ? ['import-adjacent'] : [];
}

function sharedRiskMarkerSignals(a, b, riskMarkers) {
  const shared = riskMarkers.filter((marker) => {
    const matches = markerMatcher(marker);
    return a.fileScope.some((file) => matches.test(file)) && b.fileScope.some((file) => matches.test(file));
  });
  return [...new Set(shared)].sort().map((marker) => `shared-risk-marker:${marker}`);
}

function regressionHistorySignals(a, b, regressionKeys) {
  return regressionKeys.includes(pairKey(canonicalPair(a.id, b.id))) ? ['regression-history'] : [];
}

function migrationDirs(fileScope) {
  const dirs = new Set();
  for (const file of fileScope) {
    const at = file.indexOf(MIGRATION_SEGMENT);
    if (at === -1) continue;
    if (at > 0 && file[at - 1] !== '/') continue;
    const prefix = file.slice(0, at).replace(/\/+$/, '');
    dirs.add(prefix === '' ? ROOT_MIGRATION_DIR : prefix);
  }
  return dirs;
}

function sameMigrationDirSignals(a, b) {
  const other = migrationDirs(b.fileScope);
  return [...migrationDirs(a.fileScope)].filter((dir) => other.has(dir)).sort().map((dir) => `same-migration-dir:${dir}`);
}

export function reviewCoupling(pairs, context) {
  const candidates = requireCandidates(pairs);
  const settings = requireContext(context);
  const emitted = [];
  for (const { a, b } of candidates) {
    const adjacent = importAdjacentSignals(a, b, settings.importAdjacency);
    const markers = sharedRiskMarkerSignals(a, b, settings.riskMarkers);
    const regressions = regressionHistorySignals(a, b, settings.regressionKeys);
    const migrations = sameMigrationDirSignals(a, b);
    const signals = [...adjacent, ...markers, ...regressions, ...migrations];
    if (signals.length === 0) continue;
    const forced = markers.length > 0 || regressions.length > 0 || migrations.length > 0;
    emitted.push(Object.freeze({
      pair: Object.freeze(canonicalPair(a.id, b.id)),
      signals: Object.freeze(signals),
      default: forced ? 'serialize' : 'parallel',
    }));
  }
  emitted.sort((x, y) => (x.pair[0] === y.pair[0] ? x.pair[1].localeCompare(y.pair[1]) : x.pair[0].localeCompare(y.pair[0])));
  return Object.freeze(emitted);
}

function usageExit(problem) {
  process.stderr.write(`coupling-review: ${problem}\n${USAGE}\n`);
  process.exit(2);
}

function main() {
  const positional = process.argv.slice(2);
  if (positional.length !== 1) usageExit(`expected exactly one candidates JSON path, received ${positional.length}`);
  try {
    const document = JSON.parse(readFileSync(positional[0], 'utf8'));
    const emitted = reviewCoupling(document.pairs, document.context);
    process.stdout.write(JSON.stringify(emitted) + '\n');
  } catch (error) {
    process.stderr.write(`coupling-review error: ${error.message}\n`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) main();
