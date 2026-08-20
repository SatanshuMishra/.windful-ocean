---
Status: accepted
Date: 2026-08-20T03:28:36.858Z
Thread-Id: 01M0E8GPWY3BDXBRGXW4KZM8CF
---

# 0637. Reword unrelated prose rather than grant the attribution census an exception

## Context

The attribution census bans the bare substring "provenance" across every non-test source file under the engine library. After all pull-request attribution was removed, exactly two occurrences survived, both ordinary English in the coupling subsystem and neither about pull requests: an error message in the edge-derivation module and an observation string in the coupling review module. The specification predicted this exact stall and forbade resolving it by exception, requiring instead that it be raised as an open question. Neither string was pinned by any test.

## Options

- Reword the two unrelated strings so the banned word no longer appears, leaving the census exactly as specified
- Narrow the banned token from the bare word to the flag spelling and the constant name, amending a frozen specification
- Add the census a per-file exception or suppression list for the two occurrences
- Land the census red and record the two acceptance criteria as blocked under the honesty ladder

## Outcome

The owner chose to reword. Both strings now say "origin" instead, with no other change to either sentence, and no test pinned them. This keeps the census a closed set with zero suppressions, which is the property that makes attribution removal permanent: an exception list would convert the census into an allowlist and every later reintroduction would only need one more entry. Narrowing the token was rejected as strictly weaker, since a re-added local field or variable carrying the banned name would then pass. The cost accepted is that two files outside the specification's change inventory were edited, justified because the census the specification mandates cannot pass otherwise.
