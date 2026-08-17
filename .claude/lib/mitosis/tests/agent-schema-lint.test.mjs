import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { scanJsStructure } from '../js-scan.mjs';
import { engineSourceRoots, realSourceIo } from '../determinism-lint.mjs';
import {
  REQUIRED_TOOL,
  agentDefinitionDir,
  censusAgentSchemaCapability,
  collectEngineLiterals,
  dispatchableAgents,
  engineStringLiterals,
  readAgentDefinitions,
  resolveAgentDefinitionDir,
} from '../agent-schema-lint.mjs';

const REAL_ROOTS = engineSourceRoots();
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const RELOCATED_MODULES = Object.freeze(['agent-schema-lint.mjs', 'determinism-lint.mjs', 'js-scan.mjs']);

async function loadResolverFromNestedCopy() {
  const root = mkdtempSync(join(REPO_ROOT, '.claude-tmp-relocated-resolver-'));
  const nested = join(root, 'nested', 'deeper');
  mkdirSync(nested, { recursive: true });
  for (const name of RELOCATED_MODULES) {
    copyFileSync(fileURLToPath(new URL(`../${name}`, import.meta.url)), join(nested, name));
  }
  const loaded = await import(pathToFileURL(join(nested, 'agent-schema-lint.mjs')).href);
  return Object.freeze({ root, resolveDir: loaded.agentDefinitionDir });
}

function canonicalAgentDir() {
  const resolved = agentDefinitionDir();
  assert.equal(resolved.ok, true, resolved.error);
  return resolved.dir;
}

function resolverIo(entries, home) {
  return {
    pathKind: (path) => (Object.hasOwn(entries, path) ? entries[path].kind : null),
    readText: (path) => {
      if (!Object.hasOwn(entries, path)) throw new Error(`ENOENT ${path}`);
      return entries[path].text;
    },
    realPath: (path) => {
      if (!Object.hasOwn(entries, path)) throw new Error(`ENOENT ${path}`);
      return entries[path].real ?? path;
    },
    homeDir: () => home,
  };
}

function fixtureIo(files) {
  return {
    readDir: (dir) => {
      const prefix = dir.endsWith('/') ? dir : `${dir}/`;
      const names = Object.keys(files)
        .filter((path) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
        .map((path) => path.slice(prefix.length));
      return names.map((name) => ({ name, isFile: () => true }));
    },
    readSource: (path) => {
      if (!Object.hasOwn(files, path)) throw new Error(`ENOENT ${path}`);
      return files[path];
    },
    exists: (path) => Object.hasOwn(files, path),
  };
}

function agentFile(name, tools, extra = '') {
  return `---\nname: ${name}\ndescription: a fixture agent${extra}\ntools: ${tools}\nmodel: opus\n---\n\nbody\n`;
}

function literalsOf(source) {
  const scan = scanJsStructure(source);
  assert.equal(scan.ok, true, scan.error);
  const extracted = engineStringLiterals(source, scan);
  assert.equal(extracted.ok, true, extracted.error);
  return extracted.literals;
}

test('the resolver names the canonical roster from a module relocated into a nested directory', async () => {
  const relocated = await loadResolverFromNestedCopy();
  try {
    assert.deepEqual(
      relocated.resolveDir(),
      agentDefinitionDir(),
      'a copy of this module two directories deeper must name the same roster as the module in the tree; resolving it relative to the module path is what makes every worktree census its own frozen copy',
    );
  } finally {
    rmSync(relocated.root, { recursive: true, force: true });
  }
});

test('a module inside a linked worktree names the primary checkout roster, never the worktree copy', () => {
  const io = resolverIo({
    '/primary/.claude/worktrees/one/.git': { kind: 'file', text: 'gitdir: /primary/.git/worktrees/one\n' },
    '/primary/.git/worktrees/one/commondir': { kind: 'file', text: '../..\n' },
  }, '/home/nobody');
  const resolved = resolveAgentDefinitionDir('/primary/.claude/worktrees/one/.claude/lib/mitosis/', io);
  assert.equal(resolved.ok, true, resolved.error);
  assert.equal(resolved.dir, `${join('/primary', '.claude', 'agents')}${sep}`, 'the common git directory of a linked worktree names the primary checkout, whose roster is the one dispatches are served from');
});

test('a live configuration naming a different roster than the checkout halts rather than picking one', () => {
  const io = resolverIo({
    '/primary/.git': { kind: 'directory' },
    '/home/dev/.claude/agents': { kind: 'directory', real: '/primary/.claude/worktrees/one/.claude/agents' },
    '/primary/.claude/worktrees/one/.claude/agents': { kind: 'directory' },
  }, '/home/dev');
  const resolved = resolveAgentDefinitionDir('/primary/.claude/lib/mitosis/', io);
  assert.equal(resolved.ok, false);
  assert.match(resolved.error, /disagree/);
  assert.match(resolved.error, /\/primary\/\.claude\/worktrees\/one\/\.claude\/agents/);
});

test('a module with no enclosing checkout and no live configuration halts instead of naming a roster', () => {
  const resolved = resolveAgentDefinitionDir('/elsewhere/nested/deeper/', resolverIo({}, '/home/dev'));
  assert.equal(resolved.ok, false);
  assert.match(resolved.error, /refusing to fall back to a directory relative to this module/);
});

test('the derived dispatchable set over the real trees is exactly the agents the engine source names', () => {
  const engine = collectEngineLiterals(REAL_ROOTS, realSourceIo);
  assert.equal(engine.ok, true, engine.error);
  const tree = readAgentDefinitions(canonicalAgentDir(), realSourceIo);
  assert.equal(tree.ok, true, tree.error);
  assert.deepEqual(dispatchableAgents(tree.definitions, engine.literals), [
    'code-reviewer',
    'codebase-analyst',
    'implementer',
    'security-reviewer',
    'test-engineer',
  ], 'the census root is the lib engine source alone; debugger and solution-architect were named only by the legacy workflow file, which is no longer a root');
});

test('an agent is dispatchable exactly when engine source names it, over every definition in the tree', () => {
  const engine = collectEngineLiterals(REAL_ROOTS, realSourceIo);
  assert.equal(engine.ok, true, engine.error);
  const tree = readAgentDefinitions(canonicalAgentDir(), realSourceIo);
  assert.equal(tree.ok, true, tree.error);
  const dispatchable = new Set(dispatchableAgents(tree.definitions, engine.literals));
  const disagreements = tree.definitions
    .filter((definition) => engine.literals.has(definition.name) !== dispatchable.has(definition.name))
    .map((definition) => definition.name);
  assert.deepEqual(disagreements, [], 'the dispatch table is the set of definitions engine source names, with no other membership rule');
  assert.ok(tree.definitions.length > dispatchable.size, 'the tree must hold agents engine source never names, or this relation is vacuous');
});

test('an agent type named in engine source with no definition file carries no frontmatter obligation', () => {
  const engine = collectEngineLiterals(REAL_ROOTS, realSourceIo);
  const tree = readAgentDefinitions(canonicalAgentDir(), realSourceIo);
  assert.equal(engine.literals.has('general-purpose'), true, 'the builtin is dispatched by engine source');
  assert.equal(tree.definitions.some((d) => d.name === 'general-purpose'), false, 'the builtin has no repo definition to lint');
});

test('the census over the real trees is clean', () => {
  const result = censusAgentSchemaCapability(REAL_ROOTS, canonicalAgentDir(), realSourceIo);
  assert.equal(result.ok, true, result.error);
  const named = result.violations.map((v) => `${v.name} (${v.path})`);
  assert.deepEqual(named, [], `these dispatchable agents omit ${REQUIRED_TOOL} from tools:\n${named.join('\n')}`);
});

test('a name that appears only as an identifier or in a comment is not a literal and so is not dispatchable', () => {
  const literals = literalsOf([
    'const researcher = makeAgent();',
    '// dispatch to researcher when unsure',
    'const kind = `researcher`;',
    "const real = 'implementer';",
    '',
  ].join('\n'));
  assert.equal(literals.has('researcher'), false);
  assert.equal(literals.has('implementer'), true);
});

test('StructuredOutput in the description but not in tools: is a violation', () => {
  const io = fixtureIo({
    '/engine/e.mjs': "agent({ agentType: 'reviewer' });\n",
    '/agents/reviewer.md': agentFile('reviewer', 'Read, Grep', `, returns ${REQUIRED_TOOL} verdicts`),
  });
  const result = censusAgentSchemaCapability([{ kind: 'file', path: '/engine/e.mjs' }], '/agents', io);
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(result.violations.map((v) => v.name), ['reviewer']);
});

test('a tools: token that merely contains the required name is not a match', () => {
  const io = fixtureIo({
    '/engine/e.mjs': "agent({ agentType: 'reviewer' });\n",
    '/agents/reviewer.md': agentFile('reviewer', `Read, Not${REQUIRED_TOOL}Really`),
  });
  const result = censusAgentSchemaCapability([{ kind: 'file', path: '/engine/e.mjs' }], '/agents', io);
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(result.violations.map((v) => v.name), ['reviewer']);
});

test('a dispatchable agent that declares the required tool is clean, and a non-dispatchable one is never asked', () => {
  const io = fixtureIo({
    '/engine/e.mjs': "agent({ agentType: 'reviewer' });\n",
    '/agents/reviewer.md': agentFile('reviewer', `Read, ${REQUIRED_TOOL}`),
    '/agents/idle.md': agentFile('idle', 'Read'),
  });
  const result = censusAgentSchemaCapability([{ kind: 'file', path: '/engine/e.mjs' }], '/agents', io);
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(result.violations, []);
  assert.deepEqual(result.dispatchable, ['reviewer']);
});

test('a dispatchable agent with no tools: line halts rather than passing', () => {
  const io = fixtureIo({
    '/engine/e.mjs': "agent({ agentType: 'reviewer' });\n",
    '/agents/reviewer.md': '---\nname: reviewer\ndescription: a fixture agent\nmodel: opus\n---\n\nbody\n',
  });
  const result = censusAgentSchemaCapability([{ kind: 'file', path: '/engine/e.mjs' }], '/agents', io);
  assert.equal(result.ok, false);
  assert.equal(result.kind, 'halt');
  assert.match(result.error, /declares no frontmatter tools/);
});

test('a name that disagrees with the filename stem halts', () => {
  const io = fixtureIo({
    '/engine/e.mjs': "agent({ agentType: 'reviewer' });\n",
    '/agents/reviewer.md': agentFile('reviewer-v2', 'Read'),
  });
  const result = censusAgentSchemaCapability([{ kind: 'file', path: '/engine/e.mjs' }], '/agents', io);
  assert.equal(result.ok, false);
  assert.equal(result.kind, 'halt');
  assert.match(result.error, /filename stem/);
});

test('a definition with no frontmatter fence, no name, or an untokenizable tools line halts', () => {
  const cases = [
    ['no fence', 'name: reviewer\ntools: Read\n', /frontmatter fence/],
    ['unclosed fence', '---\nname: reviewer\ntools: Read\n', /never closed/],
    ['no name', '---\ndescription: x\ntools: Read\n---\n', /name: lines/],
    ['untokenizable tools', agentFile('reviewer', 'Read, {{ generated }}'), /cannot tokenize/],
  ];
  for (const [label, body, pattern] of cases) {
    const result = readAgentDefinitions('/agents', fixtureIo({ '/agents/reviewer.md': body }));
    assert.equal(result.ok, false, label);
    assert.equal(result.kind, 'halt', label);
    assert.match(result.error, pattern, label);
  }
});

test('an agent directory that cannot be read halts as a read failure rather than an empty clean census', () => {
  const result = censusAgentSchemaCapability([{ kind: 'file', path: '/engine/e.mjs' }], '/agents', {
    readDir: () => { throw new Error('EACCES'); },
    readSource: () => "agent({ agentType: 'reviewer' });\n",
    exists: () => true,
  });
  assert.equal(result.ok, false);
  assert.equal(result.kind, 'read');
  assert.match(result.error, /agent definition directory/);
});

test('engine source that cannot be scanned halts rather than deriving a partial table', () => {
  const result = censusAgentSchemaCapability([{ kind: 'file', path: '/engine/e.mjs' }], '/agents', {
    readDir: () => [],
    readSource: () => "const broken = 'unterminated;\n",
    exists: () => true,
  });
  assert.equal(result.ok, false);
  assert.equal(result.kind, 'halt');
});
