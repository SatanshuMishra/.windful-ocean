#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { root } from "./_ledger.mjs";

const DOMAIN = [
  "schema", "migration", "database", "test", "security", "auth", "performance",
  "latency", "documentation", "review", "research", "debug", "deploy", "pipeline",
  "infra", "frontend", "styling", "accessibility",
];

function firstDomain(text) {
  const t = (text || "").toLowerCase();
  for (const k of DOMAIN) if (t.includes(k)) return k;
  return "general";
}

export function clusterKey(e) {
  if (e.type === "fallback_used") return "fallback:" + firstDomain((e.description || "") + " " + (e.prompt_excerpt || ""));
  if (e.type === "permission_denied") return "perm:" + (e.tool_name || "unknown");
  if (e.type === "capability_blocked") return "cap:" + (e.needed || "unknown");
  return "";
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

function median(a) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function p90(a) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(0.9 * s.length))];
}

export function rebuild(ledgerRoot) {
  const evDir = path.join(ledgerRoot, "events");
  let files = [];
  try {
    files = fs.readdirSync(evDir).filter((f) => f.endsWith(".jsonl")).sort();
  } catch {}
  const gaps = {};
  const runs = {};
  const resolved = new Set();
  for (const f of files) {
    let lines = [];
    try {
      lines = fs.readFileSync(path.join(evDir, f), "utf-8").split("\n");
    } catch {}
    for (const ln of lines) {
      if (!ln.trim()) continue;
      let e;
      try {
        e = JSON.parse(ln);
      } catch {
        continue;
      }
      if (e.type === "gap_resolved") {
        resolved.add(e.gap_id);
        continue;
      }
      if (e.type === "agent_run") {
        const k = e.agent_type || "unknown";
        (runs[k] = runs[k] || []).push(e);
        continue;
      }
      const key = clusterKey(e);
      if (!key) continue;
      const g = (gaps[key] = gaps[key] || {
        cluster_key: key, count: 0, sessions: new Set(), first_seen: e.ts, last_seen: e.ts, evidence_refs: [],
      });
      g.count++;
      g.sessions.add(e.session_id || "");
      g.last_seen = e.ts || g.last_seen;
      if (g.evidence_refs.length < 10) g.evidence_refs.push({ ts: e.ts, type: e.type, session_id: e.session_id || "" });
    }
  }
  const gapsOut = {};
  for (const [key, g] of Object.entries(gaps)) {
    const sessions = [...g.sessions].filter(Boolean);
    const gap_id = "gap-" + hash(key);
    let status = sessions.length >= 3 ? "actionable" : "open";
    if (resolved.has(gap_id)) status = "resolved";
    gapsOut[gap_id] = {
      gap_id, cluster_key: key, status, count: g.count,
      distinct_sessions: sessions.length, first_seen: g.first_seen, last_seen: g.last_seen,
      evidence_refs: g.evidence_refs,
    };
  }
  const baselines = {};
  for (const [k, rs] of Object.entries(runs)) {
    const tc = rs.map((r) => r.tool_calls_total || 0);
    const dr = rs.map((r) => (r.tool_calls_total ? (r.duplicate_tool_calls || 0) / r.tool_calls_total : 0));
    const rr = rs.map((r) => r.redundant_reads || 0);
    const tk = rs.map((r) => r.tokens || 0).filter((x) => x > 0);
    baselines[k] = {
      runs: rs.length,
      median_tool_calls: median(tc), p90_tool_calls: p90(tc),
      median_duplicate_ratio: median(dr), p90_duplicate_ratio: p90(dr),
      median_redundant_reads: median(rr), median_tokens: median(tk),
    };
  }
  const idxDir = path.join(ledgerRoot, "index");
  fs.mkdirSync(idxDir, { recursive: true });
  fs.writeFileSync(path.join(idxDir, "gaps.json"), JSON.stringify(Object.values(gapsOut), null, 2));
  fs.writeFileSync(path.join(idxDir, "agent-baselines.json"), JSON.stringify(baselines, null, 2));
  fs.writeFileSync(
    path.join(idxDir, "checkpoint.json"),
    JSON.stringify({ last_file: files[files.length - 1] || null, rebuilt_at: new Date().toISOString() }, null, 2)
  );
  return { gaps: Object.values(gapsOut), baselines };
}

if (process.argv[1] && process.argv[1].endsWith("agent-ledger-index.mjs")) {
  rebuild(root());
}
