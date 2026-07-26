PLUGIN DEFECT observed during this hand-off, worth fixing in the session-continuity plugin itself.

Symptom: ledgerize step 5 failed with `transition_thread: illegal transition paused -> paused`.

Cause: the documented FSM says `paused -> active: only via the Resumption Brief (never silent)`, and `active` is defined to mean "being worked in THIS session". But the lift-off skill's protocol is rebuild_index -> present roster -> reconcile -> get_resume_brief -> STOP. It never calls transition_thread. So a resumed thread stays `paused` for the entire working session.

Two consequences. (1) The `active` semantic never holds in practice, which also disarms the zombie-detection property that was supposed to follow from it - an `active` thread at session start is meant to be the anomaly signal, but nothing ever sets `active`. (2) ledgerize's park step is unreachable for any thread resumed through lift-off: it always attempts paused -> paused and errors. The hand-off still completes correctly because the thread is already in the desired state, but the skill reports a failure on a normal, healthy path.

Fix options: have lift-off transition paused -> active once the user picks a thread and the brief is presented; or make ledgerize treat a no-op park as success; or make the server accept an idempotent same-status transition for paused. The first preserves the intended semantics and keeps zombie detection meaningful.

Not fixed this session - recorded only. This is a defect in the plugin under development in /Users/satanshumishra/Documents/DevLabs/continuity-ledger-plugin, and it is independent of the Bash-guard work.