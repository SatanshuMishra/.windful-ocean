import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RETIRED_ROSTER_LEAD, REQUIRED_LEAD_TOOLS } from '../agent-classification.mjs';
import { readRetiredRoster } from '../../mitosis/retirement-set.mjs';

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const RETIRED_ROSTER_PATH = fileURLToPath(new URL('../../mitosis/retired-roster.json', import.meta.url));
const HASH = /^[0-9a-f]{40}$/;

function git(args) {
  const result = spawnSync('git', ['-C', REPO_ROOT, ...args], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout;
}

function deletionEntries() {
  const lines = git(['log', '--diff-filter=D', '--name-only', '--pretty=format:%H', '--', '.claude/agents/*.md']).split('\n');
  const entries = [];
  let commit = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (line.length === 0) continue;
    if (HASH.test(line)) {
      commit = line;
      continue;
    }
    assert.ok(commit !== null, `deleted path ${JSON.stringify(line)} appeared before any commit hash in the git log output`);
    entries.push(Object.freeze({ commit, path: line }));
  }
  return Object.freeze(entries);
}

function toolsLineOf(source, label) {
  const lines = source.split('\n');
  assert.equal(lines[0], '---', `${label} does not open with a frontmatter fence`);
  const end = lines.indexOf('---', 1);
  assert.ok(end > 0, `${label} opens a frontmatter block that is never closed`);
  const toolsLine = lines.slice(1, end).find((line) => line.startsWith('tools:'));
  assert.ok(toolsLine, `${label} declares no tools frontmatter line`);
  return toolsLine
    .slice('tools:'.length)
    .split(',')
    .map((token) => token.trim());
}

function liveRetiringNames() {
  const source = readFileSync(RETIRED_ROSTER_PATH, 'utf8');
  const declared = readRetiredRoster(RETIRED_ROSTER_PATH, source);
  assert.equal(declared.ok, true, declared.error);
  return declared.names;
}

test('RETIRED_ROSTER_LEAD and the roster spec retiring set together match every agent definition git has ever deleted', () => {
  const entries = deletionEntries();
  assert.ok(entries.length > 0, 'no deletion commit was found for .claude/agents/*.md; the derivation has nothing to check against');

  const derivedLead = [];
  const derivedNonLead = [];
  for (const entry of entries) {
    const name = basename(entry.path, '.md');
    const source = git(['show', `${entry.commit}^:${entry.path}`]);
    const tools = toolsLineOf(source, `${entry.commit}^:${entry.path}`);
    const holdsAllRequiredTools = REQUIRED_LEAD_TOOLS.every((tool) => tools.includes(tool));
    (holdsAllRequiredTools ? derivedLead : derivedNonLead).push(name);
  }
  derivedLead.sort();
  derivedNonLead.sort();

  assert.deepEqual(
    derivedLead,
    [...RETIRED_ROSTER_LEAD],
    'RETIRED_ROSTER_LEAD no longer matches the tool grants git recorded at each deletion commit',
  );
  assert.deepEqual(
    derivedNonLead,
    [...liveRetiringNames()].sort(),
    'the roster spec retiring set no longer matches the tool grants git recorded at each deletion commit',
  );
});
