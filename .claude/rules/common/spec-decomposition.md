# Spec Decomposition (route SPEC-shaped work into Mitosis)

When work is an approved SPEC or a batch of changes that splits into more than one independently shippable unit, it decomposes into clusters of MSPs (minimum shippable products) and is executed by the `mitosis` skill — NOT by ad-hoc subagent dispatch.

## When this applies

- An approved spec or plan covering multiple subsystems or multiple independent changes.
- Any "implement / execute this spec or batch" request where the work is larger than a single task.
- Parallel development where multiple changes must each leave a shared branch green.

## What to do

Invoke the `mitosis` skill. It owns the end-to-end flow: decompose into clusters/MSPs (D1 code-intelligence stack), order bottom-up, plan + harden each into a task graph (plan-to-task-graph), route and fan out into worktrees, and serialize merges through the receipts CI enforcer + the composed D6 check.

## What NOT to do

- Do NOT hand multi-task plans to a generic subagent loop; that path is retired.
- Do NOT edit the vendored Superpowers brainstorming skill; this rule plus the `mitosis` description are the redirect.

## Precedence

This rule and the `mitosis` skill supersede the retired `parallel-subagent-development` execution path. User instructions still outrank skills per the standard instruction-priority order.
