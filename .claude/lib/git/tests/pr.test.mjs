import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, readFileSync, existsSync, rmSync, accessSync, realpathSync, constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyGhMerge } from '../gh-merge-shim.mjs';
import { PR_TITLE_CAP, PR_VALUE_CAP, PR_MULTI_LIMITS } from '../pr-format.mjs';
import {
  PR_TOOL_USAGE_EXIT,
  PR_TOOL_TRIPWIRE_EXIT,
  PR_TOOL_OBSERVE_EXIT,
  PR_TOOL_CONVERGE_EXIT,
  PR_TOOL_GH_MISSING_EXIT,
  PR_TOOL_VERBS,
  FLAG_SPEC,
  parsePrToolArgv,
  renderPrCreateBody,
  buildGhArgv,
  ghExecTripwire,
  resolveGhBinary,
} from '../pr.mjs';

const WRAPPER = fileURLToPath(new URL('../pr.mjs', import.meta.url));

const REPO = 'acme/widgets';
const HEAD = 'chore/msp-1-integration';
const BASE = 'main';

const TITLE = 'refactor(pr-tool): centralize pull-request creation';
const WHY = 'Four of the five paths that open a pull request invent the title and body ad hoc.';
const WHAT = 'The tool now composes every pull-request body from declared fields.';
const NOT_VERIFIED = 'CI on the fresh head and base - not run; this pull request opens before CI starts';

const NUL = String.fromCharCode(0);
const BEL = String.fromCharCode(7);
const TAB = String.fromCharCode(9);
const LF = String.fromCharCode(10);
const DEL = String.fromCharCode(127);

const PR_RENDER_REQUIRED = Object.freeze(['--title', '--why', '--what']);

function prRenderArgv(extra = []) {
  return [
    'pr-render', '--title', TITLE,
    '--why', WHY,
    '--what', WHAT,
    '--not-verified', NOT_VERIFIED,
    ...extra,
  ];
}

function prRenderArgvWithout(flag) {
  const argv = prRenderArgv();
  const kept = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === flag) {
      i += 1;
      continue;
    }
    kept.push(argv[i]);
  }
  return kept;
}

function prRenderArgvReplacing(flag, value) {
  const argv = prRenderArgv();
  const replaced = [];
  for (let i = 0; i < argv.length; i += 1) {
    replaced.push(argv[i]);
    if (argv[i] === flag) {
      replaced.push(value);
      i += 1;
    }
  }
  return replaced;
}

function repeatFlag(flag, count, value) {
  const argv = [];
  for (let i = 0; i < count; i += 1) argv.push(flag, value);
  return argv;
}

function okParse(argv) {
  const parsed = parsePrToolArgv(argv);
  assert.equal(parsed.ok, true, `expected a successful parse, got: ${parsed.error}`);
  return parsed;
}

function failParse(argv) {
  const parsed = parsePrToolArgv(argv);
  assert.equal(parsed.ok, false, `expected a rejected parse for ${JSON.stringify(argv)}`);
  assert.equal(typeof parsed.error, 'string');
  assert.ok(parsed.error.length > 0, 'a rejection must carry a reason');
  return parsed;
}

test('the wrapper exposes exactly three verbs and none of them is a merge verb', () => {
  assert.deepEqual([...PR_TOOL_VERBS].sort(), ['compare', 'pr-close', 'pr-render']);
  for (const verb of PR_TOOL_VERBS) {
    assert.ok(!/merge|approve|review/.test(verb), `verb ${verb} must not name a merge or approval action`);
  }
});

test('FLAG_SPEC pins the whole pr-render surface and every repeatable flag carries a cardinality ceiling', () => {
  assert.deepEqual([...FLAG_SPEC['pr-render'].required], [...PR_RENDER_REQUIRED]);
  assert.deepEqual([...FLAG_SPEC['pr-render'].single], ['--title', '--risk', '--supersedes']);
  assert.deepEqual([...FLAG_SPEC['pr-render'].multiple], ['--why', '--what', '--verified', '--not-verified', '--link']);
  for (const flag of FLAG_SPEC['pr-render'].multiple) {
    assert.equal(typeof PR_MULTI_LIMITS[flag], 'number', `${flag} must carry a cardinality ceiling`);
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

test('parse accepts a well-formed pr-render and freezes the parsed values', () => {
  const parsed = okParse(prRenderArgv());
  assert.equal(parsed.verb, 'pr-render');
  assert.equal(parsed.opts.title, TITLE);
  assert.deepEqual(parsed.opts.why, [WHY]);
  assert.deepEqual(parsed.opts.what, [WHAT]);
  assert.deepEqual(parsed.opts.verified, []);
  assert.deepEqual(parsed.opts.notVerified, [NOT_VERIFIED]);
  assert.deepEqual(parsed.opts.links, []);
  assert.equal(parsed.opts.risk, null);
  assert.equal(parsed.opts.supersedes, null);
  assert.ok(Object.isFrozen(parsed.opts));
});

for (const flag of PR_RENDER_REQUIRED) {
  test(`parse REJECTS a pr-render missing the required flag ${flag}`, () => {
    const parsed = failParse(prRenderArgvWithout(flag));
    assert.ok(parsed.error.includes(`missing required flag ${flag}`), `expected the rejection to name ${flag}, got: ${parsed.error}`);
  });
}

const MISSING_REQUIRED = Object.freeze([
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

test('parse REJECTS --repo on pr-render, so the renderer never names a repository', () => {
  const parsed = failParse(prRenderArgv(['--repo', REPO]));
  assert.match(parsed.error, /--repo/);
});

const REJECTED_FLAG_FORMS = Object.freeze([
  ['pr-render', '--title=refactor(pr-tool): centralize pull-request creation', '--why', WHY, '--what', WHAT],
  prRenderArgv(['--body-file', '/etc/passwd']),
  prRenderArgv(['--fill']),
  prRenderArgv(['-F', 'body=@/etc/passwd']),
  prRenderArgv(['-f', 'body=x']),
  prRenderArgv(['--input', '/tmp/x.json']),
  prRenderArgv(['--field', 'body=x']),
  prRenderArgv(['--raw-field', 'body=x']),
  prRenderArgv(['-X', 'PUT']),
  prRenderArgv(['--method', 'PUT']),
  prRenderArgv(['--web']),
  prRenderArgv(['--repo', 'other/repo']),
  prRenderArgv(['--title', 'second title']),
  prRenderArgv(['stray-positional']),
  prRenderArgv(['--']),
]);

for (const argv of REJECTED_FLAG_FORMS) {
  test(`parse REJECTS the flag form ${JSON.stringify(argv.slice(-2))} before anything executes`, () => {
    failParse(argv);
  });
}

const RETIRED_FREE_FORM_FLAGS = Object.freeze(['--body-line', '--review-order']);

for (const flag of RETIRED_FREE_FORM_FLAGS) {
  test(`parse REJECTS the retired free-form flag ${flag} as unknown, keeping the escape hatch closed`, () => {
    const parsed = failParse(prRenderArgv([flag, 'anything at all']));
    assert.match(parsed.error, /unknown flag/);
  });
}

test('parse accumulates repeated --why and --what values instead of rejecting them', () => {
  const parsed = okParse(prRenderArgv(['--why', 'The gate now denies the ad-hoc path.', '--what', 'Removed the free-form line flag entirely.']));
  assert.deepEqual(parsed.opts.why, [WHY, 'The gate now denies the ad-hoc path.']);
  assert.deepEqual(parsed.opts.what, [WHAT, 'Removed the free-form line flag entirely.']);
});

test('parse ACCEPTS a dash-leading pr-close comment', () => {
  const closed = okParse(['pr-close', '--repo', REPO, '--pr', '12', '--comment', '- superseded by #500']);
  assert.equal(closed.opts.comment, '- superseded by #500');
});

const FLAG_IN_VALUE_POSITION = Object.freeze([
  ['pr-render', '--title', '--what', 'x'],
  prRenderArgv(['--what', '--risk', 'x']),
  prRenderArgv(['--supersedes', '--title']),
  ['pr-close', '--repo', REPO, '--pr', '12', '--comment', '--repo', 'other/repo'],
  ['compare', '--repo', REPO, '--base', '--head', '--head', HEAD],
]);

for (const argv of FLAG_IN_VALUE_POSITION) {
  test(`parse REJECTS a value position occupied by another allowlisted flag ${JSON.stringify(argv.slice(-3))}`, () => {
    failParse(argv);
  });
}

const AT_SIGIL_VALUES = Object.freeze([
  prRenderArgvReplacing('--title', '@/etc/passwd'),
  prRenderArgv(['--what', '@/etc/passwd']),
  prRenderArgv(['--why', '@-']),
  prRenderArgv(['--link', '@/etc/passwd']),
  prRenderArgv(['--verified', '@/etc/passwd']),
  prRenderArgv(['--risk', '@/etc/passwd']),
  ['pr-close', '--repo', REPO, '--pr', '12', '--comment', '@/etc/passwd'],
]);

for (const argv of AT_SIGIL_VALUES) {
  test(`parse REJECTS an @-prefixed field-indirection value ${JSON.stringify(argv.slice(-2))}`, () => {
    failParse(argv);
  });
}

test('parse strips control characters from a title rather than letting them reach the printed title', () => {
  const parsed = okParse(prRenderArgvReplacing('--title', `chore(pr-tool)${NUL}: strip control${BEL} characters`));
  assert.equal(parsed.opts.title, 'chore(pr-tool): strip control characters');
});

test('parse strips control characters from every body value', () => {
  const parsed = okParse(prRenderArgv(['--what', `On${LF}e survives control-character stripping.`, '--what', `Tw${DEL}o survives it as well.`]));
  assert.deepEqual(parsed.opts.what, [WHAT, 'One survives control-character stripping.', 'Two survives it as well.']);
});

test('parse REJECTS a value that is empty once control characters are stripped', () => {
  failParse(prRenderArgvReplacing('--title', `${LF}${TAB}${NUL}`));
});

test('parse REJECTS an over-cap title rather than silently truncating it', () => {
  const prefix = 'refactor(pr-tool): ';
  const atCap = `${prefix}${'w'.repeat(PR_TITLE_CAP - prefix.length)}`;
  assert.equal(okParse(prRenderArgvReplacing('--title', atCap)).opts.title.length, PR_TITLE_CAP);
  failParse(prRenderArgvReplacing('--title', `${atCap}w`));
});

test('parse REJECTS a --title that is not a conventional-commits subject', () => {
  for (const bad of ['MSP-1 ships the thing', 'mitosis: msp-1', 'refactor(pr-tool): Centralize creation', 'refactor(pr-tool): centralize creation.', 'refactor: x']) {
    failParse(prRenderArgvReplacing('--title', bad));
  }
  okParse(prRenderArgvReplacing('--title', 'fix(hooks): deny raw pr creation at the gate'));
  okParse(prRenderArgvReplacing('--title', 'docs: point the rule at the central tool'));
});

test('parse REJECTS an over-cap body value rather than silently truncating it', () => {
  const atCap = `A${'y'.repeat(PR_VALUE_CAP - 2)}.`;
  assert.equal(atCap.length, PR_VALUE_CAP);
  okParse(prRenderArgv(['--what', atCap]));
  failParse(prRenderArgv(['--what', `A${'y'.repeat(PR_VALUE_CAP - 1)}.`]));
});

const SENTENCE_CHECKED_MULTI = new Set(['--why', '--what']);

function boundedValueFor(flag) {
  return SENTENCE_CHECKED_MULTI.has(flag) ? 'A bounded value that satisfies the sentence rule.' : 'a bounded value';
}

const CARDINALITY_CEILINGS = Object.freeze([
  ['--why', 1],
  ['--what', 1],
  ['--verified', 0],
  ['--not-verified', 1],
  ['--link', 0],
]);

for (const [flag, baseline] of CARDINALITY_CEILINGS) {
  test(`parse REJECTS a ${flag} COUNT past the ${PR_MULTI_LIMITS[flag]}-value ceiling rather than accumulating an unbounded body`, () => {
    const headroom = PR_MULTI_LIMITS[flag] - baseline;
    const value = boundedValueFor(flag);
    okParse(prRenderArgv(repeatFlag(flag, headroom, value)));
    failParse(prRenderArgv(repeatFlag(flag, headroom + 1, value)));
  });
}

test('parse REJECTS a pr-render carrying no verification statement at all', () => {
  const parsed = failParse(prRenderArgvWithout('--not-verified'));
  assert.match(parsed.error, /--verified or --not-verified/);
  okParse([...prRenderArgvWithout('--not-verified'), '--verified', 'node --test tests/pr.test.mjs - 0 fail']);
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
  `acme/widgets${LF}`,
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
  `main${LF}`,
  '$(id)',
  '`id`',
  'main|tee',
  '',
  'x'.repeat(256),
]);

for (const ref of REJECTED_REF_TOKENS) {
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
    failParse(prRenderArgv(['--supersedes', url]));
  });
}

test('parse ACCEPTS a github pull-request url for --supersedes', () => {
  const parsed = okParse(prRenderArgv(['--supersedes', 'https://github.com/acme/widgets/pull/41']));
  assert.equal(parsed.opts.supersedes, 'https://github.com/acme/widgets/pull/41');
});

const CONTROL_IN_BODY = /[\x00-\x1F\x7F]/;

test('parse drops the caller-controlled --supersedes tail so no control character reaches the body', () => {
  const tail = `${NUL}${BEL}${String.fromCharCode(27)}[31m`;
  const parsed = okParse(prRenderArgv(['--supersedes', `https://github.com/acme/widgets/pull/41/${tail}`]));
  const body = renderPrCreateBody(parsed.opts);
  for (const line of body.split('\n')) {
    assert.ok(!CONTROL_IN_BODY.test(line), `a composed body line must carry no control character: ${JSON.stringify(line)}`);
  }
  assert.match(body, /^Supersedes https:\/\/github\.com\/acme\/widgets\/pull\/41$/m);
});

test('parse refuses a markdown tail on the supersedes line so no caller-controlled content reaches it', () => {
  const parsed = okParse(prRenderArgv(['--supersedes', 'https://github.com/acme/widgets/pull/1?x=<!--']));
  const body = renderPrCreateBody(parsed.opts);
  assert.ok(!body.includes('<!--'), 'no caller-controlled tail may reach the supersedes line');
});

test('parse canonicalises a --supersedes carrying a trailing newline so its body line cannot split', () => {
  const parsed = okParse(prRenderArgv(['--supersedes', `https://github.com/acme/widgets/pull/1?x=y${LF}`]));
  assert.equal(parsed.opts.supersedes, 'https://github.com/acme/widgets/pull/1');
  assert.match(renderPrCreateBody(parsed.opts), /^Supersedes https:\/\/github\.com\/acme\/widgets\/pull\/1$/m);
});

test('parse REJECTS a --supersedes whose composed body line would exceed the value cap', () => {
  failParse(prRenderArgv(['--supersedes', `https://github.com/${'a'.repeat(600)}/widgets/pull/41`]));
});

test('renderPrCreateBody composes a fixed template from inert values only', () => {
  const body = renderPrCreateBody({
    why: ['The prior pull request for this unit was invalidated by a divergent parent.'],
    what: ['Renamed two helpers to match the new module boundary.'],
    notVerified: ['CI on the superseding head - not run'],
    supersedes: 'https://github.com/acme/widgets/pull/41',
  });
  assert.match(body, /Renamed two helpers to match the new module boundary\./);
  assert.match(body, /Supersedes https:\/\/github\.com\/acme\/widgets\/pull\/41/);
  assert.ok(!body.startsWith('@'), 'a rendered body must never begin with the field-indirection sigil');
});

test('renderPrCreateBody omits the links section entirely when no link-bearing field is present', () => {
  const body = renderPrCreateBody({ why: ['A reason for the change.'], what: ['A change that is different now.'], verified: ['a check - 0 fail'] });
  assert.ok(!body.includes('Supersedes'));
  assert.ok(!body.includes('## Links'));
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
  const { opts } = okParse(prRenderArgv());
  assert.throws(() => buildGhArgv('pr-merge', 'converge', opts));
  assert.throws(() => buildGhArgv('pr-render', 'merge', opts));
  assert.throws(() => buildGhArgv('compare', 'converge', opts));
});

test('every argv this wrapper can construct passes the shim classifier (merge is absent by construction)', () => {
  const noIo = Object.freeze({ readFile: () => null, readStdin: () => null });
  const cases = [
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
  const root = mkdtempSync(join(tmpdir(), 'pr-tool-e2e-'));
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
    "if (step.stdout) fs.writeSync(1, step.stdout);",
    "if (step.stderr) fs.writeSync(2, step.stderr);",
    'process.exitCode = step.exit || 0;',
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
    assert.equal(res.status, PR_TOOL_OBSERVE_EXIT);
    assert.equal(recordedCalls(sandbox).length, 1);
  });
});

test('e2e: pr-close reports a failing close call', () => {
  withSandbox([
    { stdout: '{"state":"OPEN","url":"https://github.com/acme/widgets/pull/412"}' },
    { stderr: 'gh: close failed\n', exit: 1 },
  ], (sandbox) => {
    const res = runWrapper(['pr-close', '--repo', REPO, '--pr', '412'], sandbox);
    assert.equal(res.status, PR_TOOL_CONVERGE_EXIT);
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
      assert.equal(res.status, PR_TOOL_OBSERVE_EXIT);
      const payload = JSON.parse(res.stdout);
      assert.equal(typeof payload.readError, 'string');
      assert.ok(payload.readError.length > 0);
    });
  });
}

const E2E_USAGE_REJECTIONS = Object.freeze([
  ['pr-merge', '--repo', REPO, '--pr', '412'],
  ['merge', '--repo', REPO],
  prRenderArgv(['--body-file', '/etc/passwd']),
  prRenderArgv(['--repo', '../..']),
  prRenderArgv(['--head', 'a..b']),
  prRenderArgvReplacing('--title', 'MSP-1 ships the thing'),
  prRenderArgvWithout('--not-verified'),
  ['compare', '--repo', REPO, '--base', BASE],
]);

for (const args of E2E_USAGE_REJECTIONS) {
  test(`e2e: ${JSON.stringify(args.slice(0, 3))} exits usage and executes no gh call at all`, () => {
    withSandbox([{ stdout: '[]' }], (sandbox) => {
      const res = runWrapper(args, sandbox);
      assert.equal(res.status, PR_TOOL_USAGE_EXIT, `stderr=${res.stderr}`);
      assert.deepEqual(recordedCalls(sandbox), [], 'a rejected invocation must reach no gh call');
    });
  });
}

test('resolveGhBinary returns null when neither PATH nor the pinned fallbacks hold a gh binary', () => {
  assert.equal(resolveGhBinary({ pathValue: '/nonexistent-pr-tool-path', fallbacks: [] }), null);
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
  assert.equal(PR_TOOL_GH_MISSING_EXIT, 127);
});

test('the wrapper module contains no merge or approval subcommand anywhere in its source', () => {
  const source = readFileSync(WRAPPER, 'utf8');
  for (const banned of ["'merge'", "'approve'", '--squash', '--rebase', '--admin', '--auto', 'pr-merge']) {
    assert.ok(!source.includes(banned), `the wrapper source must not contain ${banned}`);
  }
  assert.equal(PR_TOOL_TRIPWIRE_EXIT, 13, 'a tripwire refusal must read identically to the shim MERGE_DENY_EXIT');
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

test('parse REJECTS a lowercase --why value, naming the sentence rule', () => {
  const parsed = failParse(prRenderArgvReplacing('--why', 'lowercase no period'));
  assert.match(parsed.error, /uppercase letter and end with \. \? or !/);
});

test('parse ACCEPTS an uppercase --why value ending with a period', () => {
  const parsed = okParse(prRenderArgvReplacing('--why', 'Uppercase with a period.'));
  assert.deepEqual(parsed.opts.why, ['Uppercase with a period.']);
});

test('parse ACCEPTS an accented capital opening a --why value, so the sentence rule is not ascii-only', () => {
  const value = `${String.fromCharCode(201)}migr${String.fromCharCode(233)} values compose a sentence.`;
  const parsed = okParse(prRenderArgvReplacing('--why', value));
  assert.deepEqual(parsed.opts.why, [value]);
});

test('parse REJECTS an accented lowercase opening a --why value, so the sentence rule still demands uppercase', () => {
  failParse(prRenderArgvReplacing('--why', `${String.fromCharCode(233)}migr${String.fromCharCode(233)} values compose a sentence.`));
});

test('parse REJECTS a digit opening a --why value, so a caseless first character never reads as uppercase', () => {
  failParse(prRenderArgvReplacing('--why', '8 values now compose a sentence.'));
});

test('parse REJECTS an uppercase --why value with no terminal punctuation', () => {
  failParse(prRenderArgvReplacing('--why', 'Uppercase with no period'));
});

test('parse ACCEPTS a --why value carrying a receipts line token, bypassing the sentence rule, and it renders at line start', () => {
  const parsed = okParse(prRenderArgvReplacing('--why', 'receipt-cmd: node --test x.mjs'));
  assert.deepEqual(parsed.opts.why, ['receipt-cmd: node --test x.mjs']);
  const body = renderPrCreateBody(parsed.opts);
  assert.match(body, /^receipt-cmd: node --test x\.mjs$/m);
});

test('parse ACCEPTS a --risk value carrying a receipts line token, bypassing the sentence rule', () => {
  const parsed = okParse(prRenderArgv(['--risk', 'work-type: chore']));
  assert.equal(parsed.opts.risk, 'work-type: chore');
});

test('parse REJECTS a --what value carrying a receipts line token, naming --why as the flag to use instead', () => {
  const parsed = failParse(prRenderArgv(['--what', 'test-removal: dropped a stale case']));
  assert.match(parsed.error, /--why instead/);
});

test('parse REJECTS a lowercase --what bullet, never exempting --what from the sentence rule', () => {
  const parsed = failParse(prRenderArgv(['--what', 'lowercase bullet.']));
  assert.match(parsed.error, /uppercase letter and end with \. \? or !/);
});

test('parse REJECTS the retired --origin flag as unknown', () => {
  const parsed = failParse(prRenderArgv(['--origin', 'machine']));
  assert.match(parsed.error, /unknown flag "--origin"/);
});

test('parse REJECTS the retired --provenance flag as unknown', () => {
  const parsed = failParse(prRenderArgv(['--provenance', 'agent=x model=y']));
  assert.match(parsed.error, /unknown flag "--provenance"/);
});

test('parse REJECTS the retired --depends flag as unknown', () => {
  const parsed = failParse(prRenderArgv(['--depends', 'a,b']));
  assert.match(parsed.error, /unknown flag "--depends"/);
});

test('parse REJECTS the retired --changed-lines flag as unknown', () => {
  const parsed = failParse(prRenderArgv(['--changed-lines', '512']));
  assert.match(parsed.error, /unknown flag "--changed-lines"/);
});

const RENDER_EVERY_FLAG = Object.freeze([
  '--risk', 'A caller still on the retired verb now exits with a usage error.',
  '--verified', 'node --test .claude/lib/git/tests/pr.test.mjs - 0 fail',
  '--supersedes', 'https://github.com/acme/widgets/pull/41',
  '--link', 'closes acme/widgets#12',
]);

test('pr-render prints one JSON line with the title and the rendered body and spawns nothing', async () => {
  const format = await import('../pr-format.mjs');
  const fields = format.checkPrFields({
    title: TITLE,
    why: [WHY],
    what: [WHAT],
    verified: ['node --test .claude/lib/git/tests/pr.test.mjs - 0 fail'],
    notVerified: [NOT_VERIFIED],
    risk: 'A caller still on the retired verb now exits with a usage error.',
    supersedes: 'https://github.com/acme/widgets/pull/41',
    links: ['closes acme/widgets#12'],
  }).fields;
  assert.notEqual(fields, null, 'the shared rules refused the fields this test renders');
  withSandbox([{ stdout: '[]' }], (sandbox) => {
    const res = runWrapper(prRenderArgv(RENDER_EVERY_FLAG), sandbox);
    assert.equal(res.status, 0, `expected exit 0; stderr=${res.stderr}`);
    assert.equal(res.stderr, '');
    assert.ok(res.stdout.endsWith('\n'), 'the one stdout line must end with a newline');
    const lines = res.stdout.slice(0, -1).split('\n');
    assert.equal(lines.length, 1, `expected exactly one stdout line, got ${JSON.stringify(res.stdout)}`);
    assert.deepEqual(JSON.parse(lines[0]), { title: TITLE, body: format.renderPrCreateBody(fields) });
    assert.deepEqual(recordedCalls(sandbox), [], 'pr-render must spawn no gh call');
  });
});

test('pr-render refuses what pr-create refused, and pr-create is gone', async () => {
  const tool = await import('../pr.mjs');
  const refusals = [
    ['a lowercase --why', prRenderArgvReplacing('--why', 'lowercase reason.'), /--why/],
    ['a 501-character --what', prRenderArgv(['--what', `A${'y'.repeat(PR_VALUE_CAP - 1)}.`]), /--what/],
    ['nine --what values', prRenderArgv(repeatFlag('--what', PR_MULTI_LIMITS['--what'], 'A bounded change that is different now.')), /--what/],
    ['a --title of Fix stuff', prRenderArgvReplacing('--title', 'Fix stuff'), /--title/],
    ['--repo o/r', prRenderArgv(['--repo', 'o/r']), /--repo/],
    ['the verb pr-create', ['pr-create', ...prRenderArgv().slice(1)], /pr-create/],
  ];
  for (const [label, args, named] of refusals) {
    withSandbox([{ stdout: '[]' }], (sandbox) => {
      const res = runWrapper(args, sandbox);
      assert.equal(res.status, tool.PR_TOOL_USAGE_EXIT, `${label}: expected exit ${tool.PR_TOOL_USAGE_EXIT}; stderr=${res.stderr}`);
      assert.equal(res.stdout, '', `${label}: a refusal must print nothing on stdout`);
      assert.match(res.stderr, named, `${label}: stderr does not name the flag or verb`);
      assert.deepEqual(recordedCalls(sandbox), [], `${label}: a refusal must reach no gh call`);
    });
  }
  assert.deepEqual([...tool.PR_TOOL_VERBS], ['pr-render', 'pr-close', 'compare']);
  const { opts } = tool.parsePrToolArgv(prRenderArgv());
  for (const stage of ['observe', 'converge', 'read', 'render']) {
    assert.throws(() => tool.buildGhArgv('pr-render', stage, opts), /refusing to build a gh argv/, `buildGhArgv built an argv for pr-render at ${stage}`);
  }
});
