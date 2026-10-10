import { parsePrRef, validateRepoIdentity } from './merge-watch.mjs';

export const PR_TITLE_TYPES = Object.freeze(['feat', 'fix', 'refactor', 'docs', 'test', 'chore', 'perf', 'ci']);
export const PR_TITLE_PATTERN = /^(?=.{1,72}$)(feat|fix|refactor|docs|test|chore|perf|ci)(\([a-z0-9][a-z0-9-]{0,15}\))?: [a-z][\x20-\x7E]*[\x21-\x2D\x2F-\x7E]$/;
export const PR_TITLE_CAP = 72;
export const PR_VALUE_CAP = 500;
export const PR_MULTI_LIMITS = Object.freeze({
  '--why': 8,
  '--what': 8,
  '--verified': 8,
  '--not-verified': 8,
  '--link': 8,
});
export const PR_RENDER_FLAGS = Object.freeze(['--title', '--risk', '--supersedes', '--why', '--what', '--verified', '--not-verified', '--link']);

const CONTROL_CHARS = /[\x00-\x1F\x7F]/g;
const INVISIBLE_OR_BIDIRECTIONAL = /[\u0080-\u009F\u00AD\u034F\u061C\u115F\u1160\u180E\u200B-\u200F\u2028-\u202F\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0\uFFF9-\uFFFB\u{E0000}-\u{E007F}\u{E0100}-\u{E01EF}\p{Default_Ignorable_Code_Point}\p{Cf}\p{Co}\p{Cn}]/u;
const TAG_OPENER = /<[!?\/A-Za-z]/;
const CHARACTER_REFERENCE = /&(#[0-9]+|#[xX][0-9A-Fa-f]+|[A-Za-z][A-Za-z0-9]*);/;
const INLINE_CONSTRUCT = /\\|\]\(|!\[|\]:|\$/;
const ISSUE_REFERENCE = /^(?:(?:closes|fixes|resolves|refs) )?(?:[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)?#[0-9]+$/i;
const LINK_URL = /^https?:\/\/\S+$/;
const BLOCK_OPENER = /^[`~#>|]/;
const SETEXT_UNDERLINE = /^[=-]+$/;
const RESERVED_FIELD_PREFIX = /^(verified|not verified):/i;
const RESERVED_STRUCTURE_PREFIX = /^Supersedes /;
const FIELD_INDIRECTION_SIGIL = '@';

const WHY_HEADING = '## Why';
const WHAT_HEADING = '## What changed';
const VERIFICATION_HEADING = '## Verification';
const RISK_HEADING = '## Risk';
const LINKS_HEADING = '## Links';
const BULLET = '- ';
const VERIFIED_PREFIX = 'Verified: ';
const NOT_VERIFIED_PREFIX = 'Not verified: ';
const SECTION_SEPARATOR = '\n\n';
const LINE_SEPARATOR = '\n';

export const SUPERSEDES_PREFIX = 'Supersedes ';

const REQUIRED_HEADINGS = Object.freeze([WHAT_HEADING, WHY_HEADING, VERIFICATION_HEADING]);
const SECTION_ORDER = Object.freeze([WHAT_HEADING, WHY_HEADING, RISK_HEADING, VERIFICATION_HEADING, LINKS_HEADING]);

export const RECEIPT_LINE_TOKENS = Object.freeze([
  'work-type:',
  'test-removal:',
  'receipt:',
  'receipt-cmd:',
  'receipt-lock:',
]);

const SENTENCE_TERMINATORS = '.?!';
const PR_URL_HOST = 'https://github.com/';
const QUOTE_CAP = 80;
const QUOTE_CUT_MARK = '...';
const QUOTED_LINE = /"(?:[^"\\]|\\.)*"/;
const ESCAPED_UNIT = /\\u[0-9A-Fa-f]{4}|\\[\s\S]|[\uD800-\uDBFF][\uDC00-\uDFFF]|[\s\S]/g;
const ESCAPED_UNIT_MAX = 6;
const MERGED_QUOTE_LIMIT = 3;

export const PR_VALUE_REFUSALS = 'something a pull-request document may not carry: a leading field-indirection sigil, an invisible, bidirectional, format, private-use or unassigned character such as a Unicode tag character or a variation selector, an html tag or processing-instruction opener, a character reference such as &#x...; or &name;, a backslash, ](, ![, ]: or any $, which open an escape, a link, an image, a definition or math that GitHub renders without its text, a leading markdown block opener, a setext underline, or a leading Verified:, Not verified: or Supersedes';

function quote(value) {
  const escaped = JSON.stringify(value);
  const inner = escaped.slice(1, -1);
  if (inner.length <= QUOTE_CAP) return escaped;
  const room = QUOTE_CAP - QUOTE_CUT_MARK.length;
  const ends = [...inner.slice(0, room + ESCAPED_UNIT_MAX).matchAll(ESCAPED_UNIT)].map((unit) => unit.index + unit[0].length);
  const end = ends.findLast((at) => at <= room) ?? 0;
  return `"${inner.slice(0, end)}${QUOTE_CUT_MARK}"`;
}

export function isSentenceShaped(value) {
  if (typeof value !== 'string' || value.length === 0) return false;
  const characters = [...value];
  const first = characters[0];
  if (first === first.toLowerCase() || first !== first.toUpperCase()) return false;
  return SENTENCE_TERMINATORS.includes(characters[characters.length - 1]);
}

export function carriesReceiptLineToken(value) {
  if (typeof value !== 'string') return false;
  return RECEIPT_LINE_TOKENS.some((token) => value.startsWith(token));
}

function canonicalValue(value) {
  return value.replace(CONTROL_CHARS, '').trim();
}

export function inertValue(value, cap) {
  if (typeof value !== 'string') return null;
  if (!Number.isInteger(cap) || cap <= 0) return null;
  const stripped = canonicalValue(value);
  if (stripped.length === 0) return null;
  if (stripped.length > cap) return null;
  if (stripped.startsWith(FIELD_INDIRECTION_SIGIL)) return null;
  if (INVISIBLE_OR_BIDIRECTIONAL.test(stripped)) return null;
  if (TAG_OPENER.test(stripped)) return null;
  if (CHARACTER_REFERENCE.test(stripped)) return null;
  if (INLINE_CONSTRUCT.test(stripped)) return null;
  if (BLOCK_OPENER.test(stripped)) return null;
  if (SETEXT_UNDERLINE.test(stripped)) return null;
  if (RESERVED_FIELD_PREFIX.test(stripped)) return null;
  if (RESERVED_STRUCTURE_PREFIX.test(stripped)) return null;
  return stripped;
}

function textList(values) {
  if (!Array.isArray(values)) return [];
  return values.filter((value) => typeof value === 'string' && value.length > 0);
}

function text(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function section(heading, lines) {
  return [heading, ...lines].join(LINE_SEPARATOR);
}

function verificationLines(opts) {
  return [
    ...textList(opts.verified).map((value) => `${VERIFIED_PREFIX}${value}`),
    ...textList(opts.notVerified).map((value) => `${NOT_VERIFIED_PREFIX}${value}`),
  ];
}

function linkLines(opts) {
  const supersedes = text(opts.supersedes);
  return [
    ...(supersedes === null ? [] : [`${SUPERSEDES_PREFIX}${supersedes}`]),
    ...textList(opts.links).map((value) => `${BULLET}${value}`),
  ];
}

export function renderPrCreateBody(opts) {
  const fields = opts === null || typeof opts !== 'object' || Array.isArray(opts) ? {} : opts;
  const risk = text(fields.risk);
  const sections = [
    [WHAT_HEADING, textList(fields.what).map((value) => `${BULLET}${value}`)],
    [WHY_HEADING, textList(fields.why)],
    [RISK_HEADING, risk === null ? [] : [risk]],
    [VERIFICATION_HEADING, verificationLines(fields)],
    [LINKS_HEADING, linkLines(fields)],
  ];
  return sections
    .filter(([, lines]) => lines.length > 0)
    .map(([heading, lines]) => section(heading, lines))
    .join(SECTION_SEPARATOR);
}

const LIST_FIELDS = Object.freeze([
  Object.freeze({ field: 'why', flag: '--why', heading: WHY_HEADING }),
  Object.freeze({ field: 'what', flag: '--what', heading: WHAT_HEADING }),
  Object.freeze({ field: 'verified', flag: '--verified', heading: VERIFICATION_HEADING }),
  Object.freeze({ field: 'notVerified', flag: '--not-verified', heading: VERIFICATION_HEADING }),
  Object.freeze({ field: 'links', flag: '--link', heading: LINKS_HEADING, value: linkValue, refusal: linkRefusal }),
]);

const REQUIRED_LIST_FLAGS = Object.freeze(['--why', '--what']);
const SENTENCE_FLAGS = Object.freeze(['--why', '--what', '--risk']);

function fieldValue(raw, cap) {
  const value = inertValue(raw, cap);
  if (value === null || PR_RENDER_FLAGS.includes(value)) return null;
  return value;
}

function linkValue(raw, cap) {
  if (typeof raw !== 'string') return null;
  const stripped = canonicalValue(raw);
  if (stripped.length <= cap && ISSUE_REFERENCE.test(stripped)) return stripped;
  if (LINK_URL.test(stripped)) return fieldValue(raw, cap);
  return null;
}

function valueProblem(flag, cap) {
  return `${flag}: a value is empty, over the ${cap}-character cap, a pr-render flag name, or carries ${PR_VALUE_REFUSALS}`;
}

function linkRefusal(flag, cap, raw) {
  const received = typeof raw === 'string' ? quote(raw) : JSON.stringify(raw);
  return `${flag}: a value must be either an issue reference of at most ${cap} characters, an optional closes, fixes, resolves or refs and a space, then an optional OWNER/REPO, then # and a number, such as closes OWNER/REPO#12 or #12, or an http or https url with no space in it that carries nothing else ${flag} refuses; received ${received}`;
}

function sentenceProblem(flag, value) {
  if (!SENTENCE_FLAGS.includes(flag)) return null;
  if (carriesReceiptLineToken(value)) {
    if (flag !== '--what') return null;
    return "--what: a value may not begin with a receipts line token; a bulleted line cannot satisfy the enforcer's line-start grammar. Pass it as --why instead.";
  }
  if (isSentenceShaped(value)) return null;
  return `${flag}: a value must begin with an uppercase letter and end with . ? or !, so the body reads as sentences; received ${quote(value)}`;
}

function canonicalPrUrl(candidate) {
  const ref = parsePrRef(candidate);
  if (ref === null || !validateRepoIdentity(ref.ownerRepo)) return null;
  const canonical = `${PR_URL_HOST}${ref.ownerRepo}/pull/${ref.prNumber}`;
  if (inertValue(canonical, PR_VALUE_CAP - SUPERSEDES_PREFIX.length) === null) return null;
  return canonical;
}

function checkTitle(raw) {
  const title = fieldValue(raw, PR_TITLE_CAP);
  if (title === null) return Object.freeze({ title: null, problem: valueProblem('--title', PR_TITLE_CAP) });
  if (!PR_TITLE_PATTERN.test(title)) {
    return Object.freeze({
      title: null,
      problem: `--title: ${quote(title)} is not a conventional-commits title of the form <type>(<scope>): <lowercase imperative summary>; the types are ${PR_TITLE_TYPES.join(' ')}, the scope is at most 16 lowercase characters, and the whole title is at most ${PR_TITLE_CAP} characters with no trailing period`,
    });
  }
  return Object.freeze({ title, problem: null });
}

function checkList(raws, entry) {
  const { flag } = entry;
  const list = raws === undefined || raws === null ? [] : raws;
  if (!Array.isArray(list)) return Object.freeze({ values: Object.freeze([]), problems: Object.freeze([`${flag}: expected a list of values`]) });
  if (list.length === 0 && REQUIRED_LIST_FLAGS.includes(flag)) {
    return Object.freeze({ values: Object.freeze([]), problems: Object.freeze([`${flag}: at least one value is required`]) });
  }
  const ceiling = PR_MULTI_LIMITS[flag];
  const ceilingProblems = list.length > ceiling ? [`${flag}: ${list.length} values exceed the ${ceiling}-value ceiling`] : [];
  const valueOf = entry.value ?? fieldValue;
  const values = list.map((raw) => valueOf(raw, PR_VALUE_CAP));
  const valueProblems = values.map((value, index) => {
    if (value !== null) return sentenceProblem(flag, value);
    return entry.refusal === undefined ? valueProblem(flag, PR_VALUE_CAP) : entry.refusal(flag, PR_VALUE_CAP, list[index]);
  });
  const problems = [...ceilingProblems, ...valueProblems.filter((problem) => problem !== null)];
  return Object.freeze({ values: Object.freeze(ceilingProblems.length > 0 ? [] : values), problems: Object.freeze(problems) });
}

function checkRisk(raw) {
  if (raw === undefined || raw === null) return Object.freeze({ risk: null, problem: null });
  const risk = fieldValue(raw, PR_VALUE_CAP);
  if (risk === null) return Object.freeze({ risk: null, problem: valueProblem('--risk', PR_VALUE_CAP) });
  return Object.freeze({ risk, problem: sentenceProblem('--risk', risk) });
}

function checkSupersedes(raw) {
  if (raw === undefined || raw === null) return Object.freeze({ supersedes: null, problem: null });
  const supersedes = canonicalPrUrl(raw);
  if (supersedes === null) {
    return Object.freeze({
      supersedes: null,
      problem: `--supersedes: the Supersedes value ${typeof raw === 'string' ? quote(raw) : JSON.stringify(raw)} is not a github pull-request url that composes an inert link line within the ${PR_VALUE_CAP}-character cap`,
    });
  }
  return Object.freeze({ supersedes, problem: null });
}

function checkBodyFields(raw) {
  const lists = LIST_FIELDS.map((entry) => [entry.field, checkList(raw[entry.field], entry)]);
  const listed = Object.fromEntries(lists.map(([field, checked]) => [field, checked.values]));
  const risk = checkRisk(raw.risk);
  const supersedes = checkSupersedes(raw.supersedes);
  const statements = [raw.verified, raw.notVerified].reduce((count, list) => count + (Array.isArray(list) ? list.length : 0), 0);
  const problems = [
    ...lists.flatMap(([, checked]) => checked.problems),
    statements === 0
      ? 'the verification section needs at least one --verified or --not-verified value; a check that was not run is stated as --not-verified "<thing> - not run", never left out'
      : null,
    risk.problem,
    supersedes.problem,
  ].filter((problem) => problem !== null);
  if (problems.length > 0) return Object.freeze({ fields: null, problems: Object.freeze(problems) });
  return Object.freeze({
    fields: Object.freeze({
      why: listed.why,
      what: listed.what,
      verified: listed.verified,
      notVerified: listed.notVerified,
      risk: risk.risk,
      supersedes: supersedes.supersedes,
      links: listed.links,
    }),
    problems: Object.freeze([]),
  });
}

export function checkPrFields(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return Object.freeze({ fields: null, problems: Object.freeze(['fields: expected an object of pull-request fields']) });
  }
  const title = checkTitle(raw.title);
  const body = checkBodyFields(raw);
  const problems = [title.problem, ...body.problems].filter((problem) => problem !== null);
  if (problems.length > 0) return Object.freeze({ fields: null, problems: Object.freeze(problems) });
  return Object.freeze({ fields: Object.freeze({ title: title.title, ...body.fields }), problems: Object.freeze([]) });
}

function blankLineProblem(lines, index, current) {
  if (index === lines.length - 1) return 'body: ends with a newline; pr-render ends the body with its last line';
  if (index === 0) return `body: begins with a blank line; pr-render begins the body with the ${WHAT_HEADING} heading`;
  if (lines[index - 1] === '') return 'body: holds two blank lines in a row; pr-render separates sections with exactly one blank line';
  if (lines[index + 1] !== '' && !lines[index + 1].startsWith('#')) {
    return `${current}: holds a blank line inside the section; pr-render writes a section's lines with no blank line between them`;
  }
  return null;
}

function headingProblems(lines, at, firstAt) {
  const line = lines[at];
  if (!SECTION_ORDER.includes(line)) {
    return [`body: ${quote(line)} is not a heading pr-render writes; its headings are ${SECTION_ORDER.join(', ')}`];
  }
  const order = SECTION_ORDER.indexOf(line);
  const repeated = firstAt.get(line) !== at;
  const outOfOrder = !repeated && SECTION_ORDER.slice(order + 1).some((later) => firstAt.has(later) && firstAt.get(later) < at);
  return [
    ...(at > 0 && lines[at - 1] !== '' ? [`${line}: the heading does not follow a blank line; pr-render separates sections with exactly one blank line`] : []),
    ...(repeated ? [`${line}: the section appears more than once`] : []),
    ...(outOfOrder ? [`${line}: the section is out of order; pr-render writes ${SECTION_ORDER.join(', ')} in that order`] : []),
  ];
}

function segmentProblems(lines, segment, firstAt) {
  const { at, held } = segment;
  const heading = at === -1 ? null : lines[at];
  const current = heading !== null && SECTION_ORDER.includes(heading) ? heading : 'body';
  const lineProblems = held.flatMap((line, offset) => {
    if (line === '') {
      const problem = blankLineProblem(lines, at + 1 + offset, current);
      return problem === null ? [] : [problem];
    }
    return heading === null ? [`body: the line ${quote(line)} sits outside any section`] : [];
  });
  return [...(heading === null ? [] : headingProblems(lines, at, firstAt)), ...lineProblems];
}

function readSections(body) {
  const lines = body.split(LINE_SEPARATOR);
  const headings = lines.flatMap((line, index) => (line.startsWith('#') ? [index] : []));
  const known = headings.filter((at) => SECTION_ORDER.includes(lines[at]));
  const firstAt = new Map([...Map.groupBy(known, (at) => lines[at])].map(([heading, positions]) => [heading, positions[0]]));
  const segments = [-1, ...headings].map((at, index) => Object.freeze({ at, held: lines.slice(at + 1, headings[index] ?? lines.length) }));
  const problems = segments.flatMap((segment) => segmentProblems(lines, segment, firstAt));
  const sections = Object.freeze(new Map(segments
    .filter(({ at }) => at !== -1 && firstAt.get(lines[at]) === at)
    .map(({ at, held }) => [lines[at], Object.freeze(held.filter((line) => line !== ''))])));
  const missing = REQUIRED_HEADINGS.filter((heading) => !sections.has(heading)).map((heading) => `${heading}: the required section is missing`);
  const empty = [...sections].filter(([, held]) => held.length === 0).map(([heading]) => `${heading}: the section holds no line`);
  return Object.freeze({ sections, problems: Object.freeze([...problems, ...missing, ...empty]) });
}

function readPrefixed(lines, heading, prefix) {
  const values = lines.filter((line) => line.startsWith(prefix)).map((line) => line.slice(prefix.length));
  const problems = lines
    .filter((line) => !line.startsWith(prefix))
    .map((line) => `${heading}: the line ${quote(line)} does not begin with ${JSON.stringify(prefix)}`);
  return Object.freeze({ values: Object.freeze(values), problems: Object.freeze(problems) });
}

function readVerification(lines) {
  const firstNotVerified = lines.findIndex((line) => line.startsWith(NOT_VERIFIED_PREFIX));
  const verified = lines.filter((line) => line.startsWith(VERIFIED_PREFIX)).map((line) => line.slice(VERIFIED_PREFIX.length));
  const notVerified = lines.filter((line) => line.startsWith(NOT_VERIFIED_PREFIX)).map((line) => line.slice(NOT_VERIFIED_PREFIX.length));
  const problems = lines.flatMap((line, index) => {
    if (line.startsWith(VERIFIED_PREFIX)) {
      return firstNotVerified !== -1 && firstNotVerified < index
        ? [`${VERIFICATION_HEADING}: a Verified: line follows a Not verified: line; pr-render writes every Verified: line first`]
        : [];
    }
    if (line.startsWith(NOT_VERIFIED_PREFIX)) return [];
    return [`${VERIFICATION_HEADING}: the line ${quote(line)} begins with neither ${JSON.stringify(VERIFIED_PREFIX)} nor ${JSON.stringify(NOT_VERIFIED_PREFIX)}`];
  });
  return Object.freeze({ verified: Object.freeze(verified), notVerified: Object.freeze(notVerified), problems: Object.freeze(problems) });
}

function readLinks(lines) {
  const supersedesAt = lines.findIndex((line) => line.startsWith(SUPERSEDES_PREFIX));
  const misplaced = lines.filter((line, index) => line.startsWith(SUPERSEDES_PREFIX) && index !== 0);
  const rest = readPrefixed(lines.filter((line) => !line.startsWith(SUPERSEDES_PREFIX)), LINKS_HEADING, BULLET);
  return Object.freeze({
    supersedes: supersedesAt === 0 ? lines[0].slice(SUPERSEDES_PREFIX.length) : null,
    links: rest.values,
    problems: [
      ...misplaced.map((line) => `${LINKS_HEADING}: the Supersedes line ${quote(line)} is not the section's first line, and pr-render writes at most one, first`),
      ...rest.problems,
    ],
  });
}

function readRisk(lines) {
  if (lines === undefined) return Object.freeze({ risk: null, problems: [] });
  if (lines.length > 1) return Object.freeze({ risk: null, problems: [`${RISK_HEADING}: the section holds ${lines.length} lines; pr-render writes exactly one`] });
  return Object.freeze({ risk: lines.length === 1 ? lines[0] : null, problems: [] });
}

function splitBody(body) {
  const read = readSections(body);
  const held = (heading) => read.sections.get(heading) ?? [];
  const what = readPrefixed(held(WHAT_HEADING), WHAT_HEADING, BULLET);
  const verification = readVerification(held(VERIFICATION_HEADING));
  const links = readLinks(held(LINKS_HEADING));
  const risk = readRisk(read.sections.get(RISK_HEADING));
  return Object.freeze({
    fields: Object.freeze({
      why: Object.freeze([...held(WHY_HEADING)]),
      what: Object.freeze(what.values),
      verified: Object.freeze(verification.verified),
      notVerified: Object.freeze(verification.notVerified),
      risk: risk.risk,
      supersedes: links.supersedes,
      links: Object.freeze(links.links),
    }),
    problems: Object.freeze([...read.problems, ...what.problems, ...verification.problems, ...links.problems, ...risk.problems]),
  });
}

function drifts(value) {
  return typeof value === 'string' && canonicalValue(value) !== value;
}

function titleDrift(title) {
  if (!drifts(title)) return [];
  return [`--title: the title ${quote(title)} carries surrounding whitespace or a control character, so it is not what pr-render prints`];
}

function fieldDrift(raw) {
  const lists = LIST_FIELDS.flatMap(({ field, flag, heading }) => raw[field]
    .filter(drifts)
    .map((value) => `${heading} (${flag}): the value ${quote(value)} carries surrounding whitespace or a control character, so it is not what pr-render prints`));
  const risk = drifts(raw.risk)
    ? [`${RISK_HEADING} (--risk): the value ${quote(raw.risk)} carries surrounding whitespace or a control character, so it is not what pr-render prints`]
    : [];
  const canonical = typeof raw.supersedes === 'string' ? canonicalPrUrl(raw.supersedes) : null;
  const supersedes = canonical !== null && canonical !== raw.supersedes
    ? [`${LINKS_HEADING} (--supersedes): the Supersedes line names ${quote(raw.supersedes)}, not the canonical pull-request url ${canonical}`]
    : [];
  return [...lists, ...risk, ...supersedes];
}

function mergedProblem(group) {
  const [first] = group;
  if (group.length === 1) return first;
  const others = group
    .slice(1)
    .map((problem) => problem.match(QUOTED_LINE))
    .filter((found) => found !== null)
    .slice(0, MERGED_QUOTE_LIMIT - 1)
    .map((found) => found[0]);
  const among = others.length > 0 ? `, among them ${others.join(' and ')}` : '';
  return `${first}; the same problem holds on ${group.length} lines in all${among}`;
}

function mergeProblems(problems) {
  const groups = Map.groupBy(problems, (problem) => problem.replace(QUOTED_LINE, ''));
  return Object.freeze([...groups.values()].map(mergedProblem));
}

function titleProblems(title) {
  if (typeof title !== 'string') return ['title: missing or not a string'];
  const titled = checkTitle(title);
  return [...(titled.problem === null ? [] : [titled.problem]), ...titleDrift(title)];
}

function bodyProblems(body) {
  if (typeof body !== 'string') return ['body: missing or not a string'];
  if (body.length === 0) return [`body: empty; pr-render begins the body with the ${WHAT_HEADING} heading`];
  const split = splitBody(body);
  const checked = checkBodyFields(split.fields);
  const found = [...split.problems, ...checked.problems, ...fieldDrift(split.fields)];
  if (found.length > 0) return found;
  if (renderPrCreateBody(checked.fields) !== body) {
    return ['body: does not re-render byte for byte from its own fields, so it is not what pr-render prints'];
  }
  return [];
}

export function checkPullRequest(pullRequest) {
  const given = pullRequest !== null && typeof pullRequest === 'object' && !Array.isArray(pullRequest) ? pullRequest : {};
  const { title, body } = given;
  return mergeProblems([...titleProblems(title), ...bodyProblems(body)]);
}
