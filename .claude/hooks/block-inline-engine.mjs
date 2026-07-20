import { realpathSync, writeSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ENGINE_NAME = 'parallel-plan-execution';

export function decide(payload) {
  if (!payload || payload.tool_name !== 'Workflow') {
    return { block: false, reason: '' };
  }
  const input = payload.tool_input || {};
  const byName = String(input.name || '').trim().toLowerCase() === ENGINE_NAME;
  const byPath = /(^|[\\/])parallel-plan-execution\.[mc]?js$/.test(String(input.scriptPath || '').trim().toLowerCase());
  if (byName || byPath) {
    return {
      block: true,
      reason: 'The parallel-plan-execution engine must be invoked only by workflows/mitosis.js via the in-script workflow() hook, never directly through the Workflow tool. Run /mitosis instead.',
    };
  }
  return { block: false, reason: '' };
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

async function main() {
  const raw = await readStdin(3000);
  const payload = JSON.parse(raw);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('non-object hook payload');
  }
  const { block, reason } = decide(payload);
  if (block) {
    writeSync(2, reason + '\n');
    process.exit(2);
  }
  process.exit(0);
}

if (isMainModule()) {
  try {
    await main();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    writeSync(2, `block-inline-engine hook failed to decide (${detail}); blocking this Workflow call. If this persists, fix or unregister the hook in settings.json (PreToolUse, matcher "Workflow").\n`);
    process.exit(2);
  }
}
