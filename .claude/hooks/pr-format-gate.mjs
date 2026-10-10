#!/usr/bin/env node
import { readFileSync, realpathSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkPullRequest } from '../lib/git/pr-format.mjs';

export const CREATE_TOOL_PATTERN = /^mcp__.+__create_pull_request$/;
export const MERGE_TOOL_PATTERN = /^mcp__.+__merge_pull_request$/;
export const REASON_CAP = 4000;

const REMEDY = 'Compose the title and body with node "$HOME"/.claude/lib/git/pr.mjs pr-render and call create_pull_request with the printed title and body unchanged; pr-render\'s body replaces any repository pull-request template.';
const OFF_FORMAT_OPENING = 'this pull request is not in the house format: ';
const PROBLEM_SEPARATOR = '; ';
const MERGE_REASON = 'merging a pull request is human-only; a person merges it on GitHub after review.';
const TRAILING_HIGH_SURROGATE = /[\uD800-\uDBFF]$/;

export function denial(reason) {
  return Object.freeze({
    hookSpecificOutput: Object.freeze({
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    }),
  });
}

export function unreadable(detail) {
  return denial(`this create_pull_request call could not be read and is refused: ${detail}. ${REMEDY}`);
}

function closing(dropped) {
  return dropped > 0 ? `${PROBLEM_SEPARATOR}${dropped} more problems. ${REMEDY}` : `. ${REMEDY}`;
}

function cut(text, room) {
  const head = text.slice(0, room);
  return TRAILING_HIGH_SURROGATE.test(head) ? head.slice(0, -1) : head;
}

function cappedProblems(problems) {
  const whole = problems.join(PROBLEM_SEPARATOR);
  if (OFF_FORMAT_OPENING.length + whole.length + closing(0).length <= REASON_CAP) {
    return Object.freeze({ text: whole, dropped: 0 });
  }
  const room = REASON_CAP - OFF_FORMAT_OPENING.length - closing(problems.length).length;
  let text = '';
  let kept = 0;
  for (const problem of problems) {
    const lead = kept === 0 ? '' : PROBLEM_SEPARATOR;
    const left = room - text.length - lead.length;
    if (left <= 0) break;
    const piece = cut(problem, left);
    if (piece.length === 0) break;
    text = `${text}${lead}${piece}`;
    kept += 1;
    if (piece.length < problem.length) break;
  }
  return Object.freeze({ text, dropped: problems.length - kept });
}

function offFormat(problems) {
  const { text, dropped } = cappedProblems(problems);
  return denial(`${OFF_FORMAT_OPENING}${text}${closing(dropped)}`);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function decide(payload, check) {
  try {
    if (!isObject(payload)) return unreadable('the hook payload is not a JSON object');
    const toolName = payload.tool_name;
    if (typeof toolName !== 'string') return unreadable('the hook payload names no tool');
    if (MERGE_TOOL_PATTERN.test(toolName)) return denial(MERGE_REASON);
    if (!CREATE_TOOL_PATTERN.test(toolName)) return null;
    const input = payload.tool_input;
    if (!isObject(input)) return unreadable('the hook payload carries no tool_input object');
    if (typeof input.title !== 'string') return unreadable('the title is missing or not a string');
    if (typeof input.body !== 'string') return unreadable('the body is missing or not a string');
    const problems = check({ title: input.title, body: input.body });
    if (!Array.isArray(problems)) return offFormat(['the format check returned no list of problems']);
    if (problems.length === 0) return null;
    return offFormat(problems.map((problem) => String(problem)));
  } catch (error) {
    return unreadable(`the format check failed (${error && error.message})`);
  }
}

function main() {
  try {
    let payload;
    try {
      payload = JSON.parse(readFileSync(0, 'utf8'));
    } catch {
      process.stdout.write(`${JSON.stringify(unreadable('the hook payload is not JSON'))}\n`);
      return;
    }
    const decision = decide(payload, checkPullRequest);
    if (decision !== null) process.stdout.write(`${JSON.stringify(decision)}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify(unreadable(`the hook failed (${error && error.message})`))}\n`);
  }
}

function isMainModule() {
  if (!process.argv[1]) return false;
  if (import.meta.url === pathToFileURL(process.argv[1]).href) return true;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return basename(fileURLToPath(import.meta.url)) === basename(process.argv[1]);
  }
}

if (isMainModule()) {
  main();
}
