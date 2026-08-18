import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSkillPointer } from '../agent-skill-pointers.mjs';

const AGENT_DIR = fileURLToPath(new URL('../../../agents/', import.meta.url));
const SKILL_TREE = fileURLToPath(new URL('../../../skills/', import.meta.url));
const CONFIG_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

export const LEAD_NAMES = Object.freeze(['architect', 'delivery-lead', 'investigator']);

export const REQUIRED_LEAD_TOOLS = Object.freeze(['StructuredOutput', 'Agent', 'Skill']);

export const SKILL_BYTE_CEILING = 4096;

const FENCE = '---';
const QUALIFIED_REFERENCE = /^[a-z0-9][a-z0-9-]*:[a-z0-9][a-z0-9-]*$/;
const LOCAL_REFERENCE = /^[a-z0-9][a-z0-9-]*$/;
const SCALAR_LINE = /^([a-z][A-Za-z]*):\s*(\S.*?)\s*$/;
const LIST_FIELD_LINE = /^([a-z][A-Za-z]*):\s*$/;
const LIST_ITEM_LINE = /^ {2}-\s+(\S.*?)\s*$/;
const POINTER_LINE = /^- `([^`]+)` — (\S.*?)$/;

export function parseFrontmatter(source, label) {
  const lines = source.split('\n');
  assert.equal(lines[0], FENCE, `${label} does not open with a frontmatter fence`);
  const end = lines.indexOf(FENCE, 1);
  assert.ok(end > 0, `${label} opens a frontmatter block that is never closed`);
  const scalars = {};
  const lists = {};
  let openList = null;
  for (const line of lines.slice(1, end)) {
    const item = LIST_ITEM_LINE.exec(line);
    if (item !== null) {
      assert.ok(openList !== null, `${label} carries the list item ${JSON.stringify(line)} under no list field`);
      lists[openList].push(item[1]);
      continue;
    }
    const listField = LIST_FIELD_LINE.exec(line);
    if (listField !== null) {
      openList = listField[1];
      lists[openList] = [];
      continue;
    }
    const scalar = SCALAR_LINE.exec(line);
    assert.ok(scalar !== null, `${label} carries the frontmatter line ${JSON.stringify(line)} this census cannot classify`);
    assert.ok(scalars[scalar[1]] === undefined, `${label} declares ${scalar[1]} more than once`);
    scalars[scalar[1]] = scalar[2];
    openList = null;
  }
  return Object.freeze({ scalars: Object.freeze(scalars), lists: Object.freeze(lists), body: lines.slice(end + 1).join('\n') });
}

export function toolsOf(frontmatter, label) {
  const declared = frontmatter.scalars.tools;
  assert.ok(typeof declared === 'string' && declared.length > 0, `${label} declares no frontmatter tools line, so its allowlist grants nothing`);
  return Object.freeze(declared.split(',').map((token) => token.trim()));
}

export function assertLeadToolGrant(tools, label) {
  const missing = REQUIRED_LEAD_TOOLS.filter((tool) => !tools.includes(tool));
  assert.deepEqual(missing, [], `${label} omits ${missing.join(', ')} from its tools allowlist; a tool absent from that line does not exist for the agent`);
}

export function resolveSkillReference(reference, label) {
  if (QUALIFIED_REFERENCE.test(reference)) {
    const pointer = resolveSkillPointer({ reference });
    return Object.freeze({ reference, kind: 'plugin', path: pointer.path });
  }
  if (LOCAL_REFERENCE.test(reference)) {
    const path = join(SKILL_TREE, reference, 'SKILL.md');
    assert.ok(existsSync(path), `${label} names the project skill ${JSON.stringify(reference)} but ${path} does not exist; an unknown name logs a warning and spawns the agent without it`);
    return Object.freeze({ reference, kind: 'project', path });
  }
  assert.fail(`${label} names the skill reference ${JSON.stringify(reference)}, which is neither a plugin-qualified plugin:skill nor a project-local skill name; this census refuses to guess which namespace is meant`);
}

export function pointerLinesOf(body) {
  const pointers = [];
  let inside = false;
  for (const line of body.split('\n')) {
    if (line.startsWith('## ')) {
      inside = line === '## Procedures (read before you start)';
      continue;
    }
    if (!inside || line.length === 0) continue;
    const matched = POINTER_LINE.exec(line);
    assert.ok(matched !== null, `a Procedures block carries ${JSON.stringify(line)}, which this census cannot read as a pointer`);
    pointers.push(Object.freeze({ reference: matched[1], path: matched[2] }));
  }
  return Object.freeze(pointers);
}

function lead(name) {
  const path = join(AGENT_DIR, `${name}.md`);
  assert.ok(existsSync(path), `${path} does not exist, so this unit generated no body for ${name}`);
  const source = readFileSync(path, 'utf8');
  return Object.freeze({ name, path, source, frontmatter: parseFrontmatter(source, path) });
}

test('every Lead body this unit generates exists and is addressed by its own filename', () => {
  for (const name of LEAD_NAMES) {
    const subject = lead(name);
    assert.equal(subject.frontmatter.scalars.name, name, `${subject.path} declares a name its filename does not carry`);
    assert.equal(subject.frontmatter.scalars.model, 'opus', `${subject.path} is a Lead and must run on opus`);
  }
});

test('every Lead declares StructuredOutput, Agent and Skill in its tools allowlist', () => {
  for (const name of LEAD_NAMES) {
    const subject = lead(name);
    assertLeadToolGrant(toolsOf(subject.frontmatter, subject.path), subject.path);
  }
});

test('the tool-grant assertion turns red when any one of the three tools is removed', () => {
  const granted = Object.freeze(['Read', 'Bash', 'Agent', 'Skill', 'StructuredOutput']);
  assert.doesNotThrow(() => assertLeadToolGrant(granted, 'synthetic-lead'));
  for (const removed of REQUIRED_LEAD_TOOLS) {
    assert.throws(
      () => assertLeadToolGrant(granted.filter((tool) => tool !== removed), 'synthetic-lead'),
      new RegExp(`synthetic-lead omits ${removed}\\b`),
      `dropping ${removed} left the tool-grant assertion green`,
    );
  }
});

test('every preloaded skill resolves and is at or under the four-kilobyte ceiling', () => {
  const seen = [];
  for (const name of LEAD_NAMES) {
    const subject = lead(name);
    for (const reference of subject.frontmatter.lists.skills || []) {
      const resolved = resolveSkillReference(reference, subject.path);
      const bytes = statSync(resolved.path).size;
      assert.ok(
        bytes <= SKILL_BYTE_CEILING,
        `${subject.path} preloads ${reference} at ${bytes} bytes, over the ${SKILL_BYTE_CEILING}-byte ceiling; anything larger is delivered as a body pointer, never inlined on every dispatch`,
      );
      seen.push(`${name}:${reference}`);
    }
  }
  assert.deepEqual(seen, ['delivery-lead:verification-discipline']);
});

test('the preload ceiling assertion names an oversized skill rather than passing it', () => {
  const oversized = join(SKILL_TREE, 'mitosis', 'SKILL.md');
  assert.ok(existsSync(oversized));
  const bytes = statSync(oversized).size;
  assert.ok(bytes > SKILL_BYTE_CEILING, `${oversized} is ${bytes} bytes, so it no longer exercises the ceiling`);
  assert.throws(
    () => assert.ok(bytes <= SKILL_BYTE_CEILING, `synthetic-lead preloads mitosis at ${bytes} bytes, over the ${SKILL_BYTE_CEILING}-byte ceiling`),
    /preloads mitosis at \d+ bytes, over the 4096-byte ceiling/,
  );
});

test('every generated body pointer resolves to a file that exists', () => {
  const seen = [];
  for (const name of LEAD_NAMES) {
    const subject = lead(name);
    for (const pointer of pointerLinesOf(subject.frontmatter.body)) {
      const resolved = resolveSkillReference(pointer.reference, subject.path);
      assert.equal(pointer.path, resolved.path, `${subject.path} carries a pointer for ${pointer.reference} that is not the path resolved from the plugin manifest today`);
      assert.ok(existsSync(pointer.path), `${subject.path} points at ${pointer.path}, which does not exist`);
      assert.ok(statSync(pointer.path).size > SKILL_BYTE_CEILING, `${subject.path} points at ${pointer.reference}, which is small enough to preload instead`);
      seen.push(`${name}:${pointer.reference}`);
    }
  }
  assert.deepEqual(seen, ['architect:superpowers:writing-plans', 'investigator:superpowers:systematic-debugging']);
});

test('delivery-lead fetches its oversized procedure by instruction and the path it names exists', () => {
  const subject = lead('delivery-lead');
  const named = '.claude/skills/mitosis/SKILL.md';
  assert.ok(subject.source.includes(named), `${subject.path} names no path for the procedure this role must always read`);
  assert.match(subject.source, /Read `\.claude\/skills\/mitosis\/SKILL\.md` with the Read tool now/);
  const absolute = join(CONFIG_ROOT, 'skills', 'mitosis', 'SKILL.md');
  assert.ok(existsSync(absolute), `${subject.path} instructs a read of ${named} but ${absolute} does not exist`);
  assert.ok(statSync(absolute).size > SKILL_BYTE_CEILING);
});

test('investigator declares the browser automation server through mcpServers', () => {
  const subject = lead('investigator');
  assert.deepEqual(
    subject.frontmatter.lists.mcpServers,
    ['playwright'],
    `${subject.path} declares no playwright mcpServers entry, so the browser automation this role is granted does not reach it`,
  );
});

test('no Lead is granted a tool that would let it edit the code it routes', () => {
  for (const name of LEAD_NAMES) {
    const subject = lead(name);
    const tools = toolsOf(subject.frontmatter, subject.path);
    for (const forbidden of ['Edit', 'Write', 'NotebookEdit']) {
      assert.ok(!tools.includes(forbidden), `${subject.path} grants ${forbidden}; a Lead routes work to an executing agent rather than performing it`);
    }
  }
});
