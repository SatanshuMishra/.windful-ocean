import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DECOMPOSE_EMIT_USAGE,
  EXIT_CLEAN,
  EXIT_COMPOSE,
  EXIT_DECOMPOSE,
  EXIT_INPUTS,
  EXIT_WRITE,
  emitRunDocument,
  parseDecomposeArgv,
  serializeRunDocument,
} from '../decompose-emit.mjs';
import { DECOMPOSE_CHANGE_TYPES, DECOMPOSE_SCHEMA, validateAgainstSchema } from '../decompose-schema.mjs';
import { buildUnitTable } from '../leases.mjs';
import { composePrompt } from '../prompt-registry.mjs';
import { parseRunManifest } from '../recovery.mjs';
import { emitsEnvelope, fakeChild } from './dispatch-fixtures.mjs';

const PREAMBLE = 'You own one unit end to end and return the commit sha you produced.';
const SPEC_REVIEWER_PREAMBLE = 'You review the unit against its spec and return a verdict.';
const QUALITY_REVIEWER_PREAMBLE = 'You review the unit for code quality and return a verdict.';

const PREAMBLES = Object.freeze({
  implementer: PREAMBLE,
  specReviewer: SPEC_REVIEWER_PREAMBLE,
  qualityReviewer: QUALITY_REVIEWER_PREAMBLE,
});

const MSPS = Object.freeze([
  {
    id: 'alpha-core',
    title: 'add the alpha core module',
    rationale: 'The alpha core module is the seam every later unit imports, so it lands first.',
    changeType: 'feat',
    scope: 'alpha',
    securityReviewRequired: false,
    dependsOn: [],
    fileScope: { edit: ['src/alpha.mjs'], read: ['src/shared.mjs'], truncated: null },
  },
  {
    id: 'beta-wiring',
    title: 'wire beta onto the alpha core',
    rationale: 'Beta consumes the alpha core and cannot be written before that module exists.',
    changeType: 'feat',
    scope: 'beta',
    securityReviewRequired: true,
    dependsOn: ['alpha-core'],
    fileScope: { edit: ['src/beta.mjs'], read: ['src/alpha.mjs'], truncated: null },
  },
]);

const NO_WORK_REASON = 'The spec asks for behaviour this repository already ships, so this run has no unit to schedule.';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function scratch(t) {
  const root = mkdtempSync(join(tmpdir(), 'mitosis-decompose-emit-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const spec = join(root, 'SPEC.md');
  writeFileSync(spec, '# an approved spec\n');
  return { root, spec, out: join(root, 'run-document.json') };
}

function argsFor(place, overrides = {}) {
  return {
    spec: place.spec,
    repoRoot: place.root,
    baseBranch: 'main',
    sourcePrefix: 'mitosis',
    branchPrefix: 'mitosis',
    worktreeRoot: join(place.root, 'worktrees'),
    scopedCheckCmd: ['node', '--test'],
    isolation: 'worktree',
    logicalRunId: 'run-alpha',
    out: place.out,
    ...overrides,
  };
}

function recordingSpawn(structured, calls) {
  const inner = emitsEnvelope({ structured_output: structured });
  return (binary, argv, options) => {
    calls.push({ binary, argv });
    return inner(binary, argv, options);
  };
}

function rawSpawn(stdout) {
  return () => {
    const child = fakeChild(undefined);
    setImmediate(() => {
      child.stdout.end(stdout);
      child.stderr.end();
      child.emit('exit', 0, null);
    });
    return child;
  };
}

function depsFor(structured, calls = []) {
  return { spawn: recordingSpawn(structured, calls), loadPreambles: () => PREAMBLES };
}

async function emit(place, overrides = {}, msps = clone(MSPS), calls = []) {
  return emitRunDocument(argsFor(place, overrides), depsFor({ msps }, calls));
}

const COMPLETE_ARGV = Object.freeze([
  '--spec', '/repo/SPEC.md',
  '--repo-root', '/repo',
  '--base-branch', 'main',
  '--source-prefix', 'mitosis',
  '--branch-prefix', 'mitosis',
  '--worktree-root', '/repo/.worktrees',
  '--scoped-check', '["node","--test"]',
  '--isolation', 'worktree',
  '--run-id', 'run-alpha',
  '--out', '/repo/.mitosis/run-document.json',
]);

test('a complete argv parses every required flag into its field', () => {
  const parsed = parseDecomposeArgv([...COMPLETE_ARGV]);
  assert.equal(parsed.ok, true, parsed.error);
  assert.deepEqual(parsed.value, {
    spec: '/repo/SPEC.md',
    repoRoot: '/repo',
    baseBranch: 'main',
    sourcePrefix: 'mitosis',
    branchPrefix: 'mitosis',
    worktreeRoot: '/repo/.worktrees',
    scopedCheckCmd: ['node', '--test'],
    isolation: 'worktree',
    logicalRunId: 'run-alpha',
    out: '/repo/.mitosis/run-document.json',
  });
});

test('the optional flags parse into the fields the run document and the dispatch defaults read', () => {
  const parsed = parseDecomposeArgv([
    ...COMPLETE_ARGV,
    '--harness-run-id', 'harness-7',
    '--decomposer-model', 'opus',
    '--decomposer-timeout-ms', '900000',
    '--unit-agent-type', 'implementer',
    '--unit-model', 'sonnet',
    '--unit-effort', 'high',
    '--unit-timeout-ms', '600000',
  ]);
  assert.equal(parsed.ok, true, parsed.error);
  assert.equal(parsed.value.harnessRunId, 'harness-7');
  assert.equal(parsed.value.decomposerModel, 'opus');
  assert.equal(parsed.value.decomposerTimeoutMs, 900000);
  assert.equal(parsed.value.unitAgentType, 'implementer');
  assert.equal(parsed.value.unitTimeoutMs, 600000);
});

test('an unknown flag is refused and named, and the usage text lists the flags this emitter reads', () => {
  const parsed = parseDecomposeArgv([...COMPLETE_ARGV, '--window', '8']);
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /"--window" is not a flag this emitter reads/);
  assert.match(DECOMPOSE_EMIT_USAGE, /--scoped-check <value>/);
  assert.match(DECOMPOSE_EMIT_USAGE, /\[--unit-agent-type <value>\]/);
});

test('a flag given twice is refused rather than silently keeping one value', () => {
  const parsed = parseDecomposeArgv([...COMPLETE_ARGV, '--isolation', 'scope-fence']);
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /--isolation was given twice/);
});

test('a flag given no value, or a value that is itself a flag, is refused and named', () => {
  const truncated = parseDecomposeArgv(COMPLETE_ARGV.slice(0, COMPLETE_ARGV.length - 1));
  assert.equal(truncated.ok, false);
  assert.match(truncated.error, /--out needs one non-empty value/);
  const swallowed = parseDecomposeArgv([...COMPLETE_ARGV.slice(0, 2), '--repo-root', '--base-branch', 'main']);
  assert.equal(swallowed.ok, false);
  assert.match(swallowed.error, /--repo-root needs one non-empty value/);
});

test('a malformed value is refused at parse time, one case per shape the emitter enforces', () => {
  const cases = [
    ['--spec', 'SPEC.md', /--spec was given a malformed value/],
    ['--repo-root', '/repo/../elsewhere', /--repo-root was given a malformed value/],
    ['--worktree-root', '/repo/work trees', /--worktree-root was given a malformed value/],
    ['--base-branch', 'main..next', /--base-branch was given a malformed value/],
    ['--source-prefix', 'mitosis prefix', /--source-prefix was given a malformed value/],
    ['--branch-prefix', 'mitosis/', /--branch-prefix was given a malformed value/],
    ['--scoped-check', 'node --test', /--scoped-check was given a malformed value.*not JSON/],
    ['--scoped-check', '{"cmd":"node"}', /--scoped-check was given a malformed value/],
    ['--scoped-check', '[]', /--scoped-check was given a malformed value/],
    ['--isolation', 'sandbox', /--isolation was given a malformed value/],
    ['--run-id', 'Run-Alpha', /--run-id was given a malformed value/],
    ['--out', 'run-document.json', /--out was given a malformed value/],
    ['--decomposer-timeout-ms', '0', /--decomposer-timeout-ms was given a malformed value/],
    ['--unit-agent-type', 'code reviewer', /--unit-agent-type was given a malformed value/],
  ];
  for (const [flag, value, expected] of cases) {
    const argv = [...COMPLETE_ARGV];
    const at = argv.indexOf(flag);
    if (at === -1) argv.push(flag, value);
    else argv[at + 1] = value;
    const parsed = parseDecomposeArgv(argv);
    assert.equal(parsed.ok, false, `${flag} ${value} was accepted`);
    assert.match(parsed.error, expected);
  }
});

test('a missing required flag is refused and named before any work starts', () => {
  const parsed = parseDecomposeArgv(COMPLETE_ARGV.slice(2));
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /--spec.*is required/);
});

test('the decompose child is dispatched with the registry prompt and the lib-resident schema', async (t) => {
  const place = scratch(t);
  const calls = [];
  const result = await emit(place, {}, clone(MSPS), calls);
  assert.equal(result.ok, true, result.error);
  assert.equal(calls.length, 1);
  const argv = calls[0].argv;
  assert.equal(calls[0].binary, 'claude');
  assert.equal(argv[argv.indexOf('--agent') + 1], 'investigator');
  assert.equal(argv[argv.indexOf('--model') + 1], 'opus');
  assert.equal(argv[argv.indexOf('--json-schema') + 1], JSON.stringify(DECOMPOSE_SCHEMA));
  assert.equal(argv[argv.length - 1], composePrompt('decompose', {
    specPath: place.spec,
    repoRoot: place.root,
    changeTypes: [...DECOMPOSE_CHANGE_TYPES],
  }));
});

test('the schema handed to the decompose child as constrained generation permits an empty msps list carrying a reason', async (t) => {
  const place = scratch(t);
  const calls = [];
  await emit(place, {}, clone(MSPS), calls);
  assert.equal(calls.length, 1);
  const argv = calls[0].argv;
  const handed = JSON.parse(argv[argv.indexOf('--json-schema') + 1]);
  const verdict = validateAgainstSchema(handed, { msps: [], noWorkReason: NO_WORK_REASON }, 'the handed schema');
  assert.deepEqual(verdict.failures, [], verdict.failures.join('; '));
  assert.equal(verdict.ok, true);
});

test('a decomposition naming no unit but carrying a reason exits on the no-work code and writes no run document', async (t) => {
  const place = scratch(t);
  const result = await emitRunDocument(argsFor(place), depsFor({ msps: [], noWorkReason: NO_WORK_REASON }));
  assert.equal(result.ok, false);
  assert.equal(result.exitCode, 7);
  assert.notEqual(result.exitCode, EXIT_DECOMPOSE);
  assert.match(result.error, /names no unit to schedule/);
  assert.equal(result.error.includes(NO_WORK_REASON), true, result.error);
  assert.equal(existsSync(place.out), false, 'a no-work verdict left a run document behind');
});

test('the written bytes are exactly the serialization of the composed run document', async (t) => {
  const place = scratch(t);
  const result = await emit(place);
  assert.equal(result.ok, true, result.error);
  assert.equal(result.exitCode, EXIT_CLEAN);
  assert.equal(result.outPath, place.out);
  const written = readFileSync(place.out, 'utf8');
  assert.equal(written, serializeRunDocument(result.document));
  assert.deepEqual(JSON.parse(written), clone(result.document));
});

test('the written document is accepted by the real parseRunManifest and the real buildUnitTable', async (t) => {
  const place = scratch(t);
  const result = await emit(place);
  assert.equal(result.ok, true, result.error);
  const document = JSON.parse(readFileSync(place.out, 'utf8'));

  const manifest = parseRunManifest(JSON.stringify(document.manifest));
  assert.notEqual(manifest, null, 'parseRunManifest refused the manifest this emitter wrote');
  assert.equal(manifest.logicalRunId, 'run-alpha');
  assert.deepEqual(manifest.clusters, [['alpha-core', 'beta-wiring']]);
  assert.deepEqual(manifest.msps.map((msp) => msp.id), ['alpha-core', 'beta-wiring']);
  assert.equal(manifest.specContentHash.length, 64);

  const units = buildUnitTable(document.specs);
  assert.deepEqual(units.map((unit) => unit.id), ['alpha-core', 'beta-wiring']);
  assert.deepEqual(units.map((unit) => [...unit.prereqs]), [[], ['alpha-core']]);
  assert.deepEqual(units.map((unit) => [...unit.fileScope.edit]), [['src/alpha.mjs'], ['src/beta.mjs']]);
  assert.match(document.specs[0].request.prompt, /You own one unit end to end/);
});

test('the caller unit dispatch defaults travel into every emitted request', async (t) => {
  const place = scratch(t);
  const result = await emit(place, { unitAgentType: 'implementer', unitModel: 'sonnet', unitTimeoutMs: 600000 });
  assert.equal(result.ok, true, result.error);
  for (const unit of result.document.specs) {
    assert.equal(unit.request.agentType, 'implementer');
    assert.equal(unit.request.model, 'sonnet');
    assert.equal(unit.request.timeoutMs, 600000);
  }
});

test('a child whose stdout is not JSON is reported on the decompose stage and writes nothing', async (t) => {
  const place = scratch(t);
  const result = await emitRunDocument(argsFor(place), {
    spawn: rawSpawn('not json at all {'),
    loadPreambles: () => PREAMBLES,
  });
  assert.equal(result.ok, false);
  assert.equal(result.exitCode, EXIT_DECOMPOSE);
  assert.match(result.error, /decompose child returned no usable result \(malformed-output\)/);
  assert.equal(existsSync(place.out), false, 'a failed run left a partial document behind');
});

test('a decomposition only the schema can refuse is refused, and the same decomposition without the violation emits', async (t) => {
  const place = scratch(t);
  const violations = [
    (msps) => { msps[0].notes = 'a field the schema does not declare'; },
    (msps) => { msps[0].changeType = 'feature'; },
    (msps) => { msps[0].title = 'Add the alpha core module'; },
    (msps) => { delete msps[1].scope; },
  ];
  for (const violate of violations) {
    const msps = clone(MSPS);
    violate(msps);
    const refused = await emit(place, {}, msps);
    assert.equal(refused.ok, false, `${JSON.stringify(msps[0]).slice(0, 80)} was accepted`);
    assert.equal(refused.exitCode, EXIT_DECOMPOSE);
    assert.match(refused.error, /a decomposition the schema refuses/);
    assert.equal(existsSync(place.out), false, 'a schema-refused decomposition left a document behind');
  }
  const accepted = await emit(place);
  assert.equal(accepted.ok, true, accepted.error);
});

test('a decomposition the run-document composer refuses is reported on the compose stage', async (t) => {
  const place = scratch(t);
  const msps = clone(MSPS);
  msps[0].fileScope.edit = ['src/a file with spaces.mjs'];
  const result = await emit(place, {}, msps);
  assert.equal(result.ok, false);
  assert.equal(result.exitCode, EXIT_COMPOSE);
  assert.match(result.error, /alpha-core/);
  assert.equal(existsSync(place.out), false, 'a refused composition left a document behind');
});

test('a decomposition whose dependsOn names no emitted unit is refused before anything is written', async (t) => {
  const place = scratch(t);
  const msps = clone(MSPS);
  msps[1].dependsOn = ['gamma-missing'];
  const result = await emit(place, {}, msps);
  assert.equal(result.ok, false);
  assert.equal(result.exitCode, EXIT_COMPOSE);
  assert.match(result.error, /gamma-missing/);
  assert.equal(existsSync(place.out), false);
});

test('an unwritable output path is reported on the write stage and leaves nothing behind', async (t) => {
  const place = scratch(t);
  const out = join(place.root, 'no-such-directory', 'run-document.json');
  const result = await emit(place, { out });
  assert.equal(result.ok, false);
  assert.equal(result.exitCode, EXIT_WRITE);
  assert.match(result.error, /could not be written to/);
  assert.equal(existsSync(out), false);
});

test('a spec that cannot be fingerprinted is reported on the input stage before any child is spawned', async (t) => {
  const place = scratch(t);
  const calls = [];
  const result = await emitRunDocument(
    argsFor(place, { spec: join(place.root, 'SPEC-that-was-never-written.md') }),
    depsFor({ msps: clone(MSPS) }, calls),
  );
  assert.equal(result.ok, false);
  assert.equal(result.exitCode, EXIT_INPUTS);
  assert.equal(calls.length, 0, 'a run with no readable spec still spawned the decompose child');
  assert.equal(existsSync(place.out), false);
});

test('a preamble set that cannot be resolved is reported rather than composed around', async (t) => {
  const place = scratch(t);
  const result = await emitRunDocument(argsFor(place), {
    spawn: recordingSpawn({ msps: clone(MSPS) }, []),
    loadPreambles: () => { throw new Error('superpowers not found via manifest or cache'); },
  });
  assert.equal(result.ok, false);
  assert.equal(result.exitCode, EXIT_INPUTS);
  assert.match(result.error, /implementer and reviewer preambles could not be resolved/);
});

test('a preamble loader that returns something other than a record is refused by shape, naming what it returned', async (t) => {
  const place = scratch(t);
  const reasonOf = (error) => error.slice(error.indexOf('(') + 1, error.indexOf(');'));
  const keyed = 'rather than a record keyed by implementer, specReviewer, qualityReviewer';
  for (const [loaded, named] of [[null, 'null'], ['a preamble', 'string'], [['a preamble'], 'object'], [7, 'number']]) {
    const result = await emitRunDocument(argsFor(place), {
      spawn: recordingSpawn({ msps: clone(MSPS) }, []),
      loadPreambles: () => loaded,
    });
    assert.equal(result.ok, false, `a ${named} preamble set was accepted`);
    assert.equal(result.exitCode, EXIT_INPUTS);
    assert.equal(reasonOf(result.error), `the preamble loader returned ${named} ${keyed}`);
  }
});

test('a preamble set missing any one of the three texts is refused rather than composed around', async (t) => {
  const place = scratch(t);
  for (const key of ['implementer', 'specReviewer', 'qualityReviewer']) {
    const result = await emitRunDocument(argsFor(place), {
      spawn: recordingSpawn({ msps: clone(MSPS) }, []),
      loadPreambles: () => ({ ...PREAMBLES, [key]: '' }),
    });
    assert.equal(result.ok, false, `a preamble set with no ${key} text was accepted`);
    assert.equal(result.exitCode, EXIT_INPUTS);
    assert.match(result.error, new RegExp(`returned no text for ${key}`));
  }
});

test('every emitted unit carries the judgment record the dispatch reads, with the MSP declared security answer', async (t) => {
  const place = scratch(t);
  const result = await emit(place);
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(result.document.specs.map((unit) => unit.judgment.securityReviewRequired), [false, true]);
  assert.deepEqual(Object.keys(result.document.specs[0].judgment).sort(), [
    'baseBranch',
    'branch',
    'fileScope',
    'isolation',
    'qualityReviewerPreamble',
    'repoRoot',
    'securityReviewRequired',
    'specReviewerPreamble',
    'taskFullText',
    'taskId',
    'taskTitle',
  ]);
  assert.equal(result.document.specs[0].judgment.specReviewerPreamble, SPEC_REVIEWER_PREAMBLE);
  assert.equal(result.document.specs[0].judgment.qualityReviewerPreamble, QUALITY_REVIEWER_PREAMBLE);
  assert.equal(result.document.specs[0].judgment.branch, 'mitosis/alpha-core');
  assert.equal(result.document.specs[0].judgment.taskId, 'alpha-core');
});

test('a scope-fence run composes no judgment record and says so on stderr rather than skipping review in silence', async (t) => {
  const place = scratch(t);
  const written = captureStderr(t);
  const result = await emit(place, { isolation: 'scope-fence' });
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(result.document.specs.map((unit) => Object.hasOwn(unit, 'judgment')), [false, false]);
  const stderr = written.join('');
  assert.match(stderr, /composes no judgment record for "alpha-core", "beta-wiring"/);
  assert.match(stderr, /no review or security lens runs/);
});

test('the emitter never mutates the decomposition the child returned', async (t) => {
  const place = scratch(t);
  const msps = clone(MSPS);
  const before = JSON.stringify(msps);
  const result = await emit(place, {}, msps);
  assert.equal(result.ok, true, result.error);
  assert.equal(JSON.stringify(msps), before);
});

function captureStderr(t) {
  const written = [];
  const original = process.stderr.write;
  process.stderr.write = (chunk, ...rest) => {
    written.push(typeof chunk === 'string' ? chunk : String(chunk));
    return original.call(process.stderr, chunk, ...rest);
  };
  t.after(() => { process.stderr.write = original; });
  return written;
}

const COARSE_MSPS = Object.freeze([
  {
    id: 'alpha-core',
    title: 'add the alpha core module',
    rationale: 'The alpha core module is the seam every later unit imports, so it lands first.',
    changeType: 'feat',
    scope: 'alpha',
    securityReviewRequired: false,
    dependsOn: [],
    fileScope: { edit: ['src'], read: [], truncated: null },
  },
]);

test('the fresh-decompose path runs the coarse-scope lint and surfaces its flags on stderr without halting', async (t) => {
  const place = scratch(t);
  const written = captureStderr(t);
  const result = await emit(place, {}, clone(COARSE_MSPS));
  assert.equal(result.ok, true, `the coarse-scope lint is warn-only, so a coarse scope must still emit a run document: ${result.error}`);
  assert.equal(result.exitCode, EXIT_CLEAN);
  const stderr = written.join('');
  assert.match(stderr, /alpha-core/, `the coarse-scope lint never named the unit it flagged; stderr carried ${JSON.stringify(stderr)}`);
  assert.match(stderr, /bare-top-level-dir/, `the coarse-scope lint never reported the reason it flagged; stderr carried ${JSON.stringify(stderr)}`);
  assert.match(stderr, /"src"/, `the coarse-scope lint never named the coarse scope it flagged; stderr carried ${JSON.stringify(stderr)}`);
});

test('the fresh-decompose path stays silent when every declared scope names specific files', async (t) => {
  const place = scratch(t);
  const written = captureStderr(t);
  const result = await emit(place);
  assert.equal(result.ok, true, result.error);
  assert.equal(written.join(''), '', 'a decomposition whose scopes are specific files must produce no coarse-scope warning at all');
});
