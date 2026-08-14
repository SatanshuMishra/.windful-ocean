import { cleanPromptValue, validatePromptInput } from './prompt-contract.mjs';

function renderPathList(paths) {
  return paths.length > 0 ? paths.map((p) => JSON.stringify(p)).join(', ') : '(none declared)';
}

function groundTruthSeed(unitId, specPath, fileScope) {
  const scopeList = renderPathList(fileScope.edit);
  const readList = renderPathList(fileScope.read);
  return `Ground truth for MSP "${unitId}" (a hint to VERIFY against the live code, NOT a trust boundary): the approved spec lives at ${specPath} — read it to confirm this MSP's decomposition still holds against the current tree. This MSP's declared fileScope is [${scopeList}]; keep the plan STRICTLY within that slice. Do NOT expand into sibling-MSP territory or files outside this fileScope: sibling MSPs own their own slices and run in other waves, and an over-reaching plan collides on shared files (a collision surfaces as a merge conflict / CI failure / park, never a silent bad merge). If reading the spec reveals the decomposition itself is wrong (this MSP's slice is mis-cut), STOP and report that this MSP must be re-decomposed rather than planning around it. Read-only context for this MSP is [${readList}]: read those files to understand the seam, but do NOT plan edits to them - they belong to sibling MSPs.`;
}

export function composeDecomposePrompt(input) {
  const { specPath, repoRoot, changeTypes } = validatePromptInput('decompose', input);
  return `You are the decomposition stage of a mitosis run. You have NO Skill tool; follow these instructions directly.\n\n` +
    `Read the approved spec/batch document at: ${specPath}\n` +
    `Target repository root: ${repoRoot}\n\n` +
    `Decompose the spec into clusters of MSPs (minimum shippable products). An MSP is the smallest unit that is independently shippable behind its own PR and leaves the shared branch green. Use the D1 code-intelligence stack to ground the decomposition: native caller/callee facts (Serena find_referencing_symbols / find_symbol) for dependency edges, the Graphify map (run \`graphify query\` / \`graphify explain\` via Bash, token-free) for orientation, and targeted Read/Grep for the seams the oracle cannot see (dynamic dispatch, DI, FFI, SQL, codegen).\n\n` +
    `Order the MSPs BOTTOM-UP: an MSP must appear AFTER every MSP it depends on. Express every cross-MSP dependency in dependsOn using the MSP ids you assign. Assign each MSP a stable kebab-case id of 30 characters or fewer, unique within this run.\n\n` +
    `Each MSP DECLARES its own change type and scope; never infer either from which files the MSP touches. changeType is exactly one of: ${changeTypes.join(' | ')} — the kind of change the MSP makes. scope is a short kebab-case subsystem noun of 16 characters or fewer (e.g. "auth", "pr-tool", "hooks").\n` +
    `title is a lowercase imperative summary of 40 characters or fewer, printable ASCII only, with no trailing period — it becomes the Conventional-Commits summary of this MSP's pull-request title and therefore its squash commit subject.\n` +
    `rationale is one sentence of 200 characters or fewer, printable ASCII only, starting with a letter or digit — it becomes the Why line of this MSP's pull-request body.\n` +
    `Neither title nor rationale may contain a dollar sign, a backtick, a backslash, or an HTML tag opener: both are emitted as inert argv values into an engine-composed command, and a run whose MSP fields do not compose a valid pull-request title and body HALTS for a human rather than guessing a change type.\n\n` +
    `For each MSP, declare its fileScope: the NARROWEST CORRECT set of repository paths and globs that still covers EVERYTHING that MSP writes or owns. When a change is file-local, name the EXACT files (e.g. "lib/config.ts", "src/auth/login.ts"), NOT their parent directory; reserve a directory glob (e.g. "src/auth/**") for an MSP that genuinely owns the whole directory. Ground fileScope in the SAME D1 code-intelligence stack you used above (the Graphify map for orientation, Serena / native LSP for the symbols each MSP touches, targeted Read/Grep for the seams the oracle cannot see). Completeness is non-negotiable: omitting a path an MSP writes lets two MSPs collide on the same file, so declare every surface you touch — but no MORE. Over-broad scope needlessly serializes MSPs that could run in parallel (fileScope overlap is what clusters MSPs that must not co-run); a deterministic post-derivation lint flags suspiciously coarse scopes (a bare top-level directory, or a directory covering files the task text names specifically) for reviewer attention. Declare fileScope as a context pack { edit, read, truncated }: edit is the set this MSP WRITES and is the collision fence; read is the set it must READ for context but must never write, and it serializes nothing; truncated is required and is null unless you dropped entries, in which case it is { dropped, reason }. A path in edit must never be repeated in read.\n\n` +
    `Return ONLY the structured object: { msps: [ { id, title, rationale, changeType, scope, dependsOn, fileScope: { edit, read, truncated } } ] }, ordered bottom-up.`;
}

export function composePlanPrompt(input) {
  const validated = validatePromptInput('plan', input);
  const { unitId, title, libDir, writingPlansGlob, rationale, repoRoot, dependsList, specPath, fileScope } = validated;
  return `You are the planning stage for MSP "${unitId}" (${title}) of a mitosis run. You have NO Skill tool.\n\n` +
    `Locate the superpowers writing-plans skill WITHOUT hardcoding its version: run \`node ${libDir}/superpowers-prompts.mjs\` if it prints a skillsDir, otherwise glob \`${writingPlansGlob}\`. Read that SKILL.md and follow it exactly.\n\n` +
    `Scope: produce an implementation plan for ONLY this MSP: ${rationale}\n` +
    `Target repo: ${repoRoot}. Earlier MSPs in this cluster's chain (already planned/merged) you may depend on: ${dependsList}.\n\n` +
    `${groundTruthSeed(unitId, specPath, fileScope)}\n\n` +
    `Write the plan to: ${repoRoot}/.mitosis/${unitId}.plan.md (create the .mitosis directory if absent).\n\n` +
    `Return ONLY: { planPath: "<absolute path to the plan you wrote>", summary: "<one sentence>" }.`;
}

export function composePlanReviewPrompt(input) {
  const { unitId, title, planPath, rationale, dependsList, iteration } = validatePromptInput('plan-review', input);
  return `You are an OBJECTIVE, fresh-no-prior-context adversarial reviewer of the implementation plan for MSP "${unitId}" (${title}) of a mitosis run. You did NOT write this plan; you have NO Skill tool. This is review iteration ${iteration}.\n\n` +
    `Read the plan at: ${planPath}. Scope of this MSP: ${rationale}. Earlier MSPs already planned/merged that it may depend on: ${dependsList}.\n\n` +
    `Stress-test the plan on FOUR axes against the Three Pillars (Quality > Optimization > Speed, in that strict order):\n` +
    `1. necessity — every step earns its place; no gold-plating, no speculative abstraction, no work the MSP does not require.\n` +
    `2. regression-risk — the plan will not break existing behavior; use native LSP call hierarchy (find_referencing_symbols / find_implementations) and targeted reads to check blast radius.\n` +
    `3. over-scope — the plan stays within this MSP's declared scope and file set; it does not expand into unrelated subsystems.\n` +
    `4. parallel-safety — the plan's task decomposition is genuinely independent where it claims to be; no hidden shared-state collisions.\n\n` +
    `Default to "needs-changes" when you are GENUINELY uncertain that the plan aligns with the pillars, but do NOT manufacture findings on a sound, minimal plan — approving a correct minimal plan is the right answer. For each real problem emit one finding { axis, severity, detail }.\n\n` +
    `Return ONLY: { verdict: "approve" | "needs-changes", findings: [{ axis: "necessity" | "regression-risk" | "over-scope" | "parallel-safety", severity: "<low|medium|high>", detail: "<what is wrong and why>" }], pillarsAlignment: "<one sentence on how the plan sits against Quality>Optimization>Speed>" }.`;
}

export function composeReplanPrompt(input) {
  const { unitId, title, planPath, rationale, dependsList, findings } = validatePromptInput('replan', input);
  const rendered = findings.length > 0
    ? findings.map((f, i) => `${i + 1}. [${cleanPromptValue(f.axis)} / ${cleanPromptValue(f.severity)}] ${cleanPromptValue(f.detail)}`).join('\n')
    : '(no structured findings supplied; the review was a non-approval — re-examine the plan against necessity, regression-risk, over-scope and parallel-safety yourself)';
  return `You are revising the implementation plan for MSP "${unitId}" (${title}) of a mitosis run after an adversarial review returned needs-changes. You have NO Skill tool.\n\n` +
    `Current plan: ${planPath}. Scope of this MSP: ${rationale}. Earlier MSPs already planned/merged it may depend on: ${dependsList}.\n\n` +
    `Review findings to remediate:\n${rendered}\n\n` +
    `Address EACH finding minimally. Do NOT over-correct and do NOT expand scope: fix exactly what the finding names and nothing more, keeping the plan the smallest correct plan that satisfies the pillars (Quality > Optimization > Speed). Overwrite the SAME plan file idempotently at ${planPath} (create the .mitosis directory if absent).\n\n` +
    `Return ONLY: { planPath: "<absolute path to the revised plan you wrote>", summary: "<one sentence on what you changed>" }.`;
}
