import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAgentSpecs } from '../agent-spec-store.mjs';
import { resolveSkillPointer } from '../agent-skill-pointers.mjs';

const SHIPPED_STORE = fileURLToPath(new URL('../agent-specs/', import.meta.url));
const AGENT_DIR = fileURLToPath(new URL('../../../agents/', import.meta.url));
const PROJECT_SKILL_DIR = fileURLToPath(new URL('../../../skills/', import.meta.url));

const EXECUTING_AGENTS = Object.freeze(['conformance-auditor', 'platform-engineer', 'release-engineer', 'verifier']);
const REQUIRED_TOOL = 'StructuredOutput';
const LEAD_ONLY_TOOLS = Object.freeze(['Agent', 'Skill']);
const MAX_PRELOAD_BYTES = 4096;

async function shippedSpecs() {
  const loaded = await loadAgentSpecs(SHIPPED_STORE);
  assert.equal(loaded.ok, true, loaded.error);
  const byName = new Map(loaded.entries.map((entry) => [entry.spec.name, entry]));
  return byName;
}

async function executingSpecs() {
  const byName = await shippedSpecs();
  return EXECUTING_AGENTS.map((name) => {
    const entry = byName.get(name);
    assert.ok(entry, `the agent spec store ${SHIPPED_STORE} carries no spec named ${name}`);
    return entry;
  });
}

function frontmatterTools(name) {
  const path = join(AGENT_DIR, `${name}.md`);
  assert.ok(existsSync(path), `${path} does not exist, so ${name} declares no tools at all`);
  const lines = readFileSync(path, 'utf8').split('\n');
  assert.equal(lines[0], '---', `${path} does not open with a frontmatter fence`);
  const end = lines.indexOf('---', 1);
  assert.ok(end > 0, `${path} opens a frontmatter block that is never closed`);
  const declared = lines.slice(1, end).filter((line) => line.startsWith('tools:'));
  assert.equal(declared.length, 1, `${path} carries ${declared.length} frontmatter tools: lines; exactly one grants the agent its tools`);
  return declared[0].slice('tools:'.length).split(',').map((token) => token.trim()).filter((token) => token.length > 0);
}

test('every executing agent declares StructuredOutput in its generated tools line', async () => {
  for (const entry of await executingSpecs()) {
    const tools = frontmatterTools(entry.spec.name);
    assert.ok(
      tools.includes(REQUIRED_TOOL),
      `${entry.spec.name} omits ${REQUIRED_TOOL} from its tools, so a structured request to it degrades to prose without failing; it declares ${JSON.stringify(tools)}`,
    );
  }
});

test('no executing agent declares the Lead-only dispatch or skill tool', async () => {
  for (const entry of await executingSpecs()) {
    const tools = frontmatterTools(entry.spec.name);
    for (const granted of LEAD_ONLY_TOOLS) {
      assert.ok(
        !tools.includes(granted),
        `${entry.spec.name} declares the ${granted} tool, which is granted to the four Leads only; it declares ${JSON.stringify(tools)}`,
      );
    }
  }
});

test('every preloaded skill resolves on disk and stays at or under the preload ceiling', async () => {
  for (const entry of await executingSpecs()) {
    for (const skill of entry.spec.skills || []) {
      const path = join(PROJECT_SKILL_DIR, skill, 'SKILL.md');
      assert.ok(
        existsSync(path),
        `${entry.spec.name} preloads skill ${JSON.stringify(skill)} but ${path} does not exist; an unknown preload name logs a warning and spawns the agent without it`,
      );
      const bytes = statSync(path).size;
      assert.ok(
        bytes <= MAX_PRELOAD_BYTES,
        `${entry.spec.name} preloads skill ${JSON.stringify(skill)} at ${bytes} bytes, over the ${MAX_PRELOAD_BYTES} byte preload ceiling; a skill this size is delivered as a body pointer instead`,
      );
    }
  }
});

test('every body pointer resolves to a procedure file that exists', async () => {
  for (const entry of await executingSpecs()) {
    for (const reference of entry.spec.procedures || []) {
      const pointer = resolveSkillPointer({ reference });
      assert.ok(
        existsSync(pointer.path),
        `${entry.spec.name} points at procedure ${JSON.stringify(reference)}, which resolved to ${pointer.path}, and that file does not exist`,
      );
      assert.ok(
        readFileSync(join(AGENT_DIR, `${entry.spec.name}.md`), 'utf8').includes(pointer.path),
        `${entry.spec.name} resolves ${JSON.stringify(reference)} to ${pointer.path}, but its generated body names a different path; a hand-written pointer breaks at the next plugin update`,
      );
    }
  }
});

test('every executing agent carries the shared standards and boundary fragments', async () => {
  const required = Object.freeze([
    'standards-core',
    'delegation-boundary',
    'answer-format',
    'honesty-ladder',
    'work-order-contract',
    'receipt-contract',
    'no-comments',
    'never-touch-a-live-system',
  ]);
  for (const entry of await executingSpecs()) {
    const declared = entry.spec.fragments || [];
    for (const fragment of required) {
      assert.ok(
        declared.includes(fragment),
        `${entry.spec.name} omits the ${fragment} fragment; it declares ${JSON.stringify(declared)}`,
      );
    }
    assert.ok(
      !declared.includes('authority-boundary'),
      `${entry.spec.name} declares authority-boundary, which frames a dispatching agent; an agent that holds no ${LEAD_ONLY_TOOLS[0]} tool carries delegation-boundary instead`,
    );
  }
});
