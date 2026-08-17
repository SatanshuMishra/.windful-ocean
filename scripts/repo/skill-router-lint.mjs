#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { parseSkillReference } from '../../.claude/lib/mitosis/agent-skill-pointers.mjs';

const MAX_SKILL_BYTES = 4096;
const SKILL_FILE = 'SKILL.md';
const USAGE = 'usage: skill-router-lint.mjs <skill-directory> [<skill-directory> ...]';
const DELIMITER = '---';
const REQUIRED_FIELDS = Object.freeze(['name', 'description']);
const ROUTING_HEADER = Object.freeze(['Duty', 'Procedure']);
const FRONTMATTER_FIELD = /^([A-Za-z][A-Za-z0-9_-]*):[ \t]*(.*)$/;
const FRONTMATTER_CONTINUATION = /^[ \t]+\S/;
const FENCE = /^[ \t]*(?:```|~~~)/;
const INLINE_CODE = /`([^`\n]+)`/g;
const SEPARATOR_CELL = /^:?-{3,}:?$/;
const QUALIFIED_SHAPE = /^[^\s`/]+:[^\s`/]+$/;

class UsageError extends Error {}

function readTextOrNull(path) {
  try {
    if (!statSync(path).isFile()) return null;
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

function collectMarkdown(root, prefix) {
  const dir = prefix === '' ? root : join(root, prefix);
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    throw new UsageError(`the skill directory ${dir} could not be listed, so its files cannot be censused: ${error.message}`);
  }
  return entries.flatMap((entry) => {
    const relativePath = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) return collectMarkdown(root, relativePath);
    if (entry.isFile() && entry.name.endsWith('.md')) return [relativePath];
    return [];
  });
}

function markdownFiles(root) {
  return Object.freeze([...collectMarkdown(root, '')].sort());
}

function siblingSkillNames(root) {
  const parent = dirname(root);
  try {
    return readdirSync(parent, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch (error) {
    throw new UsageError(`the skills directory ${parent} could not be listed, so bare skill names cannot be recognised: ${error.message}`);
  }
}

function unfencedLines(text) {
  return text.split('\n').reduce((state, line, index) => {
    if (FENCE.test(line)) return { fenced: !state.fenced, lines: state.lines };
    if (state.fenced) return state;
    return { fenced: false, lines: [...state.lines, { text: line, number: index + 1 }] };
  }, { fenced: false, lines: [] }).lines;
}

function spansIn(text) {
  return [...text.matchAll(INLINE_CODE)].map((match) => match[1]);
}

function codeSpans(file, lines) {
  return lines.flatMap((line) => spansIn(line.text).map((value) => Object.freeze({ file, line: line.number, value })));
}

function frontmatterFields(text, file) {
  const lines = text.split('\n');
  if (lines[0] !== DELIMITER) {
    return { fields: null, problems: [`FRONTMATTER_MISSING: ${file} does not open with a ${DELIMITER} line, so it carries no parseable frontmatter`] };
  }
  const closing = lines.indexOf(DELIMITER, 1);
  if (closing === -1) {
    return { fields: null, problems: [`FRONTMATTER_UNTERMINATED: ${file} opens frontmatter but never closes it with a ${DELIMITER} line`] };
  }
  const body = lines.slice(1, closing).filter((line) => line.trim() !== '');
  const parsed = body.reduce((state, line) => {
    const field = FRONTMATTER_FIELD.exec(line);
    if (field) return { seenField: true, pairs: [...state.pairs, [field[1], field[2].trim()]], bad: state.bad };
    if (FRONTMATTER_CONTINUATION.test(line) && state.seenField) return state;
    return { seenField: state.seenField, pairs: state.pairs, bad: [...state.bad, line] };
  }, { seenField: false, pairs: [], bad: [] });
  if (parsed.bad.length > 0) {
    return {
      fields: null,
      problems: parsed.bad.map((line) => `FRONTMATTER_UNPARSEABLE: ${file} carries a frontmatter line that is neither a key: value pair nor a continuation, so the census halts rather than guessing: ${JSON.stringify(line)}`),
    };
  }
  const fields = new Map(parsed.pairs);
  const missing = REQUIRED_FIELDS.filter((name) => !fields.has(name) || fields.get(name).length === 0);
  if (missing.length > 0) {
    return { fields: null, problems: [`FRONTMATTER_INCOMPLETE: ${file} has no usable ${missing.join(' and ')}`] };
  }
  return { fields, problems: [] };
}

function tableCells(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|') || trimmed.length < 2) return null;
  return trimmed.slice(1, -1).split('|').map((cell) => cell.trim());
}

function sameCells(cells, expected) {
  return cells !== null && cells.length === expected.length && cells.every((cell, index) => cell === expected[index]);
}

function routingRows(lines, file) {
  const headers = lines.filter((line) => sameCells(tableCells(line.text), ROUTING_HEADER));
  if (headers.length !== 1) {
    return {
      rows: [],
      problems: [`ROUTING_TABLE_NOT_UNIQUE: ${file} carries ${headers.length} tables whose header row is ${ROUTING_HEADER.join(' | ')}, and exactly one is required`],
    };
  }
  const start = lines.indexOf(headers[0]);
  const separator = tableCells(lines[start + 1] === undefined ? '' : lines[start + 1].text);
  if (separator === null || separator.length !== ROUTING_HEADER.length || !separator.every((cell) => SEPARATOR_CELL.test(cell))) {
    return { rows: [], problems: [`ROUTING_TABLE_MALFORMED: ${file}:${headers[0].number} is not followed by a ${ROUTING_HEADER.length}-cell separator row`] };
  }
  const body = lines.slice(start + 2);
  const end = body.findIndex((line) => tableCells(line.text) === null);
  const rows = (end === -1 ? body : body.slice(0, end)).map((line) => Object.freeze({ line: line.number, cells: tableCells(line.text) }));
  if (rows.length === 0) {
    return { rows, problems: [`ROUTING_TABLE_EMPTY: ${file} carries a routing table with no rows, so a census over it would pass over nothing`] };
  }
  return { rows, problems: [] };
}

function rowProblems(row, root, file) {
  if (row.cells.length !== ROUTING_HEADER.length) {
    return [`ROUTING_ROW_SHAPE: ${file}:${row.line} has ${row.cells.length} cells, and ${ROUTING_HEADER.length} are required`];
  }
  const [duty, procedure] = row.cells;
  if (duty.length === 0) {
    return [`ROUTING_ROW_DUTY_EMPTY: ${file}:${row.line} names no duty`];
  }
  const paths = spansIn(procedure);
  if (paths.length !== 1) {
    return [`ROUTING_ROW_UNCLASSIFIABLE: ${file}:${row.line} (${duty}) carries ${paths.length} backticked paths in its Procedure cell, and exactly one is required`];
  }
  const [path] = paths;
  if (path.startsWith('/') || path.split('/').includes('..')) {
    return [`ROUTING_PATH_UNSAFE: ${file}:${row.line} (${duty}) names ${path}, which escapes the skill directory`];
  }
  const resolved = join(root, path);
  try {
    if (!statSync(resolved).isFile()) {
      return [`ROUTING_SIDE_FILE_MISSING: ${file}:${row.line} (${duty}) names ${path}, which is not a regular file at ${resolved}`];
    }
  } catch {
    return [`ROUTING_SIDE_FILE_MISSING: ${file}:${row.line} (${duty}) names ${path}, which does not exist at ${resolved}`];
  }
  return [];
}

function referenceProblems(spans, ownName, siblings) {
  const candidates = spans.filter((span) => QUALIFIED_SHAPE.test(span.value));
  const parsed = candidates.map((span) => {
    try {
      return { span, reference: parseSkillReference(span.value), problem: null };
    } catch (error) {
      return { span, reference: null, problem: `SKILL_REFERENCE_NOT_QUALIFIED: ${span.file}:${span.line} carries ${JSON.stringify(span.value)}: ${error.message}` };
    }
  });
  const qualified = parsed.filter((entry) => entry.reference !== null);
  const qualificationProblems = parsed.filter((entry) => entry.problem !== null).map((entry) => entry.problem);
  const known = new Set(
    [...siblings, ...qualified.flatMap((entry) => [entry.reference.plugin, entry.reference.skill])].filter((name) => name !== ownName),
  );
  const bareProblems = spans
    .filter((span) => known.has(span.value))
    .map((span) => `SKILL_REFERENCE_BARE: ${span.file}:${span.line} names the skill ${JSON.stringify(span.value)} without a plugin prefix; bare names fall back to suffix matching and resolve arbitrarily, so plugin:skill is required`);
  const absent = qualified.length === 0
    ? [`SKILL_REFERENCE_ABSENT: no fully qualified plugin:skill reference appears anywhere under this skill, so the qualification census would pass over an empty set`]
    : [];
  return { qualified, problems: [...qualificationProblems, ...bareProblems, ...absent] };
}

function lintSkillRouter(root) {
  const skillPath = join(root, SKILL_FILE);
  const text = readTextOrNull(skillPath);
  if (text === null) {
    return Object.freeze({ problems: Object.freeze([`SKILL_MD_MISSING: ${skillPath} is not a readable regular file, so this skill cannot be censused`]), summary: null });
  }
  const bytes = Buffer.byteLength(text, 'utf8');
  const sizeProblems = bytes > MAX_SKILL_BYTES
    ? [`SKILL_MD_OVERSIZE: ${skillPath} is ${bytes} bytes, over the ${MAX_SKILL_BYTES} byte preload limit; move procedure into a side file`]
    : [];
  const lines = unfencedLines(text);
  const frontmatter = frontmatterFields(text, SKILL_FILE);
  const nameProblems = frontmatter.fields !== null && frontmatter.fields.get('name') !== basename(root)
    ? [`SKILL_NAME_MISMATCH: ${SKILL_FILE} declares name ${JSON.stringify(frontmatter.fields.get('name'))} but sits in a directory named ${JSON.stringify(basename(root))}`]
    : [];
  const routing = routingRows(lines, SKILL_FILE);
  const sideFileProblems = routing.rows.flatMap((row) => rowProblems(row, root, SKILL_FILE));
  const files = markdownFiles(root);
  const spans = files.flatMap((file) => {
    const body = readTextOrNull(join(root, file));
    if (body === null) throw new UsageError(`${join(root, file)} was listed but could not be read, so the census cannot close`);
    return codeSpans(file, unfencedLines(body));
  });
  const references = referenceProblems(spans, basename(root), siblingSkillNames(root));
  const problems = [
    ...sizeProblems,
    ...frontmatter.problems,
    ...nameProblems,
    ...routing.problems,
    ...sideFileProblems,
    ...references.problems,
  ];
  return Object.freeze({
    problems: Object.freeze(problems),
    summary: Object.freeze({ bytes, files: files.length, rows: routing.rows.length, references: references.qualified.length }),
  });
}

function main(argv) {
  if (argv.length === 0 || argv.some((value) => value.startsWith('-'))) {
    throw new UsageError(`at least one skill directory is required, and no argument may be a flag. ${USAGE}`);
  }
  const roots = argv.map((value) => resolve(value));
  const repeated = roots.filter((root, index) => roots.indexOf(root) !== index).sort();
  if (repeated.length > 0) {
    throw new UsageError(`these skill directories were named more than once, so the census would count them twice: ${[...new Set(repeated)].join(', ')}`);
  }
  const audited = roots.map((root) => Object.freeze({ root, result: lintSkillRouter(root) }));
  for (const entry of audited.filter((item) => item.result.problems.length > 0)) {
    process.stderr.write(`${entry.result.problems.length} problem(s) linting the skill router at ${entry.root}:\n`);
    for (const problem of entry.result.problems) process.stderr.write(`  ${problem}\n`);
  }
  for (const entry of audited.filter((item) => item.result.problems.length === 0)) {
    const { bytes, files, rows, references } = entry.result.summary;
    process.stdout.write(`OK ${entry.root}: ${SKILL_FILE} ${bytes} bytes (limit ${MAX_SKILL_BYTES}), ${rows} routed side files present, ${references} qualified skill reference(s) across ${files} markdown file(s)\n`);
  }
  if (audited.some((entry) => entry.result.problems.length > 0)) return 1;
  process.stdout.write(`OK ${audited.length} skill router(s) linted\n`);
  return 0;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${error instanceof UsageError ? 'cannot lint' : 'unexpected failure'}: ${error.message}\n`);
  process.exitCode = 2;
}
