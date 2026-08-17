import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GATE_CLEAN_EXIT, GATE_VIOLATION_EXIT } from '../mitosis-gate.mjs';

const GATE_SOURCE_DIR = fileURLToPath(new URL('../', import.meta.url));
const GATE_ENTRY = fileURLToPath(new URL('../mitosis-gate.mjs', import.meta.url));
const SOURCE_EXTENSION = '.mjs';
const DEFINITION_EXTENSION = '.md';
const DISPATCHED_AGENT = 'implementer';
const UNDISPATCHED_AGENT = 'never-dispatched-by-engine-source';
const SCHEMA_TOOL = 'StructuredOutput';
const BASE_TOOLS = Object.freeze(['Read', 'Write', 'Edit', 'Bash']);

const scratchDirs = [];

function scratch(label) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), `mitosis-gate-red-${label}-`)));
  scratchDirs.push(dir);
  return dir;
}

function engineTreeCopy(label) {
  const dir = scratch(label);
  for (const entry of readdirSync(GATE_SOURCE_DIR, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(SOURCE_EXTENSION)) continue;
    copyFileSync(join(GATE_SOURCE_DIR, entry.name), join(dir, entry.name));
  }
  return dir;
}

function plant(path, seat, replacement) {
  const source = readFileSync(path, 'utf8');
  const seats = source.split(seat).length - 1;
  assert.equal(seats, 1, `the plant must have exactly one seat in ${path}, and this one has ${seats}; a plant with no seat plants nothing and leaves a red case that can only ever be green`);
  writeFileSync(path, source.replace(seat, replacement));
}

function runGate(entry, argv) {
  try {
    const stdout = execFileSync('node', [entry, ...argv], { encoding: 'utf8', stdio: 'pipe' });
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    return { status: error.status, stdout: error.stdout, stderr: error.stderr };
  }
}

function agentDefinition(name, tools) {
  return `---\nname: ${name}\ndescription: a definition planted by the gate red cases\ntools: ${tools.join(', ')}\n---\n\nbody\n`;
}

const ENTROPY_PLANTS = Object.freeze([
  Object.freeze({
    file: 'planted-clock.mjs',
    source: 'export const stamp = () => Date.now();\n',
    named: /planted-clock\.mjs:1 reads Date as a bare read; engine source takes entropy through args only/,
  }),
  Object.freeze({
    file: 'planted-randomness.mjs',
    source: 'export const pick = () => Math.random();\n',
    named: /planted-randomness\.mjs:1 reads Math as a Math\.random; engine source takes entropy through args only/,
  }),
]);

const EXEC_PLANTS = Object.freeze([
  Object.freeze({
    label: 'a sixth binary widening the spawn allowlist',
    seat: "export const EXEC_ALLOWLIST = Object.freeze(['claude', 'gh', 'git', 'graphify', 'node']);",
    replacement: "export const EXEC_ALLOWLIST = Object.freeze(['bash', 'claude', 'gh', 'git', 'graphify', 'node']);",
    named: Object.freeze([
      /the spawn allowlist is \["bash","claude","gh","git","graphify","node"\] but the guarantee names exactly \["claude","gh","git","graphify","node"\]/,
      /"bash" is not on the allowlist yet the policy let it through; the policy is deny-by-default/,
    ]),
  }),
  Object.freeze({
    label: 'a gh spawn that reaches the real binary instead of the merge shim',
    seat: '    return Object.freeze({ command: NODE_BINARY, args: Object.freeze([GH_SHIM_PATH, ...args]) });',
    replacement: '    return Object.freeze({ command: binary, args: Object.freeze(args) });',
    named: Object.freeze([/an ordinary gh argv no longer resolves through gh-merge-shim\.mjs/]),
  }),
]);

after(() => {
  for (const dir of scratchDirs) rmSync(dir, { recursive: true, force: true });
  scratchDirs.length = 0;
});

test('the determinism verb reddens on each planted entropy read and greens again the moment the plant is removed', () => {
  const dir = scratch('determinism');
  writeFileSync(join(dir, 'takes-entropy-as-an-argument.mjs'), 'export const stamp = (now) => now;\n');
  for (const planted of ENTROPY_PLANTS) {
    const before = runGate(GATE_ENTRY, ['determinism', '--target', dir]);
    assert.equal(before.status, GATE_CLEAN_EXIT, before.stderr);
    assert.equal(JSON.parse(before.stdout).ok, true);

    writeFileSync(join(dir, planted.file), planted.source);
    const red = runGate(GATE_ENTRY, ['determinism', '--target', dir]);
    assert.equal(red.status, GATE_VIOLATION_EXIT, `${planted.file} left the verb clean: ${red.stderr}`);
    assert.equal(red.stdout, '', 'a run that found a violation must print no clean verdict');
    assert.match(red.stderr, planted.named);

    rmSync(join(dir, planted.file));
    const restored = runGate(GATE_ENTRY, ['determinism', '--target', dir]);
    assert.equal(restored.status, GATE_CLEAN_EXIT, `${planted.file} left the verb red after removal: ${restored.stderr}`);
  }
});

test('the exec-allowlist verb reddens on each planted spawn-policy violation and is green on the same tree unplanted', () => {
  for (const planted of EXEC_PLANTS) {
    const dir = engineTreeCopy('exec');
    const entry = join(dir, 'mitosis-gate.mjs');

    const green = runGate(entry, ['exec-allowlist']);
    assert.equal(green.status, GATE_CLEAN_EXIT, green.stderr);
    assert.equal(JSON.parse(green.stdout).ok, true, `the unplanted copy must be green before ${planted.label} is planted into it`);

    plant(join(dir, 'exec-policy.mjs'), planted.seat, planted.replacement);
    const red = runGate(entry, ['exec-allowlist']);
    assert.equal(red.status, GATE_VIOLATION_EXIT, `${planted.label} left the verb clean: ${red.stderr}`);
    assert.equal(red.stdout, '', 'a run that found a violation must print no clean verdict');
    for (const named of planted.named) assert.match(red.stderr, named);
  }
});

test('the schema verb reddens when a dispatched agent drops StructuredOutput and greens again when the grant is restored', () => {
  const dir = scratch('agent-schema');
  const definition = join(dir, `${DISPATCHED_AGENT}${DEFINITION_EXTENSION}`);

  writeFileSync(definition, agentDefinition(DISPATCHED_AGENT, [...BASE_TOOLS, SCHEMA_TOOL]));
  const green = runGate(GATE_ENTRY, ['dispatchable-agent-schema-capable', '--target', dir]);
  assert.equal(green.status, GATE_CLEAN_EXIT, green.stderr);
  assert.deepEqual(
    JSON.parse(green.stdout).dispatchable,
    [DISPATCHED_AGENT],
    `engine source must name ${DISPATCHED_AGENT} as a dispatch target, or the plant below sits outside the census and the red case can only ever be green`,
  );

  writeFileSync(definition, agentDefinition(DISPATCHED_AGENT, [...BASE_TOOLS]));
  const red = runGate(GATE_ENTRY, ['dispatchable-agent-schema-capable', '--target', dir]);
  assert.equal(red.status, GATE_VIOLATION_EXIT, `dropping ${SCHEMA_TOOL} left the verb clean: ${red.stderr}`);
  assert.equal(red.stdout, '', 'a run that found a violation must print no clean verdict');
  assert.match(red.stderr, new RegExp(`${DISPATCHED_AGENT}\\.md is dispatched by engine source but omits ${SCHEMA_TOOL} from its tools: line`));

  writeFileSync(definition, agentDefinition(DISPATCHED_AGENT, [...BASE_TOOLS, SCHEMA_TOOL]));
  const restored = runGate(GATE_ENTRY, ['dispatchable-agent-schema-capable', '--target', dir]);
  assert.equal(restored.status, GATE_CLEAN_EXIT, `restoring ${SCHEMA_TOOL} left the verb red: ${restored.stderr}`);
});

test('the schema verb holds an agent engine source never names out of scope, so its red case measures dispatch rather than definition count', () => {
  const dir = scratch('agent-schema-scope');
  writeFileSync(join(dir, `${DISPATCHED_AGENT}${DEFINITION_EXTENSION}`), agentDefinition(DISPATCHED_AGENT, [...BASE_TOOLS, SCHEMA_TOOL]));
  writeFileSync(join(dir, `${UNDISPATCHED_AGENT}${DEFINITION_EXTENSION}`), agentDefinition(UNDISPATCHED_AGENT, [...BASE_TOOLS]));

  const verdict = runGate(GATE_ENTRY, ['dispatchable-agent-schema-capable', '--target', dir]);
  assert.equal(verdict.status, GATE_CLEAN_EXIT, verdict.stderr);
  const parsed = JSON.parse(verdict.stdout);
  assert.equal(parsed.definitionCount, 2);
  assert.deepEqual(parsed.dispatchable, [DISPATCHED_AGENT]);
});
