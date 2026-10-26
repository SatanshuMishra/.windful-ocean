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

export function headings(text, level) {
  const marker = `${'#'.repeat(level)} `;
  return Object.freeze(
    text
      .split('\n')
      .filter((line) => line.startsWith(marker))
      .map((line) => line.slice(marker.length).trim()),
  );
}
