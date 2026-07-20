#!/usr/bin/env node
export function verdict({ recurrenceCount = 0, distinctReasonToChange = false, clearerRouting = false } = {}) {
  if (recurrenceCount < 3) return "reject";
  if (distinctReasonToChange && clearerRouting) return "create";
  return "extend";
}

if (process.argv[1] && process.argv[1].endsWith("agent-roster-gate.mjs")) {
  let a = {};
  try {
    a = JSON.parse(process.argv[2] || "{}");
  } catch {}
  process.stdout.write(verdict(a) + "\n");
}
