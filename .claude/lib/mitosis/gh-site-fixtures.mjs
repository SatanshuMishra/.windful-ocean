import { GH_COMMAND_BINARY } from './gh-commands.mjs';
import {
  FOLD_TOOL_DIRECTORY,
  NODE_COMMAND_BINARY,
  PR_TOOL_DIRECTORY,
  RUN_JOURNAL_PATH,
} from './node-commands.mjs';
import { GIT_COMMAND_BINARY } from './git-commands.mjs';
import { EXEC_TIMEOUT_EXPIRED } from './exec-run.mjs';
import { SPEC_HASH_INCUMBENT_COMMAND } from './spec-hash.mjs';

export const GH_SITE_FIXTURE_PARENT_SHA = '4656b8ad';

const REPO = Object.freeze({ field: 'repoRoot', value: '/repo' });
const BASE = Object.freeze({ field: 'baseBranch', value: 'main' });
const IB = Object.freeze({ field: 'integrationBranch', value: 'mitosis/c4c-gh-sites' });
const SUPERSEDE_BRANCH = Object.freeze({ field: 'supersedeBranch', value: 'mitosis/c4c-gh-sites-supersede-aaaa1111' });
const MANIFEST_REF = Object.freeze({ field: 'manifestRef', value: 'refs/mitosis-manifest/aaaa1111/0123456789abcdef' });
const SLUG = Object.freeze({ field: 'repoSlug', value: 'acme/widgets' });
const OWNER_REPO = Object.freeze({ field: 'ownerRepo', value: 'acme/widgets' });
const RUN = Object.freeze({ field: 'runId', value: '77' });
const LIB_DIR = Object.freeze({ field: 'libDir', value: FOLD_TOOL_DIRECTORY });
const GIT_LIB_DIR = Object.freeze({ field: 'gitLibDir', value: PR_TOOL_DIRECTORY });

const REPO_PLACEHOLDER = Object.freeze({ '<repoRoot>': Object.freeze({ incumbent: '${repoRoot}', ...REPO }) });
const BASE_PLACEHOLDER = Object.freeze({ '<baseBranch>': Object.freeze({ incumbent: '${baseBranch}', ...BASE }) });
const IB_PLACEHOLDER = Object.freeze({ '<integrationBranch>': Object.freeze({ incumbent: '${integrationBranch}', ...IB }) });
const SUPERSEDE_PLACEHOLDER = Object.freeze({ '<supersedeBranch>': Object.freeze({ incumbent: '${supersedeBranch}', ...SUPERSEDE_BRANCH }) });
const MANIFEST_PLACEHOLDER = Object.freeze({ '<manifestRef>': Object.freeze({ incumbent: 'REF', ...MANIFEST_REF }) });
const SLUG_PLACEHOLDER = Object.freeze({ '<repoSlug>': Object.freeze({ incumbent: '${repoSlug}', ...SLUG }) });
const OWNER_PLACEHOLDER = Object.freeze({ '<ownerRepo>': Object.freeze({ incumbent: '<OWNER_REPO>', ...OWNER_REPO }) });
const RUN_PLACEHOLDER = Object.freeze({ '<runId>': Object.freeze({ incumbent: '"$runId"', ...RUN }) });
const NESTED_RUN_PLACEHOLDER = Object.freeze({ '<runId>': Object.freeze({ incumbent: "'\"$runId\"'", ...RUN }) });

const DERIVED_SEPARATOR = Object.freeze({
  '--end-of-options': 'the incumbent hands this command a caller value positionally with nothing marking the end of its options, and git permutes its argument vector, so a value beginning with a dash is read as an option rather than as the value it was passed as; --upload-pack= alone runs an arbitrary command while the command it rides on reports an ordinary failure',
});

const DERIVED_NODE_SEPARATOR = Object.freeze({
  '--': 'the incumbent hands node the script path positionally with nothing marking the end of node own options; node honours the double dash as the end of its own flags, measured against node v26.4.0, so a script path that begins with a dash stays a path rather than becoming a node option',
});

const DERIVED_GH_SEPARATOR = Object.freeze({
  '--': 'the incumbent hands gh this path positionally with nothing marking the end of its options; gh honours the double dash as the end of its own flags, measured against gh 2.97.0, so the separator keeps a value that begins with a dash a value rather than a flag',
});

const DERIVED_REPO_SCOPE = Object.freeze({
  '-C': 'the incumbent spells this one command without the repository prefix every other command in the same stage carries, and the stage prose scopes the whole stage to the main repo, so the prefix is restored rather than left to whatever directory the process happens to be in',
  '<repoRoot>': 'the same restored repository prefix; the stage prose names the main repo as the tree every command in it operates against',
});

const DERIVED_REV_PARSE_VERIFY = Object.freeze({
  '--verify': 'the incumbent spells this read with the option separator and without --verify, and git rev-parse in that shape echoes the separator back on stdout ahead of the object name, measured against git 2.55.0; --verify suppresses that echo so the object-name reader is handed the sha the incumbent asks for rather than a line it must refuse',
});

const DERIVED_NUMSTAT = Object.freeze({
  '--numstat': 'the incumbent runs the same two endpoints as a full textual diff and asks a model to summarise it in one line; --numstat prints one added, deleted and path triple per file, which the engine composes the same line from without reading a diff it may have truncated',
});

const SHELL_QUOTE = 'the shell quote the incumbent wraps this value in; quoting is how a shell keeps one word together, and an argument vector element already is one';

const OMITTED_SHELL_QUOTE = Object.freeze({ "'": SHELL_QUOTE });
const OMITTED_DOUBLE_QUOTE = Object.freeze({ '"': SHELL_QUOTE });

const CAPTURE = 'the incumbent captures the run id in a shell variable through a command substitution; the transcription reads the same id from the child stdout, so the assignment and the substitution are shell constructions rather than arguments of this command';
const UNSPAWNABLE_WRAPPER = 'part of the timeout, bash and sleep wrapper the incumbent bounds the wait with; none of those three is a spawnable binary, so the wait becomes an in-process bounded poll and the wrapper corresponds to no argument of the read it repeats';

const OMITTED_RUN_CAPTURE = Object.freeze({
  'runId=$(gh': CAPTURE,
  "'": SHELL_QUOTE,
  "')": CAPTURE,
});

const SIBLING_READ = 'the incumbent spells the run-id read, the wait and the status read on one shell line; this word belongs to the run-id read the resolve-run step transcribes rather than to the status read this fixture pins';

const OMITTED_WATCH_WRAPPER = Object.freeze({
  'runId=$(gh': CAPTURE,
  list: SIBLING_READ,
  '-R': SIBLING_READ,
  '${repoSlug}': SIBLING_READ,
  '--branch': SIBLING_READ,
  '${integrationBranch}': SIBLING_READ,
  '--limit': SIBLING_READ,
  '1': SIBLING_READ,
  '--json': SIBLING_READ,
  databaseId: SIBLING_READ,
  '-q': SIBLING_READ,
  "'.[0].databaseId');": CAPTURE,
  run: SIBLING_READ,
  timeout: UNSPAWNABLE_WRAPPER,
  '${CI_WATCH_MAX_SECONDS}': UNSPAWNABLE_WRAPPER,
  bash: UNSPAWNABLE_WRAPPER,
  '-c': UNSPAWNABLE_WRAPPER,
  "'until": UNSPAWNABLE_WRAPPER,
  '[': UNSPAWNABLE_WRAPPER,
  '"$(gh': UNSPAWNABLE_WRAPPER,
  ')"': UNSPAWNABLE_WRAPPER,
  '=': UNSPAWNABLE_WRAPPER,
  '"completed"': UNSPAWNABLE_WRAPPER,
  '];': UNSPAWNABLE_WRAPPER,
  do: UNSPAWNABLE_WRAPPER,
  sleep: UNSPAWNABLE_WRAPPER,
  '${CI_WATCH_INTERVAL_SECONDS};': UNSPAWNABLE_WRAPPER,
  "done'": UNSPAWNABLE_WRAPPER,
});

function fixture(entry) {
  return Object.freeze({
    binary: entry.binary,
    site: entry.site,
    step: entry.step,
    anchor: entry.anchor,
    argv: Object.freeze([...entry.argv]),
    placeholders: Object.freeze({ ...(entry.placeholders || {}) }),
    derived: Object.freeze({ ...(entry.derived || {}) }),
    omitted: Object.freeze({ ...(entry.omitted || {}) }),
    bound: Object.freeze({ ...(entry.bound || {}) }),
    cwd: entry.cwd === undefined ? null : entry.cwd,
    stdin: entry.stdin === undefined ? null : entry.stdin,
  });
}

const RECONCILE_GIT = [
  fixture({
    binary: GIT_COMMAND_BINARY,
    site: 'reconcile',
    step: 'base-history',
    anchor: 'For diagnostics only you MAY run \\`git log origin/${baseBranch}\\`',
    argv: ['-C', '<repoRoot>', 'log', '--end-of-options', 'origin/<baseBranch>'],
    derived: { ...DERIVED_REPO_SCOPE, ...DERIVED_SEPARATOR },
    placeholders: { ...REPO_PLACEHOLDER, ...BASE_PLACEHOLDER },
  }),
  fixture({
    binary: GIT_COMMAND_BINARY,
    site: 'reconcile',
    step: 'checkpoint-refs',
    anchor: "run \\`git -C ${repoRoot} ls-remote origin 'refs/mitosis/*'\\`",
    argv: ['-C', '<repoRoot>', 'ls-remote', 'origin', '--end-of-options', 'refs/mitosis/*'],
    derived: DERIVED_SEPARATOR,
    placeholders: { ...REPO_PLACEHOLDER },
    omitted: OMITTED_SHELL_QUOTE,
  }),
  fixture({
    binary: GIT_COMMAND_BINARY,
    site: 'reconcile',
    step: 'manifest-remote',
    anchor: 'Run \\`git -C ${repoRoot} ls-remote origin REF\\`',
    argv: ['-C', '<repoRoot>', 'ls-remote', 'origin', '--end-of-options', '<manifestRef>'],
    derived: DERIVED_SEPARATOR,
    placeholders: { ...REPO_PLACEHOLDER, ...MANIFEST_PLACEHOLDER },
  }),
  fixture({
    binary: GIT_COMMAND_BINARY,
    site: 'reconcile',
    step: 'manifest-fetch',
    anchor: 'then run \\`git -C ${repoRoot} fetch --no-tags origin +REF:REF\\`',
    argv: ['-C', '<repoRoot>', 'fetch', '--no-tags', 'origin', '--end-of-options', '+<manifestRef>:<manifestRef>'],
    derived: DERIVED_SEPARATOR,
    placeholders: { ...REPO_PLACEHOLDER, ...MANIFEST_PLACEHOLDER },
  }),
  fixture({
    binary: GIT_COMMAND_BINARY,
    site: 'reconcile',
    step: 'manifest-read',
    anchor: 'and then \\`git -C ${repoRoot} cat-file -p REF:manifest.json\\`',
    argv: ['-C', '<repoRoot>', 'cat-file', '-p', '--end-of-options', '<manifestRef>:manifest.json'],
    derived: DERIVED_SEPARATOR,
    placeholders: { ...REPO_PLACEHOLDER, ...MANIFEST_PLACEHOLDER },
  }),
];

const RECONCILE_REMOTE = [
  fixture({
    binary: GH_COMMAND_BINARY,
    site: 'reconcile',
    step: 'repo-identity',
    anchor: 'run \\`gh repo view --json nameWithOwner,url\\`',
    argv: ['repo', 'view', '--json', 'nameWithOwner,url'],
    cwd: '<repoRoot>',
  }),
  fixture({
    binary: GH_COMMAND_BINARY,
    site: 'reconcile',
    step: 'merged-prs',
    anchor: '\\`gh pr list -R <OWNER_REPO> --state merged --base ${baseBranch} --limit 200 --json headRefName,url,mergedAt,mergeCommit\\`',
    argv: ['pr', 'list', '-R', '<ownerRepo>', '--state', 'merged', '--base', '<baseBranch>', '--limit', '200', '--json', 'headRefName,url,mergedAt,mergeCommit'],
    placeholders: { ...OWNER_PLACEHOLDER, ...BASE_PLACEHOLDER },
  }),
  fixture({
    binary: GH_COMMAND_BINARY,
    site: 'reconcile',
    step: 'open-prs',
    anchor: '\\`gh pr list -R <OWNER_REPO> --state open --base ${baseBranch} --limit 200 --json headRefName,reviewDecision,url,isCrossRepository,headRepositoryOwner,headRepository\\`',
    argv: ['pr', 'list', '-R', '<ownerRepo>', '--state', 'open', '--base', '<baseBranch>', '--limit', '200', '--json', 'headRefName,reviewDecision,url,isCrossRepository,headRepositoryOwner,headRepository'],
    placeholders: { ...OWNER_PLACEHOLDER, ...BASE_PLACEHOLDER },
  }),
  fixture({
    binary: NODE_COMMAND_BINARY,
    site: 'reconcile',
    step: 'fold-run-log',
    anchor: `run \\\`node \${LIB_DIR}/fold-run-log.mjs \${repoRoot}/${RUN_JOURNAL_PATH}\\\``,
    argv: ['--', '<libDir>/fold-run-log.mjs', `<repoRoot>/${RUN_JOURNAL_PATH}`],
    derived: DERIVED_NODE_SEPARATOR,
    placeholders: {
      '<libDir>': Object.freeze({ incumbent: '${LIB_DIR}', ...LIB_DIR }),
      ...REPO_PLACEHOLDER,
    },
  }),
];

const SUPERSEDE_FIXTURES = [
  fixture({
    binary: GIT_COMMAND_BINARY,
    site: 'supersede',
    step: 'publish-branch',
    anchor: 'never reusing or force-pushing the old head: \\`git -C ${repoRoot} push -u origin ${integrationBranch}:${supersedeBranch}\\`',
    argv: ['-C', '<repoRoot>', 'push', '-u', 'origin', '--end-of-options', '<integrationBranch>:<supersedeBranch>'],
    derived: DERIVED_SEPARATOR,
    placeholders: { ...REPO_PLACEHOLDER, ...IB_PLACEHOLDER, ...SUPERSEDE_PLACEHOLDER },
  }),
  fixture({
    binary: GIT_COMMAND_BINARY,
    site: 'supersede',
    step: 'interdiff',
    anchor: 'for the review body: \\`git -C ${repoRoot} diff origin/${integrationBranch}...origin/${supersedeBranch}\\`',
    argv: ['-C', '<repoRoot>', 'diff', '--numstat', '--end-of-options', 'origin/<integrationBranch>...origin/<supersedeBranch>'],
    derived: { ...DERIVED_NUMSTAT, ...DERIVED_SEPARATOR },
    placeholders: { ...REPO_PLACEHOLDER, ...IB_PLACEHOLDER, ...SUPERSEDE_PLACEHOLDER },
  }),
];

const PR_CREATE_VALUES = Object.freeze({
  title: 'fix(supersede): republish the rebuilt integration tip',
  provenance: 'agent=supersede model=sonnet',
  why: 'a divergent merge on a parent invalidated the built content of the open pull request',
  rationale: 'the parent merged divergently and this unit was rebuilt on the new tip',
  what: 'publish the rebuilt tip onto a fresh branch',
  summary: '2 files changed, +12/-10 since the superseded head: src/a.ts, src/b.ts',
  notVerified: 'ci on the superseding head - not run',
  supersedes: 'https://github.com/acme/widgets/pull/7',
});

const SHIP_PR_VALUES = Object.freeze({
  title: 'feat(ship): publish the integration head',
  provenance: 'agent=ship model=opus',
  why: 'the unit is built and its parents are merged',
  what: 'open one pull request on the rebased integration head',
  notVerified: 'ci on the fresh head - not run',
  changedLines: '120',
});

const OMITTED_DEPENDS = Object.freeze({
  '${prDependsFlag(msp.dependsOn)}': 'the incumbent emits the depends flag only when the unit declares parent ids and emits nothing at all when it does not; this fixture binds the no-parent shape, and the builder emits the flag and its joined ids when the list is not empty',
});

const NODE_PR_FIXTURES = [
  fixture({
    binary: NODE_COMMAND_BINARY,
    site: 'supersede',
    step: 'open-pr',
    anchor: 'changing NOTHING except the quoted summary placeholder and chaining nothing onto it: \\`node ${GIT_LIB_DIR}/pr.mjs pr-create --repo ${repoSlug} --head ${supersedeBranch} --base ${baseBranch} --title ${JSON.stringify(supersedePrTitleFor(msp))} --origin machine --provenance ${JSON.stringify(prProvenanceFor(`supersede:${msp.id}`, null))} --why ${JSON.stringify(PR_SUPERSEDE_WHY)} --why ${JSON.stringify(msp.rationale)} --what ${JSON.stringify(msp.title)} --what "<your one-line interdiff summary from step 2>" --not-verified ${JSON.stringify(PR_NOT_VERIFIED_SUPERSEDE_CI)} --supersedes ${JSON.stringify(canonicalPriorPrUrl)}\\`',
    argv: [
      '--', '<gitLibDir>/pr.mjs', 'pr-create',
      '--repo', '<repoSlug>',
      '--head', '<supersedeBranch>',
      '--base', '<baseBranch>',
      '--title', '<title>',
      '--origin', 'machine',
      '--provenance', '<provenance>',
      '--why', '<why>',
      '--why', '<rationale>',
      '--what', '<what>',
      '--what', '<summary>',
      '--not-verified', '<notVerified>',
      '--supersedes', '<supersedes>',
    ],
    derived: DERIVED_NODE_SEPARATOR,
    placeholders: {
      '<gitLibDir>': Object.freeze({ incumbent: '${GIT_LIB_DIR}', ...GIT_LIB_DIR }),
      ...SLUG_PLACEHOLDER,
      ...SUPERSEDE_PLACEHOLDER,
      ...BASE_PLACEHOLDER,
      '<title>': Object.freeze({ incumbent: '${JSON.stringify(supersedePrTitleFor(msp))}', field: 'title', value: PR_CREATE_VALUES.title }),
      '<provenance>': Object.freeze({ incumbent: '${JSON.stringify(prProvenanceFor(`supersede:${msp.id}`, null))}', field: 'provenance', value: PR_CREATE_VALUES.provenance }),
      '<why>': Object.freeze({ incumbent: '${JSON.stringify(PR_SUPERSEDE_WHY)}', field: 'why', value: PR_CREATE_VALUES.why }),
      '<rationale>': Object.freeze({ incumbent: '${JSON.stringify(msp.rationale)}', field: 'rationale', value: PR_CREATE_VALUES.rationale }),
      '<what>': Object.freeze({ incumbent: '${JSON.stringify(msp.title)}', field: 'what', value: PR_CREATE_VALUES.what }),
      '<summary>': Object.freeze({ incumbent: '"<your one-line interdiff summary from step 2>"', field: 'summary', value: PR_CREATE_VALUES.summary }),
      '<notVerified>': Object.freeze({ incumbent: '${JSON.stringify(PR_NOT_VERIFIED_SUPERSEDE_CI)}', field: 'notVerified', value: PR_CREATE_VALUES.notVerified }),
      '<supersedes>': Object.freeze({ incumbent: '${JSON.stringify(canonicalPriorPrUrl)}', field: 'supersedes', value: PR_CREATE_VALUES.supersedes }),
    },
  }),
  fixture({
    binary: NODE_COMMAND_BINARY,
    site: 'ship',
    step: 'open-pr',
    anchor: 'substituting ONLY the digits for <N>: \\`node ${GIT_LIB_DIR}/pr.mjs pr-create --repo ${repoSlug} --head ${integrationBranch} --base ${baseBranch} --title ${JSON.stringify(prTitleFor(msp))} --origin machine --provenance ${JSON.stringify(prProvenanceFor(`ship:${msp.id}`, shipModel))} --why ${JSON.stringify(msp.rationale)} --what ${JSON.stringify(msp.title)} --not-verified ${JSON.stringify(PR_NOT_VERIFIED_OPEN_CI)}${prDependsFlag(msp.dependsOn)} --changed-lines <N>\\`',
    argv: [
      '--', '<gitLibDir>/pr.mjs', 'pr-create',
      '--repo', '<repoSlug>',
      '--head', '<integrationBranch>',
      '--base', '<baseBranch>',
      '--title', '<title>',
      '--origin', 'machine',
      '--provenance', '<provenance>',
      '--why', '<why>',
      '--what', '<what>',
      '--not-verified', '<notVerified>',
      '--changed-lines', '<changedLines>',
    ],
    derived: DERIVED_NODE_SEPARATOR,
    placeholders: {
      '<gitLibDir>': Object.freeze({ incumbent: '${GIT_LIB_DIR}', ...GIT_LIB_DIR }),
      ...SLUG_PLACEHOLDER,
      ...IB_PLACEHOLDER,
      ...BASE_PLACEHOLDER,
      '<title>': Object.freeze({ incumbent: '${JSON.stringify(prTitleFor(msp))}', field: 'title', value: SHIP_PR_VALUES.title }),
      '<provenance>': Object.freeze({ incumbent: '${JSON.stringify(prProvenanceFor(`ship:${msp.id}`, shipModel))}', field: 'provenance', value: SHIP_PR_VALUES.provenance }),
      '<why>': Object.freeze({ incumbent: '${JSON.stringify(msp.rationale)}', field: 'why', value: SHIP_PR_VALUES.why }),
      '<what>': Object.freeze({ incumbent: '${JSON.stringify(msp.title)}', field: 'what', value: SHIP_PR_VALUES.what }),
      '<notVerified>': Object.freeze({ incumbent: '${JSON.stringify(PR_NOT_VERIFIED_OPEN_CI)}', field: 'notVerified', value: SHIP_PR_VALUES.notVerified }),
      '<changedLines>': Object.freeze({ incumbent: '<N>', field: 'changedLines', value: SHIP_PR_VALUES.changedLines }),
    },
    omitted: OMITTED_DEPENDS,
    bound: { dependsIds: [] },
  }),
];

const SHIP_VERIFY_FIXTURES = [
  fixture({
    binary: GH_COMMAND_BINARY,
    site: 'ship-verify',
    step: 'pr-state',
    anchor: 'Read the PR state with argv \\`gh pr view -R ${repoSlug} ${integrationBranch} --json state,mergedAt,url\\`',
    argv: ['pr', 'view', '-R', '<repoSlug>', '<integrationBranch>', '--json', 'state,mergedAt,url'],
    placeholders: { ...SLUG_PLACEHOLDER, ...IB_PLACEHOLDER },
  }),
  fixture({
    binary: GH_COMMAND_BINARY,
    site: 'ship-verify',
    step: 'compare',
    anchor: 'Read the base...head containment: \\`gh api "repos/${repoSlug}/compare/${baseBranch}...${integrationBranch}"\\`',
    argv: ['api', '--', 'repos/<repoSlug>/compare/<baseBranch>...<integrationBranch>'],
    derived: DERIVED_GH_SEPARATOR,
    placeholders: { ...SLUG_PLACEHOLDER, ...BASE_PLACEHOLDER, ...IB_PLACEHOLDER },
    omitted: OMITTED_DOUBLE_QUOTE,
  }),
];

const WATCH_ANCHOR = 'Resolve the run id for this head and wait for its terminal conclusion with a BACKGROUNDED, timeout-bounded watch, never a foreground log stream: \\`runId=$(gh run list -R ${repoSlug} --branch ${integrationBranch} --limit 1 --json databaseId -q \'.[0].databaseId\'); timeout ${CI_WATCH_MAX_SECONDS} bash -c \'until [ "$(gh run view \'"$runId"\' -R ${repoSlug} --json status -q .status)" = "completed" ]; do sleep ${CI_WATCH_INTERVAL_SECONDS}; done\'\\`';

const CI_PROBE_FIXTURES = [
  fixture({
    binary: GH_COMMAND_BINARY,
    site: 'ci-probe',
    step: 'resolve-run',
    anchor: '1. Resolve the run id for this head: \\`runId=$(gh run list -R ${repoSlug} --branch ${integrationBranch} --limit 1 --json databaseId -q \'.[0].databaseId\')\\`',
    argv: ['run', 'list', '-R', '<repoSlug>', '--branch', '<integrationBranch>', '--limit', '1', '--json', 'databaseId', '-q', '.[0].databaseId'],
    placeholders: { ...SLUG_PLACEHOLDER, ...IB_PLACEHOLDER },
    omitted: OMITTED_RUN_CAPTURE,
  }),
  fixture({
    binary: GH_COMMAND_BINARY,
    site: 'ci-probe',
    step: 'rerun',
    anchor: 'Rerun exactly that run in place: \\`gh run rerun "$runId" -R ${repoSlug} --failed\\`',
    argv: ['run', 'rerun', '<runId>', '-R', '<repoSlug>', '--failed'],
    placeholders: { ...RUN_PLACEHOLDER, ...SLUG_PLACEHOLDER },
  }),
  fixture({
    binary: GH_COMMAND_BINARY,
    site: 'ci-probe',
    step: 'watch-status',
    anchor: WATCH_ANCHOR,
    argv: ['run', 'view', '<runId>', '-R', '<repoSlug>', '--json', 'status', '-q', '.status'],
    placeholders: { ...NESTED_RUN_PLACEHOLDER, ...SLUG_PLACEHOLDER },
    omitted: OMITTED_WATCH_WRAPPER,
  }),
  fixture({
    binary: GH_COMMAND_BINARY,
    site: 'ci-probe',
    step: 'read-conclusion',
    anchor: 'then read the conclusion ONCE: \\`gh run view "$runId" -R ${repoSlug} --json conclusion -q .conclusion\\`',
    argv: ['run', 'view', '<runId>', '-R', '<repoSlug>', '--json', 'conclusion', '-q', '.conclusion'],
    placeholders: { ...RUN_PLACEHOLDER, ...SLUG_PLACEHOLDER },
  }),
  fixture({
    binary: GIT_COMMAND_BINARY,
    site: 'ci-probe',
    step: 'published-head',
    anchor: 'read with the READ-ONLY command \\`git -C ${repoRoot} rev-parse --end-of-options ${integrationBranch}\\`',
    argv: ['-C', '<repoRoot>', 'rev-parse', '--verify', '--end-of-options', '<integrationBranch>'],
    derived: DERIVED_REV_PARSE_VERIFY,
    placeholders: { ...REPO_PLACEHOLDER, ...IB_PLACEHOLDER },
  }),
];

const CI_PUBLISH_FIXTURES = [
  fixture({
    binary: GIT_COMMAND_BINARY,
    site: 'ci-publish',
    step: 'fetch-base',
    anchor: '1. Refresh the base: \\`git -C ${repoRoot} fetch origin ${baseBranch}\\`',
    argv: ['-C', '<repoRoot>', 'fetch', 'origin', '--end-of-options', '<baseBranch>'],
    derived: DERIVED_SEPARATOR,
    placeholders: { ...REPO_PLACEHOLDER, ...BASE_PLACEHOLDER },
  }),
  fixture({
    binary: GIT_COMMAND_BINARY,
    site: 'ci-publish',
    step: 'switch-branch',
    anchor: 'the checked-out branch with \\`git -C ${repoRoot} switch ${integrationBranch}\\`',
    argv: ['-C', '<repoRoot>', 'switch', '--end-of-options', '<integrationBranch>'],
    derived: DERIVED_SEPARATOR,
    placeholders: { ...REPO_PLACEHOLDER, ...IB_PLACEHOLDER },
  }),
  fixture({
    binary: GIT_COMMAND_BINARY,
    site: 'ci-publish',
    step: 'confirm-head',
    anchor: 'then confirm it with \\`git -C ${repoRoot} rev-parse --abbrev-ref HEAD\\`',
    argv: ['-C', '<repoRoot>', 'rev-parse', '--abbrev-ref', 'HEAD'],
    placeholders: { ...REPO_PLACEHOLDER },
  }),
  fixture({
    binary: GIT_COMMAND_BINARY,
    site: 'ci-publish',
    step: 'forward-merge',
    anchor: 'take it FORWARD ONLY onto that branch: \\`git -C ${repoRoot} merge --no-edit origin/${baseBranch}\\`',
    argv: ['-C', '<repoRoot>', 'merge', '--no-edit', '--end-of-options', 'origin/<baseBranch>'],
    derived: DERIVED_SEPARATOR,
    placeholders: { ...REPO_PLACEHOLDER, ...BASE_PLACEHOLDER },
  }),
  fixture({
    binary: GIT_COMMAND_BINARY,
    site: 'ci-publish',
    step: 'merge-abort',
    anchor: 'If that merge conflicts, run \\`git -C ${repoRoot} merge --abort\\`',
    argv: ['-C', '<repoRoot>', 'merge', '--abort'],
    placeholders: { ...REPO_PLACEHOLDER },
  }),
  fixture({
    binary: GIT_COMMAND_BINARY,
    site: 'ci-publish',
    step: 'push',
    anchor: 'Publish by fast-forward only: \\`git -C ${repoRoot} push origin ${integrationBranch}\\`',
    argv: ['-C', '<repoRoot>', 'push', 'origin', '--end-of-options', '<integrationBranch>'],
    derived: DERIVED_SEPARATOR,
    placeholders: { ...REPO_PLACEHOLDER, ...IB_PLACEHOLDER },
  }),
];

const SHIP_FIXTURES = [
  fixture({
    binary: GH_COMMAND_BINARY,
    site: 'ship',
    step: 'done-oracle',
    anchor: 'ask whether this MSP\'s PR is already merged: \\`gh pr view -R ${repoSlug} ${integrationBranch} --json state,mergedAt,url\\`',
    argv: ['pr', 'view', '-R', '<repoSlug>', '<integrationBranch>', '--json', 'state,mergedAt,url'],
    placeholders: { ...SLUG_PLACEHOLDER, ...IB_PLACEHOLDER },
  }),
  fixture({
    binary: GIT_COMMAND_BINARY,
    site: 'ship',
    step: 'fetch-base',
    anchor: '2. Refresh the base: \\`git -C ${repoRoot} fetch origin ${baseBranch}\\`',
    argv: ['-C', '<repoRoot>', 'fetch', 'origin', '--end-of-options', '<baseBranch>'],
    derived: DERIVED_SEPARATOR,
    placeholders: { ...REPO_PLACEHOLDER, ...BASE_PLACEHOLDER },
  }),
  fixture({
    binary: GIT_COMMAND_BINARY,
    site: 'ship',
    step: 'base-contained',
    anchor: 'run \\`git -C ${repoRoot} merge-base --is-ancestor origin/${baseBranch} ${integrationBranch}\\`',
    argv: ['-C', '<repoRoot>', 'merge-base', '--is-ancestor', '--end-of-options', 'origin/<baseBranch>', '<integrationBranch>'],
    derived: DERIVED_SEPARATOR,
    placeholders: { ...REPO_PLACEHOLDER, ...BASE_PLACEHOLDER, ...IB_PLACEHOLDER },
  }),
  fixture({
    binary: GIT_COMMAND_BINARY,
    site: 'ship',
    step: 'rebase',
    anchor: 'if the base advanced, run \\`git -C ${repoRoot} rebase origin/${baseBranch} ${integrationBranch}\\`',
    argv: ['-C', '<repoRoot>', 'rebase', '--end-of-options', 'origin/<baseBranch>', '<integrationBranch>'],
    derived: DERIVED_SEPARATOR,
    placeholders: { ...REPO_PLACEHOLDER, ...BASE_PLACEHOLDER, ...IB_PLACEHOLDER },
  }),
  fixture({
    binary: GIT_COMMAND_BINARY,
    site: 'ship',
    step: 'rebase-abort',
    anchor: 'If the rebase reports conflicts, run \\`git -C ${repoRoot} rebase --abort\\`',
    argv: ['-C', '<repoRoot>', 'rebase', '--abort'],
    placeholders: { ...REPO_PLACEHOLDER },
  }),
  fixture({
    binary: GIT_COMMAND_BINARY,
    site: 'ship',
    step: 'read-remote',
    anchor: 'check whether the remote already has this exact head with \\`git -C ${repoRoot} ls-remote --heads origin ${integrationBranch}\\`',
    argv: ['-C', '<repoRoot>', 'ls-remote', '--heads', 'origin', '--end-of-options', '<integrationBranch>'],
    derived: DERIVED_SEPARATOR,
    placeholders: { ...REPO_PLACEHOLDER, ...IB_PLACEHOLDER },
  }),
  fixture({
    binary: GIT_COMMAND_BINARY,
    site: 'ship',
    step: 'resolve-tip',
    anchor: 'and compare it to \\`git -C ${repoRoot} rev-parse ${integrationBranch}\\`',
    argv: ['-C', '<repoRoot>', 'rev-parse', '<integrationBranch>'],
    placeholders: { ...REPO_PLACEHOLDER, ...IB_PLACEHOLDER },
  }),
  fixture({
    binary: GIT_COMMAND_BINARY,
    site: 'ship',
    step: 'publish',
    anchor: 'Otherwise publish: \\`git -C ${repoRoot} push -u origin ${integrationBranch}\\`',
    argv: ['-C', '<repoRoot>', 'push', '-u', 'origin', '--end-of-options', '<integrationBranch>'],
    derived: DERIVED_SEPARATOR,
    placeholders: { ...REPO_PLACEHOLDER, ...IB_PLACEHOLDER },
  }),
  fixture({
    binary: GIT_COMMAND_BINARY,
    site: 'ship',
    step: 'force-retry',
    anchor: 'retry once with \\`git -C ${repoRoot} push --force-with-lease -u origin ${integrationBranch}\\`',
    argv: ['-C', '<repoRoot>', 'push', '--force-with-lease', '-u', 'origin', '--end-of-options', '<integrationBranch>'],
    derived: DERIVED_SEPARATOR,
    placeholders: { ...REPO_PLACEHOLDER, ...IB_PLACEHOLDER },
  }),
  fixture({
    binary: GIT_COMMAND_BINARY,
    site: 'ship',
    step: 'changed-lines',
    anchor: 'If you cannot read the changed-lines integer (insertions + deletions) from \\`git -C ${repoRoot} diff --shortstat origin/${baseBranch}...${head}\\`',
    argv: ['-C', '<repoRoot>', 'diff', '--shortstat', '--end-of-options', 'origin/<baseBranch>...<integrationBranch>'],
    derived: DERIVED_SEPARATOR,
    placeholders: {
      ...REPO_PLACEHOLDER,
      ...BASE_PLACEHOLDER,
      '<integrationBranch>': Object.freeze({ incumbent: '${head}', ...IB }),
    },
  }),
  fixture({
    binary: GIT_COMMAND_BINARY,
    site: 'ship',
    step: 'published-head',
    anchor: 'read with \\`git -C ${repoRoot} rev-parse ${integrationBranch}\\` AFTER the push',
    argv: ['-C', '<repoRoot>', 'rev-parse', '<integrationBranch>'],
    placeholders: { ...REPO_PLACEHOLDER, ...IB_PLACEHOLDER },
  }),
];

export const GH_SITE_FIXTURES = Object.freeze([
  ...RECONCILE_GIT,
  ...RECONCILE_REMOTE,
  ...SUPERSEDE_FIXTURES,
  ...NODE_PR_FIXTURES,
  ...SHIP_VERIFY_FIXTURES,
  ...CI_PROBE_FIXTURES,
  ...CI_PUBLISH_FIXTURES,
  ...SHIP_FIXTURES,
]);

const WATCH_SHARED_REASON = 'the incumbent composes this wait once and interpolates the same clause into both stages, so the two run one command rather than two spellings of one; the fixture that pins it lives with the stage the clause is anchored to';

const CI_PUBLISH_WATCH_ANCHOR = '5. ${ciWatchClause} Treat conclusion=success as CI GREEN';
const CI_PUBLISH_CONTRACT_ANCHOR = '7. ${ciStructuredContract}';
const SHIP_WATCH_ANCHOR = 'Every run-status read is pinned to the engine-resolved target repo ${JSON.stringify(repoSlug)} (never the ambient cwd): \\`runId=$(gh run list -R ${repoSlug} --branch ${integrationBranch} --limit 1 --json databaseId -q \'.[0].databaseId\'); timeout ${CI_WATCH_MAX_SECONDS} bash -c \'until [ "$(gh run view \'"$runId"\' -R ${repoSlug} --json status -q .status)" = "completed" ]; do sleep ${CI_WATCH_INTERVAL_SECONDS}; done\'\\`, then read the terminal conclusion ONCE: \\`gh run view "$runId" -R ${repoSlug} --json conclusion -q .conclusion\\`';

export const SHARED_COMMAND_STEPS = Object.freeze([
  Object.freeze({ binary: GH_COMMAND_BINARY, site: 'ci-publish', step: 'resolve-run', sharesWith: 'ci-probe', anchor: CI_PUBLISH_WATCH_ANCHOR, reason: WATCH_SHARED_REASON }),
  Object.freeze({ binary: GH_COMMAND_BINARY, site: 'ci-publish', step: 'watch-status', sharesWith: 'ci-probe', anchor: CI_PUBLISH_WATCH_ANCHOR, reason: WATCH_SHARED_REASON }),
  Object.freeze({ binary: GH_COMMAND_BINARY, site: 'ci-publish', step: 'read-conclusion', sharesWith: 'ci-probe', anchor: CI_PUBLISH_WATCH_ANCHOR, reason: WATCH_SHARED_REASON }),
  Object.freeze({ binary: GIT_COMMAND_BINARY, site: 'ci-publish', step: 'published-head', sharesWith: 'ci-probe', anchor: CI_PUBLISH_CONTRACT_ANCHOR, reason: WATCH_SHARED_REASON }),
  Object.freeze({
    binary: GH_COMMAND_BINARY,
    site: 'ship',
    step: 'resolve-run',
    sharesWith: 'ci-probe',
    anchor: SHIP_WATCH_ANCHOR,
    reason: 'the ship stage spells the same wait inline rather than through the shared clause, and the two spellings differ only in the prose around them, so one command is pinned once and this stage is held to producing the same argument vector',
  }),
  Object.freeze({
    binary: GH_COMMAND_BINARY,
    site: 'ship',
    step: 'watch-status',
    sharesWith: 'ci-probe',
    anchor: SHIP_WATCH_ANCHOR,
    reason: 'the ship stage spells the same wait inline rather than through the shared clause, and the two spellings differ only in the prose around them, so one command is pinned once and this stage is held to producing the same argument vector',
  }),
  Object.freeze({
    binary: GH_COMMAND_BINARY,
    site: 'ship',
    step: 'read-conclusion',
    sharesWith: 'ci-probe',
    anchor: SHIP_WATCH_ANCHOR,
    reason: 'the ship stage spells the same wait inline rather than through the shared clause, and the two spellings differ only in the prose around them, so one command is pinned once and this stage is held to producing the same argument vector',
  }),
]);

const CONFLICT_PATHS_REASON = 'the incumbent names the conflicting paths as a field it demands and spells no command that produces them, so this vector is derived rather than transcribed; --diff-filter=U asks git for exactly the unmerged entries the aborted merge or rebase left, which is the fact the field asks a model to report from a diff it read by eye';

const CONFLICT_PATHS_VALUES = Object.freeze({ repoRoot: REPO.value });
const CONFLICT_PATHS_ARGV = Object.freeze(['-C', REPO.value, 'diff', '--name-only', '--diff-filter=U']);

export const DERIVED_COMMAND_SITES = Object.freeze([
  Object.freeze({
    binary: GIT_COMMAND_BINARY,
    site: 'ci-publish',
    step: 'conflict-paths',
    field: 'conflictPaths',
    anchor: 'conflictPaths: [ "<repo-relative path>" ], publishedHeadSha: "<the sha ',
    values: CONFLICT_PATHS_VALUES,
    argv: CONFLICT_PATHS_ARGV,
    reason: CONFLICT_PATHS_REASON,
  }),
  Object.freeze({
    binary: GIT_COMMAND_BINARY,
    site: 'ship',
    step: 'conflict-paths',
    field: 'conflictPaths',
    anchor: 'conflictPaths = the repo-relative paths that conflicted in step 4',
    values: CONFLICT_PATHS_VALUES,
    argv: CONFLICT_PATHS_ARGV,
    reason: CONFLICT_PATHS_REASON,
  }),
]);

export const SPEC_HASH_FIXTURE = Object.freeze({
  site: 'reconcile',
  step: 'spec-fingerprint',
  anchor: 'run \\`shasum -a 256 ${spec}\\`',
  refusedBinary: SPEC_HASH_INCUMBENT_COMMAND.split(' ')[0],
  reason: 'shasum is not one of the spawnable binaries, so the incumbent fingerprint cannot be transcribed as a spawn at all; it becomes an in-process sha256 over the same bytes, pinned to digests transcribed from that same binary, and it reports no fingerprint at all for a spec it could not read',
});

export const CI_WATCH_FIXTURE = Object.freeze({
  site: 'ci-probe',
  step: 'bounded-wait',
  anchor: WATCH_ANCHOR,
  refusedBinary: 'timeout',
  alsoRefusedBinaries: Object.freeze(['bash', 'sleep']),
  reason: `the incumbent bounds the wait with timeout, bash and sleep, none of which is a spawnable binary, so the wait cannot be transcribed as a spawn at all; it becomes the in-process bounded poll this substrate already ships, whose expiry is reported as ${EXEC_TIMEOUT_EXPIRED} rather than folded into a generic failure, and whose repeated read is the ordinary allowlisted gh run view this site also transcribes`,
});
