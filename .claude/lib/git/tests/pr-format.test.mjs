import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  PR_TITLE_PATTERN,
  PR_TITLE_TYPES,
  PR_TITLE_CAP,
  PR_VALUE_CAP,
  inertValue,
  renderPrCreateBody,
} from '../pr-format.mjs';
import { parsePrToolArgv } from '../pr.mjs';

const BACKTICK = String.fromCharCode(96);
const FENCE = BACKTICK.repeat(3);
const E_ACUTE = String.fromCharCode(233);
const RIGHT_TO_LEFT_OVERRIDE = String.fromCharCode(8238);
const ZERO_WIDTH_SPACE = String.fromCharCode(8203);
const LEFT_TO_RIGHT_ISOLATE = String.fromCharCode(8294);
const WORD_JOINER = String.fromCharCode(8288);
const BYTE_ORDER_MARK = String.fromCharCode(65279);
const LINE_SEPARATOR = String.fromCharCode(8232);
const C1_CONTROL = String.fromCharCode(155);
const EM_DASH = String.fromCharCode(8212);
const E_ACUTE_CAPITAL = String.fromCharCode(201);
const NUL = String.fromCharCode(0);
const BEL = String.fromCharCode(7);
const LF = String.fromCharCode(10);
const DEL = String.fromCharCode(127);
const TAB = String.fromCharCode(9);
const CR = String.fromCharCode(13);
const ESC = String.fromCharCode(27);

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
  ['a bidirectional override', `pending${RIGHT_TO_LEFT_OVERRIDE}review`],
  ['a bidirectional isolate', `pending${LEFT_TO_RIGHT_ISOLATE}review`],
  ['a zero-width space', `pending${ZERO_WIDTH_SPACE}review`],
  ['a word joiner', `pending${WORD_JOINER}review`],
  ['a byte order mark', `pending${BYTE_ORDER_MARK}review`],
  ['a unicode line separator', `pending${LINE_SEPARATOR}review`],
  ['a c1 control the ascii strip does not reach', `pending${C1_CONTROL}review`],
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
  ['an em dash', `the parser now reads eight values ${EM_DASH} not three ${EM_DASH} per flag`],
  ['an accented name', `reviewed by Andr${E_ACUTE} before the merge`],
  ['an accented capital opening the value', `${E_ACUTE_CAPITAL}migr${E_ACUTE} values now compose.`],
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
    'pr-render',
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
  'pr-render',
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

const PR_TOOL_SOURCE = fileURLToPath(new URL('../pr.mjs', import.meta.url));

function renderArgvOf(fields) {
  return [
    'pr-render',
    '--title', fields.title,
    ...(fields.why ?? []).flatMap((value) => ['--why', value]),
    ...(fields.what ?? []).flatMap((value) => ['--what', value]),
    ...(fields.verified ?? []).flatMap((value) => ['--verified', value]),
    ...(fields.notVerified ?? []).flatMap((value) => ['--not-verified', value]),
    ...(fields.links ?? []).flatMap((value) => ['--link', value]),
    ...(fields.risk ? ['--risk', fields.risk] : []),
    ...(fields.supersedes ? ['--supersedes', fields.supersedes] : []),
  ];
}

function eightOf(stem) {
  return Array.from({ length: 8 }, (_, index) => `${stem} ${index + 1}.`);
}

const MINIMAL_FIELDS = Object.freeze({
  title: 'docs(rules): point the PR rule at the central tool',
  why: ['The rule still described a workflow the gate denies, so it sent people down a path that fails.'],
  what: ['The pull-request rule now points at the central tool instead of an ad-hoc command.'],
  notVerified: ['no automated check covers rule prose - not run'],
});

const EVERY_FIELD = Object.freeze({
  title: 'refactor(pr-tool): compose pr bodies from declared fields',
  what: [
    'Pull-request descriptions are now built from declared fields instead of written by hand.',
    'The description opens with the change itself, so a reviewer reads what happened first.',
  ],
  why: [
    'Every path that opened a pull request invented its own format, so no two descriptions could be read the same way.',
    'receipt-cmd: node --test .claude/lib/git/tests/pr-format.test.mjs',
  ],
  risk: 'A pull request opened before this change no longer matches the expected shape.',
  verified: ['node --test .claude/lib/git/tests/pr-format.test.mjs - 0 fail'],
  notVerified: ['the enforcer on the fresh branch - not run'],
  supersedes: 'https://github.com/acme/widgets/pull/41',
  links: ['closes acme/widgets#12'],
});

const EIGHT_OF_EACH = Object.freeze({
  title: 'feat(pr-tool): carry eight values in every repeatable section',
  why: eightOf('Reason number'),
  what: eightOf('Change number'),
  verified: eightOf('a check that ran, number'),
  notVerified: eightOf('a check that did not run, number'),
  links: eightOf('related ticket number'),
  risk: 'Eight values of every list still render one section each.',
});

const RECEIPT_TOKEN_WHY = Object.freeze({
  ...MINIMAL_FIELDS,
  why: ['receipt-cmd: node --test .claude/lib/git/tests/pr-format.test.mjs'],
});

const PRINTED_FLAG_SETS = Object.freeze([
  ['the minimal flags', MINIMAL_FIELDS],
  ['every flag at once', EVERY_FIELD],
  ['eight values of every repeatable flag', EIGHT_OF_EACH],
  ['a why value beginning with a receipts line token', RECEIPT_TOKEN_WHY],
]);

test('checkPullRequest accepts every title and body pr-render prints', async () => {
  const format = await import('../pr-format.mjs');
  const tool = await import('../pr.mjs');
  for (const [label, raw] of PRINTED_FLAG_SETS) {
    const checked = format.checkPrFields(raw);
    assert.deepEqual(checked.problems, [], `${label}: the shared rules refused fields pr-render accepts`);
    const parsed = tool.parsePrToolArgv(renderArgvOf(raw));
    assert.equal(parsed.ok, true, `${label}: pr-render refused its own flags: ${parsed.error}`);
    assert.deepEqual(parsed.opts, checked.fields, `${label}: pr-render did not clean its flags through the shared rules`);
    const title = checked.fields.title;
    const body = format.renderPrCreateBody(checked.fields);
    const problems = format.checkPullRequest({ title, body });
    assert.ok(Array.isArray(problems), `${label}: the check returned no array`);
    assert.ok(Object.isFrozen(problems), `${label}: the problem array is not frozen`);
    assert.deepEqual(problems, [], `${label}: the check refused what pr-render printed: ${problems.join(' | ')}`);
  }
});

test('checkPullRequest refuses each way a title or body leaves the house format', async () => {
  const format = await import('../pr-format.mjs');
  const fields = format.checkPrFields(EVERY_FIELD).fields;
  const title = fields.title;
  const body = format.renderPrCreateBody(fields);
  assert.deepEqual(format.checkPullRequest({ title, body }), [], 'the valid body every mutation starts from must itself be accepted');
  const riskToken = format.checkPrFields({ ...EVERY_FIELD, risk: 'work-type: chore' }).fields;
  assert.deepEqual(format.checkPullRequest({ title, body: format.renderPrCreateBody(riskToken) }), [], 'a Risk value beginning with a receipts line token is exempt from the sentence rule');
  const [w1, w2] = EVERY_FIELD.what;
  const [y1, y2] = EVERY_FIELD.why;
  const [v1] = EVERY_FIELD.verified;
  const [n1] = EVERY_FIELD.notVerified;
  const risk = EVERY_FIELD.risk;
  const whatSection = `## What changed\n- ${w1}\n- ${w2}`;
  const whySection = `## Why\n${y1}\n${y2}`;
  const swap = (from, to) => {
    assert.ok(body.includes(from), `the valid body carries no ${JSON.stringify(from)} to mutate`);
    return body.replace(from, to);
  };
  const titleCases = [
    ['a title with a leading space', ` ${title}`, /title/],
    ['a title with a trailing space', `${title} `, /title/],
    ['a title with a trailing newline', `${title}${LF}`, /title/],
    ['a title with a tab', `${TAB}${title}`, /title/],
    ['a title that breaks the title pattern', 'Fix stuff', /title/],
    ['a missing title', undefined, /title/],
    ['a non-string title', 42, /title/],
  ];
  const bodyCases = [
    ['a missing body', undefined, /body/],
    ['a non-string body', [body], /body/],
    ['a body with a trailing newline', `${body}${LF}`, /body.*newline/],
    ['a blank line inside a section', swap(`${y1}\n${y2}`, `${y1}\n\n${y2}`), /## Why.*blank line/],
    ['two blank lines between sections', swap('\n\n## Why\n', '\n\n\n## Why\n'), /two blank lines/],
    ['an unknown heading', swap('\n## Risk\n', '\n## Risks\n'), /## Risks.*not a heading/],
    ['a section out of order', swap(`${whatSection}\n\n${whySection}`, `${whySection}\n\n${whatSection}`), /## What changed.*out of order/],
    ['a repeated section', `${body}\n\n## Links\n- closes acme/widgets#13`, /## Links.*more than once/],
    ['a missing What changed section', swap(`${whatSection}\n\n`, ''), /## What changed.*missing/],
    ['a missing Why section', swap(`${whySection}\n\n`, ''), /## Why.*missing/],
    ['a missing Verification section', swap(`## Verification\nVerified: ${v1}\nNot verified: ${n1}\n\n`, ''), /## Verification.*missing/],
    ['a What changed line without the leading hyphen and space', swap(`- ${w1}`, w1), /## What changed/],
    ['a value line with a trailing space', swap(`${y1}\n`, `${y1} \n`), /## Why/],
    ['a value line with a leading tab', swap(`${y1}\n`, `${TAB}${y1}\n`), /## Why/],
    ['a value line with a carriage return', swap(`${y1}\n`, `${y1}${CR}\n`), /## Why/],
    ['a value line with an escape character', swap(`${y1}\n`, `${y1}${ESC}\n`), /## Why/],
    ['a Verified line after a Not verified line', swap(`Verified: ${v1}\nNot verified: ${n1}`, `Not verified: ${n1}\nVerified: ${v1}`), /## Verification.*Verified: line follows/],
    ['a Risk section of more than one line', swap(`${risk}\n`, `${risk}\nA second risk line.\n`), /## Risk/],
    ['nine What changed values', swap(`- ${w1}\n- ${w2}\n`, `${Array.from({ length: 9 }, (_, index) => `- Change ${index + 1} is different now.`).join('\n')}\n`), /--what.*ceiling/],
    ['a value that breaks inertValue', swap(`- ${w1}`, '- See the <details> block.'), /--what/],
    ['a value over the 500-character cap', swap(`- ${w1}`, `- A${'y'.repeat(PR_VALUE_CAP - 1)}.`), /--what.*500/],
    ['a What changed value that is not a sentence', swap(`- ${w1}`, '- lowercase bullet.'), /--what.*uppercase/],
    ['a Why value that is not a sentence', swap(`${y1}\n`, 'lowercase reason.\n'), /--why.*uppercase/],
    ['a Risk value that is not a sentence', swap(`${risk}\n`, 'lowercase risk.\n'), /--risk.*uppercase/],
    ['a What changed value beginning with a receipts line token', swap(`- ${w1}`, '- test-removal: dropped a stale case'), /--what.*receipts line token/],
    ['a Supersedes line that is not the canonical url', swap('pull/41', 'pull/41/files'), /--supersedes/],
    ['a Supersedes line that is not a github pull-request url', swap('https://github.com/acme/widgets/pull/41', 'https://evil.example.com/acme/widgets/pull/41'), /--supersedes/],
  ];
  const cases = [
    ...titleCases.map(([label, badTitle, names]) => [label, { title: badTitle, body }, names]),
    ...bodyCases.map(([label, badBody, names]) => [label, { title, body: badBody }, names]),
  ];
  for (const [label, pullRequest, names] of cases) {
    const problems = format.checkPullRequest(pullRequest);
    assert.ok(Array.isArray(problems), `${label}: the check returned no array`);
    assert.ok(Object.isFrozen(problems), `${label}: the problem array is not frozen`);
    assert.ok(problems.length > 0, `${label}: the check accepted it`);
    for (const problem of problems) assert.equal(typeof problem, 'string', `${label}: a problem is not a string`);
    assert.match(problems.join(' | '), names, `${label}: no problem names the right field: ${problems.join(' | ')}`);
  }
  const source = readFileSync(PR_TOOL_SOURCE, 'utf8');
  for (const name of ['sentenceCheck', 'canonicalPrUrl', 'collectInertList']) {
    assert.doesNotMatch(source, new RegExp(`\\b${name}\\b`), `pr.mjs still carries ${name}; the field rules live once, in pr-format.mjs`);
  }
  assert.match(source, /import \{[^}]*\bcheckPrFields\b[^}]*\} from '\.\/pr-format\.mjs';/, 'pr.mjs does not import the shared field rules from pr-format.mjs');
});

test('round 2: hidden-text carriers and flag names are refused, and every problem is named', async () => {
  const { checkPrFields, checkPullRequest, renderPrCreateBody } = await import('../pr-format.mjs');
  const base = Object.freeze({
    title: 'feat(gate): add the format gate',
    why: ['Pull requests drifted from the house format.'],
    what: ['The gate refuses an off-format pull request.'],
    notVerified: ['live create call - not run'],
  });
  const at = (code) => String.fromCodePoint(code);
  const carriers = [
    ['a Unicode tag character', { what: [`Adds the gate${at(0xe0061)}.`] }],
    ['a variation selector', { what: [`Adds the gate${at(0xfe0f)}.`] }],
    ['a supplementary variation selector', { what: [`Adds the gate${at(0xe0100)}.`] }],
    ['a Mongolian variation selector', { what: [`Adds the gate${at(0x180b)}.`] }],
    ['a Khmer inherent vowel', { what: [`Adds${at(0x17b4)} the gate.`] }],
    ['a Hangul filler', { what: [`Adds${at(0x3164)}the gate.`] }],
    ['a combining grapheme joiner', { what: [`Adds the${at(0x034f)} gate.`] }],
    ['a format character outside the listed ranges', { what: [`Adds the gate${at(0x1d173)}.`] }],
    ['a private-use character', { what: [`Adds the gate${at(0xe000)}.`] }],
    ['an unassigned code point', { what: [`Adds the gate${at(0x0378)}.`] }],
    ['a numeric character reference', { what: ['Adds the gate&#xE0061;.'] }],
    ['a named character reference', { what: ['Adds the&ZeroWidthSpace;gate.'] }],
    ['a processing-instruction opener', { what: ['Adds the gate <?hidden?> today.'] }],
    ['a processing-instruction opener in a Verified value', { verified: ['the gate <?hidden?> ran'] }],
    ['a Links value that is a link reference definition', { links: ['[r]: https://example.invalid "hidden"'] }],
    ['a Links value that is a footnote definition', { links: ['[^1]: hidden'] }],
    ['a value that is a flag name', { verified: ['--link'] }],
    ['a value that is a flag name once trimmed', { verified: [' --link'] }],
  ];
  for (const [label, override] of carriers) {
    const checked = checkPrFields({ ...base, ...override });
    assert.ok(checked.problems.length > 0, `${label} was accepted`);
  }
  assert.deepEqual(checkPrFields({ ...base, links: ['https://github.com/o/r/pull/1'] }).problems, []);
  assert.deepEqual(checkPrFields({ ...base, links: ['closes acme/widgets#12'] }).problems, []);
  assert.deepEqual(checkPrFields({ ...base, what: ['Adds the gate & its tests.'] }).problems, []);
  const body = renderPrCreateBody(checkPrFields(base).fields);
  const broken = body.replace('## Why\n', '## Why\n\n').replace('Pull requests drifted', 'pull requests drifted');
  const problems = checkPullRequest({ title: 'Fix stuff', body: broken });
  assert.ok(problems.some((problem) => problem.startsWith('--title')), `the title problem is missing: ${problems.join(' | ')}`);
  assert.ok(problems.some((problem) => /blank line/i.test(problem)), `the blank-line problem is missing: ${problems.join(' | ')}`);
  assert.ok(problems.some((problem) => /--why/.test(problem) && /uppercase/.test(problem)), `the sentence problem is missing: ${problems.join(' | ')}`);
  const empty = checkPullRequest({ title: 'Fix stuff', body: '' });
  assert.ok(empty.some((problem) => problem.startsWith('--title')), `the title problem is missing beside an empty body: ${empty.join(' | ')}`);
  const untitled = checkPullRequest({ body: broken });
  assert.ok(untitled.some((problem) => /blank line/i.test(problem)), `the body problems are missing beside a missing title: ${untitled.join(' | ')}`);
});

test('round 2: a problem repeated on many distinct lines is reported once with its count', async () => {
  const { checkPullRequest } = await import('../pr-format.mjs');
  const count = 32768;
  const body = Array.from({ length: count }, (_, index) => `stray line ${index} ${'x'.repeat(120)}`).join(LF);
  const problems = checkPullRequest({ title: 'feat(gate): add the format gate', body });
  assert.ok(Object.isFrozen(problems), 'the problem array is not frozen');
  assert.ok(problems.length < 10, `expected fewer than ten problems, got ${problems.length}`);
  assert.ok(problems.some((problem) => problem.includes(String(count))), `no problem names the count ${count}: ${problems.join(' | ')}`);
  const quoted = problems.flatMap((problem) => problem.match(/"(?:[^"\\]|\\.)*"/g) ?? []).map((literal) => JSON.parse(literal));
  assert.ok(quoted.length > 0, 'no problem quotes a line, so the cut is not exercised');
  for (const line of quoted) {
    assert.ok([...line].length <= 80, `a problem quotes a line of ${[...line].length} characters: ${JSON.stringify(line)}`);
  }
});
