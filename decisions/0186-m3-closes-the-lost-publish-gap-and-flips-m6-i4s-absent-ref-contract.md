---
Status: accepted
Date: 2026-08-01T08:46:48.812Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0186. M3 closes the lost-publish gap as a side effect and flips M6 I4's absent-ref contract from local-only to published

## Context

A standing thread risk, carried since M6 and restated in spec section 3.5 under "Not yet covered", said: a reconcile-only relaunch returns before the publish stage so it does NOT retry a lost publish, while a full advance does - and directed a re-check after M3 rewrites the region. M3 landed. The coverage-receipt agent surfaced the consequence while measuring the diff for the M4 row; it was named in neither the implementation contract nor PR 30's body. Verified first-hand in git diff 7b34a61..HEAD over frontier-train-e2e.test.mjs: the M6 I4 test's absentResult assertion moved from identity 'local-only' to identity 'published', while the unreadable-ref and invalid-payload cases still assert 'local-only'.

## Options

- Treat the flip as an unintended regression and restore local-only for the absent case
- Accept it as the deliberate closure of the spec's own stated gap, since deleting the early return is exactly what makes the relaunch reach the publish stage
- Leave it unadjudicated and let M5 discover it

## Outcome

ACCEPTED AS A CLOSURE, NOT A REGRESSION, and the standing risk is DISCHARGED. Deleting the reconcile-only early return is precisely what carries a relaunch into the publish stage, so the section 3.5 gap closes as a structural consequence of M3 rather than by a separate fix. The three-way split is the safe shape, not the lenient one: only a ref proved ABSENT is republished, because absence is the one state in which a write-once ref is still unclaimed; an unreadable ref and an invalid payload both still degrade to local-only rather than overwriting an identity the run could not rule out. RESIDUALS, recorded rather than smoothed: (1) PR 30's body does not mention this behavior change and is FROZEN at creation, so the record lives here and in the coverage receipt - a PR comment is the only in-band remedy and needs the user's go, per 0142. (2) Separately measured and NOT resolved by M3: advance.toRestack is still computed (reconcile.mjs:122,:130 and the mitosis.js twin) and still logged (mitosis.js:3996) but has ZERO consumers at HEAD, where the parent consumed it at mitosis.js:3349 - a relaunch can report built branches to restack and restack none. That is carried in PR 30's Risk line and belongs to whoever owns the log-string cleanup; it is not a correctness defect, it is an operator-output lie.
