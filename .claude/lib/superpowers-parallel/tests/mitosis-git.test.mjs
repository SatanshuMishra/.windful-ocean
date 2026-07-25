import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, readFileSync, existsSync, rmSync, accessSync, realpathSync, constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyGhMerge } from '../gh-merge-shim.mjs';
import {
  MITOSIS_GIT_USAGE_EXIT,
  MITOSIS_GIT_TRIPWIRE_EXIT,
  MITOSIS_GIT_OBSERVE_EXIT,
  MITOSIS_GIT_CONVERGE_EXIT,
  MITOSIS_GIT_GH_MISSING_EXIT,
  MITOSIS_GIT_VERBS,
  parseMitosisGitArgv,
  renderPrCreateBody,
  buildGhArgv,
  ghExecTripwire,
  resolveGhBinary,
} from '../mitosis-git.mjs';

const WRAPPER = fileURLToPath(new URL('../mitosis-git.mjs', import.meta.url));

const REPO = 'acme/widgets';
const HEAD = 'mitosis/msp-1-integration';
const BASE = 'main';

function prCreateArgv(extra = []) {
  return ['pr-create', '--repo', REPO, '--head', HEAD, '--base', BASE, '--title', 'MSP-1 ships the thing', ...extra];
}

function okParse(argv) {
  const parsed = parseMitosisGitArgv(argv);
  assert.equal(parsed.ok, true, `expected a successful parse, got: ${parsed.error}`);
  return parsed;
}

function failParse(argv) {
  const parsed = parseMitosisGitArgv(argv);
  assert.equal(parsed.ok, false, `expected a rejected parse for ${JSON.stringify(argv)}`);
  assert.equal(typeof parsed.error, 'string');
  assert.ok(parsed.error.length > 0, 'a rejection must carry a reason');
  return parsed;
}

test('the wrapper exposes exactly three verbs and none of them is a merge verb', () => {
  assert.deepEqual([...MITOSIS_GIT_VERBS].sort(), ['compare', 'pr-close', 'pr-create']);
  for (const verb of MITOSIS_GIT_VERBS) {
    assert.ok(!/merge|approve|review/.test(verb), `verb ${verb} must not name a merge or approval action`);
  }
});

const REJECTED_VERBS = Object.freeze([
  [],
  ['merge'],
  ['pr-merge'],
  ['pr-review'],
  ['pr'],
  ['api'],
  ['--repo', REPO],
  ['PR-CREATE', '--repo', REPO],
]);

for (const argv of REJECTED_VERBS) {
  test(`parse REJECTS the verb position ${JSON.stringify(argv)}`, () => {
    failParse(argv);
  });
}

test('parse accepts a well-formed pr-create and freezes the parsed values', () => {
  const parsed = okParse(prCreateArgv());
  assert.equal(parsed.verb, 'pr-create');
  assert.equal(parsed.opts.repo, REPO);
  assert.equal(parsed.opts.head, HEAD);
  assert.equal(parsed.opts.base, BASE);
  assert.equal(parsed.opts.title, 'MSP-1 ships the thing');
  assert.deepEqual(parsed.opts.bodyLines, []);
  assert.equal(parsed.opts.supersedes, null);
  assert.deepEqual(parsed.opts.depends, []);
  assert.ok(Object.isFrozen(parsed.opts));
});

const MISSING_REQUIRED = Object.freeze([
  ['pr-create', '--head', HEAD, '--base', BASE, '--title', 't'],
  ['pr-create', '--repo', REPO, '--base', BASE, '--title', 't'],
  ['pr-create', '--repo', REPO, '--head', HEAD, '--title', 't'],
  ['pr-create', '--repo', REPO, '--head', HEAD, '--base', BASE],
  ['pr-close', '--repo', REPO],
  ['pr-close', '--pr', '12'],
  ['compare', '--repo', REPO, '--base', BASE],
  ['compare', '--repo', REPO, '--head', HEAD],
  ['compare', '--base', BASE, '--head', HEAD],
]);

for (const argv of MISSING_REQUIRED) {
  test(`parse REJECTS a missing required flag ${JSON.stringify(argv)}`, () => {
    failParse(argv);
  });
}

test('parse REJECTS --repo entirely so the wrapper can never resolve the ambient cwd repo', () => {
  const parsed = failParse(['pr-create', '--head', HEAD, '--base', BASE, '--title', 't']);
  assert.match(parsed.error, /--repo/);
});

const REJECTED_FLAG_FORMS = Object.freeze([
  ['pr-create', '--repo=acme/widgets', '--head', HEAD, '--base', BASE, '--title', 't'],
  prCreateArgv(['--body-file', '/etc/passwd']),
  prCreateArgv(['--fill']),
  prCreateArgv(['-F', 'body=@/etc/passwd']),
  prCreateArgv(['-f', 'body=x']),
  prCreateArgv(['--input', '/tmp/x.json']),
  prCreateArgv(['--field', 'body=x']),
  prCreateArgv(['--raw-field', 'body=x']),
  prCreateArgv(['-X', 'PUT']),
  prCreateArgv(['--method', 'PUT']),
  prCreateArgv(['--web']),
  prCreateArgv(['--repo', 'other/repo']),
  prCreateArgv(['--title', 'second title']),
  prCreateArgv(['--body-line']),
  prCreateArgv(['stray-positional']),
  prCreateArgv(['--']),
]);

for (const argv of REJECTED_FLAG_FORMS) {
  test(`parse REJECTS the flag form ${JSON.stringify(argv)} before anything executes`, () => {
    failParse(argv);
  });
}

test('parse accumulates a repeated --body-line instead of rejecting it', () => {
  const parsed = okParse(prCreateArgv(['--body-line', 'first', '--body-line', 'second']));
  assert.deepEqual(parsed.opts.bodyLines, ['first', 'second']);
});

const AT_SIGIL_VALUES = Object.freeze([
  ['pr-create', '--repo', REPO, '--head', HEAD, '--base', BASE, '--title', '@/etc/passwd'],
  prCreateArgv(['--body-line', '@/etc/passwd']),
  prCreateArgv(['--body-line', '@-']),
  ['pr-close', '--repo', REPO, '--pr', '12', '--comment', '@/etc/passwd'],
]);

for (const argv of AT_SIGIL_VALUES) {
  test(`parse REJECTS an @-prefixed field-indirection value ${JSON.stringify(argv)}`, () => {
    failParse(argv);
  });
}

test('parse strips control characters from a title rather than letting them reach gh', () => {
  const parsed = okParse(['pr-create', '--repo', REPO, '--head', HEAD, '--base', BASE, '--title', 'a\nb\tc\u0000d']);
  assert.equal(parsed.opts.title, 'abcd');
});

test('parse strips control characters from every body line', () => {
  const parsed = okParse(prCreateArgv(['--body-line', 'one\ntwo', '--body-line', 'three\u007f']));
  assert.deepEqual(parsed.opts.bodyLines, ['onetwo', 'three']);
});

test('parse REJECTS a value that is empty once control characters are stripped', () => {
  failParse(['pr-create', '--repo', REPO, '--head', HEAD, '--base', BASE, '--title', '\n\t\u0000']);
});

test('parse REJECTS an over-cap title rather than silently truncating it', () => {
  const parsed = okParse(['pr-create', '--repo', REPO, '--head', HEAD, '--base', BASE, '--title', 'x'.repeat(256)]);
  assert.equal(parsed.opts.title.length, 256);
  failParse(['pr-create', '--repo', REPO, '--head', HEAD, '--base', BASE, '--title', 'x'.repeat(257)]);
});

test('parse REJECTS an over-cap body line rather than silently truncating it', () => {
  okParse(prCreateArgv(['--body-line', 'y'.repeat(512)]));
  failParse(prCreateArgv(['--body-line', 'y'.repeat(513)]));
});

const REJECTED_REPO_SLUGS = Object.freeze([
  'acme',
  'acme/widgets/extra',
  '../..',
  'acme/..',
  '../widgets',
  'ac..me/widgets',
  'acme/wid gets',
  '-acme/widgets',
  'acme/.',
  'acme/widgets;rm -rf /',
  '$(id)/widgets',
  'acme/widgets\n',
  '',
]);

for (const slug of REJECTED_REPO_SLUGS) {
  test(`parse REJECTS the repo slug ${JSON.stringify(slug)}`, () => {
    failParse(['compare', '--repo', slug, '--base', BASE, '--head', HEAD]);
  });
}

test('parse ACCEPTS a legitimate dot-leading repo name', () => {
  const parsed = okParse(['compare', '--repo', 'acme/.github', '--base', BASE, '--head', HEAD]);
  assert.equal(parsed.opts.repo, 'acme/.github');
});

const REJECTED_REF_TOKENS = Object.freeze([
  'main; rm -rf /',
  'main branch',
  '-main',
  'a..b',
  'refs/heads/x.lock',
  'main\n',
  '$(id)',
  '`id`',
  'main|tee',
  '',
  'x'.repeat(256),
]);

for (const ref of REJECTED_REF_TOKENS) {
  test(`parse REJECTS the ref token ${JSON.stringify(ref)} in --head`, () => {
    failParse(['pr-create', '--repo', REPO, '--head', ref, '--base', BASE, '--title', 't']);
  });
  test(`parse REJECTS the ref token ${JSON.stringify(ref)} in --base`, () => {
    failParse(['compare', '--repo', REPO, '--base', ref, '--head', HEAD]);
  });
}

const REJECTED_PR_NUMBERS = Object.freeze(['0', '01', '-1', '1a', '12.0', '', '1 2', '99999999999']);

for (const pr of REJECTED_PR_NUMBERS) {
  test(`parse REJECTS the pr number ${JSON.stringify(pr)}`, () => {
    failParse(['pr-close', '--repo', REPO, '--pr', pr]);
  });
}

test('parse ACCEPTS a well-formed pr-close', () => {
  const parsed = okParse(['pr-close', '--repo', REPO, '--pr', '412', '--comment', 'superseded']);
  assert.equal(parsed.verb, 'pr-close');
  assert.equal(parsed.opts.pr, '412');
  assert.equal(parsed.opts.comment, 'superseded');
});

const REJECTED_SUPERSEDES = Object.freeze([
  'not-a-url',
  'javascript:alert(1)',
  'https://evil.example.com/acme/widgets/pull/1',
  'https://github.com/acme/widgets/pull/abc',
  'https://github.com/acme/widgets',
  '@/etc/passwd',
]);

for (const url of REJECTED_SUPERSEDES) {
  test(`parse REJECTS --supersedes ${JSON.stringify(url)}`, () => {
    failParse(prCreateArgv(['--supersedes', url]));
  });
}

test('parse ACCEPTS a github pull-request url for --supersedes', () => {
  const parsed = okParse(prCreateArgv(['--supersedes', 'https://github.com/acme/widgets/pull/41']));
  assert.equal(parsed.opts.supersedes, 'https://github.com/acme/widgets/pull/41');
});

const REJECTED_DEPENDS = Object.freeze(['', '(none)', 'MSP-1', 'msp 1', 'msp-1,,msp-2', 'msp-1;id', '-msp-1', ',']);

for (const depends of REJECTED_DEPENDS) {
  test(`parse REJECTS --depends ${JSON.stringify(depends)}`, () => {
    failParse(prCreateArgv(['--depends', depends]));
  });
}

test('parse ACCEPTS a comma-separated --depends list and tolerates the engine spacing', () => {
  const parsed = okParse(prCreateArgv(['--depends', 'msp-1, msp-2']));
  assert.deepEqual(parsed.opts.depends, ['msp-1', 'msp-2']);
});

test('renderPrCreateBody composes a fixed template from inert values only', () => {
  const body = renderPrCreateBody({
    bodyLines: ['interdiff: renamed two helpers'],
    supersedes: 'https://github.com/acme/widgets/pull/41',
    depends: ['msp-1', 'msp-2'],
  });
  assert.match(body, /interdiff: renamed two helpers/);
  assert.match(body, /SUPERSEDES https:\/\/github\.com\/acme\/widgets\/pull\/41/);
  assert.match(body, /DEPENDS-ON msp-1, msp-2/);
  assert.ok(!body.startsWith('@'), 'a rendered body must never begin with the field-indirection sigil');
});

test('renderPrCreateBody omits the supersedes and depends lines when they are absent', () => {
  const body = renderPrCreateBody({ bodyLines: [], supersedes: null, depends: [] });
  assert.ok(!body.includes('SUPERSEDES'));
  assert.ok(!body.includes('DEPENDS-ON'));
  assert.ok(body.length > 0, 'the fixed trailer is always present');
});

test('buildGhArgv composes the pr-create OBSERVE probe as an exact argv array', () => {
  const { opts } = okParse(prCreateArgv());
  assert.deepEqual(buildGhArgv('pr-create', 'observe', opts), [
    'pr', 'list', '-R', REPO, '--head', HEAD, '--base', BASE, '--state', 'open', '--json', 'url,number',
  ]);
});

test('buildGhArgv composes the pr-create CONVERGE call with an inline --body and no reference-valued flag', () => {
  const { opts } = okParse(prCreateArgv(['--body-line', 'summary']));
  const argv = buildGhArgv('pr-create', 'converge', opts);
  assert.deepEqual(argv.slice(0, 10), [
    'pr', 'create', '-R', REPO, '--head', HEAD, '--base', BASE, '--title', 'MSP-1 ships the thing',
  ]);
  assert.equal(argv[10], '--body');
  assert.equal(argv.length, 12);
  assert.match(argv[11], /summary/);
  for (const banned of ['--body-file', '--fill', '-F', '-f', '--field', '--raw-field', '--input', '-X', '--method']) {
    assert.ok(!argv.includes(banned), `the converge argv must never carry ${banned}`);
  }
});

test('buildGhArgv composes the pr-close OBSERVE and CONVERGE calls and the converge one can only close', () => {
  const { opts } = okParse(['pr-close', '--repo', REPO, '--pr', '412']);
  assert.deepEqual(buildGhArgv('pr-close', 'observe', opts), ['pr', 'view', '-R', REPO, '412', '--json', 'state,url']);
  assert.deepEqual(buildGhArgv('pr-close', 'converge', opts), ['pr', 'close', '-R', REPO, '412']);
});

test('buildGhArgv appends --comment to the close call as one inert value', () => {
  const { opts } = okParse(['pr-close', '--repo', REPO, '--pr', '412', '--comment', 'superseded by #500']);
  assert.deepEqual(buildGhArgv('pr-close', 'converge', opts), ['pr', 'close', '-R', REPO, '412', '--comment', 'superseded by #500']);
});

test('buildGhArgv composes the compare path as ONE argv element with no method or body flag', () => {
  const { opts } = okParse(['compare', '--repo', REPO, '--base', BASE, '--head', HEAD]);
  const argv = buildGhArgv('compare', 'read', opts);
  assert.deepEqual(argv, ['api', `repos/${REPO}/compare/${BASE}...${HEAD}`]);
  for (const banned of ['-X', '--method', '-f', '-F', '--field', '--raw-field', '--input']) {
    assert.ok(!argv.includes(banned), `the compare argv must never carry ${banned}`);
  }
});

test('buildGhArgv REFUSES an unknown verb or stage rather than emitting a partial argv', () => {
  const { opts } = okParse(prCreateArgv());
  assert.throws(() => buildGhArgv('pr-merge', 'converge', opts));
  assert.throws(() => buildGhArgv('pr-create', 'merge', opts));
  assert.throws(() => buildGhArgv('compare', 'converge', opts));
});

test('every argv this wrapper can construct passes the shim classifier (merge is absent by construction)', () => {
  const noIo = Object.freeze({ readFile: () => null, readStdin: () => null });
  const cases = [
    ['pr-create', 'observe', okParse(prCreateArgv()).opts],
    ['pr-create', 'converge', okParse(prCreateArgv(['--body-line', 'x'])).opts],
    ['pr-close', 'observe', okParse(['pr-close', '--repo', REPO, '--pr', '412']).opts],
    ['pr-close', 'converge', okParse(['pr-close', '--repo', REPO, '--pr', '412']).opts],
    ['compare', 'read', okParse(['compare', '--repo', REPO, '--base', BASE, '--head', HEAD]).opts],
  ];
  for (const [verb, stage, opts] of cases) {
    const argv = buildGhArgv(verb, stage, opts);
    assert.equal(classifyGhMerge(argv, noIo).refuse, false, `${verb}/${stage} produced an argv the merge classifier refuses: ${JSON.stringify(argv)}`);
    assert.equal(ghExecTripwire(argv, classifyGhMerge).allow, true);
  }
});

test('ghExecTripwire REFUSES a merge argv using the shim classifier, proving the tripwire is wired', () => {
  const gate = ghExecTripwire(['pr', 'merge', '12'], classifyGhMerge);
  assert.equal(gate.allow, false);
  assert.match(gate.reason, /merge-deny/);
});

test('ghExecTripwire REFUSES an api PUT to the merge endpoint using the shim classifier', () => {
  const gate = ghExecTripwire(['api', '-X', 'PUT', 'repos/o/r/pulls/12/merge'], classifyGhMerge);
  assert.equal(gate.allow, false);
  assert.match(gate.reason, /merge-deny/);
});

const FAIL_CLOSED_CLASSIFIERS = Object.freeze([
  ['throws', () => { throw new Error('boom'); }],
  ['returns null', () => null],
  ['returns undefined', () => undefined],
  ['returns a string', () => 'ok'],
  ['returns an array', () => []],
  ['returns an object with no refuse field', () => ({})],
  ['returns refuse as the string "false"', () => ({ refuse: 'false' })],
  ['returns refuse as 0', () => ({ refuse: 0 })],
  ['returns refuse as null', () => ({ refuse: null })],
  ['returns refuse as true', () => ({ refuse: true, reason: 'nope' })],
]);

for (const [label, classify] of FAIL_CLOSED_CLASSIFIERS) {
  test(`ghExecTripwire FAILS CLOSED when the classifier ${label}`, () => {
    const gate = ghExecTripwire(['pr', 'list', '-R', REPO], classify);
    assert.equal(gate.allow, false, `a classifier that ${label} must not yield an allow`);
    assert.equal(typeof gate.reason, 'string');
    assert.ok(gate.reason.length > 0);
  });
}

test('ghExecTripwire ALLOWS only a strict refuse === false', () => {
  assert.equal(ghExecTripwire(['pr', 'list'], () => ({ refuse: false })).allow, true);
});

const MALFORMED_TRIPWIRE_ARGV = Object.freeze([[], null, undefined, 'pr list', { 0: 'pr' }]);

for (const argv of MALFORMED_TRIPWIRE_ARGV) {
  test(`ghExecTripwire FAILS CLOSED on the malformed argv ${JSON.stringify(argv)}`, () => {
    assert.equal(ghExecTripwire(argv, classifyGhMerge).allow, false);
  });
}

function makeSandbox(plan) {
  const root = mkdtempSync(join(tmpdir(), 'mitosis-git-e2e-'));
  const fakeDir = join(root, 'fakebin');
  mkdirSync(fakeDir, { recursive: true });
  const record = join(root, 'record.jsonl');
  const planPath = join(root, 'plan.json');
  writeFileSync(planPath, JSON.stringify(plan));
  const fakeGh = join(fakeDir, 'gh');
  writeFileSync(fakeGh, [
    `#!${process.execPath}`,
    "const fs = require('node:fs');",
    "fs.appendFileSync(process.env.FAKE_GH_RECORD, JSON.stringify(process.argv.slice(2)) + '\\n');",
    "const steps = JSON.parse(fs.readFileSync(process.env.FAKE_GH_PLAN, 'utf8'));",
    "const seen = fs.readFileSync(process.env.FAKE_GH_RECORD, 'utf8').split('\\n').filter(Boolean).length;",
    'const step = steps[Math.min(seen - 1, steps.length - 1)] || {};',
    "if (step.stdout) process.stdout.write(step.stdout);",
    "if (step.stderr) process.stderr.write(step.stderr);",
    'process.exit(step.exit || 0);',
    '',
  ].join('\n'));
  writeFileSync(join(fakeDir, 'package.json'), '{"type":"commonjs"}\n');
  chmodSync(fakeGh, 0o755);
  accessSync(fakeGh, constants.X_OK);
  return { root, fakeDir, record, planPath };
}

function runWrapper(args, sandbox) {
  return spawnSync(process.execPath, [WRAPPER, ...args], {
    env: {
      PATH: sandbox.fakeDir,
      FAKE_GH_RECORD: sandbox.record,
      FAKE_GH_PLAN: sandbox.planPath,
    },
    encoding: 'utf8',
  });
}

function recordedCalls(sandbox) {
  if (!existsSync(sandbox.record)) return [];
  return readFileSync(sandbox.record, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

function withSandbox(plan, body) {
  const sandbox = makeSandbox(plan);
  try {
    return body(sandbox);
  } finally {
    rmSync(sandbox.root, { recursive: true, force: true });
  }
}

test('e2e: pr-create REUSES an existing open PR and never issues a create call', () => {
  withSandbox([{ stdout: '[{"url":"https://github.com/acme/widgets/pull/41","number":41}]' }], (sandbox) => {
    const res = runWrapper(prCreateArgv(), sandbox);
    assert.equal(res.status, 0, `expected exit 0; stderr=${res.stderr}`);
    assert.deepEqual(JSON.parse(res.stdout), { action: 'reused', url: 'https://github.com/acme/widgets/pull/41', number: 41 });
    const calls = recordedCalls(sandbox);
    assert.equal(calls.length, 1, `expected only the observe probe, got ${JSON.stringify(calls)}`);
    assert.deepEqual(calls[0], ['pr', 'list', '-R', REPO, '--head', HEAD, '--base', BASE, '--state', 'open', '--json', 'url,number']);
  });
});

test('e2e: pr-create CONVERGES only after an empty observe, and the create argv carries an inline body', () => {
  withSandbox([
    { stdout: '[]' },
    { stdout: 'https://github.com/acme/widgets/pull/42\n' },
  ], (sandbox) => {
    const res = runWrapper(prCreateArgv(['--body-line', 'interdiff summary', '--depends', 'msp-1']), sandbox);
    assert.equal(res.status, 0, `expected exit 0; stderr=${res.stderr}`);
    assert.deepEqual(JSON.parse(res.stdout), { action: 'created', url: 'https://github.com/acme/widgets/pull/42', number: 42 });
    const calls = recordedCalls(sandbox);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[1].slice(0, 9), ['pr', 'create', '-R', REPO, '--head', HEAD, '--base', BASE, '--title']);
    assert.equal(calls[1][10], '--body');
    assert.match(calls[1][11], /interdiff summary/);
    assert.match(calls[1][11], /DEPENDS-ON msp-1/);
  });
});

test('e2e: pr-create FAILS CLOSED and creates nothing when the observe probe exits non-zero', () => {
  withSandbox([{ stderr: 'gh: could not reach github\n', exit: 1 }], (sandbox) => {
    const res = runWrapper(prCreateArgv(), sandbox);
    assert.equal(res.status, MITOSIS_GIT_OBSERVE_EXIT);
    assert.equal(recordedCalls(sandbox).length, 1, 'a failed observe must not be followed by a create');
  });
});

test('e2e: pr-create FAILS CLOSED and creates nothing when the observe output is unparseable', () => {
  withSandbox([{ stdout: 'not json at all' }], (sandbox) => {
    const res = runWrapper(prCreateArgv(), sandbox);
    assert.equal(res.status, MITOSIS_GIT_OBSERVE_EXIT);
    assert.equal(recordedCalls(sandbox).length, 1);
  });
});

test('e2e: pr-create FAILS CLOSED and creates nothing when the observe output is empty', () => {
  withSandbox([{ stdout: '' }], (sandbox) => {
    const res = runWrapper(prCreateArgv(), sandbox);
    assert.equal(res.status, MITOSIS_GIT_OBSERVE_EXIT);
    assert.equal(recordedCalls(sandbox).length, 1);
  });
});

test('e2e: pr-create reports the converge failure and forwards gh stderr', () => {
  withSandbox([
    { stdout: '[]' },
    { stderr: 'gh: pull request creation failed\n', exit: 1 },
  ], (sandbox) => {
    const res = runWrapper(prCreateArgv(), sandbox);
    assert.equal(res.status, MITOSIS_GIT_CONVERGE_EXIT);
    assert.match(res.stderr, /pull request creation failed/);
  });
});

test('e2e: pr-create re-runs the observe probe to recover a url gh did not print parseably', () => {
  withSandbox([
    { stdout: '[]' },
    { stdout: 'Creating pull request...\n' },
    { stdout: '[{"url":"https://github.com/acme/widgets/pull/43","number":43}]' },
  ], (sandbox) => {
    const res = runWrapper(prCreateArgv(), sandbox);
    assert.equal(res.status, 0, `expected exit 0; stderr=${res.stderr}`);
    assert.deepEqual(JSON.parse(res.stdout), { action: 'created', url: 'https://github.com/acme/widgets/pull/43', number: 43 });
    const calls = recordedCalls(sandbox);
    assert.equal(calls.length, 3);
    assert.deepEqual(calls[2], calls[0]);
  });
});

test('e2e: pr-create rejects a created url whose repo is not the one that was asked for', () => {
  withSandbox([
    { stdout: '[]' },
    { stdout: 'https://github.com/evil/other/pull/9\n' },
    { stdout: '[]' },
  ], (sandbox) => {
    const res = runWrapper(prCreateArgv(), sandbox);
    assert.notEqual(res.status, 0, 'a url pointing at another repository must not be reported as this PR');
    assert.equal(res.stdout.trim(), '');
  });
});

test('e2e: pr-close closes an OPEN pull request', () => {
  withSandbox([
    { stdout: '{"state":"OPEN","url":"https://github.com/acme/widgets/pull/412"}' },
    { stdout: '' },
  ], (sandbox) => {
    const res = runWrapper(['pr-close', '--repo', REPO, '--pr', '412'], sandbox);
    assert.equal(res.status, 0, `expected exit 0; stderr=${res.stderr}`);
    assert.deepEqual(JSON.parse(res.stdout), { action: 'closed', state: 'CLOSED', url: 'https://github.com/acme/widgets/pull/412' });
    const calls = recordedCalls(sandbox);
    assert.deepEqual(calls[0], ['pr', 'view', '-R', REPO, '412', '--json', 'state,url']);
    assert.deepEqual(calls[1], ['pr', 'close', '-R', REPO, '412']);
  });
});

const NON_OPEN_STATES = Object.freeze([
  ['MERGED', 'already-merged'],
  ['CLOSED', 'already-closed'],
]);

for (const [state, action] of NON_OPEN_STATES) {
  test(`e2e: pr-close is idempotent under replay when the PR is already ${state}`, () => {
    withSandbox([{ stdout: `{"state":"${state}","url":"https://github.com/acme/widgets/pull/412"}` }], (sandbox) => {
      const res = runWrapper(['pr-close', '--repo', REPO, '--pr', '412'], sandbox);
      assert.equal(res.status, 0, `expected exit 0; stderr=${res.stderr}`);
      assert.deepEqual(JSON.parse(res.stdout), { action, state, url: 'https://github.com/acme/widgets/pull/412' });
      assert.equal(recordedCalls(sandbox).length, 1, 'an already-terminal PR must not be closed again');
    });
  });
}

test('e2e: pr-close FAILS CLOSED on an unreadable state and closes nothing', () => {
  withSandbox([{ stdout: '{"state":"WHO_KNOWS","url":"https://github.com/acme/widgets/pull/412"}' }], (sandbox) => {
    const res = runWrapper(['pr-close', '--repo', REPO, '--pr', '412'], sandbox);
    assert.equal(res.status, MITOSIS_GIT_OBSERVE_EXIT);
    assert.equal(recordedCalls(sandbox).length, 1);
  });
});

test('e2e: pr-close reports a failing close call', () => {
  withSandbox([
    { stdout: '{"state":"OPEN","url":"https://github.com/acme/widgets/pull/412"}' },
    { stderr: 'gh: close failed\n', exit: 1 },
  ], (sandbox) => {
    const res = runWrapper(['pr-close', '--repo', REPO, '--pr', '412'], sandbox);
    assert.equal(res.status, MITOSIS_GIT_CONVERGE_EXIT);
    assert.match(res.stderr, /close failed/);
  });
});

test('e2e: compare reports ahead_by and status from a single read call', () => {
  withSandbox([{ stdout: '{"status":"identical","ahead_by":0,"behind_by":0}' }], (sandbox) => {
    const res = runWrapper(['compare', '--repo', REPO, '--base', BASE, '--head', HEAD], sandbox);
    assert.equal(res.status, 0, `expected exit 0; stderr=${res.stderr}`);
    assert.deepEqual(JSON.parse(res.stdout), { ahead_by: 0, status: 'identical' });
    assert.deepEqual(recordedCalls(sandbox), [['api', `repos/${REPO}/compare/${BASE}...${HEAD}`]]);
  });
});

const COMPARE_READ_FAILURES = Object.freeze([
  ['an http error', { stderr: 'gh: Not Found (HTTP 404)\n', exit: 1 }],
  ['an unparseable body', { stdout: '<html>gateway timeout</html>' }],
  ['a body missing ahead_by', { stdout: '{"status":"identical"}' }],
  ['a non-integer ahead_by', { stdout: '{"status":"ahead","ahead_by":"3"}' }],
]);

for (const [label, step] of COMPARE_READ_FAILURES) {
  test(`e2e: compare returns the readError contract on ${label}`, () => {
    withSandbox([step], (sandbox) => {
      const res = runWrapper(['compare', '--repo', REPO, '--base', BASE, '--head', HEAD], sandbox);
      assert.equal(res.status, MITOSIS_GIT_OBSERVE_EXIT);
      const payload = JSON.parse(res.stdout);
      assert.equal(typeof payload.readError, 'string');
      assert.ok(payload.readError.length > 0);
    });
  });
}

const E2E_USAGE_REJECTIONS = Object.freeze([
  ['pr-merge', '--repo', REPO, '--pr', '412'],
  ['merge', '--repo', REPO],
  prCreateArgv(['--body-file', '/etc/passwd']),
  ['pr-create', '--repo', '../..', '--head', HEAD, '--base', BASE, '--title', 't'],
  ['pr-create', '--repo', REPO, '--head', 'a..b', '--base', BASE, '--title', 't'],
  ['compare', '--repo', REPO, '--base', BASE],
]);

for (const args of E2E_USAGE_REJECTIONS) {
  test(`e2e: ${JSON.stringify(args.slice(0, 3))} exits usage and executes no gh call at all`, () => {
    withSandbox([{ stdout: '[]' }], (sandbox) => {
      const res = runWrapper(args, sandbox);
      assert.equal(res.status, MITOSIS_GIT_USAGE_EXIT, `stderr=${res.stderr}`);
      assert.deepEqual(recordedCalls(sandbox), [], 'a rejected invocation must reach no gh call');
    });
  });
}

test('resolveGhBinary returns null when neither PATH nor the pinned fallbacks hold a gh binary', () => {
  assert.equal(resolveGhBinary({ pathValue: '/nonexistent-mitosis-git-path', fallbacks: [] }), null);
});

test('resolveGhBinary resolves the first gh on PATH ahead of any pinned fallback', () => {
  const sandbox = makeSandbox([{ stdout: '[]' }]);
  try {
    assert.equal(resolveGhBinary({ pathValue: sandbox.fakeDir, fallbacks: [] }), realpathSync(join(sandbox.fakeDir, 'gh')));
  } finally {
    rmSync(sandbox.root, { recursive: true, force: true });
  }
});

test('a resolution failure maps to the shim own missing-binary exit code', () => {
  assert.equal(MITOSIS_GIT_GH_MISSING_EXIT, 127);
});

test('the wrapper module contains no merge or approval subcommand anywhere in its source', () => {
  const source = readFileSync(WRAPPER, 'utf8');
  for (const banned of ["'merge'", "'approve'", '--squash', '--rebase', '--admin', '--auto', 'pr-merge']) {
    assert.ok(!source.includes(banned), `the wrapper source must not contain ${banned}`);
  }
  assert.equal(MITOSIS_GIT_TRIPWIRE_EXIT, 13, 'a tripwire refusal must read identically to the shim MERGE_DENY_EXIT');
});

test('the wrapper reaches spawnSync through exactly one tripwire-gated choke point', () => {
  const source = readFileSync(WRAPPER, 'utf8');
  const callSites = source.split('spawnSync(').length - 1;
  assert.equal(callSites, 1, `expected exactly one spawnSync call site, found ${callSites}`);
  const gate = source.indexOf('ghExecTripwire(argv, classifyGhMerge)');
  assert.ok(gate >= 0, 'the choke point must classify the fully constructed argv with the shim classifier');
  const spawn = source.indexOf('spawnSync(', gate);
  assert.ok(spawn > gate, 'the tripwire must be evaluated before the spawn inside the same choke point');
});
