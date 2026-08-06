c2 executed as a real experiment; c3 and c4 settled. No repository file was modified this session - the entire experiment ran in the session scratchpad, nothing was staged or committed.

METHOD (recorded so it can be challenged or re-run). Five independent general-purpose agents each authored a full coverage entry for ONE fixed change, commit 45336f8 (mp3 re-encode: two binary files, zero text lines, the change that motivated this thread). Identical prompt and model; only the registry differed, using fixture registries of 2, 6, 12, 17 and 17 ids built as subsets of docs/invariants/registry.json. All five entries were then validated against the real scripts/invariant-coverage-check.mjs through a throwaway git harness (--root <fixture>, --event pull_request, --base-ref main, base commit holding an empty seed entry). All five passed, so what was measured is the cost of producing VALID artifacts, not plausible-looking JSON.

RAW DATA, preserved here because the scratchpad is session-scoped. ids / tokens / tool-calls / check-words / wall-clock:
2 / 79,849 / 9 / 330 / 96s
6 / 91,273 / 13 / 531 / 173s
12 / 104,361 / 16 / 1,066 / 296s
17 / 112,572 / 19 / 1,320 / 394s
17 / 116,850 / 19 / 1,495 / 1,055s (replicate)
Fit: 76,292 fixed + 2,298 per row, R-squared 0.995, taking n=17 as the mean of the two runs.

WHAT FAILED AND WAS RETIRED: wall-clock. The first four arms fit a duration slope at R-squared 0.9999, which was spurious - the replicate at the same arm took 2.7x as long (1,055s vs 394s) at identical tool count and tokens within 3.8 percent. Any latency model here is noise; only tokens and tool calls are trustworthy. The replicate is the only reason this was caught, and a single-run design would have shipped a false number into c4.

WHAT WAS NOT DEMONSTRATED: the fabrication claim. Grounding calls per row fall 4.50, 2.17, 1.33, 1.12 and tool calls grow at only 0.64 per added id, but no fabricated row was found in any entry, and some amortization is legitimate - one name-status listing honestly grounds all six B rows on a binary diff. It is a supporting gradient, not proof.

COUNTER-EVIDENCE, with a correction to how it was first stated in chat. The obligation did catch a real defect the cheap arms missed, but only ONE of the two sounds is actually suspect. Durations fell OptionA 4.545s to 2.116s and OptionD 2.325s to 0.950s. Silence analysis of the parent blobs (ffmpeg silencedetect, -45dB, 0.25s) shows OptionD carried 0.254s of leading and 0.944s of trailing silence, so its shortening is largely consistent with a deliberate trim. OptionA carried NO detectable silence at that threshold and still lost 53 percent of its duration, which is truncation of audible content. Only the arms reaching the M-block measured audio at all; the 2-id and 6-id arms never looked. Filed as separate work, not fixed here.

c3 was settled as the premise of the c4 ratification rather than argued separately: the answer drafted last session - a form of proportional coverage exists that does not reintroduce the self-selected allowlist, provided the predicate belongs to the invariant and the polarity stays inert - is exactly what ratifying B affirms.

DECISIONS: 0272 (c2, the measurement) and 0273 (c4, adopt the paths-only inert predicate with M3/M4/M5 structurally barred). Both were captured at decision time, not reconstructed at wrap-up.

NOT STARTED: c5. No part of the implementation exists.

ALSO OBSERVED, not acted on: branch chore/config-drift currently fails the gate in pull-request mode because it carries no coverage entry, while push mode passes since it scopes to zero changed entries. That is the gate behaving as designed on an in-progress branch, not a defect.