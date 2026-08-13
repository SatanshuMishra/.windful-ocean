import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathsOverlap, scopesOverlap, planWaves } from '../wave-planner.mjs';
import { pack } from './file-scope-fixtures.mjs';

const CANONICAL_FILE = 'src/shared.js';

const SAME_FILE_SPELLINGS = Object.freeze([
  'src/./shared.js',
  'src//shared.js',
  ' src/shared.js ',
  'src/../src/shared.js',
  'SRC/shared.js',
  './src/./shared.js/',
]);

const GLOBS_REACHING_THE_FILE = Object.freeze([
  '**',
  '**/*.js',
  'src/**',
  'src/s*.js',
  'src/[sx]hared.js',
  '{src,lib}/shared.js',
]);

function planOutcome(spec) {
  try {
    return { refused: false, waves: planWaves(spec).waves };
  } catch (err) {
    return { refused: true, message: err.message };
  }
}

function coScheduleOutcome(scope) {
  return planOutcome({
    tasks: [
      { id: 'a', dependsOn: [], fileScope: pack([scope]) },
      { id: 'b', dependsOn: [], fileScope: pack([CANONICAL_FILE]) },
    ],
  });
}

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

test('pathsOverlap detects a root-level glob and a star landing mid-segment, the two shapes whose miss dispatches two writers at one file', () => {
  assert.equal(pathsOverlap('*.js', 'a.js'), true);
  assert.equal(pathsOverlap('src/a*.js', 'src/abc.js'), true);
});

test('pathsOverlap treats a ? wildcard the same as a * when computing the glob prefix', () => {
  assert.equal(pathsOverlap('src/?.js', 'src/a.js'), true);
});

test('pathsOverlap canonicalizes ./ segments, doubled separators, surrounding whitespace, .. segments and letter case, so one file spelled two ways still overlaps', () => {
  for (const spelling of SAME_FILE_SPELLINGS) {
    assert.equal(
      pathsOverlap(spelling, CANONICAL_FILE),
      true,
      `${JSON.stringify(spelling)} is ${CANONICAL_FILE} under another spelling; reporting no overlap would be an under-report, which is the parallel-safety defect`,
    );
  }
});

test('pathsOverlap treats a wildcard opening at index 0 as reaching every path, never as an empty prefix that matches nothing', () => {
  for (const glob of ['*', '*.js', '**', '**/*.js']) {
    assert.equal(
      pathsOverlap(glob, 'src/deep/shared.js'),
      true,
      `${glob} is the broadest scope there is, so it must over-report overlap against src/deep/shared.js rather than under-report it`,
    );
  }
});

test('pathsOverlap truncates a brace set or character class to its literal prefix rather than reading it as a filename that matches nothing', () => {
  assert.equal(pathsOverlap('{src,lib}/shared.js', 'src/shared.js'), true);
  assert.equal(pathsOverlap('src/[sx]hared.js', 'src/shared.js'), true);
  assert.equal(pathsOverlap('src/{a,b}.js', 'src/b.js'), true);
});

test('pathsOverlap treats a scope that canonicalizes to the repo root as overlapping everything', () => {
  assert.equal(pathsOverlap('.', 'src/shared.js'), true);
  assert.equal(pathsOverlap('src/..', 'lib/other.js'), true);
});

test('pathsOverlap resolves a .. that escapes the root by dropping it, over-reporting overlap rather than missing a shared file', () => {
  assert.equal(pathsOverlap('../src/shared.js', 'src/shared.js'), true);
  assert.equal(pathsOverlap('../../outside.js', 'outside.js'), true);
});

test('pathsOverlap still separates genuinely disjoint paths, so permitted over-reporting has not collapsed into always-true', () => {
  assert.equal(pathsOverlap('src/a.js', 'lib/b.js'), false);
  assert.equal(pathsOverlap('src/*.js', 'lib/b.js'), false);
  assert.equal(pathsOverlap('src/a.js', 'src/b.js'), false);
  assert.equal(pathsOverlap('src/deep/a.js', 'src/other/b.js'), false);
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
  assert.throws(() => planWaves({ tasks: [{ dependsOn: [], fileScope: pack([]) }] }), /task missing id/);
  assert.throws(() => planWaves({ tasks: [{ id: '', dependsOn: [], fileScope: pack([]) }] }), /task missing id/);
});

test(
  'planWaves should refuse a null task element with a validated error naming the task problem',
  { todo: 'planWaves has no task-shape validation: the loop at wave-planner.mjs:38-46 reaches straight for !t.id, so a null element throws a raw TypeError ("Cannot read properties of null") carrying no diagnosis of which input was malformed. Asserting the TypeError class instead would be a change-detector that reddens on the obvious improvement.' },
  () => {
    assert.throws(() => planWaves({ tasks: [null] }), /task/);
  },
);

test('planWaves throws on two tasks sharing an id, naming the duplicated id', () => {
  assert.throws(
    () => planWaves({ tasks: [{ id: 'dup', dependsOn: [], fileScope: pack([]) }, { id: 'dup', dependsOn: [], fileScope: pack([]) }] }),
    /duplicate task id: dup/,
  );
});

test('planWaves throws naming the missing dependency when a task depends on an id that was never declared', () => {
  assert.throws(
    () => planWaves({ tasks: [{ id: 'a', dependsOn: ['ghost'], fileScope: pack([]) }] }),
    /task a depends on unknown task ghost/,
  );
});

test('planWaves reports every task still blocked in a cycle error, including a bystander that depends on the cycle without being part of it', () => {
  assert.throws(
    () => planWaves({
      tasks: [
        { id: 'a', dependsOn: ['b'], fileScope: pack([]) },
        { id: 'b', dependsOn: ['a'], fileScope: pack([]) },
        { id: 'z', dependsOn: ['a'], fileScope: pack([]) },
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
        { id: 'a', dependsOn: [], fileScope: pack(['src/shared.js']) },
        { id: 'b', dependsOn: [], fileScope: pack(['src/shared.js']) },
      ],
    }),
    /fileScope overlap in same wave between a and b/,
  );
});

test('planWaves throws on a directory-prefix fileScope overlap between same-wave tasks, not only when scopes are byte-identical', () => {
  assert.throws(
    () => planWaves({
      tasks: [
        { id: 'a', dependsOn: [], fileScope: pack(['src']) },
        { id: 'b', dependsOn: [], fileScope: pack(['src/a.js']) },
      ],
    }),
    /fileScope overlap in same wave between a and b/,
  );
});

test('planWaves throws on a glob fileScope overlap between same-wave tasks, not only when scopes are byte-identical', () => {
  assert.throws(
    () => planWaves({
      tasks: [
        { id: 'a', dependsOn: [], fileScope: pack(['src/*.js']) },
        { id: 'b', dependsOn: [], fileScope: pack(['src/a.js']) },
      ],
    }),
    /fileScope overlap in same wave between a and b/,
  );
});

test('planWaves never co-schedules two tasks that write one file when one of them spells that file differently, since a missed overlap dispatches two agents at it concurrently', () => {
  for (const spelling of SAME_FILE_SPELLINGS) {
    const outcome = coScheduleOutcome(spelling);
    assert.equal(
      outcome.refused,
      true,
      `${JSON.stringify(spelling)} and ${CANONICAL_FILE} are one file, yet planWaves put both writers in ${JSON.stringify(outcome.waves)}`,
    );
    assert.match(outcome.message, /fileScope overlap in same wave between a and b/);
  }
});

test('planWaves never co-schedules a task whose glob reaches a file another task writes, covering a root-opening wildcard, a mid-segment star, a character class and a brace set', () => {
  for (const glob of GLOBS_REACHING_THE_FILE) {
    const outcome = coScheduleOutcome(glob);
    assert.equal(
      outcome.refused,
      true,
      `${glob} reaches ${CANONICAL_FILE}, yet planWaves put both writers in ${JSON.stringify(outcome.waves)}`,
    );
    assert.match(outcome.message, /fileScope overlap in same wave between a and b/);
  }
});

test('planWaves still parallelizes tasks whose scopes are genuinely disjoint, so refusing overlaps has not degenerated into serializing everything', () => {
  const result = planWaves({
    tasks: [
      { id: 'a', dependsOn: [], fileScope: pack(['src/a.js']) },
      { id: 'b', dependsOn: [], fileScope: pack(['lib/b.js']) },
      { id: 'c', dependsOn: [], fileScope: pack(['docs/c.md']) },
    ],
  });
  assert.deepEqual(result.waves, [['a', 'b', 'c']]);
});

test('planWaves throws on a fileScope overlap between two tasks that only land in the same wave after a shared dependency clears in an earlier wave', () => {
  assert.throws(
    () => planWaves({
      tasks: [
        { id: 'c', dependsOn: [], fileScope: pack(['other/file.js']) },
        { id: 'a', dependsOn: ['c'], fileScope: pack(['src/shared.js']) },
        { id: 'b', dependsOn: ['c'], fileScope: pack(['src/shared.js']) },
      ],
    }),
    /fileScope overlap in same wave between a and b/,
  );
});

test('planWaves throws on a non-array fileScope instead of letting it silently escape overlap detection, naming the offending task', () => {
  assert.throws(
    () => planWaves({
      tasks: [
        { id: 'a', fileScope: 'src/a.js' },
        { id: 'b', fileScope: pack(['src/a.js']) },
      ],
    }),
    (err) => {
      assert.match(err.message, /fileScope must be a context pack object/);
      assert.match(err.message, /\btask a\b/);
      return true;
    },
  );
});

test('planWaves refuses a scalar fileScope on a task that overlaps nothing, since a scalar is never a valid scope', () => {
  assert.throws(
    () => planWaves({ tasks: [{ id: 'lonely', fileScope: 'src/lonely.js' }] }),
    /task lonely fileScope must be a context pack object/,
  );
});

test('planWaves treats an explicit null fileScope as no declared scope, exactly as an absent one', () => {
  const result = planWaves({ tasks: [{ id: 'solo', fileScope: null }] });
  assert.deepEqual(result.waves, [['solo']]);
});

test('planWaves refuses to co-schedule two genuinely overlapping tasks when one declares its fileScope as a scalar string', () => {
  const outcome = planOutcome({
    tasks: [
      { id: 'writer', dependsOn: [], fileScope: 'src/shared.js' },
      { id: 'reader', dependsOn: [], fileScope: pack(['src/shared.js']) },
    ],
  });
  assert.equal(outcome.refused, true, `expected a refusal; instead the two overlapping tasks were scheduled as ${JSON.stringify(outcome.waves)}`);
  assert.match(outcome.message, /fileScope must be a context pack object/);
});

test('scopesOverlap throws on a scalar scope in either argument position rather than walking it character by character', () => {
  assert.throws(() => scopesOverlap('src/a.js', ['src/a.js']), /fileScope must be an array/);
  assert.throws(() => scopesOverlap(['src/a.js'], 'src/a.js'), /fileScope must be an array/);
});

test('planWaves refuses a fileScope entry that is not a string, naming the offending task, rather than narrowing the declared scope to nothing', () => {
  for (const entry of [123, null, {}, ['src/nested.js']]) {
    const outcome = planOutcome({ tasks: [{ id: 'a', fileScope: pack([entry]) }] });
    assert.equal(outcome.refused, true, `expected a refusal for fileScope entry ${JSON.stringify(entry)}; instead the task was scheduled as ${JSON.stringify(outcome.waves)}`);
    assert.match(outcome.message, /task a fileScope\.edit entries must be non-empty strings/);
  }
});

test('planWaves refuses an empty-string fileScope entry rather than accepting an entry that overlaps nothing, naming the offending task', () => {
  const outcome = planOutcome({ tasks: [{ id: 'a', fileScope: pack(['']) }] });
  assert.equal(outcome.refused, true, `expected a refusal; instead the task was scheduled as ${JSON.stringify(outcome.waves)}`);
  assert.match(outcome.message, /task a fileScope\.edit entries must be non-empty strings/);
});

test('scopesOverlap refuses a non-string or empty-string entry in either argument position, so a caller that never reaches planWaves still fails closed', () => {
  assert.throws(() => scopesOverlap([123], ['src/a.js']), /fileScope entries must be non-empty strings/);
  assert.throws(() => scopesOverlap(['src/a.js'], [123]), /fileScope entries must be non-empty strings/);
  assert.throws(() => scopesOverlap([''], ['src/a.js']), /fileScope entries must be non-empty strings/);
  assert.throws(() => scopesOverlap(['src/a.js'], ['']), /fileScope entries must be non-empty strings/);
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
      { id: 'task-c', dependsOn: [], fileScope: pack(['pkg-c/file.js']) },
      { id: 'task-a', dependsOn: [], fileScope: pack(['pkg-a/file.js']) },
      { id: 'task-b', dependsOn: ['task-a', 'task-c'], fileScope: pack(['pkg-b/file.js']) },
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
      { id: 'root', dependsOn: [], fileScope: pack(['root.js']) },
      { id: 'mid-1', dependsOn: ['root'], fileScope: pack(['mid1.js']) },
      { id: 'mid-2', dependsOn: ['root'], fileScope: pack(['mid2.js']) },
      { id: 'leaf', dependsOn: ['mid-1', 'mid-2'], fileScope: pack(['leaf.js']) },
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
      { id: 'b', dependsOn: ['a'], fileScope: pack(['src/b.js']) },
      { id: 'a', dependsOn: [], fileScope: pack(['src/a.js']) },
    ],
  };
  const before = structuredClone(spec);
  planWaves(spec);
  assert.deepEqual(spec, before);
});

test('planWaves refuses to co-schedule two tasks whose EDIT sets overlap', () => {
  const outcome = planOutcome({
    tasks: [
      { id: 'writer', dependsOn: [], fileScope: pack(['src/shared.js'], ['docs/a.md']) },
      { id: 'other', dependsOn: [], fileScope: pack(['src/shared.js'], ['docs/b.md']) },
    ],
  });
  assert.equal(outcome.refused, true, `expected a refusal; instead the two overlapping edit sets were scheduled as ${JSON.stringify(outcome.waves)}`);
  assert.match(outcome.message, /fileScope overlap in same wave between other and writer/);
});

test('planWaves co-schedules two tasks whose READ sets overlap while their EDIT sets are disjoint', () => {
  const result = planWaves({
    tasks: [
      { id: 'a', dependsOn: [], fileScope: pack(['src/a.js'], ['src/shared.js', 'docs/common.md']) },
      { id: 'b', dependsOn: [], fileScope: pack(['src/b.js'], ['src/shared.js', 'docs/common.md']) },
    ],
  });
  assert.deepEqual(result.waves, [['a', 'b']], 'a shared read set is context and must never serialize two tasks');
});

test('planWaves refuses a task whose fileScope is still a bare path list, naming the task', () => {
  const outcome = planOutcome({ tasks: [{ id: 'legacy', fileScope: ['src/a.js'] }] });
  assert.equal(outcome.refused, true, `expected a refusal; instead the task was scheduled as ${JSON.stringify(outcome.waves)}`);
  assert.match(outcome.message, /task legacy fileScope must be a context pack object/);
});

test('planWaves refuses a task pack that omits the truncated key, naming the task', () => {
  const outcome = planOutcome({ tasks: [{ id: 'lossy', fileScope: { edit: ['src/a.js'], read: [] } }] });
  assert.equal(outcome.refused, true, `expected a refusal; instead the task was scheduled as ${JSON.stringify(outcome.waves)}`);
  assert.match(outcome.message, /task lossy fileScope omits the required truncated key/);
});
