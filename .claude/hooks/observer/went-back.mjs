import path from "node:path";

export const WENT_BACK_SUBJECT = "session";
export const WENT_BACK_EVENT = "went_back";
export const BRIEFING_TOOL = "mcp__plugin_logbook_ledger__resume_thread";
export const READ_TOOL = "Read";
export const SEARCH_TOOLS = Object.freeze(["Grep", "Glob"]);
export const KIND_READ = "repeat_read";
export const KIND_SEARCH = "repeat_search";
export const SIGNATURE_MAX = 300;
export const WENT_BACK_DEFINITION = "Going back means that, at or after the first mcp__plugin_logbook_ledger__resume_thread tool call in this session's main transcript, a Read names a file_path whose path.normalize form already appeared in an earlier Read in the same transcript, or a Grep or Glob repeats a signature - the tool name, a space, and JSON.stringify of its input object with its own keys sorted ascending - that already appeared in the same transcript; the first Read of a path and the first use of a signature are not going back, subagent transcripts are not read, and a re-read counts per path regardless of offset, limit or pages.";

function parsedEntry(line) {
  if (typeof line !== "string" || line.trim().length === 0) return null;
  try {
    const entry = JSON.parse(line);
    return entry && typeof entry === "object" && !Array.isArray(entry) ? entry : null;
  } catch {
    return null;
  }
}

function contentBlocks(entry) {
  const message = entry.message && typeof entry.message === "object" ? entry.message : null;
  const content = (message && message.content) ?? entry.content;
  return Array.isArray(content) ? content : [];
}

function asInput(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function toolUses(transcriptText) {
  if (typeof transcriptText !== "string" || transcriptText.length === 0) return Object.freeze([]);
  const uses = [];
  for (const line of transcriptText.split("\n")) {
    const entry = parsedEntry(line);
    if (!entry || entry.isSidechain === true) continue;
    for (const block of contentBlocks(entry)) {
      if (!block || typeof block !== "object") continue;
      if (block.type !== "tool_use" || typeof block.name !== "string") continue;
      uses.push(Object.freeze({ name: block.name, input: asInput(block.input) }));
    }
  }
  return Object.freeze(uses);
}

export function canonicalInput(input) {
  const source = asInput(input);
  return JSON.stringify(Object.fromEntries(Object.keys(source).sort().map((key) => [key, source[key]])));
}

export function occurrenceKey(name, input) {
  const source = asInput(input);
  if (name === READ_TOOL) {
    const filePath = source.file_path;
    if (typeof filePath !== "string" || filePath.length === 0) return null;
    return Object.freeze({ kind: KIND_READ, key: `${READ_TOOL} ${path.normalize(filePath)}` });
  }
  if (SEARCH_TOOLS.includes(name)) {
    const pattern = source.pattern;
    if (typeof pattern !== "string" || pattern.length === 0) return null;
    return Object.freeze({ kind: KIND_SEARCH, key: `${name} ${canonicalInput(source)}` });
  }
  return null;
}

export function wentBackOccurrences(transcriptText) {
  const seen = new Set();
  const occurrences = [];
  let briefed = false;
  for (const use of toolUses(transcriptText)) {
    if (use.name === BRIEFING_TOOL) {
      briefed = true;
      continue;
    }
    const occurrence = occurrenceKey(use.name, use.input);
    if (!occurrence) continue;
    if (!seen.has(occurrence.key)) {
      seen.add(occurrence.key);
      continue;
    }
    if (briefed) occurrences.push(occurrence);
  }
  return Object.freeze(occurrences);
}

export function buildWentBackRow(payload, occurrence, ts) {
  if (!occurrence || typeof occurrence !== "object" || typeof occurrence.key !== "string" || typeof occurrence.kind !== "string") {
    throw new TypeError(`went-back: an occurrence must carry a string kind and a string key, got ${JSON.stringify(occurrence)}`);
  }
  const source = payload && typeof payload === "object" ? payload : {};
  return Object.freeze({
    ts,
    subject: WENT_BACK_SUBJECT,
    event: WENT_BACK_EVENT,
    session_id: typeof source.session_id === "string" ? source.session_id : "",
    cwd: typeof source.cwd === "string" ? source.cwd : "",
    went_back_kind: occurrence.kind,
    went_back_signature: [...occurrence.key].slice(0, SIGNATURE_MAX).join(""),
  });
}
