import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const WORKFLOW_RELPATH = '.github/workflows/test.yml';
const WORKFLOW_PATH = fileURLToPath(new URL(`../../../../${WORKFLOW_RELPATH}`, import.meta.url));
const CHECKER = 'scripts/invariant-coverage-check.mjs';
const PUSH_BRANCHES = Object.freeze(['main']);
const SCOPE_FLAGS = Object.freeze(['--event', '--base-ref']);
const BUILT_IN_ENV_PREFIX = 'GITHUB_';
const INTERPOLATION_OPEN = '${{';
const PULL_REQUEST_GUARD = /github\.event_name\s*==\s*(['"])pull_request\1/;
const QUOTED_SHELL_VAR = /^"\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?"$/;
const KEY = /^([A-Za-z_][A-Za-z0-9_-]*):(?:\s+(.*))?$/;
const BLOCK_SCALAR = /^[|>][-+]?$/;

function indentOf(raw) {
  return raw.length - raw.trimStart().length;
}

function stripComment(text) {
  const chars = [...text];
  const scanned = chars.reduce((state, char, index) => {
    if (state.end !== null) return state;
    if (state.quote !== null) return char === state.quote ? { ...state, quote: null } : state;
    if (char === '"' || char === "'") return { ...state, quote: char };
    if (char === '#' && (index === 0 || /\s/.test(chars[index - 1]))) return { ...state, end: index };
    return state;
  }, { quote: null, end: null });
  return (scanned.end === null ? text : text.slice(0, scanned.end)).trimEnd();
}

function tokenOf(raw, index) {
  const indent = indentOf(raw);
  const trimmed = raw.trim();
  if (trimmed !== '-' && !trimmed.startsWith('- ')) {
    return { index, indent, item: false, contentIndent: indent, text: stripComment(trimmed) };
  }
  const afterDash = trimmed.slice(1);
  const content = afterDash.trim();
  const lead = content === '' ? 1 : afterDash.length - afterDash.trimStart().length;
  return { index, indent, item: true, contentIndent: indent + 1 + lead, text: stripComment(content) };
}

function tokenize(rawLines) {
  return rawLines
    .map((raw, index) => ({ raw, index }))
    .filter(({ raw }) => raw.trim() !== '' && !raw.trim().startsWith('#'))
    .map(({ raw, index }) => tokenOf(raw, index));
}

function scalar(text) {
  if (text.startsWith('[') && text.endsWith(']')) {
    const inner = text.slice(1, -1).trim();
    return inner === '' ? [] : inner.split(',').map((part) => scalar(part.trim()));
  }
  const quote = text.at(0);
  const quoted = text.length >= 2 && (quote === "'" || quote === '"') && text.at(-1) === quote;
  return quoted ? text.slice(1, -1) : text;
}

function consumeBlock(ctx, start, indent, keyIndex) {
  const taken = ctx.rawLines.slice(keyIndex + 1).reduce((state, raw) => {
    if (state.done) return state;
    if (raw.trim() === '') return { ...state, count: state.count + 1, lines: [...state.lines, ''] };
    if (indentOf(raw) <= indent) return { ...state, done: true };
    return { ...state, count: state.count + 1, lines: [...state.lines, raw.trim()] };
  }, { count: 0, lines: [], done: false });
  const limit = keyIndex + 1 + taken.count;
  const rest = ctx.tokens.slice(start).findIndex((token) => token.index >= limit);
  return {
    value: taken.lines.join('\n').trim(),
    next: rest === -1 ? ctx.tokens.length : start + rest,
  };
}

function parseEntryValue(ctx, start, text, indent, keyIndex) {
  if (text === '') return parseValue(ctx, start, indent + 1);
  if (BLOCK_SCALAR.test(text)) return consumeBlock(ctx, start, indent, keyIndex);
  return { value: scalar(text), next: start };
}

function parseMapping(ctx, start, indent) {
  const step = (i, entries) => {
    const token = ctx.tokens[i];
    if (!token || token.item || token.indent !== indent) return { value: Object.fromEntries(entries), next: i };
    const match = token.text.match(KEY);
    if (!match) throw new Error(`${WORKFLOW_RELPATH}:${token.index + 1}: not a mapping entry: ${JSON.stringify(token.text)}`);
    const parsed = parseEntryValue(ctx, i + 1, (match[2] ?? '').trim(), indent, token.index);
    return step(parsed.next, [...entries, [match[1], parsed.value]]);
  };
  return step(start, []);
}

function parseSequence(ctx, start, indent) {
  const step = (i, items) => {
    const token = ctx.tokens[i];
    if (!token || !token.item || token.indent !== indent) return { value: items, next: i };
    if (token.text === '') {
      const nested = parseValue(ctx, i + 1, token.contentIndent);
      return step(nested.next, [...items, nested.value]);
    }
    const match = token.text.match(KEY);
    if (!match) return step(i + 1, [...items, scalar(token.text)]);
    const head = parseEntryValue(ctx, i + 1, (match[2] ?? '').trim(), token.contentIndent, token.index);
    const tail = parseMapping(ctx, head.next, token.contentIndent);
    return step(tail.next, [...items, { [match[1]]: head.value, ...tail.value }]);
  };
  return step(start, []);
}

function parseValue(ctx, start, indent) {
  const token = ctx.tokens[start];
  if (!token || token.indent < indent) return { value: null, next: start };
  return token.item ? parseSequence(ctx, start, token.indent) : parseMapping(ctx, start, token.indent);
}

function parseWorkflow(text) {
  const rawLines = text.split('\n');
  const ctx = { rawLines, tokens: tokenize(rawLines) };
  const parsed = parseMapping(ctx, 0, 0);
  if (parsed.next !== ctx.tokens.length) {
    const stopped = ctx.tokens[parsed.next];
    throw new Error(`${WORKFLOW_RELPATH}: parsing stopped at line ${stopped.index + 1}: ${JSON.stringify(stopped.text)}`);
  }
  return parsed.value;
}

const workflow = parseWorkflow(readFileSync(WORKFLOW_PATH, 'utf8'));

function coverageSite() {
  const sites = Object.entries(workflow.jobs ?? {}).flatMap(([jobName, job]) => (Array.isArray(job?.steps) ? job.steps : [])
    .map((step) => ({ jobName, job, step }))
    .filter(({ step }) => typeof step?.run === 'string' && step.run.includes(CHECKER)));
  assert.equal(sites.length, 1, `expected exactly one ${CHECKER} invocation in ${WORKFLOW_RELPATH}; found ${sites.length}`);
  return sites[0];
}

function argumentAfter(run, flag) {
  const tokens = run.split(/\s+/).filter((value) => value !== '');
  const index = tokens.indexOf(flag);
  return index === -1 || index + 1 >= tokens.length ? null : tokens[index + 1];
}

test('the push trigger is filtered to main, so a pull request commit is never also checked by a second push run', () => {
  const push = workflow.on?.push ?? null;
  assert.notEqual(
    push,
    null,
    `an unfiltered "push:" trigger in ${WORKFLOW_RELPATH} fires on every branch, so every pull request commit is checked twice — once as pull_request and once as push — on two machines under two diff scopes that can legitimately disagree`,
  );
  assert.deepEqual(
    push.branches,
    [...PUSH_BRANCHES],
    `the push trigger must select exactly ${PUSH_BRANCHES.join(', ')}; any wider selection restores the duplicate non-deterministic run`,
  );
});

test('the invariant coverage check is unreachable on a non-pull_request event: an event_name guard stands at job or step level', () => {
  const site = coverageSite();
  const conditions = [
    { level: 'job', value: site.job.if },
    { level: 'step', value: site.step.if },
  ].filter(({ value }) => typeof value === 'string');
  const guarded = conditions.filter(({ value }) => PULL_REQUEST_GUARD.test(value));
  assert.ok(
    guarded.length > 0,
    `the ${CHECKER} step in job ${JSON.stringify(site.jobName)} carries no ${PULL_REQUEST_GUARD} guard at job or step level, so a push run executes a check whose pull-request diff scope does not exist there; conditions found: ${JSON.stringify(conditions)}`,
  );
});

test('the coverage check receives its event and base ref through env-borne shell variables, never a run-line expression interpolation', () => {
  const site = coverageSite();
  const run = site.step.run;
  assert.equal(
    run.includes(INTERPOLATION_OPEN),
    false,
    `the ${CHECKER} run line interpolates ${INTERPOLATION_OPEN} directly; a branch name carrying shell metacharacters is then substituted into the script before it is parsed, which is a script-injection surface. Values arrive through env instead: ${JSON.stringify(run)}`,
  );
  const declared = Object.keys(site.step.env ?? {});
  for (const flag of SCOPE_FLAGS) {
    const value = argumentAfter(run, flag);
    assert.notEqual(
      value,
      null,
      `the ${CHECKER} invocation passes no ${flag}, so the check derives its diff scope from the ambient environment and two runs of the same commit can disagree: ${JSON.stringify(run)}`,
    );
    const match = value.match(QUOTED_SHELL_VAR);
    assert.ok(
      match,
      `${flag} must receive a double-quoted shell variable so a branch name carrying metacharacters stays one inert argument; got ${JSON.stringify(value)}`,
    );
    assert.ok(
      declared.includes(match[1]) || match[1].startsWith(BUILT_IN_ENV_PREFIX),
      `${flag} reads $${match[1]}, which is neither declared in the step env (${declared.join(', ') || 'none'}) nor a ${BUILT_IN_ENV_PREFIX} built-in, so it expands to the empty string and the check silently falls back to push mode`,
    );
  }
});
