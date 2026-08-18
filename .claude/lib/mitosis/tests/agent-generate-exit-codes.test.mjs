import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DRIVER = fileURLToPath(new URL('../agent-generate.mjs', import.meta.url));

function scratch(t) {
  const dir = mkdtempSync(join(tmpdir(), 'agent-generate-exit-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function store(t) {
  const dir = join(scratch(t), 'agent-specs');
  mkdirSync(dir, { recursive: true });
  return dir;
}

function agents(t) {
  const dir = join(scratch(t), 'agents');
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeSpec(dir, name) {
  const spec = {
    name,
    description: `Synthetic store member ${name} used to prove the exact diverged-check exit code.`,
    tools: ['Read', 'StructuredOutput'],
    model: 'sonnet',
    fragments: ['answer-format', 'honesty-ladder'],
    summary: `You are ${name}, a synthetic subject that is never dispatched.`,
    sections: [{ heading: 'Lane', body: 'You exist to prove the divergence exit code is exactly 1.' }],
  };
  writeFileSync(join(dir, `${name}.spec.json`), `${JSON.stringify(spec, null, 2)}\n`);
}

function run(args) {
  const result = spawnSync(process.execPath, [DRIVER, ...args], { encoding: 'utf8' });
  if (result.error) throw result.error;
  return Object.freeze({ code: result.status, output: `${result.stdout}${result.stderr}` });
}

test('a diverging --check run exits with exactly the diverged status, not merely a non-zero one', (t) => {
  const specDir = store(t);
  const agentDir = agents(t);
  writeSpec(specDir, 'exit-code-agent');

  const written = run(['--store', specDir, '--agents', agentDir]);
  assert.equal(written.code, 0, written.output);

  const body = join(agentDir, 'exit-code-agent.md');
  writeFileSync(body, `${readFileSync(body, 'utf8')}drifted\n`);

  const checked = run(['--check', '--store', specDir, '--agents', agentDir]);
  assert.equal(checked.code, 1, checked.output);
});
