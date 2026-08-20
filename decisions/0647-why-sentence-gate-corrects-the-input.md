---
Status: accepted
Date: 2026-08-20T17:37:03.559Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0647. The new sentence gate on why is met by correcting the input, and the engine's why-versus-what asymmetry is filed

## Context

The merged pull request tool now requires every why and what value to start with a capital letter and end in a full stop. The engine repairs what for the caller by capitalising it and appending a period, but passes why straight through from each unit's rationale. Every rationale in the live run document was lowercase with no full stop, so at the new pin all six units were refused at Ship and no pull request would have opened. This was reproduced offline against the merged gate before any edit, and the same values were shown to pass at the old pin, so the delta is the cause.

## Options

- Fix the engine so why is auto-repaired exactly as what already is, then run
- Reword the rationales to read better under the new gate
- Apply the engine's own what transform to the six rationales in the input, capitalise and append a period, and change nothing else

## Outcome

The input is corrected and the engine is left unchanged, which is the same ruling the over-long-rationale park received earlier on this thread: the engine's refusal to compose a body it would have to stand behind is correct behaviour, and acceptance is a ceiling, so a defect found above the criterion is filed rather than folded in. The transform applied was exactly the engine's own: uppercase the first character, append one period, no rewording, with every value re-checked against the 200-character cap. The asymmetry itself is filed as a separate item worth deciding on its merits, because a real caller's rationale will usually be lowercase and will park at Ship for a reason that has nothing to do with their work.
