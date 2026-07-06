# Three Pillars (global priority order)

Every trade-off across this configuration — every project, skill, agent, and the Mitosis workflow — resolves against one strict priority order. When two goals conflict, the higher pillar wins. Never trade a higher pillar for a lower one.

## The order (high to low)

1. **Robustness / Quality of code.** Correctness, safety, maintainability. The code must work and keep working.
2. **Optimization.** Efficiency of both the code AND Claude-driven development — tokens, context, and cost. Do more with less, but never at the expense of pillar 1.
3. **Speed.** Wall-clock speed of the code and of the development process. The fastest path is taken only among options that already satisfy pillars 1 and 2.

## Tie-break

Quality beats Optimization beats Speed. There is no trade that sacrifices a higher pillar to gain a lower one. A faster plan that risks correctness loses to a slower correct one; a token-cheaper tool with lower recall loses to an accurate one where accuracy is load-bearing.

## Scope

Applies to everything in the global configuration, not only the Mitosis workflow.

Worked example (D1 code-intel stack): the dependency oracle is accurate native LSP, not the token-free-but-lower-recall Graphify call graph — Quality over Optimization, even though the Graphify call is free.
