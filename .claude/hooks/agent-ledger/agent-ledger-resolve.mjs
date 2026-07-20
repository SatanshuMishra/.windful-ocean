#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { root, appendEvent } from "./_ledger.mjs";

const KIND = {
  create: "agent_created",
  modify: "agent_modified",
  delete: "agent_deleted",
  merge: "agent_modified",
  split: "agent_created",
};

export function resolve({ gap_id, resolution, agent_refs = [], change_summary = "", notes = "" }) {
  const r = root();
  const kind = KIND[resolution] || "agent_modified";
  for (const name of agent_refs) {
    appendEvent({ type: kind, agent_name: name, change_summary, gap_id });
  }
  appendEvent({ type: "gap_resolved", gap_id, resolution, agent_refs, notes });
  const idx = path.join(r, "index", "gaps.json");
  let gaps = [];
  try {
    gaps = JSON.parse(fs.readFileSync(idx, "utf-8"));
  } catch {}
  const hit = Array.isArray(gaps) ? gaps.find((g) => g.gap_id === gap_id) : null;
  if (hit) {
    hit.status = "resolved";
    fs.writeFileSync(idx, JSON.stringify(gaps, null, 2));
  }
  const gd = path.join(r, "gaps");
  fs.mkdirSync(gd, { recursive: true });
  const md =
    `---\ngap_id: ${gap_id}\nstatus: resolved\nresolution: ${resolution}\n` +
    `agents: ${agent_refs.join(", ")}\n---\n\n${change_summary}\n\n${notes}\n`;
  fs.writeFileSync(path.join(gd, gap_id + ".md"), md);
  return hit || null;
}

if (process.argv[1] && process.argv[1].endsWith("agent-ledger-resolve.mjs")) {
  let a = {};
  try {
    a = JSON.parse(process.argv[2] || "{}");
  } catch {}
  resolve(a);
}
