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

const CONTROL_CHARS = /[\x00-\x1F\x7F]/g;
const INVISIBLE_OR_BIDIRECTIONAL = /[\u0080-\u009F\u00AD\u061C\u180E\u200B-\u200F\u2028-\u202F\u2060-\u206F\uFEFF\uFFF9-\uFFFB]/;
const TAG_OPENER = /<[!\/A-Za-z]/;
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

export function inertValue(value, cap) {
  if (typeof value !== 'string') return null;
  if (!Number.isInteger(cap) || cap <= 0) return null;
  const stripped = value.replace(CONTROL_CHARS, '').trim();
  if (stripped.length === 0) return null;
  if (stripped.length > cap) return null;
  if (stripped.startsWith(FIELD_INDIRECTION_SIGIL)) return null;
  if (INVISIBLE_OR_BIDIRECTIONAL.test(stripped)) return null;
  if (TAG_OPENER.test(stripped)) return null;
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
  const lines = [];
  const supersedes = text(opts.supersedes);
  if (supersedes !== null) lines.push(`${SUPERSEDES_PREFIX}${supersedes}`);
  return [...lines, ...textList(opts.links).map((value) => `${BULLET}${value}`)];
}

export function renderPrCreateBody(opts) {
  const fields = opts === null || typeof opts !== 'object' || Array.isArray(opts) ? {} : opts;
  const blocks = [];
  const what = textList(fields.what);
  if (what.length > 0) blocks.push(section(WHAT_HEADING, what.map((value) => `${BULLET}${value}`)));
  const why = textList(fields.why);
  if (why.length > 0) blocks.push(section(WHY_HEADING, why));
  const risk = text(fields.risk);
  if (risk !== null) blocks.push(section(RISK_HEADING, [risk]));
  const verification = verificationLines(fields);
  if (verification.length > 0) blocks.push(section(VERIFICATION_HEADING, verification));
  const links = linkLines(fields);
  if (links.length > 0) blocks.push(section(LINKS_HEADING, links));
  return blocks.join(SECTION_SEPARATOR);
}

const LIST_FIELDS = Object.freeze([
  Object.freeze({ field: 'why', flag: '--why', heading: WHY_HEADING }),
  Object.freeze({ field: 'what', flag: '--what', heading: WHAT_HEADING }),
  Object.freeze({ field: 'verified', flag: '--verified', heading: VERIFICATION_HEADING }),
  Object.freeze({ field: 'notVerified', flag: '--not-verified', heading: VERIFICATION_HEADING }),
  Object.freeze({ field: 'links', flag: '--link', heading: LINKS_HEADING }),
]);

const REQUIRED_LIST_FLAGS = Object.freeze(['--why', '--what']);
const SENTENCE_FLAGS = Object.freeze(['--why', '--what', '--risk']);

function valueProblem(flag, cap) {
  return `${flag}: a value is empty, over the ${cap}-character cap, or carries something a pull-request document may not carry: a leading field-indirection sigil, an invisible or bidirectional character, an html tag opener, a leading markdown block opener, a setext underline, or a leading Verified:, Not verified: or Supersedes`;
}

function sentenceProblem(flag, value) {
  if (!SENTENCE_FLAGS.includes(flag)) return null;
  if (carriesReceiptLineToken(value)) {
    if (flag !== '--what') return null;
    return "--what: a value may not begin with a receipts line token; a bulleted line cannot satisfy the enforcer's line-start grammar. Pass it as --why instead.";
  }
  if (isSentenceShaped(value)) return null;
  return `${flag}: a value must begin with an uppercase letter and end with . ? or !, so the body reads as sentences; received ${JSON.stringify(value)}`;
}

function canonicalPrUrl(candidate) {
  const ref = parsePrRef(candidate);
  if (ref === null || !validateRepoIdentity(ref.ownerRepo)) return null;
  const canonical = `${PR_URL_HOST}${ref.ownerRepo}/pull/${ref.prNumber}`;
  if (inertValue(canonical, PR_VALUE_CAP - SUPERSEDES_PREFIX.length) === null) return null;
  return canonical;
}

function checkTitle(raw) {
  const title = inertValue(raw, PR_TITLE_CAP);
  if (title === null) return Object.freeze({ title: null, problem: valueProblem('--title', PR_TITLE_CAP) });
  if (!PR_TITLE_PATTERN.test(title)) {
    return Object.freeze({
      title: null,
      problem: `--title: ${JSON.stringify(title)} is not a conventional-commits title of the form <type>(<scope>): <lowercase imperative summary>; the types are ${PR_TITLE_TYPES.join(' ')}, the scope is at most 16 lowercase characters, and the whole title is at most ${PR_TITLE_CAP} characters with no trailing period`,
    });
  }
  return Object.freeze({ title, problem: null });
}

function checkList(raws, flag) {
  const list = raws === undefined || raws === null ? [] : raws;
  if (!Array.isArray(list)) return Object.freeze({ values: Object.freeze([]), problems: Object.freeze([`${flag}: expected a list of values`]) });
  const ceiling = PR_MULTI_LIMITS[flag];
  if (list.length > ceiling) {
    return Object.freeze({ values: Object.freeze([]), problems: Object.freeze([`${flag}: ${list.length} values exceed the ${ceiling}-value ceiling`]) });
  }
  if (list.length === 0 && REQUIRED_LIST_FLAGS.includes(flag)) {
    return Object.freeze({ values: Object.freeze([]), problems: Object.freeze([`${flag}: at least one value is required`]) });
  }
  const values = list.map((raw) => inertValue(raw, PR_VALUE_CAP));
  const problems = values.map((value) => (value === null ? valueProblem(flag, PR_VALUE_CAP) : sentenceProblem(flag, value)));
  return Object.freeze({ values: Object.freeze(values), problems: Object.freeze(problems.filter((problem) => problem !== null)) });
}

function checkRisk(raw) {
  if (raw === undefined || raw === null) return Object.freeze({ risk: null, problem: null });
  const risk = inertValue(raw, PR_VALUE_CAP);
  if (risk === null) return Object.freeze({ risk: null, problem: valueProblem('--risk', PR_VALUE_CAP) });
  return Object.freeze({ risk, problem: sentenceProblem('--risk', risk) });
}

function checkSupersedes(raw) {
  if (raw === undefined || raw === null) return Object.freeze({ supersedes: null, problem: null });
  const supersedes = canonicalPrUrl(raw);
  if (supersedes === null) {
    return Object.freeze({
      supersedes: null,
      problem: `--supersedes: the Supersedes value ${JSON.stringify(raw)} is not a github pull-request url that composes an inert link line within the ${PR_VALUE_CAP}-character cap`,
    });
  }
  return Object.freeze({ supersedes, problem: null });
}

export function checkPrFields(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return Object.freeze({ fields: null, problems: Object.freeze(['fields: expected an object of pull-request fields']) });
  }
  const title = checkTitle(raw.title);
  const lists = LIST_FIELDS.map(({ field, flag }) => [field, checkList(raw[field], flag)]);
  const listed = Object.fromEntries(lists.map(([field, checked]) => [field, checked.values]));
  const risk = checkRisk(raw.risk);
  const supersedes = checkSupersedes(raw.supersedes);
  const statements = [raw.verified, raw.notVerified].reduce((count, list) => count + (Array.isArray(list) ? list.length : 0), 0);
  const problems = [
    title.problem,
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
      title: title.title,
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

function readSections(body) {
  const problems = [];
  const sections = new Map();
  const lines = body.split(LINE_SEPARATOR);
  let current = 'body';
  let target = null;
  let rank = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === '') {
      if (index === lines.length - 1) problems.push('body: ends with a newline; pr-render ends the body with its last line');
      else if (index === 0) problems.push(`body: begins with a blank line; pr-render begins the body with the ${WHAT_HEADING} heading`);
      else if (lines[index - 1] === '') problems.push('body: holds two blank lines in a row; pr-render separates sections with exactly one blank line');
      else if (lines[index + 1] !== '' && !lines[index + 1].startsWith('#')) {
        problems.push(`${current}: holds a blank line inside the section; pr-render writes a section's lines with no blank line between them`);
      }
      continue;
    }
    if (SECTION_ORDER.includes(line)) {
      if (index > 0 && lines[index - 1] !== '') problems.push(`${line}: the heading does not follow a blank line; pr-render separates sections with exactly one blank line`);
      const order = SECTION_ORDER.indexOf(line);
      if (sections.has(line)) problems.push(`${line}: the section appears more than once`);
      else if (order < rank) problems.push(`${line}: the section is out of order; pr-render writes ${SECTION_ORDER.join(', ')} in that order`);
      rank = Math.max(rank, order);
      current = line;
      const fresh = [];
      if (!sections.has(line)) sections.set(line, fresh);
      target = fresh;
      continue;
    }
    if (line.startsWith('#')) {
      problems.push(`body: ${JSON.stringify(line)} is not a heading pr-render writes; its headings are ${SECTION_ORDER.join(', ')}`);
      current = 'body';
      target = [];
      continue;
    }
    if (target === null) {
      problems.push(`body: the line ${JSON.stringify(line)} sits outside any section`);
      continue;
    }
    target.push(line);
  }
  const missing = REQUIRED_HEADINGS.filter((heading) => !sections.has(heading)).map((heading) => `${heading}: the required section is missing`);
  const empty = [...sections].filter(([, held]) => held.length === 0).map(([heading]) => `${heading}: the section holds no line`);
  return Object.freeze({ sections, problems: Object.freeze([...problems, ...missing, ...empty]) });
}

function readPrefixed(lines, heading, prefix) {
  const values = lines.filter((line) => line.startsWith(prefix)).map((line) => line.slice(prefix.length));
  const problems = lines
    .filter((line) => !line.startsWith(prefix))
    .map((line) => `${heading}: the line ${JSON.stringify(line)} does not begin with ${JSON.stringify(prefix)}`);
  return Object.freeze({ values, problems });
}

function readVerification(lines) {
  const problems = [];
  const verified = [];
  const notVerified = [];
  for (const line of lines) {
    if (line.startsWith(VERIFIED_PREFIX)) {
      if (notVerified.length > 0) problems.push(`${VERIFICATION_HEADING}: a Verified: line follows a Not verified: line; pr-render writes every Verified: line first`);
      verified.push(line.slice(VERIFIED_PREFIX.length));
    } else if (line.startsWith(NOT_VERIFIED_PREFIX)) {
      notVerified.push(line.slice(NOT_VERIFIED_PREFIX.length));
    } else {
      problems.push(`${VERIFICATION_HEADING}: the line ${JSON.stringify(line)} begins with neither ${JSON.stringify(VERIFIED_PREFIX)} nor ${JSON.stringify(NOT_VERIFIED_PREFIX)}`);
    }
  }
  return Object.freeze({ verified, notVerified, problems });
}

function readLinks(lines) {
  const supersedesAt = lines.findIndex((line) => line.startsWith(SUPERSEDES_PREFIX));
  const misplaced = lines.filter((line, index) => line.startsWith(SUPERSEDES_PREFIX) && index !== 0);
  const rest = readPrefixed(lines.filter((line) => !line.startsWith(SUPERSEDES_PREFIX)), LINKS_HEADING, BULLET);
  return Object.freeze({
    supersedes: supersedesAt === 0 ? lines[0].slice(SUPERSEDES_PREFIX.length) : null,
    links: rest.values,
    problems: [
      ...misplaced.map((line) => `${LINKS_HEADING}: the Supersedes line ${JSON.stringify(line)} is not the section's first line, and pr-render writes at most one, first`),
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

function titleDrift(title) {
  const cleaned = inertValue(title, PR_TITLE_CAP);
  if (cleaned === null || cleaned === title) return [];
  return [`--title: the title ${JSON.stringify(title)} carries surrounding whitespace or a control character, so it is not what pr-render prints`];
}

function fieldDrift(raw, cleaned) {
  const lists = LIST_FIELDS.flatMap(({ field, flag, heading }) => raw[field]
    .filter((value, index) => cleaned[field][index] !== value)
    .map((value) => `${heading} (${flag}): the value ${JSON.stringify(value)} carries surrounding whitespace or a control character, so it is not what pr-render prints`));
  const risk = raw.risk !== cleaned.risk
    ? [`${RISK_HEADING} (--risk): the value ${JSON.stringify(raw.risk)} carries surrounding whitespace or a control character, so it is not what pr-render prints`]
    : [];
  const supersedes = raw.supersedes !== cleaned.supersedes
    ? [`${LINKS_HEADING} (--supersedes): the Supersedes line names ${JSON.stringify(raw.supersedes)}, not the canonical pull-request url ${cleaned.supersedes}`]
    : [];
  return [...lists, ...risk, ...supersedes];
}

export function checkPullRequest(pullRequest) {
  const given = pullRequest !== null && typeof pullRequest === 'object' && !Array.isArray(pullRequest) ? pullRequest : {};
  const { title, body } = given;
  const missing = [
    typeof title === 'string' ? null : 'title: missing or not a string',
    typeof body === 'string' ? null : 'body: missing or not a string',
  ].filter((problem) => problem !== null);
  if (missing.length > 0) return Object.freeze(missing);
  if (body.length === 0) return Object.freeze([...titleDrift(title), `body: empty; pr-render begins the body with the ${WHAT_HEADING} heading`]);
  const split = splitBody(body);
  if (split.problems.length > 0) {
    const titled = checkTitle(title);
    return Object.freeze([...(titled.problem === null ? [] : [titled.problem]), ...titleDrift(title), ...split.problems]);
  }
  const raw = Object.freeze({ title, ...split.fields });
  const checked = checkPrFields(raw);
  if (checked.problems.length > 0) return Object.freeze([...titleDrift(title), ...checked.problems]);
  const drift = [...titleDrift(title), ...fieldDrift(raw, checked.fields)];
  if (drift.length > 0) return Object.freeze(drift);
  if (renderPrCreateBody(checked.fields) !== body) {
    return Object.freeze(['body: does not re-render byte for byte from its own fields, so it is not what pr-render prints']);
  }
  return Object.freeze([]);
}
