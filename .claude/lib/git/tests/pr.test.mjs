import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, readFileSync, existsSync, rmSync, accessSync, realpathSync, constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyGhMerge } from '../../mitosis/gh-merge-shim.mjs';
import { PR_TITLE_CAP, PR_VALUE_CAP, PR_MULTI_LIMITS, DEPENDS_PREFIX } from '../pr-format.mjs';
import {
  MITOSIS_GIT_USAGE_EXIT,
  MITOSIS_GIT_TRIPWIRE_EXIT,
  MITOSIS_GIT_OBSERVE_EXIT,
  MITOSIS_GIT_CONVERGE_EXIT,
  MITOSIS_GIT_GH_MISSING_EXIT,
  MITOSIS_GIT_VERBS,
  FLAG_SPEC,
  parseMitosisGitArgv,
  renderPrCreateBody,
  buildGhArgv,
  ghExecTripwire,
  resolveGhBinary,
} from '../pr.mjs';

const WRAPPER = fileURLToPath(new URL('../pr.mjs', import.meta.url));

const REPO = 'acme/widgets';
const HEAD = 'mitosis/msp-1-integration';
const BASE = 'main';

const TITLE = 'refactor(pr-tool): centralize pull-request creation';
const PROVENANCE = 'agent=ship:msp-1 model=opus';
const WHY = 'four of the five paths that open a pull request invent the title and body ad hoc.';
const WHAT = 'centralize pull-request creation';
const NOT_VERIFIED = 'CI on the fresh head and base - not run; this pull request opens before CI starts';

const NUL = String.fromCharCode(0);
const BEL = String.fromCharCode(7);
const TAB = String.fromCharCode(9);
const LF = String.fromCharCode(10);
const DEL = String.fromCharCode(127);

const PR_CREATE_REQUIRED = Object.freeze(['--repo', '--head', '--base', '--title', '--origin', '--why', '--what']);

function prCreateArgv(extra = []) {
  return [
    'pr-create', '--repo', REPO, '--head', HEAD, '--base', BASE, '--title', TITLE,
    '--origin', 'machine', '--provenance', PROVENANCE,
    '--why', WHY,
    '--what', WHAT,
    '--not-verified', NOT_VERIFIED,
    ...extra,
  ];
}

function prCreateArgvWithout(flag) {
  const argv = prCreateArgv();
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

function prCreateArgvReplacing(flag, value) {
  const argv = prCreateArgv();
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

test('FLAG_SPEC pins the whole pr-create surface and every repeatable flag carries a cardinality ceiling', () => {
  assert.deepEqual([...FLAG_SPEC['pr-create'].required], [...PR_CREATE_REQUIRED]);
  assert.deepEqual([...FLAG_SPEC['pr-create'].single], [
    '--repo', '--head', '--base', '--title', '--origin', '--provenance', '--risk', '--supersedes', '--depends', '--changed-lines',
  ]);
  assert.deepEqual([...FLAG_SPEC['pr-create'].multiple], ['--why', '--what', '--verified', '--not-verified', '--link']);
  for (const flag of FLAG_SPEC['pr-create'].multiple) {
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

test('parse accepts a well-formed pr-create and freezes the parsed values', () => {
  const parsed = okParse(prCreateArgv());
  assert.equal(parsed.verb, 'pr-create');
  assert.equal(parsed.opts.repo, REPO);
  assert.equal(parsed.opts.head, HEAD);
  assert.equal(parsed.opts.base, BASE);
  assert.equal(parsed.opts.title, TITLE);
  assert.equal(parsed.opts.origin, 'machine');
  assert.equal(parsed.opts.provenance, PROVENANCE);
  assert.deepEqual(parsed.opts.why, [WHY]);
  assert.deepEqual(parsed.opts.what, [WHAT]);
  assert.deepEqual(parsed.opts.verified, []);
  assert.deepEqual(parsed.opts.notVerified, [NOT_VERIFIED]);
  assert.deepEqual(parsed.opts.links, []);
  assert.equal(parsed.opts.risk, null);
  assert.equal(parsed.opts.supersedes, null);
  assert.deepEqual(parsed.opts.depends, []);
  assert.equal(parsed.opts.changedLines, null);
  assert.ok(Object.isFrozen(parsed.opts));
});

for (const flag of PR_CREATE_REQUIRED) {
  test(`parse REJECTS a pr-create missing the required flag ${flag}`, () => {
    const parsed = failParse(prCreateArgvWithout(flag));
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

test('parse REJECTS --repo entirely so the wrapper can never resolve the ambient cwd repo', () => {
  const parsed = failParse(prCreateArgvWithout('--repo'));
  assert.match(parsed.error, /--repo/);
});

const REJECTED_FLAG_FORMS = Object.freeze([
  ['pr-create', '--repo=acme/widgets', '--head', HEAD, '--base', BASE, '--title', TITLE],
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
  prCreateArgv(['stray-positional']),
  prCreateArgv(['--']),
]);

for (const argv of REJECTED_FLAG_FORMS) {
  test(`parse REJECTS the flag form ${JSON.stringify(argv.slice(-2))} before anything executes`, () => {
    failParse(argv);
  });
}

const RETIRED_FREE_FORM_FLAGS = Object.freeze(['--body-line', '--review-order']);

for (const flag of RETIRED_FREE_FORM_FLAGS) {
  test(`parse REJECTS the retired free-form flag ${flag} as unknown, keeping the escape hatch closed`, () => {
    const parsed = failParse(prCreateArgv([flag, 'anything at all']));
    assert.match(parsed.error, /unknown flag/);
  });
}

test('parse accumulates repeated --why and --what values instead of rejecting them', () => {
  const parsed = okParse(prCreateArgv(['--why', 'the gate now denies the ad-hoc path', '--what', 'removed the free-form line flag']));
  assert.deepEqual(parsed.opts.why, [WHY, 'the gate now denies the ad-hoc path']);
  assert.deepEqual(parsed.opts.what, [WHAT, 'removed the free-form line flag']);
});

test('parse ACCEPTS the dash-leading prose an interdiff summary is made of', () => {
  const parsed = okParse(prCreateArgv([
    '--what', '- fixed the parser',
    '--what', '-3 files changed',
    '--what', '--- a/src/parser.mjs',
  ]));
  assert.deepEqual(parsed.opts.what, [WHAT, '- fixed the parser', '-3 files changed', '--- a/src/parser.mjs']);
});

test('parse ACCEPTS a dash-leading pr-close comment', () => {
  const closed = okParse(['pr-close', '--repo', REPO, '--pr', '12', '--comment', '- superseded by #500']);
  assert.equal(closed.opts.comment, '- superseded by #500');
});

const FLAG_IN_VALUE_POSITION = Object.freeze([
  ['pr-create', '--repo', REPO, '--head', HEAD, '--base', BASE, '--title', '--what', 'x'],
  prCreateArgv(['--what', '--depends', 'msp-1']),
  prCreateArgv(['--supersedes', '--title']),
  ['pr-close', '--repo', REPO, '--pr', '12', '--comment', '--repo', 'other/repo'],
  ['compare', '--repo', REPO, '--base', '--head', '--head', HEAD],
]);

for (const argv of FLAG_IN_VALUE_POSITION) {
  test(`parse REJECTS a value position occupied by another allowlisted flag ${JSON.stringify(argv.slice(-3))}`, () => {
    failParse(argv);
  });
}

const AT_SIGIL_VALUES = Object.freeze([
  prCreateArgvReplacing('--title', '@/etc/passwd'),
  prCreateArgv(['--what', '@/etc/passwd']),
  prCreateArgv(['--why', '@-']),
  prCreateArgv(['--link', '@/etc/passwd']),
  prCreateArgv(['--verified', '@/etc/passwd']),
  prCreateArgvReplacing('--provenance', '@/etc/passwd'),
  prCreateArgv(['--risk', '@/etc/passwd']),
  ['pr-close', '--repo', REPO, '--pr', '12', '--comment', '@/etc/passwd'],
]);

for (const argv of AT_SIGIL_VALUES) {
  test(`parse REJECTS an @-prefixed field-indirection value ${JSON.stringify(argv.slice(-2))}`, () => {
    failParse(argv);
  });
}

test('parse strips control characters from a title rather than letting them reach gh', () => {
  const parsed = okParse(prCreateArgvReplacing('--title', `chore(pr-tool)${NUL}: strip control${BEL} characters`));
  assert.equal(parsed.opts.title, 'chore(pr-tool): strip control characters');
});

test('parse strips control characters from every body value', () => {
  const parsed = okParse(prCreateArgv(['--what', `one${LF}two`, '--what', `three${DEL}`]));
  assert.deepEqual(parsed.opts.what, [WHAT, 'onetwo', 'three']);
});

test('parse REJECTS a value that is empty once control characters are stripped', () => {
  failParse(prCreateArgvReplacing('--title', `${LF}${TAB}${NUL}`));
});

test('parse REJECTS an over-cap title rather than silently truncating it', () => {
  const prefix = 'refactor(pr-tool): ';
  const atCap = `${prefix}${'w'.repeat(PR_TITLE_CAP - prefix.length)}`;
  assert.equal(okParse(prCreateArgvReplacing('--title', atCap)).opts.title.length, PR_TITLE_CAP);
  failParse(prCreateArgvReplacing('--title', `${atCap}w`));
});

test('parse REJECTS a --title that is not a conventional-commits subject', () => {
  for (const bad of ['MSP-1 ships the thing', 'mitosis: msp-1', 'refactor(pr-tool): Centralize creation', 'refactor(pr-tool): centralize creation.', 'refactor: x']) {
    failParse(prCreateArgvReplacing('--title', bad));
  }
  okParse(prCreateArgvReplacing('--title', 'fix(hooks): deny raw pr creation at the gate'));
  okParse(prCreateArgvReplacing('--title', 'docs: point the rule at the central tool'));
});

test('parse REJECTS an over-cap body value rather than silently truncating it', () => {
  okParse(prCreateArgv(['--what', 'y'.repeat(PR_VALUE_CAP)]));
  failParse(prCreateArgv(['--what', 'y'.repeat(PR_VALUE_CAP + 1)]));
});

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
    okParse(prCreateArgv(repeatFlag(flag, headroom, 'a bounded value')));
    failParse(prCreateArgv(repeatFlag(flag, headroom + 1, 'a bounded value')));
  });
}

const GITHUB_PR_BODY_LIMIT = 65536;
const DEPENDS_LINE_BUDGET = PR_VALUE_CAP - DEPENDS_PREFIX.length;
const WIDEST_DEPENDS = ['a'.repeat(64), 'b'.repeat(64), 'c'.repeat(DEPENDS_LINE_BUDGET - 64 - 2 - 64 - 2)].join(',');

test('the WIDEST body any caller can compose still fits inside the github pull-request body limit', () => {
  const wide = 'y'.repeat(PR_VALUE_CAP);
  const scope = 'w'.repeat(16);
  const prefix = `refactor(${scope}): `;
  const widest = okParse([
    'pr-create', '--repo', REPO, '--head', HEAD, '--base', BASE,
    '--title', `${prefix}${'w'.repeat(PR_TITLE_CAP - prefix.length)}`,
    '--origin', 'machine',
    '--provenance', `agent=${'a'.repeat(64)} model=${'m'.repeat(64)}`,
    '--risk', wide,
    '--supersedes', 'https://github.com/acme/widgets/pull/4294967295',
    '--depends', WIDEST_DEPENDS,
    '--changed-lines', '9999999',
    ...repeatFlag('--why', PR_MULTI_LIMITS['--why'], wide),
    ...repeatFlag('--what', PR_MULTI_LIMITS['--what'], wide),
    ...repeatFlag('--verified', PR_MULTI_LIMITS['--verified'], wide),
    ...repeatFlag('--not-verified', PR_MULTI_LIMITS['--not-verified'], wide),
    ...repeatFlag('--link', PR_MULTI_LIMITS['--link'], wide),
  ]);
  const body = renderPrCreateBody(widest.opts);
  assert.ok(
    body.length <= GITHUB_PR_BODY_LIMIT,
    `the composed body is ${body.length} characters; the per-value cap, the cardinality ceilings and the depends bound must compose to a bound under ${GITHUB_PR_BODY_LIMIT}`,
  );
});

test('parse REJECTS a pr-create carrying no verification statement at all', () => {
  const parsed = failParse(prCreateArgvWithout('--not-verified'));
  assert.match(parsed.error, /--verified or --not-verified/);
  okParse([...prCreateArgvWithout('--not-verified'), '--verified', 'node --test tests/pr.test.mjs - 0 fail']);
});

test('parse REJECTS --origin machine without --provenance, so a machine pull request always names its author', () => {
  const parsed = failParse(prCreateArgvWithout('--provenance'));
  assert.match(parsed.error, /--provenance/);
});

test('parse REJECTS --origin human carrying a --provenance it cannot honestly know', () => {
  const parsed = failParse(prCreateArgvReplacing('--origin', 'human'));
  assert.match(parsed.error, /--provenance/);
});

test('parse ACCEPTS --origin human with no provenance at all', () => {
  const argv = prCreateArgvWithout('--provenance');
  const parsed = okParse(argv.map((token, i) => (argv[i - 1] === '--origin' ? 'human' : token)));
  assert.equal(parsed.opts.origin, 'human');
  assert.equal(parsed.opts.provenance, null);
});

const REJECTED_PROVENANCE = Object.freeze([
  'ship',
  'agent=ship',
  'model=opus',
  'agent=ship model=',
  'agent= model=opus',
  'agent=ship model=opus extra',
  'agent=ship agent=other model=opus',
  `agent=${'a'.repeat(65)} model=opus`,
  `agent=ship model=${'m'.repeat(65)}`,
]);

for (const provenance of REJECTED_PROVENANCE) {
  test(`parse REJECTS the free-form provenance ${JSON.stringify(provenance)}`, () => {
    failParse(prCreateArgvReplacing('--provenance', provenance));
  });
}

const ACCEPTED_PROVENANCE_BOUNDS = Object.freeze([
  ['an agent label of exactly 64 characters', `agent=${'a'.repeat(64)} model=opus`],
  ['a model id of exactly 64 characters', `agent=ship model=${'m'.repeat(64)}`],
  ['a single character in both the agent label and the model id', 'agent=a model=m'],
]);

for (const [label, provenance] of ACCEPTED_PROVENANCE_BOUNDS) {
  test(`parse ACCEPTS ${label}, pinning both provenance length bounds at 1 to 64`, () => {
    const parsed = okParse(prCreateArgvReplacing('--provenance', provenance));
    assert.equal(parsed.opts.provenance, provenance);
  });
}

const REAL_MODEL_PROVENANCE = 'agent=delivery-lead model=claude-opus-5[1m]';

test('parse ACCEPTS the bracketed model id this machine actually reports, so a machine pull request can name the model that opened it', () => {
  const parsed = okParse(prCreateArgvReplacing('--provenance', REAL_MODEL_PROVENANCE));
  assert.equal(parsed.opts.provenance, REAL_MODEL_PROVENANCE);
});

const BACKTICK = String.fromCharCode(96);

const PROVENANCE_INJECTION = Object.freeze([
  ['a parenthesis, the closing half of a markdown link', 'agent=x model=a(b)'],
  ['a backtick, the opener of a code span', `agent=x model=a${BACKTICK}b`],
  ['an angle bracket, the opener of an html tag', 'agent=x model=a<b'],
  ['a bang, the opener of markdown image syntax', 'agent=x model=a!b'],
  ['a hash, a forged heading marker', 'agent=x model=a#b'],
  ['a pipe, a table structure character', 'agent=x model=a|b'],
  ['a complete inline link', 'agent=delivery-lead model=[click](https://evil.example)'],
  ['brackets paired with the parentheses a markdown link still needs', 'agent=x model=a[b](c)'],
  ["a newline forging one of the tool's own headings", `agent=x model=y${LF}## Verification`],
]);

for (const [label, provenance] of PROVENANCE_INJECTION) {
  test(`parse REFUSES the provenance ${JSON.stringify(provenance)} carrying ${label}`, () => {
    const parsed = failParse(prCreateArgvReplacing('--provenance', provenance));
    assert.match(parsed.error, /--provenance/, `the refusal must name the provenance field it refused, got: ${parsed.error}`);
  });
}

const REJECTED_ORIGINS = Object.freeze(['robot', 'Machine', 'HUMAN', 'machine human', '']);

for (const origin of REJECTED_ORIGINS) {
  test(`parse REJECTS the origin ${JSON.stringify(origin)}`, () => {
    failParse(prCreateArgvReplacing('--origin', origin));
  });
}

const REJECTED_CHANGED_LINES = Object.freeze(['-1', '01', '1.5', 'many', '10000000', '1 2', '0x10']);

for (const value of REJECTED_CHANGED_LINES) {
  test(`parse REJECTS --changed-lines ${JSON.stringify(value)} rather than carrying an estimate into the body`, () => {
    failParse(prCreateArgv(['--changed-lines', value]));
  });
}

test('parse ACCEPTS a plain --changed-lines integer and carries it as a number', () => {
  assert.equal(okParse(prCreateArgv(['--changed-lines', '0'])).opts.changedLines, 0);
  assert.equal(okParse(prCreateArgv(['--changed-lines', '9999999'])).opts.changedLines, 9999999);
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
  test(`parse REJECTS the ref token ${JSON.stringify(ref)} in --head`, () => {
    failParse(prCreateArgvReplacing('--head', ref));
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

const CONTROL_IN_BODY = /[\x00-\x1F\x7F]/;

test('parse drops the caller-controlled --supersedes tail so no control character reaches the body', () => {
  const tail = `${NUL}${BEL}${String.fromCharCode(27)}[31m`;
  const parsed = okParse(prCreateArgv(['--supersedes', `https://github.com/acme/widgets/pull/41/${tail}`]));
  const body = renderPrCreateBody(parsed.opts);
  for (const line of body.split('\n')) {
    assert.ok(!CONTROL_IN_BODY.test(line), `a composed body line must carry no control character: ${JSON.stringify(line)}`);
  }
  assert.match(body, /^SUPERSEDES https:\/\/github\.com\/acme\/widgets\/pull\/41$/m);
});

test('parse keeps the human-gated trailer reachable by refusing a markdown tail on the supersedes line', () => {
  const parsed = okParse(prCreateArgv(['--supersedes', 'https://github.com/acme/widgets/pull/1?x=<!--']));
  const body = renderPrCreateBody(parsed.opts);
  assert.ok(!body.includes('<!--'), 'no caller-controlled tail may reach the supersedes line');
  assert.match(body, /HUMAN-GATED/);
});

test('parse canonicalises a --supersedes carrying a trailing newline so its body line cannot split', () => {
  const parsed = okParse(prCreateArgv(['--supersedes', `https://github.com/acme/widgets/pull/1?x=y${LF}`]));
  assert.equal(parsed.opts.supersedes, 'https://github.com/acme/widgets/pull/1');
  assert.match(renderPrCreateBody(parsed.opts), /^SUPERSEDES https:\/\/github\.com\/acme\/widgets\/pull\/1$/m);
});

test('parse REJECTS a --supersedes whose composed body line would exceed the value cap', () => {
  failParse(prCreateArgv(['--supersedes', `https://github.com/${'a'.repeat(600)}/widgets/pull/41`]));
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

test('parse REJECTS a --depends list whose composed link line passes the value cap every other body value obeys', () => {
  const accepted = okParse(prCreateArgv(['--depends', WIDEST_DEPENDS]));
  const line = `${DEPENDS_PREFIX}${accepted.opts.depends.join(', ')}`;
  assert.equal(line.length, PR_VALUE_CAP);
  assert.match(renderPrCreateBody(accepted.opts), new RegExp(`^${DEPENDS_PREFIX}`, 'm'));
  failParse(prCreateArgv(['--depends', `${WIDEST_DEPENDS},d`]));
});

test('parse REJECTS a --depends id past the per-id cap so the body line stays bounded', () => {
  okParse(prCreateArgv(['--depends', 'a'.repeat(64)]));
  failParse(prCreateArgv(['--depends', 'a'.repeat(65)]));
  failParse(prCreateArgv(['--depends', 'a'.repeat(70000)]));
  failParse(prCreateArgv(['--depends', `msp-1,${'b'.repeat(65)}`]));
});

test('renderPrCreateBody composes a fixed template from inert values only', () => {
  const body = renderPrCreateBody({
    origin: 'machine',
    why: ['the prior pull request for this MSP was invalidated by a divergent parent'],
    what: ['interdiff: renamed two helpers'],
    notVerified: ['CI on the superseding head - not run'],
    provenance: 'agent=supersede:msp-1 model=unspecified',
    supersedes: 'https://github.com/acme/widgets/pull/41',
    depends: ['msp-1', 'msp-2'],
  });
  assert.match(body, /interdiff: renamed two helpers/);
  assert.match(body, /SUPERSEDES https:\/\/github\.com\/acme\/widgets\/pull\/41/);
  assert.match(body, /DEPENDS-ON msp-1, msp-2/);
  assert.ok(!body.startsWith('@'), 'a rendered body must never begin with the field-indirection sigil');
});

test('renderPrCreateBody omits the supersedes and depends lines when they are absent', () => {
  const body = renderPrCreateBody({ origin: 'human', why: ['a reason'], what: ['a change'], verified: ['a check - 0 fail'] });
  assert.ok(!body.includes('SUPERSEDES'));
  assert.ok(!body.includes('DEPENDS-ON'));
  assert.ok(!body.includes('## Links'));
  assert.match(body, /HUMAN-GATED/);
});

test('buildGhArgv composes the pr-create OBSERVE probe as an exact argv array', () => {
  const { opts } = okParse(prCreateArgv());
  assert.deepEqual(buildGhArgv('pr-create', 'observe', opts), [
    'pr', 'list', '-R', REPO, '--head', HEAD, '--base', BASE, '--state', 'open', '--json', 'url,number,body',
  ]);
});

test('buildGhArgv composes the pr-create CONVERGE call with an inline --body and no reference-valued flag', () => {
  const { opts } = okParse(prCreateArgv());
  const argv = buildGhArgv('pr-create', 'converge', opts);
  assert.deepEqual(argv.slice(0, 10), [
    'pr', 'create', '-R', REPO, '--head', HEAD, '--base', BASE, '--title', TITLE,
  ]);
  assert.equal(argv[10], '--body');
  assert.equal(argv.length, 12);
  assert.match(argv[11], /## Why/);
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
    ['pr-create', 'converge', okParse(prCreateArgv()).opts],
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

function openPrListing(body) {
  return JSON.stringify([{ url: 'https://github.com/acme/widgets/pull/41', number: 41, body }]);
}

test('e2e: pr-create REUSES an existing open PR this tool composed and never issues a create call', () => {
  const composed = renderPrCreateBody(okParse(prCreateArgv()).opts);
  withSandbox([{ stdout: openPrListing(composed) }], (sandbox) => {
    const res = runWrapper(prCreateArgv(), sandbox);
    assert.equal(res.status, 0, `expected exit 0; stderr=${res.stderr}`);
    assert.deepEqual(JSON.parse(res.stdout), { action: 'reused', url: 'https://github.com/acme/widgets/pull/41', number: 41 });
    const calls = recordedCalls(sandbox);
    assert.equal(calls.length, 1, `expected only the observe probe, got ${JSON.stringify(calls)}`);
    assert.deepEqual(calls[0], ['pr', 'list', '-R', REPO, '--head', HEAD, '--base', BASE, '--state', 'open', '--json', 'url,number,body']);
  });
});

test('e2e: pr-create reports an out-of-format open PR as reused-unverified rather than laundering it into a compliance receipt', () => {
  withSandbox([{ stdout: openPrListing('opened by hand with a free-form body and no trailer') }], (sandbox) => {
    const res = runWrapper(prCreateArgv(), sandbox);
    assert.equal(res.status, 0, `expected exit 0; stderr=${res.stderr}`);
    assert.deepEqual(JSON.parse(res.stdout), { action: 'reused-unverified', url: 'https://github.com/acme/widgets/pull/41', number: 41 });
    assert.match(res.stderr, /does not end with a pr-create trailer/);
    assert.equal(recordedCalls(sandbox).length, 1, 'an unverified reuse must still never issue a create call');
  });
});

test('e2e: pr-create CONVERGES only after an empty observe, and the create argv carries an inline body', () => {
  withSandbox([
    { stdout: '[]' },
    { stdout: 'https://github.com/acme/widgets/pull/42\n' },
  ], (sandbox) => {
    const res = runWrapper(prCreateArgv(['--what', 'interdiff summary', '--depends', 'msp-1']), sandbox);
    assert.equal(res.status, 0, `expected exit 0; stderr=${res.stderr}`);
    assert.deepEqual(JSON.parse(res.stdout), { action: 'created', url: 'https://github.com/acme/widgets/pull/42', number: 42 });
    const calls = recordedCalls(sandbox);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[1].slice(0, 9), ['pr', 'create', '-R', REPO, '--head', HEAD, '--base', BASE, '--title']);
    assert.equal(calls[1][10], '--body');
    assert.match(calls[1][11], /- interdiff summary/);
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

test('e2e: pr-create forwards the WHOLE gh stderr on a converge failure, not just one pipe buffer', () => {
  const emitted = `${'E'.repeat(400000)}Z`;
  withSandbox([
    { stdout: '[]' },
    { stderr: emitted, exit: 1 },
  ], (sandbox) => {
    const res = runWrapper(prCreateArgv(), sandbox);
    assert.equal(res.status, MITOSIS_GIT_CONVERGE_EXIT);
    assert.equal(res.stderr.length, emitted.length, 'the forwarded diagnostic must not be cut at the pipe buffer');
    assert.ok(res.stderr.endsWith('Z'), 'the tail of the gh diagnostic must survive');
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
  prCreateArgvReplacing('--repo', '../..'),
  prCreateArgvReplacing('--head', 'a..b'),
  prCreateArgvReplacing('--title', 'MSP-1 ships the thing'),
  prCreateArgvWithout('--not-verified'),
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
