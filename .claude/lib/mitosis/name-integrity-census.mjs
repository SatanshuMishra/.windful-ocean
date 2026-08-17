import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IDENT_PART, halt, lineOf, previousCodeIndex, scanJsStructure, wordEndingAt } from './js-scan.mjs';
import { realResolverIo, resolveCanonicalConfigDir } from './canonical-config-dir.mjs';
import { MANIFEST_RELATIVE_PATH, resolveSkillPointer } from './agent-skill-pointers.mjs';

export const PLATFORM_AGENT_TYPES = Object.freeze(['claude', 'general-purpose']);

export const CENSUS_NOT_ATTESTED = Object.freeze([
  'that a role name reached through prose alone is covered: the markdown grammar reads a code span whose very next word is the role noun, so "`claude` built-in agent" carries a word between the two and is not censused',
  'that a bare slash command names a skill: `/pricing` and `/logbook:preflight` are the same shape, so only a plugin-qualified reference is read as one and a bare `/word` is left to the code-span grammar',
  'that an agent type computed at run time resolves: a declared dispatch position holding no readable string literal is reported as dynamic rather than resolved',
  'that a call argument names an agent: only the declared value of an agent-typed binding is read, so a name passed positionally into a helper is outside this grammar',
]);

const MARKDOWN_EXTENSION = '.md';
const ENGINE_EXTENSION = '.mjs';
const SKILL_DEFINITION = 'SKILL.md';
const AGENT_EXTENSION = '.md';
const ENGINE_EXCLUDED_DIRECTORIES = Object.freeze(new Set(['prompt-snapshots', 'tests']));
const UNSCANNED_SCRIPT_EXTENSIONS = Object.freeze(['.cjs', '.cts', '.js', '.jsx', '.mts', '.ts', '.tsx']);

const ROLE_SPAN = /`([^`\n]*)`[ \t]+(agents?|subagents?|skills?)\b/g;
const LOCAL_NAME = /^[A-Za-z0-9][A-Za-z0-9-]*$/;
const QUALIFIED_NAME = /^[a-z0-9][a-z0-9-]*:[a-z0-9][a-z0-9-]*$/;
const IDENT_START = /[A-Za-z_$]/;
const DECLARATOR_SUFFIXES = Object.freeze(['agent', 'agenttype', 'agenttypes']);
const WRAPPER_CALLEES = Object.freeze(new Set(['Set', 'Map', 'freeze', 'from', 'of']));
const REGION_TERMINATORS = Object.freeze(new Set([',', ';', '}', ')', ']']));

const MODULE_ANCHOR = fileURLToPath(new URL('./', import.meta.url));

const SCOPE_SUBJECTS = Object.freeze({
  agents: Object.freeze({ canonical: 'the canonical agent roster', bare: 'agent roster', served: 'dispatches are served from' }),
  skills: Object.freeze({ canonical: 'the canonical skill tree', bare: 'skill tree', served: 'skills are served from' }),
  rules: Object.freeze({ canonical: 'the canonical rules tree', bare: 'rules tree', served: 'rules are read from' }),
  lib: Object.freeze({ canonical: 'the canonical library tree', bare: 'library tree', served: 'engine source is loaded from' }),
});

export const REFERENCE_TREES = Object.freeze(['rules', 'skills', 'lib']);

function failure(kind, error) {
  return Object.freeze({ ok: false, kind, error });
}

export const realCensusIo = Object.freeze({
  readDir: (path) => readdirSync(path, { withFileTypes: true }),
  readSource: (path) => readFileSync(path, 'utf8'),
  exists: (path) => existsSync(path),
  pluginManifestPresent: () => existsSync(join(homedir(), MANIFEST_RELATIVE_PATH)),
  resolveQualifiedSkill: (reference) => {
    try {
      resolveSkillPointer({ reference });
    } catch (error) {
      return Object.freeze({ ok: false, reason: error && error.message ? error.message : 'unknown failure' });
    }
    return Object.freeze({ ok: true });
  },
});

function enumerateTree(root, io, engineTree) {
  const files = [];
  const unread = [];
  const pending = [root];
  while (pending.length > 0) {
    const dir = pending.shift();
    let entries;
    try {
      entries = io.readDir(dir);
    } catch (error) {
      return failure('read', `${dir} could not be read: ${error && error.message ? error.message : 'unknown failure'}`);
    }
    const named = [];
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (ENGINE_EXCLUDED_DIRECTORIES.has(entry.name)) continue;
        pending.push(path);
        continue;
      }
      if (!entry.isFile()) {
        return failure('halt', `${path} is neither a file nor a directory; refusing to guess what it resolves to`);
      }
      if (entry.name.endsWith(MARKDOWN_EXTENSION) || entry.name.endsWith(ENGINE_EXTENSION)) {
        named.push(path);
        continue;
      }
      if (engineTree && UNSCANNED_SCRIPT_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) {
        return failure('halt', `${path} sits in the engine tree and can carry a dispatch instruction yet is not scanned by a census over ${ENGINE_EXTENSION} and ${MARKDOWN_EXTENSION} files; refusing to guess`);
      }
      unread.push(path);
    }
    named.sort();
    files.push(...named);
  }
  return Object.freeze({ ok: true, files: Object.freeze(files), unread: Object.freeze(unread) });
}

function roleOf(noun) {
  return noun.startsWith('skill') ? 'skill' : 'agent';
}

export function readMarkdownReferences(path, source) {
  const references = [];
  ROLE_SPAN.lastIndex = 0;
  for (;;) {
    const matched = ROLE_SPAN.exec(source);
    if (matched === null) break;
    const token = matched[1];
    const line = lineOf(source, matched.index);
    if (token.length === 0 || /\s/.test(token)) {
      return halt(`${path}:${line} names a ${roleOf(matched[2])} as ${JSON.stringify(`\`${token}\``)}, which this census cannot read as a single name; refusing to guess whether it is a dispatch target or prose`);
    }
    references.push(Object.freeze({ path, line, token, role: roleOf(matched[2]), grammar: 'code-span' }));
  }
  return Object.freeze({ ok: true, references: Object.freeze(references) });
}

function declaresAgent(name) {
  const normalized = name.replace(/_/g, '').toLowerCase();
  return DECLARATOR_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

function declaredValueSpans(masked, stringSpans, from) {
  const spans = [];
  const frames = [];
  let k = from;
  while (k < masked.length) {
    const c = masked[k];
    if (stringSpans.has(k)) {
      if (!frames.some((opaque) => opaque)) spans.push(k);
      k = stringSpans.get(k) + 1;
      continue;
    }
    if (frames.length === 0 && REGION_TERMINATORS.has(c)) break;
    if (c === '(') {
      frames.push(!WRAPPER_CALLEES.has(wordEndingAt(masked, previousCodeIndex(masked, k - 1))));
    } else if (c === '[' || c === '{') {
      frames.push(false);
    } else if (c === ')' || c === ']' || c === '}') {
      frames.pop();
    }
    k += 1;
  }
  return spans;
}

function declaratorAt(masked, index) {
  if (!IDENT_START.test(masked[index])) return null;
  if (index > 0 && (IDENT_PART.test(masked[index - 1]) || masked[index - 1] === '.')) return null;
  let end = index;
  while (end < masked.length && IDENT_PART.test(masked[end])) end += 1;
  const name = masked.slice(index, end);
  let k = end;
  while (k < masked.length && /\s/.test(masked[k])) k += 1;
  if (masked[k] === ':') return Object.freeze({ name, end, valueFrom: k + 1 });
  if (masked[k] === '=' && masked[k + 1] !== '=' && masked[k + 1] !== '>') {
    return Object.freeze({ name, end, valueFrom: k + 1 });
  }
  return Object.freeze({ name, end, valueFrom: -1 });
}

export function readEngineReferences(path, source) {
  const scan = scanJsStructure(source);
  if (!scan.ok) return halt(`${path} could not be scanned: ${scan.error}`);
  const { masked, stringSpans } = scan;
  const references = [];
  const dynamic = [];
  let k = 0;
  while (k < masked.length) {
    const declarator = declaratorAt(masked, k);
    if (declarator === null) {
      k += 1;
      continue;
    }
    k = declarator.end;
    if (declarator.valueFrom === -1 || !declaresAgent(declarator.name)) continue;
    const spans = declaredValueSpans(masked, stringSpans, declarator.valueFrom);
    const line = lineOf(source, declarator.end);
    if (spans.length === 0) {
      dynamic.push(Object.freeze({ path, line, declarator: declarator.name }));
      continue;
    }
    for (const open of spans) {
      references.push(Object.freeze({
        path,
        line: lineOf(source, open),
        token: source.slice(open + 1, stringSpans.get(open)),
        role: 'agent',
        grammar: `declarator ${declarator.name}`,
      }));
    }
  }
  return Object.freeze({ ok: true, references: Object.freeze(references), dynamic: Object.freeze(dynamic) });
}

function classifyReference(reference, namespaces, io) {
  const { token, role, path, line, grammar } = reference;
  if (QUALIFIED_NAME.test(token)) {
    if (role !== 'skill') {
      return halt(`${path}:${line} names ${JSON.stringify(token)} as an agent, but a plugin-qualified name addresses a plugin namespace this census holds no agent index for; refusing to guess`);
    }
    if (!io.pluginManifestPresent()) {
      return Object.freeze({ ok: true, kind: 'plugin-manifest-absent', reference });
    }
    const resolved = io.resolveQualifiedSkill(token);
    return Object.freeze({ ok: true, kind: resolved.ok ? 'resolved' : 'dangling', reference, reason: resolved.ok ? null : resolved.reason });
  }
  if (!LOCAL_NAME.test(token)) {
    if (grammar !== 'code-span') {
      return halt(`${path}:${line} declares an agent type but names ${JSON.stringify(token)}, which no agent in this configuration can be called; refusing to guess`);
    }
    return Object.freeze({ ok: true, kind: 'foreign', reference });
  }
  if (role === 'agent') {
    const known = namespaces.agents.has(token) || PLATFORM_AGENT_TYPES.includes(token);
    return Object.freeze({ ok: true, kind: known ? 'resolved' : 'dangling', reference, reason: known ? null : 'no such agent definition and no such platform agent type' });
  }
  const known = namespaces.skills.has(token);
  return Object.freeze({ ok: true, kind: known ? 'resolved' : 'dangling', reference, reason: known ? null : 'no such skill definition' });
}

function readAgentNames(agentDir, io) {
  let entries;
  try {
    entries = io.readDir(agentDir);
  } catch (error) {
    return failure('read', `the agent roster ${agentDir} could not be read: ${error && error.message ? error.message : 'unknown failure'}`);
  }
  const names = new Set();
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(AGENT_EXTENSION)) names.add(entry.name.slice(0, -AGENT_EXTENSION.length));
  }
  return Object.freeze({ ok: true, names });
}

function readSkillNames(skillDir, io) {
  let entries;
  try {
    entries = io.readDir(skillDir);
  } catch (error) {
    return failure('read', `the skill tree ${skillDir} could not be read: ${error && error.message ? error.message : 'unknown failure'}`);
  }
  const names = new Set();
  for (const entry of entries) {
    if (entry.isDirectory() && io.exists(join(skillDir, entry.name, SKILL_DEFINITION))) names.add(entry.name);
  }
  return Object.freeze({ ok: true, names });
}

export function resolveCensusScope(anchorDir, io) {
  const dirs = {};
  for (const segment of ['agents', ...REFERENCE_TREES]) {
    const resolved = resolveCanonicalConfigDir(anchorDir, [segment], SCOPE_SUBJECTS[segment], io);
    if (!resolved.ok) return failure('halt', resolved.error);
    dirs[segment] = resolved.dir;
  }
  return Object.freeze({ ok: true, dirs: Object.freeze(dirs) });
}

function collectTreeReferences(tree, root, io) {
  const enumerated = enumerateTree(root, io, tree === 'lib');
  if (!enumerated.ok) return enumerated;
  const references = [];
  const dynamic = [];
  for (const path of enumerated.files) {
    let source;
    try {
      source = io.readSource(path);
    } catch (error) {
      return failure('read', `${path} could not be read: ${error && error.message ? error.message : 'unknown failure'}`);
    }
    const read = path.endsWith(ENGINE_EXTENSION) ? readEngineReferences(path, source) : readMarkdownReferences(path, source);
    if (!read.ok) return failure('halt', read.error);
    references.push(...read.references);
    if (read.dynamic !== undefined) dynamic.push(...read.dynamic);
  }
  return Object.freeze({
    ok: true,
    references: Object.freeze(references),
    dynamic: Object.freeze(dynamic),
    fileCount: enumerated.files.length,
    unreadCount: enumerated.unread.length,
  });
}

export function censusNameIntegrity(dirs, io) {
  const agents = readAgentNames(dirs.agents, io);
  if (!agents.ok) return agents;
  const skills = readSkillNames(dirs.skills, io);
  if (!skills.ok) return skills;
  const namespaces = Object.freeze({ agents: agents.names, skills: skills.names });
  const buckets = { resolved: [], dangling: [], foreign: [], 'plugin-manifest-absent': [] };
  const dynamic = [];
  const perTree = {};
  let fileCount = 0;
  let unreadCount = 0;
  for (const tree of REFERENCE_TREES) {
    const collected = collectTreeReferences(tree, dirs[tree], io);
    if (!collected.ok) return collected;
    if (collected.references.length === 0) {
      return failure('halt', `${dirs[tree]} yielded no agent or skill reference at all across ${collected.fileCount} file(s); a name-integrity verdict over an empty reference set reports integrity it never measured, so it halts`);
    }
    for (const reference of collected.references) {
      const classified = classifyReference(reference, namespaces, io);
      if (!classified.ok) return failure('halt', classified.error);
      buckets[classified.kind].push(classified.reason === undefined || classified.reason === null ? reference : { ...reference, reason: classified.reason });
    }
    dynamic.push(...collected.dynamic);
    perTree[tree] = collected.references.length;
    fileCount += collected.fileCount;
    unreadCount += collected.unreadCount;
  }
  return Object.freeze({
    ok: buckets.dangling.length === 0,
    dangling: Object.freeze(buckets.dangling),
    resolved: Object.freeze(buckets.resolved),
    foreign: Object.freeze(buckets.foreign),
    pluginManifestAbsent: Object.freeze(buckets['plugin-manifest-absent']),
    dynamic: Object.freeze(dynamic),
    perTree: Object.freeze(perTree),
    fileCount,
    unreadCount,
    agentCount: agents.names.size,
    skillCount: skills.names.size,
  });
}

export function censusScope() {
  return resolveCensusScope(MODULE_ANCHOR, realResolverIo);
}
