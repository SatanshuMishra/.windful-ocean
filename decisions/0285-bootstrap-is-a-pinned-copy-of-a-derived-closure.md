---
Status: accepted
Date: 2026-08-08T02:28:10.940Z
Thread-Id: 01KZCF28RN4RMR46VDXFKSQZY3
---

# 0285. The bootstrap installs as a pinned copy of an import-derived closure, not a symlink or a hardcoded file list

## Context

SPEC A section 5.3 requires the promote verb and the SessionStart hook to live outside releases/ at a stable absolute path, and names this the one way the design can brick the environment. It does not say HOW they get there, and no installer existed - ~/.claude/local was absent, while main's repo settings.json already registered `node $HOME/.claude/local/converge.mjs` for both SessionStart and Stop, so live registration would have failed on a path that did not exist. Measured this session: promote.mjs and converge.mjs pull in four more modules (paths, release, receipt, validate); capture.mjs and manifest.mjs are unreachable from them. validate.mjs bootstrapFailures at :440-459 fails only when a bootstrap path resolves INSIDE releases/ and returns [] for an absent path - it never stats for existence - so an absent bootstrap is caught not by the bootstrap rule but by hook-resolution, and only once the registration exists in the settings being validated.

## Options

- Copy the closure as plain files into local/, deriving it by following static import edges from BOOTSTRAP_ENTRIES and asserting the result contains both entries - ADOPTED
- Symlink local/promote.mjs and local/converge.mjs at the primary checkout. Rejected: the checkout switches branches, so the bootstrap would change under every running session and would break exactly when a bad branch is checked out - the failure mode 5.3 exists to prevent
- Copy a hardcoded list of the six modules. Rejected: it silently rots the first time an import edge is added, and the rot surfaces as a broken bootstrap rather than a failed install
- Vendor the bootstrap as a single bundled file. Rejected: it diverges from the reviewed per-module sources and makes the installed copy unauditable against the repo

## Outcome

Adopted 2026-08-07 and shipped in PR #55, merged as a302e4c. Installation is idempotent, refuses a local/ that resolves inside releases/, and replaces a drifted or symlinked copy with a plain file so a pre-existing symlink is never written through. Verified additive against live ~/.claude: settings.json sha256 and the sorted symlink path-list hash identical before and after; the installed converge.mjs runs and stays silent with no LIVE receipt, exit 0.

The cost this buys, and it is real: the six modules in ~/.claude/local are a PINNED COPY that drifts from the repo until install-bootstrap is re-run. That is deliberate. Pillar 1 beats pillar 2 here - a bootstrap that tracks the checkout live is a bootstrap that a bad branch or a bad release can break, and 5.3 names that as the one way to brick the environment. Drift is a maintenance cost with a loud fix; a live-tracking bootstrap is an unrecoverable failure mode. The re-run belongs in the cutover unit and in any later change to the six modules.

Deriving the closure rather than hardcoding it is the smaller half but it is what keeps the guarantee honest: the installer refuses a specifier that resolves into tests/ or escapes scripts/config/, so a future import edge either lands in the closure or fails the install loudly.
