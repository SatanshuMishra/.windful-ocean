#!/usr/bin/env node
import fs from "node:fs";
import { appendRows, nowIso, root } from "./_observer.mjs";
import { buildWentBackRow, wentBackOccurrences } from "./went-back.mjs";
import { pruneCorpus } from "./retention.mjs";

function readStdin() {
  try {
    return fs.readFileSync(0, "utf-8");
  } catch {
    return "";
  }
}

function main() {
  try {
    pruneCorpus(root());
  } catch (error) {
    process.stderr.write(`observer: the corpus retention pass failed: ${error.message}\n`);
  }
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
