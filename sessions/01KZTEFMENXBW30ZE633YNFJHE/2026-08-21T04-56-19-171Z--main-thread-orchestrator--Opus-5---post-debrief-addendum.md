Addendum after the hand-off. Pull request 270 (fix/mitosis-work-type-precedence, on 4c9bae0c) shipped the work-type precedence fix and, in doing so, confirmed by EXECUTION that the hole it closed is only one of three mouths of the same defect. This changes the pre-run picture and supersedes the addendum-free next step written minutes earlier.

## What 270 actually proves

The order really was model-first: node-commands.mjs:156 emitted the model's rationale and :157 the engine's declaration. Red on parent asserted `'chore' !== 'feature'` against the RENDERED body through the real composePrCreateArgv, the real parseMitosisGitArgv and the real renderPrCreateBody, with the enforcer's own regex applied to the rendered string rather than to argv order. Inertness reproduced the same assertion. Suite 3166, 0 failures. Smoke exit 0 with engineRoot pinned to the worktree at head fe64fbf5. G14 replica generated 0 mutants, because a two-line reorder adds one line carrying no comparison, boolean, digit or return for the operator set to mutate; recorded unverified-reasoned for mutation strength.

## The root cause 270 did not reach

Model-supplied free text is rendered into a body the enforcer parses for CONTROL TOKENS, and the guard meant to stop that is dead.

- carriesReceiptLineToken uses a case-sensitive startsWith while the consumer regex is case-insensitive and unanchored. On the --what path whatSentenceFrom unconditionally uppercases character zero, so the guard is not merely weak, it is STRUCTURALLY DEAD and can never fire.
- The rendered body puts `## What changed` BEFORE `## Why`, so a model-written MSP title reaching a bullet still out-races the engine's declaration regardless of ordering inside --why. Confirmed by execution: the enforcer reads `chore`.
- `test-removal:` placed in an MSP rationale renders as a raw line, matches G11's pattern, and downgrades that gate from block to warn. Confirmed by execution. This one buys a real capability: a billed child can delete tests and still go green.
- `receipt-cmd:` injection through the rationale is confirmed; escalation to a false green is speculative, not proven.
- A pull request whose own type is `fix` emits NO work-type line at all, which leaves the model's rationale unopposed and is exactly the condition under which the vector stays fully open.

## Why this is a pre-run blocker, not a follow-up

c45 requires every pull request the engine opens to be green INCLUDING receipts. A green obtained because a model's own prose downgraded the gate that would have caught it is the precise false green this whole exercise exists to detect. Until the guard is case-insensitive and applied to every model-supplied value on every flag, a receipts green on an engine-opened pull request is evidence about the model's prose, not about the work.

The fix is one root cause with three mouths, not three fixes. It belongs at the guard, and possibly at the renderer's section order, and it changes the standing body-format contract, so it needs a decision before it is scoped.

## Unknown, not assumed

Whether the enforcer reads the pull request TITLE as well as the body. The enforcer is not vendored in this repository, so 270 could not check it. If it scans both, that is a third path and it must be resolved before the guard fix is scoped.