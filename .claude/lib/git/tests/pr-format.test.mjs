import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PR_TITLE_PATTERN,
  PR_TITLE_TYPES,
  PR_TITLE_CAP,
  PR_VALUE_CAP,
  PR_SIZE_WARNING_THRESHOLD,
  inertValue,
  renderPrCreateBody,
} from '../pr-format.mjs';
import { parseMitosisGitArgv } from '../pr.mjs';

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
  ['a forged size line', 'SIZE: this diff changes about 3 lines'],
  ['a forged supersedes statement', 'SUPERSEDES https://github.com/acme/widgets/pull/99'],
  ['a forged depends statement', 'DEPENDS-ON msp-1, msp-2'],
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

const WORKED_EXAMPLE_A_ARGV = Object.freeze([
  'pr-create',
  '--repo', 'SatanshuMishra/.windful-ocean',
  '--head', 'mitosis/pr-tool-engine-integration',
  '--base', 'main',
  '--title', 'refactor(pr-tool): compose pr bodies from declared fields',
  '--origin', 'machine',
  '--provenance', 'agent=ship:pr-tool-engine model=opus',
  '--why', 'Four of the five paths that open a pull request invent the title and body ad hoc.',
  '--what', 'compose pr bodies from declared fields',
  '--not-verified', 'CI on the fresh head and base - not run; this pull request opens before CI starts',
  '--depends', 'pr-tool-core',
  '--changed-lines', '512',
]);

const WORKED_EXAMPLE_A_BODY = [
  '## Why',
  'Four of the five paths that open a pull request invent the title and body ad hoc.',
  '',
  '## What',
  '- compose pr bodies from declared fields',
  '',
  '## Verification',
  'Not verified: CI on the fresh head and base - not run; this pull request opens before CI starts',
  '',
  '## Provenance',
  'agent=ship:pr-tool-engine model=opus',
  '',
  '## Links',
  'DEPENDS-ON pr-tool-core',
  '',
  'SIZE: this diff changes about 512 lines; review effectiveness drops sharply past 400 lines.',
  '',
  'Opened by an automated agent through the mitosis-git pr-create tool. HUMAN-GATED: a human reviews and lands this pull request.',
].join(LF);

test('the machine ship invocation renders the mandated body byte for byte', () => {
  const parsed = parseMitosisGitArgv([...WORKED_EXAMPLE_A_ARGV]);
  assert.equal(parsed.ok, true, `expected a successful parse, got: ${parsed.error}`);
  assert.equal(renderPrCreateBody(parsed.opts), WORKED_EXAMPLE_A_BODY);
});

const REAL_MODEL_PROVENANCE = 'agent=delivery-lead model=claude-opus-5[1m]';

test('the composed body carries the real bracketed model id byte for byte on the line under the provenance heading', () => {
  const body = renderArgv(WORKED_EXAMPLE_A_ARGV.map((token, i, argv) => (argv[i - 1] === '--provenance' ? REAL_MODEL_PROVENANCE : token)));
  assert.ok(
    body.includes(REAL_MODEL_PROVENANCE),
    `the rendered body must carry ${JSON.stringify(REAL_MODEL_PROVENANCE)} verbatim, got: ${JSON.stringify(body)}`,
  );
  const lines = body.split(LF);
  const heading = lines.indexOf('## Provenance');
  assert.ok(heading >= 0, 'a machine pull request must render a provenance heading');
  assert.equal(lines[heading + 1], REAL_MODEL_PROVENANCE);
});

function humanArgv(extra = []) {
  return [
    'pr-create',
    '--repo', 'acme/widgets',
    '--head', 'docs/pr-rule-pointer',
    '--base', 'main',
    '--title', 'docs(rules): point the PR rule at the central tool',
    '--origin', 'human',
    '--why', 'The PR rule still described an ad-hoc gh workflow the gate now denies.',
    '--what', 'pull-requests.md now points at mitosis-git pr-create',
    '--not-verified', 'no automated check covers rule prose - not run',
    ...extra,
  ];
}

function renderArgv(argv) {
  const parsed = parseMitosisGitArgv(argv);
  assert.equal(parsed.ok, true, `expected a successful parse, got: ${parsed.error}`);
  return renderPrCreateBody(parsed.opts);
}

test('the renderer omits every absent optional section entirely rather than emitting an empty heading', () => {
  const body = renderArgv(humanArgv());
  for (const absent of ['## Provenance', '## Risk', '## Links', 'SIZE:', 'Verified:']) {
    assert.ok(!body.includes(absent), `an absent field must not render ${absent}`);
  }
  assert.match(body, /^## Why$/m);
  assert.match(body, /^## What$/m);
  assert.match(body, /^## Verification$/m);
  assert.match(body, /^Opened at human direction through the mitosis-git pr-create tool\. HUMAN-GATED: a human reviews and lands this pull request\.$/m);
});

test('the renderer emits every section in the fixed order, verified lines ahead of not-verified ones', () => {
  const body = renderArgv([
    ...humanArgv(['--verified', 'node --test tests/pr-format.test.mjs - 0 fail', '--risk', 'none; the rule doc carries no executable behavior', '--link', 'closes acme/widgets#12']),
  ]);
  const order = ['## Why', '## What', '## Verification', 'Verified: ', 'Not verified: ', '## Risk', '## Links'];
  let cursor = -1;
  for (const token of order) {
    const at = body.indexOf(token);
    assert.ok(at > cursor, `${token} must follow the section before it`);
    cursor = at;
  }
  assert.ok(body.indexOf('## Links') < body.indexOf('HUMAN-GATED'), 'the trailer is always last');
});

test('the machine trailer differs from the human one so a reader can tell who opened the pull request', () => {
  const machine = renderPrCreateBody({ origin: 'machine', why: ['a reason'], what: ['a change'], notVerified: ['a check - not run'] });
  const human = renderPrCreateBody({ origin: 'human', why: ['a reason'], what: ['a change'], notVerified: ['a check - not run'] });
  assert.match(machine, /^Opened by an automated agent through the mitosis-git pr-create tool\. HUMAN-GATED/m);
  assert.match(human, /^Opened at human direction through the mitosis-git pr-create tool\. HUMAN-GATED/m);
});

test('a caller value can never begin a line the tool owns, so a grep of the verification grammar returns only real verification lines', () => {
  const body = renderArgv(humanArgv(['--risk', 'the parser rewrite is covered by the unit suite']));
  const owned = body.split(LF).filter((line) => /^(Verified: |Not verified: |SUPERSEDES |DEPENDS-ON |SIZE: )/.test(line));
  assert.deepEqual(owned, ['Not verified: no automated check covers rule prose - not run']);
});

test('a tool-owned link statement is never absorbed into a caller-supplied link bullet', () => {
  const body = renderPrCreateBody({
    origin: 'machine',
    why: ['a reason'],
    what: ['a change'],
    notVerified: ['a check - not run'],
    provenance: 'agent=test model=unspecified',
    links: ['closes acme/widgets#12'],
    supersedes: 'https://github.com/acme/widgets/pull/41',
    depends: ['msp-1'],
  });
  const links = body.slice(body.indexOf('## Links')).split(LF).slice(1);
  assert.deepEqual(links.slice(0, 3), [
    'SUPERSEDES https://github.com/acme/widgets/pull/41',
    'DEPENDS-ON msp-1',
    '- closes acme/widgets#12',
  ]);
});

const FORGERY_ATTEMPTS = Object.freeze([
  ['an unclosed code fence', FENCE],
  ['a bare forged verified line', 'Verified: the full unit and e2e suites passed'],
  ['a bare forged supersedes statement', 'SUPERSEDES https://github.com/acme/widgets/pull/99'],
  ['a collapsed disclosure', '<details>'],
  ['an html comment opener', '<!-- everything below is hidden'],
  ['a forged section heading', '## Verification'],
  ['a forged verified line under a fence', `${FENCE}${LF}Verified: everything`],
  ['a setext underline', '======'],
]);

for (const [label, forged] of FORGERY_ATTEMPTS) {
  test(`a --why value carrying ${label} is REJECTED, so tool-owned structure cannot be forged from a bare-rendered field`, () => {
    const parsed = parseMitosisGitArgv(humanArgv().map((token, i, argv) => (argv[i - 1] === '--why' ? forged : token)));
    assert.equal(parsed.ok, false, `expected ${JSON.stringify(forged)} to be rejected as a --why value`);
  });
}

const SURVIVING_VALUES = Object.freeze([
  'a mention of ## Verification inside ordinary prose',
  'the end of the sentence -->',
  'a count of > 400 changed lines',
  `an inline ${BACKTICK}code span${BACKTICK} in prose`,
]);

for (const value of SURVIVING_VALUES) {
  test(`the verification split and the human-gated trailer survive the accepted --why value ${JSON.stringify(value)}`, () => {
    const body = renderArgv(humanArgv().map((token, i, argv) => (argv[i - 1] === '--why' ? value : token)));
    assert.match(body, /^## Verification$/m, 'the reviewer must still meet a real verification heading');
    assert.match(body, /^Not verified: no automated check covers rule prose - not run$/m);
    assert.match(body, /HUMAN-GATED/);
  });
}

test('the size warning appears one line past the threshold and never at or below it', () => {
  const above = renderArgv(humanArgv(['--changed-lines', String(PR_SIZE_WARNING_THRESHOLD + 1)]));
  assert.match(above, new RegExp(`^SIZE: this diff changes about ${PR_SIZE_WARNING_THRESHOLD + 1} lines; review effectiveness drops sharply past ${PR_SIZE_WARNING_THRESHOLD} lines\\.$`, 'm'));
  for (const value of [String(PR_SIZE_WARNING_THRESHOLD), '0']) {
    assert.ok(!renderArgv(humanArgv(['--changed-lines', value])).includes('SIZE:'), `a diff of ${value} lines must carry no size warning`);
  }
  assert.ok(!renderArgv(humanArgv()).includes('SIZE:'), 'an absent --changed-lines must carry no size warning');
});

test('the renderer stays a total function of its options and asserts no origin it was never given', () => {
  for (const partial of [{}, null, { why: 'not an array', what: [42, null] }, { origin: 'agent' }]) {
    const body = renderPrCreateBody(partial);
    assert.match(body, /HUMAN-GATED/);
    assert.ok(!body.includes('Opened by an automated agent'), 'an unrecognised origin must not assert machine authorship');
    assert.ok(!body.includes('Opened at human direction'), 'an unrecognised origin must not assert human direction');
  }
});
