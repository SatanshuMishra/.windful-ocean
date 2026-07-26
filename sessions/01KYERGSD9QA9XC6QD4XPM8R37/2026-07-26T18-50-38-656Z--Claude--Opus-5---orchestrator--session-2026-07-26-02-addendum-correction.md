CORRECTION to the immediately preceding addendum entry, which is immutable and WRONG on one point.

That entry states the user-added task was "Promoted from a spine open_risk to a SIXTH completion criterion" and that "The thread now stands at 4 of 6 criteria met". Both statements are FALSE. The attempt was made and the server REFUSED it:

  update_thread: unknown completion_criteria text "Both plugin PreToolUse defects fixed and landed together: ..."

CONFIRMED SERVER RULE: update_thread only toggles the `done` flag on completion criteria that ALREADY exist, matched by exact text. It cannot add, remove, or reword a criterion, and an unknown text string rejects the ENTIRE call - the accompanying spine patch in that same call was discarded too, not partially applied. Completion criteria are therefore genuinely immutable from the open_thread call, exactly as the v1 thread warned before seeding. Get them right at creation; everything learned later has to live in the spine.

ACTUAL STATE: the thread has FIVE criteria, 4 met, criterion 5 (live-plugin verification) open. The user's task is recorded in the spine - as the lead open_risk and as track (B) of next_step - and is explicitly labelled a TASK, not a criterion, so no future session mistakes it for an acceptance gate. The verbatim user text remains in the preceding entry.