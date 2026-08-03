---
Status: accepted
Date: 2026-08-03T17:50:47.798Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0224. The append-after-approval property was never live on this repo, and no control replaces it in this MSP

## Context

The security review named one property as genuinely lost by deleting merge-boundary-preflight.mjs: the gate proved server-side that a human approval cannot carry to commits appended to the PR later, and the CI-to-green loop still appends. Audit refuted the premise on three legs. (1) The deleted check required required_approving_review_count >= 1 AND require_last_push_approval === true conjunctively (merge-boundary-preflight.mjs:236-242 at 106b253^); this repo has 0 and false, so the preflight would have HALTED every run rather than protecting anything - which is why 0219/0220 deleted it. (2) It was a config read at dispatch time against gh api repos/{slug}/rules/branches/{base}, never a runtime check at the append site; it could not have blocked any append. (3) With required_approving_review_count at 0, an approval on this repo authorizes nothing server-side, and reviewDecision is empirically "" on every PR this repo has ever had (33-37). Premise correction to the spine: merge is NOT ungated - ruleset 19939922 "Require PR for Merge" is active, blocks direct push to main, and has bypass_actors empty with current_user_can_bypass never. But it sets required_approving_review_count 0 and adds no required status checks, so a red CI still does not block the merge button. Exactly one append site exists, mitosis.js:5228, bounded at <=2 appends per MSP by CI_ATTEMPT_CAP 3 (mitosis.js:2256), append-only with a post-append ancestry re-derivation at mitosis.js:5251-5253.

## Options

- Enable require_last_push_approval server-side on ruleset 19939922
- Engine refuses to append when gh reports reviewDecision APPROVED
- Add a SKILL.md ruleset line telling the orchestrator to relay the append
- Carry an appended-after-PR-opened flag through awaitingApproval into the report (disclosure)
- Accept the residual, record it, and ship no control in this MSP

## Outcome

Accept the residual and ship no control in this MSP. require_last_push_approval is rejected: GitHub forbids a PR author approving their own PR, the engine and the only human are the same account (SatanshuMishra), so its prerequisite count >= 1 is already unsatisfiable and enabling it would make merge permanently impossible - on a solo owner-held repo that is a defect, not a strict setting. Refusing to append on reviewDecision APPROVED is rejected as structurally inert: with count 0 that branch can never be reached here, and shipping a dead branch that reads as a control is precisely the assurance-inflation class 0219/0220 deleted the preflight for. A SKILL.md line alone is rejected: it would fire on every PR regardless of whether an append occurred, no test can hold it (no doc lint exists), and an unconditional warning alarm-fatigues into noise. The disclosure option is a genuine improvement and is NOT refuted - the engine already computes whether it appended and already throws the fact away at awaitingApprovalOutcome (mitosis.js:3672) - but it is a new feature with its own plumbing across mitosis.js:5284, :5379, :3672 and SKILL.md, not remediation of this deletion, so it belongs to its own MSP. Residual accepted and stated in the PR body: a human may read a PR between publish and merge while the CI-to-green loop appends up to two further commits; the appends are additive, ancestry-checked, scope-fenced and sensitive-path-fenced. Ancillary and human-applied only: setting dismiss_stale_reviews_on_push on ruleset 19939922 becomes the correct server-side control the day a second collaborator exists; the agent does not touch repo rulesets.
