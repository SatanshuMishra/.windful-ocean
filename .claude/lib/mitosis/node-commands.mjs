import { validateRefToken } from './checkpoint.mjs';
import { PR_VALUE_CAP } from '../git/pr-format.mjs';

export const NODE_COMMAND_BINARY = 'node';
export const NODE_PR_VALUE_CAP = PR_VALUE_CAP;

const MODULE = 'node-commands';
const NUL = String.fromCharCode(0);
const OPTION_LEAD = '-';
const FIELD_INDIRECTION_SIGIL = '@';
const NEWLINE = /[\r\n]/;
const PR_ORIGIN_MACHINE = 'machine';
const PR_CREATE = 'pr-create';
const PR_TOOL = 'pr.mjs';
const FOLD_TOOL = 'fold-run-log.mjs';
const RUN_JOURNAL = '.mitosis/run.json';
const DEPENDS_SEPARATOR = ',';
const UNIT_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const CHANGED_LINES_PATTERN = /^(0|[1-9][0-9]{0,6})$/;
const HTTPS_PR_URL = /^https:\/\/[A-Za-z0-9.-]+\/[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*\/pull\/[1-9][0-9]*$/;

function refuse(where, message) {
  throw new TypeError(`${MODULE}: ${where} ${message}`);
}

function textIn(where, field, value) {
  if (typeof value !== 'string' || value.length === 0) {
    refuse(where, `needs ${field} as a non-empty string, received ${value === null ? 'null' : JSON.stringify(value)}; a value the caller never spelled out would be coerced into the command`);
  }
  if (value.includes(NUL)) {
    refuse(where, `was handed a ${field} carrying a NUL byte, which no argument vector element can carry: ${JSON.stringify(value)}`);
  }
  if (value.startsWith(OPTION_LEAD)) {
    refuse(where, `was handed a ${field} beginning with ${JSON.stringify(OPTION_LEAD)}: ${JSON.stringify(value)}; the value would be read as a further option of the command rather than as the value it was passed as`);
  }
  return value;
}

function pathIn(where, field, value) {
  return textIn(where, field, value);
}

function refIn(where, field, value) {
  const text = textIn(where, field, value);
  if (!validateRefToken(text)) {
    refuse(where, `was handed a ${field} that is not a well-formed ref token: ${JSON.stringify(text)}`);
  }
  return text;
}

function prValueIn(where, field, value) {
  const text = textIn(where, field, value);
  if (text.length > NODE_PR_VALUE_CAP) {
    refuse(where, `was handed a ${field} of ${text.length} characters, longer than the ${NODE_PR_VALUE_CAP} pr-create accepts; the bound is applied here so no caller can compose a value the tool would reject after the branch was already published`);
  }
  if (text.startsWith(FIELD_INDIRECTION_SIGIL)) {
    refuse(where, `was handed a ${field} beginning with ${JSON.stringify(FIELD_INDIRECTION_SIGIL)}: ${JSON.stringify(text)}; pr-create reads an at-prefixed value as a file to read the field from rather than as the field itself`);
  }
  if (NEWLINE.test(text)) {
    refuse(where, `was handed a ${field} carrying a newline: ${JSON.stringify(text)}; pr-create renders each value as one body line, so a newline would compose structure the caller never declared`);
  }
  return text;
}

function prUrlIn(where, field, value) {
  const text = textIn(where, field, value);
  if (!HTTPS_PR_URL.test(text)) {
    refuse(where, `was handed a ${field} that is not a canonical pull-request url: ${JSON.stringify(text)}`);
  }
  return text;
}

function dependsIn(where, field, value) {
  if (!Array.isArray(value)) {
    refuse(where, `needs ${field} as an array of unit ids, received ${JSON.stringify(value)}; the incumbent emits the flag only when the unit declares parents, and a value that is not a list cannot say whether it does`);
  }
  const ids = value.map((entry, index) => {
    const text = textIn(where, `${field}[${index}]`, entry);
    if (!UNIT_ID_PATTERN.test(text)) {
      refuse(where, `was handed a ${field}[${index}] that is not a unit id: ${JSON.stringify(text)}`);
    }
    return text;
  });
  return ids;
}

function changedLinesIn(where, field, value) {
  if (value === null || value === undefined) return null;
  const text = textIn(where, field, value);
  if (!CHANGED_LINES_PATTERN.test(text)) {
    refuse(where, `was handed a ${field} that is not the changed-lines integer pr-create accepts: ${JSON.stringify(text)}; the incumbent tells the caller to delete both tokens rather than estimate one, so an unreadable count omits the flag instead of guessing it`);
  }
  return text;
}

const RECONCILE = Object.freeze({
  'fold-run-log': (v, t) => [`${t.path('libDir', v.libDir)}/${FOLD_TOOL}`, `${t.path('repoRoot', v.repoRoot)}/${RUN_JOURNAL}`],
});

const SUPERSEDE = Object.freeze({
  'open-pr': (v, t) => [
    `${t.path('gitLibDir', v.gitLibDir)}/${PR_TOOL}`, PR_CREATE,
    '--repo', t.prValue('repoSlug', v.repoSlug),
    '--head', t.ref('supersedeBranch', v.supersedeBranch),
    '--base', t.ref('baseBranch', v.baseBranch),
    '--title', t.prValue('title', v.title),
    '--origin', PR_ORIGIN_MACHINE,
    '--provenance', t.prValue('provenance', v.provenance),
    '--why', t.prValue('why', v.why),
    '--why', t.prValue('rationale', v.rationale),
    '--what', t.prValue('what', v.what),
    '--what', t.prValue('summary', v.summary),
    '--not-verified', t.prValue('notVerified', v.notVerified),
    '--supersedes', t.prUrl('supersedes', v.supersedes),
  ],
});

const SHIP = Object.freeze({
  'open-pr': (v, t) => {
    const depends = t.depends('dependsIds', v.dependsIds);
    const changedLines = t.changedLines('changedLines', v.changedLines);
    return [
      `${t.path('gitLibDir', v.gitLibDir)}/${PR_TOOL}`, PR_CREATE,
      '--repo', t.prValue('repoSlug', v.repoSlug),
      '--head', t.ref('integrationBranch', v.integrationBranch),
      '--base', t.ref('baseBranch', v.baseBranch),
      '--title', t.prValue('title', v.title),
      '--origin', PR_ORIGIN_MACHINE,
      '--provenance', t.prValue('provenance', v.provenance),
      '--why', t.prValue('why', v.why),
      '--what', t.prValue('what', v.what),
      '--not-verified', t.prValue('notVerified', v.notVerified),
      ...(depends.length === 0 ? [] : ['--depends', depends.join(DEPENDS_SEPARATOR)]),
      ...(changedLines === null ? [] : ['--changed-lines', changedLines]),
    ];
  },
});

export const NODE_SITE_COMMANDS = Object.freeze({
  reconcile: RECONCILE,
  supersede: SUPERSEDE,
  ship: SHIP,
});

export const NODE_SITES = Object.freeze(Object.keys(NODE_SITE_COMMANDS));

export function buildNodeCommand(site, step, values) {
  const steps = NODE_SITE_COMMANDS[site];
  if (steps === undefined) {
    refuse(`the site ${JSON.stringify(site)}`, `is not one this module transcribes; the transcribed sites are ${NODE_SITES.join(', ')}`);
  }
  const build = steps[step];
  if (typeof build !== 'function') {
    refuse(`the step ${JSON.stringify(step)} of ${site}`, `is not one this module transcribes; its steps are ${Object.keys(steps).join(', ')}`);
  }
  if (values === null || typeof values !== 'object' || Array.isArray(values)) {
    refuse(`${site}/${step}`, `needs its values as an object, received ${JSON.stringify(values)}`);
  }
  const where = `${site}/${step}`;
  const validator = Object.freeze({
    text: (field, value) => textIn(where, field, value),
    path: (field, value) => pathIn(where, field, value),
    ref: (field, value) => refIn(where, field, value),
    prValue: (field, value) => prValueIn(where, field, value),
    prUrl: (field, value) => prUrlIn(where, field, value),
    depends: (field, value) => dependsIn(where, field, value),
    changedLines: (field, value) => changedLinesIn(where, field, value),
  });
  return Object.freeze(build(values, validator));
}
