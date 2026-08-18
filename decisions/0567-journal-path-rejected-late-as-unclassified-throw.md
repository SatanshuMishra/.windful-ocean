---
Status: accepted
Date: 2026-08-18T05:55:41.494Z
Thread-Id: 01KZTEFMENXBW30ZE633YNFJHE
---

# 0567. The journal flag must be absolute and is rejected only after the planning phase has run

## Context

A run invoked with the operator doc's own suggested relative value for the journal flag ran the full planning phase and then died with a path-must-be-absolute error roughly twelve minutes in, after several billed child dispatches. The failure returned exit 1, the unclassified-throw code, rather than exit 2, which means arguments were rejected and nothing ran.

## Options

- Accept late rejection as harmless
- File it as an input-validation defect at the boundary

## Outcome

Filed. Three parts: the journal flag needs absoluteness checked at argument-parse time alongside the other path flags, the error is misclassified as a throw rather than a usage rejection, and the operator documentation's example value is the one the engine rejects. The engine did release its run lock cleanly on the throw, so no forced retirement was needed.
