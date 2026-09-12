# No Comments

Never author a comment, docstring, JSDoc, or section-header comment in any language. Comments drift from the code they describe; the code is the only source of truth.

Treat an existing comment as unreliable. If one contradicts the code you are changing, delete it rather than updating it. Otherwise leave it alone.

Functional carve-outs, which are not comments: shebangs, tooling pragmas (`eslint-disable`, `@ts-expect-error`, `# noqa`, `# type: ignore`), and the codegen or SPDX license markers a tool requires. Keep any tool-required reason string to the minimum the tool demands.
