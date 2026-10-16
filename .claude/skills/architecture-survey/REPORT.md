# Report shape

One self-contained HTML file, rendered by visual-explainer, written to the OS temp directory so nothing lands in the repository. The diagrams carry the weight; prose stays short and uses the terms in [DESIGN.md](DESIGN.md) and the repository's `GLOSSARY.md`.

## Header

The repository name, the date, the scope and why it was chosen (the hot spots or the owner's focus), and a compact legend: a solid box is a module, a dashed line is a seam, a red arrow is a leak, a thick dark box is a deep module. The candidates follow straight after.

## One card per candidate

- **Title**: names the deepening, such as "Collapse the order intake pipeline".
- **Badges**: the strength (Strong in green, Worth exploring in amber, Speculative in grey) and the dependency category.
- **Files**: a monospaced list.
- **Before and after diagram**: two columns side by side, about 320 pixels tall. This is the centrepiece.
- **Problem**: one sentence on what hurts.
- **Solution**: one sentence on what changes.
- **Wins**: short bullets in locality and leverage terms, such as "locality: pricing bugs concentrate in one module" or "leverage: one interface, six call sites".
- **ADR callout**: one amber line when the candidate contradicts an ADR, saying which one and why reopening it is worth it.

When a diagram needs a paragraph to be understood, redraw the diagram.

## Diagram patterns

Pick the pattern that fits each candidate and vary them across the report.

| Pattern | Shows |
|---|---|
| Mermaid flowchart or sequence | Dependencies and call flow, such as six round trips before and one after, with leak edges in red |
| Boxes and arrows | An after-state that is one thick deep module with its absorbed internals greyed out inside |
| Cross-section | A call passing through many thin layers before, and one thick band after |
| Mass diagram | Interface area against implementation area, nearly equal before and small over large after |
| Call-graph collapse | A tree of calls before, folded into one module with the now-internal calls faded inside |

## Top recommendation

One larger card at the end: the candidate to tackle first, one sentence on why, and a link to its card.

## Tone

Plain, concise sentences in the design vocabulary, such as "Order intake module is shallow: its interface nearly matches its implementation" or "Pricing leaks across the seam." A sentence that could be a bullet becomes a bullet, and a bullet that adds nothing is cut.
