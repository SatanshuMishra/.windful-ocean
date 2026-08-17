import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { agentDefinitionCandidates, agentSchemaCapability } from '../agent-capability.mjs';

const PROJECT_DIR = '/project';
const HOME_DIR = '/home/user';

function fakeIo(entries) {
  const map = new Map(Object.entries(entries));
  return {
    exists: (path) => map.has(path),
    readSource: (path) => {
      const entry = map.get(path);
      if (entry === undefined) throw new Error(`ENOENT: ${path}`);
      if (entry instanceof Error) throw entry;
      return entry;
    },
  };
}

function agentFile(name, toolsLine) {
  return toolsLine === undefined
    ? `---\nname: ${name}\n---\n\nbody\n`
    : `---\nname: ${name}\ntools: ${toolsLine}\n---\n\nbody\n`;
}

test('agentDefinitionCandidates returns the project-local path first, then the user-level path', () => {
  const candidates = agentDefinitionCandidates('reviewer', PROJECT_DIR, HOME_DIR);
  assert.deepEqual(candidates, [
    join(PROJECT_DIR, '.claude', 'agents', 'reviewer.md'),
    join(HOME_DIR, '.claude', 'agents', 'reviewer.md'),
  ]);
});

test('agentDefinitionCandidates dedupes to one path when projectDir equals homeDir', () => {
  const candidates = agentDefinitionCandidates('reviewer', PROJECT_DIR, PROJECT_DIR);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0], join(PROJECT_DIR, '.claude', 'agents', 'reviewer.md'));
});

test('a capable project-local definition shadows an incapable user-level one', () => {
  const projectPath = join(PROJECT_DIR, '.claude', 'agents', 'reviewer.md');
  const homePath = join(HOME_DIR, '.claude', 'agents', 'reviewer.md');
  const io = fakeIo({
    [projectPath]: agentFile('reviewer', 'Read, StructuredOutput'),
    [homePath]: agentFile('reviewer', 'Read, Grep'),
  });
  const result = agentSchemaCapability('reviewer', PROJECT_DIR, HOME_DIR, io);
  assert.equal(result.ok, true);
  assert.equal(result.path, projectPath);
});

test('an incapable project-local definition shadows a capable user-level one', () => {
  const projectPath = join(PROJECT_DIR, '.claude', 'agents', 'reviewer.md');
  const homePath = join(HOME_DIR, '.claude', 'agents', 'reviewer.md');
  const io = fakeIo({
    [projectPath]: agentFile('reviewer', 'Read, Grep'),
    [homePath]: agentFile('reviewer', 'Read, StructuredOutput'),
  });
  const result = agentSchemaCapability('reviewer', PROJECT_DIR, HOME_DIR, io);
  assert.equal(result.ok, false);
  assert.equal(
    result.error,
    `dispatch: a schema was requested for agent "reviewer" whose definition at ${projectPath} declares a tools: allowlist without StructuredOutput, so the CLI would silently drop the schema; refusing to spawn`,
  );
});

test('the user-level definition is used when the project-local one is absent', () => {
  const homePath = join(HOME_DIR, '.claude', 'agents', 'reviewer.md');
  const io = fakeIo({
    [homePath]: agentFile('reviewer', 'Read, StructuredOutput'),
  });
  const result = agentSchemaCapability('reviewer', PROJECT_DIR, HOME_DIR, io);
  assert.equal(result.ok, true);
  assert.equal(result.path, homePath);
});

test('no definition anywhere fails closed with both candidate paths named', () => {
  const io = fakeIo({});
  const projectPath = join(PROJECT_DIR, '.claude', 'agents', 'reviewer.md');
  const homePath = join(HOME_DIR, '.claude', 'agents', 'reviewer.md');
  const result = agentSchemaCapability('reviewer', PROJECT_DIR, HOME_DIR, io);
  assert.equal(result.ok, false);
  assert.equal(
    result.error,
    `dispatch: a schema was requested for agent "reviewer" but no definition exists at ${projectPath} or ${homePath}, so its StructuredOutput capability cannot be established; refusing to spawn`,
  );
});

test('io.readSource throwing fails closed with the thrown message included', () => {
  const projectPath = join(PROJECT_DIR, '.claude', 'agents', 'reviewer.md');
  const io = {
    exists: (path) => path === projectPath,
    readSource: () => { throw new Error('permission denied'); },
  };
  const result = agentSchemaCapability('reviewer', PROJECT_DIR, HOME_DIR, io);
  assert.equal(result.ok, false);
  assert.equal(
    result.error,
    `dispatch: a schema was requested for agent "reviewer" whose definition at ${projectPath} could not be read: permission denied, so its StructuredOutput capability cannot be established; refusing to spawn`,
  );
});

test('io.readSource throwing a value with no message is described as unknown failure rather than crashing', () => {
  const projectPath = join(PROJECT_DIR, '.claude', 'agents', 'reviewer.md');
  const io = {
    exists: (path) => path === projectPath,
    readSource: () => { throw {}; },
  };
  const result = agentSchemaCapability('reviewer', PROJECT_DIR, HOME_DIR, io);
  assert.equal(result.ok, false);
  assert.equal(
    result.error,
    `dispatch: a schema was requested for agent "reviewer" whose definition at ${projectPath} could not be read: unknown failure, so its StructuredOutput capability cannot be established; refusing to spawn`,
  );
});

test('io.readSource throwing an Error with an empty message is described as unknown failure rather than a blank detail', () => {
  const projectPath = join(PROJECT_DIR, '.claude', 'agents', 'reviewer.md');
  const io = {
    exists: (path) => path === projectPath,
    readSource: () => { throw new Error(''); },
  };
  const result = agentSchemaCapability('reviewer', PROJECT_DIR, HOME_DIR, io);
  assert.equal(result.ok, false);
  assert.equal(
    result.error,
    `dispatch: a schema was requested for agent "reviewer" whose definition at ${projectPath} could not be read: unknown failure, so its StructuredOutput capability cannot be established; refusing to spawn`,
  );
});

test('io.readSource throwing an Error with a single-character message keeps that message rather than falling back', () => {
  const projectPath = join(PROJECT_DIR, '.claude', 'agents', 'reviewer.md');
  const io = {
    exists: (path) => path === projectPath,
    readSource: () => { throw new Error('x'); },
  };
  const result = agentSchemaCapability('reviewer', PROJECT_DIR, HOME_DIR, io);
  assert.equal(result.ok, false);
  assert.equal(
    result.error,
    `dispatch: a schema was requested for agent "reviewer" whose definition at ${projectPath} could not be read: x, so its StructuredOutput capability cannot be established; refusing to spawn`,
  );
});

test('a definition with no opening --- fence fails closed', () => {
  const projectPath = join(PROJECT_DIR, '.claude', 'agents', 'reviewer.md');
  const io = fakeIo({ [projectPath]: 'not a fence\ntools: Read\n---\n' });
  const result = agentSchemaCapability('reviewer', PROJECT_DIR, HOME_DIR, io);
  assert.equal(result.ok, false);
  assert.equal(
    result.error,
    `dispatch: a schema was requested for agent "reviewer" whose definition at ${projectPath} does not open with a --- frontmatter fence, so its StructuredOutput capability cannot be established; refusing to spawn`,
  );
});

test('a definition whose frontmatter block never closes fails closed', () => {
  const projectPath = join(PROJECT_DIR, '.claude', 'agents', 'reviewer.md');
  const io = fakeIo({ [projectPath]: '---\nname: reviewer\ntools: Read\n\nbody\n' });
  const result = agentSchemaCapability('reviewer', PROJECT_DIR, HOME_DIR, io);
  assert.equal(result.ok, false);
  assert.equal(
    result.error,
    `dispatch: a schema was requested for agent "reviewer" whose definition at ${projectPath} opens a frontmatter block that is never closed, so its StructuredOutput capability cannot be established; refusing to spawn`,
  );
});

test('a definition with two tools: lines fails closed with the count named', () => {
  const projectPath = join(PROJECT_DIR, '.claude', 'agents', 'reviewer.md');
  const io = fakeIo({ [projectPath]: '---\nname: reviewer\ntools: Read\ntools: StructuredOutput\n---\n' });
  const result = agentSchemaCapability('reviewer', PROJECT_DIR, HOME_DIR, io);
  assert.equal(result.ok, false);
  assert.equal(
    result.error,
    `dispatch: a schema was requested for agent "reviewer" whose definition at ${projectPath} carries 2 frontmatter tools: lines, so its StructuredOutput capability cannot be established; refusing to spawn`,
  );
});

test('a definition with no tools: line is treated as capable (inherits the full tool set)', () => {
  const projectPath = join(PROJECT_DIR, '.claude', 'agents', 'reviewer.md');
  const io = fakeIo({ [projectPath]: agentFile('reviewer') });
  const result = agentSchemaCapability('reviewer', PROJECT_DIR, HOME_DIR, io);
  assert.equal(result.ok, true);
  assert.equal(result.path, projectPath);
});

test('a tools: line carrying StructuredOutput among many tokens with irregular spacing is capable', () => {
  const projectPath = join(PROJECT_DIR, '.claude', 'agents', 'reviewer.md');
  const io = fakeIo({ [projectPath]: agentFile('reviewer', 'Read,  Grep ,StructuredOutput,   Bash') });
  const result = agentSchemaCapability('reviewer', PROJECT_DIR, HOME_DIR, io);
  assert.equal(result.ok, true);
  assert.equal(result.path, projectPath);
});

test('a tools: line without StructuredOutput is incapable', () => {
  const projectPath = join(PROJECT_DIR, '.claude', 'agents', 'reviewer.md');
  const io = fakeIo({ [projectPath]: agentFile('reviewer', 'Read, Grep, Bash') });
  const result = agentSchemaCapability('reviewer', PROJECT_DIR, HOME_DIR, io);
  assert.equal(result.ok, false);
  assert.equal(
    result.error,
    `dispatch: a schema was requested for agent "reviewer" whose definition at ${projectPath} declares a tools: allowlist without StructuredOutput, so the CLI would silently drop the schema; refusing to spawn`,
  );
});
