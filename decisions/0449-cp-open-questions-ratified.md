---
Status: accepted
Date: 2026-08-15T21:37:35.573Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0449. CP's three open questions are ratified before the unit is worked

## Context

The porting MSP scope doc leaves Q1, Q3 and Q4 open in section 6 and forbids working CP until they are ratified. Q1 asks which two of C7-R1..R7 were the deferred security HIGHs; no surviving artifact records it, and the doc explicitly refuses to assert the R3/R5 guess. Q3 asks whether C7-T3 is formally retired now that the census it constrains was deleted by 2087dd51. Q4 asks whether CP should take a letter in 0374's lettered decomposition.

## Options

- Q1: assert R3 and R5 as the HIGHs from the inference already written down
- Q1: re-derive severity from the code and let the attribution set review intensity only
- Q1: block CP until the original tagging is recovered
- Q3: keep C7-T3 as a live obligation against a census that no longer exists
- Q3: retire C7-T3 and record that its surviving intent is carried by C7-T4
- Q4: mint a new letter in the 0374 sequence for CP
- Q4: keep the provisional name CP

## Outcome

Q1: the original HIGH tagging is unrecoverable and is not reconstructed by recall. R3 and R5 are treated as the security-critical pair on the code merits alone - both are literal command-injection surfaces, unquoted interpolation into a command position and a shell command string pasted for verbatim execution - while R1 and R2 are prompt-injection framing. Because CP discharges or explicitly re-files all seven under one bar, the attribution carries no sequencing consequence; it sets review intensity only, so R3 and R5 additionally take a security-reviewer pass. Q3: C7-T3 is formally retired. Its constraint was on the transcription census deleted by 2087dd51, and its surviving intent - a converted site loses its label with its dispatch, and a converted kind dispatches nowhere - is already carried by C7-T4's per-kind expectation, so keeping T3 would duplicate T4 against apparatus that no longer exists. It is retired as absorbed-by-T4, not silently dropped, which satisfies CP acceptance criterion 1. Q4: the name CP stands. 0374's lettered decomposition is a ratified artifact and minting a letter mid-stack would renumber a decision record for cosmetics while breaking every existing reference; CP is provisional by construction per 0424 and survives only as a PR scope name.
