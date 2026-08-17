#!/usr/bin/env node
import fs from "node:fs";
import {
  buildRow,
  buildCapabilityRow,
  appendRows,
  detectCapabilityBlocked,
  nowIso,
  readSidecar,
} from "./_observer.mjs";

function readStdin() {
  try {
    return fs.readFileSync(0, "utf-8");
  } catch {
    return "";
  }
}

function main() {
  let payload;
  try {
    payload = JSON.parse(readStdin());
  } catch {
    return;
  }
  if (!payload || typeof payload !== "object") return;
  try {
    const ts = nowIso();
    const sidecar = readSidecar(payload.transcript_path, payload.agent_id);
    const detection = detectCapabilityBlocked(payload);
    const rows = [buildRow(payload, ts, sidecar)];
    if (detection) rows.push(buildCapabilityRow(payload, detection, ts, sidecar));
    appendRows(rows);
  } catch {
    return;
  }
}

main();
