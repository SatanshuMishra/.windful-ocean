#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readPayload } from '../lib/permission-gate/payload.mjs';
import { decide, BLOCK } from '../lib/permission-gate/decide.mjs';

const STDIN_TIMEOUT_MS = 3000;

const DENY = 'deny';

const ALLOW_DECISION = 'allow';

function isMainModule() {
  if (!process.argv[1]) return false;
  if (import.meta.url === pathToFileURL(process.argv[1]).href) return true;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return basename(fileURLToPath(import.meta.url)) === basename(process.argv[1]);
  }
}

export function emit(decision, reason) {
  return `${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: decision === BLOCK ? DENY : ALLOW_DECISION,
      permissionDecisionReason: reason,
    },
  })}\n`;
}

async function readStdin(timeoutMs) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('timed out reading the hook payload')), timeoutMs);
  });
  const read = (async () => {
    let raw = '';
    for await (const chunk of process.stdin) raw += chunk;
    return raw;
  })();
  try {
    return await Promise.race([read, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function run(readInput = () => readStdin(STDIN_TIMEOUT_MS)) {
  let raw = '';
  try {
    raw = await readInput();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return emit(BLOCK, `the permission gate could not read the tool call (${detail}), so the credential-egress, resource and remote-state predicates could not be evaluated`);
  }
  const parsed = readPayload(raw);
  if (!parsed.ok) {
    return emit(BLOCK, `the permission gate could not read the tool call (${parsed.error}), so the credential-egress, resource and remote-state predicates could not be evaluated`);
  }
  try {
    const result = decide(parsed.payload);
    return emit(result.decision, result.reason);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return emit(BLOCK, `the permission gate faulted before reaching a decision (${detail})`);
  }
}

if (isMainModule()) {
  process.stdout.write(await run());
  process.exit(0);
}
