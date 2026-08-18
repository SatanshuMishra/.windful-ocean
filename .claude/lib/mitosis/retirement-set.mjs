import { halt } from './js-scan.mjs';

const SECTION_HEADING = /^##[ \t]+5b\./gm;
const NEXT_SECTION = /^##[ \t]/m;
const DELETED_MARKER = /Deleted in the contract wave \((\d+)\):/;
const BACKTICKED = /`([^`\n]*)`/g;
const AGENT_NAME = /^[a-z0-9][a-z0-9-]*$/;
const TABLE_DIVIDER = /^:?-{3,}:?$/;
const ROW_INDEX = /^\d+$/;
const ROSTER_HEADER = Object.freeze(['#', 'Agent']);
const SECTION_LABEL = 'section 5b';

function failure(kind, error) {
  return Object.freeze({ ok: false, kind, error });
}

function tableCells(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|') || trimmed.length < 2) return null;
  return trimmed.slice(1, -1).split('|').map((cell) => cell.trim());
}

function readSection(path, source) {
  SECTION_HEADING.lastIndex = 0;
  const headings = [];
  for (;;) {
    const matched = SECTION_HEADING.exec(source);
    if (matched === null) break;
    headings.push(matched);
  }
  if (headings.length !== 1) {
    return halt(`${path} carries ${headings.length} ${SECTION_LABEL} headings; the retiring set is derived from exactly one, so this census refuses to guess which declares the roster`);
  }
  const rest = source.slice(headings[0].index + headings[0][0].length);
  const next = NEXT_SECTION.exec(rest);
  return Object.freeze({ ok: true, body: next === null ? rest : rest.slice(0, next.index) });
}

export function readRetainedRoster(path, body) {
  const lines = body.split('\n');
  const headers = [];
  for (let k = 0; k < lines.length; k += 1) {
    const cells = tableCells(lines[k]);
    if (cells === null) continue;
    if (ROSTER_HEADER.every((title, column) => cells[column] === title)) headers.push(k);
  }
  if (headers.length !== 1) {
    return halt(`${path} ${SECTION_LABEL} carries ${headers.length} tables headed ${ROSTER_HEADER.join(' | ')}; the retained roster is derived from exactly one, so this census refuses to guess which`);
  }
  const divider = tableCells(lines[headers[0] + 1]);
  if (divider === null || !divider.every((cell) => TABLE_DIVIDER.test(cell))) {
    return halt(`${path} ${SECTION_LABEL} opens the roster table without a divider row beneath its header, so its rows cannot be read as data; refusing to guess`);
  }
  const names = [];
  for (let k = headers[0] + 2; k < lines.length; k += 1) {
    const cells = tableCells(lines[k]);
    if (cells === null) break;
    if (!ROW_INDEX.test(cells[0])) {
      return halt(`${path} ${SECTION_LABEL} row ${JSON.stringify(lines[k].trim())} opens with ${JSON.stringify(cells[0])} rather than a row number, so the roster table cannot be read to its end; refusing to guess`);
    }
    if (Number(cells[0]) !== names.length + 1) {
      return halt(`${path} ${SECTION_LABEL} numbers a roster row ${cells[0]} where ${names.length + 1} was expected; a table that skips or repeats a row number may have lost one, so this census refuses to derive a roster from it`);
    }
    const name = cells[1];
    if (typeof name !== 'string' || !AGENT_NAME.test(name)) {
      return halt(`${path} ${SECTION_LABEL} names roster agent ${JSON.stringify(name ?? null)} in row ${cells[0]}, which no agent definition file can be called; refusing to guess`);
    }
    if (names.includes(name)) {
      return halt(`${path} ${SECTION_LABEL} names ${JSON.stringify(name)} twice in the roster table; refusing to derive a roster that cannot be read as a set`);
    }
    names.push(name);
  }
  return Object.freeze({ ok: true, names: Object.freeze(names) });
}

export function readRetiringSet(path, body) {
  const paragraphs = body.split(/\n[ \t]*\n/);
  const matching = paragraphs.filter((paragraph) => DELETED_MARKER.test(paragraph));
  if (matching.length !== 1) {
    return halt(`${path} ${SECTION_LABEL} carries ${matching.length} paragraphs declaring the contract-wave deletions; the retiring set is derived from exactly one, so this census refuses to guess which`);
  }
  const paragraph = matching[0].trim();
  const marker = DELETED_MARKER.exec(paragraph);
  const declared = Number(marker[1]);
  if (!paragraph.endsWith('.')) {
    return halt(`${path} ${SECTION_LABEL} declares the contract-wave deletions in a paragraph that does not end in a full stop, so this census cannot tell where the list ends; refusing to guess`);
  }
  const tail = paragraph.slice(marker.index + marker[0].length);
  const names = [];
  BACKTICKED.lastIndex = 0;
  for (;;) {
    const matched = BACKTICKED.exec(tail);
    if (matched === null) break;
    const name = matched[1];
    if (!AGENT_NAME.test(name)) {
      return halt(`${path} ${SECTION_LABEL} names retiring agent ${JSON.stringify(name)}, which no agent definition file can be called; refusing to guess`);
    }
    if (names.includes(name)) {
      return halt(`${path} ${SECTION_LABEL} names retiring agent ${JSON.stringify(name)} twice; refusing to derive a retiring set that cannot be read as a set`);
    }
    names.push(name);
  }
  if (names.length !== declared) {
    return halt(`${path} ${SECTION_LABEL} declares ${declared} contract-wave deletions but names ${names.length} of them (${names.join(', ') || 'none'}); the count and the list disagree, so this census refuses to pick one`);
  }
  return Object.freeze({ ok: true, names: Object.freeze(names) });
}

export function readRosterDeclarations(path, source) {
  if (typeof source !== 'string' || source.length === 0) {
    return halt(`${path} carried no readable source, so neither the retained roster nor the retiring set can be derived from it`);
  }
  const section = readSection(path, source);
  if (!section.ok) return section;
  const retained = readRetainedRoster(path, section.body);
  if (!retained.ok) return retained;
  const retiring = readRetiringSet(path, section.body);
  if (!retiring.ok) return retiring;
  return Object.freeze({ ok: true, retained: retained.names, retiring: retiring.names });
}

export function reconcileRetirementSet(retained, retiring, onDisk) {
  const retainedSet = new Set(retained);
  const retiringSet = new Set(retiring);
  const present = retiring.filter((name) => onDisk.has(name));
  const derivationA = [...onDisk].filter((name) => !retainedSet.has(name)).sort();
  const derivationB = [...retiring].sort();
  const symmetric = [...new Set([
    ...derivationA.filter((name) => !retiringSet.has(name)),
    ...derivationB.filter((name) => !derivationA.includes(name)),
  ])].sort();
  const retired = derivationA.length === 0 && present.length === 0;
  const faults = [];
  if (retained.length === 0) {
    faults.push(`the ${SECTION_LABEL} roster table names no retained agent, so derivation A has nothing to subtract`);
  }
  if (retiring.length === 0) {
    faults.push(`${SECTION_LABEL} names no retiring agent, so a zero-occurrence verdict would report an absence it never measured`);
  }
  if (onDisk.size === 0) {
    faults.push('the canonical agent directory holds no agent definition at all, so derivation A has no input');
  }
  const both = derivationB.filter((name) => retainedSet.has(name));
  if (both.length > 0) {
    faults.push(`${both.join(', ')} is declared both retained and retiring, so no derivation can classify it`);
  }
  const unclassified = [...onDisk].filter((name) => !retainedSet.has(name) && !retiringSet.has(name)).sort();
  if (unclassified.length > 0) {
    faults.push(`${unclassified.join(', ')} on disk belongs to neither the retained roster nor the retiring set, so the classification is not closed`);
  }
  if (symmetric.length > 0 && !retired) {
    faults.push(`the two derivations of the retiring set disagree on ${symmetric.join(', ')}; derivation A yields ${derivationA.join(', ') || 'nothing'} and derivation B yields ${derivationB.join(', ')}, and this census never proceeds on one alone`);
  }
  if (faults.length > 0) return failure('halt', faults.join('; '));
  return Object.freeze({
    ok: true,
    names: derivationB,
    derivation: Object.freeze({
      shape: retired ? 'retired' : 'present-on-disk',
      retained: Object.freeze([...retained].sort()),
      derivationA: Object.freeze(derivationA),
      derivationB: Object.freeze(derivationB),
      onDisk: Object.freeze([...onDisk].sort()),
    }),
  });
}
