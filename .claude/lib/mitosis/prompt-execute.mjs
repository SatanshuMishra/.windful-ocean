import { TRUNCATED_EDIT, promptSection, validatePromptInput } from './prompt-contract.mjs';
import { shellQuote, shellQuoteList } from './prompt-values.mjs';

const SCOPE_FENCE = 'scope-fence';

function declaredScope(paths) {
  return paths.length > 0 ? shellQuoteList(paths) : '(none declared)';
}

const CI_ENFORCED_SCOPING = `CI already enforces lint, formatting, type-checks, and the test suite deterministically: a Tier-0 static layer gates every merge, so pure style, formatting, lint-shaped, and generic-maintainability nits, plus failing tests, type errors, and lint output, are caught deterministically without an LLM and are NOT yours to re-flag - do not spend review budget on them. Concentrate your judgment where it is structurally necessary. You are an OBJECTIVE reviewer with NO merge authority: return only a verdict and specific findings; you never merge.`;

function readListClause(read) {
  return read.length > 0
    ? ` You MAY read these files for context but must NOT edit them: ${JSON.stringify(read)}.`
    : '';
}

function truncationClause(marker) {
  if (marker === null) return '';
  return marker.list === TRUNCATED_EDIT
    ? ` The declared edit scope is INCOMPLETE: ${marker.dropped} path(s) were dropped (${marker.reason}); the fence above is still the whole of what you may write, so report the omission rather than editing a path it does not name.`
    : ` The read-context list is INCOMPLETE: ${marker.dropped} path(s) were dropped (${marker.reason}); treat it as a partial view and verify against the live tree.`;
}

function readContextClause(fileScope) {
  return `${readListClause(fileScope.read)}${truncationClause(fileScope.truncated)}`;
}

function escalationContext(priorIssues) {
  const issues = priorIssues === null ? [] : priorIssues;
  return issues.length
    ? `${promptSection('priorAttemptReviewIssues')}\n` +
      `A prior attempt on this task was rejected at review. Its work is already committed on the existing branch/worktree; continue from there and address each specific issue below directly:\n- ${issues.join('\n- ')}\n\n`
    : '';
}

function reviewTarget({ isolation, repoRoot, launchCommit, fileScope, baseBranch, branch }) {
  if (isolation === SCOPE_FENCE) {
    return `Do NOT enter any worktree and do NOT mutate anything. From the main repo at ${repoRoot}, inspect READ-ONLY:\n` +
      `\`git diff ${shellQuote(launchCommit)} -- ${shellQuoteList(fileScope.edit)}\` plus \`git status --porcelain -- ${shellQuoteList(fileScope.edit)}\`; read any untracked files the latter lists.`;
  }
  return `Do NOT create or enter a worktree. From the main repo at ${repoRoot}, inspect the change READ-ONLY:\n` +
    `\`git diff ${shellQuote(`${baseBranch}..${branch}`)}\` and \`git diff --stat ${shellQuote(`${baseBranch}..${branch}`)}\`.`;
}

export function composeImplementPrompt(input) {
  const validated = validatePromptInput('implement', input);
  const { implementerPreamble, priorIssues, isolation, repoRoot, branch, worktree, baseBranch, scopedCheckCmd, taskTitle, taskFullText, fileScope } = validated;
  if (isolation === SCOPE_FENCE) {
    return `${implementerPreamble}\n\n${promptSection('thisTask')}\n${escalationContext(priorIssues)}` +
      `Work directly in the main repository working tree at ${repoRoot}. Do NOT create a worktree or a branch.\n` +
      `1. Edit ONLY files within this task's declared scope: ${declaredScope(fileScope.edit)}. Creating or editing anything outside this scope is a hard failure.${readContextClause(fileScope)}\n` +
      `2. Do NOT run any git mutation (no add, no commit, no branch, no checkout, no stash). Leave all changes uncommitted.\n` +
      `3. Follow TDD as the instructions above require.\n` +
      `4. For verification run ONLY the scoped check, never a full build/suite: \`${shellQuoteList(scopedCheckCmd)}\`\n\n` +
      `Task: ${taskTitle}\n\n${taskFullText}\n\n` +
      `Report status as exactly one of DONE / DONE_WITH_CONCERNS / BLOCKED / NEEDS_CONTEXT.`;
  }
  return `${implementerPreamble}\n\n${promptSection('thisTask')}\n${escalationContext(priorIssues)}` +
    `Set up an isolated workspace, then implement.\n` +
    `1. Create a dedicated worktree (observe-then-converge; idempotent under replay). FIRST check whether it already exists: \`git -C ${shellQuote(repoRoot)} worktree list --porcelain\` and \`git -C ${shellQuote(repoRoot)} rev-parse --verify --quiet ${shellQuote(branch)}\`. If a worktree at ${worktree} is already checked out on ${branch}, REUSE it (skip the add). If ${branch} exists but no worktree is attached, attach without -b: \`git -C ${shellQuote(repoRoot)} worktree add ${shellQuote(worktree)} ${shellQuote(branch)}\`. Otherwise create it fresh (retry once if git reports a lock):\n` +
    `   \`git -C ${shellQuote(repoRoot)} worktree add -b ${shellQuote(branch)} ${shellQuote(worktree)} ${shellQuote(baseBranch)}\`\n` +
    `2. \`cd ${shellQuote(worktree)}\` and do ALL work there. Follow TDD as the instructions above require.\n` +
    `3. Bootstrap dependencies before any check (idempotent): \`ln -sfn ${shellQuote(`${repoRoot}/node_modules`)} node_modules\`\n` +
    `4. For verification run ONLY the scoped check, never a full build/suite: \`${shellQuoteList(scopedCheckCmd)}\`\n` +
    `5. Commit your work to \`${shellQuote(branch)}\` (one or more commits). Do NOT remove the worktree.\n\n` +
    `Task: ${taskTitle}\n\n${taskFullText}\n\n` +
    `Report status as exactly one of DONE / DONE_WITH_CONCERNS / BLOCKED / NEEDS_CONTEXT.`;
}

export function composeReviewPrompt(input) {
  const validated = validatePromptInput('review', input);
  const { specReviewerPreamble, qualityReviewerPreamble, fileScope, taskFullText } = validated;
  return `${specReviewerPreamble}\n\n${qualityReviewerPreamble}\n\n${promptSection('whatToReview')}\n${reviewTarget(validated)}\n\n` +
    `Spec for this task:\n${taskFullText}\n\n` +
    `File scope for THIS task: ${declaredScope(fileScope.edit)}${readContextClause(fileScope)}\n` +
    `Judge ONLY the files in this task's fileScope. Files outside it belong to SIBLING TASKS in the same MSP that are built in other waves and are correctly absent from this branch - do NOT flag them as missing or incomplete. Do NOT open .mitosis/*.plan.md or *.graph.json to assess completeness; the task body above is the complete and authoritative scope for THIS task.\n\n` +
    `${CI_ENFORCED_SCOPING}\n\n` +
    `${promptSection('tier1SecurityChecklist')}\n` +
    `Scan ONLY this task's diff for these OWASP-shaped classes and, for any that are present, return verdict 'fail' with the file:line and CWE class: injection - SQL / command / template (CWE-89/78/94), broken authorization or access control (CWE-285/862), hardcoded or leaked secrets (CWE-798), server-side request forgery / SSRF (CWE-918), unsafe deserialization (CWE-502), and path traversal (CWE-22). This is a scoped pass over the diff already under review, NOT an open-ended vulnerability hunt.\n\n` +
    `Review in two stages. STAGE 1 (hard precondition): verify the code matches the spec; any spec mismatch is verdict 'fail' regardless of code quality. STAGE 2 (only if stage 1 passes): judge code quality. Return a single verdict: 'pass' only if BOTH stages pass, else 'fail' with specific issues (file:line).`;
}

export function composeSecurityPrompt(input) {
  const validated = validatePromptInput('security', input);
  const { taskId, taskTitle, taskFullText, fileScope } = validated;
  return `${promptSection('securityReviewTarget')}\n${reviewTarget(validated)}\n\n` +
    `Task id: ${taskId}\nTitle: ${taskTitle}\n\n${taskFullText}\n\n` +
    `File scope: ${declaredScope(fileScope.edit)}${readContextClause(fileScope)}\n\n` +
    `${CI_ENFORCED_SCOPING}\n\n` +
    `Return verdict 'pass' if no security issues are found, else 'fail' with specific issues (file:line).`;
}

export function composeFixPrompt(input) {
  const validated = validatePromptInput('fix', input);
  const { isolation, repoRoot, fileScope, issues, scopedCheckCmd, taskFullText, worktree, branch } = validated;
  if (isolation === SCOPE_FENCE) {
    return `Apply fixes in the MAIN repository working tree at ${repoRoot} (no worktree, no branch, no git mutations; leave changes uncommitted).\n` +
      `Edit ONLY within this task's declared scope: ${declaredScope(fileScope.edit)}.${readContextClause(fileScope)}\n` +
      `1. Fix these issues:\n- ${issues.join('\n- ')}\n` +
      `2. Re-run the scoped check: \`${shellQuoteList(scopedCheckCmd)}\`\n\nTask context:\n${taskFullText}`;
  }
  return `Apply fixes in the EXISTING worktree for this task.\n` +
    `1. \`cd ${shellQuote(worktree)}\` (the worktree already exists on branch ${branch}).\n` +
    `2. Fix these issues:\n- ${issues.join('\n- ')}\n` +
    `3. Re-run the scoped check: \`${shellQuoteList(scopedCheckCmd)}\`\n` +
    `4. Commit the fixes to \`${shellQuote(branch)}\`.\n\nTask context:\n${taskFullText}`;
}
