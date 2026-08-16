import { realpathSync, writeSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const BLOCKED_WORKFLOW_NAMES = Object.freeze(['mitosis-execute', 'mitosis']);
const SCRIPT_BASENAME_PATTERN = /(^|[\\/])([^\\/]+)\.[mc]?js$/;
const BLOCK_REASON = 'Mitosis must not be invoked through the Workflow tool. mitosis-execute was never a direct entry point, and mitosis.js is retired in favour of an OS process. Run /mitosis, which invokes node .claude/lib/mitosis/cli.mjs through Bash.';

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function scriptBasename(scriptPath) {
  const matched = SCRIPT_BASENAME_PATTERN.exec(scriptPath);
  return matched === null ? '' : matched[2];
}

export function decide(payload) {
  if (!payload || payload.tool_name !== 'Workflow') {
    return { block: false, reason: '' };
  }
  const input = payload.tool_input || {};
  const byName = BLOCKED_WORKFLOW_NAMES.includes(normalize(input.name));
  const byPath = BLOCKED_WORKFLOW_NAMES.includes(scriptBasename(normalize(input.scriptPath)));
  if (byName || byPath) {
    return { block: true, reason: BLOCK_REASON };
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
