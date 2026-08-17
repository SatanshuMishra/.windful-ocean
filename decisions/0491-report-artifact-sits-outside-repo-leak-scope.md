---
Status: accepted
Date: 2026-08-17T00:20:23.174Z
Thread-Id: 01M04HH9W6HVPQJDPW24WH48GC
---

# 0491. The report artifact is outside repo scope, so its codename and CDN findings are ratified, not defects

## Context

The rebuilt validator gates every edit to ~/.agent/diagrams/agent-roster-rebuild-recommendations.html and reports two failures that are not defects. First, the confidential cross-project codename appears at two lines in a table describing agents removed this cycle. The standing rule is that this codename must never reach TRACKED CONTENT ON THE PUBLIC REPO; the report lives under ~/.agent/diagrams/, which is neither tracked nor in the repository. Second, the file is not self-contained: it preconnects and loads Google Fonts and imports Mermaid from a CDN at runtime, and it holds zero inline SVG, so all nine diagrams render only with a network connection and the page shows nine blank spaces offline. Both were surfaced to the user with options before any edit was made, and both recur on every future validator run, so a session that does not know they are ratified will either try to fix them or read the gate as broken.

## Options

- Redact the codename and inline the nine diagrams as SVG - rejected, the artifact is outside the scope the confidentiality rule protects and the conversion is real work on a 296 KB file
- Redact the codename and add a hard validator gate against recurrence - rejected for the same scope reason
- Leave both, ratify them as known baseline failures, and treat any THIRD failure as a genuine regression

## Outcome

Both stay. The confidentiality rule is scoped to tracked content on the public repository and this artifact is neither, so the codename is not a leak here; the diagram question is filed as a property of the file rather than a defect to fix in this cycle. The operational consequence is the one that matters for future sessions: the validator's ratified baseline is exactly self-containment (4 problems: three font links plus one Mermaid import) and leak-scan (2 problems: the two codename lines), with a single benign warning that the table-of-contents id is never linked to. Every other check must PASS. Any third failing check, or any additional problem inside those two, is a genuine regression introduced by that session and must be fixed before returning - it must never be waved through as part of the known baseline. This ruling does NOT relax the codename rule anywhere inside the repository, where it remains absolute.
