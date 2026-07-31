---
Status: accepted
Date: 2026-07-31T20:27:52.495Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0163. The sandbox import trap is why the twin pattern exists, not a blocker to extraction

## Context

While pricing P4, an analysis agent reported a structural blocker it believed unraised: mitosis.js's body is compiled via vm.compileFunction under a fixed hook contract, so it can contain no static import, and dynamic import() is trapped and converted to a SandboxViolationError. It concluded that every identifier an extracted lib module would import has "no verified load path" back into mitosis.js, and priced a possible HOOK_NAMES extension in the shared harness as out-of-scope churn that could push P4 over budget. It stated candidly that it had not been given the plan text and could not say whether a resolution was already proposed.

## Options

- Accept it as a real blocker and re-plan every remaining extraction around a new module-loading mechanism
- Verify the claim against the guard's own normalization before propagating it

## Outcome

FALSE ALARM, verified by orchestrator execution rather than relayed. The compile-time import prohibition is real, but it is the REASON the mirror-twin architecture exists, not an obstacle to it. normalize() in mirror-guard.test.mjs strips a leading "export " from every line and filters out sibling-relative .mjs import lines before testing containment, so a lib module carries real imports while mitosis.js's inline copy simply uses identifiers already in its lexical scope - which they are, because their source modules are themselves whole twins. A second agent independently confirmed mitosis.js contains zero import statements and is a self-contained script body, and all 22 whole-classified twins work exactly this way today. The plan already said so. Two things worth carrying forward: the strip filter matches ONLY sibling-relative './*.mjs' imports, so an extracted module that imports 'node:*' or a non-sibling path would break containment and turn the guard red - a real constraint on how a new lib module may be written; and this is the second consecutive instance of a confidently-reported agent finding that inverted on verification, after the sole-caller claim one grep falsified in decision 0159. The standing method rule holds: verify a load-bearing agent claim against the mechanism itself before acting on it, especially when the agent states it lacked a document.
