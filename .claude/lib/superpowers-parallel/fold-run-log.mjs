#!/usr/bin/env node
import { readFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { foldRunManifest } from './run-log.mjs';

export function foldFile(path) {
  if (typeof path !== 'string' || path.length === 0) return null;
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return null;
  }
  return foldRunManifest(raw);
}

function main() {
  const path = process.argv[2];
  if (typeof path !== 'string' || path.length === 0) {
    process.stderr.write('usage: fold-run-log.mjs <run.json>\n');
    process.exit(2);
  }
  const manifest = foldFile(path);
  if (manifest === null) {
    process.exit(1);
  }
  process.stdout.write(JSON.stringify(manifest) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) main();
