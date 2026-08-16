import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { dispatch } from '../dispatch.mjs';

const SCHEMA = Object.freeze({ type: 'object', properties: { status: { type: 'string' } } });
const SPAWN_REACHED_ERROR = 'dispatch: could not run claude: spawn reached';

const scratchDirs = [];

function makeScratchDir() {
  const dir = mkdtempSync(join(tmpdir(), 'dispatch-schema-capable-'));
  scratchDirs.push(dir);
  return dir;
}

after(() => {
  for (const dir of scratchDirs) rmSync(dir, { recursive: true, force: true });
});

function writeAgentDefinition(projectDir, agentName, body) {
  const agentsDir = join(projectDir, '.claude', 'agents');
  mkdirSync(agentsDir, { recursive: true });
  writeFileSync(join(agentsDir, `${agentName}.md`), body);
}

function incapableAgentBody(name) {
  return `---\nname: ${name}\ntools: Read, Grep\n---\n\nbody\n`;
}

function capableAgentBody(name) {
  return `---\nname: ${name}\ntools: Read, StructuredOutput\n---\n\nbody\n`;
}

function noToolsLineAgentBody(name) {
  return `---\nname: ${name}\n---\n\nbody\n`;
}

function malformedFrontmatterBody() {
  return 'not a fence at all\ntools: Read\n---\n\nbody\n';
}

function unclosedFrontmatterBody() {
  return '---\nname: whatever\ntools: Read\n\nbody with no closing fence\n';
}

function twoToolsLinesBody(name) {
  return `---\nname: ${name}\ntools: Read\ntools: StructuredOutput\n---\n\nbody\n`;
}

function spawnCounter() {
  let spawnCalls = 0;
  const spawn = () => {
    spawnCalls += 1;
    throw new Error('spawn reached');
  };
  return { spawn, getCalls: () => spawnCalls };
}

async function rejectionMessage(promise) {
  try {
    await promise;
  } catch (error) {
    return error.message;
  }
  throw new Error('expected the dispatch call to reject, but it resolved');
}

test('an incapable agent with a schema rejects before spawn', async () => {
  const projectDir = makeScratchDir();
  writeAgentDefinition(projectDir, 'reviewer', incapableAgentBody('reviewer'));
  const { spawn, getCalls } = spawnCounter();
  const message = await rejectionMessage(
    dispatch({ prompt: 'x', agentType: 'reviewer', schema: SCHEMA, cwd: projectDir }, { spawn }),
  );
  assert.equal(
    message,
    `dispatch: a schema was requested for agent "reviewer" whose definition at ${join(projectDir, '.claude', 'agents', 'reviewer.md')} declares a tools: allowlist without StructuredOutput, so the CLI would silently drop the schema; refusing to spawn`,
  );
  assert.equal(getCalls(), 0);
});

test('a capable agent with a schema reaches spawn', async () => {
  const projectDir = makeScratchDir();
  writeAgentDefinition(projectDir, 'implementer', capableAgentBody('implementer'));
  const { spawn, getCalls } = spawnCounter();
  const result = await dispatch({ prompt: 'x', agentType: 'implementer', schema: SCHEMA, cwd: projectDir }, { spawn });
  assert.equal(result.ok, false);
  assert.equal(result.error, SPAWN_REACHED_ERROR);
  assert.equal(getCalls(), 1);
});

test('an agent definition with no tools line inherits capability and reaches spawn', async () => {
  const projectDir = makeScratchDir();
  writeAgentDefinition(projectDir, 'implementer', noToolsLineAgentBody('implementer'));
  const { spawn, getCalls } = spawnCounter();
  const result = await dispatch({ prompt: 'x', agentType: 'implementer', schema: SCHEMA, cwd: projectDir }, { spawn });
  assert.equal(result.ok, false);
  assert.equal(result.error, SPAWN_REACHED_ERROR);
  assert.equal(getCalls(), 1);
});

test('an agent name with no definition file anywhere rejects before spawn', async () => {
  const projectDir = makeScratchDir();
  const { spawn, getCalls } = spawnCounter();
  const message = await rejectionMessage(
    dispatch({ prompt: 'x', agentType: 'zz-absent-probe-agent', schema: SCHEMA, cwd: projectDir }, { spawn }),
  );
  const projectPath = join(projectDir, '.claude', 'agents', 'zz-absent-probe-agent.md');
  const homePath = join(homedir(), '.claude', 'agents', 'zz-absent-probe-agent.md');
  assert.equal(
    message,
    `dispatch: a schema was requested for agent "zz-absent-probe-agent" but no definition exists at ${projectPath} or ${homePath}, so its StructuredOutput capability cannot be established; refusing to spawn`,
  );
  assert.equal(getCalls(), 0);
});

test('an incapable agent with no schema reaches spawn unaffected', async () => {
  const projectDir = makeScratchDir();
  writeAgentDefinition(projectDir, 'reviewer', incapableAgentBody('reviewer'));
  const { spawn, getCalls } = spawnCounter();
  const result = await dispatch({ prompt: 'x', agentType: 'reviewer', cwd: projectDir }, { spawn });
  assert.equal(result.ok, false);
  assert.equal(result.error, SPAWN_REACHED_ERROR);
  assert.equal(getCalls(), 1);
});

test('a schema with no agentType reaches spawn unaffected', async () => {
  const projectDir = makeScratchDir();
  const { spawn, getCalls } = spawnCounter();
  const result = await dispatch({ prompt: 'x', schema: SCHEMA, cwd: projectDir }, { spawn });
  assert.equal(result.ok, false);
  assert.equal(result.error, SPAWN_REACHED_ERROR);
  assert.equal(getCalls(), 1);
});

test('malformed frontmatter with no opening fence rejects before spawn', async () => {
  const projectDir = makeScratchDir();
  writeAgentDefinition(projectDir, 'implementer', malformedFrontmatterBody());
  const { spawn, getCalls } = spawnCounter();
  const message = await rejectionMessage(
    dispatch({ prompt: 'x', agentType: 'implementer', schema: SCHEMA, cwd: projectDir }, { spawn }),
  );
  assert.equal(
    message,
    `dispatch: a schema was requested for agent "implementer" whose definition at ${join(projectDir, '.claude', 'agents', 'implementer.md')} does not open with a --- frontmatter fence, so its StructuredOutput capability cannot be established; refusing to spawn`,
  );
  assert.equal(getCalls(), 0);
});

test('an unclosed frontmatter block rejects before spawn', async () => {
  const projectDir = makeScratchDir();
  writeAgentDefinition(projectDir, 'implementer', unclosedFrontmatterBody());
  const { spawn, getCalls } = spawnCounter();
  const message = await rejectionMessage(
    dispatch({ prompt: 'x', agentType: 'implementer', schema: SCHEMA, cwd: projectDir }, { spawn }),
  );
  assert.equal(
    message,
    `dispatch: a schema was requested for agent "implementer" whose definition at ${join(projectDir, '.claude', 'agents', 'implementer.md')} opens a frontmatter block that is never closed, so its StructuredOutput capability cannot be established; refusing to spawn`,
  );
  assert.equal(getCalls(), 0);
});

test('two frontmatter tools: lines reject before spawn', async () => {
  const projectDir = makeScratchDir();
  writeAgentDefinition(projectDir, 'implementer', twoToolsLinesBody('implementer'));
  const { spawn, getCalls } = spawnCounter();
  const message = await rejectionMessage(
    dispatch({ prompt: 'x', agentType: 'implementer', schema: SCHEMA, cwd: projectDir }, { spawn }),
  );
  assert.equal(
    message,
    `dispatch: a schema was requested for agent "implementer" whose definition at ${join(projectDir, '.claude', 'agents', 'implementer.md')} carries 2 frontmatter tools: lines, so its StructuredOutput capability cannot be established; refusing to spawn`,
  );
  assert.equal(getCalls(), 0);
});

test('an injected agentCapability returning an empty object rejects as a malformed verdict', async () => {
  const projectDir = makeScratchDir();
  const { spawn, getCalls } = spawnCounter();
  const message = await rejectionMessage(
    dispatch({ prompt: 'x', agentType: 'reviewer', schema: SCHEMA, cwd: projectDir }, { spawn, agentCapability: () => ({}) }),
  );
  assert.equal(
    message,
    'dispatch: deps.agentCapability returned no verdict for agent "reviewer", so its StructuredOutput capability cannot be established; refusing to spawn',
  );
  assert.equal(getCalls(), 0);
});

test('an injected agentCapability that is not a function is rejected', async () => {
  const projectDir = makeScratchDir();
  const { spawn, getCalls } = spawnCounter();
  const message = await rejectionMessage(
    dispatch({ prompt: 'x', agentType: 'reviewer', schema: SCHEMA, cwd: projectDir }, { spawn, agentCapability: 'not-a-function' }),
  );
  assert.equal(message, 'dispatch: deps.agentCapability must be a function');
  assert.equal(getCalls(), 0);
});

test('an injected agentCapability records the default project dir when no cwd is given', async () => {
  const recorded = [];
  const { spawn } = spawnCounter();
  const agentCapability = (agentType, projectDir) => {
    recorded.push(projectDir);
    return { ok: true, path: '/irrelevant' };
  };
  await dispatch({ prompt: 'x', agentType: 'reviewer', schema: SCHEMA }, { spawn, agentCapability });
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0], process.cwd());
});

test('an injected agentCapability records the supplied cwd', async () => {
  const projectDir = makeScratchDir();
  const recorded = [];
  const { spawn } = spawnCounter();
  const agentCapability = (agentType, projectDir2) => {
    recorded.push(projectDir2);
    return { ok: true, path: '/irrelevant' };
  };
  await dispatch({ prompt: 'x', agentType: 'reviewer', schema: SCHEMA, cwd: projectDir }, { spawn, agentCapability });
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0], projectDir);
});
