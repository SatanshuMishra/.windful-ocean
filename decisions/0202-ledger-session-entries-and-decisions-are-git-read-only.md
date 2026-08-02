---
Status: accepted
Date: 2026-08-02T07:13:02.217Z
Thread-Id: 01KYR405KFXHM15J5XXK5BXTVT
---

# 0202. The ledger's session entries and decision records are readable only via git on the _ledger branch, never through an MCP tool

## Context

This thread's next_step required reading five specific ledger documents before any work began: the 2026-08-02T06-59 session entry, decisions 0200 and 0201, the M4 REMAINING-PHASES BRIEF, and the THREE DECISIONS (A-D) entry. A ToolSearch returning the ledger server's COMPLETE tool set found twelve tools -- record_decision, append_session_event, archive_thread, open_thread, transition_thread, update_thread, bind_branch, create_successor, get_resume_brief, rebuild_index, reconcile, reopen -- and not one reader for session entries or decision records. get_resume_brief returns the spine only. The lift-off skill asserts the brief is spine-only "by design -- there is no session-reading tool here and none is needed", and an existing thread risk instructs "Read the ledger through the MCP tools only." Both are false for anything below the spine, and following either would have started the audit phase blind.

## Options

- Trust the spine alone as the lift-off skill asserts, and skip the five documents the next_step named
- Read session entries and decision records with git show against the _ledger branch
- Treat the missing reader as a blocker and stop until the tool exists

## Outcome

READ VIA GIT. The ledger store is a git worktree whose content lives on the _ledger branch, so `git ls-tree -r --name-only _ledger` enumerates it and `git show _ledger:sessions/<thread_id>/<file>.md` and `git show _ledger:decisions/<nnnn>-<slug>.md` read it exactly. This is the ONLY read path below the spine, and it is orchestrator-appropriate: read-only, in service of routing and judgment. The spine was demonstrably insufficient here -- it compressed four ship-gate findings into risk lines carrying the verdicts but not the mechanisms, the mutation evidence, or the drafted remedies, all of which the audit prompts needed. BLOCKING WAS REJECTED because the data is fully accessible and the next_step was explicit about needing it. The prior risk line "Read the ledger through the MCP tools only" is CORRECTED rather than deleted: every WRITE and the spine itself go through MCP, and only reads below the spine go through git. This does not reopen the two-stores question -- session-continuity-inline remains the live store and is the one the _ledger branch belongs to.
