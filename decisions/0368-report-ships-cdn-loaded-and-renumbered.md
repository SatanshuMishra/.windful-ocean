---
Status: accepted
Date: 2026-08-12T04:18:47.721Z
Thread-Id: 01KZQ2BVF2386ATV5YFD43NQVX
---

# 0368. The report ships CDN-loaded and renumbered, and c5 drops its diagram count

## Context

Three questions about the report artifact: whether to inline the mermaid renderer and the Google fonts (roughly 3 MB) so it renders without a server; whether c5's promise of five render-verified diagrams should track the ten that now exist; and whether the caption run 1, 2, 3, 4, 7, 8, 9, 10, 11, 12 should be closed up after figures 5 and 6 were deleted without backfilling.

## Options

- Inline the renderer and fonts to make the page self-contained
- Leave loading as-is and keep serving over HTTP
- Bump c5's count from five to ten
- Drop the count from c5 entirely

## Outcome

The report is fine as it loads: no inlining, and serving it over HTTP with network access stays the way to read it. c5 is rewritten to drop the hard count and require every diagram in the report to be render-verified, since a fixed number re-breaks whenever a figure is added or cut. The figures are renumbered 1 to 10, and the same pass resolves the dangling prose reference to a Figure 6 that no caption defines.
