const PATH_FIELDS = Object.freeze(['file_path', 'notebook_path', 'path']);

export function normalizeCommand(raw) {
  return raw
    .replace(/\\\r?\n/g, ' ')
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\s+/g, ' '))
    .filter((line) => line !== '')
    .join('\n');
}

export function segmentsOf(command) {
  return command
    .split(/[;&|\n]+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment !== '');
}

export function contextOf(payload) {
  const input = payload && typeof payload.tool_input === 'object' && payload.tool_input !== null
    ? payload.tool_input
    : {};
  const tool = typeof payload?.tool_name === 'string' ? payload.tool_name : '';
  const cwd = typeof payload?.cwd === 'string' && payload.cwd !== '' ? payload.cwd : process.cwd();
  const rawCommand = typeof input.command === 'string' ? input.command : '';
  const command = normalizeCommand(rawCommand);
  const targetPath = PATH_FIELDS
    .map((field) => input[field])
    .find((value) => typeof value === 'string' && value.trim() !== '') || '';
  return Object.freeze({
    tool,
    cwd,
    command,
    text: command.toLowerCase(),
    segments: Object.freeze(segmentsOf(command)),
    targetPath,
    empty: command === '' && targetPath === '',
  });
}

export function readPayload(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { ok: false, error: 'the hook payload was empty', payload: null };
  }
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { ok: false, error: `the hook payload was not valid JSON: ${err.message}`, payload: null };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'the hook payload was not a JSON object', payload: null };
  }
  const input = parsed.tool_input;
  if (input !== undefined && (input === null || typeof input !== 'object' || Array.isArray(input))) {
    return { ok: false, error: 'tool_input was not an object', payload: null };
  }
  if (input && 'command' in input && typeof input.command !== 'string') {
    return { ok: false, error: 'tool_input.command was not a string', payload: null };
  }
  for (const field of PATH_FIELDS) {
    if (input && field in input && input[field] !== undefined && typeof input[field] !== 'string') {
      return { ok: false, error: `tool_input.${field} was not a string`, payload: null };
    }
  }
  return { ok: true, error: '', payload: parsed };
}
