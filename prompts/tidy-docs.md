---
description: Sweep repo docs/working files for lifecycle drift and propose a keep/reconcile/delete list under "the codebase is truth"
argument-hint: "[area or focus]"
---

Use `/skill:repo-hygiene` to run a documentation/artifact-lifecycle sweep.

Focus: $ARGUMENTS

Run the sweep: inventory → classify → detect authority and layout drift → decide keep/reconcile/delete. Load `references/scratch-organization.md`; audit `.scratch/` by effort for top-level files, missing registries, unlinked Markdown, duplicate/session/round directories, report sediment, tracked scratch without an explicit exception, and completed efforts. For a large repo, fan out fresh-context reviewers per doc area and let the parent merge into one list.

Then stop and present a single **keep / reconcile / delete** list with per-file evidence (file → class → verdict → reason). Do not delete or edit anything yet:

- Never auto-delete a git-tracked doc without approval; flag any gitignored deletion as non-recoverable.
- Reconcile the non-authoritative side to the governing authority; supersede an ADR only with a new ADR.
- Keep the always-loaded layer (agent instructions, ADRs, context doc) thin.

Apply only the approved actions, then report terse counts (kept / reconciled / deleted) and any file left `unknown`.
