import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { halt, scanJsStructure } from './js-scan.mjs';
import { engineSourceFiles } from './determinism-lint.mjs';

export const REQUIRED_TOOL = 'StructuredOutput';

const DEFINITION_EXTENSION = '.md';
const FRONTMATTER_FENCE = '---';
const TOOL_TOKEN = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const NAME_LINE = /^name:\s*(\S.*?)\s*$/;
const TOOLS_LINE = /^tools:\s*(\S.*?)\s*$/;

export function agentDefinitionDir() {
  return fileURLToPath(new URL('../../agents/', import.meta.url));
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
