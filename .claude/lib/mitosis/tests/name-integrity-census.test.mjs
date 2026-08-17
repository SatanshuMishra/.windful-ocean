import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PLATFORM_AGENT_TYPES,
  censusNameIntegrity,
  censusScope,
  readEngineReferences,
  readMarkdownReferences,
  realCensusIo,
} from '../name-integrity-census.mjs';

const ROOT = '/fixture/.claude';
const DIRS = Object.freeze({
  agents: `${ROOT}/agents/`,
  rules: `${ROOT}/rules/`,
  skills: `${ROOT}/skills/`,
  lib: `${ROOT}/lib/`,
});

const BASE_FILES = Object.freeze({
  [`${ROOT}/agents/implementer.md`]: 'body',
  [`${ROOT}/agents/researcher.md`]: 'body',
  [`${ROOT}/skills/mitosis/SKILL.md`]: 'the `researcher` agent routes here',
  [`${ROOT}/rules/routing.md`]: 'dispatch the `implementer` agent and the `mitosis` skill',
  [`${ROOT}/lib/engine.mjs`]: "const REVIEW_AGENT = 'researcher';\n",
});

function fixtureIo(files, options = {}) {
  const paths = Object.keys(files);
  const normalize = (dir) => (dir.endsWith('/') ? dir : `${dir}/`);
  return {
    readDir: (dir) => {
      const prefix = normalize(dir);
      const names = new Map();
      for (const path of paths) {
        if (!path.startsWith(prefix)) continue;
        const rest = path.slice(prefix.length);
        const cut = rest.indexOf('/');
        if (cut === -1) names.set(rest, false);
        else names.set(rest.slice(0, cut), true);
      }
      return [...names].map(([name, directory]) => ({
        name,
        isFile: () => !directory,
        isDirectory: () => directory,
      }));
    },
    readSource: (path) => {
      if (!Object.hasOwn(files, path)) throw new Error(`ENOENT ${path}`);
      return files[path];
    },
    exists: (path) => Object.hasOwn(files, path),
    pluginManifestPresent: () => options.manifestPresent !== false,
    resolveQualifiedSkill: (reference) => (options.qualified && options.qualified.has(reference)
      ? Object.freeze({ ok: true })
      : Object.freeze({ ok: false, reason: `${reference} resolved to no readable SKILL.md` })),
  };
}

function censusOver(overrides, options) {
  return censusNameIntegrity(DIRS, fixtureIo({ ...BASE_FILES, ...overrides }, options));
}

test('the live configuration is green: every censused name resolves', () => {
  const scope = censusScope();
  assert.equal(scope.ok, true, scope.error);
  const result = censusNameIntegrity(scope.dirs, realCensusIo);
  assert.equal(result.kind, undefined, result.error);
  assert.deepEqual(result.dangling, []);
  assert.equal(result.ok, true);
  for (const tree of ['rules', 'skills', 'lib']) {
    assert.ok(result.perTree[tree] > 0, `${tree} contributed no reference, so its verdict measured nothing`);
  }
});

test('a code span naming an absent agent is red and names its file and line', () => {
  const result = censusOver({ [`${ROOT}/rules/routing.md`]: 'line one\ndispatch the `ghost-agent` agent\n' });
  assert.equal(result.ok, false);
  assert.equal(result.dangling.length, 1);
  assert.deepEqual(
    { path: result.dangling[0].path, line: result.dangling[0].line, token: result.dangling[0].token, role: result.dangling[0].role },
    { path: `${ROOT}/rules/routing.md`, line: 2, token: 'ghost-agent', role: 'agent' },
  );
});

test('a code span naming an absent skill is red and names its file and line', () => {
  const result = censusOver({ [`${ROOT}/skills/mitosis/SKILL.md`]: 'a\nb\nrun the `ghost-skill` skill\n' });
  assert.equal(result.ok, false);
  assert.equal(result.dangling.length, 1);
  assert.deepEqual(
    { path: result.dangling[0].path, line: result.dangling[0].line, token: result.dangling[0].token, role: result.dangling[0].role },
    { path: `${ROOT}/skills/mitosis/SKILL.md`, line: 3, token: 'ghost-skill', role: 'skill' },
  );
});

test('a plugin-qualified skill that no manifest resolves is red', () => {
  const result = censusOver(
    { [`${ROOT}/rules/routing.md`]: 'the `implementer` agent uses the `logbook:ghost` skill' },
    { qualified: new Set(['logbook:debrief']) },
  );
  assert.equal(result.ok, false);
  assert.equal(result.dangling.length, 1);
  assert.equal(result.dangling[0].token, 'logbook:ghost');
  assert.match(result.dangling[0].reason, /no readable SKILL\.md/);
});

test('a plugin-qualified skill is resolved through the manifest when one is installed', () => {
  const result = censusOver(
    { [`${ROOT}/rules/routing.md`]: 'the `implementer` agent uses the `logbook:debrief` skill' },
    { qualified: new Set(['logbook:debrief']) },
  );
  assert.equal(result.ok, true);
  assert.equal(result.pluginManifestAbsent.length, 0);
  assert.ok(result.resolved.some((entry) => entry.token === 'logbook:debrief'));
});

test('a plugin-qualified skill is reported unresolved rather than red where no manifest is installed', () => {
  const result = censusOver(
    { [`${ROOT}/rules/routing.md`]: 'the `implementer` agent uses the `logbook:debrief` skill' },
    { manifestPresent: false },
  );
  assert.equal(result.ok, true);
  assert.equal(result.pluginManifestAbsent.length, 1);
  assert.equal(result.pluginManifestAbsent[0].token, 'logbook:debrief');
});

test('an engine declarator naming an absent agent is red and names its file and line', () => {
  const result = censusOver({ [`${ROOT}/lib/engine.mjs`]: "const a = 1;\nconst REVIEW_AGENT = 'ghost-agent';\n" });
  assert.equal(result.ok, false);
  assert.equal(result.dangling.length, 1);
  assert.deepEqual(
    { path: result.dangling[0].path, line: result.dangling[0].line, token: result.dangling[0].token },
    { path: `${ROOT}/lib/engine.mjs`, line: 2, token: 'ghost-agent' },
  );
});

test('a declarator wrapping its agent types in a value wrapper censuses every element', () => {
  const result = censusOver({
    [`${ROOT}/lib/engine.mjs`]: "const EXEC_AGENT_TYPES = new Set(['researcher', 'ghost-agent', 'general-purpose']);\n",
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.dangling.map((entry) => entry.token), ['ghost-agent']);
  assert.deepEqual(result.resolved.filter((entry) => entry.path.endsWith('engine.mjs')).map((entry) => entry.token), ['researcher', 'general-purpose']);
});

test('a platform agent type resolves without a roster file', () => {
  const result = censusOver({ [`${ROOT}/lib/engine.mjs`]: "const DEFAULT_AGENT = 'general-purpose';\n" });
  assert.equal(result.ok, true);
  assert.ok(PLATFORM_AGENT_TYPES.includes('general-purpose'));
});

test('the platform authority names only the built-in types this configuration dispatches, so a new one is red rather than assumed', () => {
  assert.deepEqual([...PLATFORM_AGENT_TYPES], ['claude', 'general-purpose']);
  const result = censusOver({ [`${ROOT}/lib/engine.mjs`]: "const DEFAULT_AGENT = 'Explore';\n" });
  assert.equal(result.ok, false);
  assert.deepEqual(result.dangling.map((entry) => entry.token), ['Explore']);
});

test('a declared dispatch position holding no readable literal is reported dynamic, never resolved', () => {
  const result = censusOver({
    [`${ROOT}/lib/engine.mjs`]: "const REVIEW_AGENT = 'researcher';\nconst call = { agentType: requireToken(request.agentType, 'agentType', PATTERN) };\n",
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.dynamic.map((entry) => ({ line: entry.line, declarator: entry.declarator })), [{ line: 2, declarator: 'agentType' }]);
  assert.equal(result.dangling.length, 0);
});

test('a binding whose head noun is not an agent is outside the grammar', () => {
  const result = censusOver({
    [`${ROOT}/lib/engine.mjs`]: "const REVIEW_AGENT = 'researcher';\nconst PR_AGENT_LABEL = 'mitosis-engine';\nconst AGENT_SEGMENTS = Object.freeze(['agents']);\n",
  });
  assert.equal(result.ok, true);
  assert.equal(result.dangling.length, 0);
});

test('a name outside both namespaces is reported foreign with its file and line, never silently dropped', () => {
  const result = censusOver({ [`${ROOT}/rules/routing.md`]: 'the `implementer` agent\nuse the `foreign_producer` subagent\n' });
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.foreign.map((entry) => ({ path: entry.path, line: entry.line, token: entry.token })),
    [{ path: `${ROOT}/rules/routing.md`, line: 2, token: 'foreign_producer' }],
  );
});

test('a code span the census cannot read as a single name halts rather than guessing', () => {
  const result = censusOver({ [`${ROOT}/rules/routing.md`]: 'dispatch the `two words here` agent' });
  assert.equal(result.ok, false);
  assert.equal(result.kind, 'halt');
  assert.match(result.error, /routing\.md:1/);
  assert.match(result.error, /refusing to guess/);
});

test('a plugin-qualified name in an agent role halts rather than guessing', () => {
  const result = censusOver({ [`${ROOT}/rules/routing.md`]: 'dispatch the `plugin:worker` agent' });
  assert.equal(result.ok, false);
  assert.equal(result.kind, 'halt');
  assert.match(result.error, /refusing to guess/);
});

test('a tree that yields no reference at all halts rather than reporting integrity it never measured', () => {
  const result = censusOver({ [`${ROOT}/rules/routing.md`]: 'no routing instruction here' });
  assert.equal(result.ok, false);
  assert.equal(result.kind, 'halt');
  assert.match(result.error, /yielded no agent or skill reference at all/);
});

test('an unscanned script extension in the engine tree halts', () => {
  const result = censusOver({ [`${ROOT}/lib/helper.ts`]: 'export const x = 1;' });
  assert.equal(result.ok, false);
  assert.equal(result.kind, 'halt');
  assert.match(result.error, /helper\.ts/);
});

test('an unread asset outside the engine tree is counted rather than halting', () => {
  const result = censusOver({ [`${ROOT}/skills/mitosis/page.html`]: '<p>asset</p>' });
  assert.equal(result.ok, true);
  assert.equal(result.unreadCount, 1);
});

test('the markdown grammar reads the role noun that follows the span', () => {
  const read = readMarkdownReferences('r.md', 'the `alpha` agent, the `beta` skills, the `gamma` subagent');
  assert.equal(read.ok, true);
  assert.deepEqual(read.references.map((entry) => [entry.token, entry.role]), [['alpha', 'agent'], ['beta', 'skill'], ['gamma', 'agent']]);
});

test('the engine grammar reads a literal past a fallback operator', () => {
  const read = readEngineReferences('e.mjs', "const task = { agentType: t.agentType || 'implementer', label: 'x' };\n");
  assert.equal(read.ok, true);
  assert.deepEqual(read.references.map((entry) => entry.token), ['implementer']);
});
