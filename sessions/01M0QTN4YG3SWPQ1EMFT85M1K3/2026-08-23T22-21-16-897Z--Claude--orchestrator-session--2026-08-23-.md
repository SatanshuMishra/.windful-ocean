The user approved the billed live run. It ran, and it opened no pull request — for a reason unrelated to everything that was fixed to get there.

WHAT SHIPPED

Three zero-cost preflight gates before any spend. A detached worktree at origin/main proved a linked worktree is safe as the engine root: the provenance probe reported the worktree's own head rather than resolving the primary checkout through git commondir, which closes that long-standing worry. The smoke lane crossed decompose, dispatch, journal, lock refusal, resume and ship in one second, four units integrated and shipped, both proof flags true. The substrate repository was confirmed clean.

The previous billed failure was traced rather than retried. On 2026-08-23 at 04:17 a run cost 2.49 dollars and opened zero pull requests. Root cause: the lane deliberately kills the engine about 1.7 seconds after the journal records built, the boundary gate starts about 7 milliseconds after built, so the kill lands inside git worktree add and leaves a worktree carrying git's own lock reason of initializing. The reclaim refused any non-null lock, so the abandoned worktree was unrecoverable, collection returned early, the unit parked and Ship received nothing.

That defect was fixed over three rounds on branch fix/mitosis-reclaim-initializing-lock, pull request 289, head bfea5aa3, unmerged.

Round one reclaimed only locks older than a five-minute deadline, reasoning that spawnSync's timeout means no legitimate add outlives it. Sound, and inert: the resume happens two to four seconds after the kill, so the threshold is never crossed. Its test passed only by fabricating a birth time 360 seconds in the past. Caught before spending by checking the fix against the lane's real timing rather than against its own test.

Round two replaced age with ownership, deriving the signal from the run store's attempt counter so it fires immediately. A review then measured that the whole suite was blind to it: reverting the signal at its source left 2361 pass and 20 fail, a byte-identical failure set. Round one fabricated the clock, round two fabricated the boolean, and the derivation that actually broke had no coverage.

Round three closed that with a test driving the real phase chain and asserting the signal arrives at the gate, red under mutation.

WHAT FAILED, AND WHY

The billed run itself. Engine bfea5aa3, 583 seconds, one unit declared, zero pull requests opened.

No crash occurred. The engine reached quiescence before the harness's kill point, and the harness correctly declined to kill an already-quiescent run, logging crash-resume-not-exercisable. That is the built-wait quiescence fix behaving exactly as designed, and it means the reclaim fix repaired a path the run never entered. Three rounds of work remain unproven in live conditions.

The unit parked as NeedsHuman because the review lens failed the implementation with specific verified findings: the error classes for bad input were swapped against the spec, and a boundary guard used strictly-greater where the spec requires greater-or-equal, so one input returned a degenerate result instead of throwing. Two tests cemented the deviation and the README documented it. The engine declined to ship code contradicting its own spec. That is the quality gate working.

The consequence is the finding that outranks everything else here: a failed review terminates the unit rather than looping a fix. Remediation modules exist in the tree, so whether this is policy, an unset threshold or a wiring gap is unknown and unproven. An earlier claim in chat that there is simply no retry was too strong and was corrected.

MEASUREMENT GAPS FOUND

Usage recorded one dispatch of four, so the 1.30 dollars captured is a floor and the true spend is unmeasured — on a thread whose purpose is making this phase observable. The declared-criteria comparison log was not regenerated; it still describes the previous run and must not be cited for this one. Dispatch recording itself did work: plan, plan-review, implement and review all landed.

Decisions 0690 and 0691 were recorded on the parent thread under c45.