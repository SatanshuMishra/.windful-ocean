---
Status: accepted
Date: 2026-08-20T00:18:33.837Z
Thread-Id: 01M0E8GPWY3BDXBRGXW4KZM8CF
---

# 0631. Remove all agent and model attribution from PR bodies, reversing 0597

## Context

Every pull request opened in this environment is opened on the owner's behalf. Whether a human or an agent typed the command is not information a reviewer needs, and the global rule already forbids AI attribution on commits, PRs and comments. The PR tool violates that rule today: it emits a `## Provenance` section carrying `agent=<label> model=<model>`, and every body ends with a trailer naming an automated agent and the tool. Decision 0597, ratified 2026-08-18, widened the provenance charset on the premise that the field exists to record the model verbatim and that failing to do so is a correctness defect; that premise is now rejected at the root. Research confirmed nothing external requires the attribution: not git, GitHub, the DCO, OSI licences, GitHub terms, or EU AI Act Article 50. Two audits established the full surface and one real coupling: the trailer text is the reuse-detection key, so deleting it without a replacement silently reports every reused pull request as unverified and parks the shipping engine.

## Options

- Delete the provenance section, the three trailers, and the --origin and --provenance flags outright, and replace the reuse detector with a check on the tool's own heading skeleton
- Keep the flags but render nothing, so callers keep passing values the body discards
- Neutralise the trailer wording to remove the agent reference while keeping a tool-named sentence as the reuse key
- Add a deny rule or a post-render scrubber that strips attribution after composition

## Outcome

Delete outright. The strongest form of a reliable block is that the code path does not exist: with the flags removed, the tool's existing unknown-flag check rejects them for free, and no guard, deny rule or scrubber has to be maintained. Reuse detection moves to a structural check on the tool's own heading skeleton, which names no tool and no agent and is unforgeable because the value sanitiser already refuses any caller value beginning with a hash. A source-level census test over the format module makes the removal permanent by failing if attribution wording is ever reintroduced. Rendering nothing while keeping the flags was rejected because it leaves callers composing values that vanish, which is a silent contract. Neutralised wording was rejected because a tool-named sentence is still attribution and still contradicts decision 0243, which removed the same misleading tool name from the file path. A post-render scrubber was rejected on the same ground decision 0244 rejected an auto-rewrite hook: a layer that edits composed text after the fact adds surface area and can only ever approximate the thing removal guarantees. This knowingly reverses decision 0597: that decision optimised the accuracy of a field this decision deletes, so its correctness argument is moot rather than wrong. It also supersedes two clauses of the 2026-07-27 centralisation spec, which ratified the trailer as the reuse key and --origin as the trailer-wording selector; both clauses lose their subject.
