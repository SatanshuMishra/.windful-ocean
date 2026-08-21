import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TESTS_DIR = dirname(fileURLToPath(import.meta.url));
const CLI_ABSOLUTE_PATH = resolve(TESTS_DIR, '..', 'cli.mjs');
const OPEN_BRACKETS = '([{';
const CLOSE_BRACKETS = ')]}';
const CLI_MODULE_SPECIFIER = "'../cli.mjs'";
const RELATIVE_SPECIFIER_SOURCE = "(?:'(?<sq>(?:\\\\.|[^'\\\\])*)'|\"(?<dq>(?:\\\\.|[^\"\\\\])*)\")";
const FROM_RELATIVE_SOURCE = `\\bfrom\\s*${RELATIVE_SPECIFIER_SOURCE}`;
const DYNAMIC_IMPORT_RELATIVE_SOURCE = `\\bimport\\s*\\(\\s*${RELATIVE_SPECIFIER_SOURCE}\\s*\\)`;
const NAMED_IMPORT_RELATIVE_SOURCE = `\\bimport\\s*\\{([^}]*)\\}\\s*from\\s*${RELATIVE_SPECIFIER_SOURCE}\\s*;?`;
const NAMESPACE_IMPORT_RELATIVE_SOURCE = `\\bimport\\s*\\*\\s*as\\s+[A-Za-z_$][\\w$]*\\s*from\\s*${RELATIVE_SPECIFIER_SOURCE}\\s*;?`;
const NAMED_REEXPORT_RELATIVE_SOURCE = `\\bexport\\s*\\{([^}]*)\\}\\s*from\\s*${RELATIVE_SPECIFIER_SOURCE}\\s*;?`;
const STAR_REEXPORT_RELATIVE_SOURCE = `\\bexport\\s*\\*\\s*(?:as\\s+[A-Za-z_$][\\w$]*\\s*)?from\\s*${RELATIVE_SPECIFIER_SOURCE}\\s*;?`;
const DEPS_INDEX_BY_EXPORT = Object.freeze({ runCli: 3, realPorts: 1 });
const IDENTIFIER_CHAR = /[A-Za-z0-9_$]/;
const MEMBER_EXPRESSION = /^([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)$/;
const CALL_EXPRESSION = /^([A-Za-z_$][\w$]*)\((.*)\)$/s;
const BARE_IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const DECLARED_EXCLUDED_SUBDIRECTORIES = Object.freeze(['fixtures', 'evidence', 'cassettes']);
const SPECIFIER_SUFFIX = /[?#].*$/;

function mjsFiles() {
  return readdirSync(TESTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.mjs'))
    .map((entry) => entry.name)
    .sort();
}

function unexpectedSubdirectoryNames() {
  return readdirSync(TESTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !DECLARED_EXCLUDED_SUBDIRECTORIES.includes(entry.name))
    .map((entry) => entry.name)
    .sort();
}

function globalMatches(text, source) {
  const pattern = new RegExp(source, 'g');
  const matches = [];
  let match = pattern.exec(text);
  while (match !== null) {
    matches.push(match);
    match = pattern.exec(text);
  }
  return matches;
}

function bindingsFromNamedImportMatch(match) {
  return match[1]
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .map((token) => {
      const parts = token.split(/\s+as\s+/);
      const exported = parts[0].trim();
      const local = parts.length > 1 ? parts[1].trim() : exported;
      return { exported, local };
    })
    .filter((binding) => Object.hasOwn(DEPS_INDEX_BY_EXPORT, binding.exported));
}

function unresolvedImportSite(file, text, index, reason) {
  return {
    file,
    name: null,
    line: lineOf(text, index),
    verdict: null,
    reason,
    excerpt: excerptOf(text, Math.max(0, index - 20), Math.min(text.length, index + 80)),
  };
}

function matchCoversIndex(match, index) {
  return index >= match.index && index < match.index + match[0].length;
}

function specifierTextOf(match) {
  const raw = match.groups.sq !== undefined ? match.groups.sq : match.groups.dq;
  return raw.replace(/\\(.)/g, '$1');
}

function matchTargetsCliModule(file, match) {
  const specifier = specifierTextOf(match);
  if (!specifier.startsWith('.')) return false;
  const withoutSuffix = specifier.replace(SPECIFIER_SUFFIX, '');
  return resolve(TESTS_DIR, dirname(file), withoutSuffix) === CLI_ABSOLUTE_PATH;
}

function wordBoundaryOccurrences(text, word) {
  const pattern = new RegExp(`(?<![A-Za-z0-9_$])${word}(?![A-Za-z0-9_$])`, 'g');
  const indices = [];
  let match = pattern.exec(text);
  while (match !== null) {
    indices.push(match.index);
    match = pattern.exec(text);
  }
  return indices;
}

function nonCallUseSite(file, text, binding, index) {
  return {
    file,
    name: binding.exported,
    line: lineOf(text, index),
    verdict: null,
    reason: `non-call-use(${binding.local})`,
    excerpt: excerptOf(text, Math.max(0, index - 20), Math.min(text.length, index + 60)),
  };
}

function nonCallBindingUseSites(file, text, bindings, importRanges) {
  return bindings.flatMap((binding) => {
    const callIndices = new Set(occurrencesOf(text, `${binding.local}(`));
    return wordBoundaryOccurrences(text, binding.local)
      .filter((index) => !callIndices.has(index))
      .filter((index) => !importRanges.some(([start, end]) => index >= start && index < end))
      .map((index) => nonCallUseSite(file, text, binding, index));
  });
}

function importedCliBindingsAndSites(file, text) {
  const namedImportMatches = globalMatches(text, NAMED_IMPORT_RELATIVE_SOURCE).filter((match) => matchTargetsCliModule(file, match));
  const namespaceImportMatches = globalMatches(text, NAMESPACE_IMPORT_RELATIVE_SOURCE).filter((match) => matchTargetsCliModule(file, match));
  const namedReexportMatches = globalMatches(text, NAMED_REEXPORT_RELATIVE_SOURCE).filter((match) => matchTargetsCliModule(file, match));
  const starReexportMatches = globalMatches(text, STAR_REEXPORT_RELATIVE_SOURCE).filter((match) => matchTargetsCliModule(file, match));
  const dynamicImportMatches = globalMatches(text, DYNAMIC_IMPORT_RELATIVE_SOURCE).filter((match) => matchTargetsCliModule(file, match));
  const fromClauseMatches = globalMatches(text, FROM_RELATIVE_SOURCE).filter((match) => matchTargetsCliModule(file, match));

  const bindings = namedImportMatches.flatMap((match) => bindingsFromNamedImportMatch(match));

  const unresolvedSites = [
    ...namespaceImportMatches.map((match) => unresolvedImportSite(file, text, match.index, 'unresolvable-import-form(namespace-import)')),
    ...namedReexportMatches.map((match) => unresolvedImportSite(file, text, match.index, 'unresolvable-import-form(re-export)')),
    ...starReexportMatches.map((match) => unresolvedImportSite(file, text, match.index, 'unresolvable-import-form(re-export)')),
    ...dynamicImportMatches.map((match) => unresolvedImportSite(file, text, match.index, 'unresolvable-import-form(dynamic-import)')),
  ];

  const recognizedMatches = [...namedImportMatches, ...namespaceImportMatches, ...namedReexportMatches, ...starReexportMatches];
  for (const clause of fromClauseMatches) {
    if (!recognizedMatches.some((recognized) => matchCoversIndex(recognized, clause.index))) {
      unresolvedSites.push(unresolvedImportSite(file, text, clause.index, 'unresolvable-import-form(unrecognized-from-clause)'));
    }
  }

  const importRanges = recognizedMatches.map((match) => [match.index, match.index + match[0].length]);
  unresolvedSites.push(...nonCallBindingUseSites(file, text, bindings, importRanges));

  return { bindings, unresolvedSites };
}

function occurrencesOf(text, needle) {
  const indices = [];
  let index = text.indexOf(needle);
  while (index !== -1) {
    const before = index === 0 ? '' : text[index - 1];
    if (!IDENTIFIER_CHAR.test(before)) indices.push(index);
    index = text.indexOf(needle, index + needle.length);
  }
  return indices;
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

function matchBracket(text, openIndex) {
  let depth = 0;
  let quote = null;
  for (let i = openIndex; i < text.length; i += 1) {
    const ch = text[i];
    if (quote !== null) {
      if (ch === '\\') { i += 1; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (OPEN_BRACKETS.includes(ch)) { depth += 1; continue; }
    if (CLOSE_BRACKETS.includes(ch)) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return null;
}

function topLevelSplit(inner) {
  if (inner.trim() === '') return [];
  const parts = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i];
    if (quote !== null) {
      if (ch === '\\') { i += 1; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (OPEN_BRACKETS.includes(ch)) { depth += 1; continue; }
    if (CLOSE_BRACKETS.includes(ch)) { depth -= 1; continue; }
    if (ch === ',' && depth === 0) {
      parts.push(inner.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(inner.slice(start));
  return parts;
}

function topLevelArgs(text, openIndex) {
  const closeIndex = matchBracket(text, openIndex);
  if (closeIndex === null) return null;
  const args = topLevelSplit(text.slice(openIndex + 1, closeIndex)).map((part) => part.trim());
  while (args.length > 0 && args[args.length - 1] === '') args.pop();
  return { args, closeIndex };
}

function keyValueOf(segment) {
  if (segment.startsWith('...')) return { spread: true, key: null, value: null };
  let depth = 0;
  let quote = null;
  for (let i = 0; i < segment.length; i += 1) {
    const ch = segment[i];
    if (quote !== null) {
      if (ch === '\\') { i += 1; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (OPEN_BRACKETS.includes(ch)) { depth += 1; continue; }
    if (CLOSE_BRACKETS.includes(ch)) { depth -= 1; continue; }
    if (ch === ':' && depth === 0) {
      return { spread: false, key: segment.slice(0, i).trim(), value: segment.slice(i + 1).trim() };
    }
  }
  return { spread: false, key: segment.trim(), value: null };
}

function objectMembers(objectLiteralText) {
  const inner = objectLiteralText.slice(1, -1);
  return topLevelSplit(inner)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((segment) => keyValueOf(segment));
}

function dispatchMemberIsBound(member) {
  if (member.spread === true || member.key !== 'dispatch') return false;
  if (member.value === null) return true;
  return member.value.trim() !== 'undefined';
}

function hasDispatchKey(objectLiteralText) {
  return objectMembers(objectLiteralText).some((member) => dispatchMemberIsBound(member));
}

function propertyValueText(objectLiteralText, name) {
  const member = objectMembers(objectLiteralText).find((entry) => entry.spread !== true && entry.key === name);
  return member === undefined ? null : member.value;
}

function findFunctionDeclarationMatches(text, name) {
  const declaration = new RegExp(`function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`, 'g');
  const matches = [];
  let match = declaration.exec(text);
  while (match !== null) {
    matches.push(match);
    match = declaration.exec(text);
  }
  return matches;
}

function functionBodyOfMatch(text, match) {
  const braceStart = match.index + match[0].length - 1;
  const braceEnd = matchBracket(text, braceStart);
  if (braceEnd === null) return null;
  return text.slice(braceStart, braceEnd + 1);
}

function returnStatementCount(functionBodyText) {
  const matches = functionBodyText.match(/\breturn\b/g);
  return matches === null ? 0 : matches.length;
}

function returnedObjectText(functionBodyText) {
  const match = /\breturn\s*\(?\s*\{/.exec(functionBodyText);
  if (match === null) return null;
  const braceStart = match.index + match[0].length - 1;
  const braceEnd = matchBracket(functionBodyText, braceStart);
  if (braceEnd === null) return null;
  return functionBodyText.slice(braceStart, braceEnd + 1);
}

function resolveFunctionReturnObject(fileText, fnName) {
  const declarations = findFunctionDeclarationMatches(fileText, fnName);
  if (declarations.length > 1) return { ok: false, ambiguous: true, objectText: null };
  if (declarations.length === 0) return { ok: false, ambiguous: false, objectText: null };
  const body = functionBodyOfMatch(fileText, declarations[0]);
  if (body === null) return { ok: false, ambiguous: false, objectText: null };
  if (returnStatementCount(body) > 1) return { ok: false, ambiguous: true, objectText: null };
  return { ok: true, ambiguous: false, objectText: returnedObjectText(body) };
}

function resolveIdentifierOwnerObject(fileText, base) {
  const assignment = new RegExp(`\\bconst\\s+${base}\\s*=\\s*([A-Za-z_$][\\w$]*)\\s*\\(`).exec(fileText);
  if (assignment === null) return { ok: false, ambiguous: false, objectText: null, fnName: null };
  const resolved = resolveFunctionReturnObject(fileText, assignment[1]);
  return { ...resolved, fnName: assignment[1] };
}

function declarationsOfConst(fileText, name) {
  return globalMatches(fileText, `\\bconst\\s+${name}\\s*=\\s*`);
}

function objectLiteralAfter(fileText, index) {
  let cursor = index;
  while (cursor < fileText.length && /\s/.test(fileText[cursor])) cursor += 1;
  if (fileText.startsWith('Object.freeze(', cursor)) {
    const openParen = cursor + 'Object.freeze('.length - 1;
    const closeParen = matchBracket(fileText, openParen);
    if (closeParen === null) return null;
    const inner = fileText.slice(openParen + 1, closeParen).trim();
    return inner.startsWith('{') && inner.endsWith('}') ? inner : null;
  }
  if (fileText[cursor] === '{') {
    const closeBrace = matchBracket(fileText, cursor);
    if (closeBrace === null) return null;
    return fileText.slice(cursor, closeBrace + 1);
  }
  return null;
}

function resolveBareIdentifierObject(fileText, name) {
  const declarations = declarationsOfConst(fileText, name);
  if (declarations.length > 1) return { ok: false, ambiguous: true, objectText: null };
  if (declarations.length === 0) return { ok: false, ambiguous: false, objectText: null };
  const declaration = declarations[0];
  const objectText = objectLiteralAfter(fileText, declaration.index + declaration[0].length);
  if (objectText === null) return { ok: false, ambiguous: false, objectText: null };
  return { ok: true, ambiguous: false, objectText };
}

function boundnessOf(fileText, depsText) {
  if (depsText === null) return { verdict: 'unbound', reason: 'no-deps-argument' };
  if (depsText.startsWith('{')) {
    return { verdict: hasDispatchKey(depsText) ? 'bound' : 'unbound', reason: 'inline-object-literal' };
  }
  const memberMatch = MEMBER_EXPRESSION.exec(depsText);
  if (memberMatch !== null) {
    const owner = resolveIdentifierOwnerObject(fileText, memberMatch[1]);
    if (owner.ambiguous) return { verdict: null, reason: `ambiguous-helper(${owner.fnName})` };
    if (!owner.ok || owner.objectText === null) return { verdict: null, reason: `unresolvable-member-owner(${memberMatch[1]})` };
    const nested = propertyValueText(owner.objectText, memberMatch[2]);
    if (nested === null || !nested.startsWith('{')) {
      return { verdict: null, reason: `unresolvable-member-value(${depsText})` };
    }
    return { verdict: hasDispatchKey(nested) ? 'bound' : 'unbound', reason: 'resolved-member-expression' };
  }
  const callMatch = CALL_EXPRESSION.exec(depsText);
  if (callMatch !== null) {
    const resolved = resolveFunctionReturnObject(fileText, callMatch[1]);
    if (resolved.ambiguous) return { verdict: null, reason: `ambiguous-helper(${callMatch[1]})` };
    if (!resolved.ok || resolved.objectText === null) return { verdict: null, reason: `unresolvable-call-callee(${callMatch[1]})` };
    return { verdict: hasDispatchKey(resolved.objectText) ? 'bound' : 'unbound', reason: 'resolved-call-expression' };
  }
  if (BARE_IDENTIFIER.test(depsText)) {
    const resolved = resolveBareIdentifierObject(fileText, depsText);
    if (resolved.ambiguous) return { verdict: null, reason: `ambiguous-identifier(${depsText})` };
    if (!resolved.ok || resolved.objectText === null) return { verdict: null, reason: `unresolvable-identifier(${depsText})` };
    return { verdict: hasDispatchKey(resolved.objectText) ? 'bound' : 'unbound', reason: 'resolved-bare-identifier' };
  }
  return { verdict: null, reason: `unresolvable-shape(${depsText.slice(0, 60)})` };
}

function excerptOf(text, start, end) {
  const raw = text.slice(start, end).replace(/\s+/g, ' ').trim();
  return raw.length > 140 ? `${raw.slice(0, 137)}...` : raw;
}

function siteOccurrences(file, text, binding) {
  const requiredIndex = DEPS_INDEX_BY_EXPORT[binding.exported];
  return occurrencesOf(text, `${binding.local}(`).map((index) => {
    const openIndex = index + binding.local.length;
    const parsed = topLevelArgs(text, openIndex);
    if (parsed === null) {
      return {
        file,
        name: binding.exported,
        line: lineOf(text, index),
        verdict: null,
        reason: 'unbalanced-call-parens',
        excerpt: excerptOf(text, index, Math.min(text.length, index + 80)),
      };
    }
    const depsText = parsed.args.length > requiredIndex ? parsed.args[requiredIndex] : null;
    const resolved = boundnessOf(text, depsText);
    return {
      file,
      name: binding.exported,
      line: lineOf(text, index),
      verdict: resolved.verdict,
      reason: resolved.reason,
      excerpt: excerptOf(text, index, parsed.closeIndex + 1),
    };
  });
}

function dispatchBindingCensus() {
  const files = mjsFiles();
  const sources = new Map(files.map((name) => [name, readFileSync(join(TESTS_DIR, name), 'utf8')]));
  const sites = files.flatMap((name) => {
    const text = sources.get(name);
    const { bindings, unresolvedSites } = importedCliBindingsAndSites(name, text);
    const boundSites = bindings.flatMap((binding) => siteOccurrences(name, text, binding));
    return [...unresolvedSites, ...boundSites];
  });
  return { files, sources, sites };
}

function located(entries) {
  return entries.map((entry) => `${entry.file}:${entry.line}: [${entry.name}] ${entry.reason} - ${entry.excerpt}`);
}

test('CLOSED CENSUS: every runCli( and realPorts( call site targeting a cli.mjs export either binds dispatch or is named as leaving it unbound', () => {
  const unexpectedSubdirectories = unexpectedSubdirectoryNames();
  assert.deepEqual(
    unexpectedSubdirectories,
    [],
    `a subdirectory under tests/ other than ${DECLARED_EXCLUDED_SUBDIRECTORIES.join(', ')} exists (${unexpectedSubdirectories.join(', ')}) and its .mjs files would be silently excluded from this one-level census`,
  );

  const census = dispatchBindingCensus();

  assert.ok(census.files.length > 0, 'the census found no .mjs files directly under tests/, which would make every claim below vacuous');
  assert.ok(
    census.sites.length > 0,
    `the census found no runCli( or realPorts( call site importing from ${CLI_MODULE_SPECIFIER}, which would make the binding claim vacuous`,
  );

  assert.deepEqual(
    located(census.sites.filter((site) => site.verdict === null)),
    [],
    'a runCli(/realPorts( call site whose dispatch dependency this census cannot resolve halts the census rather than passing silently',
  );

  const unbound = census.sites.filter((site) => site.verdict === 'unbound');
  assert.deepEqual(
    located(unbound),
    [],
    `${unbound.length} runCli(/realPorts( call site(s) leave the dispatch dependency unbound, so cli.mjs defaults deps.dispatch to the real Claude CLI dispatcher instead of a test double`,
  );
});
