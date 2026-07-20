# Pull Requests

When creating PRs:
1. Analyze the full commit history (not just the latest commit).
2. Use `git diff <base-branch>...HEAD` to see all changes.
3. Draft a comprehensive PR summary.
4. Include a test plan with TODOs.
5. Push with `-u` when the branch is new.

Use the `gh` CLI for GitHub operations. No AI co-author attribution.

## PR policy (per-MSP, mitosis-aligned)

- Open one PR per MSP (minimum shippable product), autonomously — opening the PR is part of shipping the MSP.
- Green-branch invariant: a PR merged into ANY branch (feature branch, development, master) must not break the functionality of the application on that branch. This invariant is the reason MSPs exist.
- A change that would break its target branch on merge is not independently shippable and gets no standalone MSP/PR — e.g. a UI/UX change that writes to API routes that do not yet exist; it ships in (or after) the MSP that provides those routes.
