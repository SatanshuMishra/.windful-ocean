#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkRun } from './continuity.mjs';

function main() {
  const result = checkRun({ argv: process.argv.slice(2), env: process.env });
  if (result.message !== null) process.stderr.write(`${result.message}\n`);
  process.exitCode = result.code;
}

export function isDirectInvocation() {
  try {
    if (!process.argv[1]) return false;
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isDirectInvocation()) {
  main();
}
