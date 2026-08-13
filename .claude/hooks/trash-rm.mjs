#!/usr/bin/env node
import { realpathSync, writeSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadConfig } from '../lib/reversibility/config.mjs';
import { rewriteRm } from '../lib/reversibility/rm-rewrite.mjs';

export function decide(payload, config) {
  if (!payload || typeof payload !== 'object' || payload.tool_name !== 'Bash') return null;
  const input = payload.tool_input;
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const { rewritten } = rewriteRm(input.command, config);
  if (rewritten === null) return null;
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      updatedInput: { ...input, command: rewritten },
    },
  };
}

function isMainModule() {
  if (!process.argv[1]) return false;
  if (import.meta.url === pathToFileURL(process.argv[1]).href) return true;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return basename(fileURLToPath(import.meta.url)) === basename(process.argv[1]);
  }
}

async function readStdin(timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('timed out reading stdin')), timeoutMs);
  });
  const read = (async () => {
    let raw = '';
    for await (const chunk of process.stdin) raw += chunk;
    return raw;
  })();
  try {
    return await Promise.race([read, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

if (isMainModule()) {
  try {
    const payload = JSON.parse(await readStdin(3000));
    const output = decide(payload, loadConfig(process.env));
    if (output) process.stdout.write(`${JSON.stringify(output)}\n`);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    writeSync(2, `trash-rm hook could not rewrite this call (${detail}); the original command stands.\n`);
  }
  process.exit(0);
}
