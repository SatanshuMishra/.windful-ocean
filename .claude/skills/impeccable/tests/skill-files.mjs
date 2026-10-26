import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const skillDir = fileURLToPath(new URL('..', import.meta.url));

export function read(relativePath) {
  return readFileSync(join(skillDir, relativePath), 'utf8');
}

export function frontmatter(text) {
  const lines = text.split('\n');
  if (lines[0] !== '---') return Object.freeze([]);
  const end = lines.indexOf('---', 1);
  if (end === -1) return Object.freeze([]);
  return Object.freeze(lines.slice(1, end));
}

export const PLATFORM_SECTIONS = Object.freeze([
  'Targets',
  'Contrast and type',
  'Destructive actions',
  'Unavailable actions',
  'Progress',
  'Over media',
  'Placement',
  'Sources',
]);

export function sectionLines(text, heading) {
  const lines = text.split('\n');
  const start = lines.indexOf(`## ${heading}`);
  if (start === -1) return Object.freeze([]);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith('## '));
  return Object.freeze(end === -1 ? rest : rest.slice(0, end));
}

const CITATION = /\(Sources? (\d+(?:, \d+)*)\)\s*$/;
const FROM_THE_STANDARD = /^- From the standard's /;

export function uncitedRules(text) {
  const lines = text.split('\n');
  const sourcesAt = lines.indexOf('## Sources');
  const ruleLines = sourcesAt === -1 ? lines : lines.slice(0, sourcesAt);
  const sourceCount = sectionLines(text, 'Sources').filter((line) => /^\d+\. https:\/\//.test(line)).length;
  const citesKnownSources = (line) => {
    const match = line.match(CITATION);
    return match !== null && match[1].split(', ').map(Number).every((n) => n >= 1 && n <= sourceCount);
  };
  return Object.freeze(
    ruleLines.filter((line) => line.startsWith('- ') && !FROM_THE_STANDARD.test(line) && !citesKnownSources(line)),
  );
}

export function headings(text, level) {
  const marker = `${'#'.repeat(level)} `;
  return Object.freeze(
    text
      .split('\n')
      .filter((line) => line.startsWith(marker))
      .map((line) => line.slice(marker.length).trim()),
  );
}
