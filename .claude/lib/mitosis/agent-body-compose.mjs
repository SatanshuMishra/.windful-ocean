import { renderFragment } from './agent-body-fragments.mjs';
import { resolveSkillPointers } from './agent-skill-pointers.mjs';

export const PROCEDURE_HEADING = 'Procedures (read before you start)';

const AGENT_NAME = /^[a-z0-9][a-z0-9-]*$/;
const REQUIRED_STRINGS = ['name', 'description', 'model'];

function requireArrayOfStrings(value, field, agentName) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.length === 0)) {
    throw new Error(`agent ${agentName}: ${field} must be an array of non-empty strings`);
  }
  return value;
}

export function validateAgentSpec(spec) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    throw new Error('an agent spec must be an object carrying at least name, description, model, tools and sections');
  }
  const label = typeof spec.name === 'string' && spec.name.length > 0 ? spec.name : '(unnamed)';
  for (const field of REQUIRED_STRINGS) {
    if (typeof spec[field] !== 'string' || spec[field].length === 0) {
      throw new Error(`agent ${label}: ${field} must be a non-empty string`);
    }
  }
  if (!AGENT_NAME.test(spec.name)) {
    throw new Error(`agent name ${JSON.stringify(spec.name)} must match ${AGENT_NAME.source}; it becomes the dispatch identifier and a filename`);
  }
  if (spec.description.includes('\n')) {
    throw new Error(`agent ${label}: description must be a single line because it is a frontmatter scalar`);
  }
  requireArrayOfStrings(spec.tools, 'tools', label);
  if (spec.tools.length === 0) {
    throw new Error(`agent ${label}: tools must name at least one tool because the field is a strict allowlist`);
  }
  requireArrayOfStrings(spec.fragments || [], 'fragments', label);
  requireArrayOfStrings(spec.skills || [], 'skills', label);
  requireArrayOfStrings(spec.procedures || [], 'procedures', label);
  requireArrayOfStrings(spec.mcpServers || [], 'mcpServers', label);
  if (!Array.isArray(spec.sections) || spec.sections.length === 0) {
    throw new Error(`agent ${label}: sections must be a non-empty array of {heading, body} objects carrying the per-agent text`);
  }
  for (const section of spec.sections) {
    if (!section || typeof section.heading !== 'string' || section.heading.length === 0 || typeof section.body !== 'string' || section.body.length === 0) {
      throw new Error(`agent ${label}: every section needs a non-empty heading and a non-empty body`);
    }
  }
  if (typeof spec.summary !== 'string' || spec.summary.length === 0) {
    throw new Error(`agent ${label}: summary must be a non-empty string; it is the opening line of the body`);
  }
  return spec;
}

function renderFrontmatter(spec) {
  const lines = [
    '---',
    `name: ${spec.name}`,
    `description: ${spec.description}`,
    `tools: ${spec.tools.join(', ')}`,
    `model: ${spec.model}`,
  ];
  if (typeof spec.color === 'string' && spec.color.length > 0) lines.push(`color: ${spec.color}`);
  for (const [field, values] of [['skills', spec.skills || []], ['mcpServers', spec.mcpServers || []]]) {
    if (values.length === 0) continue;
    lines.push(`${field}:`);
    for (const value of values) lines.push(`  - ${value}`);
  }
  lines.push('---');
  return `${lines.join('\n')}\n`;
}

function renderProcedures(pointers) {
  if (pointers.length === 0) return '';
  const lines = pointers.map((pointer) => `- \`${pointer.reference}\` — ${pointer.path}`);
  return `## ${PROCEDURE_HEADING}\n\n${lines.join('\n')}\n`;
}

export function composeAgentBody(spec, options = {}) {
  validateAgentSpec(spec);
  const pointers = resolveSkillPointers(spec.procedures || [], options);
  const blocks = [renderFrontmatter(spec), `${spec.summary}\n`];
  for (const section of spec.sections) blocks.push(`## ${section.heading}\n\n${section.body}\n`);
  const procedures = renderProcedures(pointers);
  if (procedures.length > 0) blocks.push(procedures);
  for (const name of spec.fragments || []) blocks.push(renderFragment(name));
  return `${blocks.join('\n')}`;
}
