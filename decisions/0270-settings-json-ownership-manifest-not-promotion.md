---
Status: accepted
Date: 2026-08-06T20:16:55.484Z
Thread-Id: 01KZC5TSBXJDM28F8ZCRXC9JQM
---

# 0270. settings.json is excluded from releases and reconciled by an ownership manifest, with the leak gate on capture only

## Context

settings.json is a two-way surface: Claude Code writes it itself through permission prompts, model selection and plugin toggles, so a one-way staging-to-live promotion would silently clobber live edits. Live has ALREADY diverged from the tracked copy - live permissions are broader, plus live-only model and pluginConfigs keys and a different plugin enablement set - so the repo does not currently describe what is actually enforced. Measured against Claude Code 2.1.223 on 2026-08-06: a symlinked settings.json is FOLLOWED and WRITTEN THROUGH - `claude plugin marketplace add` wrote into the link target, the symlink survived, and an unrelated pre-existing key was merged rather than clobbered. Scope limit on that measurement: one writer was exercised, not the class; in-session /config edits, plugin enable/disable and permission-grant persistence were not tested. Separately, `claude config set` does not exist in this version, so any design assuming that verb must name a different writer. The containing decision 0269 makes releases immutable and promotion a pointer swap, and .windful-ocean must stay a tracked public open-source repo.

## Options

- Let settings.json ride inside the immutable release like every other config entry. REFUTED by measurement: write-through would mutate the release in place, breaking immutability, and any setting written while a release is live would be stranded there when the pointer swaps.
- Three-way merge of live against repo using a stored baseline, the classic dotfile/conffile approach. More general and handles arbitrary key churn, but it produces conflicts that an unattended SessionStart or Stop hook cannot resolve.
- An ownership manifest: the repo owns declared keys (hooks, permissions, env), live owns machine-written keys (model, pluginConfigs, extraKnownMarketplaces, plugin enablement, permission grants), and promotion recomputes live as repo-owned keys combined with preserved live-owned keys. Deterministic and conflict-free, at the cost of a manifest that must be maintained as Claude Code adds keys.

## Outcome

Approved by the user on 2026-08-06 as part of the SPEC A design: settings.json is excluded from releases entirely and reconciled by an ownership manifest. Chosen over the three-way merge because promotion runs from unattended hooks, and a merge conflict at SessionStart has no one to resolve it - determinism beats generality where the resolver is a hook. Chosen over riding inside the release because measurement refuted that outright.

Three consequences the SPEC carries. First, unknown or newly-appearing keys default to LIVE WINS and are flagged for classification, never silently dropped - Claude Code adds keys on its own schedule and the manifest will always lag. Second, CAPTURE (live -> repo) is a separate explicit verb, not part of promotion, and it is the ONLY direction that can leak, so it runs through the leak gate before touching tracked content: promotion cannot leak, capture can, and the repo is public. Third, the already-existing divergence is a migration input, not a defect to fix silently - the first capture reconciles the broader live permissions and the live-only model and pluginConfigs keys against the tracked copy.

Known gap carried forward: only one settings.json writer was measured. If in-session /config edits or permission-grant persistence turn out to REPLACE the file rather than write through it, the manifest still holds but the file-identity assumption behind it needs re-checking.
