#!/usr/bin/env node
import { readFileSync, realpathSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkPullRequest } from '../lib/git/pr-format.mjs';

export const GATED_TOOLS = Object.freeze([
  'mcp__github__create_pull_request',
  'mcp__plugin_github_github__create_pull_request',
]);

const REMEDY = 'Compose the title and body with node "$HOME"/.claude/lib/git/pr.mjs pr-render and call create_pull_request with the printed title and body unchanged; pr-render\'s body replaces any repository pull-request template.';

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

function offFormat(problems) {
  return denial(`this pull request is not in the house format: ${problems.join('; ')}. ${REMEDY}`);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function decide(payload, check) {
  try {
    if (!isObject(payload)) return unreadable('the hook payload is not a JSON object');
    const toolName = payload.tool_name;
    if (typeof toolName !== 'string') return unreadable('the hook payload names no tool');
    if (!GATED_TOOLS.includes(toolName)) return null;
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
