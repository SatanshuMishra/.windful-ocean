import {
  AuditError,
  CAPABILITY_EVENT,
  DEFAULT_HORIZON_MS,
  EXIT,
  FALLBACK_AGENT_TYPES,
  NEVER_OBSERVED_LABEL,
  OBSERVED_LABEL,
  POPULATION_DISPATCH,
  QUESTION_IDS,
  START_EVENT,
  STOP_EVENT,
} from './contract.mjs';
import { query, sqlLiteral } from './duckdb.mjs';
import { agentTypeCensusHandler, leadShareHandler } from './lead-questions.mjs';
import { ranAndDurationSql } from './pairing.mjs';
import { eventsCte, readRoster } from './reader.mjs';

export { eventsCte };

const DISPATCH_NOTE =
  'computed over the dispatch population only: population is resolved at dispatch grain, per (session_id, agent_id), so every row belonging to a dispatch shares that label whether it is the start row or the stop row. A group is a dispatch when at least one of its rows carries a depth, the value the harness sidecar sets only for a genuine Task dispatch; a group with depth null on every row is internal, even when a row in it carries a stop-phase transcript path, because that field is copied verbatim from the hook payload and is not a dispatch signal. Depth null on every row has two indistinguishable causes it cannot tell apart: the group is genuinely internal, or it is a real dispatch whose sidecar write failed and was swallowed by the writer, leaving no depth to record; this predicate reports both the same way, under internal, and that is a known blind spot, filed separately, not fixed by this note. A depth-free unpaired start forms a single-row partition with nothing else in the group to rescue it, so it is reported under internal — that is a limit of what the data can resolve, not a defect in this predicate.';

function pairCtes(logRoot) {
  return `WITH ${eventsCte(logRoot)},
 starts AS (SELECT session_id, agent_id, agent_type, depth, population, TRY_CAST(ts AS TIMESTAMP) AS started FROM ev WHERE event = ${sqlLiteral(START_EVENT)}),
 stops AS (SELECT session_id, agent_id, population, TRY_CAST(ts AS TIMESTAMP) AS stopped FROM ev WHERE event = ${sqlLiteral(STOP_EVENT)})`;
}

export function fellBackSql(logRoot) {
  const list = FALLBACK_AGENT_TYPES.map((name) => sqlLiteral(name)).join(', ');
  return `WITH ${eventsCte(logRoot)},
 d AS (
   SELECT session_id, agent_id, min(agent_type) AS agent_type
   FROM ev
   WHERE population = ${sqlLiteral(POPULATION_DISPATCH)} AND event = ${sqlLiteral(START_EVENT)}
   GROUP BY session_id, agent_id
 )
SELECT ${sqlLiteral(POPULATION_DISPATCH)} AS population,
       count(*) AS dispatch_starts,
       count(*) FILTER (WHERE agent_type IN (${list})) AS fell_back,
       count(*) FILTER (WHERE agent_type = ${sqlLiteral('claude')}) AS fell_back_claude,
       count(*) FILTER (WHERE agent_type = ${sqlLiteral('general-purpose')}) AS fell_back_general_purpose
FROM d`;
}

export function blockedSql(logRoot) {
  return `WITH ${eventsCte(logRoot)}
SELECT population,
       needed,
       coalesce(detected_from, 'null') AS detected_from,
       count(*) AS blocked_rows
FROM ev
WHERE event = ${sqlLiteral(CAPABILITY_EVENT)}
GROUP BY ALL
ORDER BY 1, 2, 3`;
}

export function failedSql(logRoot, horizonMs) {
  return `${pairCtes(logRoot)},
 latest AS (SELECT max(TRY_CAST(ts AS TIMESTAMP)) AS at FROM ev),
 unpaired_start_rows AS (
   SELECT s.* FROM starts s
   LEFT JOIN stops p ON p.session_id = s.session_id AND p.agent_id = s.agent_id
   WHERE p.agent_id IS NULL
 ),
 unpaired_stop_rows AS (
   SELECT p.* FROM stops p
   LEFT JOIN starts s ON s.session_id = p.session_id AND s.agent_id = p.agent_id
   WHERE s.agent_id IS NULL
 ),
 unpaired_starts AS (
   SELECT session_id, agent_id, population, max(started) AS started
   FROM unpaired_start_rows
   GROUP BY session_id, agent_id, population
 ),
 unpaired_stops AS (
   SELECT DISTINCT session_id, agent_id, population
   FROM unpaired_stop_rows
 ),
 populations AS (SELECT DISTINCT population FROM ev)
SELECT g.population,
       (SELECT count(*) FROM unpaired_starts u, latest
         WHERE u.population = g.population
           AND u.started IS NOT NULL
           AND date_diff('millisecond', u.started, latest.at) >= ${Number(horizonMs)}) AS failed_started_no_stop,
       (SELECT count(*) FROM unpaired_starts u, latest
         WHERE u.population = g.population
           AND (u.started IS NULL OR date_diff('millisecond', u.started, latest.at) < ${Number(horizonMs)})) AS in_flight_within_horizon,
       (SELECT count(*) FROM unpaired_stops u WHERE u.population = g.population) AS stop_without_start_coverage
FROM populations g
ORDER BY g.population`;
}

export function observedAgentTypesSql(logRoot) {
  return `WITH ${eventsCte(logRoot)}
SELECT agent_type, count(*) AS started
FROM ev
WHERE population = ${sqlLiteral(POPULATION_DISPATCH)} AND event = ${sqlLiteral(START_EVENT)} AND agent_type IS NOT NULL
GROUP BY ALL
ORDER BY agent_type`;
}

export function coverageSql(logRoot) {
  return `WITH ${eventsCte(logRoot)}
SELECT count(*) FILTER (WHERE population = ${sqlLiteral(POPULATION_DISPATCH)}) AS dispatch_rows,
       count(*) AS total_rows
FROM ev`;
}

function percent(part, whole) {
  return whole === 0 ? 0 : Math.round((part / whole) * 10000) / 100;
}

const HANDLERS = Object.freeze({
  'ran-and-duration': (context) =>
    Object.freeze({
      population_note:
        'each row names its population. Cost, tokens, cache counts and turn counts are a platform ceiling and are absent from this output by construction, not reported as zero.',
      absent_by_platform_ceiling: Object.freeze(['cost', 'tokens', 'cache', 'turns']),
      rows: query(context.binary, ranAndDurationSql(context.logRoot)),
    }),

  'fell-back': (context) =>
    Object.freeze({
      population_note: DISPATCH_NOTE,
      why_not_answered:
        'the reason a dispatch fell back has no source in this log. It lives in the dispatch description, which the sidecar carries and the writer does not copy, and nothing emits a fallback-reason event. Filed as U3.3c.',
      rows: query(context.binary, fellBackSql(context.logRoot)),
    }),

  blocked: (context) =>
    Object.freeze({
      population_note:
        'each row names its population. The detected_from split is preserved and never aggregated away: it is the scheduled measurement that distinguishes a blind detector from a genuine absence.',
      rows: query(context.binary, blockedSql(context.logRoot)),
    }),

  failed: (context) =>
    Object.freeze({
      population_note:
        'a failure is a dispatch that started and produced no stop, older than the horizon. A start inside the horizon is in-flight, not a failure. A stop with no start is a coverage fact reported in its own column, never a failure. When one (session_id, agent_id) group carries more than one start row, the group is collapsed to its latest start, so a recent start is never misreported as a failure because an older row shares its agent_id. If such a group is really N distinct dispatches rather than one retried dispatch, neither the latest start nor the earliest start is the correct single reading, and this output does not resolve that ambiguity; it is carried forward unsettled, not decided by this choice.',
      horizon_ms: context.horizonMs,
      horizon_basis: 'the latest timestamp in the corpus, so the answer does not depend on the wall clock',
      rows: query(context.binary, failedSql(context.logRoot, context.horizonMs)),
    }),

  'never-observed': (context) => {
    const roster = readRoster(context.rosterPath);
    const observed = query(context.binary, observedAgentTypesSql(context.logRoot));
    const coverage = query(context.binary, coverageSql(context.logRoot))[0] || { dispatch_rows: 0, total_rows: 0 };
    const dispatchRows = Number(coverage.dispatch_rows);
    const totalRows = Number(coverage.total_rows);
    const counts = new Map(observed.map((row) => [row.agent_type, Number(row.started)]));
    const coveragePct = percent(dispatchRows, totalRows);
    return Object.freeze({
      population_note: DISPATCH_NOTE,
      label_note:
        `an agent with no observed dispatch is labelled ${NEVER_OBSERVED_LABEL} with its coverage figure attached. It is never labelled disused: a zero count against partial attribution is not evidence of disuse.`,
      coverage: Object.freeze({
        dispatch_rows: dispatchRows,
        total_rows: totalRows,
        dispatch_coverage_pct: coveragePct,
      }),
      rows: Object.freeze(
        roster.map((agent) =>
          Object.freeze({
            agent,
            status: counts.has(agent) ? OBSERVED_LABEL : NEVER_OBSERVED_LABEL,
            observed_starts: counts.get(agent) || 0,
            dispatch_coverage_pct: coveragePct,
          }),
        ),
      ),
    });
  },

  'downgrade-recurrence': () => {
    throw new AuditError(
      EXIT.NO_SOURCE,
      'downgrade recurrence has NO source in this log: no field, no event type, no rows. It is not answerable here and must not return an empty result set that reads as a count of zero. ' +
        'Candidate corpora are pull request bodies carrying the ladder tags and the receipts enforcer run. Filed as U3.3d.',
    );
  },

  'agent-type-census': agentTypeCensusHandler,

  'lead-share': leadShareHandler,
});

export function questionIds() {
  return Object.freeze(Object.keys(HANDLERS).sort());
}

export function needsCorpus(id) {
  return id !== 'downgrade-recurrence';
}

export function answer(id, context) {
  const handler = HANDLERS[id];
  if (!handler) {
    throw new AuditError(EXIT.USAGE, `unknown question ${JSON.stringify(id)}. Known questions: ${QUESTION_IDS.join(', ')}`);
  }
  return Object.freeze({ question: id, ...handler({ horizonMs: DEFAULT_HORIZON_MS, ...context }) });
}
