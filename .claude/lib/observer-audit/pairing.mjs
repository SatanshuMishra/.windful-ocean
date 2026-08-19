import { START_EVENT, STOP_EVENT } from './contract.mjs';
import { sqlLiteral } from './duckdb.mjs';
import { depthBucketSql, eventsCte, orderByDeclaredColumns } from './reader.mjs';

const UNATTRIBUTED = '(unattributed)';

export function ranAndDurationSql(logRoot) {
  return `WITH ${eventsCte(logRoot)},
 starts AS (
   SELECT session_id, agent_id, agent_type, depth, population, TRY_CAST(ts AS TIMESTAMP) AS started,
          row_number() OVER (PARTITION BY session_id, agent_id ORDER BY ${orderByDeclaredColumns('TRY_CAST(ts AS TIMESTAMP)')}) AS rank
   FROM ev WHERE event = ${sqlLiteral(START_EVENT)}
 ),
 stops AS (
   SELECT session_id, agent_id, TRY_CAST(ts AS TIMESTAMP) AS stopped,
          row_number() OVER (PARTITION BY session_id, agent_id ORDER BY ${orderByDeclaredColumns('TRY_CAST(ts AS TIMESTAMP)')}) AS rank
   FROM ev WHERE event = ${sqlLiteral(STOP_EVENT)}
 ),
 pairs AS (
   SELECT s.session_id, s.agent_id, s.population, s.agent_type, s.depth, s.rank, s.started, p.stopped
   FROM starts s
   LEFT JOIN stops p ON p.session_id = s.session_id AND p.agent_id = s.agent_id AND p.rank = s.rank
 ),
 overlap_flags AS (
   SELECT p1.session_id, p1.agent_id,
          bool_or(p1.started > p2.started AND p1.started < p2.stopped) AS group_overlaps
   FROM pairs p1
   JOIN pairs p2
     ON p2.session_id = p1.session_id AND p2.agent_id = p1.agent_id AND p2.rank != p1.rank
   WHERE p2.stopped IS NOT NULL
   GROUP BY p1.session_id, p1.agent_id
 )
SELECT pairs.population,
       coalesce(pairs.agent_type, ${sqlLiteral(UNATTRIBUTED)}) AS agent_type,
       ${depthBucketSql('pairs.depth')} AS depth_bucket,
       count(DISTINCT (pairs.session_id, pairs.agent_id)) AS dispatches,
       count(*) AS start_rows,
       count(*) FILTER (WHERE pairs.stopped IS NOT NULL) AS paired_runs,
       count(*) FILTER (WHERE pairs.stopped IS NULL) AS unpaired_starts,
       count(*) FILTER (WHERE pairs.stopped < pairs.started) AS misordered_pairs,
       count(*) FILTER (WHERE pairs.stopped >= pairs.started) AS well_ordered_pairs,
       count(DISTINCT (pairs.session_id, pairs.agent_id)) FILTER (WHERE coalesce(overlap_flags.group_overlaps, false)) AS overlapping_groups,
       min(date_diff('millisecond', pairs.started, pairs.stopped)) FILTER (WHERE pairs.stopped >= pairs.started) AS min_duration_ms,
       max(date_diff('millisecond', pairs.started, pairs.stopped)) FILTER (WHERE pairs.stopped >= pairs.started) AS max_duration_ms,
       CAST(round(avg(date_diff('millisecond', pairs.started, pairs.stopped)) FILTER (WHERE pairs.stopped >= pairs.started)) AS BIGINT) AS mean_duration_ms
FROM pairs
LEFT JOIN overlap_flags ON overlap_flags.session_id = pairs.session_id AND overlap_flags.agent_id = pairs.agent_id
GROUP BY ALL
ORDER BY population, agent_type, depth_bucket`;
}
