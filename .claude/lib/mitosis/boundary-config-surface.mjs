import { join as pathJoin } from 'node:path';
import { sideRelativeFile, within } from './boundary-scan-scope.mjs';

export const SCOPE_CHOOSE = 'choose';
export const SCOPE_FIXED = 'fixed';

export function choosingScope(otherRoot) {
  return Object.freeze({ kind: SCOPE_CHOOSE, otherRoot });
}

export function fixedScope(relativePaths) {
  return Object.freeze({ kind: SCOPE_FIXED, relatives: Object.freeze([...relativePaths]) });
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

export function resolveEslintScope(files, root, scope, io, side) {
  if (scope === null || typeof scope !== 'object') {
    return { ok: false, error: `eslint's resolved config could not be scoped on ${side} (${root}): it was handed ${JSON.stringify(scope)} rather than a scope policy, and each side picking its own file set lets the two resolve the config for different files` };
  }
  const linted = [...new Set(files.map((file) => sideRelativeFile(file, root)))]
    .filter((relativePath) => relativePath.length > 0 && !within(root, relativePath).escapes)
    .sort();
  if (scope.kind === SCOPE_FIXED) {
    if (!Array.isArray(scope.relatives) || scope.relatives.some((relativePath) => typeof relativePath !== 'string' || relativePath.length === 0)) {
      return { ok: false, error: `eslint's resolved config could not be scoped on ${side} (${root}): the file set it was told to resolve is ${JSON.stringify(scope.relatives)} rather than a list of root-relative paths` };
    }
    const chosen = [...new Set(scope.relatives)].filter((relativePath) => linted.includes(relativePath)).sort();
    if (chosen.length === 0) {
      return { ok: false, error: `eslint's resolved config could not be scoped on ${side} (${root}): none of the ${scope.relatives.length} file(s) the other side resolved the config for is among the ${linted.length} file(s) eslint lints here, so the two sides would resolve the config for different files` };
    }
    return { ok: true, relatives: Object.freeze(chosen) };
  }
  if (scope.kind !== SCOPE_CHOOSE || typeof scope.otherRoot !== 'string' || scope.otherRoot.length === 0) {
    return { ok: false, error: `eslint's resolved config could not be scoped on ${side} (${root}): the scope policy ${JSON.stringify(scope)} is neither ${SCOPE_FIXED} nor ${SCOPE_CHOOSE} against a named other root` };
  }
  const chosen = linted.filter((relativePath) => io.exists(pathJoin(scope.otherRoot, relativePath)));
  if (chosen.length === 0) {
    return { ok: false, error: `eslint's resolved config could not be scoped on ${side} (${root}): none of the ${linted.length} file(s) eslint linted here is present under ${scope.otherRoot}, so the two sides would resolve the config for different files` };
  }
  return { ok: true, relatives: Object.freeze(chosen) };
}

export function collectEslintConfig(root, bin, io, files, side, scope) {
  if (files.length === 0) {
    return { ok: false, error: `eslint's resolved config could not be collected on ${side} (${root}): eslint reported zero files, so there is no candidate file to print the config for` };
  }
  const resolved = resolveEslintScope(files, root, scope, io, side);
  if (!resolved.ok) return resolved;
  const byFile = {};
  for (const relativePath of resolved.relatives) {
    const contained = within(root, relativePath);
    if (contained.escapes) {
      return { ok: false, error: `eslint's resolved config could not be collected on ${side} (${root}): the file ${JSON.stringify(relativePath)} resolves to ${contained.path}, outside the worktree root` };
    }
    const label = `eslint's resolved config (--print-config ${relativePath})`;
    const collected = collectResolvedConfigJson(root, [bin, '--print-config', contained.path], io, side, label);
    if (!collected.ok) return collected;
    const { parsed } = collected;
    if (!isPlainObject(parsed) || !isPlainObject(parsed.rules)) {
      return { ok: false, error: `${label} on ${side} (${root}) could not be collected: it printed ${JSON.stringify(parsed)}, which carries no rules object` };
    }
    byFile[relativePath] = Object.freeze({ rules: parsed.rules });
  }
  return { ok: true, eslintConfigByFile: Object.freeze(byFile), eslintConfigFiles: Object.freeze([...resolved.relatives]) };
}
