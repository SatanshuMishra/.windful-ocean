import { END_OF_OPTIONS, GIT_SITE_COMMANDS, PATH_SEPARATOR_ARGUMENT, buildGitCommand } from './git-commands.mjs';
import { GIT_COMMAND_FIXTURES, builderInputs } from './git-command-fixtures.mjs';

const MODULE = 'git-command-separation';
const VALUE_FLAGS = Object.freeze(['-C', '-c', '-m', '--onto']);

export const SEPARATED = 'separated';
export const FLAG_VALUE = 'flag-value';
export const PREFIXED = 'prefixed';
export const UNSEPARATED = 'unseparated';

const REV_PARSE_ECHO = 'git rev-parse without --verify echoes an argument it does not recognise back on stdout, so the separator itself would be printed as part of the object name this step reads and the sha reader would refuse it; the value is bounded structurally instead, by the ref token this builder validates before the command exists';

export const SEPARATION_EXCEPTIONS = Object.freeze({
  'branch-compose/resolve-parent': Object.freeze({ ref: REV_PARSE_ECHO }),
  'checkpoint-push/resolve-tip': Object.freeze({ integrationBranch: REV_PARSE_ECHO }),
  'manifest-publish/commit-tree': Object.freeze({
    tree: 'git commit-tree does not accept --end-of-options and exits 128 with must give exactly one tree when it is passed, so the separator cannot be added to this command at all; the value is bounded structurally instead, by the ref token this builder validates before the command exists',
  }),
});

function halt(error) {
  return Object.freeze({ ok: false, error: `${MODULE}: ${error}` });
}

function classifyOccurrence(argv, index, value) {
  if (!argv[index].startsWith(value)) return PREFIXED;
  const before = argv.slice(0, index);
  if (before.includes(END_OF_OPTIONS) || before.includes(PATH_SEPARATOR_ARGUMENT)) return SEPARATED;
  if (index > 0 && VALUE_FLAGS.includes(argv[index - 1])) return FLAG_VALUE;
  return UNSEPARATED;
}

function classifyValue(argv, value) {
  const found = argv
    .map((token, index) => (token.includes(value) ? classifyOccurrence(argv, index, value) : null))
    .filter((verdict) => verdict !== null);
  if (found.length === 0) return null;
  return found.includes(UNSEPARATED) ? UNSEPARATED : found[0];
}

function fixtureClassifications(fixture) {
  const at = `${fixture.site}/${fixture.step}`;
  const argv = [...buildGitCommand(fixture.site, fixture.step, builderInputs(fixture))];
  const rows = [];
  for (const binding of Object.values(fixture.placeholders)) {
    const values = Array.isArray(binding.value) ? binding.value : [binding.value];
    const verdicts = values.map((value) => classifyValue(argv, value));
    if (verdicts.some((verdict) => verdict === null)) {
      return { error: `${at} binds ${binding.field} to a value that appears nowhere in the command this builder produced, so where git would read it cannot be classified at all` };
    }
    rows.push(Object.freeze({
      at,
      field: binding.field,
      verdict: verdicts.includes(UNSEPARATED) ? UNSEPARATED : verdicts[0],
    }));
  }
  return { rows };
}

export function censusPositionalSeparation(fixtures = GIT_COMMAND_FIXTURES, exceptions = SEPARATION_EXCEPTIONS) {
  if (!Array.isArray(fixtures) || fixtures.length === 0) {
    return halt('the separation census was handed no command to classify, so it would attest a bound it never measured');
  }
  const declared = Object.keys(exceptions).filter((key) => {
    const [site, step] = key.split('/');
    const steps = GIT_SITE_COMMANDS[site];
    return steps === undefined || typeof steps[step] !== 'function';
  });
  if (declared.length > 0) {
    return halt(`these separation exceptions name a step no builder declares: ${declared.join(', ')}; an exception nothing matches keeps a caller value admitted next to git option parser after the command that justified it is gone`);
  }
  const rows = [];
  for (const fixture of fixtures) {
    let measured;
    try {
      measured = fixtureClassifications(fixture);
    } catch (error) {
      return halt(`${fixture.site}/${fixture.step} could not be built from the values its fixture binds, so its caller values could not be classified: ${error && error.message ? error.message : 'unknown failure'}`);
    }
    if (measured.error !== undefined) return halt(measured.error);
    rows.push(...measured.rows);
  }
  const excused = new Set();
  const exposed = [];
  for (const row of rows) {
    const reason = Object.hasOwn(exceptions, row.at) ? exceptions[row.at][row.field] : undefined;
    if (row.verdict !== UNSEPARATED) {
      if (typeof reason === 'string') {
        exposed.push(`${row.at} ${row.field} is already ${row.verdict} yet carries a separation exception`);
      }
      continue;
    }
    if (typeof reason !== 'string' || reason.length === 0) {
      exposed.push(`${row.at} ${row.field} reaches git as a positional argument with no ${END_OF_OPTIONS} and no ${PATH_SEPARATOR_ARGUMENT} before it, and no stated reason says why it cannot carry one`);
      continue;
    }
    excused.add(`${row.at} ${row.field}`);
  }
  if (exposed.length > 0) {
    return halt(`${exposed.join(' | ')}; a caller value that lands where git reads options is separated from them or carries a stated reason why it cannot be, never neither`);
  }
  const stale = Object.entries(exceptions).flatMap(([at, fields]) => Object.keys(fields)
    .filter((field) => !excused.has(`${at} ${field}`))
    .map((field) => `${at} ${field}`));
  if (stale.length > 0) {
    return halt(`these separation exceptions excuse a caller value that is not exposed: ${stale.join(', ')}; an exception nothing needs keeps a value admitted next to git option parser for a reason that stopped applying`);
  }
  return Object.freeze({
    ok: true,
    valueCount: rows.length,
    separatedCount: rows.filter((row) => row.verdict === SEPARATED).length,
    flagValueCount: rows.filter((row) => row.verdict === FLAG_VALUE).length,
    prefixedCount: rows.filter((row) => row.verdict === PREFIXED).length,
    exceptions: Object.freeze([...excused].sort()),
    classifications: Object.freeze(rows.map((row) => `${row.at} ${row.field}: ${row.verdict}`)),
  });
}

export const REF_SHAPED = 'ref';
export const PATH_SHAPED = 'path';

const HOSTILE_VALUES = Object.freeze([
  Object.freeze({ name: 'an upload-pack option spelled as a value', value: '--upload-pack=touch /tmp/mitosis-pwned;true', refusedFor: Object.freeze([REF_SHAPED, PATH_SHAPED]) }),
  Object.freeze({ name: 'a bare short option', value: '-x', refusedFor: Object.freeze([REF_SHAPED, PATH_SHAPED]) }),
  Object.freeze({ name: 'a ref carrying a parent traversal', value: 'refs/../../etc/passwd', refusedFor: Object.freeze([REF_SHAPED]) }),
  Object.freeze({ name: 'a ref carrying shell metacharacters', value: 'refs/heads/$(touch /tmp/mitosis-pwned)', refusedFor: Object.freeze([REF_SHAPED]) }),
  Object.freeze({ name: 'a value carrying a NUL byte', value: `refs/heads/main${String.fromCharCode(0)}x`, refusedFor: Object.freeze([REF_SHAPED, PATH_SHAPED]) }),
  Object.freeze({ name: 'a value that is not a string at all', value: null, refusedFor: Object.freeze([REF_SHAPED, PATH_SHAPED]) }),
]);

export const FETCH_VALUE_SITES = Object.freeze([
  Object.freeze({ site: 'divergence-check', step: 'fetch-base', field: 'baseBranch', shape: REF_SHAPED }),
  Object.freeze({ site: 'divergence-check', step: 'fetch-checkpoint', field: 'ref', shape: REF_SHAPED }),
  Object.freeze({ site: 'prepare-probe', step: 'fetch-base', field: 'baseBranch', shape: REF_SHAPED }),
  Object.freeze({ site: 'restore', step: 'fetch-checkpoint', field: 'builtRef', shape: REF_SHAPED }),
  Object.freeze({ site: 'branch-compose', step: 'fetch-base', field: 'baseBranch', shape: REF_SHAPED }),
  Object.freeze({ site: 'branch-compose', step: 'fetch-parent', field: 'ref', shape: REF_SHAPED }),
  Object.freeze({ site: 'branch-prep', step: 'fetch-base', field: 'baseBranch', shape: REF_SHAPED }),
  Object.freeze({ site: 'integrate', step: 'worktree-remove', field: 'worktreePath', shape: PATH_SHAPED }),
  Object.freeze({ site: 'manifest-publish', step: 'push', field: 'manifestRef', shape: REF_SHAPED }),
]);

export function refusedValueProbes(sites = FETCH_VALUE_SITES, fixtures = GIT_COMMAND_FIXTURES) {
  return Object.freeze(sites.flatMap((entry) => {
    const at = `${entry.site}/${entry.step}`;
    const fixture = fixtures.find((candidate) => candidate.site === entry.site && candidate.step === entry.step);
    if (fixture === undefined) {
      return [Object.freeze({ name: `${at} ${entry.field}`, refused: false, detail: 'no fixture binds this step, so no value was offered to the builder and this probe proves nothing' })];
    }
    const inputs = builderInputs(fixture);
    if (!Object.hasOwn(inputs, entry.field)) {
      return [Object.freeze({ name: `${at} ${entry.field}`, refused: false, detail: 'this step binds no such field, so the probe offered the builder nothing' })];
    }
    return HOSTILE_VALUES.filter((hostile) => hostile.refusedFor.includes(entry.shape)).map((hostile) => {
      let built = null;
      try {
        built = [...buildGitCommand(entry.site, entry.step, { ...inputs, [entry.field]: hostile.value })];
      } catch {
        return Object.freeze({ name: `${at} ${entry.field}: ${hostile.name}`, refused: true, detail: 'refused before any command existed' });
      }
      return Object.freeze({ name: `${at} ${entry.field}: ${hostile.name}`, refused: false, detail: `the builder produced ${JSON.stringify(built)}` });
    });
  }));
}
