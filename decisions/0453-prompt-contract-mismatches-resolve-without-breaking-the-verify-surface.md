---
Status: accepted
Date: 2026-08-16T02:18:30.906Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0453. The three prompt-contract mismatches resolve without breaking the verify.scopedCheckCmd surface

## Context

R7 requires routing prompt composition through composePrompt. A first attempt reverted against three contract rejections, because the registry's input contract was authored against tests/prompt-fixtures.mjs and has never met a live engine value - which is the actual reason it has zero production importers. Analysis confirmed all three and found two of them are LIVE defects today, independent of the registry. (1) scopedCheckCmd is declared argv at prompt-contract.mjs:161 and :192, while the public surface is legitimately a string (SKILL.md:19, hard-required as a non-empty string at mitosis.js:4113-4118) - and run-engine.mjs:420,430,468,473 plus the mitosis.js:1504-1557 twin interpolate it RAW into a backtick span with no validation anywhere, so a newline or backtick in an operator's value restructures the composed prompt. (2) launchCommit is required as a ref though null is correct under worktree isolation (engine-args.mjs:6, mitosis.js:5118), and validatePromptInput validates unconditionally at :261-266. (3) issues is required though REVIEW_SCHEMA at run-engine.mjs:3 makes it optional, while run-engine.mjs:467,472 render an empty list into a fix dispatch that tells the agent to fix nothing.

## Options

- Relax the argv contract to accept a bare string. Refused: it re-admits an unquoted value into a command position and un-discharges R5, which shipped security-reviewed on exactly that point.
- Shell-parse the operator's command string in the composer. Refused: the contract's own rejection text states it cannot be done safely.
- Break the public surface to argv-only. Refused: it breaks every existing config and cannot express an ampersand-joined command.
- Normalize at the engine-args seam and tighten the two contract fields the code already proves wrong.

## Outcome

Normalize and tighten. (1) scopedCheckCmd is normalized string to sh -c form at the engine-args seam, so the composer parses nothing, shellQuote renders the operator's command as one inert shell word, and verify.scopedCheckCmd stays exactly a string with no consumer change. What this buys is stated honestly: the value can no longer restructure the engine's command line or the prompt; it does not sandbox the operator's own command, which it never did. The surviving backtick-closes-the-code-span issue is already filed above the ceiling and stays filed. (2) launchCommit becomes optionalRef plus a cross-field refusal - a ref required under scope-fence, null required under worktree - which is strictly stronger than today and touches no production file. (3) issues becomes a NON-EMPTY text list, and a fail verdict carrying no issues halts instead of dispatching a fix agent told to fix nothing; requiring mere presence would only convert undefined into a throw while still admitting the vacuous prompt. Items 1 and 3 each close a live defect and each need an acceptance test red on the parent commit.
