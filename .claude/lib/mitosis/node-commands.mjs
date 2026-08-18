import { fileURLToPath } from 'node:url';
import { validateRefToken } from './checkpoint.mjs';
import {
  PR_CHANGED_LINES_PATTERN,
  PR_ORIGINS,
  PR_PROVENANCE_PATTERN,
  PR_TITLE_CAP,
  PR_TITLE_PATTERN,
  PR_VALUE_CAP,
  SUPERSEDES_PREFIX,
  inertValue,
} from '../git/pr-format.mjs';

export const NODE_COMMAND_BINARY = 'node';
export const NODE_END_OF_OPTIONS = '--';
export const NODE_SUPERSEDES_CAP = PR_VALUE_CAP - SUPERSEDES_PREFIX.length;
export const RUN_JOURNAL_PATH = '.mitosis/run.json';

const MODULE = 'node-commands';
const NUL = String.fromCharCode(0);
const OPTION_LEAD = '-';
const PR_CREATE = 'pr-create';
const PR_ORIGIN_MACHINE = PR_ORIGINS[0];
const DEPENDS_SEPARATOR = ',';
const UNIT_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const PATH_SEPARATOR = '/';
const PARENT_SEGMENT = '..';
const PATH_METACHARACTER = /[\s;&|<>$`'"()*?![\]{}\\]/;
const PR_URL_HOST = 'github.com';
const HTTPS_PR_URL = new RegExp(`^https://${PR_URL_HOST.split('.').join('\\.')}/[A-Za-z0-9][A-Za-z0-9._-]*/[A-Za-z0-9][A-Za-z0-9._-]*/pull/[1-9][0-9]*$`);

export const FOLD_TOOL_PATH = fileURLToPath(new URL('./fold-run-log.mjs', import.meta.url));
export const PR_TOOL_PATH = fileURLToPath(new URL('../git/pr.mjs', import.meta.url));

function directoryOf(toolPath) {
  return toolPath.slice(0, toolPath.lastIndexOf(PATH_SEPARATOR));
}

function basenameOf(toolPath) {
  return toolPath.slice(toolPath.lastIndexOf(PATH_SEPARATOR) + 1);
}

export const FOLD_TOOL_DIRECTORY = directoryOf(FOLD_TOOL_PATH);
export const PR_TOOL_DIRECTORY = directoryOf(PR_TOOL_PATH);

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

function pathShapeIn(where, field, value) {
  const text = textIn(where, field, value);
  if (!text.startsWith(PATH_SEPARATOR)) {
    refuse(where, `was handed a ${field} that is not an absolute path: ${JSON.stringify(text)}; a relative path resolves against whatever directory the process happens to be in`);
  }
  if (text.split(PATH_SEPARATOR).includes(PARENT_SEGMENT)) {
    refuse(where, `was handed a ${field} carrying a parent traversal: ${JSON.stringify(text)}; a traversal walks out of the directory the caller named and reaches a file this command was never pointed at`);
  }
  if (PATH_METACHARACTER.test(text)) {
    refuse(where, `was handed a ${field} carrying a shell metacharacter or whitespace: ${JSON.stringify(text)}`);
  }
  if (text.endsWith(PATH_SEPARATOR)) {
    refuse(where, `was handed a ${field} ending in ${JSON.stringify(PATH_SEPARATOR)}: ${JSON.stringify(text)}; the composed path would carry an empty segment`);
  }
  return text;
}

function scriptPathIn(where, field, value, toolPath) {
  const text = pathShapeIn(where, field, value);
  const composed = `${text}${PATH_SEPARATOR}${basenameOf(toolPath)}`;
  if (composed !== toolPath) {
    refuse(where, `was handed a ${field} that composes the program path ${JSON.stringify(composed)} rather than ${JSON.stringify(toolPath)}; this element names the program node executes rather than data it reads, and no option separator makes a program name inert, so the directory is confined to the one this module resolves the tool from`);
  }
  return text;
}

function dataPathIn(where, field, value) {
  return pathShapeIn(where, field, value);
}

function refIn(where, field, value) {
  const text = textIn(where, field, value);
  if (!validateRefToken(text)) {
    refuse(where, `was handed a ${field} that is not a well-formed ref token: ${JSON.stringify(text)}`);
  }
  return text;
}

function prValueIn(where, field, value, cap = PR_VALUE_CAP) {
  textIn(where, field, value);
  const inert = inertValue(value, cap);
  if (inert !== value) {
    refuse(where, `was handed a ${field} the pull-request tool refuses as a body value or would rewrite before using it: ${JSON.stringify(value)} reads back as ${JSON.stringify(inert)}; that tool caps the value at ${cap} characters and rejects an at-prefixed value, a byte outside printable ascii, a tag or block opener, a setext underline and a reserved field or structure prefix, and it rejects the whole invocation rather than the one field, so the bound is applied here against that same reader rather than restated as a second, narrower copy of it`);
  }
  return inert;
}

function prTitleIn(where, field, value) {
  const text = prValueIn(where, field, value, PR_TITLE_CAP);
  if (!PR_TITLE_PATTERN.test(text)) {
    refuse(where, `was handed a ${field} that is not a conventional-commits pull-request title: ${JSON.stringify(text)}; the pull-request tool composes the squash commit subject from it and rejects the invocation otherwise`);
  }
  return text;
}

function prProvenanceIn(where, field, value) {
  const text = prValueIn(where, field, value);
  if (!PR_PROVENANCE_PATTERN.test(text)) {
    refuse(where, `was handed a ${field} that is not an agent and model provenance token: ${JSON.stringify(text)}`);
  }
  return text;
}

function prUrlIn(where, field, value) {
  const text = prValueIn(where, field, value, NODE_SUPERSEDES_CAP);
  if (!HTTPS_PR_URL.test(text)) {
    refuse(where, `was handed a ${field} that is not a canonical ${PR_URL_HOST} pull-request url: ${JSON.stringify(text)}; the pull-request tool canonicalises this value against that same host, so a url this builder admits and that tool rewrites would name a different pull request`);
  }
  return text;
}

function dependsIn(where, field, value) {
  if (!Array.isArray(value)) {
    refuse(where, `needs ${field} as an array of unit ids, received ${JSON.stringify(value)}; the incumbent emits the flag only when the unit declares parents, and a value that is not a list cannot say whether it does`);
  }
  return value.map((entry, index) => {
    const text = textIn(where, `${field}[${index}]`, entry);
    if (!UNIT_ID_PATTERN.test(text)) {
      refuse(where, `was handed a ${field}[${index}] that is not a unit id: ${JSON.stringify(text)}`);
    }
    return text;
  });
}

function changedLinesIn(where, field, value) {
  if (value === null || value === undefined) return null;
  const text = textIn(where, field, value);
  if (!PR_CHANGED_LINES_PATTERN.test(text)) {
    refuse(where, `was handed a ${field} that is not the changed-lines integer the pull-request tool accepts: ${JSON.stringify(text)}; the incumbent tells the caller to delete both tokens rather than estimate one, so an unreadable count omits the flag instead of guessing it`);
  }
  return text;
}

const RECONCILE = Object.freeze({
  'fold-run-log': (v, t) => [
    NODE_END_OF_OPTIONS,
    `${t.script('libDir', v.libDir, FOLD_TOOL_PATH)}${PATH_SEPARATOR}${basenameOf(FOLD_TOOL_PATH)}`,
    `${t.dataPath('repoRoot', v.repoRoot)}${PATH_SEPARATOR}${RUN_JOURNAL_PATH}`,
  ],
});

const SUPERSEDE = Object.freeze({
  'open-pr': (v, t) => [
    NODE_END_OF_OPTIONS,
    `${t.script('gitLibDir', v.gitLibDir, PR_TOOL_PATH)}${PATH_SEPARATOR}${basenameOf(PR_TOOL_PATH)}`, PR_CREATE,
    '--repo', t.prValue('repoSlug', v.repoSlug),
    '--head', t.ref('supersedeBranch', v.supersedeBranch),
    '--base', t.ref('baseBranch', v.baseBranch),
    '--title', t.prTitle('title', v.title),
    '--origin', PR_ORIGIN_MACHINE,
    '--provenance', t.prProvenance('provenance', v.provenance),
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
    const verified = v.verified === null || v.verified === undefined ? null : t.prValue('verified', v.verified);
    return [
      NODE_END_OF_OPTIONS,
      `${t.script('gitLibDir', v.gitLibDir, PR_TOOL_PATH)}${PATH_SEPARATOR}${basenameOf(PR_TOOL_PATH)}`, PR_CREATE,
      '--repo', t.prValue('repoSlug', v.repoSlug),
      '--head', t.ref('integrationBranch', v.integrationBranch),
      '--base', t.ref('baseBranch', v.baseBranch),
      '--title', t.prTitle('title', v.title),
      '--origin', PR_ORIGIN_MACHINE,
      '--provenance', t.prProvenance('provenance', v.provenance),
      '--why', t.prValue('why', v.why),
      '--what', t.prValue('what', v.what),
      ...(verified === null ? [] : ['--verified', verified]),
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
    script: (field, value, toolPath) => scriptPathIn(where, field, value, toolPath),
    dataPath: (field, value) => dataPathIn(where, field, value),
    ref: (field, value) => refIn(where, field, value),
    prValue: (field, value) => prValueIn(where, field, value),
    prTitle: (field, value) => prTitleIn(where, field, value),
    prProvenance: (field, value) => prProvenanceIn(where, field, value),
    prUrl: (field, value) => prUrlIn(where, field, value),
    depends: (field, value) => dependsIn(where, field, value),
    changedLines: (field, value) => changedLinesIn(where, field, value),
  });
  return Object.freeze(build(values, validator));
}
