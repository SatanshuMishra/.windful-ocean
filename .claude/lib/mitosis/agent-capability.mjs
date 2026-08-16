import { homedir } from 'node:os';
import { join } from 'node:path';
import { REQUIRED_TOOL } from './agent-schema-lint.mjs';
import { realSourceIo } from './determinism-lint.mjs';

const FRONTMATTER_FENCE = '---';
const TOOLS_LINE = /^tools:\s*(\S.*?)\s*$/;

function noDefinitionError(agentType, candidates) {
  return `dispatch: a schema was requested for agent "${agentType}" but no definition exists at ${candidates.join(' or ')}, so its ${REQUIRED_TOOL} capability cannot be established; refusing to spawn`;
}

function unreadableError(agentType, path, error) {
  const detail = error && typeof error.message === 'string' && error.message.length > 0 ? error.message : 'unknown failure';
  return `dispatch: a schema was requested for agent "${agentType}" whose definition at ${path} could not be read: ${detail}, so its ${REQUIRED_TOOL} capability cannot be established; refusing to spawn`;
}

function noFenceError(agentType, path) {
  return `dispatch: a schema was requested for agent "${agentType}" whose definition at ${path} does not open with a --- frontmatter fence, so its ${REQUIRED_TOOL} capability cannot be established; refusing to spawn`;
}

function unclosedFenceError(agentType, path) {
  return `dispatch: a schema was requested for agent "${agentType}" whose definition at ${path} opens a frontmatter block that is never closed, so its ${REQUIRED_TOOL} capability cannot be established; refusing to spawn`;
}

function multipleToolsLinesError(agentType, path, count) {
  return `dispatch: a schema was requested for agent "${agentType}" whose definition at ${path} carries ${count} frontmatter tools: lines, so its ${REQUIRED_TOOL} capability cannot be established; refusing to spawn`;
}

function missingRequiredToolError(agentType, path) {
  return `dispatch: a schema was requested for agent "${agentType}" whose definition at ${path} declares a tools: allowlist without ${REQUIRED_TOOL}, so the CLI would silently drop the schema; refusing to spawn`;
}

export function agentDefinitionCandidates(agentType, projectDir, homeDir) {
  const projectPath = join(projectDir, '.claude', 'agents', `${agentType}.md`);
  const homePath = join(homeDir, '.claude', 'agents', `${agentType}.md`);
  if (projectPath === homePath) return Object.freeze([projectPath]);
  return Object.freeze([projectPath, homePath]);
}

export function agentSchemaCapability(agentType, projectDir, homeDir, io) {
  const candidates = agentDefinitionCandidates(agentType, projectDir, homeDir);
  const winner = candidates.find((candidate) => io.exists(candidate));
  if (winner === undefined) {
    return Object.freeze({ ok: false, error: noDefinitionError(agentType, candidates) });
  }
  let source;
  try {
    source = io.readSource(winner);
  } catch (error) {
    return Object.freeze({ ok: false, error: unreadableError(agentType, winner, error) });
  }
  const lines = source.split('\n');
  if (lines[0] !== FRONTMATTER_FENCE) {
    return Object.freeze({ ok: false, error: noFenceError(agentType, winner) });
  }
  const end = lines.indexOf(FRONTMATTER_FENCE, 1);
  if (end === -1) {
    return Object.freeze({ ok: false, error: unclosedFenceError(agentType, winner) });
  }
  const block = lines.slice(1, end);
  const toolsLines = block.map((line) => TOOLS_LINE.exec(line)).filter((match) => match !== null);
  if (toolsLines.length > 1) {
    return Object.freeze({ ok: false, error: multipleToolsLinesError(agentType, winner, toolsLines.length) });
  }
  if (toolsLines.length === 0) {
    return Object.freeze({ ok: true, path: winner });
  }
  const tools = toolsLines[0][1].split(',').map((token) => token.trim());
  if (tools.includes(REQUIRED_TOOL)) {
    return Object.freeze({ ok: true, path: winner });
  }
  return Object.freeze({ ok: false, error: missingRequiredToolError(agentType, winner) });
}

export function realAgentCapability(agentType, projectDir) {
  return agentSchemaCapability(agentType, projectDir, homedir(), realSourceIo);
}
