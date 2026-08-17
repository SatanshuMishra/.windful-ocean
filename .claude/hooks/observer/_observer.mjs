import os from "node:os";
import path from "node:path";
import fs from "node:fs";

export const SUBJECT = "agent";
export const APPEND_FLAG = "a";
export const AGENT_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
export const TS_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

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

export function appendRow(row) {
  const target = eventsFile(row.ts);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.appendFileSync(target, JSON.stringify(row) + "\n", { flag: APPEND_FLAG });
  return target;
}
