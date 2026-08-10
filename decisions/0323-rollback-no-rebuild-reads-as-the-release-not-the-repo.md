---
Status: accepted
Date: 2026-08-10T22:33:17.032Z
Thread-Id: 01KZCF28RN4RMR46VDXFKSQZY3
---

# 0323. No-rebuild is a claim about the release, so rollback's repo dependency is a risk, not a defect

## Context

Verifying SPEC A criterion 4, "rollback to the previous release requires no rebuild", a subagent returned FAIL. It had run two negative tests: with git removed from PATH, rollback returned an error naming spawnSync git ENOENT; with the repo directory renamed away, it returned an error saying repo_root does not resolve on disk. In both cases the pointer stayed put, so the failure was safe, but rollback did not complete. The agent read that as contradicting SPEC section 5.2, "a rename, never a rebuild".

Checked against the source rather than accepted. rollback in promote.mjs does refuse when the target release is absent, and its error says in as many words that rollback is a rename and never rebuilds, so the release-rebuild prohibition is honored explicitly. The git dependency the agent hit is a different thing: settings.json is excluded from releases entirely by SPEC section 6, so rollback must re-derive the settings that the target sha declares, which it does by shelling to git. Its guard refuses rather than move the pointer alone, on the stated ground that doing so would leave live settings reconciled for the newer sha.

Which reading governs decides whether c6 could close. It also decides whether rollback gets reopened for a fix, and this thread has one criterion left.

## Options

- Accept the FAIL: treat the git and repo_root dependency as violating section 5.2, reopen rollback, and make it work from the retained releases alone
- Read criterion 4 as a claim about the release artifact, pass it on the evidence that no rebuild ever occurs, and file the repo dependency as a thread risk
- Amend criterion 4's wording in SPEC A so the settings recomputation dependency is explicit, then judge against the amended text

## Outcome

Option 2. Criterion 4 passes as written. The criterion is a claim about the release artifact, and section 5.2 gives its own reason for the claim: a rename rather than a rebuild is possible because releases are immutable and retained. That reason is about the release being on disk already, not about the repo being absent. The code satisfies it and says so in its own refusal message.

The dependency is real and stays visible: rollback cannot run without the repo the LIVE receipt names and a runnable git, filed as a thread risk rather than dropped. It compounds with the risk already carried, that this release's first LIVE receipt records previous as null, so promote rollback has no target at all. Together those two mean the promote rollback verb is not currently the recovery path for this release, and the settings backup plus removing the current symlink still is.

Rejected option 1 because it would reopen a criterion the code satisfies, on a reading section 5.2's own rationale does not support, and because a rollback that skipped the settings recomputation would leave live reconciled for the wrong sha - a worse failure than refusing. Rejected option 3 because amending an acceptance criterion to match what was built is grading the work against itself; the residual belongs in the risk list where it stays visible, not folded into the text that was supposed to test it.
