#!/usr/bin/env node
import fs from "node:fs";
import { buildRow, appendRow } from "./_observer.mjs";

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
    appendRow(buildRow(payload));
  } catch {
    return;
  }
}

main();
