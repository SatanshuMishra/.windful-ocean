import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathsOverlap, scopesOverlap, planWaves } from '../wave-planner.mjs';

test('pathsOverlap treats normalized-equal paths as overlapping, ignoring a leading ./ or trailing /', () => {
  assert.equal(pathsOverlap('src/a.js', 'src/a.js'), true);
  assert.equal(pathsOverlap('./src/a.js', 'src/a.js/'), true);
});

test('pathsOverlap treats a glob prefix as overlapping the directory and files it covers, from either side', () => {
  assert.equal(pathsOverlap('src/*.js', 'src/a.js'), true);
  assert.equal(pathsOverlap('src/*.js', 'src'), true);
  assert.equal(pathsOverlap('src/a.js', 'src/*.js'), true);
  assert.equal(pathsOverlap('src', 'src/*.js'), true);
});

test('pathsOverlap treats a bare directory as overlapping anything nested under it, from either side', () => {
  assert.equal(pathsOverlap('src', 'src/a.js'), true);
  assert.equal(pathsOverlap('src/a.js', 'src'), true);
  assert.equal(pathsOverlap('src/sub', 'src/sub/deep/file.js'), true);
});

test('pathsOverlap returns false for genuinely disjoint paths, including a directory-name near-miss', () => {
  assert.equal(pathsOverlap('src/a.js', 'lib/b.js'), false);
  assert.equal(pathsOverlap('src', 'src2/b.js'), false);
  assert.equal(pathsOverlap('src/a.js', 'src/b.js'), false);
});

test('pathsOverlap misses two documented glob shapes: a root-level glob and a star landing mid-segment', () => {
  assert.equal(pathsOverlap('*.js', 'a.js'), false);
  assert.equal(pathsOverlap('src/a*.js', 'src/abc.js'), false);
});

test('pathsOverlap treats a ? wildcard the same as a * when computing the glob prefix', () => {
  assert.equal(pathsOverlap('src/?.js', 'src/a.js'), true);
});

test('scopesOverlap is true only when some pair across the two scope lists overlaps, and false when either list is empty', () => {
  assert.equal(scopesOverlap(['lib/one.js'], ['src/a.js', 'lib/one.js']), true);
  assert.equal(scopesOverlap(['lib/one.js'], ['src/a.js', 'src/b.js']), false);
  assert.equal(scopesOverlap([], ['src/a.js']), false);
  assert.equal(scopesOverlap(['lib/one.js'], []), false);
});

test('planWaves throws when spec.tasks is missing or not an array', () => {
  assert.throws(() => planWaves({}), /spec\.tasks must be an array/);
  assert.throws(() => planWaves({ tasks: 'nope' }), /spec\.tasks must be an array/);
  assert.throws(() => planWaves(null), /spec\.tasks must be an array/);
});

test('planWaves throws on a task with no id, including an empty-string id', () => {
  assert.throws(() => planWaves({ tasks: [{ dependsOn: [], fileScope: [] }] }), /task missing id/);
  assert.throws(() => planWaves({ tasks: [{ id: '', dependsOn: [], fileScope: [] }] }), /task missing id/);
});

test('planWaves does not validate a null task element and lets it throw a raw TypeError instead of a validated error', () => {
  assert.throws(() => planWaves({ tasks: [null] }), TypeError);
});

test('planWaves throws on two tasks sharing an id, naming the duplicated id', () => {
  assert.throws(
    () => planWaves({ tasks: [{ id: 'dup', dependsOn: [], fileScope: [] }, { id: 'dup', dependsOn: [], fileScope: [] }] }),
    /duplicate task id: dup/,
  );
});

test('planWaves throws naming the missing dependency when a task depends on an id that was never declared', () => {
  assert.throws(
    () => planWaves({ tasks: [{ id: 'a', dependsOn: ['ghost'], fileScope: [] }] }),
    /task a depends on unknown task ghost/,
  );
});

test('planWaves reports every task still blocked in a cycle error, including a bystander that depends on the cycle without being part of it', () => {
  assert.throws(
    () => planWaves({
      tasks: [
        { id: 'a', dependsOn: ['b'], fileScope: [] },
        { id: 'b', dependsOn: ['a'], fileScope: [] },
        { id: 'z', dependsOn: ['a'], fileScope: [] },
      ],
    }),
    (err) => {
      assert.match(err.message, /^dependency cycle detected among: /);
      assert.match(err.message, /\ba\b/);
      assert.match(err.message, /\bb\b/);
      assert.match(err.message, /\bz\b/);
      return true;
    },
  );
});

test('planWaves throws when two tasks with no dependency between them would land in the same wave with overlapping fileScope', () => {
  assert.throws(
    () => planWaves({
      tasks: [
        { id: 'a', dependsOn: [], fileScope: ['src/shared.js'] },
        { id: 'b', dependsOn: [], fileScope: ['src/shared.js'] },
      ],
    }),
    /fileScope overlap in same wave between a and b/,
  );
});

test('planWaves throws on a directory-prefix fileScope overlap between same-wave tasks, not only when scopes are byte-identical', () => {
  assert.throws(
    () => planWaves({
      tasks: [
        { id: 'a', dependsOn: [], fileScope: ['src'] },
        { id: 'b', dependsOn: [], fileScope: ['src/a.js'] },
      ],
    }),
    /fileScope overlap in same wave between a and b/,
  );
});

test('planWaves throws on a glob fileScope overlap between same-wave tasks, not only when scopes are byte-identical', () => {
  assert.throws(
    () => planWaves({
      tasks: [
        { id: 'a', dependsOn: [], fileScope: ['src/*.js'] },
        { id: 'b', dependsOn: [], fileScope: ['src/a.js'] },
      ],
    }),
    /fileScope overlap in same wave between a and b/,
  );
});

test('planWaves throws on a fileScope overlap between two tasks that only land in the same wave after a shared dependency clears in an earlier wave', () => {
  assert.throws(
    () => planWaves({
      tasks: [
        { id: 'c', dependsOn: [], fileScope: ['other/file.js'] },
        { id: 'a', dependsOn: ['c'], fileScope: ['src/shared.js'] },
        { id: 'b', dependsOn: ['c'], fileScope: ['src/shared.js'] },
      ],
    }),
    /fileScope overlap in same wave between a and b/,
  );
});

test('planWaves does not validate a non-array fileScope, so it silently escapes overlap detection: a known fail-open pinned here, not endorsed', () => {
  const result = planWaves({
    tasks: [
      { id: 'a', fileScope: 'src/a.js' },
      { id: 'b', fileScope: ['src/a.js'] },
    ],
  });
  assert.deepEqual(result, {
    waves: [['a', 'b']],
    diagnostics: { taskCount: 2, waveCount: 1, maxWidth: 2 },
  });
});

test('planWaves on a single task with no declared dependsOn or fileScope defaults both to empty and returns one wave of one', () => {
  const result = planWaves({ tasks: [{ id: 'solo' }] });
  assert.deepEqual(result, {
    waves: [['solo']],
    diagnostics: { taskCount: 1, waveCount: 1, maxWidth: 1 },
  });
});

test('planWaves returns {waves, diagnostics:{taskCount, waveCount, maxWidth}}, with each wave a sorted array of ids', () => {
  const result = planWaves({
    tasks: [
      { id: 'task-c', dependsOn: [], fileScope: ['pkg-c/file.js'] },
      { id: 'task-a', dependsOn: [], fileScope: ['pkg-a/file.js'] },
      { id: 'task-b', dependsOn: ['task-a', 'task-c'], fileScope: ['pkg-b/file.js'] },
    ],
  });
  assert.deepEqual(result, {
    waves: [['task-a', 'task-c'], ['task-b']],
    diagnostics: { taskCount: 3, waveCount: 2, maxWidth: 2 },
  });
});

test('planWaves resolves a 3-deep dependency chain into 3 waves with the widest wave in the middle, not first', () => {
  const result = planWaves({
    tasks: [
      { id: 'root', dependsOn: [], fileScope: ['root.js'] },
      { id: 'mid-1', dependsOn: ['root'], fileScope: ['mid1.js'] },
      { id: 'mid-2', dependsOn: ['root'], fileScope: ['mid2.js'] },
      { id: 'leaf', dependsOn: ['mid-1', 'mid-2'], fileScope: ['leaf.js'] },
    ],
  });
  assert.deepEqual(result, {
    waves: [['root'], ['mid-1', 'mid-2'], ['leaf']],
    diagnostics: { taskCount: 4, waveCount: 3, maxWidth: 2 },
  });
});

test('planWaves leaves the input spec object structurally unchanged after planning', () => {
  const spec = {
    tasks: [
      { id: 'b', dependsOn: ['a'], fileScope: ['src/b.js'] },
      { id: 'a', dependsOn: [], fileScope: ['src/a.js'] },
    ],
  };
  const before = structuredClone(spec);
  planWaves(spec);
  assert.deepEqual(spec, before);
});
