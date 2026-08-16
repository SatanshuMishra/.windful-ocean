import { readFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { Done, NeedsHuman } from './boundary.mjs';
import { dispatch, normalizeEnvelope } from './dispatch.mjs';
import { POST_DISPATCH_RECORD_FAILED, runEngine } from './engine.mjs';
import { run } from './exec-run.mjs';
import { GH_COMMAND_BINARY } from './gh-commands.mjs';
import { appendJournalLine, writeGenesis } from './journal-store.mjs';
import { computeRunKey, execAllowed, openRun } from './run-store.mjs';

const MODULE = 'mitosis-cli';
const GIT_BINARY = 'git';
const GH_DEADLINE_MS = 120000;
const EXIT_CLEAN = 0;
const EXIT_ERROR = 1;
const EXIT_USAGE = 2;
const EXIT_INCOMPLETE = 3;
const WINDOW_TOKEN_PATTERN = /^[1-9][0-9]*$/;
const NODE_FAILED = 'failed';
const NODE_RUNNING = 'running';
const DISPATCH_FAILURE_PHRASES = Object.freeze({
  'dispatch-threw': 'was never dispatched',
  'dispatch-contract-violation': 'was never dispatched',
  [POST_DISPATCH_RECORD_FAILED]: 'was dispatched and billed, but the record of what it produced was not written',
});
const UNBILLED_ENVELOPE = normalizeEnvelope({
  usage: {},
  total_cost_usd: null,
  modelUsage: null,
  session_id: null,
  num_turns: null,
  permission_denials: null,
  api_error_status: null,
});

const REQUIRED_FLAGS = Object.freeze({
  '--spec': 'spec',
  '--run-id': 'runId',
  '--at': 'at',
  '--repo-root': 'repoRoot',
  '--journal': 'journalPath',
  '--repo-slug': 'repoSlug',
  '--integration-branch': 'integrationBranch',
});

const OPTIONAL_FLAGS = Object.freeze({ '--window': 'window' });

export const CLI_USAGE = `usage: cli.mjs ${Object.keys(REQUIRED_FLAGS).map((flag) => `${flag} <value>`).join(' ')} [--window N]`;

function usageFailure(error) {
  return Object.freeze({ ok: false, error: `${MODULE}: ${error}` });
}

function messageOf(error) {
  return error && error.message ? error.message : String(error);
}

function fieldOf(flag) {
  if (typeof flag !== 'string') return undefined;
  if (Object.hasOwn(REQUIRED_FLAGS, flag)) return REQUIRED_FLAGS[flag];
  if (Object.hasOwn(OPTIONAL_FLAGS, flag)) return OPTIONAL_FLAGS[flag];
  return undefined;
}

export function parseCliArgv(argv) {
  if (!Array.isArray(argv)) return usageFailure('the argument vector must be an array of strings');
  const seen = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const field = fieldOf(flag);
    if (field === undefined) return usageFailure(`${JSON.stringify(flag)} is not a flag this entry point reads`);
    if (seen.has(field)) return usageFailure(`${flag} was given twice, and a silently discarded value would run the engine against a configuration the caller did not write`);
    index += 1;
    const value = argv[index];
    if (typeof value !== 'string' || value.length === 0 || value.startsWith('--')) {
      return usageFailure(`${flag} needs one non-empty value that is not itself a flag, received ${JSON.stringify(value)}`);
    }
    seen.set(field, value);
  }
  for (const [flag, field] of Object.entries(REQUIRED_FLAGS)) {
    if (!seen.has(field)) return usageFailure(`${flag} is required`);
  }
  const windowToken = seen.get('window');
  if (windowToken !== undefined && !WINDOW_TOKEN_PATTERN.test(windowToken)) {
    return usageFailure(`--window needs a positive integer, received ${JSON.stringify(windowToken)}`);
  }
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      ...Object.fromEntries(seen),
      window: windowToken === undefined ? undefined : Number(windowToken),
    }),
  });
}

function documentOf(spec) {
  return spec === null || typeof spec !== 'object' || Array.isArray(spec) ? {} : spec;
}

function unitsOf(spec) {
  const document = documentOf(spec);
  const units = Array.isArray(document.specs) ? document.specs : [];
  return units.filter((unit) => unit !== null && typeof unit === 'object' && !Array.isArray(unit));
}

function requestsById(spec) {
  return new Map(unitsOf(spec).map((unit) => [unit.id, unit.request]));
}

function runStoreRequest(args, spec) {
  return {
    root: args.repoRoot,
    runKey: computeRunKey(documentOf(spec)),
    unitIds: unitsOf(spec).map((unit) => unit.id),
    plan: {
      runId: args.runId,
      at: args.at,
      journalPath: args.journalPath,
      repoSlug: args.repoSlug,
      integrationBranch: args.integrationBranch,
    },
    startedAt: args.at,
  };
}

function usageRecorder(handle, observedAt) {
  const dispatched = new Set();
  return (record) => {
    if (record === null || typeof record !== 'object' || Array.isArray(record)) return;
    if (record.state === NODE_RUNNING) {
      dispatched.add(record.id);
      return;
    }
    if (!dispatched.delete(record.id)) return;
    handle.recordUsage(record.id, {
      observedAt,
      envelope: record.envelope === null || record.envelope === undefined ? UNBILLED_ENVELOPE : record.envelope,
    });
  };
}

function observeAll(observers) {
  return (record) => {
    const failures = [];
    for (const observer of observers) {
      try {
        observer(record);
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) {
      throw new AggregateError(failures, `${MODULE}: ${failures.length} run observers threw over one dispatch record; every observer was still offered the record, so none was starved by a failure in another`);
    }
  };
}

function releaseRun(handle, io) {
  if (handle === null) return;
  try {
    handle.release();
  } catch (error) {
    io.err(`${MODULE}: the run store lock was not released, so the next run on this key will refuse until it is cleared: ${messageOf(error)}\n`);
  }
}

function dispatchFailureLine(record) {
  if (record === null || typeof record !== 'object' || Array.isArray(record)) return null;
  if (record.state !== NODE_FAILED || typeof record.outcome !== 'string') return null;
  if (!Object.hasOwn(DISPATCH_FAILURE_PHRASES, record.outcome)) return null;
  if (typeof record.reason !== 'string' || record.reason.length === 0) return null;
  return `${MODULE}: unit ${JSON.stringify(record.id)} ${DISPATCH_FAILURE_PHRASES[record.outcome]} (${record.outcome}): ${record.reason}`;
}

function dispatchFailureReporter(io) {
  return (record) => {
    const line = dispatchFailureLine(record);
    if (line !== null) io.err(`${line}\n`);
  };
}

function engineRequest(args, spec, onRecord) {
  const document = documentOf(spec);
  return {
    specs: document.specs,
    manifest: document.manifest,
    runId: args.runId,
    at: args.at,
    repoRoot: args.repoRoot,
    journalPath: args.journalPath,
    repoSlug: args.repoSlug,
    integrationBranch: args.integrationBranch,
    window: args.window,
    onRecord,
  };
}

function summaryOf(result, handle) {
  return {
    runKey: handle.runKey,
    attempt: handle.attempt,
    quiescent: result.quiescent,
    aborted: result.aborted,
    ticks: result.ticks,
    units: result.units.map((unit) => ({ id: unit.id, state: unit.state })),
    prState: result.prState === undefined ? null : result.prState,
  };
}

export async function runCli(argv, io, makePorts, deps = {}) {
  const parsed = parseCliArgv(argv);
  if (!parsed.ok) {
    io.err(`${parsed.error}\n${CLI_USAGE}\n`);
    return EXIT_USAGE;
  }
  const openRunFn = deps.openRun === undefined ? openRun : deps.openRun;
  let handle = null;
  try {
    const spec = io.readSpec(parsed.value.spec);
    handle = openRunFn(runStoreRequest(parsed.value, spec));
    const ports = makePorts({ repoRoot: parsed.value.repoRoot, requestsById: requestsById(spec) });
    const onRecord = observeAll([usageRecorder(handle, parsed.value.at), dispatchFailureReporter(io)]);
    const result = await runEngine(engineRequest(parsed.value, spec, onRecord), ports);
    io.log(`${JSON.stringify(summaryOf(result, handle), null, 2)}\n`);
    if (!result.quiescent) return EXIT_INCOMPLETE;
    return result.units.every((unit) => unit.state === 'done') ? EXIT_CLEAN : EXIT_INCOMPLETE;
  } catch (error) {
    io.err(`${MODULE}: ${messageOf(error)}\n`);
    return EXIT_ERROR;
  } finally {
    releaseRun(handle, io);
  }
}

function requireUnitRequest(config, unit) {
  const request = config.requestsById.get(unit.id);
  if (request === null || request === undefined || typeof request !== 'object' || Array.isArray(request)) {
    throw new TypeError(`${MODULE}: the spec carries no request object for unit ${JSON.stringify(unit.id)}, so there is nothing to dispatch and the unit would be reported settled without a child ever having run`);
  }
  return request;
}

function requireSha(request) {
  if (typeof request.sha !== 'string' || request.sha.length === 0) {
    throw new TypeError(`${MODULE}: the checkpoint ref ${JSON.stringify(request.ref)} was asked for with no commit to point at, and a ref written to nothing is a checkpoint no relaunch can recover from`);
  }
  return request.sha;
}

function verdictShape(verdict) {
  return verdict !== null && verdict !== undefined && typeof verdict === 'object' && !Array.isArray(verdict) ? verdict : null;
}

function shaOfVerdict(verdict) {
  const shaped = verdictShape(verdict);
  const structured = shaped === null ? null : verdictShape(shaped.structured);
  return structured !== null && typeof structured.sha === 'string' ? structured.sha : null;
}

export function realPorts(config, deps = {}) {
  const dispatchFn = deps.dispatch === undefined ? dispatch : deps.dispatch;
  const writeGenesisFn = deps.writeGenesis === undefined ? writeGenesis : deps.writeGenesis;
  const appendJournalFn = deps.appendJournalLine === undefined ? appendJournalLine : deps.appendJournalLine;
  const execFn = deps.execAllowed === undefined ? execAllowed : deps.execAllowed;
  const runFn = deps.run === undefined ? run : deps.run;
  return Object.freeze({
    runUnit: async (unit, context) => {
      const verdict = verdictShape(await dispatchFn({ ...requireUnitRequest(config, unit), signal: context.signal }));
      if (verdict === null || verdict.ok !== true) {
        const parked = NeedsHuman({
          kind: 'dispatch',
          what: verdict === null ? 'no verdict' : verdict.outcome,
          detail: verdict === null ? null : verdict.error,
        }, []);
        return Object.freeze({ ...parked, envelope: verdict === null ? null : normalizeEnvelope(verdict.envelope) });
      }
      return Done({ sha: shaOfVerdict(verdict), green: true, envelope: normalizeEnvelope(verdict.envelope) });
    },
    writeGenesis: (request) => writeGenesisFn(request),
    appendJournal: (request) => appendJournalFn(request),
    writeRef: (request) => execFn(GIT_BINARY, ['update-ref', request.ref, requireSha(request)], config.repoRoot),
    gh: (argv) => runFn(GH_COMMAND_BINARY, argv, { cwd: config.repoRoot, deadlineMs: GH_DEADLINE_MS }),
  });
}

async function main() {
  const io = Object.freeze({
    log: (text) => process.stdout.write(text),
    err: (text) => process.stderr.write(text),
    readSpec: (path) => JSON.parse(readFileSync(path, 'utf8')),
  });
  process.exitCode = await runCli(process.argv.slice(2), io, (config) => realPorts(config));
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) main();
