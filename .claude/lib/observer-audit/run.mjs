#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AuditError, DEFAULT_HORIZON_MS, EXIT, QUESTION_IDS } from './contract.mjs';
import { requireBinary } from './duckdb.mjs';
import { defaultLogRoot, requireCorpus } from './reader.mjs';
import { runKeyCensus } from './census.mjs';
import { answer, needsCorpus } from './questions.mjs';

const USAGE = `usage: run.mjs <question-id> [--log-root PATH] [--roster PATH] [--horizon-ms N] [--bar-pct N] [--min-n N] [--retired-roster-spec PATH]
questions: ${QUESTION_IDS.join(', ')}`;

export function parseArgs(argv, env = process.env) {
  const parsed = argv.reduce((state, value) => {
    if (state.pending !== null) {
      return { pending: null, flags: { ...state.flags, [state.pending]: value }, positional: state.positional };
    }
    if (value.startsWith('--')) {
      return { pending: value.slice(2), flags: state.flags, positional: state.positional };
    }
    return { pending: null, flags: state.flags, positional: [...state.positional, value] };
  }, { pending: null, flags: {}, positional: [] });
  if (parsed.pending !== null) {
    throw new AuditError(EXIT.USAGE, `the flag --${parsed.pending} needs a value. ${USAGE}`);
  }
  const { flags, positional } = parsed;
  if (positional.length !== 1) {
    throw new AuditError(EXIT.USAGE, `exactly one question id is required. ${USAGE}`);
  }
  const horizon = flags['horizon-ms'] === undefined ? DEFAULT_HORIZON_MS : Number(flags['horizon-ms']);
  if (!Number.isFinite(horizon) || horizon < 0) {
    throw new AuditError(EXIT.USAGE, `--horizon-ms must be a non-negative number, got ${flags['horizon-ms']}`);
  }
  return Object.freeze({
    id: positional[0],
    logRoot: flags['log-root'] || defaultLogRoot(env),
    rosterPath: flags.roster || null,
    horizonMs: horizon,
    barPct: flags['bar-pct'] === undefined ? null : flags['bar-pct'],
    minN: flags['min-n'] === undefined ? null : flags['min-n'],
    retiredRosterSpecPath: flags['retired-roster-spec'] || null,
  });
}

export function run(argv, env = process.env) {
  const args = parseArgs(argv, env);
  if (!QUESTION_IDS.includes(args.id)) {
    throw new AuditError(EXIT.USAGE, `unknown question ${JSON.stringify(args.id)}. ${USAGE}`);
  }
  const binary = requireBinary(env);
  const census = needsCorpus(args.id)
    ? (requireCorpus(args.logRoot), runKeyCensus(binary, args.logRoot))
    : null;
  return Object.freeze({ log_root: args.logRoot, key_census: census, ...answer(args.id, { ...args, binary }) });
}

function main(argv, env) {
  try {
    process.stdout.write(`${JSON.stringify(run(argv, env), null, 2)}\n`);
    return EXIT.OK;
  } catch (error) {
    if (error instanceof AuditError) {
      process.stderr.write(`${error.message}\n`);
      return error.code;
    }
    process.stderr.write(`unexpected failure: ${error.message}\n`);
    return 1;
  }
}

export function invokedDirectly(argv1, moduleUrl) {
  if (!argv1) return false;
  try {
    return realpathSync(argv1) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}

if (invokedDirectly(process.argv[1], import.meta.url)) {
  process.exitCode = main(process.argv.slice(2), process.env);
}
