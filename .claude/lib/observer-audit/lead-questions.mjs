import { readFileSync } from 'node:fs';
import { AuditError, EXIT, POPULATION_DISPATCH, START_EVENT, STOP_EVENT } from './contract.mjs';
import { classifyObserved, groupCarriesMixedTypes, UNATTRIBUTED_LABEL } from './agent-classification.mjs';
import { query, sqlLiteral } from './duckdb.mjs';
import { eventsCte, readRoster } from './reader.mjs';
import { readRetiredRoster } from './retirement-set.mjs';

function perGroupCte(logRoot) {
  return `${eventsCte(logRoot)},
 dispatch_group_rows AS (
   SELECT session_id, agent_id, agent_type, event
   FROM ev
   WHERE population = ${sqlLiteral(POPULATION_DISPATCH)} AND event IN (${sqlLiteral(START_EVENT)}, ${sqlLiteral(STOP_EVENT)})
 ),
 group_start_presence AS (
   SELECT session_id, agent_id, bool_or(event = ${sqlLiteral(START_EVENT)}) AS has_start
   FROM dispatch_group_rows
   GROUP BY session_id, agent_id
 ),
 per_group AS (
   SELECT r.session_id, r.agent_id, min(r.agent_type) AS agent_type, count(DISTINCT r.agent_type) AS type_count
   FROM dispatch_group_rows r
   JOIN group_start_presence g ON g.session_id = r.session_id AND g.agent_id = r.agent_id AND g.has_start
   GROUP BY r.session_id, r.agent_id
 ),
 stop_only_group_ids AS (
   SELECT session_id, agent_id
   FROM group_start_presence
   WHERE NOT has_start
 )`;
}

export function dispatchGroupAgentTypesSql(logRoot) {
  return `WITH ${perGroupCte(logRoot)}
SELECT agent_type, max(type_count) AS type_count, count(*) AS dispatch_groups
FROM per_group
GROUP BY agent_type
ORDER BY agent_type`;
}

export function mixedAgentTypeGroupsSql(logRoot) {
  return `WITH ${perGroupCte(logRoot)}
SELECT session_id, agent_id, type_count
FROM per_group
WHERE type_count > 1
ORDER BY session_id, agent_id`;
}

export function stopOnlyGroupsSql(logRoot) {
  return `WITH ${perGroupCte(logRoot)}
SELECT count(*) AS stop_only_groups
FROM stop_only_group_ids`;
}

function nameUnclassifiable(entry) {
  return entry.agent_type === null
    ? `a NULL agent_type (displayed as ${UNATTRIBUTED_LABEL}) carried by ${entry.dispatch_groups} dispatch group(s)`
    : `${JSON.stringify(entry.agent_type)} carried by ${entry.dispatch_groups} dispatch group(s)`;
}

function retiredNonLeadNamesFrom(retiredRosterPath) {
  if (typeof retiredRosterPath !== 'string' || retiredRosterPath.length === 0) {
    throw new AuditError(
      EXIT.USAGE,
      '--retired-roster is required and has no default, so the retired-set source always appears in the recorded command; pass it explicitly',
    );
  }
  let source;
  try {
    source = readFileSync(retiredRosterPath, 'utf8');
  } catch (error) {
    throw new AuditError(EXIT.USAGE, `--retired-roster names ${retiredRosterPath}, which could not be read: ${error.message}`);
  }
  const declared = readRetiredRoster(retiredRosterPath, source);
  if (!declared.ok) {
    throw new AuditError(EXIT.USAGE, `--retired-roster names ${retiredRosterPath}, which could not be parsed: ${declared.error}`);
  }
  return declared.names;
}

function classifyDispatchGroups(context) {
  const rosterNames = readRoster(context.rosterPath);
  const retiredNonLeadNames = retiredNonLeadNamesFrom(context.retiredRosterPath);
  const rows = query(context.binary, dispatchGroupAgentTypesSql(context.logRoot));
  if (rows.some(groupCarriesMixedTypes)) {
    const violators = query(context.binary, mixedAgentTypeGroupsSql(context.logRoot));
    const named = violators
      .map((row) => `(session_id=${row.session_id}, agent_id=${row.agent_id}) carries ${row.type_count} distinct agent_type values across its own rows`)
      .join('; ');
    throw new AuditError(
      EXIT.CENSUS_HALT,
      `AGENT-TYPE CENSUS HALT: min(agent_type) would silently collapse a dispatch group whose rows disagree on agent_type, never bucketed and never guessed: ${named}`,
    );
  }
  const stopOnlyRows = query(context.binary, stopOnlyGroupsSql(context.logRoot));
  const stopOnlyGroups = Number(stopOnlyRows[0]?.stop_only_groups ?? 0);
  const observed = rows.map((row) => Object.freeze({ agent_type: row.agent_type, dispatch_groups: Number(row.dispatch_groups) }));
  return Object.freeze({ stopOnlyGroups, ...classifyObserved({ observed, rosterNames, retiredNonLeadNames }) });
}

export function agentTypeCensusHandler(context) {
  const { classified, unclassifiable, stopOnlyGroups } = classifyDispatchGroups(context);
  if (unclassifiable.length > 0) {
    const named = unclassifiable.map(nameUnclassifiable).join('; ');
    throw new AuditError(
      EXIT.CENSUS_HALT,
      `AGENT-TYPE CENSUS HALT: this census reaches no classification for ${unclassifiable.length} observed agent_type value(s), never bucketed and never guessed: ${named}`,
    );
  }
  return Object.freeze({
    population_note:
      'computed over dispatch-grain groups only, one row per (session_id, agent_id), at the START-bearing grain: a group enters this population only when at least one of its rows is a SubagentStart. A group carrying only a SubagentStop with no SubagentStart is a coverage fact reported in stop_only_groups, never folded into this count and never a failure. Every observed agent_type is classified against the frozen Lead, current-roster, declared-fallback and retired-roster declarations before this question emits a single row.',
    stop_only_groups: stopOnlyGroups,
    rows: classified,
  });
}

function requireNonBlankString(raw, label) {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw new AuditError(
      EXIT.USAGE,
      `${label} is required and has no default, so the bar and the floor always appear in the recorded command; pass it explicitly`,
    );
  }
  return raw;
}

function parseFiniteNumber(raw, label) {
  const value = Number(requireNonBlankString(raw, label));
  if (!Number.isFinite(value)) {
    throw new AuditError(EXIT.USAGE, `${label} must be a finite number, got ${JSON.stringify(raw)}`);
  }
  return value;
}

function parseBarPct(raw) {
  const label = '--bar-pct';
  const value = parseFiniteNumber(raw, label);
  if (value < 0 || value > 100) {
    throw new AuditError(EXIT.USAGE, `${label} must be between 0 and 100 inclusive, got ${JSON.stringify(raw)}`);
  }
  return value;
}

function parseMinN(raw) {
  const label = '--min-n';
  const value = parseFiniteNumber(raw, label);
  if (!Number.isInteger(value) || value < 1) {
    throw new AuditError(EXIT.USAGE, `${label} must be an integer of at least 1, got ${JSON.stringify(raw)}`);
  }
  return value;
}

export function leadShareHandler(context) {
  const barPct = parseBarPct(context.barPct);
  const minN = parseMinN(context.minN);
  const { classified, unclassifiable, stopOnlyGroups } = classifyDispatchGroups(context);

  const leadGroups = classified.filter((entry) => entry.lead === true).reduce((sum, entry) => sum + entry.dispatch_groups, 0);
  const classifiedGroups = classified.reduce((sum, entry) => sum + entry.dispatch_groups, 0);
  const unclassifiableGroups = unclassifiable.reduce((sum, entry) => sum + entry.dispatch_groups, 0);
  const n = classifiedGroups + unclassifiableGroups;
  const unclassifiableNamed = unclassifiable.map(nameUnclassifiable);

  if (n === 0) {
    throw new AuditError(
      EXIT.CENSUS_HALT,
      'LEAD-SHARE REFUSAL: n=0 dispatch groups; there is nothing to compute a Lead share over, so no bound is reported',
    );
  }

  if (n < minN) {
    throw new AuditError(
      EXIT.CENSUS_HALT,
      `LEAD-SHARE REFUSAL: n=${n} dispatch groups is under the declared floor --min-n ${minN}; the measurement is not credible below that floor`,
    );
  }

  const minSharePct = (leadGroups / n) * 100;
  const maxSharePct = ((leadGroups + unclassifiableGroups) / n) * 100;
  const bothAtOrAboveBar = minSharePct >= barPct && maxSharePct >= barPct;
  const bothBelowBar = minSharePct < barPct && maxSharePct < barPct;

  if (!bothAtOrAboveBar && !bothBelowBar) {
    throw new AuditError(
      EXIT.CENSUS_HALT,
      `LEAD-SHARE REFUSAL: the bar ${barPct}% sits inside the band [${minSharePct.toFixed(2)}%, ${maxSharePct.toFixed(2)}%], so pass/fail cannot be decided; classify these first: ${unclassifiableNamed.join(', ') || '(none named; refine the band another way)'}`,
    );
  }

  return Object.freeze({
    lead_dispatch_groups: leadGroups,
    n,
    stop_only_groups: stopOnlyGroups,
    bar_pct: barPct,
    min_n: minN,
    unclassifiable: Object.freeze(unclassifiableNamed),
    min_share_pct: Number(minSharePct.toFixed(2)),
    max_share_pct: Number(maxSharePct.toFixed(2)),
    decision: bothAtOrAboveBar ? 'at-or-above-bar' : 'below-bar',
  });
}
