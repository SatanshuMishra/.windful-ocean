import { COUPLING_RISK_MARKERS } from './coupling-review.mjs';

export function normalizePath(p) { return p.replace(/^\.\//, '').replace(/\/+$/, ''); }
export const GLOB_MAX_LENGTH = 1024;
export const GLOB_MAX_WILDCARDS = 8;
function tokenizeGlob(glob) {
  const tokens = [];
  let index = 0;
  while (index < glob.length) {
    const char = glob[index];
    if (char === '*' && glob[index + 1] === '*') { tokens.push({ kind: 'globstar' }); index += 2; continue; }
    if (char === '*') { tokens.push({ kind: 'star' }); index += 1; continue; }
    if (char === '?') { tokens.push({ kind: 'anyChar' }); index += 1; continue; }
    tokens.push({ kind: 'literal', char }); index += 1;
  }
  return tokens;
}
function matchGlobTokens(tokens, text) {
  const end = text.length;
  let suffixMatches = Array.from({ length: end + 1 }, (_, at) => at === end);
  for (let token = tokens.length - 1; token >= 0; token -= 1) {
    const { kind, char } = tokens[token];
    const row = new Array(end + 1);
    for (let at = end; at >= 0; at -= 1) {
      if (kind === 'star') row[at] = suffixMatches[at] || (at < end && text[at] !== '/' && row[at + 1]);
      else if (kind === 'globstar') row[at] = suffixMatches[at] || (at < end && row[at + 1]);
      else if (kind === 'anyChar') row[at] = at < end && text[at] !== '/' && suffixMatches[at + 1];
      else row[at] = at < end && text[at] === char && suffixMatches[at + 1];
    }
    suffixMatches = row;
  }
  return suffixMatches[0];
}
export function globMatches(glob, path) {
  if (typeof glob !== 'string') throw new TypeError(`glob must be a string, got ${typeof glob}`);
  if (glob.length > GLOB_MAX_LENGTH) throw new RangeError(`glob length ${glob.length} exceeds the maximum of ${GLOB_MAX_LENGTH}`);
  const wildcardCount = (glob.match(/[*?]/g) || []).length;
  if (wildcardCount > GLOB_MAX_WILDCARDS) throw new RangeError(`glob wildcard count ${wildcardCount} exceeds the maximum of ${GLOB_MAX_WILDCARDS}`);
  if (typeof path !== 'string') throw new TypeError(`path must be a string, got ${typeof path}`);
  return matchGlobTokens(tokenizeGlob(glob), path);
}
export function scopeCovers(scope, path) {
  const ns = normalizePath(scope);
  const np = normalizePath(path);
  if (/[*?]/.test(ns)) return globMatches(ns, np);
  return ns === np || np.startsWith(ns + '/');
}

export const COARSE_SCOPE_FILE_THRESHOLD = 3;
const SCOPE_NAMED_FILE_RE = /[\w][\w./-]*\.[A-Za-z][A-Za-z0-9]{0,5}/g;
export function scopeDirPrefix(scope) {
  const star = scope.search(/[*?]/);
  return normalizePath(star === -1 ? scope : scope.slice(0, star));
}
export function scopeIsSpecificFile(scope) {
  if (typeof scope !== 'string' || /[*?]/.test(scope)) return false;
  const base = normalizePath(scope).split('/').pop();
  return /\.[A-Za-z][A-Za-z0-9]{0,5}$/.test(base);
}
export function scopeIsBareTopLevelDir(scope) {
  if (typeof scope !== 'string' || scopeIsSpecificFile(scope)) return false;
  const prefix = scopeDirPrefix(scope);
  return prefix !== '' && !prefix.includes('/');
}
export function namedFilesInText(text) {
  if (typeof text !== 'string') return [];
  const out = new Set();
  for (const raw of text.match(SCOPE_NAMED_FILE_RE) || []) {
    const t = normalizePath(raw);
    const base = t.split('/').pop();
    if (base.lastIndexOf('.') >= 2 || t.includes('/')) out.add(t);
  }
  return [...out];
}
export function isFileScopePack(value) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Array.isArray(value.edit) && value.edit.every((p) => typeof p === 'string')
    && Array.isArray(value.read) && value.read.every((p) => typeof p === 'string')
    && Object.hasOwn(value, 'truncated');
}

export function fileScopeEdit(fileScope) {
  return isFileScopePack(fileScope) ? fileScope.edit : [];
}

const SENSITIVE_SCOPE_GLOBS = ['*.sql', '**/*.sql', '.github/workflows'];
const SENSITIVE_SCOPE_KEYWORD_RE = new RegExp('(^|/)(?:' + COUPLING_RISK_MARKERS.join('|') + ')', 'i');

export function sensitiveScope(fileScope) {
  if (!Array.isArray(fileScope)) return false;
  return fileScope.some((raw) => {
    if (typeof raw !== 'string') return false;
    const p = normalizePath(raw);
    if (SENSITIVE_SCOPE_GLOBS.some((g) => scopeCovers(g, p))) return true;
    return SENSITIVE_SCOPE_KEYWORD_RE.test(p);
  });
}

export function lintCoarseScope(task, opts) {
  const threshold = opts && Number.isInteger(opts.fileThreshold) ? opts.fileThreshold : COARSE_SCOPE_FILE_THRESHOLD;
  const fileScope = fileScopeEdit(task && task.fileScope);
  const named = namedFilesInText([task && task.fullText, task && task.title, task && task.rationale].filter((t) => typeof t === 'string').join('\n'));
  const flags = [];
  for (const raw of fileScope) {
    if (typeof raw !== 'string') continue;
    if (scopeIsBareTopLevelDir(raw)) { flags.push({ scope: raw, reason: 'bare-top-level-dir' }); continue; }
    if (!scopeIsSpecificFile(raw) && named.length > 0) {
      const covered = named.filter((f) => scopeCovers(raw, f));
      if (covered.length > threshold) flags.push({ scope: raw, reason: 'covers-named-files', covered });
    }
  }
  return { id: task && task.id ? task.id : null, flags };
}
