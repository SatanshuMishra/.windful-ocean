import { EXEC_COMPLETED } from './exec-run.mjs';
import { readQuotedPath } from './transcription-parsers.mjs';
import { PR_VALUE_CAP, inertValue } from '../git/pr-format.mjs';

const MODULE = 'supersede-summary';
const FIELD_SEPARATOR = '\t';
const NUMSTAT_FIELDS = 3;
const BINARY_MARKER = '-';
const COUNT_PATTERN = /^(?:0|[1-9][0-9]*)$/;
const ELLIPSIS = '...';

export const SUPERSEDE_SUMMARY_CAP = PR_VALUE_CAP;

function failed(error) {
  return Object.freeze({ ok: false, error: `${MODULE}: ${error}` });
}

function lines(text) {
  return text.split('\n').filter((line) => line.length > 0);
}

function countOf(field) {
  if (field === BINARY_MARKER) return null;
  return COUNT_PATTERN.test(field) ? Number(field) : undefined;
}

function fileOf(line) {
  const cut = line.indexOf(FIELD_SEPARATOR);
  const second = cut === -1 ? -1 : line.indexOf(FIELD_SEPARATOR, cut + 1);
  if (cut === -1 || second === -1) {
    return { error: `the interdiff line ${JSON.stringify(line)} carries fewer than the ${NUMSTAT_FIELDS} tab-separated fields numstat prints, so which of its words is the path cannot be told` };
  }
  const added = countOf(line.slice(0, cut));
  const deleted = countOf(line.slice(cut + 1, second));
  if (added === undefined || deleted === undefined) {
    return { error: `the interdiff line ${JSON.stringify(line)} carries a line count that is neither a whole number nor the marker numstat prints for a binary file, so counting it would report a total the diff never stated` };
  }
  if ((added === null) !== (deleted === null)) {
    return { error: `the interdiff line ${JSON.stringify(line)} marks one side binary and counts the other, so it is neither a counted file nor a binary one` };
  }
  const path = readQuotedPath(line.slice(second + 1), 'interdiff path');
  if (path.error !== undefined) return { error: path.error };
  if (path.value.length === 0) {
    return { error: `the interdiff line ${JSON.stringify(line)} names no path, so the file it counts cannot be identified` };
  }
  return { file: Object.freeze({ added, deleted, path: path.value }) };
}

export function parseNumstat(result) {
  if (result === null || typeof result !== 'object' || Array.isArray(result) || typeof result.outcome !== 'string') {
    return failed(`the interdiff read was handed ${JSON.stringify(result)} rather than the result of a run`);
  }
  if (result.outcome !== EXEC_COMPLETED) {
    return failed(`the interdiff read reported ${result.outcome} rather than ${EXEC_COMPLETED}; a diff that did not finish answers for nothing, and summarising its partial output would describe a superseding pull request by an interdiff nobody read`);
  }
  if (typeof result.status !== 'number') {
    return failed('the interdiff read carries no exit status, so nothing distinguishes an empty interdiff from a failed one');
  }
  if (result.status !== 0) {
    const detail = (typeof result.stderr === 'string' ? result.stderr.trim() : '') || 'no output';
    return failed(`the interdiff read exited ${result.status}: ${detail}`);
  }
  const files = [];
  for (const line of lines(typeof result.stdout === 'string' ? result.stdout : '')) {
    const read = fileOf(line);
    if (read.error !== undefined) return failed(read.error);
    files.push(read.file);
  }
  return Object.freeze({
    ok: true,
    files: Object.freeze(files),
    fileCount: files.length,
    binaryCount: files.filter((file) => file.added === null).length,
    added: files.reduce((total, file) => total + (file.added === null ? 0 : file.added), 0),
    deleted: files.reduce((total, file) => total + (file.deleted === null ? 0 : file.deleted), 0),
  });
}

function bound(text) {
  if (text.length <= SUPERSEDE_SUMMARY_CAP) return { summary: text, bounded: false };
  return { summary: `${text.slice(0, SUPERSEDE_SUMMARY_CAP - ELLIPSIS.length)}${ELLIPSIS}`, bounded: true };
}

function plural(count, noun) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function refusedSummary(error) {
  return Object.freeze({ ok: false, summary: null, bounded: false, error: `${MODULE}: ${error}` });
}

export function composeSupersedeSummary(read) {
  if (read === null || typeof read !== 'object' || read.ok !== true) {
    return refusedSummary('no interdiff was read, so this stage composes no summary rather than a summary of an interdiff nobody measured');
  }
  const head = `This branch changes ${plural(read.fileCount, 'file')} since the superseded head, adding ${plural(read.added, 'line')} and removing ${plural(read.deleted, 'line')}.`;
  const { summary, bounded } = bound(head);
  const inert = inertValue(summary, SUPERSEDE_SUMMARY_CAP);
  if (inert === summary) {
    return Object.freeze({ ok: true, summary, bounded, composedLength: head.length });
  }
  return refusedSummary(`the composed summary ${JSON.stringify(head)} is not a value the pull-request tool would carry unchanged, and this stage publishes the branch before it opens the pull request, so it refuses here rather than composing a value that invocation rejects`);
}

function ran(status, stdout) {
  return Object.freeze({ outcome: EXEC_COMPLETED, status, stdout, stderr: '', signal: null, error: null });
}

const LONG_INTERDIFF = Array.from(
  { length: 400 },
  (unused, index) => `1\t1\tsrc/a-very-long-directory-name/module-${index}/index.ts`,
).join('\n');

export function supersedeSummaryProbes() {
  const ordinary = composeSupersedeSummary(parseNumstat(ran(0, '12\t3\tsrc/a.ts\n0\t7\tsrc/b.ts\n')));
  const empty = composeSupersedeSummary(parseNumstat(ran(0, '')));
  const long = composeSupersedeSummary(parseNumstat(ran(0, `${LONG_INTERDIFF}\n`)));
  const refusedRead = parseNumstat(ran(0, 'not a numstat line\n'));
  const refused = composeSupersedeSummary(refusedRead);
  const nonAscii = composeSupersedeSummary(parseNumstat(ran(0, `1\t1\t"src/caf\\303\\251.txt"\n2\t0\tsrc/a.ts\n`)));
  return Object.freeze([
    Object.freeze({
      name: 'an ordinary interdiff composes the counts it measured',
      ok: ordinary.ok === true
        && ordinary.summary === 'This branch changes 2 files since the superseded head, adding 12 lines and removing 10 lines.',
      detail: ordinary.ok === true ? ordinary.summary : ordinary.error,
    }),
    Object.freeze({
      name: 'an empty interdiff composes a summary that says so',
      ok: empty.ok === true
        && empty.summary === 'This branch changes 0 files since the superseded head, adding 0 lines and removing 0 lines.',
      detail: empty.ok === true ? empty.summary : empty.error,
    }),
    Object.freeze({
      name: `a summary past the pr-create value cap would be cut here to ${SUPERSEDE_SUMMARY_CAP}, and one built from bare counts never reaches it`,
      ok: long.ok === true
        && long.summary.length <= SUPERSEDE_SUMMARY_CAP
        && long.summary.startsWith('This branch changes 400 files')
        && long.bounded === false
        && inertValue(long.summary, SUPERSEDE_SUMMARY_CAP) === long.summary,
      detail: long.ok === true ? `${long.summary.length} character(s) from a composition of ${long.composedLength}` : long.error,
    }),
    Object.freeze({
      name: 'an interdiff line the reader cannot split composes no summary',
      ok: refusedRead.ok === false && refused.ok === false && refused.summary === null,
      detail: refusedRead.ok === false ? refusedRead.error : 'a line this reader cannot split was summarised anyway',
    }),
    Object.freeze({
      name: 'a path this reader cannot carry inertly is counted rather than named, and the summary carries no path at all',
      ok: nonAscii.ok === true
        && inertValue(nonAscii.summary, SUPERSEDE_SUMMARY_CAP) === nonAscii.summary
        && !nonAscii.summary.includes('src/caf')
        && !nonAscii.summary.includes('src/a.ts'),
      detail: nonAscii.ok === true ? nonAscii.summary : nonAscii.error,
    }),
  ]);
}
