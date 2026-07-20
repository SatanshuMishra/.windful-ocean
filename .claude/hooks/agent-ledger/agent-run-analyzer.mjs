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
    capBlocked = null,
    prevHash = null;
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
      if (b && b.type === "text" && typeof b.text === "string") {
        const m = b.text.match(/CAPABILITY-BLOCKED:\s*needed=(\S+)\s+task=(.*)/);
        if (m) capBlocked = { needed: m[1], task: m[2].slice(0, 300) };
      }
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
