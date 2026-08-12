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

test('planWaves throws a dependency-cycle error naming every task still stuck in the cycle', () => {
  assert.throws(
    () => planWaves({
      tasks: [
        { id: 'a', dependsOn: ['b'], fileScope: [] },
        { id: 'b', dependsOn: ['a'], fileScope: [] },
      ],
    }),
    /dependency cycle detected among: a, b/,
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
    /fileScope overlap in same wave between a and b; annotation should have serialized these/,
  );
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
