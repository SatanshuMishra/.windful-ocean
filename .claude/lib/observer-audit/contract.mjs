export const DECLARED_COLUMNS = Object.freeze([
  Object.freeze(['ts', 'VARCHAR']),
  Object.freeze(['subject', 'VARCHAR']),
  Object.freeze(['event', 'VARCHAR']),
  Object.freeze(['session_id', 'VARCHAR']),
  Object.freeze(['cwd', 'VARCHAR']),
  Object.freeze(['agent_id', 'VARCHAR']),
  Object.freeze(['agent_type', 'VARCHAR']),
  Object.freeze(['agent_transcript_path', 'VARCHAR']),
  Object.freeze(['parent_agent_id', 'VARCHAR']),
  Object.freeze(['depth', 'BIGINT']),
  Object.freeze(['needed', 'VARCHAR']),
  Object.freeze(['task', 'VARCHAR']),
  Object.freeze(['detected_from', 'VARCHAR']),
]);

export const SHARED_KEYS = Object.freeze([
  'ts',
  'subject',
  'event',
  'session_id',
  'cwd',
  'agent_id',
  'agent_type',
  'agent_transcript_path',
  'parent_agent_id',
  'depth',
]);

export const CAPABILITY_EXTRA_KEYS = Object.freeze(['needed', 'task', 'detected_from']);

export const CAPABILITY_KEYS = Object.freeze([...SHARED_KEYS, ...CAPABILITY_EXTRA_KEYS]);

export const DECLARED_SHAPES = Object.freeze([
  Object.freeze({ name: 'shared-ten', keys: Object.freeze([...SHARED_KEYS].sort()) }),
  Object.freeze({ name: 'capability-thirteen', keys: Object.freeze([...CAPABILITY_KEYS].sort()) }),
]);

export const START_EVENT = 'SubagentStart';
export const STOP_EVENT = 'SubagentStop';
export const CAPABILITY_EVENT = 'capability_blocked';

export const FALLBACK_AGENT_TYPES = Object.freeze(['claude', 'general-purpose']);

export const POPULATION_DISPATCH = 'dispatch';
export const POPULATION_INTERNAL = 'internal';

export const NEVER_OBSERVED_LABEL = 'never-observed';
export const OBSERVED_LABEL = 'observed';

export const DEFAULT_HORIZON_MS = 3600000;

export const QUESTION_IDS = Object.freeze([
  'ran-and-duration',
  'fell-back',
  'blocked',
  'failed',
  'never-observed',
  'downgrade-recurrence',
]);

export const EXIT = Object.freeze({
  OK: 0,
  USAGE: 2,
  NO_DUCKDB: 3,
  EMPTY_CORPUS: 4,
  NO_SOURCE: 5,
  CENSUS_HALT: 6,
});

export class AuditError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
