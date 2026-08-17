#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { detectCapabilityBlocked, STOP_EVENT } from "./_observer.mjs";

export function transcriptsUnder(dir) {
  const found = [];
  const pending = [dir];
  while (pending.length) {
    const current = pending.shift();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(full);
      else if (entry.isFile() && entry.name.endsWith(".jsonl")) found.push(full);
    }
  }
  return found.sort();
}

export function replay(dir) {
  const files = transcriptsUnder(dir);
  const detected = [];
  for (const file of files) {
    const hit = detectCapabilityBlocked({ hook_event_name: STOP_EVENT, agent_transcript_path: file });
    if (hit) detected.push({ file, ...hit });
  }
  return { scanned: files.length, detected };
}

function main() {
  const dir = process.argv[2];
  if (!dir) {
    process.stderr.write("usage: capability-replay.mjs <transcript-directory>\n");
    process.exitCode = 2;
    return;
  }
  const result = replay(dir);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
