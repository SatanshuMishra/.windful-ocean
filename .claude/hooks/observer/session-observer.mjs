#!/usr/bin/env node
import fs from "node:fs";
import { appendRows, nowIso } from "./_observer.mjs";
import { buildWentBackRow, wentBackOccurrences } from "./went-back.mjs";

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
  if (typeof payload.agent_id === "string" && payload.agent_id.length > 0) return;
  const transcriptPath = payload.transcript_path;
  if (typeof transcriptPath !== "string" || transcriptPath.length === 0) return;
  try {
    const occurrences = wentBackOccurrences(fs.readFileSync(transcriptPath, "utf-8"));
    if (occurrences.length === 0) return;
    const ts = nowIso();
    appendRows(occurrences.map((occurrence) => buildWentBackRow(payload, occurrence, ts)));
  } catch {
    return;
  }
}

main();
