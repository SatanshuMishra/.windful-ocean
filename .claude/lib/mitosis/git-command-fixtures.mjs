import { GIT_COMMAND_BINARY } from './git-commands.mjs';

export const FIXTURE_PARENT_SHA = '4656b8ad';

const REPO = Object.freeze({ field: 'repoRoot', value: '/repo' });
const BASE = Object.freeze({ field: 'baseBranch', value: 'main' });
const INTEGRATION_BRANCH = Object.freeze({ field: 'integrationBranch', value: 'mitosis/c4b-git-sites' });
const INTEGRATION_WT = Object.freeze({ field: 'integrationWt', value: '/wt/c4b' });
const TASK_BRANCH = Object.freeze({ field: 'branch', value: 'mitosis/c4b-task-1' });
const WORKTREE_PATH = Object.freeze({ field: 'worktreePath', value: '/wt/task-1' });
const CHECKPOINT_REF = Object.freeze({ field: 'ref', value: 'refs/mitosis/aaaa1111/c4a' });
const BUILT_REF = Object.freeze({ field: 'builtRef', value: 'refs/mitosis/aaaa1111/c4b' });
const DURABLE_REF = Object.freeze({ field: 'durableCheckpointRef', value: 'refs/mitosis/aaaa1111/c4b' });
const MANIFEST_REF = Object.freeze({ field: 'manifestRef', value: 'refs/mitosis-manifest/aaaa1111/0123456789abcdef' });
const BUILT_SHA = Object.freeze({ field: 'builtSha', value: '1111111111111111111111111111111111111111' });
const MERGED_SHA = Object.freeze({ field: 'mergedSha', value: '2222222222222222222222222222222222222222' });
const PARENT_TIP = Object.freeze({ field: 'parentTip', value: '3333333333333333333333333333333333333333' });
const FROM_SHA = Object.freeze({ field: 'fromSha', value: '4444444444444444444444444444444444444444' });
const FILE_SCOPE = Object.freeze({ field: 'fileScope', value: Object.freeze(['src/a.ts', 'src/b.ts']) });
const TREE = Object.freeze({ field: 'tree', value: '5555555555555555555555555555555555555555' });
const COMMIT = Object.freeze({ field: 'commit', value: '6666666666666666666666666666666666666666' });
const RUN_ID = Object.freeze({ field: 'logicalRunId', value: 'aaaa1111' });

const REPO_PLACEHOLDER = Object.freeze({ '<repoRoot>': Object.freeze({ incumbent: '${repoRoot}', ...REPO }) });
const BASE_PLACEHOLDER = Object.freeze({ '<baseBranch>': Object.freeze({ incumbent: '${baseBranch}', ...BASE }) });
const WT_PLACEHOLDER = Object.freeze({ '<integrationWt>': Object.freeze({ incumbent: '${integrationWt}', ...INTEGRATION_WT }) });
const IB_PLACEHOLDER = Object.freeze({ '<integrationBranch>': Object.freeze({ incumbent: '${integrationBranch}', ...INTEGRATION_BRANCH }) });
const MANIFEST_PLACEHOLDER = Object.freeze({ '<manifestRef>': Object.freeze({ incumbent: '${manifestRef}', ...MANIFEST_REF }) });

const DERIVED_C = Object.freeze({
  '-C': 'the incumbent enters the tree with a shell cd, which is not a spawnable binary; -C is git own equivalent and keeps the path an inert argument vector element rather than a word a shell would split',
});

const DERIVED_SEPARATOR = Object.freeze({
  '--end-of-options': 'the incumbent hands this command a caller value positionally with nothing marking the end of its options, and git permutes its argument vector, so a value beginning with a dash is read as an option rather than as the value it was passed as; --upload-pack= alone runs an arbitrary command while the command it rides on reports an ordinary failure. The separator is added rather than transcribed, and the incumbent already spells it at the three sites that carry it',
});

const DERIVED_REPO_SCOPE = Object.freeze({
  '-C': 'the incumbent spells this one command without the repository prefix every other command in the same stage carries, and the stage prose scopes the whole stage to the main repo, so the prefix is restored rather than left to whatever directory the process happens to be in',
  '<repoRoot>': 'the same restored repository prefix; the stage prose names the main repo as the tree every command in it operates against',
});

const OMITTED_SHELL_TREE_ENTRY = Object.freeze({
  cd: 'the incumbent enters the tree with a shell cd before invoking git; the transcription reaches the same tree through git own -C, so the cd word corresponds to no argument vector element',
  '&&': 'the incumbent joins the cd and the git invocation with a shell operator, which sequences two commands rather than naming an argument of either',
});

const OMITTED_BLOB_CAPTURE = Object.freeze({
  'BLOB=$(git': 'the incumbent captures the object name in a shell variable through a command substitution; the transcription reads the same name from the child stdout, so the assignment and the substitution are shell constructions rather than arguments',
  '<': 'the incumbent feeds the payload in with a shell redirect, which no argument vector element can carry; the bytes reach the child on stdin instead, as this fixture stdin declaration records',
  '${repoRoot}/.mitosis/published-manifest.json)': 'the file the incumbent redirect opens; the transcription hands its bytes to the child directly, so the path is never an argument of this command',
});

const OMITTED_TREE_COMPOSITION = Object.freeze({
  'TREE=$(printf': 'the incumbent composes the tree line with printf inside a command substitution; printf is a shell builtin rather than a spawnable binary, so the bytes are composed in process and the capture is a shell construction',
  "'100644": 'part of the printf format the incumbent composes the one-entry tree line from; the same bytes are composed in process and handed to the child on stdin, so no argument of this command carries them',
  blob: 'part of that same printf format, composed in process rather than spelled as an argument',
  "%s\\\\tmanifest.json\\\\n'": 'the remainder of that printf format, composed in process rather than spelled as an argument',
  '"$BLOB"': 'the object name the incumbent interpolates into that format; the transcription substitutes it into the composed bytes rather than into an argument',
  '|': 'the incumbent pipes the composed bytes into the child, and a pipe is a shell construction rather than an argument vector element',
  ')': 'the closing parenthesis of the shell command substitution the incumbent captures the tree name with',
});

const OMITTED_COMMIT_CAPTURE = Object.freeze({
  'COMMIT=$(git': 'the incumbent captures the commit name in a shell variable through a command substitution; the transcription reads the same name from the child stdout',
  '"': 'the shell quote the incumbent wraps the message in; quoting is how a shell keeps one word together, and an argument vector element already is one',
  '")': 'the closing quote and the closing parenthesis of that same shell command substitution',
});

const PROSE_ALTERNATIVE = 'the incumbent offers a second way to perform the same restack after the command this fixture transcribes; the alternative is another command, never a further argument of this one';

const OMITTED_PROSE_SPELLING = Object.freeze({
  '(': 'the incumbent spells this one command inside a parenthesis in running prose rather than inside a backticked command, so the parenthesis is sentence punctuation rather than an argument',
  ',': PROSE_ALTERNATIVE,
  or: PROSE_ALTERNATIVE,
  an: PROSE_ALTERNATIVE,
  equivalent: PROSE_ALTERNATIVE,
  'cherry-pick': PROSE_ALTERNATIVE,
});

function fixture(entry) {
  return Object.freeze({
    site: entry.site,
    step: entry.step,
    anchor: entry.anchor,
    argv: Object.freeze([...entry.argv]),
    placeholders: Object.freeze({ ...(entry.placeholders || {}) }),
    derived: Object.freeze({ ...(entry.derived || {}) }),
    omitted: Object.freeze({ ...(entry.omitted || {}) }),
    cwd: entry.cwd === undefined ? null : entry.cwd,
    stdin: entry.stdin === undefined ? null : entry.stdin,
  });
}

export function builderInputs(fixture) {
  return Object.values(fixture.placeholders).reduce(
    (carried, binding) => ({ ...carried, [binding.field]: binding.value }),
    { ...(fixture.bound || {}) },
  );
}

export const GIT_COMMAND_FIXTURES = Object.freeze([
  fixture({
    site: 'fence',
    step: 'status',
    anchor: 'run \\`git status --porcelain=v1 -uall\\` and return EVERY path it reports',
    argv: ['status', '--porcelain=v1', '-uall'],
    cwd: '<repoRoot>',
  }),

  fixture({
    site: 'integrate',
    step: 'worktree-add',
    anchor: '\\`git -C ${repoRoot} worktree add ${integrationWt} ${baseBranch}\\`',
    argv: ['-C', '<repoRoot>', 'worktree', 'add', '--end-of-options', '<integrationWt>', '<baseBranch>'],
    derived: DERIVED_SEPARATOR,
    placeholders: { ...REPO_PLACEHOLDER, ...WT_PLACEHOLDER, ...BASE_PLACEHOLDER },
  }),
  fixture({
    site: 'integrate',
    step: 'checkout',
    anchor: '\\`cd ${integrationWt} && git checkout ${baseBranch}\\`',
    argv: ['-C', '<integrationWt>', 'checkout', '--end-of-options', '<baseBranch>'],
    placeholders: { ...WT_PLACEHOLDER, ...BASE_PLACEHOLDER },
    derived: { ...DERIVED_C, ...DERIVED_SEPARATOR },
    omitted: OMITTED_SHELL_TREE_ENTRY,
  }),
  fixture({
    site: 'integrate',
    step: 'merge-base',
    anchor: '\\`git -C ${integrationWt} merge-base --is-ancestor <branch> HEAD\\`',
    argv: ['-C', '<integrationWt>', 'merge-base', '--is-ancestor', '--end-of-options', '<branch>', 'HEAD'],
    derived: DERIVED_SEPARATOR,
    placeholders: { ...WT_PLACEHOLDER, '<branch>': { incumbent: '<branch>', ...TASK_BRANCH } },
  }),
  fixture({
    site: 'integrate',
    step: 'merge',
    anchor: '\\`git -C ${integrationWt} merge --no-ff <branch>\\`',
    argv: ['-C', '<integrationWt>', 'merge', '--no-ff', '--end-of-options', '<branch>'],
    derived: DERIVED_SEPARATOR,
    placeholders: { ...WT_PLACEHOLDER, '<branch>': { incumbent: '<branch>', ...TASK_BRANCH } },
  }),
  fixture({
    site: 'integrate',
    step: 'merge-abort',
    anchor: 'run \\`git -C ${integrationWt} merge --abort\\`',
    argv: ['-C', '<integrationWt>', 'merge', '--abort'],
    placeholders: { ...WT_PLACEHOLDER },
  }),
  fixture({
    site: 'integrate',
    step: 'worktree-remove',
    anchor: 'run \\`git -C ${repoRoot} worktree remove --force <path>\\`',
    argv: ['-C', '<repoRoot>', 'worktree', 'remove', '--force', '--end-of-options', '<path>'],
    derived: DERIVED_SEPARATOR,
    placeholders: { ...REPO_PLACEHOLDER, '<path>': { incumbent: '<path>', ...WORKTREE_PATH } },
  }),

  fixture({
    site: 'divergence-check',
    step: 'fetch-base',
    anchor: 'Fetch the base branch once so the merged commits resolve locally: \\`git -C ${repoRoot} fetch origin ${baseBranch}\\`.\\n',
    argv: ['-C', '<repoRoot>', 'fetch', 'origin', '--end-of-options', '<baseBranch>'],
    derived: DERIVED_SEPARATOR,
    placeholders: { ...REPO_PLACEHOLDER, ...BASE_PLACEHOLDER },
  }),
  fixture({
    site: 'divergence-check',
    step: 'fetch-checkpoint',
    anchor: "\\`git -C ${repoRoot} fetch origin <that target's ref>\\`",
    argv: ['-C', '<repoRoot>', 'fetch', 'origin', '--end-of-options', '<ref>'],
    derived: DERIVED_SEPARATOR,
    placeholders: { ...REPO_PLACEHOLDER, '<ref>': { incumbent: '<that target\'s ref>', ...CHECKPOINT_REF } },
  }),
  fixture({
    site: 'divergence-check',
    step: 'scoped-diff',
    anchor: "\\`git -C ${repoRoot} diff --name-only --end-of-options <that target's builtSha> <that target's mergedSha> -- <that target's fileScope paths>\\`",
    argv: ['-C', '<repoRoot>', 'diff', '--name-only', '--end-of-options', '<builtSha>', '<mergedSha>', '--', '<fileScope>'],
    placeholders: {
      ...REPO_PLACEHOLDER,
      '<builtSha>': { incumbent: '<that target\'s builtSha>', ...BUILT_SHA },
      '<mergedSha>': { incumbent: '<that target\'s mergedSha>', ...MERGED_SHA },
      '<fileScope>': { incumbent: '<that target\'s fileScope paths>', ...FILE_SCOPE },
    },
  }),

  fixture({
    site: 'prepare-probe',
    step: 'fetch-base',
    anchor: 'run \\`git -C ${repoRoot} fetch origin ${baseBranch}\\`',
    argv: ['-C', '<repoRoot>', 'fetch', 'origin', '--end-of-options', '<baseBranch>'],
    derived: DERIVED_SEPARATOR,
    placeholders: { ...REPO_PLACEHOLDER, ...BASE_PLACEHOLDER },
  }),
  fixture({
    site: 'prepare-probe',
    step: 'resolve-base',
    anchor: '\\`git -C ${repoRoot} rev-parse --verify origin/${baseBranch}\\`',
    argv: ['-C', '<repoRoot>', 'rev-parse', '--verify', '--end-of-options', 'origin/<baseBranch>'],
    derived: DERIVED_SEPARATOR,
    placeholders: { ...REPO_PLACEHOLDER, ...BASE_PLACEHOLDER },
  }),
  fixture({
    site: 'prepare-probe',
    step: 'config-present',
    anchor: '\\`git -C ${repoRoot} cat-file -e origin/${baseBranch}:receipts.config.json\\`',
    argv: ['-C', '<repoRoot>', 'cat-file', '-e', '--end-of-options', 'origin/<baseBranch>:receipts.config.json'],
    derived: DERIVED_SEPARATOR,
    placeholders: { ...REPO_PLACEHOLDER, ...BASE_PLACEHOLDER },
  }),
  fixture({
    site: 'prepare-probe',
    step: 'config-bytes',
    anchor: '\\`git -C ${repoRoot} show origin/${baseBranch}:receipts.config.json\\`',
    argv: ['-C', '<repoRoot>', 'show', '--end-of-options', 'origin/<baseBranch>:receipts.config.json'],
    derived: DERIVED_SEPARATOR,
    placeholders: { ...REPO_PLACEHOLDER, ...BASE_PLACEHOLDER },
  }),
  fixture({
    site: 'prepare-probe',
    step: 'workflow-present',
    anchor: '\\`git -C ${repoRoot} cat-file -e origin/${baseBranch}:.github/workflows/receipts.yml\\`',
    argv: ['-C', '<repoRoot>', 'cat-file', '-e', '--end-of-options', 'origin/<baseBranch>:.github/workflows/receipts.yml'],
    derived: DERIVED_SEPARATOR,
    placeholders: { ...REPO_PLACEHOLDER, ...BASE_PLACEHOLDER },
  }),
  fixture({
    site: 'prepare-probe',
    step: 'd6-present',
    anchor: '\\`git -C ${repoRoot} cat-file -e origin/${baseBranch}:scripts/d6-check.cjs\\`',
    argv: ['-C', '<repoRoot>', 'cat-file', '-e', '--end-of-options', 'origin/<baseBranch>:scripts/d6-check.cjs'],
    derived: DERIVED_SEPARATOR,
    placeholders: { ...REPO_PLACEHOLDER, ...BASE_PLACEHOLDER },
  }),

  fixture({
    site: 'restore',
    step: 'fetch-checkpoint',
    anchor: '\\`git -C ${repoRoot} fetch origin ${JSON.stringify(builtRef)}\\`',
    argv: ['-C', '<repoRoot>', 'fetch', 'origin', '--end-of-options', '<builtRef>'],
    derived: DERIVED_SEPARATOR,
    placeholders: { ...REPO_PLACEHOLDER, '<builtRef>': { incumbent: '${JSON.stringify(builtRef)}', ...BUILT_REF } },
  }),
  fixture({
    site: 'restore',
    step: 'resolve-fetch-head',
    anchor: '\\`git -C ${repoRoot} rev-parse FETCH_HEAD\\`',
    argv: ['-C', '<repoRoot>', 'rev-parse', 'FETCH_HEAD'],
    placeholders: { ...REPO_PLACEHOLDER },
  }),
  fixture({
    site: 'restore',
    step: 'move-branch',
    anchor: '\\`git -C ${repoRoot} branch -f ${integrationBranch} FETCH_HEAD\\`',
    argv: ['-C', '<repoRoot>', 'branch', '-f', '--end-of-options', '<integrationBranch>', 'FETCH_HEAD'],
    derived: DERIVED_SEPARATOR,
    placeholders: { ...REPO_PLACEHOLDER, ...IB_PLACEHOLDER },
  }),

  fixture({
    site: 'branch-compose',
    step: 'fetch-base',
    anchor: '\\`git -C ${repoRoot} fetch origin ${baseBranch}\\`, then fetch each parent checkpoint ref',
    argv: ['-C', '<repoRoot>', 'fetch', 'origin', '--end-of-options', '<baseBranch>'],
    derived: DERIVED_SEPARATOR,
    placeholders: { ...REPO_PLACEHOLDER, ...BASE_PLACEHOLDER },
  }),
  fixture({
    site: 'branch-compose',
    step: 'fetch-parent',
    anchor: 'run \\`git -C ${repoRoot} fetch origin <ref>\\` (each ref a single inert argv token)',
    argv: ['-C', '<repoRoot>', 'fetch', 'origin', '--end-of-options', '<ref>'],
    derived: DERIVED_SEPARATOR,
    placeholders: { ...REPO_PLACEHOLDER, '<ref>': { incumbent: '<ref>', ...CHECKPOINT_REF } },
  }),
  fixture({
    site: 'branch-compose',
    step: 'move-branch',
    anchor: 'Move the integration ref FRESH onto the pushed base: \\`git -C ${repoRoot} branch -f ${integrationBranch} origin/${baseBranch}\\` (this ref is local and never-pushed here, so a destructive branch move is safe forward compensation).\\n',
    argv: ['-C', '<repoRoot>', 'branch', '-f', '--end-of-options', '<integrationBranch>', 'origin/<baseBranch>'],
    derived: DERIVED_SEPARATOR,
    placeholders: { ...REPO_PLACEHOLDER, ...IB_PLACEHOLDER, ...BASE_PLACEHOLDER },
  }),
  fixture({
    site: 'branch-compose',
    step: 'resolve-parent',
    anchor: '\\`git -C ${repoRoot} rev-parse <ref>\\` and record it as builtAgainst[unitId]',
    argv: ['-C', '<repoRoot>', 'rev-parse', '<ref>'],
    placeholders: { ...REPO_PLACEHOLDER, '<ref>': { incumbent: '<ref>', ...CHECKPOINT_REF } },
  }),
  fixture({
    site: 'branch-compose',
    step: 'parent-contained',
    anchor: '\\`git -C ${repoRoot} merge-base --is-ancestor <parent tip> ${integrationBranch}\\`',
    argv: ['-C', '<repoRoot>', 'merge-base', '--is-ancestor', '--end-of-options', '<parentTip>', '<integrationBranch>'],
    derived: DERIVED_SEPARATOR,
    placeholders: { ...REPO_PLACEHOLDER, ...IB_PLACEHOLDER, '<parentTip>': { incumbent: '<parent tip>', ...PARENT_TIP } },
  }),
  fixture({
    site: 'branch-compose',
    step: 'restack-parent',
    anchor: '(rebase --onto ${integrationBranch} origin/${baseBranch} <parent tip>, or an equivalent cherry-pick',
    argv: ['-C', '<repoRoot>', 'rebase', '--onto', '<integrationBranch>', '--end-of-options', 'origin/<baseBranch>', '<parentTip>'],
    placeholders: { ...IB_PLACEHOLDER, ...BASE_PLACEHOLDER, '<parentTip>': { incumbent: '<parent tip>', ...PARENT_TIP }, ...REPO_PLACEHOLDER },
    derived: { ...DERIVED_REPO_SCOPE, ...DERIVED_SEPARATOR },
    omitted: OMITTED_PROSE_SPELLING,
  }),
  fixture({
    site: 'branch-compose',
    step: 'rebase-abort',
    anchor: 'abort it (\\`git -C ${repoRoot} rebase --abort\\`',
    argv: ['-C', '<repoRoot>', 'rebase', '--abort'],
    placeholders: { ...REPO_PLACEHOLDER },
  }),
  fixture({
    site: 'branch-compose',
    step: 'cherry-pick-abort',
    anchor: '\\`git -C ${repoRoot} cherry-pick --abort\\`)',
    argv: ['-C', '<repoRoot>', 'cherry-pick', '--abort'],
    placeholders: { ...REPO_PLACEHOLDER },
  }),

  fixture({
    site: 'branch-prep',
    step: 'fetch-base',
    anchor: '1. \\`git -C ${repoRoot} fetch origin ${baseBranch}\\`\\n',
    argv: ['-C', '<repoRoot>', 'fetch', 'origin', '--end-of-options', '<baseBranch>'],
    derived: DERIVED_SEPARATOR,
    placeholders: { ...REPO_PLACEHOLDER, ...BASE_PLACEHOLDER },
  }),
  fixture({
    site: 'branch-prep',
    step: 'resolve-branch',
    anchor: '\\`git -C ${repoRoot} rev-parse --verify --quiet ${integrationBranch}\\`',
    argv: ['-C', '<repoRoot>', 'rev-parse', '--verify', '--quiet', '--end-of-options', '<integrationBranch>'],
    derived: DERIVED_SEPARATOR,
    placeholders: { ...REPO_PLACEHOLDER, ...IB_PLACEHOLDER },
  }),
  fixture({
    site: 'branch-prep',
    step: 'resolve-base',
    anchor: 'compared to \\`git -C ${repoRoot} rev-parse origin/${baseBranch}\\`',
    argv: ['-C', '<repoRoot>', 'rev-parse', 'origin/<baseBranch>'],
    placeholders: { ...REPO_PLACEHOLDER, ...BASE_PLACEHOLDER },
  }),
  fixture({
    site: 'branch-prep',
    step: 'move-branch',
    anchor: 'move it FRESH onto the pushed base: \\`git -C ${repoRoot} branch -f ${integrationBranch} origin/${baseBranch}\\`',
    argv: ['-C', '<repoRoot>', 'branch', '-f', '--end-of-options', '<integrationBranch>', 'origin/<baseBranch>'],
    derived: DERIVED_SEPARATOR,
    placeholders: { ...REPO_PLACEHOLDER, ...IB_PLACEHOLDER, ...BASE_PLACEHOLDER },
  }),

  fixture({
    site: 'checkpoint-push',
    step: 'resolve-tip',
    anchor: 'Read the local integration tip: \\`git -C ${repoRoot} rev-parse ${integrationBranch}\\`',
    argv: ['-C', '<repoRoot>', 'rev-parse', '<integrationBranch>'],
    placeholders: { ...REPO_PLACEHOLDER, ...IB_PLACEHOLDER },
  }),
  fixture({
    site: 'checkpoint-push',
    step: 'read-remote',
    anchor: '\\`git -C ${repoRoot} ls-remote origin ${durableCheckpointRef}\\`',
    argv: ['-C', '<repoRoot>', 'ls-remote', 'origin', '--end-of-options', '<durableCheckpointRef>'],
    derived: DERIVED_SEPARATOR,
    placeholders: { ...REPO_PLACEHOLDER, '<durableCheckpointRef>': { incumbent: '${durableCheckpointRef}', ...DURABLE_REF } },
  }),
  fixture({
    site: 'checkpoint-push',
    step: 'push',
    anchor: '\\`git -C ${repoRoot} push origin ${integrationBranch}:${durableCheckpointRef}\\`',
    argv: ['-C', '<repoRoot>', 'push', 'origin', '--end-of-options', '<integrationBranch>:<durableCheckpointRef>'],
    derived: DERIVED_SEPARATOR,
    placeholders: { ...REPO_PLACEHOLDER, ...IB_PLACEHOLDER, '<durableCheckpointRef>': { incumbent: '${durableCheckpointRef}', ...DURABLE_REF } },
  }),
  fixture({
    site: 'checkpoint-push',
    step: 'force-retry',
    anchor: 'retry once with \\`git -C ${repoRoot} push --force-with-lease origin ${integrationBranch}:${durableCheckpointRef}\\`',
    argv: ['-C', '<repoRoot>', 'push', '--force-with-lease', 'origin', '--end-of-options', '<integrationBranch>:<durableCheckpointRef>'],
    derived: DERIVED_SEPARATOR,
    placeholders: { ...REPO_PLACEHOLDER, ...IB_PLACEHOLDER, '<durableCheckpointRef>': { incumbent: '${durableCheckpointRef}', ...DURABLE_REF } },
  }),

  fixture({
    site: 'ci-diff',
    step: 'changed-paths',
    anchor: 'Run EXACTLY: \\`git -C ${repoRoot} diff --name-only --end-of-options ${JSON.stringify(fromSha)} ${JSON.stringify(integrationBranch)}\\` (both endpoints are separate INERT argv tokens',
    argv: ['-C', '<repoRoot>', 'diff', '--name-only', '--end-of-options', '<fromSha>', '<integrationBranch>'],
    placeholders: {
      ...REPO_PLACEHOLDER,
      '<fromSha>': { incumbent: '${JSON.stringify(fromSha)}', ...FROM_SHA },
      '<integrationBranch>': { incumbent: '${JSON.stringify(integrationBranch)}', ...INTEGRATION_BRANCH },
    },
  }),

  fixture({
    site: 'ci-publish-verify',
    step: 'append-only',
    anchor: 'run \\`git -C ${repoRoot} merge-base --is-ancestor ${JSON.stringify(fromSha)} ${JSON.stringify(integrationBranch)}\\` (both refs are separate INERT argv tokens)',
    argv: ['-C', '<repoRoot>', 'merge-base', '--is-ancestor', '--end-of-options', '<fromSha>', '<integrationBranch>'],
    derived: DERIVED_SEPARATOR,
    placeholders: {
      ...REPO_PLACEHOLDER,
      '<fromSha>': { incumbent: '${JSON.stringify(fromSha)}', ...FROM_SHA },
      '<integrationBranch>': { incumbent: '${JSON.stringify(integrationBranch)}', ...INTEGRATION_BRANCH },
    },
  }),
  fixture({
    site: 'ci-publish-verify',
    step: 'changed-paths',
    anchor: '2. Run EXACTLY: \\`git -C ${repoRoot} diff --name-only --end-of-options ${JSON.stringify(fromSha)} ${JSON.stringify(integrationBranch)}\\`.\\n',
    argv: ['-C', '<repoRoot>', 'diff', '--name-only', '--end-of-options', '<fromSha>', '<integrationBranch>'],
    placeholders: {
      ...REPO_PLACEHOLDER,
      '<fromSha>': { incumbent: '${JSON.stringify(fromSha)}', ...FROM_SHA },
      '<integrationBranch>': { incumbent: '${JSON.stringify(integrationBranch)}', ...INTEGRATION_BRANCH },
    },
  }),

  fixture({
    site: 'manifest-publish',
    step: 'git-dir',
    anchor: 'run \\`git -C ${repoRoot} rev-parse --git-dir\\`',
    argv: ['-C', '<repoRoot>', 'rev-parse', '--git-dir'],
    placeholders: { ...REPO_PLACEHOLDER },
  }),
  fixture({
    site: 'manifest-publish',
    step: 'read-remote',
    anchor: 'already published: run \\`git -C ${repoRoot} ls-remote origin ${manifestRef}\\`',
    argv: ['-C', '<repoRoot>', 'ls-remote', 'origin', '--end-of-options', '<manifestRef>'],
    derived: DERIVED_SEPARATOR,
    placeholders: { ...REPO_PLACEHOLDER, ...MANIFEST_PLACEHOLDER },
  }),
  fixture({
    site: 'manifest-publish',
    step: 'hash-object',
    anchor: '\\`BLOB=$(git -C ${repoRoot} hash-object -w --stdin < ${repoRoot}/.mitosis/published-manifest.json)\\`',
    argv: ['-C', '<repoRoot>', 'hash-object', '-w', '--stdin'],
    placeholders: { ...REPO_PLACEHOLDER },
    stdin: 'the bytes of the manifest file written in step 3; the incumbent redirects that file into the child, and a redirect is a shell construction rather than an argument vector element',
    omitted: OMITTED_BLOB_CAPTURE,
  }),
  fixture({
    site: 'manifest-publish',
    step: 'mktree',
    anchor: "\\`TREE=$(printf '100644 blob %s\\\\tmanifest.json\\\\n' \"$BLOB\" | git -C ${repoRoot} mktree)\\`",
    argv: ['-C', '<repoRoot>', 'mktree'],
    placeholders: { ...REPO_PLACEHOLDER },
    stdin: 'the one-entry tree line the incumbent composes with printf and pipes in; printf is a shell builtin rather than a spawnable binary, so the bytes are composed in process and handed to the child as stdin',
    omitted: OMITTED_TREE_COMPOSITION,
  }),
  fixture({
    site: 'manifest-publish',
    step: 'commit-tree',
    anchor: '\\`COMMIT=$(git -C ${repoRoot} -c user.name=mitosis -c user.email=mitosis@localhost commit-tree "$TREE" -m "mitosis run manifest ${logicalRunId}")\\`',
    argv: ['-C', '<repoRoot>', '-c', 'user.name=mitosis', '-c', 'user.email=mitosis@localhost', 'commit-tree', '<tree>', '-m', 'mitosis run manifest <logicalRunId>'],
    placeholders: {
      ...REPO_PLACEHOLDER,
      '<tree>': { incumbent: '"$TREE"', ...TREE },
      '<logicalRunId>': { incumbent: '${logicalRunId}', ...RUN_ID },
    },
    omitted: OMITTED_COMMIT_CAPTURE,
  }),
  fixture({
    site: 'manifest-publish',
    step: 'update-ref',
    anchor: '\\`git -C ${repoRoot} update-ref ${manifestRef} "$COMMIT"\\`',
    argv: ['-C', '<repoRoot>', 'update-ref', '--end-of-options', '<manifestRef>', '<commit>'],
    derived: DERIVED_SEPARATOR,
    placeholders: { ...REPO_PLACEHOLDER, ...MANIFEST_PLACEHOLDER, '<commit>': { incumbent: '"$COMMIT"', ...COMMIT } },
  }),
  fixture({
    site: 'manifest-publish',
    step: 'push',
    anchor: 'Publish it: \\`git -C ${repoRoot} push origin ${manifestRef}:${manifestRef}\\`',
    argv: ['-C', '<repoRoot>', 'push', 'origin', '--end-of-options', '<manifestRef>:<manifestRef>'],
    derived: DERIVED_SEPARATOR,
    placeholders: { ...REPO_PLACEHOLDER, ...MANIFEST_PLACEHOLDER },
  }),
  fixture({
    site: 'manifest-publish',
    step: 'verify-remote',
    anchor: 'run \\`git -C ${repoRoot} ls-remote origin ${manifestRef}\\` and confirm the sha it prints equals $COMMIT',
    argv: ['-C', '<repoRoot>', 'ls-remote', 'origin', '--end-of-options', '<manifestRef>'],
    derived: DERIVED_SEPARATOR,
    placeholders: { ...REPO_PLACEHOLDER, ...MANIFEST_PLACEHOLDER },
  }),
  fixture({
    site: 'manifest-publish',
    step: 'read-back',
    anchor: 'run \\`git -C ${repoRoot} cat-file -p ${manifestRef}:manifest.json\\`',
    argv: ['-C', '<repoRoot>', 'cat-file', '-p', '--end-of-options', '<manifestRef>:manifest.json'],
    derived: DERIVED_SEPARATOR,
    placeholders: { ...REPO_PLACEHOLDER, ...MANIFEST_PLACEHOLDER },
  }),
]);

export const MANIFEST_WRITE_FIXTURE = Object.freeze({
  site: 'manifest-publish',
  step: 'write-payload',
  anchor: 'Create ${repoRoot}/.mitosis/ if it does not already exist, then write the following to ${repoRoot}/.mitosis/published-manifest.json',
  directory: '.mitosis',
  file: 'published-manifest.json',
});

const SHIP_COMPOSE_HEAD_VALUES = Object.freeze({
  repoRoot: REPO.value,
  integrationBranch: INTEGRATION_BRANCH.value,
  builtRef: BUILT_REF.value,
});

const SHIP_COMPOSE_HEAD_ARGV = Object.freeze([
  '-C', REPO.value, 'branch', '-f', '--end-of-options', INTEGRATION_BRANCH.value, BUILT_REF.value,
]);

export const SHIP_COMPOSE_HEAD_COMMAND = Object.freeze({
  binary: GIT_COMMAND_BINARY,
  site: 'ship',
  step: 'compose-head',
  field: 'integrationBranch',
  anchor: '--head ${integrationBranch} --base ${baseBranch} --title',
  values: SHIP_COMPOSE_HEAD_VALUES,
  argv: SHIP_COMPOSE_HEAD_ARGV,
  reason: 'the incumbent demands integrationBranch as the head a pull request is opened against and spells no command that ever creates that branch: the child implementer commits to ${branchPrefix}/${msp.id} and every ship read names ${sourcePrefix}/${msp.id}-integration, so the head is composed here from the recorded built ref rather than transcribed, and the frozen vector is its whole pin',
});

const SHIP_RETIRE_HEAD_VALUES = Object.freeze({
  repoRoot: REPO.value,
  integrationBranch: INTEGRATION_BRANCH.value,
});

const SHIP_RETIRE_HEAD_ARGV = Object.freeze([
  '-C', REPO.value, 'push', '--delete', 'origin', '--end-of-options', `refs/heads/${INTEGRATION_BRANCH.value}`,
]);

export const SHIP_RETIRE_HEAD_COMMAND = Object.freeze({
  binary: GIT_COMMAND_BINARY,
  site: 'ship',
  step: 'retire-head',
  field: 'headRefName',
  anchor: '--json headRefName,url,mergedAt,mergeCommit',
  values: SHIP_RETIRE_HEAD_VALUES,
  argv: SHIP_RETIRE_HEAD_ARGV,
  reason: 'the incumbent reads the merged pull requests and the headRefName of each, and spells no command that ever deletes one of those heads, yet a forge retargets a stacked child onto the trunk only once its base branch is gone, so the deletion is derived here rather than transcribed and the frozen vector is its whole pin; the head is named fully qualified under refs/heads/ because git resolves a bare name against every remote ref, and where no branch matches but a tag of that name does, the bare spelling deletes the tag instead',
});

export const PLAN_PROBE_FIXTURE = Object.freeze({
  site: 'plan-probe',
  step: 'artifact-present',
  anchor: 'Check the plan artifact: \\`test -f ${planned.planPath} && test -s ${planned.planPath}\\`',
  refusedBinary: 'test',
  reason: 'test is a shell builtin rather than one of the spawnable binaries, so the incumbent check cannot be transcribed as a spawn at all; it becomes an in process filesystem observation of the same two facts, that the path is a regular file and that it holds bytes, produced by observePlanArtifact against a path confined to the workspace and read by classifyPlanArtifact, which the verb runs against a present and an absent path on every invocation',
});
