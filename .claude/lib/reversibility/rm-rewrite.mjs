const RM_BINARIES = Object.freeze(['rm', '/bin/rm', '/usr/bin/rm']);
const SHORT_FLAGS = Object.freeze(new Set(['f', 'i', 'I', 'r', 'R', 'd', 'P', 'v', 'W', 'x']));
const LONG_FLAGS = Object.freeze(new Set([
  '--force',
  '--interactive',
  '--recursive',
  '--dir',
  '--verbose',
  '--one-file-system',
  '--preserve-root',
  '--no-preserve-root',
]));
const UNSAFE_OUTSIDE_QUOTES = Object.freeze(['|', '&', ';', '<', '>', '(', ')', '`', '$', '\n', '\r', '\\']);

export function tokenize(command) {
  const tokens = [];
  let raw = '';
  let quote = '';
  for (const char of command) {
    if (quote !== '') {
      raw += char;
      if (char === quote) quote = '';
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      raw += char;
      continue;
    }
    if (UNSAFE_OUTSIDE_QUOTES.includes(char)) return { ok: false, tokens: [], reason: `unquoted ${JSON.stringify(char)}` };
    if (char === ' ' || char === '\t') {
      if (raw !== '') tokens.push(raw);
      raw = '';
      continue;
    }
    raw += char;
  }
  if (quote !== '') return { ok: false, tokens: [], reason: 'unterminated quote' };
  if (raw !== '') tokens.push(raw);
  return { ok: true, tokens, reason: '' };
}

function classify(token) {
  if (token === '--') return 'separator';
  if (!token.startsWith('-') || token === '-') return 'operand';
  if (token.startsWith('--')) return LONG_FLAGS.has(token) ? 'flag' : 'unknown';
  return [...token.slice(1)].every((letter) => SHORT_FLAGS.has(letter)) ? 'flag' : 'unknown';
}

export function rewriteRm(command, config) {
  const source = typeof command === 'string' ? command.trim() : '';
  if (source === '') return { rewritten: null, reason: 'empty command' };

  const parsed = tokenize(source);
  if (!parsed.ok) return { rewritten: null, reason: `not a single simple command: ${parsed.reason}` };

  const [binary, ...rest] = parsed.tokens;
  if (!RM_BINARIES.includes(binary)) return { rewritten: null, reason: 'not an rm invocation' };

  const operands = [];
  for (const token of rest) {
    const kind = classify(token);
    if (kind === 'unknown') return { rewritten: null, reason: `unrecognized rm option ${token}` };
    if (kind === 'flag' || kind === 'separator') continue;
    operands.push(token);
  }

  if (operands.length === 0) return { rewritten: null, reason: 'no operands to recover' };
  if (operands.some((operand) => operand.startsWith('-'))) {
    return { rewritten: null, reason: 'an operand would be read as an option by the trash binary' };
  }

  return {
    rewritten: `${config.trashBin} ${operands.join(' ')}`,
    reason: 'rm rewritten to a recoverable delete',
  };
}
