import { readFileSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { halt, scanJsStructure } from './js-scan.mjs';
import { engineSourceFiles } from './determinism-lint.mjs';

export const REQUIRED_TOOL = 'StructuredOutput';

const DEFINITION_EXTENSION = '.md';
const FRONTMATTER_FENCE = '---';
const TOOL_TOKEN = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const NAME_LINE = /^name:\s*(\S.*?)\s*$/;
const TOOLS_LINE = /^tools:\s*(\S.*?)\s*$/;

const GIT_ENTRY = '.git';
const GIT_LINK_LINE = /^gitdir:\s*(\S.*?)\s*$/m;
const GIT_COMMON_POINTER = 'commondir';
const CONFIG_DIRECTORY = '.claude';
const AGENT_DIRECTORY = 'agents';
const UNAVAILABLE = Object.freeze({ ok: false, absent: true });
const RESOLVER_IO_MEMBERS = Object.freeze(['pathKind', 'readText', 'realPath', 'homeDir']);

const MODULE_ANCHOR = fileURLToPath(new URL('./', import.meta.url));

export const realResolverIo = Object.freeze({
  pathKind: (path) => {
    let entry;
    try {
      entry = statSync(path);
    } catch {
      return null;
    }
    if (entry.isDirectory()) return 'directory';
    if (entry.isFile()) return 'file';
    return 'other';
  },
  readText: (path) => readFileSync(path, 'utf8'),
  realPath: (path) => realpathSync(path),
  homeDir: () => homedir(),
});

function failureText(error) {
  return error && error.message ? error.message : 'unknown failure';
}

function withTrailingSeparator(dir) {
  return dir.endsWith(sep) ? dir : `${dir}${sep}`;
}

function rosterUnder(root) {
  return withTrailingSeparator(join(root, CONFIG_DIRECTORY, AGENT_DIRECTORY));
}

function workTreeRootOf(commonDir, source) {
  if (basename(commonDir) !== GIT_ENTRY) {
    return halt(`${source} names the common git directory ${commonDir}, whose final segment is not ${GIT_ENTRY}, so the working tree that holds the canonical agent roster cannot be derived from it; refusing to guess`);
  }
  return Object.freeze({ ok: true, root: dirname(commonDir) });
}

function commonRootFromLink(linkPath, linkDir, io) {
  let link;
  try {
    link = io.readText(linkPath);
  } catch (error) {
    return halt(`${linkPath} marks a linked worktree but could not be read: ${failureText(error)}; the checkout that owns it names the canonical agent roster; refusing to guess`);
  }
  const matched = GIT_LINK_LINE.exec(link);
  if (matched === null) {
    return halt(`${linkPath} carries no gitdir: line this resolver can read, so the checkout that owns this worktree cannot be named; refusing to guess`);
  }
  const gitDir = isAbsolute(matched[1]) ? matched[1] : resolve(linkDir, matched[1]);
  const pointer = join(gitDir, GIT_COMMON_POINTER);
  let commonText;
  try {
    commonText = io.readText(pointer);
  } catch (error) {
    return halt(`${pointer} could not be read: ${failureText(error)}; a linked worktree names its common git directory there and without it the primary checkout cannot be derived; refusing to guess`);
  }
  return workTreeRootOf(resolve(gitDir, commonText.trim()), pointer);
}

function gitCommonRoot(anchorDir, io) {
  let dir = anchorDir;
  for (;;) {
    const entry = join(dir, GIT_ENTRY);
    const kind = io.pathKind(entry);
    if (kind === 'directory') return Object.freeze({ ok: true, root: dir });
    if (kind === 'file') return commonRootFromLink(entry, dir, io);
    if (kind === 'other') {
      return halt(`${entry} is neither a git directory nor a linked-worktree file, so this resolver cannot tell a checkout from an unrelated entry of the same name; refusing to guess`);
    }
    const parent = dirname(dir);
    if (parent === dir) return UNAVAILABLE;
    dir = parent;
  }
}

function liveConfigurationRoster(io) {
  const declared = join(io.homeDir(), CONFIG_DIRECTORY, AGENT_DIRECTORY);
  if (io.pathKind(declared) === null) return UNAVAILABLE;
  let real;
  try {
    real = io.realPath(declared);
  } catch (error) {
    return halt(`${declared} is present but its real path could not be resolved: ${failureText(error)}; it is the directory dispatches are served from, so a roster census cannot step past it; refusing to guess`);
  }
  const kind = io.pathKind(real);
  if (kind !== 'directory') {
    return halt(`${declared} resolves to ${real}, which is ${kind === null ? 'not readable' : `a ${kind}`} rather than a directory, so the live agent roster it is supposed to name cannot be read; refusing to guess`);
  }
  return Object.freeze({ ok: true, dir: withTrailingSeparator(real) });
}

export function resolveAgentDefinitionDir(anchorDir, io) {
  if (typeof anchorDir !== 'string' || anchorDir.length === 0) {
    return halt('resolving the canonical agent roster needs a non-empty directory to anchor checkout discovery on');
  }
  if (!io || RESOLVER_IO_MEMBERS.some((member) => typeof io[member] !== 'function')) {
    return halt(`resolving the canonical agent roster needs an io surface carrying ${RESOLVER_IO_MEMBERS.join(', ')}`);
  }
  const checkout = gitCommonRoot(anchorDir, io);
  if (!checkout.ok && checkout.absent !== true) return checkout;
  const live = liveConfigurationRoster(io);
  if (!live.ok && live.absent !== true) return live;
  const derived = [];
  if (checkout.ok) derived.push({ source: 'the checkout that owns this module', dir: rosterUnder(checkout.root) });
  if (live.ok) derived.push({ source: `the live configuration at ${join(io.homeDir(), CONFIG_DIRECTORY, AGENT_DIRECTORY)}`, dir: live.dir });
  if (derived.length === 0) {
    return halt(`neither a git checkout above ${anchorDir} nor a live ${join(CONFIG_DIRECTORY, AGENT_DIRECTORY)} under the home directory names a canonical agent roster, so this census has no roster to read; refusing to fall back to a directory relative to this module, which is a different roster in every worktree`);
  }
  const disagreeing = derived.filter((candidate) => candidate.dir !== derived[0].dir);
  if (disagreeing.length > 0) {
    return halt(`the canonical agent roster is derived two ways and they disagree: ${derived.map((candidate) => `${candidate.source} names ${candidate.dir}`).join(', and ')}; one of the two is a roster that is not in force and this resolver cannot tell which; refusing to guess`);
  }
  return Object.freeze({ ok: true, dir: derived[0].dir });
}

export function agentDefinitionDir() {
  return resolveAgentDefinitionDir(MODULE_ANCHOR, realResolverIo);
}

export function engineStringLiterals(source, scan) {
  if (typeof source !== 'string') return halt('the source to read literals from must be a string');
  if (!scan || scan.ok !== true) return halt('the source to read literals from must be scanned first');
  const literals = new Set();
  for (const [open, close] of scan.stringSpans) {
    literals.add(source.slice(open + 1, close));
  }
  return Object.freeze({ ok: true, literals });
}

export function collectEngineLiterals(roots, io) {
  const enumerated = engineSourceFiles(roots, io);
  if (!enumerated.ok) return Object.freeze({ ok: false, kind: enumerated.kind, error: enumerated.error });
  const literals = new Set();
  for (const path of enumerated.files) {
    let source;
    try {
      source = io.readSource(path);
    } catch (error) {
      return Object.freeze({ ok: false, kind: 'read', error: `${path} could not be read: ${error && error.message ? error.message : 'unknown failure'}` });
    }
    const scan = scanJsStructure(source);
    if (!scan.ok) return Object.freeze({ ok: false, kind: 'halt', error: `${path} could not be scanned: ${scan.error}` });
    const extracted = engineStringLiterals(source, scan);
    if (!extracted.ok) return Object.freeze({ ok: false, kind: 'halt', error: `${path}: ${extracted.error}` });
    for (const literal of extracted.literals) literals.add(literal);
  }
  return Object.freeze({ ok: true, literals, files: enumerated.files });
}

function parseFrontmatter(stem, path, source) {
  const lines = source.split('\n');
  if (lines[0] !== FRONTMATTER_FENCE) {
    return halt(`${path} does not open with a ${FRONTMATTER_FENCE} frontmatter fence, so its name and tools cannot be read; refusing to guess`);
  }
  const end = lines.indexOf(FRONTMATTER_FENCE, 1);
  if (end === -1) return halt(`${path} opens a frontmatter block that is never closed; refusing to guess`);
  const block = lines.slice(1, end);
  const names = block.map((line) => NAME_LINE.exec(line)).filter((match) => match !== null);
  if (names.length !== 1) {
    return halt(`${path} carries ${names.length} frontmatter name: lines; an agent definition declares exactly one, and the dispatch table is keyed by it; refusing to guess`);
  }
  const name = names[0][1];
  if (name !== stem) {
    return halt(`${path} declares name: ${JSON.stringify(name)} but its filename stem is ${JSON.stringify(stem)}; a dispatch names one of the two and this census cannot tell which; refusing to guess`);
  }
  const toolLines = block.map((line) => TOOLS_LINE.exec(line)).filter((match) => match !== null);
  if (toolLines.length > 1) {
    return halt(`${path} carries ${toolLines.length} frontmatter tools: lines; refusing to guess which one grants the agent its tools`);
  }
  if (toolLines.length === 0) return Object.freeze({ ok: true, name, path, tools: null });
  const tools = toolLines[0][1].split(',').map((token) => token.trim());
  const malformed = tools.filter((token) => !TOOL_TOKEN.test(token));
  if (malformed.length > 0) {
    return halt(`${path} has a tools: line this census cannot tokenize into plain tool names: ${JSON.stringify(malformed)}; refusing to guess whether ${REQUIRED_TOOL} is among them`);
  }
  return Object.freeze({ ok: true, name, path, tools: Object.freeze(tools) });
}

export function readAgentDefinitions(agentDir, io) {
  let entries;
  try {
    entries = io.readDir(agentDir);
  } catch (error) {
    return Object.freeze({ ok: false, kind: 'read', error: `the agent definition directory ${agentDir} could not be read: ${error && error.message ? error.message : 'unknown failure'}` });
  }
  const definitions = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(DEFINITION_EXTENSION)) continue;
    const path = join(agentDir, entry.name);
    let source;
    try {
      source = io.readSource(path);
    } catch (error) {
      return Object.freeze({ ok: false, kind: 'read', error: `${path} could not be read: ${error && error.message ? error.message : 'unknown failure'}` });
    }
    const parsed = parseFrontmatter(entry.name.slice(0, -DEFINITION_EXTENSION.length), path, source);
    if (!parsed.ok) return Object.freeze({ ok: false, kind: 'halt', error: parsed.error });
    definitions.push(parsed);
  }
  definitions.sort((a, b) => a.name.localeCompare(b.name));
  return Object.freeze({ ok: true, definitions: Object.freeze(definitions) });
}

export function dispatchableAgents(definitions, literals) {
  return Object.freeze(definitions.filter((definition) => literals.has(definition.name)).map((definition) => definition.name));
}

export function censusAgentSchemaCapability(roots, agentDir, io) {
  const engine = collectEngineLiterals(roots, io);
  if (!engine.ok) return engine;
  const tree = readAgentDefinitions(agentDir, io);
  if (!tree.ok) return tree;
  const dispatchable = dispatchableAgents(tree.definitions, engine.literals);
  const named = new Set(dispatchable);
  const violations = [];
  for (const definition of tree.definitions) {
    if (!named.has(definition.name)) continue;
    if (definition.tools === null) {
      return Object.freeze({
        ok: false,
        kind: 'halt',
        error: `${definition.path} is named as a dispatch target in engine source but declares no frontmatter tools: line, so this census cannot tell a granted ${REQUIRED_TOOL} from an omitted one; refusing to guess`,
      });
    }
    if (!definition.tools.includes(REQUIRED_TOOL)) {
      violations.push({ name: definition.name, path: definition.path });
    }
  }
  return Object.freeze({
    ok: true,
    dispatchable,
    violations: Object.freeze(violations),
    definitionCount: tree.definitions.length,
  });
}
