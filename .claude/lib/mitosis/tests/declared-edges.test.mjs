import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Done, NeedsHuman } from '../boundary.mjs';
import { DeclaredEdgeError, filterDeclaredEdges } from '../declared-edges.mjs';
import { serializeRunDocument } from '../decompose-emit.mjs';
import { runEngine } from '../engine.mjs';
import { topologicalOrder } from '../integrate-plan.mjs';
import { buildRunDocument } from '../run-document.mjs';

const RUN_ID = 'f0117e2e';
const BLOCKED_DIAGNOSIS = 'blocked-by-parked-prerequisite';

const RUN = Object.freeze({
  logicalRunId: 'run-strings-0001',
  harnessRunId: null,
  spec: 'docs/specs/strings.md',
  repoRoot: '/repo/strings',
  baseBranch: 'main',
  sourcePrefix: 'mitosis',
  clusters: [{ id: 'cluster-one', msps: [] }],
  specContentHash: 'deadbeef',
});

const PROMPT = Object.freeze({
  implementerPreamble: 'You own one unit end to end and return the commit sha you produced.',
  specReviewerPreamble: 'You review the unit against its spec and return a verdict.',
  qualityReviewerPreamble: 'You review the unit for code quality and return a verdict.',
  scopedCheckCmd: ['node', '--test', 'tests/strings.test.mjs'],
  isolation: 'worktree',
  branchPrefix: 'mitosis',
  worktreeRoot: '/repo/strings/.worktrees',
});

const DISPATCH = Object.freeze({ agentType: 'implementer', model: 'opus', effort: 'high', timeoutMs: 900000 });

function msp(id, edit, dependsOn = []) {
  return {
    id,
    title: `unit ${id}`,
    rationale: `The unit ${id} exists so this fixture names a real body of work rather than an empty string.`,
    changeType: 'feat',
    scope: 'strings',
    securityReviewRequired: false,
    dependsOn,
    fileScope: { edit, read: [], truncated: null },
  };
}

function build(msps) {
  return buildRunDocument({ decomposition: { msps }, run: RUN, prompt: PROMPT, dispatch: DISPATCH });
}

function prereqsById(document) {
  return Object.fromEntries(document.specs.map((unit) => [unit.id, [...unit.prereqs]]));
}

function declaredById(document) {
  return Object.fromEntries(document.specs.map((unit) => [unit.id, [...unit.modelDeclaredPrereqs]]));
}

function builtFrom(document) {
  return document.manifest.msps.map((unit) => ({ unitId: unit.id }));
}

const SHARED_FILE_UNITS = Object.freeze([
  Object.freeze(msp('add-truncate-to-strings', ['src/strings.mjs'])),
  Object.freeze(msp('add-pad-to-strings', ['src/strings.mjs'], ['add-truncate-to-strings'])),
]);

function sharedFileUnits() {
  return SHARED_FILE_UNITS.map((unit) => ({ ...unit, fileScope: { ...unit.fileScope, edit: [...unit.fileScope.edit] } }));
}

function engineRequest(document) {
  return {
    specs: document.specs,
    manifest: document.manifest,
    runId: RUN_ID,
    at: '2026-08-20T12:00:00Z',
    repoRoot: RUN.repoRoot,
    journalPath: '.mitosis/run.jsonl',
    repoSlug: 'acme/strings',
    integrationBranch: 'integration',
  };
}

function stubbedPorts(dispatched, journalled) {
  return {
    runUnit: async (unit) => {
      dispatched.push(unit.id);
      if (unit.id === 'add-truncate-to-strings') {
        return NeedsHuman({ kind: 'dispatch-failed', what: 'the child exited 1; HTTP 429' }, ['attempt-one']);
      }
      return Done({ sha: `sha-${unit.id}`, green: true });
    },
    writeGenesis: async () => {},
    appendJournal: async ({ line }) => { journalled.push(JSON.parse(line)); },
    writeRef: async () => {},
  };
}

test('Q1 REPRODUCTION: when two units share every edited file and the first returns a non-retryable failure, the sibling is still dispatched and reaches done rather than parking as a blocked prerequisite', async () => {
  const units = sharedFileUnits();
  assert.deepEqual(
    units.map((unit) => [unit.id, [...unit.dependsOn], [...unit.fileScope.edit]]),
    [['add-truncate-to-strings', [], ['src/strings.mjs']], ['add-pad-to-strings', ['add-truncate-to-strings'], ['src/strings.mjs']]],
    'the fixture must declare the edge over one shared file, or this test proves nothing about the filter',
  );
  const document = build(units);

  const dispatched = [];
  const journalled = [];
  const result = await runEngine(engineRequest(document), stubbedPorts(dispatched, journalled));

  const stateOf = Object.fromEntries(result.units.map((unit) => [unit.id, unit.state]));
  assert.equal(stateOf['add-truncate-to-strings'], 'parked', 'the failing unit still parks; only its sibling is freed');
  assert.equal(
    dispatched.includes('add-pad-to-strings'),
    true,
    'the sibling that shares every edited file must actually be dispatched after the failure, not skipped',
  );
  assert.equal(stateOf['add-pad-to-strings'], 'done', 'the sibling must reach done rather than a parked terminal state');

  const siblingParks = journalled.filter((line) => line.kind === 'park' && line.unitId === 'add-pad-to-strings');
  assert.deepEqual(siblingParks, [], `no ${BLOCKED_DIAGNOSIS} park record is written for a sibling whose only edge was implied by file overlap`);
});

test('GLOB CARVE-OUT: a declared edge is kept when either unit edits a glob, because a glob can expand onto files this pass never sees named', () => {
  const document = build([
    msp('seed-auth-module', ['src/auth/index.mjs']),
    msp('sweep-auth-tree', ['src/auth/**'], ['seed-auth-module']),
  ]);
  assert.deepEqual(prereqsById(document), {
    'seed-auth-module': [],
    'sweep-auth-tree': ['seed-auth-module'],
  });
});

test('GLOB CARVE-OUT SENSE: the same two units with the glob written out as a concrete path lose the edge, so the carve-out is what keeps it and not the paths themselves', () => {
  const document = build([
    msp('seed-auth-module', ['src/auth/index.mjs']),
    msp('sweep-auth-tree', ['src/auth/index.mjs'], ['seed-auth-module']),
  ]);
  assert.deepEqual(prereqsById(document), {
    'seed-auth-module': [],
    'sweep-auth-tree': [],
  });
});

test('SEMANTIC EDGE KEPT: a declared edge between units whose edit sets do not overlap survives the filter untouched', () => {
  const document = build([
    msp('add-token-parser', ['src/token.mjs']),
    msp('wire-token-parser-into-session', ['src/session.mjs'], ['add-token-parser']),
  ]);
  assert.deepEqual(prereqsById(document), {
    'add-token-parser': [],
    'wire-token-parser-into-session': ['add-token-parser'],
  });
  assert.deepEqual(document.manifest.msps.map((unit) => [...unit.dependsOn]), [[], ['add-token-parser']]);
});

test('PARTIAL OVERLAP: one shared path is enough to drop the edge, even when each unit also edits a file the other never touches', () => {
  const document = build([
    msp('add-truncate-to-strings', ['src/strings.mjs', 'src/truncate.mjs']),
    msp('add-pad-to-strings', ['src/pad.mjs', 'src/strings.mjs'], ['add-truncate-to-strings']),
  ]);
  assert.deepEqual(prereqsById(document), {
    'add-truncate-to-strings': [],
    'add-pad-to-strings': [],
  });
});

test('SELECTIVE FILTER: one unit declaring both an overlapping and a non-overlapping prereq keeps only the semantic one', () => {
  const document = build([
    msp('add-token-parser', ['src/token.mjs']),
    msp('add-truncate-to-strings', ['src/strings.mjs']),
    msp('add-pad-to-strings', ['src/strings.mjs'], ['add-token-parser', 'add-truncate-to-strings']),
  ]);
  assert.deepEqual(prereqsById(document)['add-pad-to-strings'], ['add-token-parser']);
  assert.deepEqual(declaredById(document)['add-pad-to-strings'], ['add-token-parser', 'add-truncate-to-strings']);
});

test('PRESERVED DECLARATION: the raw declaration survives the real serializer into the written document, alongside the filtered schedule edge', () => {
  const document = build(sharedFileUnits());
  const written = JSON.parse(serializeRunDocument(document));

  const spec = written.specs.find((unit) => unit.id === 'add-pad-to-strings');
  assert.deepEqual(spec.modelDeclaredPrereqs, ['add-truncate-to-strings'], 'the written spec keeps what the model declared');
  assert.deepEqual(spec.prereqs, [], 'the written spec schedules on the filtered edge set');

  const entry = written.manifest.msps.find((unit) => unit.id === 'add-pad-to-strings');
  assert.deepEqual(entry.modelDeclaredDependsOn, ['add-truncate-to-strings'], 'the written manifest entry keeps what the model declared');
  assert.deepEqual(entry.dependsOn, [], 'the written manifest entry schedules on the filtered edge set');

  const seed = written.specs.find((unit) => unit.id === 'add-truncate-to-strings');
  assert.deepEqual(seed.modelDeclaredPrereqs, [], 'a unit that declared nothing carries an empty array, never a missing key');
  assert.equal(Object.hasOwn(seed, 'modelDeclaredPrereqs'), true);
  assert.equal(Object.hasOwn(written.manifest.msps.find((unit) => unit.id === 'add-truncate-to-strings'), 'modelDeclaredDependsOn'), true);
});

test('FROZEN OUTPUT: the filtered and declared arrays a unit carries are both frozen, so no later stage can widen the schedule in place', () => {
  const document = build(sharedFileUnits());
  const unit = document.specs.find((entry) => entry.id === 'add-pad-to-strings');
  assert.equal(Object.isFrozen(unit.prereqs), true);
  assert.equal(Object.isFrozen(unit.modelDeclaredPrereqs), true);
});

test('BACKWARD DECLARATION: an edge whose prerequisite is declared after its dependent survives the filter, so the overlap derivation cannot replace it with its own reverse', () => {
  const document = build([
    msp('wire-pad-into-strings', ['src/strings.mjs'], ['add-truncate-to-strings']),
    msp('add-truncate-to-strings', ['src/strings.mjs']),
  ]);

  assert.deepEqual(prereqsById(document), {
    'wire-pad-into-strings': ['add-truncate-to-strings'],
    'add-truncate-to-strings': [],
  }, 'the overlap derivation points its edge at the earlier-declared unit, so dropping this edge would hand the schedule the opposite one');

  assert.throws(
    () => topologicalOrder(builtFrom(document), document.manifest),
    (error) => error instanceof TypeError && /depend on one another in a cycle/.test(error.message),
    'a declaration the overlap order contradicts is refused by name, rather than silently scheduled the other way round',
  );
});

test('FORWARD DECLARATION SENSE: the same two units with the prerequisite declared first lose the edge and order without a refusal, so it is the declaration order that keeps the backward edge', () => {
  const document = build([
    msp('add-truncate-to-strings', ['src/strings.mjs']),
    msp('wire-pad-into-strings', ['src/strings.mjs'], ['add-truncate-to-strings']),
  ]);

  assert.deepEqual(prereqsById(document), {
    'add-truncate-to-strings': [],
    'wire-pad-into-strings': [],
  });
  assert.deepEqual(
    topologicalOrder(builtFrom(document), document.manifest).map((entry) => entry.unitId),
    ['add-truncate-to-strings', 'wire-pad-into-strings'],
  );
});

test('REPO ROOT SCOPE: an edit path that canonicalizes to nothing keeps the declared edge, because a scope read as overlapping every file must not be read as implying every edge', () => {
  const onDependent = build([
    msp('write-readme', ['docs/readme.md']),
    msp('rewrite-repo-root', ['.'], ['write-readme']),
  ]);
  assert.deepEqual(prereqsById(onDependent), {
    'write-readme': [],
    'rewrite-repo-root': ['write-readme'],
  }, 'a repo-root-shaped edit set overlaps every sibling path, so treating it as an implied edge would erase every semantic edge the unit declares');

  const onPrereq = build([
    msp('rewrite-repo-root', ['/']),
    msp('write-readme', ['docs/readme.md'], ['rewrite-repo-root']),
  ]);
  assert.deepEqual(prereqsById(onPrereq)['write-readme'], ['rewrite-repo-root']);
});

test('GLOB CARVE-OUT ON THE PREREQ SIDE: a unit editing concrete paths keeps the edge it declares on a prerequisite that edits a glob', () => {
  const document = build([
    msp('sweep-auth-tree', ['src/auth/**']),
    msp('wire-auth-into-session', ['src/auth/index.mjs'], ['sweep-auth-tree']),
  ]);
  assert.deepEqual(prereqsById(document), {
    'sweep-auth-tree': [],
    'wire-auth-into-session': ['sweep-auth-tree'],
  });
});

test('FILTER BOUNDARY: filterDeclaredEdges names itself, its error type and the value it was handed when it is not given the two maps and the order it needs', () => {
  assert.throws(
    () => filterDeclaredEdges({}, new Map()),
    (error) => error instanceof DeclaredEdgeError
      && error.name === 'DeclaredEdgeError'
      && error.message.startsWith('declared-edges: ')
      && /the declared prereq map must be a Map keyed by unit id, received object$/.test(error.message),
  );
  assert.throws(
    () => filterDeclaredEdges(new Map(), null),
    (error) => error instanceof DeclaredEdgeError
      && error.name === 'DeclaredEdgeError'
      && error.message.startsWith('declared-edges: ')
      && /the validated fileScope map must be a Map keyed by unit id, received null$/.test(error.message),
  );
  assert.throws(
    () => filterDeclaredEdges(new Map(), new Map()),
    (error) => error instanceof DeclaredEdgeError && /the declaration order must be an array of unit ids, received undefined/.test(error.message),
  );
  assert.throws(
    () => filterDeclaredEdges(new Map([['alpha', []]]), new Map([['alpha', { edit: [] }]]), ['alpha', 'alpha']),
    (error) => error instanceof DeclaredEdgeError && /holds two positions in the declaration order/.test(error.message),
  );
  assert.throws(
    () => filterDeclaredEdges(new Map([['alpha', []]]), new Map([['alpha', { edit: [] }]]), ['beta']),
    (error) => error instanceof DeclaredEdgeError && /holds no position in the declaration order/.test(error.message),
  );
});

test('FILTER BOUNDARY: filterDeclaredEdges refuses a unit with no fileScope pack rather than silently classifying its edges', () => {
  assert.throws(
    () => filterDeclaredEdges(new Map([['alpha', []]]), new Map(), ['alpha']),
    (error) => error instanceof DeclaredEdgeError && /no validated fileScope pack was supplied for it/.test(error.message),
  );
  assert.throws(
    () => filterDeclaredEdges(new Map([['alpha', []]]), new Map([['alpha', { edit: 'src/a.mjs' }]]), ['alpha']),
    (error) => error instanceof DeclaredEdgeError && /edit set is string rather than an array of paths/.test(error.message),
  );
  assert.throws(
    () => filterDeclaredEdges(new Map([['alpha', 'beta']]), new Map([['alpha', { edit: [] }]]), ['alpha']),
    (error) => error instanceof DeclaredEdgeError && /declared prereq list of string rather than an array of unit ids/.test(error.message),
  );
  assert.throws(
    () => filterDeclaredEdges(new Map([['alpha', ['ghost']]]), new Map([['alpha', { edit: [] }]]), ['alpha', 'ghost']),
    (error) => error instanceof DeclaredEdgeError && /the edge cannot be classified as implied or semantic/.test(error.message),
  );
});

test('FILTER BOUNDARY: a fileScope that is not a pack at all is refused by name, rather than read through as a unit that overlaps nothing', () => {
  for (const scope of [null, ['src/a.mjs'], 'src/a.mjs', 7]) {
    assert.throws(
      () => filterDeclaredEdges(new Map([['alpha', []]]), new Map([['alpha', scope]]), ['alpha']),
      (error) => error instanceof DeclaredEdgeError && /where a validated fileScope pack was required/.test(error.message),
      `a fileScope of ${JSON.stringify(scope)} must be refused by name`,
    );
  }
});

test('FILTER BOUNDARY: an edit-set entry that is not a non-empty path string is refused by name, rather than thrown out of the glob reader as an unnamed type error', () => {
  assert.throws(
    () => filterDeclaredEdges(new Map([['alpha', []]]), new Map([['alpha', { edit: [123] }]]), ['alpha']),
    (error) => error instanceof DeclaredEdgeError && /carries 123 in its edit set where a non-empty path string was required/.test(error.message),
  );
  assert.throws(
    () => filterDeclaredEdges(new Map([['alpha', []]]), new Map([['alpha', { edit: ['src/a.mjs', ''] }]]), ['alpha']),
    (error) => error instanceof DeclaredEdgeError && /carries "" in its edit set where a non-empty path string was required/.test(error.message),
  );
});
