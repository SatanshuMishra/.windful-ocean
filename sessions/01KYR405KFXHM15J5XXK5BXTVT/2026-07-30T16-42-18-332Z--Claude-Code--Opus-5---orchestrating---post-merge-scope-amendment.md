User confirmed PR 15 merged. Verified against the remote: main is 12053dc, "feat(gate): add the phase parity gate and declare phases honestly (#15)". MSP-0's own commit 3806be0 is NOT an ancestor of main - expected under squash-on-merge, not a problem. Next session branches from 12053dc.

Two user rulings recorded.

1. The docs/mitosis-core-rebuild-spec branch sitting without a pull request is FINE. Removed from next_step and moved into out_of_scope so no future session re-raises it as an omission.

2. Resolving the pre-commit hook issue is ADDED to the next session's scope. Recorded as 0131, with my ordering judgment that it comes BEFORE any precondition work rather than alongside it - the pre-commit suite is this repo's only automatic gate, and this repo IS the live global Claude config, so an unguarded commit here degrades every project on the machine. A gate that can silently disappear gates the work.

Re-measured the hook config while writing this up, and it has moved a THIRD time. core.hooksPath is back to the un-suffixed plugin dir, and continuity.priorHooksPath reads .githooks. The shim therefore resolves prior=.githooks, finds it is not its own managed dir, skips the self-reference guard, and execs the real hook. The chain is HEALTHY right now. Three observed states in one day: self-referencing and dead at session start; worktree-suffixed key with prior=.githooks at commit time; un-suffixed key with prior=.githooks now. priorHooksPath stayed correct across the last two while core.hooksPath moved under it, which narrows the bug - the capture misfires under a specific condition (most plausibly running while hooksPath already points at a managed dir and priorHooksPath is unset), not on every session. The next session inherits a working gate and a latent fault, which is the honest framing and the reason 0131 requires verification by REPRODUCTION rather than by inspecting current config.

0131 also names the open sub-decision rather than pre-deciding it: 6d19499 set a fail-loud precedent in this repo, but making the shim exit non-zero on self-reference would block the very commit that fixes the config - a bootstrap trap. Hard-fail with a documented --no-verify escape, or exit 0 with a prominent stderr warning, is the trade to resolve.

task_70509bf0 remains running in a separate user-started session against the now-stale "gate is dead" premise. It cannot be withdrawn (already started). Recorded in open_risks so the next session closes it rather than acting on its output.

Nothing else changed: no code touched this turn, working tree carries only the five pre-existing untracked items, no agents or background shells of mine are live.