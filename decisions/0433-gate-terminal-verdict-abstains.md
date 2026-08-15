---
Status: accepted
Date: 2026-08-15T01:13:57.645Z
Thread-Id: 01KZZDZ15E6308G0V1TQ9GH0BD
---

# 0433. Reverse the bash gate's terminal verdict to no-opinion so the classifier judges Bash again

## Context

Threat model section 1 records M24: a PreToolUse `allow` suppresses the auto-mode classifier itself, not merely the prompt. Since 2026-08-13 the gate's terminal verdict was `allow`, so every Bash command the gate did not flag was affirmatively allowed and the classifier's rule set (17 allow / 66 soft deny / 1 hard deny) was unreachable for shell commands. That made the gate the sole arbiter of Bash, which in turn forced the fault path to fail to `ask` — the only remaining protection against a broken gate opening the surface it guards. The owner's goal is unattended autonomy, and an `ask` is the one verdict that stops a session indefinitely. The two constraints were in direct conflict while the terminal verdict stayed `allow`.

## Options

- Path A - keep the terminal verdict at allow. Gate stays sole arbiter of Bash, no classifier round-trip per command, but Definition of done item 2 requires the fault path keep asking, so an unattended hang remains reachable.
- Path B - reverse the terminal verdict to no-opinion. The classifier becomes the layer behind the gate, which lets the fault path stop asking and lets rules the classifier covers better be retired. Costs a classifier round-trip on every non-allowlisted shell command.
- Leave the gate alone and instead add permission allow rules to outrun the asks. Rejected: allow rules cannot pre-approve protected paths, and a hook ask is not reachable by a settings rule at all.

## Outcome

Path B. Terminal verdict is `no-opinion` as of 2026-08-14. The gate abstains on any command it does not name, handing the decision to the classifier. This is what made the rest of the change safe: the fault path could move to `deny`, and G5 plus the destructive-verb branches could be retired to a layer that actually runs. Accepted cost: every non-allowlisted shell command now takes a classifier round-trip, and three consecutive classifier denials pause auto mode into prompting. Narrow allow rules (git commit, git checkout, git worktree, jq, graphify, gh pr list) survive auto mode and stay instant; blanket Bash, wildcarded interpreters like node, and package-manager runs are dropped on entering auto mode and now reach the classifier.
