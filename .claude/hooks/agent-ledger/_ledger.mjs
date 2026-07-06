import os from "node:os";
import path from "node:path";
import fs from "node:fs";

export function root() {
  return process.env.AGENT_LEDGER_DIR || path.join(os.homedir(), ".claude", "agent-ledger");
}

export function now() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function eventsFile() {
  const day = new Date().toISOString().slice(0, 10);
  return path.join(root(), "events", day + ".jsonl");
}

export function appendEvent(obj) {
  if (obj.ts === undefined) obj.ts = now();
  if (obj.schema_version === undefined) obj.schema_version = 1;
  const p = eventsFile();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.appendFileSync(p, JSON.stringify(obj) + "\n");
}
