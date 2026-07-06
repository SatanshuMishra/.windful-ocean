const ENGINE_NAME = 'parallel-plan-execution';

export function decide(payload) {
  if (!payload || payload.tool_name !== 'Workflow') {
    return { block: false, reason: '' };
  }
  const input = payload.tool_input || {};
  const byName = input.name === ENGINE_NAME;
  const byPath = typeof input.scriptPath === 'string' && /(^|\/)parallel-plan-execution\.js$/.test(input.scriptPath);
  if (byName || byPath) {
    return {
      block: true,
      reason: 'The parallel-plan-execution engine must be invoked only by workflows/mitosis.js via the in-script workflow() hook, never directly through the Workflow tool. Run /mitosis instead.',
    };
  }
  return { block: false, reason: '' };
}

async function main() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  let payload = {};
  try {
    payload = JSON.parse(raw || '{}');
  } catch {
    process.exit(0);
  }
  const { block, reason } = decide(payload);
  if (block) {
    process.stderr.write(reason + '\n');
    process.exit(2);
  }
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
