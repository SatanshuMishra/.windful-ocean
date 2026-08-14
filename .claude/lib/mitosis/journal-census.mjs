import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lineOf, scanJsStructure } from './js-scan.mjs';
import { JOURNAL_KINDS } from './journal-store.mjs';
import * as runLog from './run-log.mjs';

const DIRECTORY_TOKEN = '.mitosis';
const BASENAME_TOKEN = 'run.json';
const QUALIFIER = `${DIRECTORY_TOKEN}/`;
const GITIGNORE_CLAUSE = 'Ensure .mitosis/ is gitignored';
const DISPATCH_CALLEE = 'agent';
const FILESYSTEM_WRITERS = Object.freeze(new Set([
  'appendFile', 'appendFileSync', 'copyFile', 'copyFileSync', 'createWriteStream', 'open', 'openSync',
  'rename', 'renameSync', 'truncate', 'truncateSync', 'write', 'writeFile', 'writeFileSync', 'writeSync',
]));
const PATH_CHARACTER = /[A-Za-z0-9_.\-/$*{}]/;
const PROSE_LEAD = /[ \t]/;
const IDENTIFIER_CHARACTER = /[\w$]/;
const FUNCTION_HEADER = /(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\([^()]*\)\s*$/;
const HEADER_WINDOW = 400;
const SOURCE_EXTENSIONS = Object.freeze(['.js', '.mjs']);
const UNSCANNED_EXTENSIONS = Object.freeze(['.cjs', '.cts', '.jsx', '.mts', '.ts', '.tsx']);
const PLAN_ARTIFACT = /^\/[A-Za-z0-9_.\-$*{}]*\.plan\.md$/;

const ARTIFACT_MATCHERS = Object.freeze([
  Object.freeze({ kind: 'journal', matches: (tail) => tail === `/${BASENAME_TOKEN}` }),
  Object.freeze({ kind: 'directory', matches: (tail) => tail === '' || tail === '/' }),
  Object.freeze({ kind: 'published-manifest', matches: (tail) => tail === '/published-manifest.json' }),
  Object.freeze({ kind: 'plan-artifact', matches: (tail) => PLAN_ARTIFACT.test(tail) }),
]);

export const JOURNAL_ARTIFACT_KINDS = Object.freeze(ARTIFACT_MATCHERS.map((matcher) => matcher.kind));

const DIRECTIVES = Object.freeze([
  Object.freeze({ role: 'write', mode: 'overwrite', lead: 'Write the following to ' }),
  Object.freeze({ role: 'write', mode: 'append', lead: 'APPEND the following single line to the END of ' }),
  Object.freeze({ role: 'read', mode: 'read', lead: 'fold-run-log.mjs ' }),
]);

const KIND_BUILDERS = Object.freeze({
  genesis: 'buildInitialManifest',
  ship: 'shipDelta',
  built: 'builtDelta',
  park: 'parkDelta',
  'ci-attempt': 'ciAttemptDelta',
  'quiescent-exit': 'quiescentExitDelta',
});

function halt(error) {
  return Object.freeze({ ok: false, error });
}

export const JOURNAL_CENSUS_SELF = Object.freeze([fileURLToPath(import.meta.url)]);

export function journalCensusRoots() {
  return Object.freeze([
    Object.freeze({
      kind: 'directory',
      path: fileURLToPath(new URL('./', import.meta.url)),
      excluded: Object.freeze([
        Object.freeze({
          name: 'prompt-snapshots',
          reason: 'pinned prompt text, never loaded as source; a journal path there is a transcript of a dispatch this census already reads at its site in the engine',
        }),
        Object.freeze({
          name: 'tests',
          reason: 'test sources compose journal paths deliberately as fixtures, so censusing them would halt on every synthetic writer the suite builds to prove this census halts',
        }),
      ]),
      excludedFiles: JOURNAL_CENSUS_SELF,
      inertFiles: Object.freeze([]),
    }),
    Object.freeze({
      kind: 'directory',
      path: fileURLToPath(new URL('../../workflows/', import.meta.url)),
      excluded: Object.freeze([]),
      excludedFiles: Object.freeze([]),
      inertFiles: Object.freeze([]),
    }),
  ]);
}

function requireExclusions(root) {
  const excluded = Array.isArray(root.excluded) ? root.excluded : [];
  for (const entry of excluded) {
    if (entry === null || typeof entry !== 'object' || typeof entry.name !== 'string' || entry.name.length === 0) {
      throw new TypeError(`journal-census: the source root ${root.path} excludes ${JSON.stringify(entry)}, which names no directory; an exclusion is a decision and carries the directory it withholds`);
    }
    if (typeof entry.reason !== 'string' || entry.reason.trim().length === 0) {
      throw new TypeError(`journal-census: the source root ${root.path} excludes ${entry.name} without a recorded reason; an unscanned directory is a hole in the guarantee this census makes, so the reason it is inert is required rather than assumed`);
    }
  }
  return excluded.map((entry) => entry.name);
}

export function enumerateJournalSources(roots) {
  if (!Array.isArray(roots) || roots.length === 0) {
    throw new TypeError('journal-census: the census needs at least one source root; enumerating none would attest a scope it never read');
  }
  const files = [];
  for (const root of roots) {
    if (root === null || typeof root !== 'object' || root.kind !== 'directory' || typeof root.path !== 'string') {
      throw new TypeError(`journal-census: the source root ${JSON.stringify(root)} is neither a directory nor anything this census reads; refusing to guess what it enumerates`);
    }
    const excluded = requireExclusions(root);
    const excludedFiles = Array.isArray(root.excludedFiles) ? root.excludedFiles : [];
    const inertFiles = Array.isArray(root.inertFiles) ? root.inertFiles : [];
    let entries;
    try {
      entries = readdirSync(root.path, { withFileTypes: true });
    } catch (error) {
      throw new Error(`journal-census: the source root ${root.path} could not be read: ${error.message}; refusing to census a narrower scope than the guarantee names`, { cause: error });
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (excluded.includes(entry.name)) continue;
        throw new Error(`journal-census: the source root ${root.path} contains the subdirectory ${entry.name}, which this census neither scans nor rules out; refusing to guess whether a journal write moved into it`);
      }
      if (!entry.isFile()) {
        throw new Error(`journal-census: the source root ${root.path} contains ${entry.name}, which is neither a file nor a directory; refusing to guess what it resolves to`);
      }
      if (SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) {
        const path = join(root.path, entry.name);
        if (!excludedFiles.includes(path)) files.push(path);
        continue;
      }
      if (UNSCANNED_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) {
        throw new Error(`journal-census: the source root ${root.path} contains ${entry.name}, which can carry a journal write yet is not scanned by a census over ${SOURCE_EXTENSIONS.join(' and ')} files; refusing to guess`);
      }
      if (!inertFiles.includes(entry.name)) {
        throw new Error(`journal-census: the source root ${root.path} contains ${entry.name}, whose extension is outside the scanned ${SOURCE_EXTENSIONS.join(' and ')} set and which is not enumerated as inert; a shell script, a makefile or a document can carry a journal write just as a module can, so it is refused rather than skipped in silence`);
      }
    }
  }
  return Object.freeze(files.sort());
}

export function readJournalSources(paths) {
  return Object.freeze(paths.map((path) => Object.freeze({ path, source: readFileSync(path, 'utf8') })));
}

function occurrencesOf(raw, token) {
  const found = [];
  let index = raw.indexOf(token);
  while (index !== -1) {
    found.push(index);
    index = raw.indexOf(token, index + 1);
  }
  return found;
}

function pathTailAt(raw, index) {
  let end = index;
  while (end < raw.length && PATH_CHARACTER.test(raw[end])) end += 1;
  return raw.slice(index, end);
}

function pathStartBefore(raw, index) {
  let start = index;
  while (start > 0 && PATH_CHARACTER.test(raw[start - 1])) start -= 1;
  return start;
}

function parenPairs(masked) {
  const open = [];
  const pairs = [];
  for (let index = 0; index < masked.length; index += 1) {
    if (masked[index] === '(') open.push(index);
    else if (masked[index] === ')' && open.length > 0) pairs.push({ open: open.pop(), close: index });
  }
  return pairs;
}

function enclosing(pairs, index) {
  return pairs.filter((pair) => pair.open < index && index < pair.close).sort((a, b) => b.open - a.open);
}

function calleeBefore(masked, open) {
  let end = open - 1;
  while (end >= 0 && /\s/.test(masked[end])) end -= 1;
  if (end < 0 || !IDENTIFIER_CHARACTER.test(masked[end])) return '';
  let start = end;
  while (start >= 0 && IDENTIFIER_CHARACTER.test(masked[start])) start -= 1;
  return masked.slice(start + 1, end + 1);
}

function insideDispatch(context, index) {
  return enclosing(context.parens, index).some((pair) => calleeBefore(context.masked, pair.open) === DISPATCH_CALLEE);
}

function filesystemWriterAround(context, index) {
  const pair = enclosing(context.parens, index).find((entry) => FILESYSTEM_WRITERS.has(calleeBefore(context.masked, entry.open)));
  return pair === undefined ? null : calleeBefore(context.masked, pair.open);
}

function functionNameFor(context, open) {
  const header = context.masked.slice(Math.max(0, open - HEADER_WINDOW), open).trimEnd();
  const matched = FUNCTION_HEADER.exec(header);
  return matched === null ? null : matched[1];
}

function buildersWithin(text) {
  return Object.entries(KIND_BUILDERS)
    .filter(([, builder]) => new RegExp(`(?<![\\w$])${builder}(?![\\w$])`).test(text))
    .map(([kind]) => kind);
}

function enclosingFunction(context, index) {
  for (const pair of enclosing(context.braces, index)) {
    const name = functionNameFor(context, pair.open);
    if (name !== null) return { name, pair };
  }
  return null;
}

function kindFromScopes(context, index) {
  for (const pair of enclosing(context.braces, index)) {
    const found = buildersWithin(context.raw.slice(pair.open, pair.close));
    if (found.length === 1) return { kind: found[0], scope: pair };
    if (found.length > 1) return null;
  }
  return null;
}

function kindViaCallers(context, holder) {
  const callSites = occurrencesOf(context.masked, `${holder.name}(`)
    .filter((index) => index < holder.pair.open || index > holder.pair.close)
    .filter((index) => calleeBefore(context.masked, index + holder.name.length) === holder.name);
  const resolved = [];
  for (const site of callSites) {
    const found = kindFromScopes(context, site);
    if (found === null) continue;
    const caller = enclosingFunction(context, site);
    resolved.push({ kind: found.kind, by: caller === null ? 'module scope' : caller.name });
  }
  const kinds = [...new Set(resolved.map((entry) => entry.kind))];
  if (kinds.length !== 1) return null;
  return { kind: kinds[0], resolvedBy: [...new Set(resolved.map((entry) => entry.by))].sort().join(', ') };
}

function resolveKind(context, index) {
  const direct = kindFromScopes(context, index);
  if (direct !== null) {
    const named = enclosingFunction(context, index);
    return { kind: direct.kind, viaHelper: false, resolvedBy: named === null ? 'module scope' : named.name };
  }
  const holder = enclosingFunction(context, index);
  if (holder === null) return null;
  const indirect = kindViaCallers(context, holder);
  if (indirect === null) return null;
  return { kind: indirect.kind, viaHelper: true, resolvedBy: indirect.resolvedBy };
}

function directiveAt(raw, index) {
  const start = pathStartBefore(raw, index);
  return DIRECTIVES.find((directive) => raw.slice(Math.max(0, start - directive.lead.length), start) === directive.lead) || null;
}

function importsAnything(masked) {
  return /^[ \t]*import\s/m.test(masked) || /(?<![\w$])require\s*\(/.test(masked) || /(?<![\w$])import\s*\(/.test(masked);
}

export const JOURNAL_ARGV_COMPOSERS = Object.freeze({
  'lib/mitosis/node-commands.mjs': 'the transcribed argument vector for the deterministic fold CLI: the reconcile stage runs fold-run-log.mjs against the journal, which READS it, so this source composes the path as one inert argument vector element and hands it to no filesystem call; the writer check above this classification still refuses a path handed to any writer here',
});

function declaredArgvComposer(path) {
  return Object.keys(JOURNAL_ARGV_COMPOSERS).find((suffix) => path.endsWith(suffix));
}

function namedAsProseWord(raw, index) {
  const start = index - QUALIFIER.length - 1;
  return start >= 0 && PROSE_LEAD.test(raw[start]);
}

function auditArtifacts(context) {
  const unknown = [];
  let counted = 0;
  for (const index of occurrencesOf(context.raw, DIRECTORY_TOKEN)) {
    const tail = pathTailAt(context.raw, index + DIRECTORY_TOKEN.length);
    if (ARTIFACT_MATCHERS.some((matcher) => matcher.matches(tail))) {
      counted += 1;
      continue;
    }
    unknown.push(`${context.path}:${lineOf(context.raw, index)} names ${DIRECTORY_TOKEN}${tail}`);
  }
  return { counted, unknown };
}

function auditBasenames(context) {
  const qualified = [];
  const unknown = [];
  for (const index of occurrencesOf(context.raw, BASENAME_TOKEN)) {
    if (context.raw.slice(index - QUALIFIER.length, index) === QUALIFIER) {
      qualified.push(index);
      continue;
    }
    if (context.raw[index - 1] === '<' && context.raw[index + BASENAME_TOKEN.length] === '>') continue;
    unknown.push(`${context.path}:${lineOf(context.raw, index)} names ${BASENAME_TOKEN} without the ${DIRECTORY_TOKEN} directory that qualifies it as the run journal`);
  }
  return { qualified, unknown };
}

function classifySite(context, index) {
  const writer = filesystemWriterAround(context, index);
  if (writer !== null) {
    return { error: `${context.path}:${lineOf(context.raw, index)} passes the run journal path straight to ${writer}; the journal is written through journal-store.mjs, whose path is an argument, so a literal journal path inside a filesystem call is a second writer this census would otherwise never see` };
  }
  if (!insideDispatch(context, index)) {
    if (context.dispatchOnly || namedAsProseWord(context.raw, index)) return { role: 'mention' };
    if (declaredArgvComposer(context.path) !== undefined) return { role: 'argv' };
    return { error: `${context.path}:${lineOf(context.raw, index)} composes the run journal path as a path expression outside any dispatch, in a source that imports and can therefore write. The journal is written through journal-store.mjs, whose path is an argument; the one inert form this census enumerates for an importing source is the basename named as a word in prose, so a path built here is refused rather than counted as an unread mention` };
  }
  const directive = directiveAt(context.raw, index);
  if (directive === null) {
    return { error: `${context.path}:${lineOf(context.raw, index)} instructs a dispatched model about the run journal with a directive this census cannot classify as a write or a read; every journal directive must be recognised, because one it cannot read is one it would drop from the conversion list` };
  }
  if (directive.role === 'read') return { role: 'read' };
  const resolved = resolveKind(context, index);
  if (resolved === null) {
    return { error: `${context.path}:${lineOf(context.raw, index)} writes the run journal but its delta kind could not be resolved to exactly one of the builders ${Object.values(KIND_BUILDERS).join(', ')}, directly or through the callers of its enclosing helper` };
  }
  return {
    role: 'write',
    site: Object.freeze({
      path: context.path,
      line: lineOf(context.raw, index),
      mode: directive.mode,
      kind: resolved.kind,
      viaHelper: resolved.viaHelper,
      resolvedBy: resolved.resolvedBy,
    }),
  };
}

function contextFor(source) {
  const scan = scanJsStructure(source.source);
  if (!scan.ok) return { error: `journal-census: ${source.path} could not be scanned, so its journal sites cannot be resolved: ${scan.error}` };
  return {
    context: {
      path: source.path,
      raw: source.source,
      masked: scan.masked,
      braces: scan.bracePairs,
      parens: parenPairs(scan.masked),
      dispatchOnly: !importsAnything(scan.masked),
    },
  };
}

function builderMismatch() {
  const missing = Object.entries(KIND_BUILDERS)
    .filter(([kind, builder]) => kind !== 'genesis' && typeof runLog[builder] !== 'function')
    .map(([kind, builder]) => `${kind} (${builder})`);
  if (missing.length > 0) {
    return `journal-census: these declared delta builders are no longer exported by run-log.mjs, so the census would resolve their sites against a name nothing defines: ${missing.join(', ')}`;
  }
  const undeclared = JOURNAL_KINDS.filter((kind) => !Object.hasOwn(KIND_BUILDERS, kind));
  if (undeclared.length > 0) {
    return `journal-census: these journal kinds have no declared builder, so no site could ever resolve to them: ${undeclared.join(', ')}`;
  }
  return null;
}

function censusOneSource(source) {
  if (source === null || typeof source !== 'object' || typeof source.source !== 'string' || typeof source.path !== 'string') {
    return { error: `journal-census: ${JSON.stringify(source)} is not a source carrying a path and its text` };
  }
  const prepared = contextFor(source);
  if (prepared.error !== undefined) return { error: prepared.error };
  const context = prepared.context;
  const artifacts = auditArtifacts(context);
  if (artifacts.unknown.length > 0) {
    return { error: `journal-census: these ${DIRECTORY_TOKEN} artifacts are not one of ${JOURNAL_ARTIFACT_KINDS.join(', ')}, and an unclassified one may be a run journal under another name: ${artifacts.unknown.join('; ')}` };
  }
  const basenames = auditBasenames(context);
  if (basenames.unknown.length > 0) return { error: `journal-census: ${basenames.unknown.join('; ')}` };
  const sites = [];
  let mentionCount = 0;
  let argvCount = 0;
  for (const index of basenames.qualified) {
    const classified = classifySite(context, index);
    if (classified.error !== undefined) return { error: `journal-census: ${classified.error}` };
    if (classified.role === 'write') sites.push(classified.site);
    else if (classified.role === 'argv') argvCount += 1;
    else mentionCount += 1;
  }
  const composer = declaredArgvComposer(context.path);
  if (composer !== undefined && argvCount === 0) {
    return { error: `journal-census: ${context.path} is declared as composing the run journal path into an argument vector, yet it composes no such path; a declaration nothing matches keeps a source excused after the composition that justified it is gone` };
  }
  return {
    sites,
    mentionCount,
    argvCount,
    argvComposer: composer === undefined ? null : context.path,
    artifactCount: artifacts.counted,
    gitignoreClauseCount: occurrencesOf(context.raw, GITIGNORE_CLAUSE).length,
    dispatchOnly: context.dispatchOnly ? context.path : null,
  };
}

export function unreachedArgvComposers(sources) {
  const paths = sources.map((source) => (source === null || typeof source !== 'object' ? '' : String(source.path)));
  return Object.freeze(Object.keys(JOURNAL_ARGV_COMPOSERS).filter((suffix) => !paths.some((path) => path.endsWith(suffix))));
}

export function censusJournalDispatches(sources) {
  if (!Array.isArray(sources) || sources.length === 0) {
    return halt('journal-census: the census was handed no source, so it would attest a conversion list it never measured');
  }
  const drift = builderMismatch();
  if (drift !== null) return halt(drift);
  const sites = [];
  const dispatchOnly = [];
  const argvComposers = [];
  let argvCount = 0;
  let artifactCount = 0;
  let gitignoreClauseCount = 0;
  let mentionCount = 0;
  for (const source of sources) {
    const measured = censusOneSource(source);
    if (measured.error !== undefined) return halt(measured.error);
    sites.push(...measured.sites);
    mentionCount += measured.mentionCount;
    artifactCount += measured.artifactCount;
    gitignoreClauseCount += measured.gitignoreClauseCount;
    if (measured.dispatchOnly !== null) dispatchOnly.push(measured.dispatchOnly);
    if (measured.argvComposer !== null) argvComposers.push(measured.argvComposer);
    argvCount += measured.argvCount;
  }
  if (sites.length !== gitignoreClauseCount) {
    return halt(`journal-census: the extractor resolved ${sites.length} journal write site(s) while the independently counted "${GITIGNORE_CLAUSE}" clause appears ${gitignoreClauseCount} time(s); the two disagree, so one of the two extractors is reading a subset and neither figure can be trusted`);
  }
  const kinds = [...new Set(sites.map((site) => site.kind))];
  const unwritten = JOURNAL_KINDS.filter((kind) => !kinds.includes(kind));
  if (unwritten.length > 0) {
    return halt(`journal-census: these journal kinds have no write site in the censused sources: ${unwritten.join(', ')}; a kind whose site vanished is either already converted, in which case drop it from JOURNAL_KINDS, or lost, in which case it is a delta nothing records any more`);
  }
  const unknownKinds = kinds.filter((kind) => !JOURNAL_KINDS.includes(kind));
  if (unknownKinds.length > 0) {
    return halt(`journal-census: these write sites carry a kind the journal store does not declare: ${unknownKinds.join(', ')}`);
  }
  return Object.freeze({
    ok: true,
    sites: Object.freeze(sites),
    kinds: Object.freeze(kinds),
    siteCount: sites.length,
    kindCount: kinds.length,
    artifactCount,
    argvComposerCount: argvComposers.length,
    argvComposedPathCount: argvCount,
    argvComposers: Object.freeze(Object.entries(JOURNAL_ARGV_COMPOSERS).map(([name, reason]) => `${name}: ${reason}`)),
    gitignoreClauseCount,
    mentionCount,
    sourceCount: sources.length,
    dispatchOnlySources: Object.freeze(dispatchOnly),
  });
}

export function journalDispatchCensus() {
  const roots = journalCensusRoots();
  let sources;
  try {
    sources = readJournalSources(enumerateJournalSources(roots));
  } catch (error) {
    return halt(`journal-census: the engine sources could not be enumerated: ${error.message}`);
  }
  const measured = censusJournalDispatches(sources);
  if (!measured.ok) return measured;
  const excludedDirectories = roots.flatMap((root) => root.excluded.map((entry) => `${entry.name}: ${entry.reason}`));
  return Object.freeze({ ...measured, excludedDirectories: Object.freeze(excludedDirectories) });
}
