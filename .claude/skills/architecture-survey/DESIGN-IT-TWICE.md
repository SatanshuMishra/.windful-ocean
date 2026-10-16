# Design it twice

The first interface idea is rarely the best, so when the owner wants to compare interfaces for the chosen candidate, design several radically different ones in parallel and pick on evidence.

## 1. Frame the problem

Write the owner a short framing of the candidate: the constraints any new interface must satisfy, its dependencies and their categories from [DESIGN.md](DESIGN.md), and a rough code sketch that makes the constraints concrete. Show it, then go straight to step 2 so the owner reads while the designs are produced.

## 2. Dispatch the designers

Dispatch three or four agents in one message so they run together. Give each a self-contained technical brief: the file paths, the coupling found in the survey, the dependency categories, what sits behind the seam, the terms in [DESIGN.md](DESIGN.md) and the repository's `GLOSSARY.md`. Give each a different constraint:

1. Minimise the interface: one to three entry points, maximum leverage per entry point.
2. Maximise flexibility: support many use cases and extension.
3. Optimise for the most common caller: make the default case trivial.
4. When the module crosses a network or a third party: design around ports and adapters.

Each agent returns the interface (types, methods and parameters, plus invariants, ordering and error modes), a usage example, what the implementation hides behind the seam, its dependency strategy and adapters, and where its leverage is high and where it is thin.

## 3. Compare and recommend

Present the designs one at a time, then compare them on depth, locality and seam placement. Close with a firm recommendation: the strongest design and why, or a hybrid when parts of two designs combine well. Take that recommendation into the grilling rounds as the recommended answer for the interface decision.
