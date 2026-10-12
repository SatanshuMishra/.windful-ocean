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
const ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)=/;
const WRAPPERS = new Set(['nohup', 'exec', 'time', 'zsh', 'bash', 'sh']);
const SHELLS = new Set(['zsh', 'bash', 'sh']);
const RESERVED_REPOS = new Set(['runs', 'sessions']);
const READERS = new Set([
  'cat', 'less', 'more', 'head', 'tail', 'ls', 'stat', 'file', 'wc', 'grep', 'egrep', 'fgrep', 'rg', 'sed', 'sort', 'cut', 'nl', 'od', 'xxd', 'diff', 'cmp',
  'shasum', 'sha256sum', 'md5', 'md5sum', 'chmod', 'touch', 'cp', 'mv', 'echo', 'printf', 'test', '[', 'git', 'readlink', 'realpath', 'basename', 'dirname',
]);
const RUNNERS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh', 'mksh', 'fish', 'eval', 'source', '.', 'exec', 'xargs', 'parallel', 'env', 'command', 'builtin', 'nice', 'timeout', 'sudo']);
const GRAMMAR = new Set(['!', '{', '}', '[[', 'case', 'coproc', 'do', 'done', 'elif', 'else', 'end', 'esac', 'fi', 'for', 'foreach', 'function', 'if', 'repeat', 'select', 'then', 'until', 'while']);
const COMMAND_STRING_FLAG = /^-[A-Za-z]*c[A-Za-z]*$/;
const REDIRECTION = /^(?:\d*|&|\{[A-Za-z_][A-Za-z0-9_]*\})[<>][<>&|!-]*$/;
const COMMENT_AFTER = new Set([' ', '\t', '\n', '\r', '\f', '\v', ';', '&', '|', '(', ')']);
const DELIMITER_END = /[\s;&|<>()'"]/;
const SUBSTITUTION = /\$\(|\x60|<\(|>\(/;
const RUN_ZSH = /run\.zsh/g;
const VARIABLE_REFERENCE = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g;
const ANCHOR_TEXT_LIMIT = 200;
const ROUNDS_LINE_LIMIT = 400;
const ROUNDS_SHOWN = 5;
const TAIL_RESERVE = 48;
const REASONS_FROM = '0.15.0';
const REASONS_REFUSED = Object.freeze(['1.0.0', '14.0.0']);
const SEGMENT = String.raw`[^/\s'"\x60;&|]+`;
const PATH_END = String.raw`(?=[/\s'"\x60;&|]|$)`;
const PATH_START = String.raw`(?<![^\s'"\x60=;&|(:<>])`;
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
    `Pipeline run gate could not decide: ${detail}. Call resume_thread on the held logbook thread, which writes fresh pipeline state for this session, then run again.`,
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

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

function homePrefixes(home) {
  return ['~', '\\$HOME', '\\$\\{HOME\\}', escapeRegExp(home)].join('|');
}

function mitosisTextPattern(home) {
  const reserved = [...RESERVED_REPOS].map(escapeRegExp).join('|');
  return new RegExp(`(?:${homePrefixes(home)})/\\.mitosis/(?!(?:${reserved})${PATH_END})`);
}

function isUnderMitosis(path, home) {
  if (typeof path !== 'string' || !isAbsolute(path)) return false;
  const root = mitosisRoot(home);
  const normal = resolve(path);
  if (normal === root) return true;
  return normal.startsWith(`${root}${sep}`) && !RESERVED_REPOS.has(normal.slice(root.length + 1).split(sep)[0]);
}

export function runHomesInText(command, home = homeDirectory()) {
  if (typeof command !== 'string') return [];
  const pattern = new RegExp(`${PATH_START}(?:${homePrefixes(home)})/\\.mitosis/(${SEGMENT})/(${SEGMENT})${PATH_END}`, 'g');
  const found = [...command.matchAll(pattern)]
    .filter((match) => !RESERVED_REPOS.has(match[1]) && ![match[1], match[2]].some((segment) => segment === '.' || segment === '..'))
    .map((match) => join(mitosisRoot(home), match[1], match[2]))
    .filter((path) => isRunHome(path, home));
  return [...new Set(found)];
}

function heredocAt(command, index) {
  let cursor = index + 2;
  const strip = command[cursor] === '-';
  if (strip) cursor += 1;
  while (command[cursor] === ' ' || command[cursor] === '\t') cursor += 1;
  const opener = command[cursor];
  if (opener === '\'' || opener === '"') {
    const close = command.indexOf(opener, cursor + 1);
    if (close === -1) return null;
    return Object.freeze({ delimiter: command.slice(cursor + 1, close), strip, end: close + 1 });
  }
  const start = opener === '\\' ? cursor + 1 : cursor;
  let end = start;
  while (end < command.length && !DELIMITER_END.test(command[end])) end += 1;
  return end === start ? null : Object.freeze({ delimiter: command.slice(start, end), strip, end });
}

function heredocBody(command, start, heredoc) {
  const lines = [];
  let position = start;
  while (position < command.length) {
    const newline = command.indexOf('\n', position);
    const lineEnd = newline === -1 ? command.length : newline;
    const line = command.slice(position, lineEnd);
    const next = newline === -1 ? command.length : newline + 1;
    if ((heredoc.strip ? line.replace(/^\t+/, '') : line) === heredoc.delimiter) {
      return Object.freeze({ body: lines.join('\n'), next, closed: true });
    }
    lines.push(line);
    position = next;
  }
  return Object.freeze({ body: lines.join('\n'), next: command.length, closed: false });
}

export function lexCommand(command) {
  const texts = [];
  const bodies = [];
  const pending = [];
  let current = '';
  let quote = null;
  let last = null;
  let dollar = false;
  let unclosed = false;
  const endPart = () => {
    texts.push(current);
    bodies.push('');
    current = '';
  };
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    const next = command[index + 1];
    const previous = command[index - 1];
    const heredoc = quote === null && char === '<' && next === '<' && command[index + 2] !== '<' && previous !== '<' ? heredocAt(command, index) : null;
    if (quote === '\'') {
      current += char;
      if (char === '\'') quote = null;
      last = char;
    } else if (quote === '$\'') {
      current += char;
      if (char === '\\' && next !== undefined) {
        current += next;
        index += 1;
      } else if (char === '\'') {
        quote = null;
      }
      last = char;
    } else if (quote === '"') {
      if (char === '\\' && next === '\n') {
        index += 1;
      } else if (char === '\\' && next !== undefined) {
        current += char + next;
        index += 1;
      } else {
        current += char;
        if (char === '"') quote = null;
      }
      last = char;
    } else if (char === '\\' && next === '\n') {
      index += 1;
    } else if (char === '\\' && next !== undefined) {
      current += char + next;
      index += 1;
      last = '\\';
      dollar = false;
    } else if (char === '#' && (last === null || COMMENT_AFTER.has(last))) {
      const newline = command.indexOf('\n', index);
      index = (newline === -1 ? command.length : newline) - 1;
    } else if (char === '\'' && dollar) {
      quote = '$\'';
      current += char;
      last = char;
    } else if (char === '\'' || char === '"') {
      quote = char;
      current += char;
      last = char;
    } else if (heredoc !== null) {
      current += command.slice(index, heredoc.end);
      pending.push(Object.freeze({ delimiter: heredoc.delimiter, strip: heredoc.strip, part: texts.length }));
      index = heredoc.end - 1;
      last = command[index];
    } else if (char === '\n' && pending.length > 0) {
      endPart();
      let position = index + 1;
      while (pending.length > 0 && !unclosed) {
        const waiting = pending.shift();
        const read = heredocBody(command, position, waiting);
        if (read.body !== '') bodies[waiting.part] = bodies[waiting.part] === '' ? read.body : `${bodies[waiting.part]}\n${read.body}`;
        unclosed = !read.closed;
        position = read.next;
      }
      index = position - 1;
      last = '\n';
    } else if (char === '\n' || char === ';') {
      endPart();
      last = char;
    } else if ((char === '&' && next === '&') || (char === '|' && next === '|')) {
      endPart();
      index += 1;
      last = char;
    } else if (char === '|') {
      endPart();
      last = char;
    } else if (char === '&' && previous !== '>' && previous !== '<' && next !== '>') {
      endPart();
      last = char;
    } else {
      current += char;
      last = char;
    }
    dollar = quote === null && char === '$' && last === '$';
  }
  endPart();
  const parts = texts
    .map((text, index) => Object.freeze({ text: text.trim(), body: bodies[index] }))
    .filter((part) => part.text !== '' || part.body !== '');
  return Object.freeze({ parts: Object.freeze(parts), open: quote !== null || pending.length > 0 || unclosed });
}

export function splitWords(part) {
  const words = [];
  let current = '';
  let started = false;
  let quote = null;
  let dollar = false;
  for (let index = 0; index < part.length; index += 1) {
    const char = part[index];
    const escaping = quote === '"' || quote === '$\'';
    if (quote !== null) {
      current += char;
      if (char === '\\' && escaping && part[index + 1] !== undefined) {
        current += part[index + 1];
        index += 1;
      } else if (char === (quote === '$\'' ? '\'' : quote)) {
        quote = null;
      }
      dollar = false;
    } else if (/\s/.test(char)) {
      if (started) words.push(current);
      current = '';
      started = false;
      dollar = false;
    } else {
      started = true;
      current += char;
      if (char === '\'' && dollar) quote = '$\'';
      else if (char === '\'' || char === '"') quote = char;
      else if (char === '\\' && part[index + 1] !== undefined) {
        current += part[index + 1];
        index += 1;
      }
      dollar = char === '$';
    }
  }
  if (started) words.push(current);
  return words;
}

function variableValue(name, variables, home) {
  if (Object.hasOwn(variables, name)) return variables[name];
  if (name === 'HOME') return home;
  return null;
}

export function expandWord(raw, variables, home) {
  let result = '';
  let quote = null;
  let index = 0;
  if (raw === '~' || raw.startsWith('~/')) {
    result = home;
    index = 1;
  }
  while (index < raw.length) {
    const char = raw[index];
    if (quote === '\'') {
      if (char === '\'') quote = null;
      else result += char;
      index += 1;
    } else if (char === '\'' && quote === null) {
      quote = '\'';
      index += 1;
    } else if (char === '"') {
      quote = quote === '"' ? null : '"';
      index += 1;
    } else if (char === '\\' && index + 1 < raw.length) {
      result += raw[index + 1];
      index += 2;
    } else if (char === '$') {
      const braced = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}/.exec(raw.slice(index));
      const bare = braced === null ? /^\$([A-Za-z_][A-Za-z0-9_]*)/.exec(raw.slice(index)) : null;
      const match = braced ?? bare;
      if (match === null) {
        result += char;
        index += 1;
      } else {
        const value = variableValue(match[1], variables, home);
        result += value === null ? match[0] : value;
        index += match[0].length;
      }
    } else {
      result += char;
      index += 1;
    }
  }
  return result;
}

function resolvePath(path, cwd) {
  if (isAbsolute(path)) return resolve(path);
  return typeof cwd === 'string' && isAbsolute(cwd) ? resolve(cwd, path) : null;
}

function optionValue(words, name) {
  const index = words.findIndex((word) => word === name || word.startsWith(`${name}=`));
  if (index === -1) return null;
  const word = words[index];
  if (word.startsWith(`${name}=`)) return word.slice(name.length + 1);
  return index + 1 < words.length ? words[index + 1] : null;
}

function verdictHome(words, home) {
  const tool = words.findIndex((word, index) => /(^|\/)pipeline\.mjs$/.test(word) && words[index + 1] === 'verdict');
  if (tool === -1) return null;
  const rest = words.slice(tool + 2);
  const ledger = optionValue(rest, '--ledger');
  const run = optionValue(rest, '--run');
  if (ledger === null || run === null || !isAbsolute(ledger) || run === '' || run.includes('/') || run === '.' || run === '..') return Object.freeze({ home: null });
  const directory = join(dirname(resolve(ledger)), run);
  return Object.freeze({ home: isRunHome(directory, home) ? directory : null });
}

function removeQuotes(word) {
  return word.replace(/'([^']*)'|"((?:[^"\\]|\\.)*)"|\\(.)/gs, (match, single, double, escaped) =>
    single !== undefined ? single : double !== undefined ? double.replace(/\\(.)/gs, '$1') : escaped,
  );
}

function knownText(part, variables, home) {
  return part.replace(VARIABLE_REFERENCE, (match, braced, bare) => variableValue(braced ?? bare, variables, home) ?? match);
}

function assignedFrom(words, variables, home) {
  return words.reduce((current, word) => {
    const [, name] = ASSIGNMENT.exec(word);
    return { ...current, [name]: expandWord(word.slice(name.length + 1), current, home) };
  }, variables);
}

function wordConcernsMitosis(word, variables, cwd, home) {
  const assignment = ASSIGNMENT.exec(word);
  const value = expandWord(assignment === null ? word : word.slice(assignment[1].length + 1), variables, home);
  return isUnderMitosis(value.includes('/') ? resolvePath(value, cwd) : value, home);
}

function planOnlyFrom(args) {
  const comment = args.findIndex((word) => word.startsWith('#'));
  const spoken = comment === -1 ? args : args.slice(0, comment);
  return spoken.some(
    (word, index) => !REDIRECTION.test(word) && !(index > 0 && REDIRECTION.test(spoken[index - 1])) && removeQuotes(word) === '--plan-only',
  );
}

function unwrap(words) {
  return words.reduce(
    (walk, word, index) => {
      if (walk.program !== null) return walk;
      if (WRAPPERS.has(word)) return { ...walk, shell: walk.shell || SHELLS.has(word), wrapped: true };
      if (walk.wrapped && word.startsWith('-')) return { ...walk, handedString: walk.handedString || (walk.shell && COMMAND_STRING_FLAG.test(word)) };
      return { ...walk, program: word, index };
    },
    { program: null, index: -1, shell: false, wrapped: false, handedString: false },
  );
}

function readPart(scan, part, home, mitosisText) {
  const rawWords = splitWords(part.text);
  const leading = rawWords.findIndex((word) => !ASSIGNMENT.test(word));
  const assignmentCount = leading === -1 ? rawWords.length : leading;
  const assigned = assignedFrom(rawWords.slice(0, assignmentCount), scan.variables, home);
  const text = knownText(part.body === '' ? part.text : `${part.text}\n${part.body}`, assigned, home);
  const mentions = (text.match(RUN_ZSH) ?? []).length;
  const substitution = SUBSTITUTION.test(part.text) || SUBSTITUTION.test(part.body) || rawWords.some((word) => word.startsWith('=('));
  const concerns =
    isUnderMitosis(scan.cwd, home) || mitosisText.test(text) || rawWords.some((word) => wordConcernsMitosis(word, assigned, scan.cwd, home));
  const plain = Object.freeze({ variables: assigned, cwd: scan.cwd, run: null, verdict: null, mentions, concerns, accounts: !substitution, grammar: false, runner: false });
  const commandWords = rawWords.slice(assignmentCount);
  if (commandWords.length === 0) return plain;
  const expanded = commandWords.map((word) => expandWord(word, assigned, home));
  if (expanded[0] === 'export') return { ...plain, variables: assignedFrom(commandWords.slice(1).filter((word) => ASSIGNMENT.test(word)), assigned, home) };
  if (expanded[0] === 'cd' || expanded[0] === 'pushd') {
    const target = expanded.slice(1).find((word) => !word.startsWith('-'));
    const nextCwd = target === undefined ? home : resolvePath(target, scan.cwd);
    return { ...plain, cwd: nextCwd, concerns: concerns || isRunHome(nextCwd, home), accounts: false };
  }
  const unwrapped = unwrap(expanded);
  const program = unwrapped.program;
  const name = program === null ? null : basename(program);
  const namesRunZsh = program !== null && !substitution && !unwrapped.handedString && (program.endsWith('/run.zsh') || (program === 'run.zsh' && unwrapped.shell));
  const target = namesRunZsh ? resolvePath(program, scan.cwd) : null;
  const runHome = target !== null && basename(target) === 'run.zsh' && isRunHome(dirname(target), home) ? dirname(target) : null;
  const run = runHome === null ? null : Object.freeze({ home: runHome, planOnly: planOnlyFrom(commandWords.slice(unwrapped.index + 1)), part: part.text });
  const verdict = verdictHome(expanded, home);
  const first = commandWords[0];
  const grammar =
    GRAMMAR.has(first) || first.startsWith('(') || first.startsWith('{') || first.endsWith(')') || rawWords.some((word) => word.endsWith('()'));
  const runner = run === null && ((unwrapped.wrapped && program === null) || (unwrapped.shell && program !== null) || (name !== null && RUNNERS.has(name)));
  const accounts = !substitution && (run !== null || (name !== null && READERS.has(name)));
  return { ...plain, run, verdict: verdict !== null ? verdict.home : null, accounts, grammar, runner };
}

export function analyzeCommand(command, options = {}) {
  const home = options.home ?? homeDirectory();
  if (typeof command !== 'string') return Object.freeze({ runs: Object.freeze([]), verdicts: Object.freeze([]), unreadable: false });
  const cwd = typeof options.cwd === 'string' && isAbsolute(options.cwd) ? options.cwd : null;
  const mitosisText = mitosisTextPattern(home);
  const lexed = lexCommand(command);
  const initial = Object.freeze({ variables: Object.freeze({}), cwd, runs: [], verdicts: [], mentions: 0, concerns: false, troubled: lexed.open });
  const final = lexed.parts.reduce((scan, part) => {
    const read = readPart(scan, part, home, mitosisText);
    return {
      variables: read.variables,
      cwd: read.cwd,
      runs: read.run === null ? scan.runs : [...scan.runs, read.run],
      verdicts: read.verdict === null ? scan.verdicts : [...scan.verdicts, read.verdict],
      mentions: scan.mentions + read.mentions,
      concerns: scan.concerns || read.concerns,
      troubled: scan.troubled || (read.mentions > 0 && !read.accounts) || read.grammar || read.runner,
    };
  }, initial);
  const concerns = final.concerns || isRunHome(cwd, home) || runHomesInText(command, home).length > 0;
  const unreadable = (final.runs.length > 0 || (concerns && final.mentions > 0)) && final.troubled;
  return Object.freeze({ runs: Object.freeze(final.runs), verdicts: Object.freeze(final.verdicts), unreadable });
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

function bashCommand(event) {
  const command = toolInput(event).command;
  return typeof command === 'string' ? command : null;
}

export function onBashCompleted(event, state, context = {}) {
  if (state === null || hasAgent(event)) return nothing(state);
  const command = bashCommand(event);
  if (command === null) return nothing(state);
  const home = context.home ?? homeDirectory();
  const analysis = analyzeCommand(command, { home, cwd: event.cwd });
  const textHomes = runHomesInText(command, home);
  const runHomes = analysis.runs.map((run) => run.home);
  const added = addRunHomes(state, [...textHomes, ...runHomes, ...analysis.verdicts].reverse().filter((path, index, all) => all.indexOf(path) === index).reverse());
  const anchored = analysis.runs.length > 0 ? analysis.runs[0].home : analysis.verdicts.length > 0 ? analysis.verdicts[0] : null;
  if (anchored === null) return nothing(added);
  const front = addRunHomes(added, [anchored]);
  const anchor = `${ANCHOR_PREFIX} ${basename(anchored)} at ${anchored}, thread ${front.thread_id ?? 'none'}: ${shorten(command, ANCHOR_TEXT_LIMIT)}`;
  return Object.freeze({ state: setRunHomeAnchor(front, anchored, anchor), output: postContext(anchor) });
}

function noThreadReason(subject) {
  return `${subject}: this session holds no logbook thread. Open one with open_thread, or pick an existing one from list_threads, and call resume_thread on it so the session holds it; then try again.`;
}

const SUBAGENT_RUN_REASON =
  'Pipeline run gate: a subagent cannot start a build, a resume or the ship, and runs --plan-only only while the main conversation holds a logbook thread. Hand this run back to the main conversation.';

const SUBAGENT_INTERPHASE_REASON =
  "Pipeline interphase gate: a subagent cannot take the session's logbook thread, so the pipeline's interphase call is left to the main conversation. Hand this call back to the main conversation.";

const UNREADABLE_RUN_REASON =
  "Pipeline run gate: this command names a run home's run.zsh in a form the gate cannot read, so it cannot tell how many builds, resumes or ships it starts. Run each one as a plain command of its own, such as SHIP=1 <run home>/run.zsh --resume, recording the boundary before each. Read run.zsh with cat, grep or ls, change it with the file tools, and keep loops, functions, other shells and $(...) out of any command that names it.";

const MANY_RUNS_REASON =
  'Pipeline run gate: this command can start more than one run that is not --plan-only, and each needs its own recorded boundary. Run them in separate commands, recording the boundary before each.';

function subagentRunGate(runs, stateResult) {
  const state = stateResult.state;
  if (runs.length === 0) return nothing(state);
  const held = stateResult.status === 'present' && state !== null && state.thread_id !== null;
  if (held && runs.every((run) => run.planOnly)) return nothing(state);
  return Object.freeze({ state, output: deny(SUBAGENT_RUN_REASON) });
}

export function runGate(event, stateResult, context = {}) {
  const command = bashCommand(event);
  if (command === null) return nothing(stateResult.state);
  const home = context.home ?? homeDirectory();
  const { runs, unreadable } = analyzeCommand(command, { home, cwd: event.cwd });
  if (runs.length === 0 && !unreadable) return nothing(stateResult.state);
  if (hasAgent(event)) return subagentRunGate(runs, stateResult);
  if (stateResult.status === 'invalid') return Object.freeze({ state: null, output: couldNotDecide('the session id is not usable as a pipeline state key') });
  if (stateResult.status === 'unreadable') {
    return Object.freeze({ state: null, output: couldNotDecide(`the session's pipeline state at ${stateResult.path} cannot be read`) });
  }
  const state = stateResult.state;
  if (state === null || state.thread_id === null) {
    return runs.length === 0 ? nothing(state) : Object.freeze({ state, output: deny(noThreadReason('Pipeline run gate')) });
  }
  if (unreadable) return Object.freeze({ state, output: deny(UNREADABLE_RUN_REASON) });
  if (runs.every((run) => run.planOnly)) return nothing(state);
  if (runs.filter((run) => !run.planOnly).length >= 2) return Object.freeze({ state, output: deny(MANY_RUNS_REASON) });
  const missing = [
    ...(state.decision_recorded
      ? []
      : [`the decision (call record_decision for thread ${state.thread_id} with the boundary in its title, context, at least two options, option_reasons with one reason per option when the running logbook accepts it, and the outcome)`]),
    ...(state.next_step_recorded ? [] : [`the next step (call update_thread for thread ${state.thread_id} with next_step and next_step_records naming the records it needs)`]),
  ];
  if (missing.length > 0) {
    return Object.freeze({
      state,
      output: deny(`Pipeline run gate: the boundary before this run is not recorded. Missing: ${missing.join('; ')}. A --plan-only run needs only the held thread.`),
    });
  }
  return nothing({ ...state, decision_recorded: false, next_step_recorded: false });
}

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
  if (name === 'PreToolUse' && tool === 'Bash') return 'run-gate';
  if (name === 'PostToolUse' && tool === 'Bash') return 'bash';
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
  if (kind === 'run-gate') return runGate(event, stateResult, context);
  if (stateResult.status !== 'present' && !(kind === 'resume-thread' && stateResult.status !== 'invalid')) return nothing(null);
  if (kind === 'resume-thread') return onResumeThread(event, state);
  if (kind === 'close-thread') return onCloseThread(event, state);
  if (kind === 'park-thread') return onParkThread(event, state);
  if (kind === 'record-decision') return onRecordDecision(event, state, context);
  if (kind === 'record-decision-failure') return onRecordDecisionFailure(event, state);
  if (kind === 'update-thread') return onUpdateThread(event, state);
  if (kind === 'bash') return onBashCompleted(event, state, context);
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
