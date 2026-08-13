const IDENT_START = /[A-Za-z_$]/;
export const IDENT_PART = /[\w$]/;
const REGEX_PRECEDERS = Object.freeze(new Set([
  '', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '~', '^', '<', '>',
  'return', 'typeof', 'case', 'in', 'of', 'do', 'else', 'yield', 'await', 'new', 'delete', 'void', 'instanceof',
]));

export function halt(message) {
  return Object.freeze({ ok: false, error: message });
}

export function lineOf(source, index) {
  let line = 1;
  for (let k = 0; k < index && k < source.length; k += 1) {
    if (source[k] === '\n') line += 1;
  }
  return line;
}

export function at(source, index) {
  return `line ${lineOf(source, index)}`;
}

export function scanJsStructure(source) {
  if (typeof source !== 'string') return halt('the source to scan must be a string');
  const n = source.length;
  const masked = source.split('');
  const stringSpans = new Map();
  const braceByOpen = new Map();
  const bracePairs = [];
  const openBraces = [];
  const templateFrames = [];
  const blank = (from, to) => { for (let k = Math.max(from, 0); k < Math.min(to, n); k += 1) masked[k] = ' '; };
  let i = 0;
  let lastToken = '';
  let inTemplateText = false;

  while (i < n) {
    if (inTemplateText) {
      let k = i;
      let stop = -1;
      let interpolated = false;
      while (k < n) {
        const t = source[k];
        if (t === '\\') { blank(k, k + 2); k += 2; continue; }
        if (t === '`') { stop = k; break; }
        if (t === '$' && source[k + 1] === '{') { stop = k; interpolated = true; break; }
        masked[k] = ' ';
        k += 1;
      }
      if (stop === -1) return halt(`an unterminated template literal begins at ${at(source, i)}`);
      if (!interpolated) {
        masked[stop] = ' ';
        inTemplateText = false;
        i = stop + 1;
        lastToken = 'value';
        continue;
      }
      templateFrames.push(openBraces.length);
      blank(stop, stop + 2);
      inTemplateText = false;
      i = stop + 2;
      lastToken = '(';
      continue;
    }

    const c = source[i];
    const next = source[i + 1];

    if (c === '/' && next === '/') {
      const nl = source.indexOf('\n', i);
      const stop = nl === -1 ? n : nl;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      if (end === -1) return halt(`an unterminated block comment begins at ${at(source, i)}`);
      blank(i, end + 2);
      i = end + 2;
      continue;
    }
    if (c === "'" || c === '"') {
      let k = i + 1;
      let closed = -1;
      while (k < n) {
        const t = source[k];
        if (t === '\\') { k += 2; continue; }
        if (t === c) { closed = k; break; }
        if (t === '\n') break;
        k += 1;
      }
      if (closed === -1) return halt(`an unterminated string literal begins at ${at(source, i)}`);
      blank(i + 1, closed);
      stringSpans.set(i, closed);
      i = closed + 1;
      lastToken = 'value';
      continue;
    }
    if (c === '`') {
      masked[i] = ' ';
      inTemplateText = true;
      i += 1;
      continue;
    }
    if (c === '{') {
      openBraces.push(i);
      i += 1;
      lastToken = '{';
      continue;
    }
    if (c === '}') {
      if (templateFrames.length > 0 && templateFrames[templateFrames.length - 1] === openBraces.length) {
        templateFrames.pop();
        masked[i] = ' ';
        inTemplateText = true;
        i += 1;
        continue;
      }
      const open = openBraces.pop();
      if (open === undefined) return halt(`an unbalanced closing brace sits at ${at(source, i)}`);
      braceByOpen.set(open, i);
      bracePairs.push({ open, close: i });
      i += 1;
      lastToken = '}';
      continue;
    }
    if (c === '/' && REGEX_PRECEDERS.has(lastToken)) {
      let k = i + 1;
      let inClass = false;
      let closed = -1;
      while (k < n) {
        const t = source[k];
        if (t === '\\') { k += 2; continue; }
        if (t === '\n') break;
        if (t === '[') inClass = true;
        else if (t === ']') inClass = false;
        else if (t === '/' && !inClass) { closed = k; break; }
        k += 1;
      }
      if (closed === -1) return halt(`an unterminated regular expression begins at ${at(source, i)}`);
      let flagsEnd = closed + 1;
      while (flagsEnd < n && /[a-z]/.test(source[flagsEnd])) flagsEnd += 1;
      blank(i, flagsEnd);
      i = flagsEnd;
      lastToken = 'value';
      continue;
    }
    if (IDENT_START.test(c)) {
      let k = i;
      while (k < n && IDENT_PART.test(source[k])) k += 1;
      lastToken = source.slice(i, k);
      i = k;
      continue;
    }
    if (/\s/.test(c)) { i += 1; continue; }
    lastToken = c;
    i += 1;
  }

  if (inTemplateText) return halt('the source ends inside a template literal');
  if (templateFrames.length > 0) return halt('the source ends inside a template interpolation');
  if (openBraces.length > 0) return halt(`the source ends with ${openBraces.length} unclosed brace(s)`);

  bracePairs.sort((a, b) => a.open - b.open);
  return Object.freeze({ ok: true, masked: masked.join(''), stringSpans, braceByOpen, bracePairs });
}

export function nextCodeIndex(masked, from) {
  let k = Math.max(from, 0);
  while (k < masked.length && /\s/.test(masked[k])) k += 1;
  return k;
}

export function previousCodeIndex(masked, from) {
  let k = Math.min(from, masked.length - 1);
  while (k >= 0 && /\s/.test(masked[k])) k -= 1;
  return k;
}

export function readIdentifier(masked, index) {
  if (index < 0 || index >= masked.length || !IDENT_START.test(masked[index])) return null;
  let k = index;
  while (k < masked.length && IDENT_PART.test(masked[k])) k += 1;
  return masked.slice(index, k);
}

export function wordEndingAt(masked, index) {
  if (index < 0 || !IDENT_PART.test(masked[index])) return '';
  let start = index;
  while (start >= 0 && IDENT_PART.test(masked[start])) start -= 1;
  return masked.slice(start + 1, index + 1);
}
