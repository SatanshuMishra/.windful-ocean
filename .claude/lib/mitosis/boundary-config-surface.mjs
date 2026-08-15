import { join as pathJoin } from 'node:path';
import { sideRelativeFile, within } from './boundary-scan-scope.mjs';

export const ANCHOR_CHOOSE = 'choose';
export const ANCHOR_FIXED = 'fixed';

export function choosingAnchor(otherRoot) {
  return Object.freeze({ kind: ANCHOR_CHOOSE, otherRoot });
}

export function fixedAnchor(relativePath) {
  return Object.freeze({ kind: ANCHOR_FIXED, relative: relativePath });
}

function failureText(error, fallback) {
  return error && error.message ? error.message : fallback;
}

function cleanlyRan(result) {
  return result !== null && typeof result === 'object'
    && result.outcome === 'completed'
    && typeof result.status === 'number'
    && typeof result.stdout === 'string'
    && typeof result.stderr === 'string';
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function collectResolvedConfigJson(root, argv, io, side, label) {
  let result;
  try {
    result = io.run('node', argv, { cwd: root });
  } catch (error) {
    return { ok: false, error: `${label} could not be collected on ${side} (${root}): ${failureText(error, 'unknown spawn failure')}` };
  }
  if (!cleanlyRan(result) || result.status !== 0) {
    return {
      ok: false,
      error: `${label} could not be collected on ${side} (${root}): it exited ${JSON.stringify(cleanlyRan(result) ? result.status : null)} rather than 0; its stderr was ${JSON.stringify(result === null || result === undefined ? null : result.stderr)}`,
    };
  }
  try {
    return { ok: true, parsed: JSON.parse(result.stdout) };
  } catch (error) {
    return { ok: false, error: `${label} on ${side} (${root}) could not be parsed: it printed text that is not JSON (${failureText(error, 'unknown parse failure')})` };
  }
}

export function collectTsconfigOptions(root, bin, io, side) {
  const label = "tsc's resolved config (--showConfig)";
  const collected = collectResolvedConfigJson(root, [bin, '--showConfig', '--project', root], io, side, label);
  if (!collected.ok) return collected;
  const { parsed } = collected;
  if (!isPlainObject(parsed) || !isPlainObject(parsed.compilerOptions)) {
    return { ok: false, error: `${label} on ${side} (${root}) could not be collected: it printed ${JSON.stringify(parsed)}, which carries no compilerOptions object` };
  }
  return { ok: true, tsconfigOptions: parsed.compilerOptions };
}

export function resolveEslintAnchor(files, root, anchor, io, side) {
  if (anchor === null || typeof anchor !== 'object') {
    return { ok: false, error: `eslint's resolved config could not be anchored on ${side} (${root}): it was handed ${JSON.stringify(anchor)} rather than an anchor policy, and each side picking its own first file lets the two print the config for different files` };
  }
  if (anchor.kind === ANCHOR_FIXED) {
    if (typeof anchor.relative !== 'string' || anchor.relative.length === 0) {
      return { ok: false, error: `eslint's resolved config could not be anchored on ${side} (${root}): the anchor it was told to print is ${JSON.stringify(anchor.relative)} rather than a root-relative path` };
    }
    return { ok: true, relative: anchor.relative };
  }
  if (anchor.kind !== ANCHOR_CHOOSE || typeof anchor.otherRoot !== 'string' || anchor.otherRoot.length === 0) {
    return { ok: false, error: `eslint's resolved config could not be anchored on ${side} (${root}): the anchor policy ${JSON.stringify(anchor)} is neither ${ANCHOR_FIXED} nor ${ANCHOR_CHOOSE} against a named other root` };
  }
  const candidates = [...new Set(files.map((file) => sideRelativeFile(file, root)))].filter((relativePath) => relativePath.length > 0).sort();
  const chosen = candidates.find((relativePath) => !within(root, relativePath).escapes && io.exists(pathJoin(anchor.otherRoot, relativePath)));
  if (chosen === undefined) {
    return { ok: false, error: `eslint's resolved config could not be anchored on ${side} (${root}): none of the ${candidates.length} file(s) eslint linted here is present under ${anchor.otherRoot}, so the two sides would print the config for different files` };
  }
  return { ok: true, relative: chosen };
}

export function collectEslintConfig(root, bin, io, files, side, anchor) {
  if (files.length === 0) {
    return { ok: false, error: `eslint's resolved config could not be collected on ${side} (${root}): eslint reported zero files, so there is no candidate file to print the config for` };
  }
  const resolved = resolveEslintAnchor(files, root, anchor, io, side);
  if (!resolved.ok) return resolved;
  const contained = within(root, resolved.relative);
  if (contained.escapes) {
    return { ok: false, error: `eslint's resolved config could not be collected on ${side} (${root}): the anchor ${JSON.stringify(resolved.relative)} resolves to ${contained.path}, outside the worktree root` };
  }
  const label = `eslint's resolved config (--print-config ${resolved.relative})`;
  const collected = collectResolvedConfigJson(root, [bin, '--print-config', contained.path], io, side, label);
  if (!collected.ok) return collected;
  const { parsed } = collected;
  if (!isPlainObject(parsed) || !isPlainObject(parsed.rules)) {
    return { ok: false, error: `${label} on ${side} (${root}) could not be collected: it printed ${JSON.stringify(parsed)}, which carries no rules object` };
  }
  return { ok: true, eslintConfig: Object.freeze({ rules: parsed.rules }), eslintConfigFile: resolved.relative };
}
