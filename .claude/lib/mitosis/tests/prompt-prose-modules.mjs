import { scanJsStructure } from '../js-scan.mjs';

const COMPOSER_PREFIX = 'compose';

export class ProseModuleHalt extends Error {}

function halt(message) {
  throw new ProseModuleHalt(message);
}

export function composerImportsOf(label, registrySource) {
  const scan = scanJsStructure(registrySource);
  if (!scan.ok) halt(`${label} could not be scanned, so its composer imports cannot be read: ${scan.error}`);
  const { masked, stringSpans } = scan;
  const imported = new Map();
  for (const [open, close] of stringSpans.entries()) {
    const tail = masked.lastIndexOf('}', open);
    if (tail === -1) continue;
    if (masked.slice(tail + 1, open).trim() !== 'from') continue;
    const head = masked.lastIndexOf('{', tail);
    if (head === -1) continue;
    const composers = registrySource.slice(head + 1, tail)
      .split(',')
      .map((entry) => entry.trim())
      .filter((binding) => binding.startsWith(COMPOSER_PREFIX));
    if (composers.length === 0) continue;
    const module = registrySource.slice(open + 1, close).replace(/^\.\//, '');
    imported.set(module, Object.freeze([...(imported.get(module) ?? []), ...composers].sort()));
  }
  if (imported.size === 0) {
    halt(`${label} imports no composer binding, so this census cannot tell which modules carry prose; it refuses to fall back to a hardcoded list`);
  }
  return imported;
}

export function proseModulesOf(label, registrySource) {
  return Object.freeze([...composerImportsOf(label, registrySource).keys()].sort());
}
