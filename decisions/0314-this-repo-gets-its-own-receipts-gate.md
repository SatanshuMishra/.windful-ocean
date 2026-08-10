---
Status: accepted
Date: 2026-08-10T06:16:45.081Z
Thread-Id: 01KZCF28RN4RMR46VDXFKSQZY3
---

# 0314. This repo deploys a receipts gate to itself rather than relying on the template it hands to other repos

## Context

0313 retired the homegrown invariant machinery and named the receipts plugin sole owner of invariant checking. Reconnaissance then found that receipts is not actually deployed here: it exists only as a template at .claude/skills/mitosis/templates/receipts.yml that the mitosis skill hands to OTHER repos it manages, and windful-ocean has no .github/workflows/receipts.yml of its own. Coupling between receipts and the retired machinery is zero in both directions, so the teardown is safe, but it is also not self-healing: removing the old gate leaves this repo with no fix-verification CI at all unless something additive is done.

The template cannot be deployed verbatim. It invokes scripts/d6-check.cjs, which is target-repo scaffolding absent here, and an npm ci step that would fail outright because this repo carries no lockfile.

## Options

- Deploy an adapted receipts workflow to this repo, including only jobs whose dependencies actually exist - ADOPTED by explicit user ruling
- Teardown only, leaving the repo with no fix-verification gate until the redesign thread - rejected, it makes 'receipts is the sole owner' false for the one repo the directive was issued about
- Ship the teardown and file the receipts deployment as a separate later decision - rejected as a deferral that leaves the same ungated window open
- Deploy the template verbatim - rejected, the D6 step and npm ci would red the workflow immediately and a red gate is worse than none

## Outcome

This repo gets its own .github/workflows/receipts.yml plus a receipts.config.json validated against the published schema. Jobs whose dependencies are absent are OMITTED rather than scaffolded into existence: the D6 step is dropped because scripts/d6-check.cjs does not exist here, and npm ci is dropped because there is no lockfile and the suite needs no install, being node builtins only.

The standing rule this sets: a gate is deployed only in the shape that can actually run green in the repo receiving it. A red or fabricated gate is worse than an absent one, because it trains reviewers to ignore it.

Residual, disclosed rather than hidden: the pinned enforcer action SHA has not been verified running on real GitHub Actions, only against a local marketplace copy that cannot be proven to be that commit. The enforcer also reads its config from the BASE commit and falls back to head with a warning on the first PR, so the first run is expected to warn.

Delivery is NOT complete. The commit carrying this, c78c934, merged into its stack parent rather than main and is not an ancestor of main, so the gate does not exist on main today and must be re-integrated by a fresh pr.mjs PR.
