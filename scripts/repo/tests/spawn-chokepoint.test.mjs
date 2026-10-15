import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const LIB_ROOT = fileURLToPath(new URL('../../../.claude/lib/', import.meta.url));

const CHILD_PROCESS_IMPORT = /^[ \t]*import\s[\s\S]*?from\s*['"]node:child_process['"]/m;
const CHILD_PROCESS_REQUIRE = /^[ \t]*(?:const|let|var)\s[\s\S]*?require\(\s*['"]node:child_process['"]\s*\)/m;
const CHILD_PROCESS_DYNAMIC = /[^\w'"`]import\(\s*['"]node:child_process['"]\s*\)/;

const HARNESS_SEGMENT = 'tests';

const SPAWN_EXCEPTIONS = Object.freeze({
  'observer-audit/duckdb.mjs': 'the audit runner spawns a pinned read-only analytics binary an operator points at by absolute path, so routing it would need BOTH a wider deny-by-default allowlist governing every gh and git spawn in the engine AND the defeat of the path-qualified guard that allowlist depends on; an isolated declared site is the smaller erosion, and the binary reads event logs and writes nothing',
});

function filesUnder(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...filesUnder(full));
      continue;
    }
    if (entry.isFile()) found.push(full);
  }
  return found;
}

function importsChildProcess(source) {
  return CHILD_PROCESS_IMPORT.test(source) || CHILD_PROCESS_REQUIRE.test(source) || CHILD_PROCESS_DYNAMIC.test(source);
}

function classOf(path) {
  if (path.split('/').includes(HARNESS_SEGMENT)) return 'harness';
  if (Object.hasOwn(SPAWN_EXCEPTIONS, path)) return 'exception';
  return null;
}

function siteOf(path, source) {
  if (!importsChildProcess(source)) return null;
  return Object.freeze({ path, membership: classOf(path) });
}

function census() {
  return filesUnder(LIB_ROOT)
    .map((full) => siteOf(relative(LIB_ROOT, full).split(sep).join('/'), readFileSync(full, 'utf8')))
    .filter((site) => site !== null)
    .sort((left, right) => (left.path < right.path ? -1 : 1));
}

test('the spawn-site census classifies every node:child_process import under .claude/lib and halts on one it cannot place', () => {
  const sites = census();
  assert.ok(sites.length > 0, 'the census found no child_process import at all, so it is reading the wrong tree');
  const unclassified = sites.filter((entry) => entry.membership === null).map((entry) => entry.path);
  assert.deepEqual(unclassified, [], `spawn sites that sit outside a tests folder and carry no declared exception: ${unclassified.join(', ')}`);
  const stale = Object.keys(SPAWN_EXCEPTIONS).filter((path) => !sites.some((entry) => entry.path === path));
  assert.deepEqual(stale, [], `declared spawn exceptions naming a file that no longer imports node:child_process: ${stale.join(', ')}`);
  const unreasoned = Object.entries(SPAWN_EXCEPTIONS).filter(([, reason]) => typeof reason !== 'string' || reason.length === 0).map(([path]) => path);
  assert.deepEqual(unreasoned, [], `declared spawn exceptions carrying no reason: ${unreasoned.join(', ')}`);
  assert.deepEqual(
    siteOf('observer-audit/x.mjs', "import { spawnSync } from 'node:child_process';"),
    { path: 'observer-audit/x.mjs', membership: null },
    'an undeclared spawn site outside a tests folder was placed',
  );
});
