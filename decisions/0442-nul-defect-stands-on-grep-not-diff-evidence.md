---
Status: accepted
Date: 2026-08-15T19:20:22.083Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0442. The raw control byte defect stands on the grep symptom, because git's binary sniff only reads the first 8000 bytes

## Context

The first defect was filed as a raw U+0000 at determinism-lint.mjs:319 that makes git classify the module as binary, producing no diff lines and no grep hits, which is how the module shipped through review unreadable. Reproduction under G0 found the byte is real, exactly one occurrence at offset 14232 of a 16253-byte file, and that it is load-bearing by design: it is a deliberate composite-key separator for a Set dedup, so the character must survive and only its on-disk encoding is wrong. But the stated git symptom did not reproduce. git grep returned real text matches and git show rendered an ordinary unified diff. Direct bisection with git diff --no-index on synthetic files put the threshold at exactly 8000 bytes: a NUL at offset 7999 renders as binary, one at 8000 renders as text. Git's heuristic reads a bounded prefix, and this byte sits 6232 bytes past it. The sibling occurrence that motivated the original filing sat at offset 169, well inside the window, which is why that one genuinely rendered as Bin.

## Options

- Close the item as not-a-defect because the filed git symptom does not reproduce
- Fix the byte and repeat the filed claim that git treats the module as binary
- Fix the byte, state the corrected mechanism, and rest the receipt on the half of the symptom that does reproduce
- Widen the work into a gitattributes change forcing text classification on source globs

## Outcome

Fixed the byte and rested the receipt on the grep half, which reproduces cleanly and is the real reviewer-facing symptom: on the parent blob, grep -c for an identifier present ten times printed nothing and exited 1; on the fixed file it printed 10 and exited 0. The diff half was recorded as not reproducing at this offset, so the filing should not be repeated as written. The hazard is latent rather than active, since any edit shifting content earlier, or any renderer with a smaller or absent prefix bound, flips the module to binary. The receipt is a closed census over every tracked non-binary file asserting zero raw C0 control bytes outside tab, newline and carriage return, which forced two further live instances to be escaped as well: a deliberate BEL specimen in ci-escalation.test.mjs and a raw NUL inside a fenced block that a plan document tells the reader to copy verbatim. A gitattributes change was left as a complementary defence, not folded in. Recorded separately: the agent-facing Write path converts a typed escape into a raw control byte, which is the likely recurrence mechanism for this whole defect class, so such a fix must be built through a byte-deterministic path and verified with od or perl.
