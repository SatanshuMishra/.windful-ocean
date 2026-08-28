import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PR_TITLE_PATTERN,
  PR_TITLE_TYPES,
  PR_TITLE_CAP,
  PR_VALUE_CAP,
  inertValue,
  renderPrCreateBody,
  carriesComposedSkeleton,
} from '../pr-format.mjs';
import { parsePrToolArgv } from '../pr.mjs';

const BACKTICK = String.fromCharCode(96);
const FENCE = BACKTICK.repeat(3);
const E_ACUTE = String.fromCharCode(233);
const RIGHT_TO_LEFT_OVERRIDE = String.fromCharCode(8238);
const NUL = String.fromCharCode(0);
const BEL = String.fromCharCode(7);
const LF = String.fromCharCode(10);
const DEL = String.fromCharCode(127);

const ACCEPTED_TITLES = Object.freeze([
  'refactor(pr-tool): centralize pull-request creation',
  'fix(hooks): deny raw pr creation at the gate',
  'docs(rules): point the PR rule at the central tool',
]);

for (const title of ACCEPTED_TITLES) {
  test(`PR_TITLE_PATTERN ACCEPTS the composed title ${JSON.stringify(title)}`, () => {
    assert.ok(PR_TITLE_PATTERN.test(title));
    assert.ok(title.length <= PR_TITLE_CAP);
  });
}

const REJECTED_TITLES = Object.freeze([
  ['a missing type', 'centralize pull-request creation'],
  ['the removed engine prefix', 'mitosis: pr-tool-core'],
  ['a type outside the allowed list', 'build(pr-tool): centralize creation'],
  ['an uppercase summary', 'refactor(pr-tool): Centralize creation'],
  ['a trailing period', 'refactor(pr-tool): centralize creation.'],
  ['a trailing space', 'refactor(pr-tool): centralize creation '],
  ['a one-character summary', 'refactor(pr-tool): x'],
  ['an empty summary', 'refactor(pr-tool): '],
  ['a missing colon-space', 'refactor(pr-tool):centralize creation'],
  ['an uppercase scope', 'refactor(PR-Tool): centralize creation'],
  ['a 17-character scope', `refactor(${'s'.repeat(17)}): centralize creation`],
  ['73 characters', `refactor(pr-tool): ${'w'.repeat(PR_TITLE_CAP - 19 + 1)}`],
  ['a non-ascii summary', `refactor(pr-tool): centralize caf${E_ACUTE} creation`],
]);

for (const [label, title] of REJECTED_TITLES) {
  test(`PR_TITLE_PATTERN REJECTS ${label}`, () => {
    assert.equal(PR_TITLE_PATTERN.test(title), false, `expected ${JSON.stringify(title)} to be rejected`);
  });
}

test('PR_TITLE_PATTERN accepts every declared type with and without a scope', () => {
  for (const type of PR_TITLE_TYPES) {
    assert.ok(PR_TITLE_PATTERN.test(`${type}: centralize pull-request creation`), `${type} without a scope must compose`);
    assert.ok(PR_TITLE_PATTERN.test(`${type}(pr-tool): centralize pull-request creation`), `${type} with a scope must compose`);
  }
});

test('PR_TITLE_PATTERN accepts a title of exactly the cap and rejects one character more', () => {
  const prefix = 'refactor(pr-tool): ';
  const atCap = `${prefix}${'w'.repeat(PR_TITLE_CAP - prefix.length)}`;
  assert.equal(atCap.length, PR_TITLE_CAP);
  assert.ok(PR_TITLE_PATTERN.test(atCap));
  assert.equal(PR_TITLE_PATTERN.test(`${atCap}w`), false);
});

test('inertValue strips control characters instead of rejecting the value that carries them', () => {
  assert.equal(inertValue(`a${LF}b${NUL}c${BEL}d${DEL}`, PR_VALUE_CAP), 'abcd');
  assert.equal(inertValue(`  padded  `, PR_VALUE_CAP), 'padded');
});

const REJECTED_VALUES = Object.freeze([
  ['a non-string', 42],
  ['an empty value', ''],
  ['a whitespace-only value', '   '],
  ['a value that is empty once control characters are stripped', `${NUL}${LF}`],
  ['a leading field-indirection sigil', '@/etc/passwd'],
  ['a bare field-indirection sigil', '@-'],
  ['a non-ascii character', `caf${E_ACUTE} review`],
  ['a bidirectional override', `pending${RIGHT_TO_LEFT_OVERRIDE}review`],
  ['an html comment opener', 'a note <!-- hidden'],
  ['a details tag opener', 'expand this <details>'],
  ['a closing tag', 'the end </details>'],
  ['a leading code fence', `${FENCE} shell`],
  ['a leading backtick', `${BACKTICK}inline`],
  ['a leading tilde fence', '~~~ shell'],
  ['a leading atx heading', '## Verification'],
  ['a leading block quote', '> quoted'],
  ['a leading table pipe', '| a | b |'],
  ['an all-equals setext underline', '========'],
  ['an all-hyphen setext underline', '--------'],
  ['a forged verified line', 'Verified: the full unit and e2e suites passed'],
  ['a forged not-verified line in any case', 'not verified: nothing - every check ran'],
  ['a forged supersedes statement', 'Supersedes https://github.com/acme/widgets/pull/99'],
]);

for (const [label, value] of REJECTED_VALUES) {
  test(`inertValue REJECTS ${label}`, () => {
    assert.equal(inertValue(value, PR_VALUE_CAP), null, `expected ${JSON.stringify(value)} to be rejected`);
  });
}

const ACCEPTED_VALUES = Object.freeze([
  ['a dash-leading interdiff line', '- fixed the parser'],
  ['a diff header', '--- a/src/parser.mjs'],
  ['a hash that is not a heading', 'closes issue #412 in the tracker'],
  ['an angle bracket that opens no tag', 'the count is > 400 lines'],
  ['a pipe inside prose', 'piped through grep | wc -l'],
  ['a trailing tag closer', 'the end of the sentence -->'],
  ['a bare url', 'https://github.com/acme/widgets/pull/41'],
  ['ordinary punctuation', "the caller's own check: 41 pass, 0 fail (100%)"],
  ['prose that merely mentions verification', 'Verification of the parser is covered by the unit suite'],
  ['prose that merely mentions superseding', 'supersedes the legacy adapter in the same commit'],
]);

for (const [label, value] of ACCEPTED_VALUES) {
  test(`inertValue ACCEPTS ${label}`, () => {
    assert.equal(inertValue(value, PR_VALUE_CAP), value);
  });
}

test('inertValue REJECTS an over-cap value rather than truncating it', () => {
  assert.equal(inertValue('y'.repeat(PR_VALUE_CAP), PR_VALUE_CAP), 'y'.repeat(PR_VALUE_CAP));
  assert.equal(inertValue('y'.repeat(PR_VALUE_CAP + 1), PR_VALUE_CAP), null);
});

function renderArgv(argv) {
  const parsed = parsePrToolArgv(argv);
  assert.equal(parsed.ok, true, `expected a successful parse, got: ${parsed.error}`);
  return renderPrCreateBody(parsed.opts);
}

function baseArgv(extra = []) {
  return [
    'pr-create',
    '--repo', 'acme/widgets',
    '--head', 'docs/pr-rule-pointer',
    '--base', 'main',
    '--title', 'docs(rules): point the PR rule at the central tool',
    '--why', 'The rule still described a workflow the gate denies, so it sent people down a path that fails.',
    '--what', 'The pull-request rule now points at the central tool instead of an ad-hoc command.',
    '--not-verified', 'no automated check covers rule prose - not run',
    ...extra,
  ];
}

const WORKED_EXAMPLE_A_ARGV = Object.freeze(baseArgv());

const WORKED_EXAMPLE_A_BODY = [
  '## What changed',
  '- The pull-request rule now points at the central tool instead of an ad-hoc command.',
  '',
  '## Why',
  'The rule still described a workflow the gate denies, so it sent people down a path that fails.',
  '',
  '## Verification',
  'Not verified: no automated check covers rule prose - not run',
].join(LF);

test('the rendered body for worked example A (§4.7, minimal) matches the spec byte for byte', () => {
  const parsed = parsePrToolArgv([...WORKED_EXAMPLE_A_ARGV]);
  assert.equal(parsed.ok, true, `expected a successful parse, got: ${parsed.error}`);
  assert.equal(renderPrCreateBody(parsed.opts), WORKED_EXAMPLE_A_BODY);
});

const WORKED_EXAMPLE_B_ARGV = Object.freeze([
  'pr-create',
  '--repo', 'acme/widgets',
  '--head', 'refactor/pr-body',
  '--base', 'main',
  '--title', 'refactor(pr-tool): compose pr bodies from declared fields',
  '--what', 'Pull-request descriptions are now built from declared fields instead of written by hand.',
  '--what', 'The description opens with the change itself, so a reviewer reads what happened first.',
  '--why', 'Every path that opened a pull request invented its own format, so no two descriptions could be read the same way.',
  '--why', 'receipt-cmd: node --test .claude/lib/git/tests/pr-format.test.mjs',
  '--risk', 'A pull request opened before this change no longer matches the expected shape and is reported as unverified.',
  '--verified', 'node --test .claude/lib/git/tests/pr-format.test.mjs - 71 pass, 0 fail',
  '--not-verified', 'the enforcer on the fresh branch - not run; it starts after this opens',
  '--supersedes', 'https://github.com/acme/widgets/pull/41',
  '--link', 'closes acme/widgets#12',
]);

const WORKED_EXAMPLE_B_BODY = [
  '## What changed',
  '- Pull-request descriptions are now built from declared fields instead of written by hand.',
  '- The description opens with the change itself, so a reviewer reads what happened first.',
  '',
  '## Why',
  'Every path that opened a pull request invented its own format, so no two descriptions could be read the same way.',
  'receipt-cmd: node --test .claude/lib/git/tests/pr-format.test.mjs',
  '',
  '## Risk',
  'A pull request opened before this change no longer matches the expected shape and is reported as unverified.',
  '',
  '## Verification',
  'Verified: node --test .claude/lib/git/tests/pr-format.test.mjs - 71 pass, 0 fail',
  'Not verified: the enforcer on the fresh branch - not run; it starts after this opens',
  '',
  '## Links',
  'Supersedes https://github.com/acme/widgets/pull/41',
  '- closes acme/widgets#12',
].join(LF);

test('the rendered body for worked example B (§4.8, every optional section) matches the spec byte for byte', () => {
  const parsed = parsePrToolArgv([...WORKED_EXAMPLE_B_ARGV]);
  assert.equal(parsed.ok, true, `expected a successful parse, got: ${parsed.error}`);
  assert.equal(renderPrCreateBody(parsed.opts), WORKED_EXAMPLE_B_BODY);
});

test('the renderer omits every absent optional section entirely rather than emitting an empty heading', () => {
  const body = renderArgv(baseArgv());
  for (const absent of ['## Risk', '## Links', 'Verified:']) {
    assert.ok(!body.includes(absent), `an absent field must not render ${absent}`);
  }
  assert.match(body, /^## What changed$/m);
  assert.match(body, /^## Why$/m);
  assert.match(body, /^## Verification$/m);
});

test('the renderer emits every section in the fixed order, verified lines ahead of not-verified ones', () => {
  const body = renderArgv(baseArgv([
    '--verified', 'node --test tests/pr-format.test.mjs - 0 fail',
    '--risk', 'A documentation-only change carries no executable behavior to verify.',
    '--link', 'closes acme/widgets#12',
  ]));
  const order = ['## What changed', '## Why', '## Risk', '## Verification', 'Verified: ', 'Not verified: ', '## Links'];
  let cursor = -1;
  for (const token of order) {
    const at = body.indexOf(token);
    assert.ok(at > cursor, `${token} must follow the section before it`);
    cursor = at;
  }
  const lines = body.split(LF);
  assert.equal(lines[lines.length - 1], '- closes acme/widgets#12', 'the body ends with the last populated section, not any trailer');
});

test('a caller value can never begin a line the tool owns, so a grep of the verification grammar returns only real verification lines', () => {
  const body = renderArgv(baseArgv(['--risk', 'A parser rewrite is covered by the unit suite.']));
  const owned = body.split(LF).filter((line) => /^(Verified: |Not verified: |Supersedes )/.test(line));
  assert.deepEqual(owned, ['Not verified: no automated check covers rule prose - not run']);
});

const FORGERY_ATTEMPTS = Object.freeze([
  ['an unclosed code fence', FENCE],
  ['a bare forged verified line', 'Verified: the full unit and e2e suites passed'],
  ['a bare forged supersedes statement', 'Supersedes https://github.com/acme/widgets/pull/99'],
  ['a collapsed disclosure', '<details>'],
  ['an html comment opener', '<!-- everything below is hidden'],
  ['a forged section heading', '## Verification'],
  ['a forged verified line under a fence', `${FENCE}${LF}Verified: everything`],
  ['a setext underline', '======'],
]);

for (const [label, forged] of FORGERY_ATTEMPTS) {
  test(`a --why value carrying ${label} is REJECTED, so tool-owned structure cannot be forged from a bare-rendered field`, () => {
    const parsed = parsePrToolArgv(baseArgv().map((token, i, argv) => (argv[i - 1] === '--why' ? forged : token)));
    assert.equal(parsed.ok, false, `expected ${JSON.stringify(forged)} to be rejected as a --why value`);
  });
}

const COMPOSED_BODY = renderPrCreateBody({
  what: ['The pull-request rule now points at the central tool instead of an ad-hoc command.'],
  why: ['The rule still described a workflow the gate denies, so it sent people down a path that fails.'],
  notVerified: ['no automated check covers rule prose - not run'],
});

test('carriesComposedSkeleton recognises a body this tool actually rendered', () => {
  assert.equal(carriesComposedSkeleton(COMPOSED_BODY), true);
});

test('carriesComposedSkeleton returns false once ## Why is stripped from a composed body', () => {
  const withoutWhy = COMPOSED_BODY.split(LF).filter((line) => line !== '## Why').join(LF);
  assert.equal(carriesComposedSkeleton(withoutWhy), false);
});

test('carriesComposedSkeleton returns false when a paragraph is prepended above ## What changed', () => {
  const prepended = `a hand-written preface${LF}${LF}${COMPOSED_BODY}`;
  assert.equal(carriesComposedSkeleton(prepended), false);
});

test('carriesComposedSkeleton returns false for a hand-written body carrying no headings at all', () => {
  assert.equal(carriesComposedSkeleton('Fixed a typo in the README.'), false);
});

const NON_STRING_BODIES = Object.freeze([null, undefined, 42, {}, []]);

for (const value of NON_STRING_BODIES) {
  test(`carriesComposedSkeleton returns false for the non-string input ${String(value)}`, () => {
    assert.equal(carriesComposedSkeleton(value), false);
  });
}

test('carriesComposedSkeleton returns false for a pre-existing pull request still carrying the retired trailer sentence', () => {
  const legacyBody = [
    '## Why',
    'The rule still described a workflow the gate denies.',
    '',
    '## What',
    '- pull-requests.md now points at mitosis-git pr-create',
    '',
    '## Verification',
    'Not verified: no automated check covers rule prose - not run',
    '',
    'Opened at human direction through the mitosis-git pr-create tool. HUMAN-GATED: a human reviews and lands this pull request.',
  ].join(LF);
  assert.equal(carriesComposedSkeleton(legacyBody), false);
});
