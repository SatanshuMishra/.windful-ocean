import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { randomBytes } from 'node:crypto';

export const BRIEFING_HEADING = '# Pipeline: the runs this session is driving';
export const BRIEFING_CAP = 10000;
export const ANCHOR_PREFIX = 'Pipeline anchor:';

const STATE_VERSION = 1;
const SESSION_ID = /^[A-Za-z0-9_-]+$/;
const LOGBOOK_TOOL = /^mcp__(?:plugin_logbook_)?ledger__([a-z_]+)$/;
const RESERVED_REPOS = new Set(['runs', 'sessions']);
const ANCHOR_TEXT_LIMIT = 200;
const RUN_USAGE = 'usage: node check-run.mjs RUN_SCRIPT [RUN_ARGUMENT ...]';
const ROUNDS_LINE_LIMIT = 400;
const ROUNDS_SHOWN = 5;
const TAIL_RESERVE = 48;
const REASONS_FROM = '0.15.0';
const REASONS_REFUSED = Object.freeze(['1.0.0', '14.0.0']);
const ROOT_REFUSAL_FIELD = /(?<!\w)field: option_reasons$/;
const UNRECOGNISED_KEYS = /unrecogni[sz]ed[ _]key/i;
const OPTION_REASONS_WORD = /(?<![\w.])option_reasons(?![\w[]|\.\w)/;

export function homeDirectory() {
  return homedir();
}

export function sessionIdIsSafe(sessionId) {
  return typeof sessionId === 'string' && SESSION_ID.test(sessionId);
}

export function sessionsDirectory(home = homeDirectory()) {
  return join(home, '.mitosis', 'sessions');
}

export function statePath(sessionId, home = homeDirectory()) {
  return sessionIdIsSafe(sessionId) ? join(sessionsDirectory(home), `${sessionId}.json`) : null;
}

export function emptyState(sessionId) {
  return Object.freeze({
    version: STATE_VERSION,
    session_id: sessionId,
    thread_id: null,
    decision_recorded: false,
    next_step_recorded: false,
    reasons_accepted: false,
    reasons_refused: false,
    run_homes: Object.freeze([]),
    latest_anchor: null,
    updated_at: null,
  });
}

function isStringOrNull(value) {
  return value === null || typeof value === 'string';
}

function isRunHomeEntry(entry) {
  return entry !== null && typeof entry === 'object' && typeof entry.path === 'string' && entry.path !== '' && isStringOrNull(entry.anchor);
}

export function stateIsWellFormed(value, sessionId) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    value.version === STATE_VERSION &&
    value.session_id === sessionId &&
    isStringOrNull(value.thread_id) &&
    typeof value.decision_recorded === 'boolean' &&
    typeof value.next_step_recorded === 'boolean' &&
    typeof value.reasons_accepted === 'boolean' &&
    typeof value.reasons_refused === 'boolean' &&
    Array.isArray(value.run_homes) &&
    value.run_homes.every(isRunHomeEntry) &&
    isStringOrNull(value.latest_anchor) &&
    isStringOrNull(value.updated_at)
  );
}

export function readState(sessionId, home = homeDirectory()) {
  const path = statePath(sessionId, home);
  if (path === null) return Object.freeze({ status: 'invalid', state: null, path: null });
  if (!existsSync(path)) return Object.freeze({ status: 'absent', state: null, path });
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    if (!stateIsWellFormed(parsed, sessionId)) return Object.freeze({ status: 'unreadable', state: null, path });
    return Object.freeze({ status: 'present', state: parsed, path });
  } catch {
    return Object.freeze({ status: 'unreadable', state: null, path });
  }
}

export function writeState(state, home = homeDirectory(), now = new Date()) {
  const path = statePath(state.session_id, home);
  if (path === null) return null;
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporary = join(directory, `.${state.session_id}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`);
  const written = { ...state, updated_at: now.toISOString() };
  try {
    writeFileSync(temporary, `${JSON.stringify(written, null, 2)}\n`, { mode: 0o600 });
    renameSync(temporary, path);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
  return written;
}

function stateBody(state) {
  return state === null ? null : JSON.stringify({ ...state, updated_at: null });
}

function hasAgent(event) {
  return typeof event.agent_id === 'string' && event.agent_id !== '';
}

function toolInput(event) {
  const input = event.tool_input;
  return input !== null && typeof input === 'object' && !Array.isArray(input) ? input : {};
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function oneLine(text) {
  return String(text).replace(/\s+/g, ' ').trim();
}

export function shorten(text, limit) {
  const line = oneLine(text);
  return line.length <= limit ? line : `${line.slice(0, limit - 3)}...`;
}

export function logbookTool(toolName) {
  const match = typeof toolName === 'string' ? LOGBOOK_TOOL.exec(toolName) : null;
  return match === null ? null : match[1];
}

function nothing(state) {
  return Object.freeze({ state, output: null });
}

function postContext(additionalContext) {
  return Object.freeze({ hookSpecificOutput: Object.freeze({ hookEventName: 'PostToolUse', additionalContext }) });
}

function deny(reason) {
  return Object.freeze({
    hookSpecificOutput: Object.freeze({ hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason }),
  });
}

export function couldNotDecide(detail = 'the hook could not read its payload or the session\'s pipeline state') {
  return deny(
    `Pipeline continuity hook could not decide: ${detail}. Call resume_thread on the held logbook thread, which writes fresh pipeline state for this session, then try again.`,
  );
}

export function onResumeThread(event, state) {
  if (hasAgent(event)) return nothing(state);
  const threadId = toolInput(event).thread_id;
  if (!nonEmpty(threadId)) return nothing(state);
  const base = state ?? emptyState(event.session_id);
  if (base.thread_id === threadId) return nothing(base);
  return nothing({ ...base, thread_id: threadId, decision_recorded: false, next_step_recorded: false });
}

export function onCloseThread(event, state) {
  if (state === null || hasAgent(event) || state.thread_id === null) return nothing(state);
  return toolInput(event).thread_id === state.thread_id ? nothing({ ...state, thread_id: null }) : nothing(state);
}

function firstText(blocks) {
  const first = Array.isArray(blocks) ? blocks[0] : null;
  return first !== null && typeof first === 'object' && typeof first.text === 'string' ? first.text : '';
}

function decodedResponse(response) {
  if (typeof response !== 'string') return response;
  try {
    return JSON.parse(response);
  } catch {
    return response;
  }
}

export function toolResponseParts(response) {
  const decoded = decodedResponse(response);
  if (typeof decoded === 'string') return Object.freeze({ structured: null, text: decoded });
  if (Array.isArray(decoded)) return Object.freeze({ structured: null, text: firstText(decoded) });
  if (decoded === null || typeof decoded !== 'object') return Object.freeze({ structured: null, text: '' });
  const structured =
    decoded.structuredContent !== null && typeof decoded.structuredContent === 'object'
      ? decoded.structuredContent
      : Array.isArray(decoded.parked_thread_ids)
        ? decoded
        : null;
  const text = Array.isArray(decoded.content) ? firstText(decoded.content) : typeof decoded.text === 'string' ? decoded.text : '';
  return Object.freeze({ structured, text });
}

export function onParkThread(event, state) {
  if (state === null || hasAgent(event) || state.thread_id === null) return nothing(state);
  const { structured, text } = toolResponseParts(event.tool_response);
  const named = structured !== null && Array.isArray(structured.parked_thread_ids) && structured.parked_thread_ids.includes(state.thread_id);
  const requested = toolInput(event).thread_id;
  const parkedByText = text.trim().toLowerCase().startsWith('parked thread') && (requested === undefined || requested === null || requested === state.thread_id);
  return named || parkedByText ? nothing({ ...state, thread_id: null }) : nothing(state);
}

function parseVersion(version) {
  const match = typeof version === 'string' ? /^(\d+)\.(\d+)\.(\d+)(-[^+]*)?/.exec(version.trim()) : null;
  return match === null ? null : Object.freeze({ parts: [Number(match[1]), Number(match[2]), Number(match[3])], prerelease: match[4] !== undefined });
}

function compareVersions(left, right) {
  const order = left.parts.reduce((found, part, index) => (found !== 0 ? found : Math.sign(part - right.parts[index])), 0);
  return order !== 0 ? order : Number(right.prerelease) - Number(left.prerelease);
}

export function versionAcceptsReasons(version) {
  const parsed = parseVersion(version);
  if (parsed === null) return false;
  const against = (bound) => compareVersions(parsed, parseVersion(bound));
  const [refusedFrom, refusedThrough] = REASONS_REFUSED;
  return against(REASONS_FROM) >= 0 && !(against(refusedFrom) >= 0 && against(refusedThrough) <= 0);
}

function pathContains(container, path) {
  if (typeof container !== 'string' || container === '' || typeof path !== 'string') return false;
  const trimmed = container.endsWith(sep) && container.length > 1 ? container.slice(0, -1) : container;
  return path === trimmed || path.startsWith(`${trimmed}${sep}`);
}

export function installedLogbookVersion(cwd, home = homeDirectory()) {
  try {
    const parsed = JSON.parse(readFileSync(join(home, '.claude', 'plugins', 'installed_plugins.json'), 'utf8'));
    const entries = parsed?.plugins?.['logbook@logbook'];
    if (!Array.isArray(entries)) return null;
    const usable = entries.filter((entry) => entry !== null && typeof entry === 'object');
    const project = usable
      .filter((entry) => entry.scope === 'project' && pathContains(entry.projectPath, cwd))
      .reduce((best, entry) => (best === null || entry.projectPath.length > best.projectPath.length ? entry : best), null);
    const chosen = project ?? usable.find((entry) => entry.scope === 'user') ?? null;
    return chosen !== null && typeof chosen.version === 'string' ? chosen.version : null;
  } catch {
    return null;
  }
}

export function reasonsDemanded(state, installedVersion) {
  return state.reasons_accepted || (versionAcceptsReasons(installedVersion) && !state.reasons_refused);
}

export function missingDecisionParts(input, demandReasons) {
  const options = Array.isArray(input.options) ? input.options : [];
  const reasons = input.option_reasons;
  const reasonParts = (() => {
    if (!demandReasons) return [];
    if (!Array.isArray(reasons)) return ['option_reasons with one reason per option'];
    const blanks = reasons.flatMap((reason, index) => (nonEmpty(reason) ? [] : [`a non-empty reason in option_reasons for option ${index + 1}`]));
    const count = reasons.length === options.length ? [] : [`option_reasons with exactly one reason per option (${reasons.length} reasons for ${options.length} options)`];
    return [...count, ...blanks];
  })();
  return [
    ...(nonEmpty(input.title) ? [] : ['a non-empty title']),
    ...(nonEmpty(input.context) ? [] : ['a non-empty context']),
    ...(nonEmpty(input.outcome) ? [] : ['a non-empty outcome']),
    ...(options.length >= 2 ? [] : ['at least two options']),
    ...options.flatMap((option, index) => (nonEmpty(option) ? [] : [`a non-empty text for option ${index + 1} (a blank option)`])),
    ...reasonParts,
  ];
}

function decisionStandard(threadId, demandReasons) {
  const reasons = demandReasons ? ', option_reasons holding one non-empty reason per option,' : '';
  return `record_decision for thread ${threadId} with a non-empty title, context and outcome, at least two non-empty options${reasons} counts toward the boundary`;
}

function isLogbookRefusalText(text) {
  const lines = text.split(/\r?\n/);
  const field = lines.findIndex((line) => line.startsWith('field: '));
  return field !== -1 && lines.slice(field + 1).some((line) => line.startsWith('accepted: '));
}

function isRefusedResult(response) {
  const decoded = decodedResponse(response);
  const flagged = decoded !== null && typeof decoded === 'object' && !Array.isArray(decoded) && decoded.isError === true;
  return flagged || isLogbookRefusalText(toolResponseParts(response).text);
}

export function onRecordDecision(event, state, context = {}) {
  if (state === null || hasAgent(event)) return nothing(state);
  if (isRefusedResult(event.tool_response)) return onRecordDecisionFailure(event, state);
  const input = toolInput(event);
  const carriesReasons = input.option_reasons !== undefined;
  const learned = carriesReasons && !state.reasons_accepted ? { ...state, reasons_accepted: true } : state;
  if (learned.thread_id === null || input.thread_id !== learned.thread_id) return nothing(learned);
  const installed = context.installedVersion !== undefined ? context.installedVersion : installedLogbookVersion(event.cwd, context.home ?? homeDirectory());
  const demand = reasonsDemanded(learned, installed);
  const missing = missingDecisionParts(input, demand);
  if (missing.length > 0) {
    const message = `Pipeline recording standard not met, so this decision does not mark the boundary. Missing: ${missing.join('; ')}. Only a ${decisionStandard(learned.thread_id, demand)}; record it again.`;
    return Object.freeze({ state: learned, output: postContext(message) });
  }
  const anchor = `${ANCHOR_PREFIX} thread ${learned.thread_id}: recorded decision ${shorten(input.title, ANCHOR_TEXT_LIMIT)}`;
  return Object.freeze({ state: { ...learned, decision_recorded: true, latest_anchor: anchor }, output: postContext(anchor) });
}

function refusalTexts(event) {
  return [event.error, event.tool_response, event.message].flatMap((value) => {
    const decoded = toolResponseParts(value).text;
    return typeof value === 'string' && value !== decoded ? [value, decoded] : [decoded];
  });
}

function refusesOptionReasons(event) {
  if (toolInput(event).option_reasons === undefined) return false;
  return refusalTexts(event).some((text) => {
    const lines = text.split(/\r?\n/);
    const rootRefusal = lines.some((line) => ROOT_REFUSAL_FIELD.test(line)) && lines.includes('accepted: object');
    return rootRefusal || (UNRECOGNISED_KEYS.test(text) && OPTION_REASONS_WORD.test(text));
  });
}

export function onRecordDecisionFailure(event, state) {
  if (state === null || hasAgent(event) || state.reasons_refused) return nothing(state);
  return refusesOptionReasons(event) ? nothing({ ...state, reasons_refused: true }) : nothing(state);
}

export function onUpdateThread(event, state) {
  if (state === null || hasAgent(event) || state.thread_id === null) return nothing(state);
  const input = toolInput(event);
  const records = Array.isArray(input.next_step_records) ? input.next_step_records.filter(nonEmpty) : [];
  const counts = input.thread_id === state.thread_id && nonEmpty(input.next_step) && records.length > 0;
  return counts && !state.next_step_recorded ? nothing({ ...state, next_step_recorded: true }) : nothing(state);
}

function mitosisRoot(home) {
  return join(home, '.mitosis');
}

export function isRunHome(directory, home = homeDirectory()) {
  if (typeof directory !== 'string' || !isAbsolute(directory)) return false;
  const normal = resolve(directory);
  const repo = dirname(normal);
  if (dirname(repo) !== mitosisRoot(home)) return false;
  const repoName = basename(repo);
  const slug = basename(normal);
  if (RESERVED_REPOS.has(repoName) || repoName === '.' || repoName === '..' || slug === '.' || slug === '..') return false;
  return existsSync(join(normal, 'run.zsh')) || existsSync(join(normal, 'CHARTER.md'));
}

export function addRunHomes(state, paths) {
  return paths.reduce((current, path) => {
    const existing = current.run_homes.find((entry) => entry.path === path);
    const others = current.run_homes.filter((entry) => entry.path !== path);
    return { ...current, run_homes: [existing ?? { path, anchor: null }, ...others] };
  }, state);
}

function setRunHomeAnchor(state, path, anchor) {
  return { ...state, run_homes: state.run_homes.map((entry) => (entry.path === path ? { ...entry, anchor } : entry)), latest_anchor: anchor };
}

function noThreadReason(subject) {
  return `${subject}: this session holds no logbook thread. Open one with open_thread, or pick an existing one from list_threads, and call resume_thread on it so the session holds it; then try again.`;
}

function missingBoundaryParts(state) {
  return [
    ...(state.decision_recorded
      ? []
      : [`the decision (call record_decision for thread ${state.thread_id} with the boundary in its title, context, at least two options, option_reasons with one reason per option when the running logbook accepts it, and the outcome)`]),
    ...(state.next_step_recorded ? [] : [`the next step (call update_thread for thread ${state.thread_id} with next_step and next_step_records naming the records it needs)`]),
  ];
}

function runVerdict(code, message) {
  return Object.freeze({ code, message });
}

function runUndecided(detail) {
  return runVerdict(2, `check-run: could not decide: ${detail}`);
}

function runCommand(runScript, runArguments, ship) {
  const prefix = typeof ship === 'string' && ship !== '' ? [`SHIP=${ship}`] : [];
  return [...prefix, runScript, ...runArguments].join(' ');
}

export function checkRun({ argv, env, home = homeDirectory(), now = new Date() }) {
  const [runScript, ...runArguments] = Array.isArray(argv) ? argv : [];
  if (typeof runScript !== 'string' || runScript === '') return runVerdict(2, RUN_USAGE);
  const folder = dirname(runScript);
  if (!isRunHome(folder, home)) return runUndecided(`${folder} is not a run home`);
  const runHome = resolve(folder);
  const environment = env !== null && typeof env === 'object' ? env : {};
  const sessionId = environment.CLAUDE_CODE_SESSION_ID;
  if (sessionId === undefined || sessionId === '') return runVerdict(0, null);
  const stateResult = readState(sessionId, home);
  if (stateResult.status === 'invalid') return runUndecided('the session id is not usable as a pipeline state key');
  if (stateResult.status === 'absent') return runVerdict(1, noThreadReason('check-run'));
  if (stateResult.status === 'unreadable') {
    return runUndecided(`the session's pipeline state at ${stateResult.path} cannot be read; call resume_thread on the held logbook thread, then run again`);
  }
  const state = stateResult.state;
  if (state.thread_id === null) return runVerdict(1, noThreadReason('check-run'));
  const planOnly = runArguments.length === 1 && runArguments[0] === '--plan-only';
  const missing = planOnly ? [] : missingBoundaryParts(state);
  if (missing.length > 0) {
    return runVerdict(1, `check-run: the boundary before this run is not recorded. Missing: ${missing.join('; ')}. A --plan-only run needs only the held thread.`);
  }
  const command = runCommand(runScript, runArguments, environment.SHIP);
  const anchor = `${ANCHOR_PREFIX} ${basename(runHome)} at ${runHome}, thread ${state.thread_id}: ${shorten(command, ANCHOR_TEXT_LIMIT)}`;
  const anchored = setRunHomeAnchor(addRunHomes(state, [runHome]), runHome, anchor);
  const next = planOnly ? anchored : { ...anchored, decision_recorded: false, next_step_recorded: false };
  if (stateBody(next) !== stateBody(state)) {
    try {
      writeState(next, home, now);
    } catch (error) {
      return runUndecided(`the session's pipeline state at ${stateResult.path} cannot be written (${error && error.message})`);
    }
  }
  return runVerdict(0, anchor);
}

const SUBAGENT_INTERPHASE_REASON =
  "Pipeline interphase gate: a subagent cannot take the session's logbook thread, so the pipeline's interphase call is left to the main conversation. Hand this call back to the main conversation.";

export function isPipelineInterphaseCall(event) {
  const input = toolInput(event);
  const skill = typeof input.skill === 'string' ? input.skill.trim() : '';
  const named = skill === 'interphase' || skill.startsWith('interphase:');
  return named && typeof input.args === 'string' && input.args.trim().endsWith('Work autonomously.');
}

export function interphaseGate(event, stateResult) {
  if (!isPipelineInterphaseCall(event)) return nothing(stateResult.state);
  if (stateResult.status === 'unreadable') return nothing(null);
  const reason = hasAgent(event) ? SUBAGENT_INTERPHASE_REASON : noThreadReason('Pipeline interphase gate');
  if (stateResult.status === 'invalid') return Object.freeze({ state: null, output: deny(reason) });
  const state = stateResult.state;
  if (state !== null && state.thread_id !== null) return nothing(state);
  return Object.freeze({ state, output: deny(reason) });
}

function readText(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

function charterLines(runHome) {
  const charterPath = join(runHome, 'CHARTER.md');
  const text = readText(charterPath);
  const lines = text === null ? [] : text.split(/\r?\n/).map((line) => line.trim());
  const named = lines.filter((line) => line.startsWith('- Spec:') || line.startsWith('- Decisions') || line.startsWith('- Record:')).map((line) => line.slice(2));
  return named.length > 0 ? named : [`Charter: ${charterPath}`];
}

function roundsLines(runHome) {
  const text = readText(join(runHome, 'rounds.md'));
  if (text === null) return ['Rounds: none'];
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '').slice(-ROUNDS_SHOWN);
  return lines.length === 0 ? ['Rounds: none'] : ['Rounds:', ...lines.map((line) => shorten(line, ROUNDS_LINE_LIMIT))];
}

export function runHomeBlock(entry) {
  return [
    `## ${basename(entry.path)}`,
    `Path: ${entry.path}`,
    ...charterLines(entry.path),
    ...roundsLines(entry.path),
    `Latest anchor: ${entry.anchor ?? 'none'}`,
  ].join('\n');
}

export function renderBriefing(state, cap = BRIEFING_CAP) {
  const header = [BRIEFING_HEADING, `Thread: ${state.thread_id ?? 'none'}`, `Latest anchor: ${state.latest_anchor ?? 'none'}`].join('\n');
  const entries = state.run_homes;
  const built = entries.reduce(
    (walk, entry, index) => {
      if (walk.stopped) return walk;
      const candidate = `${walk.text}\n\n${runHomeBlock(entry)}`;
      const last = index === entries.length - 1;
      const room = last ? cap : cap - TAIL_RESERVE;
      return candidate.length <= room ? { text: candidate, shown: index + 1, stopped: false } : { ...walk, stopped: true };
    },
    { text: header, shown: 0, stopped: false },
  );
  if (built.shown === entries.length) return built.text.slice(0, cap);
  const left = entries.slice(built.shown).map((entry) => entry.path);
  const tail = `${left.length} more run homes: ${left.join(', ')}`;
  const space = cap - built.text.length - 2;
  const fitted = tail.length <= space ? tail : `${tail.slice(0, Math.max(0, space - 3))}...`;
  return `${built.text}\n\n${fitted}`.slice(0, cap);
}

export function pipelineBriefing(event, state) {
  if (state === null || event.source !== 'compact') return nothing(state);
  return Object.freeze({
    state,
    output: Object.freeze({ hookSpecificOutput: Object.freeze({ hookEventName: 'SessionStart', additionalContext: renderBriefing(state) }) }),
  });
}

export function eventKind(event) {
  if (event === null || typeof event !== 'object') return null;
  const name = event.hook_event_name;
  const tool = event.tool_name;
  if (name === 'PreToolUse' && tool === 'Skill') return 'interphase-gate';
  if (name === 'SessionStart') return 'session-start';
  const logbook = logbookTool(tool);
  if (logbook === null) return null;
  if (name === 'PostToolUseFailure') return logbook === 'record_decision' ? 'record-decision-failure' : null;
  if (name !== 'PostToolUse') return null;
  const kinds = {
    resume_thread: 'resume-thread',
    close_thread: 'close-thread',
    park_thread: 'park-thread',
    record_decision: 'record-decision',
    update_thread: 'update-thread',
  };
  return Object.hasOwn(kinds, logbook) ? kinds[logbook] : null;
}

function decide(kind, event, stateResult, context) {
  const state = stateResult.state;
  if (kind === 'interphase-gate') return interphaseGate(event, stateResult);
  if (stateResult.status !== 'present' && !(kind === 'resume-thread' && stateResult.status !== 'invalid')) return nothing(null);
  if (kind === 'resume-thread') return onResumeThread(event, state);
  if (kind === 'close-thread') return onCloseThread(event, state);
  if (kind === 'park-thread') return onParkThread(event, state);
  if (kind === 'record-decision') return onRecordDecision(event, state, context);
  if (kind === 'record-decision-failure') return onRecordDecisionFailure(event, state);
  if (kind === 'update-thread') return onUpdateThread(event, state);
  if (kind === 'session-start') return pipelineBriefing(event, state);
  return nothing(state);
}

export function handleEvent(event, options = {}) {
  const kind = eventKind(event);
  if (kind === null) return null;
  const home = options.home ?? homeDirectory();
  const stateResult = sessionIdIsSafe(event.session_id) ? readState(event.session_id, home) : Object.freeze({ status: 'invalid', state: null, path: null });
  const result = decide(kind, event, stateResult, { ...options, home });
  if (result.state !== null && stateResult.status !== 'invalid' && stateBody(result.state) !== stateBody(stateResult.state)) {
    writeState(result.state, home, options.now ?? new Date());
  }
  return result.output;
}
