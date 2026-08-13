import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FILE_SCOPE_EDIT_MAX,
  FILE_SCOPE_READ_MAX,
  aggregateMspFileScope,
  emptyFileScopePack,
  makeFileScopePack,
  requireFileScopePack,
} from '../msp-file-scope.mjs';
import { pack } from './file-scope-fixtures.mjs';

test('makeFileScopePack sorts and deduplicates the edit and read sets independently', () => {
  const built = makeFileScopePack({
    edit: ['src/z.js', 'src/a.js', 'src/z.js'],
    read: ['docs/z.md', 'docs/a.md', 'docs/a.md'],
  });
  assert.deepEqual(built.edit, ['src/a.js', 'src/z.js']);
  assert.deepEqual(built.read, ['docs/a.md', 'docs/z.md']);
  assert.equal(built.truncated, null);
});

test('a path declared editable never also appears in the read set', () => {
  const built = makeFileScopePack({ edit: ['src/shared.js'], read: ['src/shared.js', 'docs/only.md'] });
  assert.deepEqual(built.edit, ['src/shared.js']);
  assert.deepEqual(built.read, ['docs/only.md']);
});

test('makeFileScopePack refuses a non-array edit or read set', () => {
  assert.throws(() => makeFileScopePack({ edit: 'src/a.js', read: [] }), /fileScope\.edit must be an array/);
  assert.throws(() => makeFileScopePack({ edit: [], read: 'docs/a.md' }), /fileScope\.read must be an array/);
  assert.throws(() => makeFileScopePack({ edit: [''], read: [] }), /fileScope\.edit entries must be non-empty strings/);
  assert.throws(() => makeFileScopePack({ edit: [], read: [7] }), /fileScope\.read entries must be non-empty strings/);
});

test('an over-cap read set truncates and records a non-null marker naming what was dropped', () => {
  const read = Array.from({ length: FILE_SCOPE_READ_MAX + 3 }, (_, i) => `docs/f${String(i).padStart(5, '0')}.md`);
  const built = makeFileScopePack({ edit: ['src/a.js'], read });
  assert.equal(built.read.length, FILE_SCOPE_READ_MAX);
  assert.notEqual(built.truncated, null);
  assert.equal(built.truncated.dropped, 3);
  assert.match(built.truncated.reason, /read set/);
  assert.deepEqual(built.edit, ['src/a.js']);
});

test('an over-cap edit set throws and is never shortened', () => {
  const edit = Array.from({ length: FILE_SCOPE_EDIT_MAX + 1 }, (_, i) => `src/f${String(i).padStart(5, '0')}.js`);
  assert.throws(() => makeFileScopePack({ edit, read: [] }), /edit set is the collision fence/);
});

test('requireFileScopePack throws when the truncated key is absent and accepts an explicit null', () => {
  assert.throws(
    () => requireFileScopePack({ edit: ['src/a.js'], read: [] }, 'msp m1 fileScope'),
    /msp m1 fileScope omits the required truncated key/,
  );
  const accepted = requireFileScopePack(pack(['src/a.js'], ['docs/a.md']), 'msp m1 fileScope');
  assert.deepEqual(accepted.edit, ['src/a.js']);
  assert.deepEqual(accepted.read, ['docs/a.md']);
  assert.equal(accepted.truncated, null);
});

test('requireFileScopePack refuses a bare path list and a pack missing edit or read', () => {
  assert.throws(() => requireFileScopePack(['src/a.js'], 'task t1 fileScope'), /must be a context pack object/);
  assert.throws(() => requireFileScopePack(null, 'task t1 fileScope'), /must be a context pack object/);
  assert.throws(() => requireFileScopePack({ read: [], truncated: null }, 'task t1 fileScope'), /omits the required edit key/);
  assert.throws(() => requireFileScopePack({ edit: [], truncated: null }, 'task t1 fileScope'), /omits the required read key/);
});

test('requireFileScopePack refuses a malformed truncation marker', () => {
  assert.throws(() => requireFileScopePack(pack([], [], { dropped: 0, reason: 'x' }), 'p'), /dropped/);
  assert.throws(() => requireFileScopePack(pack([], [], { dropped: 2, reason: '' }), 'p'), /reason/);
  assert.throws(() => requireFileScopePack(pack([], [], 'truncated'), 'p'), /truncation marker/);
});

test('emptyFileScopePack is a complete pack carrying an explicit null marker', () => {
  const empty = emptyFileScopePack();
  assert.deepEqual(empty.edit, []);
  assert.deepEqual(empty.read, []);
  assert.equal(empty.truncated, null);
  assert.doesNotThrow(() => requireFileScopePack(empty, 'empty'));
});

test('aggregateMspFileScope unions the task edit sets and the task read sets without either leaking into the other', () => {
  const tasksMap = {
    t1: { id: 't1', fileScope: pack(['lib/a.js', 'lib/b.js'], ['docs/a.md']) },
    t2: { id: 't2', fileScope: pack(['lib/c.js'], ['docs/c.md']) },
  };
  const aggregate = aggregateMspFileScope(tasksMap);
  assert.deepEqual(aggregate.edit, ['lib/a.js', 'lib/b.js', 'lib/c.js']);
  assert.deepEqual(aggregate.read, ['docs/a.md', 'docs/c.md']);
  assert.equal(aggregate.truncated, null);
});

test('aggregateMspFileScope deduplicates and sorts, and an editable path in one task is never read-only in the aggregate', () => {
  const tasksMap = {
    t1: { id: 't1', fileScope: pack(['zeta/z.js', 'alpha/a.js'], ['mid/m.js']) },
    t2: { id: 't2', fileScope: pack(['alpha/a.js'], ['mid/m.js', 'zeta/z.js']) },
  };
  const aggregate = aggregateMspFileScope(tasksMap);
  assert.deepEqual(aggregate.edit, ['alpha/a.js', 'zeta/z.js']);
  assert.deepEqual(aggregate.read, ['mid/m.js']);
});

test('an empty task map yields the empty pack, and a task declaring no fileScope contributes nothing', () => {
  assert.deepEqual(aggregateMspFileScope({}), emptyFileScopePack());
  assert.deepEqual(aggregateMspFileScope({ t1: { id: 't1' } }), emptyFileScopePack());
});

test('a truncated task pack cannot aggregate into a null marker; the marker folds upward with dropped summed', () => {
  const tasksMap = {
    t1: { id: 't1', fileScope: pack(['lib/a.js'], ['docs/a.md'], { dropped: 2, reason: 'read set capped at the task level' }) },
    t2: { id: 't2', fileScope: pack(['lib/b.js'], ['docs/b.md'], { dropped: 5, reason: 'read set capped at the task level' }) },
  };
  const aggregate = aggregateMspFileScope(tasksMap);
  assert.notEqual(aggregate.truncated, null);
  assert.equal(aggregate.truncated.dropped, 7);
  assert.deepEqual(aggregate.edit, ['lib/a.js', 'lib/b.js']);
});

test('aggregateMspFileScope refuses a task whose fileScope is still a bare path list', () => {
  assert.throws(
    () => aggregateMspFileScope({ t1: { id: 't1', fileScope: ['lib/a.js'] } }),
    /task t1 fileScope must be a context pack object/,
  );
});

test('throws when tasksMap is not a non-null, non-array object', () => {
  assert.throws(() => aggregateMspFileScope(null), /non-null, non-array object/);
  assert.throws(() => aggregateMspFileScope([{ fileScope: pack(['x']) }]), /non-null, non-array object/);
});

test('throws when tasksMap is a non-object primitive', () => {
  assert.throws(() => aggregateMspFileScope('not-an-object'), /non-null, non-array object/);
  assert.throws(() => aggregateMspFileScope(42), /non-null, non-array object/);
});
