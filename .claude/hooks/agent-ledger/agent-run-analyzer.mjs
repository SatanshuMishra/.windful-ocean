#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { appendEvent } from "./_ledger.mjs";

function readStdin() {
  try {
    return fs.readFileSync(0, "utf-8");
  } catch {
    return "";
  }
}

const MARKER_PATTERN = /CAPABILITY-BLOCKED:[^\S\n]*needed=(.+?)[^\S\n]+task=([^\n]*)/;
const PLACEHOLDER_PATTERN = /^<[^>]*>$/;

function markerFrom(text) {
  if (typeof text !== "string" || !text) return null;
  const m = text.match(MARKER_PATTERN);
  if (!m) return null;
  const needed = m[1].trim();
  const task = m[2].trim();
  if (!needed || PLACEHOLDER_PATTERN.test(needed)) return null;
  return { needed: needed.slice(0, 300), task: task.slice(0, 300) };
}

function textBlocks(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((b) => b && b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("\n");
}

function finalAssistantText(file) {
  if (typeof file !== "string" || !file) return "";
  let raw;
  try {
    raw = fs.readFileSync(file, "utf-8");
  } catch {
    return "";
  }
  const lines = raw.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].trim()) continue;
    let msg;
    try {
      msg = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    if (!msg || typeof msg !== "object") continue;
    const role = (msg.message && msg.message.role) || msg.role;
    if (role !== "assistant") continue;
    const text = textBlocks((msg.message && msg.message.content) || msg.content);
    if (text.trim()) return text;
  }
  return "";
}

function detectCapabilityBlocked(d) {
  try {
    return markerFrom(d.last_assistant_message) || markerFrom(finalAssistantText(d.agent_transcript_path));
  } catch {
    return null;
  }
}

function main() {
  if (process.env.AGENT_LEDGER_SUPPRESS) return;
  let d;
  try {
    d = JSON.parse(readStdin());
  } catch {
    return;
  }
  const tpath = d.transcript_path || "";
  const base = {
    session_id: d.session_id || "",
    cwd: d.cwd || "",
    project: path.basename(d.cwd || ""),
    emitter: "main",
    agent_type: d.agent_type || "unknown",
  };
  let lines = [];
  try {
    lines = fs.readFileSync(tpath, "utf-8").split("\n");
  } catch {
    lines = [];
  }
  let toolCalls = 0,
    dup = 0,
    retry = 0,
    redundantReads = 0,
    tokens = 0,
    sawTokens = false,
    prevHash = null;
  const capBlocked = detectCapabilityBlocked(d);
  const seen = new Map();
  const reads = new Map();
  for (const ln of lines) {
    if (!ln.trim()) continue;
    let msg;
    try {
      msg = JSON.parse(ln);
    } catch {
      continue;
    }
    const content = (msg.message && msg.message.content) || msg.content || [];
    const usage = (msg.message && msg.message.usage) || msg.usage;
    if (usage) {
      sawTokens = true;
      tokens += (usage.input_tokens || 0) + (usage.output_tokens || 0);
    }
    if (!Array.isArray(content)) continue;
    for (const b of content) {
      if (b && b.type === "tool_use") {
        toolCalls++;
        const h = b.name + ":" + JSON.stringify(b.input || {});
        seen.set(h, (seen.get(h) || 0) + 1);
        if (seen.get(h) > 1) dup++;
        if (prevHash === h) retry++;
        prevHash = h;
        if (b.name === "Read") {
          const fp = (b.input && b.input.file_path) || "";
          if (fp) {
            reads.set(fp, (reads.get(fp) || 0) + 1);
            if (reads.get(fp) > 1) redundantReads++;
          }
        }
      }
    }
  }
  appendEvent({
    ...base,
    type: "agent_run",
    tool_calls_total: toolCalls,
    duplicate_tool_calls: dup,
    retry_loops: retry,
    redundant_reads: redundantReads,
    tokens: sawTokens ? tokens : null,
    duration_ms: null,
    transcript_ptr: tpath,
    outcome: null,
  });
  if (capBlocked) {
    appendEvent({ ...base, type: "capability_blocked", needed: capBlocked.needed, task_excerpt: capBlocked.task });
  }
}

main();
