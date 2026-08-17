import os from "node:os";
import path from "node:path";
import fs from "node:fs";

export const SUBJECT = "agent";
export const APPEND_FLAG = "a";
export const AGENT_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
export const TS_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
export const STOP_EVENT = "SubagentStop";
export const CAPABILITY_EVENT = "capability_blocked";
export const FROM_PAYLOAD = "last_assistant_message";
export const FROM_TRANSCRIPT = "agent_transcript_path";
export const TAIL_BYTES = 1024 * 1024;
export const FIELD_MAX = 300;

const MARKER_PATTERN = /CAPABILITY-BLOCKED:[^\S\n]*needed=(.+?)[^\S\n]+task=([^\n]*)/;
const PLACEHOLDER_PATTERN = /^<[^>]*>$/;

export function root() {
  return process.env.CLAUDE_OBSERVER_DIR || path.join(os.homedir(), ".claude", "observer");
}

export function nowIso() {
  return new Date().toISOString();
}

export function eventsFile(ts) {
  if (typeof ts !== "string" || !TS_PATTERN.test(ts)) {
    throw new TypeError(`observer: ts must be RFC3339 UTC with milliseconds, got ${String(ts)}`);
  }
  return path.join(root(), "events", ts.slice(0, 7) + ".jsonl");
}

export function sidecarPath(transcriptPath, agentId) {
  if (typeof transcriptPath !== "string" || !transcriptPath.endsWith(".jsonl")) return null;
  if (!path.isAbsolute(transcriptPath) || path.normalize(transcriptPath) !== transcriptPath) return null;
  if (typeof agentId !== "string" || !AGENT_ID_PATTERN.test(agentId)) return null;
  const base = transcriptPath.slice(0, -".jsonl".length);
  return path.join(base, "subagents", `agent-${agentId}.meta.json`);
}

export function readSidecar(transcriptPath, agentId) {
  const target = sidecarPath(transcriptPath, agentId);
  if (!target) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(target, "utf-8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

function asString(value) {
  return typeof value === "string" ? value : "";
}

function asStringOrNull(value) {
  return typeof value === "string" && value ? value : null;
}

function asIntegerOrNull(value) {
  return Number.isInteger(value) ? value : null;
}

export function buildRow(payload, ts = nowIso(), sidecar = null) {
  const source = payload && typeof payload === "object" ? payload : {};
  const meta = sidecar || readSidecar(source.transcript_path, source.agent_id);
  return {
    ts,
    subject: SUBJECT,
    event: asString(source.hook_event_name),
    session_id: asString(source.session_id),
    cwd: asString(source.cwd),
    agent_id: asString(source.agent_id),
    agent_type: asStringOrNull(meta.agentType) ?? asStringOrNull(source.agent_type),
    agent_transcript_path: asStringOrNull(source.agent_transcript_path),
    parent_agent_id: asStringOrNull(meta.parentAgentId),
    depth: asIntegerOrNull(meta.spawnDepth),
  };
}

export function markerFrom(text) {
  if (typeof text !== "string" || !text) return null;
  const matched = text.match(MARKER_PATTERN);
  if (!matched) return null;
  const needed = matched[1].trim();
  if (!needed || PLACEHOLDER_PATTERN.test(needed)) return null;
  const task = matched[2].trim();
  return { needed: needed.slice(0, FIELD_MAX), task: task ? task.slice(0, FIELD_MAX) : null };
}

function assistantText(entry) {
  if (!entry || typeof entry !== "object") return "";
  const message = entry.message && typeof entry.message === "object" ? entry.message : null;
  const role = (message && message.role) || entry.role;
  if (role !== "assistant") return "";
  const content = (message && message.content) ?? entry.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block) => block && block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n");
}

export function tailAssistantText(file) {
  if (typeof file !== "string" || !file) return "";
  let fd = null;
  try {
    fd = fs.openSync(file, "r");
    const size = fs.fstatSync(fd).size;
    if (!size) return "";
    const start = size > TAIL_BYTES ? size - TAIL_BYTES : 0;
    const length = size - start;
    const buffer = Buffer.allocUnsafe(length);
    const read = fs.readSync(fd, buffer, 0, length, start);
    const lines = buffer.toString("utf-8", 0, read).split("\n").slice(1);
    for (let i = lines.length - 1; i >= 0; i--) {
      if (!lines[i].trim()) continue;
      let entry;
      try {
        entry = JSON.parse(lines[i]);
      } catch {
        continue;
      }
      const text = assistantText(entry);
      if (text.trim()) return text;
    }
    return "";
  } catch {
    return "";
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        void 0;
      }
    }
  }
}

export function detectCapabilityBlocked(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  if (source.hook_event_name !== STOP_EVENT) return null;
  try {
    const fromPayload = markerFrom(source.last_assistant_message);
    if (fromPayload) return { ...fromPayload, detected_from: FROM_PAYLOAD };
    const fromTranscript = markerFrom(tailAssistantText(source.agent_transcript_path));
    if (fromTranscript) return { ...fromTranscript, detected_from: FROM_TRANSCRIPT };
    return null;
  } catch {
    return null;
  }
}

export function buildCapabilityRow(payload, detection, ts = nowIso(), sidecar = null) {
  return {
    ...buildRow(payload, ts, sidecar),
    event: CAPABILITY_EVENT,
    needed: detection.needed,
    task: detection.task,
    detected_from: detection.detected_from,
  };
}

export function appendRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const target = eventsFile(rows[0].ts);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.appendFileSync(target, rows.map((row) => JSON.stringify(row) + "\n").join(""), { flag: APPEND_FLAG });
  return target;
}

export function appendRow(row) {
  return appendRows([row]);
}
