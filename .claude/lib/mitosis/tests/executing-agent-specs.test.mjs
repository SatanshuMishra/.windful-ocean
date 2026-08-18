import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { partitionByPointerNeed } from '../agent-generate-plan.mjs';
import { loadAgentSpecs } from '../agent-spec-store.mjs';
import { MANIFEST_RELATIVE_PATH, resolveSkillPointer } from '../agent-skill-pointers.mjs';

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

function pluginManifest() {
  const path = join(homedir(), MANIFEST_RELATIVE_PATH);
  return Object.freeze({ path, present: existsSync(path) });
}

function scopedByManifest(entries) {
  const manifest = pluginManifest();
  const scoped = partitionByPointerNeed(entries, manifest.present);
  assert.equal(scoped.ok, true, scoped.error);
  return Object.freeze({ manifest, composable: scoped.composable, deferred: scoped.deferred });
}

function deferralNotice(manifestPath, deferred) {
  const named = deferred
    .map((entry) => `${entry.spec.name} (${entry.spec.procedures.join(', ')})`)
    .join('; ');
  const counted = `${deferred.length} ${deferred.length === 1 ? 'agent spec' : 'agent specs'}`;
  return `POINTER RESOLUTION UNVERIFIED on this host: the plugin manifest ${manifestPath} does not exist, so ${counted} carrying skill pointers went unchecked: ${named}`;
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

test('every body pointer resolves to a procedure file that exists', async (t) => {
  const scoped = scopedByManifest(await executingSpecs());
  if (scoped.deferred.length > 0) {
    t.diagnostic(deferralNotice(scoped.manifest.path, scoped.deferred));
  }
  for (const entry of scoped.composable) {
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

test('pointer deferral keys on manifest presence alone and never on whether resolution would succeed', async () => {
  const entries = await executingSpecs();
  const carrying = entries.filter((entry) => (entry.spec.procedures || []).length > 0).map((entry) => entry.spec.name);
  const bare = entries.filter((entry) => (entry.spec.procedures || []).length === 0).map((entry) => entry.spec.name);
  assert.ok(carrying.length > 0, `no executing agent spec carries a procedure, so ${EXECUTING_AGENTS.join(', ')} give the deferral nothing to be substantive about`);

  const onManifestHost = partitionByPointerNeed(entries, true);
  assert.equal(onManifestHost.ok, true, onManifestHost.error);
  assert.deepEqual(onManifestHost.deferred.map((entry) => entry.spec.name), [], 'a host carrying a plugin manifest defers nothing, so every pointer stays asserted there');
  assert.deepEqual(onManifestHost.composable.map((entry) => entry.spec.name), EXECUTING_AGENTS.slice());

  const withoutManifest = partitionByPointerNeed(entries, false);
  assert.equal(withoutManifest.ok, true, withoutManifest.error);
  assert.deepEqual(withoutManifest.deferred.map((entry) => entry.spec.name), carrying, 'only a spec that actually carries a pointer is deferred for want of a manifest');
  assert.deepEqual(withoutManifest.composable.map((entry) => entry.spec.name), bare, 'a spec carrying no pointer is asserted whether or not this host has a plugin manifest');

  const malformed = [Object.freeze({ spec: Object.freeze({ name: 'malformed-pointer-agent', procedures: Object.freeze(['receipts-gates']) }) })];
  const stillComposable = partitionByPointerNeed(malformed, true);
  assert.equal(stillComposable.ok, true, stillComposable.error);
  assert.deepEqual(stillComposable.deferred.map((entry) => entry.spec.name), [], 'a malformed reference is never routed into the deferral, so it still reaches resolution and still fails');
  assert.throws(
    () => resolveSkillPointer({ reference: stillComposable.composable[0].spec.procedures[0] }),
    /not fully qualified as plugin:skill/,
  );
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
