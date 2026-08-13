import { readFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { makeFileScopePack, requireFileScopePack } from './msp-file-scope.mjs';

const DECISIONS = Object.freeze(['parallel', 'serialize']);
const DEFAULT_RISK_MARKERS = Object.freeze(['auth', 'security', 'secret', 'payment', 'crypto', 'migrations', 'infra', 'deploy']);
const MIGRATION_SEGMENT = 'migrations/';
const SEGMENT_SEPARATOR = '/';
const ASCII_LIMIT = 128;
const ROOT_MIGRATION_DIR = '<root>';
const PAIR_KEY_SEPARATOR = ' ';
const USAGE = 'usage: coupling-review.mjs <candidates.json> [--verdicts <verdicts.json>]';

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

function normalizeScopePack(scope) {
  return makeFileScopePack({
    edit: scope.edit.map(normalizeFilePath),
    read: scope.read.map(normalizeFilePath),
    truncated: scope.truncated,
  });
}

function byCodeUnit(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
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
    fileScope: normalizeScopePack(requireFileScopePack(value.fileScope, `coupling-review: ${field}.fileScope`)),
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

function foldCase(value) {
  let folded = '';
  for (let index = 0; index < value.length; index += 1) {
    const unit = value[index];
    const upper = unit.toUpperCase();
    const foldable = upper.length === 1 && !(unit.charCodeAt(0) >= ASCII_LIMIT && upper.charCodeAt(0) < ASCII_LIMIT);
    folded += foldable ? upper : unit;
  }
  return folded;
}

function hasSegmentStartingWith(foldedFile, foldedMarker) {
  for (let at = foldedFile.indexOf(foldedMarker); at !== -1; at = foldedFile.indexOf(foldedMarker, at + 1)) {
    if (at === 0 || foldedFile[at - 1] === SEGMENT_SEPARATOR) return true;
  }
  return false;
}

function importAdjacentSignals(a, b, adjacency) {
  const neighbours = (file) => adjacency[file] || [];
  const linked = a.fileScope.edit.some((fa) => b.fileScope.edit.some((fb) => neighbours(fa).includes(fb) || neighbours(fb).includes(fa)));
  return linked ? ['import-adjacent'] : [];
}

function sharedRiskMarkerSignals(a, b, riskMarkers) {
  const foldedA = a.fileScope.edit.map(foldCase);
  const foldedB = b.fileScope.edit.map(foldCase);
  const shared = riskMarkers.filter((marker) => {
    const folded = foldCase(marker);
    return foldedA.some((file) => hasSegmentStartingWith(file, folded))
      && foldedB.some((file) => hasSegmentStartingWith(file, folded));
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
  const other = migrationDirs(b.fileScope.edit);
  return [...migrationDirs(a.fileScope.edit)].filter((dir) => other.has(dir)).sort().map((dir) => `same-migration-dir:${dir}`);
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
  emitted.sort((x, y) => (x.pair[0] === y.pair[0] ? byCodeUnit(x.pair[1], y.pair[1]) : byCodeUnit(x.pair[0], y.pair[0])));
  return Object.freeze(emitted);
}

function requirePairKey(pair, field) {
  if (!Array.isArray(pair) || pair.length !== 2) {
    throw new TypeError(`coupling-review: ${field} must carry a two-element pair array, because a record that cannot be keyed would be skipped by the coverage check and its pair would ship with no verdict at all; received ${JSON.stringify(pair)}`);
  }
  return canonicalPair(requireNonEmptyString(pair[0], `${field}[0]`), requireNonEmptyString(pair[1], `${field}[1]`));
}

function requireEmission(emitted) {
  if (!Array.isArray(emitted)) {
    throw new TypeError(`coupling-review: emitted must be the array reviewCoupling returned, because the coverage check has nothing to measure the verdicts against otherwise and would report full coverage of nothing; received ${JSON.stringify(emitted)}`);
  }
  const seen = new Set();
  return emitted.map((record, index) => {
    if (record === null || typeof record !== 'object' || Array.isArray(record)) {
      throw new TypeError(`coupling-review: emitted[${index}] must be a { pair, signals, default } record, because a record with no shape cannot be matched to a verdict and would drop out of the coverage check unnoticed; received ${JSON.stringify(record)}`);
    }
    if (!DECISIONS.includes(record.default)) {
      throw new TypeError(`coupling-review: emitted[${index}].default must be one of ${DECISIONS.join(', ')}, because the skeptical-default rule cannot decide whether an override owes a rationale otherwise; received ${JSON.stringify(record.default)}`);
    }
    requireStringArray(record.signals, `emitted[${index}].signals`);
    const pair = requirePairKey(record.pair, `emitted[${index}].pair`);
    const key = pairKey(pair);
    if (seen.has(key)) {
      throw new Error(`coupling-review: emitted[${index}] repeats the emitted pair ${pair.join('/')}; two records for one pair make the verdict-coverage check ambiguous about which record a verdict answers, so a skeptical serialize default could be overridden by a verdict answering the other record`);
    }
    seen.add(key);
    return { key, label: pair.join('/'), fallback: record.default };
  });
}

function requireVerdicts(verdicts) {
  if (!Array.isArray(verdicts)) {
    throw new TypeError(`coupling-review: verdicts must be an array of { pair, decision, rationale } records, because a plan carrying no verdicts array has rendered no coupling decision at all and must not read as a covered plan; received ${JSON.stringify(verdicts)}`);
  }
  return verdicts.map((verdict, index) => {
    if (verdict === null || typeof verdict !== 'object' || Array.isArray(verdict)) {
      throw new TypeError(`coupling-review: verdicts[${index}] must be a { pair, decision, rationale } record, because a shapeless entry answers no emitted pair and would leave that pair silently uncovered; received ${JSON.stringify(verdict)}`);
    }
    if (!DECISIONS.includes(verdict.decision)) {
      throw new TypeError(`coupling-review: verdicts[${index}].decision must be one of ${DECISIONS.join(', ')}, because an unrecognised decision cannot be compared against the emitted default and would pass review meaning nothing; received ${JSON.stringify(verdict.decision)}`);
    }
    if (verdict.rationale !== undefined && verdict.rationale !== null && typeof verdict.rationale !== 'string') {
      throw new TypeError(`coupling-review: verdicts[${index}].rationale must be a string, null or absent, because a non-string rationale would satisfy the skeptical-default override check while carrying no reason a reviewer can read; received ${JSON.stringify(verdict.rationale)}`);
    }
    const pair = requirePairKey(verdict.pair, `verdicts[${index}].pair`);
    const rationale = typeof verdict.rationale === 'string' && verdict.rationale.trim().length > 0 ? verdict.rationale : null;
    return { key: pairKey(pair), label: pair.join('/'), decision: verdict.decision, rationale };
  });
}

function coverageProblems(records, rendered) {
  const byKey = new Map(records.map((record) => [record.key, record]));
  const counts = new Map();
  for (const verdict of rendered) counts.set(verdict.key, (counts.get(verdict.key) || 0) + 1);
  const problems = [];
  for (const record of records) {
    const count = counts.get(record.key) || 0;
    if (count === 0) problems.push(`${record.label} was emitted for review and no verdict answers it; the plan must render a decision for every emitted pair`);
    else if (count > 1) problems.push(`${record.label} carries ${count} verdicts; every emitted pair belongs in exactly one verdict bucket`);
  }
  for (const verdict of rendered) {
    const record = byKey.get(verdict.key);
    if (record === undefined) {
      problems.push(`${verdict.label} carries a verdict but was never emitted for review; a verdict on an unemitted pair means the plan was rendered against a different graph`);
      continue;
    }
    if (record.fallback === 'serialize' && verdict.decision === 'parallel' && verdict.rationale === null) {
      problems.push(`${verdict.label} defaults to serialize and is overridden to parallel with no rationale; the skeptical default stays serialized unless an explicit rationale is supplied`);
    }
  }
  return problems;
}

export function assertVerdictsCoverPairs(emitted, verdicts) {
  const problems = coverageProblems(requireEmission(emitted), requireVerdicts(verdicts));
  if (problems.length === 0) return;
  throw new Error(`coupling-review: the plan does not render every coupling decision (${problems.length} problem(s)); an unanswered or unanswerable verdict is a hard stop rather than a warning:\n- ${problems.join('\n- ')}`);
}

function usageExit(problem) {
  process.stderr.write(`coupling-review: ${problem}\n${USAGE}\n`);
  process.exit(2);
}

function main() {
  const argv = process.argv.slice(2);
  const positional = [];
  let verdictsPath = null;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== '--verdicts') {
      positional.push(argv[index]);
      continue;
    }
    const supplied = argv[index + 1];
    index += 1;
    if (supplied === undefined || supplied.startsWith('--')) usageExit('--verdicts needs a path to a verdicts JSON file');
    if (verdictsPath !== null) usageExit(`--verdicts was supplied twice (${verdictsPath} then ${supplied}); honouring only the last one would report a covered plan while never reading the first file`);
    verdictsPath = supplied;
  }
  if (positional.length !== 1) usageExit(`expected exactly one candidates JSON path, received ${positional.length}`);
  try {
    const document = JSON.parse(readFileSync(positional[0], 'utf8'));
    const emitted = reviewCoupling(document.pairs, document.context);
    if (verdictsPath !== null) assertVerdictsCoverPairs(emitted, JSON.parse(readFileSync(verdictsPath, 'utf8')));
    process.stdout.write(JSON.stringify(emitted) + '\n');
  } catch (error) {
    process.stderr.write(`coupling-review error: ${error.message}\n`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) main();
