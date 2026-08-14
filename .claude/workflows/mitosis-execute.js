export const meta = {
  name: 'mitosis-execute',
  description: 'Execute an annotated plan: parallel waves with worktree or scope-fence isolation, risk-scaled spec+quality review, model-tiered agents, conflict-checked merge or deterministic fence verification, single boundary validation + final review.',
  phases: [
    { title: 'Execute' },
    { title: 'Integrate' },
    { title: 'Final review' },
  ],
};

const tasks = args.tasks;
const waves = args.waves;
const branchPrefix = args.branchPrefix;
const baseBranch = args.baseBranch;
const worktreeRoot = args.worktreeRoot;
const repoRoot = args.repoRoot;
const scopedCheckCmd = args.scopedCheckCmd;
const fullValidationCmd = args.fullValidationCmd;
const prompts = args.prompts;
const fixLoopMax = args.fixLoopMax;
const isolation = args.isolation || 'worktree';
const launchCommit = args.launchCommit || null;
const runArtifacts = args.runArtifacts;
const models = args.models || {};

const { homedir } = await import('node:os');
const { runEngine } = await import(`file://${homedir()}/.claude/lib/mitosis/run-engine.mjs`);

return runEngine(
  { tasks, waves, branchPrefix, baseBranch, worktreeRoot, repoRoot, scopedCheckCmd, fullValidationCmd, prompts, fixLoopMax, isolation, launchCommit, runArtifacts, models },
  { agent, parallel, log, phase },
);
