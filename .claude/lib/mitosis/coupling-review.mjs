import { readFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { makeFileScopePack, requireFileScopePack } from './msp-file-scope.mjs';

const DECISIONS = Object.freeze(['parallel', 'serialize']);
const DECISION_STRICTNESS = Object.freeze({ parallel: 0, serialize: 1 });
const SOURCE_DEFAULT = 'default';
const SOURCE_VERDICT = 'verdict';
const DEFAULT_RISK_MARKERS = Object.freeze(['auth', 'security', 'secret', 'payment', 'crypto', 'migrations', 'infra', 'deploy']);
const RISK_MARKER_CAP = 64;
const DESCRIBE_CAP = 200;
const IDENTIFIER_CAP = 96;
const MIGRATION_DIR_CAP = 120;
const CONTROL_RE = /\p{Cc}/gu;
const NON_RENDERING_RE = /[\p{C}\p{Default_Ignorable_Code_Point}]/gu;
const NON_RENDERING_PROBE_RE = new RegExp(NON_RENDERING_RE.source, 'u');
const WHITESPACE_RUN_RE = /\s+/g;

export const COUPLING_DECISIONS = DECISIONS;
export const COUPLING_PARALLEL = 'parallel';
export const COUPLING_SERIALIZE = 'serialize';
export const COUPLING_RATIONALE_CAP = 200;
export const COUPLING_RESOLUTION_SOURCES = Object.freeze([SOURCE_DEFAULT, SOURCE_VERDICT]);

const SIGNAL_DETAIL_SEPARATOR = ':';
const SIGNAL_CLASS_DETAIL = Object.freeze({
  'import-adjacent': false,
  'regression-history': false,
  'same-migration-dir': true,
  'shared-risk-marker': true,
});

export const COUPLING_SIGNAL_CLASSES = Object.freeze(Object.keys(SIGNAL_CLASS_DETAIL).sort(byCodeUnit));

export const COUPLING_OBLIGATIONS = Object.freeze([
  'C5-O1 two of the four signal classes are structurally dead in production. import-adjacent needs context.importAdjacency and regression-history needs context.regressions, and nothing outside a test writes graph.couplingContext, so requireContext defaults both to empty and neither detector can fire on a real graph. Every production emission is therefore serialize-defaulted, and SPEC B1 acceptance "signals detected per the four signal classes" is true of the tests and false of any real run. Supplying an import map and a run history is real work with its own data sources and is deliberately NOT done here, because introducing new signal sources while enforcement is introduced would change two variables at once and make the wave-count change unattributable.',
  'C5-O2 enforcement over-serializes, deliberately and user-visibly. Any two unordered tasks sharing a path segment starting with one of auth, security, secret, payment, crypto, migrations, infra or deploy now take a real edge and land in different waves, where before C5a they were co-scheduled. The relaxation mechanism is --verdicts with a rationale, but no live caller renders verdicts, so on a security-heavy repository the serialization is unconditional and can serialize most of a wave. This is accepted rather than mitigated: over-serialization is a throughput cost, never a correctness cost, and it is the safe side to fail on.',
  'C5-O3 the plan-to-task-graph skill still tells its reader a dependency cycle is the ONLY halt. That sentence was already false before C5a (a missing verdict throws whenever --verdicts is supplied) and C5a makes it more false, because a coupling-induced cycle is a newly reachable halt on graphs that previously hardened cleanly. The skill is NOT corrected here: .claude/skills stays byte-clean through C5 and C6, and D1 is the designed write point where that skill starts invoking the CLI directly. Whoever lands D1 owns naming all three halts.',
  'C5-O4 a coupling decision reaches no consumer that reads the graph rather than its edges. couplingResolution is written onto the hardened graph and the audit, and the serialize half is enforced through dependsOn and named in edgeReasons as coupling-serialize, so a consumer reading the hardened graph can tell a coupling edge from a fileScope overlap. But the engine task map is built by a model from nine named fields and neither coupling nor couplingResolution is one of them, so the resolution itself does NOT survive into engineArgs.tasks and no engine-side consumer can read the decision or its rationale. C7 owns carrying the resolution through as a belt-and-braces check once the task map is computed rather than reported.',
  'C5-O5 the pass materializes the full transitive closure as direct edges, and it demands a verdict for a pair the graph already orders. Ten tasks in one migrations directory take 45 direct edges where 9 orderings produce the identical wave plan, and a 20-task chain emits 190 pairs under --verdicts and refuses with 189 problems answering pairs dependsOn already settled. Both halves are reporting and throughput rather than correctness: the waves are the same either way and every surplus edge restates an ordering the graph already carries. Emitting a transitive reduction, and dropping the verdict demand on an already-ordered pair, change what the audit counts and what a rendered plan must answer, so neither is folded into the change that introduced enforcement.',
  'C5-O6 the coupling placement record cannot tell its own prior edge from one a human typed. graph.couplingEdges names every edge this pass placed and still owns, and a re-run withdraws one whose pair now resolves to parallel; but if a human writes that same edge into dependsOn while the record still claims it, the withdrawal removes the human edge and reports it as the pass taking back its own. Telling the two apart needs a provenance stamp on the declared edge itself, which is a task-graph schema change every producer would have to honour, so the record is trusted as written and a hand-edit that collides with a live claim is a known and accepted loss.',
]);
const MIGRATION_SEGMENT = 'migrations/';
const SEGMENT_SEPARATOR = '/';
const PAIR_LABEL_SEPARATOR = '/';
const ASCII_LIMIT = 128;
const ROOT_MIGRATION_DIR = '<root>';
const ELIDED_MIGRATION_DIR = '<elided>';
const TRUNCATION_MARK = '...';
const EMPTY_NEIGHBOURS = Object.freeze([]);
const USAGE = 'usage: coupling-review.mjs <candidates.json> [--verdicts <verdicts.json>]';

function escapeNonRendering(text) {
  return text.replace(NON_RENDERING_RE, (unit) => `<U+${unit.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}>`);
}

function carriesNonRendering(value) {
  return NON_RENDERING_PROBE_RE.test(value);
}

function describe(value) {
  const rendered = (() => {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  })();
  const text = escapeNonRendering(rendered === undefined ? String(value) : rendered);
  if (text.length <= DESCRIBE_CAP) return text;
  return `${escapeNonRendering(text.slice(0, DESCRIBE_CAP))}${TRUNCATION_MARK} (${text.length} characters, truncated)`;
}

function boundIdentifier(value) {
  const rendered = escapeNonRendering(JSON.stringify(String(value)).slice(1, -1));
  if (rendered.length <= IDENTIFIER_CAP) return rendered;
  return `${escapeNonRendering(rendered.slice(0, IDENTIFIER_CAP))}${TRUNCATION_MARK} (${rendered.length} characters, truncated)`;
}

function pairLabel(pair) {
  return pair.map(boundIdentifier).join(PAIR_LABEL_SEPARATOR);
}

export function decisionStrictness(decision) {
  if (typeof decision !== 'string' || !Object.prototype.hasOwnProperty.call(DECISION_STRICTNESS, decision)) {
    throw new TypeError(`coupling-review: the decision ${describe(decision)} carries no strictness rank, so whether an override relaxes or tightens the skeptical default cannot be decided; every decision in the vocabulary owes a rank, because bucketing an unranked one with the relaxed arm makes a newly-added token silently co-schedulable`);
  }
  return DECISION_STRICTNESS[decision];
}

function requireNonEmptyString(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`coupling-review: ${field} must be a non-empty string, because a blank identifier cannot be matched back to a task and its pair would vanish from the emission instead of being reviewed; received ${describe(value)}`);
  }
  if (carriesNonRendering(value)) {
    throw new TypeError(`coupling-review: ${field} carries a control or default-ignorable code point, and an identifier is matched literally rather than sanitized, so stripping it would collide this value with a distinct one and keeping it would name a task the graph does not contain; received ${describe(value)}`);
  }
  return value;
}

function requireStringArray(value, field) {
  if (!Array.isArray(value)) {
    throw new TypeError(`coupling-review: ${field} must be an array of non-empty strings, because a bare string would be iterated character by character and every signal would be scored against fragments rather than paths; received ${describe(value)}`);
  }
  return value.map((entry, index) => requireNonEmptyString(entry, `${field}[${index}]`));
}

function sanitizeFreeText(value) {
  return value.replace(CONTROL_RE, ' ').replace(NON_RENDERING_RE, '').replace(WHITESPACE_RUN_RE, ' ').trim();
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
  return pair.map((id) => `${id.length}:${id}`).join('');
}

function memoizedScopePack(value, field, scopes) {
  const cacheable = value !== null && typeof value === 'object';
  if (cacheable && scopes.has(value)) return scopes.get(value);
  const normalized = normalizeScopePack(requireFileScopePack(value, `coupling-review: ${field}.fileScope`));
  if (cacheable) scopes.set(value, normalized);
  return normalized;
}

function requireSide(value, field, scopes) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`coupling-review: ${field} must be an object carrying { id, fileScope }, because every signal detector reads both and a missing side scores as a pair with no files, which reports real coupling as absent; received ${describe(value)}`);
  }
  return Object.freeze({
    id: requireNonEmptyString(value.id, `${field}.id`),
    fileScope: memoizedScopePack(value.fileScope, field, scopes),
  });
}

function requireCandidates(pairs) {
  if (!Array.isArray(pairs)) {
    throw new TypeError(`coupling-review: pairs must be an array of { a, b } candidates, because anything else carries no pair to review and would return an empty emission that reads as "no coupling found"; received ${describe(pairs)}`);
  }
  const seen = new Set();
  const scopes = new Map();
  return pairs.map((entry, index) => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new TypeError(`coupling-review: pairs[${index}] must be an object carrying { a, b }, because a candidate with no sides cannot be scored and would drop out of the emission unreviewed; received ${describe(entry)}`);
    }
    const a = requireSide(entry.a, `pairs[${index}].a`, scopes);
    const b = requireSide(entry.b, `pairs[${index}].b`, scopes);
    if (a.id === b.id) {
      throw new Error(`coupling-review: pairs[${index}] names the same task on both sides (${boundIdentifier(a.id)}); a task cannot be coupled to itself, so the caller's pair enumeration is wrong and the emission it produces would not describe the graph`);
    }
    const key = pairKey(canonicalPair(a.id, b.id));
    if (seen.has(key)) {
      throw new Error(`coupling-review: pairs[${index}] repeats the candidate ${pairLabel([a.id, b.id])}; two records for one pair make the verdict-coverage check ambiguous about which record a verdict answers, so one of them would ship unreviewed`);
    }
    seen.add(key);
    return { a, b };
  });
}

function requireAdjacency(value) {
  if (value === undefined || value === null) return Object.freeze(Object.create(null));
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`coupling-review: context.importAdjacency must be an object mapping a file path to its one-hop neighbours, because anything else silently scores every pair as unlinked and reports real import coupling as absent; received ${describe(value)}`);
  }
  const adjacency = Object.create(null);
  for (const [file, neighbours] of Object.entries(value)) {
    const key = normalizeFilePath(requireNonEmptyString(file, 'a context.importAdjacency key'));
    adjacency[key] = Object.freeze(requireStringArray(neighbours, `context.importAdjacency[${describe(file)}]`).map(normalizeFilePath));
  }
  return Object.freeze(adjacency);
}

function requireRegressionKeys(value) {
  if (value === undefined || value === null) return Object.freeze([]);
  if (!Array.isArray(value)) {
    throw new TypeError(`coupling-review: context.regressions must be an array of { pair: [idA, idB] } records, because anything else cannot be matched to a candidate and would quietly stop every historically-broken pair defaulting to serialize; received ${describe(value)}`);
  }
  return Object.freeze(value.map((entry, index) => {
    if (entry === null || typeof entry !== 'object' || !Array.isArray(entry.pair) || entry.pair.length !== 2) {
      throw new TypeError(`coupling-review: context.regressions[${index}].pair must be a two-element array of task ids, because a record naming anything else cannot be matched to a candidate and would quietly stop that pair defaulting to serialize; received ${describe(entry)}`);
    }
    return pairKey(canonicalPair(
      requireNonEmptyString(entry.pair[0], `context.regressions[${index}].pair[0]`),
      requireNonEmptyString(entry.pair[1], `context.regressions[${index}].pair[1]`),
    ));
  }));
}

function requireRiskMarkerToken(value, field) {
  const marker = requireNonEmptyString(value, field);
  if (marker.length > RISK_MARKER_CAP) {
    throw new TypeError(`coupling-review: ${field} is ${marker.length} characters long, over the ${RISK_MARKER_CAP}-character cap; a marker that long is not a path segment and is written verbatim into the hardened graph and the audit that agents read back`);
  }
  if (sanitizeFreeText(marker) !== marker) {
    throw new TypeError(`coupling-review: ${field} carries leading, trailing or repeated whitespace, so it matches no path segment; a marker that silently matches nothing narrows the coupling pass while reading as a widening; received ${describe(marker)}`);
  }
  return marker;
}

function requireRiskMarkers(value, field) {
  if (value === undefined || value === null) {
    return Object.freeze({ riskMarkers: DEFAULT_RISK_MARKERS, riskMarkersOverridden: false });
  }
  const supplied = requireStringArray(value, field).map((marker, index) => requireRiskMarkerToken(marker, `${field}[${index}]`));
  const merged = [...new Set([...DEFAULT_RISK_MARKERS, ...supplied])].sort(byCodeUnit);
  return Object.freeze({ riskMarkers: Object.freeze(merged), riskMarkersOverridden: true });
}

function requireContext(value) {
  if (value !== undefined && value !== null && (typeof value !== 'object' || Array.isArray(value))) {
    throw new TypeError(`coupling-review: context must be an object carrying { importAdjacency, riskMarkers, regressions }, because a malformed context disables detectors silently and every pair would then look signal-free; received ${describe(value)}`);
  }
  const supplied = value === undefined || value === null ? {} : value;
  const markers = requireRiskMarkers(supplied.riskMarkers, 'context.riskMarkers');
  return Object.freeze({
    importAdjacency: requireAdjacency(supplied.importAdjacency),
    riskMarkers: markers.riskMarkers,
    riskMarkersOverridden: markers.riskMarkersOverridden,
    regressionKeys: requireRegressionKeys(supplied.regressions),
  });
}

export function couplingContextFacts(context) {
  const settings = requireContext(context);
  return Object.freeze({
    riskMarkers: settings.riskMarkers,
    riskMarkersOverridden: settings.riskMarkersOverridden,
    importAdjacencyFileCount: Object.keys(settings.importAdjacency).length,
    regressionPairCount: settings.regressionKeys.length,
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

function trimTrailingSeparators(prefix) {
  let end = prefix.length;
  while (end > 0 && prefix[end - 1] === SEGMENT_SEPARATOR) end -= 1;
  return prefix.slice(0, end);
}

function migrationDirs(files) {
  const dirs = new Set();
  for (const file of files) {
    const at = file.indexOf(MIGRATION_SEGMENT);
    if (at === -1) continue;
    if (at > 0 && file[at - 1] !== SEGMENT_SEPARATOR) continue;
    const prefix = trimTrailingSeparators(file.slice(0, at));
    dirs.add(prefix === '' ? ROOT_MIGRATION_DIR : prefix);
  }
  return dirs;
}

function inertMigrationDir(dir) {
  const inert = sanitizeFreeText(dir);
  const bounded = inert.length <= MIGRATION_DIR_CAP
    ? inert
    : `${sanitizeFreeText(inert.slice(0, MIGRATION_DIR_CAP))}${TRUNCATION_MARK}`;
  return bounded.length === 0 ? ELIDED_MIGRATION_DIR : bounded;
}

function scopeSignalFacts(scope, settings) {
  const neighbours = new Set();
  for (const file of scope.edit) {
    for (const neighbour of settings.importAdjacency[file] || EMPTY_NEIGHBOURS) neighbours.add(neighbour);
  }
  const folded = scope.edit.map(foldCase);
  const markers = new Set(settings.riskMarkers.filter((marker) => {
    const target = foldCase(marker);
    return folded.some((file) => hasSegmentStartingWith(file, target));
  }));
  return Object.freeze({
    editSet: new Set(scope.edit),
    neighbours,
    markers,
    migrationDirs: migrationDirs(scope.edit),
  });
}

function intersects(left, right) {
  const [small, large] = left.size <= right.size ? [left, right] : [right, left];
  for (const value of small) {
    if (large.has(value)) return true;
  }
  return false;
}

export function signalToken(className, detail) {
  if (!Object.prototype.hasOwnProperty.call(SIGNAL_CLASS_DETAIL, className)) {
    throw new TypeError(`coupling-review: the signal ${describe(className)} names no class in ${COUPLING_SIGNAL_CLASSES.join(', ')}; every signal a detector emits is built from that registry, because a detector minting its own class name produces a token no census can classify and the coupling it found is scored under a name nothing reads back`);
  }
  const detailed = SIGNAL_CLASS_DETAIL[className] === true;
  if (detailed !== (detail !== undefined)) {
    throw new TypeError(`coupling-review: the signal class ${describe(className)} ${detailed ? 'names the thing the pair shares and was built with no detail' : 'names no detail and was built with one'}; the arity is what tells a reader whether the text after ${describe(SIGNAL_DETAIL_SEPARATOR)} is a shared marker or part of the class name, so a token built against the wrong one is classified into the wrong half of the census`);
  }
  if (detailed && typeof detail !== 'string') {
    throw new TypeError(`coupling-review: the signal class ${describe(className)} was built with a detail of type ${typeof detail} (${describe(detail)}) rather than a string; the detail is interpolated straight into the token text, so a non-string value would report a shared marker whose text is that value's coerced form, and any reader of the token takes that coerced text for a real shared marker no file the pair touches was ever matched against`);
  }
  if (detailed && typeof detail === 'string' && detail.length === 0) {
    throw new TypeError(`coupling-review: the signal class ${describe(className)} was built with an empty-string detail; the detail names the marker or directory the pair shares, and an empty one would emit a token that reports a shared thing no file the pair touches can be named back to`);
  }
  return detailed ? `${className}${SIGNAL_DETAIL_SEPARATOR}${detail}` : className;
}

function importAdjacentSignals(a, b) {
  return intersects(a.neighbours, b.editSet) || intersects(b.neighbours, a.editSet) ? [signalToken('import-adjacent')] : [];
}

function sharedRiskMarkerSignals(a, b) {
  const shared = [];
  for (const marker of a.markers) {
    if (b.markers.has(marker)) shared.push(marker);
  }
  return shared.sort().map((marker) => signalToken('shared-risk-marker', marker));
}

function regressionHistorySignals(a, b, regressionKeys) {
  return regressionKeys.includes(pairKey(canonicalPair(a.id, b.id))) ? [signalToken('regression-history')] : [];
}

function sameMigrationDirSignals(a, b) {
  const shared = [];
  for (const dir of a.migrationDirs) {
    if (b.migrationDirs.has(dir)) shared.push(dir);
  }
  return [...new Set(shared.sort().map((dir) => signalToken('same-migration-dir', inertMigrationDir(dir))))];
}

export function reviewCoupling(pairs, context) {
  const candidates = requireCandidates(pairs);
  const settings = requireContext(context);
  const facts = new Map();
  const factsOf = (scope) => {
    const cached = facts.get(scope);
    if (cached !== undefined) return cached;
    const built = scopeSignalFacts(scope, settings);
    facts.set(scope, built);
    return built;
  };
  const emitted = [];
  for (const { a, b } of candidates) {
    const left = factsOf(a.fileScope);
    const right = factsOf(b.fileScope);
    const adjacent = importAdjacentSignals(left, right);
    const markers = sharedRiskMarkerSignals(left, right);
    const regressions = regressionHistorySignals(a, b, settings.regressionKeys);
    const migrations = sameMigrationDirSignals(left, right);
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
    throw new TypeError(`coupling-review: ${field} must carry a two-element pair array, because a record that cannot be keyed would be skipped by the coverage check and its pair would ship with no verdict at all; received ${describe(pair)}`);
  }
  return canonicalPair(requireNonEmptyString(pair[0], `${field}[0]`), requireNonEmptyString(pair[1], `${field}[1]`));
}

function requireEmission(emitted) {
  if (!Array.isArray(emitted)) {
    throw new TypeError(`coupling-review: emitted must be the array reviewCoupling returned, because the coverage check has nothing to measure the verdicts against otherwise and would report full coverage of nothing; received ${describe(emitted)}`);
  }
  const seen = new Set();
  return emitted.map((record, index) => {
    if (record === null || typeof record !== 'object' || Array.isArray(record)) {
      throw new TypeError(`coupling-review: emitted[${index}] must be a { pair, signals, default } record, because a record with no shape cannot be matched to a verdict and would drop out of the coverage check unnoticed; received ${describe(record)}`);
    }
    if (!DECISIONS.includes(record.default)) {
      throw new TypeError(`coupling-review: emitted[${index}].default must be one of ${DECISIONS.join(', ')}, because the skeptical-default rule cannot decide whether an override owes a rationale otherwise; received ${describe(record.default)}`);
    }
    const signals = requireStringArray(record.signals, `emitted[${index}].signals`);
    const pair = requirePairKey(record.pair, `emitted[${index}].pair`);
    const key = pairKey(pair);
    if (seen.has(key)) {
      throw new Error(`coupling-review: emitted[${index}] repeats the emitted pair ${pairLabel(pair)}; two records for one pair make the verdict-coverage check ambiguous about which record a verdict answers, so a skeptical serialize default could be overridden by a verdict answering the other record`);
    }
    seen.add(key);
    return { key, pair, signals, label: pairLabel(pair), fallback: record.default };
  });
}

function requireVerdicts(verdicts) {
  if (!Array.isArray(verdicts)) {
    throw new TypeError(`coupling-review: verdicts must be an array of { pair, decision, rationale } records, because a plan carrying no verdicts array has rendered no coupling decision at all and must not read as a covered plan; received ${describe(verdicts)}`);
  }
  return verdicts.map((verdict, index) => {
    if (verdict === null || typeof verdict !== 'object' || Array.isArray(verdict)) {
      throw new TypeError(`coupling-review: verdicts[${index}] must be a { pair, decision, rationale } record, because a shapeless entry answers no emitted pair and would leave that pair silently uncovered; received ${describe(verdict)}`);
    }
    if (!DECISIONS.includes(verdict.decision)) {
      throw new TypeError(`coupling-review: verdicts[${index}].decision must be one of ${DECISIONS.join(', ')}, because an unrecognised decision cannot be compared against the emitted default and would pass review meaning nothing; received ${describe(verdict.decision)}`);
    }
    if (verdict.rationale !== undefined && verdict.rationale !== null && typeof verdict.rationale !== 'string') {
      throw new TypeError(`coupling-review: verdicts[${index}].rationale must be a string, null or absent, because a non-string rationale would satisfy the skeptical-default override check while carrying no reason a reviewer can read; received ${describe(verdict.rationale)}`);
    }
    if (typeof verdict.rationale === 'string' && verdict.rationale.length > COUPLING_RATIONALE_CAP) {
      throw new TypeError(`coupling-review: verdicts[${index}].rationale is ${verdict.rationale.length} characters long, over the ${COUPLING_RATIONALE_CAP}-character cap this repository applies to every free-text field; the rationale is written verbatim into the hardened graph and the edges audit, both of which the flow and its agents read back, so an unbounded one is a lower-trust artifact stored without a bound`);
    }
    const pair = requirePairKey(verdict.pair, `verdicts[${index}].pair`);
    const sanitized = typeof verdict.rationale === 'string' ? sanitizeFreeText(verdict.rationale) : '';
    const rationale = sanitized.length > 0 ? sanitized : null;
    return { key: pairKey(pair), pair, label: pairLabel(pair), decision: verdict.decision, rationale };
  });
}

function coverageProblems(records, rendered) {
  const byKey = new Map(records.map((record) => [record.key, record]));
  const emittedIds = new Set(records.flatMap((record) => record.pair));
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
      const strangers = verdict.pair.filter((id) => !emittedIds.has(id));
      const detail = strangers.length === 0 ? '' : ` (${strangers.map(describe).join(' and ')} appear in no emitted pair at all)`;
      problems.push(`${verdict.label} carries a verdict but was never emitted for review${detail}; a verdict on an unemitted pair means the plan was rendered against a different graph`);
      continue;
    }
    if (decisionStrictness(verdict.decision) < decisionStrictness(record.fallback) && verdict.rationale === null) {
      problems.push(`${verdict.label} defaults to ${record.fallback} and is overridden to ${verdict.decision} with no rationale; the skeptical default stays ${record.fallback} unless an explicit rationale is supplied, because a caller may tighten a coupling decision for free and may relax one only against a reason a reviewer can read`);
    }
  }
  return problems;
}

function coverageErrorOrNull(records, rendered) {
  const problems = coverageProblems(records, rendered);
  if (problems.length === 0) return null;
  return new Error(`coupling-review: the plan does not render every coupling decision (${problems.length} problem(s)); an unanswered or unanswerable verdict is a hard stop rather than a warning:\n- ${problems.join('\n- ')}`);
}

export function assertVerdictsCoverPairs(emitted, verdicts) {
  const error = coverageErrorOrNull(requireEmission(emitted), requireVerdicts(verdicts));
  if (error !== null) throw error;
}

export function resolveCoupling(emitted, verdicts) {
  const records = requireEmission(emitted);
  const supplied = verdicts !== undefined && verdicts !== null;
  const rendered = supplied ? requireVerdicts(verdicts) : [];
  if (supplied) {
    const error = coverageErrorOrNull(records, rendered);
    if (error !== null) throw error;
  }
  const byKey = new Map(rendered.map((verdict) => [verdict.key, verdict]));
  return Object.freeze(records.map((record) => {
    const verdict = byKey.get(record.key);
    const answered = verdict !== undefined;
    return Object.freeze({
      pair: Object.freeze([...record.pair]),
      signals: Object.freeze([...record.signals]),
      default: record.fallback,
      decision: answered ? verdict.decision : record.fallback,
      source: answered ? SOURCE_VERDICT : SOURCE_DEFAULT,
      rationale: answered ? verdict.rationale : null,
    });
  }));
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
    if (verdictsPath !== null) usageExit(`--verdicts was supplied twice (${describe(verdictsPath)} then ${describe(supplied)}); honouring only the last one would report a covered plan while never reading the first file`);
    verdictsPath = supplied;
  }
  if (positional.length !== 1) usageExit(`expected exactly one candidates JSON path, received ${positional.length}`);
  try {
    const document = JSON.parse(readFileSync(positional[0], 'utf8'));
    const emitted = reviewCoupling(document.pairs, document.context);
    if (verdictsPath !== null) assertVerdictsCoverPairs(emitted, JSON.parse(readFileSync(verdictsPath, 'utf8')));
    process.stdout.write(JSON.stringify(emitted) + '\n');
  } catch (error) {
    const message = error && error.message ? error.message : `a non-Error value was thrown: ${describe(error)}`;
    process.stderr.write(`coupling-review error: ${message}\n`);
    process.exit(1);
  }
}

function isDirectInvocation() {
  try {
    if (!process.argv[1]) return false;
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch (error) {
    if (error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) return false;
    throw error;
  }
}

if (isDirectInvocation()) main();
