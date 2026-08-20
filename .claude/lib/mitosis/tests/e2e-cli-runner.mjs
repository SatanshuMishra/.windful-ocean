import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { buildGhArgv, MITOSIS_GIT_CONVERGE_EXIT, MITOSIS_GIT_OBSERVE_EXIT, MITOSIS_GIT_USAGE_EXIT, parseMitosisGitArgv } from '../../git/pr.mjs';
import { carriesComposedSkeleton } from '../../git/pr-format.mjs';
import { realPorts, runCli } from '../cli.mjs';
import { EXEC_COMPLETED, run as realRun } from '../exec-run.mjs';
import { GH_COMMAND_BINARY } from '../gh-commands.mjs';
import { PR_TOOL_PATH } from '../node-commands.mjs';
import { FAKE_ENV_KEYS } from './e2e-fake-bin.mjs';

const NODE_BINARY = 'node';
const PR_CREATE_VERB = 'pr-create';
const PR_URL_PATTERN = /\/pull\/([1-9][0-9]*)$/;

function scriptedResult(binary, argv, status, stdout, stderr) {
  return Object.freeze({
    outcome: EXEC_COMPLETED,
    binary,
    argv: Object.freeze([...argv]),
    command: binary,
    args: Object.freeze([...argv]),
    status,
    signal: null,
    stdout,
    stderr,
    error: null,
  });
}

function ghPlanPaths() {
  const recordPath = process.env[FAKE_ENV_KEYS.ghRecord];
  const planPath = process.env[FAKE_ENV_KEYS.ghPlan];
  if (typeof recordPath !== 'string' || recordPath.length === 0 || typeof planPath !== 'string' || planPath.length === 0) {
    throw new Error('e2e-cli-runner: the environment names no gh recorder and plan path, so no scripted gh reply can be selected');
  }
  return Object.freeze({ recordPath, planPath });
}

function readGhPlan(planPath) {
  let plan;
  try {
    plan = JSON.parse(readFileSync(planPath, 'utf8'));
  } catch (error) {
    throw new Error(`e2e-cli-runner: the gh plan at ${planPath} did not parse: ${error.message}`);
  }
  if (plan === null || typeof plan !== 'object' || !Array.isArray(plan.steps)) {
    throw new Error(`e2e-cli-runner: the gh plan at ${planPath} carries no steps array`);
  }
  return plan;
}

function sequencedGhStdout(planPath, step, matchedIndex) {
  if (!Array.isArray(step.stdouts)) return typeof step.stdout === 'string' ? step.stdout : '';
  if (step.stdouts.length === 0) {
    throw new Error(`e2e-cli-runner: gh plan step ${matchedIndex} declares an empty stdouts array, so the reply for this call was never written`);
  }
  const counterPath = `${planPath}.count.${matchedIndex}`;
  let seen = 0;
  try {
    seen = Number.parseInt(readFileSync(counterPath, 'utf8'), 10);
  } catch {
    seen = 0;
  }
  if (!Number.isInteger(seen) || seen < 0) seen = 0;
  writeFileSync(counterPath, String(seen + 1));
  return step.stdouts[seen < step.stdouts.length ? seen : step.stdouts.length - 1];
}

function scriptedGh(argv) {
  const { recordPath, planPath } = ghPlanPaths();
  appendFileSync(recordPath, `${JSON.stringify(argv)}\n`);
  const plan = readGhPlan(planPath);
  const matchedIndex = plan.steps.findIndex((candidate) => candidate !== null
    && typeof candidate === 'object'
    && Array.isArray(candidate.argvPrefix)
    && candidate.argvPrefix.length <= argv.length
    && candidate.argvPrefix.every((token, index) => token === argv[index]));
  if (matchedIndex === -1) {
    return scriptedResult(
      GH_COMMAND_BINARY,
      argv,
      77,
      '',
      `e2e-cli-runner: no planned gh step matches the argv ${JSON.stringify(argv)}; the double refuses rather than replying with a reply nobody planned\n`,
    );
  }
  const step = plan.steps[matchedIndex];
  const stdout = sequencedGhStdout(planPath, step, matchedIndex);
  const stderr = typeof step.stderr === 'string' ? step.stderr : '';
  const exitCode = Number.isInteger(step.exitCode) ? step.exitCode : 0;
  return scriptedResult(GH_COMMAND_BINARY, argv, exitCode, stdout, stderr);
}

function prNumberOf(url) {
  const match = typeof url === 'string' ? PR_URL_PATTERN.exec(url) : null;
  return match === null ? null : Number(match[1]);
}

function readObservedEntry(observed) {
  let list;
  try {
    list = JSON.parse(observed.stdout.trim());
  } catch (error) {
    return { error: 'the open-pull-request probe printed unparseable JSON' };
  }
  if (!Array.isArray(list)) return { error: 'the open-pull-request probe did not return a JSON array' };
  if (list.length === 0) return { entry: null };
  const entry = list[0];
  const url = entry !== null && typeof entry === 'object' && typeof entry.url === 'string' ? entry.url : null;
  const number = entry !== null && typeof entry === 'object' && Number.isInteger(entry.number) ? entry.number : prNumberOf(url);
  if (url === null || number === null) {
    return { error: 'an open pull request already exists on this head but its url could not be read; refusing to open a second one' };
  }
  return { entry: Object.freeze({ url, number, toolComposed: carriesComposedSkeleton(entry !== null && typeof entry === 'object' ? entry.body : null) }) };
}

function scriptedOpenPullRequest(argv) {
  const verbAt = argv.indexOf(PR_CREATE_VERB);
  if (verbAt === -1) {
    return scriptedResult(NODE_BINARY, argv, MITOSIS_GIT_USAGE_EXIT, '', `mitosis-git: the argv ${JSON.stringify(argv)} names no ${PR_CREATE_VERB} verb\n`);
  }
  const parsed = parseMitosisGitArgv(argv.slice(verbAt));
  if (!parsed.ok) {
    return scriptedResult(NODE_BINARY, argv, MITOSIS_GIT_USAGE_EXIT, '', `${parsed.error}\n`);
  }
  const observed = scriptedGh(buildGhArgv(PR_CREATE_VERB, 'observe', parsed.opts));
  if (observed.status !== 0) {
    return scriptedResult(NODE_BINARY, argv, MITOSIS_GIT_OBSERVE_EXIT, '', 'mitosis-git pr-create: the open-pull-request probe did not succeed; nothing was created.\n');
  }
  const read = readObservedEntry(observed);
  if (read.error !== undefined) {
    return scriptedResult(NODE_BINARY, argv, MITOSIS_GIT_OBSERVE_EXIT, '', `mitosis-git pr-create: ${read.error}; nothing was created.\n`);
  }
  if (read.entry !== null) {
    const action = read.entry.toolComposed ? 'reused' : 'reused-unverified';
    return scriptedResult(NODE_BINARY, argv, 0, `${JSON.stringify({ action, url: read.entry.url, number: read.entry.number })}\n`, '');
  }
  const created = scriptedGh(buildGhArgv(PR_CREATE_VERB, 'converge', parsed.opts));
  if (created.status !== 0) {
    return scriptedResult(NODE_BINARY, argv, MITOSIS_GIT_CONVERGE_EXIT, '', created.stderr.length > 0 ? created.stderr : `mitosis-git pr-create: the create call exited ${created.status}.\n`);
  }
  const url = created.stdout.split('\n').map((line) => line.trim()).find((line) => line.length > 0) ?? null;
  const number = prNumberOf(url);
  if (url === null || number === null) {
    return scriptedResult(NODE_BINARY, argv, MITOSIS_GIT_CONVERGE_EXIT, '', 'mitosis-git pr-create: the create call reported success but no pull-request url could be resolved.\n');
  }
  return scriptedResult(NODE_BINARY, argv, 0, `${JSON.stringify({ action: 'created', url, number })}\n`, '');
}

function scriptedRun(binary, argv, options) {
  if (binary === GH_COMMAND_BINARY) return scriptedGh(argv);
  if (binary === NODE_BINARY && Array.isArray(argv) && argv.includes(PR_TOOL_PATH)) return scriptedOpenPullRequest(argv);
  return realRun(binary, argv, options);
}

async function main() {
  const io = Object.freeze({
    log: (text) => process.stdout.write(text),
    err: (text) => process.stderr.write(text),
    readSpec: (path) => JSON.parse(readFileSync(path, 'utf8')),
  });
  const deps = Object.freeze({ run: scriptedRun });
  process.exitCode = await runCli(process.argv.slice(2), io, (config) => realPorts(config, deps), deps);
}

await main();
