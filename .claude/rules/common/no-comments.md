# Code Explains Itself

Put intent into names, types and structure, so every line you author in a source file is code. A comment, docstring, JSDoc block or section-header comment is prose, and the explanation it would carry belongs in a better name or a clearer shape. Comments drift from the code they describe; the code is the only source of truth.

Read an existing comment as possibly stale. When one contradicts the code you are changing, delete it rather than updating it; otherwise leave it as it is.

Lines a tool needs are code, not comments: shebangs, tooling pragmas (`eslint-disable`, `@ts-expect-error`, `# noqa`, `# type: ignore`), and the codegen or SPDX license markers a tool requires. Give any tool-required reason string the minimum the tool demands.
