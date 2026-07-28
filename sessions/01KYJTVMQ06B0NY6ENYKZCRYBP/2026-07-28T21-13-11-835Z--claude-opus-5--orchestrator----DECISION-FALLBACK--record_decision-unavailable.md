DECISION 0097 (PROVISIONAL NUMBER) — recorded here because record_decision FAILED four consecutive times with ToolValidationError "(root) must have required property 'options'" while a valid string array was supplied. This is a tool/harness defect, not a content problem. A future session should promote this into a real numbered decision record once the tool works; until then THIS ENTRY IS THE DECISION OF RECORD.

TITLE: Boundary preflight config threads through run args; machine-user becomes a new required run input. Resolves 0092.

CONTEXT: 0092 is live on main. Reconcile step 7 emits a bare `node <cli>` for a subagent to run (mitosis.js:3720). The CLI requires four env vars — PREFLIGHT_ENV_KEYS at merge-boundary-preflight.mjs:12-17 — all required, no defaults. Any missing or blank value yields configRejection (:58-79) and exits PREFLIGHT_CONFIG_EXIT=31 with ZERO stdout (:366-374). The agent then reports boundaryPreflight=null, which is schema-valid, so the run halts unconditionally at fatalReport('preflight-boundary') at mitosis.js:3748-3751 on the FIRST reconcile attempt.

CORRECTION TO THE THREAD'S RISK LIST: redispatchPrompt (mitosis.js:3229-3239) is NEVER REACHED on this path, so its step-7 omission is NOT the cause of the universal halt. It remains a real but separate latent defect that would bite only if a reconcile attempt were redispatched for some other reason. This corroborates 0096 rather than reopening it.

WHY machineUser IS THE HARD ONE: org and repo are already derived inside reconcile's own step 2 via `gh repo view --json nameWithOwner` (mitosis.js:3715); baseBranch is in scope (mitosis.js:3420). machineUser is the ONLY non-derivable value, and is structurally absent from the Workflow args contract (SKILL.md:55-58) so it cannot reach the engine at all today. Deriving it from `gh api user` would make checkIdentityIsMachineUser (merge-boundary-preflight.mjs:144-157) compare a value against itself, collapsing the check to a tautology.

OPTIONS WEIGHED:
1. Thread org/repo/baseBranch/machineUser through the Workflow args; the engine composes the env-prefixed command itself; machineUser added to the SKILL.md args contract as a new required run input.
2. Drop the reconcile corroborating re-run and trust the MAIN pre-dispatch verdict, threaded through as an attestation flag.
3. Export the four MITOSIS_BOUNDARY_* vars ambiently in the operator's shell and let the subagent's Bash inherit them.

OUTCOME — CHOSEN BY THE USER THIS SESSION: option 1. The engine composes the env-prefixed command rather than emitting a bare node path. machineUser becomes a NEW REQUIRED run input resolved by MAIN or STOP-AND-ASK per SKILL.md:43; org, repo and baseBranch reuse values the stage already holds. Fail-closed is preserved: the config only declares WHOM TO EXPECT, while pass/fail still rides on unforgeable live gh reads. Accepted cost: every run must now carry the handle.

REJECTED option 2: deletes the defense-in-depth the step exists for — SKILL.md:47 frames the re-run as catching branch-protection drift between dispatch time and merge time. That is a real reduction in the gate's guarantee, not plumbing.

REJECTED WITHOUT ASKING, option 3: already prohibited by SKILL.md:43 ("never rely on values exported ambiently in a shell"), and it is the self-provisioning failure mode where the governed party supplies the value that governs it.

BINDING CONSTRAINT ON THE IMPLEMENTATION: any variant of option 1 that derives machineUser from `gh api user` inherits option 3's tautology and is equally rejected. The handle must come from a human-resolved value threaded from MAIN.

STATUS: NOT YET IMPLEMENTED. Nothing was changed in mitosis.js or SKILL.md this session.