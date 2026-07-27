---
Status: accepted
Date: 2026-07-27T03:25:34.895Z
Thread-Id: 01KYG4AEKA6NM746BXVRAZ9DWE
---

# 0025. The mixed-ampersand residual was misjudged fail-closed when it is fail-open; scope moves to unsplit tokens without unfreezing the tokenizer

## Context

When dispatching round B1 the orchestrator instructed the implementer to accept, as an explicitly fail-closed residual, that a command containing BOTH a quoted and an unquoted ampersand would still shred the quoted one. That judgement was WRONG and it changed the work: shredding a token DESTROYS the root substring it carries, which removes the unit from scope, which ALLOWS. The direction is fail-OPEN. The code re-review reproduced it: with a root path containing an ampersand, rm -rf of the quoted root denies, but the same command with 2-greater-ampersand-1 appended, or with and-and-echo appended, or preceded by cd /tmp and-and, returns null. Corpus cases AMP_ROOT_QUOTED and AMP_ROOT_ESCAPED assert the hole is closed and pass only because those two exact strings contain no other ampersand - the same test-proves-two-hand-picked-strings pattern the same reviewer flagged in the previous round. The reviewer's own proposed remedy, recording per-token ampersand provenance inside scanSegments, would break the criterion-1 freeze on shell-tokens.mjs, which is user-locked. A separate earlier suggestion, restricting the split to token-boundary ampersands, was already rejected this session because corpus case E5 (ls ROOT-ampersand-rm) carries its ampersand MID-token and would have reopened.

## Options

- Scope from unsplit tokens, keeping heads from split sub-segments
- Restrict the ampersand split to token-boundary ampersands
- Record per-token ampersand provenance inside the frozen tokenizer
- Accept the residual as originally judged

## Outcome

SCOPE MOVES TO THE UNSPLIT TOKENS. Compute a segment's scope over the ORIGINAL pre-split token list, so a quoted root substring survives intact, while continuing to derive HEADS from the split sub-segments so backgrounding and grouping stay closed. Scope inheritance already shares one scope across every sub-segment of a segment, so this is a contained change and needs no new mechanism. It keeps shell-tokens.mjs FROZEN, satisfying criterion 1, and it makes the ampersand gate's remaining cost genuinely fail-closed - a command mixing quoted and unquoted ampersands may over-DENY on head derivation, which is the acceptable direction, and can no longer under-scope. Rejected: per-token provenance inside the tokenizer (breaks the user-locked freeze); boundary-only splitting (reopens E5); accepting the residual (it is a live bypass, not a papercut). Round C must also pin this by MECHANISM rather than by string - at minimum an ampersand-bearing root combined with a trailing 2-greater-ampersand-1, a trailing and-and, and a leading cd, plus a direct table over hasUnquotedAmpersand and the splitsAmpersand=false branch, neither of which has any direct test today. GENERAL LESSON for the fresh session, worth more than the fix: twice now a corpus case has asserted a hole closed while the mechanism stayed open. Pin mechanisms, not the two strings that first exposed them, and treat any residual labelled fail-closed as unproven until the direction is demonstrated by execution.
