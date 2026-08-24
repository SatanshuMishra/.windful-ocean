---
Status: accepted
Date: 2026-08-24T00:06:02.583Z
Thread-Id: 01M0QTN4YG3SWPQ1EMFT85M1K3
---

# 0693. Mitosis extracts to its own public repository as an installable plugin, migrated by hand

## Context

Four traces established why repeated live runs fail. Two mechanisms compose. First, every instrument capable of telling live truth is built outside the repository and outside CI, where no gate grades it: the artifact the testing SPEC names as its own root cause is not in the repository, the predictiveness census excluded it by construction and returned zero rewrite rows, all ten failure scenarios and the sweep driver live in an out-of-repo harness, and the one cassette bought with real money has zero consumers. Second, the testing SPEC stated its governing property in its title and section 1 but omitted it from the list of invariants every unit inherits, so no unit could fail for missing it and none did; an audit of 75 enumerated obligations returned 49 met, 18 not met, 8 unverifiable, with the declared guarantee itself not met. Five testing overhauls ran in 34 days, three substantially deleted by the next. The host is the user's global config repository, which also explains a suite that is honest only in the primary checkout and red today for a reason unrelated to the engine.

## Options

- Stay in .windful-ocean, move the harness in-repo and add the live property to the inherited invariants - cheapest, but leaves the engine inside a config repo whose test job covers everything and whose worktrees make the suite honest in only one checkout.
- Extract to a dedicated repository only, no plugin packaging - fixes the host coupling but adds no forcing function that proves the thing works when installed.
- Extract to a dedicated public repository AND package as an installable plugin - fixes host coupling and adds a live predicate that no fixture can satisfy, at the cost of untangling a real dependency cycle and a squashed history.

## Outcome

Extract to a dedicated public repository named mitosis, packaged as an installable Claude Code plugin. SPEC at artifacts-2026-08-23-mitosis-extraction/SPEC.md, 1596 lines, 16 units, each carrying files, an acceptance criterion and a mandatory Unproven field. The governing property - if CI and testing are both green then mitosis works live once merged - is quoted verbatim as section 1.1 and as I1, the first inherited invariant, which is the precise placement the previous SPEC got wrong. Branch protection, required checks and merge gates are permanently out of scope by user instruction; testing and CI do the testing. Test architecture is four tiered lanes split on the boundary that nondeterminism lives in the model's content rather than its interface: interface to a scheduled contract lane against real claude and real gh, content to a free deterministic replay lane per pull request, with an authored cassette legal only when a conformsTo field names a real capture it validates against, enforced as a load-time refusal rather than README prose. Accepted cost is a bounded staleness window of up to 30 days before a vendor interface change is detected, and no lane proves model output quality. Licensing matches the source repository: PolyForm Noncommercial 1.0.0, license declared as SEE LICENSE IN LICENSE, adapted NOTICE, copyright notice re-pointed, the EU Article 4(3) text and data mining reservation carried verbatim, the nvim carve-out dropped, and ai.txt, robots.txt and tdmrep.json required because NOTICE names them. History is squashed rather than filtered, because git-filter-repo is absent and gitleaks already finds hits in the current tree; publication is gated by a nine-step re-runnable check named in two units' acceptance criteria. Migration is executed by delegated agents by hand, not by the pre-removal engine and not self-hosted, because the engine's failed-review park has no retry path and a sixteen-unit migration is the highest-stakes possible first use of an engine not yet trusted.
