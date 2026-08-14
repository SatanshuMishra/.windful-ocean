import { EXEC_COMPLETED } from './exec-run.mjs';

const MODULE = 'transcription-parsers';
const SHA_PATTERN = /^[0-9a-f]{7,64}$/;
const RENAME_SEPARATOR = ' -> ';
const PORCELAIN_PREFIX = 3;
const CONFLICT_MARKER = /^CONFLICT \([^)]*\): Merge conflict in (.+)$/;
const OCTAL_ESCAPE = /^[0-7]{3}$/;
const SIMPLE_ESCAPES = Object.freeze({ n: '\n', t: '\t', r: '\r', '"': '"', '\\': '\\' });
const ENCODER = new TextEncoder();
const DECODER = new TextDecoder('utf-8', { fatal: true });

function failed(error) {
  return Object.freeze({ ok: false, error: `${MODULE}: ${error}` });
}

function completedRun(result, what) {
  if (result === null || typeof result !== 'object' || Array.isArray(result) || typeof result.outcome !== 'string') {
    return failed(`${what} was handed ${JSON.stringify(result)} rather than the result of a run, so there is no output to read and no status to read it against`);
  }
  if (result.outcome !== EXEC_COMPLETED) {
    return failed(`${what} was handed a run that reported ${result.outcome} rather than ${EXEC_COMPLETED}; a command that did not finish answers for nothing, and reading its partial output as a fact is the silent wrong success these probes exist to prevent`);
  }
  if (typeof result.status !== 'number') {
    return failed(`${what} was handed a completed run carrying no exit status, so nothing distinguishes success from failure`);
  }
  return null;
}

function stdoutOf(result) {
  return typeof result.stdout === 'string' ? result.stdout : '';
}

function stderrOf(result) {
  return typeof result.stderr === 'string' ? result.stderr : '';
}

function refused(what, result) {
  const detail = stderrOf(result).trim() || stdoutOf(result).trim() || 'no output';
  return failed(`${what} exited ${result.status}: ${detail}`);
}

function lines(text) {
  return text.split('\n').filter((line) => line.length > 0);
}

function decodeBytes(bytes) {
  try {
    return { value: DECODER.decode(new Uint8Array(bytes)) };
  } catch {
    return { error: 'escapes a byte sequence that is not valid utf-8, so the path it names cannot be recovered as the identity git reported' };
  }
}

function unquote(token) {
  if (!token.startsWith('"')) return { value: token };
  const bytes = [];
  let index = 1;
  while (index < token.length) {
    const character = token[index];
    if (character === '"') {
      const decoded = decodeBytes(bytes);
      return decoded.error === undefined ? { value: decoded.value, consumed: index + 1 } : decoded;
    }
    if (character !== '\\') { bytes.push(...ENCODER.encode(character)); index += 1; continue; }
    const escape = token.slice(index + 1, index + 2);
    if (Object.hasOwn(SIMPLE_ESCAPES, escape)) { bytes.push(...ENCODER.encode(SIMPLE_ESCAPES[escape])); index += 2; continue; }
    const octal = token.slice(index + 1, index + 4);
    if (OCTAL_ESCAPE.test(octal)) { bytes.push(parseInt(octal, 8)); index += 4; continue; }
    return { error: `carries the escape ${JSON.stringify(`\\${escape}`)}, which this reader does not know how to resolve` };
  }
  return { error: 'opens a quoted path that never closes' };
}

function quotedPathLine(line, what) {
  const read = unquote(line);
  if (read.error !== undefined) return { error: `the ${what} ${JSON.stringify(line)} ${read.error}` };
  if (read.consumed !== undefined && read.consumed !== line.length) {
    return { error: `the ${what} ${JSON.stringify(line)} carries text after the quoted path it names, so which of the two is the path cannot be told` };
  }
  return { value: read.value };
}

function porcelainPaths(line) {
  if (line.length <= PORCELAIN_PREFIX) {
    return { error: `the porcelain line ${JSON.stringify(line)} is too short to carry a path` };
  }
  const rest = line.slice(PORCELAIN_PREFIX);
  if (!rest.startsWith('"')) {
    const cut = rest.indexOf(RENAME_SEPARATOR);
    if (cut === -1) return { paths: [rest] };
    const second = unquote(rest.slice(cut + RENAME_SEPARATOR.length));
    if (second.error !== undefined) return { error: `the porcelain line ${JSON.stringify(line)} ${second.error}` };
    return { paths: [rest.slice(0, cut), second.value] };
  }
  const first = unquote(rest);
  if (first.error !== undefined) return { error: `the porcelain line ${JSON.stringify(line)} ${first.error}` };
  const tail = rest.slice(first.consumed);
  if (tail.length === 0) return { paths: [first.value] };
  if (!tail.startsWith(RENAME_SEPARATOR)) {
    return { error: `the porcelain line ${JSON.stringify(line)} carries text after a quoted path that is not a rename separator` };
  }
  const second = unquote(tail.slice(RENAME_SEPARATOR.length));
  if (second.error !== undefined) return { error: `the porcelain line ${JSON.stringify(line)} ${second.error}` };
  return { paths: [first.value, second.value] };
}

export function parseStatusPaths(result) {
  const refusal = completedRun(result, 'the working tree fence');
  if (refusal !== null) return refusal;
  if (result.status !== 0) return refused('the working tree fence', result);
  const paths = [];
  for (const line of lines(stdoutOf(result))) {
    const read = porcelainPaths(line);
    if (read.error !== undefined) return failed(read.error);
    paths.push(...read.paths);
  }
  return Object.freeze({ ok: true, paths: Object.freeze(paths) });
}

export function parseNameOnlyPaths(result) {
  const refusal = completedRun(result, 'the changed-path read');
  if (refusal !== null) return refusal;
  if (result.status !== 0) return refused('the changed-path read', result);
  const paths = [];
  for (const line of lines(stdoutOf(result))) {
    const read = quotedPathLine(line, 'changed-path line');
    if (read.error !== undefined) return failed(read.error);
    paths.push(read.value);
  }
  return Object.freeze({ ok: true, paths: Object.freeze(paths) });
}

export function parsePresence(result) {
  const refusal = completedRun(result, 'the object presence probe');
  if (refusal !== null) return refusal;
  if (result.status === 0) return Object.freeze({ ok: true, present: true });
  if (result.status === 1) return Object.freeze({ ok: true, present: false });
  return failed(`the object presence probe exited ${result.status} rather than zero for present or one for absent: ${stderrOf(result).trim() || 'no output'}; an exit that means neither cannot be read as an absence`);
}

export function parseSha(result) {
  const refusal = completedRun(result, 'the object name read');
  if (refusal !== null) return refusal;
  if (result.status !== 0) return refused('the object name read', result);
  const value = stdoutOf(result).trim();
  if (!SHA_PATTERN.test(value)) {
    return failed(`the object name read printed ${JSON.stringify(value)}, which is not a resolved object name; an unresolved ref name would be recorded as the sha it was supposed to resolve to`);
  }
  return Object.freeze({ ok: true, sha: value });
}

export function parseLsRemote(result) {
  const refusal = completedRun(result, 'the remote ref read');
  if (refusal !== null) return refusal;
  if (result.status !== 0) return refused('the remote ref read', result);
  const printed = lines(stdoutOf(result));
  if (printed.length === 0) return Object.freeze({ ok: true, present: false, sha: null, ref: null });
  const [sha, ref] = printed[0].split('\t');
  if (!SHA_PATTERN.test(String(sha).trim()) || typeof ref !== 'string' || ref.trim().length === 0) {
    return failed(`the remote ref read printed ${JSON.stringify(printed[0])}, which does not split into an object name and a ref; a line this reader cannot split cannot be read as a published identity`);
  }
  return Object.freeze({ ok: true, present: true, sha: sha.trim(), ref: ref.trim() });
}

export function parseAncestry(result) {
  const refusal = completedRun(result, 'the ancestry probe');
  if (refusal !== null) return refusal;
  if (result.status === 0) return Object.freeze({ ok: true, ancestor: true });
  if (result.status === 1) return Object.freeze({ ok: true, ancestor: false });
  return failed(`the ancestry probe exited ${result.status} rather than zero for contained or one for not contained: ${stderrOf(result).trim() || 'no output'}; an exit that means neither cannot be read as a rewrite`);
}

export function parseMerge(result) {
  const refusal = completedRun(result, 'the merge');
  if (refusal !== null) return refusal;
  if (result.status === 0) {
    return Object.freeze({ ok: true, merged: true, conflict: false, conflictPaths: Object.freeze([]) });
  }
  const conflictPaths = lines(stdoutOf(result))
    .map((line) => line.match(CONFLICT_MARKER))
    .filter((match) => match !== null)
    .map((match) => match[1]);
  if (conflictPaths.length === 0) {
    return failed(`the merge exited ${result.status} without naming a conflicting path: ${stderrOf(result).trim() || stdoutOf(result).trim() || 'no output'}; a merge that failed for another reason is not a conflict, and reporting it as one would send the run down the conflict path`);
  }
  return Object.freeze({ ok: true, merged: false, conflict: true, conflictPaths: Object.freeze(conflictPaths) });
}

export function parseBytes(result) {
  const refusal = completedRun(result, 'the object bytes read');
  if (refusal !== null) return refusal;
  if (result.status !== 0) return refused('the object bytes read', result);
  return Object.freeze({ ok: true, bytes: stdoutOf(result) });
}

export function classifyPlanArtifact(observed) {
  if (observed === null || typeof observed !== 'object' || Array.isArray(observed)) {
    return Object.freeze({ planFound: false, detail: `the plan artifact could not be observed at all: ${JSON.stringify(observed)} is not an observation` });
  }
  if (observed.exists !== true) {
    return Object.freeze({ planFound: false, detail: 'the plan artifact is absent from this workspace, so the resumed run would skip planning with nothing to skip it against' });
  }
  if (observed.isFile !== true) {
    return Object.freeze({ planFound: false, detail: 'the plan artifact path is not a regular file, so it carries no plan to read' });
  }
  if (!Number.isInteger(observed.size) || observed.size <= 0) {
    return Object.freeze({ planFound: false, detail: 'the plan artifact is empty, and an empty plan is indistinguishable from an absent one to every stage that reads it' });
  }
  return Object.freeze({ planFound: true, detail: `the plan artifact is a regular file holding ${observed.size} byte(s)` });
}
