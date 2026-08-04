export const PR_TITLE_TYPES = Object.freeze(['feat', 'fix', 'refactor', 'docs', 'test', 'chore', 'perf', 'ci']);
export const PR_TITLE_PATTERN = /^(?=.{1,72}$)(feat|fix|refactor|docs|test|chore|perf|ci)(\([a-z0-9][a-z0-9-]{0,15}\))?: [a-z][\x20-\x7E]*[\x21-\x2D\x2F-\x7E]$/;
export const PR_TITLE_CAP = 72;
export const PR_VALUE_CAP = 200;
export const PR_ORIGINS = Object.freeze(['machine', 'human']);
export const PR_PROVENANCE_PATTERN = /^agent=[A-Za-z0-9:._-]{1,64} model=[A-Za-z0-9:._-]{1,64}$/;
export const PR_CHANGED_LINES_PATTERN = /^(0|[1-9][0-9]{0,6})$/;
export const PR_SIZE_WARNING_THRESHOLD = 400;
export const PR_MULTI_LIMITS = Object.freeze({
  '--why': 3,
  '--what': 5,
  '--verified': 8,
  '--not-verified': 8,
  '--link': 8,
});

const CONTROL_CHARS = /[\x00-\x1F\x7F]/g;
const OUTSIDE_PRINTABLE_ASCII = /[^\x20-\x7E]/;
const TAG_OPENER = /<[!\/A-Za-z]/;
const BLOCK_OPENER = /^[`~#>|]/;
const SETEXT_UNDERLINE = /^[=-]+$/;
const RESERVED_FIELD_PREFIX = /^(verified|not verified|size):/i;
const RESERVED_STRUCTURE_PREFIX = /^(SUPERSEDES|DEPENDS-ON) /;
const FIELD_INDIRECTION_SIGIL = '@';

const WHY_HEADING = '## Why';
const WHAT_HEADING = '## What';
const VERIFICATION_HEADING = '## Verification';
const PROVENANCE_HEADING = '## Provenance';
const RISK_HEADING = '## Risk';
const LINKS_HEADING = '## Links';
const BULLET = '- ';
const VERIFIED_PREFIX = 'Verified: ';
const NOT_VERIFIED_PREFIX = 'Not verified: ';
const SECTION_SEPARATOR = '\n\n';
const LINE_SEPARATOR = '\n';

export const SUPERSEDES_PREFIX = 'SUPERSEDES ';
export const DEPENDS_PREFIX = 'DEPENDS-ON ';

const MACHINE_TRAILER = 'Opened by an automated agent through the mitosis-git pr-create tool. HUMAN-GATED: a human reviews and lands this pull request.';
const HUMAN_TRAILER = 'Opened at human direction through the mitosis-git pr-create tool. HUMAN-GATED: a human reviews and lands this pull request.';
const UNATTRIBUTED_TRAILER = 'Opened through the mitosis-git pr-create tool. HUMAN-GATED: a human reviews and lands this pull request.';
const TRAILER_BY_ORIGIN = Object.freeze({ machine: MACHINE_TRAILER, human: HUMAN_TRAILER });

export function carriesToolTrailer(body) {
  if (typeof body !== 'string') return false;
  const trimmed = body.trimEnd();
  return [MACHINE_TRAILER, HUMAN_TRAILER, UNATTRIBUTED_TRAILER].some((trailer) => trimmed.endsWith(trailer));
}

export function inertValue(value, cap) {
  if (typeof value !== 'string') return null;
  if (!Number.isInteger(cap) || cap <= 0) return null;
  const stripped = value.replace(CONTROL_CHARS, '').trim();
  if (stripped.length === 0) return null;
  if (stripped.length > cap) return null;
  if (stripped.startsWith(FIELD_INDIRECTION_SIGIL)) return null;
  if (OUTSIDE_PRINTABLE_ASCII.test(stripped)) return null;
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

function sizeWarning(changedLines) {
  if (!Number.isInteger(changedLines) || changedLines <= PR_SIZE_WARNING_THRESHOLD) return null;
  return `SIZE: this diff changes about ${changedLines} lines; review effectiveness drops sharply past ${PR_SIZE_WARNING_THRESHOLD} lines.`;
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
  const depends = textList(opts.depends);
  if (depends.length > 0) lines.push(`${DEPENDS_PREFIX}${depends.join(', ')}`);
  return [...lines, ...textList(opts.links).map((value) => `${BULLET}${value}`)];
}

export function renderPrCreateBody(opts) {
  const fields = opts === null || typeof opts !== 'object' || Array.isArray(opts) ? {} : opts;
  const blocks = [];
  const why = textList(fields.why);
  if (why.length > 0) blocks.push(section(WHY_HEADING, why));
  const what = textList(fields.what);
  if (what.length > 0) blocks.push(section(WHAT_HEADING, what.map((value) => `${BULLET}${value}`)));
  const verification = verificationLines(fields);
  if (verification.length > 0) blocks.push(section(VERIFICATION_HEADING, verification));
  const provenance = text(fields.provenance);
  if (provenance !== null) blocks.push(section(PROVENANCE_HEADING, [provenance]));
  const risk = text(fields.risk);
  if (risk !== null) blocks.push(section(RISK_HEADING, [risk]));
  const links = linkLines(fields);
  if (links.length > 0) blocks.push(section(LINKS_HEADING, links));
  const warning = sizeWarning(fields.changedLines);
  if (warning !== null) blocks.push(warning);
  blocks.push(Object.prototype.hasOwnProperty.call(TRAILER_BY_ORIGIN, fields.origin) ? TRAILER_BY_ORIGIN[fields.origin] : UNATTRIBUTED_TRAILER);
  return blocks.join(SECTION_SEPARATOR);
}
