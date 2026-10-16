#!/usr/bin/env node
import fs, { realpathSync, statSync } from 'node:fs';
import os from 'node:os';
import path, { basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const EXCERPT = 300;
const LARGE_RESULT = 20000;
const LIST_LIMIT = 15;
const FALLBACK_AGENTS = new Set(['general-purpose', 'claude']);
const AUTOMATED_PREFIXES = [
  '<',
  'This session is being continued',
  '(Re-invocation',
  'Caveat:',
  '[node ',
];

function excerpt(text) {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > EXCERPT ? `${flat.slice(0, EXCERPT)}...` : flat;
}

function resultText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((part) => (typeof part === 'string' ? part : part?.text ?? '')).join('\n');
  return JSON.stringify(content ?? '');
}

function parseLines(text) {
  const parsed = text.split('\n').flatMap((raw, index) => {
    if (raw.trim() === '') return [];
    try {
      return [{ line: index + 1, entry: JSON.parse(raw) }];
    } catch {
      return [{ line: index + 1, entry: null }];
    }
  });
  return {
    records: parsed.filter(({ entry }) => entry !== null),
    skippedLines: parsed.filter(({ entry }) => entry === null).map(({ line }) => line),
  };
}

function contentParts(entry) {
  const content = entry?.message?.content;
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  return Array.isArray(content) ? content : [];
}

const PERMISSION_TEXT = /^(Permission\b|The user doesn't want to proceed|This (Bash )?command (contains multiple operations\. The following part )?requires approval|A variable in this command can't be checked before it runs|Claude requested permissions to|[^\n]{0,200}\bwas blocked\. For security|Contains \w+|[^\n]{0,120}\b(has been|was) (denied|rejected)\b)/;

function classifyError(text, entry) {
  if (/^Stop hook feedback:/.test(text)) return 'hook_feedback';
  if (/^\w+(:\S+)? hook error:/.test(text) || (entry.permissionDecision?.decision === 'reject' && entry.permissionDecision?.source === 'hook')) return 'hook_block';
  if (entry.toolDenialKind || entry.permissionDecision?.decision === 'reject' || PERMISSION_TEXT.test(text)) return 'permission_denied';
  return 'tool_error';
}

function isHumanText(text) {
  return !AUTOMATED_PREFIXES.some((prefix) => text.startsWith(prefix));
}

export function digestEntries(records, source) {
  const toolUses = records.flatMap(({ line, entry }) => (entry.type === 'assistant'
    ? contentParts(entry).filter((part) => part.type === 'tool_use').map((part) => ({ line, id: part.id, name: part.name, input: part.input ?? {} }))
    : []));
  const names = new Map(toolUses.map((use) => [use.id, use.name]));

  const userParts = records.flatMap(({ line, entry }) => (entry.type === 'user' && !entry.isMeta
    ? contentParts(entry).map((part) => ({ line, entry, part }))
    : []));

  const friction = userParts.flatMap(({ line, entry, part }) => {
    if (part.type === 'tool_result' && part.is_error) {
      const text = resultText(part.content);
      return [{ kind: classifyError(text, entry), source, line, tool: names.get(part.tool_use_id) ?? 'unknown', excerpt: excerpt(text) }];
    }
    if (part.type === 'text' && /^Stop hook feedback:/.test(part.text ?? '')) {
      return [{ kind: 'hook_feedback', source, line, tool: 'Stop', excerpt: excerpt(part.text) }];
    }
    if (part.type === 'text' && /^\[Request interrupted by user/.test(part.text ?? '')) {
      return [{ kind: 'interrupt', source, line, tool: null, excerpt: excerpt(part.text) }];
    }
    return [];
  });

  const humanMessages = source !== 'main' ? [] : userParts
    .filter(({ part }) => part.type === 'text' && typeof part.text === 'string' && part.text.trim() !== '' && isHumanText(part.text) && !/^\[Request interrupted by user/.test(part.text) && !/^Stop hook feedback:/.test(part.text))
    .map(({ line, part }) => ({ source, line, excerpt: excerpt(part.text) }));

  const largeResults = userParts
    .filter(({ part }) => part.type === 'tool_result' && resultText(part.content).length > LARGE_RESULT)
    .map(({ line, part }) => ({ source, line, tool: names.get(part.tool_use_id) ?? 'unknown', chars: resultText(part.content).length }));

  const signatures = toolUses.map((use) => ({
    use,
    key: `${use.name}:${createHash('sha256').update(JSON.stringify(use.input)).digest('hex')}`,
  }));
  const repeatedCalls = [...new Set(signatures.map(({ key }) => key))]
    .map((key) => signatures.filter((signature) => signature.key === key))
    .filter((group) => group.length > 1)
    .map((group) => ({ source, tool: group[0].use.name, count: group.length, lines: group.map(({ use }) => use.line), excerpt: excerpt(JSON.stringify(group[0].use.input)) }));

  const fallbackDispatches = toolUses
    .filter((use) => (use.name === 'Agent' || use.name === 'Task') && FALLBACK_AGENTS.has(use.input.subagent_type ?? 'general-purpose'))
    .map((use) => ({ source, line: use.line, subagent_type: use.input.subagent_type ?? 'general-purpose', description: excerpt(use.input.description) }));

  const toolCalls = toolUses.reduce((counts, use) => ({ ...counts, [use.name]: (counts[use.name] ?? 0) + 1 }), {});

  return { toolCalls, friction, humanMessages, largeResults, repeatedCalls, fallbackDispatches };
}

function mergeCounts(left, right) {
  return Object.entries(right).reduce((counts, [name, count]) => ({ ...counts, [name]: (counts[name] ?? 0) + count }), left);
}

export function digestTranscript(file) {
  const main = { file, source: 'main' };
  const subagentDir = path.join(path.dirname(file), path.basename(file, '.jsonl'), 'subagents');
  const subagents = fs.existsSync(subagentDir)
    ? fs.readdirSync(subagentDir).filter((name) => name.endsWith('.jsonl')).sort().map((name) => ({ file: path.join(subagentDir, name), source: path.basename(name, '.jsonl') }))
    : [];
  const sources = [main, ...subagents];
  const parsed = sources.map(({ file: transcript, source }) => ({ source, ...parseLines(fs.readFileSync(transcript, 'utf8')) }));
  const parts = parsed.map(({ records, source }) => digestEntries(records, source));
  return {
    transcript: file,
    files: Object.fromEntries(sources.map(({ file: transcript, source }) => [source, transcript])),
    skippedLines: parsed.filter(({ skippedLines }) => skippedLines.length > 0).map(({ source, skippedLines }) => ({ source, lines: skippedLines })),
    toolCalls: parts.reduce((counts, part) => mergeCounts(counts, part.toolCalls), {}),
    friction: parts.flatMap((part) => part.friction),
    humanMessages: parts.flatMap((part) => part.humanMessages),
    repeatedCalls: parts.flatMap((part) => part.repeatedCalls).sort((left, right) => right.count - left.count).slice(0, LIST_LIMIT),
    largeResultCount: parts.reduce((total, part) => total + part.largeResults.length, 0),
    largeResults: parts.flatMap((part) => part.largeResults).sort((left, right) => right.chars - left.chars).slice(0, LIST_LIMIT),
    fallbackDispatches: parts.flatMap((part) => part.fallbackDispatches),
  };
}

export function resolveTranscript(target, { projectsDir, sessionId }) {
  if (target && (target.endsWith('.jsonl') || target.includes(path.sep))) {
    return fs.existsSync(target) && statSync(target).isFile() ? path.resolve(target) : { error: `no transcript file at ${target}` };
  }
  const id = target || sessionId;
  if (!id) return { error: 'no session given and CLAUDE_CODE_SESSION_ID is unset; pass a transcript path or a session id' };
  const matches = fs.existsSync(projectsDir)
    ? fs.readdirSync(projectsDir).map((project) => path.join(projectsDir, project, `${id}.jsonl`)).filter((candidate) => fs.existsSync(candidate))
    : [];
  if (matches.length === 0) return { error: `no transcript named ${id}.jsonl under ${projectsDir}` };
  return matches[0];
}

function main(argv) {
  const resolved = resolveTranscript(argv[0], {
    projectsDir: path.join(os.homedir(), '.claude', 'projects'),
    sessionId: process.env.CLAUDE_CODE_SESSION_ID,
  });
  if (typeof resolved !== 'string') {
    process.stderr.write(`retro digest: ${resolved.error}\n`);
    return 2;
  }
  process.stdout.write(`${JSON.stringify(digestTranscript(resolved), null, 2)}\n`);
  return 0;
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
  process.exitCode = main(process.argv.slice(2));
}
