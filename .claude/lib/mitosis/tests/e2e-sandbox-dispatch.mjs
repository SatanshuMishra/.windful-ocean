import { lstatSync, readFileSync } from 'node:fs';
import { spawn as nodeSpawn } from 'node:child_process';
import { delimiter, isAbsolute, join } from 'node:path';
import { dispatch as dispatchReal } from '../dispatch.mjs';
import { FAKE_CLAUDE_CONTENT_MARKER, FAKE_ENV_KEYS } from './e2e-fake-bin.mjs';

function requireSandboxCondition(condition, tag, detail) {
  if (condition) return;
  throw new Error(`e2e-sandbox-dispatch: refusing to spawn a real binary — condition "${tag}" failed: ${detail}`);
}

function fakeClaudeContentCheck(fakeClaudePath) {
  let stats;
  try {
    stats = lstatSync(fakeClaudePath);
  } catch (error) {
    return { ok: false, reason: `${fakeClaudePath} does not exist on disk, so PATH is not pinned to a sandbox carrying a fake claude: ${error.message}` };
  }
  if (stats.isSymbolicLink()) {
    return { ok: false, reason: `${fakeClaudePath} is a symbolic link, so it cannot be trusted to be the sandbox-written fake claude rather than a real binary reached through the link` };
  }
  if (!stats.isFile()) {
    return { ok: false, reason: `${fakeClaudePath} is not a regular file, so it is not the sandbox-written fake claude` };
  }
  let content;
  try {
    content = readFileSync(fakeClaudePath, 'utf8');
  } catch (error) {
    return { ok: false, reason: `${fakeClaudePath} could not be read: ${error.message}` };
  }
  if (!content.includes(FAKE_CLAUDE_CONTENT_MARKER)) {
    return { ok: false, reason: `${fakeClaudePath} does not carry the sandbox fake-claude marker ${JSON.stringify(FAKE_CLAUDE_CONTENT_MARKER)} in its content, so it is not the sandbox-written fake claude` };
  }
  return { ok: true, reason: null };
}

function assertSandboxPinnedOptions(binary, options) {
  requireSandboxCondition(options !== null && typeof options === 'object', 'options-object', `spawn options for ${JSON.stringify(binary)} is not a non-null object`);
  requireSandboxCondition(options.env !== null && typeof options.env === 'object', 'env-object', `options.env for ${JSON.stringify(binary)} is not a non-null object`);
  requireSandboxCondition(
    typeof options.env.PATH === 'string' && options.env.PATH.length > 0 && isAbsolute(options.env.PATH),
    'path-absolute',
    `options.env.PATH is not a non-empty absolute path, received ${JSON.stringify(options.env.PATH)}`,
  );
  requireSandboxCondition(
    !options.env.PATH.includes(delimiter),
    'path-pinned',
    `options.env.PATH carries more than one directory (${JSON.stringify(options.env.PATH)}), so the resolved binary is not pinned to a single sandboxed directory`,
  );
  requireSandboxCondition(
    typeof options.env[FAKE_ENV_KEYS.claudeRecord] === 'string' && options.env[FAKE_ENV_KEYS.claudeRecord].length > 0,
    'claude-record-key',
    `options.env.${FAKE_ENV_KEYS.claudeRecord} is not a non-empty string, so this environment does not carry the sandbox's claude recorder`,
  );
  const fakeClaudePath = join(options.env.PATH, 'claude');
  const checked = fakeClaudeContentCheck(fakeClaudePath);
  requireSandboxCondition(checked.ok, 'fake-claude-content', checked.reason);
}

export function sandboxPinnedSpawn(binary, argv, options) {
  assertSandboxPinnedOptions(binary, options);
  return nodeSpawn(binary, argv, options);
}

export function sandboxedDispatch() {
  return Object.freeze({
    dispatch: (request) => dispatchReal(request, { spawn: sandboxPinnedSpawn }),
  });
}
