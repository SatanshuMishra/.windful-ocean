import { isAbsolute } from 'node:path';

export const TSC_DIAGNOSTIC_FORMS = Object.freeze([
  Object.freeze({
    name: 'file-qualified diagnostic',
    pattern: /^(?<file>[^(]+)\((?<line>\d+),(?<column>\d+)\): (?<severity>error|warning) (?<code>TS\d+): (?<message>.*)$/,
  }),
  Object.freeze({
    name: 'global diagnostic',
    pattern: /^(?<severity>error|warning) (?<code>TS\d+): (?<message>.*)$/,
  }),
]);

export const TSC_CONTINUATION_FORM = Object.freeze({
  name: 'chained message continuation',
  pattern: /^\s+\S/,
});

export const TSC_LISTED_FILE_FORM = Object.freeze({
  name: 'absolute listed file path',
  matches: (line) => line.length > 0 && line === line.trim() && isAbsolute(line),
});

function declaredFormNames() {
  return TSC_DIAGNOSTIC_FORMS.map((candidate) => candidate.name).join(', ');
}

function diagnosticFormOf(line) {
  return TSC_DIAGNOSTIC_FORMS.find((candidate) => candidate.pattern.test(line));
}

function stdoutLines(stdout) {
  return stdout.split('\n').map((line) => line.replace(/\r$/, ''));
}

export function censusTscLines(stdout) {
  if (typeof stdout !== 'string') {
    return { ok: false, error: `the tsc output was ${JSON.stringify(stdout)} rather than text, so no line could be classified` };
  }
  const collected = [];
  const lines = stdoutLines(stdout);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim().length === 0) continue;
    const form = diagnosticFormOf(line);
    if (form !== undefined) {
      const matched = form.pattern.exec(line).groups;
      collected.push(Object.freeze({
        file: matched.file === undefined ? '' : matched.file,
        code: matched.code,
        severity: matched.severity,
        message: matched.message,
        continuations: Object.freeze([]),
      }));
      continue;
    }
    if (TSC_CONTINUATION_FORM.pattern.test(line) && collected.length > 0) {
      const previous = collected[collected.length - 1];
      collected[collected.length - 1] = Object.freeze({ ...previous, continuations: Object.freeze([...previous.continuations, line]) });
      continue;
    }
    return {
      ok: false,
      error: `tsc line ${index + 1} is neither blank, one of the ${TSC_DIAGNOSTIC_FORMS.length} declared diagnostic forms (${declaredFormNames()}), nor an indented ${TSC_CONTINUATION_FORM.name} of a diagnostic already named: ${JSON.stringify(line)}; refusing to classify it rather than skipping it into a bucket`,
    };
  }
  const diagnostics = collected.map((entry) => Object.freeze({
    file: entry.file,
    code: entry.code,
    severity: entry.severity,
    message: [entry.message, ...entry.continuations].join('\n'),
  }));
  return { ok: true, diagnostics: Object.freeze(diagnostics) };
}

export function censusListedFiles(stdout) {
  if (typeof stdout !== 'string') {
    return { ok: false, error: `the tsc file list was ${JSON.stringify(stdout)} rather than text, so no line could be classified` };
  }
  const files = [];
  const lines = stdoutLines(stdout);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim().length === 0) continue;
    if (diagnosticFormOf(line) !== undefined) continue;
    if (TSC_CONTINUATION_FORM.pattern.test(line)) continue;
    if (TSC_LISTED_FILE_FORM.matches(line)) {
      files.push(line);
      continue;
    }
    return {
      ok: false,
      error: `tsc file-list line ${index + 1} is neither blank, one of the ${TSC_DIAGNOSTIC_FORMS.length} declared diagnostic forms (${declaredFormNames()}), an indented ${TSC_CONTINUATION_FORM.name}, nor an ${TSC_LISTED_FILE_FORM.name}: ${JSON.stringify(line)}; refusing to read it as a checked file path rather than skipping it into a bucket`,
    };
  }
  return { ok: true, files: Object.freeze(files) };
}
